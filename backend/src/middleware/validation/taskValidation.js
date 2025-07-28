/**
 * Task Validation Middleware
 * 
 * Comprehensive input validation for task-related operations:
 * - Task creation and update validation
 * - Subtask management validation
 * - Comment and attachment validation
 * - Recurring task pattern validation
 * - Manager feedback validation
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const Joi = require('joi');
const mongoose = require('mongoose');
const { ValidationError, catchAsync } = require('../error');
const { logger } = require('../../utils/logger/logger');

/**
 * Joi validation options
 */
const joiOptions = {
  abortEarly: false, // Return all validation errors
  allowUnknown: false, // Don't allow unknown fields
  stripUnknown: true // Remove unknown fields from validated data
};

/**
 * Custom Joi validators
 */

// ObjectId validator
const objectIdValidator = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation').messages({
  'any.invalid': '{{#label}} must be a valid ObjectId'
});

// Date validator that accepts both Date objects and ISO strings
const dateValidator = Joi.alternatives().try(
  Joi.date(),
  Joi.string().isoDate()
).messages({
  'alternatives.match': '{{#label}} must be a valid date or ISO date string'
});

// URL validator
const urlValidator = Joi.string().uri({
  scheme: ['http', 'https']
}).messages({
  'string.uri': '{{#label}} must be a valid URL'
});

/**
 * Validation Schemas
 */

// Base task schema for creation
const createTaskSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Task title is required',
      'string.min': 'Task title must be at least 1 character',
      'string.max': 'Task title cannot exceed 200 characters'
    }),
    
  description: Joi.string()
    .trim()
    .max(5000)
    .allow('')
    .messages({
      'string.max': 'Task description cannot exceed 5000 characters'
    }),
    
  workspaceId: objectIdValidator.required(),
  
  category: Joi.string()
    .trim()
    .max(50)
    .allow('')
    .messages({
      'string.max': 'Category cannot exceed 50 characters'
    }),
    
  tags: Joi.array()
    .items(
      Joi.string()
        .trim()
        .max(30)
        .lowercase()
        .messages({
          'string.max': 'Tag cannot exceed 30 characters'
        })
    )
    .max(10)
    .messages({
      'array.max': 'Cannot have more than 10 tags'
    }),
    
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'urgent')
    .default('medium'),
    
  status: Joi.string()
    .valid('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled')
    .default('todo'),
    
  isKeyTask: Joi.boolean().default(false),
  
  assignedTo: objectIdValidator.allow(null),
  
  dueDate: dateValidator.allow(null),
  
  startDate: dateValidator.allow(null),
  
  estimatedDuration: Joi.number()
    .min(0)
    .max(10080) // Max 1 week in minutes
    .allow(null)
    .messages({
      'number.min': 'Estimated duration cannot be negative',
      'number.max': 'Estimated duration cannot exceed 1 week (10080 minutes)'
    }),
    
  // Recurrence settings
  recurrence: Joi.object({
    isRecurring: Joi.boolean().default(false),
    pattern: Joi.string()
      .valid('daily', 'weekly', 'monthly', 'yearly', 'custom')
      .when('isRecurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.allow(null)
      }),
    interval: Joi.number()
      .min(1)
      .max(365)
      .default(1)
      .messages({
        'number.min': 'Interval must be at least 1',
        'number.max': 'Interval cannot exceed 365'
      }),
    daysOfWeek: Joi.array()
      .items(Joi.number().min(0).max(6))
      .max(7)
      .when('pattern', {
        is: 'weekly',
        then: Joi.required(),
        otherwise: Joi.allow(null)
      })
      .messages({
        'array.max': 'Cannot specify more than 7 days of week'
      }),
    endDate: dateValidator.allow(null),
    maxOccurrences: Joi.number()
      .min(1)
      .max(1000)
      .allow(null)
      .messages({
        'number.min': 'Max occurrences must be at least 1',
        'number.max': 'Max occurrences cannot exceed 1000'
      })
  }).default({}),
  
  parentTask: objectIdValidator.allow(null)
});

// Task update schema (all fields optional except those that should be validated)
const updateTaskSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .messages({
      'string.empty': 'Task title cannot be empty',
      'string.min': 'Task title must be at least 1 character',
      'string.max': 'Task title cannot exceed 200 characters'
    }),
    
  description: Joi.string()
    .trim()
    .max(5000)
    .allow('')
    .messages({
      'string.max': 'Task description cannot exceed 5000 characters'
    }),
    
  category: Joi.string()
    .trim()
    .max(50)
    .allow('')
    .messages({
      'string.max': 'Category cannot exceed 50 characters'
    }),
    
  tags: Joi.array()
    .items(
      Joi.string()
        .trim()
        .max(30)
        .lowercase()
        .messages({
          'string.max': 'Tag cannot exceed 30 characters'
        })
    )
    .max(10)
    .messages({
      'array.max': 'Cannot have more than 10 tags'
    }),
    
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'urgent'),
    
  status: Joi.string()
    .valid('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'),
    
  isKeyTask: Joi.boolean(),
  
  assignedTo: objectIdValidator.allow(null),
  
  dueDate: dateValidator.allow(null),
  
  startDate: dateValidator.allow(null),
  
  estimatedDuration: Joi.number()
    .min(0)
    .max(10080)
    .allow(null)
    .messages({
      'number.min': 'Estimated duration cannot be negative',
      'number.max': 'Estimated duration cannot exceed 1 week (10080 minutes)'
    }),
    
  progress: Joi.number()
    .min(0)
    .max(100)
    .messages({
      'number.min': 'Progress cannot be negative',
      'number.max': 'Progress cannot exceed 100'
    })
});

// Subtask validation schema
const subtaskSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Subtask title is required',
      'string.min': 'Subtask title must be at least 1 character',
      'string.max': 'Subtask title cannot exceed 200 characters'
    }),
    
  order: Joi.number()
    .min(0)
    .default(0)
    .messages({
      'number.min': 'Subtask order cannot be negative'
    })
});

// Comment validation schema
const commentSchema = Joi.object({
  content: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Comment content is required',
      'string.min': 'Comment must be at least 1 character',
      'string.max': 'Comment cannot exceed 1000 characters'
    })
});

// Link validation schema
const linkSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Link title is required',
      'string.min': 'Link title must be at least 1 character',
      'string.max': 'Link title cannot exceed 100 characters'
    }),
    
  url: urlValidator.required(),
  
  description: Joi.string()
    .trim()
    .max(200)
    .allow('')
    .messages({
      'string.max': 'Link description cannot exceed 200 characters'
    })
});

// Manager feedback validation schema
const managerFeedbackSchema = Joi.object({
  priorityFeedback: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .messages({
      'string.max': 'Priority feedback cannot exceed 1000 characters'
    }),
    
  nextMeetingDate: dateValidator.allow(null),
  
  actionItems: Joi.array()
    .items(
      Joi.object({
        item: Joi.string()
          .trim()
          .min(1)
          .max(200)
          .required()
          .messages({
            'string.empty': 'Action item is required',
            'string.max': 'Action item cannot exceed 200 characters'
          }),
        dueDate: dateValidator.allow(null)
      })
    )
    .max(20)
    .messages({
      'array.max': 'Cannot have more than 20 action items'
    }),
    
  blockers: Joi.array()
    .items(
      Joi.object({
        description: Joi.string()
          .trim()
          .min(1)
          .max(300)
          .required()
          .messages({
            'string.empty': 'Blocker description is required',
            'string.max': 'Blocker description cannot exceed 300 characters'
          }),
        severity: Joi.string()
          .valid('low', 'medium', 'high', 'critical')
          .default('medium')
      })
    )
    .max(10)
    .messages({
      'array.max': 'Cannot have more than 10 blockers'
    })
});

// Time log validation schema
const timeLogSchema = Joi.object({
  description: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Time log description cannot exceed 500 characters'
    })
});

// Task query/filter validation schema
const taskQuerySchema = Joi.object({
  status: Joi.alternatives().try(
    Joi.string().valid('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'),
    Joi.array().items(Joi.string().valid('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'))
  ),
  
  priority: Joi.alternatives().try(
    Joi.string().valid('low', 'medium', 'high', 'urgent'),
    Joi.array().items(Joi.string().valid('low', 'medium', 'high', 'urgent'))
  ),
  
  assignedTo: objectIdValidator,
  
  category: Joi.string().trim().max(50),
  
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ),
  
  isKeyTask: Joi.boolean(),
  
  dueDateFrom: dateValidator,
  dueDateTo: dateValidator,
  
  createdFrom: dateValidator,
  createdTo: dateValidator,
  
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(25),
  
  sortBy: Joi.string()
    .valid('title', 'priority', 'status', 'dueDate', 'createdAt', 'updatedAt', 'lastActivityAt')
    .default('lastActivityAt'),
    
  sortOrder: Joi.string()
    .valid('asc', 'desc', '1', '-1')
    .default('desc')
});

/**
 * Validation Middleware Functions
 */

// Generic validation middleware factory
const validate = (schema, source = 'body') => {
  return catchAsync(async (req, res, next) => {
    const data = req[source];
    
    try {
      const { error, value } = schema.validate(data, joiOptions);
      
      if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        
        logger.warn('Validation failed', {
          source,
          errors: error.details,
          data,
          userId: req.user?.id,
          path: req.originalUrl
        });
        
        return next(new ValidationError(errorMessage));
      }
      
      // Replace the original data with validated and sanitized data
      req[source] = value;
      next();
      
    } catch (err) {
      logger.error('Validation error', {
        error: err.message,
        schema: schema.describe(),
        data,
        userId: req.user?.id
      });
      
      return next(new ValidationError('Validation failed'));
    }
  });
};

// Custom validation for business logic
const validateTaskDates = catchAsync(async (req, res, next) => {
  const { startDate, dueDate } = req.body;
  
  if (startDate && dueDate) {
    const start = new Date(startDate);
    const due = new Date(dueDate);
    
    if (start > due) {
      return next(new ValidationError('Start date cannot be after due date'));
    }
  }
  
  // Check if due date is in the past (only for new tasks)
  if (dueDate && req.method === 'POST') {
    const due = new Date(dueDate);
    const now = new Date();
    
    if (due < now) {
      logger.warn('Task created with past due date', {
        dueDate,
        userId: req.user?.id,
        path: req.originalUrl
      });
      // Don't fail, just log the warning
    }
  }
  
  next();
});

// Validate recurrence pattern consistency
const validateRecurrence = catchAsync(async (req, res, next) => {
  const { recurrence } = req.body;
  
  if (!recurrence || !recurrence.isRecurring) {
    return next();
  }
  
  // Validate pattern-specific requirements
  if (recurrence.pattern === 'weekly' && (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0)) {
    return next(new ValidationError('Weekly recurrence requires at least one day of the week'));
  }
  
  // Validate end conditions
  if (recurrence.endDate && recurrence.maxOccurrences) {
    return next(new ValidationError('Cannot specify both end date and max occurrences'));
  }
  
  if (recurrence.endDate) {
    const endDate = new Date(recurrence.endDate);
    const now = new Date();
    
    if (endDate <= now) {
      return next(new ValidationError('Recurrence end date must be in the future'));
    }
  }
  
  next();
});

// Validate task assignment
const validateTaskAssignment = catchAsync(async (req, res, next) => {
  const { assignedTo } = req.body;
  const workspace = req.workspace;
  
  if (!assignedTo || !workspace) {
    return next();
  }
  
  // Check if assigned user is a member of the workspace
  const isWorkspaceMember = workspace.owner.toString() === assignedTo ||
                           workspace.members.some(member => 
                             member.user.toString() === assignedTo && 
                             member.status === 'active'
                           );
  
  if (!isWorkspaceMember) {
    return next(new ValidationError('Can only assign tasks to workspace members'));
  }
  
  next();
});

/**
 * Exported middleware functions
 */
module.exports = {
  // Schema validation
  validateCreateTask: validate(createTaskSchema, 'body'),
  validateUpdateTask: validate(updateTaskSchema, 'body'),
  validateSubtask: validate(subtaskSchema, 'body'),
  validateComment: validate(commentSchema, 'body'),
  validateLink: validate(linkSchema, 'body'),
  validateManagerFeedback: validate(managerFeedbackSchema, 'body'),
  validateTimeLog: validate(timeLogSchema, 'body'),
  validateTaskQuery: validate(taskQuerySchema, 'query'),
  
  // Business logic validation
  validateTaskDates,
  validateRecurrence,
  validateTaskAssignment,
  
  // Utility functions
  validate,
  objectIdValidator,
  dateValidator,
  urlValidator,
  
  // Schemas (for reuse in other modules)
  schemas: {
    createTaskSchema,
    updateTaskSchema,
    subtaskSchema,
    commentSchema,
    linkSchema,
    managerFeedbackSchema,
    timeLogSchema,
    taskQuerySchema
  }
};