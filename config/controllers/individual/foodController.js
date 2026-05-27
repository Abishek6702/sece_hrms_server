// controllers/foodController.js

const Food = require("../../models/individual/IndividualFood");

// ==========================================
// CREATE FOOD
// ==========================================
exports.createFood = async (req, res) => {
  try {
    console.log("BODY =>", req.body);

    const food = await Food.create(req.body);

    res.status(201).json({
      success: true,
      message: "Food request created successfully",
      data: food,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to create food request",
      error: error.message,
    });
  }
};

// ==========================================
// GET ALL FOOD REQUESTS
// ==========================================
exports.getAllFoods = async (req, res) => {
  try {
    const foods = await Food.find()
      .populate("employee")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: foods.length,
      data: foods,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch food requests",
      error: error.message,
    });
  }
};

// ==========================================
// GET SINGLE FOOD REQUEST
// ==========================================
exports.getFoodById = async (req, res) => {
  try {
    const food = await Food.findById(req.params.id)
      .populate("employee");

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: food,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch food request",
      error: error.message,
    });
  }
};

// ==========================================
// UPDATE FOOD REQUEST
// ==========================================
exports.updateFood = async (req, res) => {
  try {
    const food = await Food.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Food request updated successfully",
      data: food,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to update food request",
      error: error.message,
    });
  }
};

// ==========================================
// DELETE FOOD REQUEST
// ==========================================
exports.deleteFood = async (req, res) => {
  try {
    const food = await Food.findByIdAndDelete(
      req.params.id
    );

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Food request deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete food request",
      error: error.message,
    });
  }
};

// ==========================================
// PATCH FOOD REQUEST
// ==========================================
exports.patchFood = async (req, res) => {
  try {
    console.log("BODY =>", req.body);

    if (
      !req.body ||
      Object.keys(req.body).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Request body is empty",
      });
    }

    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food request not found",
      });
    }

    // UPDATE ONLY SENT FIELDS
    Object.keys(req.body).forEach((key) => {
      food[key] = req.body[key];
    });

    await food.save();

    res.status(200).json({
      success: true,
      message: "Food request patched successfully",
      data: food,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to patch food request",
      error: error.message,
    });
  }
};

// controllers/foodDashboardController.js


exports.getFoodDashboard = async (
  req,
  res
) => {
  try {
    // ==============================
    // CARD COUNTS
    // ==============================

    const totalRequests =
      await Food.countDocuments();

    const completedRequests =
      await Food.countDocuments({
        status: "Completed",
      });

    const acknowledgedRequests =
      await Food.countDocuments({
        status: "Approved",
      });

    const pendingAcknowledgementRequests =
      await Food.countDocuments({
        status: "Pending",
      });

    // ==============================
    // DEPARTMENT WISE
    // ==============================

    const departmentWise =
      await Food.aggregate([
        {
          $lookup: {
            from: "faculties",
            localField: "employee",
            foreignField: "_id",
            as: "facultyData",
          },
        },

        {
          $unwind: "$facultyData",
        },

        {
          $group: {
            _id: "$facultyData.department",
            total: { $sum: 1 },
          },
        },

        {
          $project: {
            _id: 0,
            department: "$_id",
            total: 1,
          },
        },
      ]);

    // ==============================
    // LATEST REQUESTS
    // ==============================

    const latestRequests =
      await Food.find()
        .populate("employee")
        .sort({ createdAt: -1 })
        .limit(10);

    // ==============================
    // RESPONSE
    // ==============================

    res.status(200).json({
      success: true,

      cards: {
        totalRequests,
        completedRequests,
        acknowledgedRequests,
        pendingAcknowledgementRequests,
      },

      departmentWise,

      latestRequests,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};