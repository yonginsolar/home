(function (global) {
  'use strict';
  const labels = {
    linked: '기존 연결 유지', link: '기존 발전소에 연결', create: '새 발전소 등록',
    invalid_link: '연결된 발전소가 없거나 다른 조합입니다.',
    duplicate_monitor: '모니터 목록에 같은 발전소 이름이 있습니다.',
    duplicate_site: '같은 이름으로 등록된 발전소가 여러 곳입니다.',
    site_already_linked: '이미 다른 모니터에 연결된 발전소입니다.',
    invalid_source: '이름·용량·주소·표시순서를 확인해 주세요.'
  };
  const editable = new Set(['link', 'create']);
  const allowed = new Set(['linked', ...editable]);
  function create({ client, dialog, button, getContext, refresh, timeoutMs = 15000 }) {
    const status = dialog.querySelector('[data-import-status]');
    const list = dialog.querySelector('[data-import-rows]');
    const save = dialog.querySelector('[data-import-save]');
    const retry = dialog.querySelector('[data-import-retry]');
    const close = dialog.querySelector('[data-import-close]');
    const requests = new Map();
    let ticket = 0, opened = null, plan = null, reading = false;
    const sync = () => { button.hidden = !getContext()?.visible; button.disabled = !getContext()?.ready; };
    const same = op => Boolean(op && dialog.open && opened === op && op.ticket === ticket && getContext()?.key === op.key && getContext()?.ready);
    const params = op => ({ p_dashboard_id: op.dashboard, p_coop_id: op.coop });
    const say = value => { status.textContent = value; };
    function invalidate() {
      ticket++; opened = null; plan = null; reading = false;
      if (dialog.open) dialog.close();
      sync();
    }
    function timed(promise) {
      let limit;
      return Promise.race([promise, new Promise(resolve => { limit = setTimeout(() => resolve(null), timeoutMs); })])
        .finally(() => clearTimeout(limit));
    }
    function currentWrite(op) { return requests.get(op.key); }
    function showRows(rows) {
      const doc = dialog.ownerDocument;
      list.replaceChildren();
      for (const row of rows) {
        const li = doc.createElement('li');
        li.className = 'border rounded-3 px-3 py-2';
        const name = doc.createElement('strong');
        name.textContent = row.name || '이름 없음';
        const detail = doc.createElement('div');
        const progress = row.progress == null ? '공정률 미입력' : `공정률 ${row.progress}%`;
        detail.textContent = [labels[row.action] || '확인 필요', row.status, progress].filter(Boolean).join(' · ');
        li.append(name, detail); list.append(li);
      }
    }
    async function preview() {
      const op = opened;
      if (!same(op) || reading) return;
      reading = true; plan = null; save.disabled = true; retry.hidden = true;
      say('가져올 발전소를 확인하고 있습니다.');
      try {
        const r = await timed(Promise.resolve().then(() => same(op) ? client.rpc('platform_preview_power_monitor_plant_import', params(op)) : null));
        if (!same(op)) return;
        if (!r || r.error || !Array.isArray(r.data?.rows) || typeof r.data?.revision !== 'string') throw new Error();
        plan = r.data; showRows(plan.rows);
        const hasConflict = plan.rows.some(row => !allowed.has(row.action));
        const changes = plan.rows.filter(row => editable.has(row.action)).length;
        const processing = currentWrite(op);
        if (processing && !hasConflict && !changes) requests.delete(op.key);
        save.disabled = hasConflict || !changes || !!processing;
        retry.hidden = !hasConflict && !(processing && changes);
        say(!plan.rows.length ? '가져올 발전소가 없습니다.' : hasConflict
          ? '확인이 필요한 항목을 정리한 뒤 다시 확인해 주세요. 아직 저장한 내용은 없습니다.'
          : processing && changes ? '이전 저장 결과를 확인하고 있습니다. 같은 저장 요청을 다시 보내지 않습니다.'
          : changes ? `${changes}곳을 연결하거나 새로 등록합니다. 기존 발전소 정보는 그대로 둡니다.`
          : '모든 발전소가 이미 연결되어 있습니다.');
      } catch (_) {
        if (!same(op)) return;
        list.replaceChildren(); retry.hidden = false; say('목록을 확인하지 못했습니다. 같은 창에서 다시 확인해 주세요.');
      } finally { if (same(op)) reading = false; }
    }
    function open() {
      const view = getContext();
      if (!view?.ready || dialog.open) return;
      opened = { ...view, ticket: ++ticket };
      list.replaceChildren(); dialog.showModal();
      void preview();
    }
    async function apply() {
      const op = opened;
      if (!same(op) || !plan || save.disabled || currentWrite(op)) return;
      const request = {};
      const revision = plan.revision;
      requests.set(op.key, request);
      save.disabled = true; retry.hidden = true; say('발전소 목록을 저장하고 있습니다.');
      const finish = r => {
        if (currentWrite(op) !== request) return;
        const done = !r?.error && Number.isInteger(r?.data?.created) && Number.isInteger(r?.data?.linked);
        const denied = ['PT409','42501','22023','55P03','23505'].includes(r?.error?.code);
        if (done || denied) requests.delete(op.key);
        if (!same(op)) {
          if ((done || denied) && opened?.key === op.key && same(opened) && !reading) void preview();
          return;
        }
        if (!done && !denied) { plan = null; retry.hidden = false; say('저장 결과를 확인하지 못했습니다. 다시 확인은 목록만 읽습니다.'); return; }
        if (!done) {
          plan = null; retry.hidden = false;
          say(r.error?.code === 'PT409' ? '이전 확인 이후 연결이나 기본정보가 바뀌었습니다. 다시 확인해 주세요.'
            : '저장 결과를 확인하지 못했습니다. 연결된 목록을 먼저 다시 확인해 주세요.');
          return;
        }
        invalidate();
        if (getContext()?.key === op.key) void refresh(r.data, op);
      };
      const rpc = Promise.resolve().then(() => same(op)
        ? client.rpc('platform_apply_power_monitor_plant_import', { ...params(op), p_expected_revision: revision })
        : { cancelled: true }).catch(() => ({ error: {} }));
      const first = await timed(rpc);
      if (first?.cancelled) { if (currentWrite(op) === request) requests.delete(op.key); return; }
      finish(first);
      if (!first) void rpc.then(finish);
    }
    button.addEventListener('click', open);
    retry.addEventListener('click', preview);
    save.addEventListener('click', apply);
    close.addEventListener('click', invalidate);
    dialog.addEventListener('cancel', event => { event.preventDefault(); invalidate(); });
    return { sync, pause: invalidate };
  }
  global.PowerMonitorImport = { create };
})(window);
