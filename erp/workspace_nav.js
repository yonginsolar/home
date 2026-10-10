/* ERP workspace navigation v1.4.0 — persistent rail with original task tab controls. */
(() => {
  'use strict';
  // Embedded task panels keep their parent workspace navigation rather than nesting a second rail.
  if (window.top !== window.self) return;
  const VERSION = '20261010.6';
  const catalog = [
    ['btnApproval', '전자결재', 'approval.html', 'approval', ['approval.view'], '✍', true],
    ['btnMypage', '마이페이지', 'mypage.html', 'mypage', ['mypage.view'], '◎', true],
    ['btnAccounting', '회계 관리', 'accounting.html', 'accounting', ['accounting.view'], '▤'],
    ['btnAdmin', '직원·설정 관리', 'admin_employee.html', 'hr', ['hr.admin'], '⚙'],
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
  let state = null, generation = 0, panel, list, brand, toggle, backdrop, returnFocus, orderButton, orderDialog, orderDraft, orderBusy=false;
  let connections = new WeakMap();
  const authBound = new WeakSet();
  const localRoots = '.erp-local-navigation .sidebar-menu,.nav-tabs,.nav-pills,[role="tablist"],.step-tabs,.doc-tabs,.tabs,.sub-tabs,[data-workspace-submenu]';
  let submenu, submenuOwner, submenuRows = [], localNavigationRoots = [], submenuFrame;
  let closedSubmenus = new Set();
  try { closedSubmenus = new Set(cleanOrder(JSON.parse(localStorage.getItem('erp_workspace_submenus_v1') || '[]'))); } catch (_) {}
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
    if (leaf === 'admin_employee') return ['admin_employee', 'hr_insurance', 'employment_contracts', 'village_company_info'].includes(path);
    if (leaf === 'governance') return ['governance', 'meeting_workspace', 'admin_minutes', 'officials_signature_admin'].includes(path)
      || (path === 'admin_member' && params.get('scope') === 'documents_admin')
      || (path === 'participation' && params.get('view') === 'meeting');
    if (leaf === 'participation') return path === leaf && (params.get('view') || 'education') === 'education';
    if (leaf === 'vote_hub') return path === leaf || /\/vote\/(?:admin|admin_setup|poll_admin|poll_setup)(?:\.html)?\/?$/.test(pageUrl.pathname);
    return path === leaf;
  }

  // Runtime and all capability answers come from existing authenticated, tenant-scoped RPCs.
  // This does not grant access: destination pages and servers retain their checks.
  function allowedItems(runtime) {
    const set = permissions(runtime);
    const narrow = runtime.runtime_profile === 'site_member';
    return catalog.filter(item => {
      const [id, , , key, rights] = item;
      if (!enabled(runtime, key) || !any(set, rights)) return false;
      if (id === 'btnGovernanceHub' && !['minutes', 'documents', 'signature'].some(k => enabled(runtime, k))) return false;
      if (id === 'btnOfficialsAdmin' && !['member_admin', 'signature'].some(k => enabled(runtime, k))) return false;
      if (id === 'btnPerm' && runtime.runtime_profile === 'workforce_lite') return false;
      if (narrow) {
        if (!['btnMemberAdmin', 'btnSiteAdmin', 'btnAudit'].includes(id)) return false;
        if (['member_admin', 'site_admin'].includes(key) && runtime.module_access?.[key] !== true) return false;
      }
      return true;
    });
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
  function localDisabled(node) { return node.disabled || node.matches('.disabled,[aria-disabled="true"]') || !!node.closest('.nav-item.disabled'); }
  function localSelected(node) { return node.classList.contains('active') || node.getAttribute('aria-selected') === 'true'; }
  function syncSubmenu() {
    submenuFrame = null;
    const owner = state && list?.querySelector('.erp-workspace-link.active');
    localNavigationRoots = [...taskDocument.querySelectorAll(localRoots)].filter(root => !root.closest('.modal,dialog,#rptTab,#erpWorkspaceSidebar'));
    const sources = [...new Set(localNavigationRoots.flatMap(root => root.matches('[data-workspace-submenu]') ? [root]
      : [...root.querySelectorAll('button,a.nav-link,[role="tab"]')]))]
      .filter(node => localVisible(node) && localLabel(node) && !node.closest('.erp-workspace-footer')
        && !(node.id === 'nav-vote-hub' && state?.items.some(item => item[0] === 'btnVoteHub')));
    if (!owner || !sources.length) {
      submenu?.remove(); submenu = null; submenuOwner = null; submenuRows = []; return;
    }
    // Preserve mirror nodes/focus during ordinary page rendering. Never clone original IDs or handlers.
    if (!submenu || submenuOwner !== owner || sources.length !== submenuRows.length || sources.some((node,i) => node !== submenuRows[i]?.source)) {
      if (submenu && submenuOwner) {
        if (submenu.open) closedSubmenus.delete(submenuOwner.dataset.menuId); else closedSubmenus.add(submenuOwner.dataset.menuId);
      }
      submenu?.remove(); submenu = document.createElement('details'); submenu.className = 'erp-workspace-submenu';
      submenu.setAttribute('role', 'group'); submenu.setAttribute('aria-label', `${owner.title} 세부 메뉴`);
      submenu.dataset.mobile = owner.dataset.mobile; submenuOwner = owner;
      submenu.open = !closedSubmenus.has(owner.dataset.menuId);
      const details = submenu, summary = document.createElement('summary');
      summary.className = 'erp-workspace-submenu-toggle'; summary.textContent = '세부 메뉴';
      details.append(summary);
      details.addEventListener('toggle', () => {
        if (!state || submenu !== details) return;
        if (details.open) closedSubmenus.delete(owner.dataset.menuId); else closedSubmenus.add(owner.dataset.menuId);
        try { localStorage.setItem('erp_workspace_submenus_v1', JSON.stringify([...closedSubmenus])); } catch (_) {}
      });
      submenuRows = sources.map(source => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'erp-workspace-sublink';
        button.addEventListener('click', () => {
          // Recheck the original control at activation, including permission-dependent visibility.
          if (!state || !localVisible(source) || localDisabled(source)) return scheduleSubmenu();
          source.click(); scheduleSubmenu();
        });
        submenu.append(button); return {source,button};
      });
      owner.after(submenu);
    }
    submenuRows.forEach(({source,button}) => {
      const label = localLabel(source), selected = localSelected(source), disabled = !!localDisabled(source);
      if (button.textContent !== label) button.textContent = label;
      button.disabled = disabled; button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    });
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
        if (localNavigationRoots.some(root => root === node || root.contains(node) || node.contains(root))) return true;
        return record.type === 'childList' && [...record.addedNodes].some(child => child.nodeType === 1
          && (child.matches(localRoots) || child.querySelector(localRoots)));
      });
      if (relevant) scheduleSubmenu();
    });
    localObserver.observe(taskDocument.body, {subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['class','style','hidden','disabled','aria-selected','aria-disabled']});
    localClick = event => { if (event.target.closest?.(localRoots)) scheduleSubmenu(); };
    taskDocument.addEventListener('click', localClick);
  }

  function prepareLocalDocument(doc, footer) {
    const sidebar = doc.querySelector('#main-system > .sidebar'), content = doc.querySelector('#main-system > .main-content');
    if (sidebar && content) {
      sidebar.classList.add('erp-local-navigation');
      const actions = sidebar.querySelector('.sidebar-menu > div:last-child');
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
      content.prepend(sidebar);
      sidebar.querySelectorAll('.sidebar-menu > a:not([href])').forEach(anchor => {
        anchor.setAttribute('role', 'button'); anchor.tabIndex = 0;
        anchor.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); anchor.click(); } });
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
    localObserver?.disconnect();
    if (observedDocument && localClick) observedDocument.removeEventListener('click',localClick);
    submenu?.remove(); submenu=null; submenuOwner=null; submenuRows=[]; localNavigationRoots=[];
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
    const sun = document.createElement('span'); sun.textContent = '☀'; sun.className = 'erp-workspace-sun'; sun.setAttribute('aria-hidden', 'true');
    brand = document.createElement('strong'); heading.append(sun, brand);
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

  async function hydrate(client, runtime) {
    const ticket = ++generation;
    if (!runtime?.coop_id || runtime.is_active === false || !Array.isArray(runtime.effective_permissions)) { clear(); return; }
    state = { runtime, client, items: allowedItems(runtime), order: [],orderLoaded:false,canOrder:false };
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    if (ticket !== generation) return;
    mount(); render();
    const narrow = runtime.runtime_profile === 'site_member';
    const full = runtime.runtime_profile === 'legacy_full';
    const set = permissions(runtime);
    const [order, platform, service, festival, monitor, villages, election] = await Promise.all([
      read(client, 'erp_get_menu_order',undefined,true),
      read(client, 'platform_get_context'),
      read(client, 'erp_service_contract', { p_action: 'context' }),
      full && enabled(runtime, 'accounting') && set.has('accounting.view') ? read(client, 'festival_receipts_admin', { p_action: 'access', p_data: {} }) : null,
      full ? read(client, 'get_my_power_monitor_entry') : null,
      !narrow ? read(client, 'sun_village_total_manager_context') : null,
      !narrow && enabled(runtime, 'vote') ? read(client, 'is_election_admin') : null
    ]);
    if (ticket !== generation) return;
    state.orderLoaded=order.ok;state.order=cleanOrder(order.data);
    state.canOrder=platform?.is_platform_admin===true || set.has('member.admin') || set.has('site.admin');
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
    render();
  }

  function clear() {
    generation += 1; state = null; connections = new WeakMap();
    orderDialog?.close();orderDraft=null;
    if (list) list.replaceChildren();
    if (submenuFrame != null) cancelAnimationFrame(submenuFrame);
    submenuFrame = null; submenu = null; submenuOwner = null; submenuRows = []; localNavigationRoots = [];
    if (brand) brand.textContent = '협동조합 ERP';
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
      if (connections.has(client)) return connections.get(client);
      const promise = hydrate(client, runtime).catch(() => { clear(); }); connections.set(client, promise); return promise;
    }
    if (connections.has(client)) return connections.get(client);
    const ticket = generation;
    const promise = read(client, 'get_my_erp_runtime').then(data => ticket === generation ? hydrate(client, data) : undefined).catch(() => { clear(); });
    connections.set(client, promise);
    return promise;
  }

  window.ErpWorkspace = { version: VERSION, connect, clear, defaultOrder, syncOrder, setDocument, detachDocument, closeDrawer:()=>setDrawer(false) };
  window.addEventListener('erp-workspace-runtime', event => { void connect(event.detail.client, event.detail.runtime); });
  // Used only by classic-script ERP pages with an already configured tenant-aware client.
  window.addEventListener('load', () => {
    if (isIndex) return; // Index explicitly mounts after its employee/runtime checks.
    try { if (typeof _supabase !== 'undefined') void connect(_supabase); } catch (_) {}
  }, { once: true });
})();
