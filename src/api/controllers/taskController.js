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
  if (req.body.recurring) {
    req.body.isRecurringTemplate = true;
    req.body.dueDate = req.body.recurring.nextDueDate;
  }

  const newTask = await Task.create(req.body);

  // Add creation history entry
  addHistoryEntry(
    newTask,
    'created',
    `Task "${newTask.title}" was created`,
    req.user.id,
    {
      priority: newTask.priority,
      status: newTask.status,
      dueDate: newTask.dueDate,
    }
  );

  // --- Google Calendar Integration ---
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
        
        // Add history entry for calendar integration
        addHistoryEntry(
          newTask,
          'updated',
          'Google Calendar event created',
          req.user.id,
          { googleEventId: event.id }
        );
        
        await newTask.save();
      } catch (error) {
        console.error('Failed to create Google Calendar event:', error.message);
      }
    }
  }

  await newTask.save();

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

  // Store original values for history tracking
  const originalTask = taskToUpdate.toObject();
  
  // Track which fields are being updated
  const fieldsToUpdate = Object.keys(req.body);
  const changes = [];

  fieldsToUpdate.forEach(field => {
    if (originalTask[field] !== req.body[field]) {
      changes.push({
        field,
        oldValue: originalTask[field],
        newValue: req.body[field],
        description: getChangeDescription(field, originalTask[field], req.body[field])
      });
    }
  });

  const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Add history entries for each change
  changes.forEach(change => {
    addHistoryEntry(
      updatedTask,
      change.field === 'status' ? 'status_changed' : 
      change.field === 'priority' ? 'priority_changed' :
      change.field === 'dueDate' ? 'due_date_changed' : 'updated',
      change.description,
      req.user.id,
      {
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      }
    );
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
        
        // Add history entry for calendar update
        addHistoryEntry(
          updatedTask,
          'updated',
          'Google Calendar event updated',
          req.user.id,
          { googleEventId: taskToUpdate.googleEventId }
        );
      } catch (error) {
        console.error('Failed to update Google Calendar event:', error.message);
      }
    }
  }

  await updatedTask.save();

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
    const uploadResult = await uploadToS3(req.file, req.user.id, req.params.id);
    
    const newAttachment = {
      fileName: req.file.originalname,
      fileUrl: uploadResult.Location,
      fileKey: uploadResult.Key,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      uploadedAt: new Date(),
    };
    
    if (!task.attachments) {
      task.attachments = [];
    }
    
    task.attachments.push(newAttachment);

    // Add history entry
    addHistoryEntry(
      task,
      'attachment_added',
      `File "${req.file.originalname}" was attached`,
      req.user.id,
      {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        contentType: req.file.mimetype,
      }
    );

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

  const removedAttachment = task.attachments[attachmentIndex];
  task.attachments.splice(attachmentIndex, 1);

  // Add history entry
  addHistoryEntry(
    task,
    'attachment_removed',
    `File "${removedAttachment.fileName}" was removed`,
    req.user.id,
    {
      fileName: removedAttachment.fileName,
      fileSize: removedAttachment.fileSize,
      contentType: removedAttachment.contentType,
    }
  );
  
  await task.save();
  
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

  const previousStatus = task.status;
  task.status = 'Done';
  task.completedAt = new Date();

  // Add history entry
  addHistoryEntry(
    task,
    'completed',
    `Task completed (changed from "${previousStatus}")`,
    req.user.id,
    {
      previousStatus,
      completedAt: task.completedAt,
    }
  );

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

  const previousStatus = task.status;
  const wasCompleted = task.completedAt ? true : false;
  
  task.status = 'To Do';
  task.completedAt = undefined;

  // Add history entry
  addHistoryEntry(
    task,
    'reopened',
    `Task reopened (changed from "${previousStatus}")`,
    req.user.id,
    {
      previousStatus,
      wasCompleted,
    }
  );

  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});


/**
 * Add a note to a task
 */
exports.addNoteToTask = catchAsync(async (req, res, next) => {
  const { content } = req.body;
  
  if (!content || content.trim() === '') {
    return next(new AppError('Note content is required', 400));
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to add notes to this task.', 403));
  }

  const newNote = {
    content: content.trim(),
    author: req.user.id,
    createdAt: new Date(),
  };

  task.notes.push(newNote);
  
  // Add history entry for note addition
  task.history.push({
    action: 'note_added',
    description: `Added a note`,
    user: req.user.id,
    timestamp: new Date(),
    metadata: {
      notePreview: content.trim().substring(0, 100) + (content.length > 100 ? '...' : '')
    }
  });

  await task.save();

  // Get the newly added note with its generated ID
  const addedNote = task.notes[task.notes.length - 1];

  res.status(201).json({
    status: 'success',
    data: {
      note: addedNote,
      task: task,
    },
  });
});

/**
 * Update a note in a task
 */
exports.updateNoteInTask = catchAsync(async (req, res, next) => {
  const { content } = req.body;
  const { noteId } = req.params;
  
  if (!content || content.trim() === '') {
    return next(new AppError('Note content is required', 400));
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to update notes in this task.', 403));
  }

  const noteIndex = task.notes.findIndex(note => note._id.toString() === noteId);
  if (noteIndex === -1) {
    return next(new AppError('Note not found', 404));
  }

  const note = task.notes[noteIndex];
  
  // Check if user is the author of the note (optional: you might want to allow workspace owners to edit any note)
  if (note.author.toString() !== req.user.id) {
    return next(new AppError('You can only edit your own notes', 403));
  }

  const oldContent = note.content;
  note.content = content.trim();
  note.updatedAt = new Date();
  note.isEdited = true;

  // Add history entry for note update
  task.history.push({
    action: 'note_updated',
    description: `Updated a note`,
    user: req.user.id,
    timestamp: new Date(),
    metadata: {
      noteId: noteId,
      oldPreview: oldContent.substring(0, 50) + (oldContent.length > 50 ? '...' : ''),
      newPreview: content.trim().substring(0, 50) + (content.length > 50 ? '...' : '')
    }
  });

  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      note: note,
      task: task,
    },
  });
});

/**
 * Delete a note from a task
 */
exports.deleteNoteFromTask = catchAsync(async (req, res, next) => {
  const { noteId } = req.params;

  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to delete notes from this task.', 403));
  }

  const noteIndex = task.notes.findIndex(note => note._id.toString() === noteId);
  if (noteIndex === -1) {
    return next(new AppError('Note not found', 404));
  }

  const note = task.notes[noteIndex];
  
  // Check if user is the author of the note (optional: you might want to allow workspace owners to delete any note)
  if (note.author.toString() !== req.user.id) {
    return next(new AppError('You can only delete your own notes', 403));
  }

  const deletedNote = task.notes.splice(noteIndex, 1)[0];

  // Add history entry for note deletion
  task.history.push({
    action: 'note_deleted',
    description: `Deleted a note`,
    user: req.user.id,
    timestamp: new Date(),
    metadata: {
      deletedContent: deletedNote.content.substring(0, 100) + (deletedNote.content.length > 100 ? '...' : '')
    }
  });

  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      deletedNote,
      task: task,
    },
  });
});

/**
 * Get all notes for a task
 */
exports.getTaskNotes = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, sortBy = '-createdAt' } = req.query;

  const task = await Task.findById(req.params.id)
    .populate('notes.author', 'name email')
    .select('notes workspace');
    
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to view notes for this task.', 403));
  }

  // Sort notes
  const sortField = sortBy.startsWith('-') ? sortBy.substring(1) : sortBy;
  const sortOrder = sortBy.startsWith('-') ? -1 : 1;
  
  const sortedNotes = task.notes.sort((a, b) => {
    if (sortField === 'createdAt') {
      return sortOrder * (new Date(b.createdAt) - new Date(a.createdAt));
    }
    if (sortField === 'updatedAt') {
      return sortOrder * (new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    return 0;
  });

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedNotes = sortedNotes.slice(startIndex, endIndex);

  res.status(200).json({
    status: 'success',
    results: paginatedNotes.length,
    totalNotes: task.notes.length,
    currentPage: parseInt(page),
    totalPages: Math.ceil(task.notes.length / limit),
    data: {
      notes: paginatedNotes,
    },
  });
});

/**
 * Get task history/activity log
 */
exports.getTaskHistory = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, action, user: userId } = req.query;

  const task = await Task.findById(req.params.id)
    .populate('history.user', 'name email')
    .select('history workspace');
    
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to view history for this task.', 403));
  }

  let filteredHistory = task.history;

  // Filter by action type if specified
  if (action) {
    filteredHistory = filteredHistory.filter(entry => entry.action === action);
  }

  // Filter by user if specified
  if (userId) {
    filteredHistory = filteredHistory.filter(entry => entry.user.toString() === userId);
  }

  // Sort by timestamp (newest first)
  const sortedHistory = filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedHistory = sortedHistory.slice(startIndex, endIndex);

  res.status(200).json({
    status: 'success',
    results: paginatedHistory.length,
    totalEntries: filteredHistory.length,
    currentPage: parseInt(page),
    totalPages: Math.ceil(filteredHistory.length / limit),
    data: {
      history: paginatedHistory,
    },
  });
});

/**
 * Get task activity summary
 */
exports.getTaskActivitySummary = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id)
    .populate('notes.author', 'name email')
    .populate('history.user', 'name email')
    .select('notes history workspace');
    
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to view activity for this task.', 403));
  }

  // Get recent notes (last 3)
  const recentNotes = task.notes
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);

  // Get recent history (last 5)
  const recentHistory = task.history
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  // Activity statistics
  const stats = {
    totalNotes: task.notes.length,
    totalHistoryEntries: task.history.length,
    lastActivity: task.history.length > 0 
      ? task.history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp
      : null,
    actionCounts: {},
  };

  // Count different types of actions
  task.history.forEach(entry => {
    stats.actionCounts[entry.action] = (stats.actionCounts[entry.action] || 0) + 1;
  });

  res.status(200).json({
    status: 'success',
    data: {
      recentNotes,
      recentHistory,
      stats,
    },
  });
});

/**
 * Add a manual history entry (for special events)
 */
exports.addHistoryEntry = catchAsync(async (req, res, next) => {
  const { action, description, metadata } = req.body;
  
  if (!action || !description) {
    return next(new AppError('Action and description are required', 400));
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to add history to this task.', 403));
  }

  const historyEntry = {
    action,
    description,
    user: req.user.id,
    timestamp: new Date(),
    metadata: metadata || {},
  };

  task.history.push(historyEntry);
  await task.save();

  res.status(201).json({
    status: 'success',
    data: {
      historyEntry: task.history[task.history.length - 1],
    },
  });
});


/**
 * Helper function to add history entry to a task
 */
const addHistoryEntry = (task, action, description, user, metadata = {}) => {
  task.history.push({
    action,
    description,
    user,
    timestamp: new Date(),
    metadata,
  });
};

/**
 * Helper function to get change description for field updates
 */
const getChangeDescription = (field, oldValue, newValue) => {
  switch (field) {
    case 'status':
      return `Status changed from "${oldValue}" to "${newValue}"`;
    case 'priority':
      return `Priority changed from "${oldValue}" to "${newValue}"`;
    case 'title':
      return `Title changed from "${oldValue}" to "${newValue}"`;
    case 'description':
      return 'Description was updated';
    case 'dueDate':
      const oldDate = oldValue ? new Date(oldValue).toDateString() : 'none';
      const newDate = newValue ? new Date(newValue).toDateString() : 'none';
      return `Due date changed from ${oldDate} to ${newDate}`;
    case 'isKeyTask':
      return newValue ? 'Marked as key task' : 'Removed key task status';
    case 'tags':
      return 'Tags were updated';
    default:
      return `${field} was updated`;
  }
};
