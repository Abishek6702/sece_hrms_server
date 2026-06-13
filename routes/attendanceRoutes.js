const express = require("express");

const {
  getAttendanceMuster,
  getFacultyAttendanceHistory,
  getAttendanceWeekSummary,
  getMyAttendanceSummary
} = require("../controllers/attendanceController");
const protect = require("../middleware/protect");

const router = express.Router();

router.get("/muster", protect, getAttendanceMuster);
router.get("/faculty-attendance", getFacultyAttendanceHistory);
router.get("/week-summary", protect, getAttendanceWeekSummary);
router.get("/my-summary",protect, getMyAttendanceSummary);

module.exports = router;
