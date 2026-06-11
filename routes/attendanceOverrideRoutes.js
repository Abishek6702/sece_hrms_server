const express = require("express");
const router = express.Router();
const protect = require("../middleware/protect");


const {
  getAttendanceByDate,
  getAttendanceByEmployee,updateAttendanceOverride,bulkUpdateAttendanceByDateRange,getAttendanceOverrideHistory
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

router.get("/history", protect, getAttendanceOverrideHistory);
module.exports = router;