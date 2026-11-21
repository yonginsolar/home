(function(root){
 'use strict';
 const hw='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028', yo='a4e65bb0-aa8e-4cef-a895-cd7865a67fef';
 const uuid=v=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(v||''));
 const isPublic=(coop,where=root.location)=>where.protocol==='https:'&&!where.port&&
   (coop===hw&&['hcrec.kr','www.hcrec.kr'].includes(where.hostname)||
    coop===yo&&['yonginsolar.kr','www.yonginsolar.kr'].includes(where.hostname));
 function sessionId(session){
   try{
     const encoded=String(session?.access_token||'').split('.')[1].replaceAll('-','+').replaceAll('_','/');
     const id=JSON.parse(root.atob(encoded)).session_id;
     return uuid(id)?id:'';
   }catch(_){return '';}
 }
 const inputName=value=>String(value||'').trim();
 function bind(client,getScope){
   const $=id=>document.getElementById(id);
   const box=$('signup-referral-search'),name=$('recommender'),search=$('signup-referral-check'),
     list=$('signup-referral-options'),status=$('signup-referral-status'),receipt=$('signup-referral-receipt');
   if(!box||!name||!search||!list||!status||!receipt)return null;
   const chips=$('signup-referral-chips'), add=$('signup-referral-add'), line=$('signup-referral-entry'), label=$('signup-referral-label');
   const memory=new Map();
   let scopeKey='',query=null,receiptWork=null,selection=null,revision=0,handler=null,retry=null, selected=[], adding=false;
   function current(){
     const x=getScope();
     return uuid(x?.actor)&&uuid(x?.session)&&isPublic(x.coop)?x:null;
   }
   const owner=x=>x?x.coop+'/'+x.actor:'';
   const key=x=>x?owner(x)+'/'+x.session:'';
   const modernSlot=x=>'signup-referral-receipt/1/'+owner(x);
   const legacySlot=x=>'hcrec-referral-receipt/1/'+x.actor;
   const slots=x=>x.coop===hw?[['name',modernSlot(x)],['legacy',legacySlot(x)]]:[['name',modernSlot(x)]];
   function read(x=current()){
     if(!x)return null;
     for(const [kind,slot] of slots(x)){
       let id=memory.get(slot);
       try{id=id||root.sessionStorage.getItem(slot);}catch(_){}
       if(uuid(id))return {kind,slot,id,owner:owner(x)};
     }
     return null;
   }
   function remember(slot,id){
     if(id)memory.set(slot,id);else memory.delete(slot);
     try{if(id)root.sessionStorage.setItem(slot,id);else root.sessionStorage.removeItem(slot);}catch(_){}
   }
   const say=text=>{status.textContent=text;};
   const joint=x=>!!chips&&x?.coop===yo;
   const identity=r=>r.name.normalize('NFKC').replace(/\s+/gu,'').toLocaleLowerCase('ko-KR')+'|'+r.phone_last4;
   function renderChips(){
     chips.replaceChildren();
     selected.forEach((r,i)=>{
       const b=document.createElement('button');
       b.type='button';b.className='btn btn-sm btn-outline-secondary text-break';
       b.textContent=r.name+' ×';b.setAttribute('aria-label',r.name+' 추천인 빼기');
       b.addEventListener('click',()=>{
         if(!joint(current())||read()||scopeKey!==key(current()))return;
         selected=selected.filter(x=>x!==r);renderChips();render();
         if(!selected.length){name.focus();return;}
         (chips.children[Math.min(i,selected.length-1)]||add)?.focus();
       });
       chips.append(b);
     });
   }
   function render(){
     const x=current(),pending=read(x),busy=!!query,isJoint=joint(x);
     box.hidden=!x;search.disabled=!x||busy||!!pending||!inputName(name.value);
     receipt.hidden=!x||!pending;receipt.disabled=!!receiptWork;
     list.hidden=!list.childElementCount;
     search.setAttribute('aria-busy',String(busy));
     if(chips){
       label.textContent=isJoint?'추천인 (선택)':'추천인 (선택사항)';
       line.hidden=isJoint&&selected.length>0&&!adding;
       chips.hidden=!isJoint||!selected.length;
       add.hidden=!isJoint||!selected.length||selected.length>=5||adding;
       add.disabled=!!pending;
       for(const button of chips.children)button.disabled=!!pending;
     }
   }
   function reset(){
     ++revision;
     query?.abort();query=null;selection=null;list.replaceChildren();say('');
   }
   function sync(){
     const next=key(current());
     if(next!==scopeKey){
       if(chips&&(selected.length||adding))name.value='';
       reset();scopeKey=next;receiptWork=null;retry=null;selected=[];adding=false;
       if(chips)renderChips();
     }
     render();
   }
   function cleanChoices(rows){
     if(!Array.isArray(rows)||!rows.length||rows.length>5)return null;
     if(!rows.every(r=>typeof r?.name==='string'&&Array.from(r.name).length<=80&&
          /^[0-9]{4}$/.test(r.phone_last4)&&uuid(r.selection)))return null;
     if(new Set(rows.map(r=>r.phone_last4)).size!==rows.length||new Set(rows.map(r=>r.selection)).size!==rows.length)return null;
     return rows;
   }
   function choices(rows,expires,term,at){
     for(const r of rows){
       const b=document.createElement('button');
       b.type='button';b.className='btn btn-outline-secondary text-start text-break';
       b.textContent=r.name+' · '+r.phone_last4;b.setAttribute('aria-pressed','false');
       b.addEventListener('click',()=>{
         if(scopeKey!==key(current())||revision!==at||term!==inputName(name.value))return;
         if(expires<=Date.now()){reset();say('검색 결과가 만료됐어요. 다시 검색해 주세요.');render();return;}
         if(joint(current())){
           if(read()||selected.length>=5)return;
           if(selected.some(x=>x.key===identity(r))){say('이미 선택한 추천인이에요.');return;}
           const shouldFocus=document.activeElement===b||list.contains(document.activeElement);
           selected.push({key:identity(r),id:r.selection,name:r.name,expires});
           name.value='';adding=false;reset();renderChips();render();
           if(shouldFocus)(add.hidden?chips.lastElementChild:add)?.focus();
           return;
         }
         const unselect=selection?.id===r.selection;
         selection=unselect?null:{id:r.selection,term,expires};
         for(const option of list.children)option.setAttribute('aria-pressed',String(!unselect&&option===b));
         say(unselect?'선택을 취소했어요.':'추천인을 선택했어요.');
       });
       list.append(b);
     }
   }
   async function lookup(){
     sync();
     const x=current(),term=inputName(name.value);
     if(!x||query||read(x)||!term||Array.from(term).length>80||/[\u0000-\u001f\u007f]/.test(term))return false;
     reset();
     const controller=new AbortController(), at=revision;
     query=controller;render();say('추천인을 검색하고 있어요.');
     const owns=()=>query===controller&&revision===at&&key(current())===key(x)&&term===inputName(name.value);
     let timer;
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
       controller.abort();reject(Error('search_timeout'));
     },9500);});
     try{
       const {data,error}=await Promise.race([client.auth.getSession(),deadline]), session=data?.session;
       if(!owns())return false;
       if(error||session?.user?.id!==x.actor||sessionId(session)!==x.session)throw Error('session_changed');
       const res=await Promise.race([root.fetch('/api/signup/referral-search',{method:'POST',cache:'no-store',credentials:'same-origin',
         signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({name:term})}),deadline]);
       if(!res.ok)throw Error('search_unavailable');
       const result=await Promise.race([res.json(),deadline]);
       if(!owns())return false;
       const until=Date.parse(result?.valid_until),rows=cleanChoices(result?.choices);
       if(result?.status==='found'&&rows&&until>Date.now()){
         choices(rows,until,term,at);say('목록에서 추천인을 선택해 주세요.');return true;
       }
       say(result?.status==='rate_limited'?'오늘 더 검색할 수 없어요. 이름만 적어 신청할 수 있어요.'
        :'추천인을 확인하지 못했어요. 이름만 적어 신청할 수 있어요.');
     }catch(_){if(owns())say('검색하지 못했어요. 다시 검색하거나 이름만 적어 신청할 수 있어요.');}
     finally{clearTimeout(timer);if(owns()){query=null;render();}}
     return false;
   }
   async function receiptQuery(rpc,id){
     const controller=new AbortController();let timer;
     try{
       const call=client.rpc(rpc,{p_request_id:id});
       const pending=typeof call?.abortSignal==='function'?call.abortSignal(controller.signal):call;
       return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{
         controller.abort();reject(Error('receipt_timeout'));
       },8500);})]);
     }finally{clearTimeout(timer);}
   }
   async function recover(){
     sync();
     const x=current(),pending=read(x);
     if(!x||!pending||receiptWork)return null;
     const work={};receiptWork=work;query?.abort();query=null;render();say('신청이 접수됐는지 확인하고 있어요.');
     const owns=()=>receiptWork===work&&key(current())===key(x)&&read()?.id===pending.id;
     try{
       const rpc=pending.kind==='legacy'?'hcrec_referral_signup_receipt':'signup_referral_receipt';
       const {data,error}=await receiptQuery(rpc,pending.id);
       if(!owns())return null;
       if(error)throw error;
       if(data?.status==='received'){
         remember(pending.slot,null);retry=null;
         if(joint(x)){selected=[];adding=false;renderChips();}
         handler?.(data,x.coop);return data;
       }
       if(data?.status==='not_found'){
         remember(pending.slot,null);retry=pending;say('접수 기록이 없어요. 신청 내용을 확인한 뒤 다시 신청해 주세요.');return data;
       }
       say('아직 결과를 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.');
     }catch(_){if(owns())say('접수 여부를 확인하지 못했어요. 다시 확인해 주세요.');}
     finally{if(receiptWork===work){receiptWork=null;render();}}
     return null;
   }
   function prepare(value){
     sync();
     const x=current(),term=inputName(value);
     if(!x)return null;
     if(read(x))return {blocked:'이전 신청의 접수 여부를 먼저 확인해 주세요.'};
     if(joint(x)&&selected.length){
       if(selected.some(x=>x.expires<=Date.now()))return {blocked:'검색 시간이 지난 추천인을 빼고 다시 찾아 주세요.'};
       const id=(retry?.kind==='name'&&retry.owner===owner(x)?retry.id:null)||root.crypto?.randomUUID?.();
       if(!uuid(id))return {blocked:'신청을 준비하지 못했어요. 화면을 다시 열어 주세요.'};
       return {route:true,kind:'joint',id,owner:owner(x),slot:modernSlot(x),
          proofs:selected.map(x=>x.id),names:selected.map(x=>x.name).join(', ')};
     }
     if(!term)return null;
     if(Array.from(term).length>80||/[\u0000-\u001f\u007f]/.test(term))return {blocked:'추천인 이름을 80자 이내로 확인해 주세요.'};
     const single=selection?.term===term&&selection?.expires>Date.now()?selection:null;
     if(!single&&x.coop!==hw)return null;
     const kind=single?'name':'legacy';
     const id=(retry?.kind===kind&&retry.owner===owner(x)?retry.id:null)||root.crypto?.randomUUID?.();
     if(!uuid(id))return {blocked:'신청을 준비하지 못했어요. 화면을 다시 열어 주세요.'};
     return {route:true,kind,id,owner:owner(x),slot:kind==='legacy'?legacySlot(x):modernSlot(x),proof:single?.id||null};
   }
   name.addEventListener('input',()=>{reset();render();});
   name.addEventListener('keydown',event=>{
     if(joint(current())&&event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){
       event.preventDefault();
       if(!event.repeat&&!search.disabled)void lookup();
     }
   });
   add?.addEventListener('click',()=>{if(!joint(current())||selected.length>=5||read())return;
     adding=true;name.value='';reset();render();name.focus();
   });
   search.addEventListener('click',()=>void lookup());receipt.addEventListener('click',()=>void recover());
   sync();
   return Object.freeze({sync,lookup,prepare,recover,hasPending(){return !!read();},
     selectionKey(){return joint(current())?selected.map(p=>p.id).join(','):(selection?.id||'');},
     onReceipt(fn){handler=fn;},
     started(req){remember(req.slot,req.id);reset();render();},
     finished(req,{unknown=false}={}){
       let id=memory.get(req.slot);
       try{id=id||root.sessionStorage.getItem(req.slot);}catch(_){}
       if(!unknown&&id===req.id){remember(req.slot,null);if(req.owner===owner(current()))retry=null;}
       render();
     }});
 }
 root.CoopSignupReferral=Object.freeze({hw,isPublic,sessionId,bind});
})(window);
