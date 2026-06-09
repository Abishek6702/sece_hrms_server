const cron = require("node-cron");
const { syncAttendance } = require("../services/esslSync");

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      console.log("Running attendance sync...");
      const result = await syncAttendance();
      console.log(result);
    } catch (error) {
      console.error("Attendance Sync Failed:", error);
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);
