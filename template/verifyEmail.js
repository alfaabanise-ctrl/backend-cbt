export function renderOtpTemplateHtml({ name = "User", otp = "000000", expiryMinutes = 15, supportEmail = "support@abanise.com", year = new Date().getFullYear() } = {}) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 18px rgba(20,20,20,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:20px; background:#0b74de; color:#fff; text-align:center;">
              <h1 style="margin:0; font-size:20px;">Abanise — Verify Your Email</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px; color:#333; font-size:15px; line-height:1.6;">
              <p style="margin-top:0;">Hi <strong>${name}</strong>,</p>
              <p>
                Use the verification code below to complete your registration. The code will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>

              <div style="text-align:center; margin:18px 0;">
                <div style="display:inline-block; padding:18px 22px; background:#f7f9fc; border-radius:8px; border:1px solid #e6eef9;">
                  <span style="font-size:28px; letter-spacing:4px; font-weight:700; color:#0b74de;">${otp}</span>
                </div>
              </div>

              <p style="color:#666; font-size:13px; margin-top:0;">
                If you did not request this, you can safely ignore this email. For assistance, contact
                <a href="mailto:${supportEmail}" style="color:#0b74de; text-decoration:none;">${supportEmail}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:12px 20px; background:#fbfcfd; text-align:center; color:#9aa6b2; font-size:12px;">
              © ${year} MedMeet. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

export function renderOtpTemplateHtmlBeforeInspection({ name = "User", otp = "000000", expiryMinutes = 15, supportEmail = "support@abanise.com", year = new Date().getFullYear() } = {}) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 18px rgba(20,20,20,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:20px; background:#0b74de; color:#fff; text-align:center;">
              <h1 style="margin:0; font-size:20px;">Verify Your Email to Complete Inspection Booking</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px; color:#333; font-size:15px; line-height:1.6;">
              <p style="margin-top:0;">Hi <strong>${name}</strong>,</p>
              <p>
                Use the verification code below to complete your registration. The code will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>

              <div style="text-align:center; margin:18px 0;">
                <div style="display:inline-block; padding:18px 22px; background:#f7f9fc; border-radius:8px; border:1px solid #e6eef9;">
                  <span style="font-size:28px; letter-spacing:4px; font-weight:700; color:#0b74de;">${otp}</span>
                </div>
              </div>

              <p style="color:#666; font-size:13px; margin-top:0;">
                If you did not request this, you can safely ignore this email. For assistance, contact
                <a href="mailto:${supportEmail}" style="color:#0b74de; text-decoration:none;">${supportEmail}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:12px 20px; background:#fbfcfd; text-align:center; color:#9aa6b2; font-size:12px;">
              © ${year} MedMeet. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

