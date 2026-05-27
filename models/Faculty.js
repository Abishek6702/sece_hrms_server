const mongoose = require("mongoose");

const facultySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    empId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: Number, required: true, unique: true },
    department: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true, enum: ["Male", "Female", "Other"] },
    doj: { type: Date, required: true },
    designation: { type: String, required: true },
    employeeCategory: {
      type: String,
      required: true,
      enum: ["Teaching", "Non-Teaching"],
    },
    employmentStatus: { type: Boolean, default: true },
    location: { type: String, required: true },
    profileImage: {
      url: String,
      publicId: String,
    }
  },
  { timestamps: true },
);

module.exports = mongoose.model("Faculty", facultySchema);
