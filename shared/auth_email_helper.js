/*
Version: v1.0.0
Change: Attach the current public/ERP host to Supabase email OTP requests so the server can select the correct cooperative email brand.
*/
(function attachCoopAuthEmail(global) {
  'use strict';

  function normalizeHostname(value) {
    return String(value || '').trim().toLowerCase().replace(/\.$/, '');
  }

  function isLocalHostname(value) {
    const host = normalizeHostname(value);
    return host === 'localhost'
      || host === '127.0.0.1'
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  }

  function getRuntimeHostname(locationLike) {
    const loc = locationLike || global.location;
    const routeGuard = global.CoopRouteGuard;
    const app = String(global.__COOP_ROUTE_APP__ || '').trim().toLowerCase();
    if (routeGuard) {
      const getter = app === 'erp'
        ? routeGuard.getErpRuntimeHost
        : routeGuard.getPublicRuntimeHost;
      if (typeof getter === 'function') {
        const routedHost = normalizeHostname(getter(loc));
        if (routedHost) return routedHost;
      }
    }
    return normalizeHostname(loc && loc.hostname);
  }

  function getRedirectUrl(options) {
    const opts = options || {};
    const loc = opts.location || global.location;
    const actualHost = normalizeHostname(loc && loc.hostname);
    const runtimeHost = getRuntimeHostname(loc);
    const target = new URL(String(opts.url || loc.href), loc.href);

    if (runtimeHost && runtimeHost !== actualHost && isLocalHostname(actualHost)) {
      target.protocol = 'https:';
      target.hostname = runtimeHost;
      target.port = '';
    }

    target.username = '';
    target.password = '';
    target.search = '';
    target.hash = '';
    return target.href;
  }

  function withOtpOptions(baseOptions, options) {
    return Object.assign({}, baseOptions || {}, {
      emailRedirectTo: getRedirectUrl(options)
    });
  }

  global.CoopAuthEmail = Object.freeze({
    getRedirectUrl,
    getRuntimeHostname,
    withOtpOptions
  });
})(window);
