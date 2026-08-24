/**
 * Async handler to avoid try-catch blocks in route handlers
 * @param {Function} fn - Express route handler function
 * @returns {Function} - Enhanced route handler with try-catch
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
