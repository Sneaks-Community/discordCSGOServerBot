# =============================================================================
# Discord CS:GO Server Bot - Dockerfile
# Multi-stage build for minimal production image
# =============================================================================
ARG NODE_VERSION=22
# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and compile native modules
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for native module compilation)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Rebuild native modules for current Node.js version
RUN npm rebuild better-sqlite3

# Prune to production dependencies only
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production - Minimal runtime image
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    sqlite

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json for version info
COPY package*.json ./

# Copy application source
COPY src/ ./src/

# Create data directory for SQLite database and set permissions
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Run the bot
CMD ["node", "src/index.js"]