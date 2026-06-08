const cron = require("node-cron");

const { processAttendance } = require("../services/attendanceProcessor");

cron.schedule(
  "0 22 * * *",
  async () => {
    try {
      const today = new Date();

      await processAttendance(today);

      console.log("Attendance processed");
    } catch (error) {
      console.error(error);
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);
