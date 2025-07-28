// src/api/routes/meetingRoutes.js

const express = require('express');
const meetingController = require('../controllers/meetingController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// --- Protected Meeting Routes ---

// Apply the 'protect' middleware to all routes in this file.
router.use(authMiddleware.protect);

/**
 * @route   GET /api/v1/meetings
 * @route   POST /api/v1/meetings
 * @desc    Get all past meetings or start a new one
 * @access  Private
 */
router
  .route('/')
  .get(meetingController.getAllMeetings)
  .post(meetingController.startMeeting);

/**
 * @route   GET /api/v1/meetings/:id
 * @route   PATCH /api/v1/meetings/:id
 * @desc    Get a single meeting's details or update its notes
 * @access  Private
 */
router
  .route('/:id')
  .get(meetingController.getMeeting)
  .patch(meetingController.updateMeeting);

module.exports = router;
