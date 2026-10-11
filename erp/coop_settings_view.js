/* v1.0.1 — Separate presentation, shared fields and existing authorization/save paths. */
(function (global) {
  'use strict';
  const isPage = new URLSearchParams(global.location.search).get('section') === 'settings';
  let baseline = null;
  function fingerprint() {
    const root = document.getElementById('settingsModal');
    if (!root) return null;
    // Annual settings have their own dirty/save guard. Query controls and derived outputs
    // must not turn a simple tab/year change into an unsaved company-settings warning.
    return JSON.stringify([...root.querySelectorAll('input,select,textarea')]
      .filter(node => !node.readOnly && !node.hasAttribute('data-erp-query-control')
        && !node.closest('#setTax,#setAdvanced,#settingTargetYearRow')
        && !['button','submit','reset'].includes(node.type))
      .map((node, index) => [node.id || node.name || index, node.type,
        node.type === 'file' ? [...node.files].map(file => [file.name,file.size,file.type,file.lastModified])
          : ['checkbox','radio'].includes(node.type) ? node.checked
          : node.multiple ? [...node.selectedOptions].map(option => option.value) : node.value]));
  }
  function checkpoint() {
    if (isPage) baseline = fingerprint();
  }
  function isDirty() {
    return isPage && baseline !== null && fingerprint() !== baseline;
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
    return { show() { document.getElementById('settingsModal').classList.remove('hidden'); }, hide() {} };
  }
  // Baselines stay in this retained page's memory; no settings or files are cached offline.
  global.ERPEmployeeSettingsView = Object.freeze({isPage, prepare, controller, checkpoint, isDirty});
})(window);
