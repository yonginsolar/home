/* Version: 1.0.0 | 2026-10-06 */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const tabs=['empTab','settingTab','statsTab','memberDetailTab','donationTab','dividendTab',
    'myTab','accTab','rptTab','app-status-tabs','site-content-tabs','partnerInnerTabs'];
  tabs.forEach(id => document.getElementById(id)?.classList.add('erp-stable-tabs'));
  document.querySelectorAll('.nav-tabs, .nav-pills[role="tablist"]').forEach(nav=>nav.classList.add('erp-stable-tabs'));
  ['detailModal','settingsModal','statsModal','memberDetailModal','donationModal','dividendModal'].forEach(id => {
    const modal=document.getElementById(id);
    if (!modal) return;
    modal.classList.add('erp-stable-tab-modal');
    const nav=modal.querySelector('.erp-stable-tabs');
    if(nav) (nav.id==='empTab'?nav.parentElement:nav).classList.add('erp-tab-strip');
  });
});
document.addEventListener('shown.bs.tab', event => {
  const modal = event.target.closest('.erp-stable-tab-modal');
  if (modal) {
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  }
});
