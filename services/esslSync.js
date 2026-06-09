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
    sync = await AttendanceSync.create({
      lastDeviceLogId: 0,
      lastSyncTime: null,
    });
  }

  const lastDeviceLogId = sync.lastDeviceLogId;

  await sql.connect(config);

  const tableName = getCurrentESSLTable();

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

  if (punches.length === 0) {
    return {
      success: true,
      message: "No new punches",
    };
  }

  await processAttendancePunches(punches);

  const latestDeviceLogId =
    punches[punches.length - 1].DeviceLogId;

  await AttendanceSync.updateOne(
    { _id: sync._id },
    {
      lastDeviceLogId: latestDeviceLogId,
      lastSyncTime: new Date(),
    }
  );

  return {
    success: true,
    punchesProcessed: punches.length,
    lastDeviceLogId: latestDeviceLogId,
  };
}

module.exports = {
  syncAttendance,
};