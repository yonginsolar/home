/* v1.1.13 - Scope legal confirmations/results to their original task and owner. */
(function () {
  'use strict';
  const labels = {signup_purpose:'조합 설립목적',signup_privacy:'가입 개인정보 수집·이용 동의',terms:'서비스 이용약관',privacy:'개인정보 처리방침'};
  const locations={signup_purpose:['조합원 가입 → 설립목적 동의','[필수] 조합의 설립목적에 동의하고 의무를 다하겠습니다.','signup'],signup_privacy:['조합원 가입 → 개인정보 동의','[필수] 개인정보 수집·이용에 동의합니다.','signup'],terms:['홈페이지 하단 → 이용약관','이용약관','terms.html'],privacy:['홈페이지 하단 → 개인정보 처리방침','개인정보 처리방침','privacy.html']};
  const state = new Map();
  let loaded = false, loading = false, context = null, actionInFlight = false, retryButton = null;
  let readRequest=null,readMessage='',readStatus=null;
  let saveTicket=null;
  let selectedKind='signup_purpose',previewMode='draft';
  let signupImageOpener=null;
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
  function readScope(){return {runtime:typeof g_adminMemberRuntime==='undefined'?null:g_adminMemberRuntime,actor:typeof adminCertificateAuthId==='undefined'?'':adminCertificateAuthId,area:window.CoopHomeVisualEditor?.current()};}
  function sameReadScope(scope){const current=readScope();return permitted()&&current.runtime===scope.runtime&&current.actor===scope.actor&&current.area===scope.area&&!window.frameElement?.hidden;}
  function readSignature(){return JSON.stringify(Object.keys(labels).map(kind=>values(kind)));}
  function currentRead(read){return readRequest===read&&sameReadScope(read.scope);}
  function cancelRead(){
    const read=readRequest;if(!read)return;
    readRequest=null;read.controller.abort();window.clearTimeout(read.timer);read.release({cancelled:true});loading=false;
    readMessage='다시 불러오기를 눌러 문서를 확인해 주세요.';syncEnabled();
  }
  function saveOwnerCurrent(ticket){
    const scope=readScope();
    return permitted()&&scope.runtime===ticket.scope.runtime&&scope.actor===ticket.scope.actor
      &&saveAuthority()===ticket.authority&&state.get(ticket.kind)===ticket.state;
  }
  function saveAuthority(){const runtime=readScope().runtime;return JSON.stringify([runtime?.coop_id,runtime?.effective_permissions,runtime?.modules,runtime?.module_access]);}
  function saveActionCurrent(ticket){return saveTicket===ticket&&!ticket.departed&&saveOwnerCurrent(ticket)&&sameReadScope(ticket.scope)&&selectedKind===ticket.kind;}
  function departSave(){const ticket=saveTicket;if(!ticket)return;ticket.departed=true;if(!ticket.sent)ticket.cancelConfirmation?.();}
  function confirmAction(message, ticket) {
    return new Promise(resolve=>{
      const modal=document.getElementById('customConfirmModal');let accepted=false,settled=false,button=null;
      const settle=value=>{if(settled)return;settled=true;modal.removeEventListener('hidden.bs.modal',hidden);if(ticket)ticket.cancelConfirmation=null;resolve(value);};
      const hidden=()=>setTimeout(()=>{if(!accepted)settle(false);},0);
      modal.addEventListener('hidden.bs.modal',hidden,{once:true});
      myConfirm(message,()=>{accepted=true;settle(true);});
      button=document.getElementById('btnConfirmYes');
      if(ticket)ticket.cancelConfirmation=()=>{
        settle(false);
        // Only dismiss this confirmation, including its opening transition.
        // An older close must never dismiss a newer shared confirmation.
        const hide=()=>{if(button&&document.getElementById('btnConfirmYes')===button)window.bootstrap?.Modal?.getInstance(modal)?.hide();};
        modal.addEventListener('shown.bs.modal',hide,{once:true});
        modal.addEventListener('hidden.bs.modal',()=>modal.removeEventListener('shown.bs.modal',hide),{once:true});
        hide();
      };
    });
  }
  function setEnabled(kind, enabled) { for(const b of el(kind,'card').querySelectorAll('button,input,textarea')) b.disabled=!enabled; }
  function syncEnabled() {
    for(const kind of Object.keys(labels))setEnabled(kind,loaded&&!loading&&!actionInFlight&&permitted());
    if(retryButton){retryButton.disabled=loading||actionInFlight||!permitted();retryButton.setAttribute('aria-busy',String(loading));}
    if(readStatus)readStatus.textContent=readMessage;
    refreshPreview();
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
    el(kind,'unpublish').hidden=!doc.is_published;
    updateStatus(kind);
  }
  function updateStatus(kind) {
    const s=state.get(kind);if(!s)return;
    let text=s.doc.is_published ? '등록·적용 중' : s.doc.updated_at ? '초안 저장됨 · 미등록' : '미등록';
    if(s.doc.uses_legacy_signup&&!s.doc.is_published)text+=' · 기존 가입 문구 유지 중';
    if(s.doc.has_unpublished_changes)text+=' · 수정 초안 있음';
    if(dirty(kind))text+=' · 저장하지 않은 수정 있음';
    if(s.resultNotice)text+=' · '+s.resultNotice;
    el(kind,'status').textContent=text;el(kind,'status').className='small mt-2 '+(s.doc.is_published?'text-success':'text-muted');
    refreshPreview();
  }
  function showSignupImage(kind,opener){
    if(kind!=='signup_purpose'&&kind!=='signup_privacy')return;
    const Modal=window.bootstrap?.Modal;
    if(!Modal)return myAlert('화면을 열지 못했습니다. 잠시 후 다시 눌러 주세요.','warning');
    let modal=document.getElementById('site-legal-signup-image-modal');
    if(!modal){
      modal=document.createElement('div');modal.id='site-legal-signup-image-modal';modal.className='modal';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','site-legal-signup-image-title');modal.setAttribute('aria-hidden','true');
      modal.innerHTML='<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5" id="site-legal-signup-image-title"></h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"><img id="site-legal-signup-image" width="800" height="681" decoding="async"></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button></div></div></div>';
      modal.addEventListener('hidden.bs.modal',()=>{
        const target=signupImageOpener?.isConnected?signupImageOpener:document.querySelector('[data-legal-signup-image]');signupImageOpener=null;
        if(target?.getClientRects().length)target.focus({preventScroll:true});
      });
      document.body.append(modal);
    }
    signupImageOpener=opener;
    modal.querySelector('h2').textContent=`가입 화면 · ${labels[kind]}`;
    const image=modal.querySelector('img');image.src=new URL(`../assets/ui/signup-${kind==='signup_purpose'?'purpose':'privacy'}-location.jpg?v=20261010-1`,document.baseURI).href;
    image.alt=`조합원 가입 화면 하단의 ${labels[kind]} 표시 위치`;
    Modal.getOrCreateInstance(modal,{keyboard:true,backdrop:true,focus:true}).show(opener);
  }
  function refreshPreview(){
    const target=document.getElementById('site-home-legal-preview');if(!target)return;
    const doc=state.get(selectedKind)?.doc;
    const active=target.querySelector('article[contenteditable="plaintext-only"]');
    const kind=selectedKind,editable=()=>loaded&&previewMode==='draft'&&kind===selectedKind&&permitted()&&!actionInFlight&&!loading;
    if(active&&document.activeElement===active&&editable())return;
    target.replaceChildren();
    const placement=document.createElement('div');placement.className='site-legal-placement';
    const locationTitle=document.createElement('strong');locationTitle.textContent='표시 위치';
    const route=document.createElement('div');route.textContent=locations[selectedKind][0];
    const entry=document.createElement('div');entry.className='site-legal-placement-entry';entry.textContent=locations[selectedKind][1];
    placement.append(locationTitle,route,entry);
    if(selectedKind==='signup_purpose'||selectedKind==='signup_privacy'){
      const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary mt-2';button.textContent='가입 화면 보기';button.setAttribute('data-legal-signup-image',selectedKind);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','site-legal-signup-image-modal');
      button.onclick=()=>showSignupImage(selectedKind,button);placement.append(button);
    }else{
      try{const base=typeof getHomePreviewUrl==='function'?getHomePreviewUrl():null;if(base&&base.protocol==='https:'&&!base.username&&!base.password){const url=new URL(locations[selectedKind][2],base.origin+'/');const link=document.createElement('a');link.className='btn btn-sm btn-outline-secondary mt-2';link.textContent='실제 화면 보기 ↗';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';placement.append(link);}}catch(_){}
    }
    const heading=document.createElement('h2');heading.textContent=labels[selectedKind];
    const modes=document.createElement('div');modes.className='d-flex gap-2 mb-3';
    for(const [mode,label] of [['draft','등록 전 미리보기'],['published','현재 적용 중']]){
      const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary';button.textContent=label;button.setAttribute('aria-pressed',String(previewMode===mode));button.onclick=()=>{previewMode=mode;refreshPreview();};modes.append(button);
    }
    const date=document.createElement('p');date.className='small text-muted';
    const effective=previewMode==='published'?doc?.published_effective_date:el(selectedKind,'effective-date')?.value;
    date.textContent=effective?`시행일 ${effective}`:'';
    const article=document.createElement('article');
    article.textContent=!loaded?(loading?'문서를 불러오는 중입니다.':readMessage||'다시 불러오기를 눌러 문서를 확인해 주세요.'):previewMode==='published'?(doc?.is_published?String(doc.published_content||''):'등록된 내용이 없습니다.'):renderText(el(selectedKind,'content')?.value||'',selectedKind);
    if(editable()){
      article.setAttribute('tabindex','0');article.setAttribute('aria-label','문서 초안 수정');
      article.onclick=()=>{if(!article.isConnected||!editable()||article.hasAttribute('contenteditable'))return;article.textContent=el(kind,'content').value;article.setAttribute('contenteditable','plaintext-only');article.focus();};
      article.onkeydown=event=>{if(event.key==='Enter'&&!article.hasAttribute('contenteditable')){event.preventDefault();article.click();}};
      article.oninput=()=>{if(!article.isConnected||!editable())return;const input=el(kind,'content'),value=article.innerText??article.textContent;if(value.length>input.maxLength){article.textContent=input.value;myAlert('입력할 수 있는 길이를 초과했습니다.','warning');return;}input.value=value;updateStatus(kind);};
      article.onblur=()=>{
        article.removeAttribute('contenteditable');
        if(!article.isConnected||kind!==selectedKind||previewMode!=='draft')return;
        // Keep the pointer/keyboard target connected until its own action runs.
        // Only leave text-edit mode here; switching modes still rebuilds the preview.
        article.textContent=renderText(el(kind,'content').value,kind)||'아직 등록하지 않았습니다.';
      };
      article.onpaste=event=>{event.preventDefault();if(!article.isConnected||!editable())return;const selection=window.getSelection();if(!selection.rangeCount)return;const range=selection.getRangeAt(0);if(!article.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(event.clipboardData?.getData('text/plain')||'');range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);article.dispatchEvent(new Event('input'));};
    }
    target.append(placement,heading,modes,date,article);
  }
  function selectKind(kind){
    if(!Object.hasOwn(labels,kind))return false;
    if(selectedKind!==kind)departSave();
    selectedKind=kind;
    for(const tab of document.querySelectorAll('[data-legal-document]')){const active=tab.dataset.legalDocument===kind;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const [key] of Object.entries(labels))el(key,'card')?.parentElement.toggleAttribute('hidden',key!==kind);
    refreshPreview();return true;
  }
  function render() {
    const root=document.getElementById('sub-legal');if(!root)return;
    root.replaceChildren();
    const grid=document.createElement('div');grid.className='row g-4';root.append(grid);
    for(const [kind,label] of Object.entries(labels)) {
      const column=document.createElement('div');column.className='col-12';
      column.innerHTML=`<div class="card border-0 shadow-sm h-100" id="site-legal-${kind}-card"><div class="card-body">
        <div class="site-legal-actions"><button type="button" class="btn btn-outline-primary" data-legal-action="draft">초안 저장</button><button type="button" class="btn btn-primary" data-legal-action="publish">등록·적용</button></div>
        <div id="site-legal-${kind}-status" class="small mt-2" role="status">불러오는 중</div>
        <p class="small text-muted mt-2 mb-3">초안 저장은 현재 적용 중인 내용을 바꾸지 않습니다.</p>
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><h5 class="fw-bold mb-0">${label}</h5><button type="button" class="btn btn-sm btn-outline-secondary" data-legal-action="sample">샘플 불러오기</button></div>
        ${kind==='privacy'?`<fieldset class="border rounded p-3 mb-3"><legend class="float-none w-auto px-1 fs-6 fw-bold">개인정보 담당자 정보</legend><label class="form-label small fw-bold" for="site-legal-privacy-processor">개인정보처리자</label><input id="site-legal-privacy-processor" class="form-control mb-3" readonly><div class="row g-3">${Object.entries(contacts).map(([key,label])=>`<div class="${key==='address'?'col-12':'col-md-6'}"><label class="form-label small fw-bold" for="site-legal-privacy-${key}">${label} <span class="text-danger">*</span></label><input class="form-control" id="site-legal-privacy-${key}" type="${key==='officer_email'?'email':key==='officer_phone'?'tel':'text'}" maxlength="${key==='address'?300:key==='officer_email'?254:100}" required></div>`).join('')}</div><p class="small text-muted mt-3 mb-0">보호책임자가 개인정보 문의와 권리행사 요청을 받습니다. 담당자 정보는 미리보기에서 확인해 주세요.</p></fieldset>`:''}
        <label class="form-label small fw-bold" for="site-legal-${kind}-effective-date">시행일</label><input type="date" class="form-control mb-3" id="site-legal-${kind}-effective-date">
        <label class="form-label small fw-bold" for="site-legal-${kind}-content">내용</label><textarea class="form-control" style="word-break:keep-all" id="site-legal-${kind}-content" rows="14" maxlength="100000"></textarea>
        </div><div class="card-footer bg-white"><button type="button" class="btn btn-sm btn-outline-danger" id="site-legal-${kind}-unpublish" data-legal-action="unpublish" hidden>등록 해제</button></div></div>`;
      grid.append(column);setEnabled(kind,false);
      el(kind,'content').addEventListener('input',()=>updateStatus(kind));el(kind,'effective-date').addEventListener('change',()=>updateStatus(kind));
      if(kind==='privacy')for(const key of Object.keys(contacts))el(kind,key).addEventListener('input',()=>updateStatus(kind));
      column.addEventListener('click',event=>{const b=event.target.closest('[data-legal-action]');if(!b||b.disabled)return;const action=b.dataset.legalAction;if(action==='sample')loadSample(kind);else save(kind,action);});
    }
    mountTabs();
  }
  function mountTabs(){
    if(el('privacy','card')&&document.getElementById('site-home-legal-preview')&&!document.getElementById('site-legal-document-tabs')){
      const tabs=document.createElement('div');tabs.id='site-legal-document-tabs';tabs.className='site-legal-document-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','가입 안내와 약관 문서');tabs.hidden=window.CoopHomeVisualEditor?.current()!=='legal';
      for(const [kind,text] of Object.entries(labels)){const tab=document.createElement('button');tab.type='button';tab.id=`site-legal-tab-${kind}`;tab.dataset.legalDocument=kind;tab.textContent=text;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`site-legal-${kind}-card`);tab.onclick=()=>selectKind(kind);tab.onkeydown=event=>{const list=[...tabs.children],i=list.indexOf(tab);let next;if(event.key==='ArrowRight')next=(i+1)%list.length;else if(event.key==='ArrowLeft')next=(i+list.length-1)%list.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=list.length-1;else return;event.preventDefault();list[next].click();list[next].focus({preventScroll:true});};tabs.append(tab);el(kind,'card').setAttribute('role','tabpanel');el(kind,'card').setAttribute('aria-labelledby',tab.id);}
      document.getElementById('site-home-visual-workspace').before(tabs);selectKind(selectedKind);
    }
  }
  function fetchDocuments(options={}) {
    if(actionInFlight||!permitted()||window.frameElement?.hidden)return Promise.resolve(false);
    if(readRequest){if(currentRead(readRequest))return readRequest.promise;cancelRead();}
    if(loaded&&!options.reload)return Promise.resolve(false); // A task return never overwrites an edited draft.
    const read={scope:readScope(),signature:readSignature(),controller:new AbortController(),release:null,timer:0,promise:null};
    readRequest=read;loading=true;
    readMessage='가입 안내·약관을 불러오는 중입니다.';syncEnabled();
    const stopped=new Promise((resolve,reject)=>{read.release=resolve;read.timer=window.setTimeout(()=>{read.timedOut=true;read.controller.abort();reject(Error('LEGAL_READ_TIMEOUT'));},15000);});
    read.promise=(async()=>{
      try {
        const result=await Promise.race([Promise.all([
          _supabase.rpc('get_my_site_legal_documents').abortSignal(read.controller.signal),
          _supabase.rpc('get_my_site_legal_context').abortSignal(read.controller.signal)
        ]),stopped]);
        if(!currentRead(read)||result?.cancelled)return false;
        if(read.signature!==readSignature()){readMessage='작성 내용이 바뀌어 조회 결과를 반영하지 않았습니다. 다시 불러오기를 눌러 주세요.';return false;}
        const [docsResult,ctxResult]=result;
        if(docsResult.error||ctxResult.error||!ctxResult.data?.coop_name)throw Error('LEGAL_READ_FAILED');
        context=ctxResult.data;el('privacy','processor').value=context.coop_name;const data=docsResult.data;
        for(const kind of Object.keys(labels))setForm(kind,data?.[kind]);loaded=true;readMessage='';return true;
      } catch(error) {
        if(currentRead(read))readMessage=read.timedOut?'조회가 지연되었습니다. 다시 불러오기를 눌러 주세요.':'가입 안내·약관을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
        return false;
      } finally {
        read.controller.abort();window.clearTimeout(read.timer);
        if(readRequest===read){readRequest=null;loading=false;syncEnabled();}
      }
    })();
    return read.promise;
  }
  async function loadSample(kind) {
    if(!beginAction())return;
    const input=el(kind,'content'),area=window.CoopHomeVisualEditor?.current();
    const signature=()=>JSON.stringify([...el(kind,'card').querySelectorAll('input,textarea')].map(node=>[node.id,node.value]));
    const original=signature();
    const current=()=>selectedKind===kind&&el(kind,'content')===input&&input.isConnected&&!window.frameElement?.hidden&&window.CoopHomeVisualEditor?.current()===area;
    let focusDraft=false;
    try {
      if(el(kind,'content').value.trim() && !(await confirmAction('현재 편집 내용 대신 샘플을 불러올까요? 저장·등록된 문서는 바뀌지 않습니다.')))return;
      if(!permitted()||!current()||signature()!==original)return;
      const sample=window.CoopSiteLegalSamples?.[kind];if(!sample)return myAlert('샘플을 불러오지 못했습니다. 새로고침해 주세요.','warning');
      // Only organization fields are automatic. Never copy a staff member's private contact details.
      el(kind,'content').value=sample.replace(/\{\{(조합명|대표자|주소)\}\}/g,(token,label)=>kind==='privacy'&&label!=='조합명'?token:String(context?.[{'조합명':'coop_name','대표자':'representative','주소':'address'}[label]]||token));
      if(kind==='privacy')for(const key of ['representative','address'])el(kind,key).value=String(context?.[key]||'');
      el(kind,'effective-date').value='';previewMode='draft';updateStatus(kind);focusDraft=true;
    } finally {
      endAction();
      if(focusDraft&&current()&&permitted())document.querySelector('#site-home-legal-preview article[tabindex="0"]')?.focus({preventScroll:true});
    }
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
    const ticket={scope:readScope(),authority:saveAuthority(),kind,state:s,signature:JSON.stringify(input),sent:false,departed:false,cancelConfirmation:null};
    saveTicket=ticket;
    s.busy=true;
    try {
      if((publish||action==='unpublish')&&!(await confirmAction(action==='unpublish'?'등록을 해제할까요? 해당 문구가 더 이상 공개되지 않습니다.':`${labels[kind]}을 등록하고 적용할까요?`,ticket)))return;
      if(!saveActionCurrent(ticket)||JSON.stringify(values(kind))!==ticket.signature)return;
      ticket.sent=true;
      const request=action==='unpublish' ? _supabase.rpc('unpublish_site_legal_document',{p_document_type:kind,p_expected_revision:s.doc.revision||0}) : _supabase.rpc('save_site_legal_document_v2',{p_document_type:kind,p_content:input.content,p_effective_date:input.effective_date||null,p_publish:publish,p_expected_revision:s.doc.revision||0,p_contact_details:input.contact_details||null});
      const {data,error}=await request;if(error)throw error;
      if(saveTicket!==ticket||!saveOwnerCurrent(ticket))return;
      // A late response must not erase a newer draft, even if an adapter changed
      // the original fields while the request was pending. The revision remains
      // the server-confirmed one; preserved edits still need an explicit save.
      const newer=JSON.stringify(values(kind))!==JSON.stringify(input)||(action==='unpublish'&&dirty(kind));
      const raw=newer?{content:el(kind,'content').value,date:el(kind,'effective-date').value,contacts:kind==='privacy'?Object.fromEntries(Object.keys(contacts).map(k=>[k,el(kind,k).value])):null}:null;
      setForm(kind,data);
      ticket.state=state.get(kind);
      if(raw){el(kind,'content').value=raw.content;el(kind,'effective-date').value=raw.date;if(raw.contacts)for(const key of Object.keys(contacts))el(kind,key).value=raw.contacts[key];updateStatus(kind);}
      if(saveActionCurrent(ticket))myAlert(raw?'요청은 반영했습니다. 남아 있는 수정 내용은 아직 저장되지 않았습니다.':action==='unpublish'?'등록을 해제했습니다.':publish?'등록하고 적용했습니다.':'초안을 저장했습니다.','success');
    } catch(error) {if(saveTicket===ticket&&saveOwnerCurrent(ticket)){const messages={LEGAL_DOCUMENT_CHANGED:'다른 사람이 수정했습니다. 편집 내용을 따로 보관한 뒤 다시 불러와 주세요.',LEGAL_CONTACT_REQUIRED:'이사장·주소와 개인정보 보호책임자의 성명·직책·전화번호·이메일을 모두 입력해 주세요.',LEGAL_CONTACT_INVALID:'개인정보 담당자 정보의 입력 형식을 확인해 주세요.',LEGAL_CONTACT_NOT_IN_CONTENT:'담당자 정보가 처리방침 본문에 반영되지 않았습니다. 본문과 등록 전 미리보기를 확인해 주세요.',LEGAL_DOCUMENT_NOT_READY:'시행일·내용과 아직 채우지 않은 샘플 항목을 확인해 주세요.'};const message=messages[error?.message]||'저장하지 못했습니다. 입력 내용은 유지됩니다.';ticket.state.resultNotice=message;updateStatus(kind);if(saveActionCurrent(ticket))myAlert(message,'warning');}}
    finally {if(saveTicket===ticket){saveTicket=null;s.busy=false;ticket.state.busy=false;endAction();}}
  }
  window.fetchSiteLegalDocuments=fetchDocuments;
  window.CoopSiteLegalEditor=Object.freeze({select:selectKind,refreshPreview,mount:mountTabs});
  window.addEventListener('beforeunload',event=>{if(actionInFlight||[...state.keys()].some(dirty)){event.preventDefault();event.returnValue='';}});
  function start(){render();const root=document.getElementById('sub-legal');if(!root)return;retryButton=document.createElement('button');retryButton.type='button';retryButton.className='btn btn-sm btn-outline-secondary mb-3';retryButton.textContent='다시 불러오기';retryButton.onclick=async()=>{
    if(loading||actionInFlight||!permitted())return;
    const scope=readScope(),signature=readSignature();
    actionInFlight=true;syncEnabled();
    let confirmed=false;
    try {confirmed=![...state.keys()].some(dirty)||await confirmAction('저장하지 않은 수정을 버리고 다시 불러올까요?');}
    finally {endAction();}
    if(!confirmed||!sameReadScope(scope)||readSignature()!==signature)return;
    await fetchDocuments({reload:true});
  };readStatus=document.createElement('p');readStatus.id='site-legal-read-status';readStatus.className='small text-muted';readStatus.setAttribute('role','status');readStatus.setAttribute('aria-live','polite');root.prepend(retryButton,readStatus);syncEnabled();
    const cancelStale=()=>{if(readRequest&&!currentRead(readRequest))cancelRead();if(saveTicket&&!saveActionCurrent(saveTicket))departSave();};
    for(const name of ['hidden.bs.tab','shown.bs.tab'])document.getElementById('site-content-tabs')?.addEventListener(name,cancelStale);
    if(window.frameElement)new MutationObserver(cancelStale).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
    window.addEventListener('pagehide',()=>{cancelRead();departSave();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
