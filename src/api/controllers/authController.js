// src/api/controllers/authController.js

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Signs a JWT token for a given user ID.
 * @param {string} id The user ID to be included in the token payload.
 * @returns {string} The generated JSON Web Token.
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Creates and sends a JWT token in an HTTP-only cookie and as a JSON response.
 * @param {object} user The user document.
 * @param {number} statusCode The HTTP status code for the response.
 * @param {object} res The Express response object.
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Remove password from the output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

/**
 * Handles new user registration.
 * Creates a new user and their three default workspaces.
 */
exports.signup = catchAsync(async (req, res, next) => {
  // 1) Create the new user
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
  });

  // 2) Create the three default workspaces for the new user
  const workspacePromises = [
    Workspace.create({ name: 'Personal', type: 'Personal', owner: newUser._id }),
    Workspace.create({ name: 'Business', type: 'Business', owner: newUser._id }),
    Workspace.create({ name: 'Company', type: 'Company', owner: newUser._id }),
  ];
  await Promise.all(workspacePromises);

  // 3) Send JWT to the client
  createSendToken(newUser, 201, res);
});

/**
 * Handles user login.
 * Verifies credentials and sends back a JWT upon success.
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }

  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything is ok, send token to client
  createSendToken(user, 200, res);
});
