/*
Version: v1.0.4
Change: Allow configured KakaoTalk/Naver app WebView flows by provider while keeping other in-app browsers blocked.
*/
(function attachBrowserEnvGuard(global) {
  'use strict';

  function getConfig() {
    return global.__BROWSER_ENV_GUARD_CONFIG__ || {};
  }

  function getUserAgent() {
    return String((global.navigator && global.navigator.userAgent) || '');
  }

  function parseMajorVersion(ua, pattern) {
    var match = ua.match(pattern);
    if (!match || !match[1]) return 0;
    return parseInt(String(match[1]).split('.')[0], 10) || 0;
  }

  function isNaverAppBrowser(ua) {
    return /NAVER\(inapp/i.test(ua) || /NAVERAPP/i.test(ua);
  }

  function isKakaoAppBrowser(ua) {
    return /KAKAOTALK/i.test(ua);
  }

  function normalizeProvider(value) {
    var raw = String(value || '').trim().toLowerCase();
    if (raw === 'naver') return 'custom:naver';
    return raw;
  }

  function shouldAllowNaverApp(ua) {
    var config = getConfig();
    var allowedProviders = config.allowNaverAppProviders;
    var currentProvider = '';
    if (!config.allowNaverApp || !isNaverAppBrowser(ua)) return false;
    if (!Array.isArray(allowedProviders) || allowedProviders.length === 0) return true;
    try {
      currentProvider = normalizeProvider(new URLSearchParams(global.location && global.location.search || '').get('provider'));
    } catch (_) {
      currentProvider = '';
    }
    return allowedProviders.map(normalizeProvider).indexOf(currentProvider) >= 0;
  }

  function shouldAllowKakaoApp(ua) {
    var config = getConfig();
    var allowedProviders = config.allowKakaoAppProviders;
    var currentProvider = '';
    if (!config.allowKakaoApp || !isKakaoAppBrowser(ua)) return false;
    if (!Array.isArray(allowedProviders) || allowedProviders.length === 0) return true;
    try {
      currentProvider = normalizeProvider(new URLSearchParams(global.location && global.location.search || '').get('provider'));
    } catch (_) {
      currentProvider = '';
    }
    return allowedProviders.map(normalizeProvider).indexOf(currentProvider) >= 0;
  }

  function shouldAllowConfiguredInAppBrowser(ua) {
    return shouldAllowNaverApp(ua) || shouldAllowKakaoApp(ua);
  }

  function isInAppBrowser(ua) {
    var patterns = [
      /KAKAOTALK/i,
      /NAVER\(inapp/i,
      /NAVERAPP/i,
      /DaumApps/i,
      /; wv\)/i,
      /FBAN/i,
      /FBAV/i,
      /Instagram/i,
      /Line\//i
    ];
    var i;
    for (i = 0; i < patterns.length; i += 1) {
      if (patterns[i].test(ua)) return true;
    }
    return false;
  }

  function detectBrowserFamily(ua) {
    if (/Whale\/([0-9.]+)/i.test(ua)) {
      return { family: 'Whale', version: parseMajorVersion(ua, /Whale\/([0-9.]+)/i) };
    }
    if (/Edg\/([0-9.]+)/i.test(ua)) {
      return { family: 'Edge', version: parseMajorVersion(ua, /Edg\/([0-9.]+)/i) };
    }
    if (/CriOS\/([0-9.]+)/i.test(ua)) {
      return { family: 'Chrome', version: parseMajorVersion(ua, /CriOS\/([0-9.]+)/i) };
    }
    if (/Chrome\/([0-9.]+)/i.test(ua) && !/OPR\/|Whale\/|Edg\//i.test(ua)) {
      return { family: 'Chrome', version: parseMajorVersion(ua, /Chrome\/([0-9.]+)/i) };
    }
    if (/FxiOS\/([0-9.]+)/i.test(ua)) {
      return { family: 'Firefox', version: parseMajorVersion(ua, /FxiOS\/([0-9.]+)/i) };
    }
    if (/Firefox\/([0-9.]+)/i.test(ua)) {
      return { family: 'Firefox', version: parseMajorVersion(ua, /Firefox\/([0-9.]+)/i) };
    }
    if (/Version\/([0-9.]+).*Safari/i.test(ua) && !/Chrome|CriOS|Whale|Edg\//i.test(ua)) {
      return { family: 'Safari', version: parseMajorVersion(ua, /Version\/([0-9.]+)/i) };
    }
    return { family: 'Unknown', version: 0 };
  }

  function isFeatureCompatible() {
    var nav = global.navigator || {};
    return !!(
      global.Promise &&
      global.fetch &&
      global.URL &&
      global.URLSearchParams &&
      global.localStorage &&
      global.Array &&
      global.Array.prototype &&
      global.Array.prototype.some &&
      global.Object &&
      global.Object.entries &&
      global.String &&
      global.String.prototype &&
      global.String.prototype.startsWith &&
      nav.userAgent
    );
  }

  function isBrowserOutdated(info) {
    if (!isFeatureCompatible()) return true;
    if (!info || !info.family) return true;

    if (info.family === 'Safari') return info.version < 14;
    if (info.family === 'Chrome') return info.version < 90;
    if (info.family === 'Edge') return info.version < 90;
    if (info.family === 'Whale') return info.version < 3;
    if (info.family === 'Firefox') return info.version < 90;
    return true;
  }

  function buildReasons() {
    var ua = getUserAgent();
    var info = detectBrowserFamily(ua);
    var configuredInAppAllowed = shouldAllowConfiguredInAppBrowser(ua);
    var reasons = [];

    if (isInAppBrowser(ua) && !configuredInAppAllowed) {
      reasons.push('카카오톡·인스타그램 같은 앱 안 브라우저에서 열려 있습니다.');
    }

    if (!configuredInAppAllowed && isBrowserOutdated(info)) {
      reasons.push('브라우저 버전이 오래되었거나 현재 환경을 지원하지 않습니다.');
    }

    return {
      ua: ua,
      browser: info,
      reasons: reasons
    };
  }

  function shouldBlock() {
    return buildReasons().reasons.length > 0;
  }

  function installStyles() {
    if (document.getElementById('browser-env-guard-style')) return;
    var style = document.createElement('style');
    style.id = 'browser-env-guard-style';
    style.textContent = [
      '.browser-env-guard-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.78);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}',
      '.browser-env-guard-card{width:100%;max-width:520px;background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.25);padding:28px 24px;color:#111827;font-family:\"Pretendard Variable\",\"Pretendard\",-apple-system,sans-serif;}',
      '.browser-env-guard-badge{display:inline-block;font-size:12px;font-weight:700;letter-spacing:-0.02em;color:#b91c1c;background:#fee2e2;border-radius:999px;padding:6px 10px;margin-bottom:14px;}',
      '.browser-env-guard-title{font-size:22px;line-height:1.4;font-weight:800;margin:0 0 12px 0;color:#111827;}',
      '.browser-env-guard-copy{font-size:15px;line-height:1.7;color:#374151;margin:0 0 14px 0;}',
      '.browser-env-guard-list{margin:0 0 16px 18px;padding:0;color:#374151;}',
      '.browser-env-guard-list li{margin:0 0 8px 0;line-height:1.6;}',
      '.browser-env-guard-help{margin-top:16px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb;font-size:14px;line-height:1.7;color:#374151;}',
      '.browser-env-guard-help strong{color:#111827;}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderOverlay() {
    var config = getConfig();
    var details = buildReasons();
    if (!details.reasons.length) return;
    if (document.getElementById('browser-env-guard-overlay')) return;

    installStyles();

    var overlay = document.createElement('div');
    overlay.id = 'browser-env-guard-overlay';
    overlay.className = 'browser-env-guard-overlay';

    var recommended = config.recommendedBrowsers || 'Safari, Chrome, Edge 또는 웨일';
    var actionLabel = config.actionLabel || '로그인과 이메일 인증';

    var badge = document.createElement('div');
    badge.className = 'browser-env-guard-badge';
    badge.appendChild(document.createTextNode('지원되지 않는 브라우저 환경'));

    var title = document.createElement('h2');
    title.className = 'browser-env-guard-title';
    title.appendChild(document.createTextNode(config.title || '안전한 브라우저에서 다시 열어 주세요.'));

    var copy = document.createElement('p');
    copy.className = 'browser-env-guard-copy';
    copy.appendChild(document.createTextNode(
      '현재 브라우저에서는 ' + actionLabel + ' 진행이 어렵습니다. 아래 내용을 확인한 뒤 외부 브라우저의 최신 버전에서 다시 시도해 주세요.'
    ));

    var list = document.createElement('ul');
    list.className = 'browser-env-guard-list';

    var i;
    for (i = 0; i < details.reasons.length; i += 1) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(details.reasons[i]));
      list.appendChild(li);
    }

    var help = document.createElement('div');
    help.className = 'browser-env-guard-help';
    help.innerHTML =
      '<strong>권장 브라우저</strong><br>' +
      recommended +
      '<br><br>' +
      '현재 페이지 주소를 복사해 외부 브라우저에서 직접 열어 진행해 주세요.';

    var card = document.createElement('div');
    card.className = 'browser-env-guard-card';
    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(list);
    card.appendChild(help);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function init() {
    if (!shouldBlock()) return;
    if (document.body) {
      renderOverlay();
      return;
    }
    document.addEventListener('DOMContentLoaded', renderOverlay);
  }

  global.BrowserEnvGuard = {
    buildReasons: buildReasons,
    isBlocked: shouldBlock,
    isInAppBrowser: function () { return isInAppBrowser(getUserAgent()); },
    isKakaoAppBrowser: function () { return isKakaoAppBrowser(getUserAgent()); },
    isNaverAppBrowser: function () { return isNaverAppBrowser(getUserAgent()); },
    init: init
  };

  init();
})(window);
