# Environment and Deployment

This guide describes the implemented Next.js, Auth.js, Prisma, and PostgreSQL application.
The `.env.example` file is the authoritative list of supported settings. Features not wired
into the application (such as file-storage providers, analytics, and Microsoft OAuth) are
not enabled by setting environment variables alone.

## Environment

Required for the application:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection used by Prisma Client |
| `DIRECT_URL` | Direct PostgreSQL connection used by Prisma migrations |
| `AUTH_SECRET` | Random secret for Auth.js sessions |
| `AUTH_URL` | Canonical application URL |

Optional integrations:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enable Google sign-in when both are set |
| `EMAIL_PROVIDER` | `resend` or `smtp` for organization invitations |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend delivery configuration |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | SMTP delivery configuration |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_NAME` | Optional development seed owner |
| `SEED_ORGANIZATION_NAME`, `SEED_ORGANIZATION_SLUG` | Optional development seed organization |
| `CRON_SECRET` | Bearer secret for scheduled deployment-status and timesheet-reminder routes |

Generate `AUTH_SECRET` with `openssl rand -base64 32`. Keep `.env` out of source control.
There is no public self-registration flow; the first owner is created through `/setup`, and
additional accounts join through invitations.

## Local development

1. Install Node.js 22+, npm, and PostgreSQL 16 or later.
2. Copy `.env.example` to `.env`; set the database URLs and a unique `AUTH_SECRET`.
3. Run `npm ci`, `npm run db:generate`, and `npm run db:deploy`.
4. Run `npm run dev`, then open `http://localhost:3000/setup` to create the first owner.

Useful checks are `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:validate`,
`npm run build`, and `npm run test:e2e` (requires Playwright Chromium).

## Managed hosting

Deploy the Next.js application to a managed Next.js host and use a managed PostgreSQL
database. Configure the required environment variables in the host's production scope;
use a pooled URL for `DATABASE_URL` only when supported by the Prisma runtime and a direct
URL for `DIRECT_URL`.

Build with `npm run build`; its `prebuild` lifecycle generates the Prisma Client from the
checked-in schema before Next.js compiles. Run `npm run db:deploy` once as a
release step against the production database, after taking a backup and before directing
traffic to code that requires the migration. Do not run migrations separately for each
preview deployment. Configure the host's edge firewall to rate-limit
`/api/auth/callback/credentials` and `/api/setup`; the self-hosted Nginx limits below do not
apply to a managed deployment.

For Vercel, import the repository as a Next.js project, set the required production
environment variables, and use `npm run build` as the build command. The package's
`prebuild` lifecycle runs `npm run db:generate` so the generated client matches the
checked-in Prisma schema.
Run migrations from a protected release job with production database credentials, not as a
preview-build step. Use Vercel Firewall or another trusted edge layer for the rate limits.

## Self-hosting with Docker Compose

The repository includes a production-oriented `Dockerfile`, `docker-compose.yml`, and
`nginx.conf`. The Compose stack runs PostgreSQL, the app, and a loopback-bound Nginx ingress.
The app applies checked-in Prisma migrations before starting. The ingress rate-limits
credential sign-ins and initial setup, and the app health endpoint checks database
connectivity.

1. Copy `.env.example` to `.env`.
2. Set a URL-safe `POSTGRES_PASSWORD` (for example, `openssl rand -hex 24`), `AUTH_SECRET`
   from `openssl rand -base64 32`, and the public `AUTH_URL` (for example
   `https://workspace.example.com`).
3. Configure an email provider if invitations need to be delivered.
4. Start the stack with `docker compose up --build -d`.
5. Open `/setup` through the configured ingress and create the first owner.

The bundled ingress listens on `127.0.0.1:8080`; place it behind a TLS-terminating proxy
for public access. Its rate-limit key is the connecting peer IP. If the TLS proxy is on the
request path, configure Nginx real-IP handling for only that proxy's known address range;
never trust arbitrary forwarded-IP headers. Apply rate limits at the public edge as well.
The container health check is available at `/api/health` and returns no organization data.

When `CRON_SECRET` is set, a trusted scheduler may send `POST /api/cron/deployment-status`
and `POST /api/cron/timesheet-reminders` with `Authorization: Bearer <CRON_SECRET>`. The
first route advances started upcoming deployments and refreshes conflict flags; the second
creates one in-app reminder per active member who has not submitted the current month.
Schedule both daily; the reminder route is idempotent within each month.

## CI

The GitHub Actions workflow in `.github/workflows/ci.yml` provisions PostgreSQL and runs
Prisma generation, schema validation, migrations, type checking, lint, unit tests, and a
production build plus the five-role Playwright suite on pull requests and pushes to `main`.

## Backups, restore, and rollback

Take regular encrypted backups using the PostgreSQL provider's managed backup facility or
the following self-hosted commands. Keep backups outside the repository and test restores
in a separate database before relying on them.

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U pilot -d pilot -Fc \
  > "backups/pilot-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

To restore a verified dump, stop application traffic first. The restore replaces matching
database objects, so confirm the target database and take a pre-restore backup:

```sh
docker compose stop web app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U pilot -d pilot \
  < backups/pilot-backup.dump
docker compose start app web
docker compose ps
```

Prisma migrations are forward-only in this deployment. For rollback, stop traffic, restore
the pre-deployment database backup, and redeploy the previous application image. Do not
manually edit `_prisma_migrations` or run an unreviewed destructive schema change.

## Production security checklist

- Use HTTPS end-to-end and set `AUTH_URL` to the canonical HTTPS origin.
- Use unique, high-entropy database credentials and `AUTH_SECRET`; keep secrets in the
  hosting provider's secret store, not build logs or repository files.
- Restrict database network access to the app and migration job.
- Preserve the security headers configured in `next.config.ts`.
- Apply edge rate limits to credential sign-in and setup routes; do not depend on an
  in-memory limiter in a multi-instance deployment.
- Keep PostgreSQL backups encrypted, access-controlled, off-host, and restore-tested.
- Run `npm audit` and review advisories before production releases. Do not upgrade the
  mandated Next.js or Prisma major versions without running the full migration and
  authentication test suite.
- Treat invitation delivery as unavailable until the configured Resend or SMTP provider
  has been verified with production-safe credentials.

The current dependency lock reports high-severity advisories in Prisma 6's configuration
dependency, Nodemailer 8, and the development lint dependency tree. A compatible PostCSS
override is applied. The available automatic fixes would change the mandated Prisma,
Next.js, or Auth.js/Nodemailer peer versions; do not apply them blindly. Review and resolve
these advisories before production release, especially before enabling SMTP delivery.
