/* v1.0.0 — In-page email-login request ownership; no Auth client or persistence. */
(function(root) {
  'use strict';
  function create(options) {
    const emailInput = options.emailInput, codeInput = options.codeInput;
    let email = readEmail(), revision = 0, active = null, recipient = '';
    let owner = readOwner();
    function readEmail() { return String(emailInput?.value || '').trim().toLowerCase(); }
    function readOwner() { return String(options.getOwner?.() || ''); }
    function readScope() { return String(options.getScope?.() || root.location.origin); }
    function sync() { options.onStateChange?.(); }
    function invalidate(reason) {
      revision++; recipient = '';
      options.onReset?.(reason);
      sync();
    }
    function observeEmail() {
      const next = readEmail();
      if (email === next) return;
      email = next;
      invalidate('email');
    }
    function authChanged() {
      const next = readOwner();
      if (next === owner) return;
      // verifyOtp itself emits SIGNED_IN before resolving. Accept that transition
      // only when its returned user also matches the current Auth owner below.
      const ownVerification = active?.kind === 'verify' && !active.owner && next;
      owner = next;
      if (!ownVerification) invalidate('auth');
    }
    function begin(kind, token) {
      observeEmail();
      if (active || !email || (kind === 'verify' && recipient !== email)) return null;
      const request = {kind, email, token:String(token || ''), revision, owner:readOwner(), scope:readScope()};
      active = request;
      if (kind === 'send') { recipient = ''; options.onReset?.('send'); }
      sync();
      return request;
    }
    function current(request, user) {
      if (!request || active !== request || revision !== request.revision
        || readEmail() !== request.email || readScope() !== request.scope) return false;
      if (request.kind === 'verify' && String(codeInput?.value || '').trim() !== request.token) return false;
      const nowOwner = readOwner();
      return nowOwner === request.owner
        || request.kind === 'verify' && !request.owner && !!user?.id && nowOwner === String(user.id);
    }
    function sent(request) {
      if (!current(request)) return false;
      recipient = request.email;
      return true;
    }
    function finish(request) {
      if (active !== request) return;
      active = null;
      sync();
    }
    function verified(request, user) {
      if (!current(request, user)) return false;
      recipient = '';
      return true;
    }
    emailInput?.addEventListener('input', observeEmail);
    root.addEventListener('pagehide', () => invalidate('pagehide'));
    return Object.freeze({begin, current, sent, verified, finish, authChanged,
      invalidate:() => invalidate('navigation'),
      isBusy:() => !!active, isVerifying:() => active?.kind === 'verify',
      recipient:() => recipient});
  }
  root.CoopLoginRequestGuard = Object.freeze({create});
})(window);
