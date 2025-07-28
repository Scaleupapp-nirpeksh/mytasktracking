/**
 * Enhanced Task Model - Single User with Manager Meeting History
 * 
 * MongoDB schema for tasks with comprehensive single-user features:
 * - Task management with priorities, statuses, and deadlines
 * - Subtasks and checklist support
 * - AWS S3 file attachments
 * - Recurring task functionality
 * - Progress tracking and time management
 * - Personal notes system (no collaboration)
 * - Enhanced manager meeting preparation with full history
 * - Meeting reference system for Company workspace
 * 
 * @author Nirpeksh Scale Up App
 * @version 2.0.0 - Enhanced for single user with meeting history
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Subtask Schema for nested task items
 */
const subtaskSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Subtask title is required'],
    trim: true,
    maxlength: [200, 'Subtask title cannot exceed 200 characters']
  },
  
  isCompleted: {
    type: Boolean,
    default: false
  },
  
  completedAt: {
    type: Date,
    default: null
  },
  
  order: {
    type: Number,
    default: 0
  },
  
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Subtask notes cannot exceed 500 characters']
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Personal Notes Schema (replacing comments for single user)
 */
const personalNoteSchema = new Schema({
  content: {
    type: String,
    required: [true, 'Note content is required'],
    trim: true,
    maxlength: [2000, 'Note cannot exceed 2000 characters']
  },
  
  noteType: {
    type: String,
    enum: ['general', 'progress', 'blocker', 'idea', 'meeting_prep'],
    default: 'general'
  },
  
  isImportant: {
    type: Boolean,
    default: false
  },
  
  isEdited: {
    type: Boolean,
    default: false
  },
  
  editedAt: {
    type: Date,
    default: null
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Time Log Schema for time tracking
 */
const timeLogSchema = new Schema({
  startTime: {
    type: Date,
    required: true
  },
  
  endTime: {
    type: Date,
    default: null
  },
  
  duration: {
    type: Number, // Duration in minutes
    default: 0,
    min: 0
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Time log description cannot exceed 500 characters']
  },
  
  isActive: {
    type: Boolean,
    default: false // True when timer is running
  },
  
  sessionType: {
    type: String,
    enum: ['focused_work', 'research', 'meeting', 'review', 'other'],
    default: 'focused_work'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Enhanced Manager Meeting History Schema
 */
const meetingHistorySchema = new Schema({
  meetingId: {
    type: Schema.Types.ObjectId,
    ref: 'ManagerMeeting',
    required: true
  },
  
  discussedAt: {
    type: Date,
    required: true
  },
  
  taskStatus: {
    type: String,
    enum: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'],
    required: true
  },
  
  progressPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  managerFeedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Manager feedback cannot exceed 1000 characters']
  },
  
  actionItemsGiven: [{
    item: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Action item cannot exceed 200 characters']
    },
    dueDate: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    isCompleted: { type: Boolean, default: false },
    completedAt: Date
  }],
  
  blockersDiscussed: [{
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: [300, 'Blocker description cannot exceed 300 characters']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    resolution: {
      type: String,
      trim: true,
      maxlength: [500, 'Resolution cannot exceed 500 characters']
    },
    isResolved: { type: Boolean, default: false },
    resolvedAt: Date
  }],
  
  priorityChange: {
    from: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    to: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [300, 'Priority change reason cannot exceed 300 characters']
    }
  },
  
  nextSteps: {
    type: String,
    trim: true,
    maxlength: [1000, 'Next steps cannot exceed 1000 characters']
  },
  
  userNotes: {
    type: String,
    trim: true,
    maxlength: [1500, 'User notes cannot exceed 1500 characters']
  }
}, { _id: true });

/**
 * Priority Change Tracking Schema
 */
const priorityChangeSchema = new Schema({
  from: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    required: true
  },
  
  to: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    required: true
  },
  
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: [300, 'Priority change reason cannot exceed 300 characters']
  },
  
  trigger: {
    type: String,
    enum: ['user_decision', 'manager_feedback', 'deadline_change', 'blocker_resolved', 'business_priority'],
    required: true
  },
  
  relatedMeetingId: {
    type: Schema.Types.ObjectId,
    ref: 'ManagerMeeting',
    default: null
  },
  
  changedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Main Task Schema Definition - Enhanced for Single User
 */
const taskSchema = new Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Task title cannot exceed 200 characters'],
    minlength: [1, 'Task title must be at least 1 character']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Task description cannot exceed 5000 characters']
  },
  
  taskNumber: {
    type: String,
    unique: true,
    sparse: true, // Allows null values
    index: true
  },
  
  // Workspace and Organization
  workspace: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: [true, 'Task must belong to a workspace'],
    index: true
  },
  
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  // Task Properties
  status: {
    type: String,
    enum: {
      values: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'],
      message: 'Status must be one of: todo, in_progress, blocked, review, done, cancelled'
    },
    default: 'todo',
    index: true
  },
  
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be one of: low, medium, high, urgent'
    },
    default: 'medium',
    index: true
  },
  
  isKeyTask: {
    type: Boolean,
    default: false,
    index: true // For manager meeting views
  },
  
  // Single User Ownership (simplified)
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must have a creator'],
    index: true
  },
  
  // Timing and Scheduling
  dueDate: {
    type: Date,
    index: true
  },
  
  startDate: {
    type: Date,
    default: null
  },
  
  estimatedDuration: {
    type: Number, // Duration in minutes
    min: [0, 'Estimated duration cannot be negative'],
    default: null
  },
  
  actualDuration: {
    type: Number, // Duration in minutes
    min: [0, 'Actual duration cannot be negative'],
    default: 0
  },
  
  // Recurring Task Support
  recurrence: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    
    pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
      default: null
    },
    
    interval: {
      type: Number,
      min: 1,
      default: 1 // Every X days/weeks/months
    },
    
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    }],
    
    endDate: {
      type: Date,
      default: null
    },
    
    maxOccurrences: {
      type: Number,
      min: 1,
      default: null
    },
    
    nextDueDate: {
      type: Date,
      default: null
    },
    
    lastGenerated: {
      type: Date,
      default: null
    }
  },
  
  // Parent-Child Relationships
  parentTask: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    default: null,
    index: true
  },
  
  hasSubtasks: {
    type: Boolean,
    default: false
  },
  
  subtasks: [subtaskSchema],
  
  // Progress and Completion
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  completedAt: {
    type: Date,
    default: null,
    index: true
  },
  
  // Enhanced Manager Meeting Support
  managerNotes: {
    // Current status
    isKeyTask: {
      type: Boolean,
      default: false
    },
    
    currentPriority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: null
    },
    
    // Meeting tracking
    lastDiscussedAt: {
      type: Date,
      default: null
    },
    
    nextReviewDate: {
      type: Date,
      default: null
    },
    
    totalMeetingsDiscussed: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Current manager context
    currentManagerFeedback: {
      type: String,
      trim: true,
      maxlength: [1000, 'Current manager feedback cannot exceed 1000 characters']
    },
    
    currentBlockers: [{
      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: [300, 'Blocker description cannot exceed 300 characters']
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      identifiedAt: {
        type: Date,
        default: Date.now
      },
      isResolved: {
        type: Boolean,
        default: false
      },
      resolvedAt: Date
    }],
    
    currentActionItems: [{
      item: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Action item cannot exceed 200 characters']
      },
      dueDate: Date,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
      },
      isCompleted: {
        type: Boolean,
        default: false
      },
      completedAt: Date,
      assignedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Meeting history references
    meetingHistory: [meetingHistorySchema],
    
    // Priority change tracking
    priorityChanges: [priorityChangeSchema],
    
    // Meeting preparation notes
    preparationNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Preparation notes cannot exceed 2000 characters']
    },
    
    lastPreparationDate: {
      type: Date,
      default: null
    }
  },
  
  // AWS S3 File Attachments (Updated for S3)
  attachments: [{
    filename: { 
      type: String, 
      required: true 
    },
    originalName: { 
      type: String, 
      required: true 
    },
    mimeType: { 
      type: String, 
      required: true 
    },
    size: { 
      type: Number, 
      required: true 
    },
    s3Key: { 
      type: String, 
      required: true // S3 object key
    },
    s3Bucket: { 
      type: String, 
      required: true,
      default: 'mytasktracking'
    },
    url: { 
      type: String, 
      required: true // Pre-signed or public URL
    },
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    },
    isPublic: {
      type: Boolean,
      default: false
    },
    expiresAt: {
      type: Date,
      default: null // For temporary files
    }
  }],
  
  // Links and References
  links: [{
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Link title cannot exceed 100 characters']
    },
    url: {
      type: String,
      required: true,
      trim: true,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Link description cannot exceed 200 characters']
    },
    addedAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  
  // Personal Notes (replacing collaboration comments)
  personalNotes: [personalNoteSchema],
  
  // Time Tracking
  timeLogs: [timeLogSchema],
  
  // Dependencies (for task relationships)
  dependencies: [{
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true
    },
    type: {
      type: String,
      enum: ['blocks', 'blocked_by', 'related'],
      default: 'related'
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Dependency description cannot exceed 200 characters']
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  
  // Status and Metadata
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  
  archivedAt: {
    type: Date,
    default: null
  },
  
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Audit Trail
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Virtual Properties
 */

// Is task overdue
taskSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'done' || this.status === 'cancelled') {
    return false;
  }
  return new Date() > this.dueDate;
});

// Days until due
taskSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate) return null;
  const diff = this.dueDate.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Subtask completion percentage
taskSchema.virtual('subtaskProgress').get(function() {
  if (this.subtasks.length === 0) return 100;
  const completed = this.subtasks.filter(subtask => subtask.isCompleted).length;
  return Math.round((completed / this.subtasks.length) * 100);
});

// Total time spent
taskSchema.virtual('totalTimeSpent').get(function() {
  return this.timeLogs.reduce((total, log) => total + log.duration, 0);
});

// Is task active (has running timer)
taskSchema.virtual('hasActiveTimer').get(function() {
  return this.timeLogs.some(log => log.isActive);
});

// Meeting discussion frequency
taskSchema.virtual('meetingDiscussionFrequency').get(function() {
  return this.managerNotes.meetingHistory.length;
});

// Has unresolved blockers
taskSchema.virtual('hasUnresolvedBlockers').get(function() {
  return this.managerNotes.currentBlockers.some(blocker => !blocker.isResolved);
});

// Pending action items count
taskSchema.virtual('pendingActionItemsCount').get(function() {
  return this.managerNotes.currentActionItems.filter(item => !item.isCompleted).length;
});

/**
 * Indexes for Performance
 */
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ createdBy: 1, createdAt: -1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ priority: 1, status: 1 });
taskSchema.index({ isKeyTask: 1, workspace: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ parentTask: 1 });
taskSchema.index({ lastActivityAt: -1 });

// Enhanced indexes for manager meeting features
taskSchema.index({ 'managerNotes.lastDiscussedAt': -1 });
taskSchema.index({ 'managerNotes.nextReviewDate': 1 });
taskSchema.index({ workspace: 1, isKeyTask: 1, 'managerNotes.lastDiscussedAt': -1 });

// Compound indexes for common queries
taskSchema.index({ workspace: 1, status: 1, priority: -1 });
taskSchema.index({ workspace: 1, isKeyTask: 1, status: 1 });
taskSchema.index({ workspace: 1, dueDate: 1, status: 1 });

/**
 * Pre-save Middleware
 */

// Update timestamps and activity
taskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivityAt = new Date();
  
  // Update progress based on subtasks
  if (this.subtasks.length > 0) {
    const completed = this.subtasks.filter(subtask => subtask.isCompleted).length;
    this.progress = Math.round((completed / this.subtasks.length) * 100);
    this.hasSubtasks = true;
  } else {
    this.hasSubtasks = false;
    if (this.status === 'done') {
      this.progress = 100;
    }
  }
  
  // Set completion timestamp
  if (this.isModified('status')) {
    if (this.status === 'done' && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== 'done') {
      this.completedAt = null;
    }
  }
  
  // Track priority changes
  if (this.isModified('priority') && !this.isNew) {
    const oldPriority = this.managerNotes.currentPriority || 'medium';
    if (oldPriority !== this.priority) {
      this.managerNotes.priorityChanges.push({
        from: oldPriority,
        to: this.priority,
        reason: 'Priority updated by user',
        trigger: 'user_decision',
        changedAt: new Date()
      });
    }
  }
  
  // Update manager notes current priority
  this.managerNotes.currentPriority = this.priority;
  
  next();
});

/**
 * Instance Methods - Enhanced for Single User
 */

// Add subtask
taskSchema.methods.addSubtask = function(title, order = null, notes = '') {
  const newOrder = order !== null ? order : this.subtasks.length;
  
  this.subtasks.push({
    title: title.trim(),
    order: newOrder,
    notes: notes.trim(),
    isCompleted: false
  });
  
  return this.save();
};

// Toggle subtask completion
taskSchema.methods.toggleSubtask = function(subtaskId) {
  const subtask = this.subtasks.id(subtaskId);
  if (!subtask) {
    throw new Error('Subtask not found');
  }
  
  subtask.isCompleted = !subtask.isCompleted;
  subtask.completedAt = subtask.isCompleted ? new Date() : null;
  
  return this.save();
};

// Add personal note
taskSchema.methods.addPersonalNote = function(content, noteType = 'general', isImportant = false) {
  this.personalNotes.push({
    content: content.trim(),
    noteType,
    isImportant
  });
  
  return this.save();
};

// Add S3 attachment
taskSchema.methods.addS3Attachment = function(attachmentData) {
  this.attachments.push({
    filename: attachmentData.filename,
    originalName: attachmentData.originalName,
    mimeType: attachmentData.mimeType,
    size: attachmentData.size,
    s3Key: attachmentData.s3Key,
    s3Bucket: attachmentData.s3Bucket || 'mytasktracking',
    url: attachmentData.url,
    isPublic: attachmentData.isPublic || false,
    expiresAt: attachmentData.expiresAt || null
  });
  
  return this.save();
};

// Add link
taskSchema.methods.addLink = function(title, url, description = '') {
  this.links.push({
    title: title.trim(),
    url: url.trim(),
    description: description.trim()
  });
  
  return this.save();
};

// Start time tracking
taskSchema.methods.startTimer = function(description = '', sessionType = 'focused_work') {
  // Stop any existing active timers
  this.timeLogs.forEach(log => {
    if (log.isActive) {
      log.isActive = false;
      log.endTime = new Date();
      log.duration = Math.round((log.endTime - log.startTime) / (1000 * 60));
    }
  });
  
  // Start new timer
  this.timeLogs.push({
    startTime: new Date(),
    description: description.trim(),
    sessionType,
    isActive: true
  });
  
  return this.save();
};

// Stop time tracking
taskSchema.methods.stopTimer = function() {
  const activeLog = this.timeLogs.find(log => log.isActive);
  
  if (!activeLog) {
    throw new Error('No active timer found');
  }
  
  activeLog.isActive = false;
  activeLog.endTime = new Date();
  activeLog.duration = Math.round((activeLog.endTime - activeLog.startTime) / (1000 * 60));
  
  // Update actual duration
  this.actualDuration = this.timeLogs.reduce((total, log) => total + log.duration, 0);
  
  return this.save();
};

// Add manager meeting history entry
taskSchema.methods.addMeetingHistory = function(meetingId, meetingData) {
  this.managerNotes.meetingHistory.push({
    meetingId,
    discussedAt: meetingData.discussedAt || new Date(),
    taskStatus: this.status,
    progressPercentage: this.progress,
    managerFeedback: meetingData.managerFeedback || '',
    actionItemsGiven: meetingData.actionItemsGiven || [],
    blockersDiscussed: meetingData.blockersDiscussed || [],
    priorityChange: meetingData.priorityChange || null,
    nextSteps: meetingData.nextSteps || '',
    userNotes: meetingData.userNotes || ''
  });
  
  this.managerNotes.lastDiscussedAt = meetingData.discussedAt || new Date();
  this.managerNotes.totalMeetingsDiscussed += 1;
  
  // Update current manager feedback
  if (meetingData.managerFeedback) {
    this.managerNotes.currentManagerFeedback = meetingData.managerFeedback;
  }
  
  // Add new action items to current list
  if (meetingData.actionItemsGiven && meetingData.actionItemsGiven.length > 0) {
    this.managerNotes.currentActionItems.push(...meetingData.actionItemsGiven);
  }
  
  return this.save();
};

// Add blocker
taskSchema.methods.addBlocker = function(description, severity = 'medium') {
  this.managerNotes.currentBlockers.push({
    description: description.trim(),
    severity,
    identifiedAt: new Date(),
    isResolved: false
  });
  
  return this.save();
};

// Resolve blocker
taskSchema.methods.resolveBlocker = function(blockerId) {
  const blocker = this.managerNotes.currentBlockers.id(blockerId);
  if (!blocker) {
    throw new Error('Blocker not found');
  }
  
  blocker.isResolved = true;
  blocker.resolvedAt = new Date();
  
  return this.save();
};

// Mark as key task
taskSchema.methods.markAsKeyTask = function(isKey = true) {
  this.isKeyTask = isKey;
  this.managerNotes.isKeyTask = isKey;
  return this.save();
};

// Prepare for manager meeting
taskSchema.methods.prepareMeetingNotes = function(preparationNotes) {
  this.managerNotes.preparationNotes = preparationNotes.trim();
  this.managerNotes.lastPreparationDate = new Date();
  return this.save();
};

// Archive task
taskSchema.methods.archive = function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Restore task
taskSchema.methods.restore = function() {
  this.isArchived = false;
  this.archivedAt = null;
  return this.save();
};

/**
 * Static Methods - Enhanced for Single User
 */

// Find tasks by workspace
taskSchema.statics.findByWorkspace = function(workspaceId, filters = {}) {
  return this.find({
    workspace: workspaceId,
    isArchived: false,
    ...filters
  }).populate('workspace', 'name type');
};

// Find key tasks for manager meetings with history
taskSchema.statics.findKeyTasksWithHistory = function(workspaceId, userId) {
  return this.find({
    workspace: workspaceId,
    isKeyTask: true,
    createdBy: userId,
    isArchived: false,
    status: { $ne: 'cancelled' }
  }).populate('workspace', 'name type')
    .sort({ 'managerNotes.lastDiscussedAt': -1, priority: -1, dueDate: 1 });
};

// Find tasks ready for manager discussion
taskSchema.statics.findTasksReadyForDiscussion = function(workspaceId, userId, daysSinceLastDiscussion = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastDiscussion);
  
  return this.find({
    workspace: workspaceId,
    createdBy: userId,
    isKeyTask: true,
    isArchived: false,
    status: { $nin: ['done', 'cancelled'] },
    $or: [
      { 'managerNotes.lastDiscussedAt': { $lt: cutoffDate } },
      { 'managerNotes.lastDiscussedAt': null },
      { 'managerNotes.currentBlockers.isResolved': false }
    ]
  }).populate('workspace', 'name type')
    .sort({ priority: -1, dueDate: 1 });
};

// Find overdue tasks
taskSchema.statics.findOverdue = function(workspaceId = null, userId = null) {
  const query = {
    dueDate: { $lt: new Date() },
    status: { $nin: ['done', 'cancelled'] },
    isArchived: false
  };
  
  if (workspaceId) query.workspace = workspaceId;
  if (userId) query.createdBy = userId;
  
  return this.find(query)
    .populate('workspace', 'name type color')
    .sort({ dueDate: 1 });
};

// Find tasks by user
taskSchema.statics.findByUser = function(userId, workspaceId = null) {
  const query = {
    createdBy: userId,
    isArchived: false
  };
  
  if (workspaceId) {
    query.workspace = workspaceId;
  }
  
  return this.find(query)
    .populate('workspace', 'name type color')
    .sort({ lastActivityAt: -1 });
};

// Get meeting preparation data
taskSchema.statics.getMeetingPreparationData = function(workspaceId, userId, lastMeetingDate = null) {
  const query = {
    workspace: workspaceId,
    createdBy: userId,
    isKeyTask: true,
    isArchived: false
  };
  
  return this.find(query)
    .populate('workspace', 'name type')
    .sort({ 'managerNotes.lastDiscussedAt': -1 });
};

// Create the model
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;