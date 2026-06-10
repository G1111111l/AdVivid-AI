FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

ENV FFMPEG_BIN=/usr/bin/ffmpeg
ENV NPM_CONFIG_CACHE=/envment/npm-cache
ENV PRISMA_ENGINES_CACHE_DIR=/envment/prisma-engines

COPY package.json package-lock.json tsconfig.base.json eslint.config.js ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @advivid/shared \
  && npm run build -w @advivid/agent \
  && npm run build -w @advivid/video \
  && npm run build -w @advivid/api \
  && npm run build -w @advivid/worker

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@advivid/api"]
