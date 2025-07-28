// src/jobs/taskNotifierJob.js

const cron = require('node-cron');
const { checkTaskDeadlines } = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * Initializes and schedules the cron job for checking task deadlines.
 *
 * This job is configured to run once every day at 7:00 AM according to the
 * 'Asia/Kolkata' timezone, which corresponds to Indian Standard Time (IST).
 */
const initializeTaskNotifier = () => {
  logger.info('Initializing task notifier cron job...');

  // Cron expression '0 7 * * *' means:
  // - 0: at the 0th minute
  // - 7: of the 7th hour (7 AM)
  // - *: every day of the month
  // - *: every month
  // - *: every day of the week
  const taskNotifierJob = cron.schedule(
    '0 7 * * *',
    () => {
      logger.info('Scheduler triggered by cron expression: Starting the checkTaskDeadlines job.');
      checkTaskDeadlines();
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata', // Set the timezone to IST
    }
  );

  // Start the scheduled job
  taskNotifierJob.start();

  logger.info('Task notifier cron job has been scheduled successfully for 7:00 AM IST.');
};

module.exports = initializeTaskNotifier;
