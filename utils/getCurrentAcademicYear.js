const getCurrentAcademicYear = () => {
  const today = new Date();

  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  if (month >= 7) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
};

module.exports = getCurrentAcademicYear;