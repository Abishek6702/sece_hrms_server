const Attendance = require("../models/attendance");
const Holiday = require("../models/holiday");
const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const AttendanceLateCounter = require("../models/attendanceLateCounter");

async function processAttendance(attendanceDate) {
  const date = new Date(attendanceDate);

  date.setHours(0, 0, 0, 0);

  const faculties = await Faculty.find({
    employmentStatus: true,
  }).populate("shiftId");

  for (const faculty of faculties) {
    let attendance = await Attendance.findOne({
      facultyId: faculty._id,
      attendanceDate: date,
    });

    // HOLIDAY

    const holiday = await Holiday.findOne({
      holidayDate: date,
      isActive: true,
      applicableEmployeeCategories: faculty.employeeCategory,
    });

    if (holiday) {
      if (attendance) {
        attendance.status = "Holiday";
        attendance.lopDays = 0;
        attendance.remarks = holiday.holidayName;

        await attendance.save();
      }

      continue;
    }

    // LEAVE

    const leaveApplication = await LeaveApplication.findOne({
      facultyId: faculty._id,
      status: "Approved",
      fromDate: {
        $lte: date,
      },
      toDate: {
        $gte: date,
      },
    }).populate("leaveTypeId");

    if (leaveApplication) {
      if (!attendance) {
        attendance = await Attendance.create({
          facultyId: faculty._id,
          punchId: faculty.punchId,
          attendanceDate: date,

          status: "Leave",

          lopDays: 0,

          remarks: leaveApplication.leaveTypeId?.leaveName || "Leave",
        });
      } else {
        attendance.status = "Leave";

        attendance.lopDays = 0;

        attendance.remarks = leaveApplication.leaveTypeId?.leaveName || "Leave";

        await attendance.save();
      }

      continue;
    }

    // ABSENT

    if (!attendance) {
      await Attendance.create({
        facultyId: faculty._id,
        punchId: faculty.punchId,
        attendanceDate: date,

        status: "Absent",

        lopDays: 1,

        remarks: "No Punch Found",
      });

      continue;
    }

    // MISSED PUNCH

    if (attendance.missedPunch) {
      attendance.status = "Missed Punch";

      attendance.remarks = "Only one punch found";

      await attendance.save();

      continue;
    }

    // LATE LOGIC
    // NEXT STEP

    // =================================
    // SHIFT VALIDATION
    // =================================

    const shift = faculty.shiftId;

    if (!shift) {
      console.log(`Shift not assigned for ${faculty.empId}`);

      continue;
    }

    const [startHour, startMinute] = shift.startTime.split(":").map(Number);

    const shiftStartTime = new Date(date);

    shiftStartTime.setHours(startHour, startMinute, 0, 0);

    const normalGraceEnd = new Date(shiftStartTime);

    normalGraceEnd.setMinutes(normalGraceEnd.getMinutes() + shift.graceTime);

    const lateGraceEnd = new Date(normalGraceEnd);

    lateGraceEnd.setMinutes(lateGraceEnd.getMinutes() + 10);

    const punchInTime = attendance.inTime;

    // =================================
    // PRESENT
    // =================================

    if (punchInTime <= normalGraceEnd) {
      attendance.status = "Present";

      attendance.remarks = "";

      await attendance.save();

      continue;
    }

    // =================================
    // LATE WINDOW
    // =================================

    if (punchInTime <= lateGraceEnd) {
      const month = date.getMonth() + 1;

      const year = date.getFullYear();

      let lateCounter = await AttendanceLateCounter.findOne({
        facultyId: faculty._id,
        month,
        year,
      });

      if (!lateCounter) {
        lateCounter = await AttendanceLateCounter.create({
          facultyId: faculty._id,
          month,
          year,
          lateCount: 0,
        });
      }

      if (!attendance.lateCountApplied) {
        lateCounter.lateCount += 1;

        await lateCounter.save();

        attendance.lateCountApplied = true;
      }

      if (lateCounter.lateCount <= 3) {
        attendance.status = "Present";

        attendance.remarks = `Late Entry ${lateCounter.lateCount}/3`;

        await attendance.save();

        continue;
      }

      attendance.status = "First Half Leave";

      attendance.lopDays = 0.5;

      attendance.remarks = "First Half Absent - Late Entry Limit Exceeded";

      await attendance.save();

      continue;
    }

    // =================================
    // BEYOND LATE WINDOW
    // =================================

    attendance.status = "First Half Leave";

    attendance.lopDays = 0.5;

    attendance.remarks = "First Half Absent - Beyond Late Grace";

    await attendance.save();

    continue;
  }
}

module.exports = {
  processAttendance,
};
