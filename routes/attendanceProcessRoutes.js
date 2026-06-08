const express = require("express");
const router = express.Router();
const { processAttendance } = require("../services/attendanceProcessor");


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

module.exports = router;
