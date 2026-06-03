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
  
} = require("../controllers/facultyController");
const protect = require("../middleware/protect");

const upload = require("../middleware/upload");
const uploadCloudinary = require("../middleware/multerConfig.js");

const router = express.Router();

router.post(
  "/import-faculty",
  upload.single("faculties"),
  protect,
  importExcelFaculty,
);

router.post("/", protect, addIndividualFaculty);

router.get("/", protect, getFaculties);


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
  uploadCloudinary.array("files", 10),
  uploadDocuments,
);

router.delete("/:id/documents", protect, deleteDocument);

router.delete("/:id/profile-image", protect, deleteProfileImage);

module.exports = router;
