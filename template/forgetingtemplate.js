// forgetPasswordTemplate.js

const forgetPasswordTemplate = (newPassword, username, loginUrl) => {
  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>New Password</title>
    <style>
      @media only screen and (max-width:480px){
        .container { width:100% !important; padding:16px !important; }
        .hero { font-size:20px !important; }
        .password { font-size:26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <!-- main container -->
          <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:white;border-radius:12px;box-shadow:0 6px 18px rgba(10,20,30,0.08);overflow:hidden;">
            
            <!-- header -->
            <tr>
              <td style="padding:22px 28px 8px;background:linear-gradient(90deg, #a66804, #FFC059);color:white;">
                <h1 style="margin:0;font-size:20px;font-weight:700;">Virexcode</h1>
              </td>
            </tr>

            <!-- hero -->
            <tr>
              <td style="padding:28px;">
                <p class="hero" style="margin:0 0 16px;font-size:18px;color:#0f1724;">Dear ${username} </p>
                <p style="margin:0 0 24px;color:#475569;line-height:1.5;">
                  We’ve generated a new password for your account. Please use it to log in and remember to change it after signing in.
                </p>

                <!-- PASSWORD BOX -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;">
                  <tr>
                    <td align="center">
                      <div style="display:inline-block;padding:18px 26px;border-radius:10px;background:#0f1724;color:white;">
                        <span class="password" style="display:inline-block;font-family: 'Courier New',Courier,monospace;font-size:32px;font-weight:800;letter-spacing:2px;">
                          ${newPassword}
                        </span>
                      </div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 24px;color:#6b7280;">
                  For security, we recommend that you change this password after logging in.
                </p>

                <!-- CTA button -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;">
                  <tr>
                    <td align="center" style="padding-top:8px;">
                      <a href="${loginUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#FFC059;color:white;text-decoration:none;font-weight:600;">
                        Go to Login
                      </a>
                    </td>
                  </tr>
                </table>

                <hr style="border:none;border-top:1px solid #eef2f7;margin:24px 0;" />

                <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.4;">
                  Need help? Contact our support at
                  <a href="mailto:support@virex.code" style="color:#FFC059;text-decoration:none;">support@virex.code</a>.
                </p>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:18px 28px;background:#fbfdff;color:#9aa7bb;font-size:12px;">
                <p style="margin:0;">
                  © <span id="year">${new Date().getFullYear()}</span> Virexcode • 
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
};

module.exports = forgetPasswordTemplate;
