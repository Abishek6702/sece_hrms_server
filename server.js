const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const connectDB = require("./config/db");
const shiftRoutes = require("./routes/shiftRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const authRoutes = require("./routes/authRoutes");
const holidayRoutes = require("./routes/holidayRoutes");
const leaveTypeRoutes = require("./routes/Leave/leaveTypeRoutes");
const leaveBalanceRoutes = require("./routes/Leave/leaveBalanceRoutes");

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }),
);

connectDB();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/faculties", facultyRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/leave-type", leaveTypeRoutes);
app.use("/api/leave-balance",leaveBalanceRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
