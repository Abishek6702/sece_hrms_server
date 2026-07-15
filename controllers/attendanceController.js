const mongoose = require("mongoose");

const Attendance = require("../models/attendance");
const Faculty = require("../models/Faculty");
const Holiday = require("../models/holiday");

exports.getAttendanceMuster = async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const { department, employeeCategory, search, facultyId } = req.query;

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

    if (facultyId) {
      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid facultyId",
        });
      }

      facultyFilter._id = facultyId;
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
      "empId firstName middleName lastName designation department employeeCategory",
    );

    const facultyIds = faculties.map((faculty) => faculty._id);

    const attendances = await Attendance.find({
      facultyId: { $in: facultyIds },
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const holidays = await Holiday.find({
      isActive: true,
      holidayDate: {
        $gte: startDate,
        $lte: endDate,
      },
    }).select("holidayDate applicableEmployeeCategories");

    const attendanceMap = {};

    attendances.forEach((attendance) => {
      const facultyId = attendance.facultyId.toString();

      if (!attendanceMap[facultyId]) {
        attendanceMap[facultyId] = {};
      }

      let day;

      if (attendance.inTime) {
        day = attendance.inTime.getUTCDate();
      } else {
        const istDate = new Date(attendance.attendanceDate);
        istDate.setMinutes(istDate.getMinutes() + 330);

        day = istDate.getUTCDate();
      }

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

      attendanceMap[facultyId][day] = value;
    });

    const employees = faculties.map((faculty) => {
      const attendanceDays = {};

      const facultyAttendance = attendanceMap[faculty._id.toString()] || {};

      const facultyHolidayMap = new Set();

      holidays.forEach((holiday) => {
        if (
          holiday.applicableEmployeeCategories?.includes(
            faculty.employeeCategory,
          )
        ) {
          const istDate = new Date(holiday.holidayDate);

          istDate.setMinutes(istDate.getMinutes() + 330);

          facultyHolidayMap.add(istDate.getUTCDate());
        }
      });

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(Date.UTC(year, month - 1, day));

        // Attendance exists -> show attendance
        if (facultyAttendance[day] !== undefined) {
          attendanceDays[day] = facultyAttendance[day];
        }
        // Sunday or Holiday without attendance
        else if (currentDate.getUTCDay() === 0 || facultyHolidayMap.has(day)) {
          attendanceDays[day] = "OFF";
        }
        // No record
        else {
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
        employeeCategory: faculty.employeeCategory,
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
};

exports.getAttendanceMusterV1 = async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const { department, employeeCategory, search, facultyId } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const startDate = new Date(Date.UTC(year, month - 2, 26));
    startDate.setMinutes(startDate.getMinutes() - 330);

    const endDate = new Date(Date.UTC(year, month - 1, 25, 23, 59, 59));
    endDate.setMinutes(endDate.getMinutes() - 330);

    const facultyFilter = {
      employmentStatus: true,
    };

    if (department) {
      facultyFilter.department = department;
    }

    if (employeeCategory) {
      facultyFilter.employeeCategory = employeeCategory;
    }

    if (facultyId) {
      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid facultyId",
        });
      }

      facultyFilter._id = facultyId;
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
      "empId firstName middleName lastName designation department employeeCategory",
    );

    const facultyIds = faculties.map((faculty) => faculty._id);

    const attendances = await Attendance.find({
      facultyId: { $in: facultyIds },
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const holidays = await Holiday.find({
      isActive: true,
      holidayDate: {
        $gte: startDate,
        $lte: endDate,
      },
    }).select("holidayDate applicableEmployeeCategories");

    const attendanceMap = {};

    attendances.forEach((attendance) => {
      const facultyId = attendance.facultyId.toString();

      if (!attendanceMap[facultyId]) {
        attendanceMap[facultyId] = {};
      }

      let day;

      if (attendance.inTime) {
        day = attendance.inTime.getUTCDate();
      } else {
        const istDate = new Date(attendance.attendanceDate);
        istDate.setMinutes(istDate.getMinutes() + 330);

        day = istDate.getUTCDate();
      }

      // Decide which status to display
      let displayStatus = attendance.status;

      if (attendance.isOverridden) {
        displayStatus = attendance.overrideStatus;
      } else if (attendance.regularization) {
        displayStatus = attendance.regularizationStatus;
      }

      let value = "-";

      switch (displayStatus) {
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

        case "Half Day":
          value = "HD";
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

        case "On Duty":
          value = "OD";
          break;

        case "First Half OD":
          value = "OD:P";
          break;

        case "Second Half OD":
          value = "P:OD";
          break;
      }

      attendanceMap[facultyId][day] = {
        status: value,
        isOverridden: attendance.isOverridden,
        regularization: attendance.regularization,
      };
    });

    const employees = faculties.map((faculty) => {
      const attendanceDays = [];

      const facultyAttendance = attendanceMap[faculty._id.toString()] || {};

      const facultyHolidayMap = new Set();

      holidays.forEach((holiday) => {
        if (
          holiday.applicableEmployeeCategories?.includes(
            faculty.employeeCategory,
          )
        ) {
          const istDate = new Date(holiday.holidayDate);

          istDate.setMinutes(istDate.getMinutes() + 330);

          facultyHolidayMap.add(istDate.getUTCDate());
        }
      });
      const musterDays = [];

      const previousMonthDays = new Date(
        Date.UTC(year, month - 1, 0),
      ).getUTCDate();

      for (let day = 26; day <= previousMonthDays; day++) {
        musterDays.push(day);
      }

      for (let day = 1; day <= 25; day++) {
        musterDays.push(day);
      }
      for (const day of musterDays) {
        let dateObj;

        if (day >= 26) {
          dateObj = new Date(Date.UTC(year, month - 2, day));
        } else {
          dateObj = new Date(Date.UTC(year, month - 1, day));
        }

        // Attendance exists -> show attendance
        if (facultyAttendance[day] !== undefined) {
          attendanceDays.push({
            day,
            status: facultyAttendance[day],
          });
        }

        // Sunday or Holiday without attendance
        else if (dateObj.getUTCDay() === 0 || facultyHolidayMap.has(day)) {
          attendanceDays.push({
            day,
            status: "OFF",
          });
        }
        // No record
        else {
          attendanceDays.push({
            day,
            status: "-",
          });
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
        employeeCategory: faculty.employeeCategory,
        attendance: attendanceDays,
      };
    });
    const previousMonthDays = new Date(
      Date.UTC(year, month - 1, 0),
    ).getUTCDate();

    const musterDays = [];

    for (let day = 26; day <= previousMonthDays; day++) {
      musterDays.push(day);
    }

    for (let day = 1; day <= 25; day++) {
      musterDays.push(day);
    }
    return res.status(200).json({
      success: true,
      month,
      year,
      musterDays,
      employees,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance muster",
    });
  }
};

const formatISTDate = (date) => {
  const istDate = new Date(date);
  istDate.setMinutes(istDate.getMinutes() + 330);

  return istDate.toISOString().split("T")[0];
};
exports.getFacultyAttendanceHistory = async (req, res) => {
  try {
    const { facultyId, fromDate, toDate, status } = req.query;

    if (!facultyId) {
      return res.status(400).json({
        success: false,
        message: "facultyId is required",
      });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate and toDate are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid facultyId",
      });
    }

    const faculty = await Faculty.findById(facultyId).populate(
      "shiftId",
      "shiftName workingMinutes"
    );

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(toDate);
    endDate.setHours(0, 0, 0, 0);

    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate cannot be greater than toDate",
      });
    }

    const records = [];

    let current = new Date(startDate);

    while (current <= endDate) {
      const date = new Date(current);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const attendance = await Attendance.findOne({
        facultyId,
        attendanceDate: {
          $gte: date,
          $lt: nextDate,
        },
      }).lean();

      if (attendance) {
        records.push({
          attendanceId: attendance._id,
          date: formatISTDate(attendance.attendanceDate),
          checkIn: attendance.inTime,
          checkOut: attendance.outTime,
          workingHours: attendance.workingMinutes,
          status: attendance.status,
          regularizationStatus: attendance.regularizationStatus,
          shift: faculty.shiftId
            ? {
                shiftId: faculty.shiftId._id,
                shiftName: faculty.shiftId.shiftName,
                workingMinutes: faculty.shiftId.workingMinutes,
              }
            : null,
        });

        current.setDate(current.getDate() + 1);
        continue;
      }

      const holiday = await Holiday.findOne({
        isActive: true,
        applicableEmployeeCategories: faculty.employeeCategory,
        holidayDate: {
          $gte: date,
          $lt: nextDate,
        },
      }).lean();

      if (holiday) {
        records.push({
          date: formatISTDate(date),
          checkIn: null,
          checkOut: null,
          workingHours: 0,
          status: "Holiday",
          holidayName: holiday.holidayName,
        });

        current.setDate(current.getDate() + 1);
        continue;
      }

      if (date.getDay() === 0) {
        records.push({
          date: formatISTDate(date),
          checkIn: null,
          checkOut: null,
          workingHours: 0,
          status: "OFF",
        });

        current.setDate(current.getDate() + 1);
        continue;
      }

      records.push({
        date: formatISTDate(date),
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: "-",
      });

      current.setDate(current.getDate() + 1);
    }

    // Latest date first
    records.reverse();

    let filteredRecords = records;

    if (status) {
      filteredRecords = filteredRecords.filter(
        (record) =>
          record.status &&
          record.status.toLowerCase() === status.toLowerCase()
      );
    }

    return res.status(200).json({
      success: true,
      totalRecords: filteredRecords.length,
      records: filteredRecords,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance history",
    });
  }
};

exports.getAttendanceWeekSummary = async (req, res) => {
  try {
    const { facultyId, dayName } = req.query;

    if (!facultyId) {
      return res.status(400).json({
        success: false,
        message: "facultyId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid facultyId",
      });
    }

    const today = new Date();

    const currentDay = today.getDay(); // 0=Sun,1=Mon

    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const attendances = await Attendance.find({
      facultyId,
      attendanceDate: {
        $gte: monday,
        $lte: sunday,
      },
    }).sort({ attendanceDate: 1 });

    const attendanceMap = {};

    attendances.forEach((item) => {
      const attendanceDate = item.inTime || item.attendanceDate;

      const key = `${attendanceDate.getFullYear()}-${String(
        attendanceDate.getMonth() + 1,
      ).padStart(2, "0")}-${String(attendanceDate.getDate()).padStart(2, "0")}`;

      attendanceMap[key] = item;
    });

    const weekDays = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(date.getDate()).padStart(2, "0")}`;

      const attendance = attendanceMap[key];

      weekDays.push({
        dayName: date.toLocaleDateString("en-US", {
          weekday: "short",
        }),

        date: key,

        isToday: date.toDateString() === new Date().toDateString(),

        status: attendance?.status || "-",

        inTime: attendance?.inTime || null,

        outTime: attendance?.outTime || null,
      });
    }
    let filteredDays = weekDays;

    if (dayName) {
      filteredDays = weekDays.filter(
        (day) => day.dayName.toLowerCase() === dayName.toLowerCase(),
      );
    }
    return res.status(200).json({
      success: true,
      weekStart: monday,
      weekEnd: sunday,
      days: filteredDays,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch week summary",
    });
  }
};

exports.getMyAttendanceSummary = async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const facultyId = req.user.facultyId;

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    startDate.setMinutes(startDate.getMinutes() - 330);

    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    endDate.setMinutes(endDate.getMinutes() - 330);
    const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const faculty = await Faculty.findById(facultyId);

    const holidays = await Holiday.countDocuments({
      isActive: true,
      applicableEmployeeCategories: faculty.employeeCategory,
      holidayDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });
    const attendances = await Attendance.find({
      facultyId,
      attendanceDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    let presentDays = 0;
    let absentDays = 0;

    attendances.forEach((attendance) => {
      switch (attendance.status) {
        case "Present":
          presentDays += 1;
          break;

        case "Absent":
          absentDays += 1;
          break;

        case "Leave":
          absentDays += 1;
          break;

        case "First Half Leave":
          presentDays += 0.5;
          absentDays += 0.5;
          break;

        case "Second Half Leave":
          presentDays += 0.5;
          absentDays += 0.5;
          break;

        case "Missed Punch":
          presentDays += 1;
          break;
      }
    });

    const workingDays = totalDays - holidays;
    const today = new Date();

    let workingDaysTillDate = workingDays;

    if (today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month) {
      const daysPassed = today.getUTCDate();

      const holidaysTillDate = await Holiday.countDocuments({
        isActive: true,
        applicableEmployeeCategories: faculty.employeeCategory,
        holidayDate: {
          $gte: startDate,
          $lte: today,
        },
      });

      workingDaysTillDate = daysPassed - holidaysTillDate;
    }
    const attendancePercentage =
      workingDaysTillDate > 0
        ? Number(((presentDays / workingDaysTillDate) * 100).toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      month,
      year,
      workingDays,
      presentDays,
      absentDays,
      attendancePercentage,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance summary",
    });
  }
};
