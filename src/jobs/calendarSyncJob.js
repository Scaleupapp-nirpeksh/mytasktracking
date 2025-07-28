// src/jobs/calendarSyncJob.js

const { google } = require('googleapis');
const cron = require('node-cron');
const User = require('../api/models/userModel');
const Task = require('../api/models/taskModel');
const googleService = require('../services/googleCalendarService');
const logger = require('../utils/logger');

/**
 * Syncs changes from Google Calendar back to Keystone tasks.
 *
 * This function iterates through all users with a Google refresh token,
 * fetches recently updated calendar events, and updates the corresponding
 * tasks in Keystone if their due date has changed.
 */
const syncGoogleCalendarChanges = async () => {
  logger.info('Running cron job: Syncing Google Calendar changes...');

  // 1. Find all users who have connected their Google account
  const usersToSync = await User.find({
    googleRefreshToken: { $ne: null },
  }).select('+googleRefreshToken');

  if (usersToSync.length === 0) {
    logger.info('Cron job finished: No users with Google Calendar integration found.');
    return;
  }

  // 2. Process each user
  for (const user of usersToSync) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });

      // Check for events updated in the last 15 minutes to avoid overlap
      const fifteenMinutesAgo = new Date(new Date().getTime() - 15 * 60 * 1000);
      const updatedEvents = await googleService.getUpdatedEvents(oauth2Client, fifteenMinutesAgo);

      if (updatedEvents.length === 0) continue;

      // 3. Process each updated event
      for (const event of updatedEvents) {
        if (!event.start?.dateTime) continue; // Skip all-day events or events without a start time

        const task = await Task.findOne({ googleEventId: event.id, user: user._id });

        if (task) {
          const eventDate = new Date(event.start.dateTime);
          // Check if the due date in our DB is different from the event start time
          if (task.dueDate.getTime() !== eventDate.getTime()) {
            task.dueDate = eventDate;
            await task.save();
            logger.info(`Synced task "${task.title}" due date for user ${user.email}.`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to sync calendar for user ${user.email}:`, error.message);
    }
  }
  logger.info('Cron job finished: Google Calendar sync complete.');
};

/**
 * Initializes and schedules the cron job for syncing calendar changes.
 * This job is scheduled to run every 15 minutes.
 */
const initializeCalendarSync = () => {
  logger.info('Initializing Google Calendar sync cron job...');

  const calendarSyncJob = cron.schedule(
    '*/15 * * * *', // Run every 15 minutes
    () => {
      logger.info('Scheduler triggered: Starting Google Calendar sync job.');
      syncGoogleCalendarChanges();
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  calendarSyncJob.start();
  logger.info('Google Calendar sync job has been scheduled to run every 15 minutes.');
};

module.exports = initializeCalendarSync;
