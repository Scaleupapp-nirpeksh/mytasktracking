// src/services/notificationService.js

const Task = require('../api/models/taskModel');
const logger = require('../utils/logger');

/**
 * Checks all tasks in the database and logs notifications for tasks
 * that are overdue or due soon. This function is designed to be called
 * by a scheduled cron job.
 */
const checkTaskDeadlines = async () => {
  logger.info('Running cron job: Checking task deadlines...');

  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0));
  const todayEnd = new Date(now.setHours(23, 59, 59, 999));

  try {
    // Find all tasks that are not 'Done' and have a due date.
    const relevantTasks = await Task.find({
      status: { $ne: 'Done' },
      dueDate: { $ne: null },
    }).populate('user', 'name email'); // Populate user info for notifications

    if (relevantTasks.length === 0) {
      logger.info('Cron job finished: No relevant tasks found.');
      return;
    }

    const notifications = {}; // Group notifications by user ID

    relevantTasks.forEach(task => {
      const userId = task.user._id.toString();
      if (!notifications[userId]) {
        notifications[userId] = {
          user: task.user,
          overdue: 0,
          dueToday: 0,
        };
      }

      const dueDate = new Date(task.dueDate);

      if (dueDate < todayStart) {
        notifications[userId].overdue += 1;
      } else if (dueDate >= todayStart && dueDate <= todayEnd) {
        notifications[userId].dueToday += 1;
      }
    });

    // Log the summary for each user
    for (const userId in notifications) {
      const { user, overdue, dueToday } = notifications[userId];
      if (overdue > 0 || dueToday > 0) {
        logger.info(
          `Notification for user ${user.name} (${user.email}): ${overdue} task(s) overdue, ${dueToday} task(s) due today.`
        );
      }
    }
    logger.info('Cron job finished: Task deadline check complete.');
  } catch (error) {
    logger.error('Error during task deadline check cron job:', error);
  }
};

module.exports = {
  checkTaskDeadlines,
};
