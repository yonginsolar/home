/* Approval Composer UX v2.0.0 — presentation & navigation helper only.
 * No network calls, storage writes, authorization overrides, or business submission changes.
 * Mirrors native <select> / <input> controls so all existing approval.html logic and permissions stay authoritative.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const isNativeVisible = el => !!el && !el.hidden && !el.classList.contains('hidden') && el.style.display!=='none';

  function isOptionUsable(opt) {
    if (!opt || opt.hidden || opt.disabled) return false;
    if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' && opt.parentElement.disabled) return false;
    return true;
  }

  function trimSubtypeLabel(raw) {
    const text = String(raw || '').trim();
    const idx = text.indexOf('(');
    return idx > 0 ? text.slice(0, idx).trim() : text;
  }

  function mountApprovalComposerUx() {
    const form = $('draftForm');
    const catSelect = $('appCategory');
    const basics = $('approvalDraftBasics');
    const subSelect = $('expenseSubType');
    const lineSection = $('permissionRequestLine');
    if (!form || !catSelect || !basics || !lineSection) return;

    // 1. Category 1-row Mini-Tabs
    const catWrap = document.createElement('div');
    catWrap.id = 'approvalCategoryMiniTabs';
    catWrap.className = 'approval-mini-tabs hidden';
    catWrap.setAttribute('role', 'tablist');
    catWrap.setAttribute('aria-label', '결재 구분');
    catSelect.insertAdjacentElement('beforebegin', catWrap);

    let lastCatSig = '';
    function renderCategoryMiniTabs() {
      const nav = $('approvalTabNav');
      const ready = !nav || !nav.classList.contains('hidden');
      const usable = Array.from(catSelect.options).filter(isOptionUsable);
      const sig = JSON.stringify([ready, catSelect.disabled, catSelect.value, usable.map((o) => [o.value, o.textContent.trim()])]);
      if (sig === lastCatSig) return;
      lastCatSig = sig;

      if (!ready || usable.length < 2) {
        catWrap.classList.add('hidden');
        basics.classList.remove('approval-ux-minitabs-ready');
        return;
      }

      const hadFocus=catWrap.contains(document.activeElement);
      catWrap.replaceChildren();
      usable.forEach((opt) => {
        const active = catSelect.value === opt.value;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'approval-mini-tab' + (active ? ' active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex=active||(!usable.some(o=>o.value===catSelect.value)&&opt===usable[0])?0:-1;
        btn.disabled = !!catSelect.disabled;
        btn.textContent = opt.textContent.trim();
        btn.addEventListener('click', () => {
          if (catSelect.disabled || !isOptionUsable(opt) || catSelect.value === opt.value) return;
          catSelect.value = opt.value;
          catSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        catWrap.append(btn);
      });

      catWrap.classList.remove('hidden');
      basics.classList.add('approval-ux-minitabs-ready');
      if(hadFocus)catWrap.querySelector('[tabindex="0"]')?.focus({preventScroll:true});
    }
    catWrap.addEventListener('keydown', event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
      const tabs=[...catWrap.querySelectorAll('button:not(:disabled)')],i=tabs.indexOf(document.activeElement);
      if(i<0||tabs.length<2)return;
      event.preventDefault();
      const j=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
      tabs[j].focus();tabs[j].click();
    });

    // 2. Expense Subtype Permission-Mirrored Mini-Tabs
    let subWrap = null;
    let subTabsEl = null;
    let subHintEl = null;
    const subChoiceWrap = subSelect ? subSelect.closest('.approval-expense-choice') : null;
    if (subSelect && subChoiceWrap) {
      subWrap = document.createElement('div');
      subWrap.id = 'approvalExpenseSubMiniTabs';
      subWrap.className = 'approval-subtype-box hidden';
      const head = document.createElement('div');
      head.className = 'approval-subtype-head';
      const title = document.createElement('span');
      title.textContent = '지출 항목';
      subHintEl = document.createElement('span');
      subHintEl.className = 'approval-subtype-hint';
      head.append(title, subHintEl);

      subTabsEl = document.createElement('div');
      subTabsEl.className = 'approval-subtype-tabs';
      subTabsEl.setAttribute('role', 'group');
      subTabsEl.setAttribute('aria-label', '지출 항목 선택');

      subWrap.append(head, subTabsEl);
      subSelect.insertAdjacentElement('beforebegin', subWrap);
    }

    let lastSubSig = '';
    function renderExpenseSubMiniTabs() {
      if (!subSelect || !subWrap || !subTabsEl || !subChoiceWrap) return;
      const allowed = Array.from(subSelect.options).filter(isOptionUsable);
      const sig = JSON.stringify([subSelect.disabled, subSelect.value, allowed.map((o) => [o.value, o.textContent.trim()])]);
      if (sig === lastSubSig) return;
      lastSubSig = sig;

      if (allowed.length <= 1) {
        subWrap.classList.add('hidden');
        subChoiceWrap.classList.toggle('approval-ux-single-subtype',allowed.length===1);
        subChoiceWrap.classList.remove('approval-ux-subtabs-ready');
        return;
      }

      subChoiceWrap.classList.remove('approval-ux-single-subtype');
      subChoiceWrap.classList.add('approval-ux-subtabs-ready');
      subWrap.classList.remove('hidden');
      subHintEl.textContent = subSelect.disabled
        ? '증액·감액 모드에서는 일반 지출로 고정됩니다.'
        : '허용된 지출 항목을 선택하세요.';

      const focused = subTabsEl.contains(document.activeElement)
        ? document.activeElement.dataset.subtype : null;
      subTabsEl.replaceChildren();
      let restore = null, selected = null;
      allowed.forEach((opt) => {
        const active = subSelect.value === opt.value;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'approval-subtype-tab' + (active ? ' active' : '');
        btn.dataset.subtype = opt.value;
        btn.setAttribute('aria-pressed', String(active));
        btn.disabled = !!subSelect.disabled;
        btn.textContent = trimSubtypeLabel(opt.textContent);
        btn.title = opt.textContent.trim();
        if (opt.value === focused) restore = btn;
        if (active) selected = btn;
        btn.addEventListener('click', () => {
          if (subSelect.disabled || !isOptionUsable(opt) || subSelect.value === opt.value) return;
          subSelect.value = opt.value;
          subSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        subTabsEl.append(btn);
      });
      if (focused !== null && !subSelect.disabled) (restore || selected)?.focus({preventScroll:true});
    }

    // 3. Bottom Conditional Options Dock (증액·감액 / 관련 품의서·원결재 / 재고 입고 반영 / 대리 상신)
    const adjEl = $('divExpenseAdjustment');
    const relEl = $('divRelDoc');
    const invEl = $('divInventoryPurchase');
    const proxyDetailsEl = $('approvalProxyOptions');
    const proxyTargetEl = $('divProxyTarget');
    const proxyWrapEl = $('permissionRequestProxy');
    const nativeAncestors=new Map(
      [adjEl,relEl,invEl,proxyDetailsEl,proxyTargetEl].filter(Boolean).map(el=>{
        const nodes=[];
        for(let parent=el.parentElement;parent&&parent!==form;parent=parent.parentElement)nodes.push(parent);
        return [el,nodes];
      })
    );
    const isAvailable=el=>isNativeVisible(el)&&(nativeAncestors.get(el)||[]).every(isNativeVisible);

    const dock = document.createElement('section');
    dock.id = 'approvalBottomOptionsDock';
    dock.className = 'approval-bottom-options hidden';
    dock.setAttribute('aria-label', '추가 옵션');

    const dockHead = document.createElement('div');
    dockHead.className = 'approval-bottom-options-head';
    const dockTitle = document.createElement('span');
    dockTitle.className = 'approval-bottom-options-title';
    dockTitle.textContent = '추가 옵션';
    const dockHint = document.createElement('span');
    dockHint.className = 'approval-bottom-options-hint';
    dockHint.textContent = '필요한 항목만 눌러 아래에서 입력할 수 있습니다.';
    dockHead.append(dockTitle, dockHint);

    const chipBar = document.createElement('div');
    chipBar.className = 'approval-opt-chips';

    const panelsWrap = document.createElement('div');
    panelsWrap.className = 'approval-opt-panels hidden';

    dock.append(dockHead, chipBar, panelsWrap);
    lineSection.insertAdjacentElement('beforebegin', dock);

    const manualOpen = { adj: false, rel: false, inv: false, proxy: false };
    const hadValue = { adj: false, rel: false, inv: false, proxy: false };

    function createOptionSlot(key, defaultLabel, elements) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'approval-opt-chip hidden';
      chip.id = `approvalOptChip-${key}`;
      chip.setAttribute('aria-expanded', 'false');

      const labelSpan = document.createElement('span');
      labelSpan.textContent = defaultLabel;
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'approval-opt-badge hidden';
      const chevSpan = document.createElement('span');
      chevSpan.className = 'approval-opt-chevron';
      chevSpan.setAttribute('aria-hidden', 'true');
      chevSpan.textContent = '▾';
      chip.append(labelSpan, badgeSpan, chevSpan);

      const panel = document.createElement('div');
      panel.className = 'approval-opt-panel';
      panel.id = `approvalOptPanel-${key}`;
      panel.dataset.optOpen = 'false';

      elements.filter(Boolean).forEach((el) => panel.append(el));
      chip.setAttribute('aria-controls', panel.id);

      chip.addEventListener('click', () => {
        if (chip.getAttribute('aria-disabled') === 'true') return;
        manualOpen[key] = !manualOpen[key];
        syncBottomOptions();
      });

      chipBar.append(chip);
      panelsWrap.append(panel);
      return { key, chip, labelSpan, badgeSpan, chevSpan, panel };
    }

    const slots = {
      adj: createOptionSlot('adj', '⚖️ 증액·감액', [adjEl]),
      rel: createOptionSlot('rel', '🔗 관련 품의서·원결재', [relEl]),
      inv: createOptionSlot('inv', '📦 재고 입고 반영', [invEl]),
      proxy: createOptionSlot('proxy', '🔄 대리 상신', [proxyDetailsEl, proxyTargetEl]),
    };

    function getAdjustmentMode() {
      const checked = form.querySelector('input[name="expenseAdjustmentMode"]:checked');
      return checked ? String(checked.value || 'new') : 'new';
    }

    function syncBottomOptions() {
      const isPermReq = document.body.classList.contains('permission-request-mode');
      const isExpense = catSelect.value === '지출결의';
      const adjMode = getAdjustmentMode();
      const adjActive = adjMode !== 'new';

      const relHasValue = Boolean(
        String($('relDocId')?.value || '').trim() ||
        String($('relDocSelect')?.value || '').trim()
      );
      const invChecked = Boolean($('inventoryPurchaseEnabled')?.checked);
      const proxyChecked = Boolean($('chkProxy')?.checked);

      const available = {
        adj: isAvailable(adjEl),
        rel: isAvailable(relEl),
        inv: isAvailable(invEl),
        proxy: isAvailable(proxyDetailsEl) && isNativeVisible(proxyWrapEl) && !isPermReq,
      };

      // Pre-filled/selected options reveal once; only a required related document stays open.
      const values = {adj:adjActive, rel:relHasValue, inv:invChecked, proxy:proxyChecked};
      const required = available.rel && relEl?.dataset.approvalRelationRequired === 'true';

      // Dynamic label for #divRelDoc (e.g. '취소 대상 출장' / '원결재 찾기' / '관련 근거 (품의서)')
      const relLabelText = String($('relDocLabel')?.textContent || '').trim();
      if (relLabelText) {
        slots.rel.labelSpan.textContent = '🔗 ' + relLabelText;
      }

      const badges = {
        adj: adjMode === 'increase' ? '증액' : adjMode === 'decrease' ? '감액' : '',
        rel: relHasValue ? '연결됨' : (isExpense && adjActive) ? '필수' : '',
        inv: invChecked ? '적용중' : '',
        proxy: proxyChecked ? '사용중' : '',
      };

      let visibleChipCount = 0;
      let visiblePanelCount = 0;

      Object.keys(slots).forEach((key) => {
        const s = slots[key];
        const canShow = available[key];
        if (!canShow) manualOpen[key] = false;
        else if (values[key] && !hadValue[key]) manualOpen[key] = true;
        hadValue[key] = canShow && values[key];

        s.chip.classList.toggle('hidden', !canShow);
        const pinned = key === 'rel' && required;
        const isOpen = canShow && (manualOpen[key] || pinned);
        s.chip.classList.toggle('is-open', isOpen);
        s.chip.classList.toggle('has-value', Boolean(badges[key]));
        s.chip.setAttribute('aria-expanded', String(isOpen));
        if (pinned) s.chip.setAttribute('aria-disabled','true');
        else s.chip.removeAttribute('aria-disabled');
        s.chevSpan.hidden = pinned;
        s.chevSpan.textContent = isOpen ? '▴' : '▾';

        if (badges[key]) {
          s.badgeSpan.textContent = badges[key];
          s.badgeSpan.classList.remove('hidden');
        } else {
          s.badgeSpan.textContent = '';
          s.badgeSpan.classList.add('hidden');
        }

        s.panel.dataset.optOpen = String(isOpen);

        if (key === 'proxy' && isNativeVisible(proxyDetailsEl) && isOpen) {
          if (!proxyDetailsEl.open)proxyDetailsEl.open = true;
        }
        if (key === 'adj' && isOpen) {
          const adjDetails = $('expenseAdjustmentOptions');
          if (adjDetails && adjActive) adjDetails.open = true;
        }

        if (canShow) visibleChipCount++;
        if (isOpen) visiblePanelCount++;
      });

      dock.classList.toggle('hidden', visibleChipCount === 0);
      panelsWrap.classList.toggle('hidden', visiblePanelCount === 0);
    }

    let rafId = 0;
    function scheduleSync() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        renderCategoryMiniTabs();
        renderExpenseSubMiniTabs();
        syncBottomOptions();
      });
    }

    // Observe native select/container mutations made by approval.html
    const observer = new MutationObserver(scheduleSync);
    observer.observe(catSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    if (subSelect) {
      observer.observe(subSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    }
    if ($('approvalTabNav')) {
      observer.observe($('approvalTabNav'), { attributes: true, attributeFilter: ['class'] });
    }
    [adjEl, relEl, invEl, proxyDetailsEl, proxyWrapEl, $('relDocLabel')].filter(Boolean).forEach((el) => {
      observer.observe(el, { attributes: true, attributeFilter: ['class', 'hidden', 'style', 'data-approval-relation-required'], childList: true, characterData: true, subtree: true });
    });
    for(const ancestor of new Set([...nativeAncestors.values()].flat())){
      observer.observe(ancestor,{attributes:true,attributeFilter:['class','hidden','style']});
    }
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    ['change', 'input'].forEach((evt) => form.addEventListener(evt, scheduleSync));
    scheduleSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApprovalComposerUx, { once: true });
  } else {
    mountApprovalComposerUx();
  }
})();
