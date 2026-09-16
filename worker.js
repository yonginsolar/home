const CITIZEN_HOSTS = new Set([
  'yonginsun.kr', 'www.yonginsun.kr', 'erp.yonginsun.kr', 'yonginsun.coopco.kr'
]);
const CITIZEN_PUBLIC_HOSTS = new Set(['yonginsun.kr', 'www.yonginsun.kr']);
const CITIZEN_ORIGIN = 'https://yonginsun.kr';
const COOP_NAME = '용인시민햇빛발전협동조합';
const BRAND_VERSION = '20260916-3';
const IMAGE_PATH = '/shared/sun_share.png';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

const CITIZEN_ROBOTS = `User-agent: *
Allow: /
Disallow: /erp
Disallow: /membermanage
Disallow: /auth_callback
Disallow: /vote
Disallow: /minutes/
Disallow: /bak/

Sitemap: ${CITIZEN_ORIGIN}/sitemap.xml
`;

const CITIZEN_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${CITIZEN_ORIGIN}/</loc></url>
  <url><loc>${CITIZEN_ORIGIN}/signup</loc></url>
</urlset>
`;

function textResponse(request, body, contentType, status = 200) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function shouldNoIndex(hostname, pathname) {
  if (!CITIZEN_PUBLIC_HOSTS.has(hostname)) return true;
  const normalizedPath = pathname.toLowerCase().replace(/\.html$/i, '');
  return ['/erp', '/membermanage', '/auth_callback', '/vote', '/minutes', '/bak', '/terms', '/privacy']
    .some(prefix => normalizedPath === prefix || normalizedPath.startsWith(prefix + '/'));
}

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
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!CITIZEN_HOSTS.has(hostname)) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === '/robots.txt') {
      const body = CITIZEN_PUBLIC_HOSTS.has(hostname) ? CITIZEN_ROBOTS : 'User-agent: *\nDisallow: /\n';
      return textResponse(request, body, 'text/plain; charset=utf-8');
    }
    if (url.pathname === '/sitemap.xml') {
      if (CITIZEN_PUBLIC_HOSTS.has(hostname)) {
        return textResponse(request, CITIZEN_SITEMAP, 'application/xml; charset=utf-8');
      }
      return textResponse(request, 'Not Found\n', 'text/plain; charset=utf-8', 404);
    }
    if (url.pathname === '/rss.xml' || url.pathname === '/feed.xml') {
      return textResponse(request, 'Not Found\n', 'text/plain; charset=utf-8', 404);
    }
    if (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png') {
      const iconUrl = new URL(request.url);
      iconUrl.pathname = IMAGE_PATH;
      return env.ASSETS.fetch(new Request(iconUrl, request));
    }
    const pathLeaf = url.pathname.split('/').pop() || '';
    const headRequest = request.method === 'HEAD';
    let assetRequest = request;
    if (!pathLeaf.includes('.') || /\.html?$/i.test(pathLeaf)) {
      const headers = new Headers(request.headers);
      headers.delete('if-none-match');
      headers.delete('if-modified-since');
      assetRequest = new Request(request, {method: headRequest ? 'GET' : request.method, headers});
    }
    const response = await env.ASSETS.fetch(assetRequest);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return response;
    if (headRequest) {
      const headers = new Headers(response.headers);
      headers.delete('etag');
      headers.delete('content-length');
      headers.set('X-Citizen-Brand-Version', BRAND_VERSION);
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      if (shouldNoIndex(hostname, url.pathname)) {
        headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      }
      return new Response(null, {status: response.status, statusText: response.statusText, headers});
    }
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
    if (shouldNoIndex(hostname, url.pathname)) {
      rewritten.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    }
    return rewritten;
  }
};
