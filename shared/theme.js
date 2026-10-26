(function () {
  'use strict';

  const STORAGE_KEY = 'coop-color-theme';
  const root = document.documentElement;
  const script = document.currentScript;
  const showToggle = script?.dataset.themeToggle !== 'off';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const mobileScreen = window.matchMedia('(max-width:767.98px)');
  const editorPreview = new URLSearchParams(window.location.search).get('home_preview') === '1' && window.parent !== window;
  let toggleControl = null;
  let selectedMode = editorPreview ? 'light' : readStoredTheme() || 'auto';

  const routePath = window.location.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const pageKey = (routePath && window.location.pathname.endsWith('/') ? `${routePath}/index` : routePath)
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
    if (editorPreview) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {
      // Storage can be unavailable in private or embedded browser contexts.
    }
  }

  function clearStoredTheme() {
    if (editorPreview) return;
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
    const opener = toggleControl.querySelector('[data-theme-open]');
    if (opener) {
      opener.setAttribute('aria-label', `화면 모드 선택 · ${modeLabel}`);
      opener.title = `화면 모드: ${modeLabel}`;
    }

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
      '<button type="button" class="site-theme-toggle__open" data-theme-open aria-label="화면 모드 선택" aria-expanded="false" aria-controls="site-theme-options"><span aria-hidden="true">◐</span></button>',
      '<div class="site-theme-toggle__options" id="site-theme-options">',
      '<span class="site-theme-toggle__label" aria-hidden="true">화면 모드</span>',
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="auto" aria-label="자동 모드">자동</button>',
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="light" aria-label="주간 모드">주간</button>',
      '<button type="button" class="site-theme-toggle__option" data-theme-mode="dark" aria-label="야간 모드">야간</button>',
      '</div>'
    ].join('');
    const opener = toggleControl.querySelector('[data-theme-open]');
    // A media query may hide the focused button before its change event runs.
    // Remember only control-owned focus; an outside interaction immediately releases it.
    let lastControlFocus = null;
    function closeOptions(restoreFocus) {
      const open = toggleControl.classList.contains('is-expanded');
      toggleControl.classList.remove('is-expanded');
      opener.setAttribute('aria-expanded', 'false');
      if (open && restoreFocus && mobileScreen.matches && toggleControl.contains(document.activeElement)) opener.focus({ preventScroll:true });
    }
    opener.addEventListener('click', function () {
      if (!mobileScreen.matches) return;
      const open = !toggleControl.classList.contains('is-expanded');
      toggleControl.classList.toggle('is-expanded', open);
      opener.setAttribute('aria-expanded', String(open));
      if (open) toggleControl.querySelector('[data-theme-mode].is-active')?.focus({ preventScroll:true });
    });
    toggleControl.addEventListener('click', function (event) {
      const button = event.target.closest('[data-theme-mode]');
      if (!button || !toggleControl.contains(button)) return;

      const mode = button.dataset.themeMode;
      if (mode !== 'auto' && mode !== 'light' && mode !== 'dark') return;

      selectedMode = mode;
      if (mode === 'auto') clearStoredTheme();
      else writeStoredTheme(mode);
      applyTheme(preferredTheme(), true);
      closeOptions(true);
    });
    toggleControl.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !toggleControl.classList.contains('is-expanded')) return;
      event.preventDefault();event.stopPropagation();closeOptions(true);
    });
    document.addEventListener('pointerdown', event => { if (!toggleControl.contains(event.target)) { lastControlFocus = null; closeOptions(false); } });
    document.addEventListener('focusin', event => {
      if (toggleControl.contains(event.target)) lastControlFocus = event.target;
      else { lastControlFocus = null; closeOptions(false); }
    });
    window.addEventListener('blur', () => { lastControlFocus = null; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { lastControlFocus = null; closeOptions(false); } });
    const resizeToggle = () => {
      const focused = document.activeElement;
      const wasInside = toggleControl.contains(focused) ||
        (focused === document.body && lastControlFocus?.isConnected && !lastControlFocus.getClientRects().length);
      closeOptions(false);
      if (wasInside && document.hasFocus() && toggleControl.getClientRects().length) {
        const next = mobileScreen.matches ? opener : toggleControl.querySelector('[data-theme-mode].is-active');
        if (next && next !== focused && next.getClientRects().length &&
            (focused === document.body || !focused.getClientRects().length)) next.focus({ preventScroll:true });
      }
    };
    mobileScreen.addEventListener?.('change', resizeToggle);
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
    if (editorPreview) return;
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
