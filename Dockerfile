# syntax=docker/dockerfile:1.6

# Builder with native build tools (for sqlite bindings)
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY src/views ./src/views
COPY src/public ./src/public
EXPOSE 3000
CMD ["node", "dist/index.js"]

