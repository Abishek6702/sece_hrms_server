const rateLimit = require("express-rate-limit");

// 300 requests every 15 minutes from single ip
exports.apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 300,                 
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  });

// 5 login attempts every 15 minutes from single ip
exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many login attempts. Please try again after 15 minutes.",
    },
  });

