const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
  },
  { _id: false },
);

const qualificationSchema = new mongoose.Schema(
  {
    degree: {
      type: String,
      required: true,
    },
    specialization: String,
    institutionName: {
      type: String,
      required: true,
    },
    institutionLocation: String,
    yearOfPassing: Number,
    percentage: Number,
    cgpa: Number,
  },
  { _id: false },
);

const experienceSchema = new mongoose.Schema(
  {
    organization: String,
    designation: String,
    fromDate: Date,
    toDate: Date,
    yearsOfExperience: Number,
  },
  { _id: false },
);

const facultySchema = new mongoose.Schema(
  {
    empId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    salutation: {
      type: String,
      enum: ["Mr", "Mrs", "Ms", "Dr", "Prof"],
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      required: true,
      enum: ["Male", "Female", "Other"],
    },

    dob: {
      type: Date,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    organizationEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    qualifications: [qualificationSchema],

    experiences: [experienceSchema],

    workType: {
      type: String,
      required: true,
      enum: ["Permanent", "Temporary"],
    },

    timeType: {
      type: String,
      required: true,
      enum: ["Full-Time", "Part-Time", "Contract"],
    },

    employeeCategory: {
      type: String,
      required: true,
      enum: ["Teaching", "Non-Teaching", "Driver", "Housekeeping"],
    },

    doj: {
      type: Date,
      required: true,
    },

    probationPeriod: String,

    noticePeriod: String,

    designation: {
      type: String,
      required: true,
    },

    jobTitle: {
      type: String,
      required: true,
    },

    department: {
      type: String,
      required: true,
    },

    reportingTo: {
      facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Faculty",
      },
      empId: String,
      name: String,
    },

    employmentStatus: {
      type: Boolean,
      default: true,
    },

    address: {
      doorNo: String,
      street: String,
      city: String,
      district: String,
      state: String,
      pincode: String,
      country: {
        type: String,
        default: "India",
      },
    },

    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },

    profileImage: documentSchema,

    identityDetails: {
      aadharNumber: {
        type: String,
        unique: true,
        sparse: true,
      },

      panNumber: {
        type: String,
        unique: true,
        sparse: true,
      },

      pfNumber: {
        type: String,
        unique: true,

        sparse: true,
      },
    },

    bankDetails: {
      accountNumber: {
        type: String,
        unique: true,
        sparse: true,
      },

      bankName: String,

      ifscCode: String,

      branchLocation: String,
    },

    documents: {
      markSheets: [documentSchema],

      degreeCertificates: [documentSchema],

      experienceCertificates: [documentSchema],

      relievingLetter: [documentSchema],

      otherDocuments: [documentSchema],
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    punchId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Faculty", facultySchema);
