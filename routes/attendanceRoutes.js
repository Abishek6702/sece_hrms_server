const express = require("express");

const { getAttendanceMuster,getFacultyAttendanceHistory } = require("../controllers/attendanceController");
const protect = require("../middleware/protect");

const router = express.Router();

router.get("/muster", protect, getAttendanceMuster);
router.get("/faculty-attendance", getFacultyAttendanceHistory);

module.exports = router;
