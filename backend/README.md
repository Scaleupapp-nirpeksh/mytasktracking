# 🚀 Task Tracker Backend

A comprehensive task management and scheduling backend API with multi-workspace support for personal, business, and company use cases.

## ✨ Features

### 🏢 Multi-Workspace Support
- **Personal Workspace**: Individual task management with health, finance, and learning categories
- **Business Workspace**: Entrepreneurial tasks with marketing, development, and sales focus
- **Company Workspace**: Professional workplace tasks with manager meeting features

### 📋 Advanced Task Management
- Complete CRUD operations with rich metadata
- Subtasks and checklists for complex projects
- File attachments with cloud storage (Cloudinary)
- Comments and collaboration features
- Time tracking with start/stop timers
- Recurring tasks with flexible patterns
- Priority levels and status management

### 👥 Team Collaboration
- Role-based access control (Owner, Admin, Member, Viewer)
- Granular permissions for different operations
- Member invitation and management
- Real-time notifications and email alerts
- Manager meeting preparation tools

### 📊 Analytics & Reporting
- Task completion trends and productivity metrics
- Member performance analytics
- Category and priority distribution
- Workspace statistics and insights
- Data export functionality

### 🔐 Enterprise Security
- JWT-based authentication with refresh tokens
- Account lockout and rate limiting
- Email verification and password reset
- Comprehensive audit logging
- Data encryption and secure file storage

## 🛠️ Technology Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js with security middleware
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcrypt password hashing
- **File Storage**: Cloudinary integration
- **Email**: Nodemailer with HTML templates
- **Logging**: Winston with daily log rotation
- **Validation**: Joi schema validation
- **Testing**: Jest with supertest for API testing

## 🚀 Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- MongoDB 4.4 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Scaleupapp-nirpeksh/mytasktracking.git
   cd mytasktracking/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database Setup**
   ```bash
   # Start MongoDB (if running locally)
   mongod
   
   # The application will create default workspaces on first user registration
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:5000`

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/mytasktracking

# Authentication
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRE=30d

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM='"Task Tracker" <your-email@gmail.com>'

# File Upload (Cloudinary)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

## 📚 API Documentation

### Authentication Endpoints

```bash
POST   /api/auth/register           # Register new user
POST   /api/auth/login              # User login
POST   /api/auth/refresh            # Refresh access token
POST   /api/auth/logout             # User logout
GET    /api/auth/me                 # Get current user
PATCH  /api/auth/profile            # Update user profile
PATCH  /api/auth/change-password    # Change password
POST   /api/auth/forgot-password    # Request password reset
PATCH  /api/auth/reset-password/:token # Reset password
GET    /api/auth/verify-email/:token   # Verify email
POST   /api/auth/resend-verification   # Resend verification email
```

### Task Management Endpoints

```bash
GET    /api/tasks                   # Get all tasks with filtering
POST   /api/tasks                   # Create new task
GET    /api/tasks/key-tasks         # Get key tasks for manager meetings
GET    /api/tasks/analytics         # Get task analytics
GET    /api/tasks/:id               # Get single task
PATCH  /api/tasks/:id               # Update task
DELETE /api/tasks/:id               # Delete task

# Subtasks
POST   /api/tasks/:id/subtasks      # Add subtask
PATCH  /api/tasks/:id/subtasks/:subtaskId # Toggle subtask

# Comments
POST   /api/tasks/:id/comments      # Add comment

# Manager Features
POST   /api/tasks/:id/manager-feedback # Add manager feedback
PATCH  /api/tasks/:id/key-task      # Toggle key task status

# Time Tracking
POST   /api/tasks/:id/time/start    # Start timer
POST   /api/tasks/:id/time/stop     # Stop timer
```

### Workspace Management Endpoints

```bash
GET    /api/workspaces              # Get all workspaces
POST   /api/workspaces              # Create workspace
GET    /api/workspaces/:id          # Get single workspace
PATCH  /api/workspaces/:id          # Update workspace
DELETE /api/workspaces/:id          # Delete workspace

# Member Management
POST   /api/workspaces/:id/members  # Add member
PATCH  /api/workspaces/:id/members/:memberId # Update member role
DELETE /api/workspaces/:id/members/:memberId # Remove member

# Organization
POST   /api/workspaces/:id/categories # Add category
POST   /api/workspaces/:id/tags     # Add tag

# Analytics
GET    /api/workspaces/:id/analytics # Get workspace analytics
GET    /api/workspaces/:id/export   # Export workspace data
```

### Query Parameters

#### Task Filtering
```bash
GET /api/tasks?status=todo,in_progress&priority=high&assignedTo=userId&page=1&limit=25
```

Available filters:
- `status`: Filter by task status
- `priority`: Filter by priority level
- `assignedTo`: Filter by assigned user
- `category`: Filter by category
- `tags`: Filter by tags
- `isKeyTask`: Filter key tasks
- `myTasks`: Filter user's tasks
- `dueDateFrom/To`: Date range filtering
- `page/limit`: Pagination
- `sortBy/sortOrder`: Sorting options

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test types
npm run test:integration
npm run test:e2e
```

### Test Structure

```
tests/
├── unit/           # Unit tests for individual functions
├── integration/    # API endpoint testing
├── e2e/           # End-to-end workflow tests
└── setup.js       # Test configuration
```

## 🔐 Security Features

### Authentication & Authorization
- JWT tokens with refresh mechanism
- Password hashing with bcrypt (cost factor 12)
- Account lockout after failed attempts
- Email verification for new accounts
- Role-based access control with granular permissions

### Data Protection
- Input validation with Joi schemas
- SQL injection prevention with parameterized queries
- XSS protection with sanitization
- CORS configuration for frontend integration
- Rate limiting on sensitive endpoints

### File Security
- File type validation and size limits
- Virus scanning integration ready
- Secure file URLs with access control
- File versioning and audit trails

## 📊 Monitoring & Logging

### Logging Levels
- **Error**: Application errors and exceptions
- **Warn**: Warning conditions and security events
- **Info**: General application information
- **HTTP**: Request/response logging
- **Debug**: Detailed debugging information

### Log Files
- `combined.log`: All log levels
- `error.log`: Error-only logs
- `access.log`: HTTP request logs
- Daily rotation with configurable retention

### Health Checks
- `GET /health`: Basic server health
- `GET /api/health`: Detailed health with database status

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
# Build and start
npm start

# With PM2 process manager
pm2 start ecosystem.config.js
```

### Docker Deployment
```bash
# Build image
docker build -t task-tracker-backend .

# Run container
docker run -p 5000:5000 --env-file .env task-tracker-backend
```

### Environment-Specific Configurations

#### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Configure MongoDB Atlas or production database
- [ ] Set up Cloudinary for file storage
- [ ] Configure email service (SendGrid, AWS SES)
- [ ] Enable SSL/HTTPS
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Install dependencies: `npm install`
4. Make changes and add tests
5. Run tests: `npm test`
6. Run linting: `npm run lint`
7. Commit changes: `git commit -m "Add new feature"`
8. Push to branch: `git push origin feature/new-feature`
9. Submit pull request

### Code Style
- ESLint configuration with Airbnb base
- Prettier for code formatting
- Husky for pre-commit hooks
- Comprehensive JSDoc comments

### Commit Convention
```
feat: add new feature
fix: bug fix
docs: documentation update
style: formatting changes
refactor: code refactoring
test: add or update tests
chore: maintenance tasks
```

## 📈 Performance Optimization

### Database
- Indexes on frequently queried fields
- Aggregation pipelines for analytics
- Connection pooling with Mongoose
- Lean queries for read operations

### Caching
- Redis integration ready
- Query result caching
- File metadata caching
- Session storage optimization

### API Performance
- Request compression with gzip
- Response pagination
- Field selection for large objects
- Rate limiting to prevent abuse

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check MongoDB status
brew services list | grep mongodb
# or
sudo systemctl status mongod

# Restart MongoDB
brew services restart mongodb-community
# or
sudo systemctl restart mongod
```

**Email Not Sending**
- Verify email credentials in `.env`
- Check Gmail app-specific password
- Ensure less secure apps enabled (if using Gmail)
- Check firewall settings for SMTP ports

**File Upload Issues**
- Verify Cloudinary credentials
- Check file size limits (default 10MB)
- Ensure allowed file types are configured
- Check network connectivity to Cloudinary

### Debug Mode
```bash
# Enable verbose logging
DEBUG_MODE=true npm run dev

# Check specific component logs
npm run dev 2>&1 | grep "database"
npm run dev 2>&1 | grep "authentication"
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Express.js team for the robust web framework
- MongoDB team for the flexible database
- Cloudinary for reliable file storage
- All open-source contributors

## 📞 Support

- **Documentation**: Check `/api/docs` endpoints for interactive API documentation
- **Issues**: Create an issue on GitHub for bug reports
- **Email**: support@mytasktracker.com
- **Discord**: Join our community server for real-time help

---

**Built with ❤️ by Nirpeksh Scale Up App**