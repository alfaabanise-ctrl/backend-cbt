import UserVerification from '../models/UserVerification.js';
import { sendEmail } from '../services/emailService.js';
// import getVerifyEmailTemplate from '../templates/verifyEmail.js';
import User from '../models/User.js';
import PasswordReset from '../models/PasswordReset.js';
import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const OTP_ATTEMPTS = 3;

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const saveOTP = async (userId, otp) => {
  await UserVerification.deleteMany({ userId });
  await UserVerification.create({
    userId,
    otp,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    attempts: 0
  });
};

export const sendVerificationOTP = async ({ user, email }) => {
  const otp = generateOTP();
  await saveOTP(user._id, otp);
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: getVerifyEmailTemplate({ name: user.firstName || user.lastName || user.email, otp })
  });
  return otp;
};

export const verifyOTP = async (userId, otp) => {
  const verification = await UserVerification.findOne({ userId });
  if (!verification) throw new Error('OTP not found or expired. Please request a new one.');
  if (verification.attempts >= OTP_ATTEMPTS) throw new Error('Maximum attempts reached. Please request a new OTP.');
  if (verification.expiresAt < new Date()) {
    await UserVerification.deleteOne({ userId });
    throw new Error('OTP has expired. Please request a new one.');
  }
  if (verification.otp !== otp) {
    verification.attempts += 1;
    await verification.save();
    const attemptsLeft = OTP_ATTEMPTS - verification.attempts;
    throw new Error(`Invalid OTP. ${attemptsLeft} attempts remaining.`);
  }
  // OTP is valid
  await UserVerification.deleteOne({ userId });
  return true;
};

export const resendOTP = async (user) => {
  return sendVerificationOTP({ user, email: user.email });
};

export const sendPasswordResetOTP = async (user) => {
  const otp = generateOTP();
  await saveOTP(user._id, otp);
  await sendEmail({
    to: user.email,
    subject: 'Reset your password',
    html: getVerifyEmailTemplate({ name: user.firstName || user.lastName || user.email, otp })
  });
  return otp;
};

export const verifyPasswordResetOTP = async (userId, otp) => {
  await verifyOTP(userId, otp); // will throw if invalid
  // Generate a temporary token for password reset (valid for 15 min)
  const tempToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  // Remove any existing PasswordReset for this user
  await PasswordReset.deleteMany({ user: userId });
  await PasswordReset.create({ user: userId, token: tempToken, expires });
  return tempToken;
};
