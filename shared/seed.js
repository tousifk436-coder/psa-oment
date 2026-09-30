
(function (root) {
  'use strict';

  var U = root.Utils;
  var d = U.daysFromNow;          // ISO datetime, n din baad
  var iso = U.isoDate;            // 'YYYY-MM-DD'
  var P = U.rupeesToPaise;

  /* ── Company / tenant ────────────────────────────────────────────────── */
  var COMPANY = {
    name: 'Oment Technologies',
    legalName: 'Oment Technologies Pvt. Ltd.',
    gstin: '27AABCO1234F1Z5',
    stateCode: '27',                     
    address: '4th Floor, Trade Centre, Bandra Kurla Complex, Mumbai 400051',
    email: 'accounts@oment.in',
    phone: '+91 22 4000 1234',
    workdayTargetSecs: 8 * 3600
  };

  /* ── Departments ─────────────────────────────────────────────────────── */
  var DEPARTMENTS = [
    { id: 1, name: 'Software',   headId: 1, description: 'Product development and engineering', color: '#2563EB' },
    { id: 2, name: 'Design',     headId: 2, description: 'Brand, UI/UX and creative output',    color: '#7C3AED' },
    { id: 3, name: 'Operations', headId: 4, description: 'Project management and business ops', color: '#059669' }
  ];

  var EMPLOYEES = [
    { id:1, name:'Priya Sharma',   role:'Senior Developer',     deptId:1, email:'priya@oment.in',   phone:'+91 98765 11111', managerId:null, accessLevel:'MANAGER',  attendanceStatus:'PRESENT',  score:94, joinedAt:'2023-01-12', avatarInitials:'PS', avatarBg:'#DBEAFE', avatarFg:'#1D4ED8', color:'#2563EB', canLogin:true, costPerHourPaise:90000, billRatePaise:250000 },
    { id:2, name:'Arjun Mehta',    role:'UI/UX Designer',       deptId:2, email:'arjun@oment.in',   phone:'+91 98765 22222', managerId:null, accessLevel:'MANAGER',  attendanceStatus:'PRESENT',  score:88, joinedAt:'2023-03-05', avatarInitials:'AM', avatarBg:'#F5F3FF', avatarFg:'#5B21B6', color:'#7C3AED', canLogin:true, costPerHourPaise:60000, billRatePaise:180000 },
    { id:3, name:'Sneha Patel',    role:'Backend Developer',    deptId:1, email:'sneha@oment.in',   phone:'+91 98765 33333', managerId:1,    accessLevel:'EMPLOYEE', attendanceStatus:'ABSENT',   score:79, joinedAt:'2023-06-20', avatarInitials:'SP', avatarBg:'#DCFCE7', avatarFg:'#166534', color:'#059669', canLogin:true, costPerHourPaise:50000, billRatePaise:150000 },
    { id:4, name:'Vikram Nair',    role:'Project Manager',      deptId:3, email:'vikram@oment.in',  phone:'+91 98765 44444', managerId:null, accessLevel:'MANAGER',  attendanceStatus:'PRESENT',  score:91, joinedAt:'2022-02-15', avatarInitials:'VN', avatarBg:'#FFFBEB', avatarFg:'#92400E', color:'#D97706', canLogin:true, costPerHourPaise:80000, billRatePaise:220000 },
    { id:5, name:'Kavitha Reddy',  role:'Graphic Designer',     deptId:2, email:'kavitha@oment.in', phone:'+91 98765 55555', managerId:2,    accessLevel:'EMPLOYEE', attendanceStatus:'ON_LEAVE', score:83, joinedAt:'2023-09-01', avatarInitials:'KR', avatarBg:'#FEF2F2', avatarFg:'#991B1B', color:'#DC2626', canLogin:true, costPerHourPaise:40000, billRatePaise:120000 },
    { id:6, name:'Rohan Joshi',    role:'Full Stack Developer', deptId:1, email:'rohan@oment.in',   phone:'+91 98765 66666', managerId:1,    accessLevel:'EMPLOYEE', attendanceStatus:'PRESENT',  score:96, joinedAt:'2022-11-10', avatarInitials:'RJ', avatarBg:'#CFFAFE', avatarFg:'#155E75', color:'#0891B2', canLogin:true, costPerHourPaise:100000, billRatePaise:280000 },
    { id:7, name:'Ananya Singh',   role:'Business Analyst',     deptId:3, email:'ananya@oment.in',  phone:'+91 98765 77777', managerId:4,    accessLevel:'EMPLOYEE', attendanceStatus:'PRESENT',  score:85, joinedAt:'2023-04-28', avatarInitials:'AS', avatarBg:'#FCE7F3', avatarFg:'#9D174D', color:'#BE185D', canLogin:true, costPerHourPaise:55000, billRatePaise:160000 },
    { id:8, name:'Karthik Iyer',   role:'DevOps Engineer',      deptId:1, email:'karthik@oment.in', phone:'+91 98765 88888', managerId:1,    accessLevel:'EMPLOYEE', attendanceStatus:'PRESENT',  score:90, joinedAt:'2022-07-03', avatarInitials:'KI', avatarBg:'#EDE9FE', avatarFg:'#5B21B6', color:'#7C3AED', canLogin:true, costPerHourPaise:85000, billRatePaise:240000 },
    { id:9, name:'Alex Chen',      role:'Frontend Developer',   deptId:1, email:'alex@oment.in',    phone:'+91 98765 99999', managerId:1,    accessLevel:'EMPLOYEE', attendanceStatus:'PRESENT',  score:87, joinedAt:'2023-02-01', avatarInitials:'AC', avatarBg:'#E8E5DF', avatarFg:'#3D3B42', color:'#5C5A60', canLogin:true, costPerHourPaise:60000, billRatePaise:180000 }
  ];

  var ADMIN_USER = {
    id: 100, name: 'Rajesh Kumar', role: 'Super Admin', email: 'rajesh@oment.in',
    accessLevel: 'ADMIN', avatarInitials: 'RK', avatarBg: '#18171A', avatarFg: '#FFFFFF', color: '#18171A'
  };

  /* ── Projects — EK canonical naam per project ────────────────────────── */
  var PROJECTS = [
    { id:1, code:'SWG', name:'Swiggy Clone',       clientName:'Foodify India Pvt. Ltd.', clientEmail:'finance@foodify.in',     clientStateCode:'29',
      status:'ACTIVE',    priority:'HIGH',   deptId:1, headId:1, memberIds:[1,3,6,8,9],
      description:'Full-stack food delivery platform with real-time tracking, payment gateway integration and admin dashboard.',
      startDate: iso(d(-185)), deadline: iso(d(60)), budgetPaise:P(1200000), spentPaise:P(820000) },

    { id:2, code:'TCP', name:'Brand Revamp 2026',  clientName:'Tata Consumer Products',  clientEmail:'accounts@tataconsumer.com', clientStateCode:'27',
      status:'ACTIVE',    priority:'HIGH',   deptId:2, headId:2, memberIds:[2,5],
      description:'Complete visual identity overhaul including logo, brand guidelines, collateral and digital assets.',
      startDate: iso(d(-157)), deadline: iso(d(75)), budgetPaise:P(450000), spentPaise:P(180000) },

    { id:3, code:'JIO', name:'ERP Integration',    clientName:'Reliance Jio Infocomm',   clientEmail:'billing@jio.com',        clientStateCode:'27',
      status:'PLANNING',  priority:'MEDIUM', deptId:1, headId:6, memberIds:[1,3,6,8,9],
      description:'Enterprise ERP integration across two divisions with REST API layer and phased data migration.',
      startDate: iso(d(-40)), deadline: iso(d(150)), budgetPaise:P(2800000), spentPaise:P(340000) },

    { id:4, code:'INF', name:'HR Portal',          clientName:'Infosys BPM Ltd.',        clientEmail:'vendor@infosys.com',     clientStateCode:'29',
      status:'COMPLETED', priority:'LOW',    deptId:1, headId:8, memberIds:[2,8,9],
      description:'Employee attendance, leave management and payroll engine with client handover.',
      startDate: iso(d(-300)), deadline: iso(d(-95)), budgetPaise:P(900000), spentPaise:P(880000) }
  ];

  var MILESTONES = [
    // Swiggy Clone
    { id:1001, projectId:1, title:'Project Kickoff & Requirements', dueDate:iso(d(-178)), status:'DONE',        billable:true,  sortOrder:1, description:'Initial scoping with Foodify team, finalised tech stack and deliverables.' },
    { id:1002, projectId:1, title:'UI/UX Design Sign-off',          dueDate:iso(d(-140)), status:'DONE',        billable:true,  sortOrder:2, description:'High-fidelity mockups for customer app, restaurant dashboard and admin panel approved.' },
    { id:1003, projectId:1, title:'Backend & Auth Module',          dueDate:iso(d(-105)), status:'DONE',        billable:true,  sortOrder:3, description:'User auth, order schema and core APIs deployed to staging.' },
    { id:1004, projectId:1, title:'Payment Gateway Integration',    dueDate:iso(d(18)),   status:'IN_PROGRESS', billable:true,  sortOrder:4, description:'Razorpay integration with refund flows and UPI deep linking.' },
    { id:1005, projectId:1, title:'UAT & Production Launch',        dueDate:iso(d(58)),   status:'UPCOMING',    billable:true,  sortOrder:5, description:'Final round of UAT, performance testing and go-live.' },

    // Brand Revamp
    { id:2001, projectId:2, title:'Brand Discovery Workshop',       dueDate:iso(d(-150)), status:'DONE',        billable:true,  sortOrder:1, description:'Stakeholder interviews and competitor audit completed.' },
    { id:2002, projectId:2, title:'Logo Concepts (3 variants)',     dueDate:iso(d(12)),   status:'IN_PROGRESS', billable:true,  sortOrder:2, description:'Three creative directions presented for client review.' },
    { id:2003, projectId:2, title:'Brand Guidelines Document',      dueDate:iso(d(40)),   status:'UPCOMING',    billable:true,  sortOrder:3, description:'Typography, colour, voice and usage rules.' },
    { id:2004, projectId:2, title:'Collateral Rollout',             dueDate:iso(d(73)),   status:'UPCOMING',    billable:true,  sortOrder:4, description:'Templates, social kit and packaging system delivery.' },

    // ERP
    { id:3001, projectId:3, title:'Discovery & Architecture',       dueDate:iso(d(-12)),  status:'DONE',        billable:true,  sortOrder:1, description:'Technical architecture brief and integration scope signed off.' },
    { id:3002, projectId:3, title:'Phase 1 — API Layer',            dueDate:iso(d(45)),   status:'IN_PROGRESS', billable:true,  sortOrder:2, description:'REST API documentation and authentication layer.' },
    { id:3003, projectId:3, title:'Data Migration Pilot',           dueDate:iso(d(110)),  status:'UPCOMING',    billable:true,  sortOrder:3, description:'Pilot migration of two divisions.' },

    // HR Portal
    { id:4001, projectId:4, title:'Attendance & Leave Module',      dueDate:iso(d(-230)), status:'DONE',        billable:true,  sortOrder:1, description:'Core HR attendance and leave management.' },
    { id:4002, projectId:4, title:'Payroll Engine',                 dueDate:iso(d(-160)), status:'DONE',        billable:true,  sortOrder:2, description:'Payroll calculations, deductions and tax computation.' },
    { id:4003, projectId:4, title:'UAT & Handover',                 dueDate:iso(d(-95)),  status:'DONE',        billable:true,  sortOrder:3, description:'Final testing and client handover.' }
  ];

  var H = 3600;
  var DELIVERABLES = [
    { id:5001, projectId:1, milestoneId:1004, title:'Implement Razorpay payment gateway',
      description:'Integrate Razorpay with refund, webhook and UPI flows. Handle 3D Secure edge cases and idempotent webhook processing.',
      status:'IN_REVIEW', priority:'HIGH', assigneeIds:[1], createdById:100, origin:'ADMIN',
      dueAt:d(16), estimateSecs:160*H, loggedSecs:172*H, progressPct:70,
      briefFiles:[{name:'razorpay-integration-brief.pdf',sizeLabel:'1.2 MB',kind:'pdf'},{name:'api-credentials.txt',sizeLabel:'2 KB',kind:'doc'}],
      submissionFiles:[{name:'payment-module-v1.zip',sizeLabel:'3.4 MB',kind:'zip'}],
      submissionNotes:'Webhook handler and UPI flow complete. 2 edge cases on 3D Secure pending.',
      timeline:[{type:'assign',text:'Assigned to Priya Sharma',time:iso(d(-30))},{type:'submit',text:'Submitted for review',time:iso(d(-2))}] },

    { id:5002, projectId:1, milestoneId:1004, title:'Restaurant dashboard UI',
      description:'Admin panel for restaurants to manage menu, live orders and daily analytics.',
      status:'IN_PROGRESS', priority:'MEDIUM', assigneeIds:[2], createdById:100, origin:'ADMIN',
      dueAt:d(22), estimateSecs:130*H, loggedSecs:138*H, progressPct:35,
      briefFiles:[{name:'dashboard-wireframes.fig',sizeLabel:'4.8 MB',kind:'doc'}],
      timeline:[{type:'assign',text:'Assigned to Arjun Mehta',time:iso(d(-25))}] },

    { id:5003, projectId:1, milestoneId:1004, title:'Redesign onboarding flow screens',
      description:'Hi-fi mockups for the new user onboarding experience. 5 screens: welcome, profile setup, team invite, feature tour, completion. Follow the design system tokens.',
      status:'IN_PROGRESS', priority:'HIGH', assigneeIds:[9], createdById:100, origin:'ADMIN',
      dueAt:d(0.2), estimateSecs:2*H, loggedSecs:5280, progressPct:60,
      pricingMode:'PIECE', pricePaise:150000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'AGREED',adminSecs:2*H,employeeSecs:null,note:'',flagReason:'',agreedAt:iso(d(-2)),agreedById:9,auto:false,history:[{type:'admin_set',secs:2*H,by:100,at:iso(d(-3))},{type:'employee_accept',secs:2*H,by:9,at:iso(d(-2))}]},
      briefFiles:[{name:'onboarding-brief.pdf',sizeLabel:'1.2 MB',kind:'pdf'},{name:'brand-guidelines.pdf',sizeLabel:'2.1 MB',kind:'pdf'}],
      comments:[
        {fromId:1,text:'Please follow the new colour tokens from last week.',time:'09:15'},
        {fromId:9,text:'Got it. Do you need dark mode variants too?',time:'09:32'},
        {fromId:1,text:'Not for this sprint — light mode only.',time:'09:45'}
      ],
      timeline:[{type:'assign',text:'Assigned by Rajesh Kumar',time:iso(d(-3))},{type:'start',text:'Started — timer running',time:'Today 09:00'}] },

    { id:5004, projectId:1, milestoneId:1005, title:'QA test Stripe fallback integration',
      description:'Full regression on the fallback gateway. Test success, failure, refunds and webhooks.',
      status:'TODO', priority:'MEDIUM', assigneeIds:[9,3], createdById:100, origin:'ADMIN',
      dueAt:d(5), estimateSecs:24*H, loggedSecs:0, progressPct:0,
      pricingMode:'PIECE', pricePaise:1200000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'COUNTERED',adminSecs:24*H,employeeSecs:30*H,note:'There are 40 test cases across refund + webhook flows, a full regression won’t fit in 24h',flagReason:'',agreedAt:null,agreedById:null,auto:false,history:[{type:'admin_set',secs:24*H,by:100,at:iso(d(-2))},{type:'employee_propose',secs:30*H,by:9,note:'There are 40 test cases across refund + webhook flows, a full regression won’t fit in 24h',at:iso(d(-1))}]},
      briefFiles:[{name:'test-cases-v3.xlsx',sizeLabel:'540 KB',kind:'xls'}],
      timeline:[{type:'assign',text:'Assigned by Rajesh Kumar',time:iso(d(-2))}] },

    { id:5005, projectId:1, milestoneId:1005, title:'Optimise image loading — lazy load + WebP',
      description:'Lazy loading for product images, JPG/PNG to WebP conversion. Target 40% page load improvement.',
      status:'TODO', priority:'MEDIUM', assigneeIds:[9], createdById:100, origin:'ADMIN',
      dueAt:d(8), estimateSecs:16*H, loggedSecs:0, progressPct:0,
      briefFiles:[{name:'image-audit.xlsx',sizeLabel:'280 KB',kind:'xls'}],
      timeline:[{type:'assign',text:'Assigned by Rajesh Kumar',time:iso(d(-1))}] },

    { id:5006, projectId:2, milestoneId:2002, title:'Logo concept direction A — modern minimal',
      description:'Three lockup variants, monochrome and colour, with clear-space rules.',
      status:'IN_PROGRESS', priority:'HIGH', assigneeIds:[2,5], createdById:100, origin:'ADMIN',
      dueAt:d(10), estimateSecs:180*H, loggedSecs:412*H, progressPct:45,
      timeline:[{type:'assign',text:'Assigned to Arjun Mehta & Kavitha Reddy',time:iso(d(-20))}] },

    { id:5007, projectId:3, milestoneId:3002, title:'Write API documentation for v2 endpoints',
      description:'Document all REST API endpoints in v2 — request/response examples, auth flows, error codes, rate limits.',
      status:'REJECTED', priority:'HIGH', assigneeIds:[9], createdById:100, origin:'ADMIN',
      approvalState:'REJECTED',
      rejectionReason:'Auth flow section is incomplete — refresh token rotation and the error code table are missing. Add rate limit examples too, then resubmit.',
      dueAt:d(-0.06), estimateSecs:48*H, loggedSecs:62*H, progressPct:40,
      briefFiles:[{name:'v2-endpoints-list.xlsx',sizeLabel:'320 KB',kind:'xls'},{name:'doc-template.docx',sizeLabel:'88 KB',kind:'doc'}],
      timeline:[
        {type:'assign',text:'Assigned by Rajesh Kumar',time:iso(d(-10))},
        {type:'submit',text:'Submitted for review',time:iso(d(-3))},
        {type:'reject',text:'Rejected by Rajesh Kumar',time:iso(d(-2))}] },

    { id:5008, projectId:3, milestoneId:3002, title:'Code review — auth PR #247',
      description:'Review JWT refresh token implementation. Security, edge cases, code quality. Detailed comments chhodo.',
      status:'TODO', priority:'MEDIUM', assigneeIds:[9], createdById:100, origin:'ADMIN',
      dueAt:d(0.08), estimateSecs:12*H, loggedSecs:0, progressPct:0,
      pricingMode:'PIECE', pricePaise:600000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'PENDING',adminSecs:12*H,employeeSecs:null,note:'',flagReason:'',agreedAt:null,agreedById:null,auto:false,history:[{type:'admin_set',secs:12*H,by:100,at:iso(d(-1))}]},
      briefFiles:[{name:'pr-247-diff.pdf',sizeLabel:'1.1 MB',kind:'pdf'}],
      timeline:[{type:'assign',text:'Assigned by Rajesh Kumar',time:'Today 09:30'}] },

    { id:5009, projectId:4, milestoneId:4001, title:'Attendance tracker module',
      description:'Clock-in/out, leave requests and monthly reports.',
      status:'DONE', priority:'MEDIUM', assigneeIds:[8,9], createdById:100, origin:'ADMIN',
      approvalState:'APPROVED',
      dueAt:d(-230), estimateSecs:90*H, loggedSecs:96*H, progressPct:100,
      submissionFiles:[{name:'attendance-module.zip',sizeLabel:'1.8 MB',kind:'zip'}],
      submissionNotes:'Module complete, client UAT passed.',
      timeline:[{type:'assign',text:'Assigned',time:iso(d(-260))},{type:'approve',text:'Approved by Admin',time:iso(d(-232))}] },

    { id:5010, projectId:4, milestoneId:4002, title:'Payroll calculation engine',
      description:'Salary, deductions and tax computation with payslip generation.',
      status:'DONE', priority:'HIGH', assigneeIds:[8], createdById:100, origin:'ADMIN',
      approvalState:'APPROVED',
      dueAt:d(-160), estimateSecs:140*H, loggedSecs:155*H, progressPct:100,
      timeline:[{type:'approve',text:'Approved by Admin',time:iso(d(-163))}] },

    { id:5011, projectId:1, milestoneId:1004, title:'Research: competitor onboarding patterns',
      description:'Analysed 8 top apps for onboarding UX patterns. Documenting findings for Sprint 2 planning.',
      status:'IN_REVIEW', priority:'MEDIUM', assigneeIds:[9], createdById:9, origin:'SELF',
      approvalState:'PENDING',
      dueAt:d(3), estimateSecs:2.5*H, loggedSecs:2.3*H, progressPct:80,
      submissionFiles:[{name:'competitor-research.pdf',sizeLabel:'800 KB',kind:'pdf'}],
      submissionNotes:'Swiggy, Zomato, Blinkit, Amazon Fresh, BigBasket, Dunzo, Zepto, JioMart analysed. Found 3 key patterns.',
      timeline:[
        {type:'create',text:'Self-assigned by Alex Chen',time:iso(d(-2))},
        {type:'submit',text:'Submitted for admin review',time:iso(d(-1))}] },

    /* ── Piece-rate demo tasks (shared/wallet.js) ── */
    /* Rohan — time ke andar, poora price */
    { id:5012, projectId:3, milestoneId:3002, title:'Rate limiter middleware for v2 API',
      description:'Token-bucket rate limiting per API key. Redis-backed, 429 with Retry-After header.',
      status:'DONE', priority:'HIGH', assigneeIds:[6], createdById:100, origin:'ADMIN', approvalState:'APPROVED',
      dueAt:d(-4), estimateSecs:4*H, loggedSecs:3.5*H, progressPct:100,
      pricingMode:'PIECE', pricePaise:250000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'AGREED',adminSecs:4*H,employeeSecs:null,note:'',flagReason:'',agreedAt:iso(d(-6)),agreedById:6,auto:false,history:[]},
      settlement:{settledAt:iso(d(-3)),entryIds:['w_seed_1'],basePaise:250000,finalPaise:250000,cutPaise:0,estimateSecs:4*H,chargeableSecs:3.5*H,overSecs:0,steps:0,cutPct:6,stepSecs:3600,floorPaise:162500,hitFloor:false,why:'Agreed 4h, took 3h 30m \u2014 within time. Full price.'},
      timeline:[{type:'assign',text:'Assigned to Rohan Joshi',time:iso(d(-6))},{type:'submit',text:'Submitted for review',time:iso(d(-4))},{type:'approve',text:'Approved by Admin',time:iso(d(-3))}] },

    /* Alex — 1 hour over, one slab */
    { id:5013, projectId:1, milestoneId:1004, title:'Fix cart total rounding bug (paise mismatch)',
      description:'Cart total and invoice total differed by 1 paisa. Apply round-half-even and test the 6 edge cases.',
      status:'DONE', priority:'MEDIUM', assigneeIds:[9], createdById:100, origin:'ADMIN', approvalState:'APPROVED',
      dueAt:d(-5), estimateSecs:1*H, loggedSecs:2*H+300, progressPct:100,
      pricingMode:'PIECE', pricePaise:80000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'AGREED',adminSecs:1*H,employeeSecs:null,note:'',flagReason:'',agreedAt:iso(d(-7)),agreedById:9,auto:true,history:[]},
      settlement:{settledAt:iso(d(-4)),entryIds:['w_seed_2','w_seed_3'],basePaise:80000,finalPaise:75200,cutPaise:4800,estimateSecs:1*H,chargeableSecs:2*H+300,overSecs:1*H+300,steps:1,cutPct:6,stepSecs:3600,floorPaise:52000,hitFloor:false,why:'Agreed 1h, took 2h 5m (1h 5m extra). 1 slab \u00d7 6% = \u20B948 off.'},
      reworkCount:0,
      timeline:[{type:'assign',text:'Assigned to Alex Chen',time:iso(d(-7))},{type:'submit',text:'Submitted for review',time:iso(d(-5))},{type:'approve',text:'Approved by Admin',time:iso(d(-4))}] },

    { id:5014, projectId:1, milestoneId:1005, title:'Integrate Shiprocket tracking webhook',
      description:'Receive order status updates from Shiprocket via webhook and show them in the order timeline.',
      status:'IN_PROGRESS', priority:'HIGH', assigneeIds:[3], createdById:100, origin:'ADMIN',
      dueAt:d(2), estimateSecs:5*H, loggedSecs:1.2*H, progressPct:25,
      pricingMode:'PIECE', pricePaise:300000, slab:{stepSecs:3600,cutPct:6,floorPct:65,graceSecs:0},
      agreement:{state:'AGREED',adminSecs:5*H,employeeSecs:null,note:'',flagReason:'',agreedAt:iso(d(-1)),agreedById:3,auto:false,history:[]},
      blocked:{reason:'Client hasn’t sent the Shiprocket API keys yet \u2014 can’t test in sandbox',since:new Date(Date.now()-5*3600000).toISOString(),byId:3},
      blockedSecs:0, blockedLog:[],
      timeline:[{type:'assign',text:'Assigned to Sneha Patel',time:iso(d(-1))},{type:'start',text:'Work started',time:iso(d(-0.5))},{type:'pause',text:'Blocked \u2014 client hasn’t sent the Shiprocket API keys yet',time:new Date(Date.now()-5*3600000).toISOString()}] }
  ];

  /* ── Wallet ledger (seed) — 5012/5013 ke settlements ─────────────────── */
  var WALLET_ENTRIES = [
    { id:'w_seed_3', employeeId:9, deliverableId:5013, projectId:1, type:'SLAB_ADJUSTMENT', amountPaise:-4800,
      why:'Late slab applied. Agreed 1h, took 2h 5m (1h 5m extra). 1 slab \u00d7 6% = \u20B948 off.', createdAt:iso(d(-4)) + 'T14:20:00.000Z', meta:{} },
    { id:'w_seed_2', employeeId:9, deliverableId:5013, projectId:1, type:'TASK_CREDIT', amountPaise:80000,
      why:'"Fix cart total rounding bug (paise mismatch)" was approved. Task price \u20B9800.', createdAt:iso(d(-4)) + 'T14:20:00.000Z', meta:{} },
    { id:'w_seed_1', employeeId:6, deliverableId:5012, projectId:3, type:'TASK_CREDIT', amountPaise:250000,
      why:'"Rate limiter middleware for v2 API" was approved. Task price \u20B92,500.', createdAt:iso(d(-3)) + 'T11:05:00.000Z', meta:{} },
    { id:'w_seed_0', employeeId:6, deliverableId:null, projectId:null, type:'PAYOUT', amountPaise:-180000,
      why:'August payout \u2014 UPI', createdAt:iso(d(-20)) + 'T10:00:00.000Z', meta:{manual:true} },
    { id:'w_seed_00', employeeId:6, deliverableId:null, projectId:null, type:'TASK_CREDIT', amountPaise:180000,
      why:'"Webhook retry queue" was approved. Task price \u20B91,800.', createdAt:iso(d(-25)) + 'T16:30:00.000Z', meta:{} }
  ];

  /* ── Subtasks — deliverable ke andar work breakdown ──────────────────── */
  var SUBTASKS = [
    { id:6001, deliverableId:5001, title:'Research payment gateway providers', description:'Compare Razorpay, Stripe and PayU — Indian market fit, fees, UPI support.',
      status:'DONE', priority:'MEDIUM', assigneeId:1, createdById:1, estimateSecs:3*H, loggedSecs:2.5*H, approvalState:'APPROVED',
      createdAt:iso(d(-28)), completedAt:iso(d(-27)) },
    { id:6002, deliverableId:5001, title:'Razorpay account & API key setup', description:'KYC, test & live mode credentials, .env config.',
      status:'DONE', priority:'HIGH', assigneeId:1, createdById:1, estimateSecs:2*H, loggedSecs:1.5*H, approvalState:'APPROVED',
      createdAt:iso(d(-26)), completedAt:iso(d(-25)) },
    { id:6003, deliverableId:5001, title:'Implement webhook handler', description:'Handle payment.captured, payment.failed and refund.processed events with idempotency.',
      status:'IN_REVIEW', priority:'HIGH', assigneeId:1, createdById:1, estimateSecs:4*H, loggedSecs:3*H, approvalState:'PENDING',
      createdAt:iso(d(-22)) },
    { id:6004, deliverableId:5001, title:'UPI flow end-to-end testing', description:'Real testing on GPay, PhonePe, Paytm — include failures and partial refunds.',
      status:'IN_PROGRESS', priority:'HIGH', assigneeId:1, createdById:1, estimateSecs:3*H, loggedSecs:1*H,
      createdAt:iso(d(-18)) },
    { id:6005, deliverableId:5003, title:'Welcome screen mockup', status:'DONE', priority:'MEDIUM', assigneeId:9, createdById:9, estimateSecs:1*H, loggedSecs:1*H, approvalState:'APPROVED', createdAt:iso(d(-3)), completedAt:iso(d(-2)) },
    { id:6006, deliverableId:5003, title:'Profile setup screen',  status:'DONE', priority:'MEDIUM', assigneeId:9, createdById:9, estimateSecs:1*H, loggedSecs:1.2*H, approvalState:'APPROVED', createdAt:iso(d(-3)), completedAt:iso(d(-1)) },
    { id:6007, deliverableId:5003, title:'Team invite flow',      status:'IN_PROGRESS', priority:'HIGH', assigneeId:9, createdById:9, estimateSecs:1.5*H, loggedSecs:0.5*H, createdAt:iso(d(-2)) },
    { id:6008, deliverableId:5003, title:'Feature tour carousel', status:'TODO', priority:'MEDIUM', assigneeId:9, createdById:9, estimateSecs:2*H, loggedSecs:0, createdAt:iso(d(-2)) },
    { id:6009, deliverableId:5003, title:'Completion confirmation', status:'TODO', priority:'LOW', assigneeId:9, createdById:9, estimateSecs:1*H, loggedSecs:0, createdAt:iso(d(-2)) },
    { id:6010, deliverableId:5006, title:'Moodboard & reference collection', status:'DONE', priority:'MEDIUM', assigneeId:5, createdById:2, estimateSecs:4*H, loggedSecs:4*H, approvalState:'APPROVED', createdAt:iso(d(-19)), completedAt:iso(d(-17)) },
    { id:6011, deliverableId:5006, title:'Concept A wordmark drafts', status:'IN_PROGRESS', priority:'HIGH', assigneeId:2, createdById:2, estimateSecs:8*H, loggedSecs:5*H, createdAt:iso(d(-15)) },
    { id:6012, deliverableId:5007, title:'Endpoint inventory sheet', status:'DONE', priority:'MEDIUM', assigneeId:9, createdById:9, estimateSecs:2*H, loggedSecs:2*H, approvalState:'APPROVED', createdAt:iso(d(-9)), completedAt:iso(d(-8)) },
    { id:6013, deliverableId:5007, title:'Auth flow documentation', status:'IN_PROGRESS', priority:'HIGH', assigneeId:9, createdById:9, estimateSecs:3*H, loggedSecs:3.5*H,
      rejectionReason:'Refresh token rotation is missing.', createdAt:iso(d(-7)) }
  ];

  /* ── Attendance — per employee per din ───────────────────────────────── */
  function spreadTime(empId, activeSecs, seedNum) {
    if (!activeSecs) return {};
    var mine = DELIVERABLES.filter(function (d) {
      return (d.assigneeIds || []).indexOf(empId) >= 0;
    });
    if (!mine.length) return {};
    var taggable = Math.round(activeSecs * 0.85);
    var picks = mine.length === 1 ? mine : [mine[seedNum % mine.length], mine[(seedNum + 1) % mine.length]];
    var out = {};
    if (picks.length === 1) { out[picks[0].id] = taggable; return out; }
    var split = Math.round(taggable * 0.62);
    out[picks[0].id] = split;
    out[picks[1].id] = taggable - split;
    return out;
  }

  function buildAttendance() {
    var out = [], today = new Date();
    EMPLOYEES.forEach(function (e) {
      for (var i = 0; i < 21; i++) {
        var day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        var dow = day.getDay();
        if (dow === 0 || dow === 6) continue;            // weekend skip
        var seed = (e.id * 31 + i * 17) % 100;
        var status = seed < 6 ? 'ABSENT' : seed < 11 ? 'HALF_DAY' : 'PRESENT';
        if (i === 0 && e.attendanceStatus !== 'PRESENT') status = e.attendanceStatus;
        var active = status === 'ABSENT' ? 0 : status === 'HALF_DAY' ? 13500 + seed * 10 : 25200 + seed * 60;
        var idle   = status === 'ABSENT' ? 0 : Math.round(active * 0.16);
        out.push({
          id: 'att_' + e.id + '_' + i,
          employeeId: e.id,
          date: iso(day),
          status: status,
          firstInAt: status === 'ABSENT' ? null : iso(day) + 'T09:' + String(5 + (seed % 25)).padStart(2, '0') + ':00',
          lastOutAt: status === 'ABSENT' || i === 0 ? null : iso(day) + 'T18:' + String(seed % 55).padStart(2, '0') + ':00',
          sessionSecs: active + idle,
          activeSecs: active,
          idleSecs: idle,
          breaks: status === 'ABSENT' ? [] : [{ type: 'Lunch', startAt: iso(day) + 'T13:00:00', endAt: iso(day) + 'T14:00:00', secs: 3600 }],
          perDeliverableSecs: spreadTime(e.id, active, seed)
        });
      }
    });
    return out;
  }
  var ATTENDANCE = buildAttendance();

  /* ── Invoices ────────────────────────────────────────────────────────── */
  function inv(o) {
    var sub = o.subtotalPaise;
    var gst = U.computeGst(sub, 18, COMPANY.stateCode, o.placeOfSupply);
    return {
      id: o.id, number: o.number, projectId: o.projectId, milestoneId: o.milestoneId || null,
      clientName: o.clientName, clientEmail: o.clientEmail, clientGstin: o.clientGstin || '',
      placeOfSupply: o.placeOfSupply, status: o.status,
      issueDate: o.issueDate, dueDate: o.dueDate,
      lines: o.lines,
      subtotalPaise: sub,
      cgstPaise: gst.cgstPaise, sgstPaise: gst.sgstPaise, igstPaise: gst.igstPaise,
      totalPaise: gst.totalPaise, paidPaise: o.paidPaise || 0, notes: o.notes || ''
    };
  }
  var INVOICES = [
    inv({ id:7001, number:'INV/2026-27/0001', projectId:1, milestoneId:1002, clientName:'Foodify India Pvt. Ltd.', clientEmail:'finance@foodify.in', clientGstin:'29AABCF5678K1Z3', placeOfSupply:'29',
      status:'PAID', issueDate:iso(d(-96)), dueDate:iso(d(-66)), subtotalPaise:P(480000), paidPaise:P(566400),
      lines:[{description:'Milestone 2 — UI/UX Design Sign-off',hsnSac:'998314',qty:1,ratePaise:P(480000)}],
      notes:'First milestone payment — 40% of project value' }),
    inv({ id:7002, number:'INV/2026-27/0002', projectId:2, milestoneId:2001, clientName:'Tata Consumer Products', clientEmail:'accounts@tataconsumer.com', clientGstin:'27AAACT2727Q1ZW', placeOfSupply:'27',
      status:'SENT', issueDate:iso(d(-52)), dueDate:iso(d(-22)), subtotalPaise:P(225000),
      lines:[{description:'Brand Discovery Workshop — 50% advance',hsnSac:'998311',qty:1,ratePaise:P(225000)}],
      notes:'First instalment — 50% advance' }),
    inv({ id:7003, number:'INV/2026-27/0003', projectId:3, milestoneId:3001, clientName:'Reliance Jio Infocomm', clientEmail:'billing@jio.com', clientGstin:'27AAACR5055K1ZL', placeOfSupply:'27',
      status:'OVERDUE', issueDate:iso(d(-70)), dueDate:iso(d(-40)), subtotalPaise:P(700000),
      lines:[{description:'Discovery phase and architecture setup fee',hsnSac:'998314',qty:1,ratePaise:P(700000)}],
      notes:'Discovery phase and initial setup fee — follow up needed' }),
    inv({ id:7004, number:'INV/2026-27/0004', projectId:4, milestoneId:4003, clientName:'Infosys BPM Ltd.', clientEmail:'vendor@infosys.com', clientGstin:'29AAACI4798L1ZS', placeOfSupply:'29',
      status:'PARTIALLY_PAID', issueDate:iso(d(-48)), dueDate:iso(d(-18)), subtotalPaise:P(340000), paidPaise:P(200000),
      lines:[{description:'Final delivery — UAT & handover',hsnSac:'998314',qty:1,ratePaise:P(340000)}],
      notes:'Partial payment received, balance pending' }),
    inv({ id:7005, number:'INV/2026-27/0005', projectId:1, milestoneId:1003, clientName:'Foodify India Pvt. Ltd.', clientEmail:'finance@foodify.in', clientGstin:'29AABCF5678K1Z3', placeOfSupply:'29',
      status:'DRAFT', issueDate:iso(d(-4)), dueDate:iso(d(26)), subtotalPaise:P(360000),
      lines:[{description:'Milestone 3 — Backend & Auth Module',hsnSac:'998314',qty:1,ratePaise:P(360000)}],
      notes:'Pending internal approval before sending' })
  ];

  /* ── Notices ─────────────────────────────────────────────────────────── */
  var NOTICES = [
    { id:9001, title:'\uD83D\uDEA8 Q2 All-Hands — Mandatory Attendance', date:iso(d(-2)), recipients:'all', priority:'Urgent', status:'Sent',
      readBy:[1,2,4,6,8], notReadBy:[3,5,7,9],
      content:'<p><strong>Dear Team,</strong></p><p>Our <strong>Q2 All-Hands Meeting</strong> is confirmed for next Monday at <strong>11:00 AM &ndash; 12:30 PM</strong> in the Main Conference Room (3rd Floor). Remote employees will receive a Meet link.</p><p><strong>Agenda:</strong></p><ul><li>Q1 performance review &mdash; revenue, project wins and key learnings</li><li>Q2 OKRs and company priorities</li><li>New client announcements &mdash; Razorpay onboarding and Nykaa kickoff</li><li>Employee recognition and top performer awards</li><li>Open Q&amp;A</li></ul><p><strong>Attendance is mandatory for all full-time employees.</strong> If you are on leave, inform your department head by EOD Friday.</p><p>Regards,<br><strong>Rajesh Kumar</strong><br>Super Admin</p>',
      attachments:['Q2_Agenda.pdf','Q1_Highlights_Deck.pdf'] },
    { id:9002, title:'Updated Code Review Protocol — Software Team', date:iso(d(-5)), recipients:'dept:Software', priority:'Normal', status:'Sent',
      readBy:[1,6], notReadBy:[3,8,9],
      content:'<p><strong>Software Team,</strong></p><p>Effective Monday, the following code review standards apply across all active repositories:</p><ul><li>PRs with <strong>200+ lines of change</strong> require <strong>two reviewer approvals</strong> before merge</li><li>Hotfixes may proceed with <strong>one senior approval</strong>, followed by retrospective review within 48 hours</li><li>PRs must include test coverage report, updated API docs, and a QA checklist</li><li>No PR may be merged by its own author</li></ul><p>This is being introduced ahead of the Jio ERP delivery, which requires enterprise-grade reliability.</p><p>Priya Sharma<br><em>Engineering Lead</em></p>',
      attachments:['Code_Review_Checklist_v3.pdf'] },
    { id:9003, title:'Work From Home Policy — Updated Guidelines', date:iso(d(-8)), recipients:'all', priority:'Normal', status:'Sent',
      readBy:[1,2,4,6,7,8], notReadBy:[3,5,9],
      content:'<p><strong>All Employees,</strong></p><p>Following the team survey, our <strong>Work From Home policy</strong> has been updated effective next month:</p><ul><li><strong>WFH days:</strong> up to <strong>2 days per week</strong> (Tuesday and Thursday preferred). Fridays are mandatory in-office.</li><li><strong>Advance notice:</strong> requests must be logged at least <strong>24 hours in advance</strong>.</li><li><strong>Availability:</strong> reachable on Slack and available for calls between <strong>10:00 AM &ndash; 5:00 PM</strong>.</li><li><strong>Exceptions:</strong> employees on active client delivery sprints may be required in-office on additional days.</li></ul><p>Please acknowledge by marking this notice as read.</p>',
      attachments:['WFH_Policy.pdf'] },
    { id:9004, title:'Client Site Visit — Reliance Jio Office', date:iso(d(-10)), recipients:'dept:Software', priority:'Urgent', status:'Sent',
      readBy:[1,3,8], notReadBy:[6,9],
      content:'<p><strong>Software Team (ERP sub-team),</strong></p><p>The <strong>Jio ERP kickoff meeting</strong> is confirmed at the Reliance Jio office in BKC, Mumbai.</p><p><strong>Pre-visit checklist:</strong></p><ul><li>Bring printed copies of the Technical Architecture document</li><li>Carry Oment ID cards &mdash; visitor passes at reception by 2:45 PM</li><li>Data security agreement must be signed on-site</li><li>Laptops must not contain client data from other projects</li></ul><p>Car pool leaves from office at <strong>1:45 PM sharp</strong>.</p><p>Vikram Nair<br><em>Operations Manager</em></p>',
      attachments:['Jio_Architecture_Brief.pdf'] },
    { id:9005, title:'Diwali Bonus Structure & Holiday Calendar (Draft)', date:iso(d(-1)), recipients:'all', priority:'Normal', status:'Draft',
      readBy:[], notReadBy:[],
      content:'<p><strong>[DRAFT &mdash; Pending Finance Approval]</strong></p><p>Proposed <strong>Diwali bonus structure</strong> and H2 holiday calendar. Subject to change upon finance sign-off.</p><ul><li>1&ndash;2 years tenure: <strong>10% of monthly CTC</strong></li><li>2&ndash;4 years tenure: <strong>18% of monthly CTC</strong></li><li>4+ years tenure: <strong>25% of monthly CTC</strong></li><li>All amounts subject to TDS as applicable</li></ul><p>Final announcement once the MD approves.</p>',
      attachments:[] }
  ];

  /* ── Conversations ───────────────────────────────────────────────────── */
  var CONVERSATIONS = [
    { id:1, withId:1, unread:2, msgs:[
      { fromId:1, text:'Good morning! Quick update on the Swiggy project.', at:d(-0.4) },
      { fromId:1, text:'Payment gateway integration is 80% done. Will wrap up by tomorrow.', at:d(-0.39) },
      { fromId:100, text:'Great. Did you test the 3D Secure edge cases?', at:d(-0.3) },
      { fromId:1, text:'2 pending, I’ll clear them by this evening.', at:d(-0.25) } ] },
    { id:2, withId:2, unread:0, msgs:[
      { fromId:2, text:'Logo concepts are ready for review.', at:d(-1.2) },
      { fromId:100, text:'Perfect, I’ll take a look tomorrow morning.', at:d(-1.1) } ] },
    { id:3, withId:9, unread:1, msgs:[
      { fromId:9, text:'API docs resubmitted — the auth section is complete now.', at:d(-0.2) } ] },
    { id:4, withId:4, unread:0, msgs:[
      { fromId:4, text:'Visitor passes for the Jio site visit are arranged.', at:d(-2.1) },
      { fromId:100, text:'Thanks Vikram.', at:d(-2.05) } ] }
  ];

  /* ── Calendar ────────────────────────────────────────────────────────── */
  var CALENDAR_EVENTS = [
    { id:1, title:'Q2 All-Hands',              date:iso(d(4)),   time:'11:00', type:'Meeting',  color:'#DC2626' },
    { id:2, title:'Foodify sprint review',     date:iso(d(2)),   time:'15:00', type:'Review',   color:'#2563EB' },
    { id:3, title:'Razorpay CTO intro call',   date:iso(d(1)),   time:'10:30', type:'Call',     color:'#059669' },
    { id:4, title:'Tata logo presentation',    date:iso(d(9)),   time:'14:00', type:'Client',   color:'#7C3AED' },
    { id:5, title:'Payment gateway deadline',  date:iso(d(16)),  time:'18:00', type:'Deadline', color:'#D97706' },
    { id:6, title:'Jio ERP architecture sync', date:iso(d(6)),   time:'16:00', type:'Meeting',  color:'#0891B2' }
  ];

  /* ── Call logs ───────────────────────────────────────────────────────── */
  var CALL_LOGS = [
    { id:1, name:'Anisha Khanna (Cred)',       number:'+91 99876 54321', durationSecs:1122, type:'Outbound', at:d(-0.3), status:'Connected' },
    { id:2, name:'Unknown',                     number:'+91 98765 12345', durationSecs:0,    type:'Inbound',  at:d(-0.5), status:'Missed' },
    { id:3, name:'Suresh Iyer (Bigbasket)',     number:'+91 90000 11111', durationSecs:738,  type:'Outbound', at:d(-1.2), status:'Connected' },
    { id:4, name:'Ritu Banerjee (Paytm)',       number:'+91 90123 45678', durationSecs:1865, type:'Outbound', at:d(-1.4), status:'Connected' },
    { id:5, name:'Karan Joshi (PolicyBazaar)',  number:'+91 90909 80808', durationSecs:0,    type:'Outbound', at:d(-2.3), status:'Failed' },
    { id:6, name:'Deepak Nair (Razorpay)',      number:'+91 92345 67890', durationSecs:1470, type:'Outbound', at:d(-3.1), status:'Connected' }
  ];

  var NOTIFICATIONS = [
    { id:1, recipientId:100, kind:'REVIEW',   title:'Deliverable submitted for review', body:'Priya Sharma — "Implement Razorpay payment gateway"', entityType:'DELIVERABLE', entityId:5001, read:false, createdAt:d(-0.08) },
    { id:2, recipientId:100, kind:'REVIEW',   title:'Self-task pending approval',       body:'Alex Chen — "Research: competitor onboarding patterns"', entityType:'DELIVERABLE', entityId:5011, read:false, createdAt:d(-0.04) },
    { id:3, recipientId:100, kind:'DUE',      title:'Invoice overdue',                  body:'INV/2026-27/0003 — Reliance Jio, 40 days past due',    entityType:'INVOICE',    entityId:7003, read:false, createdAt:d(-0.2) },
    { id:4, recipientId:100, kind:'INFO',     title:'Milestone completed',              body:'"Discovery & Architecture" — ERP Integration',          entityType:'MILESTONE',  entityId:3001, read:true,  createdAt:d(-1.0) },
    { id:5, recipientId:100, kind:'INFO',     title:'New lead assigned',                body:'Razorpay — ₹56.0L — assigned to Vikram Nair',           entityType:'LEAD',       entityId:8007, read:true,  createdAt:d(-1.4) },

    { id:11, recipientId:9, kind:'ASSIGNED',  title:'New task assigned',                body:'"Code review — auth PR #247" · High priority',          entityType:'DELIVERABLE', entityId:5008, read:false, createdAt:d(-0.02) },
    { id:12, recipientId:9, kind:'REJECTED',  title:'Task returned for revision',       body:'"Write API documentation for v2 endpoints" — tap to see reason', entityType:'DELIVERABLE', entityId:5007, read:false, createdAt:d(-2) },
    { id:13, recipientId:9, kind:'DUE',       title:'Deadline approaching',             body:'"Redesign onboarding flow screens" — due in 5 hours',   entityType:'DELIVERABLE', entityId:5003, read:false, createdAt:d(-0.05) },
    { id:14, recipientId:9, kind:'INFO',      title:'Self-task under review',           body:'"Research: competitor onboarding patterns" submitted',  entityType:'DELIVERABLE', entityId:5011, read:true,  createdAt:d(-1) },
    { id:15, recipientId:1, kind:'ASSIGNED',  title:'New task assigned',                body:'"Implement Razorpay payment gateway"',                  entityType:'DELIVERABLE', entityId:5001, read:true,  createdAt:d(-30) }
  ];

  /* ── Activity feed ───────────────────────────────────────────────────── */
  var ACTIVITY = [
    { icon:'\uD83D\uDCE4', color:'#EFF6FF', text:'<strong>Priya Sharma</strong> submitted "Implement Razorpay payment gateway"', at:d(-0.08) },
    { icon:'\u2715',       color:'#FEF2F2', text:'Deliverable <strong>"Write API documentation"</strong> returned for revision', at:d(-2) },
    { icon:'\uD83D\uDCE5', color:'#F5F3FF', text:'<strong>Alex Chen</strong> self-assigned "Competitor onboarding research"', at:d(-2) },
    { icon:'\u2705',       color:'#ECFDF5', text:'Milestone <strong>"Discovery & Architecture"</strong> marked complete', at:d(-12) },
    { icon:'\uD83D\uDCB0', color:'#ECFDF5', text:'Partial payment received on <strong>INV/2026-27/0004</strong> — ₹2.00L', at:d(-18) },
    { icon:'\uD83C\uDFAF', color:'#FFFBEB', text:'New lead <strong>Razorpay</strong> added — ₹56.0L', at:d(-1) }
  ];

  /* Login credentials for demo accounts — username = first name, password = oment123. */
  (function () {
    var taken = [];
    EMPLOYEES.forEach(function (e) {
      e.hoursPerDay = 8;
      e.monthlySalaryPaise = (e.costPerHourPaise || 0) * U.WORKING_DAYS_PER_MONTH * 8;
      e.username = e.username || U.usernameFrom(e.name.split(' ')[0], taken);
      taken.push(e.username);
      e.passHash = U.hashPass('oment123');
      e.mustChangePass = false;
      if (e.address === undefined) e.address = '';
    });
  })();

  root.SEED = {
    COMPANY: COMPANY,
    ADMIN_USER: ADMIN_USER,
    DEPARTMENTS: DEPARTMENTS,
    EMPLOYEES: EMPLOYEES,
    PROJECTS: PROJECTS,
    MILESTONES: MILESTONES,
    DELIVERABLES: DELIVERABLES,
    SUBTASKS: SUBTASKS,
    ATTENDANCE: ATTENDANCE,
    INVOICES: INVOICES,
    NOTICES: NOTICES,
    CONVERSATIONS: CONVERSATIONS,
    CALENDAR_EVENTS: CALENDAR_EVENTS,
    CALL_LOGS: CALL_LOGS,
    NOTIFICATIONS: NOTIFICATIONS,
    ACTIVITY: ACTIVITY,
    WALLET_ENTRIES: WALLET_ENTRIES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.SEED;

})(typeof window !== 'undefined' ? window : globalThis);
