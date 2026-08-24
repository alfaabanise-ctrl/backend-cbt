const backOnlineTemplate = () => {
  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Virex.Codes is Back Online 🚀</title>
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
        background: linear-gradient(90deg, #FFC059, #ffb030ff);
        color: white;
        padding: 20px;
        text-align: center;
        font-size: 20px;
        font-weight: bold;
      }
      .content {
        padding: 30px;
        line-height: 1.6;
        font-size: 15px;
      }
      .highlight {
        background: #f3f4f6;
        border-left: 4px solid #FFC059;
        padding: 12px 16px;
        margin: 20px 0;
        font-size: 14px;
      }
      .cta-button {
        display: inline-block;
        padding: 12px 22px;
        margin: 20px 0;
        background: #feaf2fff;
        color: #ffffff;
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
      <div class="header">🚀 Virex.Codes is Back Online</div>
      <div class="content">
        <p>Hello,</p>
        <p>We’re excited to let you know that <strong>Virex.Codes</strong> is back online after a period of downtime. Our platform was offline for the past <strong>3 months</strong> due to technical issues, but we’ve fully reinstalled and optimized everything.</p>
        
        <div class="highlight">
          ✅ The website is now running smoothly and performing better than before.<br>
          ✅ We’ve taken steps to strengthen stability and improve the overall experience.
        </div>

        <p>We sincerely apologize for any inconvenience the downtime may have caused. Your trust and patience mean a lot to us, and we’re committed to ensuring Virex.Codes remains reliable and accessible going forward.</p>

        <p>If you encounter any issues or have feedback, please don’t hesitate to reach out—we’re here to help.</p>

        <p>Thank you for sticking with us. We’re glad to be back!</p>

        <p>Best regards,<br>
        <strong>Waliu</strong><br>
        Founder, Virex.Codes</p>

        <a href="https://www.virex.codes" class="cta-button">Visit Virex.Codes</a>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Virex.Codes. All rights reserved.
      </div>
    </div>
  </body>
  </html>
  `;
};

module.exports = backOnlineTemplate;
