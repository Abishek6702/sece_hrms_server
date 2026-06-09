const express = require("express");

const {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  deleteShift,
} = require("../controllers/shiftController");
const protect = require("../middleware/protect");


const router = express.Router();

router.post("/", createShift);

router.get("/", protect, getShifts);

router.get("/:id", protect, getShiftById);

router.put("/:id", protect, updateShift);

router.delete("/:id", protect, deleteShift);

module.exports = router;