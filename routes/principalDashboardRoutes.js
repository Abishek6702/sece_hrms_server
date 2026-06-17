const express = require("express");
const protect = require("../middleware/protect.js");
const {
  getFacultyDesignationSummary,
  getPendingApprovals,
  getTodayPunchSummary
} = require("../controllers/principalDashboardController.js");

const router = express.Router();

router.get("/faculty-count", protect, getFacultyDesignationSummary);
router.get("/pending-approvals",protect, getPendingApprovals);
router.get("/today-punch-summary", getTodayPunchSummary);

module.exports = router;
