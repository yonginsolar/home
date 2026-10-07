/* v1.0.0 - Tenant legal drafts, explicit registration and admin-only samples. */
(function () {
  'use strict';
  const labels = {signup_purpose:'조합 설립목적',signup_privacy:'가입 개인정보 수집·이용 동의',terms:'서비스 이용약관',privacy:'개인정보 처리방침'};
  const state = new Map();
  let loaded = false, loading = false;
  const el = (kind, suffix) => document.getElementById(`site-legal-${kind}-${suffix}`);
  function values(kind) { return {content:el(kind,'content').value,effective_date:el(kind,'effective-date').value}; }
  function dirty(kind) { const s=state.get(kind);return !!s && JSON.stringify(values(kind))!==s.baseline; }
  function permitted() { return hasAdminMemberScopePermission('site_admin') && isAdminMemberRuntimeModuleEnabled('site_admin'); }
  function confirmAction(message) {
    return new Promise(resolve=>{
      const modal=document.getElementById('customConfirmModal');let accepted=false;
      myConfirm(message,()=>{accepted=true;resolve(true);});
      modal.addEventListener('hidden.bs.modal',()=>setTimeout(()=>{if(!accepted)resolve(false);},0),{once:true});
    });
  }
  function setEnabled(kind, enabled) { for(const b of el(kind,'card').querySelectorAll('button')) b.disabled=!enabled;el(kind,'content').disabled=!enabled;el(kind,'effective-date').disabled=!enabled; }
  function setForm(kind, doc={}) {
    el(kind,'content').value=String(doc.content||'');el(kind,'effective-date').value=String(doc.effective_date||'');
    state.set(kind,{doc,baseline:JSON.stringify(values(kind)),busy:false});
    el(kind,'published-view').hidden=!doc.is_published;
    el(kind,'published-text').textContent=String(doc.published_content||'');
    el(kind,'unpublish').hidden=!doc.is_published;
    updateStatus(kind);
  }
  function updateStatus(kind) {
    const s=state.get(kind);if(!s)return;
    let text=s.doc.is_published ? '등록·적용 중' : s.doc.updated_at ? '초안 저장됨 · 미등록' : '미등록';
    if(s.doc.uses_legacy_signup&&!s.doc.is_published)text+=' · 기존 가입 문구 유지 중';
    if(s.doc.has_unpublished_changes)text+=' · 수정 초안 있음';
    if(dirty(kind))text+=' · 저장하지 않은 수정 있음';
    el(kind,'status').textContent=text;el(kind,'status').className='small mt-2 '+(s.doc.is_published?'text-success':'text-muted');
  }
  function render() {
    const root=document.getElementById('sub-legal');if(!root)return;
    root.replaceChildren();
    const note=document.createElement('p');note.className='small text-muted';note.textContent='샘플을 수정해 초안으로 저장한 뒤, 내용을 확인하고 등록·적용해 주세요. 초안 저장은 현재 적용 중인 문구를 바꾸지 않습니다.';root.append(note);
    const grid=document.createElement('div');grid.className='row g-4';root.append(grid);
    for(const [kind,label] of Object.entries(labels)) {
      const column=document.createElement('div');column.className='col-xl-6';
      column.innerHTML=`<div class="card border-0 shadow-sm h-100" id="site-legal-${kind}-card"><div class="card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><h5 class="fw-bold mb-0">${label}</h5><button type="button" class="btn btn-sm btn-outline-secondary" data-legal-action="sample">샘플 불러오기</button></div>
        <label class="form-label small fw-bold" for="site-legal-${kind}-effective-date">시행일</label><input type="date" class="form-control mb-3" id="site-legal-${kind}-effective-date">
        <label class="form-label small fw-bold" for="site-legal-${kind}-content">내용</label><textarea class="form-control" style="word-break:keep-all" id="site-legal-${kind}-content" rows="14" maxlength="100000"></textarea>
        <div id="site-legal-${kind}-status" class="small mt-2" role="status">불러오는 중</div>
        <details class="mt-3" id="site-legal-${kind}-published-view" hidden><summary>현재 적용 중인 내용</summary><div class="mt-2 border rounded p-3" style="white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word" id="site-legal-${kind}-published-text"></div></details>
        </div><div class="card-footer bg-white d-flex flex-wrap gap-2 justify-content-end"><button type="button" class="btn btn-sm btn-outline-danger me-auto" id="site-legal-${kind}-unpublish" data-legal-action="unpublish" hidden>등록 해제</button><button type="button" class="btn btn-outline-primary" data-legal-action="draft">초안 저장</button><button type="button" class="btn btn-primary" data-legal-action="publish">등록·적용</button></div></div>`;
      grid.append(column);setEnabled(kind,false);
      el(kind,'content').addEventListener('input',()=>updateStatus(kind));el(kind,'effective-date').addEventListener('change',()=>updateStatus(kind));
      column.addEventListener('click',event=>{const b=event.target.closest('[data-legal-action]');if(!b||b.disabled)return;const action=b.dataset.legalAction;if(action==='sample')loadSample(kind);else save(kind,action);});
    }
  }
  async function fetchDocuments() {
    if(loading||!permitted())return;
    if(loaded) return; // Tab changes must not overwrite an edited draft.
    loading=true;for(const kind of Object.keys(labels))setEnabled(kind,false);
    try {
      const {data,error}=await _supabase.rpc('get_my_site_legal_documents');if(error)throw error;
      for(const kind of Object.keys(labels)){setForm(kind,data?.[kind]);setEnabled(kind,true);}loaded=true;
    } catch(error) {
      for(const kind of Object.keys(labels))el(kind,'status').textContent='문서를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
      myAlert('가입·약관 문서를 불러오지 못했습니다.','warning');
    } finally {loading=false;}
  }
  async function loadSample(kind) {
    if(!loaded||state.get(kind)?.busy)return;
    if(el(kind,'content').value.trim() && !(await confirmAction('현재 편집 내용 대신 샘플을 불러올까요? 저장·등록된 문서는 바뀌지 않습니다.')))return;
    const sample=window.CoopSiteLegalSamples?.[kind];if(!sample)return myAlert('샘플을 불러오지 못했습니다. 새로고침해 주세요.','warning');
    el(kind,'content').value=sample.replaceAll('{{조합명}}',String(g_adminMemberRuntime?.coop_name||'{{조합명}}'));
    el(kind,'effective-date').value='';updateStatus(kind);
  }
  async function save(kind, action) {
    const s=state.get(kind);if(!loaded||!s||s.busy||!permitted())return;
    const input=values(kind),publish=action==='publish';
    if(publish && (!input.effective_date || input.content.trim().length<(kind==='signup_purpose'?20:100) || /\{\{[^}]+\}\}/.test(input.content)))return myAlert('시행일과 내용을 입력하고, {{ }}로 표시된 샘플 항목을 실제 내용으로 바꿔 주세요.','warning');
    if((publish||action==='unpublish')&&!(await confirmAction(action==='unpublish'?'등록을 해제할까요? 해당 문구가 더 이상 공개되지 않습니다.':`${labels[kind]}을 등록하고 적용할까요?`)))return;
    s.busy=true;setEnabled(kind,false);
    try {
      const request=action==='unpublish' ? _supabase.rpc('unpublish_site_legal_document',{p_document_type:kind,p_expected_revision:s.doc.revision||0}) : _supabase.rpc('save_site_legal_document',{p_document_type:kind,p_content:input.content,p_effective_date:input.effective_date||null,p_publish:publish,p_expected_revision:s.doc.revision||0});
      const {data,error}=await request;if(error)throw error;
      setForm(kind,data);myAlert(action==='unpublish'?'등록을 해제했습니다.':publish?'등록하고 적용했습니다.':'초안을 저장했습니다.','success');
    } catch(error) {myAlert(error?.message==='LEGAL_DOCUMENT_CHANGED'?'다른 사람이 수정했습니다. 편집 내용을 따로 보관한 뒤 다시 불러와 주세요.':'저장하지 못했습니다. 입력 내용은 유지됩니다.','warning');}
    finally {state.get(kind).busy=false;setEnabled(kind,true);}
  }
  window.fetchSiteLegalDocuments=fetchDocuments;
  window.addEventListener('beforeunload',event=>{if([...state.keys()].some(dirty)){event.preventDefault();event.returnValue='';}});
  function start(){render();const root=document.getElementById('sub-legal');if(!root)return;const retry=document.createElement('button');retry.type='button';retry.className='btn btn-sm btn-outline-secondary mb-3';retry.textContent='다시 불러오기';retry.onclick=async()=>{if([...state.keys()].some(dirty)&&!(await confirmAction('저장하지 않은 수정을 버리고 다시 불러올까요?')))return;loaded=false;await fetchDocuments();};root.prepend(retry);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
