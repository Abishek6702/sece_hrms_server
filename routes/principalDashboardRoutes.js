const express = require("express");
const protect = require("../middleware/protect.js");
const {
  getFacultyDesignationSummary,
  getPendingApprovals,
  getTodayPunchSummary,
  getAttendanceDashboardSummary,
  getAttendanceList,
} = require("../controllers/principalDashboardController.js");

const router = express.Router();

router.get("/faculty-count", protect, getFacultyDesignationSummary);
router.get("/pending-approvals",protect, getPendingApprovals);
router.get("/today-punch-summary", getTodayPunchSummary);
router.get("/today-attendance-faculty-summary", getAttendanceDashboardSummary);
router.get("/today-attendance-faculty", getAttendanceList);


module.exports = router;
