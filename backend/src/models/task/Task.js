/**
 * Task Model
 * 
 * MongoDB schema for tasks with comprehensive features:
 * - Task management with priorities, statuses, and deadlines
 * - Subtasks and checklist support
 * - File attachments and rich content
 * - Recurring task functionality
 * - Progress tracking and time management
 * - Comments and collaboration
 * - Manager meeting preparation support
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
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
  
  completedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  order: {
    type: Number,
    default: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Comment Schema for task discussions
 */
const commentSchema = new Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
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
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Main Task Schema Definition
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
  
  // Assignment and Ownership
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must have a creator'],
    index: true
  },
  
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  
  assignedAt: {
    type: Date,
    default: null
  },
  
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
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
  
  completedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Manager Meeting Support
  managerNotes: {
    lastDiscussed: {
      type: Date,
      default: null
    },
    
    nextMeetingDate: {
      type: Date,
      default: null
    },
    
    priorityFeedback: {
      type: String,
      trim: true,
      maxlength: [1000, 'Priority feedback cannot exceed 1000 characters']
    },
    
    actionItems: [{
      item: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Action item cannot exceed 200 characters']
      },
      dueDate: Date,
      isCompleted: { type: Boolean, default: false },
      completedAt: Date,
      createdAt: { type: Date, default: Date.now }
    }],
    
    blockers: [{
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
      isResolved: { type: Boolean, default: false },
      resolvedAt: Date,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  
  // File Attachments
  attachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true }, // Cloudinary URL
    publicId: { type: String, required: true }, // Cloudinary public ID
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
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
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Collaboration
  comments: [commentSchema],
  
  watchers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Time Tracking
  timeLogs: [timeLogSchema],
  
  // Dependencies
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
    createdAt: { type: Date, default: Date.now }
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
  
  archivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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

/**
 * Indexes for Performance
 */
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ createdBy: 1, createdAt: -1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ priority: 1, status: 1 });
taskSchema.index({ isKeyTask: 1, workspace: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ parentTask: 1 });
taskSchema.index({ lastActivityAt: -1 });

// Compound indexes for common queries
taskSchema.index({ workspace: 1, assignedTo: 1, status: 1 });
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
      this.completedBy = null;
    }
  }
  
  next();
});

/**
 * Instance Methods
 */

// Add subtask
taskSchema.methods.addSubtask = function(title, order = null) {
  const newOrder = order !== null ? order : this.subtasks.length;
  
  this.subtasks.push({
    title: title.trim(),
    order: newOrder,
    isCompleted: false
  });
  
  return this.save();
};

// Toggle subtask completion
taskSchema.methods.toggleSubtask = function(subtaskId, userId) {
  const subtask = this.subtasks.id(subtaskId);
  if (!subtask) {
    throw new Error('Subtask not found');
  }
  
  subtask.isCompleted = !subtask.isCompleted;
  subtask.completedAt = subtask.isCompleted ? new Date() : null;
  subtask.completedBy = subtask.isCompleted ? userId : null;
  
  return this.save();
};

// Add comment
taskSchema.methods.addComment = function(content, authorId) {
  this.comments.push({
    content: content.trim(),
    author: authorId
  });
  
  return this.save();
};

// Add attachment
taskSchema.methods.addAttachment = function(attachmentData) {
  this.attachments.push(attachmentData);
  return this.save();
};

// Add link
taskSchema.methods.addLink = function(title, url, description, addedBy) {
  this.links.push({
    title: title.trim(),
    url: url.trim(),
    description: description ? description.trim() : '',
    addedBy
  });
  
  return this.save();
};

// Start time tracking
taskSchema.methods.startTimer = function(userId, description = '') {
  // Stop any existing active timers
  this.timeLogs.forEach(log => {
    if (log.isActive && log.user.toString() === userId.toString()) {
      log.isActive = false;
      log.endTime = new Date();
      log.duration = Math.round((log.endTime - log.startTime) / (1000 * 60));
    }
  });
  
  // Start new timer
  this.timeLogs.push({
    user: userId,
    startTime: new Date(),
    description: description.trim(),
    isActive: true
  });
  
  return this.save();
};

// Stop time tracking
taskSchema.methods.stopTimer = function(userId) {
  const activeLog = this.timeLogs.find(log => 
    log.isActive && log.user.toString() === userId.toString()
  );
  
  if (!activeLog) {
    throw new Error('No active timer found for this user');
  }
  
  activeLog.isActive = false;
  activeLog.endTime = new Date();
  activeLog.duration = Math.round((activeLog.endTime - activeLog.startTime) / (1000 * 60));
  
  // Update actual duration
  this.actualDuration = this.timeLogs.reduce((total, log) => total + log.duration, 0);
  
  return this.save();
};

// Add manager notes
taskSchema.methods.addManagerFeedback = function(feedback, actionItems = [], blockers = []) {
  this.managerNotes.lastDiscussed = new Date();
  this.managerNotes.priorityFeedback = feedback;
  
  // Add action items
  actionItems.forEach(item => {
    this.managerNotes.actionItems.push({
      item: item.item,
      dueDate: item.dueDate
    });
  });
  
  // Add blockers
  blockers.forEach(blocker => {
    this.managerNotes.blockers.push({
      description: blocker.description,
      severity: blocker.severity || 'medium'
    });
  });
  
  return this.save();
};

// Mark as key task
taskSchema.methods.markAsKeyTask = function(isKey = true) {
  this.isKeyTask = isKey;
  return this.save();
};

// Archive task
taskSchema.methods.archive = function(archivedBy) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedBy;
  return this.save();
};

// Restore task
taskSchema.methods.restore = function() {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Static Methods
 */

// Find tasks by workspace
taskSchema.statics.findByWorkspace = function(workspaceId, filters = {}) {
  return this.find({
    workspace: workspaceId,
    isArchived: false,
    ...filters
  }).populate('assignedTo createdBy', 'firstName lastName email')
    .populate('workspace', 'name type');
};

// Find key tasks for manager meetings
taskSchema.statics.findKeyTasks = function(workspaceId, userId = null) {
  const query = {
    workspace: workspaceId,
    isKeyTask: true,
    isArchived: false,
    status: { $ne: 'cancelled' }
  };
  
  if (userId) {
    query.$or = [
      { createdBy: userId },
      { assignedTo: userId }
    ];
  }
  
  return this.find(query)
    .populate('assignedTo createdBy', 'firstName lastName email')
    .sort({ priority: -1, dueDate: 1 });
};

// Find overdue tasks
taskSchema.statics.findOverdue = function(workspaceId = null) {
  const query = {
    dueDate: { $lt: new Date() },
    status: { $nin: ['done', 'cancelled'] },
    isArchived: false
  };
  
  if (workspaceId) {
    query.workspace = workspaceId;
  }
  
  return this.find(query)
    .populate('assignedTo createdBy workspace', 'firstName lastName email name');
};

// Find tasks by user
taskSchema.statics.findByUser = function(userId, workspaceId = null) {
  const query = {
    $or: [
      { createdBy: userId },
      { assignedTo: userId }
    ],
    isArchived: false
  };
  
  if (workspaceId) {
    query.workspace = workspaceId;
  }
  
  return this.find(query)
    .populate('workspace', 'name type color')
    .sort({ lastActivityAt: -1 });
};

// Create the model
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;