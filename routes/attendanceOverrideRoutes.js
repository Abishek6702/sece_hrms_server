const express = require("express");
const router = express.Router();
const controller = require("../controllers/attendanceOverrideController");
const protect = require("../middleware/protect");

// Get override history for a single employee (optional start/end query params)
router.get("/employee/:employeeId", protect, controller.getOverridesByEmployee);

// Update override by employee and date (PUT only, no create)
router.put("/employee/:employeeId/date/:date", protect, controller.updateOverrideByEmployeeDate);

// List overrides with pagination and filters: ?page=&limit=&employeeId=&start=&end=&date=
router.get("/", protect, controller.listOverrides);

// Get single override record
router.get("/record/:id", protect, controller.getOverrideById);

// Create or upsert a single override record (includes remarks)
router.post("/", protect, controller.createOrUpsertOverride);

// Remark APIs
// Upsert remark for a single employee+date
router.post("/remark", protect, controller.upsertRemarkByEmployee);

// Update remark by override record id
router.put("/remark/:id", protect, controller.updateRemarkById);

// Bulk remark update for an employee
router.post("/remark/bulk/employee", protect, controller.bulkUpdateRemarksByEmployee);

// Bulk remark update for a date
router.post("/remark/bulk/date", protect, controller.bulkUpdateRemarksByDate);

// Get override history for a specific date (YYYY-MM-DD or Date string)
router.get("/date/:date", protect, controller.getOverridesByDate);

// Update a single override record by id
router.put("/:id", protect, controller.updateOverride);

// Bulk update for an employee: body { facultyId, overrides: [{attendanceDate, session1, session2, remarks}], overriddenBy }
router.post("/bulk/employee", protect, controller.bulkUpdateByEmployee);

// Bulk update for a date: body { attendanceDate, overrides: [{facultyId, session1, session2, remarks}], overriddenBy }
router.post("/bulk/date", protect, controller.bulkUpdateByDate);

module.exports = router;
