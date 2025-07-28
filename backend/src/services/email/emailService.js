/**
 * Email Service
 * 
 * Comprehensive email delivery service with:
 * - Transactional email sending (verification, password reset)
 * - Task notifications and reminders
 * - Team collaboration notifications
 * - Template-based email generation
 * - Delivery tracking and error handling
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const nodemailer = require('nodemailer');
const { logger } = require('../logger/logger');

/**
 * Email transporter configuration
 */
let transporter = null;

/**
 * Initialize email transporter based on configuration
 */
const initializeTransporter = () => {
  if (transporter) return transporter;

  const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    },
    // Additional options for better deliverability
    pool: true, // Use pooled connections
    maxConnections: 5, // Limit connections
    maxMessages: 100, // Limit messages per connection
    rateLimit: 10, // Limit to 10 emails per second
    tls: {
      rejectUnauthorized: false // For development, set to true in production
    }
  };

  try {
    transporter = nodemailer.createTransporter(emailConfig);
    
    // Verify transporter configuration
    transporter.verify((error, success) => {
      if (error) {
        logger.error('Email transporter verification failed:', error);
      } else {
        logger.info('Email transporter is ready to send messages');
      }
    });

    return transporter;
  } catch (error) {
    logger.error('Failed to initialize email transporter:', error);
    throw new Error('Email service initialization failed');
  }
};

/**
 * Send email with error handling and logging
 */
const sendEmail = async (to, subject, html, text = null) => {
  try {
    const emailTransporter = initializeTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Task Tracker" <noreply@mytasktracker.com>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      headers: {
        'X-Mailer': 'Task Tracker v1.0.0',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal'
      }
    };

    const info = await emailTransporter.sendMail(mailOptions);
    
    logger.info('Email sent successfully', {
      to,
      subject,
      messageId: info.messageId,
      response: info.response
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };

  } catch (error) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: error.message,
      stack: error.stack
    });

    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

/**
 * Generate HTML email template
 */
const generateEmailTemplate = (title, content, buttonText = null, buttonUrl = null, footerText = null) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #1F2937;
            margin-bottom: 20px;
            font-size: 20px;
        }
        .content p {
            margin-bottom: 15px;
            color: #4B5563;
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            transition: transform 0.2s ease;
        }
        .button:hover {
            transform: translateY(-2px);
        }
        .footer {
            background-color: #F9FAFB;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #E5E7EB;
        }
        .footer p {
            margin: 0;
            color: #6B7280;
            font-size: 14px;
        }
        .social-links {
            margin-top: 15px;
        }
        .social-links a {
            color: #6B7280;
            text-decoration: none;
            margin: 0 10px;
        }
        @media only screen and (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 0;
            }
            .content {
                padding: 30px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Task Tracker</h1>
        </div>
        <div class="content">
            <h2>${title}</h2>
            ${content}
            ${buttonText && buttonUrl ? `
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${buttonUrl}" class="button">${buttonText}</a>
                </div>
            ` : ''}
        </div>
        <div class="footer">
            <p>${footerText || 'This email was sent by Task Tracker. If you didn\'t expect this email, please ignore it.'}</p>
            <div class="social-links">
                <a href="${baseUrl}">Visit Website</a>
                <a href="${baseUrl}/support">Support</a>
                <a href="${baseUrl}/privacy">Privacy Policy</a>
            </div>
        </div>
    </div>
</body>
</html>`;
};

/**
 * Send email verification
 */
const sendEmailVerification = async (email, firstName, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
  
  const title = 'Verify Your Email Address';
  const content = `
    <p>Hello ${firstName},</p>
    <p>Welcome to Task Tracker! To complete your registration and start organizing your tasks, please verify your email address by clicking the button below.</p>
    <p>This verification link will expire in 24 hours for security reasons.</p>
    <p>If you didn't create an account with us, please ignore this email.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'Verify Email Address',
    verificationUrl,
    'This verification link will expire in 24 hours.'
  );

  return await sendEmail(email, 'Verify Your Task Tracker Account', html);
};

/**
 * Send password reset email
 */
const sendPasswordReset = async (email, firstName, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  
  const title = 'Reset Your Password';
  const content = `
    <p>Hello ${firstName},</p>
    <p>We received a request to reset your password for your Task Tracker account.</p>
    <p>Click the button below to create a new password. This link will expire in 10 minutes for security.</p>
    <p><strong>If you didn't request this password reset, please ignore this email.</strong> Your account remains secure.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'Reset Password',
    resetUrl,
    'This reset link will expire in 10 minutes. If you didn\'t request this, your account is still secure.'
  );

  return await sendEmail(email, 'Reset Your Task Tracker Password', html);
};

/**
 * Send task assignment notification
 */
const sendTaskAssignmentNotification = async (email, firstName, task, assignedBy, workspaceName) => {
  const taskUrl = `${process.env.FRONTEND_URL}/workspaces/${task.workspace}/tasks/${task.id}`;
  
  const title = 'New Task Assigned';
  const content = `
    <p>Hello ${firstName},</p>
    <p><strong>${assignedBy}</strong> has assigned you a new task in the <strong>${workspaceName}</strong> workspace.</p>
    <div style="background-color: #F3F4F6; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1F2937;">${task.title}</h3>
        ${task.description ? `<p style="color: #4B5563;">${task.description}</p>` : ''}
        <p style="margin-bottom: 0;">
            <strong>Priority:</strong> <span style="color: ${task.priority === 'urgent' ? '#EF4444' : task.priority === 'high' ? '#F59E0B' : '#10B981'};">${task.priority.toUpperCase()}</span><br>
            ${task.dueDate ? `<strong>Due Date:</strong> ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date set'}
        </p>
    </div>
    <p>Click the button below to view the task details and get started.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'View Task',
    taskUrl
  );

  return await sendEmail(email, `New Task: ${task.title}`, html);
};

/**
 * Send task due reminder
 */
const sendTaskDueReminder = async (email, firstName, task, workspaceName) => {
  const taskUrl = `${process.env.FRONTEND_URL}/workspaces/${task.workspace}/tasks/${task.id}`;
  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  let urgencyText = '';
  if (daysUntilDue <= 0) {
    urgencyText = '⚠️ This task is overdue!';
  } else if (daysUntilDue === 1) {
    urgencyText = '⏰ This task is due tomorrow!';
  } else {
    urgencyText = `📅 This task is due in ${daysUntilDue} days.`;
  }
  
  const title = 'Task Due Reminder';
  const content = `
    <p>Hello ${firstName},</p>
    <p>${urgencyText}</p>
    <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1F2937;">${task.title}</h3>
        ${task.description ? `<p style="color: #4B5563;">${task.description}</p>` : ''}
        <p style="margin-bottom: 0;">
            <strong>Workspace:</strong> ${workspaceName}<br>
            <strong>Due Date:</strong> ${dueDate.toLocaleDateString()}<br>
            <strong>Priority:</strong> <span style="color: ${task.priority === 'urgent' ? '#EF4444' : task.priority === 'high' ? '#F59E0B' : '#10B981'};">${task.priority.toUpperCase()}</span>
        </p>
    </div>
    <p>Don't let this task slip by! Click below to update its status or add progress notes.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'Update Task',
    taskUrl
  );

  return await sendEmail(email, `Reminder: ${task.title}`, html);
};

/**
 * Send workspace invitation
 */
const sendWorkspaceInvitation = async (email, firstName, workspace, invitedBy) => {
  const invitationUrl = `${process.env.FRONTEND_URL}/workspaces/${workspace.id}/join`;
  
  const title = 'Workspace Invitation';
  const content = `
    <p>Hello ${firstName},</p>
    <p><strong>${invitedBy}</strong> has invited you to join the <strong>${workspace.name}</strong> workspace on Task Tracker.</p>
    <div style="background-color: #F0F9FF; border-left: 4px solid #3B82F6; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1F2937;">${workspace.name}</h3>
        ${workspace.description ? `<p style="color: #4B5563;">${workspace.description}</p>` : ''}
        <p style="margin-bottom: 0;">
            <strong>Type:</strong> ${workspace.type.charAt(0).toUpperCase() + workspace.type.slice(1)}<br>
            <strong>Members:</strong> ${workspace.stats?.totalMembers || 1} members
        </p>
    </div>
    <p>Join the workspace to collaborate on tasks and stay organized together!</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'Join Workspace',
    invitationUrl
  );

  return await sendEmail(email, `Invitation: ${workspace.name} Workspace`, html);
};

/**
 * Send daily task summary
 */
const sendDailyTaskSummary = async (email, firstName, summary) => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;
  
  const title = 'Your Daily Task Summary';
  const content = `
    <p>Hello ${firstName},</p>
    <p>Here's your task summary for today:</p>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0;">
        <div style="background-color: #F0F9FF; padding: 15px; border-radius: 6px; text-align: center;">
            <h3 style="margin: 0; color: #3B82F6; font-size: 24px;">${summary.totalTasks}</h3>
            <p style="margin: 5px 0 0 0; color: #6B7280;">Total Tasks</p>
        </div>
        <div style="background-color: #F0FDF4; padding: 15px; border-radius: 6px; text-align: center;">
            <h3 style="margin: 0; color: #10B981; font-size: 24px;">${summary.completedTasks}</h3>
            <p style="margin: 5px 0 0 0; color: #6B7280;">Completed</p>
        </div>
        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 6px; text-align: center;">
            <h3 style="margin: 0; color: #F59E0B; font-size: 24px;">${summary.pendingTasks}</h3>
            <p style="margin: 5px 0 0 0; color: #6B7280;">Pending</p>
        </div>
        <div style="background-color: #FEE2E2; padding: 15px; border-radius: 6px; text-align: center;">
            <h3 style="margin: 0; color: #EF4444; font-size: 24px;">${summary.overdueTasks}</h3>
            <p style="margin: 5px 0 0 0; color: #6B7280;">Overdue</p>
        </div>
    </div>
    ${summary.upcomingTasks?.length > 0 ? `
        <h3>Upcoming Deadlines:</h3>
        <ul>
            ${summary.upcomingTasks.map(task => `
                <li style="margin-bottom: 10px;">
                    <strong>${task.title}</strong> - Due ${new Date(task.dueDate).toLocaleDateString()}
                    <span style="color: ${task.priority === 'urgent' ? '#EF4444' : task.priority === 'high' ? '#F59E0B' : '#10B981'};">
                        (${task.priority.toUpperCase()})
                    </span>
                </li>
            `).join('')}
        </ul>
    ` : ''}
    <p>Keep up the great work! Visit your dashboard to see more details and update your tasks.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'View Dashboard',
    dashboardUrl
  );

  return await sendEmail(email, 'Your Daily Task Summary', html);
};

/**
 * Send task comment notification
 */
const sendTaskCommentNotification = async (email, firstName, task, comment, commenterName, workspaceName) => {
  const taskUrl = `${process.env.FRONTEND_URL}/workspaces/${task.workspace}/tasks/${task.id}`;
  
  const title = 'New Comment on Your Task';
  const content = `
    <p>Hello ${firstName},</p>
    <p><strong>${commenterName}</strong> added a comment to your task in the <strong>${workspaceName}</strong> workspace.</p>
    <div style="background-color: #F3F4F6; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1F2937;">${task.title}</h3>
        <div style="background-color: #FFFFFF; padding: 15px; border-radius: 4px; border-left: 3px solid #3B82F6;">
            <p style="margin: 0; color: #4B5563; font-style: italic;">"${comment.content}"</p>
            <p style="margin: 10px 0 0 0; color: #6B7280; font-size: 12px;">- ${commenterName}</p>
        </div>
    </div>
    <p>Click below to view the full conversation and respond if needed.</p>
  `;
  
  const html = generateEmailTemplate(
    title,
    content,
    'View Task',
    taskUrl
  );

  return await sendEmail(email, `Comment on: ${task.title}`, html);
};

/**
 * Test email configuration
 */
const testEmailConfiguration = async () => {
  try {
    const transporter = initializeTransporter();
    const verified = await transporter.verify();
    
    if (verified) {
      logger.info('Email configuration test passed');
      return { success: true, message: 'Email configuration is valid' };
    }
  } catch (error) {
    logger.error('Email configuration test failed:', error);
    return { success: false, message: error.message };
  }
};

module.exports = {
  sendEmail,
  sendEmailVerification,
  sendPasswordReset,
  sendTaskAssignmentNotification,
  sendTaskDueReminder,
  sendWorkspaceInvitation,
  sendDailyTaskSummary,
  sendTaskCommentNotification,
  testEmailConfiguration,
  generateEmailTemplate
};