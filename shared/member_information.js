(function (global) {
  'use strict';
  const labels = Object.freeze({
    name: '이름', phone: '전화번호', address: '주소', rrn: '주민등록번호',
    bank_name: '은행명', account_number: '계좌번호', account_holder: '예금주',
    business_number: '사업자·고유번호', representative_name: '대표자명', contact_name: '담당자명'
  });
  const accountFields = ['bank_name', 'account_number', 'account_holder'];
  const editable = Object.keys(labels).filter(key => !['name', 'rrn'].includes(key));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Only the stored projection is displayable, never a full account or ciphertext.
  function bankAccountDisplay(member) {
    const value = String(member?.account_num_display ?? member?.account_number ?? '').trim();
    return /^\*{4}(?:[0-9]{4})?$/.test(value) ? value : '';
  }
  function renderBankAccountStatus(node, member) {
    if (!node) return;
    const value = bankAccountDisplay(member);
    node.hidden = !value;
    node.textContent = value === '****' ? '입력됨 · 끝자리 확인 필요' : value ? '입력됨' : '';
  }
  function fieldNames(fields) {
    const result = [];
    for (const field of fields || []) {
      const label = accountFields.includes(field) ? '계좌정보' : labels[field];
      if (label && !result.includes(label)) result.push(label);
    }
    return result;
  }
  function noticeModel(state, siteMember) {
    const fields = Array.isArray(state?.missing_fields) ? state.missing_fields.filter(key => labels[key]) : [];
    return {
      fields, names: fieldNames(fields), editable: fields.filter(key => editable.includes(key)),
      accountMessage: fields.some(key => accountFields.includes(key))
        ? '은행명·계좌번호·예금주를 등록해 주세요.' : '',
      officeMessage: fields.some(key => ['name', 'rrn'].includes(key))
        ? `${fields.filter(key => ['name', 'rrn'].includes(key)).map(key => labels[key]).join('·')} 보완은 사무국에 문의해 주세요.` : ''
    };
  }
  function createPortal(options) {
    const cache = new Map();
    const pending = new Map();
    const drafts = new Map(); // Sensitive input stays in this document's memory only.
    let request = 0, activeState = null, editor = null, view = 0, owner = null;
    const element = id => document.getElementById(id);
    const key = member => `${member?.coop_id || ''}:${member?.id || ''}`;
    function syncOwner() {
      const current = String(options.getOwner ? options.getOwner() || '' : 'document');
      if (owner !== current) {
        owner = current; ++request; ++view;
        drafts.clear(); cache.clear(); pending.clear(); editor = null; activeState = null;
        const dialog = element('memberInformationDialog');
        if (dialog?.open) dialog.close();
        element('memberInformationFields')?.replaceChildren();
      }
      return current;
    }
    const snapshot = state => JSON.stringify(state.fields.map(field => [field, state.values[field] || '']));
    const dirty = state => !!state && snapshot(state) !== state.baseline;
    function retain() {
      if (!editor || editor.owner !== owner) return;
      element('memberInformationFields').querySelectorAll('[data-information-field]').forEach(input => {
        editor.values[input.dataset.informationField] = input.value;
      });
    }
    function current(state, epoch) {
      return syncOwner() === state.owner && editor === state && view === epoch
        && key(options.getMember()) === state.key && element('memberInformationDialog').open;
    }
    function status(state) {
      if (!state || editor !== state) return;
      element('memberInformationFormStatus').textContent = state.pending ? '저장 중입니다…' : state.message || (dirty(state) ? '작성 중 · 아직 저장하지 않았습니다.' : '');
      element('memberInformationSave').disabled = !!state.pending;
      const discard = element('memberInformationDiscard');
      if (discard) { discard.disabled = !!state.pending; discard.hidden = !dirty(state); }
    }
    function render(state) {
      const notice = element('memberInformationNotice');
      if (!notice) return;
      activeState = state;
      const model = noticeModel(state, options.isSiteMember());
      const draft = drafts.get(key(options.getMember()));
      const retained = dirty(draft) || draft?.pending;
      notice.hidden = model.fields.length === 0 && !retained;
      element('memberInformationText').textContent = retained ? (draft.pending ? '정보 보완 내용을 저장하고 있습니다.' : '작성 중인 정보 보완 내용이 있습니다.') : `${model.names.join(', ')} 입력이 필요합니다.`;
      element('memberInformationAccountHelp').textContent = model.accountMessage;
      element('memberInformationAccountHelp').hidden = !model.accountMessage;
      element('memberInformationOfficeHelp').textContent = model.officeMessage;
      element('memberInformationOfficeHelp').hidden = !model.officeMessage;
      element('memberInformationButton').hidden = model.editable.length === 0 && !retained;
      element('memberInformationButton').textContent = retained ? '작성 중인 내용 열기' : '정보 보완';
    }
    async function refresh(member, force = false) {
      const actor = syncOwner();
      if (editor && key(member) !== editor.key) close();
      const seq = ++request, targetKey = key(member);
      if (!member?.id) { render(null); return; }
      element('memberInformationNotice').hidden = true;
      if (force) cache.delete(targetKey);
      try {
        if (!cache.has(targetKey)) {
          if (!pending.has(targetKey)) {
            pending.set(targetKey, options.client.rpc('get_member_information_completeness', { p_member_uuid: member.id }));
          }
          const { data, error } = await pending.get(targetKey);
          if (actor !== syncOwner()) return;
          pending.delete(targetKey);
          if (error) throw error;
          cache.set(targetKey, data);
        }
        if (actor === syncOwner() && seq === request && key(options.getMember()) === targetKey) render(cache.get(targetKey));
      } catch (_) {
        if (actor !== syncOwner()) return;
        pending.delete(targetKey);
        if (seq === request) render(null);
        // Do not log input values, ciphertext, or personalized server errors.
        console.warn('[member-information] INFORMATION_CHECK_UNAVAILABLE');
      }
    }
    function close() {
      retain(); ++view; editor = null;
      const dialog = element('memberInformationDialog');
      if (dialog?.open) dialog.close();
      element('memberInformationFields').replaceChildren();
      render(activeState);
    }
    function open() {
      const member = options.getMember();
      const actor = syncOwner();
      if (!member || !actor) return;
      const model = noticeModel(activeState, options.isSiteMember());
      const targetKey = key(member);
      let state = drafts.get(targetKey);
      if (!state || (!dirty(state) && !state.pending)) {
        if (!model.editable.length) return;
        state = { owner: actor, key: targetKey, id: member.id, fields: model.editable.slice(), values: {}, revision: 0, pending: false, message: '' };
        state.baseline = snapshot(state); drafts.set(targetKey, state);
      }
      const dialog = element('memberInformationDialog');
      if (dialog.open) return;
      editor = state; ++view;
      element('memberInformationDialogHelp').textContent = model.accountMessage || '아래의 빠진 정보를 입력해 주세요.';
      element('memberInformationFields').innerHTML = state.fields.map(field => {
        const digits = ['account_number', 'business_number'].includes(field);
        const type = field === 'phone' ? 'tel' : 'text';
        const maximum = field === 'address' ? 500 : field === 'account_number' ? 30 : 100;
        return `<div class="mb-3"><label class="form-label fw-bold" for="member-information-${field}">${escape(labels[field])}</label>` +
          `<input class="form-control" id="member-information-${field}" data-information-field="${field}" type="${type}" maxlength="${maximum}" ${digits ? 'inputmode="numeric"' : ''} autocomplete="off" required>` +
          (field === 'account_number' ? '<div class="form-text">계좌번호를 숫자로 입력해 주세요.</div>' : '') + '</div>';
      }).join('');
      element('memberInformationFields').querySelectorAll('[data-information-field]').forEach(input => { input.value = state.values[input.dataset.informationField] || ''; });
      status(state);
      dialog.showModal();
      element('memberInformationFields').querySelector('input')?.focus();
    }
    async function save(event) {
      event.preventDefault();
      syncOwner();
      if (!element('memberInformationDialog').open || !editor || editor.pending) return;
      const target = editor, epoch = view;
      if (key(options.getMember()) !== target.key) { close(); return; }
      const form = element('memberInformationForm');
      if (!form.reportValidity()) return;
      retain();
      const sent = snapshot(target), values = {};
      element('memberInformationFields').querySelectorAll('[data-information-field]').forEach(input => {
        const field = input.dataset.informationField;
        values[field] = input.value.trim();
        if (['account_number', 'business_number'].includes(field)) values[field] = values[field].replace(/[\s-]/g, '');
      });
      target.pending = true; target.message = ''; status(target);
      try {
        const { data, error } = await options.client.rpc('complete_member_contact_information', { p_member_uuid: target.id, p_values: values });
        if (error) throw error;
        if (target.owner !== syncOwner() || drafts.get(target.key) !== target) return;
        if (editor === target) retain();
        target.baseline = sent; target.pending = false;
        cache.set(target.key, data);
        target.message = dirty(target) ? '저장했습니다. 추가로 작성한 내용은 아직 저장하지 않았습니다.' : '저장했습니다.';
        if (key(options.getMember()) === target.key) render(data);
        // A closed/reopened editor or a different profile is never affected by an old result.
        if (current(target, epoch)) {
          if (dirty(target)) status(target);
          else {
            close();
            try { await options.onSaved?.(); }
            catch (_) { /* The write succeeded; a dashboard read is not a save failure. */ }
          }
        }
      } catch (error) {
        const messages = {
          INVALID_PHONE_NUMBER: '전화번호를 확인해 주세요.', INVALID_BANK_ACCOUNT: '계좌번호를 숫자 8~30자리로 입력해 주세요.',
          INVALID_BUSINESS_NUMBER: '사업자·고유번호 10자리를 확인해 주세요.',
          DUPLICATE_MEMBER_PHONE: '다른 조합원에게 등록된 전화번호입니다. 사무국에 문의해 주세요.',
          PROFILE_ACCESS_FORBIDDEN: '현재 선택한 조합원 정보를 다시 확인해 주세요.'
        };
        if (target.owner !== syncOwner() || drafts.get(target.key) !== target) return;
        target.message = messages[error?.message] || '저장하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.';
      } finally {
        target.pending = false;
        if (current(target, epoch)) status(target);
        else if (target.owner === owner && editor === target) {
          // Release a reopened form's own request lock, without showing the old result.
          element('memberInformationSave').disabled = false;
          const discard = element('memberInformationDiscard');
          if (discard) discard.disabled = false;
          element('memberInformationFormStatus').textContent = dirty(target) ? '작성 중 · 아직 저장하지 않았습니다.' : '';
        }
      }
    }
    async function discard() {
      retain();
      const state = editor, epoch = view;
      if (!state || state.pending || !global.CoopDialog?.confirm) return;
      const revision = state.revision;
      if (!await global.CoopDialog.confirm('작성 중인 내용을 버릴까요?')) return;
      if (!current(state, epoch) || state.pending || state.revision !== revision) return;
      drafts.delete(state.key); close(); open();
    }
    element('memberInformationFields')?.addEventListener('input', () => { retain(); if (editor) { ++editor.revision; editor.message = ''; status(editor); } });
    element('memberInformationDiscard')?.addEventListener('click', discard);
    element('memberInformationButton')?.addEventListener('click', open);
    element('memberInformationForm')?.addEventListener('submit', save);
    element('memberInformationClose')?.addEventListener('click', close);
    element('memberInformationDialog')?.addEventListener('cancel', event => { event.preventDefault(); close(); });
    element('memberInformationDialog')?.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || global.CoopDialog?.hasPending()) return;
      const dialog = element('memberInformationDialog');
      const nodes = [...dialog.querySelectorAll('input,button,[tabindex]')].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (first && ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first))) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    });
    element('memberInformationDialog')?.addEventListener('close', () => {
      // Native close is asynchronous: don't clear a newly reopened dialog.
      if (element('memberInformationDialog').open) return;
      retain(); editor = null; ++view;
      element('memberInformationFields').replaceChildren();
    });
    global.addEventListener('beforeunload', event => {
      syncOwner(); retain();
      if ([...drafts.values()].some(state => dirty(state) || state.pending)) { event.preventDefault(); event.returnValue = ''; }
    });
    global.addEventListener('pagehide', close);
    return { refresh, invalidate(member) { cache.delete(key(member)); }, open, suspend: close,
      clear() { owner = null; syncOwner(); render(null); } };
  }
  global.MemberInformation = Object.freeze({ fieldLabels: labels, fieldNames, noticeModel, createPortal, bankAccountDisplay, renderBankAccountStatus });
})(window);
