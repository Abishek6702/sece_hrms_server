const express = require("express");

const { getAttendanceMuster } = require("../controllers/attendanceController");

const router = express.Router();

router.get("/muster", getAttendanceMuster);

module.exports = router;
