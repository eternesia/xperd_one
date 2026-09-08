# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Xperd One — production image
# Builds the TanStack Start app and runs the Nitro node-server.
#
#   docker build -t yourorg/xperd-one:latest .
#   docker push  yourorg/xperd-one:latest
# ---------------------------------------------------------------------------

# ---------- Build stage ----------
FROM node:22 AS build
WORKDIR /app

# Install deps first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Build the app
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Only what's needed to run: the self-contained Nitro build + package.json
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

# Storage volume mount point (compose binds `local-storage` here)
RUN mkdir -p /app/storage

EXPOSE 3000

# Env is injected by compose (env_file / environment). `.env` file is optional.
CMD ["node", "--env-file-if-exists=.env", ".output/server/index.mjs"]
