const express = require("express");
const router = express.Router();
const payrollController = require("../controllers/payrollController");
const protect = require("../middleware/protect");


const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
    cb(null, true);
  },
});

router.use(protect);

router.post("/import", upload.single("file"), payrollController.importPayrollExcel);
router.get("/faculty/:facultyId", payrollController.getPayrollByFacultyId);
router.get("/:id", payrollController.getPayrollById);
router.get("/", payrollController.getAllPayroll);

module.exports = router;
