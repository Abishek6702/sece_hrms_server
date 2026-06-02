const express = require("express");

const {
  getLeaveBalances,
  getFacultyLeaveBalances,
  getMyLeaveBalances,
  resetAcademicYear,
  resetSemester,
} = require("../../controllers/Leave/leaveBalanceController");

const protect = require("../../middleware/protect");

const router = express.Router();

router.get("/", getLeaveBalances);

router.get("/faculty/:facultyId", getFacultyLeaveBalances);

router.get("/me", protect, getMyLeaveBalances);

router.post("/reset-academic-year", protect, resetAcademicYear);

router.post("/reset-semester", protect, resetSemester);

module.exports = router;
