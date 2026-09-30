# Oment Backend (Express + MongoDB)

REST API for the Oment admin and employee apps: projects, tasks, timers, attendance tracking, leave, piece-rate wallet, invoices, profitability, notices, chat, emails for every event, and automatic reminders.

## Quick start

```bash
npm install
cp .env.example .env        # then edit MONGO_URI, JWT_SECRET, ADMIN_PASSWORD, SMTP_*
npm start                   # http://localhost:5000/api/health
```

Needs Node.js 20+ and MongoDB 5+ (local, Docker or Atlas).

On the first start with an **empty** database the server creates the demo company (`SEED_DEMO_DATA=true`) or a blank one (`false`).

Demo logins:
- **Admin:** from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).
- **Employees:** `alex`, `priya`, `rohan` … with password `oment123`.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the API |
| `npm run dev` | Start with auto-restart (nodemon) |
| `npm run seed` | Wipe and load the demo company (asks for `--yes` if data exists) |
| `npm run seed -- --empty --yes` | Wipe and start a blank company (only the admin login) |
| `npm run verify` | Check MongoDB, data, routes, admin email, SMTP login, weak secrets |
| `npm test` | Full API test (all 165 endpoints, emails, trackers) on a throw-away `<db>_test` database |

## .env

All settings live in `.env`; see `.env.example` for comments.

| Key | Required | Meaning |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `MONGO_DB_NAME` | | Database name (overrides the one in the URI) |
| `MONGO_TRANSACTIONS` | | `auto` (default), `on`, `off` |
| `SEED_DEMO_DATA` | | First start on an empty DB: demo (`true`) or blank (`false`) company |
| `JWT_SECRET` | yes | 32+ random characters |
| `JWT_EXPIRES` | | Token lifetime, default `12h` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | yes | Admin login. Re-applied only when you change them in `.env`, so a password changed in the app is not overwritten on restart |
| `ADMIN_EMAIL` | | Where admin emails go; falls back to Settings → Billing email |
| `PORT` | | Default `5000` |
| `CORS_ORIGIN` | | Frontend addresses allowed to call the API, comma-separated |
| `APP_URL` | | Frontend base URL, used for links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | | Email sending. Empty host = emails are printed in the console |
| `EMAIL_ENABLED` | | Master switch, default `true` |
| `TIMEZONE` | | Company time zone for dates and reminders, default `Asia/Kolkata` |
| `SCHEDULER_ENABLED` | | Automatic reminders on or off |
| `CRM_WEBHOOK_SECRET` | | Secret for `POST /api/integrations/crm/deal-won` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | | Een AI answers. The key stays on the server |

## Folder structure

```
index.js                     start server, scheduler, graceful shutdown
src/
  app.js                     express app: helmet, cors, json, logging, routes, errors
  bootstrap.js               connect MongoDB → load data → start engine → admin login
  config/   env.js db.js     .env reading/validation, Mongoose connection
  models/                    one Mongoose model per collection (24) + Meta, Credential, PasswordReset
  routes/                    one router per module (auth, employees, projects, hrm, wallet …)
  controllers/               one controller per module
  middleware/                auth (protect, adminOnly), rate limit, 404 + error handler
  services/
    store.service.js         MongoDB persistence (diff → minimal writes, transactions)
    engine.service.js        business rules from shared/*.js
    access.service.js        who may call what, one unit of work per request
    auth.service.js          login, JWT, bcrypt, forgot/reset password
    email.service.js         outbox, SMTP worker, retries, settings
    events.service.js        which event sends which email
    scheduler.service.js     reminders + email worker
    attendance.service.js    live work tracker (heartbeat, punch-out, live board)
    pdf.service.js           GST invoice PDF
    snapshot.service.js      role-filtered data for the frontend
    admin / crm / een        workspace reset, CRM webhook, AI proxy
  utils/                     ApiError, asyncHandler, logger, engineHandler, listRoutes
shared/                      business engine (same code the frontend uses)
scripts/  seed.js verify.js
test/     api.test.js        full endpoint test
```

**How a request works.** A route calls its controller, which calls `access.service`. There the guard checks the role and scope, the engine method runs, emails are queued, and the changed rows are written to MongoDB. The response is sent only after the database has stored the change. If anything fails, nothing is saved.

## MongoDB collections

- **Lists:** `employees`, `departments`, `projects`, `milestones`, `deliverables`, `subtasks`, `time_entries`, `attendance`, `invoices`, `notices`, `conversations`, `calendar_events`, `notifications`, `activity`, `call_logs`, `holidays`, `leave_requests`, `regularisations`, `comp_off_ledger`, `wallet_entries` (append-only), `disputes`, `outbox` (emails).
- **Settings:** `meta` holds company settings and policies.
- **Logins:** `credentials` holds bcrypt hashes; `password_resets` expires automatically.

**Upgrading from the old single-document backend:** if the database still has the old `app_state` document and `auth` collection, they are copied into these collections automatically on first start. The old documents are left as a backup.

## Emails

Every email is queued in `outbox` together with the change that caused it. A worker sends queued mail every 15 seconds and retries failures after 1 minute, 5 minutes, 15 minutes, 1 hour and 6 hours. Admin can switch categories on or off (`PATCH /api/settings/email`), see the log (`GET /api/emails`), retry failed mail and send a test email.

| Category | Sent when |
|---|---|
| account | Welcome with login details, admin password reset, password changed, forgot-password link, deactivated / reactivated |
| tasks | Task assigned / reassigned, submitted, approved, returned (with reason), comments, subtask approved / returned, milestone complete, self-assigned task |
| estimates | Estimate accepted, proposed, flagged, countered, accepted; task blocked / unblocked |
| wallet | Credit, bonus, adjustment, payout, dispute raised / answered |
| leave | Leave applied, approved, declined, cancelled; comp-off credited; holiday added |
| attendance | Regularisation requested, approved, declined |
| projects | Added to / removed from a project |
| notices | Notice sent (with the full text) |
| messages | New chat message (at most one email per conversation every 10 minutes) |
| calendar | Event with `attendeeIds` or `allEmployees: true` |
| invoices | Invoice to client with PDF attached, payment receipt, cancellation |
| reminders | See the schedule below |
| digest | Daily admin summary |

**Reminder schedule** (in `TIMEZONE`; each runs once per day even after a restart):

| Time | Reminder |
|---|---|
| 09:00 | Missed log-out yesterday |
| 09:30 | Overdue tasks, to each employee and a summary to admin |
| 10:00 | Overdue invoices, to the client every 3 days with the PDF |
| 11:00 | Not logged in on a working day (not on leave), to the employee and admin |
| 18:00 | Leave starting tomorrow |
| 19:00 | Admin daily summary of everything waiting |
| Every hour | Timer running over 10 hours |

Gmail: set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`, and `SMTP_PASS` to a 16-character *App password* (Google account → Security → App passwords).

## Deploying

1. Set `NODE_ENV=production`. The server refuses to start with a short `JWT_SECRET` or the default admin password.
2. Put the frontend URL in `CORS_ORIGIN` and `APP_URL`.
3. Run behind a reverse proxy (nginx) or on a host like Render or Railway. Use MongoDB Atlas for transactions and backups.
4. Run `npm run verify` after deploying.

Full endpoint list: **API.md**. Engine method list for `/api/rpc`: **DATAAPI.md**.


## Payments and milestone time rules

Milestones can store an employee budget, estimated hours, slab reduction percentage, minimum payout floor, slab size, and grace period. Deliverables created from a configured milestone inherit those values unless an explicit task value is supplied. The current payout preview is updated from tracked task time.

Invoice emails are generated from the outbox and the Send Invoice endpoint now drains the mail queue immediately before returning its delivery status. Configure SMTP in `.env`; no source-code mail credentials are required.
