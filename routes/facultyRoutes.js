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
} = require("../controllers/facultyController");
const { protect } = require("../middleware/protect");
const upload = require("../middleware/upload");
const uploadCloudinary = require("../middleware/multerConfig.js");

const router = express.Router();

router.post("/import-faculty", upload.single("faculties"), importExcelFaculty);

router.post("/", addIndividualFaculty);

router.get("/", getFaculties);

router.get("/:id", getFacultyId);

router.delete("/:id", deleteFaculty);

router.put("/:id", editFaculty);

router.patch(
  "/:id/profile-image",
  uploadCloudinary.single("profileImage"),
  uploadProfileImage,
);

router.delete("/:id/profile-image", deleteProfileImage);

module.exports = router;
