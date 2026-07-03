const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const Permission = require("../models/permission");
const AttendanceRegularization = require("../models/AttendanceRegularization");
const Attendance = require("../models/attendance");

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

exports.getAttendanceList = async (req, res) => {
  try {
    const {
      search,
      department,
      employeeCategory,
      date,
      fromDate,
      toDate,
      status,
    } = req.query;

    const attendanceFilter = {};

    // Date Filter
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      attendanceFilter.attendanceDate = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Date Range Filter
    if (fromDate && toDate) {
      const startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);

      attendanceFilter.attendanceDate = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    // Faculty Filters
    const facultyFilter = {
      employmentStatus: true,
    };

    if (department) {
      facultyFilter.department = department;
    }

    if (employeeCategory) {
      facultyFilter.employeeCategory = employeeCategory;
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

    // ==========================
    // NOT CHECKED IN
    // ==========================
    if (status === "Not Checked In") {
      if (!date) {
        return res.status(400).json({
          success: false,
          message: "Date is required for Not Checked In filter",
        });
      }

      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      const checkedInFacultyIds = await Attendance.find({
        attendanceDate: {
          $gte: startDate,
          $lt: endDate,
        },
        inTime: {
          $ne: null,
        },
      }).distinct("facultyId");

      facultyFilter._id = {
        $nin: checkedInFacultyIds,
      };

      const employees = await Faculty.find(facultyFilter)
        .populate({
          path: "shiftId",
          select: "shiftName startTime endTime graceTime workingMinutes",
        })
        .lean();

      const formattedEmployees = employees.map((emp) => ({
        facultyId: emp._id,

        shiftID: emp.shiftId?._id,
        shiftName: emp.shiftId?.shiftName,
        startTime: emp.shiftId?.startTime,
        endTime: emp.shiftId?.endTime,
        graceTime: emp.shiftId?.graceTime,

        empId: emp.empId,

        employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),

        department: emp.department,

        designation: emp.designation,

        employeeCategory: emp.employeeCategory,

        attendanceDate: startDate,

        inTime: null,

        outTime: null,

        workingMinutes: 0,

        workingHours: "0h 0m",

        status: "Not Checked In",
      }));

      return res.status(200).json({
        success: true,
        count: formattedEmployees.length,
        totalCount: formattedEmployees.length,
        attendance: formattedEmployees,
      });
    }

    // ==========================
    // NORMAL ATTENDANCE
    // ==========================

    if (status) {
      attendanceFilter.status = status;
    }

    if (department || employeeCategory || search) {
      const faculties = await Faculty.find(facultyFilter)
        .select("_id")
        .lean();

      attendanceFilter.facultyId = {
        $in: faculties.map((f) => f._id),
      };
    }

    const attendance = await Attendance.find(attendanceFilter)
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

    const formattedAttendance = attendance.map((item) => ({
      _id: item._id,

      facultyId: item.facultyId?._id,

      shiftID: item.facultyId?.shiftId?._id,
      shiftName: item.facultyId?.shiftId?.shiftName,
      startTime: item.facultyId?.shiftId?.startTime,
      endTime: item.facultyId?.shiftId?.endTime,
      graceTime: item.facultyId?.shiftId?.graceTime,

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

      status: item.status,
    }));

    const totalCount = await Attendance.countDocuments(attendanceFilter);

    return res.status(200).json({
      success: true,
      count: formattedAttendance.length,
      totalCount,
      attendance: formattedAttendance,
    });
  } catch (error) {
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
