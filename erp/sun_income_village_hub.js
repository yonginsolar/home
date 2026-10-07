/* Sun-income-village management hub v3.4.0 */
(() => {
  'use strict';

  const VERSION = '3.4.0';
  const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => Number(value || 0).toLocaleString('ko-KR');
  const statusLabel = { preparing: '준비 중', active: '운영 중', paused: '일시 중지', ended: '종료' };
  const HANDOFF_PARAM = 'workspace_handoff';
  const HANDOFF_SOURCE_PARAM = 'workspace_source';
  const HANDOFF_MODE_PARAM = 'workspace_mode';
  let client = null;
  let context = null;
  let managerContext = null;
  let canCreateCooperative = false;
  let loading = false;
  let openingWorkspaceId = '';
  let pendingCreate = null;

  function setMessage(text, isError = false) {
    const el = $('message');
    el.textContent = String(text || '');
    el.classList.toggle('error', isError);
  }

  function friendly(error) {
    const raw = String(error?.message || error || '');
    if (raw.includes('PLATFORM_ADMIN_REQUIRED')) return '마을조합 추가 권한이 있는 관리자만 처리할 수 있습니다.';
    if (raw.includes('MANAGEMENT_ADMIN_REQUIRED') || error?.code === '42501') return '햇빛소득마을 전체 운영을 맡은 관리자만 이 화면을 열 수 있습니다.';
    if (raw.includes('COOP_NAME_REQUIRED')) return '마을조합 이름을 두 글자 이상 입력해 주세요.';
    if (raw.includes('INVALID_CAPACITY')) return '발전소 설비용량은 0 이상으로 입력해 주세요.';
    if (raw.includes('AUTH_REQUIRED')) return '로그인이 필요합니다.';
    if (raw.includes('VILLAGE_FEE_CHANGED')) return '이용요금이나 기간이 바뀌었습니다. 마을 추가를 다시 눌러 최신 내용을 확인해 주세요.';
    if (raw.includes('VILLAGE_CREATE_REQUEST_CHANGED')) return '확인한 입력 내용과 다릅니다. 마을 추가를 다시 눌러 확인해 주세요.';
    if (raw.includes('VILLAGE_MANAGER_REQUIRED')) return '마을 관리자를 한 명 이상 지정해 주세요.';
    if (raw.includes('ACTIVE_LINKED_EMPLOYEE_REQUIRED')) return 'ERP 로그인이 연결된 재직 직원만 지정할 수 있습니다.';
    if (raw.includes('INACTIVE_VILLAGE_EMPLOYEE')) return '해당 직원의 마을 ERP 계정이 중지되어 있습니다. 직원 상태를 확인해 주세요.';
    if (raw.includes('POPUP_BLOCKED')) return '새 탭을 열지 못했습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.';
    if (raw.includes('HANDOFF_TIMEOUT')) return '로그인 연결 시간이 초과되었습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
    if (raw.includes('ACCESS')) return '이 마을조합을 관리할 권한이 없습니다. 담당자 배정 상태를 확인해 주세요.';
    if (raw.includes('COOP_CODE_ALREADY_EXISTS') || error?.code === '23505') return '같은 운영 공간이 이미 만들어져 있는지 목록을 확인해 주세요.';
    return '처리를 마치지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
  }

  function initTheme() {
    document.documentElement.dataset.theme = 'light';
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient) throw new Error('SUPABASE_LIBRARY_UNAVAILABLE');
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: {
        headers: {
          'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(location) || String(location.hostname || '').toLowerCase()
        }
      }
    });
    return client;
  }

  async function rpc(name, args = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await getClient().rpc(name, args).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeWorkspaceOrigin(raw) {
    try {
      const parsed = new URL(String(raw || '').trim());
      const host = String(parsed.hostname || '').trim().toLowerCase().replace(/\.$/, '');
      const isAllowedHost = host === 'yonginsolar.kr'
        || host === 'www.yonginsolar.kr'
        || host.endsWith('.yonginsolar.kr')
        || host.endsWith('.coopco.kr');
      if (parsed.protocol !== 'https:' || !isAllowedHost) return '';
      return parsed.origin;
    } catch (_) {
      return '';
    }
  }

  function createHandoffNonce() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function validatePreparedWorkspace(prepared, row) {
    try {
      const targetUrl = new URL(String(prepared?.workspace_url || ''));
      const listedUrl = new URL(String(row?.workspace_url || ''));
      if (normalizeWorkspaceOrigin(targetUrl.origin) !== targetUrl.origin) return null;
      if (targetUrl.hostname.toLowerCase() !== listedUrl.hostname.toLowerCase()) return null;
      if (String(prepared?.target_coop_id || '') !== String(row?.coop_id || '')) return null;
      targetUrl.pathname = '/erp/';
      targetUrl.search = '';
      targetUrl.hash = '';
      return targetUrl;
    } catch (_) {
      return null;
    }
  }

  async function handoffSessionToTab(targetTab, targetUrl) {
    const auth = getClient().auth;
    let { data, error } = await auth.getSession();
    let session = data?.session || null;
    if (error || !session?.access_token || !session?.refresh_token) {
      throw error || new Error('AUTH_REQUIRED');
    }

    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (!expiresAtMs || expiresAtMs <= Date.now() + (2 * 60 * 1000)) {
      const refreshed = await auth.refreshSession();
      if (refreshed.error || !refreshed.data?.session?.access_token || !refreshed.data?.session?.refresh_token) {
        throw refreshed.error || new Error('AUTH_REQUIRED');
      }
      session = refreshed.data.session;
    }

    const nonce = createHandoffNonce();
    const handoffUrl = new URL(targetUrl.href);
    handoffUrl.searchParams.set(HANDOFF_PARAM, nonce);
    handoffUrl.searchParams.set(HANDOFF_SOURCE_PARAM, window.location.origin);
    handoffUrl.searchParams.set(HANDOFF_MODE_PARAM, 'open');
    const targetOrigin = handoffUrl.origin;

    return new Promise((resolve, reject) => {
      let sessionSent = false;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', handleMessage);
        callback(value);
      };
      const handleMessage = async event => {
        if (settled || event.source !== targetTab || event.origin !== targetOrigin) return;
        const payload = event.data && typeof event.data === 'object' ? event.data : {};
        if (payload.nonce !== nonce) return;
        if (payload.type === 'erp-workspace-session-request' && !sessionSent) {
          if (payload.targetOrigin !== targetOrigin) return;
          sessionSent = true;
          targetTab.postMessage({
            type: 'erp-workspace-session',
            nonce,
            accessToken: session.access_token,
            refreshToken: session.refresh_token
          }, targetOrigin);
          return;
        }
        if (payload.type === 'erp-workspace-session-ready') {
          const accessToken = String(payload.accessToken || '').trim();
          const refreshToken = String(payload.refreshToken || '').trim();
          if (!accessToken || !refreshToken) return;
          const synced = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (synced.error || !synced.data?.session?.user) {
            finish(reject, synced.error || new Error('WORKSPACE_SOURCE_SESSION_SYNC_FAILED'));
            return;
          }
          finish(resolve, true);
        }
      };
      const timeoutId = window.setTimeout(() => finish(reject, new Error('WORKSPACE_HANDOFF_TIMEOUT')), 20000);
      window.addEventListener('message', handleMessage);
      targetTab.location.replace(handoffUrl.href);
    });
  }

  async function openVillageWorkspace(coopId, trigger) {
    const safeCoopId = String(coopId || '').trim();
    if (!safeCoopId || openingWorkspaceId) return;
    const row = (Array.isArray(context?.villages) ? context.villages : [])
      .find(item => String(item?.coop_id || '') === safeCoopId);
    if (!row || row.service_status !== 'active') return;

    const targetTab = window.open('about:blank', '_blank');
    if (!targetTab) {
      setMessage(friendly(new Error('WORKSPACE_POPUP_BLOCKED')), true);
      return;
    }

    openingWorkspaceId = safeCoopId;
    const originalLabel = trigger?.textContent || '업무 화면 열기';
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '로그인 연결 중…';
    }
    setMessage(`${row.coop_name} 업무 화면을 준비하고 있습니다…`);

    try {
      const prepared = await rpc('sun_village_prepare_workspace_switch', { p_target_coop_id: safeCoopId });
      const targetUrl = validatePreparedWorkspace(prepared, row);
      if (!targetUrl) throw new Error('WORKSPACE_TARGET_VALIDATION_FAILED');
      await handoffSessionToTab(targetTab, targetUrl);
      setMessage(`${row.coop_name} 업무 화면을 새 탭에서 열었습니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] workspace open failed`, error);
      try { targetTab.close(); } catch (_) {}
      setMessage(friendly(error), true);
    } finally {
      openingWorkspaceId = '';
      if (trigger) {
        trigger.disabled = false;
        trigger.textContent = originalLabel;
      }
    }
  }

  function renderSummary(villages) {
    $('villageCount').textContent = number(villages.length);
    $('memberCount').textContent = number(villages.reduce((sum, row) => sum + Number(row.member_count || 0), 0));
    $('approvalCount').textContent = number(villages.reduce((sum, row) => sum + Number(row.approval_pending_count || 0), 0));
    $('minutesCount').textContent = number(villages.reduce((sum, row) => sum + Number(row.minutes_count || 0), 0));
  }

  function renderVillage(row) {
    const active = row.service_status === 'active';
    const rawAddress = String(row.address || '').trim();
    const address = /데모 전용|실제 마을 자료 없음/.test(rawAddress) ? '' : rawAddress;
    const hasCapacity = row.capacity_kw !== null && row.capacity_kw !== undefined && Number.isFinite(Number(row.capacity_kw));
    const capacity = hasCapacity ? `${number(row.capacity_kw)} kW` : '';
    const coreEnabled = ['member_admin','accounting','approval','minutes','documents','signature']
      .filter(key => row.modules?.[key] === true).length;
    return `
      <article class="managed-card panel">
        <div class="managed-head">
          <div><span class="badge status-${esc(row.service_status)}">${esc(statusLabel[row.service_status] || row.service_status)}</span><h3>${esc(row.coop_name)}</h3>${address ? `<p>${esc(address)}</p>` : ''}</div>
          ${capacity ? `<span class="capacity">${esc(capacity)}</span>` : ''}
        </div>
        <div class="mini-stats">
          <span><strong>${number(row.member_count)}</strong>조합원</span>
          <span><strong>${number(row.official_count)}</strong>임원</span>
          <span><strong>${number(row.approval_pending_count)}</strong>결재 대기</span>
          <span><strong>${number(row.journal_count)}</strong>회계 전표</span>
          <span><strong>${number(row.minutes_count)}</strong>의사록</span>
        </div>
        <div class="module-line"><strong>사용 기능</strong><span>조합원 · 임원 · 복식회계 · 전자결재 · 총회·이사회 · 문서·전자서명 (${coreEnabled}/6)</span></div>
        <div class="managed-actions">
          ${active
            ? `<button type="button" class="button primary" data-open-workspace="${esc(row.coop_id)}">업무 화면 열기</button>`
            : '<button type="button" disabled>준비가 끝나면 열 수 있습니다</button>'}
          <button type="button" class="button" data-manage-village="${esc(row.coop_id)}">관리자 지정</button>
        </div>
      </article>`;
  }

  function render() {
    const villages = Array.isArray(context?.villages) ? context.villages : [];
    $('managerTitle').textContent = `${context?.managing_coop_name || '운영협동조합'}의 햇빛소득마을 운영`;
    $('openCreate').hidden = !canCreateCooperative;
    renderSummary(villages);
    $('villageList').innerHTML = villages.length
      ? villages.map(renderVillage).join('')
      : `<div class="empty"><strong>아직 관리 중인 마을조합이 없습니다.</strong><p>${canCreateCooperative ? '마을조합을 추가하면 구성원·회계·결재·회의 업무를 시작할 수 있습니다.' : '마을조합 추가 권한이 있는 관리자에게 요청해 주세요.'}</p>${canCreateCooperative ? '<button type="button" class="primary" data-open-create>첫 마을조합 추가</button>' : ''}</div>`;
    $('villageList').querySelector('[data-open-create]')?.addEventListener('click', openCreate);
    $('villageList').querySelectorAll('[data-open-workspace]').forEach(button => {
      button.addEventListener('click', () => openVillageWorkspace(button.dataset.openWorkspace, button));
    });
    $('villageList').querySelectorAll('[data-manage-village]').forEach(button => {
      button.addEventListener('click', () => openManagerDialog(button.dataset.manageVillage));
    });
    $('content').hidden = false;
  }

  function openManagerDialog(coopId) {
    const row = (Array.isArray(context?.villages) ? context.villages : [])
      .find(village => String(village?.coop_id || '') === String(coopId || ''));
    if (!row || !managerContext) return;
    $('managerVillageId').value = String(coopId);
    $('managerDialogTitle').textContent = `${row.coop_name} 관리자 지정`;
    $('managerDialogError').hidden = true;
    const assigned = new Set((managerContext.assignments || [])
      .filter(item => String(item.village_coop_id) === String(coopId))
      .map(item => String(item.source_emp_id)));
    const employees = Array.isArray(managerContext.employees) ? managerContext.employees : [];
    $('managerCandidates').innerHTML = employees.length
      ? employees.map(employee => {
        const linked = employee.login_linked === true;
        const checked = assigned.has(String(employee.emp_id));
        return `<label class="manager-choice">
          <input type="checkbox" value="${esc(employee.emp_id)}" ${checked ? 'checked' : ''} ${linked ? '' : 'disabled'}>
          <span><strong>${esc(employee.emp_name)}</strong><small>${esc([employee.department, employee.position].filter(Boolean).join(' · '))}${linked ? '' : ' · ERP 로그인 연결 필요'}</small></span>
        </label>`;
      }).join('')
      : '<p class="muted">지정할 수 있는 재직 직원이 없습니다.</p>';
    $('managerDialog').showModal();
  }

  async function saveVillageManagers(event) {
    event.preventDefault();
    const villageId = String($('managerVillageId').value || '');
    const selected = [...$('managerCandidates').querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => input.value);
    const errorEl = $('managerDialogError');
    if (!selected.length) {
      errorEl.textContent = '마을 관리자를 한 명 이상 지정해 주세요.';
      errorEl.hidden = false;
      return;
    }
    $('managerSave').disabled = true;
    errorEl.hidden = true;
    try {
      managerContext = await rpc('sun_village_set_village_managers', {
        p_village_coop_id: villageId,
        p_source_emp_ids: selected
      });
      $('managerDialog').close();
      const village = (context?.villages || []).find(item => String(item.coop_id) === villageId);
      setMessage(`${village?.coop_name || '마을조합'} 관리자 지정을 저장했습니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] manager save failed`, String(error?.code || 'unknown'));
      errorEl.textContent = friendly(error);
      errorEl.hidden = false;
    } finally {
      $('managerSave').disabled = false;
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    $('reload').disabled = true;
    setMessage('마을조합 현황을 불러오고 있습니다…');
    try {
      context = await rpc('sun_village_management_context');
      managerContext = await rpc('sun_village_manager_context');
      try {
        canCreateCooperative = (await rpc('sun_village_creation_fee_quote'))?.can_create === true;
      } catch (capabilityError) {
        canCreateCooperative = false;
        console.warn(`[sun-village-hub ${VERSION}] create capability unavailable`, capabilityError);
      }
      render();
      setMessage('');
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] load failed`, error);
      setMessage(friendly(error), true);
    } finally {
      loading = false;
      $('reload').disabled = false;
    }
  }

  function openCreate() {
    $('createForm').reset();
    $('createError').hidden = true;
    $('createError').textContent = '';
    $('createDialog').showModal();
  }

  async function createVillage(event) {
    event.preventDefault();
    if (loading) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.coop_name || '').trim();
    loading = true;
    $('createSubmit').disabled = true;
    $('createError').hidden = true;
    try {
      const quote = await rpc('sun_village_creation_fee_quote');
      pendingCreate = {values, name, quote};
      $('feeSummary').innerHTML = quote.configured
        ? `<strong>${esc(name)}</strong><p>마을당 연간 이용료: ${number(quote.annual_supply)}원 · 부가세 별도</p><p>${esc(quote.charge_start)} ~ ${esc(quote.charge_end)} · ${number(quote.days)}일 / ${number(quote.annual_days)}일</p><strong>해당 기간 예상 청구액: ${number(Number(quote.supply)+Number(quote.vat))}원 · 부가세 포함</strong>${quote.days===0?'<p>현재 요금 적용기간이 끝났습니다. 이후 이용요금은 별도 협의합니다.</p>':''}`
        : `<strong>${esc(name)}</strong><p>마을당 이용요금은 별도 협의합니다. 요금 확정 후 청구서를 확인해 주세요.</p>`;
      $('feeError').hidden = true;
      $('feeDialog').showModal();
    } catch (error) {
      $('createError').textContent = friendly(error);
      $('createError').hidden = false;
    } finally {
      loading = false;
      $('createSubmit').disabled = false;
    }
  }

  async function confirmVillageFee() {
    if (!pendingCreate || loading) return;
    loading = true;
    $('confirmFee').disabled = true;
    $('cancelFee').disabled = true;
    const {values,name,quote} = pendingCreate;
    try {
      const result = await rpc('sun_village_create_with_fee_notice', {
        p_coop_name:name,p_address:String(values.address||'').trim(),
        p_biz_num:String(values.biz_num||'').trim()||null,
        p_plant_capacity_kw:String(values.plant_capacity_kw||'').trim()===''?null:Number(values.plant_capacity_kw),
        p_fee_quote:quote.quote,p_acknowledged:true,p_request_id:quote.request_id
      });
      if (!result?.fee_notice_recorded) throw new Error('CREATE_RESULT_INVALID');
      pendingCreate = null;
      $('feeDialog').close();
      $('createDialog').close();
      loading = false;
      await load();
      setMessage(`${name}을 추가했습니다. 준비가 끝나면 목록에서 업무 화면을 열 수 있습니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] create failed`, error);
      $('feeError').textContent = friendly(error);
      $('feeError').hidden = false;
    } finally {
      loading = false;
      $('confirmFee').disabled = false;
      $('cancelFee').disabled = false;
    }
  }

  async function boot() {
    initTheme();
    $('openCreate').addEventListener('click', openCreate);
    $('closeCreate').addEventListener('click', () => $('createDialog').close());
    $('reload').addEventListener('click', load);
    $('createForm').addEventListener('submit', createVillage);
    $('cancelFee').onclick = () => { if (!loading) {pendingCreate=null;$('feeDialog').close();} };
    $('feeDialog').addEventListener('cancel',event=>{if(loading)event.preventDefault();else pendingCreate=null;});
    $('confirmFee').onclick = confirmVillageFee;
    $('closeManager').addEventListener('click', () => $('managerDialog').close());
    $('managerForm').addEventListener('submit', saveVillageManagers);
    try {
      const gate = await window.ErpRuntimeGuard.requireUser(getClient(), { redirectUrl: 'index.html' });
      if (!gate.ok) return;
      await load();
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] boot failed`, error);
      setMessage(friendly(error), true);
    }
  }

  boot();
})();
