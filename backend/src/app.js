/**
 * Task Tracker Express Application
 * 
 * Main Express app configuration with middleware setup, security,
 * routing, error handling, and API documentation.
 * 
 * Features:
 * - Production-ready security middleware
 * - CORS configuration for frontend integration
 * - File upload handling
 * - Rate limiting and request validation
 * - Comprehensive error handling
 * - API documentation with Swagger
 * - Health check endpoints
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');

// Import utilities and middleware
const logger = require('./utils/logger/logger');
const { notFound, errorHandler } = require('./middleware/error');

// Import routes
const routes = require('./routes');

// Create Express app
const app = express();

/**
 * SECURITY MIDDLEWARE
 * Essential security configurations for production deployment
 */

// Trust proxy for deployment behind reverse proxy (nginx, AWS ALB)
app.set('trust proxy', 1);

// Helmet - Sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow file uploads
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000'];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name'
  ],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Compression middleware for response optimization
app.use(compression());

/**
 * RATE LIMITING
 * Prevents abuse and DDoS attacks
 */

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

// API-specific rate limiting (more restrictive)
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 60, // 60 requests per minute
  message: {
    error: 'API rate limit exceeded, please slow down',
    retryAfter: Math.ceil((parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth-specific rate limiting (most restrictive)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later',
    retryAfter: 900 // 15 minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful requests
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

/**
 * DATA PARSING AND SANITIZATION
 */

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS attacks
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
  whitelist: ['tags', 'priority', 'status'] // Allow these parameters to be arrays
}));

/**
 * STATIC FILES AND UPLOADS
 */

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));

/**
 * LOGGING MIDDLEWARE
 */

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log the request
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined
  });

  // Log the response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'http';
    
    logger[logLevel](`${req.method} ${req.originalUrl} - ${res.statusCode}`, {
      statusCode: res.statusCode,
      responseTime: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });
  });

  next();
});

/**
 * HEALTH CHECK ENDPOINTS
 */

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    }
  };

  // Check if Redis is available
  if (global.redisClient) {
    try {
      await global.redisClient.ping();
      health.services.redis = 'connected';
    } catch (error) {
      health.services.redis = 'disconnected';
      health.status = 'WARNING';
    }
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * API ROUTES
 */

// Mount API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Task Tracker API',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/health',
    environment: process.env.NODE_ENV
  });
});

/**
 * ERROR HANDLING MIDDLEWARE
 * Must be defined after all routes
 */

// Handle 404 errors
app.use(notFound);

// Global error handler
app.use(errorHandler);

/**
 * EXPORT THE APP
 */
module.exports = app;