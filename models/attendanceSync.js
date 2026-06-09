const mongoose = require("mongoose");

const attendanceSyncSchema = new mongoose.Schema(
  {
    lastDeviceLogId: {
      type: Number,
      default: 0,
    },

    lastSyncTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model(
    "AttendanceSync",
    attendanceSyncSchema
  );
