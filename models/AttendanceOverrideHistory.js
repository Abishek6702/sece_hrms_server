const mongoose = require("mongoose");

const attendanceOverrideHistorySchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
      index: true,
    },

    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },

    session1: {
      type: String,
      trim: true,
    },

    session2: {
      type: String,
      trim: true,
    },

    previousSession1: {
      type: String,
      trim: true,
    },

    previousSession2: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "Present",
        "Absent",
        "Half Day",
        "Leave",
        "Holiday",
        "First Half Leave",
        "Second Half Leave",
        "Missed Punch",
      ],
      default: null,
    },

    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    overriddenOn: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

attendanceOverrideHistorySchema.index(
  {
    facultyId: 1,
    attendanceDate: 1,
  },
  { unique: false },
);

module.exports = mongoose.model(
  "AttendanceOverrideHistory",
  attendanceOverrideHistorySchema,
);
