/* Version: 1.0.1 | 2026-11-08. Current-view employee leave report reads only. */
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
    options.root.addEventListener('show.bs.modal', () => { view.opening = true; });
    options.root.addEventListener('shown.bs.modal', () => {
      view.opening = false;
      if (view.hideRequested) { view.hideRequested = false; view.modal().hide(); }
    });
    options.root.addEventListener('hide.bs.modal', event => {
      if (!event.defaultPrevented) { view.opening = false; closing = true; close(false); }
    });
    options.root.addEventListener('hidden.bs.modal', () => {
      closing = false; view.opening = false; view.hideRequested = false;
      view.restoreFocus?.(); view.restoreFocus = null;
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
