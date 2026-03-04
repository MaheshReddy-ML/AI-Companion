
import nodemailer from "nodemailer";

const sendOTP = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Professional Email Template
  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        /* Import Google Font for a modern look */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      </style>
    </head>
    <body style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
      
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f8; padding: 40px 0;">
        <tr>
          <td align="center">
            
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
              
              <tr>
                <td style="background-color: #000000; padding: 24px; text-align: center;">
                  <div style="color: #ffffff; font-size: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 10px;">
                    <img src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png" alt="Logo" width="28" height="28" style="vertical-align: middle; filter: invert(1);">
                    <span style="vertical-align: middle; margin-left: 8px;">AI Companion</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 32px;">
                  <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px; text-align: center; font-weight: 600;">Verification Code</h1>
                  
                  <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                    Hello, <br>
                    We received a request to reset your password for your <strong>AI Companion</strong> account. Please use the following One-Time Password (OTP) to complete the process.
                  </p>

                  <div style="background-color: #f0f4f8; border-radius: 8px; padding: 16px; margin: 0 auto 32px auto; text-align: center; width: fit-content; border: 1px solid #e1e4e8;">
                    <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #2563eb; font-family: monospace;">${otp}</span>
                  </div>

                  <p style="color: #64748b; font-size: 14px; text-align: center; margin-bottom: 0;">
                    This code will expire in <strong>10 minutes</strong>.<br>
                    If you did not request this code, please ignore this email or contact support if you have concerns.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background-color: #fafafa; padding: 24px; text-align: center; border-top: 1px solid #eeeeee;">
                  <p style="color: #9ca3af; font-size: 12px; margin-bottom: 8px;">
                    © ${new Date().getFullYear()} AI Companion. All rights reserved.
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    123 AI Street, Tech City, Innovation State 56000 <br>
                    <a href="#" style="color: #9ca3af; text-decoration: underline;">Privacy Policy</a> • <a href="#" style="color: #9ca3af; text-decoration: underline;">Terms of Service</a>
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"AI Companion Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your AI Companion Verification Code",
    html: emailTemplate,
  });
};

export default sendOTP;