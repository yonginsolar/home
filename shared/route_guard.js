/*
Version: v1.1.2
Change: Keep localhost public QA paths from being mis-remapped into /erp/* while preserving localhost-only public host override support.
*/
(function attachCoopRouteGuard(global) {
  'use strict';

  const LOCAL_PUBLIC_HOST_PARAM = 'public_host';
  const LOCAL_PUBLIC_HOST_OVERRIDE_KEY = 'local_public_host_override_v1';

  function isLocalHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function normalizeHostname(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
  }

  function readLocalPublicHostOverride(locationLike) {
    const loc = locationLike || global.location;
    const actualHost = normalizeHostname(loc && loc.hostname);
    if (!isLocalHostname(actualHost)) return '';

    let queryOverride = '';
    try {
      const params = new URLSearchParams(String(loc.search || ''));
      queryOverride = normalizeHostname(params.get(LOCAL_PUBLIC_HOST_PARAM));
    } catch (_) {
      queryOverride = '';
    }

    if (queryOverride && !isLocalHostname(queryOverride)) {
      try {
        global.localStorage?.setItem(LOCAL_PUBLIC_HOST_OVERRIDE_KEY, queryOverride);
      } catch (_) {}
      return queryOverride;
    }

    try {
      const stored = normalizeHostname(global.localStorage?.getItem(LOCAL_PUBLIC_HOST_OVERRIDE_KEY));
      if (stored && !isLocalHostname(stored)) return stored;
    } catch (_) {}

    return '';
  }

  function clearLocalPublicHostOverride() {
    try {
      global.localStorage?.removeItem(LOCAL_PUBLIC_HOST_OVERRIDE_KEY);
    } catch (_) {}
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
    const hostname = normalizeHostname(loc.hostname);
    const pathname = String(loc.pathname || '').trim();
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
    const isErpHost = /^erp\./i.test(hostname);
    const currentServesErpPath = pathname === '/erp' || pathname === '/erp/' || pathname.startsWith('/erp/');
    let erpBaseUrl = new URL('/erp/', `${loc.origin}/`).href;
    if (isErpHost && !currentServesErpPath) {
      erpBaseUrl = new URL('/', `${loc.origin}/`).href;
    }

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
    const hasDistinctErpOrigin = String(origins.erpOrigin || '') !== String(origins.currentOrigin || '');
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

    const isLegacyErpOriginPath = hasDistinctErpOrigin && dest.origin === origins.erpOrigin;
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

  function getPublicRuntimeHost(locationLike) {
    const loc = locationLike || global.location;
    const actualHost = normalizeHostname(loc && loc.hostname);
    const localOverride = readLocalPublicHostOverride(loc);
    return localOverride || actualHost;
  }

  function buildSupabaseGlobalHeaders(locationLike, extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    const host = getPublicRuntimeHost(locationLike);
    if (host) headers['x-public-host'] = host;
    return headers;
  }

  function createSupabaseClient(supabaseLib, url, key, options) {
    if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
      throw new Error('SUPABASE_LIB_REQUIRED');
    }
    const opts = Object.assign({}, options || {});
    const currentLocation = opts.currentLocation || global.location;
    const globalOptions = Object.assign({}, opts.global || {});
    globalOptions.headers = buildSupabaseGlobalHeaders(currentLocation, globalOptions.headers);
    opts.global = globalOptions;
    delete opts.currentLocation;
    return supabaseLib.createClient(url, key, opts);
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
    buildSupabaseGlobalHeaders,
    createSupabaseClient,
    clearLocalPublicHostOverride,
    getPublicRuntimeHost,
    isErpDestination,
    normalizeHostname,
    normalizeDestination,
    remapLegacyErpPathDestination,
    tryNormalizeDestination
  };
})(window);
