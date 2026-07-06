const express = require("express");
const router = express.Router();

const protect = require("../middleware/protect");

const permissionCtrl = require("../controllers/permissionContoller");

// Faculty apply
router.post("/", protect, permissionCtrl.applyPermission);

// Faculty: get permission card for current month (dashboard)
router.get("/card/month", protect, permissionCtrl.getPermissionCard);

// Faculty list own
router.get("/my", protect, permissionCtrl.getMyPermissions);

// HOD: list by department
router.get("/hod/:department", protect, permissionCtrl.getPermissionsForHod);

// Dean: list by department
router.get("/dean/list", protect, permissionCtrl.getPermissionsForDean);

// Principal: list all permissions
router.get("/principal/list", protect, permissionCtrl.getPermissionsForPrincipal);

// View single
router.get("/:id", protect, permissionCtrl.getPermissionById);


// HOD / Principal: approve / reject
router.patch("/:id/approve", protect, permissionCtrl.approvePermission);
router.patch("/:id/reject", protect, permissionCtrl.rejectPermission);router.post('/:id/approve', protect, permissionCtrl.approvePermission);
router.post('/:id/reject', protect, permissionCtrl.rejectPermission);
// Faculty: cancel
router.patch("/:id/cancel", protect, permissionCtrl.cancelPermission);
router.put(
  "/:id/revoke",
  protect,
  permissionCtrl.revokePermissionByHod
);

module.exports = router;
