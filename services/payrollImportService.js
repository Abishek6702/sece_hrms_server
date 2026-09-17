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

// Column map based on 'Salary final.xlsx' official template (0-indexed)
// Row 1: S.No. | Emp Id | Name of the staff | Dept | Designation | Date of joining | Allowances(merged) | ... | Addl maint. Salary | No. of LOP | No. of OD in days | Deduction(merged) | ... | Salary after deduction | Total Deduction | Advance(merged) | ... | Addition(merged) | ... | Net Salary | ...
// Row 2:                                                                                Basic | AGP | Basic Pay | DA | HRA | Food | Medical | TA | EPF | others | Gross Salary |    |     |        | LOP | Hostel | Trans. | EPF(1) | EPF(2) | ESI | TDS | Prof.Tax | Medical | Others |                  |               | Paid | Recd | Bal | OD amt | Maiint.amt | By Bank | By cash
const COLUMN_MAP = {
  sno: 0,                // S.No.
  empId: 1,             // Emp Id  ← dedicated column in new template
  name: 2,
  department: 3,
  designation: 4,
  doj: 5,

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

  maintenanceSalary: 17,  // Addl maint. Salary (top-level, not sub-header)
  lopDays: 18,            // No. of LOP
  odDays: 19,             // No. of OD in days

  deductionsLop: 20,
  hostel: 21,
  transportation: 22,
  epf1: 23,
  epf2: 24,
  esi: 25,
  tds: 26,
  professionalTax: 27,
  deductionsMedical: 28,
  deductionsOthers: 29,

  salaryAfterDeduction: 30,
  totalDeduction: 31,

  advancePaid: 32,
  advanceReceived: 33,
  advanceBalance: 34,

  odAmount: 35,           // OD amt
  maintenanceAmount: 36,  // Maiint.amt

  byBank: 37,             // By Bank
  byCash: 38,             // By cash
  // col 38 = Net Salary in row1 header, but By cash is in row2 — Net Salary is at 37 in row1
  netSalary: 37,          // "Net Salary" is at col 37 in Row 1
};
// NOTE: "By Bank" (row2[37]) and "Net Salary" (row1[37]) share the same column index.
// Net Salary is the row-1 group header; By Bank/By cash are row-2 sub-columns at 37 and 38.
// Re-mapping to avoid collision:
// Based on exact output: row1[37]="Net Salary", row2[37]="By Bank", row2[38]="By cash"
// So actual net salary column in row1 is 37, and payment cols in row2 are 37 and 38.
// The data rows will have: col37 = By Bank value, col38 = By Cash value.
// We need a separate net salary column. Looking at row1 again:
// row1[37]="Net Salary", row1[38]="" → Net Salary header spans cols 37-38
// row2[37]="By Bank", row2[38]="By cash"
// So net salary = row1 col 37 header (merged), payment sub-cols are 37 & 38 in row2
// This means data rows: col37 = By Bank, col38 = By cash — Net Salary has NO dedicated data column!
// Net Salary must be calculated: grossSalary - totalDeduction + odAmount + maintenanceAmount - advance

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
  
  // Validate this is the correct official template
  const missingColumns = [];
  
  const checkHeader = (row, index, expectedSubstring) => {
    const val = (row[index] || "").toString().toLowerCase().replace(/\s/g, '');
    if (!val.includes(expectedSubstring.toLowerCase().replace(/\s/g, ''))) {
      missingColumns.push(`Expected '${expectedSubstring}' at column ${index + 1}`);
    }
  };

  checkHeader(row1, 1, "Emp");           // col 1 = "Emp Id"
  checkHeader(row1, 2, "Name");          // col 2 = "Name of the staff"
  checkHeader(row2, 6, "Basic");         // col 6 = "Basic"
  checkHeader(row2, 16, "Gross Salary"); // col 16 = "Gross Salary"
  checkHeader(row2, 20, "LOP");          // col 20 = "LOP" (deduction)
  checkHeader(row1, 31, "Total Deduction"); // col 31
  checkHeader(row2, 37, "By Bank");      // col 37 = "By Bank"


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
        odDays: parseCurrency(row[COLUMN_MAP.odDays], rowIndex, 'odDays', errors)
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
        others: parseCurrency(row[COLUMN_MAP.deductionsOthers], rowIndex, 'deductions.others', errors)
      },
      advance: {
        paid: parseCurrency(row[COLUMN_MAP.advancePaid], rowIndex, 'advance.paid', errors),
        received: parseCurrency(row[COLUMN_MAP.advanceReceived], rowIndex, 'advance.received', errors),
        balance: parseCurrency(row[COLUMN_MAP.advanceBalance], rowIndex, 'advance.balance', errors)
      },
      additions: {
        odAmount: parseCurrency(row[COLUMN_MAP.odAmount], rowIndex, 'odAmount', errors),
        maintenanceAmount: parseCurrency(row[COLUMN_MAP.maintenanceAmount], rowIndex, 'maintenanceAmount', errors)
      },
      maintenanceSalary: parseCurrency(row[COLUMN_MAP.maintenanceSalary], rowIndex, 'maintenanceSalary', errors),

      totalDeduction: parseCurrency(row[COLUMN_MAP.totalDeduction], rowIndex, 'totalDeduction', errors),
      salaryAfterDeduction: parseCurrency(row[COLUMN_MAP.salaryAfterDeduction], rowIndex, 'salaryAfterDeduction', errors),
      netSalary: 0, // calculated below after all fields are set
      payment: {
        byBank: parseCurrency(row[COLUMN_MAP.byBank], rowIndex, 'payment.byBank', errors),
        byCash: parseCurrency(row[COLUMN_MAP.byCash], rowIndex, 'payment.byCash', errors)
      },
      createdBy: userId,
      updatedBy: userId
    };

    // Net Salary: By Bank + By Cash (since col 37 in data rows = By Bank, not Net Salary)
    record.netSalary = record.payment.byBank + record.payment.byCash;

    insertedFacultyIds.add(faculty._id.toString());


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
