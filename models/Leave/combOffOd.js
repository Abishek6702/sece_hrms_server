const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
{
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
        required: true,
    },

    creditType: {
        type: String,
        enum: [
            "CompOff",
            "External Exam Duty",
            "Conference",
            "Seminar",
            "Workshop",
            "FDP",
            "Higher Studies",
            "Official Duty",
        ],
        required: true,
    },

    workDate: Date,

    creditedDays: {
        type: Number,
        default: 0,
    },

    utilizedDays: {
        type: Number,
        default: 0,
    },

    balanceDays: {
        type: Number,
        default: 0,
    },

    expiryDate: Date,

    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
    },

    remarks: String,
},
{
    timestamps: true,
});

module.exports = mongoose.model("LeaveCredit", creditSchema);