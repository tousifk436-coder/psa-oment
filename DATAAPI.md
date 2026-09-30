# DATAAPI.md — backend ka contract


Conventions:
- Paisa hamesha **paise** (integer). Time hamesha **seconds** (integer). Dates ISO strings.

## Error codes

| code | kab |
|---|---|
| `VALIDATION` | required field missing / galat value / reason missing |
| `DUPLICATE` | unique clash (email, dealId, open dispute) |
| `HAS_DEPENDENTS` | delete block — invoiced milestone, project with invoices, employee with open work |
| `FORBIDDEN` | doosre ka resource (employee kisi aur ka task accept kare) |
| `WIP_LIMIT` | employee ke already `wipLimit` tasks IN_PROGRESS |
| `WINDOW_CLOSED` | the flag window for an auto-agreed task has closed |

## Entity shapes


Deliverable ke piece-rate fields (v2):
```
pricingMode  'HOURLY' | 'PIECE'
pricePaise   int
slab         { stepSecs, cutPct, floorPct, graceSecs }
agreement    { state: NONE|PENDING|COUNTERED|FLAGGED|AGREED, adminSecs, employeeSecs, note, flagReason, agreedAt, agreedById, auto, history[] }
blocked      null | { reason, since, byId }
blockedSecs  int (cumulative)
blockedLog   [{ reason, since, until, secs, resolvedById, note }]
settlement   null | { settledAt, entryIds[], basePaise, finalPaise, cutPaise, estimateSecs, chargeableSecs, overSecs, steps, cutPct, stepSecs, floorPaise, hitFloor, why }
reworkCount  int
```
Wallet collections:
```
walletEntries [{ id, employeeId, deliverableId|null, projectId|null, type, amountPaise (signed), why, createdAt, meta }]
              type ∈ TASK_CREDIT | SLAB_ADJUSTMENT | DISPUTE_CREDIT | BONUS | ADJUSTMENT | PAYOUT
disputes      [{ id, entryId, employeeId, deliverableId, amountPaise, reason, status: OPEN|ACCEPTED|REJECTED, resolutionNote, creditedPaise, createdAt, resolvedAt }]
outbox        [{ id, to, subject, body, kind, meta, status: QUEUED|SENT|FAILED, createdAt }]   ← backend SMTP flush
payPolicy     { wipLimit, slabStepSecs, slabCutPct, floorPct, graceSecs, autoAgreeBelowPaise, autoAgreeBelowSecs, flagWindowSecs, emailOnCredit, sandbagRatio, sandbagMinTasks }
```

## DataAPI (`shared/data.js`)

Lifecycle: `init()` `flush()` `touch()` `reset()` `raw()` `setLatency(ms)`

Settings: `getSettings()` `updateSettings(patch)`

Employees: `authenticateEmployee(username, password)` (AUTH error, deliberately vague) · `getEmployees()` `getEmployee(id)` `createEmployee(payload)` `updateEmployee(id, patch)` `deleteEmployee(id)` — delete blocks on open work (`HAS_DEPENDENTS`)

Departments: `getDepartments()` `createDepartment(payload)` `updateDepartment(id, patch)` `deleteDepartment(id)`

Projects: `getProjects()` `getProject(id)` `createProject(payload)` `updateProject(id, patch)` `deleteProject(id)` `addProjectMember(projectId, employeeId)` `removeProjectMember(projectId, employeeId)`

Milestones: `getMilestones(projectId)` `createMilestone(payload)` `updateMilestone(id, patch)` `deleteMilestone(id)` — invoiced milestone delete → `HAS_DEPENDENTS`

Deliverables:
- `getDeliverables({projectId, milestoneId, assigneeId, status, origin, page, limit, q})`
- `getDeliverable(id)`
- `createDeliverable(payload)` — required: title, projectId, assigneeIds[], dueAt. Optional piece-rate: `pricingMode`, `pricePaise`, `slab`. Server-side: notify assignees, `Wallet.onDeliverableCreated` (agreement init + notifications).
- `updateDeliverable(id, patch)` `deleteDeliverable(id)`
- `submitDeliverable(id, {notes})` — needs files or notes; → IN_REVIEW, notify admin
- `approveDeliverable(id, note)` — → DONE; closes open timers; milestone auto-complete; **`Wallet.settleOnApprove` (idempotent)**; returns deliverable with `settlement`
- `rejectDeliverable(id, reason)` — reason required; `reworkCount++`
- `reassignDeliverable(id, assigneeIds)` `addDeliverableComment(id, fromId, text)` `addDeliverableFiles(id, files, 'brief'|'submission')` `removeDeliverableFile(id, index, which)`

Subtasks: `getSubtasks(deliverableId)` `createSubtask(payload)` `updateSubtask(id, patch)` `approveSubtask(id)` `rejectSubtask(id, reason)` `deleteSubtask(id)`

Time: `startTimer(employeeId, deliverableId)` — **gated by `Wallet.canStart`** (NOT_AGREED / BLOCKED / WIP_LIMIT); closes any other open entry; TODO→IN_PROGRESS. `stopTimer(employeeId)` — closes entries, adds secs to `deliverable.loggedSecs` + attendance `perDeliverableSecs`. `getOpenTimer(employeeId)`

Attendance: `getAttendance({employeeId, date})` `ensureTodayAttendance(employeeId)` `updateAttendance(id, patch)` `addBreak(employeeId, {type, startAt, endAt, secs})`

Invoices: `getInvoices(filter)` `peekInvoiceNumber()` `createInvoice(payload)` `updateInvoice(id, patch)` `sendInvoice(id)` `recordPayment(id, amountPaise)` (overpayment → VALIDATION) `cancelInvoice(id, reason)` `deleteInvoice(id)` (issued → LOCKED) `getUninvoicedMilestones()` — numbering monotonic `INV/2026-27/0001`, GST split by place of supply (`Utils.computeGst`)

Notices: `getNotices()` `createNotice(payload)` `updateNotice(id, patch)` `sendNotice(id)` `markNoticeRead(id, employeeId)` `deleteNotice(id)`

Messages: `getConversations()` `sendMessage(conversationId, fromId, text)` `markConversationRead(conversationId)`

Calendar: `getCalendarEvents()` `createCalendarEvent(payload)` `deleteCalendarEvent(id)`

Notifications: `getNotifications(recipientId)` `markNotificationRead(id)` `markAllNotificationsRead(recipientId)`

Misc reads: `getActivity()` `getCallLogs()` `getRevenueSeries(monthsBack)` `getKpis()` `projectProgress(projectId)` `milestoneProgress(milestoneId)` `employeeScore(employeeId)`

## Wallet (`shared/wallet.js`)

Policy: `getPolicy()` `updatePolicy(patch)`


Gate (sync): `canStart(employeeId, deliverableId)` → `{ok, reason, code}`

Pricing (admin): `setPricing(deliverableId, {pricingMode, pricePaise, slab})` — DONE pe LOCKED

Estimate agreement:
- employee: `acceptEstimate(id, employeeId)` `proposeEstimate(id, employeeId, secs, note)` `flagEstimate(id, employeeId, reason)`
- admin: `acceptProposal(id)` `counterEstimate(id, secs, note)` `getEstimateHint(id)` → `{person:{count,avgLoggedSecs,avgRatio}, team:{…}}`

Blocked: `markBlocked(id, byId, reason)` (stops timer) `unblock(id, byId, note)` (accumulates blockedSecs) `getBlocked()`

Ledger: `getWallet(employeeId)` → `{balancePaise, earnedPaise, slabPaise, paidOutPaise, thisMonthPaise, committedPaise, openDisputes, entries[]}` · `getLedger({employeeId, type, month})` · `addEntry(employeeId, BONUS|ADJUSTMENT|PAYOUT, amountPaise, why)` (payout > balance → VALIDATION)

Disputes: `raiseDispute(entryId, employeeId, reason)` `resolveDispute(id, {accept, note, creditPaise})` (note required) `getDisputes({status, employeeId})`

Company: `getCompanySummary()` → `{earnedPaise, slabPaise, paidOutPaise, liabilityPaise, committedPaise, thisMonthPaise, openTasks, blockedTasks, pendingAgreement, openDisputes, openDisputePaise, outboxQueued, byEmployee[], byProject[]}` · `getEstimateBehaviour()` (sandbagging) · `getOutbox()` · `focusQueue(employeeId)`

Pure (sync, no DB): `computeSettlement(deliverable, policy)` `slabPreview(deliverable, liveLoggedSecs)` `slabFromPolicy()`

## HRM (`shared/hrm.js`)
`getPolicy` `updatePolicy` `getHolidays` `addHoliday` `deleteHoliday` `getBalances(employeeId)` `creditCompOff` `getLeaveRequests(filter)` `applyLeave` `approveLeave(id, note)` `rejectLeave(id, reason)` `cancelLeave` `getRegularisations` `requestRegularisation` `approveRegularisation` `rejectRegularisation(id, reason)` `getTodayBoard` `getRegister(year, month)` `getTimesheet(employeeId, from, to)` `getUtilisation(from, to)`

## Profit (`shared/profitability.js`)
`getSettings` `updateSettings` `setEmployeeRates(employeeId, {costPerHourPaise, billRatePaise})` `getRateCoverage` `getProject(id)` `getPortfolio` `getByClient` `getByEmployee(from, to)` `getAlerts` `loadedRateOf(employeeId)` — PIECE tasks ka cost = payout × overheadMultiplier (settled: final, warna committed price).

## Schema versioning

### Salary costing (v4)

### Credentials (v3)

5. **Ledger append-only** — DB level pe UPDATE/DELETE deny on `walletEntries`.
