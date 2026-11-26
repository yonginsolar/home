/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Version: v1.3.12 | 2026-11-24 — Modern Navy contract document layout with full hash preservation. */
'use strict';

const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(window.location)
        || String(window.location.hostname || '').trim().toLowerCase()
    }
  }
});

const state = {
  user: null,
  permissions: new Set(),
  admin: false,
  forceSelf: new URLSearchParams(location.search).get('self') === '1',
  employees: [],
  employee: null,
  contracts: [],
  contractLoadRevision: 0,
  detailRevision: 0,
  attachmentRevision: 0,
  contractsLoading: false,
  contractsLoaded: false,
  contractLoadError: false,
  contractsScope: '',
  company: {},
  editing: null,
  uploadAttempt: null,
  amendmentBaseTerms: null,
  customTerms: [],
  editorBaseline: null,
  previewDirty: false,
  transitionPending: false,
  busy: false
};

let alertModal;
let uploadModal;
let discardModal;
let pendingContractTransition = null;
let contractDiscardConfirmed = false;

const selectContractColumns = [
  'id', 'coop_id', 'emp_id', 'document_kind', 'source_type', 'title', 'version_no',
  'parent_contract_id', 'status', 'effective_date', 'terms', 'file_path', 'original_file_name',
  'content_hash', 'employer_signed_at', 'employer_signer_name', 'employee_signed_at',
  'employee_signer_name', 'completed_at', 'created_at', 'updated_at'
].join(',');
const contractHistoryColumns = 'id,coop_id,emp_id,document_kind,source_type,title,version_no,parent_contract_id,status,effective_date,file_path,created_at,updated_at';
const employeeListColumns = 'emp_id,emp_name,display_emp_no,contract_url,coop_id,is_active,resign_date';
const contractCompanyKeys = ['company_name','orgName','chairman_name','ceoName','company_address','address','bizNum','business_number','company_contact_name','company_contact','company_contact_phone','company_contact_email','company_email','email'];
const contractDetailReads = new Map();
let contractHistoryRead = null;
let contractReadVisit = 0;
let contractPreviewRead = null;

function contractReadScope() {
  return JSON.stringify([state.user?.id, state.user?.coop_id, state.employee?.emp_id,
    state.admin, state.forceSelf, Array.from(state.permissions).sort()]);
}

function isContractHistoryReady(id) {
  return state.contractsLoaded && !state.contractsLoading && !state.contractLoadError
    && state.contractsScope === contractReadScope()
    && (!id || state.contracts.some(contract => contract.id === id));
}

function contractReadOwner() {
  const revision = ++state.detailRevision;
  const historyRevision = state.contractLoadRevision;
  const scope = contractReadScope();
  const readKey = `${scope}:${contractReadVisit}:${historyRevision}`;
  const employeeId = state.employee?.emp_id;
  const coopId = state.user?.coop_id;
  const draft = contractEditorSnapshot();
  const editing = state.editing;
  return { employeeId, coopId, scope, readKey, isCurrent: () => revision === state.detailRevision
    && historyRevision === state.contractLoadRevision && isContractHistoryReady()
    && scope === contractReadScope() && !window.frameElement?.hidden
    && employeeId === state.employee?.emp_id && coopId === state.user?.coop_id
    && editing === state.editing && draft === contractEditorSnapshot() };
}

function coalesceContractRead(key, read) {
  if (contractDetailReads.has(key)) return contractDetailReads.get(key);
  const promise = Promise.resolve().then(read).finally(() => contractDetailReads.delete(key));
  contractDetailReads.set(key, promise);
  return promise;
}

async function readContractDetail(id, owner) {
  if (!owner.isCurrent()) return null;
  return coalesceContractRead(`contract:${owner.readKey}:${id}`, async () => {
    if (state.admin && !state.forceSelf) {
      return readHrContract('detail', {p_emp_id:owner.employeeId,p_contract_id:id});
    }
    const { data, error } = await db.from('erp_employment_contracts').select(selectContractColumns)
      .eq('coop_id', owner.coopId).eq('emp_id', owner.employeeId).eq('id', id).single();
    if (error || !data) throw error || new Error('계약서를 찾을 수 없거나 조회 권한이 없습니다.');
    return data;
  });
}

async function loadContractDefaults(owner) {
  if (!owner.isCurrent()) return false;
  if (state.admin && !state.forceSelf) {
    const data = await coalesceContractRead(`defaults:${owner.readKey}`,
      () => readHrContract('defaults', {p_emp_id:owner.employeeId}));
    if (!owner.isCurrent()) return false;
    if (!data?.employee || data.employee.emp_id !== owner.employeeId || data.employee.coop_id !== owner.coopId) throw new Error('EMPLOYEE_NOT_FOUND');
    state.company = data.company || {};
    Object.assign(state.employee, data.employee);
    return true;
  }
  const [company, employee] = await Promise.all([
    coalesceContractRead(`company:${owner.readKey}`, async () => {
      const { data, error } = await db.from('ref_company_info').select('key,value').eq('coop_id', owner.coopId).in('key', contractCompanyKeys);
      if (error) throw error;
      return Object.fromEntries((data || []).map(row => [row.key, row.value]));
    }),
    coalesceContractRead(`employee:${owner.readKey}`, async () => {
      const { data, error } = await db.from('ref_employees')
        .select('emp_id,emp_name,position,department,address,email,hire_date,base_salary,coop_id')
        .eq('coop_id', owner.coopId).eq('emp_id', owner.employeeId).single();
      if (error || !data) throw error || new Error('직원 정보를 불러오지 못했습니다.');
      return data;
    })
  ]);
  if (!owner.isCurrent()) return false;
  state.company = company;
  Object.assign(state.employee, employee);
  return true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asText(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function formatDate(value, fallback = '-') {
  if (!value) return fallback;
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric'
  }).format(date);
}

function formatDateTime(value, fallback = '미확인') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString('ko-KR') : '0';
}

function showAlert(message) {
  document.getElementById('alertBody').textContent = String(message || '');
  alertModal.show();
}

function contractEditorSnapshot() {
  return JSON.stringify(Array.from(document.querySelectorAll('#workspace input, #workspace select, #workspace textarea'))
    .map((field) => [field.id || field.getAttribute('data-custom-title') || field.getAttribute('data-custom-content') || '',
      field.disabled ? null : field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.hasAttribute('data-number-group') ? ERPNumberInput.raw(field.value) : field.value]));
}

function hasUnsavedContractChanges() {
  if (!state.editing || state.editorBaseline === null) return false;
  if (document.getElementById('contractTitle')) return contractEditorSnapshot() !== state.editorBaseline;
  return state.previewDirty;
}

function resetContractEditTracking() {
  state.editorBaseline = null;
  state.previewDirty = false;
}

function requestContractTransition(action) {
  if (state.busy || state.transitionPending) return;
  if (!hasUnsavedContractChanges()) { action(); return; }
  state.transitionPending = true;
  contractDiscardConfirmed = false;
  pendingContractTransition = action;
  discardModal.show();
}

function returnToContractOwner() {
  if (state.busy || state.transitionPending) return;
  const target = new URL(state.admin && !state.forceSelf ? 'admin_employee.html' : 'mypage.html', location.href).href;
  try {
    // The workspace owns retained drafts and revalidates access before revealing them.
    if (window.parent !== window && window.parent.ErpWorkspaceShell?.navigate(target)) return;
  } catch (_) {
    showAlert('이전 화면으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  requestContractTransition(() => { resetContractEditTracking(); location.href = target; });
}

function finishContractTransition(discard) {
  const action = pendingContractTransition;
  pendingContractTransition = null;
  state.transitionPending = false;
  if (discard && action) action();
}

function switchContractEmployee(select) {
  if (state.busy || state.transitionPending) { select.value = state.employee?.emp_id || ''; return; }
  const target = state.employees.find((employee) => employee.emp_id === select.value);
  select.value = state.employee?.emp_id || '';
  if (!target || target.emp_id === state.employee?.emp_id) return;
  const targetUrl = new URL(location.href);
  targetUrl.searchParams.set('employee', target.emp_id);
  try {
    if (window.parent !== window && window.parent.ErpWorkspaceShell?.navigate(targetUrl.href)) return;
  } catch (_) {
    showAlert('직원 계약서 화면으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  requestContractTransition(() => {
    state.detailRevision++;
    state.employee = target;
    select.value = target.emp_id;
    state.editing = null;
    state.amendmentBaseTerms = null;
    state.customTerms = [];
    resetContractEditTracking();
    history.replaceState(history.state, '', targetUrl.href);
    emptyWorkspace();
    void loadContracts();
  });
}

function setBusy(next, button) {
  state.busy = next;
  document.querySelectorAll('button, input, select, textarea').forEach((element) => {
    if (element.closest('#alertModal')) return;
    if (next) {
      element.dataset.contractWasDisabled = element.disabled ? '1' : '0';
      element.disabled = true;
    } else if (element.dataset.contractWasDisabled === '0') {
      element.disabled = false;
    }
    if (!next) delete element.dataset.contractWasDisabled;
  });
  if (button) button.textContent = next ? '처리 중...' : (button.dataset.label || button.textContent);
  updateContractReadActions();
}

function updateContractReadActions() {
  document.querySelectorAll('[data-new-kind], #openUploadButton').forEach((button) => {
    button.disabled = state.busy || !state.employee || !state.contractsLoaded;
  });
  updateContractPreviewReadActions();
}

function contractHistoryStamp(contract) {
  const updated = contract?.updated_at;
  const timestamp = Date.parse(updated);
  return JSON.stringify([contract?.id, contract?.status, contract?.version_no,
    contract?.source_type, updated ? Number.isFinite(timestamp) ? timestamp : updated : null]);
}

function isContractPreviewReady() {
  return Boolean(contractPreviewRead && contractPreviewRead.scope === contractReadScope()
    && isContractHistoryReady(contractPreviewRead.id)
    && contractHistoryStamp(state.contracts.find(contract => contract.id === contractPreviewRead.id)) === contractPreviewRead.stamp);
}

function updateContractPreviewReadActions() {
  const notice = document.getElementById('contractPreviewReadStatus');
  if (!notice || !contractPreviewRead) return;
  const ready = isContractPreviewReady();
  notice.hidden = ready;
  notice.textContent = state.contractsLoading ? '계약 이력을 다시 확인하고 있습니다.'
    : '계약 이력을 다시 확인한 뒤 문서를 선택해 주세요.';
  document.querySelectorAll('[data-verified-contract-action]').forEach(button => {
    if (!ready) {
      if (button.dataset.contractReadDisabled === undefined) button.dataset.contractReadDisabled = button.disabled && !state.busy ? '1' : '0';
      button.disabled = true;
    } else if (!state.busy && button.dataset.contractReadDisabled !== undefined) {
      button.disabled = button.dataset.contractReadDisabled === '1';
      delete button.dataset.contractReadDisabled;
    }
  });
}

function normalizeError(error) {
  const raw = String(error?.message || error || '처리하지 못했습니다.');
  const map = {
    SETTINGS_ACCESS_DENIED: '근로계약서를 조회할 권한을 확인하지 못했습니다. 다시 로그인하거나 담당자에게 문의해 주세요.',
    CONTRACT_NOT_FOUND: '계약서를 찾을 수 없거나 조회 권한이 없습니다.',
    HR_ADMIN_REQUIRED: '근로계약서를 관리할 권한이 없습니다.',
    EMPLOYEE_NOT_FOUND: '직원 정보를 찾을 수 없습니다.',
    PARENT_CONTRACT_REQUIRED: '변경합의서의 기준이 되는 완료 계약서를 선택해 주세요.',
    VALID_PARENT_CONTRACT_REQUIRED: '선택한 기준 계약서를 사용할 수 없습니다.',
    ONLY_EDITOR_DRAFT_CAN_BE_UPDATED: '전자 확인을 요청한 문서는 수정할 수 없습니다.',
    CONTRACT_NOT_AWAITING_SIGNATURES: '전자 확인을 기다리는 문서가 아닙니다.',
    CONTRACT_CONTENT_CHANGED: '전자 확인 요청 뒤 문서 내용이 달라졌습니다. 새 초안으로 다시 작성해 주세요.',
    EMPLOYEE_SIGNATURE_REQUIRED: '이 계약의 직원 본인만 확인할 수 있습니다.',
    CONTRACT_SCHEDULE_HOURS_MISMATCH: '시작·종료 시각에서 휴게시간을 뺀 시간이 1일 소정근로시간과 같아야 합니다.',
    CONTRACT_MONTHLY_ALLOWANCE_INVALID: '수당·상여금은 0 이상의 원 단위로 입력해 주세요.',
    CONTRACT_BONUS_COMPONENTS_INVALID: '상여금의 금액과 지급 조건을 확인해 주세요.',
    CONTRACT_MINIMUM_WAGE_BELOW: '최저임금보다 낮아 처리할 수 없습니다. 초안을 열어 임금을 확인해 주세요.',
    CONTRACT_MINIMUM_PAID_REST_REQUIRED: '초안을 열어 1주 유급 주휴시간을 확인해 주세요.',
    CONTRACT_MINIMUM_RATE_UNAVAILABLE: '이 적용연도의 최저임금이 아직 ERP에 반영되지 않았습니다.',
    CONTRACT_WAGE_BREAKDOWN_MISMATCH: '기본급과 수당의 합계가 저장할 임금액과 맞지 않습니다.'
  };
  const key = Object.keys(map).find((item) => raw.includes(item));
  return key ? map[key] : raw;
}

function getRoleFallback(user) {
  return ['admin', 'admin_all'].includes(String(user?.role || ''));
}

async function readHrContract(action, values = {}) {
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      reject(new Error('계약서 조회가 지연되고 있습니다. 다시 시도해 주세요.'));
      controller.abort();
    }, 15000); });
    const {data,error} = await Promise.race([
      db.rpc('erp_hr_contract_read', {p_action:action,...values}).abortSignal(controller.signal), deadline
    ]);
    if (error) throw error;
    return data;
  } finally { clearTimeout(timer); }
}

async function loadPermissions(user) {
  try {
    const runtime = await window.ErpRuntimeGuard.getEffectivePermissions(db);
    const values = Array.isArray(runtime) ? runtime : [];
    return new Set(values.map(String));
  } catch (error) {
    console.warn('[employment_contracts] permission fallback', error);
    return new Set(Array.isArray(user?.permissions) ? user.permissions.map(String) : []);
  }
}

function companyValue(...keys) {
  for (const key of keys) {
    if (Object.hasOwn(state.company,key) && state.company[key] != null) return asText(state.company[key]);
  }
  return '';
}

async function loadEmployees() {
  if (!state.admin || state.forceSelf) {
    const { data, error } = await db.from('ref_employees')
      .select(employeeListColumns)
      .eq('emp_id', state.user.emp_id)
      .eq('coop_id', state.user.coop_id)
      .maybeSingle();
    if (error) throw error;
    state.employees = data ? [data] : [];
    state.employee = state.employees[0];
    return;
  }

  const data = await readHrContract('employees');
  if (!Array.isArray(data) || data.some(row => row.coop_id !== state.user.coop_id)) throw new Error('EMPLOYEE_NOT_FOUND');
  state.employees = data;
  const routeEmployee = new URLSearchParams(location.search).get('employee');
  const requested = routeEmployee || sessionStorage.getItem('erp_contract_employee_id');
  sessionStorage.removeItem('erp_contract_employee_id');
  const selected = state.employees.find((employee) => employee.emp_id === requested);
  if (routeEmployee && !selected) throw new Error('선택한 직원을 찾을 수 없거나 조회 권한이 없습니다.');
  state.employee = selected || state.employees[0] || null;
}

function renderEmployeeSelect() {
  const toolbar = document.getElementById('adminToolbar');
  const select = document.getElementById('employeeSelect');
  const isAdminView = state.admin && !state.forceSelf;
  toolbar.classList.toggle('hidden', !isAdminView);
  if (!isAdminView) return;
  select.innerHTML = state.employees.map((employee) => {
    const number = employee.display_emp_no ? `사번 ${employee.display_emp_no} · ` : '';
    const inactive = employee.is_active === false || employee.resign_date ? ' · 퇴사' : '';
    return `<option value="${escapeHtml(employee.emp_id)}">${escapeHtml(number + (employee.emp_name || '이름 없음') + inactive)}</option>`;
  }).join('');
  if (state.employee) select.value = state.employee.emp_id;
}

function bindInitialContractEmployee() {
  if (!state.admin || state.forceSelf || !state.employee || new URLSearchParams(location.search).has('employee')) return false;
  try {
    if (window.parent !== window && window.parent.ErpWorkspaceShell?.bindContractEmployee) {
      return window.parent.ErpWorkspaceShell.bindContractEmployee(window, state.employee.emp_id) === 'reuse';
    }
    // Standalone documents keep the same DOM; no reload or business write is needed.
    if (window.parent === window) {
      const target = new URL(location.href); target.searchParams.set('employee', state.employee.emp_id);
      history.replaceState(history.state, '', target.href);
    }
  } catch (_) {}
  return false;
}

function loadContracts() {
  const scope = contractReadScope();
  // A post-save read must not reuse a history request started before the save.
  const key = `${scope}:${state.busy ? 'saving' : 'reading'}`;
  if (contractHistoryRead?.key === key && contractHistoryRead.isCurrent()) return contractHistoryRead.promise;
  const revision = ++state.contractLoadRevision;
  const employeeId = state.employee?.emp_id;
  const coopId = state.user?.coop_id;
  const isCurrent = () => revision === state.contractLoadRevision
    && scope === contractReadScope();
  if (state.contractsScope !== scope) state.contracts = [];
  state.contractsScope = scope;
  state.contractsLoaded = false;
  state.contractLoadError = false;
  state.contractsLoading = Boolean(employeeId && coopId);
  renderHistory();
  if (!state.contractsLoading) return Promise.resolve(false);
  const flight = {key, isCurrent, promise:null};
  contractHistoryRead = flight;
  flight.promise = (async () => {
  try {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
    const { data, error } = state.admin && !state.forceSelf
      ? {data:await readHrContract('history', {p_emp_id:employeeId,p_offset:offset}),error:null}
      : await readSelfContractHistoryPage(coopId, employeeId, offset);
    if (!isCurrent()) return false;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
    }
    state.contracts = rows;
    state.contractsLoaded = true;
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    if (contractReadDenied(error)) state.contracts = [];
    state.contractLoadError = true;
    return false;
  } finally {
    if (isCurrent()) {
      state.contractsLoading = false;
      renderHistory();
    }
    if (contractHistoryRead === flight) contractHistoryRead = null;
  }
  })();
  return flight.promise;
}

async function readSelfContractHistoryPage(coopId, employeeId, offset) {
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      reject(new Error('계약 이력 조회가 지연되고 있습니다. 다시 확인해 주세요.'));
      controller.abort();
    }, 15000); });
    return await Promise.race([
      db.from('erp_employment_contracts').select(contractHistoryColumns)
        .eq('coop_id', coopId).eq('emp_id', employeeId)
        .order('version_no', {ascending:false}).order('id', {ascending:false})
        .range(offset, offset + 499).abortSignal(controller.signal), deadline
    ]);
  } finally { clearTimeout(timer); }
}

function contractReadDenied(error) {
  return [401, 403].includes(Number(error?.status || error?.statusCode))
    || /42501|PGRST30[123]|FORBIDDEN|ACCESS_DENIED|PERMISSION|HR_ADMIN_REQUIRED|UNAUTHORIZED|AUTH_REQUIRED/i
      .test(`${error?.code || ''} ${error?.message || ''}`);
}

function kindLabel(kind) {
  return ({ initial: '근로계약서', amendment: '근로조건 변경합의서', consolidated: '통합 근로계약서', uploaded: '외부 작성 계약서' })[kind] || '근로계약 문서';
}

function statusLabel(status) {
  return ({ draft: '초안', awaiting_signatures: '전자 확인 대기', completed: '완료', void: '무효' })[status] || status;
}

function renderHistory() {
  const heading = document.getElementById('historyHeading');
  const list = document.getElementById('historyList');
  const legacyWrap = document.getElementById('legacyContractWrap');
  updateContractReadActions();
  heading.textContent = `${state.employee?.emp_name || '직원'} 계약 이력`;
  const unverified = !state.contractsLoaded;
  const notice = state.contractsLoading
    ? '<div class="small text-muted py-3" role="status">계약 이력을 불러오고 있습니다.</div>'
    : state.contractLoadError
      ? `<div class="small text-danger py-3" role="alert">계약 이력을 불러오지 못했습니다.${state.contracts.length ? ' 이전 목록을 표시합니다.' : ''} 새로고침 버튼으로 다시 확인해 주세요.</div>` : '';
  list.innerHTML = notice + (state.contracts.length ? state.contracts.map((contract) => `
      <button type="button" class="history-item w-100 text-start" data-contract-id="${escapeHtml(contract.id)}" ${unverified ? 'disabled' : ''}>
        <div class="d-flex justify-content-between gap-2 align-items-start">
          <span class="history-title">${escapeHtml(contract.title)}</span>
          <span class="status-pill status-${escapeHtml(contract.status)}">${escapeHtml(statusLabel(contract.status))}</span>
        </div>
        <div class="history-meta">v${contract.version_no} · ${escapeHtml(kindLabel(contract.document_kind))}<br>적용일 ${escapeHtml(formatDate(contract.effective_date))}</div>
      </button>`).join('') : notice ? '' : '<div class="small text-muted py-3">등록된 계약 이력이 없습니다.</div>');
    list.querySelectorAll('[data-contract-id]').forEach((button) => {
      button.addEventListener('click', () => openContract(button.dataset.contractId));
    });

  const legacyPath = unverified ? '' : asText(state.employee?.contract_url);
  const registeredPath = state.contracts.some((contract) => contract.file_path === legacyPath);
  legacyWrap.classList.toggle('hidden', !legacyPath || registeredPath);
  legacyWrap.innerHTML = legacyPath && !registeredPath
    ? '<button type="button" class="btn btn-outline-secondary btn-sm w-100" id="legacyContractButton">이전 방식 계약서 보기</button><div class="form-text">기존 파일은 그대로 유지되며 새 이력과 함께 열람할 수 있습니다.</div>'
    : '';
  document.getElementById('legacyContractButton')?.addEventListener('click', () => openStoredFile(legacyPath));
}

function emptyWorkspace(message = '계약 이력을 선택해 주세요') {
  document.getElementById('workspace').innerHTML = `<div class="empty-state"><div class="fs-1 mb-3">🗂️</div><h2 class="h5 fw-bold">${escapeHtml(message)}</h2></div>`;
}

function showContractTask(){
  const params=new URLSearchParams(location.search),task=params.get('work');
  const titles={contract_missing:'근로계약서 등록',contract_terms:'근로조건 입력',contract_signatures:'계약 서명 확인'};
  if(!titles[task]||!state.admin||state.forceSelf||!state.contractsLoaded||!state.employee
    ||params.get('employee')!==state.employee.emp_id||state.editing||state.busy)return false;
  const employee=state.employee,coop=state.user.coop_id;
  const current=()=>state.admin&&!state.forceSelf&&state.contractsLoaded&&state.employee===employee
    &&state.user.coop_id===coop&&!state.editing&&!state.busy&&!window.frameElement?.hidden;
  const panel=document.createElement('section');panel.className='section-card';
  const heading=document.createElement('h2');heading.className='h5 fw-bold';heading.textContent=`${employee.emp_name||'직원'} · ${titles[task]}`;panel.append(heading);
  const actions=document.createElement('div');actions.className='d-flex flex-wrap gap-2';panel.append(actions);
  const action=(label,run)=>{const b=document.createElement('button');b.type='button';b.className='btn btn-outline-primary';b.textContent=label;b.onclick=()=>{if(current())run();};actions.append(b);};
  if(task==='contract_signatures'){
    const waiting=state.contracts.filter(row=>row.status==='awaiting_signatures');
    for(const row of waiting)action(row.title||'서명 대기 계약서 열기',()=>openContract(row.id));
    if(!waiting.length){const p=document.createElement('p');p.textContent='현재 서명 대기 계약서가 없습니다.';panel.append(p);}
  }else{
    if(task==='contract_terms'){
      const path=state.contracts.find(row=>row.status==='completed'&&row.file_path)?.file_path||employee.contract_url;
      if(path)action('기존 계약서 보기',()=>void openStoredFile(path));
      const note=document.createElement('p');note.textContent='계약서의 근무·휴게시간을 확인한 뒤 근로조건을 입력해 주세요.';panel.insertBefore(note,actions);
    }
    action(task==='contract_terms'?'서명한 계약서·근로조건 입력':'서명한 계약서 등록',()=>openUpload());
    action('근로계약서 작성',()=>openNew('initial'));
  }
  document.getElementById('workspace').replaceChildren(panel);
  return true;
}

function defaultTerms() {
  const employee = state.employee || {};
  return {
    contract_format_version: 3,
    company_name: companyValue('company_name', 'orgName') || '조합명 미설정',
    employer_name: companyValue('chairman_name', 'ceoName'),
    employer_role: '이사장',
    company_address: companyValue('company_address', 'address'),
    company_business_number: companyValue('bizNum', 'business_number'),
    company_contact: Object.hasOwn(state.company || {}, 'company_contact_name') || Object.hasOwn(state.company || {}, 'company_contact_phone')
      ? [companyValue('company_contact_name'),companyValue('company_contact_phone')].filter(Boolean).join(' · ')
      : companyValue('company_contact'),
    company_email: companyValue('company_contact_email', 'company_email', 'email'),
    employee_name: asText(employee.emp_name),
    employee_position: asText(employee.position),
    employee_address: asText(employee.address),
    employee_email: asText(employee.email),
    employment_type: 'regular',
    work_time_basis: 'full_time',
    work_schedule_type: 'fixed',
    work_schedule_terms: '',
    contract_start_date: todayKst(),
    contract_end_date: '',
    indefinite_term: true,
    probation_enabled: false,
    probation_start_date: todayKst(),
    probation_end_date: '',
    probation_wage_terms: '',
    workplace: companyValue('company_address', 'address'),
    duties: '',
    work_days: '월요일부터 금요일까지',
    work_days_per_week: 5,
    work_start_time: '09:00',
    work_end_time: '18:00',
    break_start_time: '12:00',
    break_end_time: '13:00',
    daily_work_hours: 8,
    weekly_work_hours: 40,
    part_time_schedule: '',
    weekly_holiday: '일요일',
    holiday_terms: '주휴일과 관계 법령상 유급휴일을 적용합니다.',
    wage_basis: 'annual',
    wage_amount: Number(employee.base_salary || 0),
    annual_salary: Number(employee.base_salary || 0),
    monthly_basic_pay: 0,
    monthly_meal_allowance: 0,
    monthly_position_allowance: 0,
    monthly_other_fixed_allowance: 0,
    wage_components: '임금의 구성과 계산 기준은 위 금액 및 이 계약서에 적힌 조건에 따릅니다.',
    wage_calculation_terms: '표시한 임금은 세전 금액이며 실제 지급액은 법정 공제액을 제외하여 계산합니다.',
    pay_day: '매월 10일',
    payment_method: '직원 본인 명의 계좌로 지급',
    bonus_enabled: false,
    bonus_terms: '',
    overtime_enabled: true,
    overtime_terms: '연장·야간·휴일근로는 사전 승인을 원칙으로 하며, 관계 법령에 따라 수당 또는 보상휴가를 적용합니다.',
    retirement_benefit_enabled: true,
    retirement_benefit_terms: '퇴직급여는 임금에 포함하지 않고 관계 법령에 따라 별도로 지급합니다.',
    annual_leave: '연차유급휴가는 관계 법령과 조합 규정에 따라 부여합니다.',
    social_pension: true,
    social_health: true,
    social_employment: true,
    social_industrial: true,
    social_insurance: '관계 법령에 따라 해당 사회보험을 적용합니다.',
    social_insurance_note: '',
    remote_work_enabled: false,
    remote_work_terms: '재택근무는 근무일과 연락 가능 시간을 사전에 협의한다. 출장·현장근무는 업무 일정에 따라 장소와 시간을 정한다.',
    expense_enabled: false,
    expense_terms: '업무상 사용한 교통비·숙박비 등은 영수증과 사용 내역을 제출해 조합의 비용 정산 기준에 따라 지급한다.',
    confidentiality_enabled: true,
    confidentiality_terms: '업무 중 알게 된 개인정보와 조합의 비공개 업무정보를 관계 법령과 내부 규정에 따라 보호합니다.',
    handover_enabled: true,
    handover_terms: '담당 업무가 바뀌거나 근로관계가 종료될 때에는 업무자료와 조합 자산을 정리하여 인계합니다.',
    work_rules_enabled: true,
    work_rules_terms: '이 계약서에서 정하지 않은 사항은 관계 법령과 적용되는 조합 규정에 따릅니다.',
    other_terms_enabled: false,
    other_terms: '이 계약서에서 정하지 않은 사항은 관계 법령, 정관 및 조합 규정에 따릅니다.',
    custom_terms: [],
    change_reason: '',
    changes: []
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function prepareTermsForEditor(source, options = {}) {
  const raw = source && typeof source === 'object' ? cloneJson(source) : {};
  const terms = { ...defaultTerms(), ...raw, contract_format_version: 3 };
  if (!raw.work_time_basis) terms.work_time_basis = raw.employment_type === 'part_time' ? 'part_time' : 'full_time';
  if (!raw.employment_type) terms.employment_type = raw.indefinite_term === false ? 'fixed' : 'regular';
  if (raw.employment_type === 'part_time') terms.employment_type = raw.indefinite_term === false ? 'fixed' : 'regular';
  if (!raw.wage_basis) terms.wage_basis = 'annual';
  if (raw.wage_amount == null) terms.wage_amount = Number(raw.annual_salary || 0);
  if (!raw.wage_calculation_terms) terms.wage_calculation_terms = asText(raw.wage_components, defaultTerms().wage_calculation_terms);
  terms.wage_calculation_terms = wageCalculationWithoutNonTax(terms);
  const legacyInsurance = asText(raw.social_insurance);
  if (raw.social_pension == null) terms.social_pension = !legacyInsurance || legacyInsurance.includes('국민연금');
  if (raw.social_health == null) terms.social_health = !legacyInsurance || legacyInsurance.includes('건강보험');
  if (raw.social_employment == null) terms.social_employment = !legacyInsurance || legacyInsurance.includes('고용보험');
  if (raw.social_industrial == null) terms.social_industrial = !legacyInsurance || legacyInsurance.includes('산재보험');
  if (options.fromExisting && Number(raw.contract_format_version || 0) < 2) {
    terms.probation_enabled = false;
    terms.bonus_enabled = false;
    terms.overtime_enabled = false;
    terms.retirement_benefit_enabled = false;
    terms.remote_work_enabled = false;
    terms.expense_enabled = false;
    terms.confidentiality_enabled = false;
    terms.handover_enabled = false;
    terms.work_rules_enabled = false;
    terms.other_terms_enabled = Boolean(asText(raw.other_terms));
  }
  terms.custom_terms = Array.isArray(raw.custom_terms) ? raw.custom_terms.map((item) => ({
    title: asText(item?.title),
    content: asText(item?.content)
  })) : [];
  return terms;
}

function openNew(kind) {
  if (state.busy || !state.contractsLoaded || !state.admin || state.forceSelf || !state.employee) return;
  requestContractTransition(() => createNewContract(kind));
}

async function createNewContract(kind) {
  const owner = contractReadOwner();
  let parent = kind === 'amendment'
    ? state.contracts.find((contract) => contract.status === 'completed' && contract.source_type === 'editor')
    : null;
  if (kind === 'amendment' && !parent) {
    showAlert('변경합의서를 작성하려면 먼저 완료된 직접 작성 계약서가 필요합니다. 외부 계약서만 있다면 통합 계약서 재작성으로 근로조건을 먼저 등록해 주세요.');
    return;
  }
  try {
    if (!await loadContractDefaults(owner)) return;
    if (parent) parent = await readContractDetail(parent.id, owner);
    if (!owner.isCurrent()) return;
    if (parent && (parent.status !== 'completed' || parent.source_type !== 'editor')) throw new Error('기준 계약서 상태가 변경되었습니다. 이력을 다시 확인해 주세요.');
  const terms = parent ? prepareTermsForEditor(parent.terms, { fromExisting: true }) : defaultTerms();
  state.editing = {
    id: null,
    emp_id: state.employee.emp_id,
    document_kind: kind,
    title: kind === 'amendment' ? `${state.employee.emp_name} 근로조건 변경합의서` : `${state.employee.emp_name} ${kindLabel(kind)}`,
    effective_date: todayKst(),
    parent_contract_id: parent?.id || null,
    terms
  };
  state.amendmentBaseTerms = parent ? cloneJson(terms) : null;
  state.customTerms = cloneJson(terms.custom_terms || []);
  renderEditor();
  } catch (error) { if (owner.isCurrent()) showAlert(normalizeError(error)); }
}

function inputValue(id) {
  return asText(document.getElementById(id)?.value);
}

function renderParentOptions(selected) {
  const options = state.contracts.filter((contract) => contract.status === 'completed' && contract.source_type === 'editor');
  return '<option value="">기준 계약서를 선택해 주세요</option>' + options.map((contract) =>
    `<option value="${escapeHtml(contract.id)}" ${contract.id === selected ? 'selected' : ''}>v${contract.version_no} · ${escapeHtml(contract.title)} · ${escapeHtml(formatDate(contract.effective_date))}</option>`
  ).join('');
}

function renderEditor(preserveBaseline = false) {
  const contract = state.editing;
  const terms = prepareTermsForEditor(contract.terms, { fromExisting: Boolean(contract.id) });
  contract.terms = terms;
  state.customTerms = cloneJson(terms.custom_terms || []);
  const amendment = contract.document_kind === 'amendment';
  const workspace = document.getElementById('workspace');
  workspace.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-4">
      <div><div class="text-primary small fw-bold mb-1">직접 작성</div><h2 class="h4 fw-bold mb-1">${escapeHtml(kindLabel(contract.document_kind))}</h2><div class="small text-muted">전자 확인을 요청하기 전까지 자유롭게 수정할 수 있습니다.</div></div>
      <div class="contract-actions"><button type="button" class="btn btn-outline-secondary" id="previewDraftButton">미리보기</button><button type="button" class="btn btn-primary" id="saveDraftButton">초안 저장</button><button type="button" class="btn btn-dark" id="submitDraftButton">저장 후 전자 확인 요청</button></div>
    </div>
    <div class="section-card">
      <h3 class="section-title">기본 정보</h3>
      <div class="row g-3">
        <div class="col-md-8"><label class="form-label required" for="contractTitle">문서 제목</label><input class="form-control" id="contractTitle" maxlength="200" value="${escapeHtml(contract.title)}"></div>
        <div class="col-md-4"><label class="form-label required" for="effectiveDate">적용일</label><input type="date" class="form-control" id="effectiveDate" value="${escapeHtml(contract.effective_date)}"></div>
        ${amendment ? `<div class="col-12"><label class="form-label required" for="parentContract">기준 계약서</label><select class="form-select" id="parentContract">${renderParentOptions(contract.parent_contract_id)}</select><div class="form-text">기준 계약서의 모든 근로조건을 불러왔습니다. 바꿀 항목만 수정하면 변경 전·후 내용이 자동으로 정리됩니다.</div></div>` : ''}
        <div class="col-md-6"><label class="form-label">사용자</label><div class="readonly-box" id="contractCompanyInfo" tabindex="-1">${escapeHtml(terms.company_name)} · ${escapeHtml(terms.employer_name || '대표자 미설정')}</div></div>
        <div class="col-md-6"><label class="form-label">직원</label><div class="readonly-box" id="contractEmployeeInfo" tabindex="-1">${escapeHtml(terms.employee_name)} · ${escapeHtml(terms.employee_position || '직위 미설정')}</div></div>
      </div>
    </div>
    ${amendment ? '<div class="alert alert-primary border-0">기존 계약 전체를 다시 입력할 필요가 없습니다. 아래에서 달라지는 값만 수정하면 변경합의서에는 실제 변경된 항목만 표시됩니다.</div>' : ''}
    ${renderFullContractEditor(terms)}
    ${amendment ? `<div class="section-card"><h3 class="section-title">변경 사유 및 참고</h3><textarea class="form-control" id="changeReason" rows="3" maxlength="1500" placeholder="예: 임금 인상에 따라 2026년 10월 1일부터 급여 조건을 변경함">${escapeHtml(terms.change_reason)}</textarea></div>` : ''}
    <div class="section-card">
      <h3 class="section-title">확인</h3>
      <div class="alert alert-light border mb-0 small">전자 확인을 요청하면 문서 내용이 고정됩니다. 직원과 사용자 측 관리자가 모두 확인한 뒤 완료 문서가 됩니다. 완료된 계약의 적용일부터 새 급여 계산에 계약 조건을 불러옵니다. 월 중간에 조건이 바뀌면 기간별 조건을 확인하고 지급액과 근로시간을 입력해 주세요.</div>
    </div>`;
  bindEditorEvents();
  if (!preserveBaseline) {
    state.editorBaseline = contractEditorSnapshot();
    state.previewDirty = false;
  }
}

const contractWeekdays = ['월', '화', '수', '목', '금', '토', '일'];
const contractWeekdayPreset = [0, 1, 2, 3, 4];

function contractWeekdaySelection(value, multiple) {
  const text = asText(value);
  const dayIndex = name => contractWeekdays.findIndex(day => name === day || name === day + '요일');
  if (!multiple) {
    const index = dayIndex(text);
    return index < 0 ? [] : [index];
  }
  const span = text.match(/^([월화수목금토일])(?:요일)?\s*(?:부터|[~～–-])\s*([월화수목금토일])(?:요일)?(?:까지)?$/);
  if (span) {
    const [start, end] = span.slice(1).map(dayIndex);
    if (start <= end) return contractWeekdays.map((_, index) => index).slice(start, end + 1);
  }
  const list = text.split(/\s*[,·]\s*/).map(dayIndex);
  return list.includes(-1) ? [] : [...new Set(list)].sort((a, b) => a - b);
}

function renderContractWeekdayPicker(id, label, value, multiple) {
  const selected = contractWeekdaySelection(value, multiple);
  return `<div class="col-12" data-contract-week-picker>
    <div class="d-flex align-items-center gap-2 mb-2">
      <label class="form-label required mb-0" id="${id}Label" for="${id}">${label}</label>
      ${multiple ? '<button type="button" class="btn btn-sm btn-outline-primary py-0" data-weekday-preset>월~금</button>' : ''}
    </div>
    <div class="contract-week-grid mb-2" role="${multiple ? 'group' : 'radiogroup'}" aria-labelledby="${id}Label">
      ${contractWeekdays.map((day,index) => `<input class="btn-check" type="${multiple ? 'checkbox' : 'radio'}" name="${id}Choice" id="${id}Choice${index}" value="${index}" data-weekday-option aria-label="${day}요일"${selected.includes(index) ? ' checked' : ''}><label class="btn btn-outline-primary" for="${id}Choice${index}">${day}</label>`).join('')}
    </div>
    <input class="form-control" id="${id}" data-weekday-text value="${escapeHtml(value)}" readonly>
  </div>`;
}

function contractWageCheckError(error){
  if(error?.message==='CONTRACT_MINIMUM_PAID_REST_REQUIRED'){
    const wrap=document.getElementById('minimumWageWeeklyPaidRestWrap');
    wrap?.classList.remove('hidden');
    return contractInputError('minimumWageWeeklyPaidRest','확인한 1주 유급 주휴시간을 입력해 주세요.');
  }
  if(error?.message==='CONTRACT_MINIMUM_RATE_UNAVAILABLE')return contractInputError('effectiveDate','이 적용연도의 최저임금이 아직 ERP에 반영되지 않았습니다.');
  if(error?.message!=='CONTRACT_MINIMUM_WAGE_BELOW')return error;
  let info={};
  try{info=typeof error.details==='string'?JSON.parse(error.details):error.details||{};}catch(_){}
  const gap=Number(info.shortfall)>0?` ${info.excludes_unverified_paid_rest?'확인된 부족액은 적어도':'부족액:'} ${formatMoney(info.shortfall)}원입니다.`:'';
  const min=Number(info.hourly_minimum)>0?` ${info.year}년 기준 시급 ${formatMoney(info.hourly_minimum)}원.`:'';
  return contractInputError(usesWageSum(info.basis||inputValue('wageBasis'))?'monthlyBasicPay':'wageAmount',
    '최저임금보다 낮아 저장할 수 없습니다.'+min+gap);
}

function bindContractWeekdayPickers(workspace) {
  for (const picker of workspace.querySelectorAll('[data-contract-week-picker]')) {
    const text = picker.querySelector('[data-weekday-text]');
    const options = [...picker.querySelectorAll('[data-weekday-option]')];
    const count = text.id === 'workDays' ? workspace.querySelector('#workDaysPerWeek') : null;
    const selected = () => options.filter(option => option.checked).map(option => Number(option.value));
    const originalDays = selected().join(',');
    const originalText = text.value, originalCount = count?.value;
    const preset = contractWeekdayPreset.join(',');
    const apply = () => {
      const days = selected(), signature = days.join(',');
      text.value = signature === originalDays ? originalText
        : count && signature === preset ? '월요일부터 금요일까지'
        : days.map(index => contractWeekdays[index] + '요일').join('·');
      text.dispatchEvent(new Event('input', { bubbles: true }));
      if (count) {
        count.value = signature === originalDays ? originalCount : days.length || '';
        count.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    options.forEach(option => option.addEventListener('change', apply));
    picker.querySelector('[data-weekday-preset]')?.addEventListener('click', () => {
      if (selected().join(',') === preset) return;
      options.forEach((option, index) => { option.checked = contractWeekdayPreset.includes(index); });
      apply();
    });
  }
}

function renderFullContractEditor(terms) {
  const employmentTypeOptions = [
    ['regular', '기간을 정하지 않음'],
    ['fixed', '기간제 근로']
  ].map(([value, label]) => `<option value="${value}" ${terms.employment_type === value ? 'selected' : ''}>${label}</option>`).join('');
  const wageBasisOptions = [
    ['annual', '연봉'], ['monthly', '월급'], ['daily', '일급'], ['hourly', '시급']
  ].map(([value, label]) => `<option value="${value}" ${terms.wage_basis === value ? 'selected' : ''}>${label}</option>`).join('');
  return `
    <div class="section-card">
      <h3 class="section-title">계약 기간과 업무</h3>
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label required" for="employmentType">계약 형태</label><select class="form-select" id="employmentType">${employmentTypeOptions}</select></div>
        <div class="col-md-4"><label class="form-label required" for="contractStart">근로 시작일</label><input type="date" class="form-control" id="contractStart" value="${escapeHtml(terms.contract_start_date)}"></div>
        <div class="col-md-4 ${terms.employment_type === 'fixed' ? '' : 'hidden'}" id="contractEndWrap"><label class="form-label required" for="contractEnd">근로 종료일</label><input type="date" class="form-control" id="contractEnd" ${terms.employment_type === 'fixed' ? '' : 'disabled'} value="${escapeHtml(terms.contract_end_date)}"></div>
        <div class="col-md-6"><label class="form-label required" for="workplace">근무 장소</label><input class="form-control" id="workplace" maxlength="300" value="${escapeHtml(terms.workplace)}"></div>
        <div class="col-md-6"><label class="form-label required" for="duties">담당 업무</label><input class="form-control" id="duties" maxlength="300" value="${escapeHtml(terms.duties)}" placeholder="예: 조합 사무국 운영 및 행정 업무"></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">근로시간과 휴일</h3>
      <div class="row g-3">
        <div class="col-12"><label class="form-label required" for="workTimeBasis">근무 형태</label><select class="form-select" id="workTimeBasis"><option value="full_time" ${terms.work_time_basis === 'full_time' ? 'selected' : ''}>전일제</option><option value="part_time" ${terms.work_time_basis === 'part_time' ? 'selected' : ''}>시간제</option></select></div>
        <div class="col-md-4"><label class="form-label required" for="workScheduleType">근무 시각</label><select class="form-select" id="workScheduleType"><option value="fixed" ${terms.work_schedule_type !== 'flexible' ? 'selected' : ''}>정해진 시각</option><option value="flexible" ${terms.work_schedule_type === 'flexible' ? 'selected' : ''}>협의·유연근무</option></select></div>
        <div class="col-md-8"><label class="form-label" for="workScheduleTerms">근무·휴게시간 합의 내용</label><input class="form-control" id="workScheduleTerms" maxlength="1500" value="${escapeHtml(terms.work_schedule_terms)}" placeholder="유연근무일 때 시작·종료와 휴게시간을 정하는 방법"></div>
        <div class="col-md-3"><label class="form-label required" for="workStart">시작 시간</label><input type="time" class="form-control" id="workStart" value="${escapeHtml(terms.work_start_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="workEnd">종료 시간</label><input type="time" class="form-control" id="workEnd" value="${escapeHtml(terms.work_end_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="breakStart">휴게 시작</label><input type="time" class="form-control" id="breakStart" value="${escapeHtml(terms.break_start_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="breakEnd">휴게 종료</label><input type="time" class="form-control" id="breakEnd" value="${escapeHtml(terms.break_end_time)}"></div>
        ${renderContractWeekdayPicker('workDays', '근무일', terms.work_days, true)}
        <div class="col-12 col-lg-4"><div class="contract-hours-caption"><label class="form-label required" for="workDaysPerWeek">주 근무일</label></div><div class="input-group"><input type="number" min="1" max="7" step="0.5" class="form-control" id="workDaysPerWeek" value="${escapeHtml(terms.work_days_per_week)}"><span class="input-group-text">일</span></div></div>
        <div class="col-6 col-lg-4 contract-hours-field"><div class="contract-hours-caption"><label class="form-label required" for="dailyWorkHours">1일 소정근로시간</label></div><div class="input-group contract-hours-control"><input type="number" min="0.5" max="24" step="0.5" class="form-control" id="dailyWorkHours" value="${escapeHtml(terms.daily_work_hours)}"><span class="input-group-text">시간</span></div></div>
        <div class="col-6 col-lg-4 contract-hours-field"><div class="contract-hours-caption"><label class="form-label required" for="weeklyWorkHours">1주 소정근로시간</label></div><div class="input-group contract-hours-control"><input type="number" min="0.5" max="168" step="0.5" class="form-control" id="weeklyWorkHours" value="${escapeHtml(terms.weekly_work_hours)}"><span class="input-group-text">시간</span></div></div>
        <div class="col-12 conditional-field ${terms.work_time_basis === 'part_time' ? '' : 'hidden'}" data-condition="workTimeBasis:part_time"><label class="form-label required" for="partTimeSchedule">시간제 근로자의 근무일·시간</label><textarea class="form-control" id="partTimeSchedule" rows="2" maxlength="1200" placeholder="예: 월·수·금, 하루 4시간. 시작 시각은 협의">${escapeHtml(terms.part_time_schedule)}</textarea></div>
        ${renderContractWeekdayPicker('weeklyHoliday', '주휴일', terms.weekly_holiday, false)}
        <div class="col-12"><label class="form-label required" for="holidayTerms">그 밖의 휴일</label><input class="form-control" id="holidayTerms" maxlength="500" value="${escapeHtml(terms.holiday_terms)}"></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">임금</h3>
      <div class="row g-3">
        <div class="col-md-3"><label class="form-label required" for="wageBasis">임금 기준</label><select class="form-select" id="wageBasis">${wageBasisOptions}</select></div>
        <div class="col-md-3 ${usesWageSum(terms.wage_basis) ? 'hidden' : ''}" id="wageUnitAmountWrap"><label class="form-label required" for="wageAmount" id="wageUnitAmountLabel">단가</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control" id="wageAmount" value="${escapeHtml(!usesWageSum(terms.wage_basis) ? terms.wage_amount : '')}"><span class="input-group-text">원</span></div></div>
        <div class="col-md-6"><label class="form-label required" for="payDay">지급일</label><input class="form-control" id="payDay" maxlength="100" value="${escapeHtml(terms.pay_day)}"></div>
        <div class="col-12"><label class="form-label required" for="paymentMethod">지급 방법</label><textarea class="form-control" id="paymentMethod" rows="2" maxlength="500" placeholder="예: 매월 지급일에 근로자 본인 명의 계좌로 입금">${escapeHtml(terms.payment_method)}</textarea></div>
        <div class="col-md-3" id="monthlyBasicPayWrap"><label class="form-label" for="monthlyBasicPay">월 기본급</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control wage-part" id="monthlyBasicPay" value="${escapeHtml(terms.monthly_basic_pay)}"><span class="input-group-text">원</span></div></div>
        <div class="col-md-3"><label class="form-label" for="monthlyMealAllowance">월 식대</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control wage-part" id="monthlyMealAllowance" value="${escapeHtml(terms.monthly_meal_allowance)}"><span class="input-group-text">원</span></div></div>
        <div class="col-md-3"><label class="form-label" for="monthlyPositionAllowance">월 직책수당</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control wage-part" id="monthlyPositionAllowance" value="${escapeHtml(terms.monthly_position_allowance)}"><span class="input-group-text">원</span></div></div>
        <div class="col-md-3"><label class="form-label" for="monthlyOtherFixedAllowance">월 기타 고정수당</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control wage-part" id="monthlyOtherFixedAllowance" value="${escapeHtml(terms.monthly_other_fixed_allowance)}"><span class="input-group-text">원</span></div></div>
        ${contractMonthlyAllowances.map(({id, key, label}) => `<div class="col-md-3"><label class="form-label" for="${id}">월 ${label}</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control wage-part" id="${id}" value="${escapeHtml(terms[key] === '' ? 0 : terms[key] ?? 0)}"><span class="input-group-text">원</span></div></div>`).join('')}
        <div class="col-12">${renderOptionalClause('bonus', '상여금', terms.bonus_enabled, renderBonusEditor(terms))}</div>
        <div class="col-12"><div class="readonly-box">
          <span id="monthlyWageTotalLabel">월 고정 지급액 합계</span> <strong id="monthlyWageTotal"></strong>
          <div id="annualWageTotalRow" class="hidden">연 고정 지급액 합계 <strong id="annualWageTotal"></strong><small class="text-muted ms-2">월 합계 × 12</small></div>
          <div id="annualBonusIncluded" class="small hidden">연봉에 포함된 고정 상여금 <strong id="annualBonusTotal"></strong></div>
          <div id="priorWageNotice" class="small text-muted hidden" data-prev-basis="${escapeHtml(terms.wage_basis)}" data-prev-amount="${escapeHtml(!terms.wage_from_parts && (state.editing?.id || state.editing?.parent_contract_id) ? terms.wage_amount : '')}"></div>
        </div></div>
        <div class="col-12"><label class="form-label required" for="wageCalculationTerms">임금 구성·계산 기준</label><textarea class="form-control" id="wageCalculationTerms" rows="2" maxlength="1500">${escapeHtml(terms.wage_calculation_terms)}</textarea></div>
        <div class="col-md-5 hidden" id="minimumWageWeeklyPaidRestWrap"><label class="form-label" for="minimumWageWeeklyPaidRest">1주 유급 주휴시간</label><div class="input-group"><input id="minimumWageWeeklyPaidRest" type="number" inputmode="decimal" min="0.01" max="8" step="any" class="form-control" value="${escapeHtml(terms.minimum_wage_weekly_paid_rest_hours??'')}"><span class="input-group-text">시간</span></div></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">휴가와 사회보험</h3>
      <div class="row g-3">
        <div class="col-12"><label class="form-label required" for="annualLeave">연차유급휴가</label><textarea class="form-control" id="annualLeave" rows="2" maxlength="1500">${escapeHtml(terms.annual_leave)}</textarea></div>
        <div class="col-12"><label class="form-label d-block">적용 사회보험</label><div class="d-flex flex-wrap gap-3">
          ${renderCheckbox('socialPension', '국민연금', terms.social_pension)}
          ${renderCheckbox('socialHealth', '건강보험', terms.social_health)}
          ${renderCheckbox('socialEmployment', '고용보험', terms.social_employment)}
          ${renderCheckbox('socialIndustrial', '산재보험', terms.social_industrial)}
        </div></div>
        <div class="col-12"><label class="form-label" for="socialInsuranceNote">적용 제외 또는 참고</label><input class="form-control" id="socialInsuranceNote" maxlength="700" value="${escapeHtml(terms.social_insurance_note)}" placeholder="해당하는 경우에만 입력"></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">해당하는 조건만 포함</h3>
      <p class="small text-muted">체크한 항목만 계약서에 표시됩니다. 실제 근로조건에 맞는 항목만 선택해 주세요.</p>
      ${renderOptionalClause('probation', '수습기간', terms.probation_enabled, `
        <div class="row g-3"><div class="col-md-3"><label class="form-label" for="probationStart">수습 시작일</label><input type="date" class="form-control" id="probationStart" value="${escapeHtml(terms.probation_start_date)}"></div><div class="col-md-3"><label class="form-label" for="probationEnd">수습 종료일</label><input type="date" class="form-control" id="probationEnd" value="${escapeHtml(terms.probation_end_date)}"></div><div class="col-md-6"><label class="form-label" for="probationWageTerms">수습기간의 임금·평가 조건</label><input class="form-control" id="probationWageTerms" maxlength="700" value="${escapeHtml(terms.probation_wage_terms)}"></div></div>`)}
      ${renderOptionalClause('overtime', '연장·야간·휴일근로', terms.overtime_enabled, renderClauseTextarea('overtimeTerms', terms.overtime_terms))}
      ${renderOptionalClause('retirementBenefit', '퇴직급여', terms.retirement_benefit_enabled, renderClauseTextarea('retirementBenefitTerms', terms.retirement_benefit_terms))}
      ${renderOptionalClause('remoteWork', '재택·출장·현장근무', terms.remote_work_enabled, renderClauseTextarea('remoteWorkTerms', terms.remote_work_terms))}
      ${renderOptionalClause('expense', '업무비용 정산', terms.expense_enabled, renderClauseTextarea('expenseTerms', terms.expense_terms))}
      ${renderOptionalClause('confidentiality', '비밀유지·개인정보 보호', terms.confidentiality_enabled, renderClauseTextarea('confidentialityTerms', terms.confidentiality_terms))}
      ${renderOptionalClause('handover', '업무 인수인계·조합 자산 반환', terms.handover_enabled, renderClauseTextarea('handoverTerms', terms.handover_terms))}
      ${renderOptionalClause('workRules', '적용 규정', terms.work_rules_enabled, renderClauseTextarea('workRulesTerms', terms.work_rules_terms))}
      ${renderOptionalClause('otherTerms', '그 밖의 조건', terms.other_terms_enabled, renderClauseTextarea('otherTermsText', terms.other_terms))}
    </div>
    <div class="section-card">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h3 class="section-title mb-0">기타 항목</h3><button type="button" class="btn btn-sm btn-outline-primary" id="addCustomTermButton">항목 추가</button></div>
      <p class="small text-muted">위 항목에 없는 근로조건이 있을 때만 제목과 내용을 추가합니다.</p>
      <div id="customTermRows"></div>
    </div>`;
}

function renderCheckbox(id, label, checked) {
  return `<div class="form-check"><input class="form-check-input" type="checkbox" id="${id}" ${checked ? 'checked' : ''}><label class="form-check-label" for="${id}">${escapeHtml(label)}</label></div>`;
}

function renderClauseTextarea(id, value, placeholder = '') {
  return `<textarea class="form-control" id="${id}" rows="2" maxlength="1500" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
}

const contractBonusAmounts = [
  {id:'monthlyBonus',key:'monthly_bonus_amount',label:'매월 상여금'},
  {id:'seollalBonus',key:'seollal_bonus_amount',label:'설 상여금'},
  {id:'chuseokBonus',key:'chuseok_bonus_amount',label:'추석 상여금'},
  {id:'otherBonusAmount',key:'other_bonus_amount',label:'그 외 지급액'}
];

function renderBonusEditor(terms) {
  const amountInput = ({id,key,label}) => `<div class="col-md-4"><label class="form-label" for="${id}">${label}</label><div class="input-group"><input data-number-group type="number" min="0" step="1" class="form-control" id="${id}" value="${escapeHtml(terms[key] ?? '')}"><span class="input-group-text">원</span></div></div>`;
  return `<div class="row g-3">
    ${contractBonusAmounts.slice(0,3).map(amountInput).join('')}
    <div class="col-md-8"><label class="form-label" for="otherBonusTiming">그 외 지급 시기</label><input class="form-control" id="otherBonusTiming" maxlength="100" value="${escapeHtml(terms.other_bonus_timing || '')}" placeholder="예: 12월 급여일, 분기 말"></div>
    ${amountInput(contractBonusAmounts[3])}
    <div class="col-12"><label class="form-label" for="otherBonusRule">그 외 지급 기준</label><input class="form-control" id="otherBonusRule" maxlength="300" value="${escapeHtml(terms.other_bonus_rule || '')}" placeholder="예: 연간 성과평가에 따라 정한 금액"></div>
    <div class="col-12"><label class="form-label" for="bonusTerms">추가 지급 조건</label>${renderClauseTextarea('bonusTerms', terms.bonus_components ? terms.bonus_note : terms.bonus_terms, '예: 설·추석 상여금은 해당 명절 전에 지급한다.')}</div>
  </div>`;
}

function renderOptionalClause(key, label, enabled, content) {
  const checkId = `${key}Enabled`;
  return `<div class="optional-clause" data-optional-clause="${key}"><div class="form-check mb-2"><input class="form-check-input optional-toggle" type="checkbox" id="${checkId}" data-toggle-clause="${key}" ${enabled ? 'checked' : ''}><label class="form-check-label fw-bold" for="${checkId}">${escapeHtml(label)}</label></div><div class="optional-clause-body ${enabled ? '' : 'hidden'}" data-clause-body="${key}">${content}</div></div>`;
}

function renderCustomTermRows() {
  const container = document.getElementById('customTermRows');
  if (!container) return;
  container.innerHTML = state.customTerms.length ? state.customTerms.map((item, index) => `
    <div class="custom-term-row" data-custom-term-row="${index}">
      <div><label class="form-label">항목명</label><input class="form-control" data-custom-title maxlength="100" value="${escapeHtml(item.title)}" placeholder="예: 교육비 지원"></div>
      <div><label class="form-label">내용</label><textarea class="form-control" data-custom-content rows="2" maxlength="1500">${escapeHtml(item.content)}</textarea></div>
      <button type="button" class="btn btn-outline-danger mt-md-4" data-remove-custom="${index}" aria-label="기타 항목 삭제"><i class="bi bi-trash"></i></button>
    </div>`).join('')
    : '<div class="small text-muted py-2">추가한 기타 항목이 없습니다.</div>';
  container.querySelectorAll('[data-remove-custom]').forEach((button) => {
    button.addEventListener('click', () => {
      collectCustomTerms();
      state.customTerms.splice(Number(button.dataset.removeCustom), 1);
      renderCustomTermRows();
    });
  });
}

function collectCustomTerms() {
  const rows = Array.from(document.querySelectorAll('[data-custom-term-row]'));
  state.customTerms = rows.map((row) => ({
    title: asText(row.querySelector('[data-custom-title]')?.value),
    content: asText(row.querySelector('[data-custom-content]')?.value)
  }));
  return state.customTerms.filter((item) => item.title || item.content);
}

function bindEditorEvents() {
  const workspace = document.getElementById('workspace');
  for (const event of ['input','change']) workspace.addEventListener(event,clearContractInputError);
  bindContractWeekdayPickers(workspace);
  renderCustomTermRows();
  document.getElementById('addCustomTermButton')?.addEventListener('click', () => {
    collectCustomTerms();
    state.customTerms.push({ title: '', content: '' });
    renderCustomTermRows();
  });
  const optionalDefaults = defaultTerms();
  document.querySelectorAll('[data-toggle-clause]').forEach(checkbox => {
    const body = workspace.querySelector(`[data-clause-body="${checkbox.dataset.toggleClause}"]`);
    const sync = fill => {
      body.classList.toggle('hidden', !checkbox.checked);
      body.querySelectorAll('input,select,textarea').forEach(field => {
        field.disabled = !checkbox.checked;
        if (field.disabled) removeContractInputError(field);
        if (!fill || !checkbox.checked || asText(field.value)) return;
        if (field.id === 'remoteWorkTerms') field.value = optionalDefaults.remote_work_terms;
        if (field.id === 'expenseTerms') field.value = optionalDefaults.expense_terms;
      });
    };
    sync(false);
    checkbox.addEventListener('change', () => {
      sync(true);
      if (checkbox.id === 'bonusEnabled') updateMonthlyWageTotal();
    });
  });
  const syncEndDate = focus => {
    const fixed = inputValue('employmentType') === 'fixed';
    const endDate = document.getElementById('contractEnd');
    document.getElementById('contractEndWrap').classList.toggle('hidden', !fixed);
    endDate.disabled = !fixed;
    if (!fixed) removeContractInputError(endDate);
    else if (focus) endDate.focus();
  };
  document.getElementById('employmentType')?.addEventListener('change', (event) => {
    if (event.target.value === 'part_time') { document.getElementById('workTimeBasis').value = 'part_time'; document.getElementById('workTimeBasis').dispatchEvent(new Event('change')); }
    syncEndDate(true);
  });
  syncEndDate(false);
  document.getElementById('workTimeBasis')?.addEventListener('change', (event) => {
    document.querySelector('[data-condition="workTimeBasis:part_time"]')?.classList.toggle('hidden', event.target.value !== 'part_time');
  });
  const syncClock = () => { const flexible = inputValue('workScheduleType') === 'flexible'; ['workStart', 'workEnd', 'breakStart', 'breakEnd'].forEach(id => { const input = document.getElementById(id); if (input) input.closest('[class*="col-"]').classList.toggle('hidden', flexible); }); };
  document.getElementById('workScheduleType')?.addEventListener('change', syncClock);
  syncClock();
  document.getElementById('parentContract')?.addEventListener('change', (event) => loadAmendmentParent(event.target.value));
  document.querySelectorAll('.wage-part, #monthlyBonus').forEach((input) => input.addEventListener('input', updateMonthlyWageTotal));
  document.getElementById('wageBasis')?.addEventListener('change', updateMonthlyWageTotal);
  const syncPaidRest = () => {
    const wrap=document.getElementById('minimumWageWeeklyPaidRestWrap');
    if(!wrap)return;
    const weekly=numberValue('weeklyWorkHours');
    const standard=weekly===40&&numberValue('dailyWorkHours')===8&&numberValue('workDaysPerWeek')===5;
    wrap.classList.toggle('hidden',weekly<15||standard||!(usesWageSum(inputValue('wageBasis'))||
      monthlyWageFields.some(({id})=>id!=='monthlyBasicPay'&&numberValue(id)>0)||(isChecked('bonusEnabled')&&numberValue('monthlyBonus')>0)));
  };
  workspace.addEventListener('input',syncPaidRest);
  workspace.addEventListener('change',syncPaidRest);
  syncPaidRest();
  updateMonthlyWageTotal();
  document.getElementById('previewDraftButton')?.addEventListener('click', previewDraft);
  document.getElementById('saveDraftButton')?.addEventListener('click', (event) => saveDraft(false, event.currentTarget));
  document.getElementById('submitDraftButton')?.addEventListener('click', (event) => saveDraft(true, event.currentTarget));
}

function previewDraft() {
  try {
    const dirty = hasUnsavedContractChanges();
    const draft = collectEditorContract();
    state.editing = cloneJson(draft);
    state.previewDirty = dirty;
    renderPreview(state.editing, true);
  } catch (error) { if (!showContractInputErrors(error)) showAlert(normalizeError(error)); }
}

function updateMonthlyWageTotal() {
  const target = document.getElementById('monthlyWageTotal');
  if (!target) return;
  const basis = inputValue('wageBasis');
  const monthlyBonus = isChecked('bonusEnabled') ? numberValue('monthlyBonus') : 0;
  const total = monthlyWageFields.reduce((sum, {id}) => sum + numberValue(id), 0) + monthlyBonus;
  target.textContent = total > 0 ? `${formatMoney(total)}원` : '—';
  document.getElementById('annualWageTotalRow').classList.toggle('hidden', basis !== 'annual');
  document.getElementById('annualWageTotal').textContent = total > 0 ? `${formatMoney(total * 12)}원` : '—';
  document.getElementById('annualBonusIncluded').classList.toggle('hidden', basis !== 'annual' || monthlyBonus <= 0);
  document.getElementById('annualBonusTotal').textContent = monthlyBonus > 0 ? `${formatMoney(monthlyBonus * 12)}원` : '';
  document.getElementById('wageUnitAmountWrap').classList.toggle('hidden', usesWageSum(basis));
  document.getElementById('wageAmount').disabled = usesWageSum(basis);
  document.getElementById('wageUnitAmountLabel').textContent = basis === 'daily' ? '일급 단가' : '시급 단가';
  const notice = document.getElementById('priorWageNotice');
  const previous = Number(notice.dataset.prevAmount);
  const showPrevious = usesWageSum(basis) && basis === notice.dataset.prevBasis && previous > 0
    && previous !== total * (basis === 'annual' ? 12 : 1);
  notice.classList.toggle('hidden', !showPrevious);
  if (showPrevious) notice.textContent = `기존 계약 기준 ${formatMoney(previous)}원 · 임금 항목을 바꾸기 전에는 기존 기준을 유지합니다.`;
}

function loadAmendmentParent(id) {
  const parent = state.contracts.find((contract) => contract.id === id && contract.status === 'completed' && contract.source_type === 'editor');
  if (!parent) {
    showAlert('기준 계약서를 불러오지 못했습니다. 완료된 직접 작성 계약서를 선택해 주세요.');
    return;
  }
  const title = document.getElementById('contractTitle').value;
  const date = document.getElementById('effectiveDate').value;
  document.getElementById('parentContract').value = state.editing.parent_contract_id || '';
  requestContractTransition(async () => {
    const owner = contractReadOwner();
    try {
    const current = await readContractDetail(parent.id, owner);
    if (!owner.isCurrent()) return;
    if (current.status !== 'completed' || current.source_type !== 'editor') throw new Error('기준 계약서 상태가 변경되었습니다.');
    state.editing.title = title;
    state.editing.effective_date = date;
    state.editing.parent_contract_id = parent.id;
    state.editing.terms = prepareTermsForEditor(current.terms, { fromExisting: true });
    state.amendmentBaseTerms = cloneJson(state.editing.terms);
    state.customTerms = cloneJson(state.editing.terms.custom_terms || []);
    renderEditor(true);
    } catch (error) { if (owner.isCurrent()) showAlert(normalizeError(error)); }
  });
}

function requireField(value, label) {
  if (!asText(value)) throw new Error(`${label}을(를) 입력해 주세요.`);
  return asText(value);
}

class ContractInputError extends Error {
  constructor(fields) {
    super('입력 항목을 확인해 주세요.');
    this.fields = fields;
  }
}

function contractInputError(id, message) {
  return new ContractInputError([[document.getElementById(id),message]]);
}

function contractWeekdayErrorTarget(field) {
  return field.hasAttribute('data-weekday-text')
    ? field.closest('[data-contract-week-picker]')?.querySelector('[data-weekday-option]')
    : null;
}

function removeContractInputError(field) {
  const id = field?.dataset?.contractError;
  if (!id) return;
  document.getElementById(id)?.remove();
  const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== id);
  if (describedBy.length) field.setAttribute('aria-describedby',describedBy.join(' '));
  else field.removeAttribute('aria-describedby');
  field.removeAttribute('aria-invalid');
  contractWeekdayErrorTarget(field)?.removeAttribute('aria-describedby');
  field.classList.remove('is-invalid');
  delete field.dataset.contractError;
}

function clearContractInputError(event) {
  removeContractInputError(event.target);
  for (const field of event.currentTarget.querySelectorAll('[data-contract-error]')) {
    if (field.disabled || field.closest('.hidden,[hidden]')) removeContractInputError(field);
  }
}

function showContractInputErrors(error) {
  if (!(error instanceof ContractInputError)) return false;
  let first = null;
  for (const [field,message] of error.fields) {
    if (!field || field.disabled || field.closest('.hidden,[hidden]')) continue;
    removeContractInputError(field);
    const hint = document.createElement('div');
    hint.id = 'contract-field-error-' + (field.id || field.dataset.validationKey);
    hint.className = 'invalid-feedback d-block';
    hint.textContent = message;
    (field.closest('.input-group') || field).after(hint);
    field.dataset.contractError = hint.id;
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid','true');
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'),hint.id].filter(Boolean).join(' '));
    contractWeekdayErrorTarget(field)?.setAttribute('aria-describedby',hint.id);
    first ||= field;
  }
  if (first) {
    const choice = contractWeekdayErrorTarget(first);
    (choice?.nextElementSibling || first).scrollIntoView({block:'center'});
    (choice || first).focus({preventScroll:true});
  }
  return Boolean(first);
}

function validateContractEditorInputs(terms) {
  const workspace = document.getElementById('workspace');
  workspace.querySelectorAll('[data-contract-error]').forEach(removeContractInputError);
  const fields = new Map();
  const addMissing = (field, message = '필수 항목입니다.') => {
    if (field && !field.disabled && !field.closest('.hidden,[hidden]') && !asText(field.value)) fields.set(field,message);
  };
  for (const label of workspace.querySelectorAll('label.required[for]')) {
    addMissing(document.getElementById(label.htmlFor));
  }
  for (const [checkId,fieldId] of [
    ['overtimeEnabled','overtimeTerms'],['retirementBenefitEnabled','retirementBenefitTerms'],
    ['remoteWorkEnabled','remoteWorkTerms'],['expenseEnabled','expenseTerms'],['confidentialityEnabled','confidentialityTerms'],
    ['handoverEnabled','handoverTerms'],['workRulesEnabled','workRulesTerms'],['otherTermsEnabled','otherTermsText'],
    ['probationEnabled','probationStart'],['probationEnabled','probationEnd'],['probationEnabled','probationWageTerms']
  ]) if (isChecked(checkId)) addMissing(document.getElementById(fieldId),'선택한 항목의 내용을 입력해 주세요.');
  if (inputValue('workScheduleType') === 'flexible') addMissing(document.getElementById('workScheduleTerms'));
  if (terms) {
    const companyMissing = [['company_name','조합명'],['employer_name','대표자'],['company_address','조합 주소']].filter(([key])=>!asText(terms[key])).map(([,label])=>label);
    const employeeMissing = [['employee_name','직원 이름'],['employee_address','직원 주소']].filter(([key])=>!asText(terms[key])).map(([,label])=>label);
    if (companyMissing.length) fields.set(document.getElementById('contractCompanyInfo'), '조합 기본 설정에서 ' + companyMissing.join('·') + '을(를) 확인해 주세요.');
    if (employeeMissing.length) fields.set(document.getElementById('contractEmployeeInfo'), '직원 관리에서 ' + employeeMissing.join('·') + '을(를) 확인해 주세요.');
  }
  for (const [index,row] of Array.from(workspace.querySelectorAll('[data-custom-term-row]')).entries()) {
    const title = row.querySelector('[data-custom-title]'), content = row.querySelector('[data-custom-content]');
    title.dataset.validationKey = 'custom-title-' + index;
    content.dataset.validationKey = 'custom-content-' + index;
    if (asText(title.value) || asText(content.value)) { addMissing(title); addMissing(content); }
  }
  const sorted = [...fields].filter(([field])=>field)
    .sort(([a],[b])=>Number(Boolean(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING))-Number(Boolean(b.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_PRECEDING)));
  if (sorted.length) throw new ContractInputError(sorted);
}

function numberValue(id) {
  const value = Number(ERPNumberInput.raw(document.getElementById(id)?.value || 0));
  return Number.isFinite(value) ? value : 0;
}

function isChecked(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function selectedInsuranceNames(terms) {
  return [
    terms.social_pension ? '국민연금' : '',
    terms.social_health ? '건강보험' : '',
    terms.social_employment ? '고용보험' : '',
    terms.social_industrial ? '산재보험' : ''
  ].filter(Boolean);
}

function employmentTypeLabel(value, formatVersion = 2) {
  if (Number(formatVersion) >= 3 && value === 'regular') return '기간을 정하지 않음';
  return ({ regular: '기간을 정하지 않은 통상근로', fixed: '기간제 근로', part_time: '단시간 근로' })[value] || value || '-';
}

function wageBasisLabel(value) {
  return ({ annual: '연봉', monthly: '월급', daily: '일급', hourly: '시급' })[value] || value || '-';
}

function enabledClauseSummary(enabled, value) {
  return enabled ? asText(value, '적용') : '적용하지 않음';
}

function summarizeCustomTerms(terms) {
  const items = Array.isArray(terms.custom_terms) ? terms.custom_terms : [];
  return items.length ? items.map((item) => `${asText(item.title)}: ${asText(item.content)}`).join('\n') : '없음';
}

const contractMonthlyAllowances = [
  {id:'monthlyCarAllowance', key:'monthly_car_allowance', label:'차량유지비'},
  {id:'monthlyChildcareAllowance', key:'monthly_childcare_allowance', label:'육아수당'}
];

const monthlyWageFields = [
  {id:'monthlyBasicPay',key:'monthly_basic_pay',label:'기본급'},
  {id:'monthlyMealAllowance',key:'monthly_meal_allowance',label:'식대'},
  {id:'monthlyPositionAllowance',key:'monthly_position_allowance',label:'직책수당'},
  {id:'monthlyOtherFixedAllowance',key:'monthly_other_fixed_allowance',label:'기타 고정수당'},
  ...contractMonthlyAllowances
];

const usesWageSum = basis => basis === 'monthly' || basis === 'annual';
const contractWageLimit = 100000000000;

function wholeWonFromInput(id, label) {
  const raw = ERPNumberInput.raw(inputValue(id));
  if (!raw) return 0;
  if (!/^\d+$/.test(raw) || Number(raw) > contractWageLimit) throw contractInputError(id,`${label} 금액은 0 이상의 원 단위로 입력해 주세요.`);
  return Number(raw);
}

function contractBonusText(terms, includeMonthly = true) {
  if (!terms.bonus_components) return asText(terms.bonus_terms);
  const separate = [terms.other_bonus_timing, terms.other_bonus_amount ? `${formatMoney(terms.other_bonus_amount)}원` : '', terms.other_bonus_rule].filter(Boolean);
  return [
    includeMonthly && terms.monthly_bonus_amount ? `매월 ${formatMoney(terms.monthly_bonus_amount)}원` : '',
    terms.seollal_bonus_amount ? `설 ${formatMoney(terms.seollal_bonus_amount)}원` : '',
    terms.chuseok_bonus_amount ? `추석 ${formatMoney(terms.chuseok_bonus_amount)}원` : '',
    separate.length ? separate.join(' · ') : '',
    terms.bonus_note
  ].filter(Boolean).join('\n');
}

function collectBonus(terms) {
  const enabled = isChecked('bonusEnabled');
  terms.bonus_enabled = enabled;
  for (const {id,key,label} of contractBonusAmounts) {
    const amount = enabled ? wholeWonFromInput(id, label) : 0;
    if (amount) terms[key] = amount;
    else delete terms[key];
  }
  for (const [key,id] of [['other_bonus_timing','otherBonusTiming'],['other_bonus_rule','otherBonusRule'],['bonus_note','bonusTerms']]) {
    const value = enabled ? inputValue(id) : '';
    if (value) terms[key] = value;
    else delete terms[key];
  }
  const other = terms.other_bonus_timing || terms.other_bonus_amount || terms.other_bonus_rule;
  if (other && !terms.other_bonus_timing) throw contractInputError('otherBonusTiming','그 외 상여금의 지급 시기를 입력해 주세요.');
  if (other && !terms.other_bonus_amount && !terms.other_bonus_rule) throw contractInputError('otherBonusAmount','그 외 상여금의 지급액 또는 기준을 입력해 주세요.');
  if (other || contractBonusAmounts.some(({key}) => terms[key])) {
    terms.bonus_components = true;
    terms.bonus_terms = contractBonusText(terms);
  } else {
    delete terms.bonus_components;
    terms.bonus_terms = terms.bonus_note || '';
    delete terms.bonus_note;
  }
  if (enabled && !terms.bonus_terms) throw contractInputError('monthlyBonus','매월·명절·그 외 상여금 중 지급액 또는 조건을 입력해 주세요.');
}

function monthlyContractWageItems(terms) {
  return [...monthlyWageFields.map(({key,label}) => [label, terms[key]]),
    ['상여금', terms.bonus_enabled ? terms.monthly_bonus_amount : 0]].filter(([,amount]) => Number(amount || 0) > 0);
}

function additionalAllowanceLine(terms) {
  const parts = contractMonthlyAllowances.filter(({key}) => Number(terms[key]) > 0)
    .map(({key,label}) => `월 ${label} ${formatMoney(terms[key])}원`);
  return parts.length ? '\n계약 수당: ' + parts.join(' · ') : '';
}

function wageCalculationWithoutNonTax(terms) {
  const calculation = asText(terms.wage_calculation_terms || terms.wage_components);
  const note = asText(terms.non_tax_terms);
  const suffix = '\n계약상 비과세 항목: ' + note;
  const withoutNote = note && calculation.endsWith(suffix) ? calculation.slice(0, -suffix.length) : calculation;
  const allowanceLine = additionalAllowanceLine(terms);
  return allowanceLine && withoutNote.endsWith(allowanceLine) ? withoutNote.slice(0, -allowanceLine.length) : withoutNote;
}

function buildTermSectionSummaries(terms) {
  const period = terms.indefinite_term !== false
    ? `${formatDate(terms.contract_start_date)}부터 기간을 정하지 않음`
    : `${formatDate(terms.contract_start_date)}부터 ${formatDate(terms.contract_end_date)}까지`;
  const monthlyParts = monthlyContractWageItems(terms).map(([label, amount]) => `${label} ${formatMoney(amount)}원`);
  const insurance = selectedInsuranceNames(terms);
  return new Map([
    ['계약 형태와 기간', `${employmentTypeLabel(terms.employment_type, terms.contract_format_version)} · ${terms.work_time_basis === 'part_time' ? '시간제' : '전일제'}\n${period}`],
    ['근무 장소와 담당 업무', `근무 장소: ${asText(terms.workplace, '-')}\n담당 업무: ${asText(terms.duties, '-')}`],
    ['근로시간과 휴일', `${asText(terms.work_days, '-')} · 주 ${terms.work_days_per_week || '-'}일\n${terms.work_schedule_type === 'flexible' ? asText(terms.work_schedule_terms, '-') : `${asText(terms.work_start_time, '-')}~${asText(terms.work_end_time, '-')} · 휴게 ${asText(terms.break_start_time, '-')}~${asText(terms.break_end_time, '-')}`}\n1일 ${terms.daily_work_hours || '-'}시간 · 주 ${terms.weekly_work_hours || '-'}시간\n주휴일 ${asText(terms.weekly_holiday, '-')} · ${asText(terms.holiday_terms, '-')}${(terms.employment_type === 'part_time' || terms.work_time_basis === 'part_time') ? `\n요일별 시간: ${asText(terms.part_time_schedule, '-')}` : ''}`],
    ['임금', `${wageBasisLabel(terms.wage_basis)} ${formatMoney(terms.wage_amount)}원${monthlyParts.length ? `\n월 구성: ${monthlyParts.join(', ')}` : ''}\n${wageCalculationWithoutNonTax(terms) || '-'}\n${asText(terms.pay_day, '-')} · ${asText(terms.payment_method, '-')}`],
    ['계약상 비과세 항목', asText(terms.non_tax_terms)],
    ['휴가와 사회보험', `${asText(terms.annual_leave, '-')}\n${insurance.length ? insurance.join('·') : '적용 보험 없음'}${terms.social_insurance_note ? ` · ${terms.social_insurance_note}` : ''}`],
    ['수습기간', terms.probation_enabled ? `${formatDate(terms.probation_start_date)}~${formatDate(terms.probation_end_date)}\n${asText(terms.probation_wage_terms, '-')}` : '적용하지 않음'],
    ['상여금', enabledClauseSummary(terms.bonus_enabled, contractBonusText(terms, false))],
    ['연장·야간·휴일근로', enabledClauseSummary(terms.overtime_enabled, terms.overtime_terms)],
    ['퇴직급여', enabledClauseSummary(terms.retirement_benefit_enabled, terms.retirement_benefit_terms)],
    ['재택·출장·현장근무', enabledClauseSummary(terms.remote_work_enabled, terms.remote_work_terms)],
    ['업무비용 정산', enabledClauseSummary(terms.expense_enabled, terms.expense_terms)],
    ['비밀유지·개인정보 보호', enabledClauseSummary(terms.confidentiality_enabled, terms.confidentiality_terms)],
    ['업무 인수인계·조합 자산 반환', enabledClauseSummary(terms.handover_enabled, terms.handover_terms)],
    ['적용 규정', enabledClauseSummary(terms.work_rules_enabled, terms.work_rules_terms)],
    ['그 밖의 조건', enabledClauseSummary(terms.other_terms_enabled, terms.other_terms)],
    ['기타 항목', summarizeCustomTerms(terms)]
  ]);
}

function calculateAmendmentChanges(beforeTerms, afterTerms) {
  const before = buildTermSectionSummaries(beforeTerms);
  const after = buildTermSectionSummaries(afterTerms);
  return Array.from(after.entries()).filter(([field, value]) => asText(before.get(field)).replace(/\s+/g, ' ') !== asText(value).replace(/\s+/g, ' ')).map(([field, value]) => ({
    field,
    before: before.get(field) || '없음',
    after: value || '없음'
  }));
}

function optionalText(enabledId, textId, label) {
  if (!isChecked(enabledId)) return '';
  return requireField(inputValue(textId), label);
}

function collectFullTerms(seed) {
  const terms = { ...seed, contract_format_version: 3 };
  terms.work_time_basis = requireField(inputValue('workTimeBasis'), '근무 형태');
  if (!['full_time', 'part_time'].includes(terms.work_time_basis)) throw new Error('근무 형태를 선택해 주세요.');
  terms.employment_type = requireField(inputValue('employmentType'), '근로 형태');
  terms.contract_start_date = requireField(inputValue('contractStart'), '근로 시작일');
  terms.indefinite_term = terms.employment_type !== 'fixed';
  terms.contract_end_date = terms.indefinite_term ? '' : inputValue('contractEnd');
  if (!terms.indefinite_term && !terms.contract_end_date) throw new Error('기간제 근로의 종료일을 입력해 주세요.');
  if (terms.contract_end_date && terms.contract_end_date < terms.contract_start_date) throw contractInputError('contractEnd','근로 종료일은 시작일보다 앞설 수 없습니다.');
  terms.workplace = requireField(inputValue('workplace'), '근무 장소');
  terms.duties = requireField(inputValue('duties'), '담당 업무');
  terms.work_days = requireField(inputValue('workDays'), '근무일');
  terms.work_days_per_week = numberValue('workDaysPerWeek');
  terms.daily_work_hours = numberValue('dailyWorkHours');
  terms.weekly_work_hours = numberValue('weeklyWorkHours');
  if (terms.work_days_per_week <= 0 || terms.work_days_per_week > 7) throw contractInputError('workDaysPerWeek','주 근무일은 0일보다 크고 7일 이하여야 합니다.');
  if (terms.daily_work_hours <= 0 || terms.daily_work_hours > 24 || Math.abs(terms.daily_work_hours*30-Math.round(terms.daily_work_hours*30))>1e-7) throw contractInputError('dailyWorkHours','1일 근로시간은 0시간보다 크고 24시간 이하인 2분 단위로 입력해 주세요.');
  if (terms.weekly_work_hours <= 0 || terms.weekly_work_hours > 168) throw contractInputError('weeklyWorkHours','1주 근로시간은 0시간보다 크고 168시간 이하여야 합니다.');
  terms.work_schedule_type = inputValue('workScheduleType') || 'fixed';
  terms.work_schedule_terms = inputValue('workScheduleTerms');
  if (terms.work_schedule_type === 'flexible') {
    requireField(terms.work_schedule_terms, '근무·휴게시간 합의 내용');
    terms.work_start_time = terms.work_end_time = terms.break_start_time = terms.break_end_time = '';
  } else {
    terms.work_start_time = requireField(inputValue('workStart'), '근무 시작 시간');
    terms.work_end_time = requireField(inputValue('workEnd'), '근무 종료 시간');
    terms.break_start_time = requireField(inputValue('breakStart'), '휴게 시작 시간');
    terms.break_end_time = requireField(inputValue('breakEnd'), '휴게 종료 시간');
    if (terms.work_end_time <= terms.work_start_time) throw contractInputError('workEnd','근무 종료 시간은 시작 시간보다 뒤여야 합니다.');
    if (terms.break_end_time <= terms.break_start_time) throw contractInputError('breakEnd','휴게 종료 시간은 시작 시간보다 뒤여야 합니다.');
    const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
    if (terms.break_start_time < terms.work_start_time || terms.break_end_time > terms.work_end_time || Math.abs(minutes(terms.work_end_time)-minutes(terms.work_start_time)-(minutes(terms.break_end_time)-minutes(terms.break_start_time))-terms.daily_work_hours*60)>1e-7) throw contractInputError('dailyWorkHours','시작·종료 시각에서 휴게시간을 뺀 시간이 1일 소정근로시간과 같아야 합니다. 시각을 정하지 않았다면 협의·유연근무를 선택해 주세요.');
  }
  terms.weekly_holiday = requireField(inputValue('weeklyHoliday'), '주휴일');
  terms.holiday_terms = requireField(inputValue('holidayTerms'), '그 밖의 휴일');
  terms.part_time_schedule = terms.work_time_basis === 'part_time'
    ? requireField(inputValue('partTimeSchedule'), '단시간 근로자의 요일별 근로시간')
    : '';

  terms.wage_basis = requireField(inputValue('wageBasis'), '임금 기준');
  const paidRest=inputValue('minimumWageWeeklyPaidRest');
  delete terms.minimum_wage_weekly_paid_rest_hours;
  if(paidRest&&!document.getElementById('minimumWageWeeklyPaidRestWrap')?.classList.contains('hidden')){
    const hours=Number(paidRest);
    if(!Number.isFinite(hours)||hours<=0||hours>8)throw contractInputError('minimumWageWeeklyPaidRest','유급 주휴시간은 0시간보다 크고 8시간 이하로 입력해 주세요.');
    terms.minimum_wage_weekly_paid_rest_hours=hours;
  }
  for (const {id,key,label} of monthlyWageFields) {
    const amount = wholeWonFromInput(id,label);
    if (amount || !contractMonthlyAllowances.some(item => item.key === key)) terms[key] = amount;
    else delete terms[key];
  }
  collectBonus(terms);
  delete terms.wage_from_parts;
  if (usesWageSum(terms.wage_basis)) {
    const sum = monthlyContractWageItems(terms).reduce((total,[,amount]) => total + Number(amount),0);
    const total = sum * (terms.wage_basis === 'annual' ? 12 : 1);
    // Legacy drafts and amendments may have agreed totals with no matching breakdown.
    // A change outside payroll must not silently replace that contractual figure.
    const keepPrior = !seed.wage_from_parts && terms.wage_basis === seed.wage_basis
      && Number(document.getElementById('priorWageNotice')?.dataset.prevAmount) > 0
      && total !== Number(seed.wage_amount)
      && [...monthlyWageFields.map(({key}) => key),'monthly_bonus_amount']
        .every(key => Number(terms[key] || 0) === Number(seed[key] || 0));
    terms.wage_amount = keepPrior ? Number(seed.wage_amount) : total;
    if (!keepPrior) terms.wage_from_parts = true;
    if (terms.wage_amount <= 0 || terms.wage_amount > contractWageLimit) throw contractInputError('monthlyBasicPay','기본급과 수당 등의 합계를 확인해 주세요.');
  } else {
    const label = terms.wage_basis === 'daily' ? '일급 단가' : '시급 단가';
    terms.wage_amount = wholeWonFromInput('wageAmount',label);
    if (!terms.wage_amount) throw contractInputError('wageAmount',`${label}를 입력해 주세요.`);
  }
  terms.annual_salary = terms.wage_basis === 'annual' ? terms.wage_amount : 0;
  terms.wage_calculation_terms = requireField(inputValue('wageCalculationTerms'), '임금 구성·계산 기준');
  // Keep both new amounts visible in the existing renderer in already-open tabs.
  terms.wage_calculation_terms += additionalAllowanceLine(terms);
  // Preserve the memo in already-recorded terms without offering it as an input for new contracts.
  if (asText(terms.non_tax_terms)) terms.wage_calculation_terms += '\n계약상 비과세 항목: ' + terms.non_tax_terms;
  if (terms.wage_calculation_terms.length > 1500) throw contractInputError('wageCalculationTerms','임금 기준과 수당 안내를 합쳐 1,500자 이내로 적어 주세요.');
  terms.wage_components = terms.wage_calculation_terms;
  terms.pay_day = requireField(inputValue('payDay'), '임금 지급일');
  terms.payment_method = requireField(inputValue('paymentMethod'), '임금 지급 방법');
  terms.annual_leave = requireField(inputValue('annualLeave'), '연차유급휴가');
  terms.social_pension = isChecked('socialPension');
  terms.social_health = isChecked('socialHealth');
  terms.social_employment = isChecked('socialEmployment');
  terms.social_industrial = isChecked('socialIndustrial');
  terms.social_insurance_note = inputValue('socialInsuranceNote');
  const insuranceNames = selectedInsuranceNames(terms);
  if (!insuranceNames.length && !terms.social_insurance_note) throw new Error('사회보험을 적용하지 않는 경우 적용 제외 사유를 입력해 주세요.');
  terms.social_insurance = insuranceNames.length ? `${insuranceNames.join('·')} 적용` : terms.social_insurance_note;

  terms.probation_enabled = isChecked('probationEnabled');
  terms.probation_start_date = terms.probation_enabled ? requireField(inputValue('probationStart'), '수습 시작일') : '';
  terms.probation_end_date = terms.probation_enabled ? requireField(inputValue('probationEnd'), '수습 종료일') : '';
  terms.probation_wage_terms = terms.probation_enabled ? requireField(inputValue('probationWageTerms'), '수습기간의 임금·평가 조건') : '';
  if (terms.probation_enabled && terms.probation_end_date < terms.probation_start_date) throw new Error('수습 종료일은 시작일보다 앞설 수 없습니다.');

  terms.overtime_enabled = isChecked('overtimeEnabled');
  terms.overtime_terms = optionalText('overtimeEnabled', 'overtimeTerms', '연장·야간·휴일근로 조건');
  terms.retirement_benefit_enabled = isChecked('retirementBenefitEnabled');
  terms.retirement_benefit_terms = optionalText('retirementBenefitEnabled', 'retirementBenefitTerms', '퇴직급여 조건');
  terms.remote_work_enabled = isChecked('remoteWorkEnabled');
  terms.remote_work_terms = optionalText('remoteWorkEnabled', 'remoteWorkTerms', '재택·출장·현장근무 조건');
  terms.expense_enabled = isChecked('expenseEnabled');
  terms.expense_terms = optionalText('expenseEnabled', 'expenseTerms', '업무비용 정산 조건');
  terms.confidentiality_enabled = isChecked('confidentialityEnabled');
  terms.confidentiality_terms = optionalText('confidentialityEnabled', 'confidentialityTerms', '비밀유지·개인정보 보호 조건');
  terms.handover_enabled = isChecked('handoverEnabled');
  terms.handover_terms = optionalText('handoverEnabled', 'handoverTerms', '업무 인수인계 조건');
  terms.work_rules_enabled = isChecked('workRulesEnabled');
  terms.work_rules_terms = optionalText('workRulesEnabled', 'workRulesTerms', '적용 규정');
  terms.other_terms_enabled = isChecked('otherTermsEnabled');
  terms.other_terms = optionalText('otherTermsEnabled', 'otherTermsText', '그 밖의 조건');
  terms.custom_terms = collectCustomTerms();
  if (terms.custom_terms.some((item) => !item.title || !item.content)) throw new Error('기타 항목은 항목명과 내용을 모두 입력해 주세요.');
  return terms;
}

function collectEditorContract() {
  const base = state.editing;
  if (!base || base.emp_id !== state.employee?.emp_id) throw new Error('계약서를 작성할 직원을 다시 선택해 주세요.');
  const amendment = base.document_kind === 'amendment';
  let terms = { ...base.terms };
  validateContractEditorInputs(terms);
  terms.company_name = requireField(terms.company_name, '조합명');
  terms.employer_name = requireField(terms.employer_name, '대표자');
  terms.company_address = requireField(terms.company_address, '조합 주소');
  terms.employee_name = requireField(terms.employee_name, '직원 이름');
  terms.employee_address = requireField(terms.employee_address, '직원 주소');
  terms = collectFullTerms(terms);
  if (amendment) {
    const parentId = inputValue('parentContract');
    const parent = state.contracts.find((contract) => contract.id === parentId && contract.status === 'completed' && contract.source_type === 'editor');
    if (!parent) throw contractInputError('parentContract','기준 계약서를 선택해 주세요.');
    const baseline = state.amendmentBaseTerms || prepareTermsForEditor(parent.terms, { fromExisting: true });
    terms.change_reason = inputValue('changeReason');
    terms.changes = calculateAmendmentChanges(baseline, terms);
    if (!terms.changes.length) throw new Error('기준 계약서에서 변경된 근로조건이 없습니다. 바꿀 항목을 수정해 주세요.');
  }
  return {
    ...base,
    title: requireField(inputValue('contractTitle'), '문서 제목'),
    effective_date: requireField(inputValue('effectiveDate'), '적용일'),
    parent_contract_id: amendment ? inputValue('parentContract') || null : null,
    terms
  };
}

async function saveDraft(submitAfter, button) {
  if (state.busy) return;
  try {
    const draft = collectEditorContract();
    if (draft.document_kind === 'amendment' && !draft.parent_contract_id) throw new Error('기준 계약서를 선택해 주세요.');
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const args = draft.id ? {
      p_contract_id: draft.id,
      p_title: draft.title,
      p_effective_date: draft.effective_date,
      p_terms: draft.terms,
      p_parent_contract_id: draft.parent_contract_id
    } : {
      p_emp_id: state.employee.emp_id,
      p_document_kind: draft.document_kind,
      p_title: draft.title,
      p_effective_date: draft.effective_date,
      p_terms: draft.terms,
      p_parent_contract_id: draft.parent_contract_id
    };
    const rpcName = draft.id ? 'erp_update_employment_contract_draft' : 'erp_create_employment_contract_draft';
    const { data, error } = await db.rpc(rpcName, args);
    if (error) throw error;
    const saved = Array.isArray(data) ? data[0] : data;
    state.editing = saved;
    state.editorBaseline = contractEditorSnapshot();
    state.previewDirty = false;
    if (submitAfter) {
      const { data: submitted, error: submitError } = await db.rpc('erp_submit_employment_contract', { p_contract_id: saved.id });
      if (submitError) throw submitError;
      await loadContracts();
      openContract((Array.isArray(submitted) ? submitted[0] : submitted)?.id || saved.id, { afterSave: true });
      showAlert('전자 확인을 요청했습니다. 직원은 마이페이지의 계약서 관리에서 내용을 확인할 수 있습니다.');
    } else {
      await loadContracts();
      openContract(saved.id, { afterSave: true });
      showAlert('초안을 저장했습니다.');
    }
  } catch (error) {
    if(state.busy)setBusy(false,button);
    if (!showContractInputErrors(contractWageCheckError(error))) {
      console.error('[employment_contracts] save failed', error);
      showAlert(normalizeError(error));
    }
  } finally {
    if(state.busy)setBusy(false,button);
  }
}

function openContract(id, options = {}) {
  if (!isContractHistoryReady(id) || (state.busy && !options.afterSave)) return;
  if (options.afterSave) { resetContractEditTracking(); showContract(id); return; }
  requestContractTransition(() => { resetContractEditTracking(); showContract(id); });
}

async function showContract(id) {
  if (!isContractHistoryReady(id)) return;
  const owner = contractReadOwner();
  const hint=state.contracts.find(row=>row.id===id);
  if(hint?.source_type==='editor'&&!(hint.status==='draft'&&state.admin&&!state.forceSelf))warmContractPdfTool();
  try {
  if (!await loadContractDefaults(owner)) return;
  const contract = await readContractDetail(id, owner);
  if (!owner.isCurrent()) return;
  let parent = contract.document_kind === 'amendment' && contract.parent_contract_id
    ? await readContractDetail(contract.parent_contract_id, owner) : null;
  if (!owner.isCurrent()) return;
  if (parent && (parent.status !== 'completed' || parent.source_type !== 'editor')) parent = null;
  document.querySelectorAll('.history-item').forEach((element) => element.classList.toggle('active', element.dataset.contractId === id));
  if (!contract) return emptyWorkspace('계약서를 찾을 수 없습니다');
  if (contract.status === 'draft' && state.admin && !state.forceSelf) {
    state.editing = cloneJson(contract);
    state.amendmentBaseTerms = parent ? prepareTermsForEditor(parent.terms, { fromExisting: true }) : null;
    state.customTerms = cloneJson(contract.terms?.custom_terms || []);
    renderEditor();
    return;
  }
  renderPreview(contract, false);
  } catch (error) { if (owner.isCurrent()) showAlert(normalizeError(error)); }
}

function renderPreview(contract, unsaved) {
  contractPreviewRead = unsaved ? null : {scope:contractReadScope(),id:contract.id,stamp:contractHistoryStamp(contract)};
  const paper = contract.source_type === 'upload'
    ? `<div class="section-card"><h3 class="h5 fw-bold">외부 작성 계약서</h3><p>${escapeHtml(contract.original_file_name || contract.title)}</p><p>등록일 ${escapeHtml(formatDate(contract.created_at))} · 적용일 ${escapeHtml(formatDate(contract.effective_date))}</p>${contract.terms?.work_time_basis ? `<h4 class="h6 fw-bold mt-4">등록한 근로조건</h4><dl>${Array.from(buildTermSectionSummaries(contract.terms)).map(([label, value]) => `<dt class="mt-3">${escapeHtml(label)}</dt><dd class="mb-0" style="white-space:pre-wrap;word-break:keep-all">${escapeHtml(value)}</dd>`).join('')}</dl>` : ''}</div>`
    : renderContractDocument(contract);
  const canEmployerSign = !unsaved && state.admin && !state.forceSelf && contract.status === 'awaiting_signatures' && !contract.employer_signed_at;
  const canEmployeeSign = !unsaved && (!state.admin || state.forceSelf) && contract.status === 'awaiting_signatures' && !contract.employee_signed_at;
  const workspace = document.getElementById('workspace');
  workspace.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-4 no-print">
      <div><div class="text-primary small fw-bold mb-1">${unsaved ? '저장 전 미리보기' : `v${contract.version_no || '새 문서'} · ${escapeHtml(statusLabel(contract.status || 'draft'))}`}</div><h2 class="h4 fw-bold mb-1">${escapeHtml(contract.title)}</h2><div class="small text-muted">${escapeHtml(kindLabel(contract.document_kind))} · 적용일 ${escapeHtml(formatDate(contract.effective_date))}</div></div>
      <div class="contract-actions">
        ${unsaved ? '<button type="button" class="btn btn-outline-secondary" id="returnEditorButton">작성 화면</button>' : ''}
        ${!unsaved && contract.source_type === 'upload' ? '<button type="button" class="btn btn-outline-primary" id="openFileButton">원본 파일 열기</button>' : ''}
        ${canEmployerSign ? '<button type="button" class="btn btn-primary" id="employerSignButton">사용자 측 전자 확인</button>' : ''}
        ${canEmployeeSign ? '<button type="button" class="btn btn-primary" id="employeeSignButton">내용 확인 및 전자 서명</button>' : ''}
        ${!unsaved && contract.source_type !== 'upload' ? '<button type="button" class="btn btn-outline-dark" id="downloadContractButton">PDF 다운로드</button>' : ''}
        ${contract.source_type !== 'upload' ? '<button type="button" class="btn btn-dark" id="printContractButton">인쇄</button>' : ''}
      </div>
    </div>
    ${!unsaved ? '<div id="contractPreviewReadStatus" class="alert alert-warning py-2 no-print" role="status" hidden></div>' : ''}
    ${paper}`;
  if (!unsaved) {
    workspace.querySelectorAll('.contract-actions button').forEach(button => {
      button.setAttribute('data-verified-contract-action', '');
      button.addEventListener('click', event => {
        if (!isContractPreviewReady() || state.busy) { event.preventDefault(); event.stopImmediatePropagation(); }
      });
    });
    updateContractPreviewReadActions();
  }
  document.getElementById('returnEditorButton')?.addEventListener('click', () => renderEditor(true));
  document.getElementById('openFileButton')?.addEventListener('click', () => openStoredFile(contract.file_path));
  document.getElementById('employerSignButton')?.addEventListener('click', (event) => signContract(contract.id, 'employer', event.currentTarget));
  document.getElementById('employeeSignButton')?.addEventListener('click', (event) => signContract(contract.id, 'employee', event.currentTarget));
  document.getElementById('downloadContractButton')?.addEventListener('click', (event) => downloadContractPdf(contract, event.currentTarget));
  document.getElementById('printContractButton')?.addEventListener('click', (event) => printContract(contract, event.currentTarget));
  // Prime the fixed library only after the requested contract preview is visible.
  if (document.getElementById('printContractButton')) warmContractPdfTool();
}

function contractSectionHeading(number, title) {
  return `<h2><span class="contract-sec-num">${String(number).padStart(2, '0')}</span><span>${escapeHtml(title)}</span></h2>`;
}

function contractHeaderBadgeText(contract) {
  if (window.ExpoRuntimeBridge) return '박람회 시연 예시';
  if (contract.status === 'completed' && asText(contract.content_hash)) return '전자문서 보관본';
  if (contract.status === 'awaiting_signatures') return '전자 확인 진행 중';
  return '미확정 초안 문서';
}

function renderContractDocument(contract) {
  const terms = contract.terms || {};
  if (Number(terms.contract_format_version || 0) < 2) return renderLegacyContractDocument(contract);
  const amendment = contract.document_kind === 'amendment';
  const body = amendment ? renderAmendmentDocumentBody(terms) : renderFullContractDocumentBody(terms);
  const hasExtraTerms = !amendment && ([
    terms.probation_enabled, terms.bonus_enabled, terms.overtime_enabled, terms.retirement_benefit_enabled,
    terms.remote_work_enabled, terms.expense_enabled, terms.confidentiality_enabled, terms.handover_enabled,
    terms.work_rules_enabled, terms.other_terms_enabled
  ].some(Boolean) || (Array.isArray(terms.custom_terms) && terms.custom_terms.some((item) => asText(item?.title) && asText(item?.content))));
  const deliverySectionNo = amendment ? (asText(terms.change_reason) ? 5 : 4) : (hasExtraTerms ? 7 : 6);
  const employerState = contract.employer_signed_at
    ? `<strong>${escapeHtml(contract.employer_signer_name || terms.employer_name || '사용자 측 관리자')}</strong><br>전자 확인 ${escapeHtml(formatDateTime(contract.employer_signed_at))}`
    : '전자 확인 전';
  const employeeState = contract.employee_signed_at
    ? `<strong>${escapeHtml(contract.employee_signer_name || terms.employee_name || '근로자')}</strong><br>전자 확인 ${escapeHtml(formatDateTime(contract.employee_signed_at))}`
    : '전자 확인 전';
  const agreementIntro = amendment
    ? `다음은 <strong>${escapeHtml(terms.company_name || '')}</strong> 및 <strong>${escapeHtml(terms.employee_name || '')}</strong>가 합의한 근로조건 변경 사항입니다.`
    : `근로계약 당사자인 <strong>${escapeHtml(terms.company_name || '')}</strong>, <strong>${escapeHtml(terms.employee_name || '')}</strong> 사이에 다음과 같이 근로계약을 체결합니다.`;
  const kicker = amendment ? 'EMPLOYMENT AMENDMENT' : 'EMPLOYMENT CONTRACT';
  return `<article class="document-paper" data-contract-document>
    <header class="contract-doc-header">
      <div>
        <div class="contract-doc-kicker">${kicker}</div>
        <h1>${escapeHtml(contract.title || kindLabel(contract.document_kind))}</h1>
      </div>
      <div class="contract-doc-meta">
        <div>적용일 <strong>${escapeHtml(formatDate(contract.effective_date))}</strong></div>
        <div>${escapeHtml(contractHeaderBadgeText(contract))}</div>
      </div>
    </header>
    <p class="contract-lead">${agreementIntro}</p>
    ${renderPartyInformation(terms)}
    ${body}
    <section class="page-break-avoid">${contractSectionHeading(deliverySectionNo, '전자문서 교부')}
    <table><tbody><tr><th>보관 및 교부</th><td>이 전자문서는 ${escapeHtml(terms.company_name || '조합')} 및 ${escapeHtml(terms.employee_name || '근로자')}가 같은 내용을 확인할 수 있도록 보관하며, 근로자는 ERP 계약서 관리 화면에서 PDF로 내려받을 수 있습니다.</td></tr></tbody></table></section>
    <div class="contract-effective-date">${escapeHtml(formatDate(contract.effective_date))}</div>
    <div class="signature-grid">
      <div class="signature-box">
        <div class="signature-box-head">사업주</div>
        <div class="signature-box-body">
          <div>
            <div class="signature-box-org">${escapeHtml(terms.company_name || '-')}</div>
            ${terms.company_address ? `<div class="signature-box-sub">${escapeHtml(terms.company_address)}</div>` : ''}
            <div>${escapeHtml(terms.employer_role || '대표자')} ${escapeHtml(terms.employer_name || '-')}</div>
          </div>
          <div class="signature-box-state">${employerState}</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-box-head">근로자</div>
        <div class="signature-box-body">
          <div>
            <div class="signature-box-org">${escapeHtml(terms.employee_name || '-')}</div>
            ${terms.employee_address ? `<div class="signature-box-sub">${escapeHtml(terms.employee_address)}</div>` : ''}
          </div>
          <div class="signature-box-state">${employeeState}</div>
        </div>
      </div>
    </div>
    ${renderIntegrityNotice(contract)}
  </article>`;
}

function multilineHtml(value, fallback = '-') {
  return escapeHtml(asText(value, fallback)).replace(/\r?\n/g, '<br>');
}

function renderPartyInformation(terms) {
  const companyContact = [terms.company_contact, terms.company_email].map((value) => asText(value)).filter(Boolean).join(' · ');
  const employeeContact = asText(terms.employee_email);
  return `${contractSectionHeading(1, '계약 당사자')}<table class="party-table"><tbody>
    <tr><th>사업주</th><td>${escapeHtml(terms.company_name || '-')}</td><th>대표자</th><td>${escapeHtml(terms.employer_name || '-')}</td></tr>
    <tr><th>사업자등록번호</th><td class="num-val">${escapeHtml(terms.company_business_number || '-')}</td><th>연락처</th><td>${escapeHtml(companyContact || '-')}</td></tr>
    <tr><th>사업장 주소</th><td colspan="3">${escapeHtml(terms.company_address || '-')}</td></tr>
    <tr><th>근로자</th><td><strong>${escapeHtml(terms.employee_name || '-')}</strong></td><th>직위</th><td>${escapeHtml(terms.employee_position || '-')}</td></tr>
    <tr><th>근로자 주소</th><td colspan="3">${escapeHtml(terms.employee_address || '-')}</td></tr>
    ${employeeContact ? `<tr><th>근로자 이메일</th><td colspan="3">${escapeHtml(employeeContact)}</td></tr>` : ''}
  </tbody></table>`;
}

function renderFullContractDocumentBody(terms) {
  const period = terms.indefinite_term !== false
    ? `${formatDate(terms.contract_start_date)}부터 기간을 정하지 않음`
    : `${formatDate(terms.contract_start_date)}부터 ${formatDate(terms.contract_end_date)}까지`;
  const monthlyItems = monthlyContractWageItems(terms).map(([label,amount]) => [`월 ${label}`, amount]);
  const monthlyTotal = monthlyItems.reduce((sum, [, amount]) => sum + Number(amount || 0), 0);
  const insurance = selectedInsuranceNames(terms);
  const optionalRows = [
    terms.probation_enabled ? ['수습기간', `${formatDate(terms.probation_start_date)}부터 ${formatDate(terms.probation_end_date)}까지\n${terms.probation_wage_terms}`] : null,
    terms.bonus_enabled && contractBonusText(terms, false) ? ['상여금', contractBonusText(terms, false)] : null,
    terms.overtime_enabled ? ['연장·야간·휴일근로', terms.overtime_terms] : null,
    terms.retirement_benefit_enabled ? ['퇴직급여', terms.retirement_benefit_terms] : null,
    terms.remote_work_enabled ? ['재택·출장·현장근무', terms.remote_work_terms] : null,
    terms.expense_enabled ? ['업무비용 정산', terms.expense_terms] : null,
    terms.confidentiality_enabled ? ['비밀유지·개인정보 보호', terms.confidentiality_terms] : null,
    terms.handover_enabled ? ['업무 인수인계·조합 자산 반환', terms.handover_terms] : null,
    terms.work_rules_enabled ? ['적용 규정', terms.work_rules_terms] : null,
    terms.other_terms_enabled ? ['그 밖의 조건', terms.other_terms] : null
  ].filter(Boolean);
  const customRows = (Array.isArray(terms.custom_terms) ? terms.custom_terms : [])
    .filter((item) => asText(item?.title) && asText(item?.content))
    .map((item) => [item.title, item.content]);
  return `
    ${contractSectionHeading(2, '계약 기간과 업무')}<table><tbody>
      <tr><th>근로 형태</th><td>${escapeHtml(employmentTypeLabel(terms.employment_type, terms.contract_format_version))}${terms.work_time_basis ? ` · ${terms.work_time_basis === 'part_time' ? '시간제' : '전일제'}` : ''}</td></tr>
      <tr><th>근로계약 기간</th><td>${escapeHtml(period)}</td></tr>
      <tr><th>근무 장소</th><td>${escapeHtml(terms.workplace || '-')}</td></tr>
      <tr><th>담당 업무</th><td>${escapeHtml(terms.duties || '-')}</td></tr>
    </tbody></table>
    ${contractSectionHeading(3, '근로시간·휴일·휴가')}<table><tbody>
      <tr><th>근무일</th><td>${escapeHtml(terms.work_days || '-')} · 주 ${escapeHtml(terms.work_days_per_week || '-')}일</td></tr>
      <tr><th>소정근로시간</th><td>1일 ${escapeHtml(terms.daily_work_hours || '-')}시간 · 1주 ${escapeHtml(terms.weekly_work_hours || '-')}시간${terms.work_schedule_type === 'flexible' ? '' : ` · ${escapeHtml(terms.work_start_time || '-')}부터 ${escapeHtml(terms.work_end_time || '-')}까지`}</td></tr>
      ${terms.work_schedule_type === 'flexible' ? `<tr><th>근무·휴게시간</th><td>${multilineHtml(terms.work_schedule_terms)}</td></tr>` : `<tr><th>휴게시간</th><td>${escapeHtml(terms.break_start_time || '-')}부터 ${escapeHtml(terms.break_end_time || '-')}까지</td></tr>`}
      ${terms.employment_type === 'part_time' || terms.work_time_basis === 'part_time' ? `<tr><th>요일별 근로시간</th><td>${multilineHtml(terms.part_time_schedule)}</td></tr>` : ''}
      <tr><th>주휴일</th><td>${escapeHtml(terms.weekly_holiday || '-')}</td></tr>
      <tr><th>그 밖의 휴일</th><td>${multilineHtml(terms.holiday_terms)}</td></tr>
      <tr><th>연차유급휴가</th><td>${multilineHtml(terms.annual_leave)}</td></tr>
    </tbody></table>
    ${contractSectionHeading(4, '임금')}<table><tbody>
      ${!terms.wage_from_parts || terms.wage_basis !== 'monthly' ? `<tr><th>${escapeHtml(terms.wage_from_parts && terms.wage_basis === 'annual' ? '연 고정 지급액 합계' : wageBasisLabel(terms.wage_basis))}</th><td><span class="wage-highlight">${formatMoney(terms.wage_amount)}원</span></td></tr>` : ''}${terms.wage_from_parts && terms.wage_basis === 'annual' && terms.bonus_enabled && Number(terms.monthly_bonus_amount) > 0 ? `<tr><th>연봉에 포함된 고정 상여금</th><td class="num-val">${formatMoney(Number(terms.monthly_bonus_amount) * 12)}원</td></tr>` : ''}
      ${monthlyItems.map(([label, amount]) => `<tr><th>${escapeHtml(label)}</th><td class="num-val">${formatMoney(amount)}원</td></tr>`).join('')}
      ${monthlyItems.length ? `<tr><th>월 고정 지급액 합계</th><td><span class="wage-highlight">${formatMoney(monthlyTotal)}원</span></td></tr>` : ''}
      <tr><th>구성·계산 기준</th><td>${multilineHtml(wageCalculationWithoutNonTax(terms))}</td></tr>${terms.non_tax_terms ? `<tr><th>계약상 비과세 항목</th><td>${multilineHtml(terms.non_tax_terms)}</td></tr>` : ''}
      <tr><th>지급일과 방법</th><td>${escapeHtml(terms.pay_day || '-')} · ${escapeHtml(terms.payment_method || '-')}</td></tr>
    </tbody></table>
    ${contractSectionHeading(5, '사회보험')}<table><tbody>
      <tr><th>적용 보험</th><td>${escapeHtml(insurance.length ? insurance.join(' · ') : '적용 보험 없음')}</td></tr>
      ${terms.social_insurance_note ? `<tr><th>적용 제외·참고</th><td>${multilineHtml(terms.social_insurance_note)}</td></tr>` : ''}
    </tbody></table>
    ${optionalRows.length || customRows.length ? `${contractSectionHeading(6, '그 밖의 근로조건')}<table><tbody>${[...optionalRows, ...customRows].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${multilineHtml(value)}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

function renderAmendmentDocumentBody(terms) {
  const hasReason = Boolean(asText(terms.change_reason));
  return `
    ${contractSectionHeading(2, '변경되는 근로조건')}
    <table class="change-table"><thead><tr><th style="width:20%">변경 항목</th><th style="width:40%">변경 전</th><th style="width:40%">변경 후</th></tr></thead><tbody>
      ${(terms.changes || []).map((item) => `<tr><td>${escapeHtml(item.field)}</td><td>${multilineHtml(item.before)}</td><td>${multilineHtml(item.after)}</td></tr>`).join('') || '<tr><td colspan="3">기록된 변경 항목이 없습니다.</td></tr>'}
    </tbody></table>
    ${hasReason ? `${contractSectionHeading(3, '변경 사유 및 참고')}<table><tbody><tr><th>변경 사유</th><td>${multilineHtml(terms.change_reason)}</td></tr></tbody></table>` : ''}
    ${contractSectionHeading(hasReason ? 4 : 3, '변경하지 않은 근로조건')}
    <table><tbody><tr><th>기준 계약 유지</th><td>이 문서에서 변경하지 않은 근로조건은 ${escapeHtml(terms.company_name || '조합')} 및 ${escapeHtml(terms.employee_name || '근로자')}가 체결한 기준 계약서의 내용이 그대로 적용됩니다.</td></tr></tbody></table>`;
}

function renderLegacyContractDocument(contract) {
  const terms = contract.terms || {};
  const amendment = contract.document_kind === 'amendment';
  const period = terms.indefinite_term !== false
    ? `${formatDate(terms.contract_start_date)}부터 기간을 정하지 않음`
    : `${formatDate(terms.contract_start_date)}부터 ${formatDate(terms.contract_end_date)}까지`;
  const body = amendment ? `
    <p class="contract-lead">사용자와 직원은 기존 근로계약의 근로조건 중 다음 사항을 변경하기로 합의합니다.</p>
    <table class="change-table"><thead><tr><th style="width:22%">변경 항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>
      ${(terms.changes || []).map((item) => `<tr><td>${escapeHtml(item.field)}</td><td>${escapeHtml(item.before || '-')}</td><td>${escapeHtml(item.after)}</td></tr>`).join('') || '<tr><td colspan="3">기록된 변경 항목이 없습니다.</td></tr>'}
    </tbody></table>
    ${terms.change_reason ? `<h2>변경 사유 및 참고</h2><p>${escapeHtml(terms.change_reason).replace(/\n/g, '<br>')}</p>` : ''}
    <h2>기존 조건의 유지</h2><p>이 합의서에서 변경한 사항을 제외한 기존 근로계약의 나머지 조건은 그대로 유지됩니다.</p>` : `
    <table><tbody>
      <tr><th>근로계약 기간</th><td>${escapeHtml(period)}</td></tr>
      <tr><th>근무 장소</th><td>${escapeHtml(terms.workplace || '-')}</td></tr>
      <tr><th>담당 업무</th><td>${escapeHtml(terms.duties || '-')}</td></tr>
      <tr><th>근무일</th><td>${escapeHtml(terms.work_days || '-')}</td></tr>
      <tr><th>근로시간</th><td>${escapeHtml(terms.work_start_time || '-')}부터 ${escapeHtml(terms.work_end_time || '-')}까지</td></tr>
      <tr><th>휴게시간</th><td>${escapeHtml(terms.break_start_time || '-')}부터 ${escapeHtml(terms.break_end_time || '-')}까지</td></tr>
      <tr><th>주휴일</th><td>${escapeHtml(terms.weekly_holiday || '-')}</td></tr>
      <tr><th>연봉 총액</th><td><span class="wage-highlight">${formatMoney(terms.annual_salary)}원</span></td></tr>
      <tr><th>임금 구성</th><td>${escapeHtml(terms.wage_components || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>지급일·방법</th><td>${escapeHtml(terms.pay_day || '-')} · ${escapeHtml(terms.payment_method || '-')}</td></tr>
      <tr><th>연차유급휴가</th><td>${escapeHtml(terms.annual_leave || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>사회보험</th><td>${escapeHtml(terms.social_insurance || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>그 밖의 조건</th><td>${escapeHtml(terms.other_terms || '-').replace(/\n/g, '<br>')}</td></tr>
    </tbody></table>`;
  const employerState = contract.employer_signed_at
    ? `<strong>${escapeHtml(contract.employer_signer_name || terms.employer_name || '사용자 측 관리자')}</strong><br>전자 확인 ${escapeHtml(formatDateTime(contract.employer_signed_at))}`
    : '전자 확인 전';
  const employeeState = contract.employee_signed_at
    ? `<strong>${escapeHtml(contract.employee_signer_name || terms.employee_name || '직원')}</strong><br>전자 확인 ${escapeHtml(formatDateTime(contract.employee_signed_at))}`
    : (contract.source_type === 'upload' ? '외부 서명 원본 참조' : '전자 확인 전');
  return `<article class="document-paper" data-contract-document>
    <header class="contract-doc-header">
      <div>
        <div class="contract-doc-kicker">${amendment ? 'EMPLOYMENT AMENDMENT' : 'EMPLOYMENT CONTRACT'}</div>
        <h1>${escapeHtml(contract.title || kindLabel(contract.document_kind))}</h1>
      </div>
      <div class="contract-doc-meta">
        <div>적용일 <strong>${escapeHtml(formatDate(contract.effective_date))}</strong></div>
        <div>${escapeHtml(contractHeaderBadgeText(contract))}</div>
      </div>
    </header>
    <p class="contract-lead"><strong>${escapeHtml(terms.company_name || '')}</strong>(이하 “사용자”)와 <strong>${escapeHtml(terms.employee_name || '')}</strong>(이하 “직원”)은 다음과 같이 근로조건을 정하고 이를 성실히 이행하기로 합니다.</p>
    ${body}
    <p class="mt-3">이 문서는 양 당사자가 내용을 확인할 수 있도록 같은 내용으로 보관합니다.</p>
    <div class="contract-effective-date">${escapeHtml(formatDate(contract.effective_date))}</div>
    <div class="signature-grid">
      <div class="signature-box">
        <div class="signature-box-head">사용자</div>
        <div class="signature-box-body">
          <div>
            <div class="signature-box-org">${escapeHtml(terms.company_name || '-')}</div>
            ${terms.company_address ? `<div class="signature-box-sub">${escapeHtml(terms.company_address)}</div>` : ''}
            <div>대표자 ${escapeHtml(terms.employer_name || '-')}</div>
          </div>
          <div class="signature-box-state">${employerState}</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-box-head">직원</div>
        <div class="signature-box-body">
          <div>
            <div class="signature-box-org">${escapeHtml(terms.employee_name || '-')}</div>
            ${terms.employee_address ? `<div class="signature-box-sub">${escapeHtml(terms.employee_address)}</div>` : ''}
          </div>
          <div class="signature-box-state">${employeeState}</div>
        </div>
      </div>
    </div>
    ${renderIntegrityNotice(contract)}
  </article>`;
}

async function signContract(id, role, button) {
  if (state.busy) return;
  const message = role === 'employee'
    ? '계약 내용을 모두 확인했으며 전자 서명하시겠습니까? 확인 뒤에는 내용을 수정할 수 없습니다.'
    : '사용자 측에서 이 계약 내용을 확인하시겠습니까? 확인 뒤에는 내용을 수정할 수 없습니다.';
  if (!(await window.CoopDialog.confirm(message))) return;
  try {
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const { data, error } = await db.rpc('erp_sign_employment_contract', { p_contract_id: id, p_signer_role: role });
    if (error) throw error;
    await loadContracts();
    openContract((Array.isArray(data) ? data[0] : data)?.id || id, { afterSave: true });
    showAlert('전자 확인을 기록했습니다. 양쪽 확인이 모두 끝나면 계약이 완료됩니다.');
  } catch (error) {
    console.error('[employment_contracts] sign failed', error);
    showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

function contractOutputState(contract) {
  if (window.ExpoRuntimeBridge) return 'DEMO';
  if (contract.status === 'completed' && asText(contract.content_hash)) return 'COMPLETED';
  if (contract.status === 'awaiting_signatures') return 'SIGNING';
  return 'DRAFT';
}

function contractVerificationCode(contract) {
  const hash = asText(contract.content_hash).replace(/[^0-9a-f]/gi, '').toUpperCase();
  return hash ? hash.slice(0, 20) : 'NOT-FINAL';
}

function renderIntegrityNotice(contract) {
  if (window.ExpoRuntimeBridge) return '<div class="integrity-note"><strong>🌱 박람회 시연용 예시 문서</strong> · 체험용 가상 정보로 작성한 문서입니다.</div>';
  const hash = asText(contract.content_hash);
  if (!hash) {
    return '<div class="integrity-note"><strong>미확정 문서 안내</strong> · 전자 확인 완료 전 문서입니다. 확정 계약서는 ERP에 보관된 완료본과 대조하세요.</div>';
  }
  return `<div class="hash-note"><strong>문서 확인정보</strong> · 전자 확인 문서 식별값: <span class="hash-code">${escapeHtml(hash)}</span><br>ERP에 보관된 완료본과 대조하세요.</div>`;
}

function addPdfOutputMarks(pdf, contract) {
  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const outputState = contractOutputState(contract);
  const verificationCode = contractVerificationCode(contract);
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`DOC ${verificationCode} | ${outputState}`, 12, pageHeight - 7);
    pdf.text(`${page} / ${totalPages}`, pageWidth - 21, pageHeight - 7);
    if (outputState !== 'COMPLETED') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(44);
      pdf.setTextColor(225, 228, 233);
      pdf.text(outputState, pageWidth / 2, pageHeight / 2, { align: 'center', angle: 42 });
    }
  }
}

async function buildContractPdf(contract, current) {
  await window.ErpWorkflowAssets.load('contractPdf').catch(() => {throw new Error('PDF 생성 기능을 불러오지 못했습니다. 다시 시도해 주세요.');});
  if (!current()) return null;
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:-100000px;top:0;width:186mm;background:#fff;z-index:-1;';
  root.innerHTML = renderContractDocument(contract);
  const paper = root.querySelector('[data-contract-document]');
  if (!paper) throw new Error('출력할 계약서 내용을 만들지 못했습니다.');
  paper.classList.add('pdf-export-paper');
  document.body.appendChild(root);
  try {
    const worker = window.html2pdf().set({
      margin: [12, 12, 18, 12],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.signature-grid', '.signature-box', '.page-break-avoid', '.hash-note', '.integrity-note', '.contract-doc-header'] }
    }).from(paper).toPdf();
    const pdf = await worker.get('pdf');
    addPdfOutputMarks(pdf, contract);
    return pdf;
  } finally {
    root.remove();
  }
}

function warmContractPdfTool(){void window.ErpWorkflowAssets.load('contractPdf').catch(()=>{});}

async function printContract(contract, button) {
  if (state.busy) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return showAlert('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.');
  printWindow.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>계약서 인쇄 준비</title></head><body style="font-family:sans-serif;padding:32px">쪽번호와 문서 확인정보를 넣어 인쇄 문서를 준비하고 있습니다.</body></html>');
  printWindow.document.close();
  const current = contractOutputCurrent(button);
  try {
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const pdf = await buildContractPdf(contract, () => current() && !printWindow.closed);
    if (!pdf || !current() || printWindow.closed) {printWindow.close();return;}
    const blobUrl = URL.createObjectURL(pdf.output('blob'));
    let printStarted = false;
    const startPrint = () => {
      if (printStarted) return;
      if (!current() || printWindow.closed) {
        printStarted = true;URL.revokeObjectURL(blobUrl);printWindow.close();return;
      }
      printStarted = true;
      try {
        printWindow.focus();
        printWindow.print();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      }
    };
    printWindow.onload = () => window.setTimeout(startPrint, 350);
    printWindow.location.replace(blobUrl);
    window.setTimeout(startPrint, 1800);
  } catch (error) {
    printWindow.close();
    console.error('[employment_contracts] print failed', error);
    if (current()) showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

function contractOutputCurrent(button) {
  const scope=contractReadScope(),detail=state.detailRevision;
  return () => !!button?.isConnected && scope===contractReadScope() && detail===state.detailRevision && !window.frameElement?.hidden;
}

async function downloadContractPdf(contract, button) {
  if (state.busy) return;
  const current=contractOutputCurrent(button);
  try {
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const fileName = sanitizeFileName(`${contract.title || kindLabel(contract.document_kind)}_${contract.terms?.employee_name || '근로자'}_${contract.effective_date || todayKst()}.pdf`);
    const pdf = await buildContractPdf(contract, current);
    if (pdf && current()) pdf.save(fileName);
  } catch (error) {
    console.error('[employment_contracts] pdf download failed', error);
    if (current()) showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

async function openStoredFile(path) {
  const safePath = asText(path);
  if (!safePath) return showAlert('계약서 파일을 찾을 수 없습니다.');
  const revision = ++state.attachmentRevision;
  const owner = {empId:state.employee?.emp_id,coopId:state.user?.coop_id,userId:state.user?.auth_user_id || state.user?.emp_id,
    detailRevision:state.detailRevision,editing:state.editing};
  const current = () => revision === state.attachmentRevision && owner.detailRevision === state.detailRevision && owner.editing === state.editing
    && owner.empId === state.employee?.emp_id && owner.coopId === state.user?.coop_id
    && owner.userId === (state.user?.auth_user_id || state.user?.emp_id) && !window.frameElement?.hidden;
  try {
    let url = safePath.startsWith('https://') ? safePath : '';
    if (!url) {
      const { data, error } = await db.storage.from('contracts').createSignedUrl(safePath, 3600);
      if (error) throw error;
      url = data?.signedUrl || '';
    }
    if (!/^https:\/\//i.test(url)) throw new Error('안전한 열람 주소를 만들지 못했습니다.');
    if (!current()) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('[employment_contracts] file open failed', {code:error?.code || error?.status || 'READ_FAILED'});
    if (current()) showAlert('계약서 파일을 열지 못했습니다. 다시 눌러 확인해 주세요.');
  }
}

function sanitizeFileName(name) {
  return asText(name, 'contract').replace(/[^0-9A-Za-z가-힣._-]+/g, '_').slice(-120);
}

function fileExtension(file) {
  const typeMap = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
  return typeMap[file?.type] || asText(file?.name).split('.').pop().toLowerCase();
}

function openUpload() {
  if (state.busy || !state.admin || state.forceSelf || !state.contractsLoaded || !state.employee) return;
  requestContractTransition(async () => {
    const owner = contractReadOwner();
    try {
      if (!await loadContractDefaults(owner) || !owner.isCurrent()) return;
      state.editing = { emp_id: state.employee.emp_id, source_type: 'upload', terms: defaultTerms() };
      state.uploadAttempt = null;
      state.customTerms = [];
      document.getElementById('workspace').innerHTML = `<div class="d-flex justify-content-between gap-3 flex-wrap mb-4"><h2 class="h4 fw-bold">외부 작성 계약서 등록</h2><button type="button" class="btn btn-primary" id="saveUploadContractButton">등록</button></div><div class="section-card"><h3 class="section-title">원본 파일</h3><div class="row g-3"><div class="col-md-8"><label class="form-label required" for="contractTitle">문서 제목</label><input class="form-control" id="contractTitle" maxlength="200" value="${escapeHtml(state.employee.emp_name)} 외부 작성 근로계약서"></div><div class="col-md-4"><label class="form-label required" for="effectiveDate">적용일</label><input type="date" class="form-control" id="effectiveDate" value="${todayKst()}"></div><div class="col-md-4"><label class="form-label" for="uploadDocumentKind">문서 종류</label><select class="form-select" id="uploadDocumentKind"><option value="uploaded">외부 작성 계약서</option><option value="initial">근로계약서</option><option value="amendment">근로조건 변경합의서</option><option value="consolidated">통합 근로계약서</option></select></div><div class="col-md-8"><label class="form-label required" for="uploadSourceFile">서명한 계약서</label><input type="file" class="form-control" id="uploadSourceFile" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"><div class="form-text">PDF·JPG·PNG, 최대 20MB</div></div></div></div>${renderFullContractEditor(state.editing.terms)}<div class="section-card"><label class="form-check"><input type="checkbox" class="form-check-input" id="uploadTermsConfirmed"><span class="form-check-label">서명한 원본과 입력한 근로조건이 일치함을 확인했습니다.</span></label></div>`;
      bindEditorEvents();
      document.getElementById('saveUploadContractButton').addEventListener('click', registerUpload);
      state.editorBaseline = contractEditorSnapshot();
      state.previewDirty = false;
    } catch (error) { if (owner.isCurrent()) showAlert(normalizeError(error)); }
  });
}

async function registerUpload(event) {
  if (state.busy) return;
  const button = event.currentTarget;
  const file = document.getElementById('uploadSourceFile')?.files[0];
  let storagePath = '';
  let uploaded = false;
  try {
    if (!state.admin || state.forceSelf || state.editing?.source_type !== 'upload' || state.editing.emp_id !== state.employee?.emp_id) throw new Error('HR_ADMIN_REQUIRED');
    validateContractEditorInputs();
    const title = requireField(inputValue('contractTitle'), '문서 제목');
    const kind = inputValue('uploadDocumentKind');
    const effective = requireField(inputValue('effectiveDate'), '적용일');
    const terms = collectFullTerms(state.editing.terms);
    if (!isChecked('uploadTermsConfirmed')) throw contractInputError('uploadTermsConfirmed','원본과 입력한 근로조건이 일치하는지 확인해 주세요.');
    if (!file) throw contractInputError('uploadSourceFile','계약서 파일을 선택해 주세요.');
    const ext = fileExtension(file);
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) throw new Error('PDF·JPG·PNG 파일만 등록할 수 있습니다.');
    if (file.size > 20 * 1024 * 1024) throw new Error('파일은 20MB 이하로 등록해 주세요.');
    const coopId = asText(state.user?.coop_id);
    const employeeId=state.employee.emp_id, uploadOwner=contractReadOwner();
    const entropy = window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
    const fingerprint = contractEditorSnapshot();
    const prior = state.uploadAttempt;
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const {error:minimumError}=await db.rpc('erp_check_contract_minimum_wage',{p_terms:terms,p_effective_date:effective});
    if(!uploadOwner.isCurrent()||document.getElementById('uploadSourceFile')?.files[0]!==file)return;
    if(minimumError)throw minimumError;
    storagePath = prior?.file === file && prior.fingerprint === fingerprint ? prior.path : `${coopId}/${state.employee.emp_id}_contract_${Date.now()}_${entropy}.${ext === 'jpeg' ? 'jpg' : ext}`;
    uploaded = Boolean(prior?.file === file && prior.fingerprint === fingerprint && prior.uploaded);
    state.uploadAttempt = {file,fingerprint,path:storagePath,uploaded};
    if (!uploaded) {
    const { error: uploadError } = await db.storage.from('contracts').upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: '3600'
    });
    if (uploadError) throw uploadError;
    uploaded = true;
    state.uploadAttempt.uploaded = true;
    }
    const { data, error } = await db.rpc('erp_register_uploaded_employment_contract_terms', {
      p_emp_id: employeeId,
      p_title: title,
      p_effective_date: effective,
      p_file_path: storagePath,
      p_original_file_name: sanitizeFileName(file.name),
      p_document_kind: kind,
      p_terms: terms
    });
    if (error) throw error;
    resetContractEditTracking();
    state.editing = null;
    state.uploadAttempt = null;
    await loadContracts();
    openContract((Array.isArray(data) ? data[0] : data)?.id, { afterSave: true });
    showAlert('외부 작성 계약서를 새 이력으로 등록했습니다. 기존 계약서는 그대로 보존됩니다.');
  } catch (error) {
    // A response lost after commit is not proof that registration failed: retain its original.
    if(state.busy)setBusy(false,button);
    if (!showContractInputErrors(contractWageCheckError(error))) {
      console.error('[employment_contracts] upload failed', error);
      showAlert(normalizeError(error));
    }
  } finally {
    if(state.busy)setBusy(false,button);
  }
}

function observeContractAttachmentContext() {
  const invalidateReads = () => { state.attachmentRevision++; state.detailRevision++; contractReadVisit++; };
  window.addEventListener('pagehide', invalidateReads);
  // Inspect oldValue as well: a hide/show in one task still ends the old visit.
  if (window.frameElement) new MutationObserver((records) => {
    state.attachmentRevision++;
    if (window.frameElement.hidden || records.some(record => record.oldValue === null)) {
      state.detailRevision++; contractReadVisit++;
    }
  }).observe(window.frameElement, {attributes:true,attributeOldValue:true,attributeFilter:['hidden']});
}

async function boot() {
  observeContractAttachmentContext();
  alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
  uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
  discardModal = new bootstrap.Modal(document.getElementById('unsavedContractModal'));
  document.getElementById('discardContractButton').addEventListener('click', () => {
    contractDiscardConfirmed = true;
    discardModal.hide();
  });
  document.getElementById('unsavedContractModal').addEventListener('hidden.bs.modal', () => {
    finishContractTransition(contractDiscardConfirmed);
    contractDiscardConfirmed = false;
  });
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedContractChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  try {
    const gate = await window.ErpRuntimeGuard.requireUser(db, {
      alertFn: showAlert,
      redirectUrl: 'index.html'
    });
    if (!gate.ok) return;
    state.user = gate.user;
    state.permissions = await loadPermissions(state.user);
    state.admin = state.permissions.has('hr.admin') || getRoleFallback(state.user);
    const moduleKey = state.admin && !state.forceSelf ? 'hr' : 'mypage';
    const runtime = await window.ErpRuntimeGuard.enforce(db, {
      moduleKey,
      moduleLabel: moduleKey === 'hr' ? '직원관리' : '마이페이지',
      alertFn: showAlert,
      redirectUrl: 'index.html'
    });
    if (!runtime.ok) return;
    await loadEmployees();
    renderEmployeeSelect();
    if (bindInitialContractEmployee()) return;
    await loadContracts();
    document.getElementById('backButton').textContent = state.admin && !state.forceSelf ? '직원관리로' : '마이페이지로';
    document.getElementById('backButton').addEventListener('click', returnToContractOwner);
    document.getElementById('contractHomeButton').addEventListener('click', () => requestContractTransition(() => { resetContractEditTracking(); location.href = 'index.html'; }));
    document.getElementById('employeeSelect').addEventListener('change', (event) => switchContractEmployee(event.target));
    document.querySelectorAll('[data-new-kind]').forEach((button) => button.addEventListener('click', () => openNew(button.dataset.newKind)));
    document.getElementById('openUploadButton').addEventListener('click', openUpload);
    document.getElementById('registerUploadButton').addEventListener('click', registerUpload);
    document.getElementById('refreshButton').addEventListener('click', loadContracts);
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    if (!state.contracts.length) emptyWorkspace(state.admin && !state.forceSelf ? '새 계약서를 작성하거나 외부 계약서를 등록해 주세요' : '확인할 근로계약서가 없습니다');
    showContractTask();
    window.ErpWorkspaceResume.register({modules:[moduleKey],busy:()=>state.busy,refresh:loadContracts});
  } catch (error) {
    console.error('[employment_contracts] boot failed', error);
    showAlert(`근로계약서 화면을 준비하지 못했습니다.\n${normalizeError(error)}`);
  }
}

window.addEventListener('DOMContentLoaded', boot);
