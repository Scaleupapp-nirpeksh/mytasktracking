// src/services/googleCalendarService.js

const { google } = require('googleapis');
const logger = require('../utils/logger');

// 1. Create a new OAuth2 client with the credentials from environment variables.
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 2. Define the scopes required by the application.
const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Generates the URL that the user will visit to authorize the application.
 */
exports.generateAuthUrl = (userId) => {
  logger.info(`Generating Google Auth URL for user: ${userId}`);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,
    prompt: 'consent',
  });
  return url;
};

/**
 * Exchanges an authorization code for access and refresh tokens.
 */
exports.getTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  logger.info('Successfully exchanged authorization code for tokens.');
  return tokens;
};

/**
 * Creates a new event in the user's primary Google Calendar.
 */
exports.createCalendarEvent = async (authClient, eventDetails) => {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const event = {
    summary: eventDetails.title,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.dueDate,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: new Date(new Date(eventDetails.dueDate).getTime() + 60 * 60 * 1000).toISOString(),
      timeZone: 'Asia/Kolkata',
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  logger.info(`Event created: ${response.data.htmlLink}`);
  return response.data;
};

/**
 * Updates an existing event in the user's primary Google Calendar.
 */
exports.updateCalendarEvent = async (authClient, eventId, eventDetails) => {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const event = {
    summary: eventDetails.title,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.dueDate,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: new Date(new Date(eventDetails.dueDate).getTime() + 60 * 60 * 1000).toISOString(),
      timeZone: 'Asia/Kolkata',
    },
  };

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    resource: event,
  });

  logger.info(`Event updated: ${response.data.htmlLink}`);
  return response.data;
};

/**
 * Deletes an event from the user's primary Google Calendar.
 */
exports.deleteCalendarEvent = async (authClient, eventId) => {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });
  logger.info(`Event deleted: ${eventId}`);
};

/**
 * Fetches events that have been updated since a specified time.
 * @param {object} authClient An authorized OAuth2 client.
 * @param {Date} updatedSince The date to check for updates from.
 * @returns {Promise<Array>} A promise that resolves with a list of updated events.
 */
exports.getUpdatedEvents = async (authClient, updatedSince) => {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const response = await calendar.events.list({
    calendarId: 'primary',
    updatedMin: updatedSince.toISOString(),
    showDeleted: false,
    singleEvents: true,
  });

  return response.data.items;
};


/**
 * Sets the credentials on the main OAuth2 client instance.
 */
exports.setCredentials = (tokens) => {
  oauth2Client.setCredentials(tokens);
};
