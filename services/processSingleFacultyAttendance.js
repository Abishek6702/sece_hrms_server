const Attendance = require("../models/attendance");
const Holiday = require("../models/holiday");
const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const AttendanceLateCounter = require("../models/attendanceLateCounter");
const Permission = require("../models/permission");

async function processSingleFacultyAttendance(facultyId, attendanceDate) {
  const processDate = new Date(attendanceDate);
  processDate.setUTCHours(0, 0, 0, 0);

  const date = new Date(processDate);
  date.setUTCHours(18, 30, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);

  const nextAttendanceDate = new Date(date);
  nextAttendanceDate.setUTCDate(nextAttendanceDate.getUTCDate() + 1);

  const faculty = await Faculty.findById(facultyId).populate("shiftId");
  if (!faculty) {
    return false;
  }

  const isDriver = faculty.employeeCategory === "Driver";

  const isSupportStaff = [
    "Housekeeping",
    "Security",
    "Electrical-Maintenance",
  ].includes(faculty.employeeCategory);


  const shift = faculty.shiftId;

  if (!shift) {
    console.log(`Shift not assigned for ${faculty.empId}`);

    return;
  }

  let attendance = await Attendance.findOne({
    facultyId: faculty._id,
    attendanceDate: {
      $gte: date,
      $lt: nextAttendanceDate,
    },
  });

  // HOLIDAY

  const nextDate = new Date(processDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const holiday = await Holiday.findOne({
    isActive: true,
    applicableEmployeeCategories: faculty.employeeCategory,
    holidayDate: {
      $gte: processDate,
      $lt: nextDate,
    },
  });

  if (holiday && !attendance) {
    console.log("SKIPPED - Holiday and no attendance");
    return;
  }
  // SUNDAY CHECK

  const istDate = new Date(processDate);
  istDate.setUTCMinutes(istDate.getUTCMinutes() + 330);

  const isSunday = istDate.getUTCDay() === 0;

  if (isSunday && !attendance) {
    console.log("SKIPPED - Sunday and no attendance");
    return;
  }

  // LEAVE
  // console.log("checking leavev :", date);
  const leaveApplication = await LeaveApplication.findOne({
    facultyId: faculty._id,
    status: "Approved",
    fromDate: {
      $lte: processDate,
    },
    toDate: {
      $gte: processDate,
    },
  }).populate("leaveTypeId");
  // console.log("Leave Found:", leaveApplication);
  if (leaveApplication) {
    let leaveStatus = "Leave";
    console.log(`LEAVE FOUND - ${leaveStatus} ${leaveApplication._id}`);

    if (leaveApplication.leaveSession === "First Half") {
      leaveStatus = "First Half Leave";
    }

    if (leaveApplication.leaveSession === "Second Half") {
      leaveStatus = "Second Half Leave";
    }

    if (!attendance) {
      console.log("No attendance found -> Absent");
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
    console.log("Attendance marked as Leave");
    return;
  }
  // =================================
  // PERMISSION CHECK
  // =================================

  const permission = await Permission.findOne({
    // console.log(` Permission found till ${permission.toTime}`),
    facultyId: faculty._id,
    status: "Approved",

    permissionDate: {
      $gte: processDate,
      $lt: new Date(processDate.getTime() + 24 * 60 * 60 * 1000),
    },
  });
  // ABSENT

  if (!attendance) {
    await Attendance.create({
      facultyId: faculty._id,
      punchId: faculty.punchId,
      attendanceDate: date,

      status: "Absent",

      lopDays: 0,

      remarks: "No Punch Found",
    });

    return;
  }

  // MISSED PUNCH

  if (attendance.missedPunch) {
    attendance.status = "Missed Punch";

    attendance.remarks = "Only one punch found";

    await attendance.save();

    return;
  }

  // =================================
  // SUPPORT STAFF
  // =================================

  if (isSupportStaff) {
    if (attendance.workingMinutes >= shift.workingMinutes) {
      attendance.status = "Present";
      attendance.lopDays = 0;
      attendance.remarks = "";

      await attendance.save();
      return;
    }

    attendance.status = "Second Half Leave";
    attendance.lopDays = 0;
    attendance.remarks = "Insufficient Working Hours";

    await attendance.save();
    return;
  }

  // LATE LOGIC
  // NEXT STEP

  // =================================
  // SHIFT VALIDATION
  // =================================

  const [startHour, startMinute] = shift.startTime.split(":").map(Number);

  const shiftStartTime = new Date(attendance.attendanceDate);

  shiftStartTime.setUTCMinutes(
    shiftStartTime.getUTCMinutes() + startHour * 60 + startMinute,
  );

  const [endHour, endMinute] = shift.endTime.split(":").map(Number);

const shiftEndTime = new Date(attendance.attendanceDate);

shiftEndTime.setUTCMinutes(
  shiftEndTime.getUTCMinutes() +
  endHour * 60 +
  endMinute
);

  const normalGraceEnd = new Date(shiftStartTime);

  normalGraceEnd.setUTCMinutes(
    normalGraceEnd.getUTCMinutes() + shift.graceTime,
  );

  const lateGraceEnd = new Date(normalGraceEnd);

  lateGraceEnd.setUTCMinutes(lateGraceEnd.getUTCMinutes() + 10);

  const requiredMinutes = shift.workingMinutes;

  const hasCompletedWorkingHours = attendance.workingMinutes >= requiredMinutes;

  const punchInTime = attendance.inTime;
  const punchOutTime = attendance.outTime;

  if (!punchInTime) {
    attendance.status = "Absent";
    attendance.lopDays = 0;
    attendance.remarks = "No In Time Found";

    await attendance.save();
    return;
  }
  if (
    isDriver &&
    (
      !punchOutTime ||
      punchOutTime.getTime() < shiftEndTime.getTime()
    )
  ) {
      attendance.status = "Second Half Leave";
      attendance.lopDays = 0;
      attendance.remarks = "Early Out";
  
      await attendance.save();
      return;
  }
  let effectiveReportingTime = isDriver ? shiftStartTime : normalGraceEnd;

  let effectiveLateWindowEnd = isDriver
    ? new Date(shiftStartTime.getTime() + 10 * 60000)
    : lateGraceEnd;

  if (permission && !isDriver) {
    const [hour, minute] = permission.toTime.split(":").map(Number);

    effectiveReportingTime = new Date(attendance.attendanceDate);

    effectiveReportingTime.setUTCMinutes(
      effectiveReportingTime.getUTCMinutes() + hour * 60 + minute,
    );

    effectiveLateWindowEnd = new Date(effectiveReportingTime);

    effectiveLateWindowEnd.setUTCMinutes(
      effectiveLateWindowEnd.getUTCMinutes() + 10,
    );

    // console.log(`${faculty.empId} Permission Applied`);
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

      return;
    }

    attendance.status = "Second Half Leave";

    attendance.lopDays = 0;

    attendance.remarks = "Second Half Absent - Insufficient Working Hours";

    await attendance.save();

    return;
  }

  // =================================
  // LATE WINDOW
  // =================================

  if (punchMinutes <= lateWindowMinutes) {
    const attendanceDay = new Date(attendance.attendanceDate);
    attendanceDay.setUTCMinutes(attendanceDay.getUTCMinutes() + 330);

    const month = attendanceDay.getUTCMonth() + 1;
    const year = attendanceDay.getUTCFullYear();

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

        return;
      }

      attendance.status = "Second Half Leave";

      attendance.lopDays = 0;

      attendance.remarks = `Late Entry ${lateCounter.lateCount}/3 - Insufficient Working Hours`;

      await attendance.save();

      return;
    }

    attendance.status = "First Half Leave";

    attendance.lopDays = 0;

    attendance.remarks = "First Half Absent - Late Entry Limit Exceeded";

    await attendance.save();

    return;
  }

  // =================================
  // BEYOND LATE WINDOW
  // =================================

  attendance.status = "First Half Leave";

  attendance.lopDays = 0;

  attendance.remarks = "First Half Absent - Beyond Late Grace";

  await attendance.save();

  return true;
}

module.exports = {
  processSingleFacultyAttendance,
};
