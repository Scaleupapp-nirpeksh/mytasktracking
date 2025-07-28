# ====================================
# TASK TRACKER BACKEND DOCKERFILE
# ====================================
# Multi-stage production-ready Docker image
# Optimized for security and performance

# ====================================
# Stage 1: Base Image with Dependencies
# ====================================
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S tasktracker -u 1001

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# ====================================
# Stage 2: Dependencies Installation
# ====================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies with npm ci for faster, reliable builds
RUN npm ci --only=production && npm cache clean --force

# ====================================
# Stage 3: Development Image
# ====================================
FROM base AS development

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R tasktracker:nodejs /app
USER tasktracker

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Development command
CMD ["npm", "run", "dev"]

# ====================================
# Stage 4: Builder (for production optimizations)
# ====================================
FROM base AS builder

# Copy package files
COPY package*.json ./

# Install all dependencies for building
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Run any build steps (linting, etc.)
RUN npm run lint && npm run test

# ====================================
# Stage 5: Production Image
# ====================================
FROM base AS production

# Set production environment
ENV NODE_ENV=production

# Copy production dependencies from deps stage
COPY --from=deps --chown=tasktracker:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=tasktracker:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p logs uploads public && \
    chown -R tasktracker:nodejs logs uploads public

# Remove development files
RUN rm -rf \
    tests/ \
    docs/ \
    .git/ \
    .github/ \
    *.md \
    .env.example \
    .eslintrc.js \
    .prettierrc \
    jest.config.js \
    docker-compose.yml \
    Dockerfile \
    .dockerignore

# Switch to non-root user
USER tasktracker

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Production command
CMD ["npm", "start"]

# ====================================
# Labels for better maintenance
# ====================================
LABEL maintainer="Nirpeksh Scale Up App <nirpeksh@scaleupapp.com>"
LABEL description="Task Tracker Backend API"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="Task Tracker Backend"
LABEL org.opencontainers.image.description="A comprehensive task management and scheduling backend API"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Nirpeksh Scale Up App"
LABEL org.opencontainers.image.licenses="MIT"