// src/utils/catchAsync.js

/**
 * A wrapper function for asynchronous route handlers to catch errors.
 *
 * This utility takes an asynchronous function (like a controller action) and
 * returns a new function. The returned function executes the original function
 * and catches any rejected promises, passing the error to Express's `next`
 * middleware. This avoids the need for explicit try/catch blocks in every
 * async controller.
 *
 * @param {Function} fn The asynchronous function to wrap.
 * @returns {Function} An Express middleware function that handles async errors.
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
      fn(req, res, next).catch(next);
    };
  };
  
  module.exports = catchAsync;
  