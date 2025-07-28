// src/api/routes/userRoutes.js

const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// --- Public Authentication Routes ---
// These routes are used for creating an account and logging in.
// They do not require an existing valid token.

/**
 * @route   POST /api/v1/users/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', authController.signup);

/**
 * @route   POST /api/v1/users/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', authController.login);


// --- Protected User Routes ---
// Future routes related to the user profile that require authentication
// will be placed here. For example:
//
// const authMiddleware = require('../middlewares/authMiddleware');
//
// router.use(authMiddleware.protect); // All routes after this line are protected
// router.get('/me', userController.getMe);
// router.patch('/updateMyPassword', authController.updatePassword);


module.exports = router;
