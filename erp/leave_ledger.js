(function (global) {
  'use strict';

  var KST_TZ = 'Asia/Seoul';
  var DEFAULT_DEDUCTIBLE_SUB_TYPES = ['연차', '반차'];
  var deductibleSubTypes = DEFAULT_DEDUCTIBLE_SUB_TYPES.slice();
  var DEFAULT_RESERVED_STATUSES = ['완료', '가승인', '증빙확인중', '실물결재대기', '실물결재완료'];
  var DEFAULT_APPROVAL_SELECT_COLUMNS = 'id,created_at,doc_type,title,content,amount,status,drafter_id';
  var LEAVE_REPORT_STYLE_ID = 'leave-ledger-report-style-v2';
  var LEAVE_REPORT_STYLE_TEXT = [
    '.leave-year-accordion{border:1px solid var(--bs-border-color,#dee2e6);border-radius:10px;background:var(--bs-body-bg,#fff);overflow:hidden}',
    '.leave-year-accordion>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;padding:14px 16px;font-weight:700;list-style:none}',
    '.leave-year-accordion>summary::-webkit-details-marker{display:none}',
    '.leave-year-accordion>summary::after{content:"⌄";font-size:1rem;transition:transform .18s ease}',
    '.leave-year-accordion[open]>summary::after{transform:rotate(180deg)}',
    '.leave-year-accordion[open]>summary{border-bottom:1px solid var(--bs-border-color,#dee2e6)}',
    '.leave-year-summary-metrics{margin-left:auto;font-size:.78rem;font-weight:600;color:var(--bs-secondary-color,#6c757d);text-align:right}',
    '.leave-year-body{padding:12px}',
    '.leave-section{margin-bottom:10px;border:1px solid var(--bs-border-color,#dee2e6);border-radius:8px;background:var(--bs-tertiary-bg,#f8f9fa);padding:13px}',
    '.leave-section:last-child{margin-bottom:0}',
    '.leave-section h6{font-weight:bold;border-bottom:1px solid var(--bs-border-color,#dee2e6);padding-bottom:8px;margin-bottom:10px;font-size:0.95rem}',
    '.leave-list{list-style:none;padding:0;margin:0;font-size:0.85rem}',
    '.leave-list li{margin-bottom:6px}',
    '@media(max-width:575.98px){.leave-year-accordion>summary{align-items:flex-start;flex-wrap:wrap}.leave-year-summary-metrics{width:100%;margin-left:0;text-align:left}}'
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

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function roundLeaveDays(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 2) / 2;
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
    return dateText + (slotLabel ? ' ' + slotLabel : '');
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

    var result = await buildLeaveQuery(supabase, empId, statuses, columns, coopId);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function getLeaveSnapshot(supabase, empId, options) {
    if (!supabase) throw new Error('supabase client is required');
    if (!normalizeText(empId)) {
      return {
        baseRemainDays: 0,
        effectiveRemainDays: 0,
        reservedDays: 0,
        summary: summarizeLeaveDocs([], options),
        docs: []
      };
    }

    var opts = options || {};
    var reservedStatuses = Array.isArray(opts.reservedStatuses) && opts.reservedStatuses.length > 0
      ? opts.reservedStatuses
      : DEFAULT_RESERVED_STATUSES;

    var rpc = await supabase.rpc('calculate_leave_days', { p_emp_id: empId });
    if (rpc.error) throw rpc.error;

    var baseRemainDays = roundLeaveDays(toNumber(rpc.data, 0));
    var docs = await fetchLeaveApprovals(supabase, empId, {
      statuses: reservedStatuses,
      columns: opts.columns
    });
    var summary = summarizeLeaveDocs(docs, {
      todayIso: opts.todayIso,
      includeToday: opts.includeToday,
      reservedStatuses: reservedStatuses,
      unknownAsReserved: opts.unknownAsReserved
    });

    var effectiveRemainDays = Math.max(0, roundLeaveDays(baseRemainDays));

    return {
      baseRemainDays: baseRemainDays,
      effectiveRemainDays: effectiveRemainDays,
      reservedDays: summary.reservedDays,
      summary: summary,
      docs: docs,
      reservedStatuses: reservedStatuses
    };
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
        html += '<li class="border-bottom pb-1 mb-1"><div class="d-flex justify-content-between"><span>'
          + escapeHtml(formatLeaveDocType(doc || doc && doc.doc_type || '휴가'))
          + ' ' + statusBadge + periodLabel
          + '</span><span class="fw-bold ' + escapeHtml(amountClass) + '">' + escapeHtml(amountPrefix) + amount + escapeHtml(amountSuffix) + '</span></div><div class="text-muted" style="font-size:0.75rem;">'
          + createdAt + '</div></li>';
      });
    } else {
      html += '<li class="text-muted">' + escapeHtml(emptyText) + '</li>';
    }
    html += '</ul>';
    return html;
  } // End of renderLeaveDocListHtml

  function buildLeaveGrantListHtml(hireDateValue, options) {
    var opts = options || {};
    var today = opts.today instanceof Date ? opts.today : new Date();
    var html = '<ul class="leave-list">';
    if (!hireDateValue) {
      html += '<li class="text-muted">- 입사일 정보 없음 -</li></ul>';
      return html;
    }
    var hireDate = new Date(hireDateValue);
    if (Number.isNaN(hireDate.getTime())) {
      html += '<li class="text-muted">- 입사일 정보 없음 -</li></ul>';
      return html;
    }
    var oneYear = new Date(hireDate);
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    if (today < oneYear) {
      var months = (today.getFullYear() - hireDate.getFullYear()) * 12 + (today.getMonth() - hireDate.getMonth());
      if (today.getDate() < hireDate.getDate()) months -= 1;
      html += '<li class="text-primary">🟢 1년 미만: ' + Math.min(11, Math.max(0, months)) + '개</li>';
    } else {
      html += '<li class="text-muted">⚪ 1년 미만: 0개</li>';
    }
    if (today.getFullYear() > hireDate.getFullYear()) {
      html += '<li class="text-primary">🔵 회계연도(' + today.getFullYear() + '): 15개</li>';
    } else {
      html += '<li class="text-muted">⚪ 회계연도: 0개</li>';
    }
    html += '</ul>';
    return html;
  } // End of buildLeaveGrantListHtml

  function buildLeaveAdjustmentListHtml(adjustments) {
    var html = '<ul class="leave-list">';
    var rows = Array.isArray(adjustments) ? adjustments : [];
    if (rows.length > 0) {
      rows.forEach(function (item) {
        var positive = item && (item.adj_type === '지급' || item.adj_type === '포상');
        var toneClass = positive ? 'text-success' : 'text-danger';
        var prefix = positive ? '+' : '-';
        html += '<li><span class="' + toneClass + ' fw-bold">[' + escapeHtml(item && item.adj_type || '') + ']</span> '
          + escapeHtml(item && item.reason || '')
          + ' (' + prefix + Number(item && item.days || 0) + '일)</li>';
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

  function buildLeaveReportAsOfDate(year, today) {
    var current = today instanceof Date ? today : new Date();
    var currentYear = Number(formatKstIsoDate(current).slice(0, 4));
    if (Number(year) === currentYear) return current;
    return new Date(Number(year) + '-12-31T12:00:00+09:00');
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

  function buildLeaveYearMetricText(yearSummary, pendingSummary) {
    var metrics = [];
    var used = Number(yearSummary && yearSummary.pastOrUsedDays || 0);
    var reserved = Number(yearSummary && yearSummary.reservedDays || 0);
    var pending = Number(pendingSummary && pendingSummary.days || 0);
    var unknown = Number(yearSummary && yearSummary.unknownDateDays || 0);
    if (used > 0) metrics.push('사용 ' + used + '일');
    if (reserved > 0) metrics.push('예정 ' + reserved + '일');
    if (pending > 0) metrics.push('결재중 ' + pending + '일');
    if (unknown > 0) metrics.push('일자 확인 필요 ' + unknown + '일');
    return metrics.length > 0 ? metrics.join(' · ') : '사용 내역 없음';
  }

  function buildLeaveDetailReportHtml(options) {
    ensureLeaveDetailStyles();
    var opts = options || {};
    var summary = opts.summary || {};
    var today = opts.today instanceof Date ? opts.today : new Date();
    var currentYear = Number(formatKstIsoDate(today).slice(0, 4));
    var yearMap = {};
    Object.keys(summary.byYear || {}).forEach(function (key) {
      yearMap[key] = summary.byYear[key];
    });
    var pendingByYear = buildPendingRowsByYear(opts.pendingDocs, currentYear);

    var hireYear = getYearFromDateValue(opts.hireDate);
    if (hireYear) yearMap[String(hireYear)] = yearMap[String(hireYear)] || ensureLeaveYearSummary({ todayIso: summary.todayIso || getTodayKstIso(), byYear: {} }, hireYear);
    yearMap[String(currentYear)] = yearMap[String(currentYear)] || ensureLeaveYearSummary({ todayIso: summary.todayIso || getTodayKstIso(), byYear: {} }, currentYear);
    Object.keys(pendingByYear).forEach(function (key) {
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
    var html = '<div class="d-flex flex-column gap-3">';
    years.forEach(function (year) {
      var key = String(year);
      var yearSummary = yearMap[key];
      var pendingSummary = pendingByYear[key] || { docs: [], days: 0 };
      html += '<details class="leave-year-accordion"><summary><span>📅 ' + year + '년</span><span class="leave-year-summary-metrics">'
        + escapeHtml(buildLeaveYearMetricText(yearSummary, pendingSummary)) + '</span></summary><div class="leave-year-body">';
      html += '<div class="leave-section"><h6>🎁 발생 내역</h6>'
        + buildLeaveGrantListHtml(opts.hireDate, { today: buildLeaveReportAsOfDate(year, today) }) + '</div>';
      html += '<div class="leave-section"><h6>⚖️ 조정 내역</h6>'
        + buildLeaveAdjustmentListHtml(adjustmentsByYear[key] || []) + '</div>';
      if (pendingSummary.docs.length > 0) {
        html += '<div class="leave-section"><h6>⏳ 결재 예정 내역 <span class="text-warning">' + Number(pendingSummary.days || 0) + '일 신청</span></h6>'
          + '<div class="small text-muted mb-2">결재 진행 중인 신청이며, 승인 전에는 잔여 연차에 반영되지 않습니다.</div>'
          + renderLeaveDocListHtml(sortLeaveRowsByDate(pendingSummary.docs), {
            formatDate: opts.formatDate,
            formatLeaveDocType: opts.formatLeaveDocType,
            emptyText: '- 없음 -',
            amountClass: 'text-warning',
            amountPrefix: '',
            amountSuffix: '일 신청'
          }) + '</div>';
      }
      html += '<div class="leave-section"><h6>🗓️ 결재완료(예정) 내역 <span class="text-primary">-' + Number(yearSummary.reservedDays || 0) + '일</span></h6>'
        + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.reservedDocs), {
          formatDate: opts.formatDate,
          formatLeaveDocType: opts.formatLeaveDocType,
          emptyText: '- 없음 -'
        }) + '</div>';
      html += '<div class="leave-section"><h6>🎫 사용/처리 내역 <span class="text-danger">-' + Number(yearSummary.pastOrUsedDays || 0) + '일</span></h6>'
        + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.pastOrUsedDocs), {
          formatDate: opts.formatDate,
          formatLeaveDocType: opts.formatLeaveDocType,
          emptyText: '- 없음 -'
        }) + '</div>';
      if (Array.isArray(yearSummary.unknownDateDocs) && yearSummary.unknownDateDocs.length > 0) {
        html += '<div class="leave-section"><h6>ℹ️ 일자 미확인 내역</h6>'
          + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.unknownDateDocs), {
            formatDate: opts.formatDate,
            formatLeaveDocType: opts.formatLeaveDocType,
            emptyText: '- 없음 -'
          }) + '</div>';
      }
      html += '</div></details>';
    });
    html += '</div>';
    return html;
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
    buildLeaveDetailReportHtml: buildLeaveDetailReportHtml,
    summarizeLeaveDocs: summarizeLeaveDocs,
    fetchLeaveApprovals: fetchLeaveApprovals,
    getLeaveSnapshot: getLeaveSnapshot
  };
})(window);
