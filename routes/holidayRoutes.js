const express = require("express");

const {
  addHoliday,
  getHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  importHolidayExcel,
} = require("../controllers/holidayController.js");

const upload = require("../middleware/upload");
const protect = require("../middleware/protect");

const router = express.Router();

router.post("/", addHoliday);

router.get("/", getHolidays);

router.post("/import", upload.single("holidays"), importHolidayExcel);

router.get("/:id", getHolidayById);

router.put("/:id", updateHoliday);

router.delete("/:id", deleteHoliday);

module.exports = router;
