/* v1.0.2 — Retained settings drafts and scoped read recovery. */
(function (global) {
  'use strict';
  const isPage = new URLSearchParams(global.location.search).get('section') === 'settings';
  let baseline = null;
  let entryFocused = false;
  function fields() {
    const root = document.getElementById('settingsModal');
    if (!root) return [];
    // Annual settings have their own dirty/save guard. Query controls and derived outputs
    // must not turn a simple tab/year change into an unsaved company-settings warning.
    return [...root.querySelectorAll('input,select,textarea')]
      .filter(node => !node.readOnly && !node.hasAttribute('data-erp-query-control')
        && !node.closest('#setTax,#setAdvanced,#settingTargetYearRow')
        && !['button','submit','reset'].includes(node.type));
  }
  function key(node) {
    const parent=node.closest('[id]')===node?node.parentElement.closest('[id]'):node.closest('[id]');
    return node.id || (parent?.id || 'settings') + ':' + [...parent.querySelectorAll('input,select,textarea')].indexOf(node);
  }
  function value(node) {
    return node.type === 'file' ? [...node.files].map(file => [file.name,file.size,file.type,file.lastModified])
      : ['checkbox','radio'].includes(node.type) ? node.checked
      : node.multiple ? [...node.selectedOptions].map(option => option.value) : node.value;
  }
  function fingerprint() {
    return fields().map(node=>[key(node),node.type,value(node)]);
  }
  function checkpoint() {
    if (isPage) baseline = fingerprint();
  }
  function checkpointSection(selector) {
    if (!isPage || baseline === null) return;
    const changed=fields().filter(node=>node.closest(selector));
    const keys=new Set(changed.map(key));
    const groups=[...document.querySelectorAll(selector)].flatMap(node=>[node.id,...[...node.querySelectorAll('[id]')].map(child=>child.id)]).filter(Boolean);
    baseline=baseline.filter(row=>!keys.has(row[0])&&!groups.some(id=>String(row[0]).startsWith(id+':')));
    baseline.push(...changed.map(node=>[key(node),node.type,value(node)]));
  }
  function isDirty() {
    const stable=rows=>JSON.stringify([...rows].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    return isPage && baseline !== null && stable(fingerprint()) !== stable(baseline);
  }
  function capture() {
    return {values:fields().map(node=>({key:key(node),value:value(node),type:node.type})),
      rows:['hrDepartmentCatalogList','hrPositionCatalogList','workforceLiteLeaveTypeList'].map(id=>({id,html:document.getElementById(id)?.innerHTML}))};
  }
  function restore(draft) {
    draft.rows.forEach(({id,html})=>{const node=document.getElementById(id);if(node&&html!==undefined)node.innerHTML=html;});
    const nodes=new Map(fields().map(node=>[key(node),node]));
    draft.values.forEach(row=>{const node=nodes.get(row.key);if(!node||row.type==='file')return;
      if(['checkbox','radio'].includes(row.type))node.checked=row.value;
      else if(node.multiple)[...node.options].forEach(option=>{option.selected=row.value.includes(option.value);});
      else node.value=row.value;
    });
  }
  function prepare() {
    if (!isPage) return;
    const root = document.getElementById('settingsModal');
    root.className = 'main-card erp-coop-settings hidden';
    root.removeAttribute('tabindex');
    root.querySelector('.modal-dialog').className = 'coop-settings-content';
    root.querySelector('.modal-content').className = 'coop-settings-content';
    root.querySelector('.modal-header').className = 'd-flex align-items-center mb-3';
    root.querySelector('.btn-close').hidden = true;
    root.querySelector('.modal-title').id = 'coopSettingsPageTitle';
    root.querySelector('.modal-body').className = 'coop-settings-body';
    document.body.classList.add('erp-page-coop-settings');
    document.title = '조합 설정';
    const loadingTitle = document.querySelector('#hrLoadingScreen .fw-bold');
    if (loadingTitle) loadingTitle.textContent = '조합 설정을 준비하고 있습니다';
  }
  function controller(modal) {
    if (!isPage) return modal;
    // The same form is a page here: saving does not close it or create a second copy.
    return { show() {
      document.getElementById('settingsModal').classList.remove('hidden');
      if (!entryFocused && new URLSearchParams(global.location.search).get('focus') === 'capital') {
        entryFocused = true;
        const heading=document.getElementById('companyCapitalHeading');
        heading?.scrollIntoView({block:'center',behavior:'auto'});
        heading?.closest('section')?.querySelector('button')?.focus({preventScroll:true});
      }
    }, hide() {} };
  }
  // Baselines stay in this retained page's memory; no settings or files are cached offline.
  global.ERPEmployeeSettingsView = Object.freeze({isPage, prepare, controller, checkpoint, checkpointSection, isDirty, capture, restore});
})(window);
