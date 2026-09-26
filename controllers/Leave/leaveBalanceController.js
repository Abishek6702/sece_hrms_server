const LeaveBalance = require("../../models/Leave/leaveBalance");
const User = require("../../models/User");
const resetLeaveBalances = require("../../services/resetLeaveBalances");
const resetSemesterLeaveBalances = require("../../services/resetSemesterLeaveBalances");

exports.getLeaveBalances = async (req, res) => {
  try {
    const balances = await LeaveBalance.find()
      .populate("facultyId")
      .populate("leaveTypeId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: balances.length,
      balances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getFacultyLeaveBalances = async (req, res) => {
  try {
    const { facultyId } = req.params;

    const balances = await LeaveBalance.find({
      facultyId,
    })
      .populate("facultyId")
      .populate("leaveTypeId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: balances.length,
      balances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyLeaveBalances = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.facultyId) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const balances = await LeaveBalance.find({
      facultyId: user.facultyId,
    })
      .populate("facultyId")
      .populate("leaveTypeId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: balances.length,
      balances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.resetAcademicYear = async (req, res) => {
  try {
    await resetLeaveBalances();

    res.status(200).json({
      success: true,
      message: "Academic year balances generated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.resetSemester = async (req, res) => {
  try {
    await resetSemesterLeaveBalances();

    res.status(200).json({
      success: true,
      message: "Semester leave balances reset successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyLeaveDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.facultyId) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const balances = await LeaveBalance.find({
      facultyId: user.facultyId,
    }).populate("leaveTypeId", "leaveName");

    const leaveBalances = balances.map((balance) => ({
      leaveType: balance.leaveTypeId?.leaveName,
      available: balance.remainingDays,
      used: balance.usedDays,
    }));

    res.status(200).json({
      success: true,
      leaveBalances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateLeaveBalance = async (req, res) => {
  try {
    const { id } = req.params;

    const { allocatedDays, usedDays, remainingDays } = req.body;

    const leaveBalance = await LeaveBalance.findById(id);

    if (!leaveBalance) {
      return res.status(404).json({
        success: false,
        message: "Leave balance not found",
      });
    }

    const updates = { allocatedDays, usedDays, remainingDays };
    for (const [field, value] of Object.entries(updates)) {
      if (
        value !== undefined &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a non-negative number`,
        });
      }
    }

    const nextAllocatedDays = allocatedDays ?? leaveBalance.allocatedDays;
    const nextUsedDays = usedDays ?? leaveBalance.usedDays;
    const nextRemainingDays = nextAllocatedDays - nextUsedDays;

    if (nextRemainingDays < 0) {
      return res.status(400).json({
        success: false,
        message: "Allocated days cannot be less than used days",
      });
    }

    if (remainingDays !== undefined && remainingDays !== nextRemainingDays) {
      return res.status(400).json({
        success: false,
        message: "Remaining days must equal allocated days minus used days",
      });
    }

    if (allocatedDays !== undefined || usedDays !== undefined) {
      leaveBalance.allocatedDays = nextAllocatedDays;
      leaveBalance.usedDays = nextUsedDays;
      leaveBalance.remainingDays = nextRemainingDays;
    }

    await leaveBalance.save();

    res.status(200).json({
      success: true,
      message: "Leave balance updated successfully",
      leaveBalance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
