# Backend environment setup

The backend (`apps/api`, `apps/worker`, `packages/db`) uses three outside services:

| Service | Used for | Used by |
| --- | --- | --- |
| **Neon** | PostgreSQL 17 database, plus the pg-boss job queue | API, worker, Prisma CLI |
| **Cloudinary** | Uploaded documents (SOWs, quotes, POs) and invoice PDFs | API, worker |
| **Brevo** | Transactional email (alerts, invites, password resets) | Worker only |

Secrets never go in Git. Only `.env.example` files are committed. Keep the real values in the team password manager and in the hosting dashboards.

## Environments

| Environment | Git branch | Neon branch | Cloudinary folder | Where the values live |
| --- | --- | --- | --- | --- |
| Local | feature branches | `dev` | `primestar-hrms/dev` | `apps/api/.env`, `apps/worker/.env`, `packages/db/.env` |
| Staging | `staging` | `staging` | `primestar-hrms/staging` | Render env vars on the staging services |
| Production | `main` | `main` | `primestar-hrms/prod` | Render env vars on the production services |

Each environment gets its own JWT secrets, field encryption key and API keys. Never reuse production values locally.

## Free-tier limits

Checked October 2026. Re-check each provider's page before go-live, because these change.

| Service | Limit | What it means for us |
| --- | --- | --- |
| **Neon** | 1 GB storage per project, 10 branches, 100 CU-hours compute per project per month, 5 GB egress, scale to zero after 5 min idle (can't be disabled), 6 h restore window | 1 GB holds years of PO/HR rows. **Compute is the tight one:** the smallest size (0.25 CU) running 24/7 uses about 180 CU-hours, so the database must be allowed to sleep. No always-on pinger, and pg-boss must not keep polling 24/7. |
| **Cloudinary** | 25 credits/month (1 credit = 1 GB storage, or 1 GB bandwidth, or 1,000 transformations), 10 MB per image or raw file (PDF, DOCX), 100 MB per video, 3 users | Reject uploads over 10 MB in the API. Plenty for PO/SOW/invoice documents. |
| **Brevo** | 300 emails/day (marketing and transactional combined) | Send one daily digest per user instead of one email per alert. |
| **Render** (API) | Web services only: **no background workers, no cron jobs, no pre-deploy command**. Spins down after 15 min without traffic (about 1 min to wake), 750 instance hours/month per workspace, about 5 GB outbound bandwidth, 500 build minutes/month, no persistent disk, outbound SMTP ports blocked | Run migrations in the start command. Run the worker inside the API process. Use Brevo's HTTP API, never SMTP. Don't write files to local disk. |
| **Vercel** (web) | Hobby: 100 GB transfer/month, 100 deployments/day, 1M function invocations. **Can't connect to repos owned by a GitHub organization**, and Hobby is for non-commercial use | Our repo is in the `PrimeStar-HRMS-Portal` org, so Git auto-deploys won't connect. Deploy the web from GitHub Actions with the Vercel CLI, or host it as a Render static site or on Cloudflare Pages. |
| **GitHub Actions** | 2,000 minutes/month for private repos on GitHub Free | CI (typecheck, test, build) uses a few minutes per run. |
| **Sentry** | 5,000 errors/month, 1 user | Enough for error alerts. |

**Scheduled jobs (daily PO alerts):** since nothing can stay awake for free, a free external scheduler (GitHub Actions `schedule`, or cron-job.org) calls one protected API endpoint once a day, for example at 08:00 IST. That wakes Render and Neon, runs the scan, queues the emails, and lets everything sleep again.

---

## 1. Neon (database)

1. Sign in at https://console.neon.tech with the shared team account.
2. **New project**
   - Name: `primestar-hrms`
   - Postgres version: **17**
   - Region: **AWS Asia Pacific (Singapore)**, the same region as Render
3. Under **Databases**, create the database `primestar_hrms` (or rename the default `neondb`).
4. Under **Branches**, `main` already exists and is production. Create `dev` and `staging` from `main`.
5. Click **Connect**, choose the branch, database `primestar_hrms` and the owner role, then copy two strings:
   - With **Connection pooling** on, the host contains `-pooler`. This is `DATABASE_URL`.
   - With **Connection pooling** off, you get the direct host. This is `DIRECT_DATABASE_URL`.
6. Add `&connect_timeout=15` after `?sslmode=require` on both. Neon suspends idle compute, and the first query after a pause needs a few seconds to wake it.

Which URL each part uses:

| Variable | API | Worker | Prisma CLI |
| --- | --- | --- | --- |
| `DATABASE_URL` (pooled) | yes | no | yes |
| `DIRECT_DATABASE_URL` (direct) | yes | yes, because pg-boss needs a session connection | yes, migrations run on it |

Then run the first migration against the `dev` branch:

```bash
pnpm db:migrate     # creates and applies the first migration
pnpm db:seed        # system roles and alert settings
```

---

## 2. Cloudinary (files)

1. Sign up at https://cloudinary.com and open the **Console**.
2. Copy the **Cloud name** from the dashboard. This is `CLOUDINARY_CLOUD_NAME`.
3. Go to **Settings (gear icon) > API Keys > Generate New API Key**. Make one key per environment, named `hrms-dev`, `hrms-staging` and `hrms-prod`. Each key gives you:
   - API Key, which is `CLOUDINARY_API_KEY`
   - API Secret, which is `CLOUDINARY_API_SECRET`
4. Go to **Settings > Security** and switch on **Allow delivery of PDF and ZIP files**. New accounts block PDF delivery by default, so invoices and POs would fail to open without it.
5. Set `CLOUDINARY_FOLDER` to `primestar-hrms/<env>`.

Rules for the code (these come from the architecture doc):
- Upload with `type: 'authenticated'` so files are never public. Store the returned `public_id` in `File.storageKey`.
- Hand out short-lived signed URLs only, and only once `scanStatus` is `CLEAN`.
- Cloudinary limits a single file to about 10 MB, so the API should reject larger uploads with a clear message.

---

## 3. Brevo (email)

1. Sign up at https://www.brevo.com with a company mailbox, not a personal Gmail.
2. **Get the API key:** open the account menu (top right) and go to **SMTP & API > API Keys > Generate a new API key**. Name it `hrms-prod` (or `hrms-staging` / `hrms-dev`). The key starts with `xkeysib-` and is shown only once, so save it straight into the password manager. This is `BREVO_API_KEY`.
3. **Verify a sender:** go to **Senders, Domains & Dedicated IPs > Senders > Add a sender** and confirm the email Brevo sends you. That address is `MAIL_FROM`, and `MAIL_FROM_NAME` is the display name.
4. **Authenticate the domain** once Prime Star's domain is available: go to **Domains > Add a domain** and add Brevo's TXT, DKIM and DMARC records to the domain's DNS. Until then, mail from the verified sender works but is more likely to land in spam.
5. **Authorised IPs:** under **Security > Authorised IPs**, leave IP blocking off. Render's outgoing IPs change, and blocked calls fail silently from the app's point of view.

Brevo's free plan allows 300 emails a day. The worker should batch daily alert emails (one digest per user) to stay well under that.

Emails are sent by `packages/mail`. In development, use a real address you can read to see a delivery: addresses on test domains (`.test`, `example.com`) are skipped on purpose.

Locally you can leave `BREVO_API_KEY` empty, and the worker logs emails instead of sending them. In production the worker refuses to start without a key.

---

## 4. Secrets you generate yourself

Run each command once **per environment**:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY (Aadhaar/PAN encryption)
```

`FIELD_ENCRYPTION_KEY` is permanent. If the production key is lost or changed, the encrypted Aadhaar and PAN values can no longer be read, so store it in the password manager the moment you create it.

---

## 5. Where each variable goes

### Local (`.env` files, gitignored)

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
```

`packages/db/.env` holds the same two database URLs as `apps/api/.env`.

### Production and staging (Render dashboard > service > Environment)

**API web service**

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | the Vercel URL, e.g. `https://primestar-hrms.vercel.app` |
| `DATABASE_URL` | Neon `main` (or `staging`), pooled |
| `DIRECT_DATABASE_URL` | Neon `main` (or `staging`), direct |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | generated for this environment |
| `FIELD_ENCRYPTION_KEY` | generated for this environment; required in production |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | the key for this environment |
| `CLOUDINARY_FOLDER` | `primestar-hrms/prod` (or `/staging`) |
| `RUN_WORKER` | `true` (the worker runs inside the API on the free tier) |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | needed by the in-process worker; required in production |
| `JOB_TRIGGER_SECRET` | `openssl rand -hex 32`; the same value goes in the GitHub secret `DAILY_JOB_SECRET` |
| `SENTRY_DSN` | optional |

Render sets `PORT` itself, so leave it out.

**Worker**

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DIRECT_DATABASE_URL` | Neon `main` (or `staging`), direct |
| `BREVO_API_KEY` | the key for this environment; required in production |
| `MAIL_FROM` / `MAIL_FROM_NAME` | the verified sender |
| `CLOUDINARY_*` | same as the API |
| `SENTRY_DSN` | optional |

**Vercel (web)** needs no secrets. Replace `REPLACE-WITH-RENDER-API.onrender.com` in `apps/web/vercel.json` with the real Render API host.

**GitHub Actions secrets** (repo Settings > Secrets and variables > Actions):

| Secret | Used by |
| --- | --- |
| `DAILY_JOB_SECRET` | The 09:00 IST workflow that calls `POST /api/jobs/daily-alerts` (same value as `JOB_TRIGGER_SECRET`) |
| `API_BASE_URL` | That workflow, e.g. `https://<web>.vercel.app/api` |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | The web deploy workflow (Vercel CLI), since the org repo can't use Vercel's Git integration on the free plan |

CI itself needs no secrets. It runs against its own throwaway Postgres container.

**Backups.** Neon's free plan keeps only a 6-hour restore window. A nightly GitHub Actions job should run `pg_dump` on production and keep the dump as a private workflow artifact (90-day retention), using a `BACKUP_DATABASE_URL` secret.

---

## 6. Production checklist

- [ ] Neon project in Singapore, with branches `main`, `staging` and `dev`. Migrations are applied to each through `prisma migrate deploy`.
- [ ] Cloudinary: three API keys, PDF delivery switched on, uploads `authenticated` only.
- [ ] Brevo: production API key, verified sender, domain authenticated once the domain exists, IP blocking off.
- [ ] Fresh JWT secrets and encryption key for production, saved in the password manager.
- [ ] Render API: env vars set. Migrations run on deploy: start command `pnpm --filter @primestar/db prisma:deploy && pnpm --filter @primestar/api start`.
- [ ] Render worker: env vars set and starting cleanly. Logs show `[worker] started`.
- [ ] `vercel.json` rewrite points at the real API host, and `/api/health` answers through the Vercel URL.
- [ ] Swagger (`/api/docs`) is not reachable in production. It is disabled when `NODE_ENV=production`.
