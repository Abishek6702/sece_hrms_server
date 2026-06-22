const express = require("express");
const router = express.Router();
const Attendance = require("../models/attendance");
const { processAttendance } = require("../services/attendanceProcessor");
const { reprocessAttendance } = require("../services/reprocessAttendance");
const {processSingleFacultyAttendance} = require("../services/processSingleFacultyAttendance")

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

router.get("/process-past", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = await Attendance.distinct("attendanceDate", {
      attendanceDate: {
        $lt: today,
      },
    });

    console.log("Total dates:", dates.length);

    dates.sort((a, b) => new Date(a) - new Date(b));

    let processed = 0;

    for (const date of dates) {
      const processDate = new Date(date);

      processDate.setHours(0, 0, 0, 0);

      console.log(`Processing ${processDate.toISOString().split("T")[0]}`);

      await processAttendance(processDate);

      processed++;
    }

    return res.status(200).json({
      success: true,
      message: "Past attendance processed successfully",
      processedDays: processed,
      from: dates.length ? dates[0] : null,
      to: dates.length ? dates[dates.length - 1] : null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/test-single", async (req, res) => {
  await processSingleFacultyAttendance("6a23e523a63cc698c0d09a57", "2026-06-20");

  res.json({
    success: true,
  });
});

module.exports = router;
