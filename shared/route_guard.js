/*
Version: v1.1.5
Change: Allow private LAN development hosts to use local public/ERP host overrides for mobile device QA.
*/
(function attachCoopRouteGuard(global) {
  'use strict';

  const LOCAL_PUBLIC_HOST_PARAM = 'public_host';
  const LOCAL_PUBLIC_HOST_OVERRIDE_KEY = 'local_public_host_override_v1';
  const LOCAL_ERP_HOST_PARAM = 'erp_host';
  const LOCAL_ERP_HOST_OVERRIDE_KEY = 'local_erp_host_override_v1';

  function isLocalHostname(hostname) {
    const normalized = normalizeHostname(hostname);
    return normalized === 'localhost' || normalized === '127.0.0.1' || isPrivateLanHostname(normalized);
  }

  function isPrivateLanHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();
    const parts = normalized.split('.');
    const octets = parts.map((part) => {
      if (!/^\d+$/.test(part)) return NaN;
      return Number(part);
    });
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return false;
    }
    if (octets[0] === 10) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  }

  function normalizeHostname(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
  }

  function getRouteAppHint() {
    return String(global.__COOP_ROUTE_APP__ || '')
      .trim()
      .toLowerCase();
  }

  function readLocalHostOverride(locationLike, paramName, storageKey) {
    const loc = locationLike || global.location;
    const actualHost = normalizeHostname(loc && loc.hostname);
    if (!isLocalHostname(actualHost)) return '';

    let queryOverride = '';
    try {
      const params = new URLSearchParams(String(loc.search || ''));
      queryOverride = normalizeHostname(params.get(paramName));
    } catch (_) {
      queryOverride = '';
    }

    if (queryOverride && !isLocalHostname(queryOverride)) {
      try {
        global.localStorage?.setItem(storageKey, queryOverride);
      } catch (_) {}
      return queryOverride;
    }

    try {
      const stored = normalizeHostname(global.localStorage?.getItem(storageKey));
      if (stored && !isLocalHostname(stored)) return stored;
    } catch (_) {}

    return '';
  }

  function readLocalPublicHostOverride(locationLike) {
    return readLocalHostOverride(locationLike, LOCAL_PUBLIC_HOST_PARAM, LOCAL_PUBLIC_HOST_OVERRIDE_KEY);
  }

  function readLocalErpHostOverride(locationLike) {
    return readLocalHostOverride(locationLike, LOCAL_ERP_HOST_PARAM, LOCAL_ERP_HOST_OVERRIDE_KEY);
  }

  function clearLocalPublicHostOverride() {
    try {
      global.localStorage?.removeItem(LOCAL_PUBLIC_HOST_OVERRIDE_KEY);
    } catch (_) {}
  }

  function clearLocalErpHostOverride() {
    try {
      global.localStorage?.removeItem(LOCAL_ERP_HOST_OVERRIDE_KEY);
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
    const appHint = getRouteAppHint();
    const port = loc.port ? `:${loc.port}` : '';
    const origins = new Set([loc.origin]);
    const currentServesErpPath = pathname === '/erp' || pathname === '/erp/' || pathname.startsWith('/erp/');

    if (isLocalHostname(hostname)) {
      const bareOrigin = `${protocol}//${hostname || 'localhost'}${port}`;
      const erpBaseUrl = new URL(appHint === 'erp' && !currentServesErpPath ? '/' : '/erp/', `${bareOrigin}/`).href;
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
    if (appHint === 'erp') {
      const isLegacyErpHost = /^erp\./i.test(hostname);
      const publicOrigin = isLegacyErpHost ? `${protocol}//www.${baseHostname}${port}` : loc.origin;
      const bareOrigin = isLegacyErpHost ? `${protocol}//${baseHostname}${port}` : loc.origin;
      const erpBaseUrl = new URL(currentServesErpPath ? '/erp/' : '/', `${loc.origin}/`).href;

      origins.add(publicOrigin);
      origins.add(bareOrigin);

      return {
        currentOrigin: loc.origin,
        publicOrigin,
        erpOrigin: loc.origin,
        bareOrigin,
        erpBaseUrl,
        allowOrigins: Array.from(origins)
      };
    }

    const publicOrigin = `${protocol}//www.${baseHostname}${port}`;
    const erpOrigin = `${protocol}//erp.${baseHostname}${port}`;
    const bareOrigin = `${protocol}//${baseHostname}${port}`;
    const isErpHost = /^erp\./i.test(hostname);
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

  function getErpRuntimeHost(locationLike) {
    const loc = locationLike || global.location;
    const actualHost = normalizeHostname(loc && loc.hostname);
    const localOverride = readLocalErpHostOverride(loc);
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
    clearLocalErpHostOverride,
    clearLocalPublicHostOverride,
    getErpRuntimeHost,
    getPublicRuntimeHost,
    isErpDestination,
    normalizeHostname,
    normalizeDestination,
    remapLegacyErpPathDestination,
    tryNormalizeDestination
  };
})(window);
