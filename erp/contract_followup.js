/* v1.0.2 — Scoped saved checkpoints and owner/employee drafts across retained workspace routes. */
(function(host){
 'use strict';
 const labels={unconfirmed:'미확인',required:'근로계약 대상',excluded:'비대상'};
 let bank={drafts:new Map(),invalidOwners:new Set(),listeners:new Set()};
 try{if(host.parent!==host&&host.parent.ErpWorkspaceShell){const key=Symbol.for('erp.hr.contractFollowup.v1');bank=host.parent[key]||(host.parent[key]=bank);}}catch(_){}
 const {drafts,invalidOwners}=bank;let view=null,epoch=0,lastOwner='';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function owned(v){return view===v&&v.epoch===epoch&&!invalidOwners.has(v.context.owner)&&v.context.isCurrent()&&v.visible();}
 function dirty(r){return r.loaded&&r.draft!==r.target;}
 const update=r=>{if(view?.record===r)render(view);};bank.listeners.add(update);
 function paint(r){for(const notify of bank.listeners){try{notify(r);}catch(_){/* A removed sibling frame cannot block this owner's result. */}}}
 function render(v){
  if(!owned(v))return;const r=v.record;
  v.select.value=r.draft;v.select.disabled=!r.loaded||r.reading||!!r.conflict;
  v.save.disabled=!r.loaded||!r.verified||r.reading||r.saving||!!r.conflict||(!r.attempt&&!dirty(r));
  v.save.textContent=r.saving?'저장 중…':r.attempt?'같은 요청으로 저장':'구분 저장';
  v.retry.disabled=r.reading||r.saving;v.retry.textContent=r.attempt?'저장 결과 확인':'다시 확인';
  v.discard.disabled=r.reading||r.saving||!!r.attempt||(!dirty(r)&&!r.conflict);
  v.status.textContent=r.message||(r.reading?'조회 중…':dirty(r)?'구분을 변경했습니다. 저장해 주세요.':'저장된 구분: '+labels[r.target]);
  if(r.loaded&&r.verified&&!r.reading&&!r.saving&&!r.attempt&&!dirty(r))host.ErpWorkspaceResume?.checkpoint(v.root);
 }
 async function rpc(v,args,signal){
  const q=v.client.rpc('erp_hr_contract_followup',args);return await(q.abortSignal?q.abortSignal(signal):q);
 }
 function accept(v,data){
  const r=v.record;
  if(data?.coop_id!==v.coop||data.emp_id!==v.context.empId||!Object.hasOwn(labels,data.target)||!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('INVALID_RESPONSE');
  r.latest=data;
  const applied=r.attempt&&data.own_request_applied===true;
  if(applied){r.target=data.target;r.revision=data.revision;r.attempt=null;r.conflict=false;r.message=dirty(r)?'구분을 저장했습니다. 이후 변경한 선택은 미저장입니다.':'구분을 저장했습니다.';}
  else if(!r.loaded||!dirty(r)&&!r.attempt){r.target=data.target;r.revision=data.revision;r.draft=data.target;r.conflict=false;r.message='';}
  else if(!r.attempt&&r.revision!==data.revision){r.conflict=true;r.message='다른 담당자가 구분을 변경했습니다. 선택은 유지했습니다. 변경사항을 버린 뒤 최신 구분에서 다시 선택해 주세요.';}
  else if(r.attempt){r.message='이전 저장 결과를 아직 확인하지 못했습니다. 같은 요청으로 저장하거나 결과를 다시 확인해 주세요.';}
  r.loaded=true;r.verified=true;
 }
 async function read(v){
  const r=v.record;if(!owned(v)||r.reading||r.saving)return;
  r.reading=true;r.verified=false;r.readTicket=v;r.message='';const controller=new AbortController();v.controller=controller;render(v);let timer;
  try{
   const response=await Promise.race([rpc(v,{p_action:'read',p_emp_id:v.context.empId,p_request_id:r.attempt?.key||null},controller.signal),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
   if(!owned(v))return;if(response.error)throw Error('READ_FAILED');accept(v,response.data);
  }catch(_){if(owned(v))r.message='구분을 확인하지 못했습니다. 선택을 유지한 채 다시 확인해 주세요.';}
  finally{clearTimeout(timer);if(r.readTicket===v){r.reading=false;r.readTicket=null;}if(v.controller===controller)v.controller=null;paint(r);}
 }
 async function save(v){
  const r=v.record;if(!owned(v)||!r.loaded||!r.verified||r.reading||r.saving||r.conflict||(!r.attempt&&!dirty(r)))return;
  const attempt=r.attempt||(r.attempt={key:crypto.randomUUID(),target:r.draft,revision:r.revision});
  const operation={};r.saveTicket=operation;r.saving=true;r.message='저장 중…';render(v);let timer;
  const request=rpc(v,{p_action:'save',p_emp_id:v.context.empId,p_target:attempt.target,p_expected_revision:attempt.revision,p_request_id:attempt.key});
  // A deadline changes only the UI. The same key/payload remains locked for recovery.
  const apply=response=>{
   if(r.attempt!==attempt)return;
   if(response.error){
    if(!attempt.uncertain&&['PT409','22023','42501'].includes(response.error.code)){r.attempt=null;r.conflict=response.error.code==='PT409';r.message=r.conflict?'저장된 구분이 바뀌었습니다. 다시 확인해 주세요.':'구분을 저장하지 못했습니다. 권한과 선택을 다시 확인해 주세요.';}
    else{attempt.uncertain=true;r.message='저장 결과를 확인하지 못했습니다. 결과 확인을 먼저 이용해 주세요.';}
   }else{
    // Update only this employee's parked record, never a newer view or draft.
    accept(v,response.data);
   }
   paint(r);
  };
  try{
   await Promise.race([request.then(apply),new Promise(resolve=>{timer=setTimeout(()=>{if(r.attempt===attempt){attempt.uncertain=true;r.message='저장이 지연되고 있습니다. 저장 결과를 확인해 주세요.';}resolve();},15000);})]);
  }catch(_){if(r.attempt===attempt){attempt.uncertain=true;r.message='저장 결과를 확인하지 못했습니다. 결과 확인을 먼저 이용해 주세요.';}}
  finally{clearTimeout(timer);if(r.saveTicket===operation){r.saving=false;r.saveTicket=null;}paint(r);}
  request.catch(()=>{});
 }
 function suspend(){
  if(view){view.controller?.abort();if(view.record.readTicket===view){view.record.reading=false;view.record.readTicket=null;}view.root.replaceChildren();view.root.hidden=true;}view=null;epoch++;
 }
 function mount(options){
  const context=options.context,root=options.root;
  if(!root||!context?.isCurrent()||invalidOwners.has(context.owner)||!options.visible())return;
  const key=context.owner+'|'+context.empId;
  lastOwner=context.owner;
  if(view?.key===key&&owned(view))return;
  suspend();
  let record=drafts.get(key);if(!record){record={target:'unconfirmed',draft:'unconfirmed',revision:0,loaded:false};drafts.set(key,record);}
  const v=view={...options,context,key,record,epoch};root.hidden=false;
  const heading=el('h3','fs-6 fw-bold mb-1','근로계약 대상 구분');
  const label=el('label','form-label small','대상 여부');label.htmlFor='employeeContractTarget';
  const select=v.select=el('select','form-select');select.id='employeeContractTarget';
  for(const [value,text]of Object.entries(labels)){const o=el('option','',text);o.value=value;select.append(o);}
  const controls=el('div','d-flex flex-wrap gap-2 mt-2');
  const saveButton=v.save=el('button','btn btn-sm btn-primary','구분 저장'),retry=v.retry=el('button','btn btn-sm btn-outline-primary','다시 확인'),discard=v.discard=el('button','btn btn-sm btn-outline-secondary','변경사항 버리기');
  for(const b of [saveButton,retry,discard])b.type='button';controls.append(saveButton,retry,discard);
  const status=v.status=el('p','small text-break mt-2 mb-0');status.setAttribute('role','status');
  root.append(heading,label,select,controls,status);
  select.onchange=()=>{if(!owned(v))return;record.draft=select.value;record.message='';render(v);};
  saveButton.onclick=()=>void save(v);retry.onclick=()=>void read(v);
  discard.onclick=async()=>{
   if(!owned(v)||record.attempt||record.saving||record.reading)return;
   const selected=record.draft,revision=record.revision;
   if(!await host.CoopDialog.confirm('이 구분 변경사항을 버릴까요?'))return;
   if(!owned(v)||record.draft!==selected||record.revision!==revision||record.saving||record.attempt)return;
   if(record.latest){record.target=record.latest.target;record.revision=record.latest.revision;}
   record.draft=record.target;record.conflict=false;record.message='';render(v);
  };
  render(v);void read(v);
 }
 const ownRecords=()=>invalidOwners.has(lastOwner)?[]:[...drafts].filter(([key])=>key.startsWith(lastOwner+'|')).map(([,r])=>r);
 host.addEventListener('beforeunload',event=>{if(ownRecords().some(r=>dirty(r)||r.attempt)){event.preventDefault();event.returnValue='';}});
 host.addEventListener('unload',()=>bank.listeners.delete(update));
 host.HrContractFollowup=Object.freeze({mount,suspend,invalidateOwner:owner=>{invalidOwners.add(owner);suspend();},dirty:()=>ownRecords().some(dirty)});
})(window);
