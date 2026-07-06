const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Faculty = require("../models/Faculty");
const User = require("../models/User");
const Shift = require("../models/shift");
const generateEmployeeId = require("../utils/empIdGenerator");
const cloudinary = require("cloudinary").v2;

const sendMail = require("../utils/sendMail");
const renderTemplate = require("../utils/renderTemplate");

const createLeaveBalances = require("../services/createLeaveBalances");
const {
  createPermissionBalanceForFaculty,
} = require("../services/permissionBalanceService");
const generatePunchId = require("../utils/generatePunchId");

// ================= IMPORT EXCEL =================
const XLSX = require("xlsx");

const parseDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parts = value.includes(".")
      ? value.split(".")
      : value.includes("-")
        ? value.split("-")
        : null;

    if (parts?.length === 3) {
      const [day, month, year] = parts;
      return new Date(year, month - 1, day);
    }
  }

  return value;
};
exports.importExcelFaculty = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // 👉 read excel buffer
    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 👉 convert to JSON
    const faculties = XLSX.utils.sheet_to_json(sheet);

    if (!Array.isArray(faculties)) {
      return res.status(400).json({ message: "Invalid Excel format" });
    }

    const created = [];
    const failed = [];

    for (let data of faculties) {
      const shift = await Shift.findOne({
        shiftName: data.shiftName,
      });

      if (!shift) {
        failed.push({
          empId: data.empId,
          name: `${data.firstName} ${data.lastName}`,
          reason: `Shift not found: ${data.shiftName}`,
        });

        continue;
      }

      let reportingTo = undefined;

      if (data.reportingTo) {
        const manager = await Faculty.findById(data.reportingTo);

        if (!manager) {
          failed.push({
            empId: data.empId,
            name: `${data.firstName} ${data.lastName}`,
            reason: "Reporting manager not found",
          });

          continue;
        }

        reportingTo = {
          facultyId: manager._id,
          empId: manager.empId,
          name: `${manager.firstName} ${manager.lastName}`,
        };
      }
      // map column names (IMPORTANT)
      const facultyData = {
        empId: data.empId,
        salutation: data.salutation,
        firstName: data.firstName,
        lastName: data.lastName,

        email: data.email,
        organizationEmail: data.organizationEmail,

        phone: data.phone,

        gender: data.gender,

        dob: parseDate(data.dob),
        doj: parseDate(data.doj),

        department: data.department,
        originalDepartment: data.originalDepartment,

        designation: data.designation,

        jobTitle: data.jobTitle,

        employeeCategory: data.employeeCategory,

        workType: data.workType,

        timeType: data.timeType,

        shiftId: shift._id,

        // punchId: data.punchId,

        punchId: data.punchId || (await generatePunchId()),

        employmentStatus: data.employmentStatus ?? true,
        reportingTo,
      };

      const exists = await Faculty.findOne({
        $or: [
          { empId: facultyData.empId },
          { email: facultyData.email },
          { organizationEmail: facultyData.organizationEmail },
          { phone: facultyData.phone },
        ],
      });

      if (exists) {
        failed.push({
          empId: data.empId,
          name: `${data.firstName} ${data.lastName}`,
          reason: "Faculty already exists",
        });

        continue;
      }

      const faculty = await Faculty.create(facultyData);

      await createLeaveBalances(faculty._id);
      await createPermissionBalanceForFaculty(faculty._id);

      const password = "Sece@123";
      const hashed = await bcrypt.hash(password, 10);

      await User.create({
        firstName: faculty.firstName,
        lastName: faculty.lastName,

        email: faculty.organizationEmail,

        phone: faculty.phone,

        department: faculty.department,

        password: hashed,

        facultyId: faculty._id,

        role: data.role?.toLowerCase() || "faculty",

        isFirstTimeLogin: true,
      });
      if (
        faculty.employeeCategory !== "Driver" &&
        faculty.employeeCategory !== "Housekeeping"
      ) {
        // const html = renderTemplate("welcomeFaculty", {
        //   name: `${faculty.firstName} ${faculty.lastName}`,
        //   empId: faculty.empId,
        //   email: faculty.organizationEmail,
        //   password: "Sece@123",
        //   role: data.role?.toLowerCase() || "faculty",
        // });
        // sendMail(faculty.organizationEmail, "Welcome to SECE HRMS", html).catch(
        //   console.error,
        // );
      }

      created.push(faculty);
    }

    res.status(201).json({
      message: "Excel imported successfully",
      createdCount: created.length,
      failedCount: failed.length,
      failed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
// ================= ADD SINGLE =================
exports.addIndividualFaculty = async (req, res) => {
  try {
    // Use provided values if available, otherwise generate new ones
    const empId =
      req.body.empId ||
      (await generateEmployeeId(
        req.body.employeeCategory,
        req.body.department,
        req.body.role,
      ));

    const punchId = req.body.punchId || (await generatePunchId());

    const faculty = await Faculty.create({
      ...req.body,
      empId,
      punchId,
    });

    await createLeaveBalances(faculty._id);
    await createPermissionBalanceForFaculty(faculty._id);

    const hashedPassword = await bcrypt.hash("Sece@123", 10);

    await User.create({
      firstName: faculty.firstName,
      lastName: faculty.lastName,
      email: faculty.organizationEmail,
      phone: faculty.phone,
      department: faculty.department,

      password: hashedPassword,

      facultyId: faculty._id,

      role: req.body.role || "faculty",

      isFirstTimeLogin: true,
    });
    if (
      faculty.employeeCategory !== "Driver" &&
      faculty.employeeCategory !== "Housekeeping"
    ) {
      // const html = renderTemplate("welcomeFaculty", {
      //   name: `${faculty.firstName} ${faculty.lastName}`,
      //   empId: faculty.empId,
      //   email: faculty.organizationEmail,
      //   password: "Sece@123",
      //   role: req.body.role?.toLowerCase() || "faculty",
      // });
      // sendMail(faculty.organizationEmail, "Welcome to SECE HRMS", html).catch(
      //   console.error,
      // );
    }

    res.status(201).json({
      success: true,
      message: "Faculty created successfully",
      defaultPassword: "Sece@123",
      faculty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= GET ALL =================
exports.getFaculties = async (req, res) => {
  try {
    const faculties = await Faculty.find()
      .populate("shiftId")
      .populate("reportingTo.facultyId")
      .sort({ createdAt: -1 });
    res.status(200).json(faculties);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET ONE =================
exports.getFacultyId = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findById(id)
      .populate("shiftId")
      .populate("reportingTo.facultyId");

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    res.status(200).json(faculty);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= EDIT =================
exports.editFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const faculty = await Faculty.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // update user also (name/email sync)
    await User.findOneAndUpdate(
      { facultyId: id },
      {
        firstName: faculty.firstName,
        lastName: faculty.lastName,
        email: faculty.organizationEmail,
        phone: faculty.phone,
        department: faculty.department,
      },
    );

    res.status(200).json({
      message: "Faculty updated successfully",
      data: faculty,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DELETE =================
exports.deleteFaculty = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findByIdAndDelete(id);

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // delete linked user
    await User.findOneAndDelete({ facultyId: id });

    res.status(200).json({
      message: "Faculty and login deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.uploadProfileImage = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findById(id);
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (faculty.profileImage?.publicId) {
      await cloudinary.uploader.destroy(faculty.profileImage.publicId);
    }

    faculty.profileImage = {
      url: req.file.path,
      publicId: req.file.filename,
    };

    await faculty.save();

    res.status(200).json({
      message: "Profile image uploaded successfully",
      data: faculty.profileImage,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteProfileImage = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findById(id);
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    if (!faculty.profileImage?.publicId) {
      return res.status(400).json({ message: "No image to delete" });
    }

    await cloudinary.uploader.destroy(faculty.profileImage.publicId);

    faculty.profileImage = null;
    await faculty.save();

    res.status(200).json({
      message: "Profile image deleted successfully",
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.uploadDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        message: "No files uploaded",
      });
    }

    const faculty = await Faculty.findById(id);

    if (!faculty) {
      return res.status(404).json({
        message: "Faculty not found",
      });
    }

    // Single documents
    const singleFields = [
      "sslcMarkSheet",
      "hscMarkSheet",
      "ugDegreeCertificate",
      "pgDegreeCertificate",
      "phdDegreeCertificate",
      "panCard",
      "aadharCard",
    ];

    for (const field of singleFields) {
      if (req.files[field]?.length) {
        if (faculty.documents[field]?.publicId) {
          await cloudinary.uploader.destroy(faculty.documents[field].publicId);
        }

        faculty.documents[field] = {
          url: req.files[field][0].path,
          publicId: req.files[field][0].filename,
        };
      }
    }

    // Multiple documents
    const multiFields = [
      "experienceCertificates",
      "relievingLetters",
      "otherDocuments",
    ];

    for (const field of multiFields) {
      if (req.files[field]?.length) {
        const uploadedDocs = req.files[field].map((file) => ({
          url: file.path,
          publicId: file.filename,
        }));

        faculty.documents[field].push(...uploadedDocs);
      }
    }

    await faculty.save();

    res.status(200).json({
      success: true,
      message: "Documents uploaded successfully",
      documents: faculty.documents,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, publicId } = req.body;

    const faculty = await Faculty.findById(id);

    if (!faculty) {
      return res.status(404).json({
        message: "Faculty not found",
      });
    }

    const singleFields = [
      "sslcMarkSheet",
      "hscMarkSheet",
      "ugDegreeCertificate",
      "pgDegreeCertificate",
      "phdDegreeCertificate",
      "panCard",
      "aadharCard",
    ];

    if (singleFields.includes(documentType)) {
      const doc = faculty.documents[documentType];

      if (!doc) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      await cloudinary.uploader.destroy(doc.publicId);

      faculty.documents[documentType] = null;
    } else {
      if (!faculty.documents[documentType]) {
        return res.status(400).json({
          message: "Invalid document type",
        });
      }

      await cloudinary.uploader.destroy(publicId);

      faculty.documents[documentType] = faculty.documents[documentType].filter(
        (doc) => doc.publicId !== publicId,
      );
    }

    await faculty.save();

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.searchFaculty = async (req, res) => {
  try {
    const { q = "" } = req.query;

    const faculties = await Faculty.find({
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { empId: { $regex: q, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: q,
              options: "i",
            },
          },
        },
      ],
    })
      .select(
        "_id empId firstName lastName designation department profileImage",
      )
      .limit(10);

    const result = faculties.map((faculty) => ({
      facultyId: faculty._id,
      empId: faculty.empId,
      firstName: faculty.firstName,
      lastName: faculty.lastName,
      name: `${faculty.firstName} ${faculty.lastName}`,
      designation: faculty.designation,
      department: faculty.department,
      profileImage: faculty.profileImage?.url || null,
    }));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.bulkUpdateReportingManager = async (req, res) => {
  try {
    const { department, facultyId, empId, name } = req.body;

    if (!department || !facultyId || !empId || !name) {
      return res.status(400).json({
        success: false,
        message: "department, facultyId, empId and name are required",
      });
    }

    const result = await Faculty.updateMany(
      {
        department,
        _id: { $ne: facultyId }, // don't update manager himself
      },
      {
        $set: {
          reportingTo: {
            facultyId,
            empId,
            name,
          },
        },
      },
    );

    res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} faculty members`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
