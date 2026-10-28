/* v1.1.0 — Individual pledge limits are separate from import/minimum validation. */
(function (global) {
  'use strict';
  const requests = new WeakMap();
  function normalize(value) {
    if (!value || !Number.isSafeInteger(Number(value.minimum)) || Number(value.minimum) <= 0
      || !Number.isSafeInteger(Number(value.unit)) || Number(value.unit) <= 0) throw new Error('CAPITAL_SETTINGS_INVALID');
    let limit;
    if (value.limit !== undefined) {
      if (typeof value.limit?.enabled !== 'boolean' || (value.limit.enabled && !/^[0-9]+$/.test(String(value.limit.ceiling)))) throw new Error('CAPITAL_LIMIT_INVALID');
      limit = Object.freeze({ enabled: value.limit.enabled, ceiling: String(value.limit.ceiling || '0') });
    }
    return Object.freeze({ minimum: Number(value.minimum), unit: Number(value.unit), revision: String(value.revision || ''), ...(limit ? {limit} : {}) });
  }
  async function load(client, force = false) {
    if (!client?.rpc) throw new Error('CAPITAL_SETTINGS_UNAVAILABLE');
    if (force) requests.delete(client);
    if (!requests.has(client)) {
      const request = client.rpc('get_member_capital_rules').then(({ data, error }) => {
        if (requests.has(client) && requests.get(client) !== request) return requests.get(client);
        if (error) throw error;
        return normalize(data);
      }).catch(error => { if (requests.get(client) === request) requests.delete(client); throw error; });
      requests.set(client, request);
    }
    return requests.get(client);
  }
  function remember(client, value) {
    if (!client?.rpc) throw new Error('CAPITAL_SETTINGS_UNAVAILABLE');
    const rules = normalize(value);
    requests.set(client, Promise.resolve(rules));
    return rules;
  }
  const valid = (value, rules, initial = true) => Number.isSafeInteger(Number(value))
    && Number(value) >= (initial ? rules.minimum : rules.unit) && Number(value) % rules.unit === 0;
  const guidance = rules => `최소 ${rules.minimum.toLocaleString()}원 이상, ${rules.unit.toLocaleString()}원 단위로 입력해주세요.`;
  function maximum(rules, existing = 0) {
    if (!rules.limit?.enabled) return null;
    if (!Number.isSafeInteger(Number(existing)) || Number(existing) < 0) throw new Error('CAPITAL_BALANCE_INVALID');
    const remaining = BigInt(rules.limit.ceiling) - BigInt(existing), unit = BigInt(rules.unit);
    const max = remaining > 0n ? remaining / unit * unit : 0n;
    if (max > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CAPITAL_LIMIT_INVALID');
    return Number(max);
  }
  const withinLimit = (value, rules, existing = 0) => maximum(rules, existing) === null || Number(value) <= maximum(rules, existing);
  const limitGuidance = (rules, existing = 0, additional = false) => {
    const max = maximum(rules, existing);
    return max === null ? '' : `최대 ${additional ? '추가 ' : ''}약정 가능 금액: ${max.toLocaleString()}원`;
  };
  const limitWarning = (rules, existing = 0, additional = false) => `조합원 1인의 출자 금액은 총 출자 금액의 100분의 30(30%)을 넘을 수 없습니다.\n${limitGuidance(rules, existing, additional)}`;
  const errorMessage = error => error?.message === 'CAPITAL_SHARE_LIMIT_EXCEEDED'
    ? String(error.hint || '출자금 30% 한도를 초과했습니다. 출자 기준을 다시 확인해 주세요.') : '';
  function applyInput(input, rules, initial = true) {
    if (!input) return;
    input.min = String(initial ? Math.ceil(rules.minimum / rules.unit) * rules.unit : rules.unit);
    input.step = String(rules.unit);
    input.placeholder = initial ? `최소 ${rules.minimum.toLocaleString()}원` : `${rules.unit.toLocaleString()}원 단위`;
  }
  global.CoopMemberCapital = Object.freeze({ normalize, load, remember, valid, guidance, applyInput, maximum, withinLimit, limitGuidance, limitWarning, errorMessage });
})(window);
