// src/api/controllers/taskController.js

const { google } = require('googleapis');
const chrono = require('chrono-node');
const Task = require('../models/taskModel');
const User = require('../models/userModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');
const { upload, uploadToS3 } = require('../../utils/s3Upload'); // Fixed import
const googleService = require('../../services/googleCalendarService');

/**
 * Creates a new task. If the task is recurring, it's saved as a template.
 * If applicable, a corresponding Google Calendar event is created.
 */
exports.createTask = catchAsync(async (req, res, next) => {
  const workspace = await Workspace.findOne({
    _id: req.body.workspace,
    owner: req.user.id,
  });
  if (!workspace) {
    return next(new AppError('Workspace not found or you do not have permission to add a task to it.', 404));
  }

  // --- Recurring Task Logic ---
  // If recurring rules are provided, this is a template.
  if (req.body.recurring) {
    req.body.isRecurringTemplate = true;
    // The initial due date is set by the recurring rule's start date
    req.body.dueDate = req.body.recurring.nextDueDate;
  }

  const newTask = await Task.create(req.body);

  // --- Google Calendar Integration ---
  // Only create a calendar event for non-template tasks with a due date.
  if (!newTask.isRecurringTemplate && newTask.dueDate) {
    const user = await User.findById(req.user.id).select('+googleRefreshToken');
    if (user && user.googleRefreshToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        const event = await googleService.createCalendarEvent(oauth2Client, {
          title: newTask.title,
          description: newTask.description,
          dueDate: newTask.dueDate.toISOString(),
        });
        newTask.googleEventId = event.id;
        await newTask.save();
      } catch (error) {
        console.error('Failed to create Google Calendar event:', error.message);
      }
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      task: newTask,
    },
  });
});

/**
 * Fetches all tasks, with filtering capabilities.
 * Hides recurring templates from the main view.
 */
exports.getAllTasks = catchAsync(async (req, res, next) => {
  let filter = {
    isRecurringTemplate: false // <-- HIDE TEMPLATES BY DEFAULT
  };

  if (req.params.workspaceId) {
    const workspace = await Workspace.findOne({
      _id: req.params.workspaceId,
      owner: req.user.id,
    });
    if (!workspace) {
      return next(new AppError('Cannot access tasks in this workspace.', 403));
    }
    filter.workspace = req.params.workspaceId;
  } else {
    const userWorkspaces = await Workspace.find({ owner: req.user.id }).select('_id');
    const workspaceIds = userWorkspaces.map(ws => ws._id);
    filter.workspace = { $in: workspaceIds };
  }

  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);
  
  let query = Task.find({ ...filter, ...queryObj });

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const tasks = await query;
  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: {
      tasks,
    },
  });
});

/**
 * Get a single task by ID
 */
exports.getTask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({
    _id: task.workspace,
    owner: req.user.id,
  });
  if (!workspace) {
    return next(new AppError('You do not have permission to view this task.', 403));
  }
  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});

/**
 * Update an existing task
 */
exports.updateTask = catchAsync(async (req, res, next) => {
  const taskToUpdate = await Task.findById(req.params.id).select('+googleEventId');
  if (!taskToUpdate) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({ _id: taskToUpdate.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to update this task.', 403));
  }

  const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Update Google Calendar event if it exists
  if (taskToUpdate.googleEventId) {
    const user = await User.findById(req.user.id).select('+googleRefreshToken');
    if (user && user.googleRefreshToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        await googleService.updateCalendarEvent(oauth2Client, taskToUpdate.googleEventId, {
          title: updatedTask.title,
          description: updatedTask.description,
          dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString() : null,
        });
      } catch (error) {
        console.error('Failed to update Google Calendar event:', error.message);
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      task: updatedTask,
    },
  });
});

/**
 * Delete a task
 */
exports.deleteTask = catchAsync(async (req, res, next) => {
  const taskToDelete = await Task.findById(req.params.id).select('+googleEventId');
  if (!taskToDelete) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({ _id: taskToDelete.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to delete this task.', 403));
  }

  // Delete Google Calendar event if it exists
  if (taskToDelete.googleEventId) {
    const user = await User.findById(req.user.id).select('+googleRefreshToken');
    if (user && user.googleRefreshToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        await googleService.deleteCalendarEvent(oauth2Client, taskToDelete.googleEventId);
      } catch (error) {
        console.error('Failed to delete Google Calendar event:', error.message);
      }
    }
  }

  await Task.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

/**
 * Parse natural language text to extract task details
 */
exports.parseTask = catchAsync(async (req, res, next) => {
  const { text } = req.body;
  if (!text) {
    return next(new AppError('Please provide text to parse.', 400));
  }
  
  const parsedResults = chrono.parse(text);
  let title = text;
  let dueDate = null;
  
  if (parsedResults.length > 0) {
    const parsedResult = parsedResults[0];
    title = text.substring(0, parsedResult.index).trim();
    dueDate = parsedResult.start.date();
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      title,
      dueDate,
      description: `Original input: ${text}`,
    },
  });
});

/**
 * Middleware for handling file upload
 */
exports.uploadTaskFile = upload.single('attachment');

/**
 * Add attachment to a task
 */
exports.addAttachmentToTask = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a file.', 400));
  }
  
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to modify this task.', 403));
  }

  try {
    // Upload file to S3 using the custom upload function
    const uploadResult = await uploadToS3(req.file, req.user.id, req.params.id);
    
    const newAttachment = {
      fileName: req.file.originalname,
      fileUrl: uploadResult.Location, // S3 URL from upload result
      fileKey: uploadResult.Key,      // S3 key from upload result
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      uploadedAt: new Date(),
    };
    
    if (!task.attachments) {
      task.attachments = [];
    }
    
    task.attachments.push(newAttachment);
    await task.save();
    
    res.status(200).json({
      status: 'success',
      message: 'File uploaded successfully',
      data: {
        task,
        attachment: newAttachment,
      },
    });
  } catch (error) {
    console.error('S3 upload error:', error);
    return next(new AppError('Failed to upload file to S3. Please try again.', 500));
  }
});

/**
 * Remove attachment from a task
 */
exports.removeAttachmentFromTask = catchAsync(async (req, res, next) => {
  const { attachmentId } = req.params;
  
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to modify this task.', 403));
  }

  const attachmentIndex = task.attachments.findIndex(
    attachment => attachment._id.toString() === attachmentId
  );
  
  if (attachmentIndex === -1) {
    return next(new AppError('Attachment not found', 404));
  }

  // Remove the attachment from the array
  const removedAttachment = task.attachments[attachmentIndex];
  task.attachments.splice(attachmentIndex, 1);
  
  await task.save();

  // TODO: Optionally delete the file from S3 here
  // You might want to implement a cleanup service for this
  
  res.status(200).json({
    status: 'success',
    message: 'Attachment removed successfully',
    data: {
      task,
      removedAttachment,
    },
  });
});

/**
 * Middleware to set workspace and user IDs from params/auth
 */
exports.setWorkspaceUserIds = (req, res, next) => {
  if (!req.body.workspace) req.body.workspace = req.params.workspaceId;
  if (!req.body.user) req.body.user = req.user.id;
  next();
};

/**
 * Get all attachments for a task
 */
exports.getTaskAttachments = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id).select('attachments');
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to view this task.', 403));
  }
  
  res.status(200).json({
    status: 'success',
    results: task.attachments ? task.attachments.length : 0,
    data: {
      attachments: task.attachments || [],
    },
  });
});

/**
 * Mark task as completed
 */
exports.markTaskCompleted = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to modify this task.', 403));
  }

  task.status = 'completed';
  task.completedAt = new Date();
  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});

/**
 * Mark task as pending/incomplete
 */
exports.markTaskPending = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to modify this task.', 403));
  }

  task.status = 'pending';
  task.completedAt = undefined;
  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});