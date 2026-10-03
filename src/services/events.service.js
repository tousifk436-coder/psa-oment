/* ============================================================================
   EVENTS SERVICE — "something happened → send the right emails"
   ----------------------------------------------------------------------------
   Runs inside the same unit of work as every engine call (access.service):

     before()  remembers which notifications / outbox mails already exist
     after()   1. explicit rules for events the engine has no notification for
                  (welcome email, password reset, invoices to clients, chat …)
               2. every NEW in-app notification the engine created becomes an
                  email to the same person (task assigned, leave approved …)
               3. mails the engine queued itself (wallet credit, payout) get
                  the standard layout; a person never gets the same event twice

   So emails always match what the app shows in the bell icon.
   ============================================================================ */
'use strict';
const email = require('./email.service');
const env = require('../config/env');
const logger = require('../utils/logger');
const { rupee } = require('./pdf.service');

const MSG_THROTTLE_MS = 10 * 60 * 1000;         // chat: max one email per conversation per 10 min
const lastMsgMail = new Map();

function before(ctx) {
  const D = ctx.DataAPI.raw();
  const emp = new Map((D.employees || []).map(e => [e.id, { active: e.active !== false, canLogin: e.canLogin !== false }]));
  return {
    notifIds: new Set((D.notifications || []).map(n => String(n.id))),
    outboxIds: new Set((D.outbox || []).map(m => String(m.id))),
    emp
  };
}

/* ── category + wording for engine notifications ── */
function categoryOf(n) {
  const t = String(n.title || '') + ' ' + String(n.body || '');
  switch (n.entityType) {
    case 'LEAVE': return 'leave';
    case 'REGULARISATION': return 'attendance';
    case 'WALLET': case 'DISPUTE': return 'wallet';
    case 'NOTICE': return 'notices';
    case 'DELIVERABLE': case 'SUBTASK': case 'MILESTONE':
      return /estimate|block/i.test(t) ? 'estimates' : (/wallet|credit|payout/i.test(t) ? 'wallet' : 'tasks');
    default: return 'tasks';
  }
}

/* due date picked as a date only (stored as midnight) → show just the date */
function dueText(iso) {
  const d = new Date(iso);
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return d.toLocaleString('en-IN', dateOnly
    ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: env.TIMEZONE });
}

function extraLines(D, n) {
  if (n.entityType === 'NOTICE') {
    const nt = (D.notices || []).find(x => String(x.id) === String(n.entityId));
    if (nt && nt.content) return [nt.content];
  }
  if (n.entityType === 'DELIVERABLE') {
    const d = (D.deliverables || []).find(x => String(x.id) === String(n.entityId));
    if (d && /returned|revision/i.test(n.title) && d.rejectionReason) return ['Reason: ' + d.rejectionReason];
    if (d && /assigned|new work/i.test(n.title)) {
      const p = (D.projects || []).find(x => x.id === d.projectId);
      return [
        p ? 'Project: ' + p.name : '',
        d.dueAt ? 'Due: ' + dueText(d.dueAt) : '',
        d.description ? d.description : ''
      ];
    }
  }
  return [];
}

function after(ctx, mark, call) {
  try {
    const D = ctx.DataAPI.raw();
    explicit(ctx, D, mark, call);

    /* invoices the engine created and sent by itself (project created /
       completed) → email them to the client with the PDF, once */
    (D.invoices || []).forEach(inv => {
      if (!inv.autoEmail || inv.autoEmailQueued || !inv.clientEmail) return;
      inv.autoEmailQueued = true;
      const company = email.companyName();
      const balance = (inv.totalPaise || 0) - (inv.paidPaise || 0);
      email.queue({
        to: inv.clientEmail, name: inv.clientName, category: 'invoices', kind: 'INVOICE',
        subject: 'Invoice ' + inv.number + ' from ' + company,
        heading: 'Invoice ' + inv.number,
        lines: ['Please find your invoice attached as a PDF.', inv.notes || ''],
        facts: [['Invoice', inv.number], ['Issue date', inv.issueDate], ['Due date', inv.dueDate], ['Total', rupee(inv.totalPaise)],
          ['Paid', inv.paidPaise ? rupee(inv.paidPaise) : null], ['Balance due', rupee(balance)]],
        attachInvoiceId: inv.id
      });
    });

    /* engine-queued mails (wallet credit, payout) */
    const engineMailTo = new Set();
    (D.outbox || []).forEach(m => {
      if (mark.outboxIds.has(String(m.id))) return;
      if (!m.html) email.adoptEngineMail(m);
      engineMailTo.add(String(m.to).toLowerCase());
    });

    /* new in-app notifications → email */
    (D.notifications || []).forEach(n => {
      if (mark.notifIds.has(String(n.id))) return;
      if (n.entityType === 'CONVERSATION') return;          // chat email handled above (throttled)
      const p = email.person(n.recipientId);
      if (!p || !email.isEmail(p.email) || p.active === false) return;
      if (engineMailTo.has(p.email.toLowerCase())) return;           // already got the engine's email
      email.queue({
        to: p.email, name: p.name, category: categoryOf(n), kind: n.kind || 'INFO',
        subject: n.title,
        heading: n.title,
        lines: [n.body].concat(extraLines(D, n)),
        button: { label: 'Open in ' + email.companyName(), url: email.appLink(p.role) },
        meta: { notificationId: n.id, entityType: n.entityType, entityId: n.entityId }
      });
    });
  } catch (e) {
    /* an email problem must never break the business action */
    logger.error('events.after failed:', e && e.stack || e);
  }
}

/* ── explicit rules ── */
function explicit(ctx, D, mark, { api, method, args, result }) {
  const key = api + '.' + method;
  const A = args || [];
  const empById = id => (D.employees || []).find(e => Number(e.id) === Number(id));
  const adminP = { email: email.adminAddress(), name: (D.adminUser && D.adminUser.name) || 'Admin', role: 'ADMIN' };
  const company = email.companyName();

  switch (key) {
    case 'DataAPI.createEmployee': {
      const e = result && empById(result.id);
      const pw = A[0] && A[0].password;
      if (!e) break;
      email.queue({
        to: e.email, name: e.name, category: 'account', kind: 'WELCOME',
        subject: 'Welcome to ' + company + ' — your login details',
        heading: 'Welcome to ' + company,
        lines: ['Your account is ready. Use these details to sign in to the employee app.',
          pw ? 'You will be asked to set your own password after the first sign-in.' : 'Ask your admin for your password.'],
        facts: [['Username', e.username], ['Password', pw || null], ['Role', e.role]],
        button: { label: 'Sign in', url: email.appLink('EMPLOYEE') }
      });
      break;
    }
    case 'DataAPI.updateEmployee': {
      const e = empById(A[0]); const patch = A[1] || {};
      if (!e) break;
      if (patch.password) {
        email.queue({
          to: e.email, name: e.name, category: 'account', kind: 'PASSWORD_RESET',
          subject: 'Your ' + company + ' password was reset',
          heading: 'Your password was reset by the admin',
          lines: ['Use the new password below to sign in. You will be asked to choose your own.'],
          facts: [['Username', e.username], ['New password', patch.password]],
          button: { label: 'Sign in', url: email.appLink('EMPLOYEE') }
        });
      }
      const was = mark.emp.get(e.id) || {};
      const deactivated = (was.active && e.active === false) || (was.canLogin && e.canLogin === false);
      const reactivated = (was.active === false && e.active !== false) || (was.canLogin === false && e.canLogin !== false && e.active !== false);
      if (deactivated) email.queue({
        to: e.email, name: e.name, category: 'account', kind: 'DEACTIVATED', force: true,
        subject: 'Your ' + company + ' access has been turned off',
        heading: 'Your account was deactivated',
        lines: ['You can no longer sign in to ' + company + '. If you think this is a mistake, please contact your admin.']
      });
      if (reactivated) email.queue({
        to: e.email, name: e.name, category: 'account', kind: 'REACTIVATED',
        subject: 'Your ' + company + ' access is back on',
        heading: 'Your account is active again',
        lines: ['You can sign in again with your usual username and password.'],
        button: { label: 'Sign in', url: email.appLink('EMPLOYEE') }
      });
      break;
    }
    case 'DataAPI.addProjectMember':
    case 'DataAPI.removeProjectMember': {
      const p = (D.projects || []).find(x => Number(x.id) === Number(A[0]));
      const e = empById(A[1]);
      if (!p || !e) break;
      const added = method === 'addProjectMember';
      email.queue({
        to: e.email, name: e.name, category: 'projects', kind: added ? 'PROJECT_ADDED' : 'PROJECT_REMOVED',
        subject: (added ? 'You were added to ' : 'You were removed from ') + p.name,
        heading: added ? 'New project: ' + p.name : 'Removed from ' + p.name,
        lines: [added ? 'You are now a member of this project and will see its tasks in your app.' : 'You are no longer a member of this project.'],
        facts: added ? [['Client', p.clientName || p.client], ['Deadline', p.deadline || p.dueDate]] : [],
        button: added ? { label: 'Open project', url: email.appLink('EMPLOYEE') } : null
      });
      break;
    }
    case 'DataAPI.addDeliverableComment': {
      const d = (D.deliverables || []).find(x => String(x.id) === String(A[0]));
      if (!d) break;
      const fromId = Number(A[1]);
      const from = email.person(fromId);
      const text = String(A[2] || '').trim();
      const targets = email.isAdminId(fromId)
        ? (d.assigneeIds || []).map(email.person)
        : [adminP].concat((d.assigneeIds || []).filter(id => Number(id) !== fromId).map(email.person));
      email.queueMany(targets.filter(Boolean), p => ({
        category: 'tasks', kind: 'COMMENT',
        subject: 'New comment on "' + d.title + '"',
        heading: (from ? from.name : 'Someone') + ' commented on "' + d.title + '"',
        lines: ['“' + text.slice(0, 1000) + '”'],
        button: { label: 'Reply', url: email.appLink(p.role) }
      }));
      break;
    }
    case 'DataAPI.createDeliverable': {
      if (!result || result.origin !== 'SELF') break;
      const e = empById(result.createdById != null ? result.createdById : (result.assigneeIds || [])[0]);
      email.queue({
        to: adminP.email, name: adminP.name, category: 'tasks', kind: 'SELF_TASK',
        subject: (e ? e.name : 'An employee') + ' added a task: "' + result.title + '"',
        heading: 'New self-assigned task',
        lines: [(e ? e.name : 'An employee') + ' created a task for themselves' + (result.approvalState === 'PENDING' ? ' and it needs your approval.' : '.')],
        facts: [['Task', result.title], ['Priority', result.priority]],
        button: { label: 'Review', url: email.appLink('ADMIN') }
      });
      break;
    }
    case 'HRM.cancelLeave': {
      const r = (D.leaveRequests || []).find(x => String(x.id) === String(A[0]));
      if (!r) break;
      const e = empById(r.employeeId);
      const approver = email.person(r.approverId) || adminP;
      email.queue({
        to: approver.email, name: approver.name, category: 'leave', kind: 'LEAVE_CANCELLED',
        subject: (e ? e.name : 'An employee') + ' cancelled a leave request',
        heading: 'Leave cancelled',
        facts: [['Employee', e && e.name], ['Type', r.type], ['From', r.fromDate], ['To', r.toDate], ['Days', r.days]],
        button: { label: 'Open HRM', url: email.appLink(approver.role) }
      });
      break;
    }
    case 'HRM.creditCompOff': {
      const e = empById(A[0]);
      if (!e) break;
      email.queue({
        to: e.email, name: e.name, category: 'leave', kind: 'COMP_OFF',
        subject: 'Comp-off credited: ' + A[1] + ' day(s)',
        heading: A[1] + ' comp-off day(s) added to your leave balance',
        lines: [A[2] ? 'Reason: ' + A[2] : ''],
        button: { label: 'See balance', url: email.appLink('EMPLOYEE') }
      });
      break;
    }
    case 'HRM.addHoliday': {
      if (!result) break;
      const people = (D.employees || []).filter(e => e.active !== false).map(e => ({ email: e.email, name: e.name, role: 'EMPLOYEE' }));
      email.queueMany(people, () => ({
        category: 'leave', kind: 'HOLIDAY',
        subject: 'Holiday: ' + result.name + ' (' + result.date + ')',
        heading: 'New holiday: ' + result.name,
        facts: [['Date', result.date], ['Type', result.optional ? 'Optional holiday' : 'Company holiday']]
      }));
      break;
    }
    case 'DataAPI.sendInvoice':
    case 'DataAPI.recordPayment':
    case 'DataAPI.cancelInvoice': {
      const inv = (D.invoices || []).find(x => String(x.id) === String(A[0]));
      if (!inv) break;
      const balance = (inv.totalPaise || 0) - (inv.paidPaise || 0);
      const facts = [['Invoice', inv.number], ['Issue date', inv.issueDate], ['Due date', inv.dueDate], ['Total', rupee(inv.totalPaise)], ['Paid', inv.paidPaise ? rupee(inv.paidPaise) : null], ['Balance due', rupee(balance)]];
      if (method === 'sendInvoice') {
        email.queue({
          to: inv.clientEmail, name: inv.clientName, category: 'invoices', kind: 'INVOICE',
          subject: 'Invoice ' + inv.number + ' from ' + company,
          heading: 'Invoice ' + inv.number,
          lines: ['Please find your invoice attached as a PDF.', inv.notes || ''],
          facts, attachInvoiceId: inv.id
        });
      } else if (method === 'recordPayment') {
        const amt = Number(A[1]) || 0;
        const pay = (inv.payments || [])[(inv.payments || []).length - 1] || {};
        email.queue({
          to: inv.clientEmail, name: inv.clientName, category: 'invoices', kind: 'RECEIPT',
          subject: 'Payment received — ' + inv.number,
          heading: 'Thank you — we received ' + rupee(amt),
          lines: [balance > 0 ? 'The remaining balance is shown below.' : 'This invoice is now fully paid.'],
          facts: [['Payment date', pay.date], ['Method', pay.method], ['Reference', pay.reference]].concat(facts), attachInvoiceId: inv.id
        });
        email.queue({
          to: adminP.email, name: adminP.name, category: 'invoices', kind: 'PAYMENT',
          subject: 'Payment recorded: ' + rupee(amt) + ' on ' + inv.number,
          heading: rupee(amt) + ' received from ' + inv.clientName,
          facts, button: { label: 'Open invoices', url: email.appLink('ADMIN') }
        });
      } else {
        email.queue({
          to: inv.clientEmail, name: inv.clientName, category: 'invoices', kind: 'INVOICE_CANCELLED',
          subject: 'Invoice ' + inv.number + ' cancelled',
          heading: 'Invoice ' + inv.number + ' has been cancelled',
          lines: [A[1] ? 'Reason: ' + A[1] : 'Please ignore this invoice. Contact us if you have questions.'],
          facts: [['Invoice', inv.number], ['Amount', rupee(inv.totalPaise)]]
        });
      }
      break;
    }
    case 'DataAPI.sendMessage': {
      const c = (D.conversations || []).find(x => String(x.id) === String(A[0]));
      if (!c) break;
      const fromId = Number(A[1]);
      const peerTo = c.kind === 'PEER' ? (c.participantIds || []).find(x => Number(x) !== fromId) : null;
      const to = c.kind === 'PEER' ? email.person(peerTo) : email.isAdminId(fromId) ? email.person(c.withId) : adminP;
      const from = email.person(fromId);
      const k = String(c.id) + '>' + (to && to.email);
      if (!to || (Date.now() - (lastMsgMail.get(k) || 0)) < MSG_THROTTLE_MS) break;
      lastMsgMail.set(k, Date.now());
      email.queue({
        to: to.email, name: to.name, category: 'messages', kind: 'MESSAGE',
        subject: 'New message from ' + (from ? from.name : 'Oment'),
        heading: (from ? from.name : 'Someone') + ' sent you a message',
        lines: ['“' + String(A[2] || '').slice(0, 1000) + '”'],
        button: { label: 'Reply', url: email.appLink(to.role) }
      });
      break;
    }
    case 'DataAPI.createCalendarEvent': {
      if (!result) break;
      const ids = Array.isArray(result.attendeeIds) ? result.attendeeIds : [];
      const people = result.allEmployees
        ? (D.employees || []).filter(e => e.active !== false).map(e => ({ email: e.email, name: e.name, role: 'EMPLOYEE' }))
        : ids.map(email.person).filter(Boolean);
      email.queueMany(people, p => ({
        category: 'calendar', kind: 'CALENDAR',
        subject: 'Invite: ' + result.title + ' — ' + result.date + (result.time ? ' ' + result.time : ''),
        heading: result.title,
        facts: [['Date', result.date], ['Time', result.time], ['Type', result.type], ['Details', result.description || result.notes]],
        button: { label: 'Open calendar', url: email.appLink(p.role) }
      }));
      break;
    }
    default: break;
  }
}

module.exports = { before, after, categoryOf };