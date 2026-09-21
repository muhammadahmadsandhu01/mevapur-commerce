# ==============================================================================
# MevaPur Commerce Storefront — Multi-Stage Production Dockerfile
# Base Image: node:24.20.0-alpine3.21 (Exact pinned Node.js 24 runtime)
# ==============================================================================

FROM node:24.20.0-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.20.0-alpine3.21 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Build arguments for build-time embedded NEXT_PUBLIC_* variables
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_DEFAULT_CURRENCY=PKR
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en-PK

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DEFAULT_CURRENCY=$NEXT_PUBLIC_DEFAULT_CURRENCY \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:24.20.0-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NEXT_TELEMETRY_DISABLED=1

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy standalone output, static assets, and public directory
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'require("http").get("http://127.0.0.1:" + (process.env.PORT || 3000) + "/healthz", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1))'

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
