/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Persistent ERP workspace v1.2.8 — bounded access reads and setup-only menu refresh; retain drafts. */
(() => {
  'use strict';
  let frame = document.getElementById('erpWorkspaceFrame');
  const status = document.getElementById('erpWorkspaceStatus');
  const error = document.getElementById('erpWorkspaceError');
  const routes = window.ErpWorkspaceRoute;
  let current = '', requested = '', client, ready = false, leaving = false, timer, slowTimer, probeTimer;
  let activeEntry = {frame, route:'', fields:new Map()}, accessKey = '', userId = '', transition = 0;
  const retained = new Map(), attached = new WeakSet();
  const RETAIN_LIMIT = 6;
  let accessPending = null, startupPending = null;
  let printableEntry = null, navigationPending = false;
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
    if(node.hasAttribute('data-number-group'))return String(node.value||'').replace(/,/g,'');
    if(node.isContentEditable && !node.textContent.trim() && !node.querySelector('img,video,audio,table,hr,iframe,svg,canvas'))return '';
    return node.type === 'checkbox' || node.type === 'radio' ? node.checked
      : node.type === 'file' ? JSON.stringify(Array.from(node.files||[]).map(f=>[f.name,f.size,f.type,f.lastModified])) : node.isContentEditable ? node.innerHTML : node.value;
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
  async function canLeave() {
    return leaving || canRetain(activeEntry) || !changed() || await window.CoopDialog.confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?');
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
    try { window.CoopDialog.cancelAll(entry.frame.contentWindow); } catch (_) {}
    if (retained.get(entry.route) === entry) retained.delete(entry.route);
    entry.frame.remove(); entry.fields.clear();
  }
  function purge() {
    cancelLoading();
    lockPrint();
    window.CoopDialog.cancelAll();
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
      try { window.CoopDialog.cancelAll(activeEntry.frame.contentWindow); } catch (_) {}
      activeEntry.frame.hidden = true; activeEntry.frame.removeAttribute('id');
    } else removeEntry(activeEntry);
  }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    return value;
  }
  function runtimeKey(runtime) {
    const value={...runtime,effective_permissions:runtime.effective_permissions.slice().sort()};
    // Only the expiring setup overlay is independent of base business authority.
    // Real identity, coop, modules, employee blocks and base permission changes still purge.
    if (Array.isArray(runtime.base_effective_permissions)) {
      value.effective_permissions=runtime.base_effective_permissions.slice().sort();
      delete value.initial_setup; delete value.base_effective_permissions;
      if (runtime.runtime_profile==='site_member' && runtime.module_access) {
        value.module_access={...runtime.module_access,site_admin:runtime.base_effective_permissions.includes('site.admin')};
      }
    }
    return JSON.stringify(stable(value));
  }
  function initialOverlayAllows(entry,runtime) {
    if (!Array.isArray(runtime?.base_effective_permissions)) return true;
    const target=new URL(entry.route,location.origin),leaf=target.pathname.replace(/\.html$/,'').split('/').pop();
    const scoped=leaf==='admin_member' && target.searchParams.get('scope')==='member_admin';
    if (scoped) return true; // This page never derives member rights from the setup overlay.
    const usesSite=['admin_member','quiz_admin','proposal_builder','governance','admin_minutes','meeting_workspace'].includes(leaf);
    if (!usesSite) return true;
    const ordinary=runtime.base_effective_permissions;
    const rights=leaf==='governance'||leaf==='admin_minutes'||leaf==='meeting_workspace'
      ? ['site.admin','member.admin','minutes.manage','documents.manage','signature.manage']
      : leaf==='admin_member' && target.searchParams.get('scope')==='documents_admin'
        ? ['site.admin','member.admin','documents.manage'] : ['site.admin','member.admin'];
    if (rights.some(k=>ordinary.includes(k))) return true;
    return runtime.initial_setup?.active===true && runtime.initial_setup?.areas?.site===true
      && runtime.effective_permissions.includes('site.admin');
  }
  async function serverAccess() {
    const source = client;
    if (accessPending?.client === source) return accessPending.promise;
    const controller = new AbortController();
    let deadline;
    const work = Promise.resolve().then(async () => {
      const request = source.rpc('get_my_erp_runtime');
      const [identity, access] = await Promise.all([source.auth.getUser(),
        request.abortSignal ? request.abortSignal(controller.signal) : request]);
      if (identity.error || access.error) throw new Error('ERP_ACCESS_UNAVAILABLE');
      const id = identity.data?.user?.id, runtime = access.data;
      if (!id || !runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) return null;
      return {id,runtime,key:runtimeKey(runtime)};
    });
    const job = {client:source, promise:null};
    job.promise = Promise.race([work, new Promise((_, reject) => {
      deadline = setTimeout(() => { reject(new Error('ERP_ACCESS_TIMEOUT')); controller.abort(); }, 15000);
    })]).finally(() => { clearTimeout(deadline); if (accessPending === job) accessPending = null; });
    accessPending = job;
    return job.promise; // Late getUser results cannot settle a timed-out attempt or unlock a task.
  }
  function cancelLoading() {
    clearTimeout(slowTimer); clearTimeout(timer); clearTimeout(probeTimer);
  }
  function preparedFrame(entry, ticket) {
    if (ticket !== transition || entry !== activeEntry || !ready || leaving
      || requested !== entry.route || !entry.frame.isConnected || entry.frame.hidden) return false;
    try {
      const doc = entry.frame.contentDocument;
      // Ignore the initial empty browsing context and foreign/redirecting documents.
      // Task registration is performed after that page's normal authorization/bootstrap.
      if (!doc?.body || routes.route(entry.frame.contentWindow.location.href) !== entry.route) return false;
      const adapter = task(entry);
      if (doc.readyState !== 'complete'
        && !(doc.readyState === 'interactive' && adapter?.ready === true && typeof adapter.refresh === 'function')) return false;
      frameLoaded(entry);
      return requested === '' && current === entry.route && error.hidden;
    } catch (_) { return false; }
  }
  function watchFrame(entry, ticket) {
    clearTimeout(probeTimer);
    const inspect = () => {
      if (ticket !== transition || entry !== activeEntry || !requested || !ready || leaving) return;
      if (!preparedFrame(entry, ticket)) probeTimer = setTimeout(inspect, 250);
    };
    probeTimer = setTimeout(inspect, 250);
  }
  function loading() {
    const text = error.querySelector('p');
    if (text) text.textContent = '화면을 불러오지 못했습니다.';
    error.hidden = true;
    cancelLoading();
    slowTimer = setTimeout(() => { status.textContent = '화면을 불러오고 있습니다…'; status.hidden = false; }, 300);
    timer = setTimeout(() => { clearTimeout(probeTimer); status.hidden = true; error.hidden = false; }, 25000);
  }
  function load(target, force = false) {
    const previous = activeEntry;
    // A retry of the visible prepared task must not manufacture a second context.
    const cached = force ? null : target === activeEntry.route && canRetain(activeEntry)
      ? activeEntry : retained.get(target);
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
          window.ErpWorkspace.updateSetupRuntime?.(client, access.runtime);
          if (!initialOverlayAllows(cached,access.runtime)) {
            // Keep this owner's held draft locked; other unchanged-authority tasks survive.
            status.textContent='초기 설정 권한이 종료되어 화면을 열 수 없습니다. 작성 내용은 보존됩니다.';
            status.hidden=false; error.hidden=false; return;
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
    nextFrame.title = previous.frame.title; nextFrame.loading = 'eager';
    activeEntry={frame:nextFrame,route:target,fields:new Map()};
    const entry=activeEntry;
    nextFrame.addEventListener('load',()=>frameLoaded(entry));
    // Mount the browsing context and its listener before requesting navigation.
    frame=nextFrame; document.getElementById('erpWorkspaceContent').append(nextFrame);
    nextFrame.src = taskUrl.href;
    watchFrame(entry,ticket);
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
    if (navigationPending) return true;
    navigationPending = true;
    const entry = activeEntry, ticket = transition;
    void (async () => {
      const allowed = isHome ? ![activeEntry,...retained.values()].some(item=>changed(item))
        || await window.CoopDialog.confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 전체 메뉴로 이동할까요?') : await canLeave();
      if (!allowed || !ready || leaving || entry !== activeEntry || ticket !== transition) return;
      if (isHome) { purge(); leaving=true; location.assign(target.href); return; }
      history.pushState({erpWorkspace:true}, '', routes.address(next));
      load(next); window.ErpWorkspace.closeDrawer();
    })().catch(() => { status.textContent='화면을 이동하지 못했습니다. 작성 중인 내용은 유지됩니다.';status.hidden=false; })
      .finally(() => { navigationPending=false; });
    // Claim the link synchronously; callers must prevent native navigation before awaiting a choice.
    return true;
  }
  function attachDocument(doc, entry = activeEntry) {
    if (attached.has(doc)) return;
    attached.add(doc); entry.fields = new Map();
    const baselines = new WeakMap();
    const editable = event => {
      const node = event.target;
      if (!event.isTrusted || !node?.matches?.('input,textarea,select,[contenteditable="true"]')) return null;
      // Also protect editors built without a form wrapper (proposals, meeting text, website fields).
      if (node.disabled || node.readOnly || node.type === 'hidden' || node.hasAttribute('data-erp-query-control') || node.closest('[data-coop-dialog]') || node.type === 'search') return null;
      return node;
    };
    const remember = event => {
      const node = editable(event);
      if (!node || entry.fields.has(node)) return;
      // Merely focusing a field must not turn later initialization into a user edit.
      baselines.set(node, fieldValue(node));
      // Focus and initialization are not edits. Native editor input commands and
      // each task's own payload/draft guard still protect formatting and content.
    };
    const edited = event => {
      const node = editable(event);
      if (!node || entry.fields.has(node)) return;
      if (baselines.has(node)) entry.fields.set(node, baselines.get(node));
    };
    for (const name of ['focusin','beforeinput','pointerdown']) doc.addEventListener(name, remember, true);
    for (const name of ['input','change']) doc.addEventListener(name, edited, true);
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
      status.hidden = true; error.hidden = true; cancelLoading();
    } catch (_) { lockPrint(); status.hidden = true; error.hidden = false; }
  }
  function frameLoaded(entry = activeEntry) {
    if (!ready) return;
    // An image/resource can finish after the user has parked this exact editor.
    // It is still owned by the retained map, not a superseded disposable frame.
    if (entry !== activeEntry) { if (retained.get(entry.route) !== entry) removeEntry(entry); return; }
    if (entry.frame.hidden) return;
    syncFrame();
    try { attachDocument(frame.contentDocument, entry); } catch (_) {}
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a.erp-workspace-link');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (navigate(anchor.href)) event.preventDefault();
  });
  window.addEventListener('popstate', async () => {
    const next = view();
    if (!next) {
      history.replaceState({erpWorkspace:true}, '', routes.address(current));
      navigate(new URL('index.html',location.href).href);return;
    }
    // Back may return to the visible-before-loading route. It must cancel the
    // pending destination too, and recheck the restored task before revealing it.
    if (next === requested || (next === current && !requested)) return;
    if (navigationPending) { history.replaceState({erpWorkspace:true}, '', routes.address(current));return; }
    const entry=activeEntry,ticket=transition;navigationPending=true;
    try {
      if (!await canLeave()) { history.pushState({erpWorkspace:true}, '', routes.address(current)); return; }
      if (ready && !leaving && entry===activeEntry && ticket===transition) load(next);
    } catch (_) {
      history.replaceState({erpWorkspace:true}, '', routes.address(current));
      status.textContent='화면을 이동하지 못했습니다. 작성 중인 내용은 유지됩니다.';status.hidden=false;
    } finally { navigationPending=false; }
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
  document.getElementById('erpWorkspaceRetry').onclick = async () => {
    if (requested || current) {
      // Never silently replace text/files on a page whose adapter is not ready yet.
      if (!canRetain(activeEntry) && changed(activeEntry)) {
        await window.CoopDialog.alert('작성 중인 내용은 유지했습니다. 화면이 준비된 후 다시 시도해 주세요.');
        return;
      }
      load(requested || current);
    } else void start(client);
  };
  async function start(configuredClient) {
    if (startupPending) return startupPending;
    client = configuredClient;
    const target = view();
    if (!target) return home();
    const retry = document.getElementById('erpWorkspaceRetry');
    error.hidden = true; status.textContent = '권한을 확인하고 있습니다…'; status.hidden = false;
    retry.disabled = true;
    const pending = (async () => { try {
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
    } catch (_) {
      const text = error.querySelector('p');
      if (text) text.textContent = '접근 권한을 확인하지 못했습니다. 다시 시도해 주세요.';
      status.hidden = true; error.hidden = false;
    } })();
    startupPending = pending;
    try { await pending; }
    finally { if (startupPending === pending) { startupPending = null; retry.disabled = false; } }
  }
  window.ErpWorkspaceShell = {start, navigate, checkpoint, version:'20261016.2'};
})();
