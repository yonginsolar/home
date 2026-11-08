/* Version: 1.0.1 | 2026-11-08. Bounded current-view reads; original server permissions. */
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
          <span class="badge text-wrap mw-100 ${c?.status==='completed'?'bg-success':c?.status==='submitted'?'bg-primary':'bg-secondary'}">${escape(c?labels[c.status]||'상태 확인 필요':'등록된 서류 없음')}</span>
          ${c?`<dl class="row small mb-0 mt-3"><dt class="col-5">기준일</dt><dd class="col-7">${date(c.event_date)}</dd>${c.request_date?`<dt class="col-5">요청일</dt><dd class="col-7">${date(c.request_date)}</dd>`:''}<dt class="col-5">기관 제출일</dt><dd class="col-7">${date(c.submitted_date)}</dd><dt class="col-5">처리 완료일</dt><dd class="col-7">${date(c.completed_date)}</dd></dl>`:'<p class="small text-secondary mt-3 mb-0">아직 ERP에 기록된 서류가 없습니다. 실제 제출 여부는 담당자에게 확인해 주세요.</p>'}
          </section></div>`;
      }).join('')}</div>${retired?'<p class="small text-secondary mt-3">이직확인서의 요청일과 기관 제출일을 위에서 확인할 수 있습니다. 기록이 없거나 변경이 필요하면 인사 담당자에게 문의해 주세요.</p>':''}
      ${cases.length?`<details class="mt-3"><summary class="fw-bold">전체 서류 이력 (${cases.length}건)</summary><ul class="list-unstyled mt-2">${cases.map(row).join('')}</ul></details>`:''}
      ${admin?'<p class="small text-secondary mt-3 mb-0">실제 기관에 제출한 뒤 서류 관리에서 제출일을 기록하고, 기관 처리 결과를 확인한 뒤 처리 완료일을 기록해 주세요.</p>':''}`;
  }
  async function mount(db, root, options={}) {
    if (!root) return;
    roots.get(root)?.stop();
    const state={pending:null, stop(){
      const read=state.pending;
      if (!read) return;
      state.pending=null; clearTimeout(read.timer); read.controller.abort(); read.cancel();
    }};
    roots.set(root,state);
    root.innerHTML='<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 class="h6 fw-bold mb-0">🧾 4대보험 서류·이직확인서</h2><button type="button" class="btn btn-outline-secondary btn-sm text-wrap" data-refresh>다시 확인</button></div><div data-result aria-live="polite"></div>';
    const button=root.querySelector('[data-refresh]'), result=root.querySelector('[data-result]');
    const owned=()=>roots.get(root)===state&&result.parentNode===root&&root.isConnected&&options.isCurrent?.()!==false;
    state.current=owned;
    async function load() {
      if (state.pending || !owned()) return;
      const read={controller:new AbortController()};state.pending=read;
      const current=()=>owned()&&state.pending===read;
      button.setAttribute('aria-disabled','true');result.setAttribute('aria-busy','true');
      result.innerHTML='<p class="text-secondary" role="status">서류 상태를 불러오는 중입니다.</p>';
      try {
        const cancelled=new Promise(resolve=>{read.cancel=()=>resolve(null);});
        const timeout=new Promise((_,reject)=>{read.timer=setTimeout(()=>{
          read.controller.abort();reject(new Error('STATUS_TIMEOUT'));
        },15000);});
        const request=db.rpc('erp_hr_insurance_status',options.empId?{p_emp_id:options.empId}:{});
        const response=await Promise.race([typeof request.abortSignal==='function'?request.abortSignal(read.controller.signal):request,timeout,cancelled]);
        if (!current()||!response) return;
        const {data,error}=response;
        if (error || !data || !Array.isArray(data.cases)) throw new Error('STATUS_UNAVAILABLE');
        result.innerHTML=render(data,!!options.admin);
      } catch (_) {
        if (current()) result.innerHTML='<p class="alert alert-warning mb-0">서류 상태를 확인하지 못했습니다. 다시 확인해 주세요.</p>';
      } finally {
        clearTimeout(read.timer);
        if (state.pending===read) state.pending=null;
        if (owned()) {button.setAttribute('aria-disabled','false');result.setAttribute('aria-busy','false');}
      }
    }
    button.addEventListener('click',load);
    await load();
  }
  function suspend(root) { roots.get(root)?.stop();roots.delete(root); }
  window.HrInsuranceStatus={version:'1.0.1',mount,suspend,isMounted:root=>roots.get(root)?.current()===true};
})();
