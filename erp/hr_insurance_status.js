/* Version: 1.0.0 | 2026-10-06. Read-only, permission checked on server. */
'use strict';
(() => {
  const roots = new WeakMap();
  const names = {acquisition:'자격취득 신고서', loss:'자격상실 신고서', separation:'이직확인서', unpaid_confirmation:'대표자 무보수 확인서'};
  const labels = {draft:'준비 중', submitted:'기관 제출 기록', completed:'기관 처리 완료 기록'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '—';
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  function row(c) {
    return `<li class="py-2 border-bottom"><strong>${escape(names[c.kind] || '신고 서류')}</strong> · ${escape(labels[c.status] || '상태 확인 필요')}
      <div class="small text-secondary mt-1">기준일 ${date(c.event_date)}${c.request_date?' · 요청일 '+date(c.request_date):''}${c.submitted_date?' · 제출일 '+date(c.submitted_date):''}${c.completed_date?' · 처리 완료일 '+date(c.completed_date):''}</div></li>`;
  }
  function render(data, admin) {
    const cases = Array.isArray(data.cases) ? data.cases : [];
    const retired = !!data.resign_date && data.resign_date <= today();
    const kinds = ['acquisition', ...(retired?['loss','separation']:[]), ...(cases.some(c=>c.kind==='unpaid_confirmation')?['unpaid_confirmation']:[])];
    return `<p class="text-secondary">담당자가 ERP에 기록한 제출·처리 상태입니다. 기관의 접수 결과를 실시간으로 조회하는 화면은 아닙니다.</p>
      <div class="row g-3">${kinds.map(kind=>{
        const c=cases.find(item=>item.kind===kind);
        return `<div class="col-12 col-lg-6"><section class="border rounded-3 p-3 h-100 bg-white"><h3 class="h6 fw-bold">${escape(names[kind])}</h3>
          <span class="badge ${c?.status==='completed'?'bg-success':c?.status==='submitted'?'bg-primary':'bg-secondary'}">${escape(c?labels[c.status]||'상태 확인 필요':'등록된 서류 없음')}</span>
          ${c?`<dl class="row small mb-0 mt-3"><dt class="col-5">기준일</dt><dd class="col-7">${date(c.event_date)}</dd>${c.request_date?`<dt class="col-5">요청일</dt><dd class="col-7">${date(c.request_date)}</dd>`:''}<dt class="col-5">기관 제출일</dt><dd class="col-7">${date(c.submitted_date)}</dd><dt class="col-5">처리 완료일</dt><dd class="col-7">${date(c.completed_date)}</dd></dl>`:'<p class="small text-secondary mt-3 mb-0">아직 ERP에 기록된 서류가 없습니다. 실제 제출 여부는 담당자에게 확인해 주세요.</p>'}
          </section></div>`;
      }).join('')}</div>${retired?'<p class="small text-secondary mt-3">이직확인서의 요청일과 기관 제출일을 위에서 확인할 수 있습니다. 기록이 없거나 변경이 필요하면 인사 담당자에게 문의해 주세요.</p>':''}
      ${cases.length?`<details class="mt-3"><summary class="fw-bold">전체 서류 이력 (${cases.length}건)</summary><ul class="list-unstyled mt-2">${cases.map(row).join('')}</ul></details>`:''}
      ${admin?'<p class="small text-secondary mt-3 mb-0">실제 기관에 제출한 뒤 서류 관리에서 제출일을 기록하고, 기관 처리 결과를 확인한 뒤 처리 완료일을 기록해 주세요.</p>':''}`;
  }
  async function mount(db, root, options={}) {
    if (!root) return;
    const state={generation:Symbol(), pending:false};
    roots.set(root,state);
    root.innerHTML='<div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h2 class="h6 fw-bold mb-0">🧾 4대보험 서류·이직확인서</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-refresh>새로고침</button></div><div data-result aria-live="polite"></div>';
    const button=root.querySelector('[data-refresh]'), result=root.querySelector('[data-result]');
    async function load() {
      if (state.pending || roots.get(root)!==state) return;
      state.pending=true; button.disabled=true;
      result.innerHTML='<p class="text-secondary" role="status">서류 상태를 불러오는 중입니다.</p>';
      try {
        const {data,error}=await db.rpc('erp_hr_insurance_status',options.empId?{p_emp_id:options.empId}:{});
        if (roots.get(root)!==state) return;
        if (error || !data || !Array.isArray(data.cases)) throw new Error('STATUS_UNAVAILABLE');
        result.innerHTML=render(data,!!options.admin);
      } catch (_) {
        if (roots.get(root)===state) result.innerHTML='<p class="alert alert-warning mb-0">서류 상태를 확인하지 못했습니다. 연결·조회 권한을 확인한 뒤 새로고침해 주세요.</p>';
      } finally { state.pending=false; if(roots.get(root)===state) button.disabled=false; }
    }
    button.addEventListener('click',load);
    await load();
  }
  window.HrInsuranceStatus={version:'1.0.0',mount};
})();
