    const LeaveApplication = require("../../models/Leave/leaveApplication");
    const LeaveBalance = require("../../models/Leave/leaveBalance");
    const LeaveType = require("../../models/Leave/leaveType");
    const Faculty = require("../../models/Faculty");
    const User = require("../../models/User");

    const calculateLeaveDays = require("../../utils/calculateLeaveDays");
    const getCurrentAcademicYear = require("../../utils/getCurrentAcademicYear");

    exports.applyLeave = async (req, res) => {
      try {
        const { leaveTypeId, fromDate, toDate, leaveSession, reason } = req.body;

        const user = await User.findById(req.user.id);

        if (user.role === "principal") {
          return res.status(400).json({
            success: false,
            message: "Principal leave application is not allowed",
          });
        }

        if (!user || !user.facultyId) {
          return res.status(404).json({
            success: false,
            message: "Faculty not found",
          });
        }

        const faculty = await Faculty.findById(user.facultyId);

        const leaveType = await LeaveType.findById(leaveTypeId);

        if (!leaveType) {
          return res.status(404).json({
            success: false,
            message: "Leave type not found",
          });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

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

        if (user.role === "hod") {
          currentApprovalLevel = "principal";
        }

        if (user.role === "dean") {
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
              role: user.role,
              approvedBy: user._id,
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
          .populate("leaveTypeId", "leaveName")
          .sort({ createdAt: -1 });

        const filteredLeaves = leaveApplications.filter(
          (leave) => leave.facultyId !== null,
        );

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
          .sort({
            createdAt: -1,
          });

        res.status(200).json({
          success: true,
          count: leaveApplications.length,
          leaveApplications,
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
            leaveApplication.currentApprovalLevel = "dean";
          } else if (leaveName === "On Duty - Exam") {
            leaveApplication.currentApprovalLevel = "coe";
          } else if (leaveName === "On Duty - Official") {
            leaveApplication.currentApprovalLevel = "principal";
          } else {
            leaveApplication.currentApprovalLevel = "principal";
          }
        }

        // Dean Approval
        else if (leaveApplication.currentApprovalLevel === "dean") {
          leaveApplication.currentApprovalLevel = "iqac";
        }

        // COE Approval
        else if (leaveApplication.currentApprovalLevel === "coe") {
          leaveApplication.currentApprovalLevel = "iqac";
        }

        // IQAC Approval
        else if (leaveApplication.currentApprovalLevel === "iqac") {
          leaveApplication.currentApprovalLevel = "principal";
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
        }

        await leaveApplication.save();

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

        if (leave.status !== "Pending") {
          return res.status(400).json({
            success: false,
            message: "Leave already processed",
          });
        }
        const allowedStages = [
          "dean",
          "coe",
          "principal",
        ];
        if (
          !allowedStages.includes(
            leave.currentApprovalLevel,
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Approval cannot be revoked because higher level approval has already been given",
          });
        }

        leave.currentApprovalLevel = "hod";

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
