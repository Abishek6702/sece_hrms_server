const express = require("express");

const {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  deleteShift,
} = require("../controllers/shiftController");
const protect = require("../middleware/protect");

const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post("/", protect, createShift);

router.get("/", protect, getShifts);

router.get("/:id", protect, validateObjectId(), getShiftById);

router.put("/:id", protect, validateObjectId(), updateShift);

router.delete("/:id", protect, validateObjectId(), deleteShift);

module.exports = router;
