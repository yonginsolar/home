/* v1.1.4 — Refresh open task details and expire stale target dialogs together. */
(function (host) {
 'use strict';
 const links = Object.freeze({
  approval:['내 결재 대기','approval.html?tab=todo'], signup:['신규 가입 승인 대기','admin_member.html?scope=member_admin&tab=members&sub=signup-pending'], member:['처리 대기 조합원 신청','admin_member.html?scope=member_admin&tab=applications&sub=pending-all'],
  insurance:['준비 중인 입사·퇴사 서류','hr_insurance.html?work=pending'], receipts:['현금영수증 발급 대기','festival_receipts.html'],
  inventory:['입고 검수 대기','festival_receipts.html?work=inventory'], material:['아직 받지 않은 행사 재료비','festival_receipts.html'],
  company:['조합 기본정보','admin_employee.html?section=settings'], capital:['출자 기준','admin_member.html?scope=member_admin&sub=capital'],
  notifications:['카톡 채널 연결','admin_member.html?scope=member_admin&tab=notifications&sub=settings'],
  signup_purpose:['가입 안내 · 설립목적','admin_member.html?scope=site_admin&tab=site&sub=legal&document=signup_purpose'],
  signup_privacy:['가입 개인정보 수집·이용 동의','admin_member.html?scope=site_admin&tab=site&sub=legal&document=signup_privacy'],
  terms:['홈페이지 이용약관','admin_member.html?scope=site_admin&tab=site&sub=legal&document=terms'], privacy:['개인정보 처리방침','admin_member.html?scope=site_admin&tab=site&sub=legal&document=privacy'],
  domain:['홈페이지·ERP 도메인','']
 });
 const labels={ready:'등록됨',missing:'확인 필요',default:'기본 기준 · 확인 필요',legacy:'기존 적용본 유지',connected:'연결됨',optional:'선택 사항 · 미연결'};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let binding;
 function mount(options) {
  if(binding) {binding.invalidate();binding=undefined;}
  const container=document.getElementById('workOverview');if(!container)return;
  container.replaceChildren();const sections=[],controllers=new Map(),panels=new Map();
  const key=()=>{const c=options.context();return c?`${c.coop_id}|${c.actor}`:'';};
  const owner=key();
  let dialog=null,dialogReturnFocus=null,disposed=false,summaryPending=null,readSequence=0,lastTaskTicket=0,lastSetupTicket=0;
  const current=()=>!disposed&&key()===owner&&!!owner&&container.isConnected&&!container.closest('.hidden');
  async function read(section){
   const ticket=++readSequence,controller=new AbortController();controllers.set(controller,section);let timer;
   // Reserve the boundary when a read starts, including reads that later fail.
   if(section==='summary'||section==='tasks')lastTaskTicket=ticket;
   if(section==='summary'||section==='setup')lastSetupTicket=ticket;
   try{
    const requested=section==='tasks'?'tasks_v2':section;
    const request=Promise.resolve().then(()=>{const q=options.client.rpc('erp_get_work_overview',{p_section:requested});return q.abortSignal?q.abortSignal(controller.signal):q;});
    const response=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
    if(!current())throw Error('SCOPE_CHANGED');
    if(response.error)throw Error('READ_FAILED');
    const data=response.data;
    if(data?.coop_id!==options.context().coop_id||data?.section!==requested||!Array.isArray(data.items))throw Error('SCOPE_CHANGED');
    return {data,ticket};
   }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  function counts(data,ticket){
   if(ticket<lastTaskTicket)return false;
   const keys=new Set();let total=0;
   for(const item of data.items){
    if(!['approval','signup','member','insurance','receipts','inventory','material'].includes(item.key)||keys.has(item.key)||!Number.isSafeInteger(item.count)||item.count<0)throw Error('COUNT_UNAVAILABLE');
    keys.add(item.key);total+=item.count;
   }
   if(!Number.isSafeInteger(total))throw Error('COUNT_UNAVAILABLE');
   lastTaskTicket=ticket;const badge=panels.get('tasks').badge;
   const panel=panels.get('tasks'),snapshot=JSON.stringify(data.items.map(x=>[x.key,x.count]));
   if(panel.snapshot&&panel.snapshot!==snapshot){panel.list.replaceChildren();panel.status.textContent='대기 건수가 바뀌었습니다. 최신 목록을 다시 확인해 주세요.';panel.snapshot=null;}
   badge.textContent=total?'대기 '+total.toLocaleString('ko-KR')+'건':'대기 업무 없음';
   badge.className=total?'badge text-bg-danger ms-2':'small text-muted ms-2';
   options.onTasks?.(data.items,'ready');
   return true;
  }
  function setupVisibility(value,ticket){
   if(ticket<lastSetupTicket)return false;
   if(typeof value?.can_view!=='boolean'||typeof value.complete!=='boolean'||!Number.isSafeInteger(value.required_count)||!Number.isSafeInteger(value.pending_count)
    ||value.required_count<0||value.pending_count<0||value.pending_count>value.required_count||value.can_view!==(value.required_count>0)
    ||value.complete!==(value.required_count>0&&value.pending_count===0))throw Error('STATE_UNAVAILABLE');
   lastSetupTicket=ticket;
   const panel=panels.get('setup');panel.root.hidden=!value.can_view||value.complete;
   if(panel.root.hidden){panel.root.open=false;panel.list.replaceChildren();panel.reset();}
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
    setupVisibility(data.setup,ticket);
    if(counts(data,ticket)){
     panel.status.textContent=data.items.some(item=>item.count>0)?'대기 건수를 확인했습니다. 펼치면 최신 목록을 볼 수 있습니다.':'현재 확인할 대기 업무가 없습니다.';
     if(current()&&panel.root.open&&ticket===lastTaskTicket)await panel.load();
    }
   }catch(_){if(current()){
    failTasks(attemptTicket,'대기 건수와 설정 상태를 확인하지 못했습니다. 다시 확인해 주세요.');
    if(attemptTicket>=lastSetupTicket)panels.get('setup').root.hidden=true;
   }}})().finally(()=>{summaryPending=null;panel.syncRetry();});
   panel.syncRetry();
   return summaryPending;
  }
  function closeDialog(restoreFocus=false){
   const closing=dialog,returnFocus=dialogReturnFocus;dialog=null;dialogReturnFocus=null;
   if(closing){closing.remove();if(restoreFocus)returnFocus?.();}
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
  for(const [section,title] of [['tasks','📌 내 업무 모아보기'],['setup','✅ 조합 설정 점검표']]) {
   const root=el('details','border rounded p-3 mb-2 bg-white'),heading=el('summary','fw-bold',title);
   root.dataset.overviewSection=section;root.hidden=section==='setup';
   const badge=el('span','small text-muted ms-2',section==='tasks'?'확인 중…':'');badge.setAttribute('role','status');heading.append(badge);
   const body=el('div','pt-3'),status=el('p','small text-muted mb-2',''),list=el('div','d-grid gap-2');
   status.setAttribute('role','status');const retry=el('button','btn btn-sm btn-outline-secondary mt-2','다시 확인');retry.type='button';
   body.append(status,list,retry);root.append(heading,body);container.append(root);
   let sequence=0,busy=false,retrying=false;
   const isCurrent=serial=>serial===sequence&&current();
   const syncRetry=()=>{const locked=busy||retrying||(section==='tasks'&&!!summaryPending);retry.disabled=locked;list.querySelectorAll('button').forEach(button=>{button.disabled=locked;});};
   const reset=()=>{++sequence;busy=false;syncRetry();};
   panels.set(section,{root,status,list,badge,reset,syncRetry,load});
   async function load() {
    if(busy||!root.open)return;const serial=++sequence,attemptTicket=readSequence+1;busy=true;syncRetry();list.replaceChildren();if(section==='tasks')panels.get(section).snapshot=null;status.textContent='불러오는 중…';
    try {
     const {data,ticket}=await read(section);if(!isCurrent(serial))return;
     if(section==='tasks'){
      if(!counts(data,ticket))return;
     }
     else{
      const required=data.items.filter(item=>item.key!=='notifications');
      if(data.items.some(item=>!labels[item.state]))throw Error('STATE_UNAVAILABLE');
      if(!setupVisibility({can_view:required.length>0,complete:required.length>0&&required.every(item=>['ready','legacy'].includes(item.state)),required_count:required.length,pending_count:required.filter(item=>!['ready','legacy'].includes(item.state)).length},ticket))return;
      if(root.hidden)return;
     }
     for(const item of data.items) {
      const entry=links[item.key];if(!entry)throw new Error('UNKNOWN_ITEM');
      const row=el('div','d-flex align-items-center justify-content-between gap-3 border rounded p-2');
      let href=entry[1];
      if(item.key==='capital'&&data.items.some(x=>x.key==='company'))href='admin_employee.html?section=settings&focus=capital';
      const choose=['receipts','material','domain'].includes(item.key);
      const link=el(choose?'button':'a',choose?'btn btn-link text-start p-0 text-decoration-none':'text-decoration-none',entry[0]);
      if(choose){link.type='button';link.onclick=()=>{
       if(!isCurrent(serial)||busy||retrying||(section==='tasks'&&summaryPending))return;
       if(item.key==='domain'){
        const addresses=(item.domains||[]).filter(x=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(x));
        showList('등록된 홈페이지·ERP 주소',addresses.map(x=>({label:'https://'+x})),section);
       }else{
        const targets=(item.targets||[]).filter(x=>x.event_id==='unassigned'||/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.event_id));
        showList(entry[0],targets.map(x=>({label:String(x.label)+' · '+Number(x.count).toLocaleString('ko-KR')+'건',href:'festival_receipts.html?work='+item.key+'&event='+encodeURIComponent(x.event_id)})),section);
       }
      };}else link.href=href;
      row.append(link);
      if(section==='tasks') {
       if(!Number.isSafeInteger(item.count)||item.count<0)throw new Error('COUNT_UNAVAILABLE');
       row.append(el('span',item.count?'badge text-bg-primary':'text-muted small',`${item.count.toLocaleString('ko-KR')}건`));
      }else{
       if(!labels[item.state])throw new Error('STATE_UNAVAILABLE');
       const right=el('span','small text-end',labels[item.state]);
       if(item.key==='capital')right.append(el('span','d-block text-muted',`최소 ${Number(item.minimum).toLocaleString('ko-KR')}원 · 1좌 ${Number(item.unit).toLocaleString('ko-KR')}원`));
       row.append(right);
      }
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
