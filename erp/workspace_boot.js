/* ERP persistent workspace boot v1.0.5. Retain the ERP document box. */
(() => {
  'use strict';
  const pages = new Set(['approval','mypage','accounting','admin_employee','admin_member','participation_analytics',
    'participation','quiz_admin','proposal_builder','officials_admin','governance','audit_logs','permissions',
    'service_contracts','festival_receipts','power_monitor_admin','coop_power_plants','platform_admin','sun_income_village',
    'village_energy_monthly','village_company_info','employment_contracts','hr_insurance','officials_signature_admin','vote_hub','initial_setup','document_retention','registry','registry_hub','registry_guide']);
  const documentBox = '/minutes/minutes_view.html?erpWorkspace=documents';
  const documentBoxParameters = new Set(['erpWorkspace','noticeId','libraryId','tab','minuteId','id']);
  function isDocumentBox(value) {
    try {
      const target = new URL(value, location.href);
      const params = target.searchParams;
      return target.origin === location.origin && !target.username && !target.password
        && /^\/minutes\/minutes_view(?:\.html)?\/?$/.test(target.pathname)
        && params.get('erpWorkspace') === 'documents'
        && [...params.keys()].every(key => documentBoxParameters.has(key) && params.getAll(key).length === 1);
    } catch (_) { return false; }
  }
  function route(value) {
    try {
      const target = new URL(value, location.href);
      if (target.origin !== location.origin || target.username || target.password) return null;
      if (isDocumentBox(target)) return '/minutes/minutes_view.html' + target.search + target.hash;
      let path = target.pathname.replace(/\.html$/, '').replace(/\/$/, '');
      if (/^erp\./.test(location.hostname) && /^\/[^/]+$/.test(path)) path = '/erp' + path;
      const leaf = path.split('/').pop();
      if (!(path === '/erp/' + leaf && pages.has(leaf))
        && !/^\/minutes\/(?:meeting_workspace|admin_minutes)$/.test(path)
        && !/^\/vote\/(?:admin|admin_setup|poll_admin|poll_setup|results)$/.test(path)) return null;
      // Old cash-sale menu links used v only for asset cache busting. It must
      // not create another held editor. Keep event/work/hash and all other tasks.
      if (path === '/erp/festival_receipts' && target.searchParams.has('v')) target.searchParams.delete('v');
      return path + '.html' + target.search + target.hash;
    } catch (_) { return null; }
  }
  function address(view) {
    const target = new URL('/erp/workspace', location.origin);
    target.searchParams.set('view', view);
    return target.href;
  }
  window.ErpWorkspaceRoute = {route, address, documentBox, isDocumentBox};
  if (window.top !== window.self || /\/erp\/workspace(?:\.html)?\/?$/.test(location.pathname)) return;
  const current = route(location.href);
  if (current) location.replace(address(current));
})();
