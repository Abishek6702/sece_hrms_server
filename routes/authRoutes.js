const express = require("express");
const {
  login,
  createAdmin,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
} = require("../controllers/authController");
const protect = require("../middleware/protect");

const router = express.Router();

router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", changePassword);
router.post("/add-admin", createAdmin);
router.get("/me", protect, getProfile);

module.exports = router;
