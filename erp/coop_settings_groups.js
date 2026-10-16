/* v1.0.0 — Two setting categories; move original controls without replacing drafts. */
(function (root) {
  'use strict';
  let lastBusiness = '#setBusinessCommon';
  const get = id => document.getElementById(id);
  function current() { return get('settingTab')?.querySelector('.nav-link.active')?.getAttribute('href') || '#setCompany'; }
  function paint() {
    const selected = current(), basic = selected === '#setCompany';
    if (!basic) lastBusiness = selected;
    const nav = get('settingTab'); if (!nav) return;
    nav.hidden = basic;
    for (const button of get('coopSettingCategories').querySelectorAll('button')) {
      const active = (button.dataset.category === 'basic') === basic;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    const annual = ['#setTax', '#setAdvanced'].includes(selected);
    if (get('settingTargetYearRow')) get('settingTargetYearRow').hidden = !annual;
    if (get('companySettingsFooter')) get('companySettingsFooter').hidden = annual;
  }
  function select(category) {
    const nav = get('settingTab'); if (!nav) return;
    let link = nav.querySelector('a[href="' + (category === 'basic' ? '#setCompany' : lastBusiness) + '"]');
    if (!link || (category !== 'basic' && (link.parentElement.hidden || link.parentElement.classList.contains('d-none')))) link = nav.querySelector('a[href="#setBusinessCommon"]');
    root.bootstrap.Tab.getOrCreateInstance(link).show(); paint();
  }
  function sync() {
    const nav = get('settingTab'), company = get('setCompany'); if (!nav || !company) return;
    if (!get('coopSettingCategories')) {
      const bar = document.createElement('div'); bar.id = 'coopSettingCategories';
      bar.className = 'coop-setting-categories mb-3'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '조합 설정 분류');
      for (const [category, title] of [['basic', '조합 기본정보'], ['business', '업무 운영 설정']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-primary';
        button.textContent = title; button.dataset.category = category; button.dataset.workspaceSubmenu = '';
        button.onclick = () => select(category); bar.append(button);
      }
      nav.before(bar);
      // Category first, business tabs second, and year controls only within that context.
      if (get('settingTargetYearRow')) nav.after(get('settingTargetYearRow'));
      nav.addEventListener('shown.bs.tab', paint);
    }
    if (!get('setBusinessCommon')) {
      const item = document.createElement('li'); item.className = 'nav-item';
      const link = document.createElement('a'); link.className = 'nav-link'; link.href = '#setBusinessCommon';
      link.dataset.bsToggle = 'tab'; link.textContent = '업무 공통'; item.append(link); nav.prepend(item);
      const pane = document.createElement('div'); pane.id = 'setBusinessCommon'; pane.className = 'tab-pane fade';
      const row = document.createElement('div'); row.className = 'row g-2'; row.id = 'coopBusinessSettingsFields'; pane.append(row);
      company.parentElement.append(pane);
    }
    // Original nodes, IDs, listeners and File objects survive every category change.
    const target = get('coopBusinessSettingsFields');
    const lunch = get('companyLunchHeading')?.closest('section')?.parentElement;
    const permission = get('coopPermissionDefaultsButton')?.closest('section');
    if (permission && permission.parentElement.id !== 'coopPermissionDefaultsWrap') {
      const wrap = document.createElement('div'); wrap.className = 'col-12'; wrap.id = 'coopPermissionDefaultsWrap';
      permission.before(wrap); wrap.append(permission);
    }
    for (const card of [lunch, get('hrStructureSettingsCard'), get('coopPermissionDefaultsWrap'), get('approvalLineSettingsCard'), get('telegramApprovalSettingsCard')]) {
      if (card && card.parentElement !== target) target.append(card);
    }
    nav.querySelector('a[href="#setCompany"]').parentElement.hidden = true;
    nav.querySelector('a[href="#setAdvanced"]').textContent = '조합별 업무 기준';
    paint();
  }
  root.ERPCoopSettingsGroups = Object.freeze({sync, select});
})(window);
