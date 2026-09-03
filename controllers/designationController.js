const Designation = require("../models/Designation");

// CREATE
exports.createDesignation = async (req, res) => {
  try {
    const designation = await Designation.create(req.body);

    res.status(201).json({
      success: true,
      data: designation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ALL
exports.getDesignations = async (req, res) => {
  try {
    const designations = await Designation.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: designations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ONE
exports.getDesignationById = async (req, res) => {
  try {
    const designation = await Designation.findById(req.params.id);

    if (!designation) {
      return res.status(404).json({
        message: "Designation not found",
      });
    }

    res.status(200).json({
      success: true,
      data: designation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// UPDATE
exports.updateDesignation = async (req, res) => {
  try {
    const designation = await Designation.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!designation) {
      return res.status(404).json({
        message: "Designation not found",
      });
    }

    res.status(200).json({
      success: true,
      data: designation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE
exports.deleteDesignation = async (req, res) => {
  try {
    const designation = await Designation.findByIdAndDelete(
      req.params.id
    );

    if (!designation) {
      return res.status(404).json({
        message: "Designation not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Designation deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
