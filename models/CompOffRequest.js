const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
  },
  { _id: false },
);

// approval level status (newly added)
const approvalStatusSchema = new mongoose.Schema(
  {
    hodStatus: {
      type: String,
      default: "Pending",
    },
    principalStatus: {
      type: String,
      default: "Pending",
    },
  },
  { _id: false },
);

const approvalHistorySchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["faculty", "hod", "principal"],
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    action: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected"],
    },

    remarks: String,

    actionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const compOffRequestSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    workedFromDate: {
      type: Date,
      required: true,
    },

    workedToDate: {
      type: Date,
      required: true,
    },

    compOffDays: {
      type: Number,
      required: true,
      min: 1,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    supportingDocuments: [documentSchema],

    currentApprovalLevel: {
      type: String,
      enum: ["hod", "principal", "completed"],
      default: "hod",
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    approvalHistory: [approvalHistorySchema],

    // approval level status (newly added)
    approvalStatus: {
      type: approvalStatusSchema,
      default: {
        hodStatus: "Pending",
        principalStatus: "Pending",
      },
    },
  },
  {
    timestamps: true,
  },
);

compOffRequestSchema.index({
  facultyId: 1,
  status: 1,
});

module.exports = mongoose.model("CompOffRequest", compOffRequestSchema);
