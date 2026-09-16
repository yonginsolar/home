/* v1.1.1 — delivery evidence is separate from explicit consent evidence. */
(() => {
 'use strict';
 let generation=0;
 const managed=m=>Boolean(m?.manager_id)&&!String(m?.member_type||m?.type||'').includes('단체');
 const key=m=>String(m?.id||m?.member_uid||m?.uid||'');
 const date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'';
 function view(r){
  if(!r)return ['법정대리인 안내 조회 실패','bg-warning text-dark'];
  const states={
   queued:[r.delivery_enabled?'법정대리인 알림톡 발송 대기':'법정대리인 알림톡 발송 보류','bg-secondary'],
   sending:['법정대리인 알림톡 처리 중','bg-primary'],
   accepted:['법정대리인 알림톡 발송 접수 완료','bg-success'],
   failed:['법정대리인 알림톡 발송 실패','bg-danger'],
   unknown:['법정대리인 알림톡 결과 확인 필요','bg-warning text-dark']
  };
  return states[r.delivery_status]||(r.has_consent?['법정대리인 알림톡 내역 확인 필요','bg-warning text-dark']:['법정대리인 알림톡 미발송','bg-secondary']);
 }
 function paint(node,row){
  node.replaceChildren();
  const [label,style]=view(row),badge=document.createElement('span');
  badge.className='badge '+style;badge.style.cssText='white-space:normal;line-height:1.5;text-align:start';
  badge.textContent=label;node.append(badge);
  if(row?.delivery_updated_at){const t=document.createElement('div');t.className='small text-muted mt-1';t.textContent=date(row.delivery_updated_at);node.append(t);}
 }
 function placeholder(m){
  if(!managed(m))return '';
  return '<div class="mt-1 small" data-child-receipt="'+encodeURIComponent(key(m))+'">법정대리인 안내 확인 중</div>';
 }
 async function loadList(client,root=document.getElementById('memberListBody')){
  if(!root)return;
  const nodes=Array.from(root.querySelectorAll('[data-child-receipt]'));
  const ids=[...new Set(nodes.map(n=>decodeURIComponent(n.dataset.childReceipt)))];
  if(!ids.length)return;
  try{
   const rows=new Map();
   for(let start=0;start<ids.length;start+=100){
    const {data,error}=await client.rpc('child_direct_admin_status',{p_member_ids:ids.slice(start,start+100)});
    if(error||!Array.isArray(data))throw error||new Error('STATUS_UNAVAILABLE');
    for(const row of data)rows.set(row.member_id,row);
   }
   for(const n of nodes)if(n.isConnected){const r=rows.get(decodeURIComponent(n.dataset.childReceipt));if(r)paint(n,r);else n.replaceChildren();}
  }catch{for(const n of nodes)if(n.isConnected)paint(n,null);}
 }
 async function load(client,member,current){
  const seq=++generation,box=document.getElementById('md-child-direct');
  if(!box)return;box.hidden=true;box.replaceChildren();
  const active=()=>seq===generation&&current()===member.id;
  if(!managed(member))return;
  const add=(tag,text,cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;box.append(e);return e;};
  try{
   const [evidence,result]=await Promise.all([
    client.rpc('child_direct_consent_record',{p_member_id:member.id}),
    client.rpc('child_direct_admin_status',{p_member_ids:[member.id]})
   ]);
   if(!active())return;
   if(evidence.error||result.error)throw new Error('STATUS_UNAVAILABLE');
   const row=result.data?.find(r=>r.member_id===member.id),data=evidence.data;
   if(!row)return;
   box.hidden=false;add('h6','💬 법정대리인 접수·납부 안내','fw-bold');
   paint(add('div','','mb-2'),row);
   if(row.delivery_status==='accepted')add('p','발송 서비스가 요청을 접수한 상태입니다. 휴대전화의 실제 수신 완료와는 구분합니다.','small text-muted');
   if(row.legacy_receipt)add('p','기존 가입 신청에 대해 관리자가 접수 안내를 요청한 기록입니다. 별도의 명시적 동의 기록을 소급하여 생성하지 않았습니다.','small text-muted');
   if(data){
    const s=data.snapshot||{};
    add('h6','📝 법정대리인 직접 신청·동의 접수','fw-bold mt-3');
    add('p',s.applicant_name+' · 동의한 출자금 '+Number(s.amount).toLocaleString('ko-KR')+'원','mb-2');
    add('p',s.guardian_name+' ('+s.relationship+') · '+date(data.consented_at)+' 동의 접수','small mb-2');
    add('p','법정대리인 계정에서 직접 제출한 동의 기록입니다. 별도 본인인증·관계 증명 서류 확인 완료를 의미하지 않습니다.','small text-muted');
    if(s.applicant_name!==member.name||Number(s.amount)!==Number(member.pledge_amount))add('p','동의 당시 이름 또는 출자금액과 현재 정보가 다릅니다. 승인 전에 변경 내용에 대한 법정대리인 동의를 확인해 주세요.','text-danger small');
    const details=add('details',''),summary=document.createElement('summary'),terms=document.createElement('div');
    summary.textContent='실제 동의한 내용 확인';terms.textContent=['privacy','membership','guardian','notice'].map(k=>data.terms?.[k]||'').join('\n\n');terms.style.whiteSpace='pre-wrap';terms.className='small mt-2';details.append(summary,terms);
   }else if(!row.legacy_receipt){
    add('p','별도로 저장된 직접 신청·동의 기록이 없는 등록 건입니다. 법정대리인의 기존 신청 사실을 확인한 경우 접수·납부 안내를 보낼 수 있습니다.','small text-muted');
   }
   const refresh=add('button','발송 상태 새로고침','btn btn-sm btn-outline-secondary mt-2');refresh.type='button';
   refresh.onclick=()=>{if(active()){void load(client,member,current);void loadList(client);}};
   if(row.can_request_legacy&&row.delivery_enabled){
    const btn=add('button','법정대리인에게 접수 안내 보내기','btn btn-sm btn-primary ms-2 mt-2');btn.type='button';
    btn.onclick=async()=>{
     if(!active()||btn.disabled)return;btn.disabled=true;
     try{
      const preview=await client.rpc('child_direct_admin_receipt',{p_member_id:member.id,p_confirm:false});
      if(!active())return;if(preview.error)throw preview.error;
      if(preview.data?.already_requested){await load(client,member,current);void loadList(client);return;}
      const p=preview.data,confirmBox=add('div','','border rounded p-3 mt-3'),message=document.createElement('p');
      message.textContent=p.applicant_name+' 님의 접수·납부 안내를 '+p.guardian_name+' 님(연락처 끝 '+p.phone_tail+')에게 보냅니다. 신청 출자금은 '+Number(p.amount).toLocaleString('ko-KR')+'원입니다. 기존 법정대리인 직접 신청 사실을 확인한 뒤 발송해 주세요. 문자 대체발송은 하지 않습니다.';
      const send=document.createElement('button'),cancel=document.createElement('button');
      send.type=cancel.type='button';send.className='btn btn-primary btn-sm';cancel.className='btn btn-outline-secondary btn-sm ms-2';
      send.textContent='확인하고 카카오 발송';cancel.textContent='취소';confirmBox.append(message,send,cancel);
      cancel.onclick=()=>{confirmBox.remove();btn.disabled=false;};
      send.onclick=async()=>{
       if(!active()||send.disabled)return;send.disabled=true;cancel.disabled=true;
       try{
        const response=await client.rpc('child_direct_admin_receipt',{p_member_id:member.id,p_confirm:true,p_preview_revision:p.preview_revision});
        if(!active())return;if(response.error)throw response.error;
        await load(client,member,current);void loadList(client);
       }catch{if(active()){message.textContent='발송 요청 결과를 확인하지 못했습니다. 상태 새로고침으로 기존 요청 여부를 먼저 확인해 주세요.';cancel.disabled=false;}}
      };
     }catch{if(active()){add('p','기존 신청 상태·법정대리인 연락처·발송 설정을 확인해 주세요. 현재는 안내를 요청하지 못했습니다.','text-danger small mt-2');btn.disabled=false;}}
    };
   }
  }catch{if(active()){box.hidden=false;box.textContent='법정대리인 안내 기록을 불러오지 못했습니다. 상세 화면을 다시 열어 확인해 주세요.';}}
 }
 window.ChildDirectAdmin={load,loadList,placeholder,view};
})();
