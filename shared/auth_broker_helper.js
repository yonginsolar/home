/*
Version: v1.0.4
Change: Defer signup auth-state callbacks outside Supabase's auth lock on the signup page.
*/
(function attachAuthBrokerHelper(global) {
  'use strict';

  var EXACT_ALLOWED_HOSTS = {
    'localhost': true,
    '127.0.0.1': true,
    'yonginsolar.kr': true,
    'www.yonginsolar.kr': true,
    'erp.yonginsolar.kr': true,
    'auth.coopco.kr': true
  };

  var ALLOWED_HOST_SUFFIXES = [
    '.yonginsolar.kr',
    '.coopco.kr'
  ];

  var ALLOWED_CALLBACK_PATHS = {
    '/auth_callback': true,
    '/auth_callback.html': true,
    '/erp/auth_callback': true,
    '/erp/auth_callback.html': true
  };

  function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/\.$/, '');
  }

  function getConfig() {
    return global.__AUTH_BROKER_CONFIG__ || {};
  }

  function normalizeProvider(provider) {
    var raw = String(provider || '').trim().toLowerCase();
    if (raw === 'naver') return 'custom:naver';
    return raw;
  }

  function getBrokerOrigin() {
    var origin = String(getConfig().origin || '').trim();
    if (!origin) return '';
    try {
      return new URL(origin).origin;
    } catch (_) {
      return '';
    }
  }

  function isProviderEnabled(provider) {
    var normalized = normalizeProvider(provider);
    var enabledProviders = getConfig().enabledProviders || {};
    if (typeof enabledProviders === 'boolean') return enabledProviders;
    if (Array.isArray(enabledProviders)) {
      return enabledProviders.indexOf(normalized) >= 0;
    }
    return !!enabledProviders[normalized];
  }

  function isModeSupported(mode) {
    var list = getConfig().supportedModes;
    var normalizedMode = String(mode || 'login').trim().toLowerCase();
    if (!Array.isArray(list) || !list.length) return normalizedMode === 'login';
    return list.indexOf(normalizedMode) >= 0;
  }

  function isAllowedHost(hostname) {
    var normalized = normalizeHost(hostname);
    var i;
    if (!normalized) return false;
    if (EXACT_ALLOWED_HOSTS[normalized]) return true;
    for (i = 0; i < ALLOWED_HOST_SUFFIXES.length; i += 1) {
      if (normalized.length > ALLOWED_HOST_SUFFIXES[i].length && normalized.slice(-ALLOWED_HOST_SUFFIXES[i].length) === ALLOWED_HOST_SUFFIXES[i]) {
        return true;
      }
    }
    return false;
  }

  function parseCallbackUrl(raw) {
    try {
      var parsed = new URL(String(raw || ''), global.location && global.location.href ? global.location.href : 'https://auth.coopco.kr/');
      if (!/^https?:$/i.test(parsed.protocol)) return null;
      if (!isAllowedHost(parsed.hostname)) return null;
      if (!ALLOWED_CALLBACK_PATHS[parsed.pathname]) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function buildStartUrl(options) {
    var opts = options || {};
    var provider = normalizeProvider(opts.provider);
    var mode = String(opts.mode || 'login').trim().toLowerCase();
    var brokerOrigin = getBrokerOrigin();
    var callbackUrl = parseCallbackUrl(opts.callback);
    var startUrl;

    if (!brokerOrigin) return '';
    if (!provider || !isProviderEnabled(provider)) return '';
    if (!isModeSupported(mode)) return '';
    if (!callbackUrl) return '';

    startUrl = new URL('/auth_broker_start', brokerOrigin);
    startUrl.searchParams.set('provider', provider);
    startUrl.searchParams.set('mode', mode);
    startUrl.searchParams.set('callback', callbackUrl.href);

    if (opts.app) startUrl.searchParams.set('app', String(opts.app));
    if (opts.scopes) startUrl.searchParams.set('scopes', String(opts.scopes));
    if (opts.queryParams && typeof opts.queryParams === 'object') {
      Object.keys(opts.queryParams).forEach(function (key) {
        var value = opts.queryParams[key];
        if (value === null || value === undefined || value === '') return;
        startUrl.searchParams.set('qp_' + String(key), String(value));
      });
    }

    return startUrl.href;
  }

  function isSignupPageLocation() {
    try {
      var pathname = String(global.location && global.location.pathname || '').toLowerCase();
      return pathname === '/signup' || pathname === '/signup.html';
    } catch (_) {
      return false;
    }
  }

  function installSignupAuthStateCallbackDeferrer() {
    if (!isSignupPageLocation()) return;
    if (!global.supabase || typeof global.supabase.createClient !== 'function') return;
    if (global.supabase.__coopSignupAuthStateDeferrerInstalled) return;

    var originalCreateClient = global.supabase.createClient;
    global.supabase.createClient = function createClientWithSignupAuthDeferrer() {
      var client = originalCreateClient.apply(this, arguments);

      try {
        if (
          client &&
          client.auth &&
          typeof client.auth.onAuthStateChange === 'function' &&
          !client.auth.__coopSignupAuthStateDeferrerInstalled
        ) {
          var originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth);
          client.auth.onAuthStateChange = function onAuthStateChangeOutsideSignupLock(callback) {
            if (typeof callback !== 'function') {
              return originalOnAuthStateChange(callback);
            }

            return originalOnAuthStateChange(function deferSignupAuthStateCallback(event, session) {
              global.setTimeout(function runDeferredSignupAuthStateCallback() {
                try {
                  callback(event, session);
                } catch (error) {
                  console.warn('[auth-broker-helper] deferred signup auth callback failed:', error);
                }
              }, 0);
            });
          };
          client.auth.__coopSignupAuthStateDeferrerInstalled = true;
        }
      } catch (error) {
        console.warn('[auth-broker-helper] signup auth deferrer install failed:', error);
      }

      return client;
    };
    global.supabase.__coopSignupAuthStateDeferrerInstalled = true;
  }
  // End of installSignupAuthStateCallbackDeferrer

  var signupSocialReturnResumeLockedUntil = 0;

  function isSignupSocialReturnLocation() {
    try {
      if (!isSignupPageLocation()) return false;
      return new URLSearchParams(global.location.search || '').has('auth_return');
    } catch (_) {
      return false;
    }
  }

  function triggerSignupSocialReturnResume(reason) {
    var now = Date.now();
    if (!isSignupSocialReturnLocation()) return;
    if (now < signupSocialReturnResumeLockedUntil) return;
    signupSocialReturnResumeLockedUntil = now + 6500;

    global.setTimeout(function () {
      var result = null;
      try {
        if (typeof global.checkCurrentSignupSessionOnLoad === 'function') {
          result = global.checkCurrentSignupSessionOnLoad({
            reason: 'auth-broker-helper:' + String(reason || 'return'),
            showFailure: true
          });
        } else if (typeof global.resumeSignupFromCurrentSession === 'function') {
          result = global.resumeSignupFromCurrentSession('auth-broker-helper:' + String(reason || 'return'));
        }
      } catch (error) {
        console.warn('[auth-broker-helper] signup social return resume failed:', error);
      }

      if (result && typeof result.finally === 'function') {
        result.finally(function () {
          signupSocialReturnResumeLockedUntil = Date.now() + 250;
        });
      } else {
        signupSocialReturnResumeLockedUntil = Date.now() + 250;
      }
    }, 0);
  }

  function attachSignupSocialReturnResumeHooks() {
    if (!global.addEventListener) return;

    global.addEventListener('pageshow', function (event) {
      if (event && event.persisted) triggerSignupSocialReturnResume('pageshow');
    });

    global.addEventListener('focus', function () {
      triggerSignupSocialReturnResume('focus');
    });

    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.hidden) return;
        triggerSignupSocialReturnResume('visibilitychange');
      });
    }
  }

  global.AuthBrokerHelper = {
    getBrokerOrigin: getBrokerOrigin,
    normalizeProvider: normalizeProvider,
    isProviderEnabled: isProviderEnabled,
    parseCallbackUrl: parseCallbackUrl,
    buildStartUrl: buildStartUrl
  };

  installSignupAuthStateCallbackDeferrer();
  attachSignupSocialReturnResumeHooks();
})(window);
