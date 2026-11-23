/* v1.3.0 — Keep the last verified task list within the current work scope. */
(function (host) {
 'use strict';
 const links = Object.freeze({
  tax:['세무 할 일','accounting.html?work=taxes'],
  contract_target:['근로계약 대상 확인 필요',''],contract_missing:['계약 미등록',''],
  contract_terms:['근로조건 입력 필요',''],contract_signatures:['계약 서명 대기',''],
  badge_reply:['뱃지 제안에 새 답변',''],
  approval:['내 결재 대기','approval.html?tab=todo'], signup:['신규 가입 승인 대기','admin_member.html?scope=member_admin&tab=members&sub=signup-pending'], member:['처리 대기 조합원 신청','admin_member.html?scope=member_admin&tab=applications&sub=pending-all'],
  insurance:['준비 중인 입사·퇴사 서류','hr_insurance.html?work=pending'], receipts:['현금영수증 발급 대기','festival_receipts.html'],
  inventory:['입고 검수 대기','festival_receipts.html?work=inventory'], material:['아직 받지 않은 행사 재료비','festival_receipts.html'],
  company:['조합 기본정보','admin_employee.html?section=settings'], capital:['출자 기준','admin_member.html?scope=member_admin&sub=capital'],
  notifications:['카톡 채널 연결','admin_member.html?scope=member_admin&tab=notifications&sub=settings'],
  signup_purpose:['가입 안내 · 설립목적','admin_member.html?scope=site_admin&tab=site&sub=legal&document=signup_purpose'],
  signup_privacy:['가입 개인정보 수집·이용 동의','admin_member.html?scope=site_admin&tab=site&sub=legal&document=signup_privacy'],
  terms:['홈페이지 이용약관','admin_member.html?scope=site_admin&tab=site&sub=legal&document=terms'], privacy:['개인정보 처리방침','admin_member.html?scope=site_admin&tab=site&sub=legal&document=privacy'],
  domain:['홈페이지·ERP 도메인',''],deposit:['출자금 납입 안내 계좌',''],seal:['출자증서용 조합 직인',''],payment_policy:['가입 출자금 납입기한','admin_member.html?scope=member_admin&sub=payment-policy']
 });
 const labels={ready:'등록됨',missing:'확인 필요',default:'기본 기준 · 확인 필요',legacy:'기존 적용본 유지',connected:'연결됨',optional:'선택 사항 · 미연결',unavailable:'조회 실패 · 다시 확인'};
 const RESUME_TTL_MS=30000; // Same focus/visibility window as the setup checklist.
 function setupRoutes(rt,coop){
  if(!rt||rt.coop_id!==coop||rt.is_active===false)return {};
  const rights=new Set(rt.effective_permissions||[]),enabled=k=>rt.modules?.[k]!==false;
  const member=rights.has('member.admin')&&enabled('member_admin'),site=rights.has('site.admin')&&enabled('site_admin');
  const civic=rt.runtime_profile==='site_member';
  const certificate=civic&&(member||site)?'admin_member.html?scope='+(member?'member_admin':'site_admin&tab=site')+'&sub=certificate-settings&focus=':
   !civic&&rights.has('hr.admin')&&enabled('hr')?'admin_employee.html?section=settings&focus=':
   rt.initial_setup?.active===true&&rt.initial_setup?.areas?.basic===true?'initial_setup.html?focus=':'';
  return {certificate,deadline:member,civic};
 }
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let binding;
 function mount(options) {
  if(binding) {binding.invalidate();binding=undefined;}
  const container=document.getElementById('workOverview');if(!container)return;
  container.replaceChildren();const sections=[],controllers=new Map(),panels=new Map();
  const key=()=>{
   const c=options.context(),rt=options.runtime?.();
   if(!c?.coop_id||!c.actor||rt&&(rt.coop_id!==c.coop_id||rt.is_active===false))return '';
   return JSON.stringify([c.coop_id,c.auth||c.actor,c.actor,rt?.runtime_profile||'',
    [...(c.permissions||rt?.effective_permissions||[])].sort(),Object.entries(rt?.modules||{}).sort(([a],[b])=>a.localeCompare(b))]);
  };
  const owner=key();
  let dialog=null,dialogReturnFocus=null,disposed=false,summaryPending=null,readSequence=0,lastTaskTicket=0,lastSetupTicket=0,contractListGeneration=0,contractListController=null;
  let taskCountsReady=false,refreshAttemptAt=null,changeRevision=0,queuedChange=false;
  const current=()=>!disposed&&key()===owner&&!!owner&&container.isConnected&&!container.closest('.hidden');
  function ensureScope(){
   if(disposed)return false;
   const next=key();
   if(next!==owner){
    if(next)mount(options);else host.ErpWorkOverview.clear();
    return false;
   }
   return current();
  }
  const extras=()=>setupRoutes(options.runtime?.(),options.context()?.coop_id);
  async function readSetupExtra(group,paths){
   const coop=options.context()?.coop_id,controller=new AbortController();let timer;
   controllers.set(controller,'setup-extra');
   const unavailable=key=>({key,state:'unavailable'});
   async function get(name,args){
    const request=options.client.rpc(name,args);
    const res=await Promise.race([request.abortSignal?request.abortSignal(controller.signal):request,new Promise((_,reject)=>{
     if(controller.signal.aborted)reject(Error('SETUP_EXTRA_TIMEOUT'));
     else controller.signal.addEventListener('abort',()=>reject(Error('SETUP_EXTRA_TIMEOUT')),{once:true});
    })]);
    if(res.error)throw Object.assign(Error('SETUP_READ_FAILED'),{code:res.error.code,status:res.status??res.error.status});return res.data;
   }
   timer=setTimeout(()=>controller.abort(),15000);
   try{
   if(group==='certificate'){
    let data;
    if(paths.civic){
     // This is the same existing read as the civic settings dialog.
     const d=await get('get_my_site_member_org_settings');if(!d||typeof d.coop_name!=='string')throw Error('SETUP_SCOPE');
     data={bank:d.member_capital_deposit_bank,account:d.member_capital_deposit_account,holder:d.member_capital_deposit_holder,seal_path:d.seal_url};
    }else{data=await get('erp_coop_certificate_setup',{p_action:'get'});if(data?.coop_id!==coop)throw Error('SETUP_SCOPE');}
    const filled=v=>typeof v==='string'&&!!v.trim();
    return [{key:'deposit',state:[data.bank,data.account,data.holder].every(filled)?'ready':'missing'}, {key:'seal',state:filled(data.seal_path)?'ready':'missing'}];
   }
    const d=await get('erp_member_admission_policy',{p_action:'get'});
    if(d?.coop_id!==coop||!(d.payment_days===null||Number.isInteger(d.payment_days)&&d.payment_days>=0&&d.payment_days<=365))throw Error('SETUP_SCOPE');
    return [{key:'payment_policy',state:d.payment_days===null?'missing':'ready',days:d.payment_days}];
   }catch(e){
    if(readDenied(e))return [];
    return (group==='certificate'?['deposit','seal']:['payment_policy']).map(unavailable);
   }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  const readDenied=e=>[401,403].includes(Number(e?.status))||['42501','PGRST301','PGRST302'].includes(String(e?.code));
  async function read(section){
   const ticket=++readSequence,controller=new AbortController();controllers.set(controller,section);let timer;
   if(section==='tasks')refreshAttemptAt=Date.now();
   // Reserve the boundary when a read starts, including reads that later fail.
   if(section==='summary'||section==='tasks')lastTaskTicket=ticket;
   if(section==='summary'||section==='setup')lastSetupTicket=ticket;
   try{
    const requested=section==='tasks'?'tasks_v2':section;
    const request=Promise.resolve().then(()=>{const q=options.client.rpc('erp_get_work_overview_badge_replies',{p_section:requested});return q.abortSignal?q.abortSignal(controller.signal):q;});
    const response=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
    if(!current())throw Error('SCOPE_CHANGED');
    if(response.error)throw Object.assign(Error('READ_FAILED'),{code:response.error.code,status:response.status??response.error.status});
    const data=response.data;
    if(data?.coop_id!==options.context().coop_id||data?.section!==requested||!Array.isArray(data.items))throw Error('SCOPE_CHANGED');
    return {data,ticket};
   }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  function counts(data,ticket){
   if(ticket<lastTaskTicket)return false;
   const keys=new Set();let total=0;
   for(const item of data.items){
    if(!['approval','signup','member','insurance','receipts','inventory','material','tax','contract_target','contract_missing','contract_terms','contract_signatures','badge_reply'].includes(item.key)||keys.has(item.key)||!Number.isSafeInteger(item.count)||item.count<0)throw Error('COUNT_UNAVAILABLE');
    keys.add(item.key);total+=item.count;
   }
   if(!Number.isSafeInteger(total))throw Error('COUNT_UNAVAILABLE');
   lastTaskTicket=ticket;const panel=panels.get('tasks'),badge=panel.badge;
   // A task kind disappearing from the server response can be a permission
   // change. Do not keep rendering that unverified list, even on network error.
   if(panel.hasRemovedKind(keys)){panel.clearRows();closeDialog(true);}
   badge.textContent=total?'대기 '+total.toLocaleString('ko-KR')+'건':data.items.some(x=>x.key==='tax'&&x.configured===false)?'세무 주기 확인 필요':'대기 업무 없음';
   badge.className=total?'badge text-bg-danger ms-2':'small text-muted ms-2';
   taskCountsReady=true;
   options.onTasks?.(data.items,'ready');
   return true;
  }
  function setupVisibility(value,ticket,fromSummary=false){
   if(ticket<lastSetupTicket)return false;
   if(typeof value?.can_view!=='boolean'||typeof value.complete!=='boolean'||!Number.isSafeInteger(value.required_count)||!Number.isSafeInteger(value.pending_count)
    ||value.required_count<0||value.pending_count<0||value.pending_count>value.required_count||value.can_view!==(value.required_count>0)
    ||value.complete!==(value.required_count>0&&value.pending_count===0))throw Error('STATE_UNAVAILABLE');
   lastSetupTicket=ticket;
   panels.get('setup').updateSummary(value,fromSummary);
   return true;
  }
  function failTasks(ticket,message,error){
   if(!current()||ticket<lastTaskTicket)return;
   const panel=panels.get('tasks');
   if(readDenied(error)){panel.clearRows();closeDialog(true);taskCountsReady=false;}
   if(!taskCountsReady){
    panel.badge.textContent='확인 필요';panel.badge.className='badge text-bg-warning ms-2';options.onTasks?.(null,'failed');
   }
   panel.status.textContent=panel.hasRows()?'최신 목록을 확인하지 못했습니다. 이전 목록을 표시합니다.':message;
  }
  function refresh(reason){
   if(!ensureScope())return null;
   if(reason==='change')changeRevision++;
   if(summaryPending){if(reason==='change')queuedChange=true;return summaryPending;}
   refreshAttemptAt=Date.now();
   const panel=panels.get('tasks'),revision=changeRevision;
   panel.markStale();closeDialog(true);
   if(!taskCountsReady){
    panel.badge.textContent='확인 중…';panel.badge.className='small text-muted ms-2';options.onTasks?.(null,'loading');
   }
   panel.status.textContent=panel.hasRows()?'이전 목록을 표시하며 최신 목록을 확인하는 중…':'대기 건수를 확인하는 중…';
   const attemptTicket=readSequence+1;
   panels.get('setup').beginSummary();
   summaryPending=(async()=>{try{
    const {data,ticket}=await read('summary');
    setupVisibility(data.setup,ticket,true);
    if(revision===changeRevision&&counts(data,ticket)){
     if(panel.root.open&&ticket===lastTaskTicket)await panel.load(true);
     else if(!panel.hasRows())panel.status.textContent=data.items.some(item=>item.count>0)?'대기 건수를 확인했습니다. 펼치면 목록을 볼 수 있습니다.':'현재 확인할 대기 업무가 없습니다.';
    }
   }catch(error){if(current()){
    if(revision===changeRevision){
     panel.pauseDetail();
     failTasks(attemptTicket,'대기 건수와 설정 상태를 확인하지 못했습니다. 다시 확인해 주세요.',error);
    }
    const setup=panels.get('setup');
    if(attemptTicket>=lastSetupTicket){
     if(readDenied(error)){setup.root.hidden=true;setup.root.open=false;setup.reset();}
     else setup.failSummary();
    }
   }}})().finally(()=>{
    summaryPending=null;panel.syncRetry();
    if(queuedChange){queuedChange=false;if(current())void refresh();}
   });
   panel.syncRetry();
   return summaryPending;
  }
  function closeDialog(restoreFocus=false){
   contractListGeneration++;contractListController?.abort();contractListController=null;
   const closing=dialog,returnFocus=dialogReturnFocus;dialog=null;dialogReturnFocus=null;
   if(closing){closing.remove();if(restoreFocus)returnFocus?.();}
  }
  function showBadgeReplies(section){
   showList(links.badge_reply[0],[],section);const opened=dialog;
   opened.querySelector('p')?.remove();
   const status=el('p','small text-muted mb-2',''), list=el('div','d-grid gap-2 mb-2');
   status.setAttribute('role','status');
   const retry=el('button','btn btn-sm btn-outline-primary mb-2','다시 확인');retry.type='button';retry.hidden=true;
   opened.insertBefore(status,opened.lastChild);opened.insertBefore(retry,opened.lastChild);opened.insertBefore(list,opened.lastChild);
   const live=()=>current()&&dialog===opened;
   const coop=options.context()?.coop_id, uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   let changed=false, loading=false, loadController=null, pending=0;
   opened.addEventListener('close',()=>{loadController?.abort();if(changed&&current()&&!dialog)void refresh('change');},{once:true});
   async function call(args,controller){
    if(controller)controllers.set(controller,'badge-replies');
    let timer;
    try{
     const q=options.client.rpc('badge_suggestion_reply_tasks',args);
     const res=await Promise.race([controller&&q.abortSignal?q.abortSignal(controller.signal):q,
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('REPLY_TIMEOUT'));},15000);})]);
     if(res.error||!res.data||res.data.coop_id!==coop)throw Error('REPLY_UNAVAILABLE');
     return res.data;
    }finally{clearTimeout(timer);if(controller)controllers.delete(controller);}
   }
   const preservingText=(cls,text)=>{const p=el('p',cls,text);p.style.whiteSpace='pre-wrap';p.style.overflowWrap='anywhere';return p;};
   function add(row){
    const block=el('article','border rounded p-3');
    block.append(preservingText('mb-2',row.idea),el('strong','d-block mb-1',row.decision==='made'?'반영했어요':'어려워요'),
     preservingText('mb-2',row.reply));
    const seen=el('button','btn btn-sm btn-outline-secondary','읽음 처리'), hint=el('span','small ms-2','');
    seen.type='button';hint.setAttribute('role','status');
    let running=false,done=false;
    seen.onclick=async()=>{
     if(!live()||running||done)return;
     running=true;pending++;seen.setAttribute('aria-disabled','true');hint.textContent='확인 중…';
     try{
      const data=await call({p_action:'ack',p_id:row.id});
      if(data.id!==row.id||data.seen!==true)throw Error('REPLY_UNAVAILABLE');
      changed=true;done=true;
      if(live()){seen.textContent='읽음';hint.textContent='';}
     }catch{
      if(live())hint.textContent='읽음 처리를 확인하지 못했어요. 다시 눌러 주세요.';
     }finally{
      running=false;pending--;
      if(live()&&!done)seen.removeAttribute('aria-disabled');
      if(!live()&&changed&&pending===0&&current()&&!dialog)void refresh('change');
     }
    };
    block.append(seen,hint);list.append(block);
   }
   async function load(){
    if(!live()||loading)return;
    loading=true;const controller=new AbortController();loadController=controller;retry.disabled=true;
    status.textContent='불러오는 중…';
    try{
     const data=await call({p_action:'list'},controller);
     if(!live())return;
     if(!Array.isArray(data.items)||data.items.length>30||data.items.some(row=>!uuid.test(row?.id)||typeof row.idea!=='string'
       ||typeof row.reply!=='string'||!['made','unavailable'].includes(row.decision)))throw Error('REPLY_UNAVAILABLE');
     list.replaceChildren();data.items.forEach(add);
     status.textContent=data.items.length===30?'최근 답변 30건을 보여줘요.':'';
     if(!data.items.length)status.textContent='아직 새 답변이 없어요.';
     const focused=document.activeElement===retry;retry.hidden=true;
     if(focused)opened.querySelector('h2')?.focus();
    }catch{if(live()){retry.hidden=false;status.textContent='새 답변을 불러오지 못했어요.';}}
    finally{loading=false;if(live())retry.disabled=false;if(loadController===controller)loadController=null;}
   }
   const heading=opened.querySelector('h2');if(heading)heading.tabIndex=-1;
   retry.onclick=()=>void load();void load();
  }
  function showContractList(task,section){
   showList(links[task][0],[],section);const opened=dialog;
   opened.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||event.defaultPrevented)return;
    const targets=[...opened.querySelectorAll('button:not(:disabled),a[href]')].filter(node=>!node.hidden);
    if(!targets.length)return;
    const i=targets.indexOf(document.activeElement);
    if(event.shiftKey?i<=0:i<0||i===targets.length-1){event.preventDefault();targets[event.shiftKey?targets.length-1:0].focus({preventScroll:true});}
   });
   // Keep header, close/retry controls and the fixed dialog size while results change.
   opened.querySelector('p')?.remove();opened.style.height='min(560px,80vh)';
   const content=el('div',''),status=el('p','small text-muted','');status.setAttribute('role','status');
   const retry=el('button','btn btn-sm btn-outline-primary me-2 mb-2','다시 확인');retry.type='button';
   opened.insertBefore(status,opened.lastChild);opened.insertBefore(retry,opened.lastChild);opened.insertBefore(content,opened.lastChild);
   async function load(){
    if(!current()||dialog!==opened||retry.disabled)return;
    const generation=++contractListGeneration,controller=new AbortController();contractListController=controller;
    const valid=()=>current()&&dialog===opened&&generation===contractListGeneration;
    let timer;retry.disabled=true;content.replaceChildren();status.textContent='불러오는 중…';
    try{
     const q=options.client.rpc('erp_hr_contract_followup',{p_action:'list',p_target:task});
     const response=await Promise.race([q.abortSignal?q.abortSignal(controller.signal):q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
     if(!valid())return;
     const data=response.data;
     if(response.error||data?.coop_id!==options.context().coop_id||!Array.isArray(data.items)
       ||data.items.some(row=>typeof row.emp_id!=='string'||typeof row.emp_name!=='string'||row.task!==task))throw Error('READ_FAILED');
     const rows=data.items.slice(0,500);
     for(const [i,row]of rows.entries()){
      const a=el('a','d-block border rounded p-3 mb-2',`${i+1}. ${row.emp_name}`);
      a.href=(task==='contract_target'?'admin_employee.html':'employment_contracts.html')+'?employee='+encodeURIComponent(row.emp_id)+'&work='+task;content.append(a);
     }
     status.textContent=data.items.length>500?'500명까지 표시했습니다. 직원 관리에서 나머지 직원을 확인해 주세요.':rows.length?`${rows.length.toLocaleString('ko-KR')}명`:'현재 확인할 직원이 없습니다.';
    }catch(_){if(valid())status.textContent='명단을 불러오지 못했습니다. 다시 확인해 주세요.';}
    finally{clearTimeout(timer);if(valid())retry.disabled=false;if(contractListController===controller)contractListController=null;}
   }
   retry.onclick=()=>void load();void load();
  }
  function showList(title,entries,section){
   closeDialog();const opener=document.activeElement;
   const opened=dialog=el('dialog','border rounded p-4');dialog.style.cssText='width:min(560px,calc(100% - 32px));max-height:80vh;overflow:auto;word-break:keep-all';
   dialogReturnFocus=()=>{if(current())(opener?.isConnected&&!opener.disabled?opener:panels.get(section)?.root.querySelector('summary'))?.focus({preventScroll:true});};
   const heading=el('h2','h5',title);heading.id='work-overview-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading);
   if(!entries.length)dialog.append(el('p','text-secondary',title==='등록된 홈페이지·ERP 주소'?'등록된 주소가 없습니다.':'현재 확인할 대기 업무가 없습니다.'));
   for(const item of entries){const row=item.href?el('a','d-block border rounded p-3 mb-2',item.label):el('p','border rounded p-3 mb-2',item.label);if(item.href)row.href=item.href;dialog.append(row);}
   const close=el('button','btn btn-secondary','닫기');close.type='button';close.onclick=()=>opened.close();dialog.append(close);
   dialog.addEventListener('close',()=>{if(dialog===opened)closeDialog(true);},{once:true});document.body.append(dialog);dialog.showModal();
  }
  function mountSetupPanel(root,status,list,retry){
   const names=['base','certificate','deadline'];
   // Only reuse a recently confirmed result in this active overview instance.
   // A new entry, role change or tab suspension requires a fresh server read.
   const groups=new Map(names.map(name=>[name,{phase:'idle',scope:'',serial:0,rows:null,items:null,checkedAt:0}]));
   let baseSummary=null,summaryPhase='idle';
   const timestamp=()=>new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
   function scopeFor(name,paths){
    const runtime=options.runtime?.();
    const context=JSON.stringify([owner,runtime?.coop_id,runtime?.is_active,runtime?.runtime_profile,
     [...(runtime?.effective_permissions||[])].sort(),runtime?.modules]);
    if(name==='certificate')return paths.certificate?context+'|'+paths.certificate:'';
    if(name==='deadline')return paths.deadline?context+'|member':'';
    return context;
   }
   function clearGroup(group){++group.serial;group.phase='idle';group.rows?.remove();group.rows=null;group.items=null;group.checkedAt=0;}
   function syncScope(){
    const paths=extras();
    for(const [name,group] of groups){const next=scopeFor(name,paths);if(group.scope!==next){clearGroup(group);group.scope=next;}}
   }
   function syncVisibility(){
    if(['loading','failed'].includes(summaryPhase))return;
    if(!baseSummary)return;
    const extraGroups=names.slice(1).map(name=>groups.get(name)).filter(group=>group.scope);
    const hasIncomplete=group=>group.phase==='failed'||group.items?.some(item=>!['ready','legacy'].includes(item.state));
    root.hidden=!(baseSummary.can_view&&!baseSummary.complete||groups.get('base').phase==='failed'||extraGroups.some(hasIncomplete));
    if(root.hidden)root.open=false;
   }
   function updateSummary(value,fromSummary){
    baseSummary=value;summaryPhase='ready';syncScope();
    if(fromSummary&&(!value.can_view||value.complete)){
     if(groups.get('base').phase==='failed')clearGroup(groups.get('base'));
    }
    syncVisibility();
    // Only complete base settings need collapsed extra checks; incomplete settings stay lazy.
    if(!document.hidden&&(!value.can_view||value.complete)){
     const paths=extras();
     for(const name of names.slice(1)){const group=groups.get(name);if(group.scope&&(group.phase==='idle'||fromSummary&&group.phase==='ready'&&!freshComplete(group)))void loadGroup(name,paths);}
    }
    if(fromSummary&&root.open&&!root.hidden&&groups.get('base').phase==='idle')void loadGroup('base',extras());
    renderStatus();
   }
   function freshComplete(group){return group.checkedAt>0&&Date.now()-group.checkedAt<30000;}
   const expireExtras=()=>{for(const name of names.slice(1)){
    const group=groups.get(name);group.checkedAt=0;
    if(group.phase==='loading')clearGroup(group);
   }};
   function resumeChecks(){
    if(document.hidden){expireExtras();return;}
    // Recheck only settings that went stale; do not restart the work count.
    if(current()&&summaryPhase==='ready'&&baseSummary&&(!baseSummary.can_view||baseSummary.complete))updateSummary(baseSummary,true);
   }
   document.addEventListener('visibilitychange',resumeChecks);
   function renderStatus(){
    const available=[...groups.values()].filter(group=>group.scope), loading=available.some(group=>group.phase==='loading');
    const summaryFailed=summaryPhase==='failed',summaryLoading=summaryPhase==='loading';
    const failed=summaryFailed||available.some(group=>group.phase==='failed');
    status.textContent=summaryFailed?'설정 상태를 확인하지 못했습니다. 다시 확인해 주세요.':summaryLoading?'설정 상태를 확인하는 중…':loading?(list.childElementCount?'나머지 항목 확인 중…':'불러오는 중…')
     :failed?'일부 항목을 확인하지 못했습니다.':list.childElementCount?'확인 시각 '+timestamp():'현재 권한으로 확인할 항목이 없습니다.';
    const focused=document.activeElement===retry;
    retry.hidden=!failed&&!focused;
    retry.disabled=summaryLoading||!failed&&!focused;
    retry.setAttribute('aria-disabled',String(summaryLoading||!failed));
    retry.textContent=summaryLoading?'확인 중…':summaryFailed?'설정 상태 다시 확인':failed?'실패한 항목 다시 확인':loading?'확인 중…':'확인 완료';
   }
   function paint(name,items,paths){
    const group=groups.get(name),rows=el('div','d-grid gap-2');
    for(const item of items){
     const entry=links[item.key];if(!entry||!labels[item.state])throw Error('STATE_UNAVAILABLE');
     const row=el('div','d-flex flex-wrap align-items-center justify-content-between gap-3 border rounded p-2');
     let href=entry[1];
     if(item.key==='deposit'||item.key==='seal')href=paths.certificate+item.key;
     if(item.key==='capital'&&items.some(x=>x.key==='company'))href='admin_employee.html?section=settings&focus=capital';
     const link=el(item.key==='domain'?'button':'a',item.key==='domain'?'btn btn-link text-start p-0 text-decoration-none':'text-decoration-none',entry[0]);
     if(item.key==='domain'){link.type='button';link.onclick=()=>{
      if(!current()||root.hidden||!root.open||!rows.isConnected||group.rows!==rows||group.scope!==scopeFor(name,extras()))return;
      const addresses=(item.domains||[]).filter(x=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(x));
      showList('등록된 홈페이지·ERP 주소',addresses.map(x=>({label:'https://'+x})),'setup');
     };}else link.href=href;
     const label=['signup_purpose','signup_privacy'].includes(item.key)&&item.state==='missing'?'미적용 · 문서 확인 필요':labels[item.state];
     const right=el('span','small text-end',label);
     if(item.key==='payment_policy'&&item.state==='ready')right.textContent=item.days===0?'기한 없음으로 설정됨':`${item.days}일로 설정됨`;
     if(item.key==='capital')right.append(el('span','d-block text-muted',`최소 ${Number(item.minimum).toLocaleString('ko-KR')}원 · 1좌 ${Number(item.unit).toLocaleString('ko-KR')}원`));
     row.append(link,right);rows.append(row);
    }
    group.rows?.remove();group.rows=null;
    if(items.length){group.rows=rows;list.insertBefore(rows,names.slice(names.indexOf(name)+1).map(n=>groups.get(n).rows).find(Boolean)||null);}
   }
   async function loadGroup(name,paths){
    const group=groups.get(name),scope=group.scope,serial=++group.serial;group.phase='loading';
    const valid=()=>current()&&!document.hidden&&(name!=='base'||!root.hidden)&&serial===group.serial&&scope===scopeFor(name,extras());
    try{
     let items,visibility;
     if(name==='base'){
      const {data,ticket}=await read('setup');if(!valid())return;
      const required=data.items.filter(item=>item.key!=='notifications'),pending=required.filter(item=>!['ready','legacy'].includes(item.state)).length;
      if(data.items.some(item=>!links[item.key]||!labels[item.state]))throw Error('STATE_UNAVAILABLE');
      if(ticket<lastSetupTicket){group.phase='idle';return;}
      visibility={value:{can_view:required.length>0,complete:required.length>0&&pending===0,required_count:required.length,pending_count:pending},ticket};
      items=data.items;
     }else{items=await readSetupExtra(name,paths);if(!valid())return;}
     paint(name,items,paths);
     group.items=items;
     group.phase=items.some(item=>item.state==='unavailable')?'failed':'ready';
     group.checkedAt=name!=='base'&&items.length>0&&items.every(item=>['ready','legacy'].includes(item.state))?Date.now():0;
     if(visibility)setupVisibility(visibility.value,visibility.ticket);else syncVisibility();
    }catch(error){if(valid()){if(readDenied(error)){paint(name,[],paths);group.items=[];group.phase='ready';}else group.phase='failed';syncVisibility();}}
    finally{
     if(valid()){syncVisibility();if(!root.hidden)renderStatus();}
     else if(current()&&!root.hidden&&serial===group.serial){syncScope();syncVisibility();if(!root.hidden)renderStatus();}
    }
   }
   function load(failedOnly=false){
    if(!current()||!root.open||root.hidden)return;
    if(summaryPhase==='loading'||summaryPhase==='failed')return;
    syncScope();const paths=extras();
    for(const name of names){const group=groups.get(name);if(group.scope&&group.phase!=='loading'&&(failedOnly?group.phase==='failed':!freshComplete(group)))void loadGroup(name,paths);}
    renderStatus();
   }
   const reset=()=>{baseSummary=null;summaryPhase='idle';for(const group of groups.values())clearGroup(group);retry.hidden=true;status.textContent='';};
   const beginSummary=()=>{summaryPhase='loading';syncVisibility();renderStatus();};
   const failSummary=()=>{summaryPhase='failed';syncVisibility();renderStatus();};
   panels.set('setup',{root,status,list,reset,syncScope,updateSummary,beginSummary,failSummary});
   root.addEventListener('toggle',()=>{if(root.open)load();});
   retry.hidden=true;
   retry.onclick=async()=>{
    if(!current()||root.hidden||!root.open||retry.getAttribute('aria-disabled')==='true')return;
    if(summaryPhase!=='failed'){load(true);return;}
    await refresh();
    if(!current()||root.hidden||!root.open||summaryPhase!=='ready')return;
    syncScope();const paths=extras(),base=groups.get('base');
    if(base.phase==='idle')void loadGroup('base',paths);
    load(true);
   };
   retry.addEventListener('blur',()=>{if(!root.hidden&&current())renderStatus();});
   sections.push(()=>{document.removeEventListener('visibilitychange',resumeChecks);root.open=false;reset();});
  }
  for(const [section,title] of [['tasks','📌 내 업무 모아보기'],['setup','✅ 조합 설정 점검표']]) {
   const root=el('details','border rounded p-3 mb-2 bg-white'),heading=el('summary','fw-bold',title);
   root.dataset.overviewSection=section;root.hidden=section==='setup';
   const badge=el('span','small text-muted ms-2',section==='tasks'?'확인 중…':'');badge.setAttribute('role','status');heading.append(badge);
   const body=el('div','pt-3'),status=el('p','small text-muted mb-2',''),list=el('div','d-grid gap-2');
   status.setAttribute('role','status');const retry=el('button','btn btn-sm btn-outline-secondary mt-2','다시 확인');retry.type='button';
   if(section==='setup')body.append(el('p','small mb-2','가입을 열기 전 설립목적·가입 개인정보 동의와 출자 기준을 확인해 주세요. 납입 계좌는 입금 안내에, 조합 직인은 출자증서에 사용됩니다. 이 점검표와 임시 권한 부여 종료는 별도입니다.'));
   body.append(status,list,retry);root.append(heading,body);container.append(root);
   if(section==='setup'){mountSetupPanel(root,status,list,retry);continue;}
   let needsDetail=true,detailPending=null,rendered=null;
   const syncRetry=()=>{const locked=!!(detailPending||summaryPending);retry.disabled=locked;list.querySelectorAll('button').forEach(button=>{button.disabled=locked;});};
   const clearRows=()=>{rendered=null;list.replaceChildren();};
   panels.set(section,{root,status,badge,syncRetry,load,hasRows:()=>!!rendered,
    hasRemovedKind:keys=>rendered?.keys.some(k=>!keys.has(k)),clearRows,
    markStale:()=>{needsDetail=true;},pauseDetail:()=>{needsDetail=false;}});
   function load(afterSummary=false) {
    if(!root.open||!ensureScope())return null;
    if(summaryPending&&!afterSummary)return summaryPending;
    if(detailPending)return afterSummary?detailPending.then(()=>load(true)):detailPending;
    if(!needsDetail)return null;
    needsDetail=false;
    const attemptTicket=readSequence+1,revision=changeRevision;
    status.textContent=rendered?'이전 목록을 표시하며 최신 목록을 확인하는 중…':'불러오는 중…';
    detailPending=(async()=>{try {
     const {data,ticket}=await read(section);if(!current()||revision!==changeRevision)return;
     if(!counts(data,ticket))return;
     const next={keys:data.items.map(item=>item.key)},rows=[];
     for(const item of data.items) {
      const entry=links[item.key];if(!entry)throw new Error('UNKNOWN_ITEM');
      const row=el('div','d-flex align-items-center justify-content-between gap-3 border rounded p-2');
      const href=entry[1];
      const choose=['receipts','material','badge_reply'].includes(item.key)||item.key.startsWith('contract_');
      const link=el(choose?'button':'a',choose?'btn btn-link text-start p-0 text-decoration-none':'text-decoration-none',entry[0]);
      if(choose){link.type='button';link.onclick=()=>{
       if(!current()||rendered!==next||detailPending||summaryPending)return;
       if(item.key==='badge_reply'){showBadgeReplies(section);return;}
       if(item.key.startsWith('contract_')){showContractList(item.key,section);return;}
        const targets=(item.targets||[]).filter(x=>x.event_id==='unassigned'||/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.event_id));
        showList(entry[0],targets.map(x=>({label:String(x.label)+' · '+Number(x.count).toLocaleString('ko-KR')+'건',href:'festival_receipts.html?work='+item.key+'&event='+encodeURIComponent(x.event_id)})),section);
      };}else link.href=href;
      row.append(link);
       if(!Number.isSafeInteger(item.count)||item.count<0)throw new Error('COUNT_UNAVAILABLE');
       row.append(el('span',item.count?'badge text-bg-primary':'text-muted small',item.key==='tax'&&item.configured===false?(item.count?`${item.count.toLocaleString('ko-KR')}건 · 주기 확인`:'주기 미설정'):`${item.count.toLocaleString('ko-KR')}${item.key.startsWith('contract_')?'명':'건'}`));
      rows.push(row);
     }
     list.replaceChildren(...rows);rendered=next;
     status.textContent=data.items.length?`확인 시각 ${new Date(data.generated_at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}`:'현재 권한으로 확인할 항목이 없습니다.';
    }catch(error){
     if(revision===changeRevision)failTasks(attemptTicket,'불러오지 못했습니다. 다시 확인하거나 기존 업무 메뉴를 이용해 주세요.',error);
    }})().finally(()=>{detailPending=null;syncRetry();});
    syncRetry();return detailPending;
   }
   root.addEventListener('toggle',()=>{if(root.open)void load();});
   retry.onclick=()=>{if(!retry.disabled)void refresh();};
   sections.push(()=>{root.open=false;clearRows();status.textContent='';});
  }
  const resume=(event)=>{
   if(document.hidden||!ensureScope()||dialog||summaryPending)return;
   if(event?.type==='pageshow'&&!event.persisted)return;
   if(event?.persisted||refreshAttemptAt===null||Date.now()-refreshAttemptAt>=RESUME_TTL_MS)void refresh();
  };
  host.addEventListener('focus',resume);host.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',resume);
  sections.push(()=>{host.removeEventListener('focus',resume);host.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);});
  binding={refresh,invalidate:()=>{disposed=true;controllers.forEach((_,c)=>c.abort());closeDialog();sections.forEach(fn=>fn());}};
  // A single scoped count/status read; detailed targets and configuration remain lazy.
  Promise.resolve().then(()=>{if(!disposed)void refresh();});
 }
 host.ErpWorkOverview=Object.freeze({mount,refresh:()=>binding?.refresh()||null,clear:()=>{binding?.invalidate();binding=undefined;document.getElementById('workOverview')?.replaceChildren();}});
})(window);
