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

const router = express.Router();

router.post("/login/v1", loginv1);
router.post("/login", login);
router.post("/verify-login-otp", verifyLoginOtp);
router.post("/verify-password",protect, verifyPassword);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.patch("/first-login-complete", protect, firstLoginComplete);
router.get("/me", protect, getProfile);
router.post("/create-user", createUser);

module.exports = router;
