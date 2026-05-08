(function (global) {
  'use strict';

  var ACTION_KEY = 'payroll.durunuri.support';
  var ENTITY_PREFIX = 'DURUNURI';

  function toInt(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  }

  function normalizeMonth(value) {
    var raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return '';
    var y = Number(raw.slice(0, 4));
    var m = Number(raw.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return '';
    return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0');
  }

  function nextMonth(value) {
    var ym = normalizeMonth(value);
    if (!ym) return '';
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    var dt = new Date(Date.UTC(y, m - 1, 1));
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    return String(dt.getUTCFullYear()).padStart(4, '0') + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
  }

  function makeEntityId(applyMonth, empId) {
    var ym = normalizeMonth(applyMonth);
    var eid = String(empId || '').trim();
    if (!ym || !eid) return '';
    return ENTITY_PREFIX + ':' + ym + ':' + eid;
  }

  function getCurrentCoopId() {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    try {
      var storedUser = JSON.parse(window.localStorage.getItem('erp_user') || 'null');
      return String(storedUser && storedUser.coop_id || '').trim();
    } catch (_) {
      return '';
    }
  }

  function parseSupportDetail(detail, fallbackEntityId) {
    var safeDetail = detail && typeof detail === 'object' ? detail : {};
    var entityId = String(fallbackEntityId || '');
    var parts = entityId.split(':');
    var fallbackApplyMonth = parts.length >= 3 ? normalizeMonth(parts[1]) : '';
    var fallbackEmpId = parts.length >= 3 ? String(parts.slice(2).join(':') || '').trim() : '';
    var applyMonth = normalizeMonth(safeDetail.apply_month || fallbackApplyMonth);
    var empId = String(safeDetail.emp_id || fallbackEmpId || '').trim();
    if (!applyMonth || !empId) return null;

    return {
      emp_id: empId,
      emp_name: String(safeDetail.emp_name || '').trim(),
      source_month: normalizeMonth(safeDetail.source_month || ''),
      apply_month: applyMonth,
      emp_support: Math.max(0, toInt(safeDetail.emp_support)),
      biz_support: Math.max(0, toInt(safeDetail.biz_support)),
      memo: String(safeDetail.memo || '')
    };
  }

  function pickLatestByEntity(rows) {
    var latest = new Map();
    (rows || []).forEach(function (row) {
      var entityId = String(row.entity_id || '');
      if (!entityId) return;
      if (!latest.has(entityId)) latest.set(entityId, row);
    });
    return Array.from(latest.values());
  }

  function buildSupportMap(rows) {
    var map = {};
    pickLatestByEntity(rows).forEach(function (row) {
      var parsed = parseSupportDetail(row.detail, row.entity_id);
      if (!parsed) return;
      map[parsed.emp_id] = {
        emp_id: parsed.emp_id,
        emp_name: parsed.emp_name,
        source_month: parsed.source_month,
        apply_month: parsed.apply_month,
        emp_support: parsed.emp_support,
        biz_support: parsed.biz_support,
        created_at: row.created_at || null
      };
    });
    return map;
  }

  async function fetchSupportRows(supabase, applyMonth) {
    if (!supabase) throw new Error('supabase client is required');
    var ym = normalizeMonth(applyMonth);
    if (!ym) return [];
    var likePattern = ENTITY_PREFIX + ':' + ym + ':%';
    var coopId = getCurrentCoopId();
    var query = supabase
      .from('erp_audit_logs')
      .select('id,created_at,entity_id,detail')
      .eq('action', ACTION_KEY)
      .eq('entity_type', 'durunuri_support')
      .like('entity_id', likePattern);
    query = query.eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000');
    var response = await query.order('created_at', { ascending: false });

    if (response.error) throw response.error;
    return Array.isArray(response.data) ? response.data : [];
  }

  async function getSupportMap(supabase, applyMonth) {
    var rows = await fetchSupportRows(supabase, applyMonth);
    return buildSupportMap(rows);
  }

  function getSupportForEmployee(map, empId) {
    var eid = String(empId || '').trim();
    if (!eid || !map || typeof map !== 'object') return null;
    return map[eid] || null;
  }

  function getPayrollTaxAdjustmentTotal(source) {
    return Math.max(0, toInt(source.payroll_tax_adjustment_income)) +
      Math.max(0, toInt(source.payroll_tax_adjustment_local));
  }

  function adjustSalaryRow(row, supportMap) {
    var source = row && typeof row === 'object' ? row : {};
    var empId = String(source.emp_id || '').trim();
    var support = getSupportForEmployee(supportMap || {}, empId);
    var supportEmp = Math.max(0, toInt(support && support.emp_support));
    var supportBiz = Math.max(0, toInt(support && support.biz_support));
    var baseSix =
      toInt(source.ded_pension) +
      toInt(source.ded_health) +
      toInt(source.ded_care) +
      toInt(source.ded_employ) +
      toInt(source.ded_income) +
      toInt(source.ded_local);
    var rawAdvance = toInt(source.ded_advance);
    var rawCapital = toInt(source.ded_capital);
    var payrollTaxAdjustment = getPayrollTaxAdjustmentTotal(source);
    var adjustedAdvance = rawAdvance - supportEmp;
    var dedTotal = Math.max(0, baseSix + adjustedAdvance + rawCapital - payrollTaxAdjustment);
    var payTotal = toInt(source.pay_total);
    var netPay = payTotal - dedTotal;
    var coTotalRaw = Math.max(0, toInt(source.co_total));
    var coTotal = Math.max(0, coTotalRaw - supportBiz);

    var adjusted = Object.assign({}, source);
    adjusted.ded_advance_raw = rawAdvance;
    adjusted.ded_advance = adjustedAdvance;
    adjusted.ded_capital = rawCapital;
    adjusted.payroll_tax_adjustment_income = Math.max(0, toInt(source.payroll_tax_adjustment_income));
    adjusted.payroll_tax_adjustment_local = Math.max(0, toInt(source.payroll_tax_adjustment_local));
    adjusted.ded_total = dedTotal;
    adjusted.net_pay = netPay;
    adjusted.co_total_raw = coTotalRaw;
    adjusted.co_total = coTotal;
    adjusted.durunuri_emp_support = supportEmp;
    adjusted.durunuri_biz_support = supportBiz;
    adjusted.durunuri_apply_month = support ? support.apply_month : normalizeMonth(source.year_month || '');
    adjusted.durunuri_source_month = support ? support.source_month : '';
    return adjusted;
  }

  function adjustSalaryRows(rows, supportMap) {
    var src = Array.isArray(rows) ? rows : [];
    return src.map(function (row) {
      return adjustSalaryRow(row, supportMap);
    });
  }

  async function loadAndAdjustSalaryRows(supabase, rows, applyMonth) {
    var map = await getSupportMap(supabase, applyMonth);
    return adjustSalaryRows(rows, map);
  }

  async function saveSupportBatch(supabase, payload) {
    if (!supabase) throw new Error('supabase client is required');
    var input = payload && typeof payload === 'object' ? payload : {};
    var applyMonth = normalizeMonth(input.apply_month);
    if (!applyMonth) throw new Error('apply_month 형식이 올바르지 않습니다. (YYYY-MM)');
    var sourceMonth = normalizeMonth(input.source_month);
    var actorEmpId = String(input.actor_emp_id || '').trim();
    var actorName = String(input.actor_name || '').trim();
    var coopId = String(input.coop_id || getCurrentCoopId()).trim();
    var rows = Array.isArray(input.rows) ? input.rows : [];

    var currentMap = await getSupportMap(supabase, applyMonth);
    var inserts = [];

    rows.forEach(function (row) {
      var empId = String(row && row.emp_id || '').trim();
      if (!empId) return;
      var empName = String(row && row.emp_name || '').trim();
      var empSupport = Math.max(0, toInt(row && row.emp_support));
      var bizSupport = Math.max(0, toInt(row && row.biz_support));
      var entityId = makeEntityId(applyMonth, empId);
      if (!entityId) return;
      var prev = currentMap[empId] || null;
      var prevEmp = Math.max(0, toInt(prev && prev.emp_support));
      var prevBiz = Math.max(0, toInt(prev && prev.biz_support));
      if (prevEmp === empSupport && prevBiz === bizSupport) return;

      inserts.push({
        coop_id: coopId || null,
        actor_emp_id: actorEmpId || null,
        actor_name: actorName || null,
        action: ACTION_KEY,
        entity_type: 'durunuri_support',
        entity_id: entityId,
        summary: applyMonth + ' 두루누리 지원금 입력 (' + (empName || empId) + ')',
        detail: {
          emp_id: empId,
          emp_name: empName,
          source_month: sourceMonth,
          apply_month: applyMonth,
          emp_support: empSupport,
          biz_support: bizSupport,
          memo: String(row && row.memo || '')
        }
      });
    });

    if (inserts.length === 0) {
      return { changed: 0, inserted: 0 };
    }

    var response = await supabase.from('erp_audit_logs').insert(inserts);
    if (response.error) throw response.error;
    return { changed: inserts.length, inserted: inserts.length };
  }

  global.PayrollDurunuriModule = {
    ACTION_KEY: ACTION_KEY,
    normalizeMonth: normalizeMonth,
    nextMonth: nextMonth,
    makeEntityId: makeEntityId,
    fetchSupportRows: fetchSupportRows,
    getSupportMap: getSupportMap,
    getSupportForEmployee: getSupportForEmployee,
    adjustSalaryRow: adjustSalaryRow,
    adjustSalaryRows: adjustSalaryRows,
    loadAndAdjustSalaryRows: loadAndAdjustSalaryRows,
    saveSupportBatch: saveSupportBatch
  };
})(window);
