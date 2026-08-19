const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");
const Faculty = require("../models/Faculty");
const Holiday = require("../models/holiday");
const LeaveType = require("../models/Leave/leaveType");
const LeaveBalance = require("../models/Leave/leaveBalance");
const LeaveApplication = require("../models/Leave/leaveApplication");
// const deductLeaveBalance = require("../utils/deductLeaveBalance");
const { calculateLeaveBalanceAdjustments } = require("../utils/leaveBalanceAdjustment");

const STATUS_CODE_MAP = {
  Present: "P:P",
  Absent: "A:A",

  "Half Day": "A:P",

  "First Half Leave": "A:P",
  "Second Half Leave": "P:A",

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
  "First Half Leave": "A:P",
  "Second Half Leave": "P:A",
};

const SESSION_STATUS_MAP = {
  "P:P": "Present",
  "A:A": "Absent",

  "A:P": "Half Day",
  "P:A": "Half Day",

  "A:P": "First Half Leave",
  "P:A": "Second Half Leave",

  "L:L": "Leave",
  "H:H": "Holiday",

  "OD:OD": "On Duty",

  "OD:P": "First Half OD",
  "P:OD": "Second Half OD",

  // Optional aliases
  "OD:A": "First Half OD",
  "A:OD": "Second Half OD",

  // Leave type-specific session codes
  "CL:CL": "Leave",
  "ML:ML": "Leave",
  "LOP:LOP": "Leave",
  "CL:P": "First Half Leave",
  "P:CL": "Second Half Leave",
  "ML:P": "First Half Leave",
  "P:ML": "Second Half Leave",
  "LOP:P": "First Half Leave",
  "P:LOP": "Second Half Leave",
  "L:P": "First Half Leave",
  "P:L": "Second Half Leave",
};

const STATUS_SESSION_MAP = {
  // Present
  Present: ["P", "P"],

  // Generic Leave -> use L for both sessions when specific leave type isn't present
  Leave: ["L", "L"],

  // Leave Types
  CL: ["CL", "CL"],
  LOP: ["LOP", "LOP"],
  ML: ["ML", "ML"],

  // Half Day Leave
  "First Half CL": ["CL", "P"],
  "Second Half CL": ["P", "CL"],

  "First Half LOP": ["LOP", "P"],
  "Second Half LOP": ["P", "LOP"],

  "First Half ML": ["ML", "P"],
  "Second Half ML": ["P", "ML"],

  // On Duty
  "On Duty": ["OD", "OD"],
  "OD-E": ["OD-E", "OD-E"],
  "OD-O": ["OD-O", "OD-O"],
  "OD-R": ["OD-R", "OD-R"],

  // Half Day OD
  "First Half OD-E": ["OD-E", "P"],
  "Second Half OD-E": ["P", "OD-E"],

  "First Half OD-O": ["OD-O", "P"],
  "Second Half OD-O": ["P", "OD-O"],

  "First Half OD-R": ["OD-R", "P"],
  "Second Half OD-R": ["P", "OD-R"],

  // Other Types
  Exam: ["EXAM", "EXAM"],
  Official: ["OFFICIAL", "OFFICIAL"],
  Research: ["RESEARCH", "RESEARCH"],

  Holiday: ["H", "H"],
};

const normalizeSessionCode = (value) =>
  String(value || "").trim().toUpperCase();

const getSessionCodes = (status) => {
  const normalizedStatus = String(status || "").trim();
  return STATUS_SESSION_MAP[normalizedStatus] || ["", ""];
};

const getEffectiveSessionCodes = ({ status, session1, session2 } = {}) => {
  const [fallback1, fallback2] = getSessionCodes(status);
  const first = normalizeSessionCode(session1);
  const second = normalizeSessionCode(session2);

  return [first || fallback1 || "L", second || fallback2 || "L"];
};

const isSessionBlank = (sessionValue) =>
  sessionValue === undefined ||
  sessionValue === null ||
  String(sessionValue).trim() === "";

const getLeaveSessionCodes = (leaveApplication) => {
  if (!leaveApplication || !leaveApplication.leaveTypeId) {
    return null;
  }

  const leaveName = String(
    leaveApplication.leaveTypeId.leaveName || "",
  )
    .trim()
    .toLowerCase();
  const leaveCategory = String(
    leaveApplication.leaveTypeId.leaveCategory || "",
  )
    .trim()
    .toLowerCase();
  const leaveSession = String(leaveApplication.leaveSession || "")
    .trim()
    .toLowerCase();

  let code = null;

  if (leaveCategory === "on duty" || leaveName.includes("on duty")) {
    if (leaveName.includes("od-e") || leaveName.includes("exam")) {
      code = "OD-E";
    } else if (leaveName.includes("od-o") || leaveName.includes("official")) {
      code = "OD-O";
    } else if (leaveName.includes("od-r") || leaveName.includes("research")) {
      code = "OD-R";
    } else {
      code = "OD";
    }
  } else if (leaveName.includes("casual")) {
    code = "CL";
  } else if (leaveName.includes("medical")) {
    code = "ML";
  } else if (leaveName.includes("lop") || leaveName.includes("loss of pay")) {
    code = "LOP";
  } else {
    return null;
  }

  if (leaveSession === "first half") {
    return [code, "P"];
  }

  if (leaveSession === "second half") {
    return ["P", code];
  }

  return [code, code];
};

const getStatusFromSessions = (session1, session2) => {
  if (session1 === undefined || session2 === undefined) {
    return null;
  }

  const first = normalizeSessionCode(session1);
  const second = normalizeSessionCode(session2);
  const key = `${first}:${second}`;

  // Exact mappings first
  if (SESSION_STATUS_MAP[key]) {
    return SESSION_STATUS_MAP[key];
  }

  const leaveCodes = ["CL", "ML", "LOP"];
  const odCodes = ["OD-E", "OD-O", "OD-R", "OD"];

  const isFirstLeave = leaveCodes.includes(first);
  const isSecondLeave = leaveCodes.includes(second);
  const isFirstOD = odCodes.includes(first);
  const isSecondOD = odCodes.includes(second);

  if (first === "P" && second === "P") {
    return "Present";
  }

  if (first === "A" && second === "A") {
    return "Absent";
  }

  if (first === "H" && second === "H") {
    return "Holiday";
  }

  if (isFirstLeave && isSecondLeave) {
    return "Leave";
  }

  if (isFirstOD && isSecondOD) {
    return "On Duty";
  }

  if (isFirstLeave && second === "P") {
    return "First Half Leave";
  }

  if (first === "P" && isSecondLeave) {
    return "Second Half Leave";
  }

  if (isFirstOD && second === "P") {
    return "First Half OD";
  }

  if (first === "P" && isSecondOD) {
    return "Second Half OD";
  }

  if ((isFirstLeave && isSecondOD) || (isFirstOD && isSecondLeave)) {
    return "Leave";
  }

  return null;
};

const getLeaveSessionMapping = {
  CL: "Casual Leave",
  ML: "Medical Leave",
  LOP: "LOP",
  "OD-O": "On Duty - Official",
  "OD-E": "On Duty - Exam",
  "OD-R": "On Duty - Research",
  OD: "On Duty",
};

const getSessionLeaveDetails = (sessionCode) => {
  const code = normalizeSessionCode(sessionCode);
  const leaveCodes = ["CL", "ML", "LOP"];
  const odCodes = ["OD-O", "OD-E", "OD-R", "OD"];
  const allDeductibleCodes = [...leaveCodes, ...odCodes];

  if (!allDeductibleCodes.includes(code)) {
    return null;
  }

  return {
    code,
    leaveName: getLeaveSessionMapping[code],
    days: 0.5,
  };
};

const getSessionLeaveDetailsForPair = (session1, session2) => {
  const details = [];
  const first = getSessionLeaveDetails(session1);
  const second = getSessionLeaveDetails(session2);

  if (first) details.push(first);
  if (second) details.push(second);
  return details;
};

const groupLeaveDetailsByName = (details) =>
  details.reduce((acc, item) => {
    const name = item.leaveName;
    if (!acc[name]) acc[name] = 0;
    acc[name] += item.days;
    return acc;
  }, {});

const getAttendanceAcademicYear = (date) => {
  const targetDate = date ? new Date(date) : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;

  if (month >= 7) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
};

const getAttendanceMonth = (date) => {
  const targetDate = date ? new Date(date) : new Date();
  return targetDate.getMonth() + 1;
};

const deductOverrideLeaveBalance = async ({
  facultyId,
  leaveName,
  days,
  academicYear,
  currentMonth,
}) => {
  const leaveType = await LeaveType.findOne({ leaveName });
  if (!leaveType) {
    return {
      success: false,
      message: `Leave type ${leaveName} not found.`,
    };
  }

  const leaveBalance = await LeaveBalance.findOne({
    facultyId,
    leaveTypeId: leaveType._id,
    academicYear,
  });

  if (!leaveBalance) {
    return {
      success: false,
      message: `${leaveName} balance not found for the selected academic year.`,
    };
  }

  let adjustmentDays = Number(days) || 0;
  const isUnlimitedLeave =
    leaveName === "LOP" || leaveName === "On Duty - Official";

  if (
    adjustmentDays > 0 &&
    !isUnlimitedLeave &&
    leaveBalance.remainingDays < adjustmentDays
  ) {
    return {
      success: false,
      message: `Insufficient ${leaveName} balance.`,
    };
  }

  if (adjustmentDays < 0) {
    const maxReverse = -leaveBalance.usedDays;
    if (adjustmentDays < maxReverse) {
      adjustmentDays = maxReverse;
    }
  }

  if (adjustmentDays === 0) {
    return {
      success: true,
      leaveTypeId: leaveType._id,
      leaveName,
      days: 0,
      academicYear,
      currentMonth,
      deductedDays: 0,
    };
  }

  leaveBalance.usedDays += adjustmentDays;
  if (!isUnlimitedLeave) {
    leaveBalance.remainingDays -= adjustmentDays;
  }

  await leaveBalance.save();

  return {
    success: true,
    leaveTypeId: leaveType._id,
    leaveName,
    days,
    academicYear,
    currentMonth,
    deductedDays: days,
  };
};

const getDayRange = (date) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const startDate = new Date(`${date}T00:00:00+05:30`);
    const endDate = new Date(`${date}T23:59:59.999+05:30`);

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

    const facultyIds = attendanceList
      .map((attendance) =>
        attendance.facultyId && attendance.facultyId._id
          ? attendance.facultyId._id.toString()
          : attendance.facultyId
          ? attendance.facultyId.toString()
          : null,
      )
      .filter(Boolean);

    const approvedLeaves = await LeaveApplication.find({
      facultyId: { $in: facultyIds },
      status: "Approved",
      fromDate: { $lte: endDate },
      toDate: { $gte: startDate },
    }).populate("leaveTypeId", "leaveName leaveCategory");

    const leaveAppsByFaculty = approvedLeaves.reduce((acc, app) => {
      const fid = app.facultyId.toString();
      if (!acc[fid]) acc[fid] = [];
      acc[fid].push(app);
      return acc;
    }, {});

    const data = attendanceList.map((attendance) => {
      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const employeeNo = attendance.facultyId?.empId || "";
      const employeeId = attendance.facultyId?._id || null;
      // prefer stored session1/session2 (requested order), fallback to status-derived
      let [s1, s2] = getEffectiveSessionCodes(attendance);

      if (
        attendance.status === "Leave" &&
        isSessionBlank(attendance.session1) &&
        isSessionBlank(attendance.session2)
      ) {
        const leaveApps = leaveAppsByFaculty[attendance.facultyId?._id?.toString()];
        const leaveApp = (leaveApps || []).find((app) => {
          const attendanceDate = new Date(attendance.attendanceDate);
          attendanceDate.setHours(0, 0, 0, 0, 0);

          const fromDate = new Date(app.fromDate);
          fromDate.setHours(0, 0, 0, 0, 0);
          const toDate = new Date(app.toDate);
          toDate.setHours(0, 0, 0, 0, 0);

          return attendanceDate >= fromDate && attendanceDate <= toDate;
        });

        const leaveCodes = getLeaveSessionCodes(leaveApp);
        if (leaveCodes) {
          [s1, s2] = leaveCodes;
        }
      }

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
    console.log(" Attendance List:", attendanceList);

    const attendanceDates = attendanceList.map((attendance) => attendance.attendanceDate);
    const minDate = attendanceDates.length
      ? new Date(Math.min(...attendanceDates.map((dt) => new Date(dt).getTime())))
      : null;
    const maxDate = attendanceDates.length
      ? new Date(Math.max(...attendanceDates.map((dt) => new Date(dt).getTime())))
      : null;

    const leaveQuery = {
      facultyId: employeeId,
      status: "Approved",
    };

    if (startDateQuery && endDateQuery) {
      leaveQuery.fromDate = { $lte: getDayRange(endDateQuery).endDate };
      leaveQuery.toDate = { $gte: getDayRange(startDateQuery).startDate };
    } else if (minDate && maxDate) {
      leaveQuery.fromDate = { $lte: maxDate };
      leaveQuery.toDate = { $gte: minDate };
    }

    const approvedLeaves = await LeaveApplication.find(leaveQuery).populate(
      "leaveTypeId",
      "leaveName leaveCategory",
    );

    const leaveAppsByFaculty = approvedLeaves.reduce((acc, app) => {
      const fid = app.facultyId.toString();
      if (!acc[fid]) acc[fid] = [];
      acc[fid].push(app);
      return acc;
    }, {});
    const data = attendanceList.map((attendance) => {
      
      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const employeeNo = attendance.facultyId?.empId || "";
      let [s1, s2] = getEffectiveSessionCodes(attendance);

      if (
        attendance.status === "Leave" &&
        isSessionBlank(attendance.session1) &&
        isSessionBlank(attendance.session2)
      ) {
        const leaveApps = leaveAppsByFaculty[attendance.facultyId?._id?.toString()];
        const leaveApp = (leaveApps || []).find((app) => {
          const attendanceDate = new Date(attendance.attendanceDate);
          attendanceDate.setHours(0, 0, 0, 0, 0);

          const fromDate = new Date(app.fromDate);
          fromDate.setHours(0, 0, 0, 0, 0);
          const toDate = new Date(app.toDate);
          toDate.setHours(0, 0, 0, 0, 0);

          return attendanceDate >= fromDate && attendanceDate <= toDate;
        });

        const leaveCodes = getLeaveSessionCodes(leaveApp);
        if (leaveCodes) {
          [s1, s2] = leaveCodes;
        }
      }

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
    // if (firstIn !== undefined) {
    //   attendance.inTime = firstIn;
    // }

    // if (lastOut !== undefined) {
    //   attendance.outTime = lastOut;
    // }

    let leaveBalanceDeduction = null;
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

      const previousSession1 =
        attendance.session1 || getSessionCodes(attendance.status)[0];
      const previousSession2 =
        attendance.session2 || getSessionCodes(attendance.status)[1];

      attendance.session1 = requestedSession1;
      attendance.session2 = requestedSession2;
      attendance.isOverridden = true;
      attendance.overrideStatus = statusKey;

      const leaveAdjustments = calculateLeaveBalanceAdjustments(
        previousSession1,
        previousSession2,
        requestedSession1,
        requestedSession2,
      );

      if (leaveAdjustments.length > 0) {
        const academicYear = getAttendanceAcademicYear(
          attendance.attendanceDate || new Date(),
        );
        const currentMonth = getAttendanceMonth(
          attendance.attendanceDate || new Date(),
        );

        for (const adjustment of leaveAdjustments) {
          const leaveResult = await deductOverrideLeaveBalance({
            facultyId: attendance.facultyId,
            leaveName: adjustment.leaveName,
            days: adjustment.net,
            academicYear,
            currentMonth,
          });

          if (!leaveResult.success) {
            return res.status(400).json({
              success: false,
              message: leaveResult.message,
            });
          }

          leaveBalanceDeduction = leaveResult;
        }
      }

      attendance.leaveBalanceAdjustments = leaveAdjustments;
    }

    if (remarks !== undefined) {
      attendance.overrideRemarks = remarks;
      attendance.isOverridden = true;
    }

    // Recalculate working minutes
    // if (attendance.inTime && attendance.outTime) {
    //   attendance.workingMinutes = Math.floor(
    //     (new Date(attendance.outTime) - new Date(attendance.inTime)) / 60000,
    //   );
    // }

    await attendance.save();

    // Populate faculty details
    await attendance.populate(
      "facultyId",
      "firstName lastName empId department",
    );

    // Save override history
    const [historySessions1, historySessions2] = getSessionCodes(
      attendance.overrideStatus || attendance.status,
    );
    await AttendanceOverrideHistory.create({
      facultyId: attendance.facultyId._id,
      attendanceId: attendance._id,
      attendanceDate: attendance.attendanceDate,
      endDate: attendance.attendanceDate,

      previousStatus,
      newStatus: attendance.overrideStatus || attendance.status,
      leaveTypeId: leaveBalanceDeduction?.leaveTypeId || null,
      leaveName: leaveBalanceDeduction?.leaveName || null,
      days: leaveBalanceDeduction?.days || 0,
      academicYear: leaveBalanceDeduction?.academicYear || null,
      currentMonth: leaveBalanceDeduction?.currentMonth || null,
      deductedDays: leaveBalanceDeduction?.deductedDays || 0,
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
      leaveBalanceAdjustments: attendance.leaveBalanceAdjustments || [],
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

        // // Update In Time
        // if (firstIn !== undefined) {
        //   attendance.inTime = firstIn;
        // }

        // // Update Out Time
        // if (lastOut !== undefined) {
        //   attendance.outTime = lastOut;
        // }

        let leaveBalanceDeduction = null;

        // Update Status
        if (requestedSession1 !== null && requestedSession2 !== null) {
          const statusKey = getStatusFromSessions(
            requestedSession1,
            requestedSession2,
          );

          if (!statusKey) {
            console.log(
              "Invalid session combination for bulk override:",
              `${requestedSession1}:${requestedSession2}`,
            );
            continue; // skip invalid update instead of stopping whole bulk update
          }

          const previousSession1 =
            attendance.session1 || getSessionCodes(attendance.status)[0];
          const previousSession2 =
            attendance.session2 || getSessionCodes(attendance.status)[1];

          attendance.session1 = requestedSession1;
          attendance.session2 = requestedSession2;
          attendance.isOverridden = true;
          attendance.overrideStatus = statusKey;

          const leaveAdjustments = calculateLeaveBalanceAdjustments(
            previousSession1,
            previousSession2,
            requestedSession1,
            requestedSession2,
          );

          if (leaveAdjustments.length > 0) {
            const academicYear = getAttendanceAcademicYear(
              attendance.attendanceDate || new Date(),
            );
            const currentMonth = getAttendanceMonth(
              attendance.attendanceDate || new Date(),
            );

            for (const adjustment of leaveAdjustments) {
              const leaveResult = await deductOverrideLeaveBalance({
                facultyId: attendance.facultyId,
                leaveName: adjustment.leaveName,
                days: adjustment.net,
                academicYear,
                currentMonth,
              });

              if (!leaveResult.success) {
                return res.status(400).json({
                  success: false,
                  message: leaveResult.message,
                });
              }

              leaveBalanceDeduction = leaveResult;
            }

            attendance.leaveBalanceAdjustments = leaveAdjustments;
          }
        }

        // Calculate working minutes
        // if (attendance.inTime && attendance.outTime) {
        //   attendance.workingMinutes = Math.floor(
        //     (new Date(attendance.outTime) - new Date(attendance.inTime)) /
        //       60000,
        //   );
        // }

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
          leaveTypeId: leaveBalanceDeduction?.leaveTypeId || null,
          leaveName: leaveBalanceDeduction?.leaveName || null,
          days: leaveBalanceDeduction?.days || 0,
          academicYear: leaveBalanceDeduction?.academicYear || null,
          currentMonth: leaveBalanceDeduction?.currentMonth || null,
          deductedDays: leaveBalanceDeduction?.deductedDays || 0,
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
          leaveBalanceAdjustments: attendance.leaveBalanceAdjustments || [],
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

      // if (firstIn !== undefined) attendance.inTime = firstIn;
      // if (lastOut !== undefined) attendance.outTime = lastOut;

      if (requestedSession1 !== null && requestedSession2 !== null) {
        const newStatus = getStatusFromSessions(
          requestedSession1,
          requestedSession2,
        );

        if (!newStatus) {
          continue;
        }

        const previousSession1 =
          attendance.session1 || getSessionCodes(attendance.status)[0];
        const previousSession2 =
          attendance.session2 || getSessionCodes(attendance.status)[1];

        // don't update attendance.status
        attendance.session1 = requestedSession1;
        attendance.session2 = requestedSession2;
        attendance.isOverridden = true;
        attendance.overrideStatus = newStatus;

        const leaveAdjustments = calculateLeaveBalanceAdjustments(
          previousSession1,
          previousSession2,
          requestedSession1,
          requestedSession2,
        );

        if (leaveAdjustments.length > 0) {
          const academicYear = getAttendanceAcademicYear(
            attendance.attendanceDate || new Date(),
          );
          const currentMonth = getAttendanceMonth(
            attendance.attendanceDate || new Date(),
          );

          for (const adjustment of leaveAdjustments) {
            const leaveResult = await deductOverrideLeaveBalance({
              facultyId: attendance.facultyId,
              leaveName: adjustment.leaveName,
              days: adjustment.net,
              academicYear,
              currentMonth,
            });

            if (!leaveResult.success) {
              return res.status(400).json({
                success: false,
                message: leaveResult.message,
              });
            }
          }

          attendance.leaveBalanceAdjustments = leaveAdjustments;
        }
      }

      // if (attendance.inTime && attendance.outTime) {
      //   attendance.workingMinutes = Math.floor(
      //     (new Date(attendance.outTime) - new Date(attendance.inTime)) / 60000,
      //   );
      // }

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
        leaveBalanceAdjustments: attendance.leaveBalanceAdjustments || [],
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

    const responsePayload = updatedRecords;

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
exports.getAttendanceOverride = async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const { department, employeeCategory, search, facultyId } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const startDate = new Date(Date.UTC(year, month - 2, 26));
    startDate.setMinutes(startDate.getMinutes() - 330);

    const endDate = new Date(Date.UTC(year, month - 1, 25, 23, 59, 59));
    endDate.setMinutes(endDate.getMinutes() - 330);

    const facultyFilter = {
      employmentStatus: true,
    };

    if (department) {
      facultyFilter.department = department;
    }

    if (employeeCategory) {
      facultyFilter.employeeCategory = employeeCategory;
    }

    if (facultyId) {
      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid facultyId",
        });
      }

      facultyFilter._id = facultyId;
    }

    if (search) {
      facultyFilter.$or = [
        { empId: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
              regex: search,
              options: "i",
            },
          },
        },
      ];
    }

    const faculties = await Faculty.find(facultyFilter).select(
      "empId firstName middleName lastName designation department employeeCategory punchId",
    );

    const facultyIds = faculties.map((faculty) => faculty._id);

    const attendances = await Attendance.find({
      facultyId: { $in: facultyIds },
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const holidays = await Holiday.find({
      isActive: true,
      holidayDate: {
        $gte: startDate,
        $lte: endDate,
      },
    }).select("holidayDate applicableEmployeeCategories");

    // Fetch approved leave applications covering this muster period
    const approvedLeaves = await LeaveApplication.find({
      facultyId: { $in: facultyIds },
      status: "Approved",
      fromDate: { $lte: endDate },
      toDate: { $gte: startDate },
    }).populate("leaveTypeId", "leaveName leaveCategory");

    // Map: "facultyId" -> array of { fromDate, toDate, abbr }
    const leaveAppMap = {};
    approvedLeaves.forEach((app) => {
      const fid = app.facultyId.toString();
      if (!leaveAppMap[fid]) leaveAppMap[fid] = [];
      const name = (app.leaveTypeId?.leaveName || "").trim().toLowerCase();
      const category = app.leaveTypeId?.leaveCategory || "Regular";
      let abbr;
      if (category === "On Duty") {
        if (name.includes("research")) abbr = "OD-R";
        else if (name.includes("exam")) abbr = "OD-E";
        else if (name.includes("official")) abbr = "OD-O";
        else abbr = "OD";
      } else {
        if (name.includes("casual")) abbr = "CL";
        else if (name.includes("medical")) abbr = "ML";
        else if (name.includes("lop") || name.includes("loss of pay")) abbr = "LOP";
        else if (name.includes("maternity")) abbr = "MA";
        else abbr = "L";
      }
      leaveAppMap[fid].push({
        fromDate: new Date(app.fromDate),
        toDate: new Date(app.toDate),
        abbr,
      });
    });

    // Returns the approved leave abbreviation for a faculty on a given date, or null
    const getApprovedLeaveAbbr = (facultyIdStr, dayDate) => {
      const apps = leaveAppMap[facultyIdStr] || [];
      const match = apps.find(
        (a) => dayDate >= a.fromDate && dayDate <= a.toDate,
      );
      return match ? match.abbr : null;
    };

    const attendanceMap = {};

    attendances.forEach((attendance) => {
      const facultyId = attendance.facultyId.toString();

      if (!attendanceMap[facultyId]) {
        attendanceMap[facultyId] = {};
      }

      let day;
      let dayDate;

      const istDate = new Date(attendance.attendanceDate);
      istDate.setMinutes(istDate.getMinutes() + 330);
      day = istDate.getUTCDate();
      dayDate = new Date(Date.UTC(
        istDate.getUTCFullYear(),
        istDate.getUTCMonth(),
        istDate.getUTCDate(),
      ));

      // Decide which status to display
      let displayStatus = attendance.status;

      if (attendance.isOverridden) {
        displayStatus = attendance.overrideStatus;
      } else if (attendance.regularization) {
        displayStatus = attendance.regularizationStatus;
      }

      let value = "-";

      switch (displayStatus) {
        case "Present":
          value = "P";
          break;

        case "Absent":
          value = "A";
          break;

        case "Leave":
          value = "L";
          break;

        case "Holiday":
          value = "H";
          break;

        case "Half Day":
          value = "HD";
          break;

        case "First Half Leave":
          value = "A:P";
          break;

        case "Second Half Leave":
          value = "P:A";
          break;

        case "Missed Punch":
          value = "MP";
          break;

        case "On Duty":
          value = "OD";
          break;

        case "First Half OD":
          value = "OD:P";
          break;

        case "Second Half OD":
          value = "P:OD";
          break;
      }

          if (
        attendance.isOverridden &&
        attendance.session1 !== undefined &&
        attendance.session2 !== undefined &&
        String(attendance.session1).trim() !== "" &&
        String(attendance.session2).trim() !== ""
      ) {
        const session1 = String(attendance.session1).trim().toUpperCase();
        const session2 = String(attendance.session2).trim().toUpperCase();
        value = `${session1}:${session2}`;
      } else {
        // If there is an approved leave application for this day, override
        // the generic L / A:P / P:A / OD / OD:P / P:OD with the specific abbreviation
        const approvedAbbr = getApprovedLeaveAbbr(facultyId, dayDate);
        if (approvedAbbr) {
          switch (displayStatus) {
            case "Leave":
              value = approvedAbbr;
              break;
            case "First Half Leave":
              value = approvedAbbr + ":P";
              break;
            case "Second Half Leave":
              value = "P:" + approvedAbbr;
              break;
            case "On Duty":
              value = approvedAbbr;
              break;
            case "First Half OD":
              value = approvedAbbr + ":P";
              break;
            case "Second Half OD":
              value = "P:" + approvedAbbr;
              break;
          }
        }
      }
      attendanceMap[facultyId][day] = {
        status: value,
        isOverridden: attendance.isOverridden,
        regularization: attendance.regularization,
      };
    });

    const employees = faculties.map((faculty) => {
      const attendanceDays = [];

      const facultyAttendance = attendanceMap[faculty._id.toString()] || {};

      const facultyHolidayMap = new Set();

      holidays.forEach((holiday) => {
        if (
          holiday.applicableEmployeeCategories?.includes(
            faculty.employeeCategory,
          )
        ) {
          const istDate = new Date(holiday.holidayDate);

          istDate.setMinutes(istDate.getMinutes() + 330);

          facultyHolidayMap.add(istDate.getUTCDate());
        }
      });
      const musterDays = [];

      const previousMonthDays = new Date(
        Date.UTC(year, month - 1, 0),
      ).getUTCDate();

      for (let day = 26; day <= previousMonthDays; day++) {
        musterDays.push(day);
      }

      for (let day = 1; day <= 25; day++) {
        musterDays.push(day);
      }
      for (const day of musterDays) {
        let dateObj;

        if (day >= 26) {
          dateObj = new Date(Date.UTC(year, month - 2, day));
        } else {
          dateObj = new Date(Date.UTC(year, month - 1, day));
        }

        // Attendance exists -> show attendance
        if (facultyAttendance[day] !== undefined) {
          attendanceDays.push({
            day,
            status: facultyAttendance[day],
          });
        }

        // Sunday or Holiday without attendance
        else if (dateObj.getUTCDay() === 0 || facultyHolidayMap.has(day)) {
          attendanceDays.push({
            day,
            status: "OFF",
          });
        }
        // No record
        else {
          attendanceDays.push({
            day,
            status: "-",
          });
        }
      }

      return {
        facultyId: faculty._id,
        empId: faculty.empId,
        employeeName: [faculty.firstName, faculty.middleName, faculty.lastName]
          .filter(Boolean)
          .join(" "),
        designation: faculty.designation,
        department: faculty.department,
        employeeCategory: faculty.employeeCategory,
        punchId: faculty.punchId,
        attendance: attendanceDays,
      };
    });
    const previousMonthDays = new Date(
      Date.UTC(year, month - 1, 0),
    ).getUTCDate();

    const musterDays = [];

    for (let day = 26; day <= previousMonthDays; day++) {
      musterDays.push(day);
    }

    for (let day = 1; day <= 25; day++) {
      musterDays.push(day);
    }
    return res.status(200).json({
      success: true,
      month,
      year,
      musterDays,
      employees,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance muster",
    });
  }
};