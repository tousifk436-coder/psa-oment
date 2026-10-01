(function (root) {
  'use strict';

  var U = root.Utils, S = root.Schema;


  function importWonDeal(payload) {
    var errors = validateDeal(payload);
    if (errors.length) {
      return Promise.reject(Object.assign(
        new Error('Invalid deal payload: ' + errors.join('; ')),
        { code: 'VALIDATION', fields: errors }
      ));
    }

    var DB = root.DataAPI.raw();

    var existing = DB.projects.find(function (p) { return p.crmDealId === payload.dealId; });
    if (existing) {
      return Promise.resolve({ projectId: existing.id, created: false, reason: 'already imported' });
    }

    var dept = DB.departments.find(function (d) {
      return d.name.toLowerCase() === String(payload.deptName || '').toLowerCase();
    });
    var owner = DB.employees.find(function (e) {
      return e.email.toLowerCase() === String(payload.ownerEmail || '').toLowerCase();
    });

    return root.DataAPI.createProject({
      name: payload.projectName,
      clientName: payload.clientName,
      clientEmail: payload.clientEmail || '',
      clientGstin: payload.clientGstin || '',
      clientStateCode: payload.clientStateCode || '',
      status: 'PLANNING',
      priority: S.normPriority(payload.priority || 'MEDIUM'),
      deptId: dept ? dept.id : null,
      headId: owner ? owner.id : null,
      memberIds: owner ? [owner.id] : [],
      startDate: payload.startDate || U.isoDate(new Date()),
      deadline: payload.deadline || null,
      contractValuePaise: payload.contractValuePaise || 0,
      budgetPaise: payload.budgetPaise || payload.contractValuePaise || 0,
      spentPaise: 0,
      description: payload.notes || ''
    }).then(function (project) {
      project.crmDealId = payload.dealId;
      project.crmAccountId = payload.accountId || null;
      var stored = root.DataAPI.raw().projects.find(function (p) { return p.id === project.id; });
      if (stored) { stored.crmDealId = payload.dealId; stored.crmAccountId = payload.accountId || null; }

      var scope = payload.scope || [];
      var chain = Promise.resolve();
      scope.forEach(function (item, i) {
        chain = chain.then(function () {
          return root.DataAPI.createMilestone({
            projectId: project.id,
            title: item.title,
            description: item.description || '',
            dueDate: item.dueDate || null,
            status: 'UPCOMING',
            billable: item.billable !== false,
            sortOrder: i + 1
          });
        });
      });

      return chain.then(function () {
        root.DataAPI.flush();
        return { projectId: project.id, created: true, milestones: scope.length };
      });
    });
  }

  function validateDeal(p) {
    var e = [];
    if (!p) return ['payload missing'];
    if (!p.dealId) e.push('dealId required');
    if (!p.projectName) e.push('projectName required');
    if (!p.clientName) e.push('clientName required');
    if (p.contractValuePaise != null && typeof p.contractValuePaise !== 'number')
      e.push('contractValuePaise must be a number (paise, not rupees)');
    if (p.clientStateCode && !/^\d{2}$/.test(String(p.clientStateCode)))
      e.push('clientStateCode must be a 2-digit GST state code');
    if (p.scope && !Array.isArray(p.scope)) e.push('scope must be an array');
    (p.scope || []).forEach(function (s, i) {
      if (!s.title) e.push('scope[' + i + '].title required');
    });
    return e;
  }


  function getAccountHealth(crmAccountId) {
    var DB = root.DataAPI.raw();
    var projects = DB.projects.filter(function (p) {
      return crmAccountId ? p.crmAccountId === crmAccountId : true;
    });
    if (!projects.length) return Promise.resolve(null);

    var today = U.isoDate(new Date());
    var out = projects.map(function (p) {
      var dels = DB.deliverables.filter(function (d) { return d.projectId === p.id; });
      var late = dels.filter(function (d) {
        return d.status !== 'DONE' && d.dueAt && U.isoDate(d.dueAt) < today;
      }).length;
      var invs = DB.invoices.filter(function (i) {
        return i.projectId === p.id && i.status !== 'CANCELLED';
      });
      var billed = invs.reduce(function (s, i) { return s + i.totalPaise; }, 0);
      var paid = invs.reduce(function (s, i) { return s + i.paidPaise; }, 0);
      var overdue = invs.filter(function (i) {
        return i.status !== 'PAID' && i.dueDate && i.dueDate < today;
      }).reduce(function (s, i) { return s + (i.totalPaise - i.paidPaise); }, 0);

      return {
        crmDealId: p.crmDealId || null,
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        progressPct: root.DataAPI.projectProgress(p.id),
        deliverablesTotal: dels.length,
        deliverablesLate: late,
        billedPaise: billed,
        receivedPaise: paid,
        overduePaise: overdue,
        health: late > 2 || overdue > 0 ? 'AT_RISK' : late > 0 ? 'WATCH' : 'HEALTHY',
        safeToUpsell: late === 0 && overdue === 0
      };
    });

    return Promise.resolve(out);
  }

  /* ==========================================================================
     3. TRANSPORT — aaj in-process, kal HTTP
     ========================================================================== */

  var config = {
    enabled: false,           
    baseUrl: null,           // e.g. 'https://crm.oment.in/api'
    apiKey: null
  };

  function configure(opts) {
    Object.assign(config, opts || {});
    return config;
  }
  function isConnected() { return !!config.enabled; }

  function pushHealthToCrm() {
    if (!config.enabled) {
      return Promise.resolve({ skipped: true, reason: 'CRM not connected' });
    }
    return getAccountHealth(null).then(function (payload) {
      /* return fetch(config.baseUrl + '/accounts/health', {
           method: 'POST',
           headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+config.apiKey },
           body: JSON.stringify(payload)
         }).then(r => r.json()); */
      return { sent: false, wouldSend: payload };
    });
  }


  function sampleDeal() {
    return {
      dealId: 'crm_deal_demo_1',
      accountId: 'crm_acct_demo_1',
      projectName: 'Razorpay Merchant Portal',
      clientName: 'Razorpay Software Pvt. Ltd.',
      clientEmail: 's@razorpay.com',
      clientGstin: '29AAGCR4375J1ZU',
      clientStateCode: '29',
      contractValuePaise: U.rupeesToPaise(5600000),
      priority: 'HIGH',
      startDate: U.isoDate(new Date()),
      deadline: U.isoDate(U.daysFromNow(120)),
      deptName: 'Software',
      ownerEmail: 'priya@oment.in',
      scope: [
        { title: 'Discovery & technical architecture', dueDate: U.isoDate(U.daysFromNow(20)), billable: true },
        { title: 'Merchant onboarding module',         dueDate: U.isoDate(U.daysFromNow(60)), billable: true },
        { title: 'Settlement & reporting',             dueDate: U.isoDate(U.daysFromNow(95)), billable: true },
        { title: 'UAT & production handover',          dueDate: U.isoDate(U.daysFromNow(118)), billable: true }
      ],
      notes: 'Won via referral. CTO is the technical decision maker.'
    };
  }

  root.CrmIntegration = {
    importWonDeal: importWonDeal,
    validateDeal: validateDeal,
    getAccountHealth: getAccountHealth,
    pushHealthToCrm: pushHealthToCrm,
    configure: configure,
    isConnected: isConnected,
    sampleDeal: sampleDeal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.CrmIntegration;

})(typeof window !== 'undefined' ? window : globalThis);