const LeaveType = require("../../models/Leave/leaveType");
const Faculty = require("../../models/Faculty");

const LeaveBalance = require("../../models/Leave/leaveBalance");
const getCurrentAcademicYear = require("../../utils/getCurrentAcademicYear");

exports.addLeaveType = async (req, res) => {
  try {
    const existingLeaveType = await LeaveType.findOne({
      leaveName: req.body.leaveName,
    });

    if (existingLeaveType) {
      return res.status(400).json({
        success: false,
        message: "Leave type already exists",
      });
    }

    const leaveType = await LeaveType.create(req.body);

    const faculties = await Faculty.find({
      employmentStatus: true,
      employeeCategory: {
        $in: leaveType.employeeCategories,
      },
    });

    const academicYear = getCurrentAcademicYear();

    for (const faculty of faculties) {
      await LeaveBalance.findOneAndUpdate(
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,
          academicYear,
        },
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,
          academicYear,
          allocatedDays: leaveType.daysPerYear,
          usedDays: 0,
          remainingDays: leaveType.daysPerYear,
        },
        {
          upsert: true,
          new: true,
        },
      );
    }
    res.status(201).json({
      success: true,
      message: "Leave type created successfully",
      leaveType,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getLeaveTypes = async (req, res) => {
  try {
    const leaveTypes = await LeaveType.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: leaveTypes.length,
      leaveTypes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getLeaveTypeById = async (req, res) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found",
      });
    }

    res.status(200).json({
      success: true,
      leaveType,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateLeaveType = async (req, res) => {
  try {
    const oldLeaveType = await LeaveType.findById(
      req.params.id
    );

    if (!oldLeaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found",
      });
    }

    const leaveType = await LeaveType.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    const academicYear =
      getCurrentAcademicYear();

    // Existing balances
    const balances = await LeaveBalance.find({
      leaveTypeId: leaveType._id,
    }).populate("facultyId");

    for (const balance of balances) {
      const faculty = balance.facultyId;

      // Category removed
      if (
        !leaveType.employeeCategories.includes(
          faculty.employeeCategory
        )
      ) {
        await LeaveBalance.findByIdAndDelete(
          balance._id
        );

        continue;
      }

      // Recalculate balance
      const used = balance.usedDays;

      balance.allocatedDays =
        leaveType.daysPerYear;

      balance.remainingDays =
        leaveType.daysPerYear - used;

      await balance.save();
    }

    // Category added
    const faculties = await Faculty.find({
      employmentStatus: true,
      employeeCategory: {
        $in: leaveType.employeeCategories,
      },
    });

    for (const faculty of faculties) {
      await LeaveBalance.findOneAndUpdate(
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,
          academicYear,
        },
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,
          academicYear,
          allocatedDays:
            leaveType.daysPerYear,
          usedDays: 0,
          remainingDays:
            leaveType.daysPerYear,
        },
        {
          upsert: true,
          new: true,
        }
      );
    }

    res.status(200).json({
      success: true,
      message:
        "Leave type updated successfully",
      leaveType,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteLeaveType = async (req, res) => {
  try {
    const leaveType = await LeaveType.findByIdAndDelete(req.params.id);

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found",
      });
    }

    await LeaveBalance.deleteMany({
      leaveTypeId: leaveType._id,
    });

    res.status(200).json({
      success: true,
      message: "Leave type deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
