const express = require("express");
const cors = require("cors");
const Faculty = require("../models/Faculty");
const Attendance = require("../models/attendance");
const { apiLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Apply rate limiter to protect the endpoint from abuse
router.use(apiLimiter);

/**
 * --------------------------------------------------------------------------
 * CONFIGURATION: ALLOWED ORIGIN & SECRET KEY
 * --------------------------------------------------------------------------
 * Accessible from multiple devices/clients without any device restriction.
 * Access is authorized solely by validating:
 *   1. Origin (EXTERNAL_SOFTWARE_ALLOWED_ORIGIN)
 *   2. Secret Key (EXTERNAL_SOFTWARE_SECRET_KEY)
 */
const getAllowedOrigins = () => {
  const envOrigins =
    process.env.EXTERNAL_SOFTWARE_ALLOWED_ORIGIN ||
    process.env.EXTERNAL_FACULTY_ALLOWED_ORIGIN ||
    process.env.EXTERNAL_ALLOWED_ORIGIN ||
    "";

  const origins = envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // In development, default to local testing hosts if no env var is set
  if (origins.length === 0 && process.env.NODE_ENV !== "production") {
    return [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173",
    ];
  }

  return origins;
};

const getExpectedSecretKey = () => {
  return (
    process.env.EXTERNAL_SOFTWARE_SECRET_KEY ||
    process.env.EXTERNAL_SECRET_KEY ||
    process.env.EXTERNAL_SOFTWARE_API_KEY ||
    process.env.EXTERNAL_API_KEY ||
    ""
  ).trim();
};

/**
 * Match an incoming origin or referer against allowed origins list.
 */
const isOriginAllowed = (origin, allowedList) => {
  if (!origin) return false;
  return allowedList.some((allowed) => {
    if (allowed === "*") return true;
    try {
      const originHost = new URL(origin).origin.toLowerCase();
      const allowedHost = new URL(allowed).origin.toLowerCase();
      return originHost === allowedHost;
    } catch {
      return origin.toLowerCase() === allowed.toLowerCase();
    }
  });
};

/**
 * Extract secret key from request:
 * - Header: x-secret-key
 * - Header: x-api-key
 * - Header: Authorization (Bearer <key> or raw)
 * - Query parameter: secretKey or apiKey
 */
const extractProvidedSecretKey = (req) => {
  if (req.headers["x-secret-key"]) return req.headers["x-secret-key"].trim();
  if (req.headers["x-api-key"]) return req.headers["x-api-key"].trim();

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1].trim();
    }
    return authHeader.trim();
  }

  if (req.query.secretKey) return String(req.query.secretKey).trim();
  if (req.query.apiKey) return String(req.query.apiKey).trim();

  return null;
};

/**
 * Check if the request origin / referer matches allowed sites.
 */
const isRequestOriginAuthorized = (req) => {
  const allowed = getAllowedOrigins();

  if (allowed.includes("*")) {
    return true;
  }

  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, allowed)) {
    return true;
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isOriginAllowed(refererOrigin, allowed)) {
        return true;
      }
    } catch {}
  }

  const siteOrigin = req.headers["x-site-origin"];
  if (siteOrigin && isOriginAllowed(siteOrigin, allowed)) {
    return true;
  }

  return false;
};

/**
 * --------------------------------------------------------------------------
 * SEPARATE CORS CONFIGURATION (Task 2)
 * --------------------------------------------------------------------------
 * Strictly allows only GET and OPTIONS methods, and authorized origins.
 */
const externalCorsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const allowed = getAllowedOrigins();
    if (isOriginAllowed(origin, allowed)) {
      return callback(null, true);
    }

    return callback(new Error("CORS access denied: Origin not authorized"));
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-secret-key",
    "x-api-key",
    "x-site-origin",
    "x-requested-with",
  ],
  credentials: true,
  maxAge: 86400,
});

// Safely wrap CORS middleware to return JSON errors instead of unhandled 500 HTML
router.use((req, res, next) => {
  externalCorsMiddleware(req, res, (err) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: err.message || "CORS access denied: Origin not authorized",
      });
    }
    next();
  });
});

/**
 * --------------------------------------------------------------------------
 * TASK 1: READ-ONLY ACCESS GUARD
 * --------------------------------------------------------------------------
 * Strictly permits only GET (read) and OPTIONS (CORS preflight).
 * Any mutation request (POST, PUT, DELETE, PATCH, etc.) is rejected with 405.
 */
router.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed. This endpoint provides read-only access.`,
    });
  }
  next();
});

/**
 * --------------------------------------------------------------------------
 * TASK 2: ORIGIN & SECRET KEY VALIDATION MIDDLEWARE
 * --------------------------------------------------------------------------
 * No device restrictions! Accessible from any device or client that provides:
 *   1. Valid Secret Key
 *   2. Authorized Origin / Site
 */
const validateOriginAndSecretKey = (req, res, next) => {
  // Allow preflight OPTIONS
  if (req.method === "OPTIONS") {
    return next();
  }

  // 1. Validate Secret Key
  const expectedSecretKey = getExpectedSecretKey();
  const providedSecretKey = extractProvidedSecretKey(req);

  if (expectedSecretKey) {
    if (!providedSecretKey || providedSecretKey !== expectedSecretKey) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or missing secret key.",
      });
    }
  }

  // 2. Validate Origin
  if (!isRequestOriginAuthorized(req)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Origin site is not authorized to access this endpoint.",
    });
  }

  // Origin & Secret Key are both verified
  next();
};

router.use(validateOriginAndSecretKey);

/**
 * --------------------------------------------------------------------------
 * DATE & ATTENDANCE HELPERS
 * --------------------------------------------------------------------------
 */

// Helper to get today's date in Indian Standard Time (YYYY-MM-DD)
const getTodayISTString = () => {
  const now = new Date();
  const istOffsetMs = 330 * 60 * 1000; // +5:30 in ms
  const istDate = new Date(now.getTime() + istOffsetMs);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Build date range query to match attendance records for the given date
const getAttendanceDateRange = (dateStr) => {
  const istStart = new Date(`${dateStr}T00:00:00+05:30`);
  const istEnd = new Date(`${dateStr}T23:59:59.999+05:30`);
  const utcStart = new Date(`${dateStr}T00:00:00.000Z`);
  const utcEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const minDate = new Date(Math.min(istStart.getTime(), utcStart.getTime()));
  const maxDate = new Date(Math.max(istEnd.getTime(), utcEnd.getTime()));

  return { minDate, maxDate };
};

const formatTimeISO = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * --------------------------------------------------------------------------
 * TASK 4: MAP FACULTY DETAILS & ATTENDANCE LOGS
 * --------------------------------------------------------------------------
 */
const mapFacultyDetails = (faculty, attendanceRecord, dateStr) => {
  let inTime = null;
  let outTime = null;

  if (attendanceRecord) {
    if (attendanceRecord.inTime) {
      inTime = formatTimeISO(attendanceRecord.inTime);
    }

    if (attendanceRecord.outTime) {
      // If only 1 punch was recorded and flagged as missed punch, the faculty has not punched out yet
      if (
        attendanceRecord.totalPunches === 1 &&
        attendanceRecord.missedPunch &&
        attendanceRecord.inTime &&
        attendanceRecord.outTime &&
        new Date(attendanceRecord.inTime).getTime() ===
          new Date(attendanceRecord.outTime).getTime()
      ) {
        outTime = null;
      } else {
        outTime = formatTimeISO(attendanceRecord.outTime);
      }
    }
  }

  return {
    empId: faculty.empId || null,
    salutation: faculty.salutation || null,
    firstName: faculty.firstName || "",
    lastName: faculty.lastName || "",
    gender: faculty.gender || null,
    community: faculty.community || null,
    caste: faculty.caste || null,
    dob: faculty.dob ? new Date(faculty.dob).toISOString() : null,
    email: faculty.email || null,
    organizationEmail: faculty.organizationEmail || null,
    phone: faculty.phone || null,
    employeeCategory: faculty.employeeCategory || null,
    designation: faculty.designation || null,
    jobTitle: faculty.jobTitle || null,
    department: faculty.department || null,
    originalDepartment: faculty.originalDepartment || null,
    profileImage:
      faculty.profileImage &&
      (faculty.profileImage.url || faculty.profileImage.publicId)
        ? {
            url: faculty.profileImage.url || null,
            publicId: faculty.profileImage.publicId || null,
          }
        : null,
    inTime: inTime,
    outTime: outTime,
    attendance: {
      date: dateStr,
      inTime: inTime,
      outTime: outTime,
      status: attendanceRecord ? attendanceRecord.status || null : null,
    },
  };
};

/**
 * --------------------------------------------------------------------------
 * ROUTE: GET ALL FACULTIES WITH ATTENDANCE
 * --------------------------------------------------------------------------
 * Endpoint: GET /api/external/faculties
 * Headers:
 *  - x-secret-key: <your_secret_key> (or x-api-key or Authorization: Bearer <key>)
 *  - Origin: <authorized_site_url>
 * Query parameters:
 *  - date: YYYY-MM-DD (defaults to today in IST)
 *  - empId: Optional filter by employee ID
 *  - department: Optional filter by department name
 *  - employeeCategory: Optional filter by employee category
 *  - includeInactive: Set "true" to include inactive/resigned faculty
 *  - format: Set "raw" to return array directly without envelope
 */
router.get("/", async (req, res) => {
  try {
    let targetDateStr = req.query.date;
    if (targetDateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Expected YYYY-MM-DD.",
        });
      }
    } else {
      targetDateStr = getTodayISTString();
    }

    // Faculty filter
    const facultyFilter = {};

    if (req.query.includeInactive !== "true") {
      facultyFilter.employmentStatus = true;
      facultyFilter.isActive = true;
    }

    if (req.query.empId) {
      facultyFilter.empId = req.query.empId;
    }

    if (req.query.department) {
      facultyFilter.department = req.query.department;
    }

    if (req.query.employeeCategory) {
      facultyFilter.employeeCategory = req.query.employeeCategory;
    }

    // Fetch faculty records with only necessary fields
    const faculties = await Faculty.find(facultyFilter)
      .select(
        "empId salutation firstName lastName gender community caste dob email organizationEmail phone employeeCategory designation jobTitle department originalDepartment profileImage"
      )
      .sort({ empId: 1 })
      .lean();

    if (!faculties || faculties.length === 0) {
      if (req.query.format === "raw") {
        return res.status(200).json([]);
      }
      return res.status(200).json({
        success: true,
        count: 0,
        attendanceDate: targetDateStr,
        data: [],
      });
    }

    const facultyIds = faculties.map((f) => f._id);

    // Fetch attendance records for target date in bulk
    const { minDate, maxDate } = getAttendanceDateRange(targetDateStr);
    const attendances = await Attendance.find({
      facultyId: { $in: facultyIds },
      attendanceDate: { $gte: minDate, $lte: maxDate },
    }).lean();

    // Index attendance by facultyId
    const attendanceMap = new Map();
    attendances.forEach((att) => {
      attendanceMap.set(att.facultyId.toString(), att);
    });

    const results = faculties.map((faculty) => {
      const att = attendanceMap.get(faculty._id.toString());
      return mapFacultyDetails(faculty, att, targetDateStr);
    });

    if (req.query.format === "raw") {
      return res.status(200).json(results);
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      attendanceDate: targetDateStr,
      data: results,
    });
  } catch (error) {
    console.error("Error in External Faculty endpoint:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching faculty details.",
      error: process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});

/**
 * --------------------------------------------------------------------------
 * ROUTE: GET SINGLE FACULTY BY EMPID
 * --------------------------------------------------------------------------
 * Endpoint: GET /api/external/faculties/:empId
 */
router.get("/:empId", async (req, res) => {
  try {
    const { empId } = req.params;

    let targetDateStr = req.query.date;
    if (targetDateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Expected YYYY-MM-DD.",
        });
      }
    } else {
      targetDateStr = getTodayISTString();
    }

    const faculty = await Faculty.findOne({ empId })
      .select(
        "empId salutation firstName lastName gender community caste dob email organizationEmail phone employeeCategory designation jobTitle department originalDepartment profileImage"
      )
      .lean();

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: `Faculty with empId "${empId}" not found.`,
      });
    }

    const { minDate, maxDate } = getAttendanceDateRange(targetDateStr);
    const attendance = await Attendance.findOne({
      facultyId: faculty._id,
      attendanceDate: { $gte: minDate, $lte: maxDate },
    }).lean();

    const result = mapFacultyDetails(faculty, attendance, targetDateStr);

    if (req.query.format === "raw") {
      return res.status(200).json(result);
    }

    return res.status(200).json({
      success: true,
      attendanceDate: targetDateStr,
      data: result,
    });
  } catch (error) {
    console.error(
      `Error in External Faculty endpoint for empId ${req.params.empId}:`,
      error
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching faculty details.",
      error: process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});

/**
 * Fallback for any other methods / subpaths on this route
 */
router.use((req, res) => {
  res.setHeader("Allow", "GET, OPTIONS");
  return res.status(405).json({
    success: false,
    message: `Method ${req.method} Not Allowed on ${req.originalUrl}. This endpoint is strictly read-only.`,
  });
});

module.exports = router;
