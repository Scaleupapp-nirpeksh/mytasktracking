// src/api/routes/analyticsRoutes.js

const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// --- Protected Analytics Routes ---

// Apply the 'protect' middleware to all routes in this file.
router.use(authMiddleware.protect);

/**
 * @route   GET /api/v1/analytics/reports/weekly/:workspaceId
 * @desc    Generate a weekly analytics report for a specific workspace
 * @access  Private
 */
router
  .route('/reports/weekly/:workspaceId')
  .get(analyticsController.getWeeklyReport);

module.exports = router;
