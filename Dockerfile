# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files
COPY src/app/package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY src/app/ .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
  const options = { \
    host: 'localhost', \
    port: 3000, \
    path: '/health', \
    timeout: 2000 \
  }; \
  const req = http.request(options, (res) => { \
    if (res.statusCode === 200) { \
      process.exit(0); \
    } else { \
      process.exit(1); \
    } \
  }); \
  req.on('error', () => process.exit(1)); \
  req.end();"

# Start application
CMD ["npm", "start"]
