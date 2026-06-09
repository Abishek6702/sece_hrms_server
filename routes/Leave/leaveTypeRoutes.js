const express = require("express");
const {
  addLeaveType,
  getLeaveTypes,
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType,
} = require("../../controllers/Leave/leaveTypeController");

const protect = require("../../middleware/protect");

const router = express.Router();

router.post("/", protect, addLeaveType);

router.get("/", protect, getLeaveTypes);

router.get("/:id", protect, getLeaveTypeById);

router.put("/:id", protect, updateLeaveType);

router.delete("/:id", protect, deleteLeaveType);

module.exports = router;
