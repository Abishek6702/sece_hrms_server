const Counter = require("../models/empCounter");

const departmentCodes = {
  // Teaching Departments
  CS: "CS",
  CSE: "CS",

  EC: "EC",
  ECE: "EC",

  EE: "EE",
  EEE: "EE",

  ME: "ME",
  MECH: "ME",

  CV: "CV",
  CIVIL: "CV",

  // Non Teaching
  HR: "HR",

  ACCOUNTS: "AC",
  ACCOUNT: "AC",
  ACCOUNTS: "AC",

  OFFICE: "OF",

  LAB: "LB",
  LABORATORY: "LB",
};

const getEmployeeCode = (
  employeeCategory,
  department,
  role
) => {
  role = role?.toLowerCase();

  // Principal
  if (role === "principal") {
    return "PR";
  }

  const deptCode =
    departmentCodes[
      department?.toUpperCase()?.trim()
    ] ||
    department?.toUpperCase()?.trim();

  if (employeeCategory === "Teaching") {
    return `T${deptCode}`;
  }

  if (employeeCategory === "Non-Teaching") {
    return `N${deptCode}`;
  }

  if (employeeCategory === "Driver") {
    return "DR";
  }

  if (employeeCategory === "Housekeeping") {
    return "HK";
  }

  throw new Error(
    `Invalid employee category: ${employeeCategory}`
  );
};

const generateEmployeeId = async (
  employeeCategory,
  department,
  role  
) => {
  const code = getEmployeeCode(
    employeeCategory,
    department,
    role
  );

  const counter = await Counter.findOneAndUpdate(
    { key: code },
    { $inc: { sequence: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  const sequence = String(
    counter.sequence
  ).padStart(3, "0");

  return `SECE${code}${sequence}`;
};

module.exports = generateEmployeeId;