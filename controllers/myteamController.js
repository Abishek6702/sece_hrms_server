const Faculty = require("../models/Faculty");
const Attendance = require("../models/attendance");

// HOD: get team members in their department with today's presence
exports.getMyTeam = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (req.user.role !== "hod") return res.status(403).json({ success: false, message: "Forbidden" });

    const dept = req.user.department;
    const faculties = await Faculty.find({ department: dept }).select(
      "firstName lastName empId designation employeeCategory profileImage"
    );

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const results = await Promise.all(
      faculties.map(async (f) => {
        const att = await Attendance.findOne({
          facultyId: f._id,
          attendanceDate: { $gte: start, $lte: end },
        }).sort({ createdAt: -1 });

        return {
          id: f._id,
          name: `${f.firstName} ${f.lastName}`,
          empId: f.empId,
          designation: f.designation,
          type: f.employeeCategory,
          presence: att ? att.status : "Not Marked",
          profileImage: f.profileImage || null,
        };
      }),
    );

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("getMyTeam error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
