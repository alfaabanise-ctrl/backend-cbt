import Audit from '../models/Audit.js';
import logger from './logger.js';

/**
 * Create an audit log entry
 * @param {Object} auditData - The audit data to log
 * @returns {Promise} - The saved audit log
 */
export async function auditLog(auditData) {
  try {
    const auditEntry = await Audit.create(auditData);
    return auditEntry;
  } catch (error) {
    logger.error(`Error creating audit log: ${error.message}`, {
      error,
      auditData
    });
    // Don't throw; audit logging should not interrupt normal flow
    return null;
  }
}

/**
 * Middleware to audit API access
 * @param {string} action - The action being performed
 * @param {string} resource - The resource being accessed
 */
export function auditMiddleware(action, resource) {
  return async (req, res, next) => {
    try {
      // Store original end function
      const originalEnd = res.end;
      let responseBody;

      // Override response.end to capture response data
      res.end = function (chunk) {
        // Restore original end function
        res.end = originalEnd;

        const statusCode = res.statusCode;
        if (chunk) responseBody = chunk.toString();

        // Determine actionType based on HTTP method
        let actionType;
        switch (req.method) {
        case 'GET':
          actionType = 'read';
          break;
        case 'POST':
          actionType = 'create';
          break;
        case 'PUT':
        case 'PATCH':
          actionType = 'update';
          break;
        case 'DELETE':
          actionType = 'delete';
          break;
        default:
          actionType = 'read';
        }

        // Get resource ID
        const resourceId = req.params.id || (req.body && req.body.id) || null;

        const auditData = {
          user: req.user ? req.user._id : null,
          action,
          actionType,
          resource,
          resourceId,
          description: `${req.method} ${req.originalUrl}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          status: statusCode >= 400 ? 'failure' : 'success',
          metadata: {
            statusCode,
            requestBody: req.body,
            responseStatus: statusCode
          }
        };

        auditLog(auditData).catch((err) => {
          logger.error(`Failed to create audit log: ${err.message}`);
        });

        return originalEnd.call(res, chunk);
      };

      next();
    } catch (err) {
      logger.error(`Audit middleware error: ${err.message}`);
      next();
    }
  };
}
