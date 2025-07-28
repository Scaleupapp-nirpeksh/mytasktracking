// src/jobs/recurringTaskJob.js

const cron = require('node-cron');
const { addDays, addWeeks, addMonths } = require('date-fns');
const Task = require('../api/models/taskModel');
const logger = require('../utils/logger');

/**
 * Calculates the next due date for a recurring task based on its frequency.
 * @param {Date} currentDueDate The last due date.
 * @param {object} recurringRule The recurring rule object from the task.
 * @returns {Date} The next due date.
 */
const calculateNextDueDate = (currentDueDate, recurringRule) => {
  const { frequency, interval } = recurringRule;
  switch (frequency) {
    case 'daily':
      return addDays(currentDueDate, interval);
    case 'weekly':
      return addWeeks(currentDueDate, interval);
    case 'monthly':
      return addMonths(currentDueDate, interval);
    default:
      // Default to adding one day if frequency is unknown
      return addDays(currentDueDate, 1);
  }
};

/**
 * Finds recurring task templates that are due and creates new task instances from them.
 */
const processRecurringTasks = async () => {
  logger.info('Running cron job: Processing recurring tasks...');
  const now = new Date();

  // Find all templates where the next due date is today or in the past
  const templatesToProcess = await Task.find({
    isRecurringTemplate: true,
    'recurring.nextDueDate': { $lte: now },
  });

  if (templatesToProcess.length === 0) {
    logger.info('Cron job finished: No recurring tasks to process.');
    return;
  }

  for (const template of templatesToProcess) {
    try {
      // 1. Create a new task instance from the template
      const newTask = new Task({
        ...template.toObject(), // Copy all fields from the template
        _id: undefined, // Ensure a new ID is generated
        isRecurringTemplate: false, // This is an instance, not a template
        dueDate: template.recurring.nextDueDate, // Set the due date for this instance
        status: 'To Do', // Reset status to 'To Do'
        recurring: undefined, // Remove recurring info from the instance
        googleEventId: undefined, // Ensure it gets a new calendar event if needed
      });
      await newTask.save();
      logger.info(`Created new recurring task instance: "${newTask.title}"`);

      // 2. Calculate the next due date for the template
      const nextDueDate = calculateNextDueDate(
        template.recurring.nextDueDate,
        template.recurring
      );

      // 3. Update the template with the new nextDueDate
      // Check if the recurrence should end
      if (template.recurring.endDate && nextDueDate > template.recurring.endDate) {
        // If the next date is past the end date, we can remove the recurring rule
        // or simply deactivate the template. For now, we'll remove it.
        await Task.findByIdAndDelete(template._id);
        logger.info(`Recurring task template "${template.title}" has ended and was removed.`);
      } else {
        template.recurring.nextDueDate = nextDueDate;
        await template.save();
      }
    } catch (error) {
      logger.error(`Failed to process recurring template ${template._id}:`, error);
    }
  }
  logger.info('Cron job finished: Recurring task processing complete.');
};

/**
 * Initializes and schedules the cron job for processing recurring tasks.
 * This job is scheduled to run once a day at 1:00 AM IST.
 */
const initializeRecurringTaskJob = () => {
  logger.info('Initializing recurring task cron job...');

  const recurringTaskJob = cron.schedule(
    '0 1 * * *', // Run every day at 1:00 AM
    () => {
      logger.info('Scheduler triggered: Starting recurring task processing job.');
      processRecurringTasks();
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  recurringTaskJob.start();
  logger.info('Recurring task job has been scheduled to run daily at 1:00 AM IST.');
};

module.exports = initializeRecurringTaskJob;
