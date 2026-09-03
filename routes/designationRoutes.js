const express = require("express");

const {
  createDesignation,
  getDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
} = require("../controllers/designationController");
const protect = require("../middleware/protect");
const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post("/", protect, createDesignation);
router.get("/", protect, getDesignations);
router.get("/:id", protect, validateObjectId(), getDesignationById);
router.put("/:id", protect, validateObjectId(), updateDesignation);
router.delete("/:id", protect, validateObjectId(), deleteDesignation);

module.exports = router;
