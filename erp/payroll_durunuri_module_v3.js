(function (global) {
  'use strict';

  var ACTION_KEY = 'payroll.durunuri.support';
  var ENTITY_PREFIX = 'DURUNURI';
  var PROFILE_TABLE = 'erp_durunuri_employee_profiles';
  var MAX_SUPPORT_MONTHS = 36;
  var FAIR_ALLOCATION_VERSION = 3;
  var REVIEW_ROUNDING = '같은 공제 기준의 직원에게 같은 금액을 주면서 보험별 합계를 맞추지 못했습니다. 배분하지 않았으니 고지서의 직원별 지원금 내역을 확인하세요.';

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

  async function fetchSupportRows(supabase, applyMonth, options) {
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
    query = query.order('created_at', { ascending: false });
    if (options?.signal && typeof query.abortSignal === 'function') query = query.abortSignal(options.signal);
    var response = await query;

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

  async function getSupportMap(supabase, applyMonth, options) {
    var rows = await fetchSupportRows(supabase, applyMonth, options);
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

  async function loadEligiblePayrollRows(supabase, sourceMonth, existingSupport) {
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
      existingSupport || getSupportMap(supabase, applyYm)
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
    return { source_month: sourceYm, apply_month: applyYm, rows: rows, excluded: excluded, profiles: states,
      has_protected_allocation: Object.values(supportMap).some(function (entry) {
        return entry.allocation_version === FAIR_ALLOCATION_VERSION;
      }) };
  }

  // Rows with the same weights form one group. Each component keeps its
  // bill total and its per-person floor/ceil bounds. Only the final per-side
  // amount is stored: component round-ups can go to different members of the
  // same group, so they do not stack on one person.
  function allocateEqualAmounts(items, components) {
    var rows = Array.isArray(items) ? items : [];
    var pots = components.filter(function (pot) { return pot.amount > 0; });
    if (!pots.length) return rows.map(function () { return 0; });
    var total = pots.reduce(function (sum, pot) { return sum + pot.amount; }, 0);
    if (!Number.isSafeInteger(total)) throw new Error('지원금 합계의 원 단위를 확인하세요.');
    var byWeights = new Map();
    rows.forEach(function (row, index) {
      var weights = pots.map(function (pot) { return toNonNegativeInt(pot.weight(row)); });
      if (weights.some(function (w) { return !Number.isSafeInteger(w); })) throw new Error('급여대장의 공제 기준액을 확인하세요.');
      var key = weights.join(':');
      if (!byWeights.has(key)) byWeights.set(key, { weights: weights, indexes: [] });
      byWeights.get(key).indexes.push(index);
    });
    // A weight-only order is deterministic even if staff are reordered or renamed.
    var groups = Array.from(byWeights.keys()).sort().map(function (key) {
      var group = byWeights.get(key);
      return Object.assign(group, { size: group.indexes.length, base: 0, cap: [], preferred: [] });
    });
    var remainders = pots.map(function (pot, column) {
      var totalWeight = groups.reduce(function (sum, group) {
        return sum + BigInt(group.weights[column]) * BigInt(group.size);
      }, 0n);
      if (!totalWeight) throw new Error(pot.noBasis);
      if (pot.cappedAtBasis && BigInt(pot.amount) > totalWeight) throw new Error(pot.overBasis);
      var remaining = pot.amount;
      var ranked = groups.map(function (group, index) {
        var scaled = BigInt(pot.amount) * BigInt(group.weights[column]);
        var floor = Number(scaled / totalWeight), fraction = scaled % totalWeight;
        remaining -= floor * group.size;
        group.base += floor;
        group.cap[column] = fraction > 0n ? group.size : 0;
        return { group: group, fraction: fraction, index: index };
      }).sort(function (a, b) {
        return a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1;
      });
      var left = remaining;
      ranked.forEach(function (item) {
        var extras = Math.min(left, item.group.cap[column]);
        item.group.preferred[column] = extras;
        left -= extras;
      });
      return remaining;
    });
    var sum = function (ns) { return ns.reduce(function (total, n) { return total + n; }, 0); };
    if (groups.some(function (group) { return sum(group.preferred) % group.size !== 0; })) {
      var choices = findBalancedRoundUps(groups, remainders);
      if (!choices) throw new Error(REVIEW_ROUNDING);
      groups.forEach(function (group, i) { group.preferred = choices[i]; });
    }
    var result = rows.map(function () { return 0; });
    groups.forEach(function (group) {
      var each = group.base + sum(group.preferred) / group.size;
      group.indexes.forEach(function (index) { result[index] = each; });
    });
    return result;
  }

  // Most allocations take the direct largest-remainder path above. If a
  // group's final amount would differ, try other floor/ceil round-ups while
  // keeping every component total. A bounded search fails closed, not by
  // dropping a won or assigning it according to input order.
  function findBalancedRoundUps(groups, remainders) {
    if (groups.length > 300) return null;
    var suffix = [remainders.map(function () { return 0; })];
    for (var i = groups.length - 1; i >= 0; i--) {
      suffix.unshift(groups[i].cap.map(function (n, column) { return n + suffix[0][column]; }));
    }
    var failed = new Set(), choices = [], budget = 100000;
    function visit(index, left) {
      if (--budget < 0) return false;
      if (index === groups.length) return left.every(function (n) { return n === 0; });
      var key = index + ':' + left.join(':');
      if (failed.has(key)) return false;
      var group = groups[index], selected = [];
      function addColumn(column, count) {
        var low = Math.max(0, left[column] - suffix[index + 1][column]);
        var high = Math.min(left[column], group.cap[column]);
        if (high < low || budget <= 0) return false;
        // The last component makes the total extras divisible by group size.
        var last = column === left.length - 1;
        var stride = last ? group.size : 1;
        if (last) low += (stride - (count + low) % stride) % stride;
        if (high < low) return false;
        var maxOffset = Math.floor((high - low) / stride);
        var start = Math.min(maxOffset, Math.max(0, Math.round((group.preferred[column] - low) / stride)));
        function take(offset) {
          if (--budget < 0) return false;
          var n = low + offset * stride;
          selected[column] = n;
          return last ? visit(index + 1, left.map(function (available, j) { return available - selected[j]; }))
            : addColumn(column + 1, count + n);
        }
        for (var delta = 0; delta <= Math.max(start, maxOffset - start) && budget > 0; delta++) {
          if ((start + delta <= maxOffset && take(start + delta)) || (delta && start >= delta && take(start - delta))) return true;
        }
        return false;
      }
      if (!addColumn(0, 0)) { failed.add(key); return false; }
      choices[index] = selected.slice();
      return true;
    }
    return visit(0, remainders) ? choices : null;
  }

  function allocateAmount(totalAmount, items, weightSelector) {
    return allocateEqualAmounts(items, [{
      amount: toNonNegativeInt(totalAmount), weight: weightSelector,
      noBasis: '지원 귀속월 급여대장에 국민연금/고용보험 공제액이 없어 자동 배분할 수 없습니다.'
    }]);
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
    function component(amount, key, label, cappedAtBasis) {
      return { amount: amount, weight: function (row) { return row[key]; }, cappedAtBasis: cappedAtBasis,
        noBasis: '지원 대상자의 ' + label + ' 급여 공제 기준액이 없어 지원금을 배분할 수 없습니다.',
        overBasis: '근로자 ' + label + ' 지원금이 급여 공제 합계를 초과합니다. 고지서와 급여대장을 확인하세요.' };
    }
    var emp, biz;
    try {
      if (!Number.isSafeInteger(pensionTotal + unemploymentTotal + stabilityTotal)) throw new Error('고지서 지원금 합계의 원 단위를 확인하세요.');
      emp = allocateEqualAmounts(rows, [
        component(pensionSplit.emp, 'ded_pension', '국민연금', true),
        component(unemploymentSplit.emp, 'ded_employ', '고용보험', true)
      ]);
      biz = allocateEqualAmounts(rows, [
        component(pensionSplit.biz, 'ded_pension', '국민연금'),
        component(unemploymentSplit.biz, 'ded_employ', '고용보험'),
        component(stabilityTotal, 'ded_employ', '고용보험')
      ]);
    } catch (error) { return { error: error, rows: [] }; }
    var allocatedRows = rows.map(function (row, index) {
      return Object.assign({}, row, {
        emp_support: emp[index],
        biz_support: biz[index]
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

  function checkSavedApprovalAllocation(currentMap, approvalId, employeeTotal, businessTotal) {
    var saved = Object.values(currentMap);
    if (!saved.length) return false;
    var sameApproval = approvalId && saved.every(function (row) {
      // Even a saved zero may be a deliberate manual correction. Do not
      // infer or replace records that do not belong to this approval.
      return row.source_approval_id === approvalId;
    });
    var currentEmployee = saved.reduce(function (sum, row) { return sum + row.emp_support; }, 0);
    var currentBusiness = saved.reduce(function (sum, row) { return sum + row.biz_support; }, 0);
    if (sameApproval && currentEmployee === employeeTotal && currentBusiness === businessTotal) return true;
    throw new Error('이 귀속월에 저장된 지원금이 있습니다. 기존 내역은 변경하지 않았습니다. 고지서와 저장 내역을 확인하세요.');
  }

  async function buildApprovalSupportPlan(supabase, payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    var sourceMonth = normalizeMonth(input.source_month);
    var support = input.support && typeof input.support === 'object' ? input.support : {};
    var enteredTotal = toNonNegativeInt(support.pension) + toNonNegativeInt(support.unemployment) + toNonNegativeInt(support.stability);
    if (!(enteredTotal > 0)) {
      return { source_month: sourceMonth, apply_month: sourceMonth, rows: [], entered_total: 0, employee_total: 0, business_total: 0, error: null };
    }
    var approvalId = input.approval_id == null ? '' : String(input.approval_id);
    var coopId = getCurrentCoopId();
    var currentMap = await getSupportMap(supabase, sourceMonth);
    if (getCurrentCoopId() !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
    var employeeTotal = splitSharedSupport(support.pension).emp + splitSharedSupport(support.unemployment).emp;
    var businessTotal = enteredTotal - employeeTotal;
    try {
      if (checkSavedApprovalAllocation(currentMap, approvalId, employeeTotal, businessTotal)) {
        return { source_month: sourceMonth, apply_month: sourceMonth, rows: [], entered_total: enteredTotal,
          employee_total: employeeTotal, business_total: businessTotal, error: null };
      }
    } catch (error) { return { error: error, rows: [] }; }
    var eligible = await loadEligiblePayrollRows(supabase, sourceMonth, currentMap);
    if (getCurrentCoopId() !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
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
        .eq('coop_id', coopId || '00000000-0000-0000-0000-000000000000')
        .eq('year_month', eligible.apply_month)
        .in('emp_id', changedEmployeeIds)
        .eq('is_accounted', true)
        .limit(1);
      if (accountedResponse.error) throw accountedResponse.error;
      if (getCurrentCoopId() !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
      if (Array.isArray(accountedResponse.data) && accountedResponse.data.length > 0) {
        return { error: new Error(eligible.apply_month + ' 급여가 이미 회계 반영되어 두루누리 지원금을 자동 변경할 수 없습니다. 급여 정정 절차를 먼저 진행하세요.'), rows: [] };
      }
    }
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
        allocation_version: FAIR_ALLOCATION_VERSION
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

    var currentCoopId = getCurrentCoopId();
    var currentMap = await getSupportMap(supabase, applyMonth);
    if (rows.some(function (row) { return row && row.allocation_version === FAIR_ALLOCATION_VERSION; })) {
      if (!coopId || coopId !== currentCoopId || getCurrentCoopId() !== currentCoopId) {
        throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
      }
      // Do not overwrite a month saved after the preview. Reuse the existing
      // read so this is not an additional monthly lookup.
      if (checkSavedApprovalAllocation(currentMap, String(input.source_approval_id || ''),
        rows.reduce(function (sum, row) { return sum + row.emp_support; }, 0),
        rows.reduce(function (sum, row) { return sum + row.biz_support; }, 0))) return { changed: 0, inserted: 0, ids: [] };
    }
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
          source_approval_id: input.origin === 'manual_exception' && input.allocation_version === FAIR_ALLOCATION_VERSION
            ? (prev && prev.source_approval_id || null)
            : row && row.source_approval_id != null
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
    var coopId = getCurrentCoopId();
    var safeActor = actor && typeof actor === 'object' ? actor : {};
    var actorCoopId = String(safeActor.coop_id || coopId).trim();
    if (!coopId || actorCoopId !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
    var approval = await fetchCompletedInsuranceApproval(supabase, ym);
    if (getCurrentCoopId() !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
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
    if (getCurrentCoopId() !== coopId) throw new Error('현재 조합과 귀속월을 다시 확인하세요.');
    var saved = await saveSupportBatch(supabase, {
      coop_id: actorCoopId,
      source_month: ym,
      apply_month: ym,
      actor_emp_id: String(safeActor.emp_id || '').trim(),
      actor_name: String(safeActor.emp_name || '').trim(),
      origin: 'approved_insurance_same_month_sync',
      source_approval_id: approval.id,
      application_rule: 'same_month',
      allocation_version: FAIR_ALLOCATION_VERSION,
      rows: (Array.isArray(plan && plan.rows) ? plan.rows : []).map(function (row) {
        return Object.assign({}, row, {
          origin: 'approved_insurance_same_month_sync',
          application_rule: 'same_month',
          allocation_version: FAIR_ALLOCATION_VERSION
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
    ALLOCATION_VERSION: FAIR_ALLOCATION_VERSION,
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
