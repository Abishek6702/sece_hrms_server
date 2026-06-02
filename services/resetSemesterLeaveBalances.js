const Faculty = require("../models/faculty");
const LeaveType = require("../models/Leave/leaveType");
const LeaveBalance = require("../models/Leave/leaveBalance");

const getCurrentAcademicYear = require("../utils/getCurrentAcademicYear");

const resetSemesterLeaveBalances = async () => {
  const academicYear = getCurrentAcademicYear();

  const faculties = await Faculty.find({
    employmentStatus: true,
  });

  const leaveTypes = await LeaveType.find({
    isActive: true,
    resetFrequency: "Semester",
  });

  for (const faculty of faculties) {
    for (const leaveType of leaveTypes) {
      if (!leaveType.employeeCategories.includes(faculty.employeeCategory)) {
        continue;
      }

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
  }
};

module.exports = resetSemesterLeaveBalances;
