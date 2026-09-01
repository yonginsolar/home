(function (global) {
  'use strict';

  var ACTION_KEY = 'payroll.durunuri.support';
  var ENTITY_PREFIX = 'DURUNURI';
  var PROFILE_TABLE = 'erp_durunuri_employee_profiles';
  var MAX_SUPPORT_MONTHS = 36;

  function toInt(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  }

  function toNonNegativeInt(value) {
    return Math.max(0, toInt(value));
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
      emp_support: toNonNegativeInt(safeDetail.emp_support),
      biz_support: toNonNegativeInt(safeDetail.biz_support),
      memo: String(safeDetail.memo || '').trim(),
      origin: String(safeDetail.origin || '').trim(),
      source_approval_id: safeDetail.source_approval_id == null ? null : String(safeDetail.source_approval_id),
      application_rule: String(safeDetail.application_rule || '').trim(),
      allocation_version: toNonNegativeInt(safeDetail.allocation_version)
    };
  }

  function pickLatestByEntity(rows) {
    var latest = new Map();
    (rows || []).forEach(function (row) {
      var entityId = String(row.entity_id || '');
      if (!entityId || latest.has(entityId)) return;
      latest.set(entityId, row);
    });
    return Array.from(latest.values());
  }

  function buildSupportMap(rows) {
    var map = {};
    pickLatestByEntity(rows).forEach(function (row) {
      var parsed = parseSupportDetail(row.detail, row.entity_id);
      if (!parsed) return;
      map[parsed.emp_id] = Object.assign({}, parsed, {
        created_at: row.created_at || null,
        audit_id: row.id || null
      });
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

  async function fetchSupportHistoryRows(supabase) {
    if (!supabase) throw new Error('supabase client is required');
    var coopId = getCurrentCoopId();
    var response = await supabase
      .from('erp_audit_logs')
      .select('id,created_at,entity_id,detail')
      .eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000')
      .eq('action', ACTION_KEY)
      .eq('entity_type', 'durunuri_support')
      .order('created_at', { ascending: false })
      .limit(5000);
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
    return toNonNegativeInt(source.payroll_tax_adjustment_income) +
      toNonNegativeInt(source.payroll_tax_adjustment_local);
  }

  function adjustSalaryRow(row, supportMap) {
    var source = row && typeof row === 'object' ? row : {};
    var empId = String(source.emp_id || '').trim();
    var support = getSupportForEmployee(supportMap || {}, empId);
    var supportEmp = toNonNegativeInt(support && support.emp_support);
    var supportBiz = toNonNegativeInt(support && support.biz_support);
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
    var coTotalRaw = toNonNegativeInt(source.co_total);
    var coTotal = Math.max(0, coTotalRaw - supportBiz);

    var adjusted = Object.assign({}, source);
    adjusted.ded_advance_raw = rawAdvance;
    adjusted.ded_advance = adjustedAdvance;
    adjusted.ded_capital = rawCapital;
    adjusted.payroll_tax_adjustment_income = toNonNegativeInt(source.payroll_tax_adjustment_income);
    adjusted.payroll_tax_adjustment_local = toNonNegativeInt(source.payroll_tax_adjustment_local);
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

  function normalizeProfile(row) {
    var source = row && typeof row === 'object' ? row : {};
    return {
      id: source.id || null,
      coop_id: String(source.coop_id || '').trim(),
      emp_id: String(source.emp_id || '').trim(),
      is_enabled: source.is_enabled === true,
      confirmed_supported_months: Math.min(MAX_SUPPORT_MONTHS, toNonNegativeInt(source.confirmed_supported_months)),
      confirmed_through_month: normalizeMonth(source.confirmed_through_month || ''),
      verification_method: String(source.verification_method || '공단 조회').trim(),
      note: String(source.note || '').trim(),
      verified_at: source.verified_at || null,
      verified_by_emp_id: source.verified_by_emp_id || null,
      created_at: source.created_at || null,
      updated_at: source.updated_at || null
    };
  }

  async function fetchEligibilityProfiles(supabase, empIds) {
    if (!supabase) throw new Error('supabase client is required');
    var coopId = getCurrentCoopId();
    var query = supabase
      .from(PROFILE_TABLE)
      .select('id,coop_id,emp_id,is_enabled,confirmed_supported_months,confirmed_through_month,verification_method,note,verified_at,verified_by_emp_id,created_at,updated_at')
      .eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000');
    var ids = (Array.isArray(empIds) ? empIds : [])
      .map(function (value) { return String(value || '').trim(); })
      .filter(Boolean);
    if (ids.length > 0) query = query.in('emp_id', ids);
    var response = await query.order('emp_id', { ascending: true });
    if (response.error) throw response.error;
    return (Array.isArray(response.data) ? response.data : []).map(normalizeProfile);
  }

  async function getEligibilityProfile(supabase, empId) {
    var eid = String(empId || '').trim();
    if (!eid) return null;
    var profiles = await fetchEligibilityProfiles(supabase, [eid]);
    return profiles[0] || null;
  }

  async function saveEligibilityProfile(supabase, payload) {
    if (!supabase) throw new Error('supabase client is required');
    var input = payload && typeof payload === 'object' ? payload : {};
    var coopId = String(input.coop_id || getCurrentCoopId()).trim();
    var empId = String(input.emp_id || '').trim();
    var isEnabled = input.is_enabled === true;
    var confirmedMonths = Math.min(MAX_SUPPORT_MONTHS, toNonNegativeInt(input.confirmed_supported_months));
    var confirmedThroughMonth = normalizeMonth(input.confirmed_through_month || '');
    if (!coopId) throw new Error('조합 정보를 확인할 수 없습니다.');
    if (!empId) throw new Error('직원 정보를 확인할 수 없습니다.');
    if (isEnabled && !confirmedThroughMonth) throw new Error('지원 대상자는 확인 기준월을 입력해야 합니다.');

    var row = {
      coop_id: coopId,
      emp_id: empId,
      is_enabled: isEnabled,
      confirmed_supported_months: confirmedMonths,
      confirmed_through_month: confirmedThroughMonth || null,
      verification_method: String(input.verification_method || '공단 조회').trim() || '공단 조회',
      note: String(input.note || '').trim() || null,
      verified_at: new Date().toISOString(),
      verified_by_emp_id: String(input.verified_by_emp_id || '').trim() || null,
      updated_at: new Date().toISOString()
    };
    var response = await supabase
      .from(PROFILE_TABLE)
      .upsert(row, { onConflict: 'coop_id,emp_id' })
      .select('id,coop_id,emp_id,is_enabled,confirmed_supported_months,confirmed_through_month,verification_method,note,verified_at,verified_by_emp_id,created_at,updated_at')
      .single();
    if (response.error) throw response.error;
    return normalizeProfile(response.data);
  }

  function buildSupportHistoryByEmployee(rows) {
    var map = new Map();
    pickLatestByEntity(rows).forEach(function (row) {
      var parsed = parseSupportDetail(row.detail, row.entity_id);
      if (!parsed || !parsed.source_month) return;
      var eid = parsed.emp_id;
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid).push(Object.assign({}, parsed, {
        created_at: row.created_at || null,
        audit_id: row.id || null
      }));
    });
    return map;
  }

  function summarizeEligibilityProfile(profile, historyRows, sourceMonth) {
    var normalized = normalizeProfile(profile);
    var targetMonth = normalizeMonth(sourceMonth || '');
    var baselineMonth = normalized.confirmed_through_month;
    var confirmedMonths = normalized.confirmed_supported_months;
    var rows = Array.isArray(historyRows) ? historyRows : [];
    var afterBaseline = new Set();
    var beforeTarget = new Set();
    var hasCurrentSupport = false;

    rows.forEach(function (row) {
      var month = normalizeMonth(row && row.source_month);
      var positive = toNonNegativeInt(row && row.emp_support) + toNonNegativeInt(row && row.biz_support) > 0;
      if (targetMonth && month === targetMonth && positive) hasCurrentSupport = true;
      if (!month || !positive || !baselineMonth || month <= baselineMonth) return;
      afterBaseline.add(month);
      if (!targetMonth || month < targetMonth) beforeTarget.add(month);
    });

    var usedTotal = Math.min(MAX_SUPPORT_MONTHS, confirmedMonths + afterBaseline.size);
    var usedBefore = Math.min(MAX_SUPPORT_MONTHS, confirmedMonths + beforeTarget.size);
    var remainingTotal = Math.max(0, MAX_SUPPORT_MONTHS - usedTotal);
    var remainingBefore = Math.max(0, MAX_SUPPORT_MONTHS - usedBefore);
    var enabled = normalized.is_enabled === true;
    var sourceWithinConfirmedPeriod = !!targetMonth && !!baselineMonth && targetMonth <= baselineMonth;
    var sourceAfterBaseline = !!targetMonth && !!baselineMonth && targetMonth > baselineMonth;
    var reason = '';
    if (!enabled) reason = '직원 관리에서 지원 대상을 켜지 않았습니다.';
    else if (!baselineMonth) reason = '확인 기준월이 없습니다.';
    else if (sourceAfterBaseline && remainingBefore <= 0 && !hasCurrentSupport) reason = '확인된 지원 기간이 36개월에 도달했습니다.';

    return Object.assign({}, normalized, {
      used_supported_months: usedTotal,
      used_before_source_month: usedBefore,
      remaining_supported_months: remainingTotal,
      remaining_before_source_month: remainingBefore,
      tracked_supported_months: afterBaseline.size,
      tracked_before_source_month: beforeTarget.size,
      has_current_support: hasCurrentSupport,
      eligible_for_source_month: enabled && !!baselineMonth && (
        !targetMonth
        || sourceWithinConfirmedPeriod
        || hasCurrentSupport
        || (sourceAfterBaseline && remainingBefore > 0)
      ),
      ineligible_reason: reason
    });
  }

  async function getEligibilityState(supabase, empId, sourceMonth) {
    var eid = String(empId || '').trim();
    if (!eid) return null;
    var results = await Promise.all([
      getEligibilityProfile(supabase, eid),
      fetchSupportHistoryRows(supabase)
    ]);
    var profile = results[0];
    if (!profile) return null;
    var historyMap = buildSupportHistoryByEmployee(results[1]);
    return summarizeEligibilityProfile(profile, historyMap.get(eid) || [], sourceMonth);
  }

  async function loadEligibilityStates(supabase, sourceMonth) {
    var results = await Promise.all([
      fetchEligibilityProfiles(supabase),
      fetchSupportHistoryRows(supabase)
    ]);
    var historyMap = buildSupportHistoryByEmployee(results[1]);
    return results[0].map(function (profile) {
      return summarizeEligibilityProfile(profile, historyMap.get(profile.emp_id) || [], sourceMonth);
    });
  }

  async function loadEligiblePayrollRows(supabase, sourceMonth) {
    var sourceYm = normalizeMonth(sourceMonth);
    if (!sourceYm) throw new Error('지원 귀속월 형식이 올바르지 않습니다. (YYYY-MM)');
    var applyYm = sourceYm;
    var coopId = getCurrentCoopId();
    var states = await loadEligibilityStates(supabase, sourceYm);
    var stateByEmpId = new Map(states.map(function (state) { return [state.emp_id, state]; }));
    var ids = states.map(function (state) { return state.emp_id; }).filter(Boolean);
    if (ids.length === 0) {
      return { source_month: sourceYm, apply_month: applyYm, rows: [], excluded: [], profiles: [] };
    }

    var results = await Promise.all([
      supabase
        .from('ref_employees')
        .select('emp_id,emp_name,resign_date')
        .eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000')
        .in('emp_id', ids)
        .order('emp_id', { ascending: true }),
      supabase
        .from('hr_salary')
        .select('emp_id,ded_pension,ded_employ,co_total')
        .eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000')
        .eq('year_month', sourceYm)
        .in('emp_id', ids),
      getSupportMap(supabase, applyYm)
    ]);
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    var salaryByEmpId = new Map((results[1].data || []).map(function (row) {
      return [String(row.emp_id || '').trim(), row];
    }));
    var supportMap = results[2] || {};
    var excluded = [];
    var rows = [];

    (results[0].data || []).forEach(function (employee) {
      var empId = String(employee.emp_id || '').trim();
      var state = stateByEmpId.get(empId);
      var salary = salaryByEmpId.get(empId) || {};
      var currentSupport = supportMap[empId] || null;
      var hasCurrent = toNonNegativeInt(currentSupport && currentSupport.emp_support) + toNonNegativeInt(currentSupport && currentSupport.biz_support) > 0;
      var item = {
        emp_id: empId,
        emp_name: String(employee.emp_name || '').trim(),
        resign_date: employee.resign_date || null,
        emp_support: toNonNegativeInt(currentSupport && currentSupport.emp_support),
        biz_support: toNonNegativeInt(currentSupport && currentSupport.biz_support),
        memo: String(currentSupport && currentSupport.memo || '').trim(),
        ded_pension: toNonNegativeInt(salary.ded_pension),
        ded_employ: toNonNegativeInt(salary.ded_employ),
        co_total: toNonNegativeInt(salary.co_total),
        eligibility: state
      };
      if (state && (state.eligible_for_source_month || hasCurrent)) rows.push(item);
      else excluded.push(Object.assign({}, item, { reason: state && state.ineligible_reason || '지원 대상 설정이 없습니다.' }));
    });
    return { source_month: sourceYm, apply_month: applyYm, rows: rows, excluded: excluded, profiles: states };
  }

  function allocateAmount(totalAmount, items, weightSelector) {
    var amount = toNonNegativeInt(totalAmount);
    var safeItems = Array.isArray(items) ? items : [];
    var allocations = safeItems.map(function () { return 0; });
    if (!(amount > 0)) return allocations;
    var weighted = safeItems.map(function (item, index) {
      return { index: index, weight: Math.max(0, Number(weightSelector(item) || 0)) };
    }).filter(function (item) { return item.weight > 0; });
    var totalWeight = weighted.reduce(function (sum, item) { return sum + item.weight; }, 0);
    if (!(totalWeight > 0)) return null;
    var assigned = 0;
    var shares = weighted.map(function (item) {
      var exact = amount * item.weight / totalWeight;
      var floor = Math.floor(exact);
      assigned += floor;
      return { index: item.index, floor: floor, remainder: exact - floor };
    });
    shares.sort(function (a, b) {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.index - b.index;
    });
    var remainder = amount - assigned;
    shares.forEach(function (share) {
      var addOne = remainder > 0 ? 1 : 0;
      allocations[share.index] = share.floor + addOne;
      remainder -= addOne;
    });
    return allocations;
  }

  function splitSharedSupport(totalAmount) {
    var total = toNonNegativeInt(totalAmount);
    var emp = Math.floor(total / 2);
    return { emp: emp, biz: total - emp };
  }

  function calculateInvoiceAllocations(items, support) {
    var rows = Array.isArray(items) ? items : [];
    var input = support && typeof support === 'object' ? support : {};
    var pensionTotal = toNonNegativeInt(input.pension);
    var unemploymentTotal = toNonNegativeInt(input.unemployment);
    var stabilityTotal = toNonNegativeInt(input.stability);
    var pensionSplit = splitSharedSupport(pensionTotal);
    var unemploymentSplit = splitSharedSupport(unemploymentTotal);
    var empPension = allocateAmount(pensionSplit.emp, rows, function (row) { return row.ded_pension; });
    var bizPension = allocateAmount(pensionSplit.biz, rows, function (row) { return row.ded_pension; });
    var empUnemployment = allocateAmount(unemploymentSplit.emp, rows, function (row) { return row.ded_employ; });
    var bizUnemployment = allocateAmount(unemploymentSplit.biz, rows, function (row) { return row.ded_employ; });
    var bizStability = allocateAmount(stabilityTotal, rows, function (row) { return row.ded_employ; });
    if (pensionTotal > 0 && (!empPension || !bizPension)) {
      return { error: new Error('지원 대상자의 국민연금 급여 공제 기준액이 없어 국민연금 지원금을 배분할 수 없습니다.'), rows: [] };
    }
    if ((unemploymentTotal + stabilityTotal) > 0 && (!empUnemployment || !bizUnemployment || !bizStability)) {
      return { error: new Error('지원 대상자의 고용보험 급여 공제 기준액이 없어 고용보험 지원금을 배분할 수 없습니다.'), rows: [] };
    }
    var allocatedRows = rows.map(function (row, index) {
      return Object.assign({}, row, {
        emp_support: toNonNegativeInt((empPension && empPension[index]) || 0) + toNonNegativeInt((empUnemployment && empUnemployment[index]) || 0),
        biz_support: toNonNegativeInt((bizPension && bizPension[index]) || 0) + toNonNegativeInt((bizUnemployment && bizUnemployment[index]) || 0) + toNonNegativeInt((bizStability && bizStability[index]) || 0)
      });
    });
    return {
      error: null,
      rows: allocatedRows,
      employee_total: allocatedRows.reduce(function (sum, row) { return sum + row.emp_support; }, 0),
      business_total: allocatedRows.reduce(function (sum, row) { return sum + row.biz_support; }, 0),
      entered_total: pensionTotal + unemploymentTotal + stabilityTotal
    };
  }

  async function buildApprovalSupportPlan(supabase, payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    var sourceMonth = normalizeMonth(input.source_month);
    var support = input.support && typeof input.support === 'object' ? input.support : {};
    var enteredTotal = toNonNegativeInt(support.pension) + toNonNegativeInt(support.unemployment) + toNonNegativeInt(support.stability);
    if (!(enteredTotal > 0)) {
      return { source_month: sourceMonth, apply_month: sourceMonth, rows: [], entered_total: 0, employee_total: 0, business_total: 0, error: null };
    }
    var eligible = await loadEligiblePayrollRows(supabase, sourceMonth);
    if (eligible.rows.length === 0) {
      return { error: new Error(sourceMonth + ' 지원 대상 직원이 없습니다. 직원 관리에서 대상 여부·확인 누계·기준월을 먼저 확인하세요.'), rows: [] };
    }
    var allocation = calculateInvoiceAllocations(eligible.rows, support);
    if (allocation.error) return allocation;
    var changedEmployeeIds = allocation.rows.filter(function (row, index) {
      var current = eligible.rows[index] || {};
      return toNonNegativeInt(row.emp_support) !== toNonNegativeInt(current.emp_support)
        || toNonNegativeInt(row.biz_support) !== toNonNegativeInt(current.biz_support);
    }).map(function (row) { return row.emp_id; }).filter(Boolean);
    if (changedEmployeeIds.length > 0) {
      var accountedResponse = await supabase
        .from('hr_salary')
        .select('emp_id,is_accounted')
        .eq('coop_id', String(getCurrentCoopId() || '').trim() || '00000000-0000-0000-0000-000000000000')
        .eq('year_month', eligible.apply_month)
        .in('emp_id', changedEmployeeIds)
        .eq('is_accounted', true)
        .limit(1);
      if (accountedResponse.error) throw accountedResponse.error;
      if (Array.isArray(accountedResponse.data) && accountedResponse.data.length > 0) {
        return { error: new Error(eligible.apply_month + ' 급여가 이미 회계 반영되어 두루누리 지원금을 자동 변경할 수 없습니다. 급여 정정 절차를 먼저 진행하세요.'), rows: [] };
      }
    }
    var approvalId = input.approval_id == null ? '' : String(input.approval_id);
    allocation.rows = allocation.rows.filter(function (row, index) {
      var current = eligible.rows[index] || {};
      return toNonNegativeInt(row.emp_support) + toNonNegativeInt(row.biz_support) > 0
        || toNonNegativeInt(current.emp_support) + toNonNegativeInt(current.biz_support) > 0;
    }).map(function (row) {
      return Object.assign({}, row, {
        memo: approvalId ? '전자결재 #' + approvalId + ' 승인 후 자동 배분' : '4대보험 승인 후 자동 배분',
        origin: 'approval_auto_sync',
        source_approval_id: approvalId || null,
        application_rule: 'same_month',
        allocation_version: 2
      });
    });
    allocation.source_month = sourceMonth;
    allocation.apply_month = eligible.apply_month;
    allocation.excluded = eligible.excluded;
    return allocation;
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
      var empSupport = toNonNegativeInt(row && row.emp_support);
      var bizSupport = toNonNegativeInt(row && row.biz_support);
      var entityId = makeEntityId(applyMonth, empId);
      if (!entityId) return;
      var prev = currentMap[empId] || null;
      var prevEmp = toNonNegativeInt(prev && prev.emp_support);
      var prevBiz = toNonNegativeInt(prev && prev.biz_support);
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
          memo: String(row && row.memo || '').trim(),
          origin: String(row && row.origin || input.origin || 'manual').trim(),
          source_approval_id: row && row.source_approval_id != null
            ? String(row.source_approval_id)
            : (input.source_approval_id != null ? String(input.source_approval_id) : null),
          application_rule: String(row && row.application_rule || input.application_rule || (sourceMonth === applyMonth ? 'same_month' : 'next_month_legacy')).trim(),
          allocation_version: toNonNegativeInt(row && row.allocation_version || input.allocation_version || (sourceMonth === applyMonth ? 2 : 1))
        }
      });
    });

    if (inserts.length === 0) {
      return { changed: 0, inserted: 0, ids: [] };
    }

    var response = await supabase.from('erp_audit_logs').insert(inserts).select('id');
    if (response.error) throw response.error;
    return {
      changed: inserts.length,
      inserted: inserts.length,
      ids: (response.data || []).map(function (row) { return row.id; }).filter(function (id) { return id != null; })
    };
  }

  async function removeSupportAuditRows(supabase, ids) {
    var safeIds = (Array.isArray(ids) ? ids : []).filter(function (id) { return id != null; });
    if (safeIds.length === 0) return { removed: 0 };
    var response = await supabase.from('erp_audit_logs').delete().in('id', safeIds);
    if (response.error) throw response.error;
    return { removed: safeIds.length };
  }

  function normalizeApprovalExpenseSnapshot(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        var parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {}
    }
    return {};
  }

  function getApprovalInsuranceSupport(approval) {
    var snapshot = normalizeApprovalExpenseSnapshot(approval && approval.expense_snapshot);
    var insurance = snapshot.insurance && typeof snapshot.insurance === 'object' ? snapshot.insurance : {};
    var support = insurance.durunuri_support && typeof insurance.durunuri_support === 'object'
      ? insurance.durunuri_support
      : {};
    return {
      billing_month: normalizeMonth(insurance.billing_month || ''),
      pension: toNonNegativeInt(support.pension),
      unemployment: toNonNegativeInt(support.employment),
      stability: toNonNegativeInt(support.stability)
    };
  }

  async function fetchCompletedInsuranceApproval(supabase, billingMonth) {
    if (!supabase) throw new Error('supabase client is required');
    var ym = normalizeMonth(billingMonth);
    if (!ym) throw new Error('4대보험 귀속월 형식이 올바르지 않습니다. (YYYY-MM)');
    var coopId = getCurrentCoopId();
    var response = await supabase
      .from('ref_approval')
      .select('id,doc_no,doc_type,title,status,created_at,processed_at,drafter_id,drafter_name,expense_snapshot')
      .eq('coop_id', String(coopId || '').trim() || '00000000-0000-0000-0000-000000000000')
      .in('status', ['완료', '실물결재완료'])
      .in('doc_type', ['지출결의(4대보험)', '지출결의'])
      .filter('expense_snapshot->>expense_sub_type', 'eq', '4대보험')
      .filter('expense_snapshot->insurance->>billing_month', 'eq', ym)
      .order('processed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(2);
    if (response.error) throw response.error;
    var matches = (Array.isArray(response.data) ? response.data : []).filter(function (approval) {
      var snapshot = normalizeApprovalExpenseSnapshot(approval && approval.expense_snapshot);
      var support = getApprovalInsuranceSupport(approval);
      return String(snapshot.expense_sub_type || '').trim() === '4대보험'
        && support.billing_month === ym
        && (support.pension + support.unemployment + support.stability) > 0;
    });
    if (matches.length > 1) {
      throw new Error(ym + ' 귀속 두루누리 지원금이 있는 완료 4대보험 결재가 둘 이상입니다. 중복 결재 여부를 먼저 확인하세요.');
    }
    return matches[0] || null;
  }

  async function syncApprovedSupportForMonth(supabase, billingMonth, actor) {
    var ym = normalizeMonth(billingMonth);
    if (!ym) throw new Error('급여 귀속월 형식이 올바르지 않습니다. (YYYY-MM)');
    var approval = await fetchCompletedInsuranceApproval(supabase, ym);
    if (!approval) {
      return { approval_id: null, source_month: ym, apply_month: ym, changed: 0, inserted: 0, ids: [], rows: [] };
    }
    var support = getApprovalInsuranceSupport(approval);
    var plan = await buildApprovalSupportPlan(supabase, {
      source_month: ym,
      approval_id: approval.id,
      support: support
    });
    if (plan && plan.error) throw plan.error;
    var safeActor = actor && typeof actor === 'object' ? actor : {};
    var saved = await saveSupportBatch(supabase, {
      coop_id: String(safeActor.coop_id || getCurrentCoopId()).trim(),
      source_month: ym,
      apply_month: ym,
      actor_emp_id: String(safeActor.emp_id || '').trim(),
      actor_name: String(safeActor.emp_name || '').trim(),
      origin: 'approved_insurance_same_month_sync',
      source_approval_id: approval.id,
      application_rule: 'same_month',
      allocation_version: 2,
      rows: (Array.isArray(plan && plan.rows) ? plan.rows : []).map(function (row) {
        return Object.assign({}, row, {
          origin: 'approved_insurance_same_month_sync',
          application_rule: 'same_month',
          allocation_version: 2
        });
      })
    });
    return Object.assign({}, saved, {
      approval_id: approval.id,
      source_month: ym,
      apply_month: ym,
      employee_total: toNonNegativeInt(plan && plan.employee_total),
      business_total: toNonNegativeInt(plan && plan.business_total),
      rows: Array.isArray(plan && plan.rows) ? plan.rows : []
    });
  }

  global.PayrollDurunuriModule = {
    ACTION_KEY: ACTION_KEY,
    PROFILE_TABLE: PROFILE_TABLE,
    MAX_SUPPORT_MONTHS: MAX_SUPPORT_MONTHS,
    normalizeMonth: normalizeMonth,
    nextMonth: nextMonth,
    makeEntityId: makeEntityId,
    parseSupportDetail: parseSupportDetail,
    fetchSupportRows: fetchSupportRows,
    fetchSupportHistoryRows: fetchSupportHistoryRows,
    buildSupportMap: buildSupportMap,
    getSupportMap: getSupportMap,
    getSupportForEmployee: getSupportForEmployee,
    adjustSalaryRow: adjustSalaryRow,
    adjustSalaryRows: adjustSalaryRows,
    loadAndAdjustSalaryRows: loadAndAdjustSalaryRows,
    fetchEligibilityProfiles: fetchEligibilityProfiles,
    getEligibilityProfile: getEligibilityProfile,
    saveEligibilityProfile: saveEligibilityProfile,
    buildSupportHistoryByEmployee: buildSupportHistoryByEmployee,
    summarizeEligibilityProfile: summarizeEligibilityProfile,
    getEligibilityState: getEligibilityState,
    loadEligibilityStates: loadEligibilityStates,
    loadEligiblePayrollRows: loadEligiblePayrollRows,
    allocateAmount: allocateAmount,
    splitSharedSupport: splitSharedSupport,
    calculateInvoiceAllocations: calculateInvoiceAllocations,
    buildApprovalSupportPlan: buildApprovalSupportPlan,
    saveSupportBatch: saveSupportBatch,
    removeSupportAuditRows: removeSupportAuditRows,
    getApprovalInsuranceSupport: getApprovalInsuranceSupport,
    fetchCompletedInsuranceApproval: fetchCompletedInsuranceApproval,
    syncApprovedSupportForMonth: syncApprovedSupportForMonth
  };
})(window);
