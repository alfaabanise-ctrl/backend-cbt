import logger from './logger.js';
import cache from './cache.js';

/**
 * Performance monitoring and optimization utilities
 */

/**
 * Response time middleware
 */
export const responseTime = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn(`Slow request detected: ${req.method} ${req.originalUrl} - ${duration}ms`, {
        method: req.method,
        url: req.originalUrl,
        duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
    }

    // Add response time header
    res.set('X-Response-Time', `${duration}ms`);
  });

  next();
};

/**
 * Cache middleware for GET requests
 * @param {number} ttl - Time to live in seconds
 * @param {function} keyGenerator - Function to generate cache key
 */
export const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `${req.originalUrl}:${JSON.stringify(req.query)}`;

    try {
      // Try to get from cache
      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return res.status(200).json({
          ...cachedData,
          cached: true,
          cacheKey: process.env.NODE_ENV === 'development' ? cacheKey : undefined
        });
      }

      // Store original res.json
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function(data) {
        // Cache successful responses
        if (res.statusCode === 200 && data.success) {
          cache.set(cacheKey, data, ttl).catch(err => {
            logger.error(`Failed to cache data for key ${cacheKey}: ${err.message}`);
          });
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error(`Cache middleware error: ${error.message}`);
      next(); // Continue without caching
    }
  };
};

/**
 * Memory usage monitoring
 */
export const memoryMonitor = () => {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    // Log if memory usage is high
    if (memUsageMB.heapUsed > 500) { // 500MB threshold
      logger.warn('High memory usage detected', memUsageMB);
    }

    // Log memory stats in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Memory usage', memUsageMB);
    }
  }, 60000); // Check every minute
};

/**
 * Database query performance monitoring
 */
export const queryPerformanceMonitor = (mongoose) => {
  if (process.env.NODE_ENV === 'development') {
    mongoose.set('debug', (collectionName, method, query, doc) => {
      logger.debug(`MongoDB Query: ${collectionName}.${method}`, {
        query: JSON.stringify(query),
        doc: doc ? JSON.stringify(doc) : undefined
      });
    });
  }
};

/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user ? req.user.id : null
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`Response: ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
  });

  next();
};
