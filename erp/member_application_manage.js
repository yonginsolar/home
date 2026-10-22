/* v1.3.0 — Separate verified backup cleanup from newly pending erasures. */
(function(root){
 'use strict';
 let binding=null,dialog=null,status=null,body=null,controls=null,bank=null,grace=null,opener=null,all=null,sequence=0,badgeSequence=0,busy=false,loaded=false,pending=null,focusId=null,savedSelection=null;
 const selected=new Set(),records=new Map();
 const reasons={not_pending:'정리 대상 아님',payment:'일부 입금·납입 기록 확인 필요',checking:'입금 확인 중',consent:'신청·동의 완료 확인 필요',not_due:'납입·유예 기한 전',notice:'안내 발송 상태 확인 필요',family:'다른 가족의 관리 계정 · 제외',linked_records:'다른 업무 기록이 있어 제외'};
 const reasonLabel=row=>row.blocker==='not_due'?({policy_unconfigured:'신청 당시 납입기한 미설정',no_deadline:'납입기한 없음',basis_pending:'가입 승낙 통지일 미입력'}[row.state]||reasons.not_due):reasons[row.blocker]||'확인 필요';
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const owner=o=>{const c=o?.context();return c?.actor&&c?.coop_id?c.actor+'|'+c.coop_id:'';};
 const valid=b=>b===binding&&b?.enabled&&owner(b)===b.owner&&b.current()&&!root.frameElement?.hidden;
 const ids=b=>b.rows.filter(x=>x.status==='승인대기').map(x=>x.id||x.member_uid).filter(Boolean);
 const viewIds=b=>focusId?ids(b).filter(x=>x===focusId):ids(b);
 const selectable=row=>!!row&&row.blocker!=='payment'&&row.blocker!=='not_pending';
 function clear(){++sequence;++badgeSequence;binding=null;pending=null;busy=false;loaded=false;focusId=null;savedSelection=null;records.clear();selected.clear();dialog?.remove();dialog=null;all=null;document.getElementById('memberApplicationReviewTools')?.replaceChildren();}
 function bind(options,enabled){
  const key=owner(options);if(!key)return;if(binding&&binding.owner!==key)clear();
  loaded=false;if(binding)Object.assign(binding,options,{enabled});else binding={...options,owner:key,enabled};
  const anchor=document.getElementById('memberApplicationReviewTools');if(!anchor)return;
  anchor.hidden=!enabled;
  if(!anchor.firstChild){const b=node('button','btn btn-sm btn-outline-danger','미납 신청 정리·유예');b.type='button';b.onclick=()=>void open();anchor.append(b);}
  if(dialog&&!valid(binding)){status.textContent='현재 권한·조회 범위를 다시 확인해야 합니다. 입력한 내용은 유지됩니다.';update();}
  if(enabled){void badges(binding);if(dialog?.open&&!busy&&!pending)void load();}
 }
 async function badges(b){
  const serial=++badgeSequence;try{const r=await call(b,'status',ids(b));if(!valid(b)||serial!==badgeSequence)return;
   if(!Array.isArray(r.items)||r.items.some(x=>!ids(b).includes(x.member_uid)))return;
   document.querySelectorAll('[data-review-badge],[data-review-status-error],[data-review-backup]').forEach(x=>x.remove());
   for(const [field,label,style] of [['backup_cleanup_completed','백업 정리 완료','text-success'],['backup_cleanup_pending','백업 정리 대기','text-warning-emphasis']]){
    const count=Number(r[field]??0);if(!Number.isSafeInteger(count)||count<=0)continue;
    const text=node('span','small '+style+' ms-2',label+' '+count+'건');text.dataset.reviewBackup=field;document.getElementById('memberApplicationReviewTools')?.append(text);
   }
   for(const row of r.items){const box=[...document.querySelectorAll('[data-admission-member]')].find(x=>x.dataset.admissionMember===row.member_uid);if(!box)continue;
    if(row.checking||row.deferred_until){const label=node('div','small text-primary',row.checking?'입금 확인 중':'유예 종료일 '+row.deferred_until);label.dataset.reviewBadge='';box.append(label);}
   }
  }catch(_){if(valid(b)&&serial===badgeSequence){const anchor=document.getElementById('memberApplicationReviewTools');if(anchor&&!anchor.querySelector('[data-review-status-error]')){const text=node('span','small text-danger ms-2','유예 상태 조회 실패 · 정리 창에서 다시 확인');text.dataset.reviewStatusError='';anchor.append(text);}}}
 }
 async function call(b,action,targetIds,payload={},requestId=null){
  let timer;const controller=new AbortController();
  try{
   let q=b.client.rpc('erp_member_application_manage',{p_action:action,p_member_ids:targetIds,p_payload:payload,p_request_id:requestId});
   const reading=action==='list'||action==='status';if(reading&&q.abortSignal)q=q.abortSignal(controller.signal);
   const result=reading?await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]):await q;
   if(!valid(b))throw Error('CONTEXT_CHANGED');if(result.error)throw result.error;
   if(result.data?.coop_id!==b.context().coop_id)throw Error('CONTEXT_CHANGED');return result.data;
  }finally{clearTimeout(timer);}
 }
 function update(){
  if(!controls)return;const chosen=[...selected].map(x=>records.get(x));
  for(const b of controls.querySelectorAll('button'))b.disabled=busy||!valid(binding)||!!pending;
  for(const b of dialog.querySelectorAll('[data-review-write]'))b.disabled=busy||!loaded||!valid(binding)||!!pending||!chosen.length||chosen.some(x=>!x||x.blocker==='payment'||x.blocker==='not_pending');
  const purge=dialog.querySelector('[data-review-purge]');if(purge)purge.disabled=busy||!loaded||!valid(binding)||!!pending||!chosen.length||!bank.checked||chosen.some(x=>!x?.eligible);
  const receipt=dialog.querySelector('[data-review-receipt]');if(receipt)receipt.disabled=busy||!valid(binding)||!pending;
  grace.disabled=bank.disabled=busy||!!pending||!valid(binding);
  for(const box of body.querySelectorAll('input,[data-review-detail]'))box.disabled=busy||!loaded||!!pending||!valid(binding)||(box.dataset.reviewMember&&!selectable(records.get(box.dataset.reviewMember)));
  const choices=viewIds(binding).filter(id=>selectable(records.get(id))),picked=choices.filter(id=>selected.has(id)).length;
  all.disabled=busy||!loaded||!!pending||!valid(binding)||!choices.length;all.checked=!!choices.length&&picked===choices.length;all.indeterminate=picked>0&&picked<choices.length;all.hidden=!!focusId;
 }
 function render(){
  body.replaceChildren();
  for(const id of viewIds(binding)){
   const row=records.get(id);if(!row)continue;const person=binding.rows.find(x=>(x.id||x.member_uid)===id),tr=node('tr'),cell=node('td'),check=node('input','form-check-input');check.type='checkbox';check.checked=selected.has(id);check.setAttribute('aria-label',(person?.name||'신청자')+' 선택');
   check.dataset.erpQueryControl='';check.dataset.reviewMember=id;check.onchange=()=>{if(!valid(binding)||!loaded||busy||pending||!selectable(row)){check.checked=selected.has(id);return;}if(check.checked)selected.add(id);else selected.delete(id);bank.checked=false;update();};cell.append(check);
   const reason=node('td',row.eligible?'text-danger':'text-muted',row.eligible?'정리 가능':reasonLabel(row));
   const bankHistory=Array.isArray(row.blocker_details)?row.blocker_details.find(x=>x?.code==='bank_account_history'&&Number.isSafeInteger(x.count)&&x.count>0):null;
   const detail=node('button','btn btn-link btn-sm d-block p-0 mt-1','상세 사유');detail.type='button';detail.dataset.reviewDetail='';
   detail.onclick=()=>{if(!valid(binding)||!loaded||busy||pending||records.get(id)!==row)return;
    const messages=[row.eligible?'정리 가능':reasonLabel(row)];
    if(bankHistory)messages.push('계좌정보 변경 이력 '+bankHistory.count+'건');
    void root.CoopDialog.alert(messages.join('\n\n'),{title:'상세 사유'});
   };reason.append(detail);
   tr.append(cell,node('td','fw-bold',person?.name||'신청자'),node('td','',row.due_on||({policy_unconfigured:'미설정',no_deadline:'기한 없음',basis_pending:'승낙 통지일 미입력'}[row.state]||'완료 전')),node('td','',row.deferred_until||'—'),reason);body.append(tr);
  }
  update();
 }
 async function load(){
  const b=binding;if(!valid(b)||busy||pending)return;const serial=++sequence;busy=true;loaded=false;status.textContent='현재 상태를 확인하고 있습니다…';update();
  try{const targetIds=viewIds(b),r=await call(b,'list',targetIds);if(!valid(b)||serial!==sequence)return;if(targetIds.join('|')!==viewIds(b).join('|'))throw Error('TARGET_CHANGED');
   if(!Array.isArray(r.items)||r.items.some(x=>!targetIds.includes(x.member_uid)||typeof x.eligible!=='boolean'||typeof x.revision!=='string'))throw Error('RESPONSE_INVALID');
   records.clear();r.items.forEach(x=>records.set(x.member_uid,x));for(const id of selected)if(!records.has(id)||!selectable(records.get(id)))selected.delete(id);
   bank.checked=false;loaded=true;render();status.textContent='';
  }catch(_){if(valid(b)&&serial===sequence)status.textContent='조회하지 못했습니다. 입력은 유지됩니다. 다시 확인해 주세요.';}
  finally{if(b===binding&&serial===sequence){busy=false;update();}}
 }
 const failure=e=>e?.code==='PT409'?'다른 변경이 있어 처리하지 않았습니다. 다시 확인한 뒤 선택해 주세요.':e?.code==='42501'?'이 작업을 처리할 권한이 없습니다.':String(e?.code||'').startsWith('22')?'입금 약속일과 확인 항목을 확인해 주세요. 처리하지 않았고 입력은 유지됩니다.':e?.code==='23503'?'연결된 업무 기록이 있어 처리하지 않았습니다. 다시 확인해 주세요.':'처리 결과를 확인하지 못했습니다. 결과 확인을 누르세요. 확인 전에는 다시 실행하지 않습니다.';
 function finish(result){
  if(pending?.action==='review'&&pending.payload.deferred_until&&grace.value===pending.payload.deferred_until){const saved=grace.cloneNode(true);saved.value=grace.value;grace.replaceWith(saved);grace=saved;}
  const removed=pending?.ids||[];pending=null;selected.clear();bank.checked=false;status.textContent=result.operating_information_erased?
   result.applied+'건을 종결·파기했습니다. 백업 정리 대기 중입니다.':'저장했습니다.';
  if(result.operating_information_erased){for(const id of removed){records.delete(id);savedSelection?.delete(id);}binding.rows=binding.rows.filter(x=>!removed.includes(x.id||x.member_uid));render();binding.refresh?.();}
  else root.queueMicrotask(()=>{void load();void badges(binding);});
 }
 async function mutate(action,fields){
  const b=binding;if(!valid(b)||!loaded||busy||pending)return;const chosen=[...selected],revisions={};if(!chosen.length)return;
  for(const id of chosen){const row=records.get(id);if(!ids(b).includes(id)||!row||row.blocker==='payment'||row.blocker==='not_pending')return;revisions[id]=row.revision;}
  if(action==='purge'&&(!bank.checked||chosen.some(id=>!records.get(id).eligible)))return;
  if(fields.deferred_until&&!grace.checkValidity()){grace.reportValidity();return;}
  const capture=JSON.stringify(chosen.map(id=>[id,revisions[id]]));busy=true;update();
  try{
   if(action==='purge'){
    const yes=await root.CoopDialog.confirm(chosen.length+'건의 신청정보와 계좌정보 변경 이력을 파기할까요?\n되돌릴 수 없습니다.',{title:'미납 신청 종결·파기',confirmText:'선택한 신청 파기',cancelText:'취소'});
    if(!yes||!valid(b)||capture!==JSON.stringify([...selected].map(id=>[id,records.get(id)?.revision])))return;
   }
   const request={id:root.crypto.randomUUID(),action,ids:chosen,payload:{...fields,revisions}};pending=request;status.textContent='처리 중입니다…';
   try{const result=await call(b,action,chosen,request.payload,request.id);if(valid(b))finish(result);}
   catch(e){if(valid(b)){if(['42501','PT409','23503'].includes(e?.code)||String(e?.code||'').startsWith('22')){pending=null;loaded=false;}status.textContent=failure(e);}}
  }finally{if(b===binding){busy=false;update();}}
 }
 async function receipt(){
  const b=binding,request=pending;if(!valid(b)||busy||!request)return;busy=true;update();
  try{const r=await call(b,'receipt',[],{},request.id);if(pending!==request)return;if(r.found)finish(r.result);else{status.textContent='완료 기록이 아직 없습니다. 결과가 확인될 때까지 기존 요청을 유지하며 다시 실행하지 않습니다. 잠시 후 처리 결과를 다시 확인하세요.';}}
  catch(_){if(valid(b))status.textContent='결과를 확인하지 못했습니다. 입력과 요청 기록을 유지합니다.';}
  finally{if(b===binding){busy=false;update();}}
 }
 function leaveSingle(){if(!focusId)return;focusId=null;selected.clear();for(const id of savedSelection||[])if(ids(binding).includes(id))selected.add(id);savedSelection=null;loaded=false;if(bank)bank.checked=false;}
 function close(){if(busy&&pending)return;++sequence;busy=false;dialog?.close();if(!pending)leaveSingle();if(opener?.isConnected)opener.focus({preventScroll:true});}
 const canOpen=uid=>valid(binding)&&!busy&&!pending&&ids(binding).includes(uid);
 async function open(uid=null){
  if(uid&&!canOpen(uid))return false;
  if(!valid(binding))return;if(document.querySelector('.modal.show'))return root.CoopDialog.alert('열린 편집창을 먼저 닫아 주세요. 입력한 내용은 그대로 유지됩니다.');
  if(busy)return false;
  if(uid){if(!focusId)savedSelection=new Set(selected);focusId=uid;selected.clear();selected.add(uid);if(bank)bank.checked=false;}
  else if(!pending)leaveSingle();
  opener=document.activeElement;
  if(dialog){document.getElementById('memberApplicationManageTitle').textContent=focusId?'신청 종결·파기':'미납 신청 정리·유예';if(!dialog.open)dialog.showModal();if(!pending)await load();return true;}
  const d=node('dialog','border rounded-3 p-4 bg-white text-dark');dialog=d;d.id='memberApplicationManageDialog';d.style.cssText='width:min(900px,calc(100% - 32px));max-height:85vh;overflow:auto;word-break:keep-all;color-scheme:light';d.setAttribute('aria-labelledby','memberApplicationManageTitle');
  const title=node('h2','h5',focusId?'신청 종결·파기':'미납 신청 정리·유예');title.id='memberApplicationManageTitle';
  const wrap=node('div','table-responsive'),table=node('table','table table-sm align-middle');const head=node('thead'),hr=node('tr'),selectionHead=node('th');
  all=node('input','form-check-input');all.type='checkbox';all.dataset.reviewAll='';all.dataset.erpQueryControl='';all.setAttribute('aria-label','전체 선택');all.title='전체 선택';
  all.onchange=()=>{if(!valid(binding)||!loaded||busy||pending)return;for(const id of viewIds(binding)){if(!selectable(records.get(id)))continue;if(all.checked)selected.add(id);else selected.delete(id);}bank.checked=false;for(const box of body.querySelectorAll('[data-review-member]'))box.checked=selected.has(box.dataset.reviewMember);update();};
  selectionHead.append(all,node('span','small ms-1','선택'));hr.append(selectionHead);for(const t of ['신청자','납입기한','유예 종료일','현재 상태'])hr.append(node('th','',t));head.append(hr);body=node('tbody');table.append(head,body);wrap.append(table);
  controls=node('div','d-flex flex-wrap gap-2 align-items-center my-3');const refresh=node('button','btn btn-sm btn-outline-secondary','다시 확인');refresh.type='button';refresh.onclick=()=>void load();
  grace=node('input','form-control form-control-sm');grace.type='date';grace.id='memberApplicationGrace';grace.style.width='170px';const gl=node('label','small','입금 약속일');gl.htmlFor=grace.id;
  const add=(text,fields)=>{const b=node('button','btn btn-sm btn-outline-primary',text);b.type='button';b.dataset.reviewWrite='';b.onclick=()=>void mutate('review',fields());controls.append(b);};
  controls.append(refresh,gl,grace);add('선택 신청 유예',()=>({deferred_until:grace.value||'invalid'}));add('유예 해제',()=>({deferred_until:null}));add('입금 확인 중',()=>({checking:true}));add('확인 중 해제',()=>({checking:false}));
  bank=node('input','form-check-input me-2');bank.type='checkbox';bank.dataset.erpQueryControl='';bank.id='memberApplicationBankChecked';bank.onchange=update;const bl=node('label','small d-block');bl.htmlFor=bank.id;bl.append(bank,document.createTextNode('통장을 대조했고 선택한 신청에 입금이 없음을 확인했습니다.'));
  status=node('p','small my-3','');status.setAttribute('role','status');
  const actions=node('div','d-flex flex-wrap gap-2 justify-content-end'),result=node('button','btn btn-outline-secondary','처리 결과 확인'),purge=node('button','btn btn-danger','선택한 신청 종결·파기'),cancel=node('button','btn btn-secondary','닫기');result.type=purge.type=cancel.type='button';result.dataset.reviewReceipt='';purge.dataset.reviewPurge='';result.onclick=()=>void receipt();purge.onclick=()=>void mutate('purge',{bank_checked:true,include_bank_history:true});cancel.onclick=close;actions.append(result,purge,cancel);
  d.addEventListener('cancel',e=>{e.preventDefault();close();});d.append(title,wrap,controls,bl,status,actions);document.body.append(d);d.showModal();cancel.focus();await load();return true;
 }
 root.MemberApplicationManage=Object.freeze({bind,clear,canOpen,openSingle:uid=>canOpen(uid)?open(uid):Promise.resolve(false)});root.addEventListener('pagehide',clear);
 // Only a submitted write with an unresolved result is a navigation blocker.
 root.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
})(window);
