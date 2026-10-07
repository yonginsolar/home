// Dedicated public monitor host. No ERP assets, credentials or arbitrary proxy URLs.
const PROFILE = Object.freeze({
  hostname: 'monitor.hcrec.kr',
  origin: 'https://monitor.hcrec.kr',
  name: '화성시민재생에너지발전협동조합',
  title: '화성시민재생에너지발전협동조합 발전 현황',
  description: '화성시민재생에너지발전협동조합이 운영하는 태양광 발전소의 발전 현황을 확인하세요.',
  version: '20261007-1'
});
const SOURCE = 'https://minho-kim.github.io/hwaseong-solar-monitor/';
const FILES = new Map([
  ['/', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
  ['/favicon.svg', 'favicon.svg'], ['/manifest.webmanifest', 'manifest.webmanifest']
]);
const NOINDEX = 'noindex, nofollow, noarchive';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function headers(type, cache = 'public, max-age=300') {
  return new Headers({
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=86400',
    'X-Robots-Tag': NOINDEX,
    'X-Tenant-Profile': 'hwaseong-monitor',
    'X-Tenant-Metadata-Version': PROFILE.version
  });
}

function text(request, body, status = 200) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status, headers: headers('text/plain; charset=utf-8', 'no-store')
  });
}

function metadata() {
  const meta = (kind, name, value) => `<meta ${kind}="${name}" content="${escapeHtml(value)}">`;
  return '<title>' + escapeHtml(PROFILE.title) + '</title>'
    + '<link rel="canonical" href="' + PROFILE.origin + '/">'
    + meta('name', 'description', PROFILE.description) + meta('name', 'robots', NOINDEX)
    + meta('name', 'application-name', PROFILE.title)
    + meta('name', 'coop-tenant-profile', 'hwaseong-monitor')
    + meta('name', 'coop-tenant-name', PROFILE.name)
    + meta('name', 'tenant-metadata-version', PROFILE.version)
    + meta('property', 'og:type', 'website') + meta('property', 'og:site_name', PROFILE.name)
    + meta('property', 'og:title', PROFILE.title) + meta('property', 'og:description', PROFILE.description)
    + meta('property', 'og:url', PROFILE.origin + '/') + meta('property', 'og:image', PROFILE.origin + '/share.png')
    + meta('property', 'og:image:type', 'image/png') + meta('property', 'og:image:width', '512')
    + meta('property', 'og:image:height', '512') + meta('property', 'og:image:alt', PROFILE.name + ' 태양')
    + meta('name', 'twitter:card', 'summary') + meta('name', 'twitter:title', PROFILE.title)
    + meta('name', 'twitter:description', PROFILE.description) + meta('name', 'twitter:image', PROFILE.origin + '/share.png');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() !== PROFILE.hostname) {
      return new Response(request.method === 'HEAD' ? null : 'Not Found\n', {
        status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX, 'Cache-Control': 'no-store' }
      });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      const response = text(request, 'Method Not Allowed\n', 405);
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    }
    if (url.protocol !== 'https:') return Response.redirect(PROFILE.origin + url.pathname, 308);
    if (['/index', '/index.html'].includes(url.pathname)) return Response.redirect(PROFILE.origin + '/', 308);
    if (url.pathname === '/robots.txt') return text(request, 'User-agent: *\nDisallow: /\n');
    if (url.pathname === '/favicon.ico') return Response.redirect(PROFILE.origin + '/favicon.svg', 307);
    const file = FILES.get(url.pathname);
    if (!file && url.pathname !== '/share.png') return text(request, 'Not Found\n', 404);

    // Do not forward incoming cookies, Authorization, query values or URLs.
    // The monitor's browser reads the existing public-only Supabase function directly.
    const target = url.pathname === '/share.png'
      ? 'https://hcrec.kr/shared/sun_share.png' : SOURCE + file;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const upstream = await fetch(target, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Accept: url.pathname === '/' ? 'text/html' : '*/*' }
      });
      if (!upstream.ok) return text(request, 'Temporarily Unavailable\n', 503);
      const type = upstream.headers.get('Content-Type') || 'application/octet-stream';
      const resultHeaders = headers(type, url.pathname === '/' ? 'public, max-age=0, must-revalidate' : 'public, max-age=300');
      if (url.pathname !== '/') return new Response(request.method === 'HEAD' ? null : upstream.body, { headers: resultHeaders });
      if (!type.toLowerCase().includes('text/html')) return text(request, 'Temporarily Unavailable\n', 503);
      resultHeaders.set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://hcrec.kr https://www.hcrec.kr https://erp.hcrec.kr");
      const rewritten = new HTMLRewriter()
        .on('head', { element(element) { element.prepend(metadata(), { html: true }); } })
        .on('head title, head link[rel="canonical"], head link[rel="alternate"], head script[type="application/ld+json"]', {
          element(element) { element.remove(); }
        })
        .on('head meta', { element(element) {
          const name = (element.getAttribute('name') || element.getAttribute('property') || '').toLowerCase();
          if (name.startsWith('og:') || name.startsWith('twitter:') || [
            'description', 'robots', 'application-name', 'naver-site-verification',
            'coop-tenant-profile', 'coop-tenant-name', 'tenant-metadata-version'
          ].includes(name)) element.remove();
        } }).transform(new Response(upstream.body, { headers: resultHeaders }));
      return request.method === 'HEAD' ? new Response(null, { headers: resultHeaders }) : rewritten;
    } catch {
      return text(request, 'Temporarily Unavailable\n', 503);
    } finally {
      clearTimeout(timeout);
    }
  }
};
