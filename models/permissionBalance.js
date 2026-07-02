const mongoose = require("mongoose");

const permissionBalanceSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    allocatedMinutes: {
      type: Number,
      required: true,
      default: 120,
    },
    usedMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    remainingMinutes: {
      type: Number,
      required: true,
      default: 120,
    },
    remainingHours: {
      type: Number,
      required: true,
      default: 2,
    },
    periodKey: {
      type: String,
      required: true,
    },
    windowStart: {
      type: Date,
      required: true,
    },
    windowEnd: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

permissionBalanceSchema.index(
  {
    facultyId: 1,
    periodKey: 1,
  },
  {
    unique: true,
  },
);

permissionBalanceSchema.pre("save", function () {
  this.remainingMinutes = Math.max(
    0,
    this.allocatedMinutes - (this.usedMinutes || 0),
  );
  this.remainingHours = Math.round((this.remainingMinutes / 60) * 100) / 100;
});

module.exports =
  mongoose.models.PermissionBalance || mongoose.model("PermissionBalance", permissionBalanceSchema);
