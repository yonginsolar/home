/* 햇빛소득마을 운영관리 · 조회/준비 수명주기 보완 */
(() => {
  'use strict';

  const VERSION = '3.4.4';
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
  let managerPending = null;
  let managerRequest = 0;
  let canCreateCooperative = false;
  let loading = false;
  let openingWorkspaceId = '';
  let pendingCreate = null;
  let viewRevision = 0, listPending = null, createPreparation = null, createRevision = 0, createWriting = false;
  const managerSaving = new Map();
  const viewVisible = () => !document.hidden && !window.frameElement?.hidden;
  const createSnapshot = () => JSON.stringify([...new FormData($('createForm')).entries()]);
  let viewObserver = null;

  function invalidateReadViews() {
    ++viewRevision; ++managerRequest; managerPending = null;
    if(listPending){listPending=null;$('reload').disabled=false;}
    if(createPreparation){createPreparation=null;if(!createWriting){loading=false;$('createSubmit').disabled=false;}}
  }
  function drainViewChanges() {if(viewObserver?.takeRecords().length)invalidateReadViews();}

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
    if (raw.includes('SERVICE_VILLAGE_NOT_INCLUDED')) return '계약기간 중 햇빛소득마을 이용이 포함되지 않은 기간이 있습니다. 담당자에게 이용 조건을 확인해 주세요.';
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
    if(['sun_village_management_context','sun_village_manager_context','sun_village_creation_fee_quote'].includes(name)) {
      let deadline;
      try {
        const {data,error}=await Promise.race([getClient().rpc(name,args).abortSignal(controller.signal),new Promise((_,reject)=>{
          deadline=setTimeout(()=>{controller.abort();reject(new Error('VILLAGE_READ_TIMEOUT'));},15000);
        })]);
        if(error)throw error;return data;
      } finally {clearTimeout(deadline);}
    }
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
      if (prepared?.ok !== true || row?.service_status !== 'active') return null;
      const targetUrl = new URL(String(prepared?.workspace_url || ''));
      const listedUrl = new URL(String(row?.workspace_url || ''));
      if (normalizeWorkspaceOrigin(targetUrl.origin) !== targetUrl.origin) return null;
      if (targetUrl.origin!==listedUrl.origin || targetUrl.hostname!==prepared.target_hostname
        || targetUrl.origin!=='https://'+targetUrl.hostname || targetUrl.pathname!=='/erp/'
        || targetUrl.username || targetUrl.password || targetUrl.search || targetUrl.hash) return null;
      if (String(prepared?.target_coop_id || '') !== String(row?.coop_id || '')) return null;
      return targetUrl;
    } catch (_) {
      return null;
    }
  }

  function writeWaitingTab(tab, message) {
    try {
      if (tab.closed || tab.location.href !== 'about:blank') return false;
      const page = tab.document;
      page.title = '마을 ERP 연결';
      const title = page.createElement('h1'), detail = page.createElement('p');
      title.textContent = '마을 ERP 연결';
      detail.textContent = message;
      detail.setAttribute('role','status');
      page.documentElement.lang = 'ko';
      page.body.replaceChildren(title,detail);
      return true;
    } catch (_) { return false; }
  }

  function openVerifiedLoginIfWaiting(tab, url) {
    try {
      // Never overwrite a tab that the user has already navigated, or an
      // in-progress receiver that owns its own clean-login fallback.
      if (!tab.closed && tab.location.href === 'about:blank') tab.location.replace(url.href);
    } catch (_) {}
  }

  async function handoffSessionToTab(targetTab, targetUrl, owner, targetCoopId) {
    const auth = getClient().auth;
    let { data, error } = await auth.getSession();
    let session = data?.session || null;
    if (error || session?.user?.id!==owner || !session.access_token || !session.refresh_token) {
      throw error || new Error('AUTH_REQUIRED');
    }

    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (!expiresAtMs || expiresAtMs <= Date.now() + (2 * 60 * 1000)) {
      const refreshed = await auth.refreshSession();
      if (refreshed.error || refreshed.data?.session?.user?.id!==owner ||
          !refreshed.data.session.access_token || !refreshed.data.session.refresh_token) {
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
      let sessionSent = false, accepting = false;
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
          try {
            const current = await auth.getSession();
            if (settled) return;
            const live = current.data?.session;
            if (current.error || live?.user?.id!==owner || !live.access_token || !live.refresh_token)
              throw new Error('AUTH_REQUIRED');
            session = live;
            targetTab.postMessage({
              type: 'erp-workspace-session', nonce, targetCoopId, ownerAuthId:owner,
              accessToken: session.access_token, refreshToken: session.refresh_token
            }, targetOrigin);
          } catch (err) {finish(reject,err);}
          return;
        }
        if (payload.type === 'erp-workspace-session-failed' && sessionSent) {
          finish(reject,new Error('WORKSPACE_HANDOFF_REJECTED'));
          return;
        }
        if (payload.type === 'erp-workspace-session-ready' && sessionSent && !accepting) {
          const accessToken = String(payload.accessToken || '').trim();
          const refreshToken = String(payload.refreshToken || '').trim();
          if (!accessToken || !refreshToken) return;
          accepting = true;
          try {
            const current = await auth.getSession();
            if(settled)return;
            const live=current.data?.session;
            if(current.error || live?.user?.id!==owner)throw new Error('AUTH_REQUIRED');
            // If a different tab has already refreshed this account, do not
            // overwrite its newer session with this handoff's acknowledgment.
            if (live.refresh_token===session.refresh_token &&
                (accessToken!==live.access_token || refreshToken!==live.refresh_token)) {
              const synced = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              if (synced.error || synced.data?.session?.user?.id!==owner)
                throw synced.error || new Error('WORKSPACE_SOURCE_SESSION_SYNC_FAILED');
            }
            finish(resolve,true);
          } catch (err) {finish(reject,err);}
        }
      };
      const timeoutId = window.setTimeout(() => finish(reject, new Error('WORKSPACE_HANDOFF_TIMEOUT')), 20000);
      window.addEventListener('message', handleMessage);
      try { targetTab.location.replace(handoffUrl.href); }
      catch (error) { finish(reject,error); }
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
    writeWaitingTab(targetTab,'마을 주소와 접근 권한을 확인하고 있습니다…');
    const originalLabel = trigger?.textContent || '업무 화면 열기';
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '로그인 연결 중…';
    }
    setMessage(`${row.coop_name} 업무 화면을 준비하고 있습니다…`);

    let targetUrl = null;
    try {
      const initial = await getClient().auth.getSession();
      const owner = initial.data?.session?.user?.id;
      if(initial.error||!owner)throw new Error('AUTH_REQUIRED');
      const prepared = await rpc('sun_village_prepare_workspace_switch', { p_target_coop_id: safeCoopId });
      targetUrl = validatePreparedWorkspace(prepared, row);
      if (!targetUrl) throw new Error('WORKSPACE_TARGET_VALIDATION_FAILED');
      await handoffSessionToTab(targetTab, targetUrl,owner,safeCoopId);
      setMessage(`${row.coop_name} 업무 화면을 새 탭에서 열었습니다.`);
    } catch (error) {
      if (targetUrl && !targetTab.closed) {
        openVerifiedLoginIfWaiting(targetTab,targetUrl);
        setMessage('자동 로그인 연결을 확인하지 못했습니다. 열린 마을 탭에서 직접 로그인해 주세요.',true);
      } else {
        const message = friendly(error);
        writeWaitingTab(targetTab,message+' 안전한 마을 주소가 확인되지 않아 이동하지 않았습니다.');
        setMessage(message,true);
      }
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

  async function openManagerDialog(coopId) {
    drainViewChanges();const owner=context,request=++managerRequest,visit=viewRevision;
    if(!owner||!viewVisible())return;
    try{
      if(!managerContext){
        if(managerPending?.owner!==owner){
          const pending={owner,promise:null};managerPending=pending;
          pending.promise=rpc('sun_village_manager_context').then(result=>{if(context===owner&&visit===viewRevision&&managerPending===pending)managerContext=result;return result;}).finally(()=>{if(managerPending===pending)managerPending=null;});
        }
        await managerPending.promise;
      }
      if(request!==managerRequest||context!==owner||visit!==viewRevision||!viewVisible())return;
    }catch(error){if(request===managerRequest&&context===owner&&visit===viewRevision&&viewVisible())setMessage(friendly(error),true);return;}
    const row = (Array.isArray(context?.villages) ? context.villages : [])
      .find(village => String(village?.coop_id || '') === String(coopId || ''));
    if (!row || !managerContext) return;
    $('managerVillageId').value = String(coopId);
    $('managerDialogTitle').textContent = `${row.coop_name} 관리자 지정`;
    $('managerDialogError').hidden = true;
    $('managerSave').disabled=managerSaving.has(String(owner.managing_coop_id)+'|'+String(coopId));
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
    drainViewChanges();if(!context||!viewVisible()||!$('managerDialog').open)return;
    const villageId = String($('managerVillageId').value || '');
    const selected = [...$('managerCandidates').querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => input.value);
    const errorEl = $('managerDialogError');
    const owner=context,visit=viewRevision,request=managerRequest,key=String(owner.managing_coop_id)+'|'+villageId;
    if(managerSaving.has(key))return;
    const current=()=>context===owner&&visit===viewRevision&&request===managerRequest&&viewVisible()&&$('managerDialog').open&&$('managerVillageId').value===villageId;
    if (!selected.length) {
      errorEl.textContent = '마을 관리자를 한 명 이상 지정해 주세요.';
      errorEl.hidden = false;
      return;
    }
    $('managerSave').disabled = true;
    const operation={};managerSaving.set(key,operation);
    errorEl.hidden = true;
    try {
      const result = await rpc('sun_village_set_village_managers', {
        p_village_coop_id: villageId,
        p_source_emp_ids: selected
      });
      if(context!==owner||visit!==viewRevision)return;managerContext=result;
      if(!current())return;
      const unchanged=JSON.stringify(selected)===JSON.stringify([...$('managerCandidates').querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value));
      const village = (context?.villages || []).find(item => String(item.coop_id) === villageId);
      setMessage(unchanged?`${village?.coop_name || '마을조합'} 관리자 지정을 저장했습니다.`:'저장했습니다. 추가로 바꾼 선택은 아직 저장되지 않았습니다.');
      if(unchanged)$('managerDialog').close();
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] manager save failed`, String(error?.code || 'unknown'));
      if(current()){errorEl.textContent = friendly(error);errorEl.hidden = false;}
    } finally {
      if(managerSaving.get(key)===operation)managerSaving.delete(key);
      if(context===owner&&viewVisible()&&$('managerDialog').open)$('managerSave').disabled=managerSaving.has(String(owner.managing_coop_id)+'|'+$('managerVillageId').value);
    }
  }

  function load(options={}) {
    const allowHidden=options.allowHidden===true;
    drainViewChanges();if(loading||document.hidden||!allowHidden&&window.frameElement?.hidden)return Promise.resolve();
    if(listPending)return listPending.promise;
    const operation={visit:viewRevision,promise:null};listPending=operation;
    const current=()=>listPending===operation&&operation.visit===viewRevision&&!document.hidden&&(allowHidden||!window.frameElement?.hidden);
    $('reload').disabled = true;
    setMessage('마을조합 현황을 불러오고 있습니다…');
    operation.promise=(async()=>{try {
      const next=await rpc('sun_village_management_context');if(!current())return;
      if(!next?.managing_coop_id||!Array.isArray(next.villages))throw new Error('VILLAGE_CONTEXT_INVALID');
      context = next;
      managerContext=null;
      managerPending=null;
      ++managerRequest;
      canCreateCooperative=false;render();setMessage('');
      try {
        const quote=await rpc('sun_village_creation_fee_quote');if(!current())return;
        canCreateCooperative=quote?.can_create===true;$('openCreate').hidden=!canCreateCooperative;
      } catch (capabilityError) {
        if(!current())return;canCreateCooperative=false;
        if(capabilityError?.code!=='42501')setMessage('마을 추가 권한과 이용요금을 확인하지 못했습니다. 다시 확인해 주세요.',true);
      }
    } catch (error) {
      if(!current())return;
      if(error?.code==='42501'){context=null;managerContext=null;canCreateCooperative=false;$('content').hidden=true;}
      setMessage(friendly(error), true);
    } finally {
      if(listPending===operation){listPending=null;$('reload').disabled=false;}
    }})();return operation.promise;
  }

  function openCreate() {
    drainViewChanges();if(loading||!context||!viewVisible()||!canCreateCooperative)return;
    $('createError').hidden = true;
    $('createError').textContent = '';
    $('createDialog').showModal();
  }

  async function createVillage(event) {
    event.preventDefault();
    drainViewChanges();if (loading||!context||!viewVisible()||!$('createDialog').open) return;
    const operation={owner:context,visit:viewRevision,revision:createRevision,snapshot:createSnapshot()};createPreparation=operation;
    const current=()=>createPreparation===operation&&context===operation.owner&&viewRevision===operation.visit&&createRevision===operation.revision&&createSnapshot()===operation.snapshot&&viewVisible()&&$('createDialog').open;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.coop_name || '').trim();
    loading = true;
    $('createSubmit').disabled = true;
    $('createError').hidden = true;
    try {
      const quote = await rpc('sun_village_creation_fee_quote');
      if(!current())return;
      pendingCreate = {values, name, quote,ownerCoopId:operation.owner.managing_coop_id};
      $('feeSummary').innerHTML = quote.configured
        ? `<strong>${esc(name)}</strong><p>마을당 연간 이용료: ${number(quote.annual_supply)}원 · 부가세 별도</p><p>${esc(quote.charge_start)} ~ ${esc(quote.charge_end)} · ${number(quote.days)}일 / ${number(quote.annual_days)}일</p>${Array.isArray(quote.segments)&&quote.segments.length>1?`<details><summary>기간별 이용료</summary>${quote.segments.map(s=>`<p>${esc(s.start)} ~ ${esc(s.end)}<br>연간 단가 ${number(s.annual_supply)}원 · 해당 기간 ${number(s.supply)}원 (부가세 별도)</p>`).join('')}</details>`:''}<strong>해당 기간 예상 청구액: ${number(Number(quote.supply)+Number(quote.vat))}원 · 부가세 포함</strong>${quote.days===0?'<p>현재 요금 적용기간이 끝났습니다. 이후 이용요금은 별도 협의합니다.</p>':''}`
        : `<strong>${esc(name)}</strong><p>마을당 이용요금은 별도 협의합니다. 요금 확정 후 청구서를 확인해 주세요.</p>`;
      $('feeError').hidden = true;
      $('feeDialog').showModal();
    } catch (error) {
      if(current()){$('createError').textContent = friendly(error);$('createError').hidden = false;}
    } finally {
      if(createPreparation===operation){createPreparation=null;loading=false;$('createSubmit').disabled=false;}
    }
  }

  async function confirmVillageFee() {
    drainViewChanges();if (!pendingCreate || loading||!context||!viewVisible()||pendingCreate.ownerCoopId!==context.managing_coop_id) return;
    const operation=pendingCreate,owner=context,visit=viewRevision;
    const current=()=>context===owner&&viewRevision===visit&&viewVisible();
    loading = true;
    createWriting = true;
    $('confirmFee').disabled = true;
    $('cancelFee').disabled = true;
    const {values,name,quote} = operation;
    try {
      const result = await rpc('sun_village_create_with_fee_notice', {
        p_coop_name:name,p_address:String(values.address||'').trim(),
        p_biz_num:String(values.biz_num||'').trim()||null,
        p_plant_capacity_kw:String(values.plant_capacity_kw||'').trim()===''?null:Number(values.plant_capacity_kw),
        p_fee_quote:quote.quote,p_acknowledged:true,p_request_id:quote.request_id
      });
      if (!result?.fee_notice_recorded) throw new Error('CREATE_RESULT_INVALID');
      if(pendingCreate===operation){pendingCreate=null;if(context===owner){$('feeDialog').close();if(createSnapshot()===JSON.stringify(Object.entries(values))){$('createDialog').close();$('createForm').reset();}}}
      loading = false;
      if(!current())return;
      await load();
      if(viewRevision===visit&&viewVisible()&&context?.managing_coop_id===owner?.managing_coop_id)setMessage(`${name}을 추가했습니다. 준비가 끝나면 목록에서 업무 화면을 열 수 있습니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] create failed`, error);
      if(current()&&pendingCreate===operation){$('feeError').textContent = friendly(error);$('feeError').hidden = false;}
    } finally {
      createWriting = false;
      loading = false;
      $('confirmFee').disabled = false;
      $('cancelFee').disabled = false;
    }
  }

  async function boot() {
    initTheme();
    $('openCreate').addEventListener('click', openCreate);
    const cancelPreparation=()=>{++createRevision;if(!createWriting){pendingCreate=null;if(createPreparation){createPreparation=null;loading=false;$('createSubmit').disabled=false;}}};
    $('closeCreate').addEventListener('click', () => {if(!createWriting)$('createDialog').close();});
    $('createDialog').addEventListener('close',cancelPreparation);
    $('createForm').addEventListener('input',()=>{++createRevision;});
    $('createForm').addEventListener('change',()=>{++createRevision;});
    $('reload').addEventListener('click', load);
    $('createForm').addEventListener('submit', createVillage);
    $('cancelFee').onclick = () => { if (!loading) {pendingCreate=null;$('feeDialog').close();} };
    $('feeDialog').addEventListener('cancel',event=>{if(loading)event.preventDefault();else pendingCreate=null;});
    $('confirmFee').onclick = confirmVillageFee;
    $('closeManager').addEventListener('click', () => $('managerDialog').close());
    $('managerDialog').addEventListener('close',()=>{++managerRequest;});
    $('managerForm').addEventListener('submit', saveVillageManagers);
    try {
      const gate = await window.ErpRuntimeGuard.requireUser(getClient(), { redirectUrl: 'index.html' });
      if (!gate.ok) return;
      getClient().auth.onAuthStateChange?.((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==gate.authUser.id){invalidateReadViews();context=null;managerContext=null;canCreateCooperative=false;$('content').hidden=true;setMessage('로그인 상태를 확인한 뒤 다시 열어 주세요.',true);}});
      void window.ErpWorkspace?.connect(getClient());
      await load();
      window.ErpWorkspaceResume.register({busy:()=>loading,authorize:async runtime=>{
        const next=await rpc('sun_village_management_context');
        return Boolean(next?.managing_coop_id)&&String(next.managing_coop_id)===String(runtime.coop_id);
      },refresh:()=>load({allowHidden:true})});
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] boot failed`, error);
      setMessage(friendly(error), true);
    }
  }

  window.addEventListener('pagehide',invalidateReadViews);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidateReadViews();});
  if(window.frameElement){viewObserver=new MutationObserver(records=>{if(records.length)invalidateReadViews();});viewObserver.observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});}

  boot();
})();
