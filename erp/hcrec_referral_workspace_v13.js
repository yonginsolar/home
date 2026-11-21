/* Shared by cooperatives with the existing authenticated member menu. */
(function(root){
 'use strict';
 const d=root.document,$=s=>d.getElementById('hcrec-referral-workspace-'+s);
 const uid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
 const el=(tag,value,cls)=>{const n=d.createElement(tag);if(value!=null)n.textContent=value;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls='btn btn-outline-secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const source={name_search:'가입자가 선택',code:'추천 코드로 연결',office:'관리자가 연결',legacy_match:'기존 명부 이름 일치'};
 const date=v=>{const n=new Date(v);return !v||!Number.isFinite(+n)?'':new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(n);};
 const person=(name,no)=>[name||'이름 미확인',no].filter(Boolean).join(' · ');
 const names=row=>Array.isArray(row.referrers)&&row.referrers.length?row.referrers.map(p=>person(p.name,p.number)).join(', '):
    row.referrer_name?person(row.referrer_name,row.referrer_number):'연결된 회원 확인 필요';
 const points=v=>{if(typeof v!=='string'||!/^[0-9]{1,20}$/.test(v))return '';
   const n=(BigInt(v)*100n+30n)/60n;return (n/100n).toLocaleString('ko-KR')+'.'+String(n%100n).padStart(2,'0');};
 const denial=e=>e?.code==='42501'||e?.status===401||e?.status===403;
 const jointOwner=key=>{
  // The existing workspace scope is [acting account, current cooperative].
  try{return JSON.parse(key)?.[1]==='a4e65bb0-aa8e-4cef-a895-cd7865a67fef';}catch(_){return false;}
 };
 const selectionKey=people=>people.map(p=>p.id).sort().join(',');
 function mount({client,owner,legacyOwner=()=>'',openMember}){
  const group=$('tabs'),pane=$('body'),status=$('status'),detail=$('detail'),list=$('list'),refresh=$('refresh'),more=$('more');
  const closed=$('closed'),closedLabel=$('closed-label');
  const tabs=[...group.querySelectorAll('[data-referral-mode]')],drafts=new Map(),pending=new Map();
  let active='', mode='pending_review', listing=null, current=null, page=0, read=null, generation=0;
  const isActive=()=>!!active&&active===owner();
  const live=x=>isActive()&&current===x;
  const abort=r=>r?.abort.abort();
  const message=t=>{status.textContent=t;};
  const slot=id=>'member-referral-review/2/'+active+'/'+id;
  function getPending(id){
   const key=slot(id),saved=pending.get(key);
   if(saved)return saved;
   try{
    const req=root.sessionStorage.getItem(key);if(uid(req))return {key,req};
    const legacy=legacyOwner();
    if(legacy){
     const oldKey='hcrec-referral-review/1/'+legacy+'/'+id,old=root.sessionStorage.getItem(oldKey);
     if(uid(old)){root.sessionStorage.setItem(key,old);root.sessionStorage.removeItem(oldKey);return {key,req:old};}
    }
   }catch(_){}
   return null;
  }
  function setPending(key,value){
    if(value)pending.set(key,value);else pending.delete(key);
    try{if(value)root.sessionStorage.setItem(key,value.req);else root.sessionStorage.removeItem(key);}catch(_){}
  }
  function rpc(name,args,request,timeout=11000){
    let timer;
    const stop=new Promise((_,reject)=>{
      request.abort.signal.addEventListener('abort',()=>reject(Error('referral_aborted')),{once:true});
      timer=setTimeout(()=>request.abort.abort(),timeout);
    });
    async function begin(){
      const promise=client.rpc(name,args);
      const {data,error,status}=await (typeof promise?.abortSignal==='function'?promise.abortSignal(request.abort.signal):promise);
      if(error)throw {...error,status};
      if(!data)throw Error('empty_referral_result');
      return data;
    }
    return Promise.race([begin(),stop]).finally(()=>clearTimeout(timer));
  }
  const get=(m,args,r)=>rpc('member_referral_workspace_read',{p_mode:m,...args},r);
  const task=()=>({abort:new AbortController()});
  function paintNav(){
    const base=mode==='closed'?'pending_review':mode;
    for(const t of tabs){
      const on=t.dataset.referralMode===base;
      t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;
      if(on)pane.setAttribute('aria-labelledby',t.id);
    }
    closedLabel.hidden=base!=='pending_review';closed.checked=mode==='closed';
  }
  function close(restore=false){
    const x=current;if(!x)return;
    current=null;abort(x.search);abort(x.read);detail.replaceChildren();detail.hidden=true;
    detail.removeAttribute('aria-labelledby');list.before(detail);
    x.trigger.setAttribute('aria-expanded','false');
    if(restore&&isActive()&&x.trigger.isConnected)x.trigger.focus({preventScroll:true});
  }
  function clearDenied(){
    close();drafts.clear();list.replaceChildren();listing=null;more.hidden=true;
    message('추천인 관리 권한을 확인해 주세요.');refresh.hidden=false;
  }
  function stop(clear=false){
    ++generation;abort(read);read=null;close();
    if(clear){active='';mode='pending_review';drafts.clear();listing=null;page=0;list.replaceChildren();message('');refresh.hidden=true;more.hidden=true;paintNav();}
  }
  function leave(sameOwner){
    const changed=!!active&&active!==sameOwner;
    stop(changed);active='';listing=null;list.replaceChildren();more.hidden=true;refresh.hidden=true;message('');
  }
  let draftOwner='';
  function enter(){
    const key=owner();if(!key)return;
    if(active===key&&read)return;
    if(draftOwner!==key){draftOwner=key;stop(true);}
    if(active!==key){active=key;paintNav();return load();}
    if(!current)return load();
  }
  function switchMode(next){
    if(!isActive()||next===mode)return;
    stop();mode=next;listing=null;page=0;list.replaceChildren();more.hidden=true;paintNav();void load();
  }
  function item(row){
    const a=el('article',null,'card p-3'), head=el('div',null,'d-flex align-items-start justify-content-between flex-wrap gap-2');
    if(mode==='rank'){
      const name=person(row.name,row.number);
      const b=expandButton(button(name,e=>openRank(row,e.currentTarget),'btn btn-link text-start text-break p-0 fw-bold'));
      head.append(b,el('span',Number(row.total).toLocaleString('ko-KR')+'명','badge text-bg-primary'));
      const score=points(row.score_units);if(score)head.append(el('span',score+'점','badge text-bg-secondary'));
      a.append(head);return a;
    }
    const label=row.approved?'가입 승인':({탈퇴:'탈퇴',제명:'제명',승인대기:'가입 승인 대기'})[row.applicant_status]||'가입 상태 확인 필요';
    head.append(el('h4',person(row.applicant_name,row.applicant_number),'h6 fw-bold mb-0'),
      el('span',label,'badge '+(row.approved?'text-bg-success':'text-bg-secondary')));
    a.append(head,el('p','입력한 추천인: '+(row.input_name||'—'),'small mb-1 mt-2'));
    if(row.state==='linked')a.append(el('p','연결: '+names(row)+
      (source[row.link_method]?' · '+source[row.link_method]:''),'small mb-1'));
    const actions=el('div',null,'mt-2');
    const b=expandButton(button(row.state==='pending_review'?'추천인 찾기':row.state==='linked'?'연결 상세':'처리 이력',
      e=>openRecord(row,e.currentTarget),'btn btn-sm btn-outline-primary'));
    b.dataset.referralRecord=row.applicant_uuid;
    actions.append(b);a.append(actions);return a;
  }
  function expandButton(b){
    b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',detail.id);return b;
  }
  async function load(append=false){
    if(!isActive()||read||(append&&!listing?.hasMore))return;
    const r=task(),mine=mode,at=++generation;
    read=r;refresh.hidden=true;more.disabled=true;message('목록을 불러오고 있어요.');
    const owns=()=>read===r&&at===generation&&isActive()&&mode===mine;
    try{
      const next=append?page+1:0, data=await get(mine,{p_page:next},r);
      if(!owns())return;
      if(!Array.isArray(data.rows))throw Error('invalid_referral_list');
      if(!append){close();listing={seen:new Set(),hasMore:false};list.replaceChildren();}
      for(const row of data.rows){
        const id=mine==='rank'?row.id:row.applicant_uuid;
        if(!uid(id)||listing.seen.has(id)||(mine==='rank'&&(!Number.isInteger(row.total)||row.total<1)))continue;
        listing.seen.add(id);list.append(item(row));
      }
      listing.hasMore=data.has_more===true;more.hidden=!listing.hasMore;page=next;
      message(!list.children.length?(mine==='rank'?'집계할 추천 실적이 없어요.':mine==='linked'?'연결 완료된 신청이 없어요.':mine==='closed'?'종료한 신청이 없어요.':'확인할 신청이 없어요.'):'');
    }catch(e){if(owns()){
      if(denial(e)){clearDenied();return;}
      message('목록을 불러오지 못했어요.');refresh.hidden=false;
    }}finally{if(read===r){read=null;more.disabled=false;}}
  }
  function beginDetail(kind,ref,trigger,title){
    if(current?.trigger===trigger){close(true);return null;}
    close();
    const x={kind,ref,trigger,search:null,read:null};
    trigger.closest('article')?.append(detail);
    current=x;detail.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    x.head=el('h4',title,'h6 fw-bold m-0');x.head.tabIndex=-1;x.head.id='hcrec-referral-workspace-inline-title';
    detail.setAttribute('aria-labelledby',x.head.id);
    const bar=el('div',null,'d-flex justify-content-between align-items-start gap-2 mb-2');
    bar.append(x.head,button('닫기',()=>close(true),'btn btn-sm btn-outline-secondary'));detail.append(bar);
    x.info=el('p','','small mb-2');x.info.setAttribute('role','status');detail.append(x.info);x.head.focus({preventScroll:true});
    return x;
  }
  function openRank(row,trigger){
    if(!isActive())return;
    const x=beginDetail('rank',row.id,trigger,person(row.name,row.number));
    if(!x)return;
    x.lines=el('ul',null,'list-group mb-2');x.ids=new Set();x.heading=el('p','','small mb-1');
    x.retry=button('다시 확인',()=>void rankRead(x));x.retry.hidden=true;
    x.more=button('더 보기',()=>void rankRead(x,true));x.more.hidden=true;x.page=0;
    detail.append(x.heading,x.lines,x.retry,x.more);void rankRead(x);
  }
  async function rankRead(x,append=false){
    if(!live(x)||x.read)return;
    const r=task();x.read=r;x.info.textContent='신청 건을 불러오고 있어요.';x.more.disabled=true;x.retry.hidden=true;
    try{
      const next=append?x.page+1:0,data=await get('rank_detail',{p_referrer:x.ref,p_page:next},r);
      if(!live(x)||x.read!==r)return;
      if(!Array.isArray(data.rows))throw Error('invalid_rank_detail');
      if(!append){x.ids.clear();x.lines.replaceChildren();}
      for(const row of data.rows){if(!uid(row.id)||x.ids.has(row.id))continue;x.ids.add(row.id);
        x.lines.append(el('li',person(row.name,row.number)+(date(row.submitted)?' · 신청 '+date(row.submitted):''),'list-group-item'));}
      x.page=next;x.more.hidden=!data.has_more;
      x.heading.textContent='집계된 신청 '+Number(data.total||0).toLocaleString('ko-KR')+'건';
      x.info.textContent=x.ids.size?'':'집계에 포함된 신청이 없어요.';
    }catch(e){if(live(x)&&x.read===r){if(denial(e)){clearDenied();return;}
      x.info.textContent='신청 건을 불러오지 못했어요.';x.retry.hidden=false;}}
    finally{if(x.read===r){x.read=null;x.more.disabled=false;}}
  }
  function openRecord(row,trigger){
    if(!isActive())return;
    const x=beginDetail('record',row.applicant_uuid,trigger,person(row.applicant_name,row.applicant_number));
    if(!x)return;
    x.multiple=jointOwner(active);
    x.row=row;detail.append(el('p','신청서 입력: '+(row.input_name||'—'),'small mb-1'));
    if(row.state==='linked')detail.append(el('p','현재 연결: '+names(row)+
      (source[row.link_method]?' · '+source[row.link_method]:''),'small mb-2'));
    if(row.state==='closed')detail.append(el('p','연결 없이 종료한 신청입니다.','small mb-2'));
    if(row.managed_in_detail&&!x.multiple&&typeof openMember==='function'){
      detail.append(button('조합원 상세에서 정정·이력 보기',()=>{if(live(x))void openMember(x.ref,()=>live(x));},
        'btn btn-sm btn-outline-primary mb-2'));
      return;
    }
    const history=button('변경 이력',()=>void historyRead(x),'btn btn-sm btn-outline-secondary mb-2 align-self-start');
    const hist=el('div',null,'mb-2');hist.hidden=true;x.hist=hist;x.histButton=history;
    detail.append(history,hist);
    if(row.state==='closed'){
      const p=getPending(x.ref);
      if(p&&!p.running)detail.append(button('저장 결과 확인',()=>void check(x),'btn btn-outline-primary align-self-start'));
      return;
    }
    let draft=drafts.get(x.ref);
    if(!draft||draft.revision!==row.revision){
      const saved=Array.isArray(row.referrers)?row.referrers.filter(p=>uid(p?.id)):
        uid(row.referrer_uuid)?[{id:row.referrer_uuid,name:row.referrer_name,number:row.referrer_number}]:[];
      draft={revision:row.revision,term:row.state==='pending_review'?(row.input_name||''):(row.referrer_name||row.input_name||''),
        selected:null,chosen:saved.slice(),baseline:selectionKey(saved)};
      drafts.set(x.ref,draft);
    }
    x.draft=draft;x.form=el('form',null,'mt-2');
    const label=el('label','추천인 이름 또는 조합원번호','form-label fw-semibold');label.htmlFor='hcrec-referral-candidate-input';
    const line=el('div',null,'d-flex gap-2 flex-wrap');
    x.input=el('input',null,'form-control');x.input.id=label.htmlFor;x.input.type='search';x.input.maxLength=80;
    x.input.autocomplete='off';x.input.setAttribute('data-erp-query-control','');x.input.value=draft.term;x.input.style.cssText='flex:1 1 12rem;min-width:0;width:auto';
    x.find=button('검색',null,'btn btn-outline-primary');x.find.type='submit';
    line.append(x.input,x.find);x.results=el('div',null,'d-grid gap-1 mt-2');x.results.setAttribute('aria-label','추천인 검색 결과');
    x.selected=el(x.multiple?'div':'p',null,'small mt-2');
    if(x.multiple){x.selected.className='d-flex flex-wrap gap-2 my-2';x.selected.setAttribute('aria-label','선택한 추천인');}
    const actions=el('div',null,'d-flex flex-wrap gap-2');
    x.save=button(row.state==='linked'?'정정 저장':'추천인 연결',()=>void save(x,row.state==='linked'?'correct':'link'),'btn btn-primary');
    x.check=button('저장 결과 확인',()=>void check(x),'btn btn-outline-primary');
    actions.append(x.save,x.check);
    if(row.state==='pending_review'){
      x.end=button('연결 없이 종료',()=>{
        if(!live(x)||getPending(x.ref))return;guard.hidden=false;yes.focus({preventScroll:true});
      });
      const guard=el('div',null,'border rounded p-2 mt-2'),yes=button('종료 확인',()=>void save(x,'close'),'btn btn-outline-danger me-2');
      guard.hidden=true;x.endConfirm=yes;
      guard.append(el('p','이 신청을 추천인 연결 없이 종료할까요?','small mb-2'),yes,
        button('취소',()=>{guard.hidden=true;x.end.focus({preventScroll:true});}));
      actions.append(x.end);x.form.append(label,line,x.results,x.selected,actions,guard);
    }else{x.form.append(label,line,x.results,x.selected,actions);}
    x.input.oninput=()=>{
      abort(x.search);x.search=null;draft.term=x.input.value;if(!x.multiple)draft.selected=null;
      x.results.replaceChildren();x.info.textContent='';controls(x);
    };
    x.form.onsubmit=e=>{e.preventDefault();void find(x);};
    detail.append(x.form);renderSelected(x);controls(x);
    if(!x.input.readOnly)x.input.focus({preventScroll:true});
  }
  function renderSelected(x){
    if(!x.multiple)return;
    x.selected.replaceChildren(...x.draft.chosen.map((p,i)=>{
      const b=button(person(p.name,p.number)+' ×',()=>{
        if(!live(x)||x.blocked||getPending(x.ref))return;
        x.draft.chosen=x.draft.chosen.filter(q=>q.id!==p.id);
        renderSelected(x);controls(x);
        (x.selected.children[Math.min(i,x.selected.children.length-1)]||x.input).focus({preventScroll:true});
      },'btn btn-sm btn-outline-secondary text-wrap text-break');
      b.setAttribute('aria-label',person(p.name,p.number)+' 선택 취소');return b;
    }));
  }
  function controls(x){
    if(!live(x)||!x.form)return;
    const p=getPending(x.ref), locked=!!p||!!x.blocked;
    const selection=x.draft.selected;
    const chosen=x.multiple?x.draft.chosen:[selection].filter(Boolean);
    x.find.disabled=locked||!!x.search||!x.input.value.trim();x.input.readOnly=locked;
    x.save.disabled=locked||!chosen.length||(x.multiple&&selectionKey(chosen)===x.draft.baseline);
    if(x.end)x.end.disabled=locked;
    if(x.endConfirm)x.endConfirm.disabled=locked;
    x.check.hidden=!p||!!p.running;x.check.disabled=!!x.checking;
    for(const b of x.results.querySelectorAll('button')){b.disabled=locked;b.setAttribute('aria-pressed',String(chosen.some(p=>p.id===b.dataset.candidate)));}
    if(x.multiple){for(const b of x.selected.children)b.disabled=locked;}
    else x.selected.textContent=selection?'선택: '+person(selection.name,selection.number):'';
  }
  async function find(x){
    if(!live(x)||x.search||x.blocked||getPending(x.ref))return;
    const term=x.input.value.trim();if(!term)return;
    if(term.length>80){x.info.textContent='검색어를 80자 이내로 입력해 주세요.';return;}
    const r=task();x.search=r;if(!x.multiple)x.draft.selected=null;
    x.results.replaceChildren();controls(x);x.info.textContent='추천인을 찾고 있어요.';
    const owns=()=>live(x)&&x.search===r&&x.input.value.trim()===term&&!getPending(x.ref);
    try{
      const found=await get('search',{p_applicant:x.ref,p_keyword:term},r);
      if(!owns())return;if(!Array.isArray(found.rows))throw Error('invalid_search');
      const seen=new Set();
      for(const row of found.rows){
        if(!uid(row.id)||seen.has(row.id))continue;seen.add(row.id);
        const b=button(person(row.name,row.number)+(row.phone_last4?' · 연락처 끝 '+row.phone_last4:''),()=>{
          if(!live(x)||x.blocked||x.input.value.trim()!==term||getPending(x.ref))return;
          if(x.multiple){
            if(x.draft.chosen.some(p=>p.id===row.id))x.draft.chosen=x.draft.chosen.filter(p=>p.id!==row.id);
            else{
              if(x.draft.chosen.length===5){x.info.textContent='추천인은 다섯 명까지 선택할 수 있어요.';return;}
              x.draft.chosen=[...x.draft.chosen,row];
            }
            x.info.textContent='';renderSelected(x);
          }else x.draft.selected=row;
          controls(x);
        },'btn btn-outline-secondary text-start text-break');b.dataset.candidate=row.id;x.results.append(b);
      }
      x.info.textContent=seen.size?(found.has_more?'결과가 많아요. 이름이나 번호를 더 입력해 주세요.':'목록에서 추천인을 선택해 주세요.'):'일치하는 조합원이 없어요.';
    }catch(e){if(owns()){if(denial(e))clearDenied();else x.info.textContent='검색하지 못했어요. 다시 검색해 주세요.';}}
    finally{if(x.search===r){x.search=null;controls(x);}}
  }
  async function historyRead(x,append=false){
    if(!live(x)||x.read)return;
    const r=task();x.read=r;x.hist.hidden=false;x.histButton.disabled=true;
    if(!append){x.historyPage=0;x.historyList=el('ul',null,'list-group mb-2');x.hist.replaceChildren(x.historyList);}
    const info=el('p','이력을 불러오고 있어요.','small mb-1');x.hist.append(info);
    try{
      const next=append?x.historyPage+1:0;
      const joint=x.multiple&&x.row.managed_in_detail;
      const args={p_applicant:x.ref,p_page:next};
      const data=await (joint?rpc('member_referral_detail',{p_mode:'history',...args},r):get('history',args,r));
      if(!live(x)||x.read!==r)return;
      if(!Array.isArray(data.rows))throw Error('invalid_history');
      for(const h of data.rows){
        const a=el('li',null,'list-group-item');
        const labels=list=>Array.isArray(list)?list.map(p=>typeof p==='string'?p:p?.name?person(p.name,p.number):'').filter(Boolean).join(', '):'';
        a.append(el('p',(joint?labels(h.before)||'미연결':h.from_label||(h.from_state==='linked'?'이전 회원 확인 필요':'미연결'))+
          ' → '+(joint?labels(h.after)||'연결 없이 종료':h.to_label||'연결 없이 종료'),'mb-1'),
          el('small',[h.actor_label,date(h.created_at),source[h.from_method]?'이전: '+source[h.from_method]:''].filter(Boolean).join(' · ')));
        x.historyList.append(a);
      }
      info.textContent=data.rows.length?'':'관리자가 남긴 변경 이력이 없어요.';
      x.historyPage=next;
      if(data.has_more)x.hist.append(button('이력 더 보기',e=>{e.currentTarget.remove();void historyRead(x,true);}));
    }catch(e){if(live(x)&&x.read===r){if(denial(e))clearDenied();else info.textContent='이력을 불러오지 못했어요. 다시 눌러 주세요.';}}
    finally{if(x.read===r){x.read=null;x.histButton.disabled=false;}}
  }
  function done(x,label){
    drafts.delete(x.ref);
    if(live(x)){
      const focus=detail.contains(d.activeElement);close();void load();
      if(focus)group.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
      message(label);
    }else if(isActive()){
      // An old operation may have completed off-screen. Never replace a new editor.
      if(current?.ref===x.ref&&current.kind==='record'&&current.form){
        current.blocked=true;current.info.textContent='이전 작업이 처리됐어요. 목록을 다시 확인해 주세요.';controls(current);
      }
      refresh.hidden=false;
    }
  }
  async function save(x,action){
    if(!live(x)||x.blocked||getPending(x.ref))return;
    const selection=x.draft?.selected?.id;
    if(action!=='close'&&(!x.form||x.save.disabled))return;
    const req=root.crypto?.randomUUID?.();if(!uid(req))return;
    const actor=active,key=slot(x.ref),work={key,req,running:true};
    setPending(key,work);controls(x);x.info.textContent='저장하고 있어요.';
    try{
      const args={p_applicant:x.ref,p_revision:x.row.revision,p_request:req};
      const write=x.multiple&&action!=='close'
        ?rpc('member_referral_detail',{p_mode:'save',...args,p_referrers:x.draft.chosen.map(p=>p.id)},task(),14000)
        :rpc('member_referral_workspace_write',{...args,p_candidate:action==='close'?null:selection,p_action:action},task(),14000);
      const v=await write;
      if(!['saved','unchanged'].includes(v.status))throw Error('unknown_referral_save');
      setPending(key,null);if(active===actor)done(x,v.status==='saved'?'저장했어요.':'기존 연결과 같아요.');
    }catch(e){
      const known=denial(e)||['PT409','22023','23505'].includes(e?.code);
      if(known)setPending(key,null);else setPending(key,{key,req});
      if(live(x)){
        if(denial(e)){clearDenied();return;}
        x.info.textContent=e?.message==='REFERRAL_DETAIL_REQUIRED'?'조합원 상세에서 추천인을 정정해 주세요.'
          :e?.code==='PT409'?'다른 곳에서 연결이 바뀌었어요. 목록을 다시 확인해 주세요.'
          :e?.code==='22023'?'선택한 회원의 상태를 확인하고 다시 검색해 주세요.':'저장 결과를 확인하지 못했어요.';
        if(!x.multiple&&(e?.code==='PT409'||e?.code==='22023'))x.draft.selected=null;
        if(e?.code==='PT409')x.blocked=true;
        if(known)refresh.hidden=false;
      }
    }finally{if(live(x))controls(x);else if(current?.ref===x.ref&&active===actor)controls(current);}
  }
  async function check(x){
    if(!live(x)||x.checking)return;
    const p=getPending(x.ref);if(!p||p.running)return;
    x.checking=true;controls(x);x.info.textContent='저장 결과를 확인하고 있어요.';
    try{
      const args={p_applicant:x.ref,p_request:p.req};
      const result=await (x.multiple?rpc('member_referral_detail',{p_mode:'receipt',...args},task()):get('receipt',args,task()));
      if(!live(x))return;
      if(result.status==='saved'){setPending(p.key,null);done(x,'저장했어요.');}
      else if(result.status==='not_found'){setPending(p.key,null);x.info.textContent='저장되지 않았어요. 선택 내용을 확인해 주세요.';}
      else x.info.textContent='아직 결과를 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.';
    }catch(e){if(live(x)){if(denial(e))clearDenied();else x.info.textContent='저장 결과를 확인하지 못했어요. 다시 확인해 주세요.';}}
    finally{x.checking=false;if(live(x))controls(x);}
  }
  for(const t of tabs)t.onclick=()=>switchMode(t.dataset.referralMode);
  group.addEventListener('keydown',e=>{
    const i=tabs.indexOf(e.target);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
    tabs[next].focus();switchMode(tabs[next].dataset.referralMode);
  });
  closed.onchange=()=>switchMode(closed.checked?'closed':'pending_review');
  more.onclick=()=>void load(true);
  refresh.onclick=()=>{if(active){close();void load();}};
  const frame=root.frameElement;
  if(frame)new MutationObserver(()=>{if(!owner()&&active)leave(draftOwner);else if(owner()&&!active)void enter();})
    .observe(frame,{attributes:true,attributeFilter:['hidden','class','style']});
  root.addEventListener('pagehide',()=>leave(''));
  return Object.freeze({enter,leave,refresh(){if(isActive()){close();void load();}}});
 }
 root.HcrecReferralWorkspace=Object.freeze({version:'1.3.0',mount});
})(window);
