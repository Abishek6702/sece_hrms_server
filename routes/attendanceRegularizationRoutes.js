const express = require("express");
const protect = require("../middleware/protect");

const {
  createAttendanceRegularization,
  getMyRequests,
  getRequests,
  getRequestsForHod,
  getRequestsForPrincipal,
  getRequestById,
  updateRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
} = require("../controllers/attendanceRegularizationController");

const router = express.Router();

router.post("/", protect, createAttendanceRegularization);

router.get("/my", protect, getMyRequests);
router.get("/me", protect, getMyRequests);
router.get("/hod/list", protect, getRequestsForHod);
router.get("/principal/list", protect, getRequestsForPrincipal);

router.get("/", protect, getRequests);
router.get("/:id", protect, getRequestById);

router.patch("/:id", protect, updateRequest);
router.patch("/:id/approve", protect, approveRequest);
router.patch("/:id/reject", protect, rejectRequest);
router.patch("/:id/cancel", protect, cancelRequest);

module.exports = router;
