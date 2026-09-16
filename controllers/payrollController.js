const fs = require("fs");
const Payroll = require("../models/Payroll");
const payrollImportService = require("../services/payrollImportService");
const sendMail = require("../utils/sendMail");
const renderTemplate = require("../utils/renderTemplate");
const mongoose = require("mongoose");

exports.importPayrollExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const { payrollMonth, payrollYear } = req.body;
    if (!payrollMonth || !payrollYear) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: "payrollMonth and payrollYear are required." });
    }

    const month = parseInt(payrollMonth, 10);
    const year = parseInt(payrollYear, 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid payrollMonth or payrollYear." });
    }

    const userId = req.user ? req.user._id : null;
    
    // Validate role if necessary. Assuming middleware handles this, but just to be safe.
    
    const result = await payrollImportService.processPayrollExcel(
      req.file.path,
      month,
      year,
      userId
    );

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Payroll import validation failed",
        ...(result.missingColumns && { missingColumns: result.missingColumns }),
        ...(result.totalRows !== undefined && { totalRows: result.totalRows }),
        ...(result.validRows !== undefined && { validRows: result.validRows }),
        ...(result.errorRows !== undefined && { errorRows: result.errorRows }),
        ...(result.errors && { errors: result.errors }),
      });
    }

    // Send emails
    const facultiesToEmail = result.facultiesToEmail || [];
    let emailsSent = 0;
    let emailsFailed = 0;

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[month - 1];

    const User = require("../models/User");

    for (const faculty of facultiesToEmail) {
      try {
        const emailHtml = renderTemplate("payrollSuccess", {
          facultyName: faculty.firstName + " " + faculty.lastName,
          month: monthName,
          year: year
        });
        
        // Find corresponding user to get their login email
        const user = await User.findOne({ facultyId: faculty._id }).lean();
        
        const emailTo = user ? user.email : null;
        if (emailTo) {
          await sendMail(emailTo, `Payroll Details Available - ${monthName} ${year}`, emailHtml);
          emailsSent++;
        } else {
          console.warn(`No user/email found for faculty ${faculty.empId}`);
          emailsFailed++;
        }
      } catch (err) {
        console.error(`Failed to send email to faculty ${faculty.empId}:`, err.message);
        emailsFailed++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payroll imported successfully",
      payrollMonth: month,
      payrollYear: year,
      totalRecords: result.totalRecords,
      importedRecords: result.importedRecords,
      emailsSent,
      emailsFailed
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Payroll Import Error:", error);
    res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

exports.getAllPayroll = async (req, res) => {
  try {
    const payrolls = await Payroll.find()
      .populate("facultyId", "empId firstName lastName department designation")
      .sort({ payrollYear: -1, payrollMonth: -1 })
      .lean();
    
    res.status(200).json({ success: true, count: payrolls.length, data: payrolls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPayrollById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid payroll ID." });
    }

    const payroll = await Payroll.findById(id).lean();
    if (!payroll) {
      return res.status(404).json({ success: false, message: "Payroll not found." });
    }

    res.status(200).json({ success: true, data: payroll });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPayrollByFacultyId = async (req, res) => {
  try {
    const { facultyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      return res.status(400).json({ success: false, message: "Invalid faculty ID." });
    }

    // Role-based access control check (only enforced when protect middleware is active)
    if (req.user && req.user.role === 'faculty') {
      if (!req.user.facultyId || req.user.facultyId.toString() !== facultyId) {
         return res.status(403).json({ success: false, message: "Access denied. You can only view your own payroll." });
      }
    }

    const query = { facultyId };

    if (req.user && req.user.role === 'faculty') {
      query.status = "Published";
    }

    const payrolls = await Payroll.find(query)
      .sort({ payrollYear: -1, payrollMonth: -1 })
      .lean();
    
    res.status(200).json({ success: true, count: payrolls.length, data: payrolls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
