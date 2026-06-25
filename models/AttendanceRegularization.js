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
      enum: [
        "admin",
        "principal",
        "hod",
        "faculty",
        "dean",
        "non-teaching",
        "driver",
        "housekeeping",
        "dean-academics",
        "supervisor-driver",
        "supervisor-housekeeping",
        "dean-iqac",
        "dean-research",
        "coe",
        "hr",
      ],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    action: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected", "Cancelled", "Revoked"],
    },
    remarks: String,
    actionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const attendanceRegularizationSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
      index: true,
    },

    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },

    requestedInTime: {
      type: Date,
      default: null,
    },

    requestedOutTime: {
      type: Date,
      default: null,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    attachment: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },

    currentApprovalLevel: {
      type: String,
      enum: ["hod", "principal", "completed"],
      default: "hod",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvalRemarks: {
      type: String,
      trim: true,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    approvalHistory: [approvalHistorySchema],
  },
  {
    timestamps: true,
  },
);

attendanceRegularizationSchema.index({
  facultyId: 1,
  attendanceDate: 1,
});

module.exports =
  mongoose.models.AttendanceRegularization ||
  mongoose.model("AttendanceRegularization", attendanceRegularizationSchema);
