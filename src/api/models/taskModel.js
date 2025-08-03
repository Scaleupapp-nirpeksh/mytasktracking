// src/api/models/taskModel.js

const mongoose = require('mongoose');

/**
 * Sub-task Schema Definition
 */
const subTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
});

/**
 * Attachment Schema Definition
 */
const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileKey: { type: String, required: true },
  fileSize: { type: Number },
  contentType: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

/**
 * Note Schema Definition
 */
const noteSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Note content is required'],
    trim: true,
  },
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Note must have an author'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
});

/**
 * History/Activity Log Schema Definition
 */
const historySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'created',
      'updated',
      'status_changed',
      'priority_changed',
      'due_date_changed',
      'note_added',
      'note_updated',
      'note_deleted',
      'attachment_added',
      'attachment_removed',
      'subtask_added',
      'subtask_updated',
      'subtask_deleted',
      'completed',
      'reopened',
      'assigned',
      'unassigned'
    ],
  },
  field: {
    type: String, // The field that was changed (e.g., 'title', 'status', 'priority')
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed, // Can store any type of data
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed, // Can store any type of data
  },
  description: {
    type: String, // Human-readable description of the change
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'History entry must have a user'],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Additional data for specific actions
  },
});

/**
 * Recurring Rule Schema Definition
 */
const recurringSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true,
  },
  interval: {
    type: Number,
    default: 1,
    min: 1,
  },
  nextDueDate: {
    type: Date,
    required: true,
  },
  endDate: Date,
}, { _id: false }); // _id is not needed for this sub-document

/**
 * Task Schema Definition
 */
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'A task must have a title.'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['To Do', 'In Progress', 'Blocked', 'For Review', 'Done'],
    default: 'To Do',
  },
  priority: {
    type: String,
    required: true,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
  },
  dueDate: {
    type: Date,
  },
  isKeyTask: {
    type: Boolean,
    default: false,
  },
  tags: [String],
  subTasks: [subTaskSchema],
  attachments: [attachmentSchema],
  links: [String],
  
  // --- Notes and History Fields ---
  notes: [noteSchema],
  history: [historySchema],
  
  workspace: {
    type: mongoose.Schema.ObjectId,
    ref: 'Workspace',
    required: [true, 'A task must belong to a workspace.'],
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A task must be assigned to a user.'],
  },
  googleEventId: {
    type: String,
    select: false,
  },
  // --- Recurring Task Fields ---
  isRecurringTemplate: {
    type: Boolean,
    default: false,
  },
  recurring: {
    type: recurringSchema,
    required: false, // This field will only exist on recurring templates
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// --- Indexes ---
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ workspace: 1, dueDate: 1 });
taskSchema.index({ title: 'text', description: 'text' });
// Index for the cron job to efficiently find templates
taskSchema.index({ isRecurringTemplate: 1, 'recurring.nextDueDate': 1 });
// Index for notes and history queries
taskSchema.index({ 'notes.createdAt': -1 });
taskSchema.index({ 'history.timestamp': -1 });

// --- Virtuals ---

// Virtual for getting recent notes (last 5)
taskSchema.virtual('recentNotes').get(function() {
  if (!this.notes || this.notes.length === 0) return [];
  return this.notes
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
});

// Virtual for getting recent history (last 10)
taskSchema.virtual('recentHistory').get(function() {
  if (!this.history || this.history.length === 0) return [];
  return this.history
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
});

// --- Middleware ---

// Pre-save middleware to update note's updatedAt when modified
noteSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    this.updatedAt = new Date();
    this.isEdited = true;
  }
  next();
});

// Pre-save middleware to track changes and create history entries
taskSchema.pre('save', function(next) {
  if (this.isNew) {
    // Task is being created
    this.history.push({
      action: 'created',
      description: `Task "${this.title}" was created`,
      user: this.user,
      timestamp: new Date(),
    });
  } else if (this.isModified()) {
    // Task is being updated
    const modifiedPaths = this.modifiedPaths();
    const user = this.user; // Assuming user context is available
    
    modifiedPaths.forEach(path => {
      // Skip certain paths that shouldn't create history entries
      if (['updatedAt', 'history', '__v'].includes(path)) return;
      
      let action = 'updated';
      let description = `Field "${path}" was updated`;
      
      // Handle specific field changes
      switch (path) {
        case 'status':
          action = 'status_changed';
          description = `Status changed from "${this._original?.status || 'unknown'}" to "${this.status}"`;
          break;
        case 'priority':
          action = 'priority_changed';
          description = `Priority changed from "${this._original?.priority || 'unknown'}" to "${this.priority}"`;
          break;
        case 'dueDate':
          action = 'due_date_changed';
          description = `Due date changed to ${this.dueDate ? this.dueDate.toDateString() : 'none'}`;
          break;
        case 'title':
          description = `Title changed from "${this._original?.title || 'unknown'}" to "${this.title}"`;
          break;
        case 'description':
          description = `Description was updated`;
          break;
      }
      
      this.history.push({
        action,
        field: path,
        oldValue: this._original?.[path],
        newValue: this[path],
        description,
        user: user,
        timestamp: new Date(),
      });
    });
  }
  next();
});

// Post-init middleware to store original values for comparison
taskSchema.post('init', function() {
  this._original = this.toObject();
});

// --- Model Creation ---
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;