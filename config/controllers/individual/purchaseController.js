// controllers/purchase/purchaseController.js

const Purchase = require("../../models/individual/IndividualPurchase");

// ==============================
// CREATE
// ==============================
exports.createPurchase = async (req, res) => {
  try {
    console.log("BODY =>", req.body);

    const purchase = await Purchase.create(req.body);

    res.status(201).json({
      success: true,
      message: "Purchase created successfully",
      data: purchase,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// GET ALL
// ==============================
exports.getAllPurchase = async (req, res) => {
  try {
    const purchases = await Purchase.find()
      .populate("employee")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: purchases.length,
      data: purchases,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// GET SINGLE
// ==============================
exports.getSinglePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(
      req.params.id
    ).populate("employee");

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// UPDATE
// ==============================
exports.updatePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Purchase updated successfully",
      data: purchase,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// DELETE
// ==============================
exports.deletePurchase = async (req, res) => {
  try {
    const purchase =
      await Purchase.findByIdAndDelete(
        req.params.id
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Purchase deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// PATCH
// ==============================
exports.patchPurchase = async (req, res) => {
  try {
    console.log("BODY =>", req.body);

    // EMPTY BODY CHECK
    if (
      !req.body ||
      Object.keys(req.body).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Request body is empty",
      });
    }

    const purchase = await Purchase.findById(
      req.params.id
    );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // UPDATE ONLY SENT FIELDS
    Object.keys(req.body).forEach((key) => {
      purchase[key] = req.body[key];
    });

    await purchase.save();

    res.status(200).json({
      success: true,
      message:
        "Purchase patched successfully",
      data: purchase,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// controllers/purchaseDashboardController.js

exports.getPurchaseDashboard =
  async (req, res) => {
    try {
      // ==============================
      // CARD COUNTS
      // ==============================

      const totalRequests =
        await Purchase.countDocuments();

      const completedRequests =
        await Purchase.countDocuments({
          status: "Completed",
        });

      const acknowledgedRequests =
        await Purchase.countDocuments({
          status: "Approved",
        });

      const pendingAcknowledgementRequests =
        await Purchase.countDocuments({
          status: "Pending",
        });

      // ==============================
      // DEPARTMENT WISE
      // ==============================

      const departmentWise =
        await Purchase.aggregate([
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
        await Purchase.find()
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