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
    researchStatus: {
      type: String,
      default: "Pending",
    },
    coeStatus: {
      type: String,
      default: "Pending",
    },
    iqacStatus: {
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
      enum: [
        "hod",
        "dean-iqac",
        "dean-research",
        "principal",
        "hr",
        "admin",
        "supervisor",
        "faculty",
        "non-teaching",
        "coe",
      ],
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    action: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected", "Cancelled", "Pending"],
    },

    remarks: String,

    actionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const leaveApplicationSchema = new mongoose.Schema(
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

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    leaveSession: {
      type: String,
      enum: ["Full Day", "First Half", "Second Half"],
      default: "Full Day",
    },

    totalDays: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    supportingDocuments: [documentSchema],

    currentApprovalLevel: {
      type: String,
      enum: [
        "hod",
        "dean-iqac",
        "dean-research",
        "principal",
        "hr",
        "admin",
        "supervisor",
        "completed",
        "coe",
      ],
      default: "hod",
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },

    approvalHistory: [approvalHistorySchema],
    // approval level status (newly added)
    approvalStatus: {
      type: approvalStatusSchema,
      default: {
        hodStatus: "Pending",
        researchStatus: "Pending",
        coeStatus: "Pending",
        iqacStatus: "Pending",
        principalStatus: "Pending",
      },
    },
  },
  {
    timestamps: true,
  },
);
leaveApplicationSchema.index({
  facultyId: 1,
  status: 1,
});

leaveApplicationSchema.index({
  currentApprovalLevel: 1,
  status: 1,
});

module.exports =
  mongoose.models.LeaveApplication ||
  mongoose.model("LeaveApplication", leaveApplicationSchema);
