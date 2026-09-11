/*
Version: v1.0.0
Change: Keep the Yongin Citizen Sunlight tenant head metadata neutral and suppress the legacy favicon.
*/
(function applyTenantHead(global) {
  'use strict';

  const host = String(global.location?.hostname || '').trim().toLowerCase().replace(/\.$/, '');
  const citizenHosts = new Set([
    'yonginsun.coopco.kr',
    'yonginsun.kr',
    'www.yonginsun.kr',
    'erp.yonginsun.kr'
  ]);
  const isCitizenTenant = citizenHosts.has(host);
  const oldName = '용인모두의햇빛협동조합';
  const coopName = '용인시민햇빛발전협동조합';
  const currentScript = document.currentScript;
  const keepDefaultFavicon = String(currentScript?.dataset?.defaultFavicon || 'legacy') !== 'none';

  function replaceLegacyText(value) {
    return String(value || '')
      .replaceAll(oldName, coopName)
      .replaceAll('https://www.yonginsolar.kr', global.location.origin)
      .replaceAll('https://yonginsolar.kr', global.location.origin);
  }

  if (isCitizenTenant) {
    global.__PUBLIC_SITE_COOP_NAME__ = coopName;
    global.__CITIZEN_SUNLIGHT_TENANT__ = true;
    document.title = replaceLegacyText(document.title);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = `${global.location.origin}${global.location.pathname || '/'}`;

    document.querySelectorAll('meta[content]').forEach((meta) => {
      const key = String(meta.getAttribute('name') || meta.getAttribute('property') || '').toLowerCase();
      if (key === 'og:image' || key === 'twitter:image' || key === 'naver-site-verification') {
        meta.remove();
        return;
      }
      const content = meta.getAttribute('content');
      if (content) meta.setAttribute('content', replaceLegacyText(content));
    });

    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      script.textContent = replaceLegacyText(script.textContent);
    });
  }

  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  if (isCitizenTenant) {
    favicon.type = 'image/svg+xml';
    favicon.href = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E';
    favicon.dataset.tenantFavicon = 'blank';
    document.head.appendChild(favicon);
  } else if (keepDefaultFavicon) {
    favicon.type = 'image/png';
    favicon.href = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co/storage/v1/object/public/assets/favicon.png';
    document.head.appendChild(favicon);
  }

  global.CoopTenantHead = Object.freeze({
    host,
    isCitizenTenant,
    coopName: isCitizenTenant ? coopName : ''
  });
})(window);
