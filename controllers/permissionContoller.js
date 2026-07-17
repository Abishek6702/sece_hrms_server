const Permission = require("../models/permission");
const Faculty = require("../models/Faculty");
const Holiday = require("../models/holiday");
const {
  incrementPermissionBalanceOnApproval,
} = require("../services/permissionBalanceService");

// Helper to enforce role(s)
const requireRole = (req, role) => {
  const roles = Array.isArray(role) ? role : [role];
  if (!req.user) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  // Normalize roles for comparison (map new dean variants to "dean")
  const userRole = req.user.role;
  const deanRoles = ["dean", "dean-academics", "dean-iqac", "dean-research"];
  const normalizedUserRole = deanRoles.includes(userRole) ? "dean" : userRole;
  const normalizedRoles = roles.map(r => (deanRoles.includes(r) ? "dean" : r));

  if (!normalizedRoles.includes(normalizedUserRole)) {
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

const normalizeDepartment = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
};

const getLevenshteinDistance = (left, right) => {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => []);

  for (let i = 0; i <= left.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
};

const matchesDepartment = (requestedDepartment, facultyDepartment) => {
  const normalizedRequested = normalizeDepartment(requestedDepartment);
  const normalizedFaculty = normalizeDepartment(facultyDepartment);

  if (!normalizedRequested || !normalizedFaculty) {
    return false;
  }

  if (normalizedRequested === normalizedFaculty) {
    return true;
  }

  if (normalizedRequested.length <= 3 || normalizedFaculty.length <= 3) {
    return getLevenshteinDistance(normalizedRequested, normalizedFaculty) <= 1;
  }

  return (
    getLevenshteinDistance(normalizedRequested, normalizedFaculty) <= 2 ||
    normalizedRequested.includes(normalizedFaculty) ||
    normalizedFaculty.includes(normalizedRequested)
  );
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

const getApprovalStatus = (permission) => {
  const status = {
    hod: null,
    principal: null,
  };

  const approvalHistory = Array.isArray(permission.approvalHistory)
    ? permission.approvalHistory
    : [];

  const hodDecision = approvalHistory.find(
    (item) => item.role === "hod" && ["Approved", "Rejected"].includes(item.action),
  );

  const principalDecision = approvalHistory.find(
    (item) =>
      ["principal", "dean"].includes(item.role) &&
      ["Approved", "Rejected"].includes(item.action),
  );

  if (permission.status === "Pending") {
    if (permission.currentApprovalLevel === "hod") {
      status.hod = "Pending";
      status.principal = null;
    } else if (permission.currentApprovalLevel === "principal") {
      status.hod = hodDecision?.action || "Approved";
      status.principal = "Pending";
    }
  } else if (permission.status === "Approved") {
    status.hod = hodDecision?.action || "Approved";
    status.principal = "Approved";
  } else if (permission.status === "Rejected") {
    if (principalDecision) {
      status.hod = hodDecision?.action || "Approved";
      status.principal = principalDecision.action;
    } else {
      status.hod = hodDecision?.action || "Rejected";
      status.principal = null;
    }
  }

  return status;
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
    approvalStatus: getApprovalStatus(perm),
  };
};

// Faculty: apply for permission
exports.applyPermission = async (req, res, next) => {
  try {
    const {
      permissionDate,
      permissionType,
      slot,
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
      !slot ||
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

    // // 3) Block permission dates older than the previous 2 days; future dates remain allowed
    // const now = new Date();
    // const todayStart = new Date(
    //   now.getFullYear(),
    //   now.getMonth(),
    //   now.getDate(),
    //   0,
    //   0,
    //   0,
    //   0,
    // );
    // const allowedStart = new Date(todayStart);
    // allowedStart.setDate(allowedStart.getDate() - 2); // start of day (today - 2)

    // if (startOfDay < allowedStart) {
    //   return res.status(400).json({
    //     success: false,
    //     message:
    //       "Permission cannot be applied for dates earlier than the previous 2 days. Applications are allowed only within the last 2 days from today.",
    //   });
    // }

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
    const deanRoles = ["dean", "dean-academics", "dean-iqac", "dean-research"];
    const currentApprovalLevel =
      req.user.role === "hod"
        ? "principal"
        : deanRoles.includes(req.user.role)
          ? "principal"
          : "hod";

    // =====================================
    // Create permission request
    // =====================================
    const permission = await Permission.create({
      facultyId: req.user.facultyId,
      permissionDate,
      permissionType,
      slot,
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

exports.matchesDepartment = matchesDepartment;

exports.getPermissionsForHod = async (req, res) => {
  try {
    requireRole(req, "hod");

    const { department } = req.params;

    if (!department) {
      return res.status(400).json({
        success: false,
        message: "Department is required",
      });
    }

    const departments = department
      .split(",")
      .map((dept) => normalizeDepartment(dept));

    const permissions = await Permission.find({
      $or: [
        {
          currentApprovalLevel: "hod",
          status: "Pending",
        },
        {
          approvalHistory: {
            $elemMatch: {
              role: "hod",
              action: {
                $in: ["Approved", "Rejected"],
              },
            },
          },
        },
      ],
    })
      .populate(
        "facultyId",
        "firstName lastName department empId",
      )
      .populate(
        "approvalHistory.approvedBy",
        "firstName lastName empId",
      )
      .sort({ createdAt: -1 });

    const filtered = permissions.filter((p) => {
      if (!p.facultyId) {
        return false;
      }

      const facultyDepartment =
        p.facultyId.department || p.facultyId.originalDepartment;

      return departments.some((requestedDepartment) =>
        matchesDepartment(requestedDepartment, facultyDepartment),
      );
    });

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

    // Resolve approver ID: use facultyId if available, otherwise use User ID
    const approverId = req.user.facultyId || req.user._id;

    // Resolve role for approval history (map dean variants to "dean")
    const deanRoles = ["dean", "dean-academics", "dean-iqac", "dean-research"];
    const approvalRole = deanRoles.includes(req.user.role) ? "dean" : req.user.role;

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
        approvedBy: approverId,
        action: "Approved",
        remarks: remarks || "Approved by HOD",
        actionDate: new Date(),
      });
    }

    // Principal or dean approval
    else if (req.user.role === "principal" || deanRoles.includes(req.user.role)) {
      if (perm.currentApprovalLevel !== "principal") {
        return res.status(400).json({
          success: false,
          message: "Waiting for HOD approval",
        });
      }

      perm.status = "Approved";
      perm.approvedBy = approverId;
      perm.approvedAt = new Date();
      perm.remarks = remarks || "Approved";

      perm.approvalHistory.push({
        role: approvalRole,
        approvedBy: approverId,
        action: "Approved",
        remarks: remarks || "Approved by " + (approvalRole === "dean" ? "Dean" : "Principal"),
        actionDate: new Date(),
      });

      await incrementPermissionBalanceOnApproval(
        perm.facultyId,
        perm.totalMinutes,
        perm.permissionDate,
      );
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

    // Resolve approver ID: use facultyId if available, otherwise use User ID
    const approverId = req.user.facultyId || req.user._id;

    // Resolve role for approval history (map dean variants to "dean")
    const deanRoles = ["dean", "dean-academics", "dean-iqac", "dean-research"];
    const rejectionRole = deanRoles.includes(req.user.role) ? "dean" : req.user.role;

    perm.status = "Rejected";
    perm.approvedBy = approverId;
    perm.approvedAt = new Date();
    perm.remarks = remarks;

    perm.approvalHistory.push({
      role: rejectionRole,
      approvedBy: approverId,
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
exports.revokePermissionByHod = async (req, res) => {
  try {
    requireRole(req, "hod");

    const { id } = req.params;

    const permission = await Permission.findById(id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: "Permission not found",
      });
    }

    // Only permissions waiting for Principal
    if (
      permission.status !== "Pending" ||
      permission.currentApprovalLevel !== "principal"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only permissions pending at Principal can be recalled",
      });
    }

    // Move back to HOD and record the revoke event
    permission.currentApprovalLevel = "hod";
    permission.approvalHistory.push({
      role: "hod",
      approvedBy: req.user.facultyId || req.user._id,
      action: "Revoked",
      remarks: "HOD approval revoked and returned to HOD",
      actionDate: new Date(),
    });

    await permission.save();

    return res.status(200).json({
      success: true,
      message: "Permission moved back to HOD pending",
      data: permission,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
    });
  }
};