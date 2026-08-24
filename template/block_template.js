export const propertyBlockedTemplate = ({
  userName = "User",
  reason = "Your property violated our platform policy.",
  propertyTitle = "Property Listing",
  websiteName = "Your Platform Name",
  websiteUrl = "https://yourwebsite.com"
}) => {
  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Property Listing Blocked</title>

    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f4f6f8;
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
      }

      .container {
        max-width: 600px;
        margin: 40px auto;
        background: #ffffff;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 6px 20px rgba(0,0,0,0.08);
      }

      .header {
        background: linear-gradient(90deg, #ef4444, #dc2626);
        color: white;
        padding: 22px;
        text-align: center;
        font-size: 20px;
        font-weight: bold;
      }

      .content {
        padding: 30px;
        line-height: 1.7;
        font-size: 15px;
      }

      .highlight {
        background: #f9fafb;
        border-left: 4px solid #ef4444;
        padding: 14px 16px;
        margin: 20px 0;
        border-radius: 4px;
      }

      .reason-box {
        background: #fff7ed;
        border: 1px solid #fdba74;
        padding: 14px;
        border-radius: 6px;
        margin-top: 12px;
        color: #9a3412;
        font-weight: 500;
      }

      .cta-button {
        display: inline-block;
        padding: 12px 22px;
        margin-top: 25px;
        background: #111827;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        font-weight: bold;
      }

      .footer {
        background: #f9fafb;
        text-align: center;
        padding: 20px;
        font-size: 13px;
        color: #6b7280;
      }
    </style>
  </head>

  <body>

    <div class="container">

      <div class="header">
        Property Listing Blocked
      </div>

      <div class="content">

        <p>Hello ${userName},</p>

        <p>
          We would like to inform you that your property listing
          <strong>${propertyTitle}</strong>
          has been temporarily blocked by the administration team on
          <strong>${websiteName}</strong>.
        </p>

        <div class="highlight">
          <strong>Status:</strong> Blocked <br/>
          <strong>Date:</strong> ${new Date().toLocaleDateString()}
        </div>

        <p>
          This action was taken after reviewing your listing to ensure compliance
          with our platform rules and policies.
        </p>

        <div class="reason-box">
          <strong>Reason for Blocking:</strong><br/><br/>
          ${reason}
        </div>

        <p>
          If you believe this action was taken in error, you may contact support
          or update the listing information for another review.
        </p>

        <p>
          Thank you for your understanding and cooperation.
        </p>

        <p>
          Best regards,<br/>
          <strong>${websiteName} Admin Team</strong>
        </p>

        <a href="${websiteUrl}/dashboard/properties" class="cta-button">
          View My Properties
        </a>

      </div>

      <div class="footer">
        © ${new Date().getFullYear()} ${websiteName}. All rights reserved.
      </div>

    </div>

  </body>
  </html>
  `;
};

