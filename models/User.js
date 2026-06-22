const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },

    lastName: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    isFirstTimeLogin: {
      type: Boolean,
      default: true,
    },

    hasAccess: {
      type: Boolean,
      default: true,
    },

    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      unique: true,
      sparse: true,
    },

    department: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: [
        "admin",
        "principal",
        "hod",
        "faculty",
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
      default: "faculty",
    },

    resetOtp: String,

    resetOtpExpiry: Date,

    loginOtp: {
      type: String,
    },

    loginOtpExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
