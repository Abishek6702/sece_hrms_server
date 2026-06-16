const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");

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
  "Second Half OD": "P:OD",
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
  "Second Half OD": ["P", "OD"],
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
    if (req.user.role !== "hr") {
      return res.status(403).json({
        success: false,
        message: "Only HR can access this API",
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
      const [session1, session2] = getSessionCodes(attendance.status);

      return {
        facultyId: attendance.facultyId?._id,
        employeeName,
        employeeNo,
        department: attendance.facultyId?.department,
        employeeCategory: attendance.facultyId?.employeeCategory,

        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",

        status: `${session1}:${session2}`,

        firstIn: attendance.inTime,
        lastOut: attendance.outTime,

        session1,
        session2,
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
    if (req.user.role !== "hr") {
      return res.status(403).json({
        success: false,
        message: "Only HR can access this API",
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
      const [session1, session2] = getSessionCodes(attendance.status);

      return {
        _id: attendance._id,
        employeeId: attendance.facultyId?._id || null,
        employeeName,
        employeeNo,
        department: attendance.facultyId?.department,
        employeeCategory: attendance.facultyId?.employeeCategory,

        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",

        status: `${session1}:${session2}`,

        firstIn: attendance.inTime,
        lastOut: attendance.outTime,

        session1,
        session2,
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
    // Only HR can access
    if (req.user.role !== "hr") {
      return res.status(403).json({
        success: false,
        message: "Only HR can access this API",
      });
    }

    const { employeeId, date } = req.params;
    const { firstIn, lastOut, session1, session2, remarks } = req.body;

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

    const newStatus = getStatusFromSessions(session1, session2) || attendance.status;

    if (newStatus === "Absent" && (!remarks || remarks.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "Reason is required when changing attendance status to Absent",
      });
    }

    // Store old values
    const previousStatus = attendance.status;
    const previousInTime = attendance.inTime;
    const previousOutTime = attendance.outTime;

    // Update attendance
    if (firstIn !== undefined) {
      attendance.inTime = firstIn;
    }

    if (lastOut !== undefined) {
      attendance.outTime = lastOut;
    }

    if (session1 !== undefined && session2 !== undefined) {
      const statusKey = getStatusFromSessions(session1, session2);

      if (!statusKey) {
        return res.status(400).json({
          success: false,
          message: "Invalid session values",
        });
      }

      attendance.status = statusKey;
    }

    if (remarks !== undefined) {
      attendance.remarks = remarks;
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
    await AttendanceOverrideHistory.create({
      facultyId: attendance.facultyId._id,
      attendanceId: attendance._id,
      attendanceDate: attendance.attendanceDate,

      previousStatus,
      newStatus: attendance.status,

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

    const [responseSession1, responseSession2] = getSessionCodes(attendance.status);

    const response = {
      _id: attendance._id,

      employeeId: attendance.facultyId?._id || null,

      employeeName,
      employeeNo,
      department,

      date: attendance.attendanceDate,
      shiftCode: attendance.shiftCode || "S2",

      status: `${responseSession1}:${responseSession2}`,
      statusCode: STATUS_CODE_MAP[result.status] || null,

      firstIn: attendance.inTime,
      lastOut: attendance.outTime,

      session1: responseSession1,
      session2: responseSession2,
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
    if (req.user.role !== "hr") {
      return res.status(403).json({
        success: false,
        message: "Only HR can access this API",
      });
    }

    const { fromDate, toDate, remarks, updates } = req.body;

    const { startDate, endDate } = getDayRange(fromDate);
    const { endDate: queryEndDate } = getDayRange(toDate);
    const bulkOperationId = new mongoose.Types.ObjectId().toString();

    const updatedRecords = [];

    for (const update of updates) {
      const { employeeId, session1, session2, firstIn, lastOut } = update;

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

        // Update in/out time if provided
        if (firstIn !== undefined) {
          attendance.inTime = firstIn;
        }

        if (lastOut !== undefined) {
          attendance.outTime = lastOut;
        }

        const statusKey = getStatusFromSessions(session1, session2);

        if (statusKey) {
          attendance.status = statusKey;
        }

        // Recalculate working minutes
        if (attendance.inTime && attendance.outTime) {
          attendance.workingMinutes = Math.floor(
            (new Date(attendance.outTime) - new Date(attendance.inTime)) /
              60000,
          );
        }

        await attendance.save();

        // Save override history
        await AttendanceOverrideHistory.create({
          facultyId: attendance.facultyId._id,
          attendanceId: attendance._id,
          attendanceDate: attendance.attendanceDate,
          employeeCategory: attendance.facultyId?.employeeCategory || "",
          previousStatus,
          newStatus: attendance.status,
          previousInTime,
          previousOutTime,
          newInTime: attendance.inTime,
          newOutTime: attendance.outTime,
          reason: remarks || "Bulk update",
          changedBy: req.user._id,
          changedByRole: req.user.role,
          bulkOperationId,
        });

        const [recordSession1, recordSession2] = getSessionCodes(attendance.status);

        updatedRecords.push({
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
          status: `${recordSession1}:${recordSession2}`,
          firstIn: attendance.inTime,
          lastOut: attendance.outTime,
          session1: recordSession1,
          session2: recordSession2,
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
exports.getAttendanceOverrideHistory = async (req, res) => {
  try {
    if (req.user.role !== "hr") {
      return res.status(403).json({
        success: false,
        message: "Only HR can access this API",
      });
    }

    const history = await AttendanceOverrideHistory.find()
      .populate(
        "facultyId",
        "firstName lastName empId department employeeCategory"
      )
      .sort({ attendanceDate: 1 });

    const grouped = {};

    history.forEach((item) => {
      // Group by bulk operation + employee
      const key = item.bulkOperationId
        ? `${item.bulkOperationId}_${item.facultyId?._id}`
        : item._id.toString();

      if (!grouped[key]) {
        grouped[key] = {
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

          fromDate: item.attendanceDate,
          toDate: item.attendanceDate,

          firstIn: item.newInTime,
          lastOut: item.newOutTime,

          status: item.newStatus,
          statusCode: STATUS_CODE_MAP[item.newStatus] || null,

          overriddenOn: item.createdAt,
          remarks: item.reason,
        };
      } else {
        if (item.attendanceDate < grouped[key].fromDate) {
          grouped[key].fromDate = item.attendanceDate;
        }

        if (item.attendanceDate > grouped[key].toDate) {
          grouped[key].toDate = item.attendanceDate;
        }
      }
    });

    const data = Object.values(grouped).map((item) => ({
      employeeName: item.employeeName,
      employeeId: item.employeeId,
      department: item.department,
      employeeCategory: item.employeeCategory,

      attendanceDate:
        item.fromDate.getTime() === item.toDate.getTime()
          ? item.fromDate.toISOString().split("T")[0]
          : `${item.fromDate.toISOString().split("T")[0]} to ${
              item.toDate.toISOString().split("T")[0]
            }`,

      firstIn: item.firstIn,
      lastOut: item.lastOut,

      status: item.status,
      statusCode: item.statusCode,

      overriddenOn: item.overriddenOn,
      remarks: item.remarks,
    }));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Attendance Override History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
