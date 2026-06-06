const Attendance = require("../models/attendance");
const Faculty = require("../models/Faculty");

async function processAttendancePunches(punches) {
  for (const punch of punches) {
    const faculty = await Faculty.findOne({
      punchId: String(punch.UserId),
    });

    if (!faculty) {
      console.log(`Faculty not found for punchId ${punch.UserId}`);
      continue;
    }

    const logDate = new Date(punch.LogDate);

    const attendanceDate = new Date(
      logDate.getFullYear(),
      logDate.getMonth(),
      logDate.getDate(),
    );

    const attendance = await Attendance.findOne({
      facultyId: faculty._id,
      attendanceDate,
    });

    if (!attendance) {
      await Attendance.create({
        facultyId: faculty._id,
        punchId: faculty.punchId,
        attendanceDate,
        inTime: logDate,
        outTime: logDate,
        totalPunches: 1,
        workingMinutes: 0,
        deviceIds: [punch.DeviceId],
      });

      continue;
    }

    if (logDate < attendance.inTime) {
      attendance.inTime = logDate;
    }

    if (logDate > attendance.outTime) {
      attendance.outTime = logDate;
    }

    attendance.totalPunches += 1;

    if (!attendance.deviceIds.includes(punch.DeviceId)) {
      attendance.deviceIds.push(punch.DeviceId);
    }

    attendance.workingMinutes = Math.floor(
      (attendance.outTime - attendance.inTime) / (1000 * 60),
    );

    await attendance.save();
  }
}

module.exports = {
  processAttendancePunches,
};
