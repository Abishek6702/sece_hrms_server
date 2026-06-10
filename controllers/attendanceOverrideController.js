const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");
const Attendance = require("../models/attendance");

function mapSessionsToStatus(s1, s2) {
  const a = (s1 || "").toUpperCase();
  const b = (s2 || "").toUpperCase();

  if (a === "P" && b === "P") return "Present";
  if (a === "A" && b === "A") return "Absent";
  if (a === "A" && b === "P") return "First Half Leave";
  if (a === "P" && b === "A") return "Second Half Leave";
  if (a === "MP" || b === "MP") return "Missed Punch";
  if (a === "H" && b === "H") return "Holiday";
  if (!a && !b) return null;
  return null;
}

function mapStatusToSessions(status) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "present":
      return ["P", "P"];
    case "absent":
      return ["A", "A"];
    case "first half leave":
      return ["A", "P"];
    case "second half leave":
      return ["P", "A"];
    case "holiday":
      return ["H", "H"];
    case "missed punch":
      return ["MP", "MP"];
    case "leave":
      return ["L", "L"];
    default:
      return [null, null];
  }
}

function normalizeToDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getRecordKey(facultyId, date) {
  return `${facultyId.toString()}_${normalizeToDay(date).toISOString()}`;
}

async function attachAttendanceTimes(records) {
  if (!records || !records.length) return records;

  const facultyIds = [...new Set(records.map((record) => record.facultyId.toString()))];
  const dates = records.map((record) => normalizeToDay(record.attendanceDate));
  const dateMin = new Date(Math.min(...dates.map((d) => d.getTime())));
  const dateMax = new Date(Math.max(...dates.map((d) => d.getTime())));
  dateMax.setDate(dateMax.getDate() + 1);
  dateMax.setMilliseconds(dateMax.getMilliseconds() - 1);

  const attendances = await Attendance.find({
    facultyId: { $in: facultyIds },
    attendanceDate: { $gte: dateMin, $lte: dateMax },
  }).lean();

  const attendanceMap = attendances.reduce((map, att) => {
    const key = getRecordKey(att.facultyId, att.attendanceDate);
    map[key] = att;
    return map;
  }, {});

  return records.map((record) => {
    const key = getRecordKey(record.facultyId, record.attendanceDate);
    const matching = attendanceMap[key];
    return {
      ...record,
      status: record.status || mapSessionsToStatus(record.session1, record.session2),
      inTime: matching ? matching.inTime : null,
      outTime: matching ? matching.outTime : null,
    };
  });
}

async function mergeAttendanceOverrides(defaultRecords, overrideRecords) {
  const attendanceMap = defaultRecords.reduce((map, att) => {
    const key = getRecordKey(att.facultyId, att.attendanceDate);
    map[key] = att;
    return map;
  }, {});

  const overrideMap = overrideRecords.reduce((map, override) => {
    const key = getRecordKey(override.facultyId, override.attendanceDate);
    map[key] = override;
    return map;
  }, {});

  const keys = new Set([...Object.keys(attendanceMap), ...Object.keys(overrideMap)]);
  const merged = [];

  for (const key of keys) {
    const attendance = attendanceMap[key];
    const override = overrideMap[key];
    const record = {
      facultyId: override?.facultyId || attendance.facultyId,
      attendanceDate: override?.attendanceDate || attendance.attendanceDate,
      session1: override?.session1 || null,
      session2: override?.session2 || null,
      previousSession1: override?.previousSession1 || null,
      previousSession2: override?.previousSession2 || null,
      remarks: override?.remarks || null,
      overriddenBy: override?.overriddenBy || null,
      overriddenOn: override?.overriddenOn || null,
      inTime: attendance?.inTime || null,
      outTime: attendance?.outTime || null,
      status: attendance?.status || override?.status || null,
    };
    merged.push(record);
  }

  return merged.sort((a, b) => {
    const dateDiff = new Date(a.attendanceDate) - new Date(b.attendanceDate);
    if (dateDiff !== 0) return dateDiff;
    const aId = a.facultyId?.toString?.() || "";
    const bId = b.facultyId?.toString?.() || "";
    return aId.localeCompare(bId);
  });
}

async function getOverridesByEmployee(req, res) {
  try {
    const { employeeId } = req.params;
    const { start, end } = req.query;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employeeId required" });
    }

    const query = { facultyId: employeeId };

    if (start || end) {
      query.attendanceDate = {};
      if (start) query.attendanceDate.$gte = normalizeToDay(start);
      if (end) {
        const d = normalizeToDay(end);
        d.setDate(d.getDate() + 1);
        d.setMilliseconds(d.getMilliseconds() - 1);
        query.attendanceDate.$lte = d;
      }
    }

    let records = await AttendanceOverrideHistory.find(query).sort({ attendanceDate: 1 }).lean();
    records = await attachAttendanceTimes(records);

    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to fetch overrides" });
  }
}

async function getOverridesByDate(req, res) {
  try {
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({ success: false, message: "date required" });
    }

    const start = normalizeToDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);

    let records = await AttendanceOverrideHistory.find({
      attendanceDate: { $gte: start, $lte: end },
    }).sort({ facultyId: 1 }).lean();

    records = await attachAttendanceTimes(records);

    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to fetch overrides by date" });
  }
}

async function updateOverride(req, res) {
  try {
    const { id } = req.params;
    const { session1, session2, status, remarks, overriddenBy } = req.body;

    if (!id) return res.status(400).json({ success: false, message: "id required" });

    const record = await AttendanceOverrideHistory.findById(id);
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    record.previousSession1 = record.session1;
    record.previousSession2 = record.session2;

    if (status) {
      const [s1, s2] = mapStatusToSessions(status);
      record.session1 = s1;
      record.session2 = s2;
      record.status = status;
    } else {
      if (session1 !== undefined) record.session1 = session1;
      if (session2 !== undefined) record.session2 = session2;
      record.status = mapSessionsToStatus(record.session1, record.session2);
    }

    if (remarks !== undefined) record.remarks = remarks;
    record.overriddenBy = overriddenBy || record.overriddenBy;
    record.overriddenOn = new Date();

    await record.save();

    // update Attendance
    const attDate = normalizeToDay(record.attendanceDate);
    await Attendance.findOneAndUpdate(
      { facultyId: record.facultyId, attendanceDate: attDate },
      { status: record.status },
      { new: true },
    );

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to update override" });
  }
}

async function updateOverrideByEmployeeDate(req, res) {
  try {
    const { employeeId, date } = req.params;
    const { session1, session2, status, remarks, overriddenBy } = req.body;

    if (!employeeId || !date) {
      return res.status(400).json({ success: false, message: "employeeId and date required" });
    }

    const attendanceDate = normalizeToDay(date);
    const record = await AttendanceOverrideHistory.findOne({ facultyId: employeeId, attendanceDate });
    if (!record) {
      return res.status(404).json({ success: false, message: "Override record not found" });
    }

    record.previousSession1 = record.session1;
    record.previousSession2 = record.session2;

    if (status) {
      const [s1, s2] = mapStatusToSessions(status);
      record.session1 = s1;
      record.session2 = s2;
      record.status = status;
    } else {
      if (session1 !== undefined) record.session1 = session1;
      if (session2 !== undefined) record.session2 = session2;
      record.status = mapSessionsToStatus(record.session1, record.session2);
    }

    if (remarks !== undefined) record.remarks = remarks;
    record.overriddenBy = overriddenBy || record.overriddenBy;
    record.overriddenOn = new Date();

    await record.save();

    if (status || session1 !== undefined || session2 !== undefined) {
      await Attendance.findOneAndUpdate(
        { facultyId: record.facultyId, attendanceDate },
        { status: record.status },
        { new: true },
      );
    }

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to update override" });
  }
}

async function createOrUpsertOverride(req, res) {
  try {
    const { facultyId, attendanceDate, session1, session2, status, remarks, overriddenBy } = req.body;

    if (!facultyId || !attendanceDate) {
      return res.status(400).json({ success: false, message: "facultyId and attendanceDate required" });
    }

    const day = normalizeToDay(attendanceDate);

    let record = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: day });

    if (record) {
      record.previousSession1 = record.session1;
      record.previousSession2 = record.session2;

      if (status) {
        const [s1, s2] = mapStatusToSessions(status);
        record.session1 = s1;
        record.session2 = s2;
        record.status = status;
      } else {
        if (session1 !== undefined) record.session1 = session1;
        if (session2 !== undefined) record.session2 = session2;
        record.status = mapSessionsToStatus(record.session1, record.session2);
      }

      record.remarks = remarks !== undefined ? remarks : record.remarks;
      record.overriddenBy = overriddenBy || record.overriddenBy;
      record.overriddenOn = new Date();
      await record.save();
    } else {
      const [s1, s2] = status ? mapStatusToSessions(status) : [session1, session2];
      record = await AttendanceOverrideHistory.create({
        facultyId,
        attendanceDate: day,
        session1: s1,
        session2: s2,
        status: status || mapSessionsToStatus(s1, s2),
        previousSession1: null,
        previousSession2: null,
        remarks,
        overriddenBy,
      });
    }

    const statusToUpdate = record.status || mapSessionsToStatus(record.session1, record.session2);
    await Attendance.findOneAndUpdate({ facultyId, attendanceDate: day }, { status: statusToUpdate });

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to create/update override" });
  }
}

async function bulkUpdateByEmployee(req, res) {
  try {
    const { facultyId, overrides, overriddenBy } = req.body;

    if (!facultyId || !Array.isArray(overrides)) {
      return res.status(400).json({ success: false, message: "facultyId and overrides[] required" });
    }

    const ops = overrides.map(async (ov) => {
      const attDate = normalizeToDay(ov.attendanceDate);
      const incomingStatus = ov.status;

      const existing = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: attDate });

      if (existing) {
        existing.previousSession1 = existing.session1;
        existing.previousSession2 = existing.session2;

        if (incomingStatus) {
          const [s1, s2] = mapStatusToSessions(incomingStatus);
          existing.session1 = s1;
          existing.session2 = s2;
          existing.status = incomingStatus;
        } else {
          if (ov.session1 !== undefined) existing.session1 = ov.session1;
          if (ov.session2 !== undefined) existing.session2 = ov.session2;
          existing.status = mapSessionsToStatus(existing.session1, existing.session2);
        }

        existing.remarks = ov.remarks !== undefined ? ov.remarks : existing.remarks;
        existing.overriddenBy = overriddenBy || existing.overriddenBy;
        existing.overriddenOn = new Date();
        await existing.save();
      } else {
        const [s1, s2] = incomingStatus ? mapStatusToSessions(incomingStatus) : [ov.session1, ov.session2];
        await AttendanceOverrideHistory.create({
          facultyId,
          attendanceDate: attDate,
          session1: s1,
          session2: s2,
          status: incomingStatus || mapSessionsToStatus(s1, s2),
          previousSession1: ov.previousSession1,
          previousSession2: ov.previousSession2,
          remarks: ov.remarks,
          overriddenBy: overriddenBy,
        });
      }

      const status = existing
        ? existing.status || mapSessionsToStatus(existing.session1, existing.session2)
        : incomingStatus || mapSessionsToStatus(ov.session1, ov.session2);

      await Attendance.findOneAndUpdate({ facultyId, attendanceDate: attDate }, { status });
    });

    await Promise.all(ops);

    return res.status(200).json({ success: true, message: "Bulk update completed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Bulk update failed" });
  }
}

async function bulkUpdateByDate(req, res) {
  try {
    const { attendanceDate, overrides, overriddenBy } = req.body;

    if (!attendanceDate || !Array.isArray(overrides)) {
      return res.status(400).json({ success: false, message: "attendanceDate and overrides[] required" });
    }

    const day = normalizeToDay(attendanceDate);

    const ops = overrides.map(async (ov) => {
      const facultyId = ov.facultyId;
      const incomingStatus = ov.status;

      const existing = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: day });

      if (existing) {
        existing.previousSession1 = existing.session1;
        existing.previousSession2 = existing.session2;

        if (incomingStatus) {
          const [s1, s2] = mapStatusToSessions(incomingStatus);
          existing.session1 = s1;
          existing.session2 = s2;
          existing.status = incomingStatus;
        } else {
          if (ov.session1 !== undefined) existing.session1 = ov.session1;
          if (ov.session2 !== undefined) existing.session2 = ov.session2;
          existing.status = mapSessionsToStatus(existing.session1, existing.session2);
        }

        existing.remarks = ov.remarks !== undefined ? ov.remarks : existing.remarks;
        existing.overriddenBy = overriddenBy || existing.overriddenBy;
        existing.overriddenOn = new Date();
        await existing.save();
      } else {
        const [s1, s2] = incomingStatus ? mapStatusToSessions(incomingStatus) : [ov.session1, ov.session2];
        await AttendanceOverrideHistory.create({
          facultyId,
          attendanceDate: day,
          session1: s1,
          session2: s2,
          status: incomingStatus || mapSessionsToStatus(s1, s2),
          previousSession1: ov.previousSession1,
          previousSession2: ov.previousSession2,
          remarks: ov.remarks,
          overriddenBy: overriddenBy,
        });
      }

      const status = existing
        ? existing.status || mapSessionsToStatus(existing.session1, existing.session2)
        : incomingStatus || mapSessionsToStatus(ov.session1, ov.session2);

      await Attendance.findOneAndUpdate({ facultyId, attendanceDate: day }, { status });
    });

    await Promise.all(ops);

    return res.status(200).json({ success: true, message: "Bulk update by date completed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Bulk update by date failed" });
  }
}

// --- Remark-specific APIs ---
async function updateRemarkById(req, res) {
  try {
    const { id } = req.params;
    const { remarks, overriddenBy } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "id required" });

    const record = await AttendanceOverrideHistory.findById(id);
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    record.remarks = remarks || record.remarks;
    record.overriddenBy = overriddenBy || record.overriddenBy;
    record.overriddenOn = new Date();

    await record.save();

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to update remark" });
  }
}

async function upsertRemarkByEmployee(req, res) {
  try {
    const { facultyId, attendanceDate, remarks, overriddenBy } = req.body;
    if (!facultyId || !attendanceDate) return res.status(400).json({ success: false, message: "facultyId and attendanceDate required" });

    const day = normalizeToDay(attendanceDate);

    let record = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: day });

    if (record) {
      record.remarks = remarks || record.remarks;
      record.overriddenBy = overriddenBy || record.overriddenBy;
      record.overriddenOn = new Date();
      await record.save();
    } else {
      record = await AttendanceOverrideHistory.create({
        facultyId,
        attendanceDate: day,
        session1: null,
        session2: null,
        previousSession1: null,
        previousSession2: null,
        remarks,
        overriddenBy,
      });
    }

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to upsert remark" });
  }
}

async function bulkUpdateRemarksByEmployee(req, res) {
  try {
    const { facultyId, remarksEntries, overriddenBy } = req.body;
    if (!facultyId || !Array.isArray(remarksEntries)) return res.status(400).json({ success: false, message: "facultyId and remarksEntries[] required" });

    const ops = remarksEntries.map(async (entry) => {
      const day = normalizeToDay(entry.attendanceDate);
      const remarks = entry.remarks;

      const existing = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: day });
      if (existing) {
        existing.remarks = remarks || existing.remarks;
        existing.overriddenBy = overriddenBy || existing.overriddenBy;
        existing.overriddenOn = new Date();
        await existing.save();
      } else {
        await AttendanceOverrideHistory.create({
          facultyId,
          attendanceDate: day,
          session1: null,
          session2: null,
          previousSession1: null,
          previousSession2: null,
          remarks,
          overriddenBy,
        });
      }
    });

    await Promise.all(ops);

    return res.status(200).json({ success: true, message: "Bulk remarks update completed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Bulk remarks update failed" });
  }
}

async function bulkUpdateRemarksByDate(req, res) {
  try {
    const { attendanceDate, entries, overriddenBy } = req.body;
    if (!attendanceDate || !Array.isArray(entries)) return res.status(400).json({ success: false, message: "attendanceDate and entries[] required" });

    const day = normalizeToDay(attendanceDate);

    const ops = entries.map(async (entry) => {
      const facultyId = entry.facultyId;
      const remarks = entry.remarks;

      const existing = await AttendanceOverrideHistory.findOne({ facultyId, attendanceDate: day });
      if (existing) {
        existing.remarks = remarks || existing.remarks;
        existing.overriddenBy = overriddenBy || existing.overriddenBy;
        existing.overriddenOn = new Date();
        await existing.save();
      } else {
        await AttendanceOverrideHistory.create({
          facultyId,
          attendanceDate: day,
          session1: null,
          session2: null,
          previousSession1: null,
          previousSession2: null,
          remarks,
          overriddenBy,
        });
      }
    });

    await Promise.all(ops);

    return res.status(200).json({ success: true, message: "Bulk remarks update by date completed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Bulk remarks update by date failed" });
  }
}

async function getOverrideById(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "id required" });

    const record = await AttendanceOverrideHistory.findById(id).populate("facultyId overriddenBy", "empId firstName lastName email");
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to fetch record" });
  }
}

async function listOverrides(req, res) {
  try {
    const { page = 1, limit = 50, employeeId, start, end, date } = req.query;
    const query = {};

    if (employeeId) query.facultyId = employeeId;

    if (date) {
      const dstart = normalizeToDay(date);
      const dend = new Date(dstart);
      dend.setDate(dend.getDate() + 1);
      dend.setMilliseconds(dend.getMilliseconds() - 1);
      query.attendanceDate = { $gte: dstart, $lte: dend };
    } else if (start || end) {
      query.attendanceDate = {};
      if (start) query.attendanceDate.$gte = normalizeToDay(start);
      if (end) {
        const d = normalizeToDay(end);
        d.setDate(d.getDate() + 1);
        d.setMilliseconds(d.getMilliseconds() - 1);
        query.attendanceDate.$lte = d;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    let records = await AttendanceOverrideHistory.find(query)
      .sort({ attendanceDate: -1 })
      .populate("facultyId overriddenBy", "empId firstName lastName email")
      .lean();

    const total = records.length;
    records = records.slice(skip, skip + Number(limit));
    records = await attachAttendanceTimes(records);

    return res.status(200).json({ success: true, total, page: Number(page), limit: Number(limit), records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to list overrides" });
  }
}

module.exports = {
  getOverridesByEmployee,
  getOverridesByDate,
  updateOverride,
  updateOverrideByEmployeeDate,
  bulkUpdateByEmployee,
  bulkUpdateByDate,
  createOrUpsertOverride,
  getOverrideById,
  listOverrides,
  // remark APIs
  updateRemarkById,
  upsertRemarkByEmployee,
  bulkUpdateRemarksByEmployee,
  bulkUpdateRemarksByDate,
};
