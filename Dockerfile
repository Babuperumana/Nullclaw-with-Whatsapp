FROM node:20-alpine AS base

# Install sharp dependencies for Baileys media handling
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY src/ ./src/
COPY data/ ./data/

# Create data dir for auth info
RUN mkdir -p /app/data/auth-info

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
