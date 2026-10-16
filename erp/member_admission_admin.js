/* v1.1.1 — Read-only dates plus authorized manual-review entry. */
(function(root){
 'use strict';
 let binding=null,sequence=0,openSequence=0,dialog=null,opener=null;
 const records=new Map();
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const identity=o=>{const c=o?.context();return c?.actor&&c?.coop_id?c.actor+'|'+c.coop_id:'';};
 const valid=b=>b===binding&&identity(b)===b.owner&&!!b.owner&&b.current()&&!root.frameElement?.hidden;
 const labels={completion_pending:'신청 완료 확인 필요',waiting:'납입기한 내',overdue:'납입기한 경과 · 관리자 확인',payment_check:'납입 상태·기록 확인'};
 const consents={confirmed:'보호자 동의 완료',pending:'보호자 동의 미완료',declined:'보호자 동의 거부 · 확인 필요',unverified:'기존 보호자 동의 기록 확인 필요',not_required:'별도 보호자 동의 대상 아님'};
 const deliveries={accepted:'안내 발송 접수',failed:'안내 발송 실패',unknown:'안내 발송 결과 확인 필요',queued:'안내 발송 대기',processing:'안내 발송 처리 중',skipped:'안내 발송 안 함',legacy_recorded:'이전 안내 발송 기록 있음',not_recorded:'안내 발송 기록 없음'};
 async function call(b,ids){
  let timer;const controller=new AbortController();
  try{
   const q=b.client.rpc('erp_member_admission',{p_action:'get_v2',p_member_ids:ids});
   const r=await Promise.race([q.abortSignal?q.abortSignal(controller.signal):q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
   if(!valid(b))throw Error('CONTEXT_CHANGED');if(r.error)throw r.error;
   if(r.data?.coop_id!==b.context().coop_id||typeof r.data.enabled!=='boolean'||!Array.isArray(r.data.items))throw Error('CONTEXT_CHANGED');
   for(const x of r.data.items)if(!ids.includes(x.member_uid)||!labels[x.state]||!consents[x.consent_status]||!deliveries[x.delivery_status])throw Error('RESPONSE_INVALID');
   return r.data;
  }finally{clearTimeout(timer);}
 }
 function paint(b,failed=false){
  if(!valid(b))return;
  document.querySelectorAll('[data-admission-member]').forEach(box=>{
   const uid=box.dataset.admissionMember,r=records.get(uid);box.replaceChildren();box.hidden=false;
   if(!failed&&!r){box.hidden=true;return;}
   const button=node('button','btn btn-link btn-sm text-start p-0 mt-1',failed?'납입기한 조회 재시도':labels[r.state]);button.type='button';button.dataset.admissionOpen=uid;
   if(r?.state==='overdue')button.classList.add('text-danger');box.append(button);
   if(failed)return;
   if(r.due_on)box.append(node('div','small text-muted','납입기한 '+r.due_on));
   if(['pending','declined','unverified'].includes(r.consent_status))box.append(node('div','small text-warning-emphasis',consents[r.consent_status]));
   if(['failed','unknown'].includes(r.delivery_status))box.append(node('div','small text-danger',deliveries[r.delivery_status]));
  });
 }
 async function list(options){
  const nextOwner=identity(options);if(!nextOwner)return;if(binding?.owner!==nextOwner)clear();
  if(dialog){binding.current=options.current;return;}
  const b={...options,owner:nextOwner};binding=b;const serial=++sequence;
  const ids=options.rows.filter(m=>m.status==='승인대기').map(m=>m.id||m.member_uid).filter(Boolean);
 if(!ids.length)records.clear();
  try{const r=await call(b,ids);if(!valid(b)||serial!==sequence)return;records.clear();if(r.enabled)r.items.forEach(x=>records.set(x.member_uid,x));paint(b);root.MemberApplicationManage?.bind(options,r.enabled);}
  catch(_){if(valid(b)&&serial===sequence){records.clear();paint(b,true);root.MemberApplicationManage?.bind(options,false);}}
 }
 function close(){if(!dialog)return;dialog.remove();dialog=null;if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;}
 function clear(){++sequence;++openSequence;binding=null;records.clear();close();root.MemberApplicationManage?.clear();}
 async function open(uid){
  const b=binding;if(!valid(b)||dialog)return;const serial=++openSequence;let r=records.get(uid);
  if(!r){try{const result=await call(b,[uid]);if(!valid(b)||serial!==openSequence||dialog)return;r=result.items[0];if(!result.enabled||!r)return;records.set(uid,r);paint(b);}catch(_){if(valid(b)&&serial===openSequence)return root.CoopDialog.alert('납입기한을 확인하지 못했습니다. 다시 확인해 주세요.');return;}}
  opener=document.activeElement;const d=node('dialog','border rounded-3 p-4 bg-white text-dark');dialog=d;d.style.cssText='width:min(560px,calc(100% - 32px));max-height:85vh;overflow:auto;word-break:keep-all;color-scheme:light';d.setAttribute('aria-labelledby','admission-heading');
  const target=b.rows.find(m=>(m.id||m.member_uid)===uid),title=node('h2','h5',(target?.name?target.name+' · ':'')+'가입 신청·납입기한');title.id='admission-heading';
  const info=node('div','my-3'),status=node('p','small mt-2','');status.setAttribute('role','status');
  const render=()=>{info.replaceChildren();for(const text of ['신청 접수일: '+(r.submitted_on||'기록 확인 필요'),'신청 완료일: '+(r.completed_on||'완료 전 또는 기록 확인 필요'),'납입기한: '+(r.due_on||'신청 완료 후 계산'),labels[r.state],consents[r.consent_status],(r.delivery_kind==='guardian_request'?'보호자 동의 요청 · ':'')+deliveries[r.delivery_status]])info.append(node('p','mb-2',text));};render();
  const hint=node('p','small text-muted','신청 완료일부터 10일로 자동 계산합니다. 자녀는 해당 자녀의 신청·동의 완료 기록을 사용하며 부모나 다른 자녀의 날짜·입금은 대신 쓰지 않습니다. 자동 철회·개인정보 삭제·알림 발송은 하지 않습니다. 발송 접수는 실제 수신 완료와 다릅니다.');
  const actions=node('div','d-flex gap-2 justify-content-end mt-3'),reload=node('button','btn btn-outline-secondary','다시 확인'),cancel=node('button','btn btn-secondary','닫기');reload.type=cancel.type='button';actions.append(reload,cancel);d.append(title,info,hint,status,actions);
  cancel.onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close();});
  reload.onclick=async()=>{if(reload.disabled||!valid(b))return;reload.disabled=true;status.textContent='확인 중입니다…';try{const result=await call(b,[uid]);if(dialog!==d||!valid(b))return;const fresh=result.items[0];if(!fresh)throw Error('TARGET_CHANGED');r=fresh;records.set(uid,r);paint(b);render();status.textContent='현재 상태를 확인했습니다.';}catch(_){if(dialog===d&&valid(b))status.textContent='현재 상태를 확인하지 못했습니다. 다시 확인해 주세요.';}finally{if(dialog===d)reload.disabled=false;}};
  document.body.append(d);d.showModal();cancel.focus();
 }
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-admission-open]');if(!button)return;e.preventDefault();e.stopPropagation();void open(button.dataset.admissionOpen);},true);
 root.addEventListener('pagehide',clear);root.MemberAdmissionAdmin=Object.freeze({list,clear});
})(window);
