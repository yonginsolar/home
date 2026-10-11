/* v1.0.0 — Separate presentation, shared fields and existing authorization/save paths. */
(function (global) {
  'use strict';
  const isPage = new URLSearchParams(global.location.search).get('section') === 'settings';
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
  global.ERPEmployeeSettingsView = Object.freeze({isPage, prepare, controller});
})(window);
