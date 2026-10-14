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
COPY apps/web ./apps/web

RUN pnpm --filter @screen-room/protocol build && pnpm --filter @screen-room/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root user execution (DOCKER-01)
COPY --from=builder --chown=node:node /app/apps/web/.output /app/.output
COPY --from=builder --chown=node:node /app/apps/web/package.json /app/package.json

USER node

ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/healthz-web').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
