// src/app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const morgan = require('morgan');  

const AppError = require('./utils/appError');
const globalErrorHandler = require('./api/controllers/errorController');
const userRoutes = require('./api/routes/userRoutes');
const workspaceRoutes = require('./api/routes/workspaceRoutes');
const taskRoutes = require('./api/routes/taskRoutes');
const meetingRoutes = require('./api/routes/meetingRoutes');
const analyticsRoutes = require('./api/routes/analyticsRoutes');
const searchRoutes = require('./api/routes/searchRoutes');
const googleRoutes = require('./api/routes/googleRoutes'); // <-- IMPORT NEW ROUTES

// --- App Initialization ---
const app = express();

// --- Global Middleware Setup ---

// 1. Set various HTTP headers for security
app.use(helmet());

// 2. Enable CORS
app.use(cors());

// 3. HTTP Request Logger (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(require('morgan')('dev'));
}

// 4. Rate Limiting
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many requests from this IP, please try again in an hour!',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// 5. Body Parsers with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 6. Data Sanitization against NoSQL Query Injection
app.use(mongoSanitize());

// 7. Prevent HTTP Parameter Pollution
app.use(hpp());


// --- API Routes ---
// Mount the user authentication routes
app.use('/api/v1/users', userRoutes);
// Mount the workspace routes (which includes nested task routes)
app.use('/api/v1/workspaces', workspaceRoutes);
// Mount the main task routes
app.use('/api/v1/tasks', taskRoutes);
// Mount the meeting routes
app.use('/api/v1/meetings', meetingRoutes);
// Mount the analytics routes
app.use('/api/v1/analytics', analyticsRoutes);
// Mount the search routes
app.use('/api/v1/search', searchRoutes);
// Mount the Google integration routes
app.use('/api/v1/integrations/google', googleRoutes); // <-- MOUNT NEW ROUTES


// --- Unhandled Routes Handler ---
// This middleware will catch any requests made to routes that do not exist.
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});


// --- Global Error Handling Middleware ---
// This must be the LAST middleware. It will handle all errors passed to next().
app.use(globalErrorHandler);


// --- Export App ---
module.exports = app;
