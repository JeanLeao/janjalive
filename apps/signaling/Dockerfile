FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/signaling/package.json ./apps/signaling/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY apps/signaling ./apps/signaling

RUN pnpm --filter @screen-room/protocol build && pnpm --filter @screen-room/signaling build
RUN pnpm --filter @screen-room/signaling deploy --prod /prod/signaling

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Non-root user execution (DOCKER-01) with lean deploy bundle (DOCKER-02)
COPY --from=builder --chown=node:node /prod/signaling /app

USER node

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
