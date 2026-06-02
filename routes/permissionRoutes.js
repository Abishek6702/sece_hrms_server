const express = require("express");
const router = express.Router();

const protect = require("../middleware/protect");
const permissionCtrl = require("../controllers/permissionContoller");

// Faculty apply
router.post("/", protect, permissionCtrl.applyPermission);

// Faculty list own
router.get("/my", protect, permissionCtrl.getMyPermissions);

// View single
router.get("/:id", protect, permissionCtrl.getPermissionById);

// HOD: list by department
router.get("/hod/list", protect, permissionCtrl.getPermissionsForHod);

// HOD: approve / reject
router.patch("/:id/approve", protect, permissionCtrl.approvePermission);
router.patch("/:id/reject", protect, permissionCtrl.rejectPermission);

// Faculty: cancel
router.patch("/:id/cancel", protect, permissionCtrl.cancelPermission);

module.exports = router;
