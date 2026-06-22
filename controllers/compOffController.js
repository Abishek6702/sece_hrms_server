const CompOffRequest = require("../models/CompOffRequest");
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const LeaveBalance = require("../models/Leave/leaveBalance");
const LeaveType = require("../models/Leave/leaveType");
const getCurrentAcademicYear = require("../utils/getCurrentAcademicYear");

exports.createCompOffRequest = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const faculty = await Faculty.findById(user.facultyId);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    let currentApprovalLevel = "hod";

    if (user.role === "hod") {
      currentApprovalLevel = "principal";
    }

    if (user.role === "dean") {
      currentApprovalLevel = "principal";
    }

    const { workedFromDate, workedToDate, compOffDays, reason } = req.body;

    if (new Date(workedFromDate) > new Date(workedToDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid worked date range",
      });
    }
    const supportingDocuments =
      req.files?.map((file) => ({
        url: file.path,
        publicId: file.filename,
      })) || [];
    const request = await CompOffRequest.create({
      facultyId: faculty._id,

      workedFromDate,

      workedToDate,

      compOffDays,

      reason,
      supportingDocuments,
      currentApprovalLevel,
      approvalHistory: [
        {
          role: user.role,
          approvedBy: req.user.id,
          action: "Submitted",
          remarks: "Comp Off Requested",
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Comp Off request created successfully",
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyCompOffRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const requests = await CompOffRequest.find({
      facultyId: user.facultyId,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCompOffRequests = async (req, res) => {
  try {
    const { department, currentApprovalLevel } = req.query;

    const filter = {};

    if (currentApprovalLevel) {
      filter.currentApprovalLevel = currentApprovalLevel;
    }

    let requests = await CompOffRequest.find(filter)
      .populate({
        path: "facultyId",
        match: department ? { department } : {},
      })
      .sort({ createdAt: -1 });

    // Remove records where faculty didn't match department
    if (department) {
      requests = requests.filter((request) => request.facultyId);
    }

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCompOffRequestById = async (req, res) => {
  try {
    const request = await CompOffRequest.findById(req.params.id)
      .populate("facultyId")
      .populate("approvalHistory.approvedBy");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.approveCompOff = async (req, res) => {
  try {
    const request = await CompOffRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Request already processed",
      });
    }

    const role = req.user.role;

    if (request.currentApprovalLevel === "hod" && role === "hod") {
      request.approvalHistory.push({
        role: "hod",
        approvedBy: req.user.id,
        action: "Approved",
      });

      request.currentApprovalLevel = "principal";

      await request.save();

      return res.status(200).json({
        success: true,
        message: "Approved by HOD",
      });
    }

    if (request.currentApprovalLevel === "principal" && role === "principal") {
      const compOffLeave = await LeaveType.findOne({
        leaveName: "Comp Off",
      });

      if (!compOffLeave) {
        return res.status(404).json({
          success: false,
          message: "Comp Off leave type not found",
        });
      }

      const academicYear = getCurrentAcademicYear();

      const balance = await LeaveBalance.findOne({
        facultyId: request.facultyId,
        leaveTypeId: compOffLeave._id,
        academicYear,
      });

      if (!balance) {
        return res.status(404).json({
          success: false,
          message: "Comp Off balance not found",
        });
      }

      balance.allocatedDays += request.compOffDays;

      balance.remainingDays += request.compOffDays;

      await balance.save();

      request.status = "Approved";

      request.currentApprovalLevel = "completed";

      request.approvalHistory.push({
        role: "principal",
        approvedBy: req.user.id,
        action: "Approved",
      });

      await request.save();

      return res.status(200).json({
        success: true,
        message: "Comp Off approved and credited",
      });
    }

    return res.status(403).json({
      success: false,
      message: "Not authorized",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.rejectCompOff = async (req, res) => {
  try {
    const { reason } = req.body;

    const request = await CompOffRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    if (!["hod", "principal"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Request already processed",
      });
    }

    request.status = "Rejected";
    request.currentApprovalLevel = "completed";

    request.approvalHistory.push({
      role: req.user.role,
      approvedBy: req.user.id,
      action: "Rejected",
      remarks: reason,
    });

    await request.save();

    res.status(200).json({
      success: true,
      message: "Request rejected successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.withdrawCompOff = async (req, res) => {
  try {
    const request = await CompOffRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const user = await User.findById(req.user.id);

    if (request.facultyId.toString() !== user.facultyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be withdrawn",
      });
    }

    if (request.currentApprovalLevel !== "hod") {
      return res.status(400).json({
        success: false,
        message: "Cannot withdraw after HOD approval",
      });
    }

    await CompOffRequest.findByIdAndDelete(request._id);

    res.status(200).json({
      success: true,
      message: "Comp Off request withdrawn successfully",
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
    const request = await CompOffRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (req.user.role !== "hod") {
      return res.status(403).json({
        success: false,
        message: "Only HOD can revoke approval",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Request already processed",
      });
    }

    if (request.currentApprovalLevel !== "principal") {
      return res.status(400).json({
        success: false,
        message: "Only requests pending at principal can be revoked",
      });
    }

    request.currentApprovalLevel = "hod";

    request.approvalHistory.push({
      role: "hod",
      approvedBy: req.user.id,
      action: "Rejected",
      remarks: "HOD approval revoked",
    });

    await request.save();

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
