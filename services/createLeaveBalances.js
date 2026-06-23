const Faculty = require("../models/Faculty");
const LeaveBalance = require("../models/Leave/leaveBalance");
const LeaveType = require("../models/Leave/leaveType");

const getCurrentAcademicYear = require("../utils/getCurrentAcademicYear");

const createLeaveBalances = async (facultyId) => {
  const academicYear = getCurrentAcademicYear();

  const faculty = await Faculty.findById(facultyId);

  if (!faculty) return;

  const leaveTypes = await LeaveType.find({
    isActive: true,
  });

  for (const leaveType of leaveTypes) {
    if (!leaveType.employeeCategories.includes(faculty.employeeCategory)) {
      continue;
    }
    // Gender check
    if (
      leaveType.leaveName.toLowerCase() === "maternity leave" &&
      faculty.gender !== "Female"
    ) {
      continue;
    }

    if (
      leaveType.leaveName.toLowerCase() === "paternity leave" &&
      faculty.gender !== "Male"
    ) {
      continue;
    }

    await LeaveBalance.findOneAndUpdate(
      {
        facultyId,
        leaveTypeId: leaveType._id,
        academicYear,
      },
      {
        facultyId,
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
};

module.exports = createLeaveBalances;
