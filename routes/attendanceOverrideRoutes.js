const express = require("express");
const router = express.Router();
const protect = require("../middleware/protect");


const {
  getAttendanceByDate,
  getAttendanceByEmployee,
  updateAttendanceOverride,
  bulkUpdateAttendanceByDateRange,
  bulkUpdateAttendanceByEmployee,
  getAttendanceOverrideHistory,
  getAttendanceOverride,
} = require("../controllers/attendanceOverrideController");

router.get("/date/:date", protect, getAttendanceByDate);

router.get("/employee/:employeeId", protect, getAttendanceByEmployee);

router.put(
  "/employee/:employeeId/date/:date",
  protect,
  updateAttendanceOverride
);

router.put(
  "/date-range",
  protect,
  bulkUpdateAttendanceByDateRange
);

router.put(
  "/employee/:employeeId/date-range",
  protect,
  bulkUpdateAttendanceByEmployee
);

router.get("/history", protect, getAttendanceOverrideHistory);

router.get("/muster", protect, getAttendanceOverride);

module.exports = router;