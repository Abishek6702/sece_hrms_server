const express = require("express");

const {
  addHoliday,
  getHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  importHolidayExcel,
  getEmployeeHolidays,
} = require("../controllers/holidayController.js");

const upload = require("../middleware/upload");
const protect = require("../middleware/protect");
const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

router.post("/", protect, addHoliday);

router.get("/", protect, getHolidays);

router.post("/import", protect, upload.single("holidays"), importHolidayExcel);

router.get("/calendar", protect, getEmployeeHolidays);

router.get("/:id", protect, validateObjectId(), getHolidayById);

router.put("/:id", protect, validateObjectId(), updateHoliday);

router.delete("/:id", protect, validateObjectId(), deleteHoliday);

module.exports = router;
