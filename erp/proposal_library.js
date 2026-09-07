/* Version: v1.4.5 | Explicit local apply drafts and verified private ERP snapshots. */
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
    // localStorage holds only the server ID. Explicit apply drafts use account-scoped IndexedDB.
    const resumeKey = hooks.userId ? `yonginsolar.erp.proposal-current.v1.${hooks.coopId}.${hooks.userId}` : '';
    let resumeId = '', rememberFailed = false;
    try { resumeId = resumeKey ? localStorage.getItem(resumeKey) || '' : ''; } catch (_) { rememberFailed = true; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resumeId)) resumeId = '';
    const hadSavedSession = Boolean(resumeId);
    let localRestorePending = Boolean(resumeKey && window.ProposalDrafts), hadLocalDraft = false;
    let localDraftPresent = false;
    const draftKey = `${resumeKey}.draft`;
    const say = (message) => { status.textContent = message; };
    const markDirty = () => { dirty = true; pending = null; say('수정한 내용은 아직 ERP에 저장되지 않았습니다.'); };
    const remember = (id) => {
      if (!resumeKey) return;
      try { if (id) localStorage.setItem(resumeKey, id); else localStorage.removeItem(resumeKey); rememberFailed = false; }
      catch (_) { rememberFailed = true; }
    };
    const rememberNotice = () => rememberFailed ? ' 이 브라우저는 마지막 작업을 기억하지 못하므로, 새로고침 후 보관함에서 직접 불러와 주세요.' : '';
    function assertRestored() {
      if (resumeId || localRestorePending) throw new Error('마지막 저장본을 아직 불러오지 못했습니다. 「목록 새로고침」으로 다시 시도하거나 다른 제안서를 불러와 주세요. 새 작업은 「새 대상지 추가」로 시작할 수 있습니다.');
    }
    const request = async (promise) => {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('보관함 응답이 늦습니다. 연결을 확인한 뒤 다시 시도해 주세요.')), 12000); })]); }
      finally { clearTimeout(timer); }
    };
    async function clearLocalDraft() {
      if (resumeKey && window.ProposalDrafts) {
        try { await window.ProposalDrafts.remove(draftKey); }
        catch (error) { localRestorePending = true; throw error; }
      }
      localDraftPresent = false; localRestorePending = false;
    }
    async function detach() {
      await clearLocalDraft();
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
        if (resumeId || localRestorePending) say(`${status.textContent} 마지막 저장본은 변경하지 않았습니다. 「목록 새로고침」을 눌러 다시 불러와 주세요.`);
        console.warn('[proposal-library] operation failed', code || 'REQUEST_FAILED');
      } finally {
        busy = false; form.inert = false; byId('previewFrame').inert = false;
        save.disabled = Boolean(resumeId || localRestorePending); copy.disabled = Boolean(resumeId || localRestorePending) || !current;
        byId('printTopButton').disabled = Boolean(resumeId || localRestorePending);
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
        await hooks.newSite(preset); await detach(); name.value = preset.name; dirty = true;
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
      await clearLocalDraft();
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
      await clearLocalDraft();
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
      await hooks.newSite(); await detach(); name.value = ''; dirty = true;
      say('새 대상지를 시작합니다. 이름과 정보를 입력한 뒤 저장해 주세요.');
    }));
    save.addEventListener('click', () => run(() => persist(false)));
    copy.addEventListener('click', () => run(() => persist(true)));
    async function restoreLocalDraft() {
      const record = await window.ProposalDrafts.read(draftKey);
      if (!record) { localRestorePending = false; return; }
      localDraftPresent = true;
      const bytes = encoder.encode(record.payload || '');
      if (bytes.byteLength > 20 * 1024 * 1024 || await hash(bytes) !== record.sha256) throw new Error('이 브라우저의 임시 보관 내용을 확인하지 못했습니다. 원본은 유지했습니다.');
      const draft = JSON.parse(record.payload);
      if (draft.format !== 1) throw new Error('지원하지 않는 임시 보관 형식입니다.');
      let serverChanged = false;
      if (draft.current) {
        const check = await request(hooks.client.from(TABLE).select(COLUMNS).eq('coop_id', hooks.coopId).eq('id', draft.current.id).single());
        if (check.error || !check.data) throw new Error('임시 보관한 제안서의 ERP 열람 권한을 확인하지 못했습니다. 다시 시도해 주세요.');
        serverChanged = check.data.revision !== draft.current.revision;
      }
      await hooks.restore(draft.snapshot);
      current = draft.current || null; name.value = String(draft.name || '').slice(0, 100);
      pending = null; dirty = true; hadLocalDraft = true; localRestorePending = false; resumeId = '';
      remember(current?.id || ''); options(); select.value = current ? `saved:${current.id}` : '';
      save.textContent = current ? '💾 변경 내용 저장' : '💾 새 이름으로 저장';
      say('이 브라우저에서 마지막으로 반영한 입력값·사진·표시 영역을 복원했습니다. ERP 보관함 저장과는 별도입니다.' + (serverChanged ? ' 다른 컴퓨터에서 ERP 저장본이 바뀌었습니다. 현재 내용을 보관하려면 이름을 바꿔 「사본으로 저장」하세요.' : ''));
    }
    const applyLocally = (render) => run(async () => {
      assertRestored();
      if (render() === false) return;
      const snapshot = await hooks.snapshot();
      if (!resumeKey || !window.ProposalDrafts) throw new Error('브라우저 임시 보관을 시작하지 못했습니다. ERP에 이름을 붙여 저장해 주세요.');
      const payload = JSON.stringify({format: 1, snapshot, current, name: name.value});
      const bytes = encoder.encode(payload);
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('임시 보관 용량이 20MB를 넘었습니다. 사진 용량을 줄여 주세요.');
      const sha256 = await hash(bytes);
      await window.ProposalDrafts.write(draftKey, {payload, sha256});
      const verified = await window.ProposalDrafts.read(draftKey);
      if (verified?.sha256 !== sha256 || verified?.payload !== payload) throw new Error('임시 보관 결과를 확인하지 못했습니다. 다른 탭의 작업 여부를 확인하고 다시 반영해 주세요.');
      localDraftPresent = true; dirty = true;
      say('입력값과 사진을 18쪽에 반영하고 이 브라우저에 임시 보관했습니다. 새로고침 후에도 다시 열립니다. 다른 컴퓨터에서 사용할 때는 ERP에 이름을 붙여 저장해 주세요.');
    });
    const refreshAndResume = async () => {
      if (localRestorePending) await restoreLocalDraft();
      // Reopen the user's exact saved ID first; a failed list refresh cannot lose the photo.
      if (resumeId) { if (!mayReplace()) return; await loadSaved(resumeId); }
      const message = status.textContent;
      await refresh();
      if ((current && !dirty) || (hadLocalDraft && localDraftPresent)) { select.value = current ? `saved:${current.id}` : ''; say(message); }
    };
    byId('refreshSitesButton').addEventListener('click', () => run(refreshAndResume));
    name.addEventListener('input', markDirty);
    window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    const ready = run(refreshAndResume);
    return { markDirty, detach, ready, hadSavedSession, assertRestored, applyLocally,
      resetLocally: (reset) => run(async () => { await detach(); reset(); }),
      get hadLocalDraft() { return hadLocalDraft; } };
  }
  window.ProposalLibrary = Object.freeze({ init });
})();
