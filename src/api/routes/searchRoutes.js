// src/api/routes/searchRoutes.js

const express = require('express');
const searchController = require('../controllers/searchController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// --- Protected Search Route ---

// Apply the 'protect' middleware to all routes in this file.
router.use(authMiddleware.protect);

/**
 * @route   GET /api/v1/search
 * @desc    Perform a global task search using a query parameter (e.g., ?q=report)
 * @access  Private
 */
router.route('/').get(searchController.globalSearch);

module.exports = router;
