/* Version: 1.0.4 | 2026-11-08. Current-view employee leave report reads only. */
(function (root) {
  'use strict';
  let view = null, active = null, sequence = 0, closing = false;
  const same = (a, b) => a && b && a.owner === b.owner && a.coopId === b.coopId
    && a.empId === b.empId && a.revision === b.revision;
  function stop(read) {
    if (!read) return;
    clearTimeout(read.timer); read.controller.abort(); read.cancel?.();
  }
  function close(hide = true) {
    sequence++; const previous = active; active = null; stop(previous);
    if (!hide || !view) return;
    if (view.opening) {
      view.hideRequested = true;
      // Bootstrap 5.3's own opening transition cannot hide yet. Suppress only
      // this canceled instance's deferred auto-focus until its owned hide.
      const modal = view.modal();
      if (modal?._config && !view.restoreFocus) {
        const focus = modal._config.focus;
        view.restoreFocus = () => { modal._config.focus = focus; };
        modal._config.focus = false;
      }
    } else if (view.root.classList.contains('show')) view.modal().hide();
  }
  function currentParent(returnTo, closingReport = false) {
    if (!returnTo || root.frameElement?.hidden || !same(returnTo.context, returnTo.options.context())) return null;
    // Parent keyboard ownership survives a legitimate parent-tab change. Report
    // reads retain their separate, narrower Attendance-tab currentness check.
    const parentCurrent = returnTo.options.isParentCurrent || returnTo.options.isCurrent;
    if (!parentCurrent(returnTo.context)) return null;
    const parent = returnTo.options.parent?.();
    if (!parent?.root?.classList.contains('show') || parent.root.hidden
      || [...parent.root.ownerDocument.querySelectorAll('.modal.show,dialog[open],[role="dialog"][aria-modal="true"]')]
        .some(el => el !== parent.root && !(closingReport && el === view.root))) return null;
    return parent;
  }
  function parentTab(event) {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    const bridge = closing && view?.closingKeyboard;
    const returnTo = bridge ? bridge.returnTo : view?.returnedTo;
    const parent = currentParent(returnTo, !!bridge);
    if (!parent || (bridge && view.root.classList.contains('show'))) return;
    const doc = parent.root.ownerDocument;
    const layer = event.target?.closest?.('.modal,[role="dialog"],dialog[open]');
    const inParent = layer === parent.root;
    if (!inParent && (!bridge || bridge.movedOutside || !bridge.fromReport || !doc.hasFocus()
      || !(layer === view.root || (event.target === doc.body && doc.activeElement === doc.body)))) return;
    const items = [...parent.root.querySelectorAll('a[href],button,input,textarea,select,[tabindex],[contenteditable="true"]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]')
        && el.getClientRects().length && root.getComputedStyle(el).visibility === 'visible')
      .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
    const first = items[0], last = items.at(-1), activeElement = doc.activeElement;
    const target = !inParent ? (event.shiftKey ? last : first) || parent.root
      : !first ? parent.root : event.shiftKey && (activeElement === first || activeElement === parent.root) ? last
      : !event.shiftKey && activeElement === last ? first : !first ? parent.root : null;
    // Native Tab can leave an iframe before Bootstrap's document focusin fires.
    if (target) { event.preventDefault(); target.focus({preventScroll:true}); }
  }
  function watchClosingFocus(event) {
    const bridge = view?.closingKeyboard;
    if (!bridge || event.target === view.doc.body || event.target === view.doc.documentElement) return;
    const parent = bridge.returnTo?.options.parent?.();
    if (!view.root.contains(event.target) && !parent?.root?.contains(event.target)) bridge.movedOutside = true;
  }
  function clearClosingKeyboard() {
    if (!view) return;
    view.doc.removeEventListener('keydown', parentTab, true);
    for (const type of ['focusin','pointerdown']) view.doc.removeEventListener(type, watchClosingFocus, true);
    view.closingKeyboard = null;
  }
  function restoreParentKeyboard(returnTo) {
    const parent = currentParent(returnTo);
    if (!parent) return;
    view.returnedTo = returnTo;
    if (view.keyboardParent !== parent.root) {
      view.keyboardParent?.removeEventListener('keydown', parentTab);
      view.keyboardParent = parent.root;
      parent.root.addEventListener('keydown', parentTab);
    }
    const trap = parent.modal?._focustrap;
    if (!trap?._config || typeof trap.activate !== 'function' || typeof trap.deactivate !== 'function') return;
    // Pinned Bootstrap 5.3 shares document trap listeners: child teardown removes
    // the parent's listeners but leaves its active flag. Rebind without focus().
    const autofocus = trap._config.autofocus;
    trap.deactivate();
    try { trap._config.autofocus = false; trap.activate(); }
    finally { trap._config.autofocus = autofocus; }
  }
  function mount(options) {
    if (view?.root === options.root) return view;
    close();
    const doc = options.root.ownerDocument, body = options.root.querySelector('.modal-body');
    const status = doc.createElement('div'), message = doc.createElement('span'), retry = doc.createElement('button');
    status.className = 'mb-2';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    message.className = 'flex-grow-1'; message.style.minWidth = '0'; message.style.overflowWrap = 'anywhere';
    retry.type = 'button'; retry.className = 'btn btn-sm btn-outline-primary text-wrap'; retry.textContent = '다시 확인';
    retry.dataset.employeeLeaveReportRetry = '1'; retry.hidden = true;
    const content = doc.createElement('div'); content.tabIndex = -1; content.dataset.employeeLeaveReportContent = '1';
    content.setAttribute('aria-label', '연차 상세 조회 결과');
    const line = doc.createElement('div'); line.className = 'd-flex flex-wrap align-items-center gap-2';
    line.append(message, retry); status.append(line); body.replaceChildren(status, content);
    view = {...options, doc, status, message, retry, content, opening:false, hideRequested:false}; closing = false;
    retry.addEventListener('click', () => {
      const read = active;
      if (read?.state === 'error' && owned(read)) void start(read.options, true);
    });
    retry.addEventListener('keydown', event => {
      if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
    });
    const openingDismiss = event => {
      if (view.root !== options.root || !view.opening || event.defaultPrevented || event.isComposing) return;
      // This report is read-only. Leave nested dialogs and composing keys alone.
      if (event.target?.closest?.('.modal,[role="dialog"],dialog[open]') !== options.root) return;
      if (event.type === 'click') {
        const button = event.target.closest('[data-bs-dismiss="modal"]');
        if (!button || button.disabled || button.classList.contains('disabled')) return;
      } else if (event.key !== 'Escape' || event.keyCode === 229) return;
      // Bootstrap ignores hide() while opening, before emitting hide.bs.modal.
      // Consume only this owned dismiss intent and use our existing deferred hide.
      event.preventDefault(); event.stopPropagation(); close();
    };
    options.root.addEventListener('click', openingDismiss, true);
    options.root.addEventListener('keydown', openingDismiss, true);
    options.root.addEventListener('show.bs.modal', () => { clearClosingKeyboard(); view.opening = true; });
    options.root.addEventListener('shown.bs.modal', () => {
      view.opening = false;
      if (view.hideRequested) { view.hideRequested = false; view.modal().hide(); }
    });
    options.root.addEventListener('hide.bs.modal', () => {
      view.closingFromReport = options.root.contains(doc.activeElement);
    }, true);
    options.root.addEventListener('hide.bs.modal', event => {
      if (!event.defaultPrevented) {
        view.opening = false; closing = true; close(false); clearClosingKeyboard();
        view.closingKeyboard = {returnTo:view.returnTo, fromReport:view.closingFromReport, movedOutside:false};
        // Only this owned hide-to-hidden interval, before the vendor trap ends.
        doc.addEventListener('keydown', parentTab, true);
        for (const type of ['focusin','pointerdown']) doc.addEventListener(type, watchClosingFocus, true);
      }
    });
    options.root.addEventListener('hidden.bs.modal', () => {
      clearClosingKeyboard();
      const returnTo = view.returnTo; view.returnTo = null;
      closing = false; view.opening = false; view.hideRequested = false;
      view.restoreFocus?.(); view.restoreFocus = null;
      restoreParentKeyboard(returnTo);
    });
    return view;
  }
  function owned(read) {
    return active === read && sequence === read.generation
      && (view?.opening || view?.root.classList.contains('show')) && !root.frameElement?.hidden
      && read.options.isCurrent(read);
  }
  const current = read => owned(read) && !read.controller.signal.aborted;
  function paint(read, state) {
    if (!current(read)) return;
    read.state = state;
    if (state === 'ready' && view.doc.activeElement === view.retry && view.doc.hasFocus()) view.content.focus({preventScroll:true});
    view.status.hidden = state === 'ready';
    view.status.setAttribute('aria-busy', String(state === 'loading'));
    view.root.setAttribute('aria-busy', String(state === 'loading'));
    if (state === 'loading') {
      view.message.textContent = '연차 상세를 불러오는 중입니다.';
      view.retry.hidden = !read.retrying;
      view.retry.setAttribute('aria-disabled', 'true');
    } else if (state === 'error') {
      view.message.textContent = read.denied ? '현재 권한으로 연차 상세를 조회할 수 없습니다. 권한을 확인한 뒤 다시 확인해 주세요.'
        : read.timedOut ? '연차 상세 조회가 지연됐습니다. 다시 확인해 주세요.'
          : '연차 상세를 불러오지 못했습니다. 다시 확인해 주세요.';
      view.retry.hidden = false; view.retry.setAttribute('aria-disabled', 'false');
    } else {
      view.retry.hidden = true; view.retry.setAttribute('aria-disabled', 'false');
    }
  }
  function start(options, retrying = false) {
    const context = options.context();
    if (closing || view?.hideRequested || !context || !options.isCurrent(context)) return Promise.resolve(false);
    const ui = mount(options);
    if (!retrying && active && same(active, context) && owned(active)) return active.pending || Promise.resolve(active.state === 'ready');
    close(false);
    const read = {...context, options, retrying, generation:sequence, controller:new AbortController()};
    active = read;
    ui.returnTo = {options, context};
    read.isCurrent = () => current(read);
    read.signal = read.controller.signal;
    if (!retrying) ui.modal().show();
    if (!current(read)) { close(false); return Promise.resolve(false); }
    ui.content.replaceChildren(); paint(read, 'loading');
    const canceled = new Promise(resolve => { read.cancel = () => resolve(false); });
    const deadline = new Promise(resolve => { read.timer = setTimeout(() => {
      if (!current(read)) return resolve(false);
      // Local read deadline is not a server write cancellation or failure result.
      read.timedOut = true;
      paint(read, 'error');
      read.controller.abort();
      resolve(false);
    }, 15000); });
    const work = Promise.resolve().then(async () => {
      if (!current(read)) return false;
      await options.verify(read);
      if (!current(read)) return false;
      const html = await options.read(read);
      if (!current(read)) return false;
      if (typeof html !== 'string') throw new Error('LEAVE_REPORT_UNAVAILABLE');
      ui.content.innerHTML = html;
      paint(read, 'ready'); return true;
    }).catch(error => {
      if (!current(read)) return false;
      read.denied = String(error?.code || error?.message || '').includes('ACCESS_DENIED')
        || String(error?.code || '') === '42501' || [401,403].includes(Number(error?.status));
      paint(read, 'error'); return false;
    });
    read.pending = Promise.race([work, deadline, canceled]).finally(() => {
      clearTimeout(read.timer);
      if (active === read) read.pending = null;
    });
    return read.pending;
  }
  root.EmployeeLeaveReport = Object.freeze({open:options => start(options), close});
})(window);
