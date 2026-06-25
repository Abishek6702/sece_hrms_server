const AuditLog = require("../models/AuditLog");

const auditLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    try {
      // Ignore browser favicon
      if (req.originalUrl === "/favicon.ico") return;

      // Ignore preflight requests
      if (req.method === "OPTIONS") return;

      // Ignore Audit Log APIs (when you create them later)
      if (req.originalUrl.startsWith("/api/audit-log")) return;

      await AuditLog.create({
        userId: req.user?._id || null,

        empId: req.user?.empId || null,

        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : "Anonymous",

        role: req.user?.role || "Guest",

        action: `${req.method} ${req.originalUrl}`,

        method: req.method,

        endpoint: req.originalUrl,

        statusCode: res.statusCode,

        success: res.statusCode >= 200 && res.statusCode < 400,

        ipAddress: req.ip,

        userAgent: req.get("User-Agent"),

        responseTime: Date.now() - start,
      });
    } catch (err) {
      console.error("Audit Log Error:", err.message);
    }
  });

  next();
};

module.exports = auditLogger;