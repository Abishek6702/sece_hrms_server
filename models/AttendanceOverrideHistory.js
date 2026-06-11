const mongoose = require("mongoose");

const attendanceOverrideHistorySchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
      index: true,
    },

    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
    },

    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },

    previousStatus: {
      type: String,
      required: true,
    },

    newStatus: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    previousInTime: {
      type: Date,
      default: null,
    },

    previousOutTime: {
      type: Date,
      default: null,
    },

    newInTime: {
      type: Date,
      default: null,
    },

    newOutTime: {
      type: Date,
      default: null,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    changedByRole: {
      type: String,
      default: "hr",
    },
  },
  {
    timestamps: true,
  }
);

attendanceOverrideHistorySchema.index({
  facultyId: 1,
  attendanceDate: 1,
});

module.exports =
  mongoose.models.AttendanceOverrideHistory ||
  mongoose.model(
    "AttendanceOverrideHistory",
    attendanceOverrideHistorySchema
  );