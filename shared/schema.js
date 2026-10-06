(function (root) {
  'use strict';

  /* ==========================================================================
     1. STATUS VOCABULARY
     ========================================================================== */

  var WORK_STATUS = {
    TODO:        { key: 'TODO',        label: 'To Do',        order: 1, tone: 'grey'   },
    IN_PROGRESS: { key: 'IN_PROGRESS', label: 'In Progress',  order: 2, tone: 'blue'   },
    IN_REVIEW:   { key: 'IN_REVIEW',   label: 'In Review',    order: 3, tone: 'purple' },
    REJECTED:    { key: 'REJECTED',    label: 'Rejected',     order: 4, tone: 'red'    },
    DONE:        { key: 'DONE',        label: 'Done',         order: 5, tone: 'green'  }
  };

  var WORK_STATUS_ALIASES = {
    'todo': 'TODO',
    'inprogress': 'IN_PROGRESS',
    'in progress': 'IN_PROGRESS',
    'submitted': 'IN_REVIEW',
    'approved': 'DONE',
    'rejected': 'REJECTED',

    'In Progress': 'IN_PROGRESS',
    'In Review': 'IN_REVIEW',
    'Done': 'DONE',
    'Not Started': 'TODO',
    'Upcoming': 'TODO',
    'Overdue': 'IN_PROGRESS'
  };

  var MILESTONE_STATUS = {
    UPCOMING:    { key: 'UPCOMING',    label: 'Upcoming',    tone: 'grey'  },
    IN_PROGRESS: { key: 'IN_PROGRESS', label: 'In Progress', tone: 'blue'  },
    DONE:        { key: 'DONE',        label: 'Done',        tone: 'green' }
  };

  var PROJECT_STATUS = {
    PLANNING:  { key: 'PLANNING',  label: 'Planning',  tone: 'amber' },
    ACTIVE:    { key: 'ACTIVE',    label: 'Active',    tone: 'green' },
    ON_HOLD:   { key: 'ON_HOLD',   label: 'On Hold',   tone: 'grey'  },
    COMPLETED: { key: 'COMPLETED', label: 'Completed', tone: 'blue'  }
  };

  var PRIORITY = {
    LOW:    { key: 'LOW',    label: 'Low',    order: 1, tone: 'green' },
    MEDIUM: { key: 'MEDIUM', label: 'Medium', order: 2, tone: 'amber' },
    HIGH:   { key: 'HIGH',   label: 'High',   order: 3, tone: 'red'   }
  };

  var ATTENDANCE_STATUS = {
    PRESENT:  { key: 'PRESENT',  label: 'Present',  tone: 'green' },
    HALF_DAY: { key: 'HALF_DAY', label: 'Half Day', tone: 'amber' },
    ABSENT:   { key: 'ABSENT',   label: 'Absent',   tone: 'red'   },
    ON_LEAVE: { key: 'ON_LEAVE', label: 'On Leave', tone: 'grey'  }
  };

  var INVOICE_STATUS = {
    DRAFT:          { key: 'DRAFT',          label: 'Draft',          tone: 'grey'  },
    SENT:           { key: 'SENT',           label: 'Sent',           tone: 'blue'  },
    PARTIALLY_PAID: { key: 'PARTIALLY_PAID', label: 'Partially Paid', tone: 'amber' },
    PAID:           { key: 'PAID',           label: 'Paid',           tone: 'green' },
    OVERDUE:        { key: 'OVERDUE',        label: 'Overdue',        tone: 'red'   },
    CANCELLED:      { key: 'CANCELLED',      label: 'Cancelled',      tone: 'grey'  }
  };

  var LEAD_STAGE = {
    NEW:           { key: 'NEW',           label: 'New',           order: 1 },
    CONTACTED:     { key: 'CONTACTED',     label: 'Contacted',     order: 2 },
    PROPOSAL_SENT: { key: 'PROPOSAL_SENT', label: 'Proposal Sent', order: 3 },
    NEGOTIATION:   { key: 'NEGOTIATION',   label: 'Negotiation',   order: 4 },
    WON:           { key: 'WON',           label: 'Won',           order: 5 },
    LOST:          { key: 'LOST',          label: 'Lost',          order: 6 }
  };

  /* ==========================================================================
     2. NORMALIZERS
     ========================================================================== */

  function normStatus(v) {
    if (!v) return WORK_STATUS.TODO.key;

    var s = String(v).trim();

    if (WORK_STATUS[s]) return s;

    if (WORK_STATUS_ALIASES[s]) {
      return WORK_STATUS_ALIASES[s];
    }

    var lower = s.toLowerCase();

    if (WORK_STATUS_ALIASES[lower]) {
      return WORK_STATUS_ALIASES[lower];
    }

    var snake = lower
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return WORK_STATUS[snake]
      ? snake
      : WORK_STATUS.TODO.key;
  }

  function normPriority(v) {
    if (!v) return PRIORITY.MEDIUM.key;

    var s = String(v)
      .trim()
      .toUpperCase();

    if (s === 'MED') {
      s = 'MEDIUM';
    }

    return PRIORITY[s]
      ? s
      : PRIORITY.MEDIUM.key;
  }

  function normProjectStatus(v) {
    var s = String(v || '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return PROJECT_STATUS[s]
      ? s
      : PROJECT_STATUS.PLANNING.key;
  }

  function normMilestoneStatus(v) {
    var s = String(v || '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return MILESTONE_STATUS[s]
      ? s
      : MILESTONE_STATUS.UPCOMING.key;
  }

  function normAttendance(v) {
    var s = String(v || '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return ATTENDANCE_STATUS[s]
      ? s
      : ATTENDANCE_STATUS.ABSENT.key;
  }

  function normInvoiceStatus(v) {
    var s = String(v || '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return INVOICE_STATUS[s]
      ? s
      : INVOICE_STATUS.DRAFT.key;
  }

  function normLeadStage(v) {
    var s = String(v || '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    return LEAD_STAGE[s]
      ? s
      : LEAD_STAGE.NEW.key;
  }

  function label(dict, key) {
    var e = dict[key];

    return e
      ? e.label
      : '—';
  }

  function tone(dict, key) {
    var e = dict[key];

    return e
      ? e.tone
      : 'grey';
  }

  /* ==========================================================================
     3. TIME — EK UNIT: SECONDS
     ========================================================================== */

  var TIME = {
    hoursToSecs: function (h) {
      return Math.round(
        (parseFloat(h) || 0) * 3600
      );
    },

    secsToHours: function (s) {
      return (
        parseInt(s, 10) || 0
      ) / 3600;
    },

    fmtShort: function (secs) {
      var s =
        parseInt(secs, 10) || 0;

      if (s <= 0) {
        return '0h';
      }

      var h = Math.floor(
        s / 3600
      );

      var m = Math.floor(
        (s % 3600) / 60
      );

      if (h && m) {
        return h + 'h ' + m + 'm';
      }

      if (h) {
        return h + 'h';
      }

      return m + 'm';
    },

    fmtClock: function (secs) {
      var s = Math.max(
        0,
        parseInt(secs, 10) || 0
      );

      return [
        Math.floor(s / 3600),
        Math.floor((s % 3600) / 60),
        s % 60
      ]
        .map(function (v) {
          return String(v).padStart(2, '0');
        })
        .join(':');
    }
  };

  /* ==========================================================================
     4. CANONICAL ENTITY SHAPES
     ========================================================================== */

  var Shape = {

    employee: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        monthlySalaryPaise:
          o.monthlySalaryPaise || 0,

        hoursPerDay:
          o.hoursPerDay || 8,

        username:
          o.username || null,

        passHash:
          o.passHash || null,

        mustChangePass:
          !!o.mustChangePass,

        address:
          o.address || '',

        name:
          o.name || '',

        email:
          o.email || '',

        phone:
          o.phone || '',

        role:
          o.role || '',

        deptId:
          o.deptId != null
            ? o.deptId
            : null,

        managerId:
          o.managerId != null
            ? o.managerId
            : null,

        accessLevel:
          o.accessLevel || 'EMPLOYEE',

        attendanceStatus:
          normAttendance(
            o.attendanceStatus ||
            o.status
          ),

        joinedAt:
          o.joinedAt || null,

        avatarInitials:
          o.avatarInitials ||
          initialsOf(
            o.name || ''
          ),

        avatarBg:
          o.avatarBg ||
          '#E8E5DF',

        avatarFg:
          o.avatarFg ||
          '#3D3B42',

        active:
          o.active !== false
      };
    },

    department: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        name:
          o.name || '',

        headId:
          o.headId != null
            ? o.headId
            : null,

        description:
          o.description || '',

        color:
          o.color || '#2563EB'
      };
    },

    /*
     * PROJECT
     *
     * Financial structure:
     *
     * budgetPaise
     * spentPaise
     * advancePaidPaise
     *
     * Example:
     *
     * budgetPaise      = ₹10,00,000
     * advancePaidPaise = ₹2,00,000
     *
     * Remaining client balance is:
     *
     * budgetPaise - advancePaidPaise
     */
    project: function (o) {
      o = o || {};

      var budgetPaise =
        Math.max(
          0,
          Math.round(
            Number(
              o.budgetPaise
            ) || 0
          )
        );

      var spentPaise =
        Math.max(
          0,
          Math.round(
            Number(
              o.spentPaise
            ) || 0
          )
        );

      /*
       * Advance can never be negative
       * and cannot be greater than the
       * project budget.
       */
      /* Total project value: what the client pays for the whole project.
         budgetPaise is the internal cost budget (salaries, expenses).
         Older projects only had budgetPaise, so the value falls back to it. */
      var contractValuePaise =
        Math.max(0, Math.round(Number(o.contractValuePaise != null && o.contractValuePaise !== '' ? o.contractValuePaise : o.budgetPaise) || 0));

      var advancePaidPaise =
        Math.min(
          (contractValuePaise || budgetPaise),
          Math.max(
            0,
            Math.round(
              Number(
                o.advancePaidPaise
              ) || 0
            )
          )
        );

      return {
        id:
          o.id != null
            ? o.id
            : null,

        code:
          o.code || '',

        name:
          o.name || '',

        clientName:
          o.clientName || '',

        clientEmail:
          o.clientEmail || '',

        /* client details used on invoices */
        clientPhone: o.clientPhone || '',
        clientGstin: o.clientGstin || '',
        clientStateCode: o.clientStateCode || '',
        clientAddress: o.clientAddress || '',

        status:
          normProjectStatus(
            o.status
          ),

        priority:
          normPriority(
            o.priority
          ),

        deptId:
          o.deptId != null
            ? o.deptId
            : null,

        headId:
          o.headId != null
            ? o.headId
            : null,

        memberIds:
          o.memberIds || [],

        description:
          o.description || '',

        startDate:
          o.startDate || null,

        deadline:
          o.deadline || null,

        budgetPaise:
          budgetPaise,

        contractValuePaise:
          contractValuePaise,

        spentPaise:
          spentPaise,

        /*
         * Client advance/payment already received.
         */
        advancePaidPaise:
          advancePaidPaise,

        /* automatic invoices: when the project is created (full value) and
           when it is completed (whatever is still not invoiced) */
        autoInvoiceOnCreate: !!o.autoInvoiceOnCreate,
        autoInvoiceOnComplete: o.autoInvoiceOnComplete !== false,
        completedAt: o.completedAt || null,

        /* when and how the advance was paid */
        advanceDate: o.advanceDate || null,
        advanceMethod: o.advanceMethod || '',
        advanceRef: o.advanceRef || ''
      };
    },

    milestone: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        projectId:
          o.projectId != null
            ? o.projectId
            : null,

        title:
          o.title || '',

        description:
          o.description || '',

        status:
          normMilestoneStatus(
            o.status
          ),

        dueDate:
          o.dueDate || null,

        billable:
          o.billable !== false,

        sortOrder:
          o.sortOrder || 0,

        /*
         * Milestone-level employee budget / time policy.
         */
        amountPaise:
          Math.max(
            0,
            Math.round(
              Number(
                o.amountPaise
              ) || 0
            )
          ),

        estimatedHours:
          Math.max(
            0,
            Number(
              o.estimatedHours
            ) || 0
          ),

        slabCutPct:
          o.slabCutPct == null
            ? 6
            : Math.max(
                0,
                Math.min(
                  50,
                  Number(
                    o.slabCutPct
                  ) || 0
                )
              ),

        floorPct:
          o.floorPct == null
            ? 65
            : Math.max(
                0,
                Math.min(
                  100,
                  Number(
                    o.floorPct
                  ) || 0
                )
              ),

        slabStepHours:
          o.slabStepHours == null
            ? 1
            : Math.max(
                0.25,
                Number(
                  o.slabStepHours
                ) || 1
              ),

        graceMinutes:
          o.graceMinutes == null
            ? 0
            : Math.max(
                0,
                Number(
                  o.graceMinutes
                ) || 0
              ),

        /* team pay credited when the milestone is done: fixed amount for the
           allotted hours; each extra hour cuts payCutPct %, never below payFloorPct % */
        payPaise: o.payPaise || 0,
        payHours: o.payHours || 0,
        payCutPct: o.payCutPct == null ? 10 : o.payCutPct,
        payFloorPct: o.payFloorPct == null ? 50 : o.payFloorPct,
        paySettledAt: o.paySettledAt || null,
        paySettlement: o.paySettlement || null
      };
    },

    deliverable: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        projectId:
          o.projectId != null
            ? o.projectId
            : null,

        milestoneId:
          o.milestoneId != null
            ? o.milestoneId
            : null,

        title:
          o.title || '',

        description:
          o.description || '',

        status:
          normStatus(
            o.status
          ),

        priority:
          normPriority(
            o.priority
          ),

        assigneeIds:
          o.assigneeIds || [],

        createdById:
          o.createdById != null
            ? o.createdById
            : null,

        origin:
          o.origin || 'ADMIN',

        approvalState:
          o.approvalState || null,

        rejectionReason:
          o.rejectionReason || null,

        dueAt:
          o.dueAt || null,

        estimateSecs:
          TIME.hoursToSecs(
            o.estimateHours || 0
          ) ||
          o.estimateSecs ||
          0,

        loggedSecs:
          o.loggedSecs || 0,

        progressPct:
          o.progressPct || 0,

        briefFiles:
          o.briefFiles || [],

        submissionFiles:
          o.submissionFiles || [],

        submissionNotes:
          o.submissionNotes || '',

        comments:
          o.comments || [],

        timeline:
          o.timeline || [],

        createdAt:
          o.createdAt || null,

        pricingMode:
          o.pricingMode === 'PIECE'
            ? 'PIECE'
            : 'HOURLY',

        pricePaise:
          o.pricePaise || 0,

        slab:
          o.slab || null,

        agreement:
          o.agreement || null,

        blocked:
          o.blocked || null,

        blockedSecs:
          o.blockedSecs || 0,

        blockedLog:
          o.blockedLog || [],

        settlement:
          o.settlement || null,

        liveSettlement:
          o.liveSettlement || null,

        reworkCount:
          o.reworkCount || 0
      };
    },

    subtask: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        deliverableId:
          o.deliverableId != null
            ? o.deliverableId
            : null,

        title:
          o.title || '',

        description:
          o.description || '',

        status:
          normStatus(
            o.status
          ),

        priority:
          normPriority(
            o.priority
          ),

        assigneeId:
          o.assigneeId != null
            ? o.assigneeId
            : null,

        createdById:
          o.createdById != null
            ? o.createdById
            : null,

        origin:
          o.origin || 'ADMIN',

        approvalState:
          o.approvalState || null,

        rejectionReason:
          o.rejectionReason || null,

        createdAt:
          o.createdAt || null,

        completedAt:
          o.completedAt || null,

        timeline:
          o.timeline || [],

        estimateSecs:
          o.estimateSecs || 0,

        loggedSecs:
          o.loggedSecs || 0,

        approvalState:
          o.approvalState || null,

        rejectionReason:
          o.rejectionReason || null,

        createdAt:
          o.createdAt || null,

        completedAt:
          o.completedAt || null,

        timeline:
          o.timeline || []
      };
    },

    attendanceDay: function (o) {
      o = o || {};

      return {
        id:
          o.id || null,

        employeeId:
          o.employeeId != null
            ? o.employeeId
            : null,

        date:
          o.date || null,

        status:
          normAttendance(
            o.status
          ),

        firstInAt:
          o.firstInAt || null,

        lastOutAt:
          o.lastOutAt || null,

        sessionSecs:
          o.sessionSecs || 0,

        activeSecs:
          o.activeSecs || 0,

        idleSecs:
          o.idleSecs || 0,

        breaks:
          o.breaks || [],

        perDeliverableSecs:
          o.perDeliverableSecs || {},

        sessions:
          o.sessions || []
      };
    },

    timeEntry: function (o) {
      o = o || {};

      return {
        id:
          o.id || null,

        employeeId:
          o.employeeId != null
            ? o.employeeId
            : null,

        deliverableId:
          o.deliverableId != null
            ? o.deliverableId
            : null,

        subtaskId:
          o.subtaskId != null
            ? o.subtaskId
            : null,

        startedAt:
          o.startedAt || null,

        endedAt:
          o.endedAt || null,

        source:
          o.source || 'TIMER'
      };
    },

    invoice: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        number:
          o.number || '',

        projectId:
          o.projectId != null
            ? o.projectId
            : null,

        milestoneId:
          o.milestoneId != null
            ? o.milestoneId
            : null,

        clientName:
          o.clientName || '',

        clientEmail:
          o.clientEmail || '',

        clientGstin:
          o.clientGstin || '',

        placeOfSupply:
          o.placeOfSupply || '',

        status:
          normInvoiceStatus(
            o.status
          ),

        issueDate:
          o.issueDate || null,

        dueDate:
          o.dueDate || null,

        lines:
          o.lines || [],

        subtotalPaise:
          o.subtotalPaise || 0,

        cgstPaise:
          o.cgstPaise || 0,

        sgstPaise:
          o.sgstPaise || 0,

        igstPaise:
          o.igstPaise || 0,

        totalPaise:
          o.totalPaise || 0,

        paidPaise:
          o.paidPaise || 0,

        notes:
          o.notes || '',

        subject:
          o.subject || '',

        recurringId:
          o.recurringId || null
      };
    },

    lead: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        company:
          o.company || '',

        contactName:
          o.contactName || '',

        email:
          o.email || '',

        phone:
          o.phone || '',

        stage:
          normLeadStage(
            o.stage
          ),

        priority:
          normPriority(
            o.priority
          ),

        valuePaise:
          o.valuePaise || 0,

        source:
          o.source || '',

        ownerId:
          o.ownerId != null
            ? o.ownerId
            : null,

        lastActivityAt:
          o.lastActivityAt || null,

        followUpAt:
          o.followUpAt || null,

        notes:
          o.notes || ''
      };
    },

    notification: function (o) {
      o = o || {};

      return {
        id:
          o.id != null
            ? o.id
            : null,

        recipientId:
          o.recipientId != null
            ? o.recipientId
            : null,

        kind:
          o.kind || 'INFO',

        title:
          o.title || '',

        body:
          o.body || '',

        entityType:
          o.entityType || null,

        entityId:
          o.entityId != null
            ? o.entityId
            : null,

        read:
          !!o.read,

        createdAt:
          o.createdAt || null
      };
    }
  };

  function initialsOf(name) {
    return String(name)
      .trim()
      .split(/\s+/)
      .map(function (n) {
        return n[0] || '';
      })
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  /* ==========================================================================
     5. SELECTORS
     ========================================================================== */

  var Select = {

    deliverablesOfMilestone: function (
      db,
      milestoneId
    ) {
      return db.deliverables.filter(
        function (d) {
          return d.milestoneId === milestoneId;
        }
      );
    },

    deliverablesOfProject: function (
      db,
      projectId
    ) {
      return db.deliverables.filter(
        function (d) {
          return d.projectId === projectId;
        }
      );
    },

    subtasksOf: function (
      db,
      deliverableId
    ) {
      return db.subtasks.filter(
        function (s) {
          return s.deliverableId === deliverableId;
        }
      );
    },

    myDeliverables: function (
      db,
      employeeId
    ) {
      return db.deliverables.filter(
        function (d) {
          return (
            d.assigneeIds || []
          ).indexOf(employeeId) >= 0;
        }
      );
    },

    myOpenWork: function (
      db,
      employeeId
    ) {
      return Select
        .myDeliverables(
          db,
          employeeId
        )
        .filter(
          function (d) {
            return (
              d.status === 'TODO' ||
              d.status === 'IN_PROGRESS' ||
              d.status === 'REJECTED'
            );
          }
        );
    },

    isMilestoneComplete: function (
      db,
      milestoneId
    ) {
      var ds =
        Select.deliverablesOfMilestone(
          db,
          milestoneId
        );

      return (
        ds.length > 0 &&
        ds.every(
          function (d) {
            return d.status === 'DONE';
          }
        )
      );
    },

    milestoneProgressPct: function (
      db,
      milestoneId
    ) {
      var ds =
        Select.deliverablesOfMilestone(
          db,
          milestoneId
        );

      if (!ds.length) {
        return 0;
      }

      var done =
        ds.filter(
          function (d) {
            return d.status === 'DONE';
          }
        ).length;

      return Math.round(
        done / ds.length * 100
      );
    },

    projectProgressPct: function (
      db,
      projectId
    ) {
      var ds =
        Select.deliverablesOfProject(
          db,
          projectId
        );

      if (!ds.length) {
        return 0;
      }

      var done =
        ds.filter(
          function (d) {
            return d.status === 'DONE';
          }
        ).length;

      return Math.round(
        done / ds.length * 100
      );
    },

    presentToday: function (db) {
      return db.employees.filter(
        function (e) {
          return (
            e.attendanceStatus ===
            'PRESENT'
          );
        }
      );
    }
  };

  /* ==========================================================================
     6. LEGACY ADAPTERS
     ========================================================================== */

  var Adapt = {

    fromEmployeeTask: function (
      t,
      projectIdByName
    ) {
      return Shape.deliverable({
        id: t.id,

        projectId:
          projectIdByName
            ? projectIdByName[t.proj]
            : null,

        title:
          t.title,

        description:
          t.desc,

        status:
          normStatus(t.status),

        priority:
          normPriority(t.priority),

        origin:
          t.self
            ? 'SELF'
            : 'ADMIN',

        approvalState:
          t.saStatus
            ? String(
                t.saStatus
              ).toUpperCase()
            : null,

        rejectionReason:
          t.rejReason || null,

        dueAt:
          t.dms
            ? new Date(
                t.dms
              ).toISOString()
            : null,

        estimateSecs:
          t.exp || 0,

        loggedSecs:
          t.logged || 0,

        briefFiles:
          (t.files || [])
            .map(normFile),

        submissionFiles:
          (t.subFiles || [])
            .map(normFile),

        submissionNotes:
          t.subNotes || '',

        timeline:
          t.tl || []
      });
    },

    fromAdminTask: function (t) {
      return Shape.deliverable({

        id:
          t.id,

        projectId:
          t.projectId,

        milestoneId:
          t.milestoneId,

        title:
          t.title,

        description:
          t.desc,

        status:
          t.rejectionReason &&
          t.status !== 'Done'
            ? 'REJECTED'
            : normStatus(
                t.status
              ),

        priority:
          normPriority(
            t.priority
          ),

        assigneeIds:
          t.assignees &&
          t.assignees.length
            ? t.assignees
            : (
                t.assignee
                  ? [t.assignee]
                  : []
              ),

        rejectionReason:
          t.rejectionReason ||
          null,

        dueAt:
          t.deadline
            ? new Date(
                t.deadline
              ).toISOString()
            : null,

        estimateHours:
          t.hours || 0,

        progressPct:
          t.progress || 0,

        briefFiles:
          (t.files || [])
            .map(normFile),

        submissionFiles:
          (t.submissionFiles || [])
            .map(normFile),

        submissionNotes:
          t.submissionNotes || '',

        comments:
          t.messages || [],

        timeline:
          t.timeline || []
      });
    },

    fromAdminSubtask: function (
      s,
      deliverableId
    ) {
      return Shape.subtask({

        id:
          s.id,

        deliverableId:
          deliverableId,

        title:
          s.title,

        description:
          s.desc,

        status:
          s.rejectionReason &&
          s.status !== 'Done'
            ? 'REJECTED'
            : normStatus(
                s.status
              ),

        priority:
          normPriority(
            s.priority
          ),

        assigneeId:
          s.assignee,

        createdById:
          s.createdBy,

        origin:
          s.origin || (s.createdBy === s.assignee ? 'SELF' : 'ADMIN'),

        approvalState:
          s.approvalState || null,

        estimateSecs:
          TIME.hoursToSecs(
            s.estimatedTime
          ),

        loggedSecs:
          TIME.hoursToSecs(
            s.timeSpent
          ),

        rejectionReason:
          s.rejectionReason ||
          null,

        createdAt:
          s.createdAt ||
          null,

        completedAt:
          s.completedAt ||
          null,

        timeline:
          s.timeline || []
      });
    }
  };

  function normFile(f) {
    if (!f) {
      return null;
    }

    return {
      name:
        f.name ||
        f.n ||
        '',

      sizeLabel:
        f.sizeLabel ||
        (
          typeof f.size === 'string'
            ? f.size
            : ''
        ) ||
        f.s ||
        '',

      kind:
        String(
          f.kind ||
          f.type ||
          f.t ||
          'doc'
        ).toLowerCase(),

      url:
        f.url ||
        null,

      fileId:
        f.fileId ||
        null,

      mime:
        f.mime ||
        null,

      sizeBytes:
        f.sizeBytes ||
        (
          typeof f.size === 'number'
            ? f.size
            : null
        ),

      uploadedAt:
        f.uploadedAt ||
        null
    };
  }

  /* ==========================================================================
     7. EXPORT
     ========================================================================== */

  var Schema = {

    WORK_STATUS:
      WORK_STATUS,

    MILESTONE_STATUS:
      MILESTONE_STATUS,

    PROJECT_STATUS:
      PROJECT_STATUS,

    PRIORITY:
      PRIORITY,

    ATTENDANCE_STATUS:
      ATTENDANCE_STATUS,

    INVOICE_STATUS:
      INVOICE_STATUS,

    LEAD_STAGE:
      LEAD_STAGE,

    normStatus:
      normStatus,

    normPriority:
      normPriority,

    normProjectStatus:
      normProjectStatus,

    normMilestoneStatus:
      normMilestoneStatus,

    normAttendance:
      normAttendance,

    normInvoiceStatus:
      normInvoiceStatus,

    normLeadStage:
      normLeadStage,

    normFile:
      normFile,

    label:
      label,

    tone:
      tone,

    initialsOf:
      initialsOf,

    TIME:
      TIME,

    Shape:
      Shape,

    Select:
      Select,

    Adapt:
      Adapt
  };

  root.Schema = Schema;

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = Schema;
  }

})(typeof window !== 'undefined'
  ? window
  : globalThis);