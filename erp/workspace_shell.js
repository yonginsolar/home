/* Persistent ERP workspace v1.0.1 — same-origin isolated tasks, guarded navigation, no operational writes. */
(() => {
  'use strict';
  let frame = document.getElementById('erpWorkspaceFrame');
  const status = document.getElementById('erpWorkspaceStatus');
  const error = document.getElementById('erpWorkspaceError');
  const routes = window.ErpWorkspaceRoute;
  let current = '', requested = '', client, ready = false, leaving = false, timer, slowTimer;
  let dirtyFields = new Map();
  const view = () => routes.route(new URLSearchParams(location.search).get('view') || '');
  const home = target => {
    const next = new URL('/erp/', location.origin);
    if (target) next.searchParams.set('next', new URL(target, location.origin).href);
    location.replace(next.href);
  };
  function changed() {
    if (!frame.contentWindow || !current || requested) return false;
    try {
      const child = frame.contentWindow;
      const event = new child.Event('beforeunload', {cancelable:true});
      child.dispatchEvent(event);
      if (event.defaultPrevented) return true;
      // Reuse the approval editor's saved snapshot instead of treating search/filter changes as edits.
      const draftStatus = child.document.getElementById('approvalDraftStatusText')?.dataset.state;
      if (draftStatus === 'saving' || draftStatus === 'error') return true;
      if (draftStatus === 'dirty' && typeof child.hasMeaningfulApprovalDraftContentForReplacement === 'function'
        && child.hasMeaningfulApprovalDraftContentForReplacement()) return true;
      for (const [node, original] of dirtyFields) {
        if (!node.isConnected || !node.getClientRects().length) continue;
        // The composer already compares its current payload with the last successful save.
        // Keep the generic guard for other open dialogs, not for a saved composer.
        if (draftStatus === 'saved' && node.closest('#draftForm')) continue;
        if (fieldValue(node) !== original) return true;
      }
    } catch (_) { return false; }
    return false;
  }
  function fieldValue(node) {
    return node.type === 'checkbox' || node.type === 'radio' ? node.checked
      : node.type === 'file' ? node.files.length : node.isContentEditable ? node.innerHTML : node.value;
  }
  function canLeave() {
    return leaving || !changed() || window.confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?');
  }
  function loading() {
    error.hidden = true;
    clearTimeout(slowTimer); clearTimeout(timer);
    slowTimer = setTimeout(() => { status.textContent = '화면을 불러오고 있습니다…'; status.hidden = false; }, 300);
    timer = setTimeout(() => { status.hidden = true; error.hidden = false; }, 25000);
  }
  function load(target) {
    requested = target; loading();
    window.ErpWorkspace.detachDocument();
    // Only replace the task browsing context after its own unsaved guard has been checked.
    // Removing the old context avoids a second native prompt and nested history entry;
    // the outer sidebar, focus, scroll and layout are untouched.
    const nextFrame = document.createElement('iframe');
    nextFrame.id = frame.id; nextFrame.title = frame.title; nextFrame.src = new URL(target, location.origin).href;
    nextFrame.addEventListener('load', frameLoaded);
    frame.replaceWith(nextFrame); frame = nextFrame;
  }
  function navigate(value) {
    let target;
    try { target = new URL(value, location.origin); } catch (_) { return false; }
    if (target.origin !== location.origin) return false;
    const next = routes.route(target.href);
    const isHome = /^\/erp\/?$|^\/erp\/index(?:\.html)?\/?$/.test(target.pathname);
    if (!next && !isHome) return false;
    if (!ready || !canLeave()) return true;
    if (isHome) {
      frame.remove();
      leaving = true; location.assign(target.href); return true;
    }
    if (next === requested || (next === current && !requested)) return true;
    history.pushState({erpWorkspace:true}, '', routes.address(next));
    load(next); window.ErpWorkspace.closeDrawer(); return true;
  }
  function attachDocument(doc) {
    dirtyFields = new Map();
    const remember = event => {
      const node = event.target;
      if (!event.isTrusted || !node?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      // Modal/form edits get a conservative fallback where the task has no native unsaved guard.
      if (!node.closest('form,.modal,dialog') && !node.isContentEditable) return;
      if (!dirtyFields.has(node)) dirtyFields.set(node, fieldValue(node));
    };
    for (const name of ['focusin','beforeinput','pointerdown']) doc.addEventListener(name, remember, true);
    doc.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      if (navigate(anchor.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    doc.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault(); frame.contentWindow.print();
      }
    });
    frame.contentWindow.addEventListener('hashchange', () => syncFrame());
  }
  function syncFrame() {
    try {
      const child = frame.contentWindow, href = child.location.href;
      if (href === 'about:blank') return;
      const next = routes.route(href);
      if (!next) {
        // Authentication, OAuth callbacks, public screens and cooperative switches leave the shell.
        const target = new URL(href);
        if (target.origin === location.origin) { leaving = true; location.replace(target.href); }
        else { status.hidden = true; error.hidden = false; }
        return;
      }
      current = next; requested = '';
      history.replaceState({erpWorkspace:true}, '', routes.address(next));
      document.title = child.document.title;
      frame.title = child.document.title || 'ERP 업무 화면';
      window.ErpWorkspace.setDocument(child.document, href);
      status.hidden = true; error.hidden = true; clearTimeout(timer); clearTimeout(slowTimer);
    } catch (_) { status.hidden = true; error.hidden = false; }
  }
  function frameLoaded() {
    if (!ready) return;
    syncFrame();
    try { attachDocument(frame.contentDocument); } catch (_) {}
  }
  frame.addEventListener('load', frameLoaded);
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a.erp-workspace-link');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (navigate(anchor.href)) event.preventDefault();
  });
  window.addEventListener('popstate', () => {
    const next = view();
    if (!next) return home();
    if (next === current || next === requested) return;
    if (!canLeave()) { history.pushState({erpWorkspace:true}, '', routes.address(current)); return; }
    load(next);
  });
  window.addEventListener('beforeunload', event => {
    if (!leaving && !requested && changed()) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && current) {
      event.preventDefault(); frame.contentWindow.print();
    }
  });
  // Browser-menu print needs a paginated document, not a clipped screen-height iframe.
  // A transient, script-free snapshot uses the task's exact styles; it is never saved or cached.
  let printCopy, printStyles = [], printClasses;
  function restorePrint() {
    printCopy?.remove(); printCopy = null; printStyles.forEach(node=>node.remove()); printStyles = [];
    if (printClasses !== undefined) { document.body.className = printClasses; printClasses = undefined; }
  }
  window.addEventListener('beforeprint', () => {
    if (!current || printCopy) return;
    const doc = frame.contentDocument;
    printClasses = document.body.className;
    document.body.className = doc.body.className + ' erp-shell-printing';
    printCopy = document.createElement('div'); printCopy.id = 'erpWorkspacePrint';
    const copy = doc.body.cloneNode(true);
    copy.querySelectorAll('script').forEach(node=>node.remove());
    const originalImages = doc.body.querySelectorAll('img');
    copy.querySelectorAll('img').forEach((node,i)=>{node.src=originalImages[i].src;});
    const canvases = doc.body.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((node,i)=>{
      node.width=canvases[i].width; node.height=canvases[i].height;
      try { node.getContext('2d').drawImage(canvases[i],0,0); } catch (_) {}
    });
    const originals = doc.body.querySelectorAll('input,textarea,select');
    copy.querySelectorAll('input,textarea,select').forEach((node,i)=>{
      node.value=originals[i].value; if(node.type==='checkbox'||node.type==='radio')node.checked=originals[i].checked;
      if(node.tagName==='TEXTAREA')node.textContent=originals[i].value;
    });
    for (const original of doc.querySelectorAll('style,link[rel="stylesheet"]')) {
      const node=original.cloneNode(true); if(node.tagName==='LINK')node.href=original.href;
      document.head.append(node); printStyles.push(node);
    }
    printCopy.append(...copy.childNodes); document.body.append(printCopy);
  });
  window.addEventListener('afterprint', restorePrint);
  document.getElementById('erpWorkspaceRetry').onclick = () => {
    if (requested || current) load(requested || current); else void start(client);
  };
  async function start(configuredClient) {
    client = configuredClient;
    const target = view();
    if (!target) return home();
    try {
      const {data, error:authError} = await client.auth.getUser();
      if (authError || !data?.user) return home(target);
      const {data:runtime,error:runtimeError} = await client.rpc('get_my_erp_runtime');
      if (runtimeError) throw runtimeError;
      if (!runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) return home(target);
      void window.ErpWorkspace.connect(client, runtime);
      ready = true;
      client.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') { ready = false; leaving = true; frame.remove(); home(target); }
      });
      load(target);
    } catch (_) { status.hidden = true; error.hidden = false; }
  }
  window.ErpWorkspaceShell = {start, navigate, version:'20261010.6'};
})();
