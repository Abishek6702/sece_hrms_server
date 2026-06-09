const mongoose = require("mongoose");

const leaveBalanceSchema =
  new mongoose.Schema(
    {
      facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
        required: true,
      },

      leaveTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LeaveType",
        required: true,
      },

      academicYear: {
        type: String,
        required: true,
      },

      allocatedDays: {
        type: Number,
        default: 0,
      },

      usedDays: {
        type: Number,
        default: 0,
      },

      remainingDays: {
        type: Number,
        default: 0,
      },
    },
    {
      timestamps: true,
    }
  );

leaveBalanceSchema.index(
  {
    facultyId: 1,
    leaveTypeId: 1,
    academicYear: 1,
  },
  {
    unique: true,
  }
);

module.exports =
  mongoose.models.LeaveBalance || mongoose.model("LeaveBalance", leaveBalanceSchema);