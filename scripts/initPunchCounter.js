require("dotenv").config();

const mongoose = require("mongoose");

const Faculty = require("../models/Faculty");
const Counter = require("../models/counter");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const faculties = await Faculty.find({
      punchId: {
        $exists: true,
        $ne: null,
      },
    });

    let maxPunch = 0;

    for (const faculty of faculties) {
      const number = Number(faculty.punchId);

      if (!isNaN(number) && number > maxPunch) {
        maxPunch = number;
      }
    }

    await Counter.findOneAndUpdate(
      { name: "punchId" },
      { value: maxPunch },
      { upsert: true, new: true }
    );

    console.log(`Counter initialized to ${maxPunch}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

run();