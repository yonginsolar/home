(function () {
  'use strict';

  const STORAGE_KEY = 'coop-color-theme';
  const root = document.documentElement;
  const script = document.currentScript;
  const showToggle = script?.dataset.themeToggle !== 'off';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let toggleControl = null;
  let selectedMode = readStoredTheme() || 'auto';

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

  function clearStoredTheme() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Storage can be unavailable in private or embedded browser contexts.
    }
  }

  function preferredTheme() {
    if (selectedMode === 'light' || selectedMode === 'dark') return selectedMode;
    return systemTheme.matches ? 'dark' : 'light';
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
    if (!toggleControl) return;
    const resolvedLabel = theme === 'dark' ? '야간' : '주간';
    const modeLabel = selectedMode === 'auto' ? `자동 (현재 ${resolvedLabel})` : resolvedLabel;
    toggleControl.setAttribute('aria-label', `화면 모드: ${modeLabel}`);
    toggleControl.dataset.mode = selectedMode;
    toggleControl.dataset.theme = theme;

    toggleControl.querySelectorAll('[data-theme-mode]').forEach(function (button) {
      const active = button.dataset.themeMode === selectedMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
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
        detail: { theme: resolved, mode: selectedMode }
      }));
    }
  }

  function installToggle() {
    if (!showToggle || document.querySelector('.site-theme-toggle')) return;

    toggleControl = document.createElement('div');
    toggleControl.className = 'site-theme-toggle';
    toggleControl.setAttribute('role', 'group');
    toggleControl.innerHTML = [
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="auto" aria-label="자동 모드">자동</button>',
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="light" aria-label="주간 모드">주</button>',
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="dark" aria-label="야간 모드">야</button>'
    ].join('');
    toggleControl.addEventListener('click', function (event) {
      const button = event.target.closest('[data-theme-mode]');
      if (!button || !toggleControl.contains(button)) return;

      const mode = button.dataset.themeMode;
      if (mode !== 'auto' && mode !== 'light' && mode !== 'dark') return;

      selectedMode = mode;
      if (mode === 'auto') clearStoredTheme();
      else writeStoredTheme(mode);
      applyTheme(preferredTheme(), true);
    });
    document.body.appendChild(toggleControl);
    updateToggle(root.dataset.theme || preferredTheme());
  }

  applyTheme(preferredTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggle, { once: true });
  } else {
    installToggle();
  }

  const handleSystemThemeChange = function () {
    if (selectedMode === 'auto') applyTheme(systemTheme.matches ? 'dark' : 'light', true);
  };
  if (typeof systemTheme.addEventListener === 'function') {
    systemTheme.addEventListener('change', handleSystemThemeChange);
  } else if (typeof systemTheme.addListener === 'function') {
    systemTheme.addListener(handleSystemThemeChange);
  }

  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY) return;
    if (event.newValue === 'light' || event.newValue === 'dark') {
      selectedMode = event.newValue;
    } else {
      selectedMode = 'auto';
    }
    applyTheme(preferredTheme(), true);
  });

  window.CoopTheme = Object.freeze({
    get: function () { return root.dataset.theme || preferredTheme(); },
    mode: function () { return selectedMode; },
    set: function (theme) {
      if (theme !== 'light' && theme !== 'dark') return;
      selectedMode = theme;
      writeStoredTheme(theme);
      applyTheme(theme, true);
    },
    useSystem: function () {
      selectedMode = 'auto';
      clearStoredTheme();
      applyTheme(preferredTheme(), true);
    }
  });
})();
