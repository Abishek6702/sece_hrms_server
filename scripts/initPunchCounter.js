require("dotenv").config();

const mongoose = require("mongoose");

const Faculty = require("../models/Faculty");
const Counter = require("../models/counter");

const run = async () => {
  await mongoose.connect(
    process.env.MONGO_URI,
  );

  const faculties =
    await Faculty.find({
      punchId: {
        $exists: true,
        $ne: null,
      },
    });

  let maxPunch = 0;

  for (const faculty of faculties) {
    if (!faculty.punchId) {
      continue;
    }

    const number =
      parseInt(
        faculty.punchId.replace(
          "P",
          "",
        ),
        10,
      ) || 0;

    if (number > maxPunch) {
      maxPunch = number;
    }
  }

  await Counter.findOneAndUpdate(
    {
      name: "punchId",
    },
    {
      value: maxPunch,
    },
    {
      upsert: true,
    },
  );

  console.log(
    `Counter initialized to ${maxPunch}`,
  );

  process.exit();
};

run();