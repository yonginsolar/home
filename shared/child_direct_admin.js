/* v1.0.0 — detail-only consent receipt, separate from student guardian requests. */
window.ChildDirectAdmin={async load(client,member,current){
 const box=document.getElementById('md-child-direct');box.hidden=true;box.replaceChildren();
 if(!member.manager_id)return;
 try{
  const {data,error}=await client.rpc('child_direct_consent_record',{p_member_id:member.id});
  if(current()!==member.id)return;if(error)throw error;if(!data)return;
  const add=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;box.append(e);return e;};
  box.hidden=false;add('h6','📝 법정대리인 직접 신청·동의 접수').className='fw-bold';
  const s=data.snapshot||{};
  add('p',`${s.applicant_name} · 동의한 출자금 ${Number(s.amount).toLocaleString('ko-KR')}원`).className='mb-2';
  add('p',`${s.guardian_name} (${s.relationship}) · ${new Date(data.consented_at).toLocaleString('ko-KR')} 동의 접수`).className='small mb-2';
  add('p','법정대리인 계정에서 직접 제출한 동의 기록입니다. 별도 본인인증·관계 증명 서류 확인 완료를 의미하지 않습니다.').className='small text-muted';
  const statuses={queued:data.delivery_enabled?'발송 대기':'템플릿 검수·연결 대기',sending:'발송 처리 중',accepted:'솔라피 접수 완료 (실제 수신과 구분)',failed:'발송 접수 실패 — 사무국 확인 필요',unknown:'결과 불명 — 중복 발송 전 확인 필요'};
  add('p',`접수·납부 안내: ${statuses[data.delivery_status]||'확인 필요'}`).className='small';
  if(s.applicant_name!==member.name||Number(s.amount)!==Number(member.pledge_amount))add('p','동의 당시 이름 또는 출자금액과 현재 정보가 다릅니다. 승인 전에 변경 내용에 대한 법정대리인 동의를 확인해 주세요.').className='text-danger small';
  const details=add('details',''),summary=document.createElement('summary'),terms=document.createElement('div');summary.textContent='실제 동의한 내용 확인';terms.textContent=['privacy','membership','guardian','notice'].map(k=>data.terms?.[k]||'').join('\n\n');terms.style.whiteSpace='pre-wrap';terms.className='small mt-2';details.append(summary,terms);
 }catch{if(current()===member.id){box.hidden=false;box.textContent='법정대리인 직접 신청 동의 기록을 불러오지 못했습니다. 상세 화면을 다시 열어 확인해 주세요.';}}
}};
