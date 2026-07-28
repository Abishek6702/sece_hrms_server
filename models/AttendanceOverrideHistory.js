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

    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      default: null,
    },

    leaveName: {
      type: String,
      default: null,
    },

    days: {
      type: Number,
      default: 0,
    },

    academicYear: {
      type: String,
      default: null,
    },

    currentMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },

    deductedDays: {
      type: Number,
      default: 0,
    },

    session1: {
      type: String,
      default: null,
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