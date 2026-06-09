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
} = require("../controllers/facultyController");
const protect = require("../middleware/protect");

const upload = require("../middleware/upload");
const uploadCloudinary = require("../middleware/multerConfig.js");

const router = express.Router();

router.post(
  "/import-faculty",
  upload.single("faculties"),
  importExcelFaculty,
);

router.post("/", addIndividualFaculty);

router.get("/", protect, getFaculties);

router.get("/search", protect, searchFaculty);

router.get("/:id", protect, getFacultyId);

router.delete("/:id", protect, deleteFaculty);

router.put("/:id", protect, editFaculty);

router.patch(
  "/:id/profile-image",
  protect,
  uploadCloudinary.single("profileImage"),
  uploadProfileImage,
);
router.patch(
  "/:id/documents",
  protect,
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

router.delete("/:id/documents", protect, deleteDocument);

router.delete("/:id/profile-image", protect, deleteProfileImage);

module.exports = router;
