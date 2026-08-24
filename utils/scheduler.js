// utils/scheduler.js
import cron from 'node-cron';
import logger from './logger.js';
// import { sendAppointmentReminder } from '../services/emailService.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Audit from '../models/Audit.js';
import { auditLog } from './audit.js';

/** Send appointment reminders */
export const appointmentReminders = async () => {
  try {
    logger.info('[Scheduler] Starting appointment reminder job...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const appointments = await Appointment.find({
      appointmentDate: { $gte: tomorrow, $lt: dayAfter },
      status: 'confirmed'
    })
      .populate('patient', 'firstName lastName email')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'firstName lastName email' }
      });

    logger.info(
      `[Scheduler] Found ${appointments.length} appointments for reminder`
    );

    for (const appointment of appointments) {
      try {
        await sendAppointmentReminder(
          appointment,
          appointment.patient,
          'patient'
        );
        await sendAppointmentReminder(
          appointment,
          appointment.doctor.user,
          'doctor'
        );
        logger.info(
          `[Scheduler] Reminder sent for appointment ${appointment._id}`
        );
      } catch (error) {
        logger.error(
          `[Scheduler] Failed to send reminder for appointment ${appointment._id}: ${error.message}`
        );
      }
    }

    await auditLog({
      action: 'appointment_reminders',
      actionType: 'read',
      resource: 'system',
      description: `Sent reminders for ${appointments.length} appointments`,
      status: 'success',
      metadata: { appointmentCount: appointments.length }
    });

    logger.info('[Scheduler] Appointment reminder job completed');
  } catch (error) {
    logger.error(
      `[Scheduler] Appointment reminder job failed: ${error.message}`
    );
    await auditLog({
      action: 'appointment_reminders',
      actionType: 'read',
      resource: 'system',
      description: `Appointment reminder job failed: ${error.message}`,
      status: 'failure',
      metadata: { error: error.message }
    });
  }
};

/** Clean up expired sessions and tokens */
export const cleanupExpiredData = async () => {
  try {
    logger.info('[Scheduler] Starting cleanup job for expired data...');
    const expiredTokensResult = await User.updateMany(
      { resetPasswordExpire: { $lt: Date.now() } },
      { $unset: { resetPasswordToken: 1, resetPasswordExpire: 1 } }
    );
    logger.info(
      `[Scheduler] Removed ${expiredTokensResult.modifiedCount} expired password reset tokens`
    );

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const oldAuditLogs = await Audit.deleteMany({
      timestamp: { $lt: ninetyDaysAgo }
    });
    logger.info(
      `[Scheduler] Removed ${oldAuditLogs.deletedCount} old audit logs`
    );
    logger.info('[Scheduler] Cleanup job completed');
  } catch (error) {
    logger.error(`[Scheduler] Cleanup job failed: ${error.message}`);
  }
};

/** Generate daily analytics reports */
export const dailyAnalytics = async () => {
  try {
    logger.info('[Scheduler] Starting daily analytics job...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      date: today,
      newUsers: await User.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      newDoctors: await Doctor.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      completedAppointments: await Appointment.countDocuments({
        updatedAt: { $gte: today, $lt: tomorrow },
        status: 'completed'
      }),
      totalUsers: await User.countDocuments(),
      totalDoctors: await Doctor.countDocuments(),
      verifiedDoctors: await Doctor.countDocuments({
        verificationStatus: 'verified'
      })
    };

    logger.info('[Scheduler] Daily analytics generated', stats);
  } catch (error) {
    logger.error(`[Scheduler] Daily analytics job failed: ${error.message}`);
  }
};

/** Start cron jobs */
export const startCronJobs = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableCron = process.env.ENABLE_CRON === 'true';

  if (isProduction || enableCron) {
    logger.info('[Scheduler] Starting scheduled cron jobs...');
    cron.schedule('0 8 * * *', appointmentReminders); // Daily at 8 AM
    cron.schedule('0 * * * *', cleanupExpiredData); // Hourly at :00
    cron.schedule('0 0 * * *', dailyAnalytics); // Daily at midnight
    logger.info('[Scheduler] Cron jobs scheduled successfully');
  } else {
    logger.info(
      '[Scheduler] Development mode — running jobs immediately for testing'
    );
    await appointmentReminders();
    await cleanupExpiredData();
    await dailyAnalytics();
  }
};

/** Stop cron jobs */
export const stopCronJobs = () => {
  logger.info(
    '[Scheduler] Cron jobs stopped (manual intervention required if persistent jobs exist)'
  );
};
