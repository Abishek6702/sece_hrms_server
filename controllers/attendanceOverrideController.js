const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");

const STATUS_CODE_MAP = {
  Present: "P:P",
  Absent: "A:A",

  "Half Day": "A:P",

  "First Half Leave": "L:P",
  "Second Half Leave": "P:L",

  Leave: "L:L",
  Holiday: "H:H",
  "Missed Punch": "M:M",

  "On Duty": "OD:OD",

  "First Half OD": "OD:P",
  "Second Half OD": "A:OD",
};
const SESSION_STATUSDB_MAP = {
  Present: "P:P",
  Absent: "A:A",
  "First Half Leave": "L:P",
  "Second Half Leave": "P:L",
};

const SESSION_STATUS_MAP = {
  "P:P": "Present",
  "A:A": "Absent",

  "A:P": "Half Day",
  "P:A": "Half Day",

  "L:P": "First Half Leave",
  "P:L": "Second Half Leave",

  "L:L": "Leave",
  "H:H": "Holiday",

  "OD:OD": "On Duty",

  "OD:P": "First Half OD",
  "P:OD": "Second Half OD",

  // Optional aliases
  "OD:A": "First Half OD",
  "A:OD": "Second Half OD",
};

const STATUS_SESSION_MAP = {
  Present: ["P", "P"],

  Absent: ["A", "A"],

  "Half Day": ["A", "P"],

  "First Half Leave": ["L", "P"],
  "Second Half Leave": ["P", "L"],

  Leave: ["L", "L"],

  Holiday: ["H", "H"],

  "On Duty": ["OD", "OD"],

  "First Half OD": ["OD", "P"],
  "Second Half OD": ["A", "OD"],
};

const getSessionCodes = (status) => STATUS_SESSION_MAP[status] || ["", ""];
const getStatusFromSessions = (session1, session2) => {
  if (session1 === undefined || session2 === undefined) {
    return null;
  }
  return SESSION_STATUS_MAP[`${session1}:${session2}`] || null;
};

const getDayRange = (date) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    return { startDate, endDate };
  }

  const parsed = new Date(date);
  const startDate = new Date(parsed);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(parsed);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
};

exports.getAttendanceByDate = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const { date } = req.params;
    const { startDate, endDate } = getDayRange(date);

    const attendanceList = await Attendance.find({
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate(
        "facultyId",
        "firstName lastName empId department employeeCategory",
      )
      .sort({ createdAt: 1 });

    const data = attendanceList.map((attendance) => {
      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const employeeNo = attendance.facultyId?.empId || "";
      const employeeId = attendance.facultyId?._id || null;
      // prefer stored session1/session2 (requested order), fallback to status-derived
      const s1 = attendance.session1 || getSessionCodes(attendance.status)[0];
      const s2 = attendance.session2 || getSessionCodes(attendance.status)[1];

      return {
        facultyId: attendance.facultyId?._id,
        employeeId: attendance.facultyId?._id || null,
        employeeName,
        employeeNo,
        department: attendance.facultyId?.department,
        employeeCategory: attendance.facultyId?.employeeCategory,
        statusCode: `${s1}:${s2}`,

        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",

        status: SESSION_STATUSDB_MAP[attendance.status] || attendance.status,

        firstIn: attendance.inTime,
        lastOut: attendance.outTime,

        session1: s1,
        session2: s2,
      };
    });

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAttendanceByEmployee = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const { employeeId } = req.params;
    const { startDate: startDateQuery, endDate: endDateQuery } = req.query;

    const filter = {
      facultyId: employeeId,
    };

    if (startDateQuery && endDateQuery) {
      const { startDate, endDate } = getDayRange(startDateQuery);
      const { endDate: queryEndDate } = getDayRange(endDateQuery);

      filter.attendanceDate = {
        $gte: startDate,
        $lte: queryEndDate,
      };
    }

    const attendanceList = await Attendance.find(filter)
      .populate(
        "facultyId",
        "firstName lastName empId department employeeCategory",
      )
      .sort({ attendanceDate: 1 });

    const data = attendanceList.map((attendance) => {
      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const employeeNo = attendance.facultyId?.empId || "";
      const s1 = attendance.session1 || getSessionCodes(attendance.status)[0];
      const s2 = attendance.session2 || getSessionCodes(attendance.status)[1];

      return {
        _id: attendance._id,
        facultyId: attendance.facultyId?._id || null,
        employeeId: attendance.facultyId?._id || null,
        employeeName,
        employeeNo,
        department: attendance.facultyId?.department,
        employeeCategory: attendance.facultyId?.employeeCategory,
        statusCode: `${s1}:${s2}`,

        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",

        status: SESSION_STATUSDB_MAP[attendance.status] || attendance.status,

        firstIn: attendance.inTime,
        lastOut: attendance.outTime,

        session1: s1,
        session2: s2,
      };
    });

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateAttendanceOverride = async (req, res) => {
  try {
    // Only Admin can access

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const { employeeId, date } = req.params;
    const { firstIn, lastOut, session1, session2, remarks } = req.body;
    const requestedSession1 =
      session1 !== undefined ? String(session1).trim() : null;
    const requestedSession2 =
      session2 !== undefined ? String(session2).trim() : null;

    const { startDate, endDate } = getDayRange(date);

    // Find attendance record
    const attendance = await Attendance.findOne({
      facultyId: employeeId,
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    // Store old values before updating anything
    const previousStatus = attendance.status;
    const previousInTime = attendance.inTime;
    const previousOutTime = attendance.outTime;

    let newStatus = attendance.status;

    if (session1 !== undefined && session2 !== undefined) {
      newStatus = getStatusFromSessions(session1, session2);

      if (!newStatus) {
        return res.status(400).json({
          success: false,
          message: "Invalid session values",
        });
      }

      attendance.overrideStatus = newStatus;
      attendance.isOverridden = true;
    }

    if (newStatus === "Absent" && (!remarks || remarks.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "Reason is required when changing attendance status to Absent",
      });
    }

    // Update attendance
    if (firstIn !== undefined) {
      attendance.inTime = firstIn;
    }

    if (lastOut !== undefined) {
      attendance.outTime = lastOut;
    }

    if (requestedSession1 !== null && requestedSession2 !== null) {
      const statusKey = getStatusFromSessions(
        requestedSession1,
        requestedSession2,
      );

      if (!statusKey) {
        return res.status(400).json({
          success: false,
          message: "Invalid session values",
        });
      }

      // attendance.status = statusKey;
      // persist requested order
      attendance.session1 = requestedSession1;
      attendance.session2 = requestedSession2;
      attendance.isOverridden = true;
      attendance.overrideStatus = statusKey;
    }

    if (remarks !== undefined) {
      attendance.overrideRemarks = remarks;
      attendance.isOverridden = true;
    }

    // Recalculate working minutes
    if (attendance.inTime && attendance.outTime) {
      attendance.workingMinutes = Math.floor(
        (new Date(attendance.outTime) - new Date(attendance.inTime)) / 60000,
      );
    }

    await attendance.save();

    // Populate faculty details
    await attendance.populate(
      "facultyId",
      "firstName lastName empId department",
    );

    // Save override history
    const [historySessions1, historySessions2] = getSessionCodes(
      attendance.status,
    );
    await AttendanceOverrideHistory.create({
      facultyId: attendance.facultyId._id,
      attendanceId: attendance._id,
      attendanceDate: attendance.attendanceDate,
      endDate: attendance.attendanceDate,

      previousStatus,
      newStatus: attendance.status,
      session1: attendance.session1 || historySessions1 || null,
      session2: attendance.session2 || historySessions2 || null,

      previousInTime,
      previousOutTime,

      newInTime: attendance.inTime,
      newOutTime: attendance.outTime,

      reason: remarks || "Attendance updated",

      changedBy: req.user._id,
      changedByRole: req.user.role,
    });

    const result = attendance.toObject();

    const employeeName = attendance.facultyId
      ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
          .filter(Boolean)
          .join(" ")
      : "";

    const employeeNo = attendance.facultyId?.empId || "";
    const department = attendance.facultyId?.department || "";

    const responseStatus1 =
      requestedSession1 || getSessionCodes(attendance.status)[0];
    const responseStatus2 =
      requestedSession2 || getSessionCodes(attendance.status)[1];

    const response = {
      _id: attendance._id,

      employeeId: attendance.facultyId?._id || null,

      employeeName,
      employeeNo,
      department,

      date: attendance.attendanceDate,
      shiftCode: attendance.shiftCode || "S2",

      status: `${responseStatus1}:${responseStatus2}`,
      statusCode: `${responseStatus1}:${responseStatus2}`,

      firstIn: attendance.inTime,
      lastOut: attendance.outTime,

      session1: responseStatus1,
      session2: responseStatus2,
    };
    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Attendance Override Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.bulkUpdateAttendanceByDateRange = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const { fromDate, toDate, remarks, updates } = req.body;

    const { startDate } = getDayRange(fromDate);
    const { endDate: queryEndDate } = getDayRange(toDate);

    const bulkOperationId = new mongoose.Types.ObjectId().toString();

    const updatedRecords = [];

    for (const update of updates) {
      const { employeeId, session1, session2, firstIn, lastOut } = update;
      const requestedSession1 =
        session1 !== undefined ? String(session1).trim() : null;
      const requestedSession2 =
        session2 !== undefined ? String(session2).trim() : null;

      const attendances = await Attendance.find({
        facultyId: employeeId,
        attendanceDate: {
          $gte: startDate,
          $lte: queryEndDate,
        },
      })
        .populate(
          "facultyId",
          "firstName lastName empId department employeeCategory",
        )
        .sort({ attendanceDate: 1 });

      console.log(
        `Employee ${employeeId} -> Found ${attendances.length} attendance records`,
      );

      for (const attendance of attendances) {
        const previousStatus = attendance.status;
        const previousInTime = attendance.inTime;
        const previousOutTime = attendance.outTime;

        // Update In Time
        if (firstIn !== undefined) {
          attendance.inTime = firstIn;
        }

        // Update Out Time
        if (lastOut !== undefined) {
          attendance.outTime = lastOut;
        }
        let newStatus = attendance.status;

        // Update Status
        if (requestedSession1 !== null && requestedSession2 !== null) {
          const statusKey = getStatusFromSessions(
            requestedSession1,
            requestedSession2,
          );

          console.log("Employee:", employeeId);
          console.log("session1:", requestedSession1);
          console.log("session2:", requestedSession2);
          console.log("combined:", `${requestedSession1}:${requestedSession2}`);
          console.log("statusKey:", newStatus);

          if (!newStatus) {
            console.log(
              "Available combinations:",
              Object.keys(SESSION_STATUS_MAP),
            );

            continue; // skip invalid employee instead of stopping whole bulk update
          }

          // don't update attendance.status
          attendance.session1 = requestedSession1;
          attendance.session2 = requestedSession2;
          attendance.isOverridden = true;
          attendance.overrideStatus = newStatus;
        }

        // Calculate working minutes
        if (attendance.inTime && attendance.outTime) {
          attendance.workingMinutes = Math.floor(
            (new Date(attendance.outTime) - new Date(attendance.inTime)) /
              60000,
          );
        }

        await attendance.save();

        // Save history
        const [historySessions1, historySessions2] = getSessionCodes(
          attendance.overrideStatus || attendance.status,
        );
        await AttendanceOverrideHistory.create({
          facultyId: attendance.facultyId._id,
          attendanceId: attendance._id,
          attendanceDate: attendance.attendanceDate,
          endDate: attendance.attendanceDate,

          employeeCategory: attendance.facultyId?.employeeCategory || "",

          previousStatus,
          newStatus: attendance.overrideStatus || attendance.status,
          session1: attendance.session1 || historySessions1 || null,
          session2: attendance.session2 || historySessions2 || null,

          previousInTime,
          previousOutTime,

          newInTime: attendance.inTime,
          newOutTime: attendance.outTime,

          reason: remarks || "Bulk update",

          changedBy: req.user._id,
          changedByRole: req.user.role,

          bulkOperationId,
        });

        const [recordSession1, recordSession2] = getSessionCodes(
          attendance.overrideStatus || attendance.status,
        );
        const responseSession1 = requestedSession1 || recordSession1;
        const responseSession2 = requestedSession2 || recordSession2;

        updatedRecords.push({
          facultyId: attendance.facultyId?._id || null,
          employeeId: attendance.facultyId._id,

          employeeName: [
            attendance.facultyId.firstName,
            attendance.facultyId.lastName,
          ]
            .filter(Boolean)
            .join(" "),

          employeeNo: attendance.facultyId.empId,

          department: attendance.facultyId.department,

          employeeCategory: attendance.facultyId.employeeCategory,

          date: attendance.attendanceDate,

          shiftCode: attendance.shiftCode || "S2",

          status: `${responseSession1}:${responseSession2}`,
          statusCode: `${responseSession1}:${responseSession2}`,

          firstIn: attendance.inTime,
          lastOut: attendance.outTime,

          session1: responseSession1,
          session2: responseSession2,
        });
      }
    }

    return res.status(200).json({
      success: true,
      bulkOperationId,
      count: updatedRecords.length,
      data: updatedRecords,
    });
  } catch (error) {
    console.error("Bulk Update Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Bulk update attendance for a single employee over a date range
exports.bulkUpdateAttendanceByEmployee = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const { employeeId } = req.params;
    const { remarks, updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "updates array is required",
      });
    }

    const bulkOperationId = new mongoose.Types.ObjectId().toString();
    const updatedRecords = [];

    for (const update of updates) {
      const { date, session1, session2, firstIn, lastOut } = update;
      const requestedSession1 =
        session1 !== undefined ? String(session1).trim() : null;
      const requestedSession2 =
        session2 !== undefined ? String(session2).trim() : null;

      if (!date) {
        continue;
      }

      const { startDate, endDate } = getDayRange(date);
      const attendance = await Attendance.findOne({
        facultyId: employeeId,
        attendanceDate: {
          $gte: startDate,
          $lte: endDate,
        },
      }).populate(
        "facultyId",
        "firstName lastName empId department employeeCategory",
      );

      if (!attendance) {
        continue;
      }

      const previousStatus = attendance.status;
      const previousInTime = attendance.inTime;
      const previousOutTime = attendance.outTime;

      if (firstIn !== undefined) attendance.inTime = firstIn;
      if (lastOut !== undefined) attendance.outTime = lastOut;

      if (requestedSession1 !== null && requestedSession2 !== null) {
        const newStatus = getStatusFromSessions(
          requestedSession1,
          requestedSession2,
        );

        if (!newStatus) {
          continue;
        }

        // don't update attendance.status
        attendance.session1 = requestedSession1;
        attendance.session2 = requestedSession2;
        attendance.isOverridden = true;
        attendance.overrideStatus = newStatus;
      }

      if (attendance.inTime && attendance.outTime) {
        attendance.workingMinutes = Math.floor(
          (new Date(attendance.outTime) - new Date(attendance.inTime)) / 60000,
        );
      }

      await attendance.save();

      const [recordSession1, recordSession2] = getSessionCodes(
        attendance.overrideStatus || attendance.status,
      );
      const responseSession1 = requestedSession1 || recordSession1;
      const responseSession2 = requestedSession2 || recordSession2;

      updatedRecords.push({
        facultyId: attendance.facultyId?._id || null,
        employeeId: attendance.facultyId._id,
        employeeName: [
          attendance.facultyId.firstName,
          attendance.facultyId.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        employeeNo: attendance.facultyId.empId,
        department: attendance.facultyId.department,
        employeeCategory: attendance.facultyId.employeeCategory,
        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",
        status: `${responseSession1}:${responseSession2}`,
        statusCode: `${responseSession1}:${responseSession2}`,
        attendanceStatus: attendance.overrideStatus || attendance.status,
        firstIn: attendance.inTime,
        lastOut: attendance.outTime,
        session1: responseSession1,
        session2: responseSession2,
        previousStatus,
        previousInTime,
        previousOutTime,
      });
    }

    if (updatedRecords.length === 0) {
      return res.status(200).json({
        success: true,
        bulkOperationId,
        count: 0,
        data: [],
      });
    }

    updatedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    const formatDate = (value) => new Date(value).toISOString().split("T")[0];

    const buildRanges = (rows) => {
      const ranges = [];
      let rangeStart = rows[0].date;
      let rangeEnd = rows[0].date;

      const pushRange = () => {
        const startKey = formatDate(rangeStart);
        const endKey = formatDate(rangeEnd);
        ranges.push(
          startKey === endKey ? startKey : `${startKey} to ${endKey}`,
        );
      };

      for (let i = 1; i < rows.length; i += 1) {
        const prevDate = new Date(rangeEnd);
        const currDate = new Date(rows[i].date);
        const diffDays = Math.round(
          (currDate - prevDate) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          rangeEnd = rows[i].date;
        } else {
          pushRange();
          rangeStart = rows[i].date;
          rangeEnd = rows[i].date;
        }
      }

      pushRange();
      return ranges.join(", ");
    };

    const groupedRecords = [];
    let currentGroup = null;

    const pushCurrentGroup = () => {
      if (!currentGroup) return;

      const rangeText = buildRanges(currentGroup.rows);
      const orderedRows = currentGroup.rows.sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );
      const previousStatusValues = [
        ...new Set(orderedRows.map((row) => row.previousStatus)),
      ];

      groupedRecords.push({
        facultyId: currentGroup.facultyId || null,
        employeeId: currentGroup.employeeId,
        employeeName: currentGroup.employeeName,
        employeeNo: currentGroup.employeeNo,
        department: currentGroup.department,
        employeeCategory: currentGroup.employeeCategory,
        attendanceDate: rangeText,
        shiftCode: currentGroup.shiftCode,
        status: currentGroup.status,
        attendanceStatus: currentGroup.attendanceStatus,
        statusCode: currentGroup.status,
        firstIn: orderedRows[0].firstIn,
        lastOut: orderedRows[orderedRows.length - 1].lastOut,
        session1: currentGroup.session1,
        session2: currentGroup.session2,
        rows: orderedRows,
        previousStatusSummary: previousStatusValues.join(", "),
      });
    };

    for (const record of updatedRecords) {
      const shouldStartNewGroup =
        !currentGroup || currentGroup.status !== record.status;

      if (shouldStartNewGroup) {
        pushCurrentGroup();
        currentGroup = {
          ...record,
          rows: [record],
        };
      } else {
        currentGroup.rows.push(record);
      }
    }

    pushCurrentGroup();

    const historyInserts = groupedRecords.map((group) => {
      const orderedRows = group.rows.sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );
      const [defaultSession1, defaultSession2] = getSessionCodes(
        group.attendanceStatus,
      );
      return {
        facultyId: employeeId,
        attendanceDate: orderedRows[0].date,
        endDate: orderedRows[orderedRows.length - 1].date,
        previousStatus: group.previousStatusSummary,
        newStatus: group.attendanceStatus,
        session1: group.session1 || defaultSession1 || null,
        session2: group.session2 || defaultSession2 || null,
        previousInTime: orderedRows[0].previousInTime || null,
        previousOutTime: orderedRows[0].previousOutTime || null,
        newInTime: orderedRows[0].firstIn || null,
        newOutTime: orderedRows[orderedRows.length - 1].lastOut || null,
        reason: remarks || "Bulk update (employee)",
        changedBy: req.user._id,
        changedByRole: req.user.role,
        bulkOperationId,
      };
    });

    if (historyInserts.length > 0) {
      await AttendanceOverrideHistory.insertMany(historyInserts);
    }

    const responsePayload = groupedRecords.map((group) => {
      const { rows, previousStatusSummary, attendanceStatus, ...item } = group;
      return item;
    });

    return res.status(200).json({
      success: true,
      bulkOperationId,
      count: responsePayload.length,
      data: responsePayload,
    });
  } catch (error) {
    console.error("Bulk Update Employee Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAttendanceOverrideHistory = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin can access this API",
      });
    }

    const history = await AttendanceOverrideHistory.find()
      .populate(
        "facultyId",
        "firstName lastName empId department employeeCategory",
      )
      .sort({ attendanceDate: 1 });

    const data = history.map((item) => {
      const [oldSession1, oldSession2] = getSessionCodes(item.previousStatus);

      const newSession1 =
        item.session1 || getSessionCodes(item.newStatus)[0] || "";

      const newSession2 =
        item.session2 || getSessionCodes(item.newStatus)[1] || "";

      return {
        employeeName:
          item.facultyId &&
          (item.facultyId.firstName || item.facultyId.lastName)
            ? `${item.facultyId.firstName || ""} ${
                item.facultyId.lastName || ""
              }`.trim()
            : "",

        employeeId: item.facultyId?.empId || "",

        department: item.facultyId?.department || "",

        employeeCategory: item.facultyId?.employeeCategory || "",

        attendanceDate: item.attendanceDate
          ? item.attendanceDate.toISOString().split("T")[0]
          : null,

        endDate: item.endDate ? item.endDate.toISOString().split("T")[0] : null,

        firstIn: item.newInTime,
        lastOut: item.newOutTime,

        oldSession1,
        oldSession2,

        newSession1,
        newSession2,

        overriddenOn: item.createdAt,

        remarks: item.reason,
      };
    });

    const grouped = data.map((item) => ({
      employeeName: item.employeeName,
      employeeId: item.employeeId,
      department: item.department,
      employeeCategory: item.employeeCategory,

      attendanceDate:
        item.endDate && item.endDate !== item.attendanceDate
          ? `${item.attendanceDate} to ${item.endDate}`
          : item.attendanceDate,

      firstIn: item.firstIn,
      lastOut: item.lastOut,

      oldSession1: item.oldSession1,
      oldSession2: item.oldSession2,

      newSession1: item.newSession1,
      newSession2: item.newSession2,

      overriddenOn: item.overriddenOn,

      remarks: item.remarks,
    }));

    return res.status(200).json({
      success: true,
      count: grouped.length,
      data: grouped,
    });
  } catch (error) {
    console.error("Attendance Override History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
