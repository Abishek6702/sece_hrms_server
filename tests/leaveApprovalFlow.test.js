jest.mock("../models/Leave/leaveApplication", () => ({
  findById: jest.fn(),
}));
jest.mock("../models/Leave/leaveBalance", () => ({
  findOne: jest.fn(),
}));
jest.mock("../models/Leave/leaveType", () => ({}));
jest.mock("../models/Faculty", () => ({}));
jest.mock("../models/User", () => ({
  findById: jest.fn(),
}));
jest.mock("../utils/getCurrentAcademicYear", () => jest.fn(() => "2026-2027"));
jest.mock("../services/reprocessFacultyDateRange", () => ({
  reprocessFacultyDateRange: jest.fn(),
}));

const LeaveApplication = require("../models/Leave/leaveApplication");
const LeaveBalance = require("../models/Leave/leaveBalance");
const User = require("../models/User");
const { approveLeave } = require("../controllers/Leave/leaveApplicationController");

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

const createLeave = (leaveName, currentApprovalLevel) => ({
  status: "Pending",
  currentApprovalLevel,
  facultyId: "faculty-id",
  fromDate: new Date("2026-09-10"),
  toDate: new Date("2026-09-10"),
  totalDays: 1,
  leaveTypeId: {
    _id: "leave-type-id",
    leaveName,
  },
  approvalStatus: {
    hodStatus: "Pending",
    researchStatus: "Pending",
    coeStatus: "Pending",
    iqacStatus: "Pending",
    principalStatus: "Pending",
  },
  approvalHistory: [],
  save: jest.fn().mockResolvedValue(),
});

const approveAs = async (leave, role) => {
  LeaveApplication.findById.mockReturnValueOnce({
    populate: jest.fn().mockResolvedValue(leave),
  });
  User.findById.mockResolvedValueOnce({
    _id: `${role}-id`,
    role,
  });

  const response = createResponse();
  await approveLeave(
    {
      params: { id: "leave-id" },
      body: {},
      user: { id: `${role}-id` },
    },
    response,
  );

  expect(response.status).toHaveBeenCalledWith(200);
};

describe("On Duty leave approval flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LeaveBalance.findOne.mockResolvedValue({
      usedDays: 0,
      remainingDays: 5,
      save: jest.fn().mockResolvedValue(),
    });
  });

  it("routes Research through Dean Research, IQAC, then Principal", async () => {
    const leave = createLeave("On Duty - Research", "hod");

    await approveAs(leave, "hod");
    expect(leave.currentApprovalLevel).toBe("dean-research");

    await approveAs(leave, "dean-research");
    expect(leave.currentApprovalLevel).toBe("dean-iqac");

    await approveAs(leave, "dean-iqac");
    expect(leave.currentApprovalLevel).toBe("principal");

    await approveAs(leave, "principal");
    expect(leave.status).toBe("Approved");
    expect(leave.currentApprovalLevel).toBe("completed");
  });

  it("routes Examination through COE, IQAC, then Principal", async () => {
    const leave = createLeave("On Duty - Examination", "hod");

    await approveAs(leave, "hod");
    expect(leave.currentApprovalLevel).toBe("coe");

    await approveAs(leave, "coe");
    expect(leave.currentApprovalLevel).toBe("dean-iqac");

    await approveAs(leave, "dean-iqac");
    expect(leave.currentApprovalLevel).toBe("principal");
  });

  it("routes Official through IQAC, then Principal", async () => {
    const leave = createLeave("On Duty - Official", "hod");

    await approveAs(leave, "hod");
    expect(leave.currentApprovalLevel).toBe("dean-iqac");

    await approveAs(leave, "dean-iqac");
    expect(leave.currentApprovalLevel).toBe("principal");
  });
});
