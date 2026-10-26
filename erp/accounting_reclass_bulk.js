/* v1.0.0 — explicit review, atomic server commit, memory-only same-request recovery. */
(function(root){'use strict';
 function create(api){
  let busy=false,pending=null,notice='',noticeOwner='';const edits=new WeakMap();
  const button=()=>document.getElementById('approvalReclassBulkConfirm');
  const owner=()=>api.owner();
  function selected(){
   return [...api.items().values()].map(item=>{const input=document.getElementById('approvalReclassAccount-'+item.domKey),row=input?.closest('[data-accounting-key]');
    return input?.value.trim()&&row?{item,row,input,snapshot:api.snapshot(row),revision:edits.get(row)||0}:null;}).filter(Boolean);
  }
  function sync(){
   const bar=document.getElementById('approvalReclassBulkBar');if(!bar)return;
   const rows=selected(),mine=owner(),ownPending=pending?.owner===mine;
   bar.hidden=!rows.length&&!ownPending&&!(noticeOwner===mine&&notice);
   button().textContent=`일괄 확인 (${rows.length}건)`;
   button().disabled=busy||!!pending||!api.editable()||!rows.length||rows.some(r=>!api.ready(r.item.domKey)||api.locked(r.item.domKey));
   const check=document.getElementById('approvalReclassBulkResult');check.hidden=!ownPending;check.disabled=busy||!api.editable();
   check.textContent=pending?.absent?'같은 요청 다시 처리':'저장 결과 확인';
   document.getElementById('approvalReclassBulkStatus').textContent=noticeOwner===mine?notice:'';
  }
  function say(text,who=owner()){notice=text;noticeOwner=who;sync();}
  function valid(t,compare=true){return owner()===t.owner&&api.current(t.scope)&&api.editable()&&t.rows.every(r=>
    r.row.isConnected&&api.ready(r.item.domKey)&&(!compare||(api.snapshot(r.row)===r.snapshot&&(edits.get(r.row)||0)===r.revision)));}
  async function call(action,t){
   const controller=new AbortController();let timer;
   try{
    const query=api.client().rpc('accounting_reclass_bulk',{p_action:action,p_items:t.items||[],p_expected:t.expected||null,p_request_key:t.key||null});
    const request=typeof query.abortSignal==='function'?query.abortSignal(controller.signal):query;
    const result=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('RECLASS_RESPONSE_TIMEOUT'));},15000);})]);
    if(result.error)throw result.error;return result.data;
   }finally{clearTimeout(timer);controller.abort();}
  }
  function errorText(e){
   if(e?.code==='42501')return '현재 권한을 다시 확인해 주세요.';
   if(e?.code==='PT409')return '대상이나 계정과목이 달라졌습니다. 목록을 다시 확인해 주세요.';
   if(e?.code==='22023')return '선택한 항목과 계정과목을 확인해 주세요.';
   if(e?.code==='55P03')return '다른 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요.';
   return '확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
  }
  function release(t){for(const r of t.rows)api.unlock(r.item.domKey);api.sync();}
  async function settled(t,result){
   const ids=t.rows.map(r=>'APR-RCLS-'+r.item.sourceId).sort();
   if(result?.ok!==true||result.verified!==true||result.found!==true||result.count!==ids.length||
    !Array.isArray(result.trans_ids)||JSON.stringify([...result.trans_ids].sort())!==JSON.stringify(ids))throw Error('UNVERIFIED');
   if(pending!==t)return;
   pending=null;release(t);
   if(owner()!==t.owner)return;
   for(const r of t.rows)if(r.row.isConnected&&api.ready(r.item.domKey))api.accept(r.item.domKey,r.snapshot);
   api.undo(ids);say(`${ids.length}건을 재분류했습니다.`,t.owner);
   if(api.current(t.scope)){
    try{const loaded=await api.refresh();if(loaded===false)say('재분류는 완료했습니다. 목록은 다시 확인해 주세요.',t.owner);}
    catch(_){say('재분류는 완료했습니다. 목록은 다시 확인해 주세요.',t.owner);}
   }
  }
  async function send(t){
   try{await settled(t,await call('commit',t));}
   catch(e){
    if(pending!==t)return;
    if(['42501','22023','PT409','23514','23503','P0001','57014','55P03'].includes(e?.code)){pending=null;release(t);say(errorText(e),t.owner);}
    else say('저장 결과를 확인하지 못했습니다. ‘저장 결과 확인’을 눌러 주세요.',t.owner);
   }
  }
  async function review(){
   if(busy||pending||!api.editable())return;
   const rows=selected();if(!rows.length)return;
   if(rows.length>200){say('한 번에 200건까지 확인할 수 있습니다.');return;}
   const t={owner:owner(),scope:api.scope(),rows,items:[],key:null,expected:null};
   if(!valid(t)||rows.some(r=>api.locked(r.item.domKey))){say('목록을 다시 확인한 뒤 진행해 주세요.');return;}
   for(const r of rows){const a=api.account(r.input.value,r.input.dataset.accountType);if(!a||!Number.isSafeInteger(r.item.amount)||r.item.amount<=0){say('선택한 계정과목과 금액을 다시 확인해 주세요.');return;}
    const s=r.item;t.items.push({source:{source_id:String(s.sourceId),trans_id:s.transId,date:s.date,amount:s.amount,project:s.project,description:s.description},
     account:r.input.value.trim(),type:String(a.Type||'').trim(),use_vat:!!document.getElementById('approvalReclassVat-'+s.domKey)?.checked});}
   busy=true;sync();
   try{
    const preview=await call('preview',t);
    if(!valid(t))return;
    if(!preview?.verified||!Array.isArray(preview.items)||preview.items.length!==rows.length)throw Error('UNVERIFIED');
    t.expected=preview.items;
    const lines=preview.items.map((p,i)=>`${i+1}. ${p.source.description||'지출결의'} → ${p.account} · ${Number(p.source.amount).toLocaleString()}원${p.vat?' (부가세 '+Number(p.vat).toLocaleString()+'원)':''}`);
    const accepted=await api.confirm(`${rows.length}건 · 합계 ${Number(preview.total).toLocaleString()}원을 재분류할까요?\n\n${lines.join('\n')}`);
    if(!accepted||!valid(t))return;
    t.key=crypto.randomUUID();pending=t;for(const r of rows)api.lock(r.item.domKey);api.sync();
    await send(t);
   }catch(e){if(owner()===t.owner&&api.current(t.scope))say(errorText(e),t.owner);}
   finally{busy=false;sync();}
  }
  async function recover(){
   const t=pending;if(!t||busy||t.owner!==owner()||!api.editable()||!api.current(api.scope()))return;
   busy=true;sync();
   try{
    if(t.absent){t.absent=false;await send(t);return;}
    const result=await call('result',t);
    if(pending!==t||owner()!==t.owner)return;
    if(result?.verified!==true)throw Error('UNVERIFIED');
    if(result.found===true)await settled(t,result);
    else if(result.found===false){t.absent=true;say('아직 처리 결과가 없습니다. 같은 요청으로 다시 처리할 수 있습니다.',t.owner);}
    else throw Error('UNVERIFIED');
   }catch(_){if(owner()===t.owner)say('저장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',t.owner);}
   finally{busy=false;sync();}
  }
  const list=document.getElementById('approvalUnclassifiedList'),changed=e=>{const row=e.target.closest('[data-accounting-key]');if(row)edits.set(row,(edits.get(row)||0)+1);sync();};
  list?.addEventListener('change',changed);list?.addEventListener('input',changed);
  button()?.addEventListener('click',()=>void review());document.getElementById('approvalReclassBulkResult')?.addEventListener('click',()=>void recover());
  return Object.freeze({sync,review,recover,isBusy:()=>busy||!!pending});
 }
 root.AccountingReclassBulk=Object.freeze({version:'1.0.0',create});
})(window);
