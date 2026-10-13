/* v1.0.0 — Read-only, on-demand summaries using the current authenticated client. */
(function (host) {
 'use strict';
 const links = Object.freeze({
  approval:['내 결재 대기','approval.html'], member:['처리 대기 조합원 신청','admin_member.html?scope=member_admin&tab=applications'],
  insurance:['준비 중인 입사·퇴사 서류','hr_insurance.html'], receipts:['현금영수증 발급 대기','festival_receipts.html'],
  inventory:['입고 검수 대기','festival_receipts.html'], material:['아직 받지 않은 행사 재료비','festival_receipts.html'],
  company:['조합 기본정보','admin_employee.html?section=settings'], capital:['출자 기준','admin_member.html?scope=member_admin'],
  notifications:['카톡 채널 연결','admin_member.html?scope=member_admin&tab=notifications'],
  signup_purpose:['가입 안내 · 설립목적','admin_member.html?scope=site_admin&tab=site'],
  signup_privacy:['가입 개인정보 수집·이용 동의','admin_member.html?scope=site_admin&tab=site'],
  terms:['홈페이지 이용약관','admin_member.html?scope=site_admin&tab=site'], privacy:['개인정보 처리방침','admin_member.html?scope=site_admin&tab=site'],
  domain:['홈페이지·ERP 도메인','admin_member.html?scope=site_admin&tab=site']
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
      const link=el('a','text-decoration-none',entry[0]);link.href=entry[1];row.append(link);
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
  binding={invalidate:()=>sections.forEach(fn=>fn())};
 }
 host.ErpWorkOverview=Object.freeze({mount,clear:()=>{binding?.invalidate();binding=undefined;document.getElementById('workOverview')?.replaceChildren();}});
})(window);
