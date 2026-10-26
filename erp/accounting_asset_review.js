/* v1.0.1 — keep later drafts editable after a verified save and matching reread. */
(function(root){'use strict';
 function create(api){
  const pending=new Map(),completed=new Map(),edits=new WeakMap();let notice='',noticeOwner='';
  const key=(owner,id)=>owner+'|'+id;
  let noticeNode;
  function sync(){const box=document.getElementById('assetReviewRecovery');if(!box)return;const own=api.owner(),nodes=[];
   if(noticeOwner===own&&notice){if(!noticeNode){noticeNode=document.createElement('p');noticeNode.className='small mb-2';}noticeNode.textContent=notice;nodes.push(noticeNode);}
   for(const t of pending.values())if(t.owner===own&&(t.state!=='working'||t.recoveryShown)){
    t.recoveryShown=true;
    if(!t.line){t.line=document.createElement('div');t.line.className='d-flex flex-wrap gap-2 align-items-center mb-2';
     const label=document.createElement('span');label.className='small';label.textContent=t.title;
     t.button=document.createElement('button');t.button.type='button';t.button.className='btn btn-sm btn-outline-primary';t.button.onclick=()=>void recover(t);t.line.append(label,t.button);}
    t.button.textContent=t.state==='working'?'확인 중…':t.state==='absent'?'같은 요청 다시 처리':'저장 결과 확인';t.button.disabled=t.checking||t.state==='working'||!api.editable();nodes.push(t.line);
   }
   for(const node of [...box.children])if(!nodes.includes(node))node.remove();nodes.forEach((node,i)=>{if(box.children[i]!==node)box.insertBefore(node,box.children[i]||null);});box.hidden=!box.children.length;
  }
  function say(t,text){notice=text;noticeOwner=t.owner;sync();}
  function current(t){return t.owner===api.owner()&&api.current(t.scope)&&api.editable()&&api.ready(t.id)&&t.row.isConnected&&api.snapshot(t.row)===t.snapshot&&(edits.get(t.row)||0)===t.edit;}
  function release(t){if(pending.get(t.mapKey)!==t)return;pending.delete(t.mapKey);api.unlock(t.id);api.sync();}
  async function call(t,action){const controller=new AbortController();let timer;
   try{const query=api.client().rpc('accounting_asset_review_request',{p_action:action,p_approval_id:Number(t.id),p_input_vat:t.vat,p_evidence_type:t.evidence,p_expected:t.expected,p_request_key:t.request});
    const request=typeof query.abortSignal==='function'?query.abortSignal(controller.signal):query;
    const response=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('ASSET_REVIEW_TIMEOUT'));},15000);})]);
    if(response.error)throw response.error;return response.data;
   }finally{clearTimeout(timer);controller.abort();}
  }
  async function settled(t,r){
   if(r?.verified!==true||r.found!==true||r.saved!==true||String(r.approval_id)!==t.id||r.request_key!==t.request||r.input_vat!==t.vat||r.evidence_type!==t.evidence||r.acquisition_cost!==t.gross-t.vat)throw Error('UNVERIFIED');
   if(pending.get(t.mapKey)!==t)return;release(t);
   if(t.owner!==api.owner())return;
   completed.set(t.mapKey,t);api.accept(t.id,t.snapshot);say(t,'원가 확인값을 저장했습니다.');
   if(api.current(t.scope)){try{const loaded=await api.refresh();if(loaded===false)say(t,'원가 확인값은 저장했습니다. 목록은 다시 확인해 주세요.');}catch(_){say(t,'원가 확인값은 저장했습니다. 목록은 다시 확인해 주세요.');}}
  }
  async function send(t){t.state='working';sync();try{await settled(t,await call(t,'commit'));}catch(e){
   if(pending.get(t.mapKey)!==t)return;
   if(['42501','22023','PT409','P0001','23514','23503','57014','55P03'].includes(e?.code)){release(t);say(t,e.code==='PT409'?'등록된 자료가 달라졌습니다. 목록을 다시 확인해 주세요.':e.code==='42501'?'현재 권한을 다시 확인해 주세요.':'저장하지 못했습니다. 목록과 입력값을 다시 확인해 주세요.');}
   else{t.state='unknown';say(t,'저장 결과를 확인하지 못했습니다. 입력은 보관 중이며, 아래에서 결과를 확인할 수 있습니다.');}
  }finally{sync();}}
  function review(values){const owner=api.owner(),id=String(values.id),row=values.row;
   if(!api.editable()||!api.ready(id)||api.locked(id)||pending.has(key(owner,id)))return;
   let expected;try{expected=JSON.parse(row.dataset.accountingSource);if(!Array.isArray(expected)||expected.length!==7)throw Error('SOURCE');}catch(_){return api.alert('목록 다시 확인','자산과 재고를 다시 확인한 뒤 진행해 주세요.');}
   const t={...values,id,owner,row,expected,mapKey:key(owner,id),snapshot:api.snapshot(row),scope:api.scope(),edit:edits.get(row)||0,title:row.querySelector('.fw-bold')?.textContent||'재고 매입 원가 확인'};
   api.confirm('재고 매입 원가 확인',`부가세 포함 결재금액 ${t.gross.toLocaleString()}원\n공제할 매입세액 ${t.vat.toLocaleString()}원\n재고 취득원가 ${(t.gross-t.vat).toLocaleString()}원\n증빙: ${t.evidence}\n이 값으로 회계 연동을 준비할까요?`,async()=>{
    if(!current(t)||api.locked(id)||pending.has(t.mapKey))return;
    t.request=crypto.randomUUID();t.state='working';pending.set(t.mapKey,t);api.lock(id);api.sync();await send(t);
   });
  }
  async function recover(t){if(pending.get(t.mapKey)!==t||t.owner!==api.owner()||t.checking||!api.editable()||!api.current(api.scope()))return;
   t.checking=true;sync();try{
    if(t.state==='absent'){await send(t);return;}
    const result=await call(t,'result');if(pending.get(t.mapKey)!==t)return;
    if(result?.verified!==true)throw Error('UNVERIFIED');
    if(result.found===true)await settled(t,result);
    else if(result.found===false){t.state='absent';say(t,'아직 처리 기록이 없습니다. 같은 요청으로 다시 처리할 수 있습니다.');}
    else throw Error('UNVERIFIED');
   }catch(_){say(t,'결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');}finally{t.checking=false;sync();}
  }
  function reconcile(reviews){
   if(!Array.isArray(reviews))return;
   for(const [k,t]of completed)if(t.owner===api.owner()){
    const r=reviews.find(r=>String(r.approval_id)===t.id);completed.delete(k);
    if(!r||r.accounted||!r.movement_exists||!r.reviewed_at||r.amount!==t.gross||r.input_vat!==t.vat||r.evidence_type!==t.evidence||!t.row.isConnected||t.row.dataset.accountingSource!==JSON.stringify(t.expected))continue;
    t.row.dataset.accountingSource=JSON.stringify([t.id,r.amount,r.accounted,r.movement_exists,r.reviewed_at,r.input_vat,r.evidence_type]);t.row.dataset.accountingBaseline=t.snapshot;
   }
  }
  const list=document.getElementById('assetPurchaseReviewRows');for(const name of ['input','change'])list?.addEventListener(name,e=>{const row=e.target.closest('[data-accounting-key]');if(row)edits.set(row,(edits.get(row)||0)+1);});
  return Object.freeze({review,sync,reconcile,isBusy:()=>pending.size>0});
 }
 root.AccountingAssetReview=Object.freeze({version:'1.0.1',create});
})(window);
