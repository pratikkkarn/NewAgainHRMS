# Backend architecture plan

> **Status: draft for review.** Nothing here is built yet. Comment on it, and once it's agreed, it becomes the reference for `apps/api` and `apps/worker`.

Related: [database-erd.md](database-erd.md) (data model and gaps), [backend-env.md](backend-env.md) (services, env vars, free-tier limits).

**Contents**
- Part A: The areas to design for
- Part B: Each area with its edge cases
- Part C: By phase
- Decisions needed

## Part A: The areas to design for

| # | Area | Why it matters here |
| --- | --- | --- |
| 1 | Module structure and request pipeline | Every feature follows the same pattern, so 4 people can build in parallel |
| 2 | Auth and sessions | Login, invites, resets, lockout, multiple tabs |
| 3 | Permissions and data scope | Who can do what, and who can see which rows |
| 4 | **Transactions** | Multi-table changes must save fully or not at all |
| 5 | **Concurrency (same PO, same employee)** | Two people working on the same PO must not break balances or numbering |
| 6 | Business rules and state machines | PO, invoice, proforma, assignment, timesheet and onboarding lifecycles |
| 7 | Money, GST and dates | Rupees and paise, IST dates, financial-year numbering |
| 8 | Files (Cloudinary) | Uploads, private access, orphan files |
| 9 | **Worker, jobs and email (parallel sending)** | Mail that never blocks or breaks a user action |
| 10 | Scheduled alerts | The daily PO scan, without duplicate alerts |
| 11 | Audit and notifications | Every change recorded, in-app alerts |
| 12 | Data import | CSV upload of POs and employees |
| 13 | Security | Aadhaar/PAN encryption, rate limits, data leaks |
| 14 | Free-tier performance | Neon cold starts, compute hours, Render sleep |
| 15 | Errors, logging and testing | One error format, Sentry, tests for concurrency |

---

## Part B: Each area with its edge cases

### 1. Module structure and request pipeline

```
Request → Helmet → Rate limit → AuthGuard → PermissionGuard → Zod validation
        → Controller → Service (business rules + transaction) → Prisma → Postgres
        → AuditLog / outbox job in the SAME transaction → Response
```

- One NestJS module per feature: `auth`, `users-roles`, `projects`, `purchase-orders`, `billing`, `assignments`, `files`, `notifications`, `audit`, `employees`, `import`, `settings`.
- Controllers stay thin. **All business rules live in services**, so they can be tested without HTTP.
- Request and response shapes are Zod schemas in `packages/shared`, used by both the frontend and the API.
- **One error format:** `{ code: 'PO_STALE_VERSION', message, details }`. The frontend shows the message and can branch on the code.
- Every list endpoint is **paginated** with filters and a sort order. Nothing returns all rows.

### 2. Auth and sessions

**Tokens: Bearer now, cookies later** (see the auth-strategy decision).

| | Access token | Refresh token |
| --- | --- | --- |
| Type | JWT signed with `JWT_ACCESS_SECRET` | Random 256-bit value. Only a hash is stored, in the `Session` table. |
| Lifetime | 15 minutes | 7 days, extended on each use |
| Frontend keeps it in | Memory | `localStorage` |
| Sent as | `Authorization: Bearer …` | Body of `POST /api/auth/refresh` only |

- **Rotation:** every refresh issues a new refresh token and retires the old one. If an old token is reused, all of that user's sessions are revoked.
- **One API client in the frontend** is the only place that attaches tokens. On a 401 it refreshes once, then retries.
- **The backend guard reads a cookie first and falls back to the Bearer header**, so the later switch to httpOnly cookies is small.

**Flows (matching the existing screens)**

| Flow | Endpoint | Rules |
| --- | --- | --- |
| Login | `POST /auth/login` | Email + password. One generic error message. **5 failures locks the account for 15 min.** Invited and disabled users are refused. |
| Invite | Admin creates a user in Users & Roles | User starts as `INVITED`. A link valid for **7 days** goes out by Brevo email. |
| Accept invite | `POST /auth/accept-invite` | User sets a password, becomes `ACTIVE` and is logged in |
| Forgot password | `POST /auth/forgot` | Always answers "if the account exists…". The link is valid for **60 min**. |
| Reset | `POST /auth/reset` | New password, **all sessions revoked** |
| Change password | `POST /auth/change-password` | Needs the current password. Other sessions are revoked. |
| Must change password | Guard rule | While the flag is set, only change-password and logout work |
| Me | `GET /auth/me` | Returns user, roles and permissions; the frontend's `can()` uses this |
| Logout | `POST /auth/logout` | Revokes the session |

**Password rules:** at least 8 characters, with upper case, lower case, a number and a special character. One Zod schema in `packages/shared` serves both the frontend and the API. Passwords are hashed with **argon2id**.

**Edge cases**

| Edge case | Handling |
| --- | --- |
| Two tabs refresh the token at the same moment | The old token gets a **30-second grace period** that returns the same new token. The frontend runs one refresh at a time and shares the result across tabs. Without this, the "reused token" check logs the user out. |
| User is disabled while their access token is still valid | The guard checks user status on each request (with a 60-second cache), so access stops within a minute, not after 15 |
| Admin changes a user's roles | The permission cache is cleared and the user's sessions are revoked |
| Attacker guesses emails to find which ones exist | Same message and same response time: hash a dummy password even when the user doesn't exist |
| Attacker deliberately locks out the CEO | Lock for only 15 min, log it, and notify admins. Rate-limit by IP as well. |
| Invite is sent again | The old invite link stops working; only the newest one is valid |
| Reset link is used twice, or is old | Single-use (`usedAt`) and expires after 60 min |
| Same email in different case | Store emails lowercase, with a unique index on the lowercase value |
| Disabling or demoting the last active CEO or HR Head | Blocked (Architecture doc: the system can't be locked out) |
| Someone changes their own role, salary or CTC limit, or approves their own request | Blocked: nobody approves their own changes |
| Someone deletes a role that users still have | Blocked; reassign those users first |
| Someone edits the locked CEO role | Blocked (`isLocked`) |
| Password changed or reset | All other sessions are revoked |
| User's email changes | Old reset links are invalidated; the user is notified at both the old and new address |

**Schema changes needed:** a `UserToken` table (`userId, kind INVITE/RESET, tokenHash, expiresAt, usedAt`), `User.name`, `User.mustChangePassword`, `Role.isLocked`, and drop or make optional `User.username`, since login is by email.

### 3. Permissions and data scope

- **Two checks on every request.**
  - The permission check: does this user have `po.edit`? That's done by the guard.
  - The data scope: is this PO in a project this user manages? That's done in the service, with a Prisma `where` clause.
- Every endpoint is **denied by default**. Only `@Public()` routes (login, forgot, reset, accept-invite) skip the guard.
- A user's permissions are the union of all their roles. They're loaded from the database with a short cache.
- **A project manager only sees their own projects** in lists, details, exports and the dashboard. The scope is applied in the shared query helper, so no screen can forget it.
- Salary, CTC and Aadhaar/PAN are **removed from responses** unless the user has the permission to see them.
- **IDOR protection:** every lookup is `findFirst({ id, ...scope })`, and a row outside the user's scope returns 404 rather than 403, so its existence isn't revealed.
- **⚠ The permission names must be unified.** The frontend uses 21 Phase 1 keys (`po.create`, `po.renew`, `po.close`, `invoice.override`, `proforma.edit`, `document.upload`, `user.manage`, `role.manage`, `settings.manage`, …), but `packages/shared/src/permissions.ts` has a different, coarser list. The proposal is to make the frontend's keys the Phase 1 list and add the HR and portal keys in later phases.

### 4. Transactions (all or nothing)

**Rule:** if one action writes more than one row, it goes in one `prisma.$transaction`. That includes the AuditLog row and the queued job.

| Action | What must succeed together |
| --- | --- |
| Create PO | PO + documents (File links) + audit + "PO created" notification |
| Renew PO | New PO + old PO status `RENEWED` + assignments moved to the new PO + audit |
| Issue invoice | Invoice + invoice lines + milestone marked `INVOICED` + proforma marked `INVOICED` + audit |
| Cancel invoice | Invoice `CANCELLED` + milestone back to `PENDING` + audit |
| Approve amendment | Amendment `APPROVED` + PO amount or dates updated + audit |
| Replace employee | Old assignment ends + new assignment created + `replacedById` link + audit |
| Invite user | User + UserToken + `mail.send` job + audit |
| Import CSV | All valid rows, or none |

Rules for transactions:
- **No outside calls (Cloudinary, Brevo) inside a transaction.** Upload first, then save the row; queue email jobs inside the transaction instead of sending.
- Keep transactions short. Set the Prisma transaction **timeout to 15 s**, because Neon's cold start can take a few seconds.
- With Neon's pooled connection (PgBouncer), use only **transaction-level** locks (`pg_advisory_xact_lock`), never session-level locks.

### 5. Concurrency (the same PO used by two people)

| Scenario | What goes wrong | Fix |
| --- | --- | --- |
| **Two users invoice the same PO at once.** The balance is ₹1L and each invoices ₹80K. | Both see ₹1L, both save, and the PO goes ₹60K negative | Inside the transaction, **lock the PO row** (`SELECT … FOR UPDATE`), recalculate the balance from the invoice rows, check it, insert, commit. The second user waits, then sees the real balance and gets "exceeds balance, override reason needed". |
| Two users edit PO details | The last save silently overwrites the first | **Optimistic lock:** `UPDATE … WHERE id = ? AND version = ?`. If no row matches, return **409 "This PO was changed by someone else, reload"**. |
| An amendment is approved while an invoice is being created | The balance is checked against the old amount | Both actions lock the same PO row, so they run one after the other |
| A PO is renewed twice | Two successor POs | `previousPoId` is **unique**, so the second attempt fails with 409 "already renewed" |
| Invoice numbers | Duplicates, or gaps that GST rules don't allow | A **counter table per financial year** (April–March), incremented with `UPDATE … RETURNING` inside the same transaction. A rollback also rolls back the number, so there are no gaps. Numbers stay at most 16 characters (a GST rule). |
| An employee is assigned twice with overlapping dates | Overlapping assignments, double billing | A **Postgres exclusion constraint** on the date range per employee and project (`btree_gist`). The database itself refuses the overlap. |
| An employee's total allocation goes over 100% across projects | Over-allocation | Lock the employee row (`FOR UPDATE`), add up the active allocations, then insert |
| A proforma is edited in two tabs | Lost changes | `version` check, same as the PO |
| Double-clicking "Submit" | Two invoices | The frontend disables the button. The API accepts an **`Idempotency-Key`** header: same key within 24 h returns the first result. |
| A PO is closed while someone is creating an invoice on it | An invoice on a closed PO | The invoice transaction locks the PO and re-checks its status after taking the lock |

### 6. Business rules and state machines

Each lifecycle is **one function that lists the allowed transitions**. Any other move returns 422 "Can't go from X to Y".

**PO** (`ACTIVE → EXHAUSTED / EXPIRED → RENEWED / CLOSED`):
- Invoicing above the balance or outside the PO dates needs `invoice.override` and a written reason.
- A credit note can't exceed what was invoiced. It increases the remaining balance.
- Expired is set by the daily job. The screens still work out "expiring soon" on the fly.
- Renewing creates a new PO linked by `previousPoId`, and the old one becomes Renewed and read-only.
  - **Renewed before the old PO ends:** the old PO moves to Renewed at once. Its unspent balance is not carried over unless the admin enters it on the new PO.
  - **Renewed after the old PO expired:** allowed. The work gap between the two is flagged on the project page.
  - **An exhausted PO can't be extended.** Staff add a new PO for the project instead.
  - Active assignments are copied to the new PO.
- A PO created with less than 60 days left gets its expiry alert on the next daily run.
- Amendments that would reduce the PO below what's already invoiced are blocked.
- POs are never deleted. The Delete button becomes Close (ERD gap 10).

**Invoice:** `ISSUED → PAID` or `ISSUED → CANCELLED`.
- Marking it paid needs a paid date, which can't be before the invoice date or in the future.
- A paid invoice can't be cancelled; issue a credit note instead. A paid invoice can be moved back to Issued with a reason, for example when it was marked paid by mistake.
- A cancelled invoice can't be edited and its number is never reused.
- A milestone can be linked to only one invoice.
- Credit notes are never "paid".

**Proforma:** `DRAFT → SENT → APPROVED → INVOICED`, with Cancel possible until it's invoiced. Editing after it's sent creates a new version. An invoiced proforma is locked.

**Assignment:**
- The end date can't be before the start date, and an assignment can't run past the PO's end date without a warning.
- Ending an assignment early prorates billing.
- A replacement starts the day after the old assignment ends.

**Billing calculation:** prorate by eligible days (calendar days, working days, or a manual count) × allocation %. Handle joining mid-month, leaving mid-month, and a 28/29-day February. This **one function, in `packages/shared`,** is used by both the API and the frontend preview, so the numbers always match.

### 7. Money, GST and dates

- **Money:** `Decimal(14,2)` in the database, a **string** in JSON, and integer paise for arithmetic. Never use JavaScript floats. Round once, at the line total.
- **GST:** IGST, or CGST + SGST split in half. When the total is odd, the rounding paisa goes to SGST.
- **Dates:**
  - Business dates are plain `DATE` values in **IST**.
  - "Today" means today in Asia/Kolkata, not the server's UTC time. A PO ending on 31 March is still active at 11 pm IST.
  - The financial year runs April to March.

### 8. Files (Cloudinary)

Recommended upload flow: **the browser uploads straight to Cloudinary**. This saves Render's 5 GB bandwidth.

```
1. Browser → API: "I want to upload X.pdf (2 MB)"   → API checks permission, type, size ≤ 10 MB
2. API → browser: signed upload params (folder, public_id, type=authenticated, expiry)
3. Browser → Cloudinary: uploads the file
4. Browser → API: "done, public_id = …"             → API verifies with Cloudinary (exists, size, type) → File row
5. Download: API checks permission → returns a signed URL valid for 5 minutes
```

| Edge case | Handling |
| --- | --- |
| Virus scanning | **Decided:** check the real file content (magic bytes) and size now. ClamAV comes once the worker runs as its own service, as the Architecture doc says. A file can't be opened until its check passes (`scanStatus = CLEAN`). |
| User uploads but never saves the form | A **daily cleanup job** deletes File rows that aren't linked to anything after 24 h, and their Cloudinary assets |
| File renamed from `.exe` to `.pdf` | Check the real type from Cloudinary's response; allow only **PDF, JPG and PNG** (Architecture doc) |
| Over 10 MB | Rejected in step 1, before anything is uploaded |
| A document is replaced | The old File row is kept (soft delete) so the audit trail still points at it |

### 9. Worker, jobs and email (parallel sending)

**The API never sends email itself.** It adds a job inside the same transaction as the action, so if the action fails, no email goes out, and if the action succeeds, the email is guaranteed to be queued.

```
API transaction:  save invoice + AuditLog + pg-boss job 'mail.send'   (one commit)
Worker:           picks jobs in batches → sends to Brevo in parallel (max 5 at once) → updates EmailLog
```

**How parallel sending works:**
- pg-boss gives the worker **10 jobs at a time** (`batchSize: 10`).
- The worker sends them with `Promise.allSettled`, **at most 5 at a time** (`p-limit`), so one slow email doesn't hold up the others and Brevo isn't flooded.
- Each job **succeeds or fails on its own**. One bad address doesn't fail the whole batch.
- Mail that needs to go to many people uses **one Brevo API call with up to 1,000 personalised recipients** (`messageVersions`), not 1,000 jobs.

| Email edge case | Handling |
| --- | --- |
| Brevo is down, or returns 429/5xx | **Retry up to 5 times with growing delays** (1 m, 2 m, 4 m…). After that it's marked failed and the admin sees it in a "failed emails" list. |
| Invalid email address (Brevo returns 400) | **No retry**: mark it failed and show it to the admin |
| **The 300/day free limit is reached** | The worker counts today's sent emails in `EmailLog`. Over the limit, jobs are **delayed until the next day at 8 am**, with priority rules: **login emails (invite, reset) always go first**, alert digests can wait. |
| The same alert is queued twice | Each job has a **dedupe key** (for example `reset:userId` once per minute, `po-expiry:PO123:2026-W42` once per week) |
| An email is sent but the worker crashes before marking it done | The job runs again, and the log is checked first. Worst case is one duplicate; nothing is lost. |
| The worker is asleep (Render free tier) | Jobs wait in Postgres. When an API request wakes the service, the worker picks them up. Reset and invite emails are sent right away, because the request that queues them also wakes the server. |
| Many alerts for one user | **One daily digest email per user**, not one email per PO |
| Templates | Kept in the repo (versioned and reviewed), rendered in the worker, with IST dates and ₹ formatting |
| Tracking | An `EmailLog` table records to, template, status, Brevo message ID, attempts and error |

**Other jobs on the same queue:**
- The daily alert scan.
- Invoice, proforma and offer-letter PDFs: HTML templates rendered by Puppeteer, on a Vercel function for now (see Decisions).
- The orphan-file cleanup.
- Large imports.

### 10. Scheduled alerts

- A free external cron (GitHub Actions) calls `POST /api/jobs/daily-scan` with a secret header **once a day at 09:00 IST** (Architecture doc). That wakes the app and queues the scan.
- The scan finds POs that are expiring (60 days), running low on balance (forecast run-out within 60 days), exhausted or expired, and milestones that are due (60 and 7 days ahead). It uses the thresholds from the `Setting` table.
- Each alert gets a dedupe key, so **re-running the scan never sends duplicates**. "Repeat weekly" puts the week number in the key.
- Recipients come from the alert settings. If a project has no manager, the alert falls back to the PO admin.
- If the cron misses a day, the next run catches up. Rules are based on dates ("within 60 days"), not on "exactly 60 days left".

### 11. Audit and notifications

- **Every change** to a PO, invoice, amendment, assignment, user or role writes `before` and `after` to `AuditLog`, in the same transaction. The app's database user can only INSERT and SELECT on that table.
- A reason is required for: invoice override, invoice cancellation, PO close, amendment, and assignment termination.
- The PO activity tab is a filtered view of `AuditLog`.
- In-app notifications are written by the worker, with a unique `(userId, dedupeKey)`.

### 12. Data import (CSV)

- **Step 1, validate only:** every row is checked (required fields, dates, amounts, duplicates in the file, duplicates in the database, unknown project or manager). The result is shown row by row.
- **Step 2, import:** only when there are 0 errors, in **one transaction**, so it's all or nothing.
- Limits: 5 MB and 2,000 rows. A file can't be imported twice (a hash of the file is stored).
- Employee managers are matched by name or code. If a name matches more than one person, that row is an error.

### 13. Security

- **Aadhaar/PAN:** AES-256-GCM encryption. Screens only see the last 4 digits. Viewing the full number needs a permission and is itself logged.
- **Rate limits:** auth endpoints at 10 requests/min per IP, everything else at 100/min per user (`@nestjs/throttler`).
- Input is validated by Zod on every endpoint. The frontend never renders user-supplied HTML.
- Invite and reset tokens are stored only as SHA-256 hashes and never logged.
- Stack traces are never returned in production. Swagger is off in production.
- Secrets live only in env vars, and different environments have different keys.

### 14. Free-tier performance

- **Neon:** keep the 15 s connect timeout, and limit the API to a **pool of about 5 connections**. Let the database sleep: no pinger, and have pg-boss poll slowly (every 30–60 s) and stop when idle.
- **Render:** the first request after sleeping takes about 1 minute. The frontend shows a "waking up the server…" message instead of an error.
- Watch for N+1 queries in lists by using Prisma `include` and `select`.
- The dashboard is built from **one aggregated query**, not by loading every PO.

### 15. Errors, logging and testing

- Every request gets an ID that shows up in the logs and in Sentry.
- `/api/health` checks the database too.
- **Unit tests:** money, GST, proration and the state machines (pure functions in `shared`).
- **Integration tests** run against real Postgres (CI already has it), and include **concurrency tests**: two invoices fired at once must result in one success and one balance error.
- **Auth tests:** lockout, token reuse, expired links, disabled user.

---

## Part C: By phase

| Phase | Backend focus | Extra edge cases |
| --- | --- | --- |
| **1. PO management** (now) | Auth, users and roles, projects, PO, amendments, invoices, proformas, milestones, assignments, files, alerts, import, audit | Everything in Part B |
| **2. Onboarding** | Public candidate form opened by a link (no login), HR review, offer letter PDF, candidate → employee conversion | The link expires or is forwarded to someone else. Drafts autosave. The form locks once submitted, and only "Return for correction" reopens it. A duplicate PAN means a rehire, matched by `lookupHash`. Turning a candidate into an employee (Employee + EmploymentPeriod + User invite) is **one transaction**. An offer above the CTC limit needs approval. |
| **3. Employee portal** | Timesheets, payslips, profile change requests, salary views | A timesheet can't be submitted for dates after the last working day or before joining, and must account for holidays. If the approver leaves, timesheets go to their manager. Edits after approval need an unlock request. Payslips are visible **only to their owner** and open through 5-minute signed links. A bulk payslip upload is matched to employees by code, and unmatched files are reported. Profile changes are applied only after approval, in one transaction with the audit entry. |

---

## Decisions

Decided by following the client's documents where they cover the point, and the recommendation where they don't.

| # | Question | Decision | Source |
| --- | --- | --- | --- |
| 1 | Can an assignment exist without a PO? | **Yes.** `Assignment.poId` is optional. Assignments without a PO show as "Unbilled: no PO" on the dashboard and in the daily alert. | Recommendation |
| 2 | Invoice payment tracking? | **In scope, kept small:** `PAID` status, paid date, who marked it. No part payments. | Recommendation |
| 3 | Delete PO? | **No hard delete.** Replace the button with Close PO plus a reason. | Architecture doc: records with history are never hard-deleted |
| 4 | GST type? | **Pre-filled from the client's GSTIN state vs Prime Star's state, and editable** | Architecture doc lists `gstType` on the PO; how it's chosen is the recommendation |
| 5 | Virus scanning? | **File-content check now, ClamAV later** when the worker is its own service | Architecture doc |
| 6 | Microsoft SSO? | **Hide the button.** Logins are issued by the company. | Architecture doc: "no social login" |
| 7 | Worker? | **Runs inside the API process**, and moves to its own service later with no code change | Architecture doc |
| 8 | Web hosting? | **Vercel**, deployed by GitHub Actions with the Vercel CLI, because the org-owned repo can't use Vercel's Git integration on the free plan | Recommendation |

### Still open

- ~~Auth tokens~~ **Decided: Bearer now, cookies later.** The Architecture doc specifies httpOnly cookies + CSRF; the team keeps Bearer for Phase 1. The guard already reads a cookie first and falls back to the header, so the switch is small.
- **PDF generation (recommended).** Keep **HTML templates + Puppeteer**, as the Architecture doc says. That's the better long-term choice, because HR can edit templates and layouts match the approved documents exactly. Chromium doesn't fit in Render free's 512 MB, so for now it runs as a **Vercel serverless function** (2 GB memory, `@sparticuz/chromium`), protected by a secret header: the worker sends the filled HTML and gets the PDF back. When the worker becomes its own service, rendering moves there. Code calls a `PdfRenderer` interface, so only config changes. `pdf-lib` was rejected because every template would need rewriting later.
