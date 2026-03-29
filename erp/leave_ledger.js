(function (global) {
  'use strict';

  var KST_TZ = 'Asia/Seoul';
  var DEFAULT_DEDUCTIBLE_SUB_TYPES = ['연차', '반차'];
  var deductibleSubTypes = DEFAULT_DEDUCTIBLE_SUB_TYPES.slice();
  var DEFAULT_RESERVED_STATUSES = ['완료', '가승인', '증빙확인중', '실물결재대기', '실물결재완료'];
  var DEFAULT_APPROVAL_SELECT_COLUMNS = 'id,created_at,doc_type,title,content,amount,status,drafter_id';

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
    var title = normalizeText(doc && doc.title);
    var titleMatch = title.match(/\(([^()]+)\)\s*$/);
    if (titleMatch) return normalizeText(titleMatch[1]);

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

  function cloneDocWithMeta(doc, startIso, amount) {
    var copy = Object.assign({}, doc || {});
    copy._leave_start_iso = startIso || '';
    copy._leave_amount = roundLeaveDays(amount);
    copy._leave_period_label = extractLeavePeriodLabel(doc);
    copy._leave_sub_type = getLeaveSubType(doc && doc.doc_type);
    copy._leave_snapshot = getLeaveSnapshotMeta(doc);
    return copy;
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
      unknownDateDocs: []
    };

    var rows = Array.isArray(docs) ? docs : [];
    rows.forEach(function (doc) {
      if (!isLeaveDocType(doc && doc.doc_type)) return;
      if (!isDeductibleLeaveDoc(doc)) return;
      if (!statusIn(doc && doc.status, reservedStatuses)) return;

      var amount = Math.max(0, roundLeaveDays(toNumber(doc && doc.amount, 0)));
      if (!(amount > 0)) return;

      var startIso = getLeaveStartIso(doc);
      if (!startIso) {
        summary.unknownDateDays = roundLeaveDays(summary.unknownDateDays + amount);
        summary.unknownDateDocs.push(cloneDocWithMeta(doc, '', amount));

        if (unknownAsReserved) {
          summary.reservedDays = roundLeaveDays(summary.reservedDays + amount);
          summary.reservedDocs.push(cloneDocWithMeta(doc, '', amount));
        }
        return;
      }

      var isReserved = includeToday ? (startIso >= todayIso) : (startIso > todayIso);
      if (isReserved) {
        summary.reservedDays = roundLeaveDays(summary.reservedDays + amount);
        summary.reservedDocs.push(cloneDocWithMeta(doc, startIso, amount));
      } else {
        summary.pastOrUsedDays = roundLeaveDays(summary.pastOrUsedDays + amount);
        summary.pastOrUsedDocs.push(cloneDocWithMeta(doc, startIso, amount));
      }
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
    var label = extractLeavePeriodLabel(doc);
    if (label) return label;

    var startIso = getLeaveStartIso(doc);
    return formatDotDate(startIso);
  }

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
    isLeaveDocType: isLeaveDocType,
    isDeductibleLeaveDoc: isDeductibleLeaveDoc,
    extractLeavePeriodLabel: extractLeavePeriodLabel,
    getLeaveStartIso: getLeaveStartIso,
    formatLeavePeriodText: formatLeavePeriodText,
    summarizeLeaveDocs: summarizeLeaveDocs,
    fetchLeaveApprovals: fetchLeaveApprovals,
    getLeaveSnapshot: getLeaveSnapshot
  };
})(window);
