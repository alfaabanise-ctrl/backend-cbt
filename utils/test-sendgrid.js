import dotenv from 'dotenv';
import { sendEmail } from '../services/emailService.js';

dotenv.config();

const testSendGrid = async () => {
  try {
    console.log('Testing SendGrid integration...');

    // Use the sendEmail function from our service
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'SendGrid Test',
      text: 'This is a test email from SendGrid',
      html: '<strong>This is a test email from SendGrid</strong>'
    });

    if (result.success) {
      console.log('✅ SendGrid test successful!');
      console.log('Response:', result.response[0].statusCode);
    } else {
      console.log('❌ SendGrid test failed!');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.log('❌ SendGrid test failed with exception!');
    console.log('Error:', error);
  }
};

testSendGrid();
