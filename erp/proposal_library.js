/* Version: v1.4.4 | Resume verified private snapshots after reload. No auth changes. */
(() => {
  'use strict';
  const TABLE = 'erp_proposals';
  const BUCKET = 'erp-proposal-library';
  const COLUMNS = 'id,name,revision,object_path,sha256,updated_at';
  const encoder = new TextEncoder();
  const hash = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((v) => v.toString(16).padStart(2, '0')).join('');
  function init(hooks) {
    const byId = (id) => document.getElementById(id);
    const select = byId('proposalSiteSelect'), name = byId('savedProposalName'), status = byId('libraryStatus');
    const save = byId('saveSiteButton'), copy = byId('copySiteButton');
    const form = byId('proposalForm');
    let current = null, rows = [], busy = false, dirty = false, pending = null, available = false;
    // Only an identifier lives in this browser; photos remain in authenticated private storage.
    const resumeKey = hooks.userId ? `yonginsolar.erp.proposal-current.v1.${hooks.coopId}.${hooks.userId}` : '';
    let resumeId = '', rememberFailed = false;
    try { resumeId = resumeKey ? localStorage.getItem(resumeKey) || '' : ''; } catch (_) { rememberFailed = true; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resumeId)) resumeId = '';
    const hadSavedSession = Boolean(resumeId);
    const say = (message) => { status.textContent = message; };
    const markDirty = () => { dirty = true; pending = null; say('수정한 내용은 아직 ERP에 저장되지 않았습니다.'); };
    const remember = (id) => {
      if (!resumeKey) return;
      try { if (id) localStorage.setItem(resumeKey, id); else localStorage.removeItem(resumeKey); rememberFailed = false; }
      catch (_) { rememberFailed = true; }
    };
    const rememberNotice = () => rememberFailed ? ' 이 브라우저는 마지막 작업을 기억하지 못하므로, 새로고침 후 보관함에서 직접 불러와 주세요.' : '';
    function assertRestored() {
      if (resumeId) throw new Error('마지막 저장본을 아직 불러오지 못했습니다. 「목록 새로고침」으로 다시 시도하거나 다른 제안서를 불러와 주세요. 새 작업은 「새 대상지 추가」로 시작할 수 있습니다.');
    }
    const request = async (promise) => {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('보관함 응답이 늦습니다. 연결을 확인한 뒤 다시 시도해 주세요.')), 12000); })]); }
      finally { clearTimeout(timer); }
    };
    function detach() {
      current = null; pending = null; dirty = false; resumeId = ''; remember('');
      save.disabled = false; copy.disabled = true; byId('printTopButton').disabled = false;
      name.value = ''; save.textContent = '💾 새 이름으로 저장'; select.value = '';
    }
    function options() {
      const selected = select.value;
      select.replaceChildren(new Option('대상지를 선택해 주세요', ''));
      const presets = document.createElement('optgroup'); presets.label = '기본 대상지 · 새 제안서 시작';
      window.ProposalPresets.items.forEach((site) => presets.append(new Option(site.name, `preset:${site.id}`)));
      select.append(presets);
      const saved = document.createElement('optgroup'); saved.label = 'ERP에 저장한 제안서 · 최근 200개';
      rows.forEach((row) => saved.append(new Option(row.name, `saved:${row.id}`)));
      if (current && !rows.some((row) => row.id === current.id)) saved.append(new Option(current.name, `saved:${current.id}`));
      select.append(saved); select.value = selected;
    }
    async function refresh() {
      const { data, error } = await request(hooks.client.from(TABLE).select(COLUMNS).eq('coop_id', hooks.coopId).order('updated_at', { ascending: false }).limit(200));
      if (error) throw error;
      rows = data || []; available = true; options();
      say(`저장한 제안서 ${rows.length}개 · 기본 대상지 7곳. 사진과 최종 수정 문구도 함께 보관합니다.`);
    }
    async function run(action) {
      if (busy) return;
      busy = true; form.inert = true; byId('previewFrame').inert = true; byId('printTopButton').disabled = true;
      try { await action(); }
      catch (error) {
        const code = String(error?.code || '');
        say(code === '23505' ? '같은 이름의 제안서가 있습니다. 다른 이름으로 저장하거나 기존 제안서를 불러와 수정해 주세요.'
          : error?.message?.match(/[가-힣]/) ? error.message : 'ERP 보관함에 연결하지 못했습니다. 내용은 현재 화면에 남아 있습니다. 연결을 확인하고 다시 시도해 주세요.');
        if (resumeId) say(`${status.textContent} 마지막 저장본은 변경하지 않았습니다. 「목록 새로고침」을 눌러 다시 불러와 주세요.`);
        console.warn('[proposal-library] operation failed', code || 'REQUEST_FAILED');
      } finally {
        busy = false; form.inert = false; byId('previewFrame').inert = false;
        save.disabled = Boolean(resumeId); copy.disabled = Boolean(resumeId) || !current;
        byId('printTopButton').disabled = Boolean(resumeId);
      }
    }
    function mayReplace() {
      return !(dirty || hooks.isDirty()) || window.confirm('현재 화면의 저장하지 않은 변경을 버리고 다른 대상지를 불러올까요? 보관하려면 취소 후 먼저 저장해 주세요.');
    }
    async function readSnapshot(row) {
      const { data, error } = await request(hooks.client.storage.from(BUCKET).download(row.object_path));
      if (error) throw error;
      const bytes = await request(data.arrayBuffer());
      if (bytes.byteLength > 20 * 1024 * 1024 || await hash(bytes) !== row.sha256) throw new Error('저장 파일의 무결성 확인에 실패했습니다. 현재 내용을 유지합니다.');
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    async function load() {
      const value = select.value;
      if (!value) { say('먼저 불러올 대상지를 선택해 주세요.'); return; }
      if (!mayReplace()) return;
      if (value.startsWith('preset:')) {
        const preset = window.ProposalPresets.items.find((site) => `preset:${site.id}` === value);
        if (!preset) return;
        await hooks.newSite(preset); detach(); name.value = preset.name; dirty = true;
        say('기본 대상지를 불러왔습니다. 주소·사진·설치 계획을 보완하고 이름을 정해 저장하세요.');
        return;
      }
      await loadSaved(value.slice(6));
    }
    async function loadSaved(id) {
      // Resolve current metadata, even outside the recent-200 list, before restoring.
      const { data: row, error } = await request(hooks.client.from(TABLE).select(COLUMNS).eq('coop_id', hooks.coopId).eq('id', id).single());
      if (error) throw error;
      if (!row) throw new Error('저장한 제안서를 찾을 수 없거나 열람 권한이 없습니다. 보관함에서 다른 제안서를 선택해 주세요.');
      const snapshot = await readSnapshot(row);
      await hooks.restore(snapshot);
      current = row; pending = null; dirty = false; name.value = row.name;
      resumeId = ''; remember(row.id); options(); select.value = `saved:${row.id}`;
      copy.disabled = false; save.textContent = '💾 변경 내용 저장';
      say(`「${row.name}」을 사진·표시 영역·수정 문구와 함께 불러왔습니다.${rememberNotice()}`);
    }
    async function persist(asCopy) {
      assertRestored();
      const title = name.value.trim();
      if (!title) { say('저장할 이름을 입력해 주세요.'); return; }
      if (!available) await refresh();
      const payload = await hooks.snapshot();
      const bytes = encoder.encode(JSON.stringify(payload));
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('사진을 포함한 저장 용량이 20MB를 넘었습니다. 사진 용량을 줄여 주세요.');
      const sha256 = await hash(bytes);
      if (!pending || pending.sha256 !== sha256 || pending.name !== title || pending.asCopy !== asCopy) {
        const id = !asCopy && current ? current.id : crypto.randomUUID();
        const revision = crypto.randomUUID();
        pending = { id, revision, name: title, sha256, asCopy,
          expected: !asCopy && current ? current.revision : null,
          object_path: `${hooks.coopId}/${id}/${revision}.json` };
      }
      const target = pending;
      say('사진과 수정 문구를 비공개 보관함에 저장하고 있습니다…');
      const { error: uploadError } = await hooks.client.storage.from(BUCKET).upload(target.object_path,
        new Blob([bytes], { type: 'application/json' }), { contentType: 'application/json', upsert: false });
      if (uploadError) {
        // An uncertain first response may already have uploaded the immutable object.
        await readSnapshot(target);
      }
      const metadata = { id: target.id, coop_id: hooks.coopId, name: title,
        revision: target.revision, object_path: target.object_path, sha256 };
      const { id: unusedId, coop_id: unusedCoop, ...changes } = metadata;
      const request = target.expected
        ? hooks.client.from(TABLE).update(changes).eq('id', target.id).eq('coop_id', hooks.coopId).eq('revision', target.expected)
        : hooks.client.from(TABLE).insert(metadata);
      const result = await request.select(COLUMNS);
      let row = result.data?.[0];
      if (result.error || !row) {
        const check = await hooks.client.from(TABLE).select(COLUMNS).eq('coop_id', hooks.coopId).eq('id', target.id).maybeSingle();
        if (check.data?.revision === target.revision && check.data?.sha256 === sha256) row = check.data;
        else if (target.expected && !result.error) throw new Error('다른 컴퓨터에서 이 제안서를 수정했습니다. 현재 내용을 보관하려면 이름을 바꿔 「사본으로 저장」하세요. 기존 자료는 덮어쓰지 않았습니다.');
        else throw result.error || new Error('저장 결과를 확인하지 못했습니다. 같은 이름으로 다시 시도하면 중복 없이 확인합니다.');
      }
      // Verify the committed file too; metadata success alone is not sufficient.
      await readSnapshot(row);
      current = row; pending = null; dirty = false; copy.disabled = false; save.textContent = '💾 변경 내용 저장';
      remember(row.id);
      rows = [row, ...rows.filter((item) => item.id !== row.id)].slice(0, 200);
      options(); select.value = `saved:${row.id}`;
      say(`「${title}」 저장 완료. 새로고침해도 사진과 수정 내용이 함께 열립니다.${rememberNotice()}`);
    }
    options();
    byId('loadSiteButton').addEventListener('click', () => run(load));
    byId('newSiteButton').addEventListener('click', () => run(async () => {
      if (!mayReplace()) return;
      await hooks.newSite(); detach(); name.value = ''; dirty = true;
      say('새 대상지를 시작합니다. 이름과 정보를 입력한 뒤 저장해 주세요.');
    }));
    save.addEventListener('click', () => run(() => persist(false)));
    copy.addEventListener('click', () => run(() => persist(true)));
    const refreshAndResume = async () => {
      // Reopen the user's exact saved ID first; a failed list refresh cannot lose the photo.
      if (resumeId) { if (!mayReplace()) return; await loadSaved(resumeId); }
      const message = status.textContent;
      await refresh();
      if (current && !dirty) { select.value = `saved:${current.id}`; say(message); }
    };
    byId('refreshSitesButton').addEventListener('click', () => run(refreshAndResume));
    name.addEventListener('input', markDirty);
    window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    const ready = run(refreshAndResume);
    return { markDirty, detach, ready, hadSavedSession, assertRestored };
  }
  window.ProposalLibrary = Object.freeze({ init });
})();
