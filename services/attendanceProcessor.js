const Attendance = require("../models/attendance");
const Holiday = require("../models/holiday");
const Faculty = require("../models/Faculty");
const LeaveApplication = require("../models/Leave/leaveApplication");
const AttendanceLateCounter = require("../models/attendanceLateCounter");
const Permission = require("../models/permission.js");

async function processAttendance(attendanceDate) {
  // Business date (IST day)
  const processDate = new Date(attendanceDate);
  processDate.setUTCHours(0, 0, 0, 0);

  // Attendance storage date (IST midnight stored in UTC)
  const date = new Date(processDate);
  date.setUTCHours(18, 30, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);

  console.log("================================");
  console.log("Process Date:", processDate.toISOString());
  console.log("Storage Date:", date.toISOString());
  console.log("================================");

  const faculties = await Faculty.find({
    employmentStatus: true,
  }).populate("shiftId");

  for (const faculty of faculties) {
    const isDriver = faculty.employeeCategory === "Driver";

    const isSupportStaff = [
      "Housekeeping",
      "Security",
      "Electrical-Maintenance",
    ].includes(faculty.employeeCategory);

    const nextAttendanceDate = new Date(date);
    nextAttendanceDate.setUTCDate(nextAttendanceDate.getUTCDate() + 1);

    let attendance = await Attendance.findOne({
      facultyId: faculty._id,
      attendanceDate: {
        $gte: date,
        $lt: nextAttendanceDate,
      },
    });

    console.log("Faculty:", faculty.empId);

    if (attendance) {
      console.log("Attendance Found");
      console.log("Attendance Date:", attendance.attendanceDate.toISOString());
      console.log("In Time:", attendance.inTime?.toISOString());
      console.log("Working Minutes:", attendance.workingMinutes);
    } else {
      console.log("Attendance NOT Found");
    }

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

    if (holiday) {
      continue;
    }
    // SUNDAY CHECK

    const istDate = new Date(processDate);
    istDate.setUTCMinutes(istDate.getUTCMinutes() + 330);

    const isSunday = istDate.getUTCDay() === 0;

    if (isSunday) {
      continue;
    }

    // LEAVE

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

    if (isSupportStaff) {
      if (attendance.workingMinutes >= shift.workingMinutes) {
        attendance.status = "Present";
        attendance.lopDays = 0;
        attendance.remarks = "";
  
        await attendance.save();
        continue;
      }
  
      attendance.status = "Second Half Leave";
      attendance.lopDays = 0;
      attendance.remarks = "Insufficient Working Hours";
  
      await attendance.save();
      continue;
    }

    const [startHour, startMinute] = shift.startTime.split(":").map(Number);

    // Base everything on the stored attendance date
    const shiftStartTime = new Date(attendance.attendanceDate);

    // attendanceDate = IST midnight stored in UTC (18:30 previous day)
    // Add the shift start time in IST
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

    console.log("Shift Start:", shiftStartTime.toISOString());
    console.log("Normal Grace End:", normalGraceEnd.toISOString());
    console.log("Late Window End:", lateGraceEnd.toISOString());

    const requiredMinutes = shift.workingMinutes;

    const hasCompletedWorkingHours =
      attendance.workingMinutes >= requiredMinutes;

    const punchInTime = attendance.inTime;
    const punchOutTime = attendance.outTime;

    if (!punchInTime) {
      attendance.status = "Absent";
      attendance.lopDays = 0;
      attendance.remarks = "No In Time Found";

      await attendance.save();
      continue;
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
        continue;
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
    console.log("Punch Minutes:", punchMinutes);
    console.log("Reporting Minutes:", reportingMinutes);
    console.log("Late Window Minutes:", lateWindowMinutes);
    if (punchMinutes <= reportingMinutes) {
      if (hasCompletedWorkingHours) {
        attendance.status = "Present";

        attendance.lopDays = 0;

        attendance.remarks = "";

        await attendance.save();
        console.log("FINAL STATUS:", attendance.status);
        console.log("REMARKS:", attendance.remarks);

        continue;
      }

      attendance.status = "Second Half Leave";

      attendance.lopDays = 0;

      attendance.remarks = "Second Half Absent - Insufficient Working Hours";

      await attendance.save();

      continue;
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

          continue;
        }

        attendance.status = "Second Half Leave";

        attendance.lopDays = 0;

        attendance.remarks = `Late Entry ${lateCounter.lateCount}/3 - Insufficient Working Hours`;

        await attendance.save();

        continue;
      }

      attendance.status = "First Half Leave";

      attendance.lopDays = 0;

      attendance.remarks = "First Half Absent - Late Entry Limit Exceeded";

      await attendance.save();

      continue;
    }

    // =================================
    // BEYOND LATE WINDOW
    // =================================

    attendance.status = "First Half Leave";

    attendance.lopDays = 0;

    attendance.remarks = "First Half Absent - Beyond Late Grace";

    await attendance.save();

    continue;
  }
}

module.exports = {
  processAttendance,
};
