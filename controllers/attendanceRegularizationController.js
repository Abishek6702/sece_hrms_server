const AttendanceRegularization = require("../models/AttendanceRegularization");
const Attendance = require("../models/attendance");
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

const formatApprover = (approvedBy) => {
  if (!approvedBy) return null;

  return {
    _id: approvedBy._id ? approvedBy._id.toString() : approvedBy.toString(),
    firstName: approvedBy.firstName || null,
    lastName: approvedBy.lastName || null,
    empId: null, // will try to resolve below if faculty record exists
  };
};

const formatApprovalHistoryItem = async (item) => {
  const base = {
    role: item.role,
    approvedBy: null,
    action: item.action,
    remarks: item.remarks || "",
    actionDate: item.actionDate ? item.actionDate.toISOString() : null,
  };

  if (!item.approvedBy) return base;

  // approvedBy is a User document (populated). Try to include empId from Faculty if available
  const approverUser = item.approvedBy;
  const approver = formatApprover(approverUser);

  if (approverUser.facultyId) {
    try {
      const fac = await Faculty.findById(approverUser.facultyId).select("empId");
      if (fac && fac.empId) approver.empId = fac.empId;
    } catch (e) {
      // ignore
    }
  }

  base.approvedBy = approver;

  return base;
};

const getPendingApprovalStep = (request) => {
  if (request.status !== "Pending" || !request.currentApprovalLevel) return null;

  const role = request.currentApprovalLevel;
  const action = "Pending";
  const remarks = `Waiting for ${role} approval`;

  const alreadyHasPending = Array.isArray(request.approvalHistory)
    ? request.approvalHistory.some((h) => h.role === role && h.action === action)
    : false;

  if (alreadyHasPending) return null;

  return {
    role,
    approvedBy: null,
    action,
    remarks,
    actionDate: null,
  };
};

const formatRequest = async (request) => {
  const reqObj = request.toObject ? request.toObject() : { ...request };

  const history = Array.isArray(reqObj.approvalHistory) ? reqObj.approvalHistory : [];
  const formattedHistory = await Promise.all(history.map(formatApprovalHistoryItem));

  const pending = getPendingApprovalStep(reqObj);
  if (pending) formattedHistory.push(pending);

  return {
    ...reqObj,
    approvalHistory: formattedHistory,
  };
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
    // Permit requests only inside the current 26th-to-25th window
    // ==========================
    const today = new Date();
    const getCurrentWindowRange = (date) => {
      const y = date.getFullYear();
      const m = date.getMonth();

      if (date.getDate() >= 26) {
        return {
          start: new Date(y, m, 26, 0, 0, 0, 0),
          end: new Date(y, m + 1, 25, 23, 59, 59, 999),
        };
      }

      return {
        start: new Date(y, m - 1, 26, 0, 0, 0, 0),
        end: new Date(y, m, 25, 23, 59, 59, 999),
      };
    };

    const { start: currentWindowStart, end: currentWindowEnd } = getCurrentWindowRange(today);
    const attendanceDateObj = new Date(attendanceDate);
    if (Number.isNaN(attendanceDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance date",
      });
    }

    if (attendanceDateObj < currentWindowStart || attendanceDateObj > currentWindowEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance regularization can only be applied for dates between the 26th of the current month and the 25th of the next month.",
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
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId")
      .sort({ createdAt: -1 });

    const formatted = await Promise.all(
      requests.map(async (request) => {
        const obj = await formatRequest(request);
        obj.action = getRequestActionLabel(obj);
        return obj;
      }),
    );

    res.status(200).json({
      success: true,
      count: formatted.length,
      requests: formatted,
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
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId")
      .sort({ createdAt: -1 });

    const formatted = await Promise.all(requests.map(formatRequest));

    res.status(200).json({ success: true, count: formatted.length, requests: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRequestsForHod = async (req, res) => {
  try {
    requireRole(req, "hod");

    // HOD sees:
    // 1) Pending requests awaiting their approval (currentApprovalLevel: "hod", status: "Pending")
    // 2) Requests they approved and forwarded (status: "Pending", currentApprovalLevel: "principal", HOD approved in history)
    // 3) Requests they rejected (status: "Rejected" with HOD rejection in history)
    const requests = await AttendanceRegularization.find({
      $or: [
        { status: "Pending", currentApprovalLevel: "hod" },
        {
          status: "Pending",
          currentApprovalLevel: "principal",
          approvalHistory: { $elemMatch: { role: "hod", action: "Approved" } },
        },
        {
          status: "Rejected",
          approvalHistory: { $elemMatch: { role: "hod", action: "Rejected" } },
        },
      ],
    })
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId")
      .sort({ createdAt: -1 });

    // Filter by HOD's department
    const filtered = requests.filter(
      (request) => request.facultyId?.department === req.user.department,
    );

    const formatted = await Promise.all(filtered.map(formatRequest));

    res.status(200).json({ success: true, count: formatted.length, requests: formatted });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// Dean: list requests submitted by dean
exports.getRequestsForDean = async (req, res) => {
  try {
    requireRole(req, "dean");

    const { department, status } = req.query;

    const query = {
      "approvalHistory.0.role": "dean",
    };

    if (status) query.status = status;

    const requests = await AttendanceRegularization.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId")
      .sort({ createdAt: -1 });
    const filtered = department
      ? requests.filter((request) => request.facultyId?.department === department)
      : requests;

    const formatted = await Promise.all(filtered.map(formatRequest));

    res.status(200).json({ success: true, count: formatted.length, requests: formatted });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.getRequestsForPrincipal = async (req, res) => {
  try {
    requireRole(req, "principal");

    const { department, status } = req.query;

    // Show records pending principal approval OR already approved/rejected by principal
    let query = {
      $or: [
        { currentApprovalLevel: "principal" }, // Pending principal approval
        { currentApprovalLevel: "completed", status: { $in: ["Approved", "Rejected"] } } // Approved or Rejected by principal
      ]
    };

    // Filter by status if provided
    if (status) {
      query.$or.forEach(condition => {
        condition.status = status;
      });
    }

    const requests = await AttendanceRegularization.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId")
      .sort({ createdAt: -1 });

    // Filter by department if provided
    const filteredRequests = department
      ? requests.filter((request) => request.facultyId?.department === department)
      : requests;

    const formatted = await Promise.all(filteredRequests.map(formatRequest));

    res.status(200).json({
      success: true,
      count: formatted.length,
      requests: formatted,
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
      .populate("approvalHistory.approvedBy", "firstName lastName facultyId");

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    const formatted = await formatRequest(request);

    res.status(200).json({ success: true, request: formatted });
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

      const attendanceDate = new Date(request.attendanceDate);
      const startOfDay = new Date(Date.UTC(
        attendanceDate.getUTCFullYear(),
        attendanceDate.getUTCMonth(),
        attendanceDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ));
      const endOfDay = new Date(Date.UTC(
        attendanceDate.getUTCFullYear(),
        attendanceDate.getUTCMonth(),
        attendanceDate.getUTCDate(),
        23,
        59,
        59,
        999,
      ));

      const attendance = await Attendance.findOne({
        facultyId: request.facultyId,
        attendanceDate: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });
// console.log("Attendance found for regularization:", attendance);
      if (attendance) {
        attendance.regularization = true;
        attendance.regularizationRemarks = request.reason || remarks;
        attendance.regularizationStatus = "Present";
        await attendance.save();
      }

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
