const xlsx = require("xlsx");
const Faculty = require("../models/Faculty");
const Payroll = require("../models/Payroll");

// Parse a date value from Excel — handles serial numbers, strings like "2022-06-01", and Date objects
const parseExcelDate = (val) => {
  if (!val && val !== 0) return null;
  // xlsx sometimes returns a JS Date object
  if (val instanceof Date) return val;
  // Excel serial date number
  if (typeof val === "number") {
    return xlsx.SSF.parse_date_code(val) ? new Date(xlsx.utils.format_cell({ v: val, t: "n", z: "YYYY-MM-DD" })) : null;
  }
  const str = val.toString().trim();
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const parseCurrency = (val, rowIdx, fieldName, errors) => {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const strVal = val.toString().trim();
  if (strVal === "-" || strVal.toLowerCase() === "nil") return 0;
  
  const cleanStr = strVal.replace(/[₹, ]/g, "");
  const num = Number(cleanStr);
  if (isNaN(num)) {
    errors.push({
      row: rowIdx,
      field: fieldName,
      message: `Invalid numeric value: ${val}`,
    });
    return 0; // The row will fail anyway because errors.length > 0
  }
  return num;
};

// Based on the exact official template structure (Row 1 and 2)
// Missing fields in the first table (like OD days, By Bank, By Cash) 
// are mapped to 0 safely, since the exact template does not define them in Row 1/2.
const COLUMN_MAP = {
  empId: 0,              // S.No. is used as Emp ID in this template
  name: 1,
  department: 2,
  designation: 3,
  doj: 4,
  
  basic: 6,
  agp: 7,
  basicPay: 8,
  da: 9,
  hra: 10,
  food: 11,
  earningsMedical: 12,
  ta: 13,
  earningsEpf: 14,
  earningsOthers: 15,
  grossSalary: 16,
  
  lopDays: 17,
  
  deductionsLop: 19,
  hostel: 20,
  transportation: 21,
  epf1: 22,
  epf2: 23,
  esi: 24,
  tds: 25,
  professionalTax: 26,
  deductionsMedical: 27,
  totalDeduction: 28,
  
  advancePaid: 29,
  advanceReceived: 30,
  advanceBalance: 31,
  
  netSalary: 32,
};

exports.processPayrollExcel = async (filePath, payrollMonth, payrollYear, userId) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  
  if (data.length < 3) {
    throw new Error("Invalid Excel format: Not enough rows.");
  }
  
  const row1 = data[0] || [];
  const row2 = data[1] || [];
  
  // Validate template structure (ensuring it's the exact official template)
  const missingColumns = [];
  
  const checkHeader = (row, index, expectedSubstring) => {
    const val = (row[index] || "").toString().toLowerCase().replace(/\s/g, '');
    if (!val.includes(expectedSubstring.toLowerCase().replace(/\s/g, ''))) {
      missingColumns.push(`Expected '${expectedSubstring}' at column ${index + 1}`);
    }
  };

  checkHeader(row1, 0, "S.No."); // Used as Emp ID
  checkHeader(row1, 1, "Name of the staff");
  checkHeader(row2, 6, "Basic");
  checkHeader(row2, 16, "Gross Salary");
  checkHeader(row2, 19, "LOP");
  checkHeader(row1, 28, "Total Deduction");
  checkHeader(row1, 32, "Net Salary");

  if (missingColumns.length > 0) {
    return {
      success: false,
      message: "Invalid payroll Excel template.",
      missingColumns
    };
  }

  const errors = [];
  const parsedRows = [];
  const empIdsToFetch = [];
  const seenEmpIdsInExcel = new Set();
  
  // Collect data rows (starts at row 3 index 2)
  for (let rowIndex = 2; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    
    // Stop if we hit a new table header or an empty row
    if (!row || row.length === 0) continue;
    if (row[0] === 'S.No.' || row[0] === 'Name ' || row[1] === 'Name ') {
      break; // Reached the next template table, ignoring as per exact Row 1/2 mapping focus.
    }
    
    const empIdRaw = row[COLUMN_MAP.empId];
    if (!empIdRaw) {
      // Empty row or missing emp ID
      continue;
    }
    
    const empId = empIdRaw.toString().trim();
    
    if (seenEmpIdsInExcel.has(empId)) {
      errors.push({ row: rowIndex + 1, field: 'empId', message: 'Duplicate employee ID found in uploaded Excel.' });
      continue;
    }
    seenEmpIdsInExcel.add(empId);
    
    empIdsToFetch.push(empId);
    parsedRows.push({ row, rowIndex: rowIndex + 1, empId });
  }

  if (errors.length > 0) {
    return { success: false, errors, totalRows: parsedRows.length + errors.length, validRows: 0, errorRows: errors.length };
  }
  
  if (parsedRows.length === 0) {
     return { success: false, errors: [{ row: 0, field: 'general', message: 'No valid employee rows found to process.' }], totalRows: 0, validRows: 0, errorRows: 1 };
  }

  // Fetch employees
  const faculties = await Faculty.find({ empId: { $in: empIdsToFetch } }).lean();
  const facultyMap = {};
  faculties.forEach(f => facultyMap[f.empId] = f);

  // Check for duplicate payroll records
  const existingRecords = await Payroll.find({
    facultyId: { $in: faculties.map(f => f._id) },
    payrollMonth,
    payrollYear
  }).lean();
  
  const existingMap = new Set(existingRecords.map(r => r.facultyId.toString()));

  const payrollRecords = [];
  // Track which faculties will actually get records inserted (for email)
  const insertedFacultyIds = new Set();

  for (const { row, rowIndex, empId } of parsedRows) {
    const faculty = facultyMap[empId];
    if (!faculty) {
      errors.push({ row: rowIndex, field: 'empId', message: 'Employee not found in system.' });
      continue;
    }

    if (existingMap.has(faculty._id.toString())) {
      errors.push({ row: rowIndex, field: 'empId', message: `Payroll already exists for this employee for ${payrollMonth}/${payrollYear}.` });
      continue;
    }

    const record = {
      facultyId: faculty._id,
      payrollMonth,
      payrollYear,
      employeeDetails: {
        empId: faculty.empId,
        name: faculty.firstName + " " + faculty.lastName,
        department: faculty.department,
        designation: faculty.designation,
        dateOfJoining: faculty.doj
      },
      earnings: {
        basic: parseCurrency(row[COLUMN_MAP.basic], rowIndex, 'basic', errors),
        agp: parseCurrency(row[COLUMN_MAP.agp], rowIndex, 'agp', errors),
        basicPay: parseCurrency(row[COLUMN_MAP.basicPay], rowIndex, 'basicPay', errors),
        da: parseCurrency(row[COLUMN_MAP.da], rowIndex, 'da', errors),
        hra: parseCurrency(row[COLUMN_MAP.hra], rowIndex, 'hra', errors),
        food: parseCurrency(row[COLUMN_MAP.food], rowIndex, 'food', errors),
        medical: parseCurrency(row[COLUMN_MAP.earningsMedical], rowIndex, 'earnings.medical', errors),
        ta: parseCurrency(row[COLUMN_MAP.ta], rowIndex, 'ta', errors),
        epf: parseCurrency(row[COLUMN_MAP.earningsEpf], rowIndex, 'earnings.epf', errors),
        others: parseCurrency(row[COLUMN_MAP.earningsOthers], rowIndex, 'earnings.others', errors),
        grossSalary: parseCurrency(row[COLUMN_MAP.grossSalary], rowIndex, 'grossSalary', errors)
      },
      attendance: {
        lopDays: parseCurrency(row[COLUMN_MAP.lopDays], rowIndex, 'lopDays', errors),
        odDays: 0 // Not in Row 1/2 of exact template
      },
      deductions: {
        lop: parseCurrency(row[COLUMN_MAP.deductionsLop], rowIndex, 'deductions.lop', errors),
        hostel: parseCurrency(row[COLUMN_MAP.hostel], rowIndex, 'hostel', errors),
        transportation: parseCurrency(row[COLUMN_MAP.transportation], rowIndex, 'transportation', errors),
        epf1: parseCurrency(row[COLUMN_MAP.epf1], rowIndex, 'epf1', errors),
        epf2: parseCurrency(row[COLUMN_MAP.epf2], rowIndex, 'epf2', errors),
        esi: parseCurrency(row[COLUMN_MAP.esi], rowIndex, 'esi', errors),
        tds: parseCurrency(row[COLUMN_MAP.tds], rowIndex, 'tds', errors),
        professionalTax: parseCurrency(row[COLUMN_MAP.professionalTax], rowIndex, 'professionalTax', errors),
        medical: parseCurrency(row[COLUMN_MAP.deductionsMedical], rowIndex, 'deductions.medical', errors),
        others: 0 // Not directly separated in this part of template
      },
      advance: {
        paid: parseCurrency(row[COLUMN_MAP.advancePaid], rowIndex, 'advance.paid', errors),
        received: parseCurrency(row[COLUMN_MAP.advanceReceived], rowIndex, 'advance.received', errors),
        balance: parseCurrency(row[COLUMN_MAP.advanceBalance], rowIndex, 'advance.balance', errors)
      },
      additions: {
        odAmount: 0,
        maintenanceAmount: 0
      },
      totalDeduction: parseCurrency(row[COLUMN_MAP.totalDeduction], rowIndex, 'totalDeduction', errors),
      salaryAfterDeduction: parseCurrency(row[COLUMN_MAP.totalDeduction], rowIndex, 'salaryAfterDeduction', errors), // Usually Gross - Total Deduction, but just reading from template if it exists, wait, row 1/2 has no Salary After Deduction. We will leave it as Gross - Total, but standard requires just saving 0 or calculated if missing.
      netSalary: parseCurrency(row[COLUMN_MAP.netSalary], rowIndex, 'netSalary', errors),
      payment: {
        byBank: 0,
        byCash: 0
      },
      createdBy: userId,
      updatedBy: userId
    };

    insertedFacultyIds.add(faculty._id.toString());
    
    // Auto calculate some missing standard fields if not in template row 1/2
    record.salaryAfterDeduction = record.earnings.grossSalary - record.totalDeduction;

    payrollRecords.push(record);
  }

  if (errors.length > 0) {
    return { success: false, errors, totalRows: parsedRows.length, validRows: parsedRows.length - errors.length, errorRows: errors.length };
  }

  // Insert to MongoDB atomically
  await Payroll.insertMany(payrollRecords);

  // Only email faculties whose records were actually inserted
  const successfulFaculties = faculties.filter(f => insertedFacultyIds.has(f._id.toString()));

  return {
    success: true,
    totalRecords: parsedRows.length,
    importedRecords: payrollRecords.length,
    facultiesToEmail: successfulFaculties
  };
};
