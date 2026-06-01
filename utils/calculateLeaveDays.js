const Holiday = require("../models/holiday");

const calculateLeaveDays = async (
  fromDate,
  toDate,
  leaveSession = "Full Day",
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
  }).select("holidayDate");

  const holidaySet = new Set(
    holidays.map(
      (holiday) => new Date(holiday.holidayDate).toISOString().split("T")[0],
    ),
  );

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
