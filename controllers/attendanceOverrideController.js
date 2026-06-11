const Attendance = require("../models/attendance");
const AttendanceOverrideHistory = require("../models/AttendanceOverrideHistory");

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
      .populate("facultyId", "employeeName employeeCode")
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: attendanceList.length,
      data: attendanceList,
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
      .populate("facultyId", "employeeName employeeCode")
      .sort({ attendanceDate: 1 });

    res.status(200).json({
      success: true,
      count: attendanceList.length,
      data: attendanceList,
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
    if (
      status === "Absent" &&
      (!remarks || remarks.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Reason is required when changing attendance status to Absent",
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
        (new Date(attendance.outTime) - new Date(attendance.inTime)) / 60000
      );
    }

    await attendance.save();

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

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance,
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
      inTime,
      outTime,
      status,
      remarks,
    } = req.body;

    const attendances = await Attendance.find({
      facultyId: employeeId,
      attendanceDate: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      },
    });

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

      if (inTime) attendance.inTime = inTime;
      if (outTime) attendance.outTime = outTime;
      if (status) attendance.status = status;
      if (remarks) attendance.remarks = remarks;

      await attendance.save();

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
      });

      updatedRecords.push(attendance);
    }

    res.status(200).json({
      success: true,
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

    const { fromDate, toDate, employeeId } = req.query;

    const filter = {};

    if (fromDate && toDate) {
      filter.attendanceDate = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    if (employeeId) {
      filter.facultyId = employeeId;
    }

    const history = await AttendanceOverrideHistory.find(filter)
      .populate("facultyId", "employeeName employeeCode")
      .sort({ createdAt: -1 });

    const data = history.map((item) => ({
      id: item._id,
      employeeName: item.facultyId?.employeeName,
      employeeCode: item.facultyId?.employeeCode,
      attendanceDate: item.attendanceDate,
      firstIn: item.newInTime,
      lastOut: item.newOutTime,
      status: item.newStatus,
      overriddenOn: item.createdAt,
      remarks: item.reason,
    }));

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