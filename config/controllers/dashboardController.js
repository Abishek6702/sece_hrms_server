const Event = require("../models/Event");
const Faculty = require("../models/Faculty");

exports.getDashboardStats = async (req, res) => {
  try {
    // for faculty login use:
    // const filter = { organizerId: req.user.id };

    // for admin:
    const filter = {
      status: { $ne: "Draft" },
    };

    // =========================
    // EVENT LEVEL COUNTS
    // =========================

    const totalEvents = await Event.countDocuments(filter);

    const completedEvents = await Event.countDocuments({
      ...filter,
      status: "Closed",
    });

    const approvedEvents = await Event.countDocuments({
      ...filter,
      status: "Approved",
    });

    const pendingEvents = await Event.countDocuments({
      ...filter,
      status: {
        $in: ["Submitted", "HodApproved", "DepartmentReview"],
      },
    });

    // =========================
    // MODULES
    // =========================

    const modules = {
      venue: "venueDetails",
      icts: "ictsDetails",
      audio: "audioDetails",
      transport: "transportDetails",
      refreshment: "refreshmentDetails",
      accommodation: "accommodationDetails",
      purchase: "purchaseDetails",
      media: "mediaRequirementDetails",
    };

    const moduleStats = {};

    for (const key in modules) {
      const path = modules[key];

      // total module requests
      const total = await Event.countDocuments({
        ...filter,
        [path]: { $exists: true },
      });

      // approved / acknowledged
      const approved = await Event.countDocuments({
        ...filter,
        [`${path}.status.status`]: "Acknowledged",
      });

      // completed
      const completed = await Event.countDocuments({
        ...filter,
        [`${path}.status.status`]: "Completed",
      });

      // pending
      const pending = await Event.countDocuments({
        ...filter,
        $or: [
          {
            [`${path}.status.status`]: "Pending for Acknowledge",
          },
          {
            [`${path}.status`]: { $exists: false },
          },
        ],
      });

      moduleStats[key] = {
        total,
        approved,
        completed,
        pending,
      };
    }

    return res.status(200).json({
      events: {
        total: totalEvents,
        completed: completedEvents,
        approved: approvedEvents,
        pending: pendingEvents,
      },
      modules: moduleStats,
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getDepartmentWiseStats = async (req, res) => {
  try {
    const { module } = req.query;

    const modules = {
      venue: "venueDetails",
      icts: "ictsDetails",
      audio: "audioDetails",
      transport: "transportDetails",
      refreshment: "refreshmentDetails",
      accommodation: "accommodationDetails",
      purchase: "purchaseDetails",
      media: "mediaRequirementDetails",
    };

    // validate module only if provided
    if (module && !modules[module]) {
      return res.status(400).json({
        message: "Invalid module",
      });
    }

    // if no module -> admin overall
    const path = module ? modules[module] : null;

    const matchCondition = path
      ? {
          status: { $ne: "Draft" },
          [path]: { $exists: true },
        }
      : {
          status: { $ne: "Draft" },
        };

    // TOTAL COUNT
    const totalCount = await Event.countDocuments(matchCondition);

    // all departments
    const departments = await Event.distinct(
      "requestDetails.organizerDetails.organizingDepartment",
    );

    // department wise counts
    const stats = await Event.aggregate([
      {
        $match: matchCondition,
      },

      {
        $group: {
          _id: "$requestDetails.organizerDetails.organizingDepartment",
          count: { $sum: 1 },
        },
      },
    ]);

    // convert array -> object
    const statsMap = {};

    stats.forEach((item) => {
      statsMap[item._id] = item.count;
    });

    // include all departments
    const departmentWise = departments.map((dept) => ({
      department: dept,
      count: statsMap[dept] || 0,
    }));

    return res.status(200).json({
      type: module || "admin",
      totalCount,
      departmentWise,
    });
  } catch (error) {
    console.error("Department stats error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getDepartmentWiseFacultyCount = async (req, res) => {
  try {
    const data = await Faculty.aggregate([
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          department: "$_id",
          count: 1,
        },
      },
      {
        $sort: { department: 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      totalDepartments: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
