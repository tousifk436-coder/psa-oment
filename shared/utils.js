
(function (root) {
  'use strict';


  var _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, function (c) { return _ESC_MAP[c]; });
  }

  var escAttr = esc;

  function escJs(v) {
    if (v == null) return '';
    return String(v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
      .replace(/</g, '\\x3C')
      .replace(/>/g, '\\x3E');
  }

  var _ALLOWED_TAGS = ['P','BR','B','STRONG','I','EM','U','S','UL','OL','LI',
                       'H1','H2','H3','H4','BLOCKQUOTE','HR','SPAN','DIV','A','FONT'];
  var _ALLOWED_ATTRS = ['href','style','color','face','size'];

  function sanitizeHtml(html) {
    var tpl = document.createElement('div');
    tpl.innerHTML = String(html || '');
    (function walk(node) {
      var children = Array.prototype.slice.call(node.childNodes);
      children.forEach(function (child) {
        if (child.nodeType === 1) {                       // element
          if (_ALLOWED_TAGS.indexOf(child.tagName) < 0) {
            /* tag hatao par uska text rakho */
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
            return;
          }
          Array.prototype.slice.call(child.attributes).forEach(function (a) {
            var n = a.name.toLowerCase();
            if (_ALLOWED_ATTRS.indexOf(n) < 0 || n.indexOf('on') === 0) {
              child.removeAttribute(a.name);
            }
          });
          var href = child.getAttribute && child.getAttribute('href');
          if (href && /^\s*(javascript|data|vbscript):/i.test(href)) {
            child.removeAttribute('href');
          }
          walk(child);
        } else if (child.nodeType === 8) {                // comment
          node.removeChild(child);
        }
      });
    })(tpl);
    return tpl.innerHTML;
  }


  function InvoiceCounter(opts) {
    opts = opts || {};
    this.prefix = opts.prefix || 'INV';
    this.fy = opts.fy || financialYearLabel(new Date());
    this.pad = opts.pad || 4;
    this.last = opts.last || 0;
  }

  InvoiceCounter.prototype.seedFrom = function (invoices) {
    var max = this.last;
    (invoices || []).forEach(function (inv) {
      var m = String(inv.number || inv.num || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    this.last = max;
    return this;
  };

  InvoiceCounter.prototype.next = function () {
    this.last += 1;
    return this.prefix + '/' + this.fy + '/' + String(this.last).padStart(this.pad, '0');
  };

  InvoiceCounter.prototype.peek = function () {
    return this.prefix + '/' + this.fy + '/' + String(this.last + 1).padStart(this.pad, '0');
  };

  /* Indian FY: 1 April se 31 March. '2026-27' */
  function financialYearLabel(d) {
    var y = d.getFullYear(), m = d.getMonth();          // 0-indexed
    var start = m >= 3 ? y : y - 1;
    return start + '-' + String((start + 1) % 100).padStart(2, '0');
  }


  function computeGst(subtotalPaise, ratePct, supplierStateCode, placeOfSupplyCode) {
    var rate = (ratePct == null ? 18 : ratePct) / 100;
    var totalTax = Math.round(subtotalPaise * rate);
    var intra = supplierStateCode && placeOfSupplyCode &&
                String(supplierStateCode) === String(placeOfSupplyCode);
    if (intra) {
      var half = Math.floor(totalTax / 2);
      return {
        cgstPaise: half,
        sgstPaise: totalTax - half,               // rounding remainder SGST away
        igstPaise: 0,
        totalTaxPaise: totalTax,
        totalPaise: subtotalPaise + totalTax
      };
    }
    return {
      cgstPaise: 0, sgstPaise: 0,
      igstPaise: totalTax,
      totalTaxPaise: totalTax,
      totalPaise: subtotalPaise + totalTax
    };
  }

  function rupeesToPaise(r) { return Math.round((parseFloat(r) || 0) * 100); }
  function paiseToRupees(p) { return (parseInt(p, 10) || 0) / 100; }
  function fmtRupee(paise) {
    return '\u20B9' + paiseToRupees(paise).toLocaleString('en-IN',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }


  function Stopwatch() {
    this.startedAt = null;
    this.accumulatedSecs = 0;
    this.pausedForBreak = false;
  }
  Stopwatch.prototype.start = function (fromSecs) {
    if (this.startedAt) return;
    this.accumulatedSecs = fromSecs != null ? fromSecs : this.accumulatedSecs;
    this.startedAt = Date.now();
  };
  Stopwatch.prototype.pause = function () {
    if (!this.startedAt) return;
    this.accumulatedSecs += Math.floor((Date.now() - this.startedAt) / 1000);
    this.startedAt = null;
  };
  Stopwatch.prototype.elapsedSecs = function () {
    var live = this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
    return this.accumulatedSecs + live;
  };
  Stopwatch.prototype.reset = function () {
    this.startedAt = null; this.accumulatedSecs = 0;
  };
  Stopwatch.prototype.isRunning = function () { return !!this.startedAt; };


  var HOUR = 3600000, DAY = 86400000;
  function daysFromNow(n) { return new Date(Date.now() + n * DAY).toISOString(); }
  function daysAgo(n) { return daysFromNow(-n); }
  /* Local calendar date (YYYY-MM-DD). toISOString() is UTC, which in India
     gave yesterday's date before 05:30 — attendance landed on the wrong day. */
  function isoDate(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return '';
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }


  var _idSeq = 0;
  function newId(prefix) {
    _idSeq += 1;
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + '_' +
           _idSeq.toString(36) + Math.random().toString(36).slice(2, 6);
  }


  function renderPreserving(el, html) {
    if (!el) return;
    var scrollTop = el.scrollTop;
    var active = document.activeElement;
    var activeId = active && el.contains(active) ? active.id : null;
    var selStart = activeId && active.selectionStart != null ? active.selectionStart : null;

    el.innerHTML = html;

    el.scrollTop = scrollTop;
    if (activeId) {
      var restored = document.getElementById(activeId);
      if (restored) {
        restored.focus();
        if (selStart != null && restored.setSelectionRange) {
          try { restored.setSelectionRange(selStart, selStart); } catch (e) {}
        }
      }
    }
  }

  /* ========================================================================== */

  var Utils = {
    WORKING_DAYS_PER_MONTH: 26,
    hourlyCostFromSalary: function (monthlySalaryPaise, hoursPerDay) {
      var h = Number(hoursPerDay) || 8;
      var sal = Number(monthlySalaryPaise) || 0;
      if (sal <= 0 || h <= 0) return 0;
      return Math.round(sal / (Utils.WORKING_DAYS_PER_MONTH * h));
    },

    hashPass: function (pass, salt) {
      function fnv(str) {
        var h = 0x811c9dc5;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
        return ('00000000' + h.toString(16)).slice(-8);
      }
      salt = salt || 'oment';
      return 'fnv1a:' + fnv(salt + ':' + pass) + fnv(pass + ':' + salt);
    },
    checkPass: function (pass, stored) { return !!stored && Utils.hashPass(pass) === stored; },
    genPassword: function () {
      var a = 'abcdefghjkmnpqrstuvwxyz', A = 'ABCDEFGHJKMNPQRSTUVWXYZ', n = '23456789';
      function pick(set, k) { var o = ''; while (k--) o += set[Math.floor(Math.random() * set.length)]; return o; }
      return pick(A,1) + pick(a,4) + '-' + pick(n,3) + pick(a,2);
    },
    usernameFrom: function (name, taken) {
      var base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'user';
      var u = base, i = 1;
      taken = taken || [];
      while (taken.indexOf(u) >= 0) { i++; u = base + i; }
      return u;
    },

    esc: esc, escAttr: escAttr, escJs: escJs, sanitizeHtml: sanitizeHtml,
    InvoiceCounter: InvoiceCounter, financialYearLabel: financialYearLabel,
    computeGst: computeGst,
    rupeesToPaise: rupeesToPaise, paiseToRupees: paiseToRupees, fmtRupee: fmtRupee,
    Stopwatch: Stopwatch,
    HOUR: HOUR, DAY: DAY,
    daysFromNow: daysFromNow, daysAgo: daysAgo, isoDate: isoDate,
    newId: newId,
    renderPreserving: renderPreserving
  };

  root.Utils = Utils;
  root.esc = esc;
  root.escAttr = escAttr;
  root.escJs = escJs;

  if (typeof module !== 'undefined' && module.exports) module.exports = Utils;

})(typeof window !== 'undefined' ? window : globalThis);
