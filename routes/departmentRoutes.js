const express = require("express");

const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/departmentController");
const protect = require("../middleware/protect");
const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post("/", protect, createDepartment);
router.get("/", protect, getDepartments);
router.get("/:id", protect, validateObjectId(), getDepartmentById);
router.put("/:id", protect, validateObjectId(), updateDepartment);
router.delete("/:id", protect, validateObjectId(), deleteDepartment);

module.exports = router;
