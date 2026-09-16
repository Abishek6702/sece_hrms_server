const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    payrollMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    payrollYear: {
      type: Number,
      required: true,
    },
    employeeDetails: {
      empId: { type: String, required: true },
      name: { type: String, required: true },
      department: { type: String },
      designation: { type: String },
      dateOfJoining: { type: Date },
    },
    earnings: {
      basic: { type: Number, default: 0 },
      agp: { type: Number, default: 0 },
      basicPay: { type: Number, default: 0 },
      da: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      food: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      ta: { type: Number, default: 0 },
      epf: { type: Number, default: 0 },
      others: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 },
    },
    attendance: {
      lopDays: { type: Number, default: 0 },
      odDays: { type: Number, default: 0 },
    },
    deductions: {
      lop: { type: Number, default: 0 },
      hostel: { type: Number, default: 0 },
      transportation: { type: Number, default: 0 },
      epf1: { type: Number, default: 0 },
      epf2: { type: Number, default: 0 },
      esi: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      professionalTax: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      others: { type: Number, default: 0 },
    },
    advance: {
      paid: { type: Number, default: 0 },
      received: { type: Number, default: 0 },
      balance: { type: Number, default: 0 },
    },
    additions: {
      odAmount: { type: Number, default: 0 },
      maintenanceAmount: { type: Number, default: 0 },
    },
    totalDeduction: { type: Number, default: 0 },
    salaryAfterDeduction: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    payment: {
      byBank: { type: Number, default: 0 },
      byCash: { type: Number, default: 0 },
    },
   
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

payrollSchema.index(
  { facultyId: 1, payrollMonth: 1, payrollYear: 1 },
  { unique: true }
);

module.exports = mongoose.model("Payroll", payrollSchema);
