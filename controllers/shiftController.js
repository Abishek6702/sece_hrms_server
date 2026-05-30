const Shift = require("../models/shift");

// CREATE
exports.createShift = async (req, res) => {
  try {
    const shift = await Shift.create(req.body);

    res.status(201).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ALL
exports.getShifts = async (req, res) => {
  try {
    const shifts = await Shift.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: shifts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ONE
exports.getShiftById = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// UPDATE
exports.updateShift = async (req, res) => {
  try {
    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE
exports.deleteShift = async (req, res) => {
  try {
    const shift = await Shift.findByIdAndDelete(
      req.params.id
    );

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shift deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};