# ==============================================================================
# MevaPur Commerce Backend API — Multi-Stage Production Dockerfile
# Base Image: node:24.20.0-alpine3.24 (Exact pinned Node.js 24 runtime)
# ==============================================================================

FROM node:24.20.0-alpine3.24 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24.20.0-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000

# Install dumb-init for proper PID 1 signal forwarding
RUN apk add --no-cache dumb-init

# Copy production node_modules and application sources
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node app.js server.js ./
COPY --chown=node:node common ./common
COPY --chown=node:node config ./config
COPY --chown=node:node constants ./constants
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node database ./database
COPY --chown=node:node middleware ./middleware
COPY --chown=node:node models ./models
COPY --chown=node:node modules ./modules
COPY --chown=node:node operations ./operations
COPY --chown=node:node repositories ./repositories
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node utils ./utils
COPY --chown=node:node validators ./validators
COPY --chown=node:node scripts ./scripts

RUN mkdir -p /app/logs && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'require("http").get("http://127.0.0.1:" + (process.env.PORT || 5000) + "/health/ready", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1))'

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
