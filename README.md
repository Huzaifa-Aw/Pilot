# Pilot

White-label engineering management workspace for projects, members, capacity, timesheets,
deployments, assets, and organization-defined metadata.

The workspace includes scoped project and team permissions, a transparent organization-wide
task board, editable project milestones/tasks and capacity allocations, monthly worklogs with
team approvals, deployment presence and conflict tracking, asset checkout, and management reports.
See [the V2 delivery record](./docs/IMPLEMENTATION_PLAN_V2.md) for scope, verification, and known limits.

## Local development

Requirements: Node.js 22+, npm, and PostgreSQL 16+.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, and a random
   `AUTH_SECRET` (`openssl rand -base64 32`).
2. Run `npm ci`, `npm run db:generate`, and `npm run db:deploy`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3000/setup` to create the first organization and owner.

Useful checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:validate`,
`npm run build`, and `npm run test:e2e` (Playwright requires Chromium).

## Self-hosted deployment

The Docker Compose setup runs PostgreSQL, the app, and an Nginx ingress with login/setup
rate limits. Configure `.env` with a unique `POSTGRES_PASSWORD`, a generated `AUTH_SECRET`,
and the public `AUTH_URL`, then run:

```sh
docker compose up --build -d
```

The local ingress is available at `http://localhost:8080`. For public use, terminate TLS
at a trusted reverse proxy, forward to this ingress, and configure forwarded client IP
handling only for known proxy addresses. Create the initial owner at `/setup`.

See [deployment and operations](./docs/07_ENVIRONMENT_AND_DEPLOYMENT.md) for managed
hosting, backups, restore, migrations, and production security guidance.