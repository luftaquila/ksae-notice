FROM node:24-alpine AS base

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Every expiry rule reads the calendar off the process clock, and the service is
# KST. Without this the image resolves to UTC, where a sign-up at 03:00 KST on
# Jan 1 is minted a period ending that same morning. Matches the zone
# vitest.config.ts pins. No tzdata needed — Node resolves named zones from ICU.
ENV TZ=Asia/Seoul

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy custom server and source files needed at runtime
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/drizzle ./drizzle

# Copy runtime node_modules not included in standalone
COPY --from=deps /app/node_modules ./node_modules

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/ksae.db

CMD ["node", "--import", "tsx", "server.ts"]
