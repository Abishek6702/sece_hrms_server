const { processAttendance } = require("./attendanceProcessor");

async function reprocessAttendance(date) {
  await processAttendance(new Date(date));
}

module.exports = {
  reprocessAttendance,
};