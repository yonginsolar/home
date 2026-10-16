/* v1.0.0 — Confirmed admission-notice receipt, never automatic withdrawal or deletion. */
(function(root){
 'use strict';
 let binding=null,sequence=0,openSequence=0,writeSequence=0,dialog=null,saving=false,allowedClose=false,opener=null;
 const records=new Map(),requests=new Map();
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const identity=o=>{const c=o?.context();return c?.actor&&c?.coop_id?c.actor+'|'+c.coop_id:'';};
 const valid=b=>b===binding&&identity(b)===b.owner&&!!b.owner&&b.current()&&!root.frameElement?.hidden;
 const labels={notice_unknown:'통지 수령일 미확인',waiting:'납입기한 내',overdue:'납입기한 경과 · 관리자 확인',payment_check:'납입 상태·기록 확인'};
 async function call(b,action,ids,extra={}){
  let timer;const controller=new AbortController();
  try{
   const q=b.client.rpc('erp_member_admission',{p_action:action,p_member_ids:ids,...extra});
   const r=action==='get'?await Promise.race([q.abortSignal?q.abortSignal(controller.signal):q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]):await q;
   if(!valid(b))throw Error('CONTEXT_CHANGED');if(r.error)throw r.error;
   if(r.data?.coop_id!==b.context().coop_id||typeof r.data.enabled!=='boolean'||!Array.isArray(r.data.items))throw Error('CONTEXT_CHANGED');
   for(const x of r.data.items)if(!ids.includes(x.member_uid)||!labels[x.state]||!Number.isSafeInteger(x.revision)||x.revision<0)throw Error('RESPONSE_INVALID');
   return r.data;
  }finally{clearTimeout(timer);}
 }
 function paint(b,failed=false){
  if(!valid(b))return;
  document.querySelectorAll('[data-admission-member]').forEach(box=>{
   const uid=box.dataset.admissionMember,r=records.get(uid);box.replaceChildren();box.hidden=false;
   if(!failed&&!r){box.hidden=true;return;}
   const button=node('button','btn btn-link btn-sm text-start p-0 mt-1',failed?'납입기한 조회 재시도':labels[r.state]);button.type='button';
   button.dataset.admissionOpen=uid;if(r?.state==='overdue')button.classList.add('text-danger');box.append(button);
   if(r?.due_on&&!failed)box.append(node('div','small text-muted','납입기한 '+r.due_on));
  });
 }
 async function list(options){
  const nextOwner=identity(options);if(!nextOwner)return;
  if(binding?.owner!==nextOwner)clear();
  // Resume refresh must never invalidate an open form or its pending write.
  if(dialog||saving){binding.current=options.current;return;}
  const b={...options,owner:nextOwner};binding=b;const serial=++sequence;
  const ids=options.rows.filter(m=>m.status==='승인대기').map(m=>m.id||m.member_uid).filter(Boolean);
  if(!ids.length){records.clear();return;}
  try{const r=await call(b,'get',ids);if(!valid(b)||serial!==sequence)return;records.clear();if(r.enabled)r.items.forEach(x=>records.set(x.member_uid,x));paint(b);}
  catch(_){if(valid(b)&&serial===sequence){records.clear();paint(b,true);}}
 }
 function close(force=false){
  if(!dialog)return;if(saving&&!force)return;
  allowedClose=true;dialog.remove();dialog=null;allowedClose=false;
  if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;
 }
 function clear(){++sequence;++openSequence;++writeSequence;saving=false;binding=null;records.clear();requests.clear();close(true);}
 async function open(uid){
  const b=binding;if(!valid(b)||saving||dialog)return;
  const openSerial=++openSequence;
  let r=records.get(uid);
  if(!r){try{const result=await call(b,'get',[uid]);if(!valid(b)||openSerial!==openSequence||dialog)return;r=result.items[0];if(!result.enabled||!r)return;records.set(uid,r);paint(b);}catch(_){if(valid(b)&&openSerial===openSequence)return root.CoopDialog.alert('납입기한을 확인하지 못했습니다. 다시 확인해 주세요.');return;}}
  opener=document.activeElement;
  const d=node('dialog','border rounded-3 p-4 bg-white text-dark');dialog=d;d.style.cssText='width:min(560px,calc(100% - 32px));max-height:85vh;overflow:auto;word-break:keep-all;color-scheme:light';
  d.setAttribute('aria-labelledby','admission-heading');
  const target=b.rows.find(m=>(m.id||m.member_uid)===uid);
  const title=node('h2','h5',(target?.name?target.name+' · ':'')+'가입 통지·납입기한 확인');title.id='admission-heading';
  const label=node('label','form-label mt-2','가입 통지를 받은 날');label.htmlFor='admission-received';
  const input=node('input','form-control');input.id='admission-received';input.type='date';input.value=r.received_on||'';
  input.max=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  // This form owns its guard; don't leave a generic dirty flag after a successful explicit save.
  input.dataset.erpQueryControl='';
  const hint=node('p','small text-muted mt-2','신청일·알림 발송일이 아닌 실제 수령일을 확인해 입력하세요. 미성년자는 해당 자녀의 가입 통지를 법정대리인이 받은 날입니다. 부모의 가입일·동의일이나 다른 자녀의 수령일을 대신 쓰지 않습니다. 수령일부터 10일이 지나면 관리자 확인 대상으로 표시하며 자동 철회·삭제·알림 발송은 하지 않습니다.');
  const status=node('p','small mt-2',labels[r.state]+(r.due_on?' · 납입기한 '+r.due_on:''));status.setAttribute('role','status');
  const actions=node('div','d-flex flex-wrap gap-2 justify-content-end mt-3'),reload=node('button','btn btn-outline-secondary','기록 다시 확인'),cancel=node('button','btn btn-secondary','닫기'),save=node('button','btn btn-primary','수령일 저장');reload.type=cancel.type=save.type='button';actions.append(reload,cancel,save);d.append(title,label,input,hint,status,actions);
  let baseline=input.value;const dirty=()=>!!dialog&&input.value!==baseline;
  const dismiss=async()=>{if(saving||allowedClose)return;if(dirty()&&!(await root.CoopDialog.confirm('저장하지 않은 수령일을 버리고 닫을까요?')))return;if(dialog===d)close();};
  cancel.onclick=dismiss;d.addEventListener('cancel',e=>{e.preventDefault();void dismiss();});
  const guard=e=>{if(dirty()||saving)e.preventDefault();};root.addEventListener('beforeunload',guard);
  const remove=d.remove.bind(d);d.remove=()=>{root.removeEventListener('beforeunload',guard);remove();};
  reload.onclick=async()=>{
   if(saving||reload.disabled||!valid(b))return;reload.disabled=save.disabled=true;status.textContent='현재 기록을 확인하고 있습니다…';
   try{const result=await call(b,'get',[uid]);if(dialog!==d||!valid(b))return;const fresh=result.items[0];if(!fresh)throw Error('TARGET_CHANGED');r=fresh;records.set(uid,r);baseline=r.received_on||'';paint(b);status.textContent='현재 기록을 확인했습니다. 입력 중인 날짜는 유지됩니다. '+labels[r.state];}
   catch(_){if(dialog===d&&valid(b))status.textContent='현재 기록을 확인하지 못했습니다. 입력한 날짜는 유지됩니다.';}
   finally{if(dialog===d){reload.disabled=save.disabled=false;}}
  };
  save.onclick=async()=>{
   if(saving||!valid(b)||dialog!==d)return;
   const value=input.value;
   if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>input.max)){status.textContent='오늘까지의 수령일을 선택해 주세요.';return;}
   if(!value&&baseline&&!(await root.CoopDialog.confirm('수령일을 미확인으로 바꿀까요? 기존 기한 경과 표시는 해제됩니다.')))return;
   if(!valid(b)||dialog!==d)return;
   if(value===baseline){status.textContent='변경한 내용이 없습니다.';return;}
   const fingerprint=JSON.stringify([uid,value,r.revision]);let req=requests.get(uid);
   if(!req||req.fingerprint!==fingerprint){req={fingerprint,id:crypto.randomUUID()};requests.set(uid,req);}
   const saveSerial=++writeSequence;saving=true;save.disabled=cancel.disabled=reload.disabled=true;input.disabled=true;status.textContent='저장 중입니다…';
   try{
    const result=await call(b,'set',[uid],{p_received_on:value||null,p_expected_revision:r.revision,p_request_id:req.id});
    if(!valid(b)||dialog!==d)return;const updated=result.items[0];if(!updated)throw Error('TARGET_CHANGED');
    r=updated;records.set(uid,r);baseline=value;requests.delete(uid);paint(b);status.textContent='저장했습니다. '+labels[r.state]+(r.due_on?' · 납입기한 '+r.due_on:'');
   }catch(e){if(valid(b)&&dialog===d){
    status.textContent=/PT409|STALE|CHANGED/.test(String(e?.code)+' '+String(e?.message))?'현재 기록이 달라졌습니다. 입력은 유지됩니다. 기록 다시 확인 후 저장해 주세요.':'저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 다시 저장하면 같은 요청으로 확인합니다.';
   }}finally{if(saveSerial===writeSequence)saving=false;if(dialog===d){save.disabled=cancel.disabled=reload.disabled=input.disabled=false;}}
  };
  document.body.append(d);d.showModal();input.focus();
 }
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-admission-open]');if(!button)return;e.preventDefault();e.stopPropagation();void open(button.dataset.admissionOpen);},true);
 root.addEventListener('pagehide',clear);
 root.MemberAdmissionAdmin=Object.freeze({list,clear});
})(window);
