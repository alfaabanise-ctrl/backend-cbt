import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Database utility functions
 */

/**
 * Check database connection health
 */
export const checkDatabaseHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: states[state],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  } catch (error) {
    logger.error(`Database health check failed: ${error.message}`);
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Get database statistics
 */
export const getDatabaseStats = async () => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();

    return {
      collections: stats.collections,
      dataSize: Math.round(stats.dataSize / 1024 / 1024), // MB
      storageSize: Math.round(stats.storageSize / 1024 / 1024), // MB
      indexes: stats.indexes,
      indexSize: Math.round(stats.indexSize / 1024 / 1024), // MB
      objects: stats.objects
    };
  } catch (error) {
    logger.error(`Failed to get database stats: ${error.message}`);
    return null;
  }
};

/**
 * Backup database collections
 */
export const backupCollections = async (collections = []) => {
  try {
    const db = mongoose.connection.db;
    const backup = {};

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      backup[collectionName] = documents;
    }

    return backup;
  } catch (error) {
    logger.error(`Database backup failed: ${error.message}`);
    throw error;
  }
};

/**
 * Optimize database performance
 */
export const optimizeDatabase = async () => {
  try {
    const db = mongoose.connection.db;

    // Get all collections
    const collections = await db.listCollections().toArray();

    const optimizationResults = [];

    for (const collection of collections) {
      try {
        // Reindex collection
        await db.collection(collection.name).reIndex();
        optimizationResults.push({
          collection: collection.name,
          status: 'reindexed'
        });
      } catch (error) {
        optimizationResults.push({
          collection: collection.name,
          status: 'error',
          error: error.message
        });
      }
    }

    logger.info('Database optimization completed', { results: optimizationResults });
    return optimizationResults;
  } catch (error) {
    logger.error(`Database optimization failed: ${error.message}`);
    throw error;
  }
};

/**
 * Clean up old data
 */
export const cleanupOldData = async () => {
  try {
    const results = {};

    // Clean up old audit logs (older than 90 days)
    const { default: Audit } = await import('../models/Audit.js');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const auditCleanup = await Audit.deleteMany({
      timestamp: { $lt: ninetyDaysAgo }
    });
    results.auditLogs = auditCleanup.deletedCount;

    // Clean up expired password reset tokens
    const { default: User } = await import('../models/User.js');
    const tokenCleanup = await User.updateMany(
      {
        resetPasswordExpire: { $lt: Date.now() }
      },
      {
        $unset: {
          resetPasswordToken: 1,
          resetPasswordExpire: 1
        }
      }
    );
    results.expiredTokens = tokenCleanup.modifiedCount;

    // Clean up cancelled appointments older than 30 days
    const { default: Appointment } = await import('../models/Appointment.js');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const appointmentCleanup = await Appointment.deleteMany({
      status: 'cancelled',
      updatedAt: { $lt: thirtyDaysAgo }
    });
    results.cancelledAppointments = appointmentCleanup.deletedCount;

    logger.info('Database cleanup completed', results);
    return results;
  } catch (error) {
    logger.error(`Database cleanup failed: ${error.message}`);
    throw error;
  }
};
