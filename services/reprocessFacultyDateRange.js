const {
  processSingleFacultyAttendance,
} = require("./processSingleFacultyAttendance");
async function reprocessFacultyDateRange(facultyId, fromDate, toDate) {
  let currentDate = new Date(fromDate);

  while (currentDate <= toDate) {
    await processSingleFacultyAttendance(facultyId, currentDate);

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

module.exports = {
  reprocessFacultyDateRange,
};
