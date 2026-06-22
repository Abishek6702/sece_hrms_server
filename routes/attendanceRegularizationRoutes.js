const express = require("express");
const multer = require("multer");
const protect = require("../middleware/protect");
const upload = require("../middleware/upload");

const {
  createAttendanceRegularization,
  getMyRequests,
  getRequests,
  getRequestsForHod,
  getRequestsForDean,
  getRequestsForPrincipal,
  getRequestById,
  updateRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
} = require("../controllers/attendanceRegularizationController");

const router = express.Router();

// Create a flexible file upload middleware that accepts any field name for a single file
const flexibleUpload = (req, res, next) => {
  // Use any() to capture any file fields, then we'll handle them in the controller
  multer().any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`,
      });
    }
    
    // If files were uploaded, move them to req.file for backwards compatibility
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
      console.log("File uploaded with field name:", req.file.fieldname);
    }
    
    next();
  });
};

router.post("/", protect, flexibleUpload, createAttendanceRegularization);

router.get("/my", protect, getMyRequests);
router.get("/me", protect, getMyRequests);
router.get("/hod/list", protect, getRequestsForHod);
router.get("/dean/list", protect, getRequestsForDean);
router.get("/principal/list", protect, getRequestsForPrincipal);

router.get("/", protect, getRequests);
router.get("/:id", protect, getRequestById);

router.patch("/:id", protect, updateRequest);
router.patch("/:id/approve", protect, approveRequest);
router.patch("/:id/reject", protect, rejectRequest);
router.patch("/:id/cancel", protect, cancelRequest);

module.exports = router;
