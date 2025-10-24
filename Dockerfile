# syntax=docker/dockerfile:1.6

# Builder with native build tools (for sqlite bindings)
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user and group
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy application files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY src/views ./src/views
COPY src/public ./src/public

# Create data and config directories with proper ownership
RUN mkdir -p /data /app/config && \
    chown -R appuser:appuser /app /data

# Switch to non-root user
USER appuser

EXPOSE 3000
CMD ["node", "dist/index.js"]

