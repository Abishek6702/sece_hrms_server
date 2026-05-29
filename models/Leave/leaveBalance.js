const mongoose = require("mongoose");

const leaveBalanceSchema = new mongoose.Schema(
{
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
        required: true,
    },

    academicYear: {
        type: String,
        required: true,
    },

    leaveType: {
        type: String,
        required: true,
    },

    availableDays: {
        type: Number,
        default: 0,
    },

    usedDays: {
        type: Number,
        default: 0,
    },

    creditedDays: {
        type: Number,
        default: 0,
    },
},
{
    timestamps: true,
});

module.exports = mongoose.model("LeaveBalance", leaveBalanceSchema);