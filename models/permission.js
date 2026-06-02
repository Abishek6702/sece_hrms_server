const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    permissionDate: {
      type: Date,
      required: true,
    },

    permissionType: {
      type: String,
      enum: ["Personal", "Medical", "Official"],
      default: "Personal",
    },

    fromTime: {
      type: String,
      required: true,
    },

    toTime: {
      type: String,
      required: true,
    },

    totalMinutes: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
    },

    approvedAt: Date,

    remarks: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Permission", permissionSchema);