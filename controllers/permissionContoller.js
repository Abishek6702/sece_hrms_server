const Permission = require("../models/permission");
const Faculty = require("../models/Faculty");
const Holiday = require("../models/holiday");

// Helper to enforce role(s)
const requireRole = (req, role) => {
  const roles = Array.isArray(role) ? role : [role];
  if (!req.user || !roles.includes(req.user.role)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const formatApprover = (approvedBy) => {
  if (!approvedBy) {
    return null;
  }

  const id = approvedBy._id ? approvedBy._id.toString() : approvedBy.toString();

  return {
    _id: id,
    firstName: approvedBy.firstName || null,
    lastName: approvedBy.lastName || null,
    empId: approvedBy.empId || null,
  };
};

const formatApprovalHistoryItem = (item) => ({
  role: item.role,
  approvedBy: formatApprover(item.approvedBy),
  action: item.action,
  remarks: item.remarks || "",
  actionDate: item.actionDate ? item.actionDate.toISOString() : null,
});

const getPendingApprovalStep = (permission) => {
  if (permission.status !== "Pending" || !permission.currentApprovalLevel) {
    return null;
  }

  const action = "Pending";
  const role = permission.currentApprovalLevel;
  const remarks = `Waiting for ${role} approval`;

  const alreadyHasPending = Array.isArray(permission.approvalHistory)
    ? permission.approvalHistory.some(
        (h) => h.role === role && h.action === action,
      )
    : false;

  if (alreadyHasPending) {
    return null;
  }

  return {
    role,
    approvedBy: null,
    action,
    remarks,
    actionDate: null,
  };
};

const formatPermission = (permission) => {
  const perm = permission.toObject ? permission.toObject() : { ...permission };

  const approvalHistory = Array.isArray(perm.approvalHistory)
    ? perm.approvalHistory.map(formatApprovalHistoryItem)
    : [];

  const pendingStep = getPendingApprovalStep(perm);
  if (pendingStep) {
    approvalHistory.push(pendingStep);
  }

  return {
    ...perm,
    approvalHistory,
  };
};

// Faculty: apply for permission
exports.applyPermission = async (req, res) => {
  try {
    const {
      permissionDate,
      permissionType,
      fromTime,
      toTime,
      totalMinutes,
      reason,
    } = req.body;

    if (!req.user || !req.user.facultyId) {
      return res.status(400).json({
        success: false,
        message: "Faculty information missing.",
      });
    }

    // Validate required fields
    if (
      !permissionDate ||
      !permissionType ||
      !fromTime ||
      !toTime ||
      !totalMinutes ||
      !reason
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }
    // normalize request date and day boundaries (local)
    const requestDate = new Date(permissionDate);
    const startOfDay = new Date(
      requestDate.getFullYear(),
      requestDate.getMonth(),
      requestDate.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      requestDate.getFullYear(),
      requestDate.getMonth(),
      requestDate.getDate(),
      23,
      59,
      59,
      999,
    );

    // =====================================
    // Prevent duplicate permission on same date (use normalized day range)
    // =====================================
    const existingPermission = await Permission.findOne({
      facultyId: req.user.facultyId,
      permissionDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ["Pending", "Approved"] },
    });

    if (existingPermission) {
      return res.status(400).json({
        success: false,
        message: "Permission has already been applied for the selected date.",
      });
    }

    // =====================================
    // New validations:
    // 1) Block permissions on active holidays
    // 2) Prevent permission if faculty has permission in previous 2 days
    // 3) Monthly window limit: 26th -> 25th (2 hours / 120 minutes)
    // =====================================

    // 1) Holiday check
    const holiday = await Holiday.findOne({
      holidayDate: { $gte: startOfDay, $lte: endOfDay },
      isActive: true,
    });

    if (holiday) {
      return res.status(400).json({
        success: false,
        message: `Permission cannot be applied on holiday: ${holiday.holidayName}`,
      });
    }

    // NOTE: weekend check removed — permissions allowed any day unless holiday

    // 3) Block permission dates older than the previous 2 days; future dates remain allowed
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const allowedStart = new Date(todayStart);
    allowedStart.setDate(allowedStart.getDate() - 2); // start of day (today - 2)

    if (startOfDay < allowedStart) {
      return res.status(400).json({
        success: false,
        message:
          "Permission cannot be applied for dates earlier than the previous 2 days. Applications are allowed only within the last 2 days from today.",
      });
    }

    // 4) Permission date must fall in the current 26th -> 25th window
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

    const { start: currentWindowStart, end: currentWindowEnd } =
      getCurrentWindowRange(now);
    if (startOfDay < currentWindowStart || startOfDay > currentWindowEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Permission can only be applied for dates between the 26th of the current month and the 25th of the next month.",
      });
    }

    // 5) Monthly window (26th -> 25th): compute window containing requestDate
    const getWindowRange = (date) => {
      const y = date.getFullYear();
      const m = date.getMonth();

      if (date.getDate() >= 26) {
        const start = new Date(y, m, 26, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 25, 23, 59, 59, 999);
        return { start, end };
      } else {
        const start = new Date(y, m - 1, 26, 0, 0, 0, 0);
        const end = new Date(y, m, 25, 23, 59, 59, 999);
        return { start, end };
      }
    };

    const { start: windowStart, end: windowEnd } = getWindowRange(requestDate);

    const monthlyPermissions = await Permission.find({
      facultyId: req.user.facultyId,
      status: { $in: ["Pending", "Approved"] },
      permissionDate: { $gte: windowStart, $lte: windowEnd },
    });

    const totalMinutesUsed = monthlyPermissions.reduce(
      (sum, permission) => sum + (permission.totalMinutes || 0),
      0,
    );

    if (totalMinutesUsed + Number(totalMinutes) > 120) {
      return res.status(400).json({
        success: false,
        message:
          "Monthly permission limit exceeded for the 26th-25th window. Only 2 hours (120 minutes) are allowed per window.",
      });
    }

    // Determine the first approval stage based on who applies
    const currentApprovalLevel =
      req.user.role === "hod"
        ? "principal"
        : req.user.role === "dean"
          ? "principal"
          : "hod";

    // =====================================
    // Create permission request
    // =====================================
    const permission = await Permission.create({
      facultyId: req.user.facultyId,
      permissionDate,
      permissionType,
      fromTime,
      toTime,
      totalMinutes,
      reason,

      status: "Pending",
      currentApprovalLevel,

      approvalHistory: [
        {
          role: req.user.role || "faculty",
          approvedBy: req.user.facultyId,
          action: "Submitted",
          remarks: "Permission Applied",
          actionDate: new Date(),
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Permission applied successfully.",
      data: permission,
    });
  } catch (error) {
    console.error("applyPermission error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Faculty: list own permissions
exports.getMyPermissions = async (req, res) => {
  try {
    if (!req.user || !req.user.facultyId) {
      return res.status(400).json({
        success: false,
        message: "Faculty information missing.",
      });
    }

    const permissions = await Permission.find({
      facultyId: req.user.facultyId,
    })
      .populate("facultyId", "employeeName employeeCode department")
      .populate("approvalHistory.approvedBy", "firstName lastName empId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions.map(formatPermission),
    });
  } catch (error) {
    console.error("getMyPermissions error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// HOD: list permissions for department

exports.getPermissionsForHod = async (req, res) => {
  try {
    requireRole(req, "hod");

    const dept = req.user.department;

    const permissions = await Permission.find({
      currentApprovalLevel: "hod",
      status: "Pending",
    })
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName empId")
      .sort({ createdAt: -1 });


    const filtered = permissions.filter(
      (p) => p.facultyId && p.facultyId.department === dept,
    );

    return res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered.map(formatPermission),
    });
  } catch (error) {
    console.error("getPermissionsForHod error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Dean: list permissions submitted by dean
exports.getPermissionsForDean = async (req, res) => {
  try {
    requireRole(req, "dean");

    const { department } = req.query;

    const query = {
      $or: [
        { currentApprovalLevel: "dean" },
        { "approvalHistory.role": "dean" },
      ],
      status: { $in: ["Pending", "Approved", "Rejected"] },
    };

    const permissions = await Permission.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName empId")
      .sort({ createdAt: -1 });

    const filteredPermissions = department
      ? permissions.filter((p) => p.facultyId?.department === department)
      : permissions;

    return res.json({
      success: true,
      count: filteredPermissions.length,
      data: filteredPermissions.map(formatPermission),
    });
  } catch (error) {
    console.error("getPermissionsForDean error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Principal: list pending and approved permissions for principal-level requests
exports.getPermissionsForPrincipal = async (req, res) => {
  try {
    requireRole(req, "principal");

    const { department } = req.query;
    const query = {
      $or: [
        { currentApprovalLevel: "principal" },
        { "approvalHistory.role": "principal" },
      ],
      status: { $in: ["Pending", "Approved", "Rejected"] },
    };

    const permissions = await Permission.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName empId")
      .sort({ createdAt: -1 });

    // Filter by department if provided
    const filteredPermissions = department
      ? permissions.filter((p) => p.facultyId?.department === department)
      : permissions;

    return res.json({
      success: true,
      count: filteredPermissions.length,
      data: filteredPermissions.map(formatPermission),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// View single permission
exports.getPermissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const perm = await Permission.findById(id)
      .populate("facultyId", "firstName lastName department empId")
      .populate("approvalHistory.approvedBy", "firstName lastName empId");
    if (!perm)
      return res
        .status(404)
        .json({ success: false, message: "Permission not found" });
    return res.json({ success: true, data: formatPermission(perm) });
  } catch (error) {
    console.error("getPermissionById error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Principal &hod: approve permission

exports.approvePermission = async (req, res) => {
  try {
    requireRole(req, ["hod", "principal"]);

    const { id } = req.params;
    const { remarks } = req.body;

    const perm = await Permission.findById(id);

    if (!perm) {
      return res.status(404).json({
        success: false,
        message: "Permission not found",
      });
    }

    // Prevent duplicate approval/rejection
    if (perm.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Permission already ${perm.status}`,
      });
    }

    // HOD approval
    if (req.user.role === "hod") {
      if (perm.currentApprovalLevel !== "hod") {
        return res.status(400).json({
          success: false,
          message: "HOD approval already completed",
        });
      }

      perm.currentApprovalLevel = "principal";
      perm.remarks = remarks || "Forwarded to Principal";

      perm.approvalHistory.push({
        role: "hod",
        approvedBy: req.user.facultyId,
        action: "Approved",
        remarks: remarks || "Approved by HOD",
        actionDate: new Date(),
      });
    }

    // Principal approval
    else if (req.user.role === "principal") {
      if (perm.currentApprovalLevel !== "principal") {
        return res.status(400).json({
          success: false,
          message: "Waiting for HOD approval",
        });
      }

      perm.status = "Approved";
      perm.approvedBy = req.user.facultyId;
      perm.approvedAt = new Date();
      perm.remarks = remarks || "Approved";

      perm.approvalHistory.push({
        role: "principal",
        approvedBy: req.user.facultyId,
        action: "Approved",
        remarks: remarks || "Approved by Principal",
        actionDate: new Date(),
      });
    }

    await perm.save();

    return res.status(200).json({
      success: true,
      data: perm,
    });
  } catch (error) {
    console.error("approvePermission error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Principal: reject permission
exports.rejectPermission = async (req, res) => {
  try {
    requireRole(req, ["hod", "principal"]);

    const { id } = req.params;
    const { remarks } = req.body;

    const perm = await Permission.findById(id);

    if (!perm) {
      return res.status(404).json({
        success: false,
        message: "Permission not found",
      });
    }

    // Prevent duplicate action
    if (perm.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Permission already ${perm.status}`,
      });
    }

    if (!remarks || remarks.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Reason is required when rejecting permission",
      });
    }

    perm.status = "Rejected";
    perm.approvedBy = req.user.facultyId;
    perm.approvedAt = new Date();
    perm.remarks = remarks;

    perm.approvalHistory.push({
      role: req.user.role,
      approvedBy: req.user.facultyId,
      action: "Rejected",
      remarks,
      actionDate: new Date(),
    });

    await perm.save();

    return res.json({
      success: true,
      data: perm,
    });
  } catch (error) {
    console.error("rejectPermission error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Faculty: cancel permission (self)
exports.cancelPermission = async (req, res) => {
  try {
    const { id } = req.params;
    const perm = await Permission.findById(id);
    if (!perm)
      return res
        .status(404)
        .json({ success: false, message: "Permission not found" });

    if (
      !req.user.facultyId ||
      perm.facultyId.toString() !== req.user.facultyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this permission",
      });
    }

    if (perm.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending permissions can be cancelled",
      });
    }

    // Delete the permission record from database
    await Permission.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Permission cancelled and deleted successfully",
    });
  } catch (error) {
    console.error("cancelPermission error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Faculty: get permission card for current month (dashboard card)
exports.getPermissionCard = async (req, res) => {
  try {
    if (!req.user || !req.user.facultyId) {
      return res
        .status(400)
        .json({ success: false, message: "Faculty information missing." });
    }

    // Use 26th -> 25th window for dashboard card (approved only)
    const now = new Date();
    const getWindowRange = (date) => {
      const y = date.getFullYear();
      const m = date.getMonth();

      if (date.getDate() >= 26) {
        const start = new Date(y, m, 26, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 25, 23, 59, 59, 999);
        return { start, end };
      } else {
        const start = new Date(y, m - 1, 26, 0, 0, 0, 0);
        const end = new Date(y, m, 25, 23, 59, 59, 999);
        return { start, end };
      }
    };

    const { start: windowStart, end: windowEnd } = getWindowRange(now);

    // Fetch only approved permissions for current 26->25 window
    const allPerms = await Permission.find({
      facultyId: req.user.facultyId,
      status: "Approved",
      permissionDate: {
        $gte: windowStart,
        $lte: windowEnd,
      },
    });

    // Calculate total minutes taken
    let totalMinutesTaken = 0;
    allPerms.forEach((perm) => {
      totalMinutesTaken += perm.totalMinutes || 0;
    });

    // Convert minutes to hours (rounded to 1 decimal)
    const hoursTaken = Math.round((totalMinutesTaken / 60) * 10) / 10;

    // Total permission allowed per month is 2 hours
    const totalPermissionHours = 2;
    const remainingHours = Math.max(0, totalPermissionHours - hoursTaken);

    return res.json({
      success: true,
      data: {
        totalPermission: totalPermissionHours,
        permissionTaken: hoursTaken,
        remainingPermission: remainingHours,
        window: `${windowStart.toLocaleDateString()} - ${windowEnd.toLocaleDateString()}`,
        unit: "Hours",
      },
    });
  } catch (error) {
    console.error("getPermissionCard error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
