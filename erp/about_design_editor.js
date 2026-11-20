(function (root) {
  'use strict';
  function mount(panel, adapter) {
    const doc = panel.ownerDocument;
    const design = root.CoopAboutDesign;
    const el = id => panel.querySelector('#about-design-' + id);
    const source = el('source'), status = el('status'), comparison = el('comparison');
    let ready = false, operation = null, preview = null;
    function resetPreview() {
      preview = null;
      comparison.hidden = true;
      el('current').replaceChildren();
      el('candidate').replaceChildren();
      el('apply').disabled = true;
    }
    function invalidate() {
      operation = null;
      resetPreview();
      el('prompt').hidden = true;
      el('prompt').textContent = '';
      status.textContent = '';
      sync(ready);
    }
    function sync(value) {
      ready = value;
      for (const id of ['copy', 'see', 'preview', 'reset']) el(id).disabled = !ready || !!operation;
      el('apply').disabled = !ready || !!operation || !preview;
    }
    const active = job => operation === job && panel.open && !panel.hidden && panel.isConnected
      && adapter.current(job.context) && ready;
    async function run(task) {
      handleChanges(changes.takeRecords());
      if (operation || !ready || !panel.open || panel.hidden) return;
      const context = adapter.context();
      if (!adapter.current(context)) return;
      const job = {context};
      operation = job;
      sync(ready);
      try {
        if (!(await adapter.flush())) {
          if (active(job)) status.textContent = '편집 중인 글을 먼저 마무리한 뒤 다시 눌러 주세요.';
          return;
        }
        if (active(job)) await task(job, adapter.read());
      } catch (error) {
        if (active(job)) status.textContent = error.message || '시안을 확인하지 못했어요.';
      } finally {
        if (operation === job) { operation = null; sync(ready); }
      }
    }
    function sample(value, info) {
      const result = adapter.sample().cloneNode(true);
      const body = result.querySelector('#prev-content');
      const list = result.querySelector('#prev-list');
      list?.setAttribute('data-about-design-list', '');
      result.removeAttribute('id');
      result.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      result.querySelectorAll('a').forEach(node => {
        const label = doc.createElement('span');
        label.replaceChildren(...node.childNodes);
        node.replaceWith(label);
      });
      result.classList.add('about-design-sample');
      design.paint(result, body, list, value, info.hasPhoto, info.defaultPhoto);
      return result;
    }
    function handlePrompt(copy) {
      return run(async (job, info) => {
        const prompt = design.makePrompt(info);
        if (copy) {
          try {
            await root.navigator.clipboard.writeText(prompt);
            if (active(job)) status.textContent = '현재 소개 글과 시안 요청을 복사했어요.';
            return;
          } catch (_) { if (!active(job)) return; }
        }
        el('prompt').textContent = prompt;
        el('prompt').hidden = false;
        status.textContent = copy ? '아래 내용을 직접 복사해 주세요.' : '';
      });
    }
    el('copy').addEventListener('click', () => handlePrompt(true));
    el('see').addEventListener('click', () => handlePrompt(false));
    el('preview').addEventListener('click', () => {
      resetPreview();
      status.textContent = '';
      const pasted = source.value;
      return run((job, info) => {
        if (source.value !== pasted) return;
        const candidate = design.readHtml(pasted);
        adapter.refreshSample();
        el('current').replaceChildren(sample(info.design, info));
        el('candidate').replaceChildren(sample(candidate, info));
        comparison.hidden = false;
        preview = {candidate, pasted, snapshot:info.snapshot, photo:info.photo, context:job.context};
      });
    });
    el('apply').addEventListener('click', () => {
      const selected = preview;
      if (!selected) return;
      return run((job, info) => {
        if (preview !== selected || source.value !== selected.pasted || info.snapshot !== selected.snapshot
          || info.photo !== selected.photo || !adapter.current(selected.context)) {
          resetPreview();
          status.textContent = '소개가 바뀌었어요. 시안을 다시 미리보기로 확인해 주세요.';
          return;
        }
        adapter.apply(selected.candidate);
        resetPreview();
        status.textContent = '편집 화면에 적용했어요. 홈페이지에 반영하려면 조합 소개를 저장해 주세요.';
      });
    });
    el('reset').addEventListener('click', () => run(() => {
      adapter.apply('');
      resetPreview();
      status.textContent = '기본 디자인으로 돌아왔어요. 홈페이지에 반영하려면 조합 소개를 저장해 주세요.';
    }));
    for (const mode of ['desktop','mobile']) el(mode).addEventListener('click', () => {
      comparison.dataset.size = mode;
      for (const id of ['desktop','mobile']) el(id).setAttribute('aria-pressed', String(id===mode));
    });
    source.addEventListener('input', () => { resetPreview(); status.textContent = ''; });
    function handleChanges(records) {
      if (panel.hidden || !panel.open || records.some(r => r.attributeName === 'open' && r.oldValue !== null)) invalidate();
    }
    const changes = new root.MutationObserver(handleChanges);
    changes.observe(panel, {attributes:true,attributeOldValue:true,attributeFilter:['open','hidden']});
    sync(false);
    return Object.freeze({sync, invalidate});
  }
  root.CoopAboutDesignEditor = Object.freeze({version:'1.0.0', mount});
})(window);
