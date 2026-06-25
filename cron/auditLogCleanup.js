const cron = require("node-cron");
const AuditLog = require("../models/AuditLog");

cron.schedule("0 0 1 7 *", async () => {
  try {
    const cutoffDate = new Date();

    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    const result = await AuditLog.deleteMany({
      createdAt: {
        $lt: cutoffDate,
      },
    });

    console.log(
      `Audit Log Cleanup: ${result.deletedCount} logs deleted.`
    );
  } catch (err) {
    console.error("Audit Log Cleanup Error:", err);
  }
});