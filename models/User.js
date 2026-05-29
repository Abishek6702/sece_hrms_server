const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },

    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },

    password: { type: String },

    isFirstTimeLogin: { type: Boolean, default: false },

    hasAccess: { type: Boolean, default: true },

    facultyId: {
      type: mongoose.Types.ObjectId,
      ref: "Faculty",
      unique: true,
      sparse: true,
    },

    department: { type: String, required: true },

    role: { type: String, required: true, default: "faculty" },

    resetOtp: String,
    resetOtpExpiry: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
