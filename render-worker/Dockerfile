# Mesin render Template Studio AI Qalling (Remotion + Chrome Headless Shell).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# Unduh Chrome Headless Shell saat build supaya kontainer langsung siap.
RUN node -e "import('@remotion/renderer').then(r => r.ensureBrowser())"
COPY . .
RUN chown -R node:node /app

ENV NODE_ENV=production
USER node
CMD ["node", "worker.mjs"]
