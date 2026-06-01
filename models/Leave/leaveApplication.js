const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
  },
  { _id: false },
);

const approvalHistorySchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["hod", "dean", "principal", "hr", "admin", "supervisor","faculty"],
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    action: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected", "Cancelled"],
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
    odCategory: {
      type: String,
      enum: ["Research", "Exam", "Official"],
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
        "dean",
        "principal",
        "hr",
        "admin",
        "supervisor",
        "completed",
      ],
      default: "hod",
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },

    approvalHistory: [approvalHistorySchema],
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
  mongoose.models.LeaveApplication || mongoose.model("LeaveApplication", leaveApplicationSchema);
