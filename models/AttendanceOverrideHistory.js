const mongoose = require("mongoose");

const attendanceOverrideHistorySchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: false,
      default: null,
    },

    attendanceDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    previousStatus: {
      type: String,
      required: true,
    },

    newStatus: {
      type: String,
      required: true,
    },

    session1: {
      type: String,
      default: "abi",
    },

    session2: {
      type: String,
      default: null,
    },

    reason: {
      type: String,
      required: true,
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
      default: "principal",
    },

    bulkOperationId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.AttendanceOverrideHistory ||
  mongoose.model(
    "AttendanceOverrideHistory",
    attendanceOverrideHistorySchema
  );