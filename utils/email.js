import { sendEmail } from '../services/emailService.js';
import logger from './logger.js';

class EmailService {
  constructor() {
    this.from = process.env.EMAIL_FROM || 'MedMeet <noreply@medmeet.com>';
  }

  async send(options) {
    try {
      const mailOptions = {
        to: options.to,
        from: this.from,
        subject: options.subject,
        text: options.text,
        html: options.html
      };

      if (options.cc) mailOptions.cc = options.cc;
      if (options.attachments) mailOptions.attachments = options.attachments;

      const result = await sendEmail(mailOptions);

      if (result.success) {
        logger.info(`Email sent: ${result.response[0].headers['x-message-id']}`);
        return result.response;
      } else {
        throw result.error;
      }
    } catch (error) {
      logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }

  async sendWelcomeEmail(user, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await this.send({
      to: user.email,
      subject: 'Welcome to MedMeet - Please verify your email',
      text: `Welcome to MedMeet ${user.firstName}! Verify here: ${verificationUrl}`,
      html: `<p>Hello ${user.firstName}, verify your email: <a href="${verificationUrl}">Verify Email</a></p>`
    });
  }

  /**
   * Send appointment confirmation email
   * @param {Object} appointment - Appointment object with populated references
   * @param {Object} user - User object
   */
  async sendAppointmentConfirmation(appointment, user) {
    const appointmentDate = new Date(
      appointment.appointmentDate
    ).toLocaleDateString();
    const appointmentUrl = `${process.env.FRONTEND_URL}/appointments/${appointment._id}`;

    await this.send({
      to: user.email,
      subject: 'Your MedMeet appointment confirmation',
      text: `Your appointment with Dr. ${appointment.doctor.user.lastName} on ${appointmentDate} at ${appointment.startTime} has been confirmed.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077CC; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Appointment Confirmed</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; background-color: #fff;">
            <h2 style="color: #0077CC;">Hello ${user.firstName},</h2>
            <p>Your appointment has been confirmed with the following details:</p>
            <div style="background-color: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #0077CC;">
              <p><strong>Doctor:</strong> Dr. ${
  appointment.doctor.user.firstName
} ${appointment.doctor.user.lastName}</p>
              <p><strong>Date:</strong> ${appointmentDate}</p>
              <p><strong>Time:</strong> ${appointment.startTime} - ${
  appointment.endTime
}</p>
              <p><strong>Type:</strong> ${
  appointment.type.charAt(0).toUpperCase() +
                appointment.type.slice(1)
} Consultation</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appointmentUrl}" style="background-color: #0077CC; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; display: inline-block;">View Appointment Details</a>
            </div>
            <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
            <p>Best regards,<br>The MedMeet Team</p>
          </div>
        </div>
      `
    });
  }

  /**
   * Send password reset email
   * @param {Object} user - User object
   * @param {string} resetToken - Password reset token
   */
  async sendPasswordReset(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await this.send({
      to: user.email,
      subject: 'MedMeet - Password Reset Request',
      text: `You requested a password reset. Please go to: ${resetUrl} to reset your password. This link is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077CC; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Password Reset Request</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; background-color: #fff;">
            <p>Hello ${user.firstName},</p>
            <p>You recently requested to reset your password. Click the button below to reset it:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #0077CC; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Your Password</a>
            </div>
            <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
            <p>This link is valid for 10 minutes.</p>
            <p>Best regards,<br>The MedMeet Team</p>
          </div>
        </div>
      `
    });
  }

  /**
   * Send notification to doctor about new appointment request
   * @param {Object} appointment - Appointment object with populated references
   * @param {Object} doctor - Doctor user object
   */
  async sendAppointmentRequest(appointment, doctor) {
    const appointmentDate = new Date(
      appointment.appointmentDate
    ).toLocaleDateString();
    const appointmentUrl = `${process.env.FRONTEND_URL}/doctor/appointments/${appointment._id}`;

    await this.send({
      to: doctor.email,
      subject: 'MedMeet - New Appointment Request',
      text: `You have a new appointment request from ${appointment.patient.firstName} ${appointment.patient.lastName} for ${appointmentDate} at ${appointment.startTime}.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077CC; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">New Appointment Request</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; background-color: #fff;">
            <h2 style="color: #0077CC;">Hello Dr. ${doctor.firstName} ${
  doctor.lastName
},</h2>
            <p>You have received a new appointment request with the following details:</p>
            <div style="background-color: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #0077CC;">
              <p><strong>Patient:</strong> ${appointment.patient.firstName} ${
  appointment.patient.lastName
}</p>
              <p><strong>Date:</strong> ${appointmentDate}</p>
              <p><strong>Time:</strong> ${appointment.startTime} - ${
  appointment.endTime
}</p>
              <p><strong>Type:</strong> ${
  appointment.type.charAt(0).toUpperCase() +
                appointment.type.slice(1)
} Consultation</p>
              <p><strong>Reason:</strong> ${appointment.reasonForVisit}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appointmentUrl}" style="background-color: #0077CC; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; display: inline-block;">Review Request</a>
            </div>
            <p>Please review and respond to this request at your earliest convenience.</p>
            <p>Best regards,<br>The MedMeet Team</p>
          </div>
        </div>
      `
    });
  }

  /**
   * Send reminder email for upcoming appointment
   * @param {Object} appointment - Appointment object with populated references
   * @param {Object} recipient - User object (patient or doctor)
   * @param {string} role - Either 'patient' or 'doctor'
   */
  async sendAppointmentReminder(appointment, recipient, role) {
    const appointmentDate = new Date(
      appointment.appointmentDate
    ).toLocaleDateString();
    const appointmentUrl = `${process.env.FRONTEND_URL}/${
      role === 'doctor' ? 'doctor/' : ''
    }appointments/${appointment._id}`;
    const otherPerson =
      role === 'patient'
        ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`
        : `${appointment.patient.firstName} ${appointment.patient.lastName}`;

    await this.send({
      to: recipient.email,
      subject: 'MedMeet - Upcoming Appointment Reminder',
      text: `Reminder: You have an appointment with ${otherPerson} tomorrow at ${appointment.startTime}.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077CC; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Appointment Reminder</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; background-color: #fff;">
            <h2 style="color: #0077CC;">Hello ${recipient.firstName},</h2>
            <p>This is a friendly reminder about your upcoming appointment:</p>
            <div style="background-color: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #0077CC;">
              <p><strong>${
  role === 'patient' ? 'Doctor' : 'Patient'
}:</strong> ${otherPerson}</p>
              <p><strong>Date:</strong> ${appointmentDate}</p>
              <p><strong>Time:</strong> ${appointment.startTime} - ${
  appointment.endTime
}</p>
              <p><strong>Type:</strong> ${
  appointment.type.charAt(0).toUpperCase() +
                appointment.type.slice(1)
} Consultation</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appointmentUrl}" style="background-color: #0077CC; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; display: inline-block;">View Appointment Details</a>
            </div>
            ${
  appointment.type === 'video'
    ? `
            <p><strong>For Video Consultations:</strong> Please ensure your camera and microphone are working properly and you have a stable internet connection.</p>
            <p>You can join the video call by clicking the "Join Video Session" button in your appointment details page about 5 minutes before the scheduled time.</p>
            `
    : ''
}
            <p>Best regards,<br>The MedMeet Team</p>
          </div>
        </div>
      `
    });
  }

  /**
   * Send doctor verification status update
   * @param {Object} user - Doctor user object
   * @param {string} status - Verification status ('verified', 'rejected')
   * @param {string} notes - Optional notes explaining the decision
   */
  async sendVerificationStatus(user, status, notes = '') {
    const subject =
      status === 'verified'
        ? 'MedMeet - Your Doctor Profile Has Been Verified'
        : 'MedMeet - Doctor Profile Verification Update';

    const dashboardUrl = `${process.env.FRONTEND_URL}/doctor/dashboard`;

    await this.send({
      to: user.email,
      subject,
      text:
        status === 'verified'
          ? 'Congratulations! Your doctor profile has been verified. You can now start accepting appointments.'
          : 'Your doctor profile verification has been reviewed. Please check your account for details.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077CC; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Verification Status Update</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; background-color: #fff;">
            <h2 style="color: #0077CC;">Hello Dr. ${user.firstName} ${
  user.lastName
},</h2>
            ${
  status === 'verified'
    ? `
              <p>We're pleased to inform you that your doctor profile on MedMeet has been <strong style="color: #28a745;">verified</strong>!</p>
              <p>You can now access all doctor features and start accepting appointment requests from patients.</p>
            `
    : `
              <p>We've reviewed your doctor profile verification submission.</p>
              <p>Status: <strong>${
  status.charAt(0).toUpperCase() + status.slice(1)
}</strong></p>
              ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
              <p>If your verification was not successful, please review the feedback and resubmit with the necessary corrections.</p>
            `
}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" style="background-color: #0077CC; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; display: inline-block;">Go to Dashboard</a>
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>The MedMeet Team</p>
          </div>
        </div>
      `
    });
  }
}

export default new EmailService();
