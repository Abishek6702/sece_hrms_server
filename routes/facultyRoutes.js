const express = require("express");

const {
  importExcelFaculty,
  addIndividualFaculty,
  getFaculties,
  getFacultyId,
  deleteFaculty,
  editFaculty,
  uploadProfileImage,
  deleteProfileImage,
  uploadDocuments,
  deleteDocument,
  searchFaculty,
  bulkUpdateReportingManager,
} = require("../controllers/facultyController");
const protect = require("../middleware/protect");

const upload = require("../middleware/upload");
const uploadCloudinary = require("../middleware/multerConfig.js");
const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post("/import-faculty",protect, upload.single("faculties"), importExcelFaculty);

router.post("/", protect, addIndividualFaculty);

router.get("/", protect, getFaculties);

router.get("/search", protect, searchFaculty);

router.put("/add-manger",protect, bulkUpdateReportingManager);

router.get("/:id", protect, validateObjectId(), getFacultyId);

router.delete("/:id", protect, validateObjectId(), deleteFaculty);

router.put("/:id", protect, validateObjectId(), editFaculty);

router.patch(
  "/:id/profile-image",
  protect,
  validateObjectId(),
  uploadCloudinary.single("profileImage"),
  uploadProfileImage,
);
router.patch(
  "/:id/documents",
  protect,
  validateObjectId(),
  uploadCloudinary.fields([
    { name: "sslcMarkSheet", maxCount: 1 },
    { name: "hscMarkSheet", maxCount: 1 },
    { name: "ugDegreeCertificate", maxCount: 1 },
    { name: "pgDegreeCertificate", maxCount: 1 },
    { name: "phdDegreeCertificate", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "aadharCard", maxCount: 1 },

    { name: "experienceCertificates", maxCount: 20 },
    { name: "relievingLetters", maxCount: 20 },
    { name: "otherDocuments", maxCount: 20 },
  ]),
  uploadDocuments,
);

router.delete("/:id/documents", protect, validateObjectId(), deleteDocument);

router.delete(
  "/:id/profile-image",
  protect,
  validateObjectId(),
  deleteProfileImage,
);

module.exports = router;
