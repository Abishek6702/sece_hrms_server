const express = require("express");
const {
  login,
  createAdmin,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  firstLoginComplete,
  createUser
} = require("../controllers/authController");
const protect = require("../middleware/protect");

const router = express.Router();

router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.patch("/first-login-complete", protect, firstLoginComplete);
router.get("/me", protect, getProfile);
router.post("/create-user", createUser);

module.exports = router;
