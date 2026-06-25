const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    empId: {
      type: String,
      default: null,
    },

    name: {
      type: String,
      default: "Anonymous",
    },

    role: {
      type: String,
      default: "Guest",
    },

    action: {
      type: String,
      default: "",
    },

    method: {
      type: String,
      required: true,
    },

    endpoint: {
      type: String,
      required: true,
    },

    statusCode: {
      type: Number,
      required: true,
    },

    success: {
      type: Boolean,
      default: true,
    },

    ipAddress: String,

    userAgent: String,

    responseTime: Number,
  },
  {
    timestamps: true,
  }
);

// Indexes
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ endpoint: 1 });
auditLogSchema.index({ method: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);