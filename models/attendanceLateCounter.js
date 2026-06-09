const mongoose = require("mongoose");

const attendanceLateCounterSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    month: {
      type: Number,
      required: true,
    },

    year: {
      type: Number,
      required: true,
    },

    lateCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

attendanceLateCounterSchema.index(
  {
    facultyId: 1,
    month: 1,
    year: 1,
  },
  {
    unique: true,
  },
);

module.exports = mongoose.model(
  "AttendanceLateCounter",
  attendanceLateCounterSchema,
);
