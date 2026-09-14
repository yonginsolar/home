/* 2026-09-14 v1.0.0. Authorized detail-only load; no bulk guardian directory. */
window.GuardianAdmin={
 async load(client,memberId,currentMember){
  const el=id=>document.getElementById('md-guardian'+(id?'-'+id:''));
  el('').hidden=true;
  ['status','details','delivery','terms'].forEach(id=>el(id).textContent='');
  ['name','phone','note'].forEach(id=>el(id).value='');
  el('review').hidden=true;
  const states={pending:'법정대리인 동의 대기',consented:'법정대리인 동의 접수',declined:'동의하지 않음 — 승인 보류',expired:'동의 링크 만료 — 다시 요청 필요',superseded:'신청 내용 변경 — 새 동의 필요'};
  const delivery={queued:'발송 대기',sending:'발송 처리 중',accepted:'솔라피 접수 완료',failed:'발송 접수 실패',unknown:'결과 불명 — 솔라피 확인 필요',skipped:'발송 취소'};
  let busy=false;
  async function run(action='view'){
   if(busy || currentMember()!==memberId)return;
   busy=true;el('').querySelectorAll('button').forEach(b=>b.disabled=true);
   try{
    const {data,error}=await client.rpc('guardian_admin_action',{p_member_id:memberId,p_action:action,p_guardian_name:el('name').value,p_guardian_phone:el('phone').value,p_note:el('note').value});
    if(currentMember()!==memberId)return;
    if(error)throw error;
    el('').hidden=!data.required;if(!data.required)return;
    el('status').textContent=(states[data.status]||'동의 상태 확인 필요')+(data.reviewed_at?' · 관리자 검토 완료':'');
    el('details').textContent=`${data.student_name} · 출자 신청 ${Number(data.amount).toLocaleString('ko-KR')}원`+(data.responded_at?` · 응답 ${new Date(data.responded_at).toLocaleString('ko-KR')}`:'')+(data.respondent_name?` · ${data.respondent_name} (${data.relationship})`:'');
    el('delivery').textContent=(data.deliveries||[]).map(d=>`${d.event==='request'?'동의 요청':'동의 접수 안내'}: ${delivery[d.status]||'확인 필요'}`).join(' / ');
    el('terms').textContent=['representative','membership','privacy','notice'].map(k=>data.consent_text[k]).join('\n\n');
    el('name').value=data.guardian_name;el('phone').value=data.guardian_phone;
    el('review').hidden=data.status!=='consented'||!!data.reviewed_at;
    if(action==='reissue')el('note').value='';
   }catch(error){
    if(currentMember()!==memberId)return;
    el('').hidden=false;
    const known={ADMIN_REQUIRED:'현재 조합의 조합원 관리 권한이 필요합니다.',GUARDIAN_CONSENT_REQUIRED:'현재 신청 내용으로 법정대리인 동의를 먼저 받아 주세요.',GUARDIAN_SETUP_PENDING:'알림톡 발송 설정을 확인해 주세요.',GUARDIAN_RATE_LIMIT:'요청 횟수 제한에 도달했습니다. 다음 날 다시 요청해 주세요.',GUARDIAN_NOT_PENDING:'승인 대기 신청에서만 다시 요청할 수 있습니다.'};
    el('status').textContent=known[error.message]||(/^([가-힣])/.test(error.message||'')?error.message:'동의 정보를 확인하지 못했습니다. 다시 확인해 주세요.');
   }finally{busy=false;if(currentMember()===memberId)el('').querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  el('review').onclick=()=>run('review');el('refresh').onclick=()=>run('view');
  el('reissue').onclick=()=>run('reissue');
  await run();
 }
};
