const backupService = require("mongodb-backup-service");

function startBackupService() {
  if (process.env.BACKUP_ENABLED !== "true") {
    console.log("[BACKUP INFO] Backup service disabled (BACKUP_ENABLED is not true).");
    return;
  }

  backupService.start({
    mongoUri: process.env.MONGO_URI,

    projectName:
      process.env.BACKUP_PROJECT_NAME || "My Project",

    storage: {
      path: process.env.BACKUP_STORAGE_PATH || "./backups",
    },

    schedule: {
      type: process.env.BACKUP_SCHEDULE_TYPE || "daily",
      time: process.env.BACKUP_SCHEDULE_TIME || "02:00",
      timezone:
        process.env.BACKUP_TIMEZONE || "Asia/Kolkata",
    },

    excel: {
      enabled:
        process.env.BACKUP_EXCEL_ENABLED === "true",

      excludeCollections:
        process.env.BACKUP_EXCLUDE_COLLECTIONS
          ? process.env.BACKUP_EXCLUDE_COLLECTIONS
              .split(",")
              .map((collection) => collection.trim())
              .filter(Boolean)
          : [],
    },

    retention: {
      enabled:
        process.env.BACKUP_RETENTION_ENABLED === "true",

      days: Number(
        process.env.BACKUP_RETENTION_DAYS || 7
      ),
    },

    email: {
      enabled:
        process.env.BACKUP_EMAIL_ENABLED === "true",

      to: process.env.BACKUP_EMAIL_TO || "",
      from: process.env.BACKUP_EMAIL_FROM || "",

      host: process.env.BACKUP_SMTP_HOST || "",
      port: Number(
        process.env.BACKUP_SMTP_PORT || 587
      ),

      secure:
        process.env.BACKUP_SMTP_SECURE === "true",

      user: process.env.BACKUP_SMTP_USER || "",
      password: process.env.BACKUP_SMTP_PASSWORD || "",
    },
  });
}

function stopBackupService() {
  backupService.stop();
}

module.exports = {
  startBackupService,
  stopBackupService,
};