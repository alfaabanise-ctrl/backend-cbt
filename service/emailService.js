import { sgMail, SENDGRID_SENDER } from '../config/sendgridConfig.js';

export const sendEmail = async ({ to, subject, html }) => {
  const msg = {
    to,
    from: SENDGRID_SENDER,
    subject,
    html,
  };
 
  
  try {
    await sgMail.send(msg);
    console.log('message aassass');
    
    return { success: true };
  } catch (err) {
    console.error('Error sending email:', err);
    return { success: false, error: err };
  }
};
