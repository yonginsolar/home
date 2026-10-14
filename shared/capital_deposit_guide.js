/* v1.0.0 — Public, registered-host-only deposit settings. No Auth or browser storage. */
(function (root) {
  'use strict';
  let pending;
  async function read() {
    if (pending) return pending;
    const task = (async () => {
      const host = root.CoopRouteGuard?.getPublicRuntimeHost?.(root.location) || root.location.hostname;
      const response = await fetch('https://ifdqlwxgqgsvnawmhlfc.supabase.co/rest/v1/rpc/get_public_capital_deposit_guide', {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000),
        headers: {apikey: 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h', 'Content-Type': 'application/json', 'x-public-host': host}, body: '{}'
      });
      if (!response.ok) throw Error('DEPOSIT_GUIDE_READ_FAILED');
      const value = await response.json();
      if (!value || typeof value !== 'object' || !value.coop_name) throw Error('DEPOSIT_GUIDE_UNAVAILABLE');
      return value;
    })();
    pending = task;
    try { return await task; } finally { if (pending === task) pending = null; }
  }
  root.CoopCapitalDepositGuide = Object.freeze({read});
})(window);
