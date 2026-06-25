const express = require("express");
const {
  login,
  createAdmin,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  firstLoginComplete,
  createUser,
  loginv1,
  verifyLoginOtp,
  verifyPassword,
} = require("../controllers/authController");
const protect = require("../middleware/protect");
const { loginLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/login/v1",loginLimiter, loginv1);
router.post("/login",loginLimiter, login);
router.post("/verify-login-otp",loginLimiter, verifyLoginOtp);
router.post("/verify-password",protect, verifyPassword);

router.post("/forgot-password",loginLimiter, forgotPassword);
router.post("/reset-password",loginLimiter, resetPassword);
router.post("/change-password", protect, changePassword);
router.patch("/first-login-complete", protect, firstLoginComplete);
router.get("/me", protect, getProfile);
router.post("/create-user",protect, createUser);

module.exports = router;
