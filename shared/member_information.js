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
        ? (siteMember ? '출자금 환급을 위해 은행명·계좌번호·예금주를 등록해 주세요.' : '배당금 수령을 위해 은행명·계좌번호·예금주를 등록해 주세요.') : '',
      officeMessage: fields.some(key => ['name', 'rrn'].includes(key))
        ? `${fields.filter(key => ['name', 'rrn'].includes(key)).map(key => labels[key]).join('·')} 보완은 사무국에 문의해 주세요.` : ''
    };
  }
  function createPortal(options) {
    const cache = new Map();
    const pending = new Map();
    let request = 0, activeState = null, saving = false, editingMember = null;
    const element = id => document.getElementById(id);
    const key = member => `${member?.coop_id || ''}:${member?.id || ''}`;
    function render(state) {
      const notice = element('memberInformationNotice');
      if (!notice) return;
      activeState = state;
      const model = noticeModel(state, options.isSiteMember());
      notice.hidden = model.fields.length === 0;
      element('memberInformationText').textContent = `${model.names.join(', ')} 입력이 필요합니다.`;
      element('memberInformationAccountHelp').textContent = model.accountMessage;
      element('memberInformationAccountHelp').hidden = !model.accountMessage;
      element('memberInformationOfficeHelp').textContent = model.officeMessage;
      element('memberInformationOfficeHelp').hidden = !model.officeMessage;
      element('memberInformationButton').hidden = model.editable.length === 0;
    }
    async function refresh(member, force = false) {
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
          pending.delete(targetKey);
          if (error) throw error;
          cache.set(targetKey, data);
        }
        if (seq === request && key(options.getMember()) === targetKey) render(cache.get(targetKey));
      } catch (_) {
        pending.delete(targetKey);
        if (seq === request) render(null);
        // Do not log input values, ciphertext, or personalized server errors.
        console.warn('[member-information] INFORMATION_CHECK_UNAVAILABLE');
      }
    }
    function close() {
      if (saving) return;
      const dialog = element('memberInformationDialog');
      if (dialog?.open) dialog.close();
      element('memberInformationFields').replaceChildren();
      editingMember = null;
    }
    function open() {
      const member = options.getMember();
      if (!member || saving) return;
      const model = noticeModel(activeState, options.isSiteMember());
      if (!model.editable.length) return;
      const dialog = element('memberInformationDialog');
      if (dialog.open) return;
      editingMember = { id: member.id, coop_id: member.coop_id };
      element('memberInformationDialogHelp').textContent = model.accountMessage || '아래의 빠진 정보를 입력해 주세요.';
      element('memberInformationFields').innerHTML = model.editable.map(field => {
        const digits = ['account_number', 'business_number'].includes(field);
        const type = field === 'phone' ? 'tel' : 'text';
        const maximum = field === 'address' ? 500 : field === 'account_number' ? 30 : 100;
        return `<div class="mb-3"><label class="form-label fw-bold" for="member-information-${field}">${escape(labels[field])}</label>` +
          `<input class="form-control" id="member-information-${field}" data-information-field="${field}" type="${type}" maxlength="${maximum}" ${digits ? 'inputmode="numeric"' : ''} autocomplete="off" required>` +
          (field === 'account_number' ? '<div class="form-text">계좌번호를 숫자로 입력해 주세요.</div>' : '') + '</div>';
      }).join('');
      element('memberInformationFormStatus').textContent = '';
      dialog.showModal();
      element('memberInformationFields').querySelector('input')?.focus();
    }
    async function save(event) {
      event.preventDefault();
      if (saving || !editingMember) return;
      const target = editingMember;
      if (key(options.getMember()) !== key(target)) { close(); return; }
      const form = element('memberInformationForm');
      if (!form.reportValidity()) return;
      const values = {};
      element('memberInformationFields').querySelectorAll('[data-information-field]').forEach(input => {
        const field = input.dataset.informationField;
        values[field] = input.value.trim();
        if (['account_number', 'business_number'].includes(field)) values[field] = values[field].replace(/[\s-]/g, '');
      });
      saving = true;
      element('memberInformationSave').disabled = true;
      element('memberInformationFormStatus').textContent = '저장 중입니다…';
      try {
        const { data, error } = await options.client.rpc('complete_member_contact_information', { p_member_uuid: target.id, p_values: values });
        if (error) throw error;
        cache.set(key(target), data);
        saving = false;
        close();
        if (key(options.getMember()) === key(target)) render(data);
        await options.onSaved();
      } catch (error) {
        const messages = {
          INVALID_PHONE_NUMBER: '전화번호를 확인해 주세요.', INVALID_BANK_ACCOUNT: '계좌번호를 숫자 8~30자리로 입력해 주세요.',
          INVALID_BUSINESS_NUMBER: '사업자·고유번호 10자리를 확인해 주세요.',
          DUPLICATE_MEMBER_PHONE: '다른 조합원에게 등록된 전화번호입니다. 사무국에 문의해 주세요.',
          PROFILE_ACCESS_FORBIDDEN: '현재 선택한 조합원 정보를 다시 확인해 주세요.'
        };
        element('memberInformationFormStatus').textContent = messages[error?.message] || '저장하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.';
      } finally {
        saving = false;
        element('memberInformationSave').disabled = false;
      }
    }
    element('memberInformationButton')?.addEventListener('click', open);
    element('memberInformationForm')?.addEventListener('submit', save);
    element('memberInformationClose')?.addEventListener('click', close);
    element('memberInformationDialog')?.addEventListener('cancel', event => { event.preventDefault(); close(); });
    element('memberInformationDialog')?.addEventListener('close', () => {
      element('memberInformationFields').replaceChildren();
      editingMember = null;
    });
    return { refresh, invalidate(member) { cache.delete(key(member)); }, open };
  }
  global.MemberInformation = Object.freeze({ fieldLabels: labels, fieldNames, noticeModel, createPortal });
})(window);
