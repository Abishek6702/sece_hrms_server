module.exports = (data) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
      <h2 style="color: #333;">Payroll Details Available</h2>
      <p>Dear ${data.facultyName},</p>
      <p>Your payroll details for <strong>${data.month} ${data.year}</strong> have been successfully added to the HRMS.</p>
      <p>You can log in to the HRMS portal and view your salary details from your Faculty Dashboard.</p>
      <br />
      <p>Regards,</p>
      <p><strong>HR Department</strong></p>
    </div>
  `;
};
