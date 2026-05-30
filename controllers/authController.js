const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Faculty = require("../models/Faculty");

const sendMail = require("../utils/sendMail");
const generateToken = require("../utils/generateToken");
const renderTemplate = require("../utils/renderTemplate");

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    // ❌ USER NOT FOUND
    if (!user) {
      return res.status(401).json({ message: "User Not Found" });
    }
    if (!user.hasAccess) {
      return res.status(403).json({
        message: "Access denied. Contact HR.",
      });
    }
    const isMatch = await bcrypt.compare(password, user.password);

    // ❌ WRONG PASSWORD
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department,
      role: user.role,
      isFirstTimeLogin: user.isFirstTimeLogin,
      facultyId: user.facultyId,
      hasAccess: user.hasAccess,
      token: generateToken(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found for this email" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOtp = otp;
    user.resetOtpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    const htmlContent = renderTemplate("forgotPassword", {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      otp,
      frontendUrl: process.env.FRONTEND_URL,
    });

    await sendMail(
      email,
      "Password Reset OTP - SECE HRMS Portal",
      htmlContent,
    );

    res.json({ message: "Otp sent to mail" });
  } catch (error) {
    res.status(500).json({ messgae: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found for this email" });
    if (
      !user.resetOtp ||
      user.resetOtp != otp ||
      user.resetOtpExpiry < Date.now()
    ) {
      return res.status(404).json({ message: "Invalid or expired otp" });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;

    await user.save();
    res.json({ message: "Password changed sucessfully" });
  } catch (error) {
    res.status(500).json({ message: error.mesaage });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found for this email" });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();
    res.json({ mesaage: "Password changed sucessfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
  .select("-password")
  .populate({
    path: "facultyId",
    populate: {
      path: "shiftId"
    }
  })

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.firstLoginComplete = async (
  req,
  res
) => {
  try {
    const user = await User.findById(
      req.user.id
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isFirstTimeLogin = false;

    await user.save();

    res.status(200).json({
      message: "First login completed",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};