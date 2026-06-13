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

  //On Duty
  "On Duty": "OD:OD",

  //Optional half-day OD statuses
  "First Half OD": "OD:P",
  "Second Half OD": "P:OD",
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

    let startDate, endDate;
    // If date is YYYY-MM-DD treat it as UTC day to avoid timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      startDate = new Date(`${date}T00:00:00.000Z`);
      endDate = new Date(`${date}T23:59:59.999Z`);
    } else {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    }

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

      let session1 = "";
      let session2 = "";

      switch (attendance.status) {
        case "Present":
          session1 = "P";
          session2 = "P";
          break;

        case "Absent":
          session1 = "A";
          session2 = "A";
          break;

        case "Half Day":
          session1 = "A";
          session2 = "P";
          break;

        case "First Half Leave":
          session1 = "L";
          session2 = "P";
          break;

        case "Second Half Leave":
          session1 = "P";
          session2 = "L";
          break;

        case "Leave":
          session1 = "L";
          session2 = "L";
          break;

        case "Holiday":
          session1 = "H";
          session2 = "H";
          break;

        case "On Duty":
          session1 = "OD";
          session2 = "OD";
          break;

        case "First Half OD":
          session1 = "OD";
          session2 = "P";
          break;

        case "Second Half OD":
          session1 = "P";
          session2 = "OD";
          break;

        default:
          session1 = "";
          session2 = "";
      }

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
    const { startDate, endDate } = req.query;

    const filter = {
      facultyId: employeeId,
    };

    if (startDate && endDate) {
      filter.attendanceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const attendanceList = await Attendance.find(filter)
      .populate(
  "facultyId",
  "firstName lastName empId department employeeCategory"
)
      .sort({ attendanceDate: 1 });

    const data = attendanceList.map((attendance) => {
      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const employeeNo = attendance.facultyId?.empId || "";

      let session1 = "";
      let session2 = "";

      switch (attendance.status) {
        case "Present":
          session1 = "P";
          session2 = "P";
          break;

        case "Absent":
          session1 = "A";
          session2 = "A";
          break;

        case "Half Day":
          session1 = "A";
          session2 = "P";
          break;

        case "First Half Leave":
          session1 = "L";
          session2 = "P";
          break;

        case "Second Half Leave":
          session1 = "P";
          session2 = "L";
          break;

        case "Leave":
          session1 = "L";
          session2 = "L";
          break;

        case "Holiday":
          session1 = "H";
          session2 = "H";
          break;

        case "On Duty":
          session1 = "OD";
          session2 = "OD";
          break;

        case "First Half OD":
          session1 = "OD";
          session2 = "P";
          break;

        case "Second Half OD":
          session1 = "P";
          session2 = "OD";
          break;

        default:
          session1 = "";
          session2 = "";
      }

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

    const SESSION_STATUS_MAP = {
      "P:P": "Present",
      "A:A": "Absent",
      "A:P": "Half Day",
      "L:P": "First Half Leave",
      "P:L": "Second Half Leave",
      "L:L": "Leave",
      "H:H": "Holiday",
      "OD:OD": "On Duty",
      "OD:P": "First Half OD",
      "P:OD": "Second Half OD",
    };

    // Date range: normalize YYYY-MM-DD to UTC day boundaries to match stored UTC dates
    let startDate, endDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      startDate = new Date(`${date}T00:00:00.000Z`);
      endDate = new Date(`${date}T23:59:59.999Z`);
    } else {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    }

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

    // Determine new status from sessions
    const newStatus =
      SESSION_STATUS_MAP[`${session1}:${session2}`] || attendance.status;

    // Require reason when marking Absent
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
      const statusKey = `${session1}:${session2}`;

      if (SESSION_STATUS_MAP[statusKey]) {
        attendance.status = SESSION_STATUS_MAP[statusKey];
      }
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

    let responseSession1 = "";
    let responseSession2 = "";

    switch (attendance.status) {
      case "Present":
        responseSession1 = "P";
        responseSession2 = "P";
        break;

      case "Absent":
        responseSession1 = "A";
        responseSession2 = "A";
        break;

      case "Half Day":
        responseSession1 = "A";
        responseSession2 = "P";
        break;

      case "First Half Leave":
        responseSession1 = "L";
        responseSession2 = "P";
        break;

      case "Second Half Leave":
        responseSession1 = "P";
        responseSession2 = "L";
        break;

      case "Leave":
        responseSession1 = "L";
        responseSession2 = "L";
        break;

      case "Holiday":
        responseSession1 = "H";
        responseSession2 = "H";
        break;

      default:
        responseSession1 = "";
        responseSession2 = "";
      case "On Duty":
        responseSession1 = "OD";
        responseSession2 = "OD";
        break;
      case "First Half OD":
        responseSession1 = "OD";
        responseSession2 = "P";
        break;
      case "Second Half OD":
        responseSession1 = "P";
        responseSession2 = "OD";
        break;
    }

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

    const {
      employeeId,
      fromDate,
      toDate,
      firstIn,
      lastOut,
      session1,
      session2,
      remarks,
    } = req.body;

    const SESSION_STATUS_MAP = {
      "P:P": "Present",
      "A:A": "Absent",
      "A:P": "Half Day",
      "L:P": "First Half Leave",
      "P:L": "Second Half Leave",
      "L:L": "Leave",
      "H:H": "Holiday",
      "OD:OD": "On Duty",
      "OD:P": "First Half OD",
      "P:OD": "Second Half OD",
    };

    const bulkOperationId = new mongoose.Types.ObjectId().toString();

    const attendances = await Attendance.find({
      facultyId: employeeId,
      attendanceDate: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      },
    }).sort({ attendanceDate: 1 });

    if (!attendances.length) {
      return res.status(404).json({
        success: false,
        message: "No attendance records found",
      });
    }

    const updatedRecords = [];

    for (const attendance of attendances) {
      const previousStatus = attendance.status;
      const previousInTime = attendance.inTime;
      const previousOutTime = attendance.outTime;

      // Update values
      if (firstIn !== undefined) {
        attendance.inTime = firstIn;
      }

      if (lastOut !== undefined) {
        attendance.outTime = lastOut;
      }

      if (session1 !== undefined && session2 !== undefined) {
        const statusKey = `${session1}:${session2}`;

        if (SESSION_STATUS_MAP[statusKey]) {
          attendance.status = SESSION_STATUS_MAP[statusKey];
        }
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

      await attendance.populate(
        "facultyId",
        "firstName lastName empId department employeeCategory",
      );

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

      const employeeName = attendance.facultyId
        ? [attendance.facultyId.firstName, attendance.facultyId.lastName]
            .filter(Boolean)
            .join(" ")
        : "";

      const employeeNo = attendance.facultyId?.empId || "";
      const department = attendance.facultyId?.department || "";

      let responseSession1 = "";
      let responseSession2 = "";

      switch (attendance.status) {
        case "Present":
          responseSession1 = "P";
          responseSession2 = "P";
          break;
        case "Absent":
          responseSession1 = "A";
          responseSession2 = "A";
          break;
        case "Half Day":
          responseSession1 = "A";
          responseSession2 = "P";
          break;
        case "First Half Leave":
          responseSession1 = "L";
          responseSession2 = "P";
          break;
        case "Second Half Leave":
          responseSession1 = "P";
          responseSession2 = "L";
          break;
        case "Leave":
          responseSession1 = "L";
          responseSession2 = "L";
          break;
        case "Holiday":
          responseSession1 = "H";
          responseSession2 = "H";
          break;
      }

      updatedRecords.push({
        _id: attendance._id,
        employeeId: attendance.facultyId._id,
        employeeName,
        employeeNo,
        department,
        employeeCategory,

        date: attendance.attendanceDate,
        shiftCode: attendance.shiftCode || "S2",

        status: `${responseSession1}:${responseSession2}`,
        statusCode: STATUS_CODE_MAP[attendance.status] || null,

        firstIn: attendance.inTime,
        lastOut: attendance.outTime,

        session1: responseSession1,
        session2: responseSession2,
      });
    }

    res.status(200).json({
      success: true,
      bulkOperationId,
      count: updatedRecords.length,
      data: updatedRecords,
    });
  } catch (error) {
    console.error("Bulk Update Error:", error);

    res.status(500).json({
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
        "firstName lastName empId department employeeCategory",
      )
      .sort({ attendanceDate: 1 });

    const grouped = {};

    history.forEach((item) => {
      // For bulk update use bulkOperationId
      // For single update use document id
      const key = item.bulkOperationId || item._id.toString();

      if (!grouped[key]) {
        grouped[key] = {
          employeeName:
            item.facultyId &&
            (item.facultyId.firstName || item.facultyId.lastName)
              ? `${item.facultyId.firstName || ""} ${item.facultyId.lastName || ""}`.trim()
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
      statusCode: item.statusCode || null,
      overriddenOn: item.overriddenOn,

      remarks: item.remarks,
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Attendance Override History Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
