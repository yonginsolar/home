/* v1.2.5 — Hide the setup checklist only after every permitted required check completes. */
(function (host) {
 'use strict';
 const links = Object.freeze({
  tax:['세무 할 일','accounting.html?work=taxes'],
  contract_target:['근로계약 대상 확인 필요',''],contract_missing:['계약 미등록',''],
  contract_terms:['근로조건 입력 필요',''],contract_signatures:['계약 서명 대기',''],
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
  const key=()=>{const c=options.context();return c?`${c.coop_id}|${c.actor}`:'';};
  const owner=key();
  let dialog=null,dialogReturnFocus=null,disposed=false,summaryPending=null,readSequence=0,lastTaskTicket=0,lastSetupTicket=0,contractListGeneration=0,contractListController=null;
  const current=()=>!disposed&&key()===owner&&!!owner&&container.isConnected&&!container.closest('.hidden');
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
   // Reserve the boundary when a read starts, including reads that later fail.
   if(section==='summary'||section==='tasks')lastTaskTicket=ticket;
   if(section==='summary'||section==='setup')lastSetupTicket=ticket;
   try{
    const requested=section==='tasks'?'tasks_v2':section;
    const request=Promise.resolve().then(()=>{const q=options.client.rpc('erp_get_work_overview_contracts',{p_section:requested});return q.abortSignal?q.abortSignal(controller.signal):q;});
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
    if(!['approval','signup','member','insurance','receipts','inventory','material','tax','contract_target','contract_missing','contract_terms','contract_signatures'].includes(item.key)||keys.has(item.key)||!Number.isSafeInteger(item.count)||item.count<0)throw Error('COUNT_UNAVAILABLE');
    keys.add(item.key);total+=item.count;
   }
   if(!Number.isSafeInteger(total))throw Error('COUNT_UNAVAILABLE');
   lastTaskTicket=ticket;const badge=panels.get('tasks').badge;
   const panel=panels.get('tasks'),snapshot=JSON.stringify(data.items.map(x=>[x.key,x.count]));
   if(panel.snapshot&&panel.snapshot!==snapshot){panel.list.replaceChildren();panel.status.textContent='대기 건수가 바뀌었습니다. 최신 목록을 다시 확인해 주세요.';panel.snapshot=null;}
   badge.textContent=total?'대기 '+total.toLocaleString('ko-KR')+'건':data.items.some(x=>x.key==='tax'&&x.configured===false)?'세무 주기 확인 필요':'대기 업무 없음';
   badge.className=total?'badge text-bg-danger ms-2':'small text-muted ms-2';
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
  function failTasks(ticket,message){
   if(!current()||ticket<lastTaskTicket)return;
   const panel=panels.get('tasks');panel.badge.textContent='확인 필요';panel.badge.className='badge text-bg-warning ms-2';
   options.onTasks?.(null,'failed');panel.status.textContent=message;
  }
  function refresh(){
   if(!current())return null;
   if(summaryPending)return summaryPending;
   const panel=panels.get('tasks');panel.reset();panel.list.replaceChildren();panel.snapshot=null;closeDialog(true);
   for(const [controller,section]of controllers)if(section==='tasks')controller.abort();
   panel.badge.textContent='확인 중…';panel.badge.className='small text-muted ms-2';panel.status.textContent='대기 건수를 확인하는 중…';options.onTasks?.(null,'loading');
   const attemptTicket=readSequence+1;
   summaryPending=(async()=>{try{
    const {data,ticket}=await read('summary');
    setupVisibility(data.setup,ticket,true);
    if(counts(data,ticket)){
     panel.status.textContent=data.items.some(item=>item.count>0)?'대기 건수를 확인했습니다. 펼치면 최신 목록을 볼 수 있습니다.':'현재 확인할 대기 업무가 없습니다.';
     if(current()&&panel.root.open&&ticket===lastTaskTicket)await panel.load();
    }
   }catch(error){if(current()){
    failTasks(attemptTicket,'대기 건수와 설정 상태를 확인하지 못했습니다. 다시 확인해 주세요.');
    const setup=panels.get('setup');
    if(attemptTicket>=lastSetupTicket&&readDenied(error)){setup.root.hidden=true;setup.root.open=false;setup.reset();}
   }}})().finally(()=>{summaryPending=null;panel.syncRetry();});
   panel.syncRetry();
   return summaryPending;
  }
  function closeDialog(restoreFocus=false){
   contractListGeneration++;contractListController?.abort();contractListController=null;
   const closing=dialog,returnFocus=dialogReturnFocus;dialog=null;dialogReturnFocus=null;
   if(closing){closing.remove();if(restoreFocus)returnFocus?.();}
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
   const groups=new Map(names.map(name=>[name,{phase:'idle',scope:'',serial:0,rows:null,items:null}]));
   let baseSummary=null;
   const timestamp=()=>new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
   function scopeFor(name,paths){
    if(name==='certificate')return paths.certificate;
    if(name==='deadline')return paths.deadline?'member':'';
    const runtime=options.runtime?.();
    return JSON.stringify([owner,runtime?.coop_id,runtime?.is_active,runtime?.runtime_profile,
     [...(runtime?.effective_permissions||[])].sort(),runtime?.modules]);
   }
   function clearGroup(group){++group.serial;group.phase='idle';group.rows?.remove();group.rows=null;group.items=null;}
   function syncScope(){
    const paths=extras();
    for(const [name,group] of groups){const next=scopeFor(name,paths);if(group.scope!==next){clearGroup(group);group.scope=next;}}
   }
   function syncVisibility(){
    if(!baseSummary)return;
    const extraGroups=names.slice(1).map(name=>groups.get(name)).filter(group=>group.scope);
    const extrasComplete=extraGroups.every(group=>group.phase==='ready'&&Array.isArray(group.items)
     &&group.items.every(item=>['ready','legacy'].includes(item.state)));
    root.hidden=(!baseSummary.can_view||baseSummary.complete)&&extrasComplete&&!['loading','failed'].includes(groups.get('base').phase);
    if(root.hidden)root.open=false;
   }
   function updateSummary(value,fromSummary){
    baseSummary=value;syncScope();
    if(fromSummary&&(!value.can_view||value.complete)){
     if(groups.get('base').phase==='failed')clearGroup(groups.get('base'));
     for(const name of names.slice(1)){const group=groups.get(name);if(group.scope&&group.phase!=='loading')clearGroup(group);}
    }
    syncVisibility();
    // Only complete base settings need collapsed extra checks; incomplete settings stay lazy.
    if((!value.can_view||value.complete)&&!root.hidden){
     const paths=extras();
     for(const name of names.slice(1)){const group=groups.get(name);if(group.scope&&group.phase==='idle')void loadGroup(name,paths);}
    }
    renderStatus();
   }
   function renderStatus(){
    const available=[...groups.values()].filter(group=>group.scope), loading=available.some(group=>group.phase==='loading');
    const failed=available.some(group=>group.phase==='failed');
    status.textContent=loading?(list.childElementCount?'나머지 항목 확인 중…':'불러오는 중…')
     :failed?'일부 항목을 확인하지 못했습니다.':list.childElementCount?'확인 시각 '+timestamp():'현재 권한으로 확인할 항목이 없습니다.';
    const focused=document.activeElement===retry;
    retry.hidden=!failed&&!focused;
    retry.disabled=!failed&&!focused;
    retry.setAttribute('aria-disabled',String(!failed));
    retry.textContent=failed?'실패한 항목 다시 확인':loading?'확인 중…':'확인 완료';
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
    const valid=()=>current()&&!root.hidden&&serial===group.serial&&scope===scopeFor(name,extras());
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
     if(visibility)setupVisibility(visibility.value,visibility.ticket);else syncVisibility();
    }catch(error){if(valid()){if(readDenied(error)){paint(name,[],paths);group.items=[];group.phase='ready';}else group.phase='failed';syncVisibility();}}
    finally{
     if(valid()){syncVisibility();if(!root.hidden)renderStatus();}
     else if(current()&&!root.hidden&&serial===group.serial){syncScope();syncVisibility();if(!root.hidden)renderStatus();}
    }
   }
   function load(failedOnly=false){
    if(!current()||!root.open||root.hidden)return;
    syncScope();const paths=extras();
    for(const name of names){const group=groups.get(name);if(group.scope&&group.phase!=='loading'&&(!failedOnly||group.phase==='failed'))void loadGroup(name,paths);}
    renderStatus();
   }
   const reset=()=>{for(const group of groups.values())clearGroup(group);retry.hidden=true;status.textContent='';};
   panels.set('setup',{root,status,list,reset,syncScope,updateSummary});
   root.addEventListener('toggle',()=>{if(root.open)load();});
   retry.hidden=true;
   retry.onclick=()=>{if(retry.getAttribute('aria-disabled')!=='true')load(true);};
   retry.addEventListener('blur',()=>{if(!root.hidden&&current())renderStatus();});
   sections.push(()=>{root.open=false;reset();});
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
   let sequence=0,busy=false,retrying=false;
   const isCurrent=serial=>serial===sequence&&current();
   const syncRetry=()=>{const locked=busy||retrying||(section==='tasks'&&!!summaryPending);retry.disabled=locked;list.querySelectorAll('button').forEach(button=>{button.disabled=locked;});};
   const reset=()=>{++sequence;busy=false;syncRetry();};
   panels.set(section,{root,status,list,badge,reset,syncRetry,load});
   async function load() {
    if(busy||!root.open)return;const serial=++sequence,attemptTicket=readSequence+1;busy=true;syncRetry();list.replaceChildren();if(section==='tasks')panels.get(section).snapshot=null;status.textContent='불러오는 중…';
    try {
     const {data,ticket}=await read(section);if(!isCurrent(serial))return;
     if(!counts(data,ticket))return;
     for(const item of data.items) {
      const entry=links[item.key];if(!entry)throw new Error('UNKNOWN_ITEM');
      const row=el('div','d-flex align-items-center justify-content-between gap-3 border rounded p-2');
      const href=entry[1];
      const choose=['receipts','material'].includes(item.key)||item.key.startsWith('contract_');
      const link=el(choose?'button':'a',choose?'btn btn-link text-start p-0 text-decoration-none':'text-decoration-none',entry[0]);
      if(choose){link.type='button';link.onclick=()=>{
       if(!isCurrent(serial)||busy||retrying||(section==='tasks'&&summaryPending))return;
       if(item.key.startsWith('contract_')){showContractList(item.key,section);return;}
        const targets=(item.targets||[]).filter(x=>x.event_id==='unassigned'||/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.event_id));
        showList(entry[0],targets.map(x=>({label:String(x.label)+' · '+Number(x.count).toLocaleString('ko-KR')+'건',href:'festival_receipts.html?work='+item.key+'&event='+encodeURIComponent(x.event_id)})),section);
      };}else link.href=href;
      row.append(link);
       if(!Number.isSafeInteger(item.count)||item.count<0)throw new Error('COUNT_UNAVAILABLE');
       row.append(el('span',item.count?'badge text-bg-primary':'text-muted small',item.key==='tax'&&item.configured===false?(item.count?`${item.count.toLocaleString('ko-KR')}건 · 주기 확인`:'주기 미설정'):`${item.count.toLocaleString('ko-KR')}${item.key.startsWith('contract_')?'명':'건'}`));
      list.append(row);
     }
     status.textContent=data.items.length?`확인 시각 ${new Date(data.generated_at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}`:'현재 권한으로 확인할 항목이 없습니다.';
     if(section==='tasks')panels.get(section).snapshot=JSON.stringify(data.items.map(x=>[x.key,x.count]));
    }catch(_){if(isCurrent(serial)&&attemptTicket>=(section==='tasks'?lastTaskTicket:lastSetupTicket)){
     list.replaceChildren();status.textContent='불러오지 못했습니다. 다시 확인하거나 기존 업무 메뉴를 이용해 주세요.';
     if(section==='tasks')failTasks(attemptTicket,status.textContent);
    }}
    finally{if(serial===sequence){busy=false;syncRetry();}}
   }
   root.addEventListener('toggle',()=>{if(root.open)void load();});retry.onclick=async()=>{
    if(busy||retrying)return;retrying=true;retry.disabled=true;
    try{await refresh();if(current()&&section!=='tasks')await load();}finally{retrying=false;syncRetry();}
   };
   sections.push(()=>{++sequence;busy=false;root.open=false;list.replaceChildren();status.textContent='';});
  }
  binding={refresh,invalidate:()=>{disposed=true;controllers.forEach((_,c)=>c.abort());closeDialog();sections.forEach(fn=>fn());}};
  // A single scoped count/status read; detailed targets and configuration remain lazy.
  Promise.resolve().then(()=>{if(!disposed)void refresh();});
 }
 host.ErpWorkOverview=Object.freeze({mount,refresh:()=>binding?.refresh()||null,clear:()=>{binding?.invalidate();binding=undefined;document.getElementById('workOverview')?.replaceChildren();}});
})(window);
