# Build stage for client
FROM node:20-alpine AS client-build

WORKDIR /app

# Copy root package files and workspace configs
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies
RUN npm ci --workspace=client

# Copy client source code
COPY client ./client

# Build client
RUN npm run build --workspace=client

# Build stage for server
FROM node:20-alpine AS server-build

WORKDIR /app

# Copy root package files and workspace configs
COPY package*.json ./
COPY server/package*.json ./server/

# Install server dependencies only
RUN npm ci --workspace=server --omit=dev

# Copy server source code
COPY server ./server

# Build server
RUN npm run build --workspace=server

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy server build and node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/server/package.json ./server/

# Copy client build to server's public directory
COPY --from=client-build /app/client/dist ./client/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV CLIENT_BUILD_PATH=/app/client/dist

# Switch to non-root user
USER nodejs

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Start the server
CMD ["node", "server/dist/index.js"]
