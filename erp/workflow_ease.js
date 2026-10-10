/* 20261010.1 — no network, storage, authorization or business writes. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function buildEntryReview(ctx, metadata = {}) {
    const taxFree = [true, 'true', 'TRUE', '면세'].includes(metadata.taxFree);
    return [
      `날짜: ${ctx.fDate || ''}`,
      `프로젝트: ${ctx.project || ''}`,
      `계정과목: ${ctx.item || ''} (${ctx.type || ''})`,
      `적요: ${ctx.desc || ''}`,
      `${metadata.amountLabel || '입력 금액'}: ${Number(ctx.totalAmt || 0).toLocaleString('ko-KR')}원`,
      `부가세 입력: ${taxFree ? '면세' : ctx.useVAT ? '포함' : '미포함'}`,
      `결제: ${ctx.isCard ? ctx.cardName || '카드 미선택' : '일반 거래'}`,
      metadata.warning || ''
    ].filter(Boolean).join('\n');
  }
  function publishSyncReview(result) {
    const root = $('accountingSyncReview');
    if (!root || !result || result.error) return;
    root.replaceChildren(); root.hidden = false;
    const heading = document.createElement('strong');
    heading.textContent = result.done ? `연동 후 확인 필요 ${result.blockedDocs?.length || 0}건` : `이번 조회 · 연동 가능 ${result.plans?.length || 0}건 · 확인 필요 ${result.blockedDocs?.length || 0}건`;
    root.append(heading);
    if (result.blockedDocs?.length) {
      const list = document.createElement('ul');
      result.blockedDocs.forEach(item => {
        const row = document.createElement('li');
        row.textContent = `${item.label || item.title || item.doc?.title || '지출결의'} — ${item.reason || '내용 확인 필요'}`;
        list.append(row);
      });
      root.append(list);
    }
  }
  function mountApproval() {
    const select = $('appCategory'), quick = $('approvalQuickTypes'), form = $('draftForm');
    if (!select || !quick || !form) return;
    function render() {
      quick.replaceChildren();
      const ready = $('approvalTabNav') && !$('approvalTabNav').classList.contains('hidden');
      if (!ready || select.disabled) return;
      ['휴가', '지출결의', '공문', '일반품의'].forEach(value => {
        const option = Array.from(select.options).find(item => item.value === value && !item.disabled && !item.parentElement?.disabled);
        if (!option) return;
        const button = document.createElement('button'); button.type = 'button';
        button.className = select.value === value ? 'btn btn-primary btn-sm' : 'btn btn-outline-primary btn-sm';
        button.textContent = option.textContent.trim();
        button.setAttribute('aria-pressed', String(select.value === value));
        button.addEventListener('click', () => {
          if (select.disabled || option.disabled || option.parentElement?.disabled || !option.isConnected) return;
          select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        quick.append(button);
      });
    }
    let timer;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (typeof window.syncApprovalDraftStatusText === 'function') window.syncApprovalDraftStatusText();
        const details = $('approvalProxyOptions'), original = $('permissionRequestProxy');
        if (details && original) details.hidden = original.classList.contains('hidden');
        if ($('chkProxy')?.checked && details) details.open = true;
        if ($('chkSecretaryJeongyeol')?.checked && $('secretaryJeongyeolPanel')) $('secretaryJeongyeolPanel').open = true;
      }, 160);
    };
    ['input', 'change', 'click'].forEach(event => form.addEventListener(event, update));
    select.addEventListener('change', render);
    new MutationObserver(render).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    if ($('approvalTabNav')) new MutationObserver(render).observe($('approvalTabNav'), { attributes: true, attributeFilter: ['class'] });
    ['linePreview', 'refPreview'].forEach(id => {
      if ($(id)) new MutationObserver(update).observe($(id), { childList: true, subtree: true });
    });
    render(); update();
  }
  function mountEmployee() {
    const tab = $('settingTab'), footer = $('companySettingsFooter');
    if (tab && footer) {
      const button = footer.querySelector('button');
      const syncLabel = () => {
        if (button) button.textContent = '조합 설정 저장';
      };
      tab.addEventListener('shown.bs.tab', syncLabel); syncLabel();
    }
    if ($('inviteModal')) $('inviteModal').addEventListener('hidden.bs.modal', () => { if ($('invitePermissionDetails')) $('invitePermissionDetails').open = false; });
  }
  function mountAccounting() {
    const search = $('accountingBusinessSearch');
    if (!search) return;
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault(); window.openAccountingBusinessFinder(search.value.trim());
    });
  }
  window.ERPWorkflowEase = Object.freeze({ buildEntryReview, publishSyncReview });
  document.addEventListener('DOMContentLoaded', () => { mountApproval(); mountEmployee(); mountAccounting(); });
})();
