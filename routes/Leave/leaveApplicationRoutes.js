const express = require("express");

const {
  applyLeave,
  getLeaveApplications,
  getMyLeaveApplications,
  getLeaveApplicationById,
  cancelLeave,
  approveLeave,
  rejectLeave,
} = require("../../controllers/Leave/leaveApplicationController");

const protect = require("../../middleware/protect");

const uploadCloudinary = require("../../middleware/multerConfig");

const router = express.Router();

router.post("/", protect, uploadCloudinary.array("files", 10), applyLeave);

router.get("/me", protect, getMyLeaveApplications);

router.get("/:id", protect, getLeaveApplicationById);

router.get("/", protect, getLeaveApplications);

router.patch("/:id/cancel", protect, cancelLeave);

router.patch("/:id/approve", protect, approveLeave);

router.patch("/:id/reject", protect, rejectLeave);

module.exports = router;
