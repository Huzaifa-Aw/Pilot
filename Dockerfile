FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://pilot:pilot@localhost:5432/pilot" \
    DIRECT_URL="postgresql://pilot:pilot@localhost:5432/pilot" \
    npx prisma generate
RUN DATABASE_URL="postgresql://pilot:pilot@localhost:5432/pilot" \
    DIRECT_URL="postgresql://pilot:pilot@localhost:5432/pilot" \
    AUTH_SECRET="build-only-not-used" \
    AUTH_URL="http://localhost:3000" \
    npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
RUN mkdir -p .next/cache && chown -R app:app .next

USER app
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node server.js"]
