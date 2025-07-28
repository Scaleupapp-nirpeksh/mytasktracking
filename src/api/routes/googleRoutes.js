// src/api/routes/googleRoutes.js

const express = require('express');
const googleController = require('../controllers/googleController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Apply the 'protect' middleware to all routes in this file.
router.use(authMiddleware.protect);

/**
 * @route   GET /api/v1/integrations/google/auth
 * @desc    Get the URL to redirect the user to for Google authentication
 * @access  Private
 */
router.get('/auth', googleController.getAuthUrl);

/**
 * @route   GET /api/v1/integrations/google/callback
 * @desc    The callback URL that Google redirects to after user consent
 * @access  Private
 */
router.get('/callback', googleController.handleCallback);

/**
 * @route   GET /api/v1/integrations/google/status
 * @desc    Get the current Google Calendar integration status
 * @access  Private
 */
router.get('/status', googleController.getIntegrationStatus);

/**
 * @route   DELETE /api/v1/integrations/google/disconnect
 * @desc    Disconnect Google Calendar integration
 * @access  Private
 */
router.delete('/disconnect', googleController.disconnectGoogle);

module.exports = router;