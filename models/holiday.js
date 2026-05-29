const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
{
    holidayName: {
        type: String,
        required: true,
        trim: true,
    },

    holidayDate: {
        type: Date,
        required: true,
        unique: true,
    },

    holidayType: {
        type: String,
        enum: [
            "Government",
            "College",
            "Local",
        ],
        default: "Government",
    },

    description: String,

    isActive: {
        type: Boolean,
        default: true,
    },
},
{
    timestamps: true,
});

module.exports = mongoose.model(
    "Holiday",
    holidaySchema
);