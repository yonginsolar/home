/* ERP workspace navigation v1.0.1 — read-only navigation; no business-data cache or writes. */
(() => {
  'use strict';
  // Embedded task panels keep their parent workspace navigation rather than nesting a second rail.
  if (window.top !== window.self) return;
  const VERSION = '20261009.2';
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
  let state = null, generation = 0, panel, list, brand, toggle, backdrop, returnFocus;
  let connections = new WeakMap();
  const authBound = new WeakSet();
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/').pop() || 'index';
  const params = new URLSearchParams(location.search);
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
    if (leaf === 'governance') return ['governance', 'meeting_workspace', 'admin_minutes', 'officials_signature_admin'].includes(path);
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
      return rank(a[0]) - rank(b[0]);
    });
    list.replaceChildren(link(['home', '전체 메뉴', 'index.html', '', [], '⌂', true]), ...ordered.map(link));
    if (isIndex) list.firstElementChild.setAttribute('aria-current', 'page');
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
    const footer = document.createElement('div'); footer.className = 'erp-workspace-footer';
    panel.append(head, list, footer);
    const mobile = document.createElement('div'); mobile.className = 'erp-workspace-mobile-bar';
    toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '☰';
    toggle.setAttribute('aria-label', '업무 메뉴 열기'); toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
    const title = document.createElement('strong'); title.textContent = document.title.split('|')[0].trim();
    mobile.append(toggle, title); toggle.addEventListener('click', () => setDrawer(true));
    backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'erp-workspace-backdrop';
    backdrop.hidden = true; backdrop.setAttribute('aria-label', '업무 메뉴 닫기'); backdrop.addEventListener('click', () => setDrawer(false));
    document.body.prepend(mobile, backdrop, panel);
    const sidebar = document.querySelector('#main-system > .sidebar');
    const content = document.querySelector('#main-system > .main-content');
    if (sidebar && content) {
      sidebar.classList.add('erp-local-navigation');
      const actions = sidebar.querySelector('.sidebar-menu > div:last-child');
      if (actions?.querySelector('[onclick*="logout"]')) footer.append(actions);
      content.prepend(sidebar); // Keep IDs, handlers, panes and legacy .sidebar-menu selectors intact.
      sidebar.querySelectorAll('.sidebar-menu > a:not([href])').forEach(anchor => {
        anchor.setAttribute('role', 'button'); anchor.tabIndex = 0;
        anchor.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); anchor.click(); } });
      });
    }
    document.querySelectorAll('.nav-tabs').forEach(nav => { if (!nav.closest('.modal')) nav.classList.add('erp-workspace-tabs'); });
    // Approval form and its existing navigation appearance are intentionally unchanged.
    try { if (!matchMedia('(max-width: 991.98px)').matches && localStorage.getItem('erp_workspace_collapsed_v1') === '1') collapse.click(); } catch (_) {}
    const media = matchMedia('(max-width: 991.98px)');
    const resize = () => { setDrawer(false); panel.inert = media.matches; };
    media.addEventListener('change', resize); resize();
    document.addEventListener('keydown', event => {
      if (!document.body.classList.contains('erp-workspace-drawer-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
      if (event.key !== 'Tab') return;
      const focusables = [...panel.querySelectorAll('a[href],button,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    render();
  }

  async function read(client, name, args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const request = client.rpc(name, args);
      const { data, error } = await (request.abortSignal ? request.abortSignal(controller.signal) : request);
      return error ? null : data;
    }
    catch (_) { return null; } // Never expose unconfirmed capabilities or interrupt the current task.
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
    state = { runtime, items: allowedItems(runtime), order: [] };
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    if (ticket !== generation) return;
    mount(); render();
    const narrow = runtime.runtime_profile === 'site_member';
    const full = runtime.runtime_profile === 'legacy_full';
    const set = permissions(runtime);
    const [order, platform, service, festival, monitor, villages] = await Promise.all([
      read(client, 'erp_get_menu_order'),
      read(client, 'platform_get_context'),
      read(client, 'erp_service_contract', { p_action: 'context' }),
      full && enabled(runtime, 'accounting') && set.has('accounting.view') ? read(client, 'festival_receipts_admin', { p_action: 'access', p_data: {} }) : null,
      full ? read(client, 'get_my_power_monitor_entry') : null,
      !narrow ? read(client, 'sun_village_total_manager_context') : null
    ]);
    if (ticket !== generation) return;
    if (Array.isArray(order)) state.order = order.filter(id => typeof id === 'string');
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
    if (list) list.replaceChildren();
    if (brand) brand.textContent = '협동조합 ERP';
    document.body?.classList.remove('erp-workspace', 'erp-workspace-drawer-open');
    if (backdrop) backdrop.hidden = true;
    if (panel) panel.hidden = true;
  }

  function connect(client, runtime) {
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

  window.ErpWorkspace = { version: VERSION, connect, clear };
  window.addEventListener('erp-workspace-runtime', event => { void connect(event.detail.client, event.detail.runtime); });
  // Used only by classic-script ERP pages with an already configured tenant-aware client.
  window.addEventListener('load', () => {
    if (isIndex) return; // Index explicitly mounts after its employee/runtime checks.
    try { if (typeof _supabase !== 'undefined') void connect(_supabase); } catch (_) {}
  }, { once: true });
})();
