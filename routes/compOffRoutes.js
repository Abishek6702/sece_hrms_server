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


const router = express.Router();

router.post("/", protect,uploadCloudinary.array("files", 10), createCompOffRequest);

router.get("/me", protect, getMyCompOffRequests);

router.get("/", protect, getCompOffRequests);

router.get("/:id", protect, getCompOffRequestById);


router.patch("/:id/approve", protect, approveCompOff);

router.patch("/:id/reject", protect, rejectCompOff);

router.patch("/:id/withdraw", protect, withdrawCompOff);

router.patch("/:id/revoke-hod", protect, revokeHodApproval);

module.exports = router;
