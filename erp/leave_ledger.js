(function (global) {
  'use strict';

  var KST_TZ = 'Asia/Seoul';
  var DEFAULT_DEDUCTIBLE_SUB_TYPES = ['연차', '반차'];
  var deductibleSubTypes = DEFAULT_DEDUCTIBLE_SUB_TYPES.slice();
  var DEFAULT_RESERVED_STATUSES = ['완료', '가승인', '증빙확인중', '실물결재대기', '실물결재완료'];
  var DEFAULT_PENDING_STATUSES = ['진행중'];
  var DEFAULT_APPROVAL_SELECT_COLUMNS = 'id,created_at,doc_type,title,content,amount,status,drafter_id';
  var LEAVE_REPORT_STYLE_ID = 'leave-ledger-report-style-v7';
  var leaveDetailDialogs = new WeakSet();
  var LEAVE_REPORT_STYLE_TEXT = [
    '.leave-detail-dialog .modal-dialog{--bs-modal-width:680px}',
    '.leave-detail-dialog .modal-content{height:min(28rem,100%);min-height:0}',
    '.leave-detail-dialog .modal-header{flex-wrap:wrap;column-gap:.5rem;row-gap:.35rem;padding:.65rem .85rem}',
    '.leave-detail-dialog .modal-title{font-size:1.0625rem}',
    '.leave-detail-dialog .modal-header .btn-close{margin:0;flex:0 0 auto;padding:.45rem}',
    '.leave-detail-dialog .modal-body{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;background:var(--bs-tertiary-bg,#f8f9fa)}',
    '.leave-detail-views{display:flex;gap:.15rem;margin-inline-start:auto;padding:.2rem;border:1px solid var(--bs-border-color,#dee2e6);border-radius:.6rem;background:var(--bs-tertiary-bg,#f8f9fa)}',
    '.leave-detail-views:not([data-ready]){visibility:hidden}',
    '.leave-detail-views .btn{border:0;font-size:.9375rem;white-space:nowrap;color:var(--bs-body-color,#212529)}',
    '.leave-detail-views .btn[aria-pressed="true"]{background:var(--erp-primary,var(--bs-primary,#0d6efd));color:#fff}',
    '.leave-detail-views .btn:focus-visible{outline:2px solid var(--erp-primary,var(--bs-primary,#0d6efd));outline-offset:1px}',
    '.leave-report [hidden]{display:none!important}',
    '.leave-report{display:grid;gap:.75rem;text-align:start;overflow-wrap:anywhere}',
    '.leave-report-panel{display:grid;gap:.75rem;min-width:0}',
    '.leave-report-balance,.leave-report-card,.leave-report-archive{border:1px solid var(--bs-border-color,#dee2e6);border-radius:10px;padding:.75rem .875rem;min-width:0}',
    '.leave-report-balance{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.25rem .75rem;background:var(--erp-primary-soft,var(--bs-primary-bg-subtle,#e7f1ff));color:var(--erp-primary-strong,var(--bs-primary-text-emphasis,#084298));border-color:var(--erp-border-strong,var(--bs-primary-border-subtle,#9ec5fe))}',
    '.leave-report-balance small{display:block;font-size:.8125rem}',
    '.leave-report-balance strong{font-size:1.375rem}',
    '.leave-report-card,.leave-report-archive{background:var(--bs-body-bg,#fff)}',
    '.leave-report-first-year{background:var(--bs-tertiary-bg,#f8f9fa)}',
    '.leave-report-heading{font-size:1.0625rem;font-weight:700;margin:0}',
    '.leave-report-heading strong{color:var(--erp-primary-strong,var(--bs-primary-text-emphasis,#084298))}',
    '.leave-fiscal-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:.55rem 0 0;border-top:1px solid var(--bs-border-color,#dee2e6)}',
    '.leave-fiscal-group{min-width:0;padding:.65rem .7rem 0 0}',
    '.leave-fiscal-group+.leave-fiscal-group{padding:.65rem 0 0 .7rem;border-inline-start:1px solid var(--bs-border-color,#dee2e6)}',
    '.leave-fiscal-group h6{margin:0;font-size:.9375rem;font-weight:700}',
    '.leave-fiscal-total,.leave-fiscal-group dl>div{display:flex;justify-content:space-between;align-items:baseline;gap:.25rem .5rem}',
    '.leave-fiscal-total{flex-wrap:wrap}',
    '.leave-fiscal-total strong{font-size:1.1875rem;font-variant-numeric:tabular-nums}',
    '.leave-fiscal-group dl{margin:.4rem 0 0;padding-top:.3rem;border-top:1px solid var(--bs-border-color,#dee2e6)}',
    '.leave-fiscal-group dl>div{padding:.15rem 0}',
    '.leave-fiscal-group dt{font-size:.9rem;font-weight:400;color:var(--bs-secondary-color,#495057)}',
    '.leave-fiscal-group dd{margin:0;font-size:.9375rem;text-align:end;font-variant-numeric:tabular-nums}',
    '.leave-report-records{display:grid;gap:.55rem;margin-top:.55rem}',
    '.leave-report-disclosure{margin-top:.55rem}',
    '.leave-report-archive{padding-block:0}',
    '.leave-report-archive>summary,.leave-report-disclosure>summary{cursor:pointer;color:var(--erp-primary-strong,var(--bs-primary-text-emphasis,#084298));font-weight:600;padding:.55rem 0;min-height:2.75rem}',
    '.leave-report-archive>summary span{font-size:.875rem;font-weight:400}',
    '.leave-report-archive>summary:focus-visible,.leave-report-disclosure>summary:focus-visible{outline:2px solid var(--erp-primary,var(--bs-primary,#0d6efd));outline-offset:2px;border-radius:4px}',
    '.leave-report-history-body{border-top:1px solid var(--bs-border-color,#dee2e6);padding:.55rem 0 .7rem}',
    '.leave-report-disclosure[open]>summary{margin-bottom:.5rem}',
    '.leave-section{border:1px solid var(--bs-border-color,#dee2e6);border-radius:8px;background:var(--bs-tertiary-bg,#f8f9fa);padding:13px}',
    '.leave-section h6{font-weight:bold;border-bottom:1px solid var(--bs-border-color,#dee2e6);padding-bottom:8px;margin-bottom:10px;font-size:1rem}',
    '.leave-list{list-style:none;padding:0;margin:0;font-size:.9375rem}',
    '.leave-list li{margin-bottom:6px}',
    '.leave-report .leave-list span{min-width:0;overflow-wrap:anywhere}',
    '@media(max-width:575.98px){.leave-report-balance,.leave-report-card,.leave-section{padding:.65rem}.leave-detail-dialog .modal-body{padding:.65rem!important}}',
    '@media(max-width:500px){.leave-fiscal-metrics{grid-template-columns:minmax(0,1fr)}.leave-fiscal-group,.leave-fiscal-group+.leave-fiscal-group{padding:.45rem 0;border-inline-start:0}.leave-fiscal-group+.leave-fiscal-group{border-top:1px solid var(--bs-border-color,#dee2e6);margin-top:.25rem}}',
    '@media(max-width:410px){.leave-detail-dialog .modal-content{height:min(29rem,100%)}.leave-detail-dialog .modal-header{column-gap:.3rem;padding-inline:.55rem}.leave-detail-views .btn{padding-inline:.36rem;font-size:.875rem}}',
    // Give the records the available height without shrinking the text.
    '@media(max-height:480px){'
      +'.leave-detail-dialog .modal-dialog{--bs-modal-margin:8px;width:calc(100% - 2 * var(--bs-modal-margin));margin-inline:auto}'
      +'.leave-detail-dialog .modal-content{height:100%}'
      +'.leave-detail-dialog .modal-header{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto;gap:4px 8px;padding:4px 8px}'
      +'.leave-detail-dialog .modal-title{line-height:1.2;overflow-wrap:anywhere}'
      +'.leave-detail-dialog .modal-header .btn-close{box-sizing:border-box;width:44px;height:44px;padding:0;background-size:clamp(16px,1rem,24px)}'
      +'.leave-detail-dialog .modal-body{padding:8px 10px!important}'
      +'.leave-detail-views{min-width:0;max-width:100%;margin-inline-start:0;justify-self:end;padding:2px}'
      +'.leave-detail-views .btn{min-width:0;padding:2px 5px;white-space:normal;overflow-wrap:anywhere;line-height:1.25}'
      +'.leave-detail-dialog .modal-footer{--bs-modal-footer-gap:0;padding:2px 8px!important}'
      +'.leave-detail-dialog .modal-footer .btn{min-height:44px;padding:2px 12px}}',
    '@media(max-height:480px) and (max-width:500px){'
      +'.leave-detail-dialog .modal-header{grid-template-columns:minmax(0,1fr) auto}'
      +'.leave-detail-views{grid-column:1/-1;grid-row:2}'
      +'.leave-detail-dialog .modal-header .btn-close{grid-column:2;grid-row:1}}',
    // On the smallest screens the top close is sufficient. Keep the footer
    // while it has keyboard focus so a resize does not take that focus away.
    '@media(max-height:340px) and (max-width:500px){'
      +'.leave-detail-dialog .modal-title{font-size:1rem}'
      +'.leave-detail-views .btn{font-size:.8rem;line-height:1.15}'
      +'.leave-detail-dialog .modal-footer:not(:focus-within){display:none}'
      +'.leave-detail-dialog .modal-content:has(.modal-footer:focus-within){overflow:auto}}',
    '@media(pointer:coarse){.leave-detail-views .btn{min-height:44px}}'
  ].join('');

  function ensureLeaveDetailStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(LEAVE_REPORT_STYLE_ID)) return;
    var styleEl = document.createElement('style');
    styleEl.id = LEAVE_REPORT_STYLE_ID;
    styleEl.textContent = LEAVE_REPORT_STYLE_TEXT;
    if (document.head) {
      document.head.appendChild(styleEl);
    }
  } // End of ensureLeaveDetailStyles

  function prepareLeaveDetailDialog(root) {
    ensureLeaveDetailStyles();
    if (!root || leaveDetailDialogs.has(root)) return;
    var body=root.querySelector('.modal-body'), controls=root.querySelector('.leave-detail-views');
    if(!body||!controls)return;
    leaveDetailDialogs.add(root);
    var buttons=[...controls.querySelectorAll('[data-leave-view]')];
    var report=null, selected='current', positions={current:0,history:0};
    function select(key) {
      selected=key;
      for(var button of buttons)button.setAttribute('aria-pressed',String(button.dataset.leaveView===key));
      if(report)for(var panel of report.querySelectorAll('[data-leave-panel]')){
        panel.hidden=panel.dataset.leavePanel!==key;
      }
      body.scrollTop=positions[key];
    }
    function refresh() {
      var next=body.querySelector('[data-leave-detail-report]');
      if(next===report)return;
      report=next;
      controls.toggleAttribute('data-ready',!!report);
      controls.setAttribute('aria-hidden',String(!report));
      for(var button of buttons)button.disabled=!report;
      positions={current:0,history:0};
      select('current');
    }
    for(var button of buttons)button.addEventListener('click',function(){
      // Switching views is local and never reloads or moves the keyboard focus.
      var target=this.dataset.leaveView;
      if(!report||!body.contains(report)||target===selected)return;
      positions[selected]=body.scrollTop;
      select(target);
    });
    body.addEventListener('click',function(event){
      var row=event.target.closest?.('summary')?.parentElement;
      if(event.defaultPrevented||!report||!row?.matches('[data-leave-archive]')||row.open||!report.contains(row))return;
      // Drop any other open year before the browser opens this summary, so
      // the last click wins even before native toggle events are dispatched.
      for(var other of report.querySelectorAll('[data-leave-archive][open]')){
        if(other!==row)other.open=false;
      }
    });
    new global.MutationObserver(refresh).observe(body,{childList:true,subtree:true});
    refresh();
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function roundLeaveDays(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 480) / 480;
  }

  function formatKstIsoDate(value) {
    var d = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: KST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }

  function getTodayKstIso() {
    return formatKstIsoDate(new Date());
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function getCurrentCoopId() {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    try {
      var storedUser = JSON.parse(window.localStorage.getItem('erp_user') || 'null');
      return normalizeText(storedUser && storedUser.coop_id);
    } catch (_) {
      return '';
    }
  }

  function getLeaveSubType(docType) {
    var raw = normalizeText(docType);
    var match = raw.match(/^휴가\(([^)]+)\)/);
    return match ? normalizeText(match[1]) : '';
  }

  function getLeaveSnapshotMeta(doc) {
    var raw = doc && doc.leave_snapshot;
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return null;
    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeIsoDate(value) {
    var raw = normalizeText(value);
    var match = raw.match(/^(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/);
    if (!match) return '';
    var iso = match[1] + '-' + match[2] + '-' + match[3];
    var date = new Date(iso + 'T00:00:00Z');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return '';
    return iso;
  }

  function getLeaveSnapshotItems(doc) {
    var snapshot = getLeaveSnapshotMeta(doc);
    return snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
  }

  function getLeaveSnapshotItemAmount(item) {
    var minutes = item?.deducted_minutes;
    if (minutes != null && minutes !== '' && Number.isSafeInteger(Number(minutes)) && Number(minutes) >= 0) {
      return roundLeaveDays(Number(minutes) / 480);
    }
    var rawDays = Number(item && (item.deducted_days != null ? item.deducted_days : item.days));
    if (Number.isFinite(rawDays) && rawDays > 0) return roundLeaveDays(rawDays);

    var rawHours = Number(item && (item.deducted_hours != null ? item.deducted_hours : item.hours));
    if (Number.isFinite(rawHours) && rawHours > 0) return roundLeaveDays(rawHours / 8);

    var slot = normalizeText(item && item.slot).toLowerCase();
    if (slot === 'am' || slot === 'pm' || slot === 'morning' || slot === 'afternoon' || slot === 'half') return 0.5;
    if (slot === 'full' || slot === 'day' || slot === 'all_day') return 1;
    return 0;
  }

  function getLeaveSnapshotItemPeriod(item, isoDate) {
    var dateText = isoDate ? isoDate.replace(/-/g, '.') : '일자 미확인';
    var slotLabel = normalizeText(item && (item.slot_label || item.label));
    if (!slotLabel) {
      var slot = normalizeText(item && item.slot).toLowerCase();
      if (slot === 'am' || slot === 'morning') slotLabel = '오전';
      else if (slot === 'pm' || slot === 'afternoon') slotLabel = '오후';
      else if (slot === 'full' || slot === 'day' || slot === 'all_day') slotLabel = '전일';
    }
    return dateText + (slotLabel ? ' ' + slotLabel : '') + (item?.slot==='hour'?' '+normalizeText(item.start_time)+'~'+normalizeText(item.end_time):'');
  }

  function isLeaveDocType(docType) {
    return normalizeText(docType).indexOf('휴가') === 0;
  }

  function isDeductibleLeaveSubType(subType) {
    return deductibleSubTypes.indexOf(normalizeText(subType)) !== -1;
  }

  function isDeductibleLeaveDoc(doc) {
    var snapshot = getLeaveSnapshotMeta(doc);
    if (snapshot && typeof snapshot.deductible === 'boolean') {
      return snapshot.deductible === true;
    }
    var subType = getLeaveSubType(doc && doc.doc_type);
    return isDeductibleLeaveSubType(subType);
  }

  function extractLeavePeriodLabel(doc) {
    var slicedLabel = normalizeText(doc && doc._leave_period_label);
    if (slicedLabel) return slicedLabel;

    var title = normalizeText(doc && doc.title);
    var titleMatch = title.match(/\(([^()]+)\)\s*$/);
    if (titleMatch) return normalizeText(titleMatch[1]);

    var snapshotItems = getLeaveSnapshotItems(doc);
    if (snapshotItems.length > 0) {
      var firstIso = normalizeIsoDate(snapshotItems[0] && (snapshotItems[0].leave_date || snapshotItems[0].date));
      var firstLabel = getLeaveSnapshotItemPeriod(snapshotItems[0], firstIso);
      if (snapshotItems.length === 1) return firstLabel;
      var totalDays = snapshotItems.reduce(function (sum, item) {
        return roundLeaveDays(sum + getLeaveSnapshotItemAmount(item));
      }, 0);
      return firstLabel + ' 외 ' + (snapshotItems.length - 1) + '건' + (totalDays > 0 ? ' 총 ' + totalDays + '일' : '');
    }

    var content = String((doc && doc.content) || '');
    var markerMatch = content.match(/(?:^|\n)\s*휴가일\s*[:：]\s*([^\n]+)/);
    if (markerMatch) return normalizeText(markerMatch[1]);
    return '';
  }

  function parseIsoDateFromLabel(label) {
    var raw = normalizeText(label);
    if (!raw) return '';
    var match = raw.match(/(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/);
    if (!match) return '';
    return match[1] + '-' + match[2] + '-' + match[3];
  }

  function getLeaveStartIso(doc) {
    var slicedIso = normalizeIsoDate(doc && doc._leave_start_iso);
    if (slicedIso) return slicedIso;

    var snapshotDates = getLeaveSnapshotItems(doc).map(function (item) {
      return normalizeIsoDate(item && (item.leave_date || item.date || item.start_date));
    }).filter(Boolean).sort();
    if (snapshotDates.length > 0) return snapshotDates[0];

    var startRaw = normalizeText(doc && doc.start_date);
    if (startRaw) {
      var directMatch = startRaw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (directMatch) return directMatch[1];
      var parsed = formatKstIsoDate(startRaw);
      if (parsed) return parsed;
    }

    return parseIsoDateFromLabel(extractLeavePeriodLabel(doc));
  }

  function normalizeStatus(value) {
    return normalizeText(value);
  }

  function statusIn(status, statuses) {
    var target = normalizeStatus(status);
    var list = Array.isArray(statuses) ? statuses : DEFAULT_RESERVED_STATUSES;
    for (var i = 0; i < list.length; i += 1) {
      if (normalizeStatus(list[i]) === target) return true;
    }
    return false;
  }

  function cloneDocWithMeta(doc, startIso, amount, itemMeta) {
    var copy = Object.assign({}, doc || {});
    copy._leave_start_iso = startIso || '';
    copy._leave_amount = roundLeaveDays(amount);
    copy._leave_period_label = normalizeText(itemMeta && itemMeta.periodLabel) || extractLeavePeriodLabel(doc);
    copy._leave_sub_type = getLeaveSubType(doc && doc.doc_type);
    copy._leave_snapshot = getLeaveSnapshotMeta(doc);
    copy._leave_item = itemMeta && itemMeta.item ? itemMeta.item : null;
    copy._leave_item_index = itemMeta && Number.isFinite(itemMeta.index) ? itemMeta.index : null;
    copy._leave_item_count = itemMeta && Number.isFinite(itemMeta.count) ? itemMeta.count : 1;
    copy._leave_year = startIso ? Number(startIso.slice(0, 4)) : null;
    return copy;
  }

  function getLeaveAllocationRows(doc) {
    var items = getLeaveSnapshotItems(doc);
    if (items.length > 0) {
      var rows = [];
      var itemTotal = 0;
      items.forEach(function (item, index) {
        var amount = Math.max(0, getLeaveSnapshotItemAmount(item));
        if (!(amount > 0)) return;
        var startIso = normalizeIsoDate(item && (item.leave_date || item.date || item.start_date));
        itemTotal = roundLeaveDays(itemTotal + amount);
        rows.push(cloneDocWithMeta(doc, startIso, amount, {
          item: item,
          index: index,
          count: items.length,
          periodLabel: getLeaveSnapshotItemPeriod(item, startIso)
        }));
      });

      var documentTotal = Math.max(0, roundLeaveDays(toNumber(doc && doc.amount, 0)));
      var remainder = roundLeaveDays(documentTotal - itemTotal);
      if (remainder > 0) {
        rows.push(cloneDocWithMeta(doc, '', remainder, {
          index: rows.length,
          count: items.length + 1,
          periodLabel: '날짜별 합계 확인 필요'
        }));
      }
      if (rows.length > 0) return rows;
    }

    var amount = Math.max(0, roundLeaveDays(toNumber(doc && doc.amount, 0)));
    return amount > 0 ? [cloneDocWithMeta(doc, getLeaveStartIso(doc), amount)] : [];
  }

  function getLeaveRowYear(row, fallbackYear) {
    var startIso = normalizeIsoDate(row && row._leave_start_iso);
    if (startIso) return Number(startIso.slice(0, 4));
    var createdIso = formatKstIsoDate(row && row.created_at);
    if (createdIso) return Number(createdIso.slice(0, 4));
    return Number(fallbackYear) || Number(getTodayKstIso().slice(0, 4));
  }

  function ensureLeaveYearSummary(summary, year) {
    var safeYear = Number(year);
    if (!Number.isFinite(safeYear)) safeYear = Number(summary.todayIso.slice(0, 4));
    var key = String(safeYear);
    if (!summary.byYear[key]) {
      summary.byYear[key] = {
        year: safeYear,
        reservedDays: 0,
        pastOrUsedDays: 0,
        unknownDateDays: 0,
        reservedDocs: [],
        pastOrUsedDocs: [],
        unknownDateDocs: []
      };
    }
    return summary.byYear[key];
  }

  function summarizeLeaveDocs(docs, options) {
    var opts = options || {};
    var todayIso = normalizeText(opts.todayIso) || getTodayKstIso();
    var includeToday = opts.includeToday !== false;
    var unknownAsReserved = opts.unknownAsReserved === true;
    var reservedStatuses = Array.isArray(opts.reservedStatuses) && opts.reservedStatuses.length > 0
      ? opts.reservedStatuses
      : DEFAULT_RESERVED_STATUSES;

    var summary = {
      todayIso: todayIso,
      reservedDays: 0,
      pastOrUsedDays: 0,
      unknownDateDays: 0,
      reservedDocs: [],
      pastOrUsedDocs: [],
      unknownDateDocs: [],
      byYear: {},
      years: []
    };

    var rows = Array.isArray(docs) ? docs : [];
    rows.forEach(function (doc) {
      if (!isLeaveDocType(doc && doc.doc_type)) return;
      if (!isDeductibleLeaveDoc(doc)) return;
      if (!statusIn(doc && doc.status, reservedStatuses)) return;
      if (getLeaveSnapshotMeta(doc)?.settlement_state==='pending_schedule') {
        (summary.settlementReviewDocs||=[]).push(doc);
        return;
      }

      getLeaveAllocationRows(doc).forEach(function (row) {
        var amount = Math.max(0, roundLeaveDays(toNumber(row && row._leave_amount, 0)));
        if (!(amount > 0)) return;
        var startIso = getLeaveStartIso(row);
        var yearSummary = ensureLeaveYearSummary(summary, getLeaveRowYear(row, todayIso.slice(0, 4)));

        if (!startIso) {
          summary.unknownDateDays = roundLeaveDays(summary.unknownDateDays + amount);
          summary.unknownDateDocs.push(row);
          yearSummary.unknownDateDays = roundLeaveDays(yearSummary.unknownDateDays + amount);
          yearSummary.unknownDateDocs.push(row);

          if (unknownAsReserved) {
            summary.reservedDays = roundLeaveDays(summary.reservedDays + amount);
            summary.reservedDocs.push(row);
            yearSummary.reservedDays = roundLeaveDays(yearSummary.reservedDays + amount);
            yearSummary.reservedDocs.push(row);
          }
          return;
        }

        var isReserved = includeToday ? (startIso >= todayIso) : (startIso > todayIso);
        if (isReserved) {
          summary.reservedDays = roundLeaveDays(summary.reservedDays + amount);
          summary.reservedDocs.push(row);
          yearSummary.reservedDays = roundLeaveDays(yearSummary.reservedDays + amount);
          yearSummary.reservedDocs.push(row);
        } else {
          summary.pastOrUsedDays = roundLeaveDays(summary.pastOrUsedDays + amount);
          summary.pastOrUsedDocs.push(row);
          yearSummary.pastOrUsedDays = roundLeaveDays(yearSummary.pastOrUsedDays + amount);
          yearSummary.pastOrUsedDocs.push(row);
        }
      });
    });

    summary.years = Object.keys(summary.byYear).map(function (key) {
      return summary.byYear[key];
    }).sort(function (a, b) {
      return b.year - a.year;
    });

    return summary;
  }

  function summarizePendingLeaveHolds(docs, options) {
    var opts = options || {};
    var todayIso = normalizeText(opts.todayIso) || getTodayKstIso();
    var currentYear = Number(todayIso.slice(0, 4));
    var pendingStatuses = Array.isArray(opts.pendingStatuses) && opts.pendingStatuses.length > 0
      ? opts.pendingStatuses
      : DEFAULT_PENDING_STATUSES;
    var summary = {
      todayIso: todayIso,
      holdDays: 0,
      holdDocs: [],
      futureDays: 0,
      futureDocs: [],
      unknownDateDays: 0,
      unknownDateDocs: []
    };

    (Array.isArray(docs) ? docs : []).forEach(function (doc) {
      if (!isLeaveDocType(doc && doc.doc_type)) return;
      if (!isDeductibleLeaveDoc(doc)) return;
      if (!statusIn(doc && doc.status, pendingStatuses)) return;

      getLeaveAllocationRows(doc).forEach(function (row) {
        var amount = Math.max(0, roundLeaveDays(toNumber(row && row._leave_amount, 0)));
        if (!(amount > 0)) return;
        var startIso = getLeaveStartIso(row);
        if (!startIso) {
          summary.unknownDateDays = roundLeaveDays(summary.unknownDateDays + amount);
          summary.unknownDateDocs.push(row);
          return;
        }
        if (Number(startIso.slice(0, 4)) !== currentYear || startIso > todayIso) {
          summary.futureDays = roundLeaveDays(summary.futureDays + amount);
          summary.futureDocs.push(row);
          return;
        }
        summary.holdDays = roundLeaveDays(summary.holdDays + amount);
        summary.holdDocs.push(row);
      });
    });

    return summary;
  }

  function buildLeaveQuery(supabase, empId, statuses, columns, coopId) {
    // 일부 환경(ref_approval)에는 start_date 컬럼이 없어 기본 조회에서는 제외한다.
    var selectCols = columns || DEFAULT_APPROVAL_SELECT_COLUMNS;
    var query = supabase
      .from('ref_approval')
      .select(selectCols)
      .eq('drafter_id', empId)
      .ilike('doc_type', '휴가%');

    var safeCoopId = normalizeText(coopId);
    query = query.eq('coop_id', safeCoopId || '00000000-0000-0000-0000-000000000000');

    if (Array.isArray(statuses) && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    return query.order('created_at', { ascending: false });
  }

  async function fetchLeaveApprovals(supabase, empId, options) {
    if (!supabase) throw new Error('supabase client is required');
    if (!normalizeText(empId)) return [];

    var opts = options || {};
    var statuses = Array.isArray(opts.statuses) ? opts.statuses : DEFAULT_RESERVED_STATUSES;
    var columns = opts.columns;
    var coopId = normalizeText(opts.coopId || getCurrentCoopId());

    var query = buildLeaveQuery(supabase, empId, statuses, columns, coopId);
    var result = await (opts.signal ? query.abortSignal(opts.signal) : query);
    if (result.error) throw result.error;
    return result.data || [];
  }

  function requireAccrualReport(report) {
    var iso=value=>typeof value==='string' && value!=='' && value===normalizeIsoDate(value);
    var integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
    var fail=()=>{throw new Error('LEAVE_ACCRUAL_REPORT_UNAVAILABLE');};
    if(report?.version!==1||!iso(report.as_of))return fail();
    if(report.state==='no_hire'||report.state==='not_applicable')return report;
    if(report.state!=='ready'||!iso(report.hire_date)||!iso(report.first_year_expires_on)
      ||!integer(report.available_minutes)||!integer(report.day_minutes,1)||!Array.isArray(report.years)
      ||!Array.isArray(report.automatic_adjustments))return fail();
    var currentYear=Number(report.as_of.slice(0,4)),seen=new Set(),available=0,expired=0;
    for(var entry of report.years){
      if(!integer(entry?.year,1)||entry.year>currentYear||seen.has(entry.year)||!integer(entry.day_minutes,1)
        ||!Array.isArray(entry.first_year))return fail();
      seen.add(entry.year);
      var f=entry.fiscal;
      if(!integer(f?.granted_minutes)||!integer(f.used_minutes)||!Number.isSafeInteger(f.adjustment_minutes)
        ||(f.granted_minutes>0)!==(f.issued_on!==null)
        ||(f.issued_on!==null&&(!iso(f.issued_on)||f.issued_on!==String(entry.year)+'-01-01'))
        ||(entry.year===currentYear?!integer(f.available_minutes):f.available_minutes!==null))return fail();
      available+=f.available_minutes??0;
      var previous='';
      for(var row of entry.first_year){
        if(!iso(row?.issued_on)||row.issued_on<=previous||Number(row.issued_on.slice(0,4))!==entry.year
          ||row.issued_on>report.as_of||!integer(row.granted_minutes,1)||!integer(row.used_minutes)
          ||!integer(row.expired_minutes)||!integer(row.held_minutes)||!integer(row.available_minutes)
          ||row.granted_minutes!==row.used_minutes+row.expired_minutes+row.held_minutes+row.available_minutes)return fail();
        previous=row.issued_on;
        available+=row.available_minutes;
        expired+=row.expired_minutes;
      }
    }
    var adjustment=report.automatic_adjustments[0];
    if(expired>0){
      if(report.automatic_adjustments.length!==1||adjustment?.kind!=='first_year_expiration'
        ||adjustment.date!==report.first_year_expires_on||adjustment.date>report.as_of
        ||!seen.has(Number(adjustment.date.slice(0,4)))
        ||!Number.isSafeInteger(adjustment.minutes)||adjustment.minutes!==-expired)return fail();
    }else if(report.automatic_adjustments.length)return fail();
    return seen.has(currentYear)&&available===report.available_minutes?report:fail();
  }

  async function loadLeaveDetailReport(supabase, context) {
    var opts=context||{}, empId=normalizeText(opts.empId), coopId=normalizeText(opts.coopId);
    if(!empId||!coopId)throw new Error('LEAVE_ACCRUAL_CONTEXT_UNAVAILABLE');
    var signal=opts.signal;
    var send=query=>signal&&typeof query.abortSignal==='function'?query.abortSignal(signal):query;
    var statuses=DEFAULT_RESERVED_STATUSES.concat(DEFAULT_PENDING_STATUSES);
    var readAccrual=async()=>{
      var grant=await send(supabase.rpc('erp_leave_accrual_report',{p_emp_id:empId}));
      if(signal?.aborted)throw new Error('LEAVE_REPORT_CANCELLED');
      if(grant.error)throw grant.error;
      var report=requireAccrualReport(grant.data);
      var current=report.state==='ready'&&report.years.find(row=>row.year===Number(report.as_of.slice(0,4)));
      if(!current?.fiscal?.issued_on)return report;

      // A historical row already reports its January 1 basis. The current row
      // reports today's basis, so read the confirmed periods only for that row.
      var result=await send(supabase.rpc('erp_leave_work_basis',{p_emp_id:empId}));
      if(signal?.aborted)throw new Error('LEAVE_REPORT_CANCELLED');
      if(result.error)throw result.error;
      var basis=result.data, helper=global.CoopLeaveTime;
      var monthlyBeforeExpiry=report.as_of<report.first_year_expires_on
        ?report.years.reduce((total,row)=>row.first_year.reduce((sum,grantRow)=>sum+grantRow.granted_minutes,total),0):0;
      // The work-basis RPC also returns generated units. A differing total
      // can mean a period changed between the two reads; don't display it.
      if(!helper||!Array.isArray(basis?.periods)||basis.periods.some((row,index,periods)=>
        !row||!helper.isDate(row.effective_date)||!Number.isSafeInteger(row.day_minutes)||row.day_minutes<1
        ||(index>0&&row.effective_date<periods[index-1].effective_date))
        ||basis.day_minutes!==current.day_minutes
        ||helper.basisMinutes(basis,report.as_of)!==current.day_minutes
        ||basis.generated_units==null
        ||Math.round(Number(basis.generated_units)*helper.dayMinutes)!==current.fiscal.granted_minutes+monthlyBeforeExpiry
      )throw new Error('LEAVE_GRANT_BASIS_UNAVAILABLE');
      var issuedBasis=helper.basisMinutes(basis,current.fiscal.issued_on);
      if(current.fiscal.granted_minutes%issuedBasis!==0)throw new Error('LEAVE_GRANT_BASIS_UNAVAILABLE');
      return {...report,years:report.years.map(row=>row===current?{...row,grant_day_minutes:issuedBasis}:row)};
    };
    var [accrual,adjustments,docs]=await Promise.all([
      readAccrual(),
      send(supabase.from('hr_leave_adj').select('*,days_exact:days::text',{count:'exact'})
        .eq('coop_id',coopId).eq('emp_id',empId).order('created_at',{ascending:false})),
      fetchLeaveApprovals(supabase,empId,{statuses,coopId,signal,columns:opts.columns})
    ]);
    if(signal?.aborted)throw new Error('LEAVE_REPORT_CANCELLED');
    if(adjustments.error)throw adjustments.error;
    var adjustmentsComplete=Array.isArray(adjustments.data)&&adjustments.count===adjustments.data.length;
    if(adjustmentsComplete&&adjustments.count===0&&opts.adjustmentsAreOwn!==true){
      // For another employee, the existing RLS policy grants all adjustment
      // rows to administrators and can silently return none to a delegate.
      // An empty result alone cannot confirm either gross side is zero.
      var access=await send(supabase.rpc('is_erp_privileged'));
      if(signal?.aborted)throw new Error('LEAVE_REPORT_CANCELLED');
      adjustmentsComplete=!access.error&&access.data===true;
    }
    return {
      accrual,
      summary:summarizeLeaveDocs(docs,{todayIso:accrual.as_of,reservedStatuses:DEFAULT_RESERVED_STATUSES,includeToday:false}),
      pendingDocs:docs.filter(doc=>statusIn(doc?.status,DEFAULT_PENDING_STATUSES)
        && (opts.isPendingDeductible||isDeductibleLeaveDoc)(doc)),
      adjustments:adjustments.data||[],
      adjustmentsComplete
    };
  }

  async function getLeaveSnapshot(supabase, empId, options) {
    if (!supabase) throw new Error('supabase client is required');
    if (!normalizeText(empId)) {
      return {
        baseRemainDays: 0,
        effectiveRemainDays: 0,
        reservedDays: 0,
        pendingHoldDays: 0,
        pendingDocs: [],
        pendingSummary: summarizePendingLeaveHolds([], options),
        summary: summarizeLeaveDocs([], options),
        docs: []
      };
    }

    var opts = options || {};
    var reservedStatuses = Array.isArray(opts.reservedStatuses) && opts.reservedStatuses.length > 0
      ? opts.reservedStatuses
      : DEFAULT_RESERVED_STATUSES;
    var pendingStatuses = Array.isArray(opts.pendingStatuses) && opts.pendingStatuses.length > 0
      ? opts.pendingStatuses
      : DEFAULT_PENDING_STATUSES;

    var basisQuery = supabase.rpc('erp_leave_snapshot_base', { p_emp_id: empId });
    var rpc = await (opts.signal ? basisQuery.abortSignal(opts.signal) : basisQuery);
    if (opts.signal && opts.signal.aborted) throw new Error('LEAVE_SNAPSHOT_CANCELLED');
    if (rpc.error) throw rpc.error;
    var basis = rpc;
    if (!basis.data || !Number.isInteger(Number(basis.data.day_minutes)) || !Number.isFinite(Number(basis.data.balance_units))) {
      var basisError = new Error('휴가 계산에 필요한 근로시간을 확인하지 못했습니다. 다시 조회해 주세요.');
      basisError.code = 'LEAVE_BASIS_UNAVAILABLE';
      throw basisError;
    }

    var baseRemainDays = roundLeaveDays(toNumber(rpc.data.balance_units, 0));
    var allDocs = await fetchLeaveApprovals(supabase, empId, {
      statuses: Array.from(new Set(reservedStatuses.concat(pendingStatuses))),
      columns: opts.columns,
      signal: opts.signal
    });
    var docs = allDocs.filter(function (doc) {
      return statusIn(doc && doc.status, reservedStatuses);
    });
    var pendingDocs = allDocs.filter(function (doc) {
      return statusIn(doc && doc.status, pendingStatuses);
    });
    var summary = summarizeLeaveDocs(docs, {
      todayIso: opts.todayIso,
      includeToday: opts.includeToday,
      reservedStatuses: reservedStatuses,
      unknownAsReserved: opts.unknownAsReserved
    });
    var pendingSummary = summarizePendingLeaveHolds(pendingDocs, {
      todayIso: opts.todayIso,
      pendingStatuses: pendingStatuses
    });

    // A current server allocation already accounts for pending and scheduled
    // leave on their actual dates. Do not deduct the client-side history again.
    var effectiveRemainDays;
    if (basis.data.allocation_version === 1 || basis.data.allocation_version === 2) {
      var effectiveUnits = basis.data.effective_balance_units;
      if (effectiveUnits == null || effectiveUnits === '' || !Number.isFinite(Number(effectiveUnits)) || Number(effectiveUnits) < 0) {
        throw new Error('휴가 잔액을 확인하지 못했습니다. 다시 조회해 주세요.');
      }
      effectiveRemainDays = roundLeaveDays(Number(effectiveUnits));
    } else {
      effectiveRemainDays = Math.max(0, roundLeaveDays(baseRemainDays - pendingSummary.holdDays));
    }

    return {
      baseRemainDays: baseRemainDays,
      workBasis: basis.data,
      effectiveRemainDays: effectiveRemainDays,
      reservedDays: summary.reservedDays,
      pendingHoldDays: pendingSummary.holdDays,
      pendingDocs: pendingDocs,
      pendingSummary: pendingSummary,
      summary: summary,
      docs: docs,
      reservedStatuses: reservedStatuses,
      pendingStatuses: pendingStatuses
    };
  }

  // Keep one exact employee/dates/minutes request per draft. A browser-side
  // preview neither saves nor replaces the locked server check at submission.
  function createDatedLeavePreview(supabase, options) {
    var current = null;
    var delay = options.delayMs == null ? 140 : options.delayMs;
    var limit = options.timeoutMs == null ? 15000 : options.timeoutMs;
    function reset() {
      if (!current) return;
      var old = current;
      current = null;
      clearTimeout(old.start);
      clearTimeout(old.deadline);
      old.controller.abort();
    }
    function check(plan) {
      if (!plan) { reset(); return null; }
      var key = JSON.stringify([plan.owner,plan.empId,plan.items]);
      if (current && current.key === key) return current.state;
      reset();
      var job = {key:key,state:'loading',controller:new AbortController()};
      current = job;
      job.start = setTimeout(async function () {
        if (current !== job || !options.isCurrent(plan)) { if (current===job) reset(); return; }
        var outcome = 'error';
        try {
          var request = supabase.rpc('erp_leave_fifo_preview',{p_emp_id:plan.empId,p_items:plan.items});
          var data = await Promise.race([
            request.abortSignal ? request.abortSignal(job.controller.signal) : request,
            new Promise(function (_,reject) {
              job.deadline = setTimeout(function () { reject(Error('DATED_LEAVE_TIMEOUT'));job.controller.abort(); },limit);
              job.controller.signal.addEventListener('abort',function () { reject(Error('DATED_LEAVE_CANCELLED')); },{once:true});
            })
          ]);
          if (!data.error && typeof data.data?.allowed === 'boolean') outcome=data.data.allowed?'allowed':'insufficient';
        } catch (_) {}
        finally { clearTimeout(job.deadline); }
        if (current !== job) return;
        if (!options.isCurrent(plan)) { reset(); return; }
        job.state=outcome;
        options.onChange();
      },delay);
      return job.state;
    }
    return {check:check,reset:reset};
  }

  function formatDotDate(isoDate) {
    var iso = normalizeText(isoDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.replace(/-/g, '.');
    return '';
  }

  function formatLeavePeriodText(doc) {
    var slicedLabel = normalizeText(doc && doc._leave_period_label);
    if (slicedLabel) return slicedLabel;
    var label = extractLeavePeriodLabel(doc);
    if (label) return label;

    var startIso = getLeaveStartIso(doc);
    return formatDotDate(startIso);
  } // End of formatLeavePeriodText

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  } // End of escapeHtml

  function defaultFormatLeaveDocType(docOrType) {
    var doc = docOrType && typeof docOrType === 'object' ? docOrType : null;
    var raw = normalizeText(doc ? doc.doc_type : docOrType || '');
    if (!raw) return '휴가';
    if (raw.indexOf('휴가(') !== 0) return raw;
    var snapshot = getLeaveSnapshotMeta(doc);
    if (snapshot && snapshot.label) return '휴가(' + normalizeText(snapshot.label) + ')';
    var subType = getLeaveSubType(raw);
    if (!subType) return raw;
    return '휴가(' + subType + ')';
  } // End of defaultFormatLeaveDocType

  function defaultFormatCreatedAt(value, fallback) {
    var formatted = formatKstIsoDate(value);
    return formatted || String(fallback || '-');
  } // End of defaultFormatCreatedAt

  function getLeaveStatusBadgeHtml(status) {
    if (status === '진행중') return '<span class="badge bg-warning text-dark ms-1" style="font-size:0.7em">결재중</span>';
    if (status === '가승인') return '<span class="badge bg-warning text-dark ms-1" style="font-size:0.7em">가승인</span>';
    if (status === '증빙확인중') return '<span class="badge bg-info text-dark ms-1" style="font-size:0.7em">증빙중</span>';
    if (status === '실물결재대기') return '<span class="badge bg-secondary ms-1" style="font-size:0.7em">실물대기</span>';
    if (status === '실물결재완료') return '<span class="badge bg-success ms-1" style="font-size:0.7em">실물완료</span>';
    if (status === '완료') return '<span class="badge bg-primary ms-1" style="font-size:0.7em">완료</span>';
    return '';
  } // End of getLeaveStatusBadgeHtml

  function renderLeaveDocListHtml(docs, options) {
    var opts = options || {};
    var formatDate = typeof opts.formatDate === 'function' ? opts.formatDate : defaultFormatCreatedAt;
    var formatLeaveDocType = typeof opts.formatLeaveDocType === 'function' ? opts.formatLeaveDocType : defaultFormatLeaveDocType;
    var emptyText = normalizeText(opts.emptyText) || '- 없음 -';
    var amountClass = normalizeText(opts.amountClass) || 'text-danger';
    var amountPrefix = opts.amountPrefix == null ? '-' : String(opts.amountPrefix);
    var amountSuffix = opts.amountSuffix == null ? '일' : String(opts.amountSuffix);
    var html = '<ul class="leave-list">';
    var rows = Array.isArray(docs) ? docs : [];
    if (rows.length > 0) {
      rows.forEach(function (doc) {
        var period = typeof formatLeavePeriodText === 'function' ? formatLeavePeriodText(doc) : '';
        var periodLabel = period ? ' · ' + escapeHtml(period) : '';
        var statusBadge = getLeaveStatusBadgeHtml(String(doc && doc.status || ''));
        var createdAt = escapeHtml(formatDate(doc && doc.created_at, '-'));
        var rawAmount = doc && doc._leave_amount != null ? doc._leave_amount : (doc && doc.amount);
        var amount = Math.max(0, Number(rawAmount || 0));
        var shownAmount;
        if(doc?._leave_item?.settlement_pending===true){
          var net=doc._leave_item.pending_net_minutes;
          shownAmount=Number.isInteger(net)&&net>0
            ?'순시간 '+(global.CoopLeaveTime?.formatMinutes(net)||net+'분')+' · 정산대기':'정산대기';
        }else{
          shownAmount=amountPrefix+(global.CoopLeaveTime
            ?global.CoopLeaveTime.formatDays(amount,doc?._leave_item?.basis_day_minutes||480)+(amountSuffix==='일'?'':amountSuffix.replace(/^일/,''))
            :amount+amountSuffix);
        }
        html += '<li class="border-bottom pb-1 mb-1"><div class="d-flex justify-content-between"><span>'
          + escapeHtml(formatLeaveDocType(doc || doc && doc.doc_type || '휴가'))
          + ' ' + statusBadge + periodLabel
          + '</span><span class="fw-bold ' + escapeHtml(amountClass) + '">' + escapeHtml(shownAmount) + '</span></div><div class="text-muted" style="font-size:0.75rem;">'
          + createdAt + '</div></li>';
      });
    } else {
      html += '<li class="text-muted">' + escapeHtml(emptyText) + '</li>';
    }
    html += '</ul>';
    return html;
  } // End of renderLeaveDocListHtml

  function formatAccrualMinutes(minutes) {
    var absolute=Math.abs(minutes),hours=Math.floor(absolute/60),remainder=absolute%60;
    return (minutes<0?'-':'')+(hours?hours+'시간':'')+(remainder||!hours?(hours?' ':'')+remainder+'분':'');
  }

  function formatLeaveBalanceMinutes(minutes, dayMinutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return '—';
    var total=Math.round(minutes),basis=Number(dayMinutes);
    if(!Number.isSafeInteger(total))return '—';
    if(!Number.isSafeInteger(basis)||basis<1)basis=480;
    var days=Math.floor(total/basis),rest=total%basis;
    return days+'일 '+Math.floor(rest/60)+'시간'+(rest%60?' '+rest%60+'분':'');
  }

  function formatLeaveBalance(units, dayMinutes) {
    var value=typeof units==='number'||typeof units==='string'&&units.trim()?Number(units):NaN;
    return formatLeaveBalanceMinutes(value*480,dayMinutes);
  }

  function formatReportAmount(minutes, dayMinutes) {
    if(!Number.isFinite(minutes))return '—';
    var absolute=Math.abs(Math.round(minutes)),sign=minutes<0?'−':'';
    if(!Number.isSafeInteger(dayMinutes)||dayMinutes<1)return sign+formatAccrualMinutes(absolute);
    if(dayMinutes===480&&absolute%240===0)return sign+(absolute/480)+'일';
    var formatter=global.CoopLeaveTime;
    if(!formatter)return sign+formatAccrualMinutes(absolute);
    var days=Math.floor(absolute/dayMinutes),rest=absolute%dayMinutes;
    var dayText=formatter.formatDays(absolute/480,dayMinutes).split(' ')[0];
    return sign+(rest?(days?dayText+' ':'')+formatter.formatMinutes(rest):dayText);
  }

  function buildFirstYearGrantSummary(rows, dayMinutes, ended) {
    if(!rows.length)return '';
    var total=rows.reduce((sum,row)=>sum+row.granted_minutes,0);
    var used=rows.reduce((sum,row)=>sum+row.used_minutes,0);
    var left=rows.reduce((sum,row)=>sum+row.available_minutes,0);
    var bases=new Set(rows.map(row=>row.granted_minutes));
    var usedText=used===total?rows.length+'일':used===0?'0일':bases.size===1
      ?formatReportAmount(used,rows[0].granted_minutes):formatAccrualMinutes(used);
    var totalText='발생 '+rows.length+'일 · 사용 '+usedText+' · 잔여 '+formatLeaveBalanceMinutes(left,dayMinutes);
    var month=row=>row.issued_on.slice(0,7).replace('-','.');
    var range=month(rows.at(-1))+(month(rows[0])===month(rows.at(-1))?'':'~'+month(rows[0]));
    var heading='입사 1년 미만 연차 <span class="text-muted">'+escapeHtml(range)+'</span>';
    var html=ended
      ?'<details class="leave-report-archive" data-leave-archive data-leave-first-year-summary><summary>'+heading
        +'<span class="d-block ps-3">'+escapeHtml(totalText)+'</span></summary><div class="leave-report-history-body" data-leave-monthly-history>'
      :'<section class="leave-report-card leave-report-first-year" data-leave-first-year-summary><h6 class="leave-report-heading">'
        +heading+'</h6><div class="small mt-1">'+escapeHtml(totalText)+'</div>'
        +'<details class="leave-report-disclosure" data-leave-monthly-history open><summary>월별 발생 기록</summary>';
    html+='<p class="small text-muted mb-2">발생 '+escapeHtml(formatAccrualMinutes(total))
      +' · 사용 '+escapeHtml(formatAccrualMinutes(used))+'</p><ul class="leave-list">';
    rows.forEach(function(row){
      var basis=row.granted_minutes;
      var fields=['발생 1일 ('+formatAccrualMinutes(basis)+')'];
      if(row.used_minutes>0)fields.push('사용 '+formatReportAmount(row.used_minutes,basis));
      if(row.held_minutes>0)fields.push('예정·결재 중 '+formatReportAmount(row.held_minutes,basis));
      if(row.available_minutes>0)fields.push('사용 가능 '+formatLeaveBalanceMinutes(row.available_minutes,basis));
      html+='<li data-leave-issued-on="'+escapeHtml(row.issued_on)+'"><time datetime="'+escapeHtml(row.issued_on)+'">'
        +escapeHtml(formatDotDate(row.issued_on))+'</time> · '+escapeHtml(fields.join(' · '))+'</li>';
    });
    return html+(ended?'</ul></div></details>':'</ul></details></section>');
  }

  function hasFiscalReport(fiscal) {
    return Boolean(fiscal&&(fiscal.granted_minutes||fiscal.adjustment_minutes||fiscal.used_minutes||fiscal.available_minutes));
  }

  function buildFiscalGrantHistory(fiscal, grantBasis) {
    if(!fiscal.issued_on)return '';
    var granted=formatAccrualMinutes(fiscal.granted_minutes);
    if(fiscal.granted_minutes>0&&grantBasis>0&&fiscal.granted_minutes%grantBasis===0){
      granted=(fiscal.granted_minutes/grantBasis)+'일 ('+granted+')';
    }
    return '<div class="leave-section"><h6>발생 내역</h6><ul class="leave-list"><li data-leave-fiscal-grant><time datetime="'
      +escapeHtml(fiscal.issued_on)+'">'+escapeHtml(formatDotDate(fiscal.issued_on))+'</time> · 기본 발생 '
      +escapeHtml(granted)+'</li></ul></div>';
  }

  function readAdjustmentBreakdown(rows, year, serverTotal, complete) {
    if(!complete)return null;
    var credits=0n,debits=0n;
    for(var item of rows){
      // Match the existing fiscal report: null dates/amounts are not summed.
      if(item?.created_at==null)continue;
      var itemYear=getYearFromDateValue(item.created_at);
      if(itemYear===null)return null;
      if(itemYear!==year||item.days_exact===null)continue;
      // PostgreSQL rounds each numeric row before summing. Keeping its decimal
      // text here avoids a pair of opposite rounding errors canceling out.
      var match=typeof item.days_exact==='string'&&/^(-?)(\d{1,16})(?:\.(\d{1,80}))?$/.exec(item.days_exact);
      if(!match)return null;
      var fraction=match[3]||'', scale=10n**BigInt(fraction.length);
      var minutes=(BigInt(match[2]+fraction)*480n+scale/2n)/scale;
      var isCredit=(item.adj_type==='지급'||item.adj_type==='포상')!==(match[1]==='-');
      if(isCredit)credits+=minutes;else debits+=minutes;
    }
    if(credits-debits!==BigInt(serverTotal)||!Number.isSafeInteger(Number(credits))||!Number.isSafeInteger(Number(debits)))return null;
    return {credits:Number(credits),debits:Number(debits)};
  }

  function buildFiscalReportMetrics(fiscal,dayMinutes,monthly,breakdown,availableNow) {
    var sum=(key)=>monthly.reduce((total,row)=>total+row[key],0);
    var monthlyGranted=sum('granted_minutes'), used=fiscal.used_minutes+sum('used_minutes');
    var today=availableNow!==null;
    var fiscalBeforeBookings=fiscal.granted_minutes+fiscal.adjustment_minutes-fiscal.used_minutes;
    var booked=today?Math.max(0,fiscalBeforeBookings)-fiscal.available_minutes+sum('held_minutes'):0;
    var excess=today?Math.max(0,-fiscalBeforeBookings):0;
    var expired=sum('expired_minutes');
    var gross=breakdown?fiscal.granted_minutes+monthlyGranted+breakdown.credits:null;
    var charge=breakdown?used+breakdown.debits+booked+expired-excess:null;
    var ok=!!breakdown&&Number.isSafeInteger(gross)&&Number.isSafeInteger(charge)&&charge>=0
      &&(!today||(fiscal.available_minutes<=Math.max(0,fiscalBeforeBookings)&&gross-charge===availableNow));
    var credits=[['기본 발생',fiscal.granted_minutes],['조정 부여',breakdown?.credits]];
    if(monthlyGranted)credits.splice(1,0,['1년 미만 발생',monthlyGranted]);
    var debits=[[today?'사용 연차':'휴가 사용',used],['조정 차감',breakdown?.debits]];
    // Show only reservations that restrict today's balance, not the sum of
    // future requests that may be covered by future monthly grants.
    if(ok&&booked>0)debits.push(['예정·결재 중 반영',booked]);
    if(ok&&expired>0)debits.push(['자동 소멸',expired]);
    if(ok&&excess>0)debits.push(['초과 차감 제외',-excess]);
    function format(value) {
      return Number.isSafeInteger(value)?(value<0?'−':'')+formatLeaveBalanceMinutes(Math.abs(value),dayMinutes):'—';
    }
    function group(title,key,total,items) {
      return '<section class="leave-fiscal-group"><div class="leave-fiscal-total"><h6>'+title
        +'</h6><strong data-leave-total="'+key+'">'+format(ok?total:null)+'</strong></div><dl>'+items.map(pair=>
          '<div><dt>'+pair[0]+'</dt><dd>'+format(pair[1])+'</dd></div>').join('')+'</dl></section>';
    }
    return '<div class="leave-fiscal-metrics" data-leave-fiscal>'
      +group('발생 합계','credited',gross,credits)+group('차감 합계','debited',charge,debits)+'</div>'
      +(!ok?'<p class="text-muted small mt-2 mb-0">합계를 확인하지 못했습니다.</p>':'');
  }

  function buildLeaveAdjustmentListHtml(adjustments,automatic,expiryBasis) {
    var html = '<ul class="leave-list">';
    var rows = (Array.isArray(adjustments) ? adjustments : []).map(item=>({item,date:item?.created_at?formatKstIsoDate(item.created_at):''}));
    if(automatic)rows.push({automatic,date:automatic.date});
    rows.sort((a,b)=>b.date.localeCompare(a.date));
    if (rows.length > 0) {
      rows.forEach(function (row) {
        if(row.automatic){
          html+='<li data-leave-auto-expiry><time datetime="'+escapeHtml(row.date)+'">'
            +escapeHtml(formatDotDate(row.date))+'</time> · <span class="text-danger fw-bold">자동 소멸 '
            +escapeHtml(formatReportAmount(row.automatic.minutes,expiryBasis))+'</span></li>';
          return;
        }
        var item=row.item;
        var positive = item && (item.adj_type === '지급' || item.adj_type === '포상');
        var minutes=Number(item?.days)*480*(positive?1:-1);
        var toneClass = positive ? 'text-success' : 'text-danger';
        var prefix = minutes>0 ? '+' : '';
        html += '<li>'+(row.date?'<time datetime="'+escapeHtml(row.date)+'">'+escapeHtml(formatDotDate(row.date))+'</time> · ':'')
          + '<span class="' + toneClass + ' fw-bold">[' + escapeHtml(item && item.adj_type || '') + ']</span> '
          + escapeHtml(item && item.reason || '')
          + ' (' + prefix + escapeHtml(formatReportAmount(minutes,Number(item?.basis_day_minutes)||480)) + ')'
          + (item?.leave_kind==='extra'?'<div class="text-secondary small">추가 휴가 · 근로일 '+escapeHtml(item.work_date||'')+' · 근로 '+Number(item.worked_minutes||0)/60+'시간 · 부여 '+Number(item.granted_minutes||0)/60+'시간</div>':'') + '</li>';
      });
    } else {
      html += '<li class="text-muted">- 없음 -</li>';
    }
    html += '</ul>';
    return html;
  } // End of buildLeaveAdjustmentListHtml

  function getYearFromDateValue(value) {
    var iso = formatKstIsoDate(value);
    return iso ? Number(iso.slice(0, 4)) : null;
  }

  function sortLeaveRowsByDate(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
      var aDate = normalizeText(a && a._leave_start_iso) || formatKstIsoDate(a && a.created_at);
      var bDate = normalizeText(b && b._leave_start_iso) || formatKstIsoDate(b && b.created_at);
      if (aDate === bDate) return Number(b && b._leave_item_index || 0) - Number(a && a._leave_item_index || 0);
      return aDate < bDate ? 1 : -1;
    });
  }

  function buildPendingRowsByYear(pendingDocs, fallbackYear) {
    var map = {};
    (Array.isArray(pendingDocs) ? pendingDocs : []).forEach(function (doc) {
      if (!isLeaveDocType(doc && doc.doc_type) || !isDeductibleLeaveDoc(doc)) return;
      getLeaveAllocationRows(doc).forEach(function (row) {
        var year = getLeaveRowYear(row, fallbackYear);
        var key = String(year);
        if (!map[key]) map[key] = { docs: [], days: 0 };
        map[key].docs.push(row);
        map[key].days = roundLeaveDays(map[key].days + Number(row && row._leave_amount || 0));
      });
    });
    return map;
  }


  function buildLeaveDetailReportHtml(options) {
    ensureLeaveDetailStyles();
    var opts = options || {};
    var summary = opts.summary || {};
    var accrual=requireAccrualReport(opts.accrual);
    var currentYear = Number(accrual.as_of.slice(0, 4));
    var yearMap = {};
    var grants=new Map((accrual.years||[]).map(row=>[row.year,row]));
    var expiry=accrual.state==='ready'?accrual.automatic_adjustments[0]:null;
    var firstRows=(accrual.years||[]).flatMap(year=>year.first_year).sort((a,b)=>b.issued_on.localeCompare(a.issued_on));
    var firstYearEnded=accrual.as_of>=accrual.first_year_expires_on;
    var activeFirst=firstYearEnded?[]:firstRows;
    var expiryBases=new Set(firstRows.filter(row=>row.expired_minutes>0).map(row=>row.granted_minutes));
    var expiryBasis=expiryBases.size===1?expiryBases.values().next().value:null;
    Object.keys(summary.byYear || {}).forEach(function (key) {
      yearMap[key] = summary.byYear[key];
    });
    var pendingByYear = buildPendingRowsByYear(opts.pendingDocs, currentYear);
    var reviewByYear={},reviewSeen=new Set();
    for(var doc of [...(summary.settlementReviewDocs||[]),...(opts.pendingDocs||[])]){
      if(getLeaveSnapshotMeta(doc)?.settlement_state!=='pending_schedule'||reviewSeen.has(doc.id))continue;
      reviewSeen.add(doc.id);
      getLeaveSnapshotItems(doc).forEach(function(item,index){
        var iso=normalizeIsoDate(item.leave_date);
        if(!iso||item.settlement_pending!==true)return;
        var key=iso.slice(0,4);
        (reviewByYear[key]||=[]).push(cloneDocWithMeta(doc,iso,0,{item,index,periodLabel:getLeaveSnapshotItemPeriod(item,iso)}));
      });
    }

    for(var grantYear of new Set([currentYear,...grants.keys()])){
      yearMap[String(grantYear)] ||= ensureLeaveYearSummary({todayIso:accrual.as_of,byYear:{}},grantYear);
    }
    Object.keys(pendingByYear).forEach(function (key) {
      yearMap[key] = yearMap[key] || ensureLeaveYearSummary({ todayIso: summary.todayIso || getTodayKstIso(), byYear: {} }, Number(key));
    });
    Object.keys(reviewByYear).forEach(function (key) {
      yearMap[key] = yearMap[key] || ensureLeaveYearSummary({ todayIso: summary.todayIso || getTodayKstIso(), byYear: {} }, Number(key));
    });

    var adjustmentsByYear = {};
    (Array.isArray(opts.adjustments) ? opts.adjustments : []).forEach(function (item) {
      var year = getYearFromDateValue(item && item.created_at) || currentYear;
      var key = String(year);
      if (!adjustmentsByYear[key]) adjustmentsByYear[key] = [];
      adjustmentsByYear[key].push(item);
      yearMap[key] = yearMap[key] || ensureLeaveYearSummary({ todayIso: summary.todayIso || getTodayKstIso(), byYear: {} }, year);
    });

    var years = Object.keys(yearMap).map(Number).filter(Number.isFinite).sort(function (a, b) { return b - a; });
    var currentHtml='', upcomingHtml='', archive=[];
    if(accrual.state==='ready'){
      currentHtml+='<div class="leave-report-balance" data-leave-today-available><div><span>오늘 사용 가능</span>'
        +'<small>하루 '+escapeHtml(formatAccrualMinutes(accrual.day_minutes))+' 기준</small></div><strong>'
        +escapeHtml(formatLeaveBalanceMinutes(accrual.available_minutes,accrual.day_minutes))+'</strong></div>';
    }else{
      currentHtml+='<p class="text-muted mb-0">'+(accrual.state==='no_hire'?'발생 내역을 보려면 입사일을 확인해 주세요.':'연차 계산 대상이 아닙니다.')+'</p>';
    }
    years.forEach(function (year) {
      var key = String(year);
      var yearSummary = yearMap[key];
      var pendingSummary = pendingByYear[key] || { docs: [], days: 0 };
      var entry=grants.get(year),fiscal=entry?.fiscal,dayMinutes=entry?.day_minutes||accrual.day_minutes||480;
      var grantBasis=year<currentYear?entry?.day_minutes:entry?.grant_day_minutes;
      var format=value=>formatReportAmount(value*480,dayMinutes);
      var auto=expiry?.date.slice(0,4)===key?expiry:null,manual=adjustmentsByYear[key]||[];
      var isCurrent=year===currentYear;
      var hasFiscal=!!fiscal&&(isCurrent||hasFiscalReport(fiscal)||manual.length>0);
      var hasHistory=Boolean(fiscal?.issued_on||auto||manual.length||pendingSummary.docs.length||reviewByYear[key]?.length
        ||yearSummary.reservedDocs?.length||yearSummary.pastOrUsedDocs?.length||yearSummary.unknownDateDocs?.length);
      if(!hasFiscal&&!hasHistory)return;
      var title=year+'년 '+(hasFiscal?(isCurrent?'잔여 계산':'회계연도 기록'):
        year>currentYear?'예정 기록':'기록'), past=year<currentYear;
      var html=past?'<details class="leave-report-archive" data-leave-archive data-leave-accrual-year="'+year
        +'"><summary>'+title+'</summary><div class="leave-report-history-body">'
        :'<section class="leave-report-card" data-leave-accrual-year="'+year+'"><h6 class="leave-report-heading">'+title+'</h6>';
      if(hasFiscal){
        var breakdown=readAdjustmentBreakdown(manual,year,fiscal.adjustment_minutes,opts.adjustmentsComplete===true);
        html+=buildFiscalReportMetrics(fiscal,isCurrent?accrual.day_minutes:dayMinutes,
          isCurrent?activeFirst:[],breakdown,isCurrent?accrual.available_minutes:null);
      }
      if(hasHistory)html+='<div class="leave-report-records">';
      if(fiscal?.issued_on)html+=buildFiscalGrantHistory(fiscal,grantBasis);
      if(auto||manual.length){
        html += '<div class="leave-section"><h6>조정 내역</h6>'
          + buildLeaveAdjustmentListHtml(manual,auto,expiryBasis) + '</div>';
      }
      if (pendingSummary.docs.length > 0) {
        html += '<div class="leave-section"><h6>⏳ 결재 예정 내역 <span class="text-warning">' + format(pendingSummary.days || 0) + ' 신청</span></h6>'
          + renderLeaveDocListHtml(sortLeaveRowsByDate(pendingSummary.docs), {
            formatDate: opts.formatDate,
            formatLeaveDocType: opts.formatLeaveDocType,
            emptyText: '- 없음 -',
            amountClass: 'text-warning',
            amountPrefix: '',
            amountSuffix: '일 신청'
          }) + '</div>';
      }
      if(reviewByYear[key]?.length){
        html += '<div class="leave-section"><h6>정산대기</h6>'
          +renderLeaveDocListHtml(sortLeaveRowsByDate(reviewByYear[key]), {
            formatDate:opts.formatDate,formatLeaveDocType:opts.formatLeaveDocType,amountClass:'text-warning'
          })+'</div>';
      }
      if(yearSummary.reservedDocs?.length)html += '<div class="leave-section"><h6>결재완료(예정) 내역 <span class="text-primary">−' + format(yearSummary.reservedDays || 0) + '</span></h6>'
        + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.reservedDocs), {
          formatDate: opts.formatDate,
          formatLeaveDocType: opts.formatLeaveDocType,
          emptyText: '- 없음 -'
        }) + '</div>';
      if(yearSummary.pastOrUsedDocs?.length){
        var usedDays=yearSummary.pastOrUsedDays || 0;
        var usedAmount=isCurrent?formatLeaveBalanceMinutes(usedDays*480,accrual.day_minutes):'−'+format(usedDays);
        html += '<div class="leave-section"><h6>'
        + (isCurrent?'올해 전체 사용 내역':'해당 연도 사용/처리 내역')
        + ' <span class="text-danger">' + usedAmount + '</span></h6>'
        + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.pastOrUsedDocs), {
          formatDate: opts.formatDate,
          formatLeaveDocType: opts.formatLeaveDocType,
          emptyText: '- 없음 -'
        }) + '</div>';
      }
      if (Array.isArray(yearSummary.unknownDateDocs) && yearSummary.unknownDateDocs.length > 0) {
        html += '<div class="leave-section"><h6>ℹ️ 일자 미확인 내역</h6>'
          + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.unknownDateDocs), {
            formatDate: opts.formatDate,
            formatLeaveDocType: opts.formatLeaveDocType,
            emptyText: '- 없음 -'
          }) + '</div>';
      }
      if(hasHistory)html+='</div>';
      html+=past?'</div></details>':'</section>';
      if(past)archive.push({date:year+'-12-31',html});
      else if(year===currentYear)currentHtml+=html;
      else upcomingHtml+=html;
    });
    var first=buildFirstYearGrantSummary(firstRows,accrual.day_minutes,firstYearEnded);
    if(firstYearEnded&&first)archive.push({date:accrual.first_year_expires_on,html:first});
    else currentHtml+=first;
    var history=archive.sort((a,b)=>b.date.localeCompare(a.date)).map(row=>row.html).join('')
      ||'<p class="text-muted mb-0">지난 연차 기록이 없습니다.</p>';
    var id=opts.dialogId&&/^[A-Za-z][A-Za-z0-9-]*$/.test(opts.dialogId)?opts.dialogId:'leaveDetailModal';
    return '<div class="leave-report" data-leave-detail-report>'
      +'<section class="leave-report-panel" data-leave-panel="current" id="'+id+'Current" aria-labelledby="'+id+'CurrentButton">'
      +currentHtml+upcomingHtml+'</section>'
      +'<section class="leave-report-panel" data-leave-panel="history" id="'+id+'History" aria-labelledby="'+id+'HistoryButton" hidden>'
      +history+'</section></div>';
  } // End of buildLeaveDetailReportHtml

  function setDeductibleSubTypes(subTypes) {
    if (!Array.isArray(subTypes)) {
      deductibleSubTypes = DEFAULT_DEDUCTIBLE_SUB_TYPES.slice();
      return deductibleSubTypes.slice();
    }
    deductibleSubTypes = Array.from(new Set(subTypes.map(function (item) {
      return normalizeText(item);
    }).filter(Boolean)));
    return deductibleSubTypes.slice();
  }

  function getDeductibleSubTypes() {
    return deductibleSubTypes.slice();
  }

  global.LeaveLedger = {
    KST_TZ: KST_TZ,
    DEDUCTIBLE_SUB_TYPES: DEFAULT_DEDUCTIBLE_SUB_TYPES.slice(),
    setDeductibleSubTypes: setDeductibleSubTypes,
    getDeductibleSubTypes: getDeductibleSubTypes,
    DEFAULT_RESERVED_STATUSES: DEFAULT_RESERVED_STATUSES.slice(),
    DEFAULT_PENDING_STATUSES: DEFAULT_PENDING_STATUSES.slice(),
    getTodayKstIso: getTodayKstIso,
    roundLeaveDays: roundLeaveDays,
    getLeaveSubType: getLeaveSubType,
    getLeaveSnapshotMeta: getLeaveSnapshotMeta,
    getLeaveSnapshotItems: getLeaveSnapshotItems,
    getLeaveAllocationRows: getLeaveAllocationRows,
    isLeaveDocType: isLeaveDocType,
    isDeductibleLeaveDoc: isDeductibleLeaveDoc,
    extractLeavePeriodLabel: extractLeavePeriodLabel,
    getLeaveStartIso: getLeaveStartIso,
    formatLeavePeriodText: formatLeavePeriodText,
    getLeaveStatusBadgeHtml: getLeaveStatusBadgeHtml,
    renderLeaveDocListHtml: renderLeaveDocListHtml,
    ensureLeaveDetailStyles: ensureLeaveDetailStyles,
    prepareLeaveDetailDialog: prepareLeaveDetailDialog,
    formatLeaveBalance: formatLeaveBalance,
    buildLeaveDetailReportHtml: buildLeaveDetailReportHtml,
    summarizeLeaveDocs: summarizeLeaveDocs,
    summarizePendingLeaveHolds: summarizePendingLeaveHolds,
    fetchLeaveApprovals: fetchLeaveApprovals,
    loadLeaveDetailReport: loadLeaveDetailReport,
    getLeaveSnapshot: getLeaveSnapshot,
    createDatedLeavePreview: createDatedLeavePreview
  };
})(window);
