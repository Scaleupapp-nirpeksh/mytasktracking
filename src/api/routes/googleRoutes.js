// src/api/routes/googleRoutes.js

const express = require('express');
const googleController = require('../controllers/googleController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// --- Protected Google Integration Routes ---

// Apply the 'protect' middleware to all routes in this file.
// A user must be logged in to connect their Google account.
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

module.exports = router;
