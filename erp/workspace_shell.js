/* Persistent ERP workspace v1.2.2 — lock every print path; checkpoint completed input only. */
(() => {
  'use strict';
  let frame = document.getElementById('erpWorkspaceFrame');
  const status = document.getElementById('erpWorkspaceStatus');
  const error = document.getElementById('erpWorkspaceError');
  const routes = window.ErpWorkspaceRoute;
  let current = '', requested = '', client, ready = false, leaving = false, timer, slowTimer;
  let activeEntry = {frame, route:'', fields:new Map()}, accessKey = '', userId = '', transition = 0;
  const retained = new Map(), attached = new WeakSet();
  const RETAIN_LIMIT = 6;
  let printableEntry = null;
  document.documentElement.setAttribute('data-erp-print-locked', '');
  const view = () => routes.route(new URLSearchParams(location.search).get('view') || '');
  const home = target => {
    const next = new URL('/erp/', location.origin);
    if (target) next.searchParams.set('next', new URL(target, location.origin).href);
    location.replace(next.href);
  };
  function changed(entry = activeEntry) {
    if (!entry?.frame.contentWindow || !entry.route) return false;
    try {
      const child = entry.frame.contentWindow;
      const event = new child.Event('beforeunload', {cancelable:true});
      child.dispatchEvent(event);
      if (event.defaultPrevented) return true;
      // Reuse the approval editor's saved snapshot instead of treating search/filter changes as edits.
      const draftStatus = child.document.getElementById('approvalDraftStatusText')?.dataset.state;
      if (draftStatus === 'saving' || draftStatus === 'error') return true;
      if (draftStatus === 'dirty' && typeof child.hasMeaningfulApprovalDraftContentForReplacement === 'function'
        && child.hasMeaningfulApprovalDraftContentForReplacement()) return true;
      for (const [node, original] of entry.fields) {
        if (!node.isConnected || (!entry.frame.hidden && !node.getClientRects().length)) continue;
        // Explicitly marked read-only filters are context, not business edits.
        // Unmarked inputs and the task's own unsaved guard remain protected.
        if (node.hasAttribute('data-erp-query-control')) continue;
        // The composer already compares its current payload with the last successful save.
        // Keep the generic guard for other open dialogs, not for a saved composer.
        if (draftStatus === 'saved' && node.closest('#draftForm')) continue;
        if (fieldValue(node) !== original) return true;
      }
    } catch (_) { return true; }
    return false;
  }
  function fieldValue(node) {
    return node.type === 'checkbox' || node.type === 'radio' ? node.checked
      : node.type === 'file' ? node.files.length : node.isContentEditable ? node.innerHTML : node.value;
  }
  // Called only by an editor's successful save or explicit discard. Never rebase other drafts.
  function checkpoint(root) {
    if (!root?.ownerDocument) return false;
    const entry = [...new Set([activeEntry,...retained.values()])]
      .find(item => item.frame.isConnected && item.frame.contentDocument === root.ownerDocument);
    if (!entry) return false;
    for (const node of entry.fields.keys()) {
      if (node === root || root.contains(node)) entry.fields.delete(node);
    }
    return true;
  }
  function activePrintState(entry = activeEntry) {
    return ready && !leaving && !requested && entry === activeEntry && entry === printableEntry
      && entry.frame === frame && frame.isConnected && !frame.hidden && current === entry.route;
  }
  function canPrint(entry = activeEntry) {
    try {
      return activePrintState(entry) && routes.route(frame.contentWindow.location.href) === current;
    } catch (_) { return false; }
  }
  function setPrintLock(entry, locked) {
    try { entry.frame.contentDocument?.documentElement.toggleAttribute('data-erp-print-locked', locked); } catch (_) {}
  }
  function lockPrint() {
    printableEntry = null;
    document.documentElement.setAttribute('data-erp-print-locked', '');
    restorePrint();
    for (const entry of new Set([activeEntry,...retained.values()])) setPrintLock(entry,true);
  }
  function printTask(entry = activeEntry) {
    if (canPrint(entry)) entry.frame.contentWindow.print();
  }
  function canLeave() {
    return leaving || canRetain(activeEntry) || !changed() || window.confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?');
  }
  function eligible(entry) {
    if (!entry?.route) return false;
    return routes.route(entry.route) === entry.route;
  }
  function task(entry) { try { return entry.frame.contentWindow.ErpWorkspaceTask; } catch (_) { return null; } }
  function canRetain(entry) {
    const adapter = task(entry);
    if (!eligible(entry) || adapter?.ready !== true || typeof adapter.refresh !== 'function') return false;
    if (retained.has(entry.route) || retained.size < RETAIN_LIMIT) return true;
    return [...retained.values()].some(item => item !== entry && !changed(item));
  }
  function removeEntry(entry) {
    if (!entry) return;
    if (retained.get(entry.route) === entry) retained.delete(entry.route);
    entry.frame.remove(); entry.fields.clear();
  }
  function purge() {
    lockPrint();
    transition += 1;
    for (const entry of new Set([...retained.values(), activeEntry])) removeEntry(entry);
    retained.clear(); window.ErpWorkspace.detachDocument();
  }
  function park() {
    lockPrint();
    window.ErpWorkspace.detachDocument();
    if (canRetain(activeEntry)) {
      if (!retained.has(activeEntry.route) && retained.size >= RETAIN_LIMIT) {
        const victim = [...retained.values()].find(item => item !== activeEntry && !changed(item));
        removeEntry(victim);
      }
      retained.delete(activeEntry.route); retained.set(activeEntry.route, activeEntry);
      activeEntry.frame.hidden = true; activeEntry.frame.removeAttribute('id');
    } else removeEntry(activeEntry);
  }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    return value;
  }
  function runtimeKey(runtime) {
    return JSON.stringify(stable({...runtime,effective_permissions:runtime.effective_permissions.slice().sort()}));
  }
  async function serverAccess() {
    const [identity, access] = await Promise.all([client.auth.getUser(), client.rpc('get_my_erp_runtime')]);
    if (identity.error || access.error) throw new Error('ERP_ACCESS_UNAVAILABLE');
    const id = identity.data?.user?.id, runtime = access.data;
    if (!id || !runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) return null;
    return {id,runtime,key:runtimeKey(runtime)};
  }
  function loading() {
    error.hidden = true;
    clearTimeout(slowTimer); clearTimeout(timer);
    slowTimer = setTimeout(() => { status.textContent = '화면을 불러오고 있습니다…'; status.hidden = false; }, 300);
    timer = setTimeout(() => { status.hidden = true; error.hidden = false; }, 25000);
  }
  function load(target, force = false) {
    const previous = activeEntry;
    const cached = force ? null : retained.get(target);
    if (force && retained.has(target) && !changed(retained.get(target))) removeEntry(retained.get(target));
    park(); requested = target; loading();
    const ticket = ++transition;
    if (cached?.frame.isConnected) {
      activeEntry = cached; frame = cached.frame; frame.id = 'erpWorkspaceFrame';
      // Never expose a held page using an old permission answer. A failed check leaves it locked.
      void (async () => {
        try {
          const access = await serverAccess();
          if (ticket !== transition) return;
          if (!access || access.id !== userId) { purge(); ready=false; leaving=true; home(target); return; }
          if (access.key !== accessKey) {
            purge(); accessKey=access.key;
            const resetTicket=transition;
            window.ErpWorkspace.clear(); await window.ErpWorkspace.connect(client,access.runtime);
            if (!ready || resetTicket!==transition) return;
            activeEntry={frame:document.createElement('iframe'),route:'',fields:new Map()};
            document.getElementById('erpWorkspaceContent').append(activeEntry.frame); frame=activeEntry.frame;
            load(target,true); return;
          }
          await task(cached).refresh({runtime:access.runtime,dirty:changed(cached)});
          if (ticket !== transition) return;
          frame.hidden=false; syncFrame(); attachDocument(frame.contentDocument,cached);
        } catch (failure) {
          if (ticket !== transition) return;
          if (failure?.message === 'ERP_TASK_ACCESS_DENIED') {
            purge(); ready=false; leaving=true; home(target); return;
          }
          status.hidden=true; error.hidden=false;
        }
      })();
      return;
    }
    // Only replace the task browsing context after its own unsaved guard has been checked.
    // Removing the old context avoids a second native prompt and nested history entry;
    // the outer sidebar, focus, scroll and layout are untouched.
    const nextFrame = document.createElement('iframe');
    const taskUrl = new URL(target, location.origin);
    // Cloudflare Pages redirects *.html to extensionless paths. Go directly to the same resource.
    // Query/hash and the allowlisted route remain unchanged; no task or permission data is cached.
    taskUrl.pathname = taskUrl.pathname.replace(/\.html$/, '');
    nextFrame.id = 'erpWorkspaceFrame'; nextFrame.className='erp-workspace-task';
    nextFrame.title = previous.frame.title; nextFrame.src = taskUrl.href;
    activeEntry={frame:nextFrame,route:target,fields:new Map()};
    const entry=activeEntry;
    nextFrame.addEventListener('load',()=>frameLoaded(entry));
    document.getElementById('erpWorkspaceContent').append(nextFrame); frame=nextFrame;
  }
  function navigate(value) {
    let target;
    try { target = new URL(value, location.origin); } catch (_) { return false; }
    if (target.origin !== location.origin) return false;
    const next = routes.route(target.href);
    const isHome = /^\/erp\/?$|^\/erp\/index(?:\.html)?\/?$/.test(target.pathname);
    if (!next && !isHome) return false;
    if (next && (next === requested || (next === current && !requested))) return true;
    if (!ready) return true;
    if (isHome) {
      if ([activeEntry,...retained.values()].some(entry=>changed(entry))
        && !window.confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 전체 메뉴로 이동할까요?')) return true;
      purge();
      leaving = true; location.assign(target.href); return true;
    }
    if (!canLeave()) return true;
    history.pushState({erpWorkspace:true}, '', routes.address(next));
    load(next); window.ErpWorkspace.closeDrawer(); return true;
  }
  function attachDocument(doc, entry = activeEntry) {
    if (attached.has(doc)) return;
    attached.add(doc); entry.fields = new Map();
    const remember = event => {
      const node = event.target;
      if (!event.isTrusted || !node?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      // Also protect editors built without a form wrapper (proposals, meeting text, website fields).
      if (node.disabled || node.readOnly || node.type === 'hidden' || node.hasAttribute('data-erp-query-control')) return;
      if (!entry.fields.has(node)) entry.fields.set(node, fieldValue(node));
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
        event.preventDefault(); printTask(entry);
      }
    });
    // Native menu/programmatic child printing must obey the same gate as keyboard printing.
    const printGuard = doc.createElement('style');
    printGuard.textContent = '@media print{html[data-erp-print-locked] body{display:none!important}}';
    doc.head.append(printGuard);
    entry.frame.contentWindow.addEventListener('beforeprint', () => setPrintLock(entry,!canPrint(entry)));
    entry.frame.contentWindow.addEventListener('hashchange', () => { if (activePrintState(entry)) syncFrame(); });
  }
  function syncFrame() {
    try {
      const child = frame.contentWindow, href = child.location.href;
      if (href === 'about:blank') return;
      const next = routes.route(href);
      if (!next) {
        // Authentication, OAuth callbacks, public screens and cooperative switches leave the shell.
        const target = new URL(href);
        if (target.origin === location.origin) { leaving = true; purge(); location.replace(target.href); }
        else { lockPrint(); status.hidden = true; error.hidden = false; }
        return;
      }
      if (retained.get(activeEntry.route)===activeEntry && activeEntry.route!==next) retained.delete(activeEntry.route);
      activeEntry.route = next; current = next; requested = '';
      printableEntry = activeEntry;
      document.documentElement.removeAttribute('data-erp-print-locked');
      setPrintLock(activeEntry,false);
      history.replaceState({erpWorkspace:true}, '', routes.address(next));
      document.title = child.document.title;
      frame.title = child.document.title || 'ERP 업무 화면';
      window.ErpWorkspace.setDocument(child.document, href);
      status.hidden = true; error.hidden = true; clearTimeout(timer); clearTimeout(slowTimer);
    } catch (_) { lockPrint(); status.hidden = true; error.hidden = false; }
  }
  function frameLoaded(entry = activeEntry) {
    if (!ready) return;
    if (entry !== activeEntry) { removeEntry(entry); return; }
    if (entry.frame.hidden) return;
    syncFrame();
    try { attachDocument(frame.contentDocument, entry); } catch (_) {}
  }
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
    if (!leaving && ([activeEntry,...retained.values()].some(entry=>changed(entry)))) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault(); printTask();
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
    if (!canPrint()) { lockPrint(); return; }
    if (printCopy) return;
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
      const access = await serverAccess();
      if (!access) return home(target);
      const runtime=access.runtime; userId=access.id; accessKey=access.key;
      void window.ErpWorkspace.connect(client, runtime);
      ready = true;
      client.auth.onAuthStateChange((event,session) => {
        if (event === 'SIGNED_OUT' || (session?.user?.id && session.user.id!==userId)) {
          ready=false; leaving=true; purge(); home(target);
        }
      });
      load(target);
    } catch (_) { status.hidden = true; error.hidden = false; }
  }
  window.ErpWorkspaceShell = {start, navigate, checkpoint, version:'20261010.12'};
})();
