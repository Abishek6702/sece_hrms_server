const Attendance = require("../models/attendance");
const Faculty = require("../models/Faculty");

async function getAttendanceMuster(req, res) {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const { department, employeeCategory, search } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    startDate.setMinutes(startDate.getMinutes() - 330);

    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    endDate.setMinutes(endDate.getMinutes() - 330);

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const facultyFilter = {
      employmentStatus: true,
    };

    if (department) {
      facultyFilter.department = department;
    }

    if (employeeCategory) {
      facultyFilter.employeeCategory = employeeCategory;
    }

    if (search) {
      facultyFilter.$or = [
        { empId: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
              regex: search,
              options: "i",
            },
          },
        },
      ];
    }

    const faculties = await Faculty.find(facultyFilter).select(
      "empId firstName lastName designation  department employeeCategory",
    );

    const facultyIds = faculties.map((faculty) => faculty._id);

    const attendances = await Attendance.find({
      facultyId: { $in: facultyIds },
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const attendanceMap = {};

    attendances.forEach((attendance) => {
      const facultyId = attendance.facultyId.toString();

      if (!attendanceMap[facultyId]) {
        attendanceMap[facultyId] = {};
      }

      const day = attendance.inTime
        ? attendance.inTime.getUTCDate()
        : attendance.attendanceDate.getUTCDate();

      let value = "-";

      switch (attendance.status) {
        case "Present":
          value = "P";
          break;

        case "Absent":
          value = "A";
          break;

        case "Leave":
          value = "L";
          break;

        case "Holiday":
          value = "H";
          break;

        case "First Half Leave":
          value = "A:P";
          break;

        case "Second Half Leave":
          value = "P:A";
          break;

        case "Missed Punch":
          value = "MP";
          break;
      }

      if (attendanceMap[facultyId][day] === undefined) {
        attendanceMap[facultyId][day] = value;
      }
    });

    const employees = faculties.map((faculty) => {
      const attendanceDays = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(Date.UTC(year, month - 1, day));

        const facultyAttendance = attendanceMap[faculty._id.toString()] || {};

        if (facultyAttendance[day]) {
          attendanceDays[day] = facultyAttendance[day];
        } else if (currentDate.getUTCDay() === 0) {
          attendanceDays[day] = "OFF";
        } else {
          attendanceDays[day] = "-";
        }
      }

      return {
        facultyId: faculty._id,
        empId: faculty.empId,
        employeeName: [faculty.firstName, faculty.middleName, faculty.lastName]
          .filter(Boolean)
          .join(" "),
        designation: faculty.designation,
        department: faculty.department,
        employeeCategory:faculty.employeeCategory,
        attendance: attendanceDays,
      };
    });

    return res.status(200).json({
      success: true,
      month,
      year,
      daysInMonth,
      employees,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance muster",
    });
  }
}

module.exports = {
  getAttendanceMuster,
};
