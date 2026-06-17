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
