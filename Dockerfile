FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files from correct path
COPY src/app/package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source code from correct path
COPY src/app/ ./

# Verify files are copied correctly
RUN ls -la && echo "Files in container:" && find . -name "*.js" -o -name "*.json"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs && \
    chown -R appuser:nodejs /usr/src/app

USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start application
CMD ["node", "main.js"]