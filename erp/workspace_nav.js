/* ERP workspace navigation v1.6.2 — expose existing navigation without leaving retained tasks. */
(() => {
  'use strict';
  // Embedded task panels keep their parent workspace navigation rather than nesting a second rail.
  if (window.top !== window.self) return;
  const VERSION = '20261020.5';
  const catalog = [
    ['btnApproval', '전자결재', 'approval.html', 'approval', ['approval.view'], '✍', true],
    ['btnMypage', '마이페이지', 'mypage.html', 'mypage', ['mypage.view'], '◎', true],
    ['btnAccounting', '회계 관리', 'accounting.html', 'accounting', ['accounting.view'], '▤'],
    ['btnAdmin', '직원 관리', 'admin_employee.html', 'hr', ['hr.admin'], '♙'],
    ['btnCoopSettings', '조합 설정', 'admin_employee.html?section=settings', 'hr', ['hr.admin'], '⚙'],
    ['btnMemberAdmin', '조합원 관리', 'admin_member.html?scope=member_admin&tab=dashboard', 'member_admin', ['member.admin'], '♧', true],
    ['btnParticipationAnalytics', '조합원 참여 현황', 'participation_analytics.html', 'member_admin', ['member.admin'], '▥'],
    ['btnEducationParticipants', '교육·행사 관리', 'participation.html?view=education', 'education', ['member.admin', 'education.manage'], '▣'],
    ['btnSiteAdmin', '홈페이지 관리', 'admin_member.html?scope=site_admin&tab=site', 'site_admin', ['site.admin', 'member.admin'], '◫'],
    ['btnQuizAdmin', '퀴즈 관리', 'quiz_admin.html', 'site_admin', ['site.admin', 'member.admin'], '?'],
    ['btnProposalBuilder', '제안서 만들기', 'proposal_builder.html', 'site_admin', ['site.admin', 'member.admin'], '▧'],
    ['btnOfficialsAdmin', '임원 관리', 'officials_admin.html', '', ['member.admin', 'signature.manage'], '♙'],
    ['btnGovernanceHub', '회의·문서·서명', 'governance.html', '', ['member.admin', 'site.admin', 'minutes.manage', 'documents.manage', 'signature.manage'], '▱', true],
    ['btnAudit', '감사 로그', 'audit_logs.html', 'audit', ['audit.view'], '◷'],
    ['btnPerm', '권한 관리', 'permissions.html', 'permission', ['permission.manage'], '⚿']
  ];
  const extraLabels = {btnVoteHub:'선거·투표 관리',btnServiceContracts:'이용계약·청구서',btnFestivalReceipts:'매출·재고 관리',btnPowerMonitorAdmin:'발전소 모니터링',btnPlatform:'조합 생성·운영 제어',btnSunVillageDemo:'햇빛소득마을',btnVillageEnergy:'발전·정산 현황'};
  const labels = new Map([...catalog.map(item=>[item[0],item[1]]),...Object.entries(extraLabels)]);
  const compare = (a,b) => a.localeCompare(b,'ko-KR') || (a<b?-1:a>b?1:0);
  const cleanOrder = order => [...new Set((Array.isArray(order)?order:[]).filter(id=>typeof id==='string' && /^btn[A-Za-z0-9_-]{1,80}$/.test(id)))];
  function defaultOrder(ids, fallback = id=>id) { return [...ids].sort((a,b)=>compare(labels.get(a)||fallback(a),labels.get(b)||fallback(b)) || compare(a,b)); }
  let state = null, generation = 0, panel, list, brand, brandImage, brandSun, toggle, backdrop, returnFocus, orderButton, orderDialog, orderDraft, orderBusy=false;
  let connections = new WeakMap();
  const authBound = new WeakSet();
  let setupExpiryTimer;
  const localRoots = '.erp-local-navigation .sidebar-menu,.nav-tabs,.nav-pills,[role="tablist"],.step-tabs,.doc-tabs,.tabs,.sub-tabs,[data-workspace-submenu]';
  let submenu, submenuOwner, submenuRows = [], localNavigationRoots = [], submenuFrame;
  const hubDocuments = new Map(), rowButtons = new WeakMap(), rowExpansion = new WeakMap();
  const hubBranches = {
    btnGovernanceHub: {root:'governance',branches:[
      ['cardMinutesAdmin','회의·문서 관리',u=>/\/minutes\/admin_minutes(?:\.html)?\/?$/.test(u.pathname)],
      ['cardMeetingPackages','회의 꾸러미 만들기',u=>/\/minutes\/meeting_workspace(?:\.html)?\/?$/.test(u.pathname)],
      ['cardMeetingAttendance','회의 출석 관리',u=>/\/participation(?:\.html)?\/?$/.test(u.pathname)&&u.searchParams.get('view')==='meeting'],
      ['cardDocumentAdmin','규정·정관 관리',u=>/\/admin_member(?:\.html)?\/?$/.test(u.pathname)&&u.searchParams.get('scope')==='documents_admin'],
      ['cardSignatureAdmin','서명자 준비',u=>/\/officials_signature_admin(?:\.html)?\/?$/.test(u.pathname)]
    ]},
    btnVoteHub: {root:'vote_hub',branches:[
      ['cardVoteCreate','새 선거 만들기',u=>/\/vote\/admin_setup(?:\.html)?\/?$/.test(u.pathname)&&u.searchParams.get('mode')==='create'],
      ['cardVoteSetup','선거 설정·명부',u=>/\/vote\/admin_setup(?:\.html)?\/?$/.test(u.pathname)&&u.searchParams.get('mode')!=='create'],
      ['cardVoteAdmin','선거 진행 관리',u=>/\/vote\/admin(?:\.html)?\/?$/.test(u.pathname)],
      ['cardPrefPollCreate','새 선호도 조사 만들기',u=>/\/vote\/poll_setup(?:\.html)?\/?$/.test(u.pathname)],
      ['cardPrefPollAdmin','선호도 조사 관리',u=>/\/vote\/poll_admin(?:\.html)?\/?$/.test(u.pathname)]
    ]}
  };
  // Layout only: new task groups start folded; permissions always come from the server.
  let openSubmenus = new Set();
  try { openSubmenus = new Set(cleanOrder(JSON.parse(localStorage.getItem('erp_workspace_open_submenus_v2') || '[]'))); } catch (_) {}
  let pageUrl = new URL(location.href), taskDocument = document, localObserver, observedDocument, localClick;
  let path = pageUrl.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/').pop() || 'index';
  let params = new URLSearchParams(pageUrl.search);
  const isIndex = path === 'index' || path === 'erp';
  const base = '/erp/';
  const url = route => new URL(route, new URL(base, location.origin)).href;
  const enabled = (runtime, key) => !key || runtime.modules?.[key] !== false;
  const permissions = runtime => new Set(Array.isArray(runtime.effective_permissions) ? runtime.effective_permissions : []);
  const any = (set, keys) => keys.some(key => set.has(key));

  function active(route) {
    const target = new URL(route, new URL(base, location.origin));
    const leaf = target.pathname.replace(/\.html$/, '').split('/').pop();
    if (leaf === 'admin_member') {
      const scope = params.get('scope') || 'member_admin';
      return path === leaf && scope === target.searchParams.get('scope');
    }
    if (leaf === 'admin_employee') {
      const settings = target.searchParams.get('section') === 'settings';
      if (path === leaf) return (params.get('section') === 'settings') === settings;
      return !settings && ['hr_insurance', 'employment_contracts', 'village_company_info'].includes(path);
    }
    if (leaf === 'governance') return ['governance', 'meeting_workspace', 'admin_minutes', 'officials_signature_admin'].includes(path)
      || (path === 'admin_member' && params.get('scope') === 'documents_admin')
      || (path === 'participation' && params.get('view') === 'meeting');
    if (leaf === 'participation') return path === leaf && (params.get('view') || 'education') === 'education';
    if (leaf === 'vote_hub') return path === leaf || /\/vote\/(?:admin|admin_setup|poll_admin|poll_setup|results)(?:\.html)?\/?$/.test(pageUrl.pathname);
    return path === leaf;
  }

  // Runtime and all capability answers come from existing authenticated, tenant-scoped RPCs.
  // This does not grant access: destination pages and servers retain their checks.
  function allowedItems(runtime) {
    const set = permissions(runtime);
    const narrow = runtime.runtime_profile === 'site_member';
    const baseSet = new Set(runtime.base_effective_permissions || [...set]);
    const items = catalog.filter(item => {
      const [id, , , key, rights] = item;
      if (!enabled(runtime, key) || !any(set, rights)) return false;
      if (runtime.initial_setup?.active && !any(baseSet, rights) && id !== 'btnSiteAdmin') return false;
      if (id === 'btnGovernanceHub' && !['minutes', 'documents', 'signature'].some(k => enabled(runtime, k))) return false;
      if (id === 'btnOfficialsAdmin' && !['member_admin', 'signature'].some(k => enabled(runtime, k))) return false;
      if (id === 'btnPerm' && runtime.runtime_profile === 'workforce_lite') return false;
      if (narrow) {
        if (!['btnMemberAdmin', 'btnSiteAdmin', 'btnAudit'].includes(id)) return false;
        if (['member_admin', 'site_admin'].includes(key) && runtime.module_access?.[key] !== true) return false;
      }
      return true;
    });
    if (!narrow && runtime.initial_setup?.can_manage && !items.some(item=>item[0]==='btnAdmin')) items.push(['btnAdmin','직원 관리','admin_employee.html?section=initial_setup','',[],'♙']);
    if (!narrow && runtime.initial_setup?.active && !items.some(item=>item[0]==='btnCoopSettings')) items.push(['btnCoopSettings','조합 설정','initial_setup.html','',[],'⚙']);
    return items;
  }

  // UI comparison only, matching the shell's unchanged-base draft boundary.
  // This never authorizes a task or replaces its server permission checks.
  function setupBaseKey(runtime) {
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
    const value = {...runtime,effective_permissions:runtime.effective_permissions.slice().sort()};
    if (Array.isArray(runtime.base_effective_permissions)) {
      value.effective_permissions=runtime.base_effective_permissions.slice().sort();
      delete value.initial_setup; delete value.base_effective_permissions;
      if (runtime.runtime_profile==='site_member' && runtime.module_access) {
        value.module_access={...runtime.module_access,site_admin:runtime.base_effective_permissions.includes('site.admin')};
      }
    }
    return JSON.stringify(stable(value));
  }
  function setupMenuRuntime(runtime) {
    const expires = Date.parse(runtime.initial_setup?.expires_at || '');
    if (!Array.isArray(runtime.base_effective_permissions) || runtime.initial_setup?.active !== true
      || !Number.isFinite(expires)) return runtime;
    if (Date.now() < expires && state?.expiredSetupDeadline !== expires) return runtime;
    if (state?.runtime === runtime) state.expiredSetupDeadline = expires;
    // The known deadline can only remove temporary menu entries, never grant rights.
    return {...runtime,effective_permissions:runtime.base_effective_permissions.slice(),
      initial_setup:{...runtime.initial_setup,active:false,areas:{}}};
  }
  function refreshSetupMenus() {
    clearTimeout(setupExpiryTimer);
    if (!state) return;
    const runtime=setupMenuRuntime(state.runtime);
    const signature=JSON.stringify([runtime.initial_setup,runtime.effective_permissions]);
    if (state.setupMenuSignature !== signature) {
      const allowed=new Map(allowedItems(runtime).map(item=>[item[0],item]));
      if (state.villageWorkspace) allowed.delete('btnCoopSettings');
      const catalogIds=new Set(catalog.map(item=>item[0]));
      state.items=state.items.filter(item=>!catalogIds.has(item[0]) || allowed.has(item[0]));
      for (const [id,item] of allowed) if (!state.items.some(existing=>existing[0]===id)) state.items.push(item);
      const couldOrder=state.canOrder,rights=permissions(runtime);
      state.canOrder=runtime.runtime_profile!=='site_member'
        && (state.platformAdmin===true || rights.has('member.admin') || rights.has('site.admin'));
      state.setupMenuSignature=signature; render();
      if (orderDialog?.open) {
        // Refresh both directions without replacing the draft or interrupting a pending save.
        if (!orderBusy && couldOrder!==state.canOrder) orderDialog.querySelector('.erp-order-status').textContent=state.canOrder
          ? '현재 권한을 확인했습니다. 변경한 순서는 유지됩니다.'
          : '현재 권한으로 메뉴 순서를 저장할 수 없습니다. 변경한 순서는 유지됩니다.';
        renderOrder();
      }
    }
    const expires=Date.parse(state.runtime.initial_setup?.expires_at || '');
    if (state.runtime.initial_setup?.active===true && Array.isArray(state.runtime.base_effective_permissions)
      && Number.isFinite(expires) && expires>Date.now()) {
      setupExpiryTimer=setTimeout(refreshSetupMenus,Math.min(expires-Date.now()+1,2147483647));
    }
  }
  function updateSetupRuntime(client, runtime) {
    if (!state || state.client!==client || !runtime?.coop_id || runtime.coop_id!==state.runtime.coop_id
      || runtime.is_active===false || !Array.isArray(runtime.effective_permissions)
      || setupBaseKey(runtime)!==setupBaseKey(state.runtime)) return false;
    state.runtime=runtime; refreshSetupMenus(); return true;
  }

  function link(item) {
    const [id, label, route, , , symbol, mobile] = item;
    const anchor = document.createElement('a');
    anchor.className = 'erp-workspace-link';
    anchor.dataset.menuId = id;
    anchor.dataset.mobile = mobile === true ? 'true' : 'false';
    anchor.href = /^https:\/\//.test(route) ? route : url(route);
    anchor.title = label;
    if (active(route)) { anchor.classList.add('active'); anchor.setAttribute('aria-current', 'page'); }
    const icon = document.createElement('span');
    icon.className = 'erp-workspace-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = symbol;
    const text = document.createElement('span'); text.className = 'erp-workspace-label'; text.textContent = label;
    anchor.append(icon, text);
    return anchor;
  }

  function render() {
    if (!panel || !state) return;
    brand.textContent = state.runtime.coop_name || '협동조합 ERP';
    const logo=safeBrandAsset(state.branding?.display_url);
    if(brandImage){brandImage.hidden=!logo;if(logo)brandImage.src=logo;else brandImage.removeAttribute('src');}
    if(brandSun)brandSun.hidden=!!logo;
    const ordered = [...state.items].sort((a, b) => {
      const rank = id => { const n = state.order.indexOf(id); return n < 0 ? 1000 : n; };
      return rank(a[0]) - rank(b[0]) || compare(a[1],b[1]) || compare(a[0],b[0]);
    });
    list.replaceChildren(link(['home', '전체 메뉴', 'index.html', '', [], '⌂', true]), ...ordered.map(link));
    if (isIndex) list.firstElementChild.setAttribute('aria-current', 'page');
    document.body.classList.toggle('erp-workspace-election', state.items.some(item => item[0] === 'btnVoteHub'));
    orderButton.hidden = !(state.canOrder && state.orderLoaded && state.items.length > 1);
    syncSubmenu();
  }

  function localVisible(node) {
    if (!node?.isConnected || node.closest('.modal,dialog,#rptTab,#erpWorkspaceSidebar,[data-erp-home-link]')) return false;
    for (let parent = node; parent && parent !== node.ownerDocument.body; parent = parent.parentElement) {
      if (parent.hidden || parent.matches('.hidden,.d-none') || node.ownerDocument.defaultView.getComputedStyle(parent).display === 'none'
        || node.ownerDocument.defaultView.getComputedStyle(parent).visibility === 'hidden') return false;
      if (parent.matches('.tab-pane,.tab-panel,.step-panel,.sub-panel') && !parent.classList.contains('active')) return false;
    }
    return true;
  }
  function localLabel(node) {
    if (node.matches('[data-workspace-submenu]') && node.querySelector('strong')) return node.querySelector('strong').textContent.trim();
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.badge,i,svg,.sidebar-return-meta,.visually-hidden').forEach(el => el.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }
  function localDisabled(node) { return node.disabled || node.matches('.disabled,[aria-disabled="true"]') || !!node.closest('.nav-item.disabled,[inert]'); }
  function localSelected(node) { return node.classList.contains('active') || node.getAttribute('aria-selected') === 'true'; }
  function clearSubmenu() {
    if (submenuOwner) {
      submenuOwner.removeAttribute('aria-expanded'); submenuOwner.removeAttribute('aria-controls');
      delete submenuOwner.dataset.hasSubmenu;
    }
    submenu?.remove(); submenu = null; submenuOwner = null; submenuRows = [];
  }
  function setSubmenuOpen(open) {
    if (!submenu || !submenuOwner) return false;
    if (open && document.body.classList.contains('erp-workspace-collapsed') && !matchMedia('(max-width: 991.98px)').matches) {
      panel.querySelector('.erp-workspace-collapse')?.click();
    }
    submenu.hidden = !open; submenuOwner.setAttribute('aria-expanded', String(open));
    if (open) openSubmenus.add(submenuOwner.dataset.menuId); else openSubmenus.delete(submenuOwner.dataset.menuId);
    try { localStorage.setItem('erp_workspace_open_submenus_v2', JSON.stringify([...openSubmenus])); } catch (_) {}
    return true;
  }
  function toggleCurrentMenu(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const owner = event.target.closest?.('a.erp-workspace-link.active');
    if (!owner || owner !== submenuOwner || !submenu) return;
    event.preventDefault(); event.stopPropagation();
    const collapsed = document.body.classList.contains('erp-workspace-collapsed') && !matchMedia('(max-width: 991.98px)').matches;
    setSubmenuOpen(collapsed || submenu.hidden); // Disclosure never navigates, confirms discard or reloads a task.
  }
  function sourceAlive(source) {
    if (!source?.isConnected) return false;
    const doc=source.ownerDocument;
    if (doc===taskDocument) return true;
    const frame=doc.defaultView?.frameElement;
    return !!frame?.isConnected && frame.contentDocument===doc && doc.defaultView.location.origin===location.origin;
  }
  function paneFor(source) {
    const doc=source.ownerDocument;
    let target=source.getAttribute('data-bs-target') || source.getAttribute('href');
    if (target?.startsWith('#') && /^#[\w-]+$/.test(target)) return doc.getElementById(target.slice(1));
    target=source.getAttribute('aria-controls');
    if (target && /^[\w-]+$/.test(target)) return doc.getElementById(target);
    if (source.dataset.step) return [...doc.querySelectorAll('.step-panel[data-panel]')].find(n=>n.dataset.panel===source.dataset.step) || null;
    if (source.id.startsWith('tab-btn-')) return doc.getElementById('tab-'+source.id.slice(8));
    if (source.id.startsWith('sub-tab-')) return doc.getElementById('sub-panel-'+source.id.slice(8));
    if (source.id.startsWith('nav-')) return doc.getElementById('tab-'+source.id.slice(4));
    return null;
  }
  function hierarchyRows(owner,sources) {
    let current=sources.map(source=>({source,label:localLabel(source),selected:localSelected(source),pane:paneFor(source),parent:null}));
    const hub=hubBranches[owner.dataset.menuId];
    let rows=current,branch=null;
    // Retain only live navigation controls from a previously authorized hub, never its business data.
    for (const [key,record] of hubDocuments) if (record.coopId!==state.runtime.coop_id || !sourceAlive(record.doc.body)) hubDocuments.delete(key);
    const taskPath=taskDocument.defaultView?.location.pathname.replace(/\.html$/,'').replace(/\/$/,'').split('/').pop();
    if (hub && path===hub.root && taskPath===hub.root) hubDocuments.set(owner.dataset.menuId,{doc:taskDocument,coopId:state.runtime.coop_id});
    if (hub && path!==hub.root) {
      const match=hub.branches.find(item=>item[2](pageUrl));
      const parent=hubDocuments.get(owner.dataset.menuId);
      const controls=parent?[...parent.doc.querySelectorAll('[data-workspace-submenu]')].filter(n=>sourceAlive(n)&&localVisible(n)&&localLabel(n)):[];
      if (match && controls.some(n=>n.id===match[0])) {
        const ancestors=controls.map(source=>({source,label:localLabel(source),selected:source.id===match[0],pane:null,parent:null}));
        // The document manager also has its own shortcut to the same package middle menu.
        if (ancestors.some(row=>row.source.id==='cardMeetingPackages')) current=current.filter(row=>row.source.id!=='meeting-package-link');
        branch=ancestors.find(row=>row.source.id===match[0]); rows=[...ancestors,...current];
      } else {
        // Direct entry/evicted hub: use its existing navigation route; do not fetch or invent permissions/cards.
        const href=owner.href;
        const back={key:owner.dataset.menuId+':hub',label:owner.title+' 메뉴',href,selected:false,parent:null};
        branch={key:owner.dataset.menuId+':current',label:match?.[1]||taskDocument.title.split('|')[0].trim(),selected:true,parent:null,current:true};
        rows=[back,branch,...current];
      }
    }
    for (const row of current) {
      const business=row.source.closest('#settingTab') && row.source.ownerDocument.querySelector('#coopSettingCategories [data-category="business"]');
      let candidates=current.filter(other=>other!==row && other.pane?.contains(row.source));
      if (business) candidates=current.filter(other=>other.source===business);
      candidates=candidates.filter(other=>!candidates.some(n=>n!==other&&other.pane?.contains(n.pane)&&other.pane!==n.pane));
      row.parent=candidates.length===1?candidates[0]:candidates.find(other=>other.selected)||branch;
      if (!row.parent && branch) row.parent=branch;
    }
    for (const row of rows) row.children=rows.filter(child=>child.parent===row);
    return rows;
  }
  function rowDisabled(row) { return row.source ? !sourceAlive(row.source)||localDisabled(row.source) : false; }
  function rowOpen(row) { return row.source&&rowExpansion.has(row.source)?rowExpansion.get(row.source):row.selected; }
  function setRowOpen(row,open) {
    if (!row.group) return;
    if (row.source) rowExpansion.set(row.source,open); else row.open=open;
    row.group.hidden=!open; row.button.setAttribute('aria-expanded',String(open));
  }
  function activateRow(button) {
    const row=rowButtons.get(button);
    if (!state || !row || !submenuRows.includes(row) || rowDisabled(row)) return scheduleSubmenu();
    if (row.source && !localVisible(row.source)) return scheduleSubmenu();
    if (row.group && row.selected) { setRowOpen(row,row.group.hidden); return; }
    if (row.source) row.source.click();
    else if (row.href) {
      // The same parent-shell route handler owns cancellation, authorization and draft retention.
      if (!window.ErpWorkspaceShell?.navigate(row.href)) location.href=row.href;
    }
    scheduleSubmenu();
  }
  function rowKeydown(event,button) {
    if (event.altKey||event.ctrlKey||event.metaKey||event.shiftKey) return;
    const row=rowButtons.get(button); if (!row) return;
    if (event.key==='ArrowRight' && row.group) {
      event.preventDefault(); setRowOpen(row,true); row.children[0]?.button.focus({preventScroll:true});
    } else if (event.key==='ArrowLeft' && (row.group&&!row.group.hidden || row.parent)) {
      event.preventDefault(); if (row.group&&!row.group.hidden) setRowOpen(row,false); else row.parent.button.focus({preventScroll:true});
    }
  }
  function syncSubmenu() {
    if (submenuFrame!=null) cancelAnimationFrame(submenuFrame);
    submenuFrame = null;
    const owner = state && list?.querySelector('.erp-workspace-link.active');
    localNavigationRoots = [...taskDocument.querySelectorAll(localRoots)].filter(root => !root.closest('.modal,dialog,#rptTab,#erpWorkspaceSidebar'));
    const sources = [...new Set(localNavigationRoots.flatMap(root => root.matches('[data-workspace-submenu]') ? [root]
      : [...root.querySelectorAll('button,a.nav-link,[role="tab"]')]))]
      .filter(node => localVisible(node) && localLabel(node) && !node.closest('.erp-workspace-footer')
        && !(node.id === 'nav-vote-hub' && state?.items.some(item => item[0] === 'btnVoteHub')));
    if (!owner) {
      clearSubmenu(); return;
    }
    const rows=hierarchyRows(owner,sources);
    if (!rows.length) { clearSubmenu(); return; }
    const previous=submenuRows;
    const focused=document.activeElement,focusRow=previous.find(row=>row.button===focused);
    const sameOwner=submenuOwner===owner;
    if (!submenu || !sameOwner) {
      clearSubmenu(); submenu = document.createElement('div'); submenu.className = 'erp-workspace-submenu';
      submenu.setAttribute('role', 'group'); submenu.setAttribute('aria-label', `${owner.title} 세부 메뉴`);
      submenu.dataset.mobile = owner.dataset.mobile; submenuOwner = owner;
      submenu.id = 'erpWorkspaceSubmenu'; owner.dataset.hasSubmenu = 'true';
      owner.setAttribute('aria-controls', submenu.id);
      submenu.hidden = !openSubmenus.has(owner.dataset.menuId);
      owner.setAttribute('aria-expanded', String(!submenu.hidden));
      owner.after(submenu);
    }
    const equivalent=(a,b)=>a&&b&&(a.source?a.source===b.source:a.key===b.key);
    const structural=!sameOwner || rows.length!==previous.length || rows.some((row,i)=>!equivalent(row,previous[i])||!equivalent(row.parent,previous[i]?.parent)&&!!(row.parent||previous[i]?.parent));
    for (const row of rows) {
      const old=previous.find(other=>equivalent(row,other));
      row.button=old?.button||document.createElement('button');
      const button=row.button;
      if (!old) { button.type='button';button.className='erp-workspace-sublink';button.addEventListener('click',()=>activateRow(button));button.addEventListener('keydown',event=>rowKeydown(event,button)); }
      rowButtons.set(button,row); button.textContent=row.label;button.setAttribute('aria-label',row.label);button.disabled=!!rowDisabled(row);button.classList.toggle('active',row.selected);
      if(row.selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
      if(row.children.length) {
        row.group=old?.group||document.createElement('div');row.group.className='erp-workspace-subgroup';row.group.setAttribute('role','group');row.group.setAttribute('aria-label',row.label+' 하위 메뉴');
        button.dataset.hasChildren='true';setRowOpen(row,row.source?rowOpen(row):old?.group?!old.group.hidden:row.selected);
      } else { delete button.dataset.hasChildren;button.removeAttribute('aria-expanded'); }
    }
    submenuRows=rows;
    if(structural) {
      const append=(parent,container)=>{const nodes=[];for(const row of rows.filter(item=>item.parent===parent)){nodes.push(row.button);if(row.group){append(row,row.group);nodes.push(row.group);}}container.replaceChildren(...nodes);};
      append(null,submenu);
      if(focusRow) { let next=rows.find(row=>equivalent(row,focusRow));if(!next)next=rows.find(row=>equivalent(row,focusRow.parent));(next?.button||owner).focus({preventScroll:true}); }
    }
  }
  function scheduleSubmenu() {
    if (!state || submenuFrame != null) return;
    submenuFrame = requestAnimationFrame(syncSubmenu);
  }
  function observeLocalNavigation() {
    localObserver?.disconnect();
    if (observedDocument && localClick) observedDocument.removeEventListener('click', localClick);
    observedDocument = taskDocument;
    localObserver = new MutationObserver(records => {
      if (!state) return;
      const relevant = records.some(record => {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!node || node.closest('#erpWorkspaceSidebar,.erp-order-dialog')) return false;
        const parentDoc=hubDocuments.get(list?.querySelector('.erp-workspace-link.active')?.dataset.menuId)?.doc;
        if(node.ownerDocument===parentDoc&&node.closest('[data-workspace-submenu]'))return true;
        if (localNavigationRoots.some(root => root === node || root.contains(node) || node.contains(root))) return true;
        return record.type === 'childList' && [...record.addedNodes].some(child => child.nodeType === 1
          && (child.matches(localRoots) || child.querySelector(localRoots)));
      });
      if (relevant) scheduleSubmenu();
    });
    localObserver.observe(taskDocument.body, {subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['class','style','hidden','disabled','inert','aria-selected','aria-pressed','aria-disabled']});
    const parentDoc=hubDocuments.get(list?.querySelector('.erp-workspace-link.active')?.dataset.menuId)?.doc;
    if(parentDoc&&parentDoc!==taskDocument&&sourceAlive(parentDoc.body))localObserver.observe(parentDoc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','disabled','aria-disabled']});
    localClick = event => { if (event.target.closest?.(localRoots)) scheduleSubmenu(); };
    taskDocument.addEventListener('click', localClick);
  }

  function prepareLocalDocument(doc, footer) {
    const sidebar = doc.querySelector('#main-system .sidebar'), content = doc.querySelector('#main-system > .main-content');
    if (sidebar && content) {
      sidebar.classList.add('erp-local-navigation');
      const actions = sidebar.querySelector('.sidebar-menu > div:last-child') || doc.querySelector('.erp-workspace-embedded-actions');
      if (actions?.querySelector('[onclick*="logout"]')) {
        if (doc === document) footer.append(actions);
        else {
          // Keep inline handlers in their original window. The outer footer activates that exact control.
          actions.classList.add('erp-workspace-embedded-actions'); doc.body.append(actions);
          for (const original of actions.querySelectorAll('button,a')) {
            if (original.hasAttribute('data-erp-home-link')) continue;
            const proxy = document.createElement('button'); proxy.type = 'button'; proxy.className = 'nav-link';
            proxy.textContent = original.textContent.trim(); proxy.onclick = () => original.click(); footer.append(proxy);
          }
        }
      }
      if (sidebar.parentElement !== content) content.prepend(sidebar);
      sidebar.querySelectorAll('.sidebar-menu > a:not([href])').forEach(anchor => {
        anchor.setAttribute('role', 'button'); anchor.tabIndex = 0;
        if (!anchor.dataset.erpWorkspaceKeyboard) {
          anchor.dataset.erpWorkspaceKeyboard='1';
          anchor.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); anchor.click(); } });
        }
      });
    }
    doc.querySelectorAll('.nav-tabs').forEach(nav => { if (!nav.closest('.modal')) nav.classList.add('erp-workspace-tabs'); });
  }

  function setDocument(doc, href) {
    if (!state || !panel || !doc?.body || doc.defaultView.location.origin !== location.origin) return false;
    taskDocument = doc; pageUrl = new URL(href); params = new URLSearchParams(pageUrl.search);
    path = pageUrl.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/').pop();
    doc.body.classList.add('erp-workspace', 'erp-workspace-embedded'); doc.body.dataset.erpWorkspaceRevision = VERSION;
    doc.body.classList.toggle('erp-workspace-election', state.items.some(item => item[0] === 'btnVoteHub'));
    const footer = panel.querySelector('.erp-workspace-footer'); footer.replaceChildren();
    prepareLocalDocument(doc, footer);
    list.querySelectorAll('.erp-workspace-link').forEach(anchor => {
      const selected = active(anchor.href); anchor.classList.toggle('active', selected);
      if (selected) anchor.setAttribute('aria-current','page'); else anchor.removeAttribute('aria-current');
    });
    document.querySelector('.erp-workspace-mobile-bar strong').textContent = doc.title.split('|')[0].trim();
    observeLocalNavigation(); syncSubmenu(); return true;
  }
  function detachDocument() {
    if (submenuFrame!=null) cancelAnimationFrame(submenuFrame);
    submenuFrame=null;
    localObserver?.disconnect();
    if (observedDocument && localClick) observedDocument.removeEventListener('click',localClick);
    clearSubmenu(); localNavigationRoots=[];
    panel?.querySelector('.erp-workspace-footer').replaceChildren(); taskDocument=document;
  }

  function fullOrder() {
    return cleanOrder([...state.order,...defaultOrder([...labels.keys()]),...state.items.map(item=>item[0])]);
  }
  function syncOrder(order, coopId) {
    if(!state || state.runtime.coop_id!==coopId || !Array.isArray(order)) return false;
    state.order=cleanOrder(order);render();return true;
  }
  function closeOrder() { if(orderBusy)return; orderDialog?.close();orderDraft=null;orderButton?.focus(); }
  function renderOrder() {
    const rows=orderDialog.querySelector('.erp-order-list'); rows.replaceChildren();
    const visible=new Map(state.items.map(item=>[item[0],item[1]]));
    const ids=orderDraft.filter(id=>visible.has(id));
    const move=(id,target)=>{
      if(orderBusy || !visible.has(id) || !visible.has(target))return;
      const next=ids.slice(),from=next.indexOf(id),to=next.indexOf(target);
      next.splice(from,1);next.splice(to,0,id);
      let index=0;orderDraft=orderDraft.map(item=>visible.has(item)?next[index++]:item);
      renderOrder();orderDialog.querySelector('.erp-order-status').textContent='저장하지 않은 변경사항이 있습니다.';
    };
    ids.forEach((id,index)=>{
      const row=document.createElement('div');row.className='erp-order-row';row.draggable=!orderBusy;
      const name=document.createElement('strong');name.textContent=visible.get(id);
      const actions=document.createElement('span');actions.className='erp-order-arrows';
      for(const [step,symbol,word] of [[-1,'↑','위로'],[1,'↓','아래로']]) {
        const button=document.createElement('button');button.type='button';button.textContent=symbol;
        button.setAttribute('aria-label',`${visible.get(id)} ${word} 이동`);
        button.disabled=orderBusy || index+step<0 || index+step>=ids.length;
        button.onclick=()=>move(id,ids[index+step]);actions.append(button);
      }
      row.append(name,actions);rows.append(row);
      row.addEventListener('dragstart',event=>{if(orderBusy)return event.preventDefault();event.dataTransfer.setData('text/plain',id);});
      row.addEventListener('dragover',event=>{if(!orderBusy)event.preventDefault();});
      row.addEventListener('drop',event=>{event.preventDefault();move(event.dataTransfer.getData('text/plain'),id);});
    });
    orderDialog.querySelectorAll('.erp-order-actions button,.erp-order-close').forEach(button=>button.disabled=orderBusy);
    orderDialog.querySelector('[data-action="save"]').disabled=orderBusy || !state?.canOrder;
  }
  function openOrder() {
    if(!state?.canOrder || !state.orderLoaded || orderBusy)return;
    if(!orderDialog) {
      orderDialog=document.createElement('dialog');orderDialog.className='erp-order-dialog';orderDialog.setAttribute('aria-labelledby','erp-order-title');
      orderDialog.innerHTML='<div class="erp-order-heading"><h2 id="erp-order-title">메뉴 순서</h2><button type="button" class="erp-order-close" aria-label="메뉴 순서 닫기">×</button></div><p>저장한 순서는 현재 조합의 메뉴와 사이드바에 함께 적용됩니다.</p><div class="erp-order-status" role="status"></div><div class="erp-order-list"></div><div class="erp-order-actions"><button type="button" data-action="reset">가나다순으로</button><button type="button" data-action="cancel">취소</button><button type="button" data-action="save">저장</button></div>';
      document.body.append(orderDialog);
      orderDialog.querySelector('.erp-order-close').onclick=closeOrder;
      orderDialog.querySelector('[data-action="cancel"]').onclick=closeOrder;
      orderDialog.addEventListener('cancel',event=>{event.preventDefault();closeOrder();});
      orderDialog.querySelector('[data-action="reset"]').onclick=()=>{orderDraft=defaultOrder(fullOrder());renderOrder();orderDialog.querySelector('.erp-order-status').textContent='저장하면 가나다순으로 적용됩니다.';};
      orderDialog.querySelector('[data-action="save"]').onclick=async()=>{
        if(orderBusy || !state?.canOrder)return;
        const ticket=generation,coopId=state.runtime.coop_id,client=state.client;
        orderBusy=true;renderOrder();orderDialog.querySelector('.erp-order-status').textContent='저장 중입니다…';
        try {
          const {data,error}=await client.rpc('erp_save_menu_order',{p_menu_order:orderDraft.slice(),p_only_if_missing:false});
          if(error)throw error;
          const saved=Array.isArray(data?.menu_order)?data.menu_order:Array.isArray(data)?data:null;
          if(!saved)throw new Error('INVALID_ORDER_RESPONSE');
          if(ticket!==generation || state?.runtime.coop_id!==coopId)return;
          syncOrder(saved,coopId);orderDraft=fullOrder();
          window.dispatchEvent(new CustomEvent('erp-menu-order-saved',{detail:{coopId,order:saved}}));
          orderDialog.querySelector('.erp-order-status').textContent='저장되었습니다.';
        } catch(_) { if(ticket===generation && state)orderDialog.querySelector('.erp-order-status').textContent='저장하지 못했습니다. 변경한 순서는 남아 있습니다. 다시 시도해 주세요.'; }
        finally {orderBusy=false;if(ticket===generation && state && orderDraft)renderOrder();}
      };
    }
    orderDraft=fullOrder();orderDialog.querySelector('.erp-order-status').textContent='';renderOrder();orderDialog.showModal();
  }

  function setDrawer(open) {
    if (!panel) return;
    document.body.classList.toggle('erp-workspace-drawer-open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.inert = matchMedia('(max-width: 991.98px)').matches && !open;
    if (open) { returnFocus = document.activeElement; panel.querySelector('button').focus(); }
    else if (returnFocus?.isConnected) returnFocus.focus();
  }

  function showMenu() {
    if (!state || !panel || panel.hidden) return false;
    if (matchMedia('(max-width: 991.98px)').matches) setDrawer(true);
    else {
      if (document.body.classList.contains('erp-workspace-collapsed')) panel.querySelector('.erp-workspace-collapse')?.click();
      (list.querySelector('a.active') || list.querySelector('a'))?.focus({preventScroll:true});
    }
    return true;
  }

  function mount() {
    if (panel) {
      panel.hidden = false;
      document.body.classList.add('erp-workspace');
      observeLocalNavigation();
      return;
    }
    document.body.classList.add('erp-workspace');
    document.body.dataset.erpWorkspaceRevision = VERSION;
    panel = document.createElement('aside');
    panel.id = 'erpWorkspaceSidebar'; panel.className = 'erp-workspace-sidebar';
    panel.setAttribute('aria-label', 'ERP 업무 메뉴');
    const heading = document.createElement('div'); heading.className = 'erp-workspace-brand';
    const sun = document.createElement('span'); sun.textContent = '☀'; sun.className = 'erp-workspace-sun'; sun.setAttribute('aria-hidden', 'true');brandSun=sun;
    brandImage=document.createElement('img');brandImage.alt='';brandImage.hidden=true;brandImage.style.cssText='width:38px;height:38px;object-fit:contain;flex:0 0 38px';
    brand = document.createElement('strong'); heading.append(brandImage,sun, brand);
    const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'erp-workspace-collapse';
    collapse.textContent = '‹'; collapse.setAttribute('aria-label', '업무 메뉴 접기');
    collapse.setAttribute('aria-controls', panel.id); collapse.setAttribute('aria-expanded', 'true');
    collapse.addEventListener('click', () => {
      if (matchMedia('(max-width: 991.98px)').matches) return setDrawer(false);
      const closed = document.body.classList.toggle('erp-workspace-collapsed');
      collapse.textContent = closed ? '›' : '‹'; collapse.setAttribute('aria-expanded', String(!closed));
      collapse.setAttribute('aria-label', closed ? '업무 메뉴 펼치기' : '업무 메뉴 접기');
      try { localStorage.setItem('erp_workspace_collapsed_v1', closed ? '1' : '0'); } catch (_) {}
    });
    const head = document.createElement('div'); head.className = 'erp-workspace-heading'; head.append(heading, collapse);
    list = document.createElement('nav'); list.className = 'erp-workspace-menu'; list.setAttribute('aria-label', '업무 선택');
    list.addEventListener('click', toggleCurrentMenu);
    list.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.target !== submenuOwner) return;
      if (event.key === ' ') { event.preventDefault(); submenuOwner.click(); }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); setSubmenuOpen(event.key === 'ArrowRight');
      }
    });
    orderButton=document.createElement('button');orderButton.type='button';orderButton.className='erp-workspace-order-button';orderButton.textContent='↕ 메뉴 순서';orderButton.hidden=true;orderButton.onclick=openOrder;
    const footer = document.createElement('div'); footer.className = 'erp-workspace-footer';
    panel.append(head, list, orderButton, footer);
    const mobile = document.createElement('div'); mobile.className = 'erp-workspace-mobile-bar';
    toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '☰';
    toggle.setAttribute('aria-label', '업무 메뉴 열기'); toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
    const title = document.createElement('strong'); title.textContent = document.title.split('|')[0].trim();
    mobile.append(toggle, title); toggle.addEventListener('click', () => setDrawer(true));
    backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'erp-workspace-backdrop';
    backdrop.hidden = true; backdrop.setAttribute('aria-label', '업무 메뉴 닫기'); backdrop.addEventListener('click', () => setDrawer(false));
    document.body.prepend(mobile, backdrop, panel);
    prepareLocalDocument(document, footer); // Preserve IDs, handlers, panes and selectors.
    // Approval form and its existing navigation appearance are intentionally unchanged.
    try { if (!matchMedia('(max-width: 991.98px)').matches && localStorage.getItem('erp_workspace_collapsed_v1') === '1') collapse.click(); } catch (_) {}
    const media = matchMedia('(max-width: 991.98px)');
    const resize = () => { setDrawer(false); panel.inert = media.matches; };
    media.addEventListener('change', resize); resize();
    observeLocalNavigation();
    document.addEventListener('keydown', event => {
      if (!document.body.classList.contains('erp-workspace-drawer-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
      if (event.key !== 'Tab') return;
      const focusables = [...panel.querySelectorAll('a[href],button,summary,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    render();
  }

  async function read(client, name, args, result=false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const request = client.rpc(name, args);
      const { data, error } = await (request.abortSignal ? request.abortSignal(controller.signal) : request);
      return result ? {ok:!error,data:error?null:data} : error ? null : data;
    }
    catch (_) { return result ? {ok:false,data:null} : null; } // Never expose unconfirmed capabilities or interrupt the current task.
    finally { clearTimeout(timer); }
  }

  function safeMonitor(value) {
    try {
      const target = new URL(value);
      return target.protocol === 'https:' && !target.username && !target.password && !target.search && !target.hash ? target.href : null;
    } catch (_) { return null; }
  }

  function safeBrandAsset(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='ifdqlwxgqgsvnawmhlfc.supabase.co'&&!u.search&&!u.hash&&!u.username&&!u.password&&u.pathname.startsWith('/storage/v1/object/public/assets/')?u.href:null;}catch(_){return null;}}
  async function refreshBrand(client,ticket,coopId){const result=await read(client,'erp_coop_branding',{p_action:'get',p_data:{}});if(ticket!==generation||!state||state.runtime.coop_id!==coopId)return;if(result?.coop_id!==coopId)return;state.branding=result;render();const icon=safeBrandAsset(result.icon_url);if(icon){let el=document.querySelector('link[data-erp-brand-icon]');if(!el){el=document.createElement('link');el.rel='icon';el.type='image/png';el.sizes='512x512';el.dataset.erpBrandIcon='true';document.head.appendChild(el);}el.href=icon;}}

  async function hydrate(client, runtime) {
    const ticket = ++generation;
    if (!runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) { clear(); return; }
    state = { runtime, client, items: allowedItems(runtime), order: [],orderLoaded:false,canOrder:false };
    document.querySelector('link[data-erp-brand-icon]')?.remove();
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    if (ticket !== generation) return;
    mount(); render(); refreshSetupMenus();
    refreshBrand(client,ticket,runtime.coop_id).catch(()=>{});
    const narrow = runtime.runtime_profile === 'site_member';
    const full = runtime.runtime_profile === 'legacy_full';
    const set = permissions(runtime);
    const [order, platform, service, festival, monitor, villages, election, workspace] = await Promise.all([
      read(client, 'erp_get_menu_order',undefined,true),
      !narrow ? read(client, 'platform_get_context') : null,
      !narrow ? read(client, 'erp_service_contract', { p_action: 'context' }) : null,
      full && enabled(runtime, 'accounting') && set.has('accounting.view') ? read(client, 'festival_receipts_admin', { p_action: 'access', p_data: {} }) : null,
      full ? read(client, 'get_my_power_monitor_entry') : null,
      !narrow ? read(client, 'sun_village_total_manager_context') : null,
      !narrow && enabled(runtime, 'vote') ? read(client, 'is_election_admin') : null,
      state.items.some(item => item[0] === 'btnAdmin') ? read(client, 'sun_village_workspace_context') : null
    ]);
    if (ticket !== generation) return;
    const currentVillage = workspace?.current_coop_id === runtime.coop_id
      && workspace.workspaces?.some(item => item.is_current === true
        && item.coop_id === runtime.coop_id && item.is_management_coop === false);
    state.villageWorkspace=!!currentVillage;
    if (currentVillage) {
      // Only relabel the already-authorized HR entry. Do not add staff or settings rights.
      state.items = state.items.filter(item => item[0] !== 'btnCoopSettings').map(item =>
        item[0] === 'btnAdmin' ? [item[0], '마을 기본정보', 'village_company_info.html', ...item.slice(3)] : item);
    }
    state.orderLoaded=order.ok;state.order=cleanOrder(order.data);
    state.platformAdmin=platform?.is_platform_admin===true;
    const currentRights=permissions(setupMenuRuntime(state.runtime));
    state.canOrder=!narrow && (state.platformAdmin || currentRights.has('member.admin') || currentRights.has('site.admin'));
    if (election === true) state.items.push(['btnVoteHub', '선거·투표 관리', 'vote_hub.html', '', [], '☑']);
    if (service && (service.admin || service.platform || service.representative || service.draft_reviewer)) {
      state.items.push(['btnServiceContracts', '이용계약·청구서', 'service_contracts.html', '', [], '▢']);
    }
    if (festival?.allowed === true) state.items.push(['btnFestivalReceipts', '매출·재고 관리', 'festival_receipts.html', '', [], '▦', true]);
    if (platform?.is_platform_admin === true) {
      state.items.push(['btnPowerMonitorAdmin', '발전소 모니터링', 'power_monitor_admin.html', '', [], '☀', true]);
      state.items.push(['btnPlatform', '조합 생성·운영 제어', 'platform_admin.html', '', [], '⚒']);
    } else if (monitor?.allowed === true && safeMonitor(monitor.url)) {
      state.items.push(['btnPowerMonitorAdmin', '발전소 모니터링', safeMonitor(monitor.url), '', [], '☀', true]);
    }
    if (villages?.enabled === true && villages?.is_total_manager === true) state.items.push(['btnSunVillageDemo', '햇빛소득마을', 'sun_income_village.html', '', [], '⌑']);
    if (!narrow && enabled(runtime, 'accounting') && set.has('accounting.view') && /^village_/.test(path)) {
      state.items.push(['btnVillageEnergy', '발전·정산 현황', 'village_energy_monthly.html', '', [], '☀']);
    }
    render(); refreshSetupMenus();
  }

  function clear() {
    clearTimeout(setupExpiryTimer);
    generation += 1; state = null; connections = new WeakMap();
    orderDialog?.close();orderDraft=null;
    if (list) list.replaceChildren();
    if (submenuFrame != null) cancelAnimationFrame(submenuFrame);
    submenuFrame = null; clearSubmenu(); localNavigationRoots = [];
    hubDocuments.clear();
    if (brand) brand.textContent = '협동조합 ERP';
    if(brandImage){brandImage.hidden=true;brandImage.removeAttribute('src');}if(brandSun)brandSun.hidden=false;
    document.querySelector('link[data-erp-brand-icon]')?.remove();
    document.body?.classList.remove('erp-workspace', 'erp-workspace-drawer-open', 'erp-workspace-election');
    if (backdrop) backdrop.hidden = true;
    if (panel) panel.hidden = true;
    localObserver?.disconnect();
  }

  function connect(client, runtime) {
    if (isIndex) return Promise.resolve(); // The ERP landing page uses its existing menu cards, not a sidebar.
    if (!client?.rpc) return Promise.resolve();
    if (!authBound.has(client) && client.auth?.onAuthStateChange) {
      authBound.add(client);
      client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') clear(); });
    }
    if (runtime) {
      // A page may enforce several modules. One current-page client shares one menu fetch.
      if (connections.has(client)) { updateSetupRuntime(client,runtime); return connections.get(client); }
      const promise = hydrate(client, runtime).catch(() => { clear(); }); connections.set(client, promise); return promise;
    }
    if (connections.has(client)) return connections.get(client);
    const ticket = generation;
    const promise = read(client, 'get_my_erp_runtime').then(data => ticket === generation ? hydrate(client, data) : undefined).catch(() => { clear(); });
    connections.set(client, promise);
    return promise;
  }

  window.ErpWorkspace = { version: VERSION, connect, clear, defaultOrder, syncOrder, setDocument, detachDocument, updateSetupRuntime, showMenu, refreshBrand:()=>state?refreshBrand(state.client,generation,state.runtime.coop_id):Promise.resolve(), closeDrawer:()=>setDrawer(false) };
  window.addEventListener('focus', refreshSetupMenus);
  window.addEventListener('erp-workspace-runtime', event => { void connect(event.detail.client, event.detail.runtime); });
  // Used only by classic-script ERP pages with an already configured tenant-aware client.
  window.addEventListener('load', () => {
    if (isIndex) return; // Index explicitly mounts after its employee/runtime checks.
    try { if (typeof _supabase !== 'undefined') void connect(_supabase); } catch (_) {}
  }, { once: true });
})();
