/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* ERP task resume v1.0.3: explicitly opted-in read-only panels may refresh beside retained drafts. */
(() => {
  'use strict';
  function register(options = {}) {
    if (typeof options.refresh !== 'function') throw new Error('ERP_TASK_REFRESH_REQUIRED');
    let pending;
    window.ErpWorkspaceTask = {ready:true, refresh:async function(context = {}) {
      const runtime = context.runtime;
      if (!runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) {
        throw new Error('ERP_TASK_ACCESS_DENIED');
      }
      const modules = options.modules || [];
      if (modules.length && !modules.some(key => window.ErpRuntimeGuard
        ? ErpRuntimeGuard.isModuleEnabled(runtime,key) && ErpRuntimeGuard.isModuleAssigned(runtime,key)
        : runtime.modules?.[key] !== false)) throw new Error('ERP_TASK_ACCESS_DENIED');
      if (options.authorize && await options.authorize(runtime) !== true) throw new Error('ERP_TASK_ACCESS_DENIED');
      // A held editor is not reinitialized. Its original save and conflict checks remain authoritative.
      // Only an explicitly opted-in read-only panel may refresh beside a draft.
      // Open dialogs and in-flight operations still take precedence.
      if ((context.dirty && options.refreshWhenDirty?.() !== true) || document.querySelector('.modal.show,dialog[open]') || options.busy?.()) return;
      // Scoped readers that already cancel/coalesce by owner/query must not share
      // a superseded outer promise after their fresh authorize hook invalidates it.
      if (options.ownsReadRequests === true) { await options.refresh(); return; }
      if (!pending) pending = Promise.resolve().then(options.refresh).finally(() => { pending = null; });
      await pending;
    }};
  }
  function checkpoint(root) {
    if (!root || root.ownerDocument !== document || window.parent === window) return false;
    try { return window.parent.ErpWorkspaceShell?.checkpoint(root) === true; } catch (_) { return false; }
  }
  function navigate(value) {
    const target = new URL(value, window.location.href);
    let shell;
    try { if (window.parent !== window) shell = window.parent.ErpWorkspaceShell; } catch (_) {}
    if (typeof shell?.navigate === 'function') {
      try {
        // The existing shell alone decides allowed routes, cancellation and fresh authorization.
        if (shell.navigate(target.href)) return;
      } catch (_) {
        window.CoopDialog.alert('화면을 열지 못했습니다. 다시 시도해 주세요.');
        return;
      }
    }
    // Standalone, external/public and unregistered destinations keep their original navigation.
    window.location.href = target.href;
  }
  window.ErpWorkspaceResume = {register,checkpoint,navigate};
})();
