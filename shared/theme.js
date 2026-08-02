(function () {
  'use strict';

  const STORAGE_KEY = 'coop-color-theme';
  const root = document.documentElement;
  const script = document.currentScript;
  const showToggle = script?.dataset.themeToggle !== 'off';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let toggleButton = null;

  const pageKey = window.location.pathname
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '')
    .replace(/\//g, '-') || 'index';
  root.dataset.themePage = pageKey;

  function readStoredTheme() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function writeStoredTheme(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {
      // Storage can be unavailable in private or embedded browser contexts.
    }
  }

  function preferredTheme() {
    return readStoredTheme() || (systemTheme.matches ? 'dark' : 'light');
  }

  function updateThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0b1220' : '#ffffff';
  }

  function updateToggle(theme) {
    if (!toggleButton) return;
    const dark = theme === 'dark';
    const label = dark ? '주간 모드로 전환' : '야간 모드로 전환';
    toggleButton.setAttribute('aria-label', label);
    toggleButton.title = label;
    toggleButton.dataset.theme = theme;
    toggleButton.querySelector('.site-theme-toggle__icon').textContent = dark ? '☀' : '☾';
  }

  function applyTheme(theme, notify) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = resolved;
    root.dataset.bsTheme = resolved;
    root.style.colorScheme = resolved;
    updateThemeColor(resolved);
    updateToggle(resolved);

    if (notify) {
      window.dispatchEvent(new CustomEvent('coop-theme-change', {
        detail: { theme: resolved }
      }));
    }
  }

  function installToggle() {
    if (!showToggle || document.querySelector('.site-theme-toggle')) return;

    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'site-theme-toggle';
    toggleButton.innerHTML = '<span class="site-theme-toggle__icon" aria-hidden="true"></span>';
    toggleButton.addEventListener('click', function () {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      writeStoredTheme(next);
      applyTheme(next, true);
    });
    document.body.appendChild(toggleButton);
    updateToggle(root.dataset.theme || preferredTheme());
  }

  applyTheme(preferredTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggle, { once: true });
  } else {
    installToggle();
  }

  const handleSystemThemeChange = function () {
    if (!readStoredTheme()) applyTheme(systemTheme.matches ? 'dark' : 'light', true);
  };
  if (typeof systemTheme.addEventListener === 'function') {
    systemTheme.addEventListener('change', handleSystemThemeChange);
  } else if (typeof systemTheme.addListener === 'function') {
    systemTheme.addListener(handleSystemThemeChange);
  }

  window.CoopTheme = Object.freeze({
    get: function () { return root.dataset.theme || preferredTheme(); },
    set: function (theme) {
      if (theme !== 'light' && theme !== 'dark') return;
      writeStoredTheme(theme);
      applyTheme(theme, true);
    },
    useSystem: function () {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      applyTheme(systemTheme.matches ? 'dark' : 'light', true);
    }
  });
})();
