const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");

const STATUS_CODE_MAP = {
  "Present": "P:P",
  "Absent": "A:A",
  "First Half Leave": "A:P",
  "Second Half Leave": "P:A",
  "Leave": "L:L",
  "Holiday": "H:H",
  "Missed Punch": "M:M",
  "Half Day": "A:P",
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

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const attendanceList = await Attendance.find({
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate("facultyId", "firstName lastName empId department")
      .sort({ createdAt: 1 });

    const data = attendanceList.map((a) => {
      const obj = a.toObject ? a.toObject() : a;
      obj.statusCode = STATUS_CODE_MAP[obj.status] || null;
      return obj;
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
      .populate("facultyId", "firstName lastName empId department")
      .sort({ attendanceDate: 1 });

    const data = attendanceList.map((a) => {
      const obj = a.toObject ? a.toObject() : a;
      obj.statusCode = STATUS_CODE_MAP[obj.status] || null;
      return obj;
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
    const { inTime, outTime, status, remarks } = req.body;

    // Date range
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

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

    // Require reason when marking Absent
    if (status === "Absent" && (!remarks || remarks.trim() === "")) {
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
    if (inTime !== undefined) {
      attendance.inTime = inTime;
    }

    if (outTime !== undefined) {
      attendance.outTime = outTime;
    }

    if (status !== undefined) {
      attendance.status = status;
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

    // ensure faculty details are populated on the saved document
    await attendance.populate("facultyId", "firstName lastName empId department");

    // Save override history
    await AttendanceOverrideHistory.create({
      facultyId: attendance.facultyId,
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

    const result = attendance.toObject ? attendance.toObject() : attendance;
    result.statusCode = STATUS_CODE_MAP[result.status] || null;

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: result,
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

    const { employeeId, fromDate, toDate, inTime, outTime, status, remarks } =
      req.body;

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

      if (inTime !== undefined) attendance.inTime = inTime;
      if (outTime !== undefined) attendance.outTime = outTime;
      if (status !== undefined) attendance.status = status;
      if (remarks !== undefined) attendance.remarks = remarks;

      await attendance.save();

      // ensure faculty details are populated on the saved document
      await attendance.populate("facultyId", "firstName lastName empId department");

      await AttendanceOverrideHistory.create({
        facultyId: attendance.facultyId,
        attendanceId: attendance._id,
        attendanceDate: attendance.attendanceDate,

        previousStatus,
        newStatus: attendance.status,

        previousInTime,
        previousOutTime,

        newInTime: attendance.inTime,
        newOutTime: attendance.outTime,

        reason: remarks || "Bulk update",

        changedBy: req.user._id,
        changedByRole: req.user.role,

        // IMPORTANT
        bulkOperationId,
      });

      const obj = attendance.toObject ? attendance.toObject() : attendance;
      obj.statusCode = STATUS_CODE_MAP[obj.status] || null;
      updatedRecords.push(obj);
    }

    res.status(200).json({
      success: true,
      bulkOperationId,
      count: updatedRecords.length,
      data: updatedRecords,
    });
  } catch (error) {
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
        "firstName lastName empId department"
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
            item.facultyId && (item.facultyId.firstName || item.facultyId.lastName)
              ? `${item.facultyId.firstName || ""} ${item.facultyId.lastName || ""}`.trim()
              : "",
          employeeId: item.facultyId?.empId || "",
          department: item.facultyId?.department || "",

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
