/* v1.1.0 — Bounded OTP transport and explicit result recheck; no new Auth client or persistence. */
(function(root) {
  'use strict';
  function boundedFetch(fetcher, baseUrl) {
    const origin = new URL(baseUrl).origin;
    return async function(input, init) {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      if (url.origin !== origin || !['/auth/v1/otp','/auth/v1/verify'].includes(url.pathname)
        || String(init?.method || input?.method || 'GET').toUpperCase() !== 'POST') return fetcher(input, init);
      const controller = new AbortController(), signal = init?.signal || input?.signal;
      const abort = () => controller.abort();
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
      let timer, status = null;
      try {
        const response = await Promise.race([
          (async () => {
            const result = await fetcher(input, Object.assign({}, init, {signal:controller.signal}));
            status = result.status;
            // Include a stalled response body in the deadline; pass its original
            // status/headers/body to the SDK unchanged after it is fully readable.
            await result.clone().arrayBuffer();
            return result;
          })(),
          new Promise((_, reject) => { timer = root.setTimeout(() => {
            reject(Error([401,403,429].includes(status) ? `LOGIN_AUTH_HTTP_${status}_BODY_TIMEOUT` : 'LOGIN_AUTH_RESPONSE_TIMEOUT'));
            controller.abort();
          }, 15000); })
        ]);
        return response;
      } finally { root.clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    };
  }
  function create(options) {
    const emailInput = options.emailInput, codeInput = options.codeInput;
    let email = readEmail(), revision = 0, active = null, recipient = '';
    let owner = readOwner(), recovery = null, checking = null, sessionRead = null, notice = '';
    const region = root.document.createElement('div');
    region.className = 'small mt-2'; region.hidden = true;
    const message = root.document.createElement('p'); message.className = 'mb-2';
    message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
    const retry = root.document.createElement('button'); retry.type = 'button';
    retry.className = 'btn btn-outline-secondary btn-sm'; retry.textContent = '결과 다시 확인';
    retry.onclick = () => { void recheck(); };
    region.append(message,retry);
    (options.statusElement || codeInput?.parentElement || emailInput?.parentElement)?.after(region);
    function readEmail() { return String(emailInput?.value || '').trim().toLowerCase(); }
    function readOwner() { return String(options.getOwner?.() || ''); }
    function readScope() { return String(options.getScope?.() || root.location.origin); }
    function sync() {
      message.textContent = notice; region.hidden = !notice;
      retry.hidden = !recovery; retry.disabled = !!active;
      retry.setAttribute('aria-disabled',String(!!checking || !!active));
      retry.textContent = checking ? '확인 중…' : '결과 다시 확인';
      options.onStateChange?.();
    }
    function invalidate(reason) {
      const keep = reason === 'pagehide' && recovery && matches(recovery);
      revision++; recipient = '';
      recovery = keep ? Object.assign({}, recovery, {revision}) : null;
      if (!recovery) notice = '';
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
      if (active || recovery || checking || !email || (kind === 'verify' && recipient !== email)) return null;
      const request = {kind, email, token:String(token || ''), revision, owner:readOwner(), scope:readScope()};
      active = request;
      notice = '';
      if (kind === 'send') { recipient = ''; options.onReset?.('send'); }
      sync();
      return request;
    }
    function matches(request, user) {
      if (!request || revision !== request.revision
        || readEmail() !== request.email || readScope() !== request.scope) return false;
      if (request.kind === 'verify' && String(codeInput?.value || '').trim() !== request.token) return false;
      const nowOwner = readOwner();
      return nowOwner === request.owner
        || request.kind === 'verify' && !request.owner && !!user?.id && nowOwner === String(user.id);
    }
    function current(request, user) { return active === request && matches(request,user); }
    function captureFailure(request, error) {
      if (!current(request)) return true;
      const known = String(error?.message || '').match(/LOGIN_AUTH_HTTP_(401|403|429)_BODY_TIMEOUT/);
      if (known) {
        if(options.statusElement)options.statusElement.textContent='';
        notice = known[1] === '429' ? '인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.' : '인증 요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';
        sync(); return true;
      }
      if (error?.name !== 'AuthRetryableFetchError' && !String(error?.message || '').includes('LOGIN_AUTH_RESPONSE_TIMEOUT')) return false;
      if(options.statusElement)options.statusElement.textContent='';
      recovery = request; notice = '인증 응답을 확인하지 못했습니다. 결과를 다시 확인해 주세요.';
      sync(); return true;
    }
    async function recheck() {
      if (checking) return checking;
      const request = recovery;
      if (!request || active || !matches(request)) return;
      const hadFocus = root.document.activeElement === retry;
      const task = Promise.resolve().then(async () => {
        let timer;
        try {
          if(!sessionRead || sessionRead.request!==request){
            const read={request,promise:null};
            read.promise=Promise.resolve().then(()=>options.readSession()).finally(()=>{if(sessionRead===read)sessionRead=null;});
            sessionRead=read;
          }
          const result = await Promise.race([
            sessionRead.promise,
            new Promise((_,reject) => {timer=root.setTimeout(()=>reject(Error('LOGIN_RESULT_READ_TIMEOUT')),6000);})
          ]);
          if (recovery !== request || !matches(request)) return;
          if (result.error) throw result.error;
          const user = result.data?.session?.user;
          if (request.kind === 'verify' && user?.id && String(user.email || '').trim().toLowerCase() === request.email
            && (!readOwner() || readOwner() === String(user.id))) {
            notice = ''; recipient = '';
            await options.onVerified(user, () => recovery === request && matches(request,user));
            if (recovery === request) recovery = null;
          } else {
            recovery = null; recipient = request.email;
            notice = '메일로 받은 코드를 입력해 주세요. 새 코드는 재전송 대기 후 받을 수 있습니다.';
            options.onResume?.();
            if (hadFocus && root.document.activeElement === retry) codeInput?.focus();
          }
        } catch (_) {
          if (recovery === request && matches(request)) notice = '인증 결과를 불러오지 못했습니다. 다시 확인해 주세요.';
        } finally {
          root.clearTimeout(timer);
          if (checking === task) { checking = null; sync(); }
        }
      });
      checking = task; sync(); return task;
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
    codeInput?.addEventListener('input', () => {
      if(!recovery)return;
      ++revision; recovery=null; notice=''; recipient=readEmail(); sync();
    });
    root.addEventListener('pagehide', () => invalidate('pagehide'));
    return Object.freeze({begin, current, sent, verified, finish, authChanged, captureFailure, recheck,
      invalidate:() => invalidate('navigation'),
      isBusy:() => !!active || !!recovery || !!checking, isVerifying:() => active?.kind === 'verify',
      recipient:() => recipient});
  }
  root.CoopLoginRequestGuard = Object.freeze({create,boundedFetch});
})(window);
