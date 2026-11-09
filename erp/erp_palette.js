/* ERP color preference v1.0.0 — appearance only, scoped to this ERP origin. */
(() => {
  'use strict';
  const key = 'erp_color_palette_v1';
  const names = new Set(['navy','sage','terra','graphite']);
  const normalize = value => names.has(value) ? value : 'navy';
  const root = document.documentElement;
  const asset = document.querySelector('link[data-erp-palette-style]');
  const shell = /^\/erp\/workspace(?:\.html)?\/?$/.test(location.pathname);
  const frameSelector = 'iframe:is(#erpWorkspaceFrame,.erp-workspace-task)';
  let active = 'navy';
  try { active = normalize(localStorage.getItem(key)); } catch (_) {}
  root.dataset.erpPalette = active;

  function applyFrame(frame) {
    if (!shell || !asset || !frame?.matches?.(frameSelector)) return;
    try {
      const child = frame.contentDocument;
      if (!child?.head || !window.ErpWorkspaceRoute?.route(child.URL)) return;
      child.documentElement.dataset.erpPalette = active;
      if (!child.querySelector('link[data-erp-palette-style]')) child.head.append(asset.cloneNode(true));
      // Also update the embedded preference control if it has already mounted.
      if (frame.contentWindow.ErpPalette?.current() !== active) {
        frame.contentWindow.ErpPalette?.apply(active);
      }
    } catch (_) {} // Foreign frames and transient navigation are never modified.
  }
  function apply(value) {
    const next = normalize(value);
    const changed = active !== next;
    active = next;
    root.dataset.erpPalette = next;
    if (shell) document.querySelectorAll(frameSelector).forEach(applyFrame);
    if (changed) window.dispatchEvent(new Event('erp:palettechange'));
  }
  function choose(value) {
    if (!names.has(value)) return false;
    let saved = false;
    try { localStorage.setItem(key,value); saved = true; } catch (_) {}
    apply(value);
    try {
      if (window.parent !== window && window.parent.location.origin === location.origin) {
        window.parent.ErpPalette?.apply(value);
      }
    } catch (_) {}
    return saved;
  }
  window.ErpPalette = Object.freeze({current:()=>active,apply,choose});
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.key === null ? null : event.newValue);
  });
  if (shell) {
    document.addEventListener('load', event => applyFrame(event.target), true);
    document.addEventListener('DOMContentLoaded', () => apply(active), {once:true});
  }
})();
