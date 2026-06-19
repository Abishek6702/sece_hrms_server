const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
      index: true,
    },

    punchId: {
      type: String,
      required: true,
      index: true,
    },

    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },

    inTime: {
      type: Date,
      default: null,
    },

    outTime: {
      type: Date,
      default: null,
    },

    workingMinutes: {
      type: Number,
      default: 0,
    },

    totalPunches: {
      type: Number,
      default: 0,
    },

    missedPunch: {
      type: Boolean,
      default: false,
    },

    deviceIds: [
      {
        type: Number,
      },
    ],

    source: {
      type: String,
      default: "ESSL",
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
      default: "Present",
    },

    lateCountApplied: {
      type: Boolean,
      default: false,
    },

    lateMinutes: {
      type: Number,
      default: 0,
    },

    lopDays: {
      type: Number,
      default: 0,
    },

    remarks: {
      type: String,
      trim: true,
    },
    // override fields
    isOverridden: {
      type: Boolean,
      default: false,
    },
    overrideStatus: {
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
        "On Duty",
        "First Half OD",
        "Second Half OD",
      ],
      default: "Present",
    },
    session1: {
      type: String,
      default: "",
    },

    session2: {
      type: String,
      default: "",
    },
    overrideRemarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

attendanceSchema.index(
  {
    facultyId: 1,
    attendanceDate: 1,
  },
  {
    unique: true,
  },
);
module.exports =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
