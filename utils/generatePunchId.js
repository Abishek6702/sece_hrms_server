const Counter = require("../models/counter");

const generatePunchId = async () => {
  const counter = await Counter.findOneAndUpdate(
    {
      name: "punchId",
    },
    {
      $inc: {
        value: 1,
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  return String(counter.value).padStart(4, "0");
};

module.exports = generatePunchId;
