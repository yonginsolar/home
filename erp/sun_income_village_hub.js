/* Sun-income-village existing ERP tenant hub v3.1.0 */
(() => {
  'use strict';

  const VERSION = '3.1.0';
  const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => Number(value || 0).toLocaleString('ko-KR');
  const money = value => `${number(value)}원`;
  const statusLabel = { preparing: '준비 중', active: '운영 중', paused: '일시 중지', ended: '종료' };
  const accountingModeLabel = { outsourced: '회계사무실 위탁', shared: '공동 처리', self: '자체 회계' };
  const accountingModeHelp = {
    outsourced: '기본 수입·지출, 전자결재 연동과 최근 거래를 중심으로 사용합니다.',
    shared: '조합이 자료와 기본 장부를 정리하고 회계사무실이 검토·확정합니다.',
    self: '계정과목, 고급 분개, 감가상각과 연말결산까지 직접 처리합니다.'
  };
  const HANDOFF_PARAM = 'workspace_handoff';
  const HANDOFF_SOURCE_PARAM = 'workspace_source';
  const HANDOFF_MODE_PARAM = 'workspace_mode';
  let client = null;
  let context = null;
  let canCreateCooperative = false;
  let loading = false;
  let openingWorkspaceId = '';
  let savingAccountingModeId = '';

  function setMessage(text, isError = false) {
    const el = $('message');
    el.textContent = String(text || '');
    el.classList.toggle('error', isError);
  }

  function friendly(error) {
    const raw = String(error?.message || error || '');
    if (raw.includes('PLATFORM_ADMIN_REQUIRED')) return '새 마을조합 운영 공간은 플랫폼 관리자만 만들 수 있습니다.';
    if (raw.includes('MANAGEMENT_ADMIN_REQUIRED') || error?.code === '42501') return '햇빛소득마을 전체 운영을 맡은 관리자만 이 화면을 열 수 있습니다.';
    if (raw.includes('COOP_NAME_REQUIRED')) return '마을조합 이름을 두 글자 이상 입력해 주세요.';
    if (raw.includes('INVALID_CAPACITY')) return '발전소 설비용량은 0 이상으로 입력해 주세요.';
    if (raw.includes('INVALID_ACCOUNTING_OPERATION_MODE')) return '회계 처리 방식을 다시 선택해 주세요.';
    if (raw.includes('AUTH_REQUIRED')) return 'ERP 로그인이 필요합니다.';
    if (raw.includes('POPUP_BLOCKED')) return '새 탭을 열지 못했습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.';
    if (raw.includes('HANDOFF_TIMEOUT')) return '로그인 연결 시간이 초과되었습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
    if (raw.includes('ACCESS')) return '이 마을 ERP를 운영할 권한이 없습니다. 담당자 배정 상태를 확인해 주세요.';
    if (raw.includes('COOP_CODE_ALREADY_EXISTS') || error?.code === '23505') return '같은 운영 공간이 이미 만들어져 있는지 목록을 확인해 주세요.';
    return '처리를 마치지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
  }

  function initTheme() {
    let saved = 'auto';
    try { saved = localStorage.getItem('coop-color-theme') || 'auto'; } catch (_) {}
    if (![...$('theme').options].some(option => option.value === saved)) saved = 'auto';
    $('theme').value = saved;
    const apply = () => {
      const mode = $('theme').value;
      document.documentElement.dataset.theme = mode === 'auto'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : mode;
      try { localStorage.setItem('coop-color-theme', mode); } catch (_) {}
    };
    $('theme').addEventListener('change', apply);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    apply();
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
    const originalLabel = trigger?.textContent || '이 마을조합 ERP 열기';
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '로그인 연결 중…';
    }
    setMessage(`${row.coop_name} ERP에 로그인 상태를 연결하고 있습니다…`);

    try {
      const prepared = await rpc('sun_village_prepare_workspace_switch', { p_target_coop_id: safeCoopId });
      const targetUrl = validatePreparedWorkspace(prepared, row);
      if (!targetUrl) throw new Error('WORKSPACE_TARGET_VALIDATION_FAILED');
      await handoffSessionToTab(targetTab, targetUrl);
      setMessage(`${row.coop_name} ERP를 새 탭에서 열었습니다.`);
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
    const capacity = row.capacity_kw === null || row.capacity_kw === undefined ? '미입력' : `${number(row.capacity_kw)} kW`;
    const coreEnabled = ['member_admin','accounting','approval','minutes','documents','signature']
      .filter(key => row.modules?.[key] === true).length;
    const accountingMode = accountingModeLabel[row.accounting_operation_mode] ? row.accounting_operation_mode : 'outsourced';
    const accountingModeOptions = Object.entries(accountingModeLabel)
      .map(([value, label]) => `<option value="${value}"${value === accountingMode ? ' selected' : ''}>${esc(label)}</option>`)
      .join('');
    return `
      <article class="managed-card panel">
        <div class="managed-head">
          <div><span class="badge status-${esc(row.service_status)}">${esc(statusLabel[row.service_status] || row.service_status)}</span><h3>${esc(row.coop_name)}</h3><p>${esc(row.address || '주소 미입력')}</p></div>
          <span class="capacity">${esc(capacity)}</span>
        </div>
        <div class="mini-stats">
          <span><strong>${number(row.member_count)}</strong>조합원</span>
          <span><strong>${number(row.official_count)}</strong>임원</span>
          <span><strong>${number(row.approval_pending_count)}</strong>결재 대기</span>
          <span><strong>${number(row.journal_count)}</strong>회계 전표</span>
          <span><strong>${number(row.minutes_count)}</strong>의사록</span>
        </div>
        <div class="module-line"><strong>기존 ERP 연결</strong><span>조합원 · 임원 · 복식회계 · 전자결재 · 총회·이사회 · 문서·전자서명 (${coreEnabled}/6)</span></div>
        <div class="accounting-mode-box">
          <label for="accounting-mode-${esc(row.coop_id)}"><strong>회계 처리 방식</strong></label>
          <div class="accounting-mode-actions">
            <select id="accounting-mode-${esc(row.coop_id)}" data-accounting-mode="${esc(row.coop_id)}" aria-describedby="accounting-mode-help-${esc(row.coop_id)}">${accountingModeOptions}</select>
            <button type="button" data-save-accounting-mode="${esc(row.coop_id)}"${savingAccountingModeId ? ' disabled' : ''}>회계 방식 저장</button>
          </div>
          <small id="accounting-mode-help-${esc(row.coop_id)}">${esc(accountingModeHelp[accountingMode])}</small>
        </div>
        <div class="managed-actions">
          ${active
            ? `<button type="button" class="button primary" data-open-workspace="${esc(row.coop_id)}">이 마을조합 ERP 열기</button>`
            : '<button type="button" disabled>웹 주소 연결 후 열 수 있습니다</button>'}
          <span>월 이용료 ${money(row.monthly_fee)}${row.vat_separate ? ' · 부가세 별도' : ''}</span>
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
      : `<div class="empty"><strong>아직 연결된 마을조합이 없습니다.</strong><p>${canCreateCooperative ? '마을조합 운영 공간을 추가하면 기존 ERP의 전체 업무 틀이 빈 장부로 준비됩니다.' : '새 마을조합 운영 공간은 플랫폼 관리자에게 요청해 주세요.'}</p>${canCreateCooperative ? '<button type="button" class="primary" data-open-create>첫 마을조합 추가</button>' : ''}</div>`;
    $('villageList').querySelector('[data-open-create]')?.addEventListener('click', openCreate);
    $('villageList').querySelectorAll('[data-open-workspace]').forEach(button => {
      button.addEventListener('click', () => openVillageWorkspace(button.dataset.openWorkspace, button));
    });
    $('villageList').querySelectorAll('[data-accounting-mode]').forEach(select => {
      select.addEventListener('change', () => {
        const mode = accountingModeLabel[select.value] ? select.value : 'outsourced';
        const help = $(`accounting-mode-help-${select.dataset.accountingMode}`);
        if (help) help.textContent = accountingModeHelp[mode];
      });
    });
    $('villageList').querySelectorAll('[data-save-accounting-mode]').forEach(button => {
      button.addEventListener('click', () => saveAccountingMode(button.dataset.saveAccountingMode, button));
    });
    $('content').hidden = false;
  }

  async function saveAccountingMode(coopId, trigger) {
    const safeCoopId = String(coopId || '').trim();
    if (!safeCoopId || savingAccountingModeId) return;
    const row = (Array.isArray(context?.villages) ? context.villages : [])
      .find(item => String(item?.coop_id || '') === safeCoopId);
    const select = document.querySelector(`[data-accounting-mode="${CSS.escape(safeCoopId)}"]`);
    const mode = String(select?.value || '');
    if (!row || !accountingModeLabel[mode]) return;
    if (row.accounting_operation_mode === mode) {
      setMessage(`${row.coop_name}은 이미 ${accountingModeLabel[mode]} 방식입니다.`);
      return;
    }

    savingAccountingModeId = safeCoopId;
    const originalLabel = trigger?.textContent || '회계 방식 저장';
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '저장 중…';
    }
    setMessage(`${row.coop_name}의 회계 처리 방식을 저장하고 있습니다…`);
    try {
      await rpc('sun_village_set_accounting_operation_mode', {
        p_village_coop_id: safeCoopId,
        p_accounting_operation_mode: mode
      });
      // 새 목록을 그리기 전에 저장 상태를 해제해야 새로 생성된 버튼이
      // 비활성 상태로 남지 않는다.
      savingAccountingModeId = '';
      await load();
      setMessage(`${row.coop_name}의 회계 처리 방식을 ${accountingModeLabel[mode]}(으)로 저장했습니다. 기존 회계 자료는 그대로 유지됩니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] accounting mode save failed`, error);
      setMessage(friendly(error), true);
    } finally {
      savingAccountingModeId = '';
      if (trigger?.isConnected) {
        trigger.disabled = false;
        trigger.textContent = originalLabel;
      }
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    $('reload').disabled = true;
    setMessage('마을조합별 기존 ERP 현황을 불러오고 있습니다…');
    try {
      context = await rpc('sun_village_management_context');
      try {
        canCreateCooperative = await rpc('is_platform_admin') === true;
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
    if (!confirm(`${name}의 독립된 조합원 명부·장부·결재·문서 공간을 만들까요?\n\n기존 운영협동조합 자료는 복사되지 않습니다.`)) return;
    loading = true;
    $('createSubmit').disabled = true;
    $('createError').hidden = true;
    try {
      await rpc('sun_village_create_cooperative_v2', {
        p_coop_name: name,
        p_address: String(values.address || '').trim(),
        p_biz_num: String(values.biz_num || '').trim() || null,
        p_plant_capacity_kw: String(values.plant_capacity_kw || '').trim() === '' ? null : Number(values.plant_capacity_kw),
        p_accounting_operation_mode: String(values.accounting_operation_mode || 'outsourced')
      });
      $('createDialog').close();
      await load();
      setMessage(`${name}의 기존 ERP 운영 공간을 만들었습니다. 웹 주소 연결이 완료되면 목록에서 바로 열 수 있습니다.`);
    } catch (error) {
      console.error(`[sun-village-hub ${VERSION}] create failed`, error);
      $('createError').textContent = friendly(error);
      $('createError').hidden = false;
    } finally {
      loading = false;
      $('createSubmit').disabled = false;
    }
  }

  async function boot() {
    initTheme();
    $('openCreate').addEventListener('click', openCreate);
    $('closeCreate').addEventListener('click', () => $('createDialog').close());
    $('reload').addEventListener('click', load);
    $('createForm').addEventListener('submit', createVillage);
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
