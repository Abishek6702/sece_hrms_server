const mongoose = require("mongoose");
const Faculty = require("../models/Faculty");
const Counter = require("../models/empCounter");

require("dotenv").config();

const syncCounters = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const faculties = await Faculty.find({}, "empId");

  const counterMap = {};

  faculties.forEach((faculty) => {
    const empId = faculty.empId;

    const match = empId.match(/^SECE([A-Z]+)(\d+)$/);

    if (!match) return;

    const code = match[1];
    const sequence = parseInt(match[2]);

    if (
      !counterMap[code] ||
      sequence > counterMap[code]
    ) {
      counterMap[code] = sequence;
    }
  });

  for (const [code, sequence] of Object.entries(
    counterMap
  )) {
    await Counter.findOneAndUpdate(
      { key: code },
      {
        key: code,
        sequence,
      },
      {
        upsert: true,
        new: true,
      }
    );
  }

  console.log("Counters Synced Successfully");
  process.exit();
};

syncCounters().catch(console.error);