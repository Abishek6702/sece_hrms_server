const Faculty = require("../models/Faculty");
const Permission = require("../models/permission");
const PermissionBalance = require("../models/permissionBalance");
const {
  getPermissionWindowRange,
  getPermissionAcademicYear,
  formatPeriodKey,
} = require("../utils/permissionWindow");

const createPermissionBalanceForFaculty = async (facultyId, date = new Date()) => {
  const faculty = await Faculty.findById(facultyId).select("_id");
  if (!faculty) return null;

  const { start, end } = getPermissionWindowRange(date);
  const periodKey = formatPeriodKey(start, end);
  const academicYear = getPermissionAcademicYear(start);
  const allocatedMinutes = 120;

  const approvedPermissions = await Permission.find({
    facultyId,
    status: "Approved",
    permissionDate: {
      $gte: start,
      $lte: end,
    },
  }).select("totalMinutes");

  const usedMinutes = approvedPermissions.reduce(
    (sum, permission) => sum + (permission.totalMinutes || 0),
    0,
  );

  return PermissionBalance.findOneAndUpdate(
    {
      facultyId,
      periodKey,
    },
    {
      facultyId,
      academicYear,
      allocatedMinutes,
      usedMinutes,
      remainingMinutes: Math.max(0, allocatedMinutes - usedMinutes),
      remainingHours: Math.round(Math.max(0, allocatedMinutes - usedMinutes) / 60 * 100) / 100,
      periodKey,
      windowStart: start,
      windowEnd: end,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
};

const getPermissionBalanceForFaculty = async (facultyId, date = new Date()) => {
  const { start, end } = getPermissionWindowRange(date);
  const periodKey = formatPeriodKey(start, end);

  let balance = await PermissionBalance.findOne({ facultyId, periodKey });

  if (!balance) {
    balance = await createPermissionBalanceForFaculty(facultyId, date);
  }

  return balance;
};

const incrementPermissionBalanceOnApproval = async (
  facultyId,
  minutes,
  date = new Date(),
) => {
  const balance = await getPermissionBalanceForFaculty(facultyId, date);
  if (!balance) {
    throw new Error("Unable to resolve permission balance for approval.");
  }

  if (minutes > balance.remainingMinutes) {
    throw new Error(
      "Insufficient remaining permission minutes in the current window.",
    );
  }

  const updatedUsedMinutes = balance.usedMinutes + minutes;
  const updatedRemainingMinutes = Math.max(
    0,
    balance.allocatedMinutes - updatedUsedMinutes,
  );
  const updatedRemainingHours = Math.round((updatedRemainingMinutes / 60) * 100) / 100;

  const updatedBalance = await PermissionBalance.findOneAndUpdate(
    {
      facultyId,
      periodKey: balance.periodKey,
    },
    {
      usedMinutes: updatedUsedMinutes,
      remainingMinutes: updatedRemainingMinutes,
      remainingHours: updatedRemainingHours,
    },
    {
      new: true,
    },
  );

  if (!updatedBalance) {
    throw new Error("Unable to update permission balance for approval.");
  }

  return updatedBalance;
};

const seedPermissionBalancesForAllFaculties = async () => {
  const faculties = await Faculty.find({}, "_id").lean();
  const now = new Date();
  const { start, end } = getPermissionWindowRange(now);
  const periodKey = formatPeriodKey(start, end);
  const academicYear = getPermissionAcademicYear(start);
  const allocatedMinutes = 120;

  const permissionUsage = await Permission.aggregate([
    {
      $match: {
        status: "Approved",
        permissionDate: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $group: {
        _id: "$facultyId",
        usedMinutes: { $sum: "$totalMinutes" },
      },
    },
  ]);

  const usageMap = new Map(
    permissionUsage.map((item) => [item._id.toString(), item.usedMinutes || 0]),
  );

  const bulkOps = faculties.map((faculty) => {
    const usedMinutes = usageMap.get(faculty._id.toString()) || 0;
    const remainingMinutes = Math.max(0, allocatedMinutes - usedMinutes);
    const remainingHours = Math.round((remainingMinutes / 60) * 100) / 100;

    return {
      updateOne: {
        filter: {
          facultyId: faculty._id,
          periodKey,
        },
        update: {
          $setOnInsert: {
            facultyId: faculty._id,
            academicYear,
            allocatedMinutes,
            usedMinutes,
            remainingMinutes,
            remainingHours,
            periodKey,
            windowStart: start,
            windowEnd: end,
          },
          $set: {
            academicYear,
            allocatedMinutes,
            usedMinutes,
            remainingMinutes,
            remainingHours,
            windowStart: start,
            windowEnd: end,
          },
        },
        upsert: true,
      },
    };
  });

  if (bulkOps.length === 0) {
    return {
      insertedCount: 0,
      modifiedCount: 0,
    };
  }

  return PermissionBalance.bulkWrite(bulkOps, {
    ordered: false,
  });
};

module.exports = {
  createPermissionBalanceForFaculty,
  getPermissionBalanceForFaculty,
  incrementPermissionBalanceOnApproval,
  seedPermissionBalancesForAllFaculties,
};
