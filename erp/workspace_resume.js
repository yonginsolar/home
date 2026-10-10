/* ERP task resume v1.0.1: keep authorization checks; checkpoint explicitly completed editors. */
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
      // Open dialogs, local dirty guards and in-flight operations take precedence over list refresh.
      if (context.dirty || document.querySelector('.modal.show,dialog[open]') || options.busy?.()) return;
      if (!pending) pending = Promise.resolve().then(options.refresh).finally(() => { pending = null; });
      await pending;
    }};
  }
  function checkpoint(root) {
    if (!root || root.ownerDocument !== document || window.parent === window) return false;
    try { return window.parent.ErpWorkspaceShell?.checkpoint(root) === true; } catch (_) { return false; }
  }
  window.ErpWorkspaceResume = {register,checkpoint};
})();
