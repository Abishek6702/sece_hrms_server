const express = require("express");

const {
  getLeaveBalances,
  getFacultyLeaveBalances,
  getMyLeaveBalances,
  resetAcademicYear,
  resetSemester,
  getMyLeaveDashboard,
  updateLeaveBalance,
} = require("../../controllers/Leave/leaveBalanceController");

const protect = require("../../middleware/protect");

const router = express.Router();

router.get("/", getLeaveBalances);

router.get("/faculty/:facultyId", getFacultyLeaveBalances);

router.get("/me", protect, getMyLeaveBalances);

router.post("/reset-academic-year", protect, resetAcademicYear);

router.post("/reset-semester", protect, resetSemester);

router.get("/dashboard/me", protect, getMyLeaveDashboard);

router.put("/:id", protect, updateLeaveBalance);

module.exports = router;
