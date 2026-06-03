const Holiday = require("../models/holiday");

const calculateLeaveDays = async (
  fromDate,
  toDate,
  leaveSession = "Full Day",
  employeeCategory,
  sandwichRuleApplicable = false,
) => {
  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);

  let totalDays = 0;

  const holidays = await Holiday.find({
    holidayDate: {
      $gte: startDate,
      $lte: endDate,
    },
    isActive: true,
    applicableEmployeeCategories: employeeCategory,
  }).select("holidayDate");

  const holidaySet = new Set(
    holidays.map((holiday) => {
      const date = new Date(holiday.holidayDate);

      return (
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0")
      );
    }),
  );
  let holidayExistsBetween = false;

  const checkDate = new Date(startDate);
  checkDate.setDate(checkDate.getDate() + 1);

  while (checkDate < endDate) {
    const dateString =
      checkDate.getFullYear() +
      "-" +
      String(checkDate.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(checkDate.getDate()).padStart(2, "0");

    const isSunday = checkDate.getDay() === 0;

    const isHoliday = holidaySet.has(dateString);

    if (isSunday || isHoliday) {
      holidayExistsBetween = true;
      break;
    }

    checkDate.setDate(checkDate.getDate() + 1);
  }
  const startDateString =
    startDate.getFullYear() +
    "-" +
    String(startDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(startDate.getDate()).padStart(2, "0");

  const endDateString =
    endDate.getFullYear() +
    "-" +
    String(endDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(endDate.getDate()).padStart(2, "0");

  const startIsHoliday =
    startDate.getDay() === 0 || holidaySet.has(startDateString);

  const endIsHoliday = endDate.getDay() === 0 || holidaySet.has(endDateString);

  if (
    sandwichRuleApplicable &&
    startDateString !== endDateString &&
    !startIsHoliday &&
    !endIsHoliday &&
    holidayExistsBetween
  ) {
    totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    if (leaveSession === "First Half" || leaveSession === "Second Half") {
      if (totalDays === 1) {
        totalDays = 0.5;
      }
    }

    return totalDays;
  }
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const day = currentDate.getDay();

    const dateString =
      currentDate.getFullYear() +
      "-" +
      String(currentDate.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(currentDate.getDate()).padStart(2, "0");

    const isSunday = day === 0;

    const isHoliday = holidaySet.has(dateString);

    if (!isSunday && !isHoliday) {
      totalDays++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (leaveSession === "First Half" || leaveSession === "Second Half") {
    if (totalDays === 1) {
      totalDays = 0.5;
    }
  }

  return totalDays;
};

module.exports = calculateLeaveDays;
