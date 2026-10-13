/* v1.0.1 — Permission-scoped destinations and explicit pending-event selection. */
(function (host) {
 'use strict';
 const links = Object.freeze({
  approval:['내 결재 대기','approval.html?tab=todo'], member:['처리 대기 조합원 신청','admin_member.html?scope=member_admin&tab=applications&sub=pending-all'],
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
  container.replaceChildren();const sections=[];
  const key=()=>{const c=options.context();return c?`${c.coop_id}|${c.actor}`:'';};
  const owner=key();
  let dialog=null;
  function closeDialog(){if(dialog){dialog.remove();dialog=null;}}
  function showList(title,entries){
   closeDialog();const opener=document.activeElement;
   dialog=el('dialog','border rounded p-4');dialog.style.cssText='width:min(560px,calc(100% - 32px));max-height:80vh;overflow:auto;word-break:keep-all';
   const heading=el('h2','h5',title);heading.id='work-overview-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading);
   if(!entries.length)dialog.append(el('p','text-secondary',title==='등록된 홈페이지·ERP 주소'?'등록된 주소가 없습니다.':'현재 확인할 대기 업무가 없습니다.'));
   for(const item of entries){const row=item.href?el('a','d-block border rounded p-3 mb-2',item.label):el('p','border rounded p-3 mb-2',item.label);if(item.href)row.href=item.href;dialog.append(row);}
   const close=el('button','btn btn-secondary','닫기');close.type='button';close.onclick=()=>dialog?.close();dialog.append(close);
   dialog.addEventListener('close',()=>{closeDialog();if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});document.body.append(dialog);dialog.showModal();
  }
  for(const [section,title] of [['tasks','📌 내 업무 모아보기'],['setup','✅ 조합 설정 점검표']]) {
   const root=el('details','border rounded p-3 mb-2 bg-white'),heading=el('summary','fw-bold',title);
   const body=el('div','pt-3'),status=el('p','small text-muted mb-2',''),list=el('div','d-grid gap-2');
   status.setAttribute('role','status');const retry=el('button','btn btn-sm btn-outline-secondary mt-2','다시 확인');retry.type='button';
   body.append(status,list,retry);root.append(heading,body);container.append(root);
   let sequence=0,busy=false,loaded=false;
   const current=serial=>serial===sequence && key()===owner && !!owner && container.isConnected && !container.closest('.hidden');
   async function load() {
    if(busy||!root.open)return;const serial=++sequence;busy=true;retry.disabled=true;list.replaceChildren();status.textContent='불러오는 중…';
    try {
     const response=await options.client.rpc('erp_get_work_overview',{p_section:section});
     if(!current(serial))return;
     if(response.error)throw new Error('READ_FAILED');
     const data=response.data,c=options.context();
     if(data?.coop_id!==c.coop_id||data?.section!==section||!Array.isArray(data.items))throw new Error('SCOPE_CHANGED');
     for(const item of data.items) {
      const entry=links[item.key];if(!entry)throw new Error('UNKNOWN_ITEM');
      const row=el('div','d-flex align-items-center justify-content-between gap-3 border rounded p-2');
      let href=entry[1];
      if(item.key==='capital'&&data.items.some(x=>x.key==='company'))href='admin_employee.html?section=settings&focus=capital';
      const choose=['receipts','material','domain'].includes(item.key);
      const link=el(choose?'button':'a',choose?'btn btn-link text-start p-0 text-decoration-none':'text-decoration-none',entry[0]);
      if(choose){link.type='button';link.onclick=()=>{
       if(!current(serial))return;
       if(item.key==='domain'){
        const addresses=(item.domains||[]).filter(x=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(x));
        showList('등록된 홈페이지·ERP 주소',addresses.map(x=>({label:'https://'+x})));
       }else{
        const targets=(item.targets||[]).filter(x=>x.event_id==='unassigned'||/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.event_id));
        showList(entry[0],targets.map(x=>({label:String(x.label)+' · '+Number(x.count).toLocaleString('ko-KR')+'건',href:'festival_receipts.html?work='+item.key+'&event='+encodeURIComponent(x.event_id)})));
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
     status.textContent=data.items.length?`확인 시각 ${new Date(data.generated_at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}`:'현재 권한으로 확인할 항목이 없습니다.';loaded=true;
    }catch(_){if(current(serial)){list.replaceChildren();status.textContent='불러오지 못했습니다. 다시 확인하거나 기존 업무 메뉴를 이용해 주세요.';loaded=false;}}
    finally{if(serial===sequence){busy=false;retry.disabled=false;}}
   }
   root.addEventListener('toggle',()=>{if(root.open&&!loaded)void load();});retry.onclick=()=>void load();
   sections.push(()=>{++sequence;loaded=false;busy=false;root.open=false;list.replaceChildren();status.textContent='';});
  }
  binding={invalidate:()=>{closeDialog();sections.forEach(fn=>fn());}};
 }
 host.ErpWorkOverview=Object.freeze({mount,clear:()=>{binding?.invalidate();binding=undefined;document.getElementById('workOverview')?.replaceChildren();}});
})(window);
