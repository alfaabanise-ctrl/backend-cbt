export function ForgotPasswordTemplate(user, resetLink) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 18px rgba(20,20,20,0.06);">

        <!-- Header -->
        <tr>
          <td style="padding:20px; background:#0b74de; color:#fff;">
            <h1 style="margin:0; font-size:20px;">Abanise — Password Reset</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:20px;">

            <p style="font-size:15px; color:#333; margin:0;">
              Hello <strong>${user.firstName}</strong>,
            </p>

            <p style="margin-top:12px; color:#444; font-size:14px; line-height:1.6;">
              We received a request to reset your Abanise account password.  
              Click the button below to set a new password.  
              This link expires in <strong>15 minutes</strong>.
            </p>

            <!-- Reset Button -->
            <div style="text-align:center; margin:30px 0;">
              <a href="${process.env.FRONTEND_BASE_URL}resetpassword?token=${resetLink}"
                style="background:#0b74de; padding:12px 24px; color:#fff; text-decoration:none; font-size:15px; border-radius:6px; display:inline-block;">
                Reset Password
              </a>
            </div>

            <p style="margin-top:12px; color:#555; font-size:14px;">
              If you did not request this, you can safely ignore this email.  
              Your password will remain unchanged.
            </p>

            <hr style="border:none; border-top:1px solid #eef1f4; margin:18px 0;">

            <!-- Footer Note -->
            <p style="margin:0; color:#888; font-size:12px;">
              Need help? Contact support:  
              <a href="mailto:support@abanise.com" style="color:#0b74de;">support@abanise.com</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 20px; background:#fbfcfd; text-align:center; color:#9aa6b2; font-size:12px;">
            © ${new Date().getFullYear()} Abanise. All rights reserved.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`;
}

export function PasswordChangedTemplate(user) {
  const year = new Date().getFullYear();
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 18px rgba(20,20,20,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:20px; background:#0b74de; color:#fff; text-align:center;">
              <h1 style="margin:0; font-size:20px;">Abanise — Password Changed</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px; color:#333; font-size:15px; line-height:1.6;">
              <p style="margin-top:0;">Hi <strong>${user.firstName} ${user.lastName}</strong>,</p>

              <p style="margin:8px 0 18px 0;">
                Your account password has been successfully changed. If you performed this change, no further action is required.
              </p>

              <p style="margin:8px 0 18px 0; color:#d9534f;">
                If you did NOT change your password, we recommend that you immediately reset your password and contact support.
              </p>

              <div style="text-align:center; margin:20px 0;">
                <a href="mailto:support@abanise.com" style="display:inline-block; padding:12px 20px; background:#0b74de; color:#fff; text-decoration:none; border-radius:6px; font-weight:600;">Contact Support</a>
              </div>

              <p style="margin-top:0; color:#888; font-size:12px;">
                This is a notification email. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:12px 20px; background:#fbfcfd; text-align:center; color:#9aa6b2; font-size:12px;">
              © ${year} Abanise. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  `;
}
