/* ERP persistent workspace boot v1.0.0. Navigation only; no credentials or permission cache. */
(() => {
  'use strict';
  const pages = new Set(['approval','mypage','accounting','admin_employee','admin_member','participation_analytics',
    'participation','quiz_admin','proposal_builder','officials_admin','governance','audit_logs','permissions',
    'service_contracts','festival_receipts','power_monitor_admin','platform_admin','sun_income_village',
    'village_energy_monthly','village_company_info','employment_contracts','hr_insurance','officials_signature_admin','vote_hub']);
  function route(value) {
    try {
      const target = new URL(value, location.href);
      if (target.origin !== location.origin || target.username || target.password) return null;
      let path = target.pathname.replace(/\.html$/, '').replace(/\/$/, '');
      if (/^erp\./.test(location.hostname) && /^\/[^/]+$/.test(path)) path = '/erp' + path;
      const leaf = path.split('/').pop();
      if (!(path === '/erp/' + leaf && pages.has(leaf))
        && !/^\/minutes\/(?:meeting_workspace|admin_minutes)$/.test(path)
        && !/^\/vote\/(?:admin|admin_setup|poll_admin|poll_setup)$/.test(path)) return null;
      return path + '.html' + target.search + target.hash;
    } catch (_) { return null; }
  }
  function address(view) {
    const target = new URL('/erp/workspace.html', location.origin);
    target.searchParams.set('view', view);
    return target.href;
  }
  window.ErpWorkspaceRoute = {route, address};
  if (window.top !== window.self || /\/erp\/workspace(?:\.html)?\/?$/.test(location.pathname)) return;
  const current = route(location.href);
  if (current) location.replace(address(current));
})();
