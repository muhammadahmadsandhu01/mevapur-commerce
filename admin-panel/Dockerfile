# ==============================================================================
# MevaPur Commerce Admin Panel — Multi-Stage Production Dockerfile
# Base Image: node:24.20.0-alpine3.24 (Exact pinned Node.js 24 runtime)
# ==============================================================================

FROM node:24.20.0-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.20.0-alpine3.24 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Build arguments for build-time embedded NEXT_PUBLIC_* variables
ARG NEXT_PUBLIC_SITE_NAME=HARZAAR
ARG NEXT_PUBLIC_ADMIN_URL=https://admin.mevapur.test
ARG NEXT_PUBLIC_API_URL=https://api.mevapur.test

ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:24.20.0-alpine3.24 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME="0.0.0.0" \
    NEXT_TELEMETRY_DISABLED=1

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy standalone output, static assets, and public directory
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'require("http").get("http://127.0.0.1:" + (process.env.PORT || 3001) + "/healthz", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1))'

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
