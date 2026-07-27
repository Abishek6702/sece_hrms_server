const Faculty = require("../models/Faculty/faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const LeaveBalance = require("../models/Leave/leaveBalance");

const deductLeaveBalance = async ({
  facultyId,
  leaveTypeId,
  leaveName,
  days,
  academicYear,
  currentMonth, // 1-12
}) => {
  try {
    // ===========================
    // Validate Inputs
    // ===========================
    if (
      !facultyId ||
      !leaveTypeId ||
      !leaveName ||
      !academicYear ||
      !days ||
      !currentMonth
    ) {
      return {
        success: false,
        message: "Missing required parameters.",
      };
    }

    if (currentMonth < 1 || currentMonth > 12) {
      return {
        success: false,
        message: "Current month must be between 1 and 12.",
      };
    }

    if (days <= 0 || !Number.isInteger(days * 2)) {
      return {
        success: false,
        message:
          "Leave days must be in 0.5-day increments (0.5, 1, 1.5, 2...).",
      };
    }

    // ===========================
    // Get Faculty
    // ===========================
    const faculty = await Faculty.findById(facultyId);

    if (!faculty) {
      return {
        success: false,
        message: "Faculty not found.",
      };
    }

    // ===========================
    // Service Eligibility
    // ===========================
    const today = new Date();

    const oneYearCompletion = new Date(faculty.doj);
    oneYearCompletion.setFullYear(oneYearCompletion.getFullYear() + 1);

    const threeYearCompletion = new Date(faculty.doj);
    threeYearCompletion.setFullYear(threeYearCompletion.getFullYear() + 3);

    if (
      leaveName === "Medical Leave" &&
      today < threeYearCompletion
    ) {
      return {
        success: false,
        message:
          "Medical Leave can only be availed after completing 3 years of service.",
      };
    }

    if (
      ["Marriage Leave", "Maternity Leave"].includes(leaveName) &&
      today < oneYearCompletion
    ) {
      return {
        success: false,
        message: `${leaveName} can only be availed after completing 1 year of service.`,
      };
    }

    // ===========================
    // Casual Leave Monthly Limit
    // ===========================
    if (leaveName === "Casual Leave") {
      const year = new Date().getFullYear();
      const month = currentMonth - 1;

      const monthStart = new Date(year, month, 1);

      const monthEnd = new Date(
        year,
        month + 1,
        0,
        23,
        59,
        59,
        999
      );

      const existingLeaves = await LeaveApplication.find({
        facultyId,
        leaveTypeId,
        status: {
          $in: ["Pending", "Approved"],
        },
        fromDate: {
          $gte: monthStart,
          $lte: monthEnd,
        },
      });

      const usedCLDays = existingLeaves.reduce(
        (sum, leave) => sum + leave.totalDays,
        0
      );

      if (usedCLDays + days > 3) {
        return {
          success: false,
          message:
            "Only 3 days of Casual Leave can be availed in a month.",
        };
      }
    }

    // ===========================
    // Leave Balance
    // ===========================
    const leaveBalance = await LeaveBalance.findOne({
      facultyId,
      leaveTypeId,
      academicYear,
    });

    if (!leaveBalance) {
      return {
        success: false,
        message: `${leaveName} balance not found.`,
      };
    }

    if (leaveBalance.remainingDays < days) {
      return {
        success: false,
        message: `Insufficient ${leaveName} balance.`,
      };
    }

    // ===========================
    // Deduct Balance
    // ===========================
    leaveBalance.usedDays += days;
    leaveBalance.remainingDays -= days;

    await leaveBalance.save();

    return {
      success: true,
      message: `${leaveName} deducted successfully.`,
      deductedDays: days,
      usedDays: leaveBalance.usedDays,
      remainingDays: leaveBalance.remainingDays,
    };
  } catch (error) {
    console.error("Deduct Leave Balance Error:", error);

    return {
      success: false,
      message: "Failed to deduct leave balance.",
      error: error.message,
    };
  }
};

module.exports = deductLeaveBalance;