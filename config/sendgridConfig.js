import dotenv from 'dotenv';
dotenv.config();

import sgMail from '@sendgrid/mail';

const { SENDGRID_API_KEY, SENDGRID_SENDER } = process.env;


if (!SENDGRID_API_KEY || !SENDGRID_SENDER) {
  throw new Error('SENDGRID_API_KEY and SENDGRID_SENDER must be defined in the environment');
}

sgMail.setApiKey(SENDGRID_API_KEY);

export { sgMail, SENDGRID_SENDER };
