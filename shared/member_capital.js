/* v1.0.0 — Host-scoped capital settings; never infer another cooperative's rules. */
(function (global) {
  'use strict';
  const requests = new WeakMap();
  function normalize(value) {
    if (!value || !Number.isSafeInteger(Number(value.minimum)) || Number(value.minimum) <= 0
      || !Number.isSafeInteger(Number(value.unit)) || Number(value.unit) <= 0) throw new Error('CAPITAL_SETTINGS_INVALID');
    return Object.freeze({ minimum: Number(value.minimum), unit: Number(value.unit), revision: String(value.revision || '') });
  }
  async function load(client, force = false) {
    if (!client?.rpc) throw new Error('CAPITAL_SETTINGS_UNAVAILABLE');
    if (force) requests.delete(client);
    if (!requests.has(client)) {
      const request = client.rpc('get_member_capital_rules').then(({ data, error }) => {
        if (error) throw error;
        return normalize(data);
      }).catch(error => { requests.delete(client); throw error; });
      requests.set(client, request);
    }
    return requests.get(client);
  }
  const valid = (value, rules, initial = true) => Number.isSafeInteger(Number(value))
    && Number(value) >= (initial ? rules.minimum : rules.unit) && Number(value) % rules.unit === 0;
  const guidance = rules => `최소 ${rules.minimum.toLocaleString()}원 이상, ${rules.unit.toLocaleString()}원 단위로 입력해주세요.`;
  function applyInput(input, rules, initial = true) {
    if (!input) return;
    input.min = String(initial ? Math.ceil(rules.minimum / rules.unit) * rules.unit : rules.unit);
    input.step = String(rules.unit);
    input.placeholder = initial ? `최소 ${rules.minimum.toLocaleString()}원` : `${rules.unit.toLocaleString()}원 단위`;
  }
  global.CoopMemberCapital = Object.freeze({ normalize, load, valid, guidance, applyInput });
})(window);
