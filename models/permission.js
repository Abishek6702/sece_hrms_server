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

    approvedAt: {
      type: Date,
    },

    remarks: {
      type: String,
    },

    approvalHistory: [
      {
        role: {
          type: String,
          enum: ["faculty", "hod", "principal", "dean"],
          required: true,
        },

        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Faculty",
          required: true,
        },

        action: {
          type: String,
          enum: ["Submitted", "Approved", "Rejected"],
          required: true,
        },

        remarks: {
          type: String,
          default: "",
        },

        actionDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

permissionSchema.index({
  facultyId: 1,
  permissionDate: 1,
  status: 1,
});

module.exports =
  mongoose.models.Permission ||
  mongoose.model("Permission", permissionSchema);