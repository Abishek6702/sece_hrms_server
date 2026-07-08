const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const Permission = require("../models/permission");
const AttendanceRegularization = require("../models/AttendanceRegularization");
const Attendance = require("../models/attendance");
const Shift = require("../models/shift");

exports.getFacultyDesignationSummary = async (req, res) => {
  try {
    const { department } = req.query;

    const match = {
      employmentStatus: true,
    };

    if (department) {
      match.department = department;
    }

    const designations = await Faculty.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$employeeCategory", "Teaching"] },
              "$designation",
              "Non Teaching",
            ],
          },
          count: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          designation: "$_id",
          count: 1,
        },
      },
      {
        $sort: {
          designation: 1,
        },
      },
    ]);

    const totalFaculty = designations.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    return res.status(200).json({
      success: true,
      department: department || "All",
      totalFaculty,
      designations,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch faculty designation summary",
    });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const [leaveCount, permissionCount, regularizationCount] =
      await Promise.all([
        LeaveApplication.countDocuments({
          status: "Pending",
          currentApprovalLevel: "principal",
        }),

        Permission.countDocuments({
          status: "Pending",
          currentApprovalLevel: "principal",
        }),

        AttendanceRegularization.countDocuments({
          status: "Pending",
          currentApprovalLevel: "principal",
        }),
      ]);

    const totalPending = leaveCount + permissionCount + regularizationCount;

    return res.status(200).json({
      success: true,
      totalPending,
      data: {
        leave: leaveCount,
        permission: permissionCount,
        regularization: regularizationCount,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending approvals",
    });
  }
};

exports.getTodayPunchSummary = async (req, res) => {
  try {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalStaff = await Faculty.countDocuments({
      employmentStatus: true,
    });

    const punchedIn = await Attendance.countDocuments({
      attendanceDate: {
        $gte: today,
        $lt: tomorrow,
      },
      inTime: { $ne: null },
    });

    const notPunchedIn = totalStaff - punchedIn;

    return res.status(200).json({
      success: true,
      totalStaff,
      punchedIn,
      notPunchedIn,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch punch summary",
    });
  }
};

exports.getAttendanceDashboardSummary = async (req, res) => {
  try {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);

    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalStaff = await Faculty.countDocuments({
      employmentStatus: true,
    });

    const checkedInToday = await Attendance.countDocuments({
      attendanceDate: {
        $gte: today,
        $lt: tomorrow,
      },
      inTime: {
        $ne: null,
      },
    });

    const notCheckedInToday = totalStaff - checkedInToday;

    return res.status(200).json({
      success: true,
      totalStaff,
      checkedInToday,
      notCheckedInToday,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getRecentFaculty = async (req, res) => {
  try {
    const faculties = await Faculty.find()
      .sort({ createdAt: -1 }) // Newest first
      .limit(7)
      .select(
        "empId salutation firstName lastName designation department organizationEmail phone createdAt"
      );

    res.status(200).json({
      success: true,
      count: faculties.length,
      faculties,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAttendanceList = async (req, res) => {
  try {
    const {
      search,
      department,
      employeeCategory,
      fromDate,
      toDate,
      status,
      shiftName,
    } = req.query;

    // =============================
    // Validate Date Range
    // =============================

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate and toDate are required.",
      });
    }

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    // =============================
    // Faculty Filter
    // =============================

    const facultyFilter = {
      employmentStatus: true,
    };

    if (department) {
      facultyFilter.department = department;
    }

    if (employeeCategory) {
      facultyFilter.employeeCategory = employeeCategory;
    }

    if (shiftName) {
      const Shift = require("../models/shift");
      const shift = await Shift.findOne({ shiftName });
      if (shift) {
        facultyFilter.shiftId = shift._id;
      }
    }

    if (search) {
      facultyFilter.$or = [
        {
          firstName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          lastName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          empId: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Get Faculty IDs

    const faculties = await Faculty.find(facultyFilter)
      .populate({
        path: "shiftId",
        select: "shiftName startTime endTime graceTime workingMinutes",
      })
      .lean();

    const facultyIds = faculties.map((f) => f._id);

    // =============================
    // Handle "Not Checked In" Status
    // =============================

    if (status === "Not Checked In") {
      const checkedInFacultyIds = await Attendance.find({
        facultyId: {
          $in: facultyIds,
        },
        attendanceDate: {
          $gte: startDate,
          $lte: endDate,
        },
        inTime: {
          $ne: null,
        },
      }).distinct("facultyId");

      const notCheckedInFaculties = faculties.filter(
        (f) => !checkedInFacultyIds.some((id) => id.equals(f._id))
      );

      const formattedEmployees = notCheckedInFaculties.map((emp) => ({
        _id: emp._id,
        facultyId: emp._id,
        shiftID: emp.shiftId?._id,
        shiftName: emp.shiftId?.shiftName,
        startTime: emp.shiftId?.startTime,
        endTime: emp.shiftId?.endTime,
        graceTime: emp.shiftId?.graceTime || 0,
        empId: emp.empId,
        employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
        department: emp.department,
        designation: emp.designation,
        employeeCategory: emp.employeeCategory,
        fromDate: startDate,
        toDate: endDate,
        inTime: null,
        outTime: null,
        workingMinutes: 0,
        workingHours: "0h 0m",
        lateMinutes: 0,
        status: "Not Checked In",
      }));

      return res.status(200).json({
        success: true,
        totalRecords: formattedEmployees.length,
        count: formattedEmployees.length,
        filters: {
          search: search || null,
          department: department || null,
          employeeCategory: employeeCategory || null,
          fromDate: startDate,
          toDate: endDate,
          status: status || null,
          shiftName: shiftName || null,
        },
        attendance: formattedEmployees,
      });
    }

    // =============================
    // Build Attendance Filter
    // =============================

    const attendanceFilter = {
      facultyId: {
        $in: facultyIds,
      },
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
      inTime: { $ne: null }, // Must have check-in to determine status
    };

    // Handle different statuses
    if (status && status !== "Late" && status !== "Late Checked In") {
      if (status === "Checked In") {
        // Already filtered by inTime above
      } else if (status === "Present") {
        attendanceFilter.status = "Present";
      } else if (status === "Absent") {
        attendanceFilter.status = "Absent";
      } else if (status === "Leave") {
        attendanceFilter.status = {
          $in: [
            "Leave",
            "First Half Leave",
            "Second Half Leave",
            "Holiday",
          ],
        };
      }
    }

    // =============================
    // Get Attendance Records
    // =============================

    let attendance = await Attendance.find(attendanceFilter)
      .populate({
        path: "facultyId",
        select:
          "empId firstName lastName department designation employeeCategory shiftId",
        populate: {
          path: "shiftId",
          select: "shiftName startTime endTime graceTime workingMinutes",
        },
      })
      .sort({
        attendanceDate: -1,
      })
      .lean();

    // =============================
    // Format Attendance Data with Late Calculation
    // =============================

    const formattedAttendance = attendance
      .map((item) => {
        const shiftStartTime = item.facultyId?.shiftId?.startTime;
        const graceTime = item.facultyId?.shiftId?.graceTime || 0;
        let lateMinutes = 0;
        let isLate = false;

        // Calculate if employee is late
        if (item.inTime && shiftStartTime) {
          try {
            const inTimeDate = new Date(item.inTime);
            const [shiftHours, shiftMinutes] = shiftStartTime
              .split(":")
              .map(Number);

            // Create shift start time using the same date and timezone as inTime
            const shiftStart = new Date(inTimeDate);
            shiftStart.setHours(shiftHours, shiftMinutes, 0, 0);

            // Add grace time (in minutes)
            const shiftStartWithGrace = new Date(
              shiftStart.getTime() + graceTime * 60000
            );

            // Round down inTime to nearest minute (ignore seconds for comparison)
            const inTimeRounded = new Date(inTimeDate);
            inTimeRounded.setSeconds(0, 0); // Set seconds and milliseconds to 0

            // Compare actual check-in time with shift start + grace time
            // Only mark as late if check-in is STRICTLY after the grace deadline (by at least 1 full minute)
            if (inTimeRounded > shiftStartWithGrace) {
              lateMinutes = Math.floor(
                (inTimeRounded - shiftStartWithGrace) / 60000
              );
              isLate = true;

              // // Only log employees who are late
              // console.log(`\n🔴 LATE - Employee: ${item.facultyId?.empId}`);
              // console.log(`   InTime: ${inTimeDate.toISOString()}`);
              // console.log(`   Shift: ${shiftStartTime}, Grace: ${graceTime}min`);
              // console.log(`   Deadline (with grace): ${shiftStartWithGrace.toISOString()}`);
              // console.log(`   Late Minutes: ${lateMinutes}\n`);
            }
          } catch (err) {
            console.error("Error calculating late time:", err);
          }
        }

        return {
          _id: item._id,
          facultyId: item.facultyId?._id,
          shiftID: item.facultyId?.shiftId?._id,
          shiftName: item.facultyId?.shiftId?.shiftName,
          startTime: item.facultyId?.shiftId?.startTime,
          endTime: item.facultyId?.shiftId?.endTime,
          graceTime: item.facultyId?.shiftId?.graceTime || 0,
          empId: item.facultyId?.empId || "",
          employeeName: `${item.facultyId?.firstName || ""} ${
            item.facultyId?.lastName || ""
          }`.trim(),
          department: item.facultyId?.department || "",
          designation: item.facultyId?.designation || "",
          employeeCategory: item.facultyId?.employeeCategory || "",
          attendanceDate: item.attendanceDate,
          inTime: item.inTime,
          outTime: item.outTime,
          workingMinutes: item.workingMinutes || 0,
          workingHours: `${Math.floor(
            (item.workingMinutes || 0) / 60
          )}h ${(item.workingMinutes || 0) % 60}m`,
          lateMinutes: lateMinutes,
          status: status === "Late" || status === "Late Checked In" ? "Late Checked In" : item.status,
          isLate: isLate,
          isOverridden: item.isOverridden || false,
          regularization: item.regularization || false,
        };
      })
      .filter((item) => {
        // Filter by late status if specified
        if (status === "Late" || status === "Late Checked In") {
          // console.log(`Late Filter - Employee: ${item.empId}, isLate: ${item.isLate}, lateMinutes: ${item.lateMinutes}`);
          return item.isLate;
        }
        return true;
      });

    // console.log(`Total Records after Late Filter: ${formattedAttendance.length}`);

    return res.status(200).json({
      success: true,
      totalRecords: formattedAttendance.length,
      count: formattedAttendance.length,
      filters: {
        search: search || null,
        department: department || null,
        employeeCategory: employeeCategory || null,
        fromDate: startDate,
        toDate: endDate,
        status: status || null,
        shiftName: shiftName || null,
      },
      attendance: formattedAttendance,
    });
  } catch (error) {
    console.error("Error in getAttendanceList:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch attendance list",
    });
  }
};


