const express = require("express");
const router = express.Router();

const AttendanceSync = require("../models/attendanceSync");


const { syncAttendance } = require("../services/esslSync");

const { sql, config } = require("../config/sql");

function getCurrentESSLTable() {
  const now = new Date();
  return `DeviceLogs_${now.getMonth() + 1}_${now.getFullYear()}`;
}

router.get("/test-essl", async (req, res) => {
  try {
    await sql.connect(config);

    const tableName = getCurrentESSLTable();

    const result = await sql.query(`
      SELECT TOP 100
        DeviceLogId,
        UserId,
        DeviceId,
        LogDate
      FROM ${tableName}
      ORDER BY DeviceLogId ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/sync", async (req, res) => {
  try {
    const result = await syncAttendance();

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/init-sync", async (req, res) => {
  try {
    const existing = await AttendanceSync.findOne();

    if (existing) {
      return res.json({
        message: "Already initialized",
        data: existing,
      });
    }

    const sync = await AttendanceSync.create({
      lastDeviceLogId: 0,
      lastSyncTime: null,
    });

    res.json({
      message: "Sync initialized",
      data: sync,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
