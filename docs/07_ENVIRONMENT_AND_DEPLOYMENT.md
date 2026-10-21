# 07 — Environment Variables & Deployment

> All environment configuration, Vercel deployment blueprint,
> and self-hosted Docker setup guide.

---

## 1. Environment Variables

### `.env.example` — Template (commit this file)

```bash
# ──────────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────────
# PostgreSQL connection string (Supabase / Neon / self-hosted)
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Direct connection for Prisma migrations (bypasses pgBouncer pooling)
DIRECT_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# ──────────────────────────────────────────────
# AUTHENTICATION (Auth.js / NextAuth v5)
# ──────────────────────────────────────────────
# Generate with: openssl rand -base64 32
AUTH_SECRET="your-32-char-secret-here"

# Canonical URL of the deployed app (no trailing slash)
NEXTAUTH_URL="https://app.yourdomain.com"

# Optional: OAuth providers (comment out unused ones)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_MICROSOFT_ENTRA_ID=""
AUTH_MICROSOFT_ENTRA_SECRET=""
AUTH_MICROSOFT_ENTRA_TENANT_ID=""

# ──────────────────────────────────────────────
# EMAIL (for invitations + notifications)
# ──────────────────────────────────────────────
# Provider options: "resend" | "smtp"
EMAIL_PROVIDER="resend"

# Resend (cloud)
RESEND_API_KEY=""

# SMTP (self-hosted / Postfix / Mailgun)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@yourdomain.com"

# ──────────────────────────────────────────────
# FILE STORAGE
# ──────────────────────────────────────────────
# Provider options: "vercel-blob" | "s3" | "local"
STORAGE_PROVIDER="vercel-blob"

# Vercel Blob
BLOB_READ_WRITE_TOKEN=""

# S3-compatible (MinIO, Cloudflare R2, AWS S3)
S3_ENDPOINT="https://s3.amazonaws.com"
S3_REGION="us-east-1"
S3_BUCKET="engineering-platform-assets"
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""

# ──────────────────────────────────────────────
# APPLICATION BEHAVIOR
# ──────────────────────────────────────────────
# Allow users to self-register without an invitation (true | false)
ALLOW_PUBLIC_SIGNUP="false"

# Default timezone for new organizations
DEFAULT_TIMEZONE="UTC"

# Pagination default
DEFAULT_PAGE_SIZE="20"

# Audit log retention (days; 0 = retain forever)
AUDIT_LOG_RETENTION_DAYS="0"

# ──────────────────────────────────────────────
# OPTIONAL: ANALYTICS / MONITORING
# ──────────────────────────────────────────────
# Self-hostable alternatives: Plausible, Posthog (OSS)
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://app.posthog.com"

# Error tracking (Sentry OSS or cloud)
SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""

# ──────────────────────────────────────────────
# NEXT.JS
# ──────────────────────────────────────────────
NEXT_TELEMETRY_DISABLED="1"
NODE_ENV="production"
```

---

## 2. Vercel Deployment

### Project Configuration

```bash
# Install Vercel CLI
npm i -g vercel

# Link to Vercel project
vercel link

# Set environment variables (do this for each var in .env.example)
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
# ... repeat for all required vars

# Deploy
vercel deploy --prod
```

### `vercel.json`

```json
{
  "buildCommand": "prisma generate && prisma migrate deploy && next build",
  "devCommand":   "next dev",
  "installCommand": "npm ci",
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "src/app/api/**": {
      "maxDuration": 30
    }
  }
}
```

### Database Recommendation (Vercel + Postgres)

| Option | Best for | Notes |
|--------|----------|-------|
| **Neon** | Vercel-native, free tier available | Serverless branching; perfect for preview deployments |
| **Supabase** | Full Postgres + Auth + Storage bundle | More opinionated; great for rapid prototyping |
| **PlanetScale** | MySQL-based teams | Not PostgreSQL; incompatible with this schema |
| **Railway** | Budget self-hosted Postgres | Simple UI, affordable |

---

## 3. Self-Hosted Deployment (Docker Compose)

### `docker-compose.yml`

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/engineeringplatform
      - DIRECT_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/engineeringplatform
      - AUTH_SECRET=${AUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - EMAIL_PROVIDER=${EMAIL_PROVIDER}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - ALLOW_PUBLIC_SIGNUP=${ALLOW_PUBLIC_SIGNUP:-false}
    depends_on:
      db:
        condition: service_healthy
    command: sh -c "npx prisma migrate deploy && node server.js"

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: engineeringplatform
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    ports:
      - "5432:5432"   # Remove this line if you don't need external DB access

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./certs:/etc/nginx/certs      # SSL certs (Let's Encrypt / Certbot)
    depends_on:
      - app

volumes:
  postgres_data:
```

### `Dockerfile`

```dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

### Self-Hosted Quick Start

```bash
# 1. Clone repository
git clone <repo-url> engineering-platform
cd engineering-platform

# 2. Configure environment
cp .env.example .env
nano .env    # Fill in POSTGRES_PASSWORD, AUTH_SECRET, NEXTAUTH_URL

# 3. Start services
docker compose up -d

# 4. Run initial database migration + seed
docker compose exec app npx prisma db seed

# 5. Access the app
open http://localhost:3000
```

---

## 4. CI/CD Pipeline (GitHub Actions)

### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Type Check & Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint

  deploy-preview:
    name: Deploy Preview (PR)
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npx vercel deploy --token ${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID:     ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    name: Deploy Production (main)
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Run Prisma Migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL:   ${{ secrets.DIRECT_URL }}
      - run: npx vercel deploy --prod --token ${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID:     ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 5. Security Checklist

- [ ] `AUTH_SECRET` is a cryptographically random 32-byte string (`openssl rand -base64 32`)
- [ ] `DATABASE_URL` uses SSL (`sslmode=require`)
- [ ] `ALLOW_PUBLIC_SIGNUP=false` in production (invites only)
- [ ] OAuth client IDs/secrets never committed to git
- [ ] Vercel environment variables are set to "Production" scope only (not preview/dev for secrets)
- [ ] Rate limiting on `/api/auth/*` routes (middleware or Vercel Edge Config)
- [ ] CORS policy set in `next.config.ts` to restrict API origins
- [ ] AuditLog rows never deleted — database role should have `DELETE` revoked on that table
- [ ] File upload size limits configured in Next.js route handlers
- [ ] Regular automated DB backups (Neon/Supabase/Railway provide this natively)

---

## 6. Performance Tuning

```typescript
// next.config.ts — Recommended production settings
const config: NextConfig = {
  output: "standalone",                     // For Docker deployments
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  experimental: {
    ppr: true,                              // Partial Pre-Rendering (Next.js 15)
    reactCompiler: true,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options",           value: "DENY" },
        { key: "X-Content-Type-Options",    value: "nosniff" },
        { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};
```

---

*End of Migration SaaS Blueprint. Return to [`00_INDEX.md`](./00_INDEX.md) for navigation.*
