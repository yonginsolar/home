(function (global) {
  'use strict';

  var KST_TZ = 'Asia/Seoul';
  var DEFAULT_DEDUCTIBLE_SUB_TYPES = ['연차', '반차'];
  var deductibleSubTypes = DEFAULT_DEDUCTIBLE_SUB_TYPES.slice();
  var DEFAULT_RESERVED_STATUSES = ['완료', '가승인', '증빙확인중', '실물결재대기', '실물결재완료'];
  var DEFAULT_PENDING_STATUSES = ['진행중'];
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
    var [grant,adjustments,docs]=await Promise.all([
      send(supabase.rpc('erp_leave_accrual_report',{p_emp_id:empId})),
      send(supabase.from('hr_leave_adj').select('*').eq('coop_id',coopId).eq('emp_id',empId).order('created_at',{ascending:false})),
      fetchLeaveApprovals(supabase,empId,{statuses,coopId,signal,columns:opts.columns})
    ]);
    if(signal?.aborted)throw new Error('LEAVE_REPORT_CANCELLED');
    if(grant.error)throw grant.error;
    if(adjustments.error)throw adjustments.error;
    var accrual=requireAccrualReport(grant.data);
    return {
      accrual,
      summary:summarizeLeaveDocs(docs,{todayIso:accrual.as_of,reservedStatuses:DEFAULT_RESERVED_STATUSES,includeToday:false}),
      pendingDocs:docs.filter(doc=>statusIn(doc?.status,DEFAULT_PENDING_STATUSES)
        && (opts.isPendingDeductible||isDeductibleLeaveDoc)(doc)),
      adjustments:adjustments.data||[]
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

  function buildLeaveGrantListHtml(entry) {
    var time=formatAccrualMinutes;
    if(!entry)return '<p class="mb-0 text-muted">발생 내역 없음</p>';
    var f=entry.fiscal,monthRows=entry.first_year;
    var html='';
    if(monthRows.length){
      html+='<div class="mb-2"><span class="fw-semibold">1년 미만 · '+monthRows.length+'회 발생</span><ul class="leave-list" data-leave-monthly-grants>';
      monthRows.forEach(function(row){
        var fields=['발생 '+time(row.granted_minutes),'사용 '+time(row.used_minutes)];
        if(row.held_minutes>0)fields.push('예정·결재 중 '+time(row.held_minutes));
        fields.push('사용 가능 '+time(row.available_minutes));
        html+='<li data-leave-issued-on="'+escapeHtml(row.issued_on)+'"><time datetime="'+escapeHtml(row.issued_on)+'">'
          +escapeHtml(formatDotDate(row.issued_on))+'</time> · '+escapeHtml(fields.join(' · '))+'</li>';
      });
      html+='</ul></div>';
    }
    if(f.granted_minutes||f.adjustment_minutes||f.used_minutes||f.available_minutes){
      var fields=[];
      if(f.issued_on)fields.push(formatDotDate(f.issued_on)+' 발생 '+time(f.granted_minutes));
      if(f.adjustment_minutes)fields.push('조정 '+(f.adjustment_minutes>0?'+':'')+time(f.adjustment_minutes));
      fields.push('사용 '+time(f.used_minutes));
      if(f.available_minutes!==null)fields.push('사용 가능 '+time(f.available_minutes));
      html+='<div data-leave-fiscal><span class="fw-semibold">회계연도</span><p class="mb-0">'+escapeHtml(fields.join(' · '))+'</p></div>';
    }
    return html||'<p class="mb-0 text-muted">발생 내역 없음</p>';
  }

  function buildLeaveAdjustmentListHtml(adjustments,automatic) {
    var html = '<ul class="leave-list">';
    var rows = (Array.isArray(adjustments) ? adjustments : []).map(item=>({item,date:automatic?formatKstIsoDate(item?.created_at):''}));
    if(automatic){
      rows.push({automatic,date:automatic.date});
      rows.sort((a,b)=>b.date.localeCompare(a.date));
    }
    if (rows.length > 0) {
      rows.forEach(function (row) {
        if(row.automatic){
          html+='<li data-leave-auto-expiry><time datetime="'+escapeHtml(row.date)+'">'
            +escapeHtml(formatDotDate(row.date))+'</time> · <span class="text-danger fw-bold">자동 소멸 −'
            +escapeHtml(formatAccrualMinutes(-row.automatic.minutes))+'</span></li>';
          return;
        }
        var item=row.item;
        var positive = item && (item.adj_type === '지급' || item.adj_type === '포상');
        var toneClass = positive ? 'text-success' : 'text-danger';
        var prefix = positive ? '+' : '-';
        html += '<li><span class="' + toneClass + ' fw-bold">[' + escapeHtml(item && item.adj_type || '') + ']</span> '
          + escapeHtml(item && item.reason || '')
          + ' (' + prefix + (global.CoopLeaveTime?global.CoopLeaveTime.formatDays(item && item.days || 0,item?.basis_day_minutes||480):Number(item && item.days || 0)+'일') + ')'
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

  function buildLeaveYearMetricText(yearSummary, pendingSummary, dayMinutes) {
    var metrics = [];
    var used = Number(yearSummary && yearSummary.pastOrUsedDays || 0);
    var reserved = Number(yearSummary && yearSummary.reservedDays || 0);
    var pending = Number(pendingSummary && pendingSummary.days || 0);
    var unknown = Number(yearSummary && yearSummary.unknownDateDays || 0);
    var format=value=>global.CoopLeaveTime?global.CoopLeaveTime.formatDays(value,dayMinutes):value+'일';
    if (used > 0) metrics.push('사용 ' + format(used));
    if (reserved > 0) metrics.push('예정 ' + format(reserved));
    if (pending > 0) metrics.push('결재중 ' + format(pending));
    if (unknown > 0) metrics.push('일자 확인 필요 ' + format(unknown));
    return metrics.length > 0 ? metrics.join(' · ') : '사용 내역 없음';
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
    var html = '<div class="d-flex flex-column gap-3">';
    if(accrual.state==='ready'){
      var effective=global.CoopLeaveTime?global.CoopLeaveTime.formatDays(accrual.available_minutes/480,accrual.day_minutes)
        :formatAccrualMinutes(accrual.available_minutes);
      html+='<p class="fw-semibold mb-0" data-leave-today-available>오늘 사용 가능: '+escapeHtml(effective)+'</p>';
    }else{
      html+='<p class="text-muted mb-0">'+(accrual.state==='no_hire'?'발생 내역을 보려면 입사일을 확인해 주세요.':'연차 계산 대상이 아닙니다.')+'</p>';
    }
    years.forEach(function (year) {
      var key = String(year);
      var yearSummary = yearMap[key];
      var pendingSummary = pendingByYear[key] || { docs: [], days: 0 };
      var dayMinutes=grants.get(year)?.day_minutes||accrual.day_minutes||480;
      var format=value=>global.CoopLeaveTime?global.CoopLeaveTime.formatDays(value,dayMinutes):Number(value||0)+'일';
      html += '<details class="leave-year-accordion"><summary><span>📅 ' + year + '년</span><span class="leave-year-summary-metrics">'
        + escapeHtml(reviewByYear[key]?.length
          ? [buildLeaveYearMetricText(yearSummary,pendingSummary,dayMinutes), '정산대기'].filter(x=>x!=='사용 내역 없음').join(' · ')
          : buildLeaveYearMetricText(yearSummary,pendingSummary,dayMinutes)) + '</span></summary><div class="leave-year-body">';
      if(accrual.state==='ready'){
        html += '<div class="leave-section" data-leave-accrual-year="'+year+'"><h6>🎁 발생 내역</h6>'
          + buildLeaveGrantListHtml(grants.get(year)) + '</div>';
      }
      html += '<div class="leave-section"><h6>⚖️ 조정 내역</h6>'
        + buildLeaveAdjustmentListHtml(adjustmentsByYear[key] || [],expiry?.date.slice(0,4)===key?expiry:null) + '</div>';
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
      html += '<div class="leave-section"><h6>🗓️ 결재완료(예정) 내역 <span class="text-primary">-' + format(yearSummary.reservedDays || 0) + '</span></h6>'
        + renderLeaveDocListHtml(sortLeaveRowsByDate(yearSummary.reservedDocs), {
          formatDate: opts.formatDate,
          formatLeaveDocType: opts.formatLeaveDocType,
          emptyText: '- 없음 -'
        }) + '</div>';
      html += '<div class="leave-section"><h6>🎫 사용/처리 내역 <span class="text-danger">-' + format(yearSummary.pastOrUsedDays || 0) + '</span></h6>'
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
    buildLeaveDetailReportHtml: buildLeaveDetailReportHtml,
    summarizeLeaveDocs: summarizeLeaveDocs,
    summarizePendingLeaveHolds: summarizePendingLeaveHolds,
    fetchLeaveApprovals: fetchLeaveApprovals,
    loadLeaveDetailReport: loadLeaveDetailReport,
    getLeaveSnapshot: getLeaveSnapshot,
    createDatedLeavePreview: createDatedLeavePreview
  };
})(window);
