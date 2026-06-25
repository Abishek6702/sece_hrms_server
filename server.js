const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");
const auditLogger = require("./middleware/auditLogger.js");
const connectDB = require("./config/db");
const shiftRoutes = require("./routes/shiftRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const authRoutes = require("./routes/authRoutes");
const holidayRoutes = require("./routes/holidayRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const myteamRoutes = require("./routes/myteamRoutes");
const leaveTypeRoutes = require("./routes/Leave/leaveTypeRoutes");
const leaveBalanceRoutes = require("./routes/Leave/leaveBalanceRoutes");
const leaveApplicationRoutes = require("./routes/Leave/leaveApplicationRoutes");
const compOffRoutes = require("./routes/compOffRoutes");
const attendanceProcessRoutes = require("./routes/attendanceProcessRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const esslRoutes = require("./routes/esslRoutes");
const attendanceRegularizationRoutes = require("./routes/attendanceRegularizationRoutes");
const attendanceOverrideRoutes = require("./routes/attendanceOverrideRoutes");
const principalRoutes = require("./routes/principalDashboardRoutes");
const { apiLimiter } = require("./middleware/rateLimiter");

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"];
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
require("./cron/attendance");
require("./cron/attendanceProcessorCron");
require("./cron/auditLogCleanup");

app.use(
  express.json({
    limit: "5mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb",
  }),
);
app.use(mongoSanitize());
app.use(hpp());
app.use(auditLogger);
app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/faculties", facultyRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/myteam", myteamRoutes);
app.use("/api/leave-type", leaveTypeRoutes);
app.use("/api/leave-balance", leaveBalanceRoutes);
app.use("/api/leave-application", leaveApplicationRoutes);
app.use("/api/attendance-process", attendanceProcessRoutes);

app.use("/api/comp-off", compOffRoutes);
app.use("/api/essl", esslRoutes);
app.use("/api/attendance-regularization", attendanceRegularizationRoutes);

app.use("/api/attendance-override", attendanceOverrideRoutes);

app.use("/api/attendance", attendanceRoutes);

app.use("/api/principal", principalRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
