const mongoose = require("mongoose");

const leaveTypeSchema = new mongoose.Schema(
  {
    leaveName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    employeeCategories: [
      {
        type: String,
        enum: [
          "Teaching",
          "Non-Teaching",
          "Driver",
          "Housekeeping",
        ],
      },
    ],

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
  }
);

module.exports = mongoose.model(
  "LeaveType",
  leaveTypeSchema
);