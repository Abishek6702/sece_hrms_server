const rateLimit = require("express-rate-limit");

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

