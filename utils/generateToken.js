const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department,
      role: user.role,
      isadmin: user.isadmin,
      isFirstTimeLogin: user.isFirstTimeLogin,
      facultyId: user.facultyId,
      hasAccess: user.hasAccess,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
};

module.exports = generateToken;