/* v1.1.4 - Edit the draft document in place; registered text stays read-only. */
(function () {
  'use strict';
  const labels = {signup_purpose:'조합 설립목적',signup_privacy:'가입 개인정보 수집·이용 동의',terms:'서비스 이용약관',privacy:'개인정보 처리방침'};
  const state = new Map();
  let loaded = false, loading = false, context = null, actionInFlight = false, retryButton = null;
  let selectedKind='signup_purpose',previewMode='draft';
  const contacts = {representative:'이사장 이름',address:'조합 주소',officer_name:'개인정보 보호책임자 성명',officer_title:'직책',officer_phone:'전화번호',officer_email:'이메일'};
  const el = (kind, suffix) => document.getElementById(`site-legal-${kind}-${suffix}`);
  function privacyTemplate(content) {
    // Recognize the existing structured contact block, not arbitrary names in legal prose.
    // This only prepares an editable draft; no registered document is changed here.
    const gap='\\r?\\n(?:[ \\t]*\\r?\\n)*',line='([^\\s\\r\\n][^\\r\\n]*)';
    const block=new RegExp('^(개인정보처리자[ \\t]*'+gap+')'+line+'('+gap+'이사장[ \\t]+)'+line+'('+gap+'주소[ \\t]*'+gap+')'+line+'('+gap+'개인정보 보호책임자[ \\t]*[·ㆍ][ \\t]*권리행사 접수[ \\t]*'+gap+')'+line+'('+gap+')'+line+'('+gap+')'+line+'(?=\\r?\\n|$)','gm');
    const references=[];
    let result=String(content).replace(block,(match,a,org,b,representative,c,address,d,officer,e,phone,f,email)=>{
      const p=phone.trim(),m=email.trim();
      if(!(p==='{{전화번호}}'||(/^[+0-9() .-]+$/.test(p)&&/^\d{8,15}$/.test(p.replace(/\D/g,''))))||!(m==='{{이메일}}'||/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m)))return match;
      if(!officer.includes('{{')&&p!=='{{전화번호}}')references.push([officer.trim(),p]);
      return a+'{{조합명}}'+b+'{{대표자}}'+c+'{{주소}}'+d+'{{직책}} {{담당자}}'+e+'{{전화번호}}'+f+'{{이메일}}';
    });
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    for(const [officer,phone] of references)result=result.replace(new RegExp(escape(officer)+'[ \\t]*\\([ \\t]*'+escape(phone)+'[ \\t]*\\)','g'),'{{직책}} {{담당자}}({{전화번호}})');
    return result;
  }
  function values(kind) { const v={content:kind==='privacy'?privacyTemplate(el(kind,'content').value):el(kind,'content').value,effective_date:el(kind,'effective-date').value};if(kind==='privacy')v.contact_details=Object.fromEntries(Object.keys(contacts).map(k=>[k,el(kind,k).value.trim()]));return v; }
  function renderText(content,kind) {
    const cfg=kind==='privacy'?{...context,...values(kind).contact_details}:context||{};
    const keys={'조합명':'coop_name','대표자':'representative','주소':'address','담당자':'officer_name','직책':'officer_title','전화번호':'officer_phone','이메일':'officer_email'};
    return (kind==='privacy'?privacyTemplate(content):String(content)).replace(/\{\{([^}]+)\}\}/g,(token,label)=>String(cfg?.[keys[label]]||token));
  }
  function dirty(kind) { const s=state.get(kind);return !!s && JSON.stringify(values(kind))!==s.baseline; }
  function permitted() { return hasAdminMemberScopePermission('site_admin') && isAdminMemberRuntimeModuleEnabled('site_admin'); }
  function confirmAction(message) {
    return new Promise(resolve=>{
      const modal=document.getElementById('customConfirmModal');let accepted=false;
      modal.addEventListener('hidden.bs.modal',()=>setTimeout(()=>{if(!accepted)resolve(false);},0),{once:true});
      myConfirm(message,()=>{accepted=true;resolve(true);});
    });
  }
  function setEnabled(kind, enabled) { for(const b of el(kind,'card').querySelectorAll('button,input,textarea')) b.disabled=!enabled; }
  function syncEnabled() {
    for(const kind of Object.keys(labels))setEnabled(kind,loaded&&!loading&&!actionInFlight&&permitted());
    if(retryButton)retryButton.disabled=loading||actionInFlight;
  }
  function beginAction() {
    if(!loaded||loading||actionInFlight||!permitted())return false;
    actionInFlight=true;syncEnabled();return true;
  }
  function endAction() { actionInFlight=false;syncEnabled(); }
  function setForm(kind, doc={}) {
    el(kind,'content').value=kind==='privacy'?privacyTemplate(doc.content||''):String(doc.content||'');el(kind,'effective-date').value=String(doc.effective_date||'');
    if(kind==='privacy')for(const key of Object.keys(contacts))el(kind,key).value=String(doc.contact_details?.[key]??(key==='representative'||key==='address'?context?.[key]:'')??'');
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
    el(kind,'preview-text').textContent=renderText(el(kind,'content').value,kind);
    refreshPreview();
  }
  function refreshPreview(){
    const target=document.getElementById('site-home-legal-preview');if(!target)return;
    const doc=state.get(selectedKind)?.doc;
    const active=target.querySelector('article[contenteditable="plaintext-only"]');
    if(active&&document.activeElement===active)return;
    target.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=labels[selectedKind];
    const modes=document.createElement('div');modes.className='d-flex gap-2 mb-3';
    for(const [mode,label] of [['draft','등록 전 미리보기'],['published','현재 적용 중']]){
      const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary';button.textContent=label;button.setAttribute('aria-pressed',String(previewMode===mode));button.onclick=()=>{previewMode=mode;refreshPreview();};modes.append(button);
    }
    const date=document.createElement('p');date.className='small text-muted';
    const effective=previewMode==='published'?doc?.published_effective_date:el(selectedKind,'effective-date')?.value;
    date.textContent=effective?`시행일 ${effective}`:'';
    const article=document.createElement('article');
    article.textContent=!loaded?'문서를 불러오는 중입니다.':previewMode==='published'?(doc?.is_published?String(doc.published_content||''):'등록된 내용이 없습니다.'):renderText(el(selectedKind,'content')?.value||'',selectedKind);
    if(loaded&&previewMode==='draft'&&permitted()&&!actionInFlight&&!loading){
      article.setAttribute('tabindex','0');article.setAttribute('aria-label','문서 초안 수정');
      article.onclick=()=>{if(article.hasAttribute('contenteditable'))return;article.textContent=el(selectedKind,'content').value;article.setAttribute('contenteditable','plaintext-only');article.focus();};
      article.onkeydown=event=>{if(event.key==='Enter'&&!article.hasAttribute('contenteditable')){event.preventDefault();article.click();}};
      article.oninput=()=>{const input=el(selectedKind,'content'),value=article.innerText??article.textContent;if(value.length>input.maxLength){article.textContent=input.value;myAlert('입력할 수 있는 길이를 초과했습니다.','warning');return;}input.value=value;updateStatus(selectedKind);};
      article.onblur=()=>{article.removeAttribute('contenteditable');refreshPreview();};
      article.onpaste=event=>{event.preventDefault();const selection=window.getSelection();if(!selection.rangeCount)return;const range=selection.getRangeAt(0);if(!article.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(event.clipboardData?.getData('text/plain')||'');range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);article.dispatchEvent(new Event('input'));};
    }
    target.append(heading,modes,date,article);
  }
  function selectKind(kind){
    if(!Object.hasOwn(labels,kind))return false;
    selectedKind=kind;
    const picker=document.getElementById('site-legal-kind-picker');if(picker)picker.value=kind;
    for(const [key] of Object.entries(labels))el(key,'card')?.parentElement.toggleAttribute('hidden',key!==kind);
    refreshPreview();return true;
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
        ${kind==='privacy'?`<fieldset class="border rounded p-3 mb-3"><legend class="float-none w-auto px-1 fs-6 fw-bold">개인정보 담당자 정보</legend><label class="form-label small fw-bold" for="site-legal-privacy-processor">개인정보처리자</label><input id="site-legal-privacy-processor" class="form-control mb-3" readonly><div class="row g-3">${Object.entries(contacts).map(([key,label])=>`<div class="${key==='address'?'col-12':'col-md-6'}"><label class="form-label small fw-bold" for="site-legal-privacy-${key}">${label} <span class="text-danger">*</span></label><input class="form-control" id="site-legal-privacy-${key}" type="${key==='officer_email'?'email':key==='officer_phone'?'tel':'text'}" maxlength="${key==='address'?300:key==='officer_email'?254:100}" required></div>`).join('')}</div><p class="small text-muted mt-3 mb-0">보호책임자가 개인정보 문의와 권리행사 요청을 받습니다. 담당자 정보는 아래 미리보기에서 확인해 주세요.</p></fieldset>`:''}
        <label class="form-label small fw-bold" for="site-legal-${kind}-effective-date">시행일</label><input type="date" class="form-control mb-3" id="site-legal-${kind}-effective-date">
        <label class="form-label small fw-bold" for="site-legal-${kind}-content">내용</label><textarea class="form-control" style="word-break:keep-all" id="site-legal-${kind}-content" rows="14" maxlength="100000"></textarea>
        <div id="site-legal-${kind}-status" class="small mt-2" role="status">불러오는 중</div>
        <details class="mt-3"><summary>등록 전 미리보기</summary><div class="mt-2 border rounded p-3" style="white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word" id="site-legal-${kind}-preview-text"></div></details>
        <details class="mt-3" id="site-legal-${kind}-published-view" hidden><summary>현재 적용 중인 내용</summary><div class="mt-2 border rounded p-3" style="white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word" id="site-legal-${kind}-published-text"></div></details>
        </div><div class="card-footer bg-white d-flex flex-wrap gap-2 justify-content-end"><button type="button" class="btn btn-sm btn-outline-danger me-auto" id="site-legal-${kind}-unpublish" data-legal-action="unpublish" hidden>등록 해제</button><button type="button" class="btn btn-outline-primary" data-legal-action="draft">초안 저장</button><button type="button" class="btn btn-primary" data-legal-action="publish">등록·적용</button></div></div>`;
      grid.append(column);setEnabled(kind,false);
      el(kind,'content').addEventListener('input',()=>updateStatus(kind));el(kind,'effective-date').addEventListener('change',()=>updateStatus(kind));
      if(kind==='privacy')for(const key of Object.keys(contacts))el(kind,key).addEventListener('input',()=>updateStatus(kind));
      column.addEventListener('click',event=>{const b=event.target.closest('[data-legal-action]');if(!b||b.disabled)return;const action=b.dataset.legalAction;if(action==='sample')loadSample(kind);else save(kind,action);});
    }
    if(document.getElementById('site-home-legal-preview')){
      const label=document.createElement('label');label.className='form-label fw-bold';label.htmlFor='site-legal-kind-picker';label.textContent='편집할 문서';
      const picker=document.createElement('select');picker.id=label.htmlFor;picker.className='form-select mb-3';
      for(const [kind,text] of Object.entries(labels)){const option=document.createElement('option');option.value=kind;option.textContent=text;picker.append(option);}
      picker.onchange=()=>selectKind(picker.value);grid.before(label,picker);selectKind(selectedKind);
    }
  }
  async function fetchDocuments() {
    if(loading||actionInFlight||!permitted())return;
    if(loaded) return; // Tab changes must not overwrite an edited draft.
    loading=true;syncEnabled();
    try {
      const [docsResult,ctxResult]=await Promise.all([_supabase.rpc('get_my_site_legal_documents'),_supabase.rpc('get_my_site_legal_context')]);
      if(docsResult.error||ctxResult.error||!ctxResult.data?.coop_name)throw Error('LEGAL_READ_FAILED');
      context=ctxResult.data;el('privacy','processor').value=context.coop_name;const data=docsResult.data;
      for(const kind of Object.keys(labels))setForm(kind,data?.[kind]);loaded=true;
    } catch(error) {
      for(const kind of Object.keys(labels))el(kind,'status').textContent='문서를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
      myAlert('가입·약관 문서를 불러오지 못했습니다.','warning');
    } finally {loading=false;syncEnabled();refreshPreview();}
  }
  async function loadSample(kind) {
    if(!beginAction())return;
    try {
      if(el(kind,'content').value.trim() && !(await confirmAction('현재 편집 내용 대신 샘플을 불러올까요? 저장·등록된 문서는 바뀌지 않습니다.')))return;
      if(!permitted())return;
      const sample=window.CoopSiteLegalSamples?.[kind];if(!sample)return myAlert('샘플을 불러오지 못했습니다. 새로고침해 주세요.','warning');
      // Only organization fields are automatic. Never copy a staff member's private contact details.
      el(kind,'content').value=sample.replace(/\{\{(조합명|대표자|주소)\}\}/g,(token,label)=>kind==='privacy'&&label!=='조합명'?token:String(context?.[{'조합명':'coop_name','대표자':'representative','주소':'address'}[label]]||token));
      if(kind==='privacy')for(const key of ['representative','address'])el(kind,key).value=String(context?.[key]||'');
      el(kind,'effective-date').value='';updateStatus(kind);
    } finally {endAction();}
  }
  async function save(kind, action) {
    const s=state.get(kind);if(!loaded||loading||actionInFlight||!s||s.busy||!permitted())return;
    const input=values(kind),publish=action==='publish';
    const rendered=renderText(input.content,kind);
    if(publish&&kind==='privacy'){
      for(const [key,label] of Object.entries(contacts))if(!input.contact_details[key]){el(kind,key).focus();return myAlert(`${label}을 입력해 주세요.`,'warning');}
      if(!/^[+0-9() .-]+$/.test(input.contact_details.officer_phone)||!/^\d{8,15}$/.test(input.contact_details.officer_phone.replace(/\D/g,'')))return myAlert('전화번호를 확인해 주세요.','warning');
      if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.contact_details.officer_email))return myAlert('이메일 주소를 확인해 주세요.','warning');
      const ctx={coop_name:context.coop_name,...input.contact_details};
      if(Object.entries(ctx).some(([key,v])=>key==='officer_phone'?!rendered.replace(/\D/g,'').includes(v.replace(/\D/g,'')):!rendered.includes(v)))return myAlert('담당자 정보와 처리방침 본문의 내용이 일치하지 않습니다. 본문과 등록 전 미리보기를 확인해 주세요.','warning');
    }
    if(publish && (!input.effective_date || rendered.trim().length<(kind==='signup_purpose'?20:100) || /\{\{[^}]+\}\}/.test(rendered)))return myAlert('시행일과 내용을 입력하고, {{ }}로 표시된 샘플 항목을 실제 내용으로 바꿔 주세요.','warning');
    if(!beginAction())return;
    s.busy=true;
    try {
      if((publish||action==='unpublish')&&!(await confirmAction(action==='unpublish'?'등록을 해제할까요? 해당 문구가 더 이상 공개되지 않습니다.':`${labels[kind]}을 등록하고 적용할까요?`)))return;
      if(!permitted())return;
      const request=action==='unpublish' ? _supabase.rpc('unpublish_site_legal_document',{p_document_type:kind,p_expected_revision:s.doc.revision||0}) : _supabase.rpc('save_site_legal_document_v2',{p_document_type:kind,p_content:input.content,p_effective_date:input.effective_date||null,p_publish:publish,p_expected_revision:s.doc.revision||0,p_contact_details:input.contact_details||null});
      const {data,error}=await request;if(error)throw error;
      setForm(kind,data);myAlert(action==='unpublish'?'등록을 해제했습니다.':publish?'등록하고 적용했습니다.':'초안을 저장했습니다.','success');
    } catch(error) {const messages={LEGAL_DOCUMENT_CHANGED:'다른 사람이 수정했습니다. 편집 내용을 따로 보관한 뒤 다시 불러와 주세요.',LEGAL_CONTACT_REQUIRED:'이사장·주소와 개인정보 보호책임자의 성명·직책·전화번호·이메일을 모두 입력해 주세요.',LEGAL_CONTACT_INVALID:'개인정보 담당자 정보의 입력 형식을 확인해 주세요.',LEGAL_CONTACT_NOT_IN_CONTENT:'담당자 정보가 처리방침 본문에 반영되지 않았습니다. 본문과 등록 전 미리보기를 확인해 주세요.',LEGAL_DOCUMENT_NOT_READY:'시행일·내용과 아직 채우지 않은 샘플 항목을 확인해 주세요.'};myAlert(messages[error?.message]||'저장하지 못했습니다. 입력 내용은 유지됩니다.','warning');}
    finally {state.get(kind).busy=false;endAction();}
  }
  window.fetchSiteLegalDocuments=fetchDocuments;
  window.CoopSiteLegalEditor=Object.freeze({select:selectKind,refreshPreview});
  window.addEventListener('beforeunload',event=>{if(actionInFlight||[...state.keys()].some(dirty)){event.preventDefault();event.returnValue='';}});
  function start(){render();const root=document.getElementById('sub-legal');if(!root)return;retryButton=document.createElement('button');retryButton.type='button';retryButton.className='btn btn-sm btn-outline-secondary mb-3';retryButton.textContent='다시 불러오기';retryButton.onclick=async()=>{
    if(loading||actionInFlight||!permitted())return;
    actionInFlight=true;syncEnabled();
    let confirmed=false;
    try {confirmed=![...state.keys()].some(dirty)||await confirmAction('저장하지 않은 수정을 버리고 다시 불러올까요?');}
    finally {endAction();}
    if(!confirmed)return;
    loaded=false;await fetchDocuments();
  };root.prepend(retryButton);syncEnabled();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
