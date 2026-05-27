const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Faculty = require("../models/Faculty");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;


// helper to generate default password
const generatePassword = async (empId) => {
  const password = "Sece@123";
  const hashed = await bcrypt.hash(password, 10);
  return { plain: password, hashed };
};

// ================= IMPORT EXCEL =================
const XLSX = require("xlsx");

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

    for (let data of faculties) {
      // map column names (IMPORTANT)
      const facultyData = {
        name: data.name,
        empId: data.empId,
        email: data.email,
        phone: data.phone,
        department: data.department,
        dob: data.dob,
        gender: data.gender,
        doj: data.doj,
        designation: data.designation,
        employeeCategory: data.employeeCategory,
        location: data.location,
      };

      const exists = await Faculty.findOne({
        $or: [{ email: facultyData.email }, { empId: facultyData.empId }],
      });

      if (exists) continue;

      const faculty = await Faculty.create(facultyData);

      const password = "Sece@123";
      const hashed = await bcrypt.hash(password, 10);

      await User.create({
        name: facultyData.name,
        email: facultyData.email,
        phone: facultyData.phone,
        password: hashed,
        department: faculty.department,
        role: data.role?.toLowerCase() === "hod" ? "hod" : "faculty",
        isadmin: false,
        facultyId: faculty._id,
        isFirstTimeLogin: true,
      });

      created.push(faculty);
    }

    res.status(201).json({
      message: "Excel imported successfully",
      count: created.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
// ================= ADD SINGLE =================
exports.addIndividualFaculty = async (req, res) => {
  try {
    const {
      name,
      empId,
      email,
      phone,
      department,
      dob,
      gender,
      doj,
      designation,
      employeeCategory,
      location,
      profileImage,
      role,
    } = req.body;

    // ✅ Validation
    if (
      !name ||
      !empId ||
      !email ||
      !phone ||
      !department ||
      !dob ||
      !gender ||
      !doj ||
      !designation ||
      !employeeCategory ||
      !location
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Duplicate check
    const exists = await Faculty.findOne({
      $or: [{ email }, { empId }, { phone }],
    });

    if (exists) {
      return res.status(400).json({
        message: "Faculty with same email/empId/phone already exists",
      });
    }

    // ✅ Create faculty
    const faculty = await Faculty.create({
      name,
      empId,
      email,
      phone,
      department,
      dob: new Date(dob),
      gender,
      doj: new Date(doj),
      designation,
      employeeCategory,
      location,
      profileImage,
    });

    // ✅ Generate password (consistent with Excel)
    const password = "Sece@123";
    const hashed = await bcrypt.hash(password, 10);

    // ✅ Create login
    await User.create({
      name,
      email,
      phone,
      password: hashed,
      department: faculty.department,
      role: role === "hod" ? "hod" : "faculty",
      isadmin: false,
      facultyId: faculty._id,
      isFirstTimeLogin: true,
    });

    res.status(201).json({
      message: "Faculty added successfully",
      defaultPassword: password, // remove in production if needed
      data: faculty,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ================= GET ALL =================
exports.getFaculties = async (req, res) => {
  try {
    const faculties = await Faculty.find().sort({ createdAt: -1 });

    res.status(200).json(faculties);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET ONE =================
exports.getFacultyId = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findById(id);

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
    });

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // update user also (name/email sync)
    await User.findOneAndUpdate(
      { facultyId: id },
      {
        name: data.name,
        email: data.email,
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