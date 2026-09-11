/*
Version: v1.0.1
Change: Use the shared sun favicon across cooperative modules.
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
  favicon.type = 'image/svg+xml';
  favicon.sizes = 'any';
  favicon.href = '/shared/sun_favicon.svg?v=1.0.0';
  favicon.dataset.tenantFavicon = 'sun';
  document.head.appendChild(favicon);

  global.CoopTenantHead = Object.freeze({
    host,
    isCitizenTenant,
    coopName: isCitizenTenant ? coopName : ''
  });
})(window);
