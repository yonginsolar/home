/* v1.3.0 — Per-application, effective-dated bylaws and distinct unset/unlimited/basis states. */
(function(root){
 'use strict';
 let binding=null,sequence=0,openSequence=0,dialog=null,opener=null;
 const records=new Map();
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const identity=o=>{const c=o?.context();return c?.actor&&c?.coop_id?c.actor+'|'+c.coop_id:'';};
 const valid=b=>b===binding&&identity(b)===b.owner&&!!b.owner&&b.current()&&!root.frameElement?.hidden;
 const labels={completion_pending:'신청 완료 확인 필요',waiting:'납입기한 내',overdue:'납입기한 경과 · 관리자 확인',payment_check:'납입 상태·기록 확인',policy_unconfigured:'신청 당시 납입기한 미설정',no_deadline:'납입기한 없음',basis_pending:'가입 승낙 통지일 확인 필요'};
 const consents={confirmed:'자녀 가입·개인정보 동의 완료',pending:'자녀 가입·개인정보 동의 미완료',declined:'자녀 가입·개인정보 동의 거부 · 확인 필요',unverified:'기존 대리 신청 기록 확인 필요',not_required:'별도 보호자 동의 대상 아님'};
 const consentText=(r,person)=>r.application_kind==='organization'||person?.member_type==='단체'?'단체 관리자 등록 · 보호자 동의 대상 아님':consents[r.consent_status];
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
   const person=b.rows.find(m=>(m.id||m.member_uid)===uid);
   if(r.application_kind!=='organization'&&person?.member_type!=='단체'&&['pending','declined','unverified'].includes(r.consent_status))box.append(node('div','small text-warning-emphasis',consentText(r,person)));
   if(['failed','unknown'].includes(r.delivery_status))box.append(node('div','small text-danger',deliveries[r.delivery_status]));
  });
 }
 async function list(options){
  const nextOwner=identity(options);if(!nextOwner)return;if(binding?.owner!==nextOwner)clear();
  root.MemberAdmissionPolicy?.bind(options);
  if(dialog){binding.current=options.current;return;}
  const b={...options,owner:nextOwner};binding=b;const serial=++sequence;
  const ids=options.rows.filter(m=>m.status==='승인대기').map(m=>m.id||m.member_uid).filter(Boolean);
 if(!ids.length)records.clear();
  try{const r=await call(b,ids);if(!valid(b)||serial!==sequence)return;records.clear();if(r.enabled)r.items.forEach(x=>records.set(x.member_uid,x));paint(b);root.MemberApplicationManage?.bind(options,r.enabled);}
  catch(_){if(valid(b)&&serial===sequence){records.clear();paint(b,true);root.MemberApplicationManage?.bind(options,false);}}
 }
 function close(){if(!dialog)return;dialog.remove();dialog=null;if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;}
 function clear(){++sequence;++openSequence;binding=null;records.clear();close();root.MemberApplicationManage?.clear();root.MemberAdmissionPolicy?.clear();}
 async function open(uid){
  const b=binding;if(!valid(b)||dialog)return;const serial=++openSequence;let r=records.get(uid);
  if(!r){try{const result=await call(b,[uid]);if(!valid(b)||serial!==openSequence||dialog)return;r=result.items[0];if(!result.enabled||!r)return;records.set(uid,r);paint(b);}catch(_){if(valid(b)&&serial===openSequence)return root.CoopDialog.alert('납입기한을 확인하지 못했습니다. 다시 확인해 주세요.');return;}}
  opener=document.activeElement;const d=node('dialog','border rounded-3 p-4 bg-white text-dark');dialog=d;d.style.cssText='width:min(560px,calc(100% - 32px));max-height:85vh;overflow:auto;word-break:keep-all;color-scheme:light';d.setAttribute('aria-labelledby','admission-heading');
  const target=b.rows.find(m=>(m.id||m.member_uid)===uid),title=node('h2','h5',(target?.name?target.name+' · ':'')+'가입 신청·납입기한');title.id='admission-heading';
  const info=node('div','my-3'),status=node('p','small mt-2','');status.setAttribute('role','status');
  const actions=node('div','d-flex gap-2 flex-wrap justify-content-end mt-3'),remove=node('button','btn btn-outline-danger','종결·파기'),reload=node('button','btn btn-outline-secondary','다시 확인'),cancel=node('button','btn btn-secondary','닫기');remove.type=reload.type=cancel.type='button';
  const render=()=>{info.replaceChildren();const consent=r.application_kind==='organization'||r.consent_status==='not_required'?'':consentText(r,target);for(const text of ['신청 접수일: '+(r.submitted_on||'기록 확인 필요'),'신청 완료일: '+(r.completed_on||'완료 전 또는 기록 확인 필요'),'납입기한: '+(r.due_on||(r.state==='completion_pending'?'신청 완료 후 계산':labels[r.state])),r.basis_kind==='acceptance_notified'?'가입 승낙 통지일: '+(r.basis_on||'미입력'):'',labels[r.state],consent,(r.delivery_kind==='guardian_request'?'자녀 가입·개인정보 동의 요청 · ':'')+deliveries[r.delivery_status]])if(text)info.append(node('p','mb-2',text));
   if(r.basis_kind==='acceptance_notified'&&r.payment_days>0&&root.MemberAdmissionPolicy){const edit=node('button','btn btn-outline-primary btn-sm','승낙 통지일 입력·수정');edit.type='button';edit.onclick=()=>{if(!valid(b))return;close();void root.MemberAdmissionPolicy.openNotice(b,target,r);};info.append(edit);}
   remove.hidden=r.state!=='overdue'||!root.MemberApplicationManage?.canOpen(uid);};render();
  remove.onclick=()=>{if(!valid(b)||dialog!==d||r.state!=='overdue'||!root.MemberApplicationManage?.canOpen(uid))return;close();void root.MemberApplicationManage.openSingle(uid);};
  actions.append(remove,reload,cancel);d.append(title,info,status,actions);
  cancel.onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close();});
  reload.onclick=async()=>{if(reload.disabled||!valid(b))return;reload.disabled=true;status.textContent='확인 중입니다…';try{const result=await call(b,[uid]);if(dialog!==d||!valid(b))return;const fresh=result.items[0];if(!fresh)throw Error('TARGET_CHANGED');r=fresh;records.set(uid,r);paint(b);render();status.textContent='현재 상태를 확인했습니다.';}catch(_){if(dialog===d&&valid(b))status.textContent='현재 상태를 확인하지 못했습니다. 다시 확인해 주세요.';}finally{if(dialog===d)reload.disabled=false;}};
  document.body.append(d);d.showModal();cancel.focus();
 }
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-admission-open]');if(!button)return;e.preventDefault();e.stopPropagation();void open(button.dataset.admissionOpen);},true);
 root.addEventListener('pagehide',clear);root.MemberAdmissionAdmin=Object.freeze({list,clear});
})(window);
