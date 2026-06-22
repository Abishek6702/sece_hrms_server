const express = require("express");

const {
  getAttendanceMuster,
  getAttendanceMusterV1,
  getFacultyAttendanceHistory,
  getAttendanceWeekSummary,
  getMyAttendanceSummary
} = require("../controllers/attendanceController");
const protect = require("../middleware/protect");

const router = express.Router();

router.get("/muster/v1", protect, getAttendanceMusterV1);
router.get("/muster", protect, getAttendanceMuster);
router.get("/faculty-attendance", protect, getFacultyAttendanceHistory);
router.get("/week-summary", protect, getAttendanceWeekSummary);
router.get("/my-summary",protect, getMyAttendanceSummary);

module.exports = router;
