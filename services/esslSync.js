const { sql, config } = require("../config/sql");
const AttendanceSync = require("../models/attendanceSync");
const { processAttendancePunches } = require("./attendanceSync");

function getCurrentESSLTable() {
  const now = new Date();

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  return `DeviceLogs_${month}_${year}`;
}

async function syncAttendance() {
  let sync = await AttendanceSync.findOne();

  if (!sync) {
    const tableName = getCurrentESSLTable();

    sync = await AttendanceSync.create({
      tableName,
      lastDeviceLogId: 0,
      lastSyncTime: null,
    });
  }

  await sql.connect(config);

  const tableName = getCurrentESSLTable();

  console.log("Current Table:", tableName);

  // If ESSL has switched to a new month's table,
  // reset the last synced DeviceLogId.
  if (sync.tableName !== tableName) {
    console.log(
      `ESSL table changed from ${sync.tableName} to ${tableName}. Resetting sync...`,
    );

    sync.tableName = tableName;
    sync.lastDeviceLogId = 0;

    await sync.save();
  }
  const lastDeviceLogId = sync.lastDeviceLogId;

  console.log("Last Synced DeviceLogId:", lastDeviceLogId);

  const result = await sql.query(`
    SELECT
      DeviceLogId,
      UserId,
      DeviceId,
      LogDate
    FROM ${tableName}
    WHERE DeviceLogId > ${lastDeviceLogId}
    ORDER BY DeviceLogId ASC
  `);

  const punches = result.recordset;
  console.log("New Punches:", punches.length);

  if (punches.length === 0) {
    return {
      success: true,
      message: "No new punches",
    };
  }

  console.log("Before processing punches...");

  await processAttendancePunches(punches);

  console.log("After processing punches...");

  const latestDeviceLogId = punches[punches.length - 1].DeviceLogId;

  console.log("Latest DeviceLogId:", latestDeviceLogId);

  sync.tableName = tableName;
  sync.lastDeviceLogId = latestDeviceLogId;
  sync.lastSyncTime = new Date();

  await sync.save();

  return {
    success: true,
    punchesProcessed: punches.length,
    lastDeviceLogId: latestDeviceLogId,
  };
}

module.exports = {
  syncAttendance,
};
