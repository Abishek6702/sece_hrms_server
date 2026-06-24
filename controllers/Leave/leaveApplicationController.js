const LeaveApplication = require("../../models/Leave/leaveApplication");
const LeaveBalance = require("../../models/Leave/leaveBalance");
const LeaveType = require("../../models/Leave/leaveType");
const Faculty = require("../../models/Faculty");
const User = require("../../models/User");

const calculateLeaveDays = require("../../utils/calculateLeaveDays");
const getCurrentAcademicYear = require("../../utils/getCurrentAcademicYear");
const {
  reprocessFacultyDateRange,
} = require("../../services/reprocessFacultyDateRange");

exports.applyLeave = async (req, res) => {
  try {
    const { leaveTypeId, fromDate, toDate, leaveSession, reason } = req.body;

    // get faculty id and role from query
    const { facultyId, role } = req.query;

    if (!facultyId || !role) {
      return res.status(400).json({
        success: false,
        message: "facultyId and role are required",
      });
    }

    if (role === "principal") {
      return res.status(400).json({
        success: false,
        message: "Principal leave application is not allowed",
      });
    }

    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const leaveType = await LeaveType.findById(leaveTypeId);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found",
      });
    }

    // ADD HERE 👇👇👇
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneYearAfterJoining = new Date(faculty.doj);
    oneYearAfterJoining.setHours(0, 0, 0, 0);
    oneYearAfterJoining.setFullYear(oneYearAfterJoining.getFullYear() + 1);

    const threeYearsAfterJoining = new Date(faculty.doj);
    threeYearsAfterJoining.setHours(0, 0, 0, 0);
    threeYearsAfterJoining.setFullYear(
      threeYearsAfterJoining.getFullYear() + 3,
    );

    if (
      leaveType.leaveName === "Medical Leave" &&
      today < threeYearsAfterJoining
    ) {
      return res.status(400).json({
        success: false,
        message: "Medical Leave can be applied only after 3 years of service",
      });
    }

    if (
      leaveType.leaveName === "Maternity Leave" &&
      today < oneYearAfterJoining
    ) {
      return res.status(400).json({
        success: false,
        message: "Maternity Leave can be applied only after 1 year of service",
      });
    }

    if (
      leaveType.leaveName === "Marriage Leave" &&
      today < oneYearAfterJoining
    ) {
      return res.status(400).json({
        success: false,
        message: "Marriage Leave can be applied only after 1 year of service",
      });
    }
    // EXISTING CODE CONTINUES 👇

    const allowedPastDate = new Date(today);
    allowedPastDate.setDate(allowedPastDate.getDate() - 2);

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);

    if (startDate < allowedPastDate) {
      return res.status(400).json({
        success: false,
        message: "Leave can only be applied up to 2 days in the past",
      });
    }

    if (new Date(fromDate) > new Date(toDate)) {
      return res.status(400).json({
        success: false,
        message: "From date cannot be greater than To date",
      });
    }
    if (
      (leaveSession === "First Half" || leaveSession === "Second Half") &&
      fromDate !== toDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Half day leave can be applied only for a single day",
      });
    }

    const totalDays = await calculateLeaveDays(
      fromDate,
      toDate,
      leaveSession,
      faculty.employeeCategory,
      leaveType.sandwichRuleApplicable,
    );

    if (totalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "No working days selected",
      });
    }
    if (leaveType.leaveName === "Casual Leave") {
      const leaveMonth = new Date(fromDate).getMonth();
      const leaveYear = new Date(fromDate).getFullYear();

      const monthStart = new Date(leaveYear, leaveMonth, 1);
      const monthEnd = new Date(leaveYear, leaveMonth + 1, 0, 23, 59, 59, 999);

      const existingCLLeaves = await LeaveApplication.find({
        facultyId: faculty._id,
        status: { $in: ["Pending", "Approved"] },
        fromDate: {
          $gte: monthStart,
          $lte: monthEnd,
        },
      }).populate("leaveTypeId", "leaveName");

      const usedCLDays = existingCLLeaves
        .filter((leave) => leave.leaveTypeId?.leaveName === "Casual Leave")
        .reduce((sum, leave) => sum + (leave.totalDays || 0), 0);

      if (usedCLDays + totalDays > 3) {
        return res.status(400).json({
          success: false,
          message: "Only 3 days of Casual Leave can be availed in a month",
        });
      }
    }
    const academicYear = getCurrentAcademicYear();

    const leaveBalance = await LeaveBalance.findOne({
      facultyId: faculty._id,
      leaveTypeId,
      academicYear,
    });

    if (!leaveBalance) {
      return res.status(400).json({
        success: false,
        message: "Leave balance not found",
      });
    }

    if (
      leaveType.leaveName !== "LOP" &&
      leaveBalance.remainingDays < totalDays
    ) {
      return res.status(400).json({
        success: false,
        message: "Insufficient leave balance",
      });
    }

    const overlappingLeave = await LeaveApplication.findOne({
      facultyId: faculty._id,
      status: {
        $in: ["Pending", "Approved"],
      },
      fromDate: {
        $lte: toDate,
      },
      toDate: {
        $gte: fromDate,
      },
    });

    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: "Leave already exists for selected dates",
      });
    }

    let currentApprovalLevel = "hod";

    if (
      faculty.employeeCategory === "Driver" ||
      faculty.employeeCategory === "Housekeeping"
    ) {
      currentApprovalLevel = "supervisor";
    }

    if (role === "hod") {
      if (leaveType.leaveName === "On Duty - Research") {
        currentApprovalLevel = "dean-research";
      } else if (leaveType.leaveName === "On Duty - Examination") {
        currentApprovalLevel = "coe";
      } else {
        currentApprovalLevel = "principal";
      }
    }

    if (role?.toLowerCase().includes("dean")) {
      currentApprovalLevel = "principal";
    }

    const supportingDocuments =
      req.files?.map((file) => ({
        url: file.path,
        publicId: file.filename,
      })) || [];

    const leaveApplication = await LeaveApplication.create({
      facultyId: faculty._id,
      leaveTypeId,
      fromDate,
      toDate,
      leaveSession,
      totalDays,
      reason,
      supportingDocuments,
      currentApprovalLevel,

      approvalHistory: [
        {
          role: role,
          approvedBy: req.user.id,
          action: "Submitted",
          remarks: "Leave Applied",
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      leaveApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getLeaveApplications = async (req, res) => {
  try {
    const { department, currentApprovalLevel } = req.query;

    const query = {};

    if (currentApprovalLevel) {
      query.currentApprovalLevel = currentApprovalLevel;
    }

    const leaveApplications = await LeaveApplication.find(query)
      .populate({
        path: "facultyId",
        select: "empId firstName lastName department designation",
        match: department ? { department } : {},
      })
      .populate({
        path: "leaveTypeId",
        select: "leaveName leaveCategory",
      })
      .sort({ createdAt: -1 });

    const filteredLeaves = leaveApplications
      .filter((leave) => leave.facultyId !== null)
      .map((leave) => {
        const leaveObj = leave.toObject();

        if (
          leaveObj.status === "Pending" &&
          leaveObj.currentApprovalLevel !== "completed"
        ) {
          leaveObj.approvalHistory.push({
            role: leaveObj.currentApprovalLevel,
            action: "Pending",
            remarks: `Waiting for ${leaveObj.currentApprovalLevel} approval`,
            actionDate: null,
          });
        }

        return leaveObj;
      });

    res.status(200).json({
      success: true,
      count: filteredLeaves.length,
      leaveApplications: filteredLeaves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyLeaveApplications = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const leaveApplications = await LeaveApplication.find({
      facultyId: user.facultyId,
    })
      .populate("leaveTypeId", "leaveName")
      .sort({ createdAt: -1 });

    const formattedLeaves = leaveApplications.map((leave) => {
      const leaveObj = leave.toObject();

      if (
        leaveObj.status === "Pending" &&
        leaveObj.currentApprovalLevel !== "completed"
      ) {
        leaveObj.approvalHistory.push({
          role: leaveObj.currentApprovalLevel,
          action: "Pending",
          remarks: `Waiting for ${leaveObj.currentApprovalLevel} approval`,
          actionDate: null,
        });
      }

      return leaveObj;
    });

    res.status(200).json({
      success: true,
      count: formattedLeaves.length,
      leaveApplications: formattedLeaves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getLeaveApplicationById = async (req, res) => {
  try {
    const leaveApplication = await LeaveApplication.findById(req.params.id)
      .populate("facultyId")
      .populate("leaveTypeId");

    if (!leaveApplication) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
      });
    }

    res.status(200).json({
      success: true,
      leaveApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.cancelLeave = async (req, res) => {
  try {
    const leaveApplication = await LeaveApplication.findById(req.params.id);

    if (!leaveApplication) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
      });
    }

    const user = await User.findById(req.user.id);

    if (leaveApplication.facultyId.toString() !== user.facultyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can cancel only your own leave",
      });
    }

    if (leaveApplication.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending leave can be cancelled",
      });
    }

    if (
      leaveApplication.currentApprovalLevel !== "hod" &&
      leaveApplication.currentApprovalLevel !== "supervisor"
    ) {
      return res.status(400).json({
        success: false,
        message: "Leave cannot be cancelled after approval process has started",
      });
    }

    await LeaveApplication.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Leave cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.approveLeave = async (req, res) => {
  try {
    const remarks = req.body?.remarks || "Approved";

    const leaveApplication = await LeaveApplication.findById(
      req.params.id,
    ).populate("leaveTypeId");

    if (!leaveApplication) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
      });
    }

    if (leaveApplication.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Leave is already processed",
      });
    }

    const user = await User.findById(req.user.id);

    if (user.role !== leaveApplication.currentApprovalLevel) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to approve this leave",
      });
    }

    leaveApplication.approvalHistory.push({
      role: user.role,
      approvedBy: user._id,
      action: "Approved",
      remarks,
    });

    // HOD Approval
    if (leaveApplication.currentApprovalLevel === "hod") {
      const leaveName = leaveApplication.leaveTypeId.leaveName;

      if (leaveName === "On Duty - Research") {
        leaveApplication.currentApprovalLevel = "dean-research";
      } else if (leaveName === "On Duty - Examination") {
        leaveApplication.currentApprovalLevel = "coe";
      } else if (leaveName === "On Duty - Official") {
        leaveApplication.currentApprovalLevel = "principal";
      } else {
        leaveApplication.currentApprovalLevel = "principal";
      }
      leaveApplication.approvalStatus.hodStatus = "Approved";
    }

    // Dean Approval
    else if (leaveApplication.currentApprovalLevel === "dean-research") {
      leaveApplication.currentApprovalLevel = "dean-iqac";
      leaveApplication.approvalStatus.researchStatus = "Approved";
    }

    // COE Approval
    else if (leaveApplication.currentApprovalLevel === "coe") {
      leaveApplication.currentApprovalLevel = "dean-iqac";
      leaveApplication.approvalStatus.coeStatus = "Approved";
    }

    // IQAC Approval
    else if (leaveApplication.currentApprovalLevel === "dean-iqac") {
      leaveApplication.currentApprovalLevel = "principal";
      leaveApplication.approvalStatus.iqacStatus = "Approved";
    }

    // Supervisor Approval
    else if (leaveApplication.currentApprovalLevel === "supervisor") {
      leaveApplication.currentApprovalLevel = "principal";
    }

    // Principal Final Approval
    else if (leaveApplication.currentApprovalLevel === "principal") {
      const academicYear = getCurrentAcademicYear();

      const leaveBalance = await LeaveBalance.findOne({
        facultyId: leaveApplication.facultyId,
        leaveTypeId: leaveApplication.leaveTypeId._id,
        academicYear,
      });

      if (!leaveBalance) {
        return res.status(400).json({
          success: false,
          message: "Leave balance not found",
        });
      }

      if (leaveApplication.leaveTypeId.leaveName === "LOP") {
        leaveBalance.usedDays += leaveApplication.totalDays;
      } else {
        leaveBalance.usedDays += leaveApplication.totalDays;

        leaveBalance.remainingDays -= leaveApplication.totalDays;
      }

      await leaveBalance.save();

      leaveApplication.status = "Approved";

      leaveApplication.currentApprovalLevel = "completed";
      leaveApplication.approvalStatus.principalStatus = "Approved";
    }

    await leaveApplication.save();

    await reprocessFacultyDateRange(
      leaveApplication.facultyId,
      leaveApplication.fromDate,
      leaveApplication.toDate,
    );

    res.status(200).json({
      success: true,
      message: "Leave approved successfully",
      leaveApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.rejectLeave = async (req, res) => {
  try {
    // const { remarks } = req.body;
    const remarks = req.body?.remarks;

    if (!remarks) {
      return res.status(400).json({
        success: false,
        message: "Remarks are required for rejection",
      });
    }

    const leaveApplication = await LeaveApplication.findById(req.params.id);

    if (!leaveApplication) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
      });
    }

    if (leaveApplication.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Leave is already processed",
      });
    }

    const user = await User.findById(req.user.id);

    if (user.role !== leaveApplication.currentApprovalLevel) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reject this leave",
      });
    }

    leaveApplication.status = "Rejected";

    leaveApplication.currentApprovalLevel = "completed";

    leaveApplication.approvalHistory.push({
      role: user.role,
      approvedBy: user._id,
      action: "Rejected",
      remarks,
    });

    if (user.role === "hod") {
      leaveApplication.approvalStatus.hodStatus = "Rejected";
    }

    if (user.role === "dean-research") {
      leaveApplication.approvalStatus.researchStatus = "Rejected";
    }

    if (user.role === "coe") {
      leaveApplication.approvalStatus.coeStatus = "Rejected";
    }

    if (user.role === "dean-iqac") {
      leaveApplication.approvalStatus.iqacStatus = "Rejected";
    }

    if (user.role === "principal") {
      leaveApplication.approvalStatus.principalStatus = "Rejected";
    }

    await leaveApplication.save();

    res.status(200).json({
      success: true,
      message: "Leave rejected successfully",
      leaveApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.revokeHodApproval = async (req, res) => {
  try {
    const leave = await LeaveApplication.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
      });
    }

    if (req.user.role !== "hod") {
      return res.status(403).json({
        success: false,
        message: "Only HOD can revoke approval",
      });
    }

    if (leave.status !== "Pending" && leave.status !== "Rejected") {
      return res.status(400).json({
        success: false,
        message: "HOD can revoke only while the request is pending at HOD level",
      });
    }
    const allowedStages = [
      "dean-research",
      "coe",
      "dean-iqac",
      "principal",
      "completed",
      "rejected",
    ];
    if (!allowedStages.includes(leave.currentApprovalLevel)) {
      return res.status(400).json({
        success: false,
        message:
          "Approval cannot be revoked because higher level approval has already been given",
      });
    }
    
    // ADD HERE 👇👇👇
    
    let approvedLevel = null;
    
    if (leave.approvalStatus.researchStatus === "Approved") {
      approvedLevel = "Dean Research";
    }
    
    if (leave.approvalStatus.coeStatus === "Approved") {
      approvedLevel = "COE";
    }
    
    if (leave.approvalStatus.iqacStatus === "Approved") {
      approvedLevel = "Dean IQAC";
    }
    
    if (leave.approvalStatus.principalStatus === "Approved") {
      approvedLevel = "Principal";
    }
    
    if (approvedLevel) {
      return res.status(400).json({
        success: false,
        message: `${approvedLevel} has already approved this leave. HOD cannot revoke approval.`,
      });
    }
    
    // EXISTING CODE
    
    leave.currentApprovalLevel = "hod";
    leave.status = "Pending";
    leave.approvalStatus.hodStatus = "Pending";
    leave.approvalHistory.push({
      role: "hod",
      approvedBy: req.user.id,
      action: "Rejected",
      remarks: "HOD approval revoked",
    });

    await leave.save();

    res.status(200).json({
      success: true,
      message: "HOD approval revoked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
