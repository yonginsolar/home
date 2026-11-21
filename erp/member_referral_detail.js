(function(root){
 'use strict';
 const doc=root.document;
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
 const denied=e=>e?.code==='42501'||Number(e?.status)===401||Number(e?.status)===403;
 const score=v=>{
   if(typeof v!=='string'||!/^[0-9]{1,20}$/.test(v))return '';
   const rounded=(BigInt(v)*100n+30n)/60n;
   return (rounded/100n).toLocaleString('ko-KR')+'.'+String(rounded%100n).padStart(2,'0');
 };
 function mount({client,section,scope,onChanged}){
   const get=id=>section.querySelector('[data-rd="'+id+'"]'),status=get('status'),form=get('form'),
     keyword=get('keyword'),pressed=get('edit'),readAgain=get('reload'),confirm=get('save'),
     cancel=get('cancel'),recover=get('recover'),results=get('results'),chosen=get('chosen'),next=get('more'),
     history=get('history'),historyList=get('history-list');
   const waiting=new Map();
   let active=null;
   const valid=x=>x&&x.owner===scope()?.owner&&x.id===scope()?.member;
   const live=x=>x===active&&valid(x);
   const say=t=>status.textContent=t;
   const slot=x=>'member-referral-detail/1/'+x.owner+'/'+x.id;
   function getWaiting(x){
     if(waiting.has(slot(x)))return waiting.get(slot(x));
     try{const request=root.sessionStorage.getItem(slot(x));if(uuid(request))return {request};}catch(_){}
     return null;
   }
   function setWaiting(x,wait){
     const key=slot(x);
     if(wait)waiting.set(key,wait);else waiting.delete(key);
     try{if(wait)root.sessionStorage.setItem(key,wait.request);else root.sessionStorage.removeItem(key);}catch(_){}
   }
   const pair=p=>[p?.name||'이름 미확인',p?.number].filter(Boolean).join(' · ');
   function node(tag,label,classes){const el=doc.createElement(tag);if(label!=null)el.textContent=label;if(classes)el.className=classes;return el;}
   function button(label,action){
     const b=node('button',label,'btn btn-sm btn-outline-secondary text-break text-start');b.type='button';b.onclick=action;return b;
   }
   function rpc(mode,x,args={},controller=new AbortController(),ms=10000){
     let timer;
     const work=Promise.resolve().then(async()=>{
       const q=client.rpc('member_referral_detail',{p_mode:mode,p_applicant:x.id,...args});
       const {data,error,status}=await(typeof q?.abortSignal==='function'?q.abortSignal(controller.signal):q);
       if(error)throw {...error,status};
       if(!data||typeof data!=='object')throw Error('invalid_reply');
       return data;
     });
     const limit=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('deadline'));controller.abort();},ms);});
     return Promise.race([work,limit]).finally(()=>clearTimeout(timer));
   }
   function controls(x){
     if(!live(x))return;
     const wait=getWaiting(x), editing=!!x.edit;
     form.hidden=!editing;
     pressed.hidden=editing||!x.data||!!wait;
     recover.hidden=!wait;recover.disabled=!!wait?.running||!!x.check;
     confirm.disabled=!editing||!x.edit.length&&!x.data?.multiple||!!wait||!!x.stale||
       x.edit.map(p=>p.id).sort().join()===x.data?.incoming.map(p=>p.id).sort().join();
     keyword.disabled=!!wait;cancel.disabled=!!wait?.running;
     get('find').disabled=!!wait||!!x.search||!keyword.value.trim();
     history.hidden=!x.data;
     for(const child of [...results.children,...chosen.children])child.disabled=!!wait;
   }
   const fill=(target,value,append=false)=>{
     if(!append)target.replaceChildren();
     if(!value.length&&!append)target.append(node('li','연결된 조합원이 없어요.','text-body-secondary'));
     for(const p of value)target.append(node('li',pair(p)+(p.approved===false?' · 승인 전':'')));
   };
   function clear(){
     for(const c of [active?.read,active?.search,active?.history,active?.check])c?.abort();
     active=null;form.hidden=true;section.hidden=true;pressed.hidden=true;
     recover.hidden=true;readAgain.hidden=true;next.hidden=true;history.hidden=true;historyList.hidden=true;
     history.setAttribute('aria-expanded','false');
     say('');keyword.value='';
     for(const e of [get('incoming'),get('outgoing'),get('summary'),get('raw'),chosen,results,historyList])e.replaceChildren();
   }
   function enter(){
     const current=scope();
     if(!current?.owner||!uuid(current.member)){clear();return;}
     if(active&&live(active))return;
     clear();
     const x=active={owner:current.owner,id:current.member,page:0,ids:new Set()};
     section.hidden=false;controls(x);void load(x);
   }
   async function load(x,append=false){
     if(!live(x)||x.read)return;
     const work=x.read=new AbortController();const page=append?x.page+1:0;
     say('추천인 정보를 불러오고 있어요.');readAgain.hidden=true;next.disabled=true;
     try{
       const v=await rpc('read',x,{p_page:page},work);
       if(!live(x)||x.read!==work)return;
       if(!Number.isInteger(v.revision)||!Array.isArray(v.incoming)||!Array.isArray(v.outgoing)||
         !Number.isInteger(v.approved_count)||!Number.isInteger(v.outgoing_total))throw Error('invalid_read');
       if(!append){
         x.data=v;x.stale=false;x.ids.clear();
         fill(get('incoming'),v.incoming);
         get('raw').textContent=v.raw_name&&!v.incoming.length?'기존 입력: '+v.raw_name:'';
         const points=score(v.score_units);
         get('summary').textContent='가입 승인 '+v.approved_count.toLocaleString('ko-KR')+'명'+(points?' · 추천 점수 '+points+'점':'');
       }
       const fresh=v.outgoing.filter(p=>uuid(p.id)&&!x.ids.has(p.id)&&x.ids.add(p.id));
       fill(get('outgoing'),fresh,append);
       x.page=page;next.hidden=x.ids.size>=v.outgoing_total||!v.outgoing.length;
       say('');
     }catch(e){if(live(x)&&x.read===work){
       if(denied(e)){clear();return;}
       say('추천인 정보를 불러오지 못했어요.');readAgain.hidden=false;
     }}finally{if(x.read===work){x.read=null;if(live(x)){next.disabled=false;controls(x);}}}
   }
   function renderChosen(x){
     chosen.replaceChildren();
     x.edit.forEach((p,i)=>{
       const b=button(p.name+' ×',()=>{
         if(!live(x)||getWaiting(x))return;
         x.edit=x.edit.filter(t=>t.id!==p.id);renderChosen(x);
         (chosen.children[Math.min(i,x.edit.length-1)]||keyword).focus();
       });
       b.setAttribute('aria-label',pair(p)+' 빼기');chosen.append(b);
     });
     controls(x);
   }
   function endEdit(x,restore=false){
     x.search?.abort();x.search=null;x.edit=null;results.replaceChildren();chosen.replaceChildren();keyword.value='';
     controls(x);if(restore&&!pressed.hidden)pressed.focus({preventScroll:true});
   }
   pressed.onclick=()=>{
     const x=active;if(!live(x)||!x.data||getWaiting(x))return;
     x.edit=x.data.incoming.slice();
     keyword.value=x.edit.length?'':x.data.raw_name||'';renderChosen(x);keyword.focus();
   };
   cancel.onclick=()=>{const x=active;if(live(x)&&!getWaiting(x)?.running){endEdit(x,true);say('');}};
   keyword.oninput=()=>{
     const x=active;if(!live(x))return;x.search?.abort();x.search=null;results.replaceChildren();controls(x);
   };
   form.onsubmit=e=>{
     e.preventDefault();const x=active,term=keyword.value.trim();
     if(!live(x)||!x.edit||!term||x.search||getWaiting(x))return;
     const work=x.search=new AbortController();results.replaceChildren();say('검색하고 있어요.');controls(x);
     void rpc('search',x,{p_keyword:term},work).then(v=>{
       if(!live(x)||x.search!==work||keyword.value.trim()!==term)return;
       if(!Array.isArray(v.rows))throw Error('invalid_search');
       for(const p of v.rows){if(!uuid(p.id))continue;
         const b=button(pair(p),()=>{
           if(!live(x)||!x.edit||getWaiting(x)||keyword.value.trim()!==term)return;
           if(x.edit.some(q=>q.id===p.id)){say('이미 선택한 조합원이에요.');return;}
           if(x.data.multiple&&x.edit.length===5){say('추천인은 다섯 명까지 선택할 수 있어요.');return;}
           x.edit=x.data.multiple?[...x.edit,p]:[p];keyword.value='';results.replaceChildren();renderChosen(x);keyword.focus();say('');
         });results.append(b);
       }
       say(v.more?'결과가 많아요. 이름이나 조합원번호로 좁혀 주세요.':results.childElementCount?'':'검색 결과가 없어요.');
     }).catch(err=>{if(live(x)&&x.search===work){if(denied(err))clear();else say('검색하지 못했어요. 다시 검색해 주세요.');}})
     .finally(()=>{if(x.search===work){x.search=null;controls(x);}});
   };
   confirm.onclick=async()=>{
     const x=active;if(!live(x)||confirm.disabled||!x.edit||getWaiting(x))return;
     const request=root.crypto?.randomUUID?.();if(!uuid(request))return;
     const p={request,running:true};setWaiting(x,p);controls(x);say('추천인을 저장하고 있어요.');
     try{
       const data=await rpc('save',x,{p_revision:x.data.revision,p_referrers:x.edit.map(p=>p.id),p_request:request});
       if(!['saved','unchanged'].includes(data.status))throw Error('unknown_save');
       setWaiting(x,null);
       if(data.status==='saved')onChanged?.(x.owner);
       if(live(x)){endEdit(x,true);void load(x);}
     }catch(e){
       const known=denied(e)||['PT409','22023'].includes(e?.code);
       setWaiting(x,known?null:{request});
       if(!live(x))return;
       if(denied(e)){clear();return;}
       if(e?.code==='PT409'){x.stale=true;readAgain.hidden=false;say('다른 곳에서 연결이 바뀌었어요. 다시 확인해 주세요.');}
       else if(e?.code==='22023')say('선택한 조합원의 상태를 확인하고 다시 검색해 주세요.');
       else say('저장 결과를 확인해 주세요.');
     }finally{
       if(live(x))controls(x);
       else if(active&&live(active)&&slot(active)===slot(x)){active.stale=true;readAgain.hidden=false;controls(active);}
     }
   };
   recover.onclick=async()=>{
     const x=active;if(!live(x)||x.check)return;
     const p=getWaiting(x);if(!p||p.running)return;
     const work=x.check=new AbortController();controls(x);
     try{
       const v=await rpc('receipt',x,{p_request:p.request},work);
       if(!live(x)||x.check!==work)return;
       if(v.status==='saved'){setWaiting(x,null);onChanged?.(x.owner);endEdit(x,true);void load(x);}
       else if(v.status==='not_found'){setWaiting(x,null);say('저장되지 않았어요. 선택을 확인해 주세요.');}
       else say('처리 중이에요. 잠시 뒤 다시 확인해 주세요.');
     }catch(e){if(live(x)){if(denied(e))clear();else say('결과를 확인하지 못했어요. 다시 확인해 주세요.');}}
     finally{if(x.check===work){x.check=null;controls(x);}}
   };
   readAgain.onclick=()=>{const x=active;if(live(x)){if(x.stale)endEdit(x,false);void load(x);}};
   next.onclick=()=>{if(live(active))void load(active,true);};
   history.onclick=async()=>{
     const x=active;if(!live(x)||x.history)return;
     if(!historyList.hidden){historyList.hidden=true;history.setAttribute('aria-expanded','false');return;}
     historyList.hidden=false;history.setAttribute('aria-expanded','true');
     historyList.replaceChildren(node('li','이력을 불러오고 있어요.'));
     const work=x.history=new AbortController();
     try{
       const r=await rpc('history',x,{},work);
       if(!live(x)||x.history!==work)return;
       const labels=v=>v?.map(p=>typeof p==='string'?p:p?.name?pair(p):null).filter(Boolean).join(', ')||'미연결';
       historyList.replaceChildren(...r.rows.map(h=>node('li',labels(h.before)+' → '+labels(h.after))));
       if(!r.rows.length)historyList.append(node('li','변경 이력이 없어요.'));
     }catch(e){if(live(x)&&x.history===work){
       if(denied(e)){clear();return;}historyList.hidden=true;history.setAttribute('aria-expanded','false');say('이력을 불러오지 못했어요.');
     }}finally{if(x.history===work)x.history=null;}
   };
   return Object.freeze({enter,clear});
 }
 root.MemberReferralDetail=Object.freeze({version:'1.0.0',mount,score});
})(window);
