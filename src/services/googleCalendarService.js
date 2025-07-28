// src/services/googleCalendarService.js

const { google } = require('googleapis');
const logger = require('../utils/logger');

// Validate environment variables at startup
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

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
  
  // Log configuration for debugging
  logger.info('OAuth Configuration:', {
    clientId: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 10)}...` : 'NOT SET',
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    scopes: scopes
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,
    prompt: 'consent',
    include_granted_scopes: true, // Include previously granted scopes
  });
  
  logger.info(`Generated auth URL: ${url}`);
  return url;
};

/**
 * Exchanges an authorization code for access and refresh tokens.
 */
exports.getTokens = async (code) => {
  try {
    logger.info('Attempting to exchange authorization code for tokens');
    const { tokens } = await oauth2Client.getToken(code);
    logger.info('Successfully exchanged authorization code for tokens');
    return tokens;
  } catch (error) {
    logger.error('Token exchange failed:', {
      error: error.message,
      code: error.code,
      status: error.status
    });
    
    // Provide more specific error messages
    if (error.message.includes('invalid_grant')) {
      throw new Error('Authorization code is invalid or expired. Please try the authorization process again.');
    } else if (error.message.includes('redirect_uri_mismatch')) {
      throw new Error('Redirect URI mismatch. Please check your Google Cloud Console configuration.');
    }
    
    throw error;
  }
};

/**
 * Creates a new event in the user's primary Google Calendar.
 */
exports.createCalendarEvent = async (authClient, eventDetails) => {
  try {
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
  } catch (error) {
    logger.error('Failed to create calendar event:', error.message);
    throw error;
  }
};

/**
 * Updates an existing event in the user's primary Google Calendar.
 */
exports.updateCalendarEvent = async (authClient, eventId, eventDetails) => {
  try {
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
  } catch (error) {
    logger.error('Failed to update calendar event:', error.message);
    throw error;
  }
};

/**
 * Deletes an event from the user's primary Google Calendar.
 */
exports.deleteCalendarEvent = async (authClient, eventId) => {
  try {
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    logger.info(`Event deleted: ${eventId}`);
  } catch (error) {
    logger.error('Failed to delete calendar event:', error.message);
    throw error;
  }
};

/**
 * Fetches events that have been updated since a specified time.
 */
exports.getUpdatedEvents = async (authClient, updatedSince) => {
  try {
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const response = await calendar.events.list({
      calendarId: 'primary',
      updatedMin: updatedSince.toISOString(),
      showDeleted: false,
      singleEvents: true,
    });

    return response.data.items || [];
  } catch (error) {
    logger.error('Failed to fetch updated events:', error.message);
    throw error;
  }
};

/**
 * Sets the credentials on the main OAuth2 client instance.
 */
exports.setCredentials = (tokens) => {
  oauth2Client.setCredentials(tokens);
};

/**
 * Test function to validate OAuth configuration
 */
exports.validateConfiguration = () => {
  const config = {
    clientId: !!process.env.GOOGLE_CLIENT_ID,
    clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: !!process.env.GOOGLE_REDIRECT_URI,
  };
  
  logger.info('Google OAuth Configuration:', config);
  
  const missing = Object.entries(config)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
    
  if (missing.length > 0) {
    throw new Error(`Missing Google OAuth configuration: ${missing.join(', ')}`);
  }
  
  return config;
};