const pad2 = (value) => String(value).padStart(2, "0");

const formatDateKey = (date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const getPermissionWindowRange = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (date.getDate() >= 26) {
    return {
      start: new Date(year, month, 26, 0, 0, 0, 0),
      end: new Date(year, month + 1, 25, 23, 59, 59, 999),
    };
  }

  return {
    start: new Date(year, month - 1, 26, 0, 0, 0, 0),
    end: new Date(year, month, 25, 23, 59, 59, 999),
  };
};

const getPermissionAcademicYear = (windowStart) => {
  const year = windowStart.getFullYear();
  const month = windowStart.getMonth();
  const startYear = month >= 5 ? year : year - 1;

  return `${startYear}-${startYear + 1}`;
};

const formatPeriodKey = (windowStart, windowEnd) => {
  return `${formatDateKey(windowStart)}_${formatDateKey(windowEnd)}`;
};

module.exports = {
  getPermissionWindowRange,
  getPermissionAcademicYear,
  formatPeriodKey,
};
