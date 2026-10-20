# PrimeStar HRMS Portal

HR, purchase-order and employee management system for Prime Star.
Built by Dikshit Academy under the service agreement dated 15 Oct 2026.

The design follows **Prime Star HRMS Architecture** (the PRD and cost plan predate it
where they disagree on stack or hosting).


## Layout

```
apps/
  web/        React 19 + Vite frontend (/admin, /portal, /onboard/:token)   Pratik
  api/        NestJS 11 REST API                                            Vinod
  worker/     pg-boss jobs: alerts, email, invoice PDFs, AI features        Ruchitha
packages/
  db/         Prisma 6 schema, migrations, seed and client (PostgreSQL 17)  Vinod
  shared/     Zod schemas, enums, permissions, money helpers, job contracts Shared
```

Owners are enforced through `.github/CODEOWNERS`.

### How the parts connect

- **Web and API** share request and response types through `packages/shared`. The API also publishes Swagger at `/api/docs`.
- **API and worker** never call each other. The API enqueues a pg-boss job, and the worker handles it. Job names and payload schemas live in `packages/shared/src/jobs.ts`.
- **Database:** only `packages/db` defines the schema and creates migrations. The API and worker import the client from `@primestar/db`.

### Branches

Feature branches (`feat/web-…`, `feat/api-…`, `feat/worker-…`) merge into `dev` by pull request.
`dev` merges into `staging` for the Friday demo, and `staging` merges into `main` (production) after sign-off.
Keep each pull request inside one owner's folders. If you need a change in another area, ask its owner.

`apps/web` was imported from `pratikkkarn/HRMS-PrimeStar` at commit `6d1246b`.
It still runs on mock data (`src/services/mockData.ts`) and will be switched to the API module by module.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 10 (`corepack enable`)
- A Neon `dev` branch connection string, a Cloudinary account and a Brevo API key (see `docs/backend-env.md`)
- Docker, only if you want an offline Postgres instead of Neon

## First-time setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
# fill in Neon, Cloudinary and Brevo values (docs/backend-env.md)
pnpm db:migrate                 # creates the first migration from packages/db/prisma/schema.prisma
pnpm db:seed                    # system roles and alert settings
pnpm dev                        # web on :3000, API on :4000, worker
```

- App: http://localhost:3000
- API health: http://localhost:3000/api/health (proxied) or http://localhost:4000/api/health
- API docs (non-production only): http://localhost:4000/api/docs

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds `shared` and `db`, then runs web, API, worker and the packages in watch mode |
| `pnpm dev:web` / `dev:api` / `dev:worker` | Runs one app on its own |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs all Vitest suites |
| `pnpm build` | Production build of every package |
| `pnpm db:migrate` | Creates and applies a Prisma migration |
| `pnpm db:seed` | Seeds roles and settings |
| `pnpm db:studio` | Opens Prisma Studio |

## Conventions

- **Money** is `Decimal(14,2)` in the database and a string on the wire. Use `toPaise`/`fromPaise` from `@primestar/shared` for arithmetic, never floats.
- **Dates** for business rules are plain dates compared in `Asia/Kolkata`.
- **Permissions** are checked in the API on every endpoint. Role defaults live in `packages/shared/src/permissions.ts` and are seeded into the database, where admins can change them.
- **No hard deletes** for POs, invoices or employees. Close, cancel or archive instead.
- **Audit** every change to POs, invoices, salaries, employees, roles and timesheets.

## Deployment

| Part | Service | Notes |
| --- | --- | --- |
| Web | Vercel, root directory `apps/web` | `apps/web/vercel.json` rewrites `/api/*` to Render. Set the real API host there. |
| API | Render web service (Singapore) | Build `pnpm install && pnpm --filter @primestar/api... build`, start `pnpm --filter @primestar/api start`, run `pnpm --filter @primestar/db prisma:deploy` before start. |
| Worker | Render background worker (Singapore) | Build `pnpm install && pnpm --filter @primestar/worker... build`, start `pnpm --filter @primestar/worker start`. Uses the direct database URL. |
| Database | Neon PostgreSQL (Singapore) | `main` branch for production, `dev` branch for local and staging. Pooled URL in `DATABASE_URL`, direct URL in `DIRECT_DATABASE_URL`. |
| Files | Cloudinary | Private (`authenticated`) uploads, signed links only. One folder per environment via `CLOUDINARY_FOLDER`. |
| Email | Brevo | Transactional API, sent only by the worker. `MAIL_FROM` must be a verified sender. |

Every environment variable, where to get it and where to set it is listed in `docs/backend-env.md`.

## Open items

- The API skeleton has only a health check. Phase 1 modules (auth, users-roles, files, projects, purchase-orders, billing, assignments, notifications, jobs, audit, employees) come next.
- The frontend still uses its own routing and role switcher. TanStack Router/Query, shadcn/ui and React Hook Form from the architecture doc are not adopted yet.
- `.github/CODEOWNERS` has placeholders for Vinod's and Anurag's GitHub usernames.
- The worker handles only `system.heartbeat` so far. Alerts, email, invoice PDFs and AI jobs are defined in `jobs.ts` but have no handlers yet.
- `apps/api` uses TypeScript 5.9 because NestJS relies on decorator metadata, and `apps/worker` and the packages match it. `apps/web` keeps the TypeScript 7 it was built with.
- Vercel Hobby does not allow commercial use, so production needs Vercel Pro.
