const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
{
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
        required: true,
    },

    attendanceDate: {
        type: Date,
        required: true,
    },

    checkIn: Date,

    checkOut: Date,

    workingHours: {
        type: Number,
        default: 0,
    },

    status: {
        type: String,
        enum: [
            "Present",
            "Absent",
            "Half Day",
            "Leave",
            "On Duty",
            "Holiday",
        ],
        default: "Present",
    },

    leaveId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Leave",
    },

    permissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
    },

    remarks: String,
},
{
    timestamps: true,
});

attendanceSchema.index(
{
    facultyId: 1,
    attendanceDate: 1,
},
{
    unique: true,
});

module.exports = mongoose.model(
    "Attendance",
    attendanceSchema
);