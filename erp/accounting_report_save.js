/* v1.0.0 — bounded report-save UI, same-request receipts and honest outcome recovery. */
(function(root){'use strict';
 function create(api){
  const records=new Map(),operations=new Set();let view=null,viewEpoch=0,interactionEpoch=0;
  for(const name of ['pointerdown','keydown','focusin'])document.addEventListener(name,event=>{
   if(name==='focusin'&&!event.target?.matches?.('input,textarea,select,button,a,[contenteditable="true"]'))return;
   interactionEpoch++;
  },true);
  const mapKey=(owner,year)=>owner+'|'+year;
  const unresolved=t=>['saving','unknown','retry','checking'].includes(t.state);
  const current=v=>view===v&&v.epoch===viewEpoch&&v.t.owner===api.owner()&&api.current(v.context);
  function stateMessage(t){
   if(t.checking)return '저장 결과를 확인하고 있습니다…';
   if(t.checkFailed)return t.confirmed?'저장 기록은 확인됐습니다. 현재 연동 상태는 다시 확인해 주세요.':'저장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.';
   if(t.state==='saving')return '총회 자료집용 보고서를 저장하고 있습니다…';
   if(t.state==='saved')return '총회 자료집 연동 완료 · 이 보고서를 저장했습니다.';
   if(t.state==='replaced')return '이 보고서는 저장됐으며, 이후 저장된 다른 보고서가 총회 자료집에 연결되어 있습니다.';
   if(t.state==='rejected')return '자료집용 보고서를 저장하지 못했습니다. 권한과 입력 조건을 확인해 주세요.';
   if(t.state==='view-only')return '총회 자료집에 저장하려면 회계 수정 권한이 필요합니다.';
   if(t.state==='retry')return '저장 결과를 아직 확인하지 못했습니다. 같은 보고서로 저장을 이어갈 수 있습니다.';
   return '저장 결과 미확인 · 보고서는 준비됐습니다. 저장 결과를 다시 확인해 주세요.';
  }
  function sync(v){
   if(!v||!current(v)||!v.line?.isConnected)return;
   const t=v.t;
   v.line.className='alert no-print '+(['saved'].includes(t.state)?'alert-success':t.state==='rejected'?'alert-danger':'alert-warning');
   v.message.textContent=stateMessage(t);
   v.check.hidden=t.state==='view-only';v.check.disabled=t.checking||t.state==='saving'||!api.editable();
   v.check.textContent=t.checking?'확인 중…':'저장 결과 확인';
   v.retry.hidden=!['retry','rejected'].includes(t.state);v.retry.disabled=t.checking||!api.editable();
   v.retry.textContent=t.state==='rejected'?'같은 보고서 다시 저장':'같은 보고서 저장';
  }
  function claim(v){const n=document.activeElement;return n===v.check||n===v.retry?{node:n,epoch:interactionEpoch}:null;}
  function restore(v,c){
   if(!c||!current(v)||c.epoch!==interactionEpoch)return;
   const active=document.activeElement,modal=v.line?.closest('.modal');
   if(active&&active!==document.body&&active!==document.documentElement&&active!==modal&&active!==c.node)return;
   const target=c.node.hidden?v.check:c.node;if(!target.isConnected||target.hidden||target.disabled)return;
   const r=target.getBoundingClientRect();if(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return;
   target.focus({preventScroll:true});
  }
  function show(t,context){
   if(t.owner!==api.owner()||!api.current(context))return;
   leave();const v={t,context,epoch:++viewEpoch,line:null};view=v;
   api.display(t.prepared);
   const box=api.status();box.replaceChildren();
   v.line=document.createElement('div');v.line.setAttribute('role','status');v.line.setAttribute('aria-live','polite');
   v.message=document.createElement('p');v.message.className='mb-2';
   v.check=document.createElement('button');v.check.type='button';v.check.className='btn btn-sm btn-outline-primary me-2';v.check.onclick=()=>void check(v);
   v.retry=document.createElement('button');v.retry.type='button';v.retry.className='btn btn-sm btn-outline-primary';v.retry.onclick=()=>void retry(v);
   v.line.append(v.message,v.check,v.retry);box.append(v.line);sync(v);
  }
  function leave(){
   viewEpoch++;for(const op of operations){if(!op.t.confirmed){op.t.uncertain=true;op.t.state='unknown';}op.release({cancelled:true});op.controller?.abort();}
   view=null;
  }
  function params(t,action){return{p_action:action,p_coop_id:t.coop,p_actor_uid:t.actor,p_request_key:t.request,p_fiscal_year:t.year,p_period_start:t.start,p_period_end:t.end,p_report_payload:action==='commit'?t.prepared.reportPayload:null};}
  function verified(t,data){
   return data?.verified===true&&data.coop_id===t.coop&&data.actor_uid===t.actor&&data.request_key===t.request&&data.fiscal_year===t.year&&data.period_start===t.start&&data.period_end===t.end;
  }
  function apply(t,response,attempt){
   const d=response?.data;
   if(!response?.error&&verified(t,d)&&d.found===true&&d.saved===true&&typeof d.snapshot?.id==='string'){
    if(t.confirmed&&attempt<t.attempt)return;
    t.state=d.current===false?'replaced':'saved';t.snapshot=d.snapshot;t.prepared.snapshot=d.snapshot;t.confirmed=true;
    t.checkFailed=false;
   }else if(!t.confirmed&&attempt===t.attempt){
    const status=Number(response?.status||0),code=String(response?.error?.code||'');
    t.state=!t.uncertain&&status>=400&&status<500&&['42501','22023','22001','PT409','23514','23503','P0001'].includes(code)?'rejected':'unknown';
    if(t.state==='unknown')t.uncertain=true;
   }
   if(view?.t===t)sync(view);
  }
  function commit(t){
   const attempt=++t.attempt;t.state='saving';
   const promise=Promise.resolve().then(()=>api.client().rpc('accounting_report_save_request',params(t,'commit')));
   promise.then(r=>apply(t,r,attempt),()=>apply(t,{error:{message:'TRANSPORT_UNCONFIRMED'}},attempt));
   return promise;
  }
  async function wait(promise,t,context,v,controller){
   let timer,release;const stop=new Promise(resolve=>{release=resolve;timer=setTimeout(()=>{t.uncertain=true;if(!t.confirmed)t.state='unknown';controller?.abort();resolve({timeout:true});},15000);});
   const operation={release,controller,t};operations.add(operation);if(v)v.operation=operation;
   try{return await Promise.race([promise.then(r=>({response:r}),()=>({failed:true})),stop]);}
   finally{clearTimeout(timer);operations.delete(operation);if(v?.operation===operation)v.operation=null;}
  }
  async function start(prepared,context){
   const owner=api.owner(),summary=prepared.reportPayload.summary,k=mapKey(owner,summary.fiscal_year);
   const prior=records.get(k);if(prior&&unresolved(prior)){show(prior,context);return;}
   const t={owner,actor:api.actor(),coop:context.coop,year:summary.fiscal_year,start:summary.period_start,end:summary.period_end,request:crypto.randomUUID(),prepared:JSON.parse(JSON.stringify(prepared)),state:'saving',attempt:0,uncertain:false,confirmed:false,checking:false};
   records.set(k,t);
   if(!api.editable()){t.state='view-only';show(t,context);return;}
   const promise=commit(t);await wait(promise,t,context);
   // A lost response never triggers another save. Hidden/old views keep only their own receipt state.
   if(api.current(context)&&owner===api.owner())show(t,context);
  }
  async function check(v){
   if(!current(v)||v.t.checking||!api.editable())return;const focus=claim(v),t=v.t,controller=new AbortController();t.checking=true;t.checkFailed=false;sync(v);
   try{
    let q=api.client().rpc('accounting_report_save_request',params(t,'result'));if(typeof q.abortSignal==='function')q=q.abortSignal(controller.signal);
    const result=await wait(Promise.resolve(q),t,v.context,v,controller);
    if(!current(v)||result.cancelled)return;
    const r=result.response;if(r&&!r.error&&verified(t,r.data)){
     if(r.data.found===true&&r.data.saved===true)apply(t,r,++t.attempt);
     else if(r.data.found===false&&!t.confirmed){t.state='retry';t.uncertain=true;}
     else if(!t.confirmed){t.state='unknown';t.uncertain=true;}
    }else{t.checkFailed=true;if(!t.confirmed){t.state='unknown';t.uncertain=true;}}
   }catch(_){t.checkFailed=true;if(!t.confirmed){t.state='unknown';t.uncertain=true;}}
   finally{controller.abort();t.checking=false;sync(v);restore(v,focus);}
  }
  async function retry(v){
   if(!current(v)||v.t.checking||!api.editable()||!['retry','rejected'].includes(v.t.state))return;
   const focus=claim(v),t=v.t;t.checking=true;sync(v);try{const promise=commit(t);sync(v);await wait(promise,t,v.context,v);}
   finally{t.checking=false;sync(v);restore(v,focus);}
  }
  function openPending(year,context){const t=records.get(mapKey(api.owner(),year));if(!t||!unresolved(t))return false;show(t,context);return true;}
  return Object.freeze({start,openPending,leave,hasUnresolved:()=>[...records.values()].some(t=>t.owner===api.owner()&&unresolved(t))});
 }
 root.AccountingReportSave=Object.freeze({version:'1.0.0',create});
})(window);
