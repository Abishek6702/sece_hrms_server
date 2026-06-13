const AttendanceRegularization = require("../models/AttendanceRegularization");
const User = require("../models/User");
const Faculty = require("../models/Faculty");

const requireRole = (req, role) => {
  const roles = Array.isArray(role) ? role : [role];
  if (!req.user || !roles.includes(req.user.role)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const getRequestActionLabel = (request) => {
  if (request.status === "Pending") {
    if (request.currentApprovalLevel === "hod") return "Pending HOD approval";
    if (request.currentApprovalLevel === "principal") return "Pending Principal approval";
    return "Pending";
  }

  if (request.status === "Approved") return "Approved";
  if (request.status === "Rejected") return "Rejected";
  if (request.status === "Cancelled") return "Cancelled";
  return request.status || "Unknown";
};



exports.createAttendanceRegularization = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const faculty =
      user.facultyId
        ? { _id: user.facultyId }
        : await Faculty.findOne({ user: user._id });

    const facultyId = faculty?._id;

    if (!facultyId) {
      return res.status(400).json({
        success: false,
        message: "Faculty information missing",
      });
    }

    const {
      attendanceDate,
      requestedInTime,
      requestedOutTime,
      reason,
    } = req.body;

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        message: "Attendance date is required",
      });
    }

    // ==========================
    // Prevent duplicate request for same date
    // ==========================
    const existingRequest = await AttendanceRegularization.findOne({
      facultyId,
      attendanceDate: {
        $gte: new Date(`${attendanceDate}T00:00:00.000Z`),
        $lt: new Date(`${attendanceDate}T23:59:59.999Z`),
      },
      status: {
        $in: ["Pending", "Approved"],
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance regularization request already exists for this date",
      });
    }

    // ==========================
    // Monthly limit check (3 requests)
    // ==========================
    const requestDate = new Date(attendanceDate);

    const startOfMonth = new Date(
      requestDate.getFullYear(),
      requestDate.getMonth(),
      1
    );

    const endOfMonth = new Date(
      requestDate.getFullYear(),
      requestDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const monthlyCount =
      await AttendanceRegularization.countDocuments({
        facultyId,
        attendanceDate: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
        status: {
          $in: ["Pending", "Approved"],
        },
      });

    if (monthlyCount >= 3) {
      return res.status(400).json({
        success: false,
        message:
          "Only 3 attendance regularization requests are allowed per month",
      });
    }

    // ==========================
    // Determine approval flow
    // Faculty -> HOD -> Principal
    // Dean -> Principal
    // ==========================
    let approvalLevel = "hod";

    if (req.user.role === "dean") {
      approvalLevel = "principal";
    }

    // ==========================
    // Optional attachment
    // ==========================
    let attachment = {};

    if (req.file) {
      attachment = {
        url: req.file.path,
        publicId: req.file.filename,
      };
    }

    // ==========================
    // Create request
    // ==========================
    const request = await AttendanceRegularization.create({
      facultyId,
      attendanceDate,
      requestedInTime: requestedInTime || null,
      requestedOutTime: requestedOutTime || null,
      reason,

      attachment,

      status: "Pending",
      currentApprovalLevel: approvalLevel,

      approvalHistory: [
        {
          role: req.user.role || "faculty",
          approvedBy: user._id,
          action: "Submitted",
          remarks: reason || "",
          actionDate: new Date(),
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Attendance regularization request created successfully",
      request,
    });
  } catch (error) {
    console.error("createAttendanceRegularization error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};





exports.getMyRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const requests = await AttendanceRegularization.find({
      facultyId: user.facultyId,
      status: { $ne: "Cancelled" }, // Exclude cancelled requests
    })
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "_id")
      .sort({ createdAt: -1 });

    const requestsWithAction = requests.map((request) => {
      const obj = request.toObject();
      obj.action = getRequestActionLabel(obj);
      return obj;
    });

    res.status(200).json({
      success: true,
      count: requestsWithAction.length,
      requests: requestsWithAction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getRequests = async (req, res) => {
  try {
    const query = {};
    if (req.query.currentApprovalLevel) {
      query.currentApprovalLevel = req.query.currentApprovalLevel;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    const requests = await AttendanceRegularization.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "_id")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRequestsForHod = async (req, res) => {
  try {
    requireRole(req, "hod");

    const requests = await AttendanceRegularization.find({
      currentApprovalLevel: "hod",
      status: "Pending",
    })
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "_id")
      .sort({ createdAt: -1 });

    const filtered = requests.filter((request) => request.facultyId?.department === req.user.department);

    res.status(200).json({ success: true, count: filtered.length, requests: filtered });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.getRequestsForPrincipal = async (req, res) => {
  try {
    requireRole(req, "principal");

    const { department, status } = req.query;

    let query = {};

    // Filter by status if provided
    if (status) {
      query.status = status; // Pending, Approved, Rejected
    }

    const requests = await AttendanceRegularization.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "_id")
      .sort({ createdAt: -1 });

    // Filter by department if provided
    const filteredRequests = department
      ? requests.filter(
          (request) => request.facultyId?.department === department
        )
      : requests;

    res.status(200).json({
      success: true,
      count: filteredRequests.length,
      requests: filteredRequests,
    });
  } catch (error) {
    const statusCode = error.status || 500;

    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getRequestById = async (req, res) => {
  try {
    const request = await AttendanceRegularization.findById(req.params.id)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvedBy", "firstName lastName email")
      .populate("approvalHistory.approvedBy", "_id");

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    res.status(200).json({ success: true, request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const request = await AttendanceRegularization.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    if (!request.facultyId.toString() || !user.facultyId || request.facultyId.toString() !== user.facultyId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (request.status !== "Pending" || request.currentApprovalLevel !== "hod") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests that are still with HOD can be updated",
      });
    }

    const { requestedInTime, requestedOutTime, reason } = req.body;
    if (requestedInTime !== undefined) request.requestedInTime = requestedInTime;
    if (requestedOutTime !== undefined) request.requestedOutTime = requestedOutTime;
    if (reason !== undefined) request.reason = reason;

    await request.save();

    res.status(200).json({ success: true, message: "Request updated", request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    requireRole(req, ["hod", "principal"]);
    const request = await AttendanceRegularization.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "Pending") return res.status(400).json({ success: false, message: "Request already processed" });

    const remarks = req.body.approvalRemarks || "Approved";
    const user = await User.findById(req.user.id);

    if (req.user.role === "hod") {
      if (request.currentApprovalLevel !== "hod") {
        return res.status(403).json({ success: false, message: "Request is not pending HOD approval" });
      }

      request.currentApprovalLevel = "principal";
      request.approvalRemarks = remarks;
      request.approvalHistory.push({
        role: "hod",
        approvedBy: user._id,
        action: "Approved",
        remarks,
      });

      await request.save();
      return res.status(200).json({ success: true, message: "Request approved by HOD and forwarded to Principal", request });
    }

    if (req.user.role === "principal") {
      if (request.currentApprovalLevel !== "principal") {
        return res.status(403).json({ success: false, message: "Request is not pending Principal approval" });
      }

      request.currentApprovalLevel = "completed";
      request.status = "Approved";
      request.approvedBy = req.user.id;
      request.processedAt = new Date();
      request.approvalRemarks = remarks;
      request.approvalHistory.push({
        role: "principal",
        approvedBy: user._id,
        action: "Approved",
        remarks,
      });

      await request.save();
      return res.status(200).json({ success: true, message: "Request approved by Principal", request });
    }

    res.status(403).json({ success: false, message: "You are not authorized to approve this request" });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    requireRole(req, ["hod", "principal"]);
    const request = await AttendanceRegularization.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "Pending") return res.status(400).json({ success: false, message: "Request already processed" });

    const remarks = req.body.approvalRemarks;
    if (!remarks || remarks.trim() === "") {
      return res.status(400).json({ success: false, message: "Remarks are required when rejecting a request" });
    }

    const user = await User.findById(req.user.id);

    if (req.user.role === "hod" && request.currentApprovalLevel !== "hod") {
      return res.status(403).json({ success: false, message: "Request is not pending HOD approval" });
    }
    if (req.user.role === "principal" && request.currentApprovalLevel !== "principal") {
      return res.status(403).json({ success: false, message: "Request is not pending Principal approval" });
    }

    request.currentApprovalLevel = "completed";
    request.status = "Rejected";
    request.approvedBy = req.user.id;
    request.processedAt = new Date();
    request.approvalRemarks = remarks;
    request.approvalHistory.push({
      role: req.user.role,
      approvedBy: user._id,
      action: "Rejected",
      remarks,
    });

    await request.save();
    res.status(200).json({ success: true, message: "Request rejected", request });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.cancelRequest = async (req, res) => {
  try {
    const request = await AttendanceRegularization.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Check ownership
    if (
      !user.facultyId ||
      request.facultyId.toString() !== user.facultyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Only pending requests can be withdrawn
    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be withdrawn",
      });
    }

    // Cannot withdraw after HOD approval
    if (request.currentApprovalLevel !== "hod") {
      return res.status(400).json({
        success: false,
        message: "Cannot withdraw after HOD approval",
      });
    }

    // Permanently delete the request
    await AttendanceRegularization.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Request withdrawn successfully",
    });
  } catch (error) {
    console.error("cancelRequest error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
