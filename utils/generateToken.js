const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      isadmin: user.isadmin,
      isFirstTimeLogin: user.isFirstTimeLogin,
      facultyId: user.facultyId,
      hasAccess: user.hasAccess,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

module.exports = generateToken;