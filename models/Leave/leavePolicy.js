const mongoose = require("mongoose");

const leavePolicySchema = new mongoose.Schema(
{
    leaveType: {
        type: String,
        required: true,
        unique: true,
    },

    employeeCategory: {
        type: String,
        enum: ["Teaching", "Non-Teaching", "All"],
        default: "All",
    },

    annualLimit: Number,

    semesterLimit: Number,

    monthlyCredit: Number,

    maxAccumulation: Number,

    canCarryForward: {
        type: Boolean,
        default: false,
    },

    carryForwardType: {
        type: String,
        enum: ["Semester", "AcademicYear", "Lifetime", null],
    },

    requiresDocument: {
        type: Boolean,
        default: false,
    },

    approvalRequired: {
        type: Boolean,
        default: true,
    },

    isActive: {
        type: Boolean,
        default: true,
    },
},
{
    timestamps: true,
});

module.exports = mongoose.model("LeavePolicy", leavePolicySchema);