module.exports = ({
    name,
    empId,
    email,
    password,
    role,
  }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; background-color: #f9f9f9;">
  
    <h2 style="text-align:center; color:#2c3e50;">
      Welcome to SECE HRMS
    </h2>
  
    <p>Dear <b>${name}</b>,</p>
  
    <p>
      Your employee account has been created successfully.
    </p>
  
    <div style="background:#fff; border:1px solid #ddd; border-radius:6px; padding:15px; margin:20px 0;">
    
      <p><b>Employee ID:</b> ${empId}</p>
  
      <p><b>Login Email:</b> ${email}</p>
  
      <p><b>Default Password:</b> ${password}</p>
  
      <p><b>Role:</b> ${role}</p>
  
    </div>
  
    <p>
      Please login and change your password after your first login.
    </p>
  
    <p style="margin-top:20px;">
      Regards,<br/>
      <b>SECE HRMS Team</b>
    </p>
  
  </div>
  `;