// src/api/controllers/meetingController.js

const Meeting = require('../models/meetingModel');
const Task = require('../models/taskModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Starts a new meeting session.
 *
 * This function finds all tasks marked as 'isKeyTask' within the user's
 * 'Company' workspace, creates a snapshot of them, and saves them in a
 * new Meeting document.
 */
exports.startMeeting = catchAsync(async (req, res, next) => {
  // 1) Find the user's 'Company' workspace.
  const companyWorkspace = await Workspace.findOne({
    owner: req.user.id,
    type: 'Company',
  });

  if (!companyWorkspace) {
    return next(
      new AppError(
        'No "Company" workspace found for this user. Cannot start a meeting.',
        404
      )
    );
  }

  // 2) Find all key tasks within that workspace.
  const keyTasks = await Task.find({
    workspace: companyWorkspace._id,
    isKeyTask: true,
  });

  // 3) Create snapshots from the key tasks.
  const taskSnapshots = keyTasks.map(task => ({
    originalTaskId: task._id,
    title: task.title,
    status: task.status,
    description: task.description,
  }));

  // 4) Create the new meeting document.
  const newMeeting = await Meeting.create({
    user: req.user.id,
    workspace: companyWorkspace._id,
    taskSnapshots,
    notes: req.body.notes || '', // Allow initial notes
  });

  res.status(201).json({
    status: 'success',
    data: {
      meeting: newMeeting,
    },
  });
});

/**
 * Fetches all past meetings for the user's 'Company' workspace.
 */
exports.getAllMeetings = catchAsync(async (req, res, next) => {
  const companyWorkspace = await Workspace.findOne({
    owner: req.user.id,
    type: 'Company',
  });

  if (!companyWorkspace) {
    return next(new AppError('No "Company" workspace found.', 404));
  }

  const meetings = await Meeting.find({
    user: req.user.id,
    workspace: companyWorkspace._id,
  }).sort('-meetingDate'); // Sort by most recent first

  res.status(200).json({
    status: 'success',
    results: meetings.length,
    data: {
      meetings,
    },
  });
});

/**
 * Fetches a single meeting by its ID.
 */
exports.getMeeting = catchAsync(async (req, res, next) => {
  const meeting = await Meeting.findOne({
    _id: req.params.id,
    user: req.user.id, // Security check
  });

  if (!meeting) {
    return next(new AppError('No meeting found with that ID for this user.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      meeting,
    },
  });
});

/**
 * Updates the notes for a specific meeting.
 */
exports.updateMeeting = catchAsync(async (req, res, next) => {
  // Only allow updating the 'notes' field.
  const updatedBody = {
    notes: req.body.notes,
  };

  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id }, // Security check
    updatedBody,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!meeting) {
    return next(new AppError('No meeting found with that ID for this user.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      meeting,
    },
  });
});
