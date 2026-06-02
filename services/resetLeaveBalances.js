const Faculty = require("../models/Faculty");
const LeaveType = require("../models/Leave/leaveType");
const LeaveBalance = require("../models/Leave/leaveBalance");

const getCurrentAcademicYear = require("../utils/getCurrentAcademicYear");
const getNextAcademicYear = require("../utils/getNextAcademicYear");

const resetLeaveBalances = async () => {
  const currentAcademicYear = getCurrentAcademicYear();

  const nextAcademicYear = getNextAcademicYear();

  const faculties = await Faculty.find({
    employmentStatus: true,
  });

  const leaveTypes = await LeaveType.find({
    isActive: true,
  });

  for (const faculty of faculties) {
    for (const leaveType of leaveTypes) {
      if (leaveType.resetFrequency !== "Academic Year") {
        continue;
      }

      if (!leaveType.employeeCategories.includes(faculty.employeeCategory)) {
        continue;
      }

      const oldBalance = await LeaveBalance.findOne({
        facultyId: faculty._id,
        leaveTypeId: leaveType._id,
        academicYear: currentAcademicYear,
      });

      let carryForward = 0;

      if (oldBalance && leaveType.carryForwardAllowed) {
        carryForward = Math.min(
          oldBalance.remainingDays,
          leaveType.maxCarryForwardDays,
        );
      }

      await LeaveBalance.findOneAndUpdate(
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,
          academicYear: nextAcademicYear,
        },
        {
          facultyId: faculty._id,
          leaveTypeId: leaveType._id,

          academicYear: nextAcademicYear,

          allocatedDays: leaveType.daysPerYear,

          usedDays: 0,

          remainingDays: leaveType.daysPerYear + carryForward,
        },
        {
          upsert: true,
          new: true,
        },
      );
    }
  }
};

module.exports = resetLeaveBalances;
