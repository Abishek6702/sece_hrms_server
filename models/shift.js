const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema(
{
    shiftName: {
        type: String,
        required: true,
        unique: true,
    },

    startTime: {
        type: String,
        required: true,
    },

    endTime: {
        type: String,
        required: true,
    },

    graceTime: {
        type: Number,
        default: 0,
    },

    workingMinutes: {
        type: Number,
        required: true,
    },

    isActive: {
        type: Boolean,
        default: true,
    },
},
{
    timestamps: true,
});

module.exports = mongoose.model("Shift", shiftSchema);