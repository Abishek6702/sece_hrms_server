const forgotPassword = require("./mailTemplates/forgotpassword.js");
const welcomeFaculty = require("./mailTemplates/welcomeFaculty.js");
const payrollSuccess = require("./mailTemplates/payrollSuccess.js");

const templates = {
  forgotPassword,
  welcomeFaculty,
  payrollSuccess,
};

function renderTemplate(templateName, data) {
  const templateFn = templates[templateName];
  if (!templateFn) {
    throw new Error(`Template "${templateName}" not found`);
  }
  return templateFn(data);
}

module.exports = renderTemplate;
