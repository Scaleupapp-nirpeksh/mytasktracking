/**
 * Manager Meeting Model
 * 
 * MongoDB schema for tracking manager meeting sessions:
 * - Complete meeting history and records
 * - Action items and outcomes tracking
 * - Task discussion history
 * - Meeting preparation and follow-up
 * - Progress tracking between meetings
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Task Discussion Schema for tasks covered in meeting
 */
const taskDiscussionSchema = new Schema({
  task: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  
  statusAtMeeting: {
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
  
  timeSpentSinceLastMeeting: {
    type: Number, // minutes
    min: 0,
    default: 0
  },
  
  keyUpdates: {
    type: String,
    trim: true,
    maxlength: [1000, 'Key updates cannot exceed 1000 characters']
  },
  
  challengesFaced: {
    type: String,
    trim: true,
    maxlength: [1000, 'Challenges cannot exceed 1000 characters']
  },
  
  helpNeeded: {
    type: String,
    trim: true,
    maxlength: [500, 'Help needed cannot exceed 500 characters']
  },
  
  managerFeedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Manager feedback cannot exceed 1000 characters']
  },
  
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
  
  discussionOrder: {
    type: Number,
    default: 0
  }
}, { _id: true });

/**
 * Action Item Schema for meeting outcomes
 */
const actionItemSchema = new Schema({
  item: {
    type: String,
    required: [true, 'Action item description is required'],
    trim: true,
    maxlength: [300, 'Action item cannot exceed 300 characters']
  },
  
  relatedTask: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  dueDate: {
    type: Date,
    default: null
  },
  
  category: {
    type: String,
    enum: ['task_related', 'process_improvement', 'skill_development', 'communication', 'other'],
    default: 'task_related'
  },
  
  isCompleted: {
    type: Boolean,
    default: false
  },
  
  completedAt: {
    type: Date,
    default: null
  },
  
  completionNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Completion notes cannot exceed 500 characters']
  }
}, { _id: true });

/**
 * Blocker/Challenge Schema for meeting discussion
 */
const blockerSchema = new Schema({
  description: {
    type: String,
    required: [true, 'Blocker description is required'],
    trim: true,
    maxlength: [500, 'Blocker description cannot exceed 500 characters']
  },
  
  relatedTask: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  
  type: {
    type: String,
    enum: ['technical', 'resource', 'knowledge', 'process', 'external_dependency', 'other'],
    default: 'other'
  },
  
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  impact: {
    type: String,
    trim: true,
    maxlength: [300, 'Impact description cannot exceed 300 characters']
  },
  
  proposedSolution: {
    type: String,
    trim: true,
    maxlength: [500, 'Proposed solution cannot exceed 500 characters']
  },
  
  managerGuidance: {
    type: String,
    trim: true,
    maxlength: [500, 'Manager guidance cannot exceed 500 characters']
  },
  
  isResolved: {
    type: Boolean,
    default: false
  },
  
  resolvedAt: {
    type: Date,
    default: null
  },
  
  resolution: {
    type: String,
    trim: true,
    maxlength: [500, 'Resolution cannot exceed 500 characters']
  }
}, { _id: true });

/**
 * Meeting Metrics Schema for tracking productivity
 */
const meetingMetricsSchema = new Schema({
  tasksCompleted: {
    type: Number,
    min: 0,
    default: 0
  },
  
  tasksPreviouslyBlocked: {
    type: Number,
    min: 0,
    default: 0
  },
  
  newTasksCreated: {
    type: Number,
    min: 0,
    default: 0
  },
  
  overallProductivity: {
    type: String,
    enum: ['excellent', 'good', 'average', 'below_average', 'poor'],
    default: 'average'
  },
  
  focusAreas: [{
    area: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Focus area cannot exceed 100 characters']
    },
    progress: {
      type: String,
      enum: ['excellent', 'good', 'needs_improvement'],
      default: 'good'
    }
  }],
  
  timeAllocation: {
    developmentWork: { type: Number, min: 0, max: 100, default: 0 }, // percentage
    meetings: { type: Number, min: 0, max: 100, default: 0 },
    research: { type: Number, min: 0, max: 100, default: 0 },
    documentation: { type: Number, min: 0, max: 100, default: 0 },
    other: { type: Number, min: 0, max: 100, default: 0 }
  }
}, { _id: false });

/**
 * Main Manager Meeting Schema
 */
const managerMeetingSchema = new Schema({
  // Basic Meeting Information
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Meeting must belong to a user'],
    index: true
  },
  
  workspace: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: [true, 'Meeting must belong to company workspace'],
    index: true
  },
  
  meetingDate: {
    type: Date,
    required: [true, 'Meeting date is required'],
    index: true
  },
  
  meetingType: {
    type: String,
    enum: ['weekly', 'bi_weekly', 'monthly', 'quarterly', 'project_review', 'performance_review', 'adhoc'],
    default: 'weekly',
    index: true
  },
  
  duration: {
    type: Number, // Duration in minutes
    min: 15,
    max: 180,
    default: 30
  },
  
  // Meeting Structure
  agenda: {
    type: String,
    trim: true,
    maxlength: [2000, 'Agenda cannot exceed 2000 characters']
  },
  
  meetingObjectives: [{
    objective: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Objective cannot exceed 200 characters']
    },
    achieved: {
      type: Boolean,
      default: false
    }
  }],
  
  // Task Discussions
  tasksDiscussed: [taskDiscussionSchema],
  
  keyTasksReviewed: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }],
  
  // Meeting Content
  userPreparationNotes: {
    type: String,
    trim: true,
    maxlength: [3000, 'Preparation notes cannot exceed 3000 characters']
  },
  
  accomplishments: {
    type: String,
    trim: true,
    maxlength: [2000, 'Accomplishments cannot exceed 2000 characters']
  },
  
  challengesDiscussed: [blockerSchema],
  
  managerFeedbackGeneral: {
    type: String,
    trim: true,
    maxlength: [2000, 'General manager feedback cannot exceed 2000 characters']
  },
  
  actionItems: [actionItemSchema],
  
  // Follow-up and Planning
  nextMeetingDate: {
    type: Date,
    index: true
  },
  
  nextMeetingFocus: {
    type: String,
    trim: true,
    maxlength: [1000, 'Next meeting focus cannot exceed 1000 characters']
  },
  
  followUpRequired: {
    type: Boolean,
    default: false
  },
  
  followUpItems: [{
    item: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Follow-up item cannot exceed 200 characters']
    },
    dueDate: {
      type: Date,
      required: true
    },
    isCompleted: {
      type: Boolean,
      default: false
    }
  }],
  
  // Meeting Outcomes
  meetingRating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3 // 1=Poor, 2=Below Average, 3=Average, 4=Good, 5=Excellent
  },
  
  meetingNotes: {
    type: String,
    trim: true,
    maxlength: [3000, 'Meeting notes cannot exceed 3000 characters']
  },
  
  keyDecisions: [{
    decision: {
      type: String,
      required: true,
      trim: true,
      maxlength: [300, 'Decision cannot exceed 300 characters']
    },
    impact: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    relatedTasks: [{
      type: Schema.Types.ObjectId,
      ref: 'Task'
    }]
  }],
  
  // Metrics and Analytics
  metrics: meetingMetricsSchema,
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled',
    index: true
  },
  
  completedAt: {
    type: Date,
    default: null
  },
  
  isArchived: {
    type: Boolean,
    default: false,
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

// Meeting summary
managerMeetingSchema.virtual('meetingSummary').get(function() {
  return {
    tasksDiscussed: this.tasksDiscussed.length,
    actionItemsCreated: this.actionItems.length,
    blockersIdentified: this.challengesDiscussed.length,
    keyDecisions: this.keyDecisions.length,
    rating: this.meetingRating
  };
});

// Action items completion rate
managerMeetingSchema.virtual('actionItemsCompletionRate').get(function() {
  if (this.actionItems.length === 0) return 0;
  const completed = this.actionItems.filter(item => item.isCompleted).length;
  return Math.round((completed / this.actionItems.length) * 100);
});

// Meeting effectiveness score
managerMeetingSchema.virtual('effectivenessScore').get(function() {
  let score = 0;
  
  // Base score from rating
  score += (this.meetingRating / 5) * 40;
  
  // Action items completion bonus
  score += (this.actionItemsCompletionRate / 100) * 30;
  
  // Task progress bonus
  if (this.tasksDiscussed.length > 0) {
    const avgProgress = this.tasksDiscussed.reduce((sum, task) => sum + task.progressPercentage, 0) / this.tasksDiscussed.length;
    score += (avgProgress / 100) * 20;
  }
  
  // Follow-up completion bonus
  if (this.followUpItems.length > 0) {
    const completedFollowUps = this.followUpItems.filter(item => item.isCompleted).length;
    score += ((completedFollowUps / this.followUpItems.length) * 10);
  } else {
    score += 10; // No follow-ups needed
  }
  
  return Math.round(Math.min(score, 100));
});

/**
 * Indexes for Performance
 */
managerMeetingSchema.index({ user: 1, meetingDate: -1 });
managerMeetingSchema.index({ workspace: 1, meetingDate: -1 });
managerMeetingSchema.index({ user: 1, status: 1 });
managerMeetingSchema.index({ meetingType: 1, meetingDate: -1 });
managerMeetingSchema.index({ nextMeetingDate: 1 });
managerMeetingSchema.index({ 'actionItems.dueDate': 1, 'actionItems.isCompleted': 1 });

/**
 * Pre-save Middleware
 */
managerMeetingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-complete meeting if all objectives are achieved
  if (this.status === 'in_progress' && this.meetingObjectives.length > 0) {
    const allAchieved = this.meetingObjectives.every(obj => obj.achieved);
    if (allAchieved && !this.completedAt) {
      this.status = 'completed';
      this.completedAt = new Date();
    }
  }
  
  // Calculate metrics if meeting is completed
  if (this.status === 'completed' && this.tasksDiscussed.length > 0) {
    this.metrics.tasksCompleted = this.tasksDiscussed.filter(
      task => task.statusAtMeeting === 'done'
    ).length;
    
    this.metrics.tasksPreviouslyBlocked = this.tasksDiscussed.filter(
      task => this.challengesDiscussed.some(challenge => 
        challenge.relatedTask && challenge.relatedTask.toString() === task.task.toString()
      )
    ).length;
  }
  
  next();
});

/**
 * Instance Methods
 */

// Add task discussion
managerMeetingSchema.methods.addTaskDiscussion = function(taskData) {
  this.tasksDiscussed.push({
    task: taskData.taskId,
    statusAtMeeting: taskData.status,
    progressPercentage: taskData.progress || 0,
    timeSpentSinceLastMeeting: taskData.timeSpent || 0,
    keyUpdates: taskData.keyUpdates || '',
    challengesFaced: taskData.challenges || '',
    helpNeeded: taskData.helpNeeded || '',
    managerFeedback: taskData.managerFeedback || '',
    priorityChange: taskData.priorityChange || null,
    nextSteps: taskData.nextSteps || '',
    discussionOrder: this.tasksDiscussed.length
  });
  
  return this.save();
};

// Add action item
managerMeetingSchema.methods.addActionItem = function(item, relatedTaskId = null, priority = 'medium', dueDate = null) {
  this.actionItems.push({
    item: item.trim(),
    relatedTask: relatedTaskId,
    priority,
    dueDate,
    category: relatedTaskId ? 'task_related' : 'other'
  });
  
  return this.save();
};

// Add blocker/challenge
managerMeetingSchema.methods.addChallenge = function(challengeData) {
  this.challengesDiscussed.push({
    description: challengeData.description,
    relatedTask: challengeData.relatedTaskId || null,
    type: challengeData.type || 'other',
    severity: challengeData.severity || 'medium',
    impact: challengeData.impact || '',
    proposedSolution: challengeData.proposedSolution || '',
    managerGuidance: challengeData.managerGuidance || ''
  });
  
  return this.save();
};

// Complete action item
managerMeetingSchema.methods.completeActionItem = function(actionItemId, completionNotes = '') {
  const actionItem = this.actionItems.id(actionItemId);
  if (!actionItem) {
    throw new Error('Action item not found');
  }
  
  actionItem.isCompleted = true;
  actionItem.completedAt = new Date();
  actionItem.completionNotes = completionNotes.trim();
  
  return this.save();
};

// Resolve challenge
managerMeetingSchema.methods.resolveChallenge = function(challengeId, resolution) {
  const challenge = this.challengesDiscussed.id(challengeId);
  if (!challenge) {
    throw new Error('Challenge not found');
  }
  
  challenge.isResolved = true;
  challenge.resolvedAt = new Date();
  challenge.resolution = resolution.trim();
  
  return this.save();
};

// Complete meeting
managerMeetingSchema.methods.completeMeeting = function(rating = 3, notes = '') {
  this.status = 'completed';
  this.completedAt = new Date();
  this.meetingRating = rating;
  if (notes) {
    this.meetingNotes = notes.trim();
  }
  
  return this.save();
};

// Archive meeting
managerMeetingSchema.methods.archive = function() {
  this.isArchived = true;
  return this.save();
};

/**
 * Static Methods
 */

// Find meetings by user
managerMeetingSchema.statics.findByUser = function(userId, limit = 10) {
  return this.find({
    user: userId,
    isArchived: false
  }).populate('workspace', 'name type')
    .populate('tasksDiscussed.task', 'title status priority')
    .sort({ meetingDate: -1 })
    .limit(limit);
};

// Find upcoming meetings
managerMeetingSchema.statics.findUpcoming = function(userId, days = 30) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return this.find({
    user: userId,
    meetingDate: { $gte: startDate, $lte: endDate },
    status: { $in: ['scheduled', 'in_progress'] },
    isArchived: false
  }).populate('workspace', 'name type')
    .sort({ meetingDate: 1 });
};

// Get meeting history for task
managerMeetingSchema.statics.findMeetingsForTask = function(taskId) {
  return this.find({
    'tasksDiscussed.task': taskId,
    isArchived: false
  }).populate('user', 'firstName lastName')
    .populate('workspace', 'name type')
    .sort({ meetingDate: -1 });
};

// Get latest meeting for user
managerMeetingSchema.statics.findLatestMeeting = function(userId, workspaceId) {
  return this.findOne({
    user: userId,
    workspace: workspaceId,
    status: 'completed',
    isArchived: false
  }).populate('workspace', 'name type')
    .populate('tasksDiscussed.task', 'title status priority')
    .sort({ meetingDate: -1 });
};

// Get pending action items across meetings
managerMeetingSchema.statics.findPendingActionItems = function(userId) {
  return this.aggregate([
    {
      $match: {
        user: userId,
        'actionItems.isCompleted': false,
        isArchived: false
      }
    },
    {
      $unwind: '$actionItems'
    },
    {
      $match: {
        'actionItems.isCompleted': false
      }
    },
    {
      $project: {
        meetingDate: 1,
        actionItem: '$actionItems',
        workspace: 1
      }
    },
    {
      $sort: {
        'actionItem.dueDate': 1,
        meetingDate: -1
      }
    }
  ]);
};

// Get meeting analytics
managerMeetingSchema.statics.getMeetingAnalytics = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        user: userId,
        meetingDate: { $gte: startDate, $lte: endDate },
        status: 'completed',
        isArchived: false
      }
    },
    {
      $group: {
        _id: null,
        totalMeetings: { $sum: 1 },
        averageRating: { $avg: '$meetingRating' },
        totalActionItems: { $sum: { $size: '$actionItems' } },
        totalTasksDiscussed: { $sum: { $size: '$tasksDiscussed' } },
        averageEffectiveness: { $avg: '$effectivenessScore' }
      }
    }
  ]);
};

// Create the model
const ManagerMeeting = mongoose.model('ManagerMeeting', managerMeetingSchema);

module.exports = ManagerMeeting;