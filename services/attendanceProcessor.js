const Attendance = require("../models/attendance");
const Holiday = require("../models/holiday");
const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const AttendanceLateCounter = require("../models/attendanceLateCounter");
const Permission = require("../models/permission.js");

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
      let leaveStatus = "Leave";

      if (leaveApplication.leaveSession === "First Half") {
        leaveStatus = "First Half Leave";
      }

      if (leaveApplication.leaveSession === "Second Half") {
        leaveStatus = "Second Half Leave";
      }

      if (!attendance) {
        attendance = await Attendance.create({
          facultyId: faculty._id,
          punchId: faculty.punchId,
          attendanceDate: date,

          status: leaveStatus,

          lopDays: 0,

          remarks: leaveApplication.leaveTypeId?.leaveName || "Leave",
        });
      } else {
        attendance.status = leaveStatus;

        attendance.lopDays = 0;

        attendance.remarks = leaveApplication.leaveTypeId?.leaveName || "Leave";

        await attendance.save();
      }

      continue;
    }
    // =================================
    // PERMISSION CHECK
    // =================================

    const permission = await Permission.findOne({
      facultyId: faculty._id,
      status: "Approved",
      permissionDate: {
        $gte: date,
        $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      },
    });
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

    shiftStartTime.setUTCHours(startHour, startMinute, 0, 0);

    shiftStartTime.setMinutes(shiftStartTime.getMinutes() - 330);

    const normalGraceEnd = new Date(shiftStartTime);

    normalGraceEnd.setMinutes(normalGraceEnd.getMinutes() + shift.graceTime);

    const lateGraceEnd = new Date(normalGraceEnd);

    lateGraceEnd.setMinutes(lateGraceEnd.getMinutes() + 10);

    const requiredMinutes = shift.workingMinutes;

    const hasCompletedWorkingHours =
      attendance.workingMinutes >= requiredMinutes;

    const punchInTime = attendance.inTime;

    if (!punchInTime) {
      attendance.status = "Absent";
      attendance.lopDays = 1;
      attendance.remarks = "No In Time Found";

      await attendance.save();
      continue;
    }

    let effectiveReportingTime = normalGraceEnd;

    let effectiveLateWindowEnd = lateGraceEnd;

    if (permission) {
      const [hour, minute] = permission.toTime.split(":").map(Number);

      effectiveReportingTime = new Date(date);

      effectiveReportingTime.setUTCHours(hour, minute, 0, 0);
      effectiveReportingTime.setMinutes(
        effectiveReportingTime.getMinutes() - 330,
      );

      effectiveLateWindowEnd = new Date(effectiveReportingTime);

      effectiveLateWindowEnd.setMinutes(
        effectiveLateWindowEnd.getMinutes() + 10,
      );

      console.log(`${faculty.empId} Permission Applied`);
    }

    // =================================
    // PRESENT
    // =================================

    const punchMinutes =
      punchInTime.getUTCHours() * 60 + punchInTime.getUTCMinutes();

    const reportingMinutes =
      effectiveReportingTime.getUTCHours() * 60 +
      effectiveReportingTime.getUTCMinutes();

    const lateWindowMinutes =
      effectiveLateWindowEnd.getUTCHours() * 60 +
      effectiveLateWindowEnd.getUTCMinutes();

    if (punchMinutes <= reportingMinutes) {
      if (hasCompletedWorkingHours) {
        attendance.status = "Present";

        attendance.lopDays = 0;

        attendance.remarks = "";

        await attendance.save();

        continue;
      }

      attendance.status = "Second Half Leave";

      attendance.lopDays = 0.5;

      attendance.remarks = "Second Half Absent - Insufficient Working Hours";

      await attendance.save();

      continue;
    }

    // =================================
    // LATE WINDOW
    // =================================

    if (punchMinutes <= lateWindowMinutes) {
      const month = date.getUTCMonth() + 1;
      const year = date.getUTCFullYear();

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
        await attendance.save();
      }

      if (lateCounter.lateCount <= 3) {
        if (hasCompletedWorkingHours) {
          attendance.status = "Present";

          attendance.lopDays = 0;

          attendance.remarks = `Late Entry ${lateCounter.lateCount}/3`;

          await attendance.save();

          continue;
        }

        attendance.status = "Second Half Leave";

        attendance.lopDays = 0.5;

        attendance.remarks = `Late Entry ${lateCounter.lateCount}/3 - Insufficient Working Hours`;

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
