/*
Version: v1.0.2
Change: Canonicalize ERP runtime URLs to /erp/... while still accepting erp.<domain> aliases.
*/
(function attachCoopRouteGuard(global) {
  'use strict';

  function isLocalHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function getBaseHostname(hostname) {
    return String(hostname || '')
      .trim()
      .replace(/^www\./i, '')
      .replace(/^erp\./i, '');
  }

  function buildSiteOrigins(locationLike) {
    const loc = locationLike || global.location;
    const protocol = loc.protocol || 'https:';
    const hostname = String(loc.hostname || '').trim();
    const port = loc.port ? `:${loc.port}` : '';
    const origins = new Set([loc.origin]);

    if (isLocalHostname(hostname)) {
      const bareOrigin = `${protocol}//${hostname || 'localhost'}${port}`;
      const erpBaseUrl = new URL('/erp/', `${bareOrigin}/`).href;
      origins.add(`${protocol}//localhost${port}`);
      origins.add(`${protocol}//127.0.0.1${port}`);
      return {
        currentOrigin: loc.origin,
        publicOrigin: loc.origin,
        erpOrigin: loc.origin,
        bareOrigin,
        erpBaseUrl,
        allowOrigins: Array.from(origins)
      };
    }

    const baseHostname = getBaseHostname(hostname);
    const publicOrigin = `${protocol}//www.${baseHostname}${port}`;
    const erpOrigin = `${protocol}//erp.${baseHostname}${port}`;
    const bareOrigin = `${protocol}//${baseHostname}${port}`;
    const erpBaseUrl = new URL('/erp/', `${bareOrigin}/`).href;

    origins.add(publicOrigin);
    origins.add(erpOrigin);
    origins.add(bareOrigin);

    return {
      currentOrigin: loc.origin,
      publicOrigin,
      erpOrigin,
      bareOrigin,
      erpBaseUrl,
      allowOrigins: Array.from(origins)
    };
  }

  function remapLegacyErpPathDestination(dest, locationLike) {
    if (!(dest instanceof URL)) return dest;
    const origins = buildSiteOrigins(locationLike);
    const path = String(dest.pathname || '').trim();
    const erpBaseUrl = String(origins.erpBaseUrl || '').trim();
    const isLegacyPublicErpPath = (
      dest.origin === origins.publicOrigin ||
      dest.origin === origins.bareOrigin ||
      dest.origin === origins.currentOrigin
    ) && (path === '/erp' || path === '/erp/' || path.startsWith('/erp/'));

    if (isLegacyPublicErpPath && erpBaseUrl) {
      const mapped = new URL(erpBaseUrl);
      mapped.pathname = path.replace(/\/{2,}/g, '/');
      mapped.search = dest.search;
      mapped.hash = dest.hash;
      return mapped;
    }

    const isLegacyErpOriginPath = dest.origin === origins.erpOrigin;
    if (!isLegacyErpOriginPath || !erpBaseUrl) return dest;

    const mapped = new URL(erpBaseUrl);
    const strippedPath = path === '/' ? '/' : `/erp/${path.replace(/^\/+/, '')}`;
    mapped.pathname = strippedPath.replace(/\/{2,}/g, '/');
    mapped.search = dest.search;
    mapped.hash = dest.hash;
    return mapped;
  }

  function buildFallbackUrl(fallback, locationLike) {
    const loc = locationLike || global.location;
    const rawFallback = fallback || '/';
    try {
      return new URL(rawFallback, loc.origin);
    } catch (_) {
      return new URL('/', loc.origin);
    }
  }

  function tryNormalizeDestination(raw, options) {
    const opts = options || {};
    const loc = opts.currentLocation || global.location;
    const fallbackUrl = buildFallbackUrl(opts.fallback, loc);
    if (!raw) return opts.returnFallback ? fallbackUrl : null;

    try {
      let dest = new URL(raw, loc.origin);
      dest = remapLegacyErpPathDestination(dest, loc);
      const origins = buildSiteOrigins(loc);
      if (!origins.allowOrigins.includes(dest.origin)) {
        return opts.returnFallback ? fallbackUrl : null;
      }
      return dest;
    } catch (_) {
      return opts.returnFallback ? fallbackUrl : null;
    }
  }

  function normalizeDestination(raw, options) {
    const dest = tryNormalizeDestination(raw, Object.assign({}, options, { returnFallback: true }));
    return dest ? dest.href : buildFallbackUrl((options || {}).fallback, (options || {}).currentLocation || global.location).href;
  }

  function buildSiblingPageUrl(pageName, extraParams, options) {
    const opts = options || {};
    const loc = opts.currentLocation || global.location;
    const rawName = String(pageName || '').trim() || '';
    const target = new URL(rawName || './', loc.href);
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      target.searchParams.set(key, String(value));
    });
    return target.href;
  }

  function buildAppPageUrl(pathName, options) {
    const opts = options || {};
    const loc = opts.currentLocation || global.location;
    const origins = buildSiteOrigins(loc);
    const app = String(opts.app || '').trim().toLowerCase();
    let baseHref = `${loc.origin}/`;
    if (app === 'erp') {
      baseHref = origins.erpBaseUrl || `${loc.origin.replace(/\/+$/, '')}/erp/`;
    } else if (app === 'public') {
      baseHref = `${(origins.publicOrigin || loc.origin).replace(/\/+$/, '')}/`;
    } else if (app === 'bare') {
      baseHref = `${(origins.bareOrigin || loc.origin).replace(/\/+$/, '')}/`;
    }

    const rawPath = String(pathName || '').trim();
    const normalizedPath = app === 'erp'
      ? rawPath.replace(/^\/+/, '') || ''
      : (rawPath.startsWith('/') ? rawPath : `/${rawPath || ''}`);
    const target = new URL(normalizedPath || './', baseHref);
    Object.entries(opts.params || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      target.searchParams.set(key, String(value));
    });
    return target.href;
  }

  function isErpDestination(raw, options) {
    const loc = (options || {}).currentLocation || global.location;
    const dest = tryNormalizeDestination(raw, Object.assign({}, options, { returnFallback: false }));
    if (!dest) return false;
    const origins = buildSiteOrigins(loc);
    if (dest.origin === origins.erpOrigin) return true;
    return dest.pathname === '/erp' || dest.pathname === '/erp/' || dest.pathname.startsWith('/erp/');
  }

  global.CoopRouteGuard = {
    buildSiteOrigins,
    buildSiblingPageUrl,
    buildAppPageUrl,
    isErpDestination,
    normalizeDestination,
    remapLegacyErpPathDestination,
    tryNormalizeDestination
  };
})(window);
