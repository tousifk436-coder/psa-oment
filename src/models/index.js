/* Model registry.
   ENTITY_MODELS maps each list in the engine's DB to its Mongoose model. */
'use strict';
const Employee = require('./Employee.model');
const Department = require('./Department.model');
const Project = require('./Project.model');
const Milestone = require('./Milestone.model');
const Deliverable = require('./Deliverable.model');
const Subtask = require('./Subtask.model');
const TimeEntry = require('./TimeEntry.model');
const Attendance = require('./Attendance.model');
const Invoice = require('./Invoice.model');
const Notice = require('./Notice.model');
const Conversation = require('./Conversation.model');
const CalendarEvent = require('./CalendarEvent.model');
const Notification = require('./Notification.model');
const Activity = require('./Activity.model');
const CallLog = require('./CallLog.model');
const Holiday = require('./Holiday.model');
const LeaveRequest = require('./LeaveRequest.model');
const Regularisation = require('./Regularisation.model');
const CompOff = require('./CompOff.model');
const WalletEntry = require('./WalletEntry.model');
const Dispute = require('./Dispute.model');
const OutboxEmail = require('./OutboxEmail.model');
const RecurringInvoice = require('./RecurringInvoice.model');
const Meta = require('./Meta.model');
const Credential = require('./Credential.model');
const PasswordReset = require('./PasswordReset.model');

const ENTITY_MODELS = {
  employees: Employee,
  departments: Department,
  projects: Project,
  milestones: Milestone,
  deliverables: Deliverable,
  subtasks: Subtask,
  timeEntries: TimeEntry,
  attendance: Attendance,
  invoices: Invoice,
  notices: Notice,
  conversations: Conversation,
  calendarEvents: CalendarEvent,
  notifications: Notification,
  activity: Activity,
  callLogs: CallLog,
  holidays: Holiday,
  leaveRequests: LeaveRequest,
  regularisations: Regularisation,
  compOffLedger: CompOff,
  walletEntries: WalletEntry,
  disputes: Dispute,
  outbox: OutboxEmail,
  recurringInvoices: RecurringInvoice,
};

/* Lists whose rows have no "id" — saved as a whole list (small, capped) */
const ID_LESS = ['activity'];

/* Ledger: rows can be added, never changed or deleted */
const APPEND_ONLY = ['walletEntries'];

module.exports = { ENTITY_MODELS, ID_LESS, APPEND_ONLY, Meta, Credential, PasswordReset, ARRAY_COLLECTIONS: Object.keys(ENTITY_MODELS) };
