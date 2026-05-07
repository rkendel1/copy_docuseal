# Multi-stage Dockerfile for OCR Service

# Stage 1: Download model and dependencies
FROM node:20-alpine AS downloader

WORKDIR /downloads

# Download ONNX model
RUN apk add --no-cache wget && \
    wget -O model.onnx "https://github.com/docusealco/fields-detection/releases/download/2.0.0/model_704_int8.onnx"

# Stage 2: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    vips \
    vips-dev \
    cairo \
    pango \
    giflib \
    libpng \
    libjpeg-turbo \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built files
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./

# Copy model
RUN mkdir -p /app/models
COPY --from=downloader /downloads/model.onnx /app/models/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV MODEL_PATH=/app/models/model.onnx

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Run the service
CMD ["node", "dist/server.js"]
