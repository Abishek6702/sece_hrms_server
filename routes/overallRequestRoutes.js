const express = require("express");
const protect = require("../middleware/protect");
const permissionController = require("../controllers/permissionContoller");
const regularizationController = require("../controllers/attendanceRegularizationController");

const router = express.Router();

router.get("/permission/overall", protect, permissionController.getOverallPermissions);
router.get("/regularization/overall", protect, regularizationController.getOverallRequests);

module.exports = router;
