const express = require("express");
const router = express.Router();
const { processAttendance } = require("../services/attendanceProcessor");
const { reprocessAttendance } = require("../services/reprocessAttendance");

router.get("/process-today", async (req, res) => {
  try {
    console.log("Attendance processing started...");

    await processAttendance(new Date());

    console.log("Attendance processing completed");

    res.status(200).json({
      success: true,
      message: "Attendance processed successfully",
    });
  } catch (error) {
    console.error("Attendance processing failed:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/reprocess", async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    await reprocessAttendance(date);

    return res.status(200).json({
      success: true,
      message: "Attendance reprocessed successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
