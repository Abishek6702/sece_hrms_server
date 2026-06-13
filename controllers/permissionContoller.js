const Permission = require("../models/permission");
const Faculty = require("../models/Faculty");

// Helper to enforce role(s)
const requireRole = (req, role) => {
  const roles = Array.isArray(role) ? role : [role];
  if (!req.user || !roles.includes(req.user.role)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
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

    // =====================================
    // Prevent duplicate permission on same date
    // =====================================
    const existingPermission = await Permission.findOne({
      facultyId: req.user.facultyId,
      permissionDate: {
        $gte: new Date(`${permissionDate}T00:00:00.000Z`),
        $lt: new Date(`${permissionDate}T23:59:59.999Z`),
      },
      status: {
        $in: ["Pending", "Approved"],
      },
    });

    if (existingPermission) {
      return res.status(400).json({
        success: false,
        message: "Permission request already exists for this date.",
      });
    }

    // =====================================
    // Monthly limit: 2 hours (120 minutes)
    // Count only principal-approved permissions
    // =====================================
    const requestDate = new Date(permissionDate);

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

    const approvedPermissions = await Permission.find({
      facultyId: req.user.facultyId,
      status: "Approved",
      permissionDate: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });

    const totalMinutesUsed = approvedPermissions.reduce(
      (sum, permission) => sum + (permission.totalMinutes || 0),
      0
    );

    if (totalMinutesUsed + Number(totalMinutes) > 120) {
      return res.status(400).json({
        success: false,
        message:
          "Monthly permission limit exceeded. Only 2 hours (120 minutes) are allowed per month.",
      });
    }

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
      currentApprovalLevel: "hod",

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
      .populate(
        "approvalHistory.approvedBy",
        "employeeName employeeCode"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions,
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
      status: "Pending",
      currentApprovalLevel: "hod",
    })
      .populate(
        "facultyId",
        "firstName lastName department empId"
      )
      .sort({ createdAt: -1 });

    const filtered = permissions.filter(
      (p) =>
        p.facultyId &&
        p.facultyId.department === dept
    );

    return res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error("getPermissionsForHod error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};



// Principal: list pending permissions only
exports.getPermissionsForPrincipal = async (req, res) => {
  try {
    requireRole(req, "principal");

    const { department } = req.query;

    let query = {};

    const permissions = await Permission.find(query)
      .populate("facultyId", "firstName lastName department empId")
      .sort({ createdAt: -1 });

    // Filter by department if provided
    const filteredPermissions = department
      ? permissions.filter(
          p => p.facultyId?.department === department
        )
      : permissions;

    return res.json({
      success: true,
      count: filteredPermissions.length,
      data: filteredPermissions,
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
    const perm = await Permission.findById(id).populate(
      "facultyId",
      "firstName lastName department empId",
    );
    if (!perm)
      return res
        .status(404)
        .json({ success: false, message: "Permission not found" });
    return res.json({ success: true, data: perm });
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

    // Get current month start and end dates
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    // Fetch only approved permissions for current month
    const allPerms = await Permission.find({
      facultyId: req.user.facultyId,
      status: "Approved",
      permissionDate: {
        $gte: startOfMonth,
        $lte: endOfMonth,
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
        month: now.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        unit: "Hours",
      },
    });
  } catch (error) {
    console.error("getPermissionCard error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
