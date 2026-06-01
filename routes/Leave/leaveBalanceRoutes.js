const express = require("express");

const {
  getLeaveBalances,
  getFacultyLeaveBalances,
  getMyLeaveBalances,
} = require("../../controllers/Leave/leaveBalanceController");

const  protect  = require("../../middleware/protect");

const router = express.Router();

router.get("/", getLeaveBalances);

router.get(
  "/faculty/:facultyId",
  getFacultyLeaveBalances
);

router.get(
  "/me",
  protect,
  getMyLeaveBalances
);

module.exports = router;