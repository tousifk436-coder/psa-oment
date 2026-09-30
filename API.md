# Oment API reference

Base URL: `http://localhost:5000/api` (set `PORT` in `.env`).

**Auth.** Everything except `/health`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` and `/integrations/*` needs:

```
Authorization: Bearer <token from POST /api/auth/login>
```

**Responses.**

```
200  { "ok": true, "result": …, "snapshot": … }   snapshot = fresh role-filtered data, sent after every change
4xx  { "error": { "code": "VALIDATION", "message": "…" } }
```

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION, BAD_JSON | 400 | Wrong or missing input |
| AUTH | 401 | Not logged in, bad password, expired token, deactivated account |
| FORBIDDEN | 403 | Logged in but not allowed (e.g. employee calling an admin endpoint) |
| NOT_FOUND | 404 | No such record or endpoint |
| DUPLICATE, CONFLICT, INVALID_STATE, NOT_AGREED, BLOCKED, WIP_LIMIT, WINDOW_CLOSED, ALREADY_INVOICED, INSUFFICIENT_BALANCE, HAS_DEPENDENTS, IMMUTABLE | 409 | Business rule refused the action |
| LOCKED | 423 | Record can't change (e.g. wallet ledger, approved task price) |
| RATE_LIMIT | 429 | Too many login / reset attempts |
| NOT_CONFIGURED, DB_UNAVAILABLE | 503 | Feature needs setup / database write failed |

**Employees vs admin.** The same endpoints serve both. Employees are automatically limited to their own data: ids they pass for someone else are replaced with their own, admin-only endpoints answer 403, and money fields are hidden unless *Wallet policy → show money to employees* is on.

**RPC.** `POST /api/rpc { "api": "DataAPI" | "HRM" | "Wallet" | "Profit" | "EenSignals", "method": "…", "args": [ … ] }` runs any engine method with the same rules as REST. Method names and arguments are listed in `DATAAPI.md`. The frontend uses this for every button.

## All endpoints

### root

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Service info |

### health

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Health check (public) |

### auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | { username, password } → { token, role, user, mustChange } |
| POST | `/api/auth/forgot-password` | { username } (username or email) → emails a reset link |
| POST | `/api/auth/reset-password` | { token, newPassword } |
| POST | `/api/auth/logout` | Stateless — client drops the token |
| GET | `/api/auth/me` | Current user + profile |
| POST | `/api/auth/change-password` | { oldPassword, newPassword } |

### integrations

| Method | Path | Notes |
|---|---|---|
| POST | `/api/integrations/crm/deal-won` | CRM webhook (X-Webhook-Secret) → creates project + milestones |
| GET | `/api/integrations/crm/accounts/:accountId/health` | Delivery + billing health for a CRM account |
| GET | `/api/integrations/crm/sample` | Example deal payload |

### snapshot

| Method | Path | Notes |
|---|---|---|
| GET | `/api/snapshot` | Everything this user may see (role-filtered) |

### rpc

| Method | Path | Notes |
|---|---|---|
| POST | `/api/rpc` | { api, method, args } — runs any engine method (used by the frontend) |

### settings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings` |  |
| PATCH | `/api/settings` |  |
| GET | `/api/settings/email` | Email on/off, categories, admin email, SMTP status |
| PATCH | `/api/settings/email` | { enabled, adminEmail, categories: { tasks: false … } } |

### emails

| Method | Path | Notes |
|---|---|---|
| GET | `/api/emails` | Email log ?status=&category=&to=&page=&limit= |
| POST | `/api/emails/test` | { to } send a test email |
| POST | `/api/emails/process` | Send queued emails now |
| GET | `/api/emails/:id` | One email incl. HTML |
| POST | `/api/emails/:id/retry` | Queue a failed email again |

### admin

| Method | Path | Notes |
|---|---|---|
| POST | `/api/admin/reset` | { mode: "demo"|"empty", confirm: "RESET" } wipe all data |
| GET | `/api/admin/scheduler` | Reminder jobs + last run |
| POST | `/api/admin/scheduler/:job/run` | Run a reminder job now |

### employees

| Method | Path | Notes |
|---|---|---|
| GET | `/api/employees` |  |
| POST | `/api/employees` |  |
| GET | `/api/employees/:id` |  |
| PATCH | `/api/employees/:id` |  |
| DELETE | `/api/employees/:id` |  |
| GET | `/api/employees/:id/score` |  |

### departments

| Method | Path | Notes |
|---|---|---|
| GET | `/api/departments` |  |
| POST | `/api/departments` |  |
| PATCH | `/api/departments/:id` |  |
| DELETE | `/api/departments/:id` |  |

### projects

| Method | Path | Notes |
|---|---|---|
| GET | `/api/projects` |  |
| POST | `/api/projects` |  |
| GET | `/api/projects/:id` |  |
| PATCH | `/api/projects/:id` |  |
| DELETE | `/api/projects/:id` |  |
| POST | `/api/projects/:id/members` |  |
| DELETE | `/api/projects/:id/members/:empId` |  |
| GET | `/api/projects/:id/progress` |  |

### milestones

| Method | Path | Notes |
|---|---|---|
| GET | `/api/milestones` |  |
| POST | `/api/milestones` |  |
| PATCH | `/api/milestones/:id` |  |
| DELETE | `/api/milestones/:id` |  |
| GET | `/api/milestones/:id/progress` |  |

### deliverables

| Method | Path | Notes |
|---|---|---|
| GET | `/api/deliverables` |  |
| POST | `/api/deliverables` |  |
| GET | `/api/deliverables/:id` |  |
| PATCH | `/api/deliverables/:id` |  |
| DELETE | `/api/deliverables/:id` |  |
| POST | `/api/deliverables/:id/submit` |  |
| POST | `/api/deliverables/:id/approve` |  |
| POST | `/api/deliverables/:id/reject` |  |
| POST | `/api/deliverables/:id/reassign` |  |
| POST | `/api/deliverables/:id/comments` |  |
| POST | `/api/deliverables/:id/files` |  |
| DELETE | `/api/deliverables/:id/files/:index` |  |
| GET | `/api/deliverables/:id/subtasks` |  |

### subtasks

| Method | Path | Notes |
|---|---|---|
| POST | `/api/subtasks` |  |
| PATCH | `/api/subtasks/:id` |  |
| POST | `/api/subtasks/:id/approve` |  |
| POST | `/api/subtasks/:id/reject` |  |
| DELETE | `/api/subtasks/:id` |  |

### time

| Method | Path | Notes |
|---|---|---|
| POST | `/api/time/start` |  |
| POST | `/api/time/stop` |  |
| GET | `/api/time/open` |  |

### attendance

| Method | Path | Notes |
|---|---|---|
| GET | `/api/attendance` |  |
| GET | `/api/attendance/today` | Own attendance record for today |
| GET | `/api/attendance/live` | Admin: who is working / idle / on break now |
| POST | `/api/attendance/ensure-today` |  |
| POST | `/api/attendance/heartbeat` | { sessionSecs, activeSecs, idleSecs, perDeliverableSecs, onBreak, currentDeliverableId } every ~15 s |
| POST | `/api/attendance/punch-out` | Same totals → logout time, half-day, stops timer |
| POST | `/api/attendance/break` |  |
| PATCH | `/api/attendance/:id` |  |

### invoices

| Method | Path | Notes |
|---|---|---|
| GET | `/api/invoices` |  |
| POST | `/api/invoices` |  |
| GET | `/api/invoices/peek-number` |  |
| GET | `/api/invoices/uninvoiced-milestones` |  |
| GET | `/api/invoices/:id/pdf` | GST invoice PDF (?inline=1 to view) |
| PATCH | `/api/invoices/:id` |  |
| POST | `/api/invoices/:id/send` |  |
| POST | `/api/invoices/:id/payment` |  |
| POST | `/api/invoices/:id/cancel` |  |
| DELETE | `/api/invoices/:id` |  |

### notices

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notices` |  |
| POST | `/api/notices` |  |
| PATCH | `/api/notices/:id` |  |
| POST | `/api/notices/:id/send` |  |
| POST | `/api/notices/:id/read` |  |
| DELETE | `/api/notices/:id` |  |

### conversations

| Method | Path | Notes |
|---|---|---|
| GET | `/api/conversations` |  |
| POST | `/api/conversations/:id/messages` |  |
| POST | `/api/conversations/:id/read` |  |

### calendar

| Method | Path | Notes |
|---|---|---|
| GET | `/api/calendar` |  |
| POST | `/api/calendar` |  |
| DELETE | `/api/calendar/:id` |  |

### notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications` |  |
| POST | `/api/notifications/read-all` |  |
| POST | `/api/notifications/:id/read` |  |

### hrm

| Method | Path | Notes |
|---|---|---|
| GET | `/api/hrm/policy` |  |
| PATCH | `/api/hrm/policy` |  |
| GET | `/api/hrm/holidays` |  |
| POST | `/api/hrm/holidays` |  |
| DELETE | `/api/hrm/holidays/:id` |  |
| GET | `/api/hrm/balances/:employeeId` |  |
| POST | `/api/hrm/comp-off` |  |
| GET | `/api/hrm/leave` |  |
| POST | `/api/hrm/leave` |  |
| POST | `/api/hrm/leave/:id/approve` |  |
| POST | `/api/hrm/leave/:id/reject` |  |
| POST | `/api/hrm/leave/:id/cancel` |  |
| GET | `/api/hrm/regularisations` |  |
| POST | `/api/hrm/regularisations` |  |
| POST | `/api/hrm/regularisations/:id/approve` |  |
| POST | `/api/hrm/regularisations/:id/reject` |  |
| GET | `/api/hrm/today-board` |  |
| GET | `/api/hrm/register` |  |
| GET | `/api/hrm/timesheet` |  |
| GET | `/api/hrm/utilisation` |  |
| GET | `/api/hrm/working-days` |  |

### profit

| Method | Path | Notes |
|---|---|---|
| GET | `/api/profit/settings` |  |
| PATCH | `/api/profit/settings` |  |
| POST | `/api/profit/rates/:employeeId` |  |
| GET | `/api/profit/rate-coverage` |  |
| GET | `/api/profit/projects/:id` |  |
| GET | `/api/profit/portfolio` |  |
| GET | `/api/profit/by-client` |  |
| GET | `/api/profit/by-employee` |  |
| GET | `/api/profit/alerts` |  |
| GET | `/api/profit/loaded-rate/:employeeId` |  |

### activity

| Method | Path | Notes |
|---|---|---|
| GET | `/api/activity` |  |

### call

| Method | Path | Notes |
|---|---|---|
| GET | `/api/call-logs` |  |

### kpis

| Method | Path | Notes |
|---|---|---|
| GET | `/api/kpis` |  |

### revenue

| Method | Path | Notes |
|---|---|---|
| GET | `/api/revenue-series` |  |

### wallet

| Method | Path | Notes |
|---|---|---|
| GET | `/api/wallet/policy` |  |
| PATCH | `/api/wallet/policy` |  |
| GET | `/api/wallet/can-start` |  |
| POST | `/api/wallet/pricing/:deliverableId` |  |
| POST | `/api/wallet/agreement/:deliverableId/accept` |  |
| POST | `/api/wallet/agreement/:deliverableId/propose` |  |
| POST | `/api/wallet/agreement/:deliverableId/flag` |  |
| POST | `/api/wallet/agreement/:deliverableId/accept-proposal` |  |
| POST | `/api/wallet/agreement/:deliverableId/counter` |  |
| GET | `/api/wallet/agreement/:deliverableId/hint` |  |
| POST | `/api/wallet/block/:deliverableId` |  |
| POST | `/api/wallet/unblock/:deliverableId` |  |
| GET | `/api/wallet/blocked` |  |
| GET | `/api/wallet/settlement-preview/:deliverableId` | What approval would pay now |
| GET | `/api/wallet/slab-preview/:deliverableId` | Live late-slab preview ?loggedSecs= |
| GET | `/api/wallet/:employeeId` |  |
| GET | `/api/wallet-ledger` |  |
| POST | `/api/wallet-entries` |  |
| GET | `/api/wallet-disputes` |  |
| POST | `/api/wallet-disputes` |  |
| POST | `/api/wallet-disputes/:id/resolve` |  |
| GET | `/api/wallet-company-summary` |  |
| GET | `/api/wallet-estimate-behaviour` |  |
| GET | `/api/wallet-outbox` |  |

### focus

| Method | Path | Notes |
|---|---|---|
| GET | `/api/focus-queue/:employeeId` |  |

### een

| Method | Path | Notes |
|---|---|---|
| GET | `/api/een/status` | Is the AI key configured |
| POST | `/api/een/chat` | Admin: Gemini proxy { model, payload } |

### signals

| Method | Path | Notes |
|---|---|---|
| GET | `/api/signals` | Problem detectors for this user |
