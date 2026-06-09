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
		const { permissionDate, permissionType, fromTime, toTime, totalMinutes, reason } = req.body;

		if (!req.user || !req.user.facultyId) {
			return res.status(400).json({ success: false, message: "Faculty information missing." });
		}

		const permission = await Permission.create({
			facultyId: req.user.facultyId,
			permissionDate,
			permissionType,
			fromTime,
			toTime,
			totalMinutes,
			reason,
		});

		return res.status(201).json({ success: true, data: permission });
	} catch (error) {
		console.error("applyPermission error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
};

// Faculty: list own permissions
exports.getMyPermissions = async (req, res) => {
	try {
		if (!req.user || !req.user.facultyId) {
			return res.status(400).json({ success: false, message: "Faculty information missing." });
		}

		const perms = await Permission.find({ facultyId: req.user.facultyId }).sort({ createdAt: -1 });
		return res.json({ success: true, data: perms });
	} catch (error) {
		console.error("getMyPermissions error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
};

// HOD: list permissions for department
exports.getPermissionsForHod = async (req, res) => {
	try {
		requireRole(req, "hod");

		// fetch permissions populated with faculty details and filter by department
		const all = await Permission.find().populate("facultyId", "firstName lastName department empId").sort({ createdAt: -1 });

		const dept = req.user.department;
		const filtered = all.filter((p) => p.facultyId && p.facultyId.department === dept);

		return res.json({ success: true, data: filtered });
	} catch (error) {
		console.error("getPermissionsForHod error:", error);
		const status = error.status || 500;
		return res.status(status).json({ success: false, message: error.message || "Server error" });
	}
};

// Principal: list all permissions
exports.getPermissionsForPrincipal = async (req, res) => {
	try {
		requireRole(req, "principal");

		const all = await Permission.find().populate("facultyId", "firstName lastName department empId").sort({ createdAt: -1 });
		return res.json({ success: true, data: all });
	} catch (error) {
		console.error("getPermissionsForPrincipal error:", error);
		const status = error.status || 500;
		return res.status(status).json({ success: false, message: error.message || "Server error" });
	}
};

// View single permission
exports.getPermissionById = async (req, res) => {
	try {
		const { id } = req.params;
		const perm = await Permission.findById(id).populate("facultyId", "firstName lastName department empId");
		if (!perm) return res.status(404).json({ success: false, message: "Permission not found" });
		return res.json({ success: true, data: perm });
	} catch (error) {
		console.error("getPermissionById error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
};

// HOD / Principal: approve permission
exports.approvePermission = async (req, res) => {
	try {
		requireRole(req, ["hod", "principal"]);
		const { id } = req.params;
		const { remarks } = req.body;

		const perm = await Permission.findById(id);
		if (!perm) return res.status(404).json({ success: false, message: "Permission not found" });

		perm.status = "Approved";
		perm.approvedBy = req.user.facultyId;
		perm.approvedAt = new Date();
		if (remarks) perm.remarks = remarks;
		await perm.save();

		return res.json({ success: true, data: perm });
	} catch (error) {
		console.error("approvePermission error:", error);
		const status = error.status || 500;
		return res.status(status).json({ success: false, message: error.message || "Server error" });
	}
};

// HOD / Principal: reject permission
exports.rejectPermission = async (req, res) => {
	try {
		requireRole(req, ["hod", "principal"]);
		const { id } = req.params;
		const { remarks } = req.body;

		const perm = await Permission.findById(id);
		if (!perm) return res.status(404).json({ success: false, message: "Permission not found" });

		perm.status = "Rejected";
		perm.approvedBy = req.user.facultyId;
		perm.approvedAt = new Date();
		if (remarks) perm.remarks = remarks;
		await perm.save();

		return res.json({ success: true, data: perm });
	} catch (error) {
		console.error("rejectPermission error:", error);
		const status = error.status || 500;
		return res.status(status).json({ success: false, message: error.message || "Server error" });
	}
};

// Faculty: cancel permission (self)
exports.cancelPermission = async (req, res) => {
	try {
		const { id } = req.params;
		const perm = await Permission.findById(id);
		if (!perm) return res.status(404).json({ success: false, message: "Permission not found" });

		if (!req.user.facultyId || perm.facultyId.toString() !== req.user.facultyId.toString()) {
			return res.status(403).json({ success: false, message: "Not authorized to cancel this permission" });
		}

		if (perm.status !== "Pending") {
			return res.status(400).json({ success: false, message: "Only pending permissions can be cancelled" });
		}

		// Delete the permission record from database
		await Permission.findByIdAndDelete(id);

		return res.json({ success: true, message: "Permission cancelled and deleted successfully" });
	} catch (error) {
		console.error("cancelPermission error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
};

// Faculty: get permission card for current month (dashboard card)
exports.getPermissionCard = async (req, res) => {
	try {
		if (!req.user || !req.user.facultyId) {
			return res.status(400).json({ success: false, message: "Faculty information missing." });
		}

		// Get current month start and end dates
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

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
				month: now.toLocaleString("default", { month: "long", year: "numeric" }),
				unit: "Hours",
			},
		});
	} catch (error) {
		console.error("getPermissionCard error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
};
