/* Version: v1.0.0 | 2026-09-28 */
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
  company: {},
  editing: null,
  amendmentItems: [],
  busy: false
};

let alertModal;
let uploadModal;

const selectContractColumns = [
  'id', 'coop_id', 'emp_id', 'document_kind', 'source_type', 'title', 'version_no',
  'parent_contract_id', 'status', 'effective_date', 'terms', 'file_path', 'original_file_name',
  'content_hash', 'employer_signed_at', 'employer_signer_name', 'employee_signed_at',
  'employee_signer_name', 'completed_at', 'created_at', 'updated_at'
].join(',');

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

function setBusy(next, button) {
  state.busy = next;
  document.querySelectorAll('button, input, select, textarea').forEach((element) => {
    if (element.closest('#alertModal')) return;
    if (next) {
      element.dataset.contractWasDisabled = element.disabled ? '1' : '0';
      element.disabled = true;
    } else if (element.dataset.contractWasDisabled !== '1') {
      element.disabled = false;
    }
    if (!next) delete element.dataset.contractWasDisabled;
  });
  if (button) button.textContent = next ? '처리 중...' : (button.dataset.label || button.textContent);
}

function normalizeError(error) {
  const raw = String(error?.message || error || '처리하지 못했습니다.');
  const map = {
    HR_ADMIN_REQUIRED: '근로계약서를 관리할 권한이 없습니다.',
    EMPLOYEE_NOT_FOUND: '직원 정보를 찾을 수 없습니다.',
    PARENT_CONTRACT_REQUIRED: '변경합의서의 기준이 되는 완료 계약서를 선택해 주세요.',
    VALID_PARENT_CONTRACT_REQUIRED: '선택한 기준 계약서를 사용할 수 없습니다.',
    ONLY_EDITOR_DRAFT_CAN_BE_UPDATED: '전자 확인을 요청한 문서는 수정할 수 없습니다.',
    CONTRACT_NOT_AWAITING_SIGNATURES: '전자 확인을 기다리는 문서가 아닙니다.',
    CONTRACT_CONTENT_CHANGED: '전자 확인 요청 뒤 문서 내용이 달라졌습니다. 새 초안으로 다시 작성해 주세요.',
    EMPLOYEE_SIGNATURE_REQUIRED: '이 계약의 직원 본인만 확인할 수 있습니다.'
  };
  const key = Object.keys(map).find((item) => raw.includes(item));
  return key ? map[key] : raw;
}

function getRoleFallback(user) {
  return ['admin', 'admin_all'].includes(String(user?.role || ''));
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
    const value = asText(state.company[key]);
    if (value) return value;
  }
  return '';
}

async function loadCompany() {
  state.company = {};
  const coopId = asText(state.user?.coop_id);
  if (!coopId) return;
  const { data, error } = await db.from('ref_company_info').select('key,value').eq('coop_id', coopId);
  if (error) throw error;
  (data || []).forEach((row) => { state.company[row.key] = row.value; });
}

async function loadEmployees() {
  if (!state.admin || state.forceSelf) {
    const { data, error } = await db.from('ref_employees')
      .select('emp_id,emp_name,display_emp_no,position,department,address,hire_date,base_salary,contract_url,coop_id,is_active,resign_date')
      .eq('emp_id', state.user.emp_id)
      .eq('coop_id', state.user.coop_id)
      .maybeSingle();
    if (error) throw error;
    state.employees = data ? [data] : [];
    state.employee = state.employees[0];
    return;
  }

  const { data, error } = await db.from('ref_employees')
    .select('emp_id,emp_name,display_emp_no,position,department,address,hire_date,base_salary,contract_url,coop_id,is_active,resign_date')
    .eq('coop_id', state.user.coop_id)
    .order('is_active', { ascending: false })
    .order('emp_name', { ascending: true });
  if (error) throw error;
  state.employees = data || [];
  const requested = sessionStorage.getItem('erp_contract_employee_id');
  sessionStorage.removeItem('erp_contract_employee_id');
  state.employee = state.employees.find((employee) => employee.emp_id === requested) || state.employees[0] || null;
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

async function loadContracts() {
  if (!state.employee) {
    state.contracts = [];
    renderHistory();
    return;
  }
  const { data, error } = await db.from('erp_employment_contracts')
    .select(selectContractColumns)
    .eq('emp_id', state.employee.emp_id)
    .order('version_no', { ascending: false });
  if (error) throw error;
  state.contracts = data || [];
  renderHistory();
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
  heading.textContent = `${state.employee?.emp_name || '직원'} 계약 이력`;
  if (!state.contracts.length) {
    list.innerHTML = '<div class="small text-muted py-3">등록된 계약 이력이 없습니다.</div>';
  } else {
    list.innerHTML = state.contracts.map((contract) => `
      <button type="button" class="history-item w-100 text-start" data-contract-id="${escapeHtml(contract.id)}">
        <div class="d-flex justify-content-between gap-2 align-items-start">
          <span class="history-title">${escapeHtml(contract.title)}</span>
          <span class="status-pill status-${escapeHtml(contract.status)}">${escapeHtml(statusLabel(contract.status))}</span>
        </div>
        <div class="history-meta">v${contract.version_no} · ${escapeHtml(kindLabel(contract.document_kind))}<br>적용일 ${escapeHtml(formatDate(contract.effective_date))}</div>
      </button>`).join('');
    list.querySelectorAll('[data-contract-id]').forEach((button) => {
      button.addEventListener('click', () => openContract(button.dataset.contractId));
    });
  }

  const legacyPath = asText(state.employee?.contract_url);
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

function defaultTerms() {
  const employee = state.employee || {};
  return {
    company_name: companyValue('company_name', 'orgName') || '조합명 미설정',
    employer_name: companyValue('chairman_name', 'ceoName'),
    company_address: companyValue('company_address', 'address'),
    company_business_number: companyValue('bizNum', 'business_number'),
    employee_name: asText(employee.emp_name),
    employee_position: asText(employee.position),
    employee_address: asText(employee.address),
    contract_start_date: todayKst(),
    contract_end_date: '',
    indefinite_term: true,
    workplace: companyValue('company_address', 'address'),
    duties: '',
    work_days: '월요일부터 금요일까지',
    work_start_time: '09:00',
    work_end_time: '18:00',
    break_start_time: '12:00',
    break_end_time: '13:00',
    weekly_holiday: '일요일',
    annual_salary: Number(employee.base_salary || 0),
    wage_components: '연봉에 포함되는 기본급과 수당의 구성은 급여명세서에 따릅니다.',
    pay_day: '매월 10일',
    payment_method: '직원 본인 명의 계좌로 지급',
    annual_leave: '연차유급휴가는 관계 법령과 조합 규정에 따라 부여합니다.',
    social_insurance: '관계 법령에 따라 국민연금·건강보험·고용보험·산재보험을 적용합니다.',
    other_terms: '이 계약서에서 정하지 않은 사항은 관계 법령, 정관 및 조합 규정에 따릅니다.',
    change_reason: '',
    changes: []
  };
}

function openNew(kind) {
  if (!state.admin || state.forceSelf || !state.employee) return;
  const terms = defaultTerms();
  state.editing = {
    id: null,
    document_kind: kind,
    title: kind === 'amendment' ? `${state.employee.emp_name} 근로조건 변경합의서` : `${state.employee.emp_name} ${kindLabel(kind)}`,
    effective_date: todayKst(),
    parent_contract_id: null,
    terms
  };
  state.amendmentItems = kind === 'amendment' ? [{ field: '연봉', before: formatMoney(state.employee.base_salary), after: '' }] : [];
  renderEditor();
}

function inputValue(id) {
  return asText(document.getElementById(id)?.value);
}

function renderParentOptions(selected) {
  const options = state.contracts.filter((contract) => contract.status === 'completed');
  return '<option value="">기준 계약서를 선택해 주세요</option>' + options.map((contract) =>
    `<option value="${escapeHtml(contract.id)}" ${contract.id === selected ? 'selected' : ''}>v${contract.version_no} · ${escapeHtml(contract.title)} · ${escapeHtml(formatDate(contract.effective_date))}</option>`
  ).join('');
}

function renderEditor() {
  const contract = state.editing;
  const terms = contract.terms || defaultTerms();
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
        ${amendment ? `<div class="col-12"><label class="form-label required" for="parentContract">기준 계약서</label><select class="form-select" id="parentContract">${renderParentOptions(contract.parent_contract_id)}</select><div class="form-text">완료된 기존 계약서에 어떤 변경을 더하는지 연결합니다.</div></div>` : ''}
        <div class="col-md-6"><label class="form-label">사용자</label><div class="readonly-box">${escapeHtml(terms.company_name)} · ${escapeHtml(terms.employer_name || '대표자 미설정')}</div></div>
        <div class="col-md-6"><label class="form-label">직원</label><div class="readonly-box">${escapeHtml(terms.employee_name)} · ${escapeHtml(terms.employee_position || '직위 미설정')}</div></div>
      </div>
    </div>
    ${amendment ? renderAmendmentEditor(terms) : renderFullContractEditor(terms)}
    <div class="section-card">
      <h3 class="section-title">확인</h3>
      <div class="alert alert-light border mb-0 small">전자 확인을 요청하면 문서 내용이 고정됩니다. 직원과 사용자 측 관리자가 모두 확인한 뒤 완료 문서가 됩니다. 급여대장에 쓰는 연봉 정보는 이 문서만으로 자동 변경하지 않으므로, 실제 급여가 바뀌면 직원관리의 연봉 적용일도 함께 확인해 주세요.</div>
    </div>`;
  bindEditorEvents();
}

function renderFullContractEditor(terms) {
  return `
    <div class="section-card">
      <h3 class="section-title">계약 기간과 업무</h3>
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label required" for="contractStart">근로 시작일</label><input type="date" class="form-control" id="contractStart" value="${escapeHtml(terms.contract_start_date)}"></div>
        <div class="col-md-4"><label class="form-label" for="contractEnd">근로 종료일</label><input type="date" class="form-control" id="contractEnd" value="${escapeHtml(terms.contract_end_date)}"></div>
        <div class="col-md-4 d-flex align-items-end"><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="indefiniteTerm" ${terms.indefinite_term !== false ? 'checked' : ''}><label class="form-check-label" for="indefiniteTerm">기간을 정하지 않은 계약</label></div></div>
        <div class="col-md-6"><label class="form-label required" for="workplace">근무 장소</label><input class="form-control" id="workplace" maxlength="300" value="${escapeHtml(terms.workplace)}"></div>
        <div class="col-md-6"><label class="form-label required" for="duties">담당 업무</label><input class="form-control" id="duties" maxlength="300" value="${escapeHtml(terms.duties)}" placeholder="예: 조합 사무국 운영 및 행정 업무"></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">근로시간과 휴일</h3>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label required" for="workDays">근무일</label><input class="form-control" id="workDays" maxlength="200" value="${escapeHtml(terms.work_days)}"></div>
        <div class="col-md-3"><label class="form-label required" for="workStart">시작 시간</label><input type="time" class="form-control" id="workStart" value="${escapeHtml(terms.work_start_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="workEnd">종료 시간</label><input type="time" class="form-control" id="workEnd" value="${escapeHtml(terms.work_end_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="breakStart">휴게 시작</label><input type="time" class="form-control" id="breakStart" value="${escapeHtml(terms.break_start_time)}"></div>
        <div class="col-md-3"><label class="form-label required" for="breakEnd">휴게 종료</label><input type="time" class="form-control" id="breakEnd" value="${escapeHtml(terms.break_end_time)}"></div>
        <div class="col-md-6"><label class="form-label required" for="weeklyHoliday">주휴일</label><input class="form-control" id="weeklyHoliday" maxlength="100" value="${escapeHtml(terms.weekly_holiday)}"></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">임금</h3>
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label required" for="annualSalary">연봉 총액</label><div class="input-group"><input type="number" min="0" step="1" class="form-control" id="annualSalary" value="${escapeHtml(terms.annual_salary)}"><span class="input-group-text">원</span></div></div>
        <div class="col-md-4"><label class="form-label required" for="payDay">지급일</label><input class="form-control" id="payDay" maxlength="100" value="${escapeHtml(terms.pay_day)}"></div>
        <div class="col-md-4"><label class="form-label required" for="paymentMethod">지급 방법</label><input class="form-control" id="paymentMethod" maxlength="200" value="${escapeHtml(terms.payment_method)}"></div>
        <div class="col-12"><label class="form-label required" for="wageComponents">임금 구성</label><textarea class="form-control" id="wageComponents" rows="3" maxlength="1500">${escapeHtml(terms.wage_components)}</textarea></div>
      </div>
    </div>
    <div class="section-card">
      <h3 class="section-title">휴가·보험·기타 조건</h3>
      <div class="row g-3">
        <div class="col-12"><label class="form-label required" for="annualLeave">연차유급휴가</label><textarea class="form-control" id="annualLeave" rows="2" maxlength="1500">${escapeHtml(terms.annual_leave)}</textarea></div>
        <div class="col-12"><label class="form-label required" for="socialInsurance">사회보험</label><textarea class="form-control" id="socialInsurance" rows="2" maxlength="1500">${escapeHtml(terms.social_insurance)}</textarea></div>
        <div class="col-12"><label class="form-label" for="otherTerms">그 밖의 조건</label><textarea class="form-control" id="otherTerms" rows="3" maxlength="3000">${escapeHtml(terms.other_terms)}</textarea></div>
      </div>
    </div>`;
}

function renderAmendmentEditor(terms) {
  return `
    <div class="section-card">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h3 class="section-title mb-0">변경 내용</h3><button type="button" class="btn btn-sm btn-outline-primary" id="addAmendmentButton">변경 항목 추가</button></div>
      <div class="small text-muted mb-2">바뀌는 항목만 적습니다. 여기에 적지 않은 기존 근로조건은 그대로 유지됩니다.</div>
      <div id="amendmentRows"></div>
      <label class="form-label mt-3" for="changeReason">변경 사유 또는 참고</label><textarea class="form-control" id="changeReason" rows="3" maxlength="1500">${escapeHtml(terms.change_reason)}</textarea>
    </div>`;
}

function renderAmendmentRows() {
  const container = document.getElementById('amendmentRows');
  if (!container) return;
  if (!state.amendmentItems.length) state.amendmentItems.push({ field: '', before: '', after: '' });
  container.innerHTML = state.amendmentItems.map((item, index) => `
    <div class="amendment-row" data-amendment-row="${index}">
      <div><label class="form-label">항목</label><input class="form-control" data-change-field maxlength="100" value="${escapeHtml(item.field)}" placeholder="예: 연봉"></div>
      <div><label class="form-label">변경 전</label><textarea class="form-control" data-change-before rows="2" maxlength="1000">${escapeHtml(item.before)}</textarea></div>
      <div><label class="form-label">변경 후</label><textarea class="form-control" data-change-after rows="2" maxlength="1000">${escapeHtml(item.after)}</textarea></div>
      <button type="button" class="btn btn-outline-danger mt-md-4" data-remove-change="${index}" aria-label="변경 항목 삭제"><i class="bi bi-trash"></i></button>
    </div>`).join('');
  container.querySelectorAll('[data-remove-change]').forEach((button) => {
    button.addEventListener('click', () => {
      collectAmendmentRows();
      state.amendmentItems.splice(Number(button.dataset.removeChange), 1);
      renderAmendmentRows();
    });
  });
}

function collectAmendmentRows() {
  const rows = Array.from(document.querySelectorAll('[data-amendment-row]'));
  state.amendmentItems = rows.map((row) => ({
    field: asText(row.querySelector('[data-change-field]')?.value),
    before: asText(row.querySelector('[data-change-before]')?.value),
    after: asText(row.querySelector('[data-change-after]')?.value)
  }));
  return state.amendmentItems.filter((item) => item.field || item.before || item.after);
}

function bindEditorEvents() {
  renderAmendmentRows();
  document.getElementById('addAmendmentButton')?.addEventListener('click', () => {
    collectAmendmentRows();
    state.amendmentItems.push({ field: '', before: '', after: '' });
    renderAmendmentRows();
  });
  document.getElementById('previewDraftButton').addEventListener('click', () => {
    try {
      const draft = collectEditorContract();
      renderPreview(draft, true);
    } catch (error) { showAlert(normalizeError(error)); }
  });
  document.getElementById('saveDraftButton').addEventListener('click', (event) => saveDraft(false, event.currentTarget));
  document.getElementById('submitDraftButton').addEventListener('click', (event) => saveDraft(true, event.currentTarget));
}

function requireField(value, label) {
  if (!asText(value)) throw new Error(`${label}을(를) 입력해 주세요.`);
  return asText(value);
}

function collectEditorContract() {
  const base = state.editing;
  const amendment = base.document_kind === 'amendment';
  const terms = { ...base.terms };
  terms.company_name = requireField(terms.company_name, '조합명');
  terms.employee_name = requireField(terms.employee_name, '직원 이름');
  if (amendment) {
    terms.change_reason = inputValue('changeReason');
    terms.changes = collectAmendmentRows();
    if (!terms.changes.length || terms.changes.some((item) => !item.field || !item.after)) {
      throw new Error('변경 항목과 변경 후 내용을 입력해 주세요.');
    }
  } else {
    terms.contract_start_date = requireField(inputValue('contractStart'), '근로 시작일');
    terms.contract_end_date = inputValue('contractEnd');
    terms.indefinite_term = document.getElementById('indefiniteTerm').checked;
    if (!terms.indefinite_term && !terms.contract_end_date) throw new Error('근로 종료일을 입력해 주세요.');
    terms.workplace = requireField(inputValue('workplace'), '근무 장소');
    terms.duties = requireField(inputValue('duties'), '담당 업무');
    terms.work_days = requireField(inputValue('workDays'), '근무일');
    terms.work_start_time = requireField(inputValue('workStart'), '근무 시작 시간');
    terms.work_end_time = requireField(inputValue('workEnd'), '근무 종료 시간');
    terms.break_start_time = requireField(inputValue('breakStart'), '휴게 시작 시간');
    terms.break_end_time = requireField(inputValue('breakEnd'), '휴게 종료 시간');
    if (terms.work_end_time <= terms.work_start_time) throw new Error('근무 종료 시간은 시작 시간보다 뒤여야 합니다.');
    if (terms.break_end_time <= terms.break_start_time) throw new Error('휴게 종료 시간은 시작 시간보다 뒤여야 합니다.');
    terms.weekly_holiday = requireField(inputValue('weeklyHoliday'), '주휴일');
    terms.annual_salary = Number(document.getElementById('annualSalary').value || 0);
    if (!Number.isFinite(terms.annual_salary) || terms.annual_salary < 0) throw new Error('연봉 총액을 확인해 주세요.');
    terms.wage_components = requireField(inputValue('wageComponents'), '임금 구성');
    terms.pay_day = requireField(inputValue('payDay'), '임금 지급일');
    terms.payment_method = requireField(inputValue('paymentMethod'), '임금 지급 방법');
    terms.annual_leave = requireField(inputValue('annualLeave'), '연차유급휴가');
    terms.social_insurance = requireField(inputValue('socialInsurance'), '사회보험');
    terms.other_terms = inputValue('otherTerms');
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
    if (submitAfter) {
      const { data: submitted, error: submitError } = await db.rpc('erp_submit_employment_contract', { p_contract_id: saved.id });
      if (submitError) throw submitError;
      await loadContracts();
      openContract((Array.isArray(submitted) ? submitted[0] : submitted)?.id || saved.id);
      showAlert('전자 확인을 요청했습니다. 직원은 마이페이지의 계약서 관리에서 내용을 확인할 수 있습니다.');
    } else {
      await loadContracts();
      openContract(saved.id);
      showAlert('초안을 저장했습니다.');
    }
  } catch (error) {
    console.error('[employment_contracts] save failed', error);
    showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

function openContract(id) {
  document.querySelectorAll('.history-item').forEach((element) => element.classList.toggle('active', element.dataset.contractId === id));
  const contract = state.contracts.find((item) => item.id === id);
  if (!contract) return emptyWorkspace('계약서를 찾을 수 없습니다');
  if (contract.status === 'draft' && state.admin && !state.forceSelf) {
    state.editing = JSON.parse(JSON.stringify(contract));
    state.amendmentItems = Array.isArray(contract.terms?.changes) ? contract.terms.changes.map((item) => ({ ...item })) : [];
    renderEditor();
    return;
  }
  renderPreview(contract, false);
}

function renderPreview(contract, unsaved) {
  const paper = contract.source_type === 'upload'
    ? `<div class="empty-state"><div class="fs-1 mb-3">📎</div><h3 class="h5 fw-bold">외부 작성 원본이 등록되어 있습니다</h3><p class="mb-1">${escapeHtml(contract.original_file_name || contract.title)}</p><p class="small text-muted mb-0">등록일 ${escapeHtml(formatDate(contract.created_at))} · 적용일 ${escapeHtml(formatDate(contract.effective_date))}</p></div>`
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
        ${contract.source_type !== 'upload' ? '<button type="button" class="btn btn-dark" id="printContractButton">인쇄·PDF 저장</button>' : ''}
      </div>
    </div>
    ${paper}`;
  document.getElementById('returnEditorButton')?.addEventListener('click', renderEditor);
  document.getElementById('openFileButton')?.addEventListener('click', () => openStoredFile(contract.file_path));
  document.getElementById('employerSignButton')?.addEventListener('click', (event) => signContract(contract.id, 'employer', event.currentTarget));
  document.getElementById('employeeSignButton')?.addEventListener('click', (event) => signContract(contract.id, 'employee', event.currentTarget));
  document.getElementById('printContractButton')?.addEventListener('click', () => printContract(contract));
}

function renderContractDocument(contract) {
  const terms = contract.terms || {};
  const amendment = contract.document_kind === 'amendment';
  const period = terms.indefinite_term !== false
    ? `${formatDate(terms.contract_start_date)}부터 기간을 정하지 않음`
    : `${formatDate(terms.contract_start_date)}부터 ${formatDate(terms.contract_end_date)}까지`;
  const body = amendment ? `
    <p>사용자와 직원은 기존 근로계약의 근로조건 중 다음 사항을 변경하기로 합의합니다.</p>
    <table><thead><tr><th style="width:22%">변경 항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>
      ${(terms.changes || []).map((item) => `<tr><td>${escapeHtml(item.field)}</td><td>${escapeHtml(item.before || '-')}</td><td>${escapeHtml(item.after)}</td></tr>`).join('') || '<tr><td colspan="3">기록된 변경 항목이 없습니다.</td></tr>'}
    </tbody></table>
    ${terms.change_reason ? `<h2>변경 사유 및 참고</h2><p>${escapeHtml(terms.change_reason).replace(/\n/g, '<br>')}</p>` : ''}
    <h2>기존 조건의 유지</h2><p>이 합의서에서 변경한 사항을 제외한 기존 근로계약의 나머지 조건은 그대로 유지됩니다.</p>` : `
    <table>
      <tr><th>근로계약 기간</th><td>${escapeHtml(period)}</td></tr>
      <tr><th>근무 장소</th><td>${escapeHtml(terms.workplace || '-')}</td></tr>
      <tr><th>담당 업무</th><td>${escapeHtml(terms.duties || '-')}</td></tr>
      <tr><th>근무일</th><td>${escapeHtml(terms.work_days || '-')}</td></tr>
      <tr><th>근로시간</th><td>${escapeHtml(terms.work_start_time || '-')}부터 ${escapeHtml(terms.work_end_time || '-')}까지</td></tr>
      <tr><th>휴게시간</th><td>${escapeHtml(terms.break_start_time || '-')}부터 ${escapeHtml(terms.break_end_time || '-')}까지</td></tr>
      <tr><th>주휴일</th><td>${escapeHtml(terms.weekly_holiday || '-')}</td></tr>
      <tr><th>연봉 총액</th><td>${formatMoney(terms.annual_salary)}원</td></tr>
      <tr><th>임금 구성</th><td>${escapeHtml(terms.wage_components || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>지급일·방법</th><td>${escapeHtml(terms.pay_day || '-')} · ${escapeHtml(terms.payment_method || '-')}</td></tr>
      <tr><th>연차유급휴가</th><td>${escapeHtml(terms.annual_leave || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>사회보험</th><td>${escapeHtml(terms.social_insurance || '-').replace(/\n/g, '<br>')}</td></tr>
      <tr><th>그 밖의 조건</th><td>${escapeHtml(terms.other_terms || '-').replace(/\n/g, '<br>')}</td></tr>
    </table>`;
  const employerState = contract.employer_signed_at
    ? `${escapeHtml(contract.employer_signer_name || terms.employer_name || '사용자 측 관리자')}<br>전자 확인 ${escapeHtml(formatDateTime(contract.employer_signed_at))}`
    : '전자 확인 전';
  const employeeState = contract.employee_signed_at
    ? `${escapeHtml(contract.employee_signer_name || terms.employee_name || '직원')}<br>전자 확인 ${escapeHtml(formatDateTime(contract.employee_signed_at))}`
    : (contract.source_type === 'upload' ? '외부 서명 원본 참조' : '전자 확인 전');
  return `<article class="document-paper">
    <h1>${escapeHtml(contract.title || kindLabel(contract.document_kind))}</h1>
    <p><strong>${escapeHtml(terms.company_name || '')}</strong>(이하 “사용자”)와 <strong>${escapeHtml(terms.employee_name || '')}</strong>(이하 “직원”)은 다음과 같이 근로조건을 정하고 이를 성실히 이행하기로 합니다.</p>
    ${body}
    <p class="mt-4">이 문서는 양 당사자가 내용을 확인할 수 있도록 같은 내용으로 보관합니다.</p>
    <div class="text-center fw-bold my-4">${escapeHtml(formatDate(contract.effective_date))}</div>
    <div class="signature-grid">
      <div class="signature-box"><strong>사용자</strong><br>${escapeHtml(terms.company_name || '-')}<br>${escapeHtml(terms.company_address || '')}<br>대표자 ${escapeHtml(terms.employer_name || '-')}<hr>${employerState}</div>
      <div class="signature-box"><strong>직원</strong><br>${escapeHtml(terms.employee_name || '-')}<br>${escapeHtml(terms.employee_address || '')}<hr>${employeeState}</div>
    </div>
    ${contract.content_hash ? `<div class="hash-note">전자 확인 문서 식별값: ${escapeHtml(contract.content_hash)}</div>` : ''}
  </article>`;
}

async function signContract(id, role, button) {
  if (state.busy) return;
  const message = role === 'employee'
    ? '계약 내용을 모두 확인했으며 전자 서명하시겠습니까? 확인 뒤에는 내용을 수정할 수 없습니다.'
    : '사용자 측에서 이 계약 내용을 확인하시겠습니까? 확인 뒤에는 내용을 수정할 수 없습니다.';
  if (!window.confirm(message)) return;
  try {
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const { data, error } = await db.rpc('erp_sign_employment_contract', { p_contract_id: id, p_signer_role: role });
    if (error) throw error;
    await loadContracts();
    openContract((Array.isArray(data) ? data[0] : data)?.id || id);
    showAlert('전자 확인을 기록했습니다. 양쪽 확인이 모두 끝나면 계약이 완료됩니다.');
  } catch (error) {
    console.error('[employment_contracts] sign failed', error);
    showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

function printContract(contract) {
  document.getElementById('printRoot').innerHTML = renderContractDocument(contract);
  document.getElementById('printRoot').classList.remove('hidden');
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => document.getElementById('printRoot').classList.add('hidden'), 300);
  }, 80);
}

async function openStoredFile(path) {
  const safePath = asText(path);
  if (!safePath) return showAlert('계약서 파일을 찾을 수 없습니다.');
  try {
    let url = safePath.startsWith('https://') ? safePath : '';
    if (!url) {
      const { data, error } = await db.storage.from('contracts').createSignedUrl(safePath, 3600);
      if (error) throw error;
      url = data?.signedUrl || '';
    }
    if (!/^https:\/\//i.test(url)) throw new Error('안전한 열람 주소를 만들지 못했습니다.');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('[employment_contracts] file open failed', error);
    showAlert(normalizeError(error));
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
  if (!state.employee) return;
  document.getElementById('uploadTitle').value = `${state.employee.emp_name} 외부 작성 근로계약서`;
  document.getElementById('uploadKind').value = 'uploaded';
  document.getElementById('uploadEffectiveDate').value = todayKst();
  document.getElementById('uploadFile').value = '';
  uploadModal.show();
}

async function registerUpload(event) {
  if (state.busy) return;
  const button = event.currentTarget;
  const file = document.getElementById('uploadFile').files[0];
  let storagePath = '';
  let uploaded = false;
  try {
    const title = requireField(inputValue('uploadTitle'), '문서 제목');
    const kind = inputValue('uploadKind');
    const effective = requireField(inputValue('uploadEffectiveDate'), '적용일');
    if (!file) throw new Error('계약서 파일을 선택해 주세요.');
    const ext = fileExtension(file);
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) throw new Error('PDF·JPG·PNG 파일만 등록할 수 있습니다.');
    if (file.size > 20 * 1024 * 1024) throw new Error('파일은 20MB 이하로 등록해 주세요.');
    const coopId = asText(state.user?.coop_id);
    const entropy = window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
    storagePath = `${coopId}/${state.employee.emp_id}_contract_${Date.now()}_${entropy}.${ext === 'jpeg' ? 'jpg' : ext}`;
    button.dataset.label = button.textContent;
    setBusy(true, button);
    const { error: uploadError } = await db.storage.from('contracts').upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: '3600'
    });
    if (uploadError) throw uploadError;
    uploaded = true;
    const { data, error } = await db.rpc('erp_register_uploaded_employment_contract', {
      p_emp_id: state.employee.emp_id,
      p_title: title,
      p_effective_date: effective,
      p_file_path: storagePath,
      p_original_file_name: sanitizeFileName(file.name),
      p_document_kind: kind
    });
    if (error) throw error;
    uploadModal.hide();
    await loadContracts();
    openContract((Array.isArray(data) ? data[0] : data)?.id);
    showAlert('외부 작성 계약서를 새 이력으로 등록했습니다. 기존 계약서는 그대로 보존됩니다.');
  } catch (error) {
    if (uploaded) await db.storage.from('contracts').remove([storagePath]).catch(() => {});
    console.error('[employment_contracts] upload failed', error);
    showAlert(normalizeError(error));
  } finally {
    setBusy(false, button);
  }
}

async function boot() {
  alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
  uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
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
    await Promise.all([loadCompany(), loadEmployees()]);
    renderEmployeeSelect();
    await loadContracts();
    document.getElementById('backButton').addEventListener('click', () => {
      location.href = state.admin && !state.forceSelf ? 'admin_employee.html' : 'mypage.html';
    });
    document.getElementById('employeeSelect').addEventListener('change', async (event) => {
      state.employee = state.employees.find((employee) => employee.emp_id === event.target.value) || null;
      emptyWorkspace();
      await loadContracts();
    });
    document.querySelectorAll('[data-new-kind]').forEach((button) => button.addEventListener('click', () => openNew(button.dataset.newKind)));
    document.getElementById('openUploadButton').addEventListener('click', openUpload);
    document.getElementById('registerUploadButton').addEventListener('click', registerUpload);
    document.getElementById('refreshButton').addEventListener('click', loadContracts);
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    if (!state.contracts.length) emptyWorkspace(state.admin && !state.forceSelf ? '새 계약서를 작성하거나 외부 계약서를 등록해 주세요' : '확인할 근로계약서가 없습니다');
  } catch (error) {
    console.error('[employment_contracts] boot failed', error);
    showAlert(`근로계약서 화면을 준비하지 못했습니다.\n${normalizeError(error)}`);
  }
}

window.addEventListener('DOMContentLoaded', boot);
