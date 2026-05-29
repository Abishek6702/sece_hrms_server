const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
{
    url: String,
    publicId: String,
},
{
    _id: false,
});

const leaveSchema = new mongoose.Schema(
{
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
        required: true,
    },

    leaveType: {
        type: String,
        enum: [
            "CL",
            "ML",
            "Maternity",
            "Paternity",
            "Vacation",
            "Marriage",
            "CompOff",
            "OnDuty",
            "Sabbatical",
            "LOP",
        ],
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

    totalDays: {
        type: Number,
        required: true,
    },

    session: {
        type: String,
        enum: ["Full Day", "FN", "AN"],
        default: "Full Day",
    },

    reason: {
        type: String,
        required: true,
    },

    attachment: documentSchema,

    status: {
        type: String,
        enum: [
            "Pending",
            "Approved",
            "Rejected",
            "Cancelled",
        ],
        default: "Pending",
    },

    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
    },

    approvedAt: Date,

    remarks: String,
},
{
    timestamps: true,
});

module.exports = mongoose.model("Leave", leaveSchema);