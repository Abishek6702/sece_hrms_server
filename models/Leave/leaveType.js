const mongoose = require("mongoose");

const leaveTypeSchema = new mongoose.Schema(
  {
    leaveName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    leaveCategory: {
      type: String,
      enum: ["Regular", "On Duty"],
      default: "Regular",
    },
    employeeCategories: [
      {
        type: String,
        enum: ["Teaching", "Non-Teaching", "Driver", "Housekeeping"],
      },
    ],
    resetFrequency: {
      type: String,
      enum: ["Academic Year", "Semester"],
      default: "Academic Year",
    },

    daysPerYear: {
      type: Number,
      default: 0,
    },

    requiresApproval: {
      type: Boolean,
      default: true,
    },

    isPaidLeave: {
      type: Boolean,
      default: true,
    },

    carryForwardAllowed: {
      type: Boolean,
      default: false,
    },

    maxCarryForwardDays: {
      type: Number,
      default: 0,
    },

    allowHalfDay: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    description: String,
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.LeaveType || mongoose.model("LeaveType", leaveTypeSchema);
