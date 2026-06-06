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
      enum: ["Present", "Absent", "Half Day", "Leave", "Holiday"],
      default: "Present",
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

module.exports = mongoose.model("Attendance", attendanceSchema);
