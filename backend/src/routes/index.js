/**
 * Main Routes Index
 * 
 * Central routing configuration that mounts all API routes.
 * Provides versioning, middleware application, and route organization.
 * 
 * Features:
 * - API versioning support
 * - Modular route organization
 * - Middleware application per route group
 * - Health check and documentation routes
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const express = require('express');
const { logger } = require('../utils/logger/logger');

// Import route modules
const authRoutes = require('./auth/authRoutes');
const taskRoutes = require('./task/taskRoutes');
const workspaceRoutes = require('./workspace/workspaceRoutes');
const fileRoutes = require('./file/fileRoutes');

// Create main router
const router = express.Router();

/**
 * API Information endpoint
 * Provides API documentation and available endpoints
 */
router.get('/', (req, res) => {
  const apiInfo = {
    name: 'Task Tracker API',
    version: '1.0.0',
    description: 'A comprehensive task tracker and scheduler with multi-workspace support',
    documentation: {
      postman: '/api/docs/postman',
      openapi: '/api/docs/openapi'
    },
    endpoints: {
      auth: '/api/auth',
      tasks: '/api/tasks',
      workspaces: '/api/workspaces',
      files: '/api/files'
    },
    features: [
      'Multi-workspace task management',
      'File attachments and cloud storage',
      'Real-time notifications',
      'Advanced task scheduling',
      'Progress tracking and analytics'
    ],
    support: {
      email: 'support@mytasktracker.com',
      documentation: 'https://docs.mytasktracker.com'
    }
  };

  res.json(apiInfo);
});

/**
 * Health check endpoint for the API
 */
router.get('/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      services: {
        api: 'operational',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        fileStorage: 'operational' // This could be enhanced to check Cloudinary
      },
      performance: {
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
      }
    };

    // Determine overall health status
    if (health.services.database !== 'connected') {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

/**
 * API Status endpoint with detailed metrics
 */
router.get('/status', (req, res) => {
  const status = {
    api: {
      name: 'Task Tracker API',
      version: '1.0.0',
      status: 'operational',
      uptime: process.uptime()
    },
    server: {
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    memory: {
      usage: process.memoryUsage(),
      limit: process.env.MAX_MEMORY_USAGE ? `${process.env.MAX_MEMORY_USAGE}MB` : 'unlimited'
    },
    features: {
      multiWorkspace: true,
      fileUploads: true,
      realTimeNotifications: true,
      emailNotifications: true,
      authentication: true,
      authorization: true
    }
  };

  res.json(status);
});

/**
 * Mount API route modules with versioning
 */

// Authentication routes
router.use('/auth', authRoutes);
logger.info('🔐 Authentication routes mounted at /api/auth');

// Task management routes
router.use('/tasks', taskRoutes);
logger.info('📋 Task routes mounted at /api/tasks');

// Workspace management routes
router.use('/workspaces', workspaceRoutes);
logger.info('🏢 Workspace routes mounted at /api/workspaces');

// File management routes
router.use('/files', fileRoutes);
logger.info('📁 File routes mounted at /api/files');

/**
 * API Documentation routes (placeholder for future implementation)
 */
router.get('/docs', (req, res) => {
  res.json({
    message: 'API Documentation',
    availableFormats: {
      interactive: '/api/docs/swagger',
      postman: '/api/docs/postman',
      openapi: '/api/docs/openapi'
    },
    note: 'Documentation endpoints will be implemented in future versions'
  });
});

/**
 * API Metrics endpoint (placeholder for monitoring)
 */
router.get('/metrics', (req, res) => {
  // This could be enhanced with actual metrics collection
  res.json({
    message: 'API Metrics',
    note: 'Metrics collection will be implemented in future versions',
    availableMetrics: [
      'Request count',
      'Response times',
      'Error rates',
      'Active users',
      'Task completion rates'
    ]
  });
});

/**
 * API route not found handler
 * This handles any API routes that don't match the above patterns
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `API endpoint ${req.originalUrl} not found`,
    availableEndpoints: {
      auth: '/api/auth',
      tasks: '/api/tasks',
      workspaces: '/api/workspaces',
      files: '/api/files',
      health: '/api/health',
      status: '/api/status',
      docs: '/api/docs'
    },
    timestamp: new Date().toISOString()
  });
});

// Log successful router setup
logger.info('✅ API routes configuration completed');

module.exports = router;