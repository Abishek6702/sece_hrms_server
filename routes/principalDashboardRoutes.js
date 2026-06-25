const express = require("express");
const protect = require("../middleware/protect.js");
const {
  getFacultyDesignationSummary,
  getPendingApprovals,
  getTodayPunchSummary,
  getAttendanceDashboardSummary,
  getAttendanceList,
  getRecentFaculty
} = require("../controllers/principalDashboardController.js");

const router = express.Router();

router.get("/faculty-count", protect, getFacultyDesignationSummary);
router.get("/pending-approvals",protect, getPendingApprovals);
router.get("/today-punch-summary",protect, getTodayPunchSummary);
router.get("/recentFaculty",getRecentFaculty);
router.get("/today-attendance-faculty-summary",protect, getAttendanceDashboardSummary);
router.get("/today-attendance-faculty",protect, getAttendanceList);


module.exports = router;
