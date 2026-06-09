const getCurrentAcademicYear = require("./getCurrentAcademicYear");

const getNextAcademicYear = () => {
  const currentAcademicYear = getCurrentAcademicYear();

  const [startYear, endYear] =
    currentAcademicYear.split("-");

  return `${endYear}-${Number(endYear) + 1}`;
};

module.exports = getNextAcademicYear;