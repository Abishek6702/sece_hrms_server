const express = require("express");

const protect = require("../middleware/protect");

const {
  createCompOffRequest,
  getMyCompOffRequests,
  getCompOffRequests,
  getCompOffRequestById,
  approveCompOff,
  rejectCompOff,
  withdrawCompOff,
  revokeHodApproval,
} = require("../controllers/compOffController");

const uploadCloudinary = require("../middleware/multerConfig");

const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post(
  "/",
  protect,
  uploadCloudinary.array("files", 10),
  createCompOffRequest,
);

router.get("/me", protect, getMyCompOffRequests);

router.get("/", protect, getCompOffRequests);

router.get("/:id", protect, validateObjectId(), getCompOffRequestById);

router.patch("/:id/approve", protect,validateObjectId(), approveCompOff);

router.patch("/:id/reject", protect,validateObjectId(), rejectCompOff);

router.patch("/:id/withdraw", protect,validateObjectId(), withdrawCompOff);

router.patch("/:id/revoke-hod", protect,validateObjectId(), revokeHodApproval);

module.exports = router;
