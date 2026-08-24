import mongoose from 'mongoose';
import colors from 'colors';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: './config/config.env' });

// Load models to ensure indexes are created
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import Record from '../models/Record.js';
import { Question, Answer } from '../models/Question.js';
import Audit from '../models/Audit.js';
import Review from '../models/Review.js';

/**
 * Database migration utility
 * Ensures indexes and schema updates are applied
 */

export const runMigrations = async () => {
  try {
    console.log('Connecting to MongoDB...'.yellow);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB'.green);

    console.log('Running database migrations...'.yellow);

    // Ensure indexes are created for all models
    await User.ensureIndexes();
    console.log('✓ User indexes created'.green);

    await Doctor.ensureIndexes();
    console.log('✓ Doctor indexes created'.green);

    await Appointment.ensureIndexes();
    console.log('✓ Appointment indexes created'.green);

    await Record.ensureIndexes();
    console.log('✓ Record indexes created'.green);

    await Question.ensureIndexes();
    console.log('✓ Question indexes created'.green);

    await Answer.ensureIndexes();
    console.log('✓ Answer indexes created'.green);

    await Audit.ensureIndexes();
    console.log('✓ Audit indexes created'.green);

    await Review.ensureIndexes();
    console.log('✓ Review indexes created'.green);

    // Add any custom indexes
    await createCustomIndexes();

    console.log('All migrations completed successfully!'.green.bold);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

export const createCustomIndexes = async () => {
  try {
    // Compound indexes for better query performance

    // User email + role index
    await User.collection.createIndex({ email: 1, role: 1 });

    // Doctor specialties + verification status
    await Doctor.collection.createIndex({
      specialties: 1,
      verificationStatus: 1
    });

    // Appointment date + status + doctor
    await Appointment.collection.createIndex({
      appointmentDate: 1,
      status: 1,
      doctor: 1
    });

    // Record patient + date + type
    await Record.collection.createIndex({
      patient: 1,
      date: -1,
      recordType: 1
    });

    // Question category + status + created date
    await Question.collection.createIndex({
      category: 1,
      status: 1,
      createdAt: -1
    });

    // Audit user + timestamp
    await Audit.collection.createIndex({
      user: 1,
      timestamp: -1
    });

    console.log('✓ Custom indexes created'.green);
  } catch (error) {
    console.error('Error creating custom indexes:', error);
    throw error;
  }
};

// Run migrations if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
