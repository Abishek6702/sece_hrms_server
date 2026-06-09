const express = require("express");
const router = express.Router();
const protect = require("../middleware/protect");
const { getMyTeam } = require("../controllers/myteamController");

router.get("/", protect, getMyTeam);

module.exports = router;
