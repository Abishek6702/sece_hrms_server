const { Readable } = require("stream");
const { EventEmitter } = require("events");
const express = require("express");

// Mock Faculty and Attendance models
jest.mock("../models/Faculty", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock("../models/attendance", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

// Mock rateLimiter to avoid test rate-limiting
jest.mock("../middleware/rateLimiter", () => ({
  apiLimiter: (req, res, next) => next(),
}));

const Faculty = require("../models/Faculty");
const Attendance = require("../models/attendance");
const externalFacultyRoutes = require("../routes/externalFacultyRoutes");

function createMockReqRes(method, path, headers = {}) {
  const req = new Readable({
    read() {
      this.push(null);
    },
  });

  req.method = method;
  req.url = path;
  req.originalUrl = path;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  req.get = (name) => req.headers[name.toLowerCase()];
  req.header = req.get;
  req.connection = { remoteAddress: "127.0.0.1" };
  req.socket = req.connection;

  const urlObj = new URL("http://localhost" + path);
  req.query = {};
  urlObj.searchParams.forEach((val, key) => {
    req.query[key] = val;
  });

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  const promise = new Promise((resolve) => {
    res.send = (body) => {
      let parsed = body;
      try {
        parsed = JSON.parse(body);
      } catch {}
      res.emit("finish");
      resolve({ status: res.statusCode, headers: res.headers, body: parsed });
    };
    res.json = (obj) => {
      res.emit("finish");
      resolve({ status: res.statusCode, headers: res.headers, body: obj });
    };
    res.end = (chunk) => {
      res.emit("finish");
      resolve({ status: res.statusCode, headers: res.headers, body: chunk });
    };
  });

  return { req, res, promise };
}

describe("External Faculty Endpoint - Origin & Secret Key Validation", () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXTERNAL_SOFTWARE_ALLOWED_ORIGIN: "https://authorized-site.edu",
      EXTERNAL_SOFTWARE_SECRET_KEY: "my-secret-key-123",
      NODE_ENV: "production",
    };

    app = express();
    app.use("/api/external/faculties", externalFacultyRoutes);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const makeRequest = async (method, path, headers = {}) => {
    const { req, res, promise } = createMockReqRes(method, path, headers);
    app.handle(req, res);
    return await promise;
  };

  describe("Secret Key and Origin Validation", () => {
    it("should allow request with both valid Origin and valid Secret Key (via x-secret-key)", async () => {
      Faculty.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await makeRequest("GET", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        "x-secret-key": "my-secret-key-123",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should allow request with valid Secret Key passed in Authorization header", async () => {
      Faculty.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await makeRequest("GET", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        Authorization: "Bearer my-secret-key-123",
      });

      expect(res.status).toBe(200);
    });

    it("should reject request when Secret Key is missing", async () => {
      const res = await makeRequest("GET", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("missing secret key");
    });

    it("should reject request when Secret Key is wrong", async () => {
      const res = await makeRequest("GET", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        "x-secret-key": "wrong-secret-key",
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid or missing secret key");
    });

    it("should reject request when Origin is unauthorized, even if Secret Key is valid", async () => {
      const res = await makeRequest("GET", "/api/external/faculties", {
        Origin: "https://unauthorized-origin.com",
        "x-secret-key": "my-secret-key-123",
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("should allow CORS preflight (OPTIONS) without requiring secret key", async () => {
      const res = await makeRequest("OPTIONS", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        "Access-Control-Request-Method": "GET",
      });

      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://authorized-site.edu"
      );
      expect(res.status).toBe(204);
    });
  });

  describe("Read-Only Enforcement", () => {
    it("should reject POST requests with 405 Method Not Allowed", async () => {
      const res = await makeRequest("POST", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        "x-secret-key": "my-secret-key-123",
      });

      expect(res.status).toBe(405);
      expect(res.headers["allow"]).toBe("GET, OPTIONS");
      expect(res.body.message).toContain("Method POST Not Allowed");
    });

    it("should reject PUT requests with 405 Method Not Allowed", async () => {
      const res = await makeRequest("PUT", "/api/external/faculties", {
        Origin: "https://authorized-site.edu",
        "x-secret-key": "my-secret-key-123",
      });

      expect(res.status).toBe(405);
    });
  });

  describe("Faculty Details and Attendance Logs", () => {
    it("should return the exact requested fields and attendance logs", async () => {
      const mockFaculty = {
        _id: "60c72b2f9b1d8b2bad8e5f11",
        empId: "SECE001",
        salutation: "Dr",
        firstName: "Ramesh",
        lastName: "Kumar",
        gender: "Male",
        community: "BC",
        caste: "TestCaste",
        dob: new Date("1985-05-15T00:00:00.000Z"),
        email: "ramesh@gmail.com",
        organizationEmail: "ramesh.k@sece.ac.in",
        phone: "9876543210",
        employeeCategory: "Teaching",
        designation: "Associate Professor",
        jobTitle: "Faculty Lead",
        department: "CSE",
        originalDepartment: "CSE",
        profileImage: {
          url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
          publicId: "sample_id",
        },
        bankDetails: { accountNumber: "123456789" },
      };

      const mockAttendance = {
        _id: "60c72b2f9b1d8b2bad8e5f99",
        facultyId: "60c72b2f9b1d8b2bad8e5f11",
        attendanceDate: new Date("2026-11-14T00:00:00.000Z"),
        inTime: new Date("2026-11-14T03:30:00.000Z"),
        outTime: new Date("2026-11-14T11:45:00.000Z"),
        totalPunches: 2,
        missedPunch: false,
        status: "Present",
      };

      Faculty.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([mockFaculty]),
          }),
        }),
      });

      Attendance.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockAttendance]),
      });

      const res = await makeRequest(
        "GET",
        "/api/external/faculties?date=2026-11-14",
        {
          Origin: "https://authorized-site.edu",
          "x-secret-key": "my-secret-key-123",
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);

      const item = res.body.data[0];
      expect(item.empId).toBe("SECE001");
      expect(item.salutation).toBe("Dr");
      expect(item.firstName).toBe("Ramesh");
      expect(item.lastName).toBe("Kumar");
      expect(item.gender).toBe("Male");
      expect(item.community).toBe("BC");
      expect(item.caste).toBe("TestCaste");
      expect(item.dob).toBe("1985-05-15T00:00:00.000Z");
      expect(item.email).toBe("ramesh@gmail.com");
      expect(item.organizationEmail).toBe("ramesh.k@sece.ac.in");
      expect(item.phone).toBe("9876543210");
      expect(item.employeeCategory).toBe("Teaching");
      expect(item.designation).toBe("Associate Professor");
      expect(item.jobTitle).toBe("Faculty Lead");
      expect(item.department).toBe("CSE");
      expect(item.originalDepartment).toBe("CSE");
      expect(item.profileImage).toEqual({
        url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        publicId: "sample_id",
      });

      expect(item.inTime).toBe("2026-11-14T03:30:00.000Z");
      expect(item.outTime).toBe("2026-11-14T11:45:00.000Z");
      expect(item.bankDetails).toBeUndefined();
    });

    it("should return inTime: null and outTime: null when attendance is absent", async () => {
      const mockFaculty = {
        _id: "60c72b2f9b1d8b2bad8e5f22",
        empId: "SECE002",
        firstName: "Anitha",
        lastName: "S",
      };

      Faculty.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([mockFaculty]),
          }),
        }),
      });

      Attendance.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const res = await makeRequest(
        "GET",
        "/api/external/faculties?date=2026-11-14",
        {
          Origin: "https://authorized-site.edu",
          "x-secret-key": "my-secret-key-123",
        }
      );

      expect(res.status).toBe(200);
      const item = res.body.data[0];
      expect(item.inTime).toBeNull();
      expect(item.outTime).toBeNull();
    });
  });
});
