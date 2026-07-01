require("dotenv").config();
const mongoose = require("mongoose");
const Faculty = require("../models/Faculty"); // adjust path if needed

async function updateReportingDepartment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const faculties = await Faculty.find({}, "department");

    let count = 0;

    for (const faculty of faculties) {
      faculty.originalDepartment = faculty.department;
      await faculty.save();
      count++;
    }

    console.log(`Updated ${count} faculty records.`);

    await mongoose.disconnect();
    console.log("Done!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updateReportingDepartment();