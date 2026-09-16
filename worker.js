const CITIZEN_HOSTS = new Set([
  'yonginsun.kr', 'www.yonginsun.kr', 'erp.yonginsun.kr', 'yonginsun.coopco.kr'
]);
const COOP_NAME = '용인시민햇빛발전협동조합';
const BRAND_VERSION = '20260916-1';
const IMAGE_PATH = '/shared/sun_share.png';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

function metadata(url) {
  const path = url.pathname.replace(/\/+$/, '').replace(/\.html$/i, '') || '/';
  const erp = url.hostname === 'erp.yonginsun.kr' || path === '/erp' || path.startsWith('/erp/');
  const label = path === '/signup' ? '조합원 가입' : path === '/membermanage' ? '조합원 관리' : erp ? 'ERP' : '';
  const title = label ? label + ' | ' + COOP_NAME : COOP_NAME;
  const description = label ? COOP_NAME + ' ' + label + ' 페이지입니다.' : COOP_NAME + '의 조합 소개, 활동 소식과 조합원 가입 안내를 확인하세요.';
  // Do not leak login/consent tokens or arbitrary query values into social metadata.
  const origin = url.hostname === 'erp.yonginsun.kr' ? 'https://erp.yonginsun.kr' : 'https://yonginsun.kr';
  const canonical = origin + (path === '/index' ? '/' : path);
  const image = 'https://yonginsun.kr' + IMAGE_PATH + '?v=' + BRAND_VERSION;
  const meta = (kind, name, value) => '<meta ' + kind + '="' + name + '" content="' + escapeHtml(value) + '">';
  return '<meta charset="utf-8"><title>' + escapeHtml(title) + '</title>'
    + '<link rel="canonical" href="' + escapeHtml(canonical) + '">'
    + meta('name','description',description)
    + meta('name','application-name',COOP_NAME)
    + meta('name','apple-mobile-web-app-title',COOP_NAME)
    + meta('name','citizen-brand-version',BRAND_VERSION)
    + meta('name','naver-site-verification','f9190043f3e2a3761d1b2546bc2b7998f8aa7c23')
    + meta('property','og:type','website')
    + meta('property','og:site_name',COOP_NAME)
    + meta('property','og:title',title)
    + meta('property','og:description',description)
    + meta('property','og:url',canonical)
    + meta('property','og:image',image)
    + meta('property','og:image:type','image/png')
    + meta('property','og:image:width','512')
    + meta('property','og:image:height','512')
    + meta('property','og:image:alt',COOP_NAME + ' 태양')
    + meta('name','twitter:card','summary')
    + meta('name','twitter:title',title)
    + meta('name','twitter:description',description)
    + meta('name','twitter:image',image)
    + '<link rel="icon" type="image/svg+xml" href="/shared/sun_favicon.svg?v=1.0.0">'
    + '<link rel="apple-touch-icon" href="' + escapeHtml(image) + '">'
    + '<script type="application/ld+json">' + JSON.stringify({
      '@context':'https://schema.org','@type':'Organization',name:COOP_NAME,
      url:'https://yonginsun.kr/',logo:image
    }) + '</script>';
}
class RemoveElementHandler { element(element) { element.remove(); } }
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!CITIZEN_HOSTS.has(url.hostname.toLowerCase().replace(/\.$/, ''))) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png') {
      const iconUrl = new URL(request.url);
      iconUrl.pathname = IMAGE_PATH;
      return env.ASSETS.fetch(new Request(iconUrl, request));
    }
    const pathLeaf = url.pathname.split('/').pop() || '';
    let assetRequest = request;
    if (!pathLeaf.includes('.') || /\.html?$/i.test(pathLeaf)) {
      const headers = new Headers(request.headers);
      headers.delete('if-none-match');
      headers.delete('if-modified-since');
      assetRequest = new Request(request, {headers});
    }
    const response = await env.ASSETS.fetch(assetRequest);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return response;
    const rewritten = new HTMLRewriter()
      .on('head', { element(element) { element.prepend(metadata(url), {html:true}); } })
      .on('head title, head link[rel="canonical"], head link[rel*="icon"], head script[type="application/ld+json"]', new RemoveElementHandler())
      .on('head meta', { element(element) {
        const name = (element.getAttribute('name') || element.getAttribute('property') || '').toLowerCase();
        if (element.hasAttribute('charset') || name.startsWith('og:') || name.startsWith('twitter:') || [
          'description','keywords','application-name','apple-mobile-web-app-title','naver-site-verification','citizen-brand-version'
        ].includes(name)) element.remove();
      } })
      .transform(response);
    // A source-asset ETag is not a validator for a domain-specific transformed head.
    rewritten.headers.delete('etag');
    rewritten.headers.delete('content-length');
    rewritten.headers.set('X-Citizen-Brand-Version', BRAND_VERSION);
    rewritten.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return rewritten;
  }
};
