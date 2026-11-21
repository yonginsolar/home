/* Badge drafts and explicit activation. Loaded only from the badge tools. */
(function(root){
 'use strict';
 const fresh=()=>({name:'',icon:'🏅',description:'',kind:'manual',color:'primary',order:0,min_won:null});
 const templateIssues={
  source_reference:'원래 조합의 행사·교육에 연결된 조건은 옮길 수 없어요.',
  unsupported_condition:'이 지급 조건은 가져오기를 지원하지 않아요.',
  restricted_text:'내용에 외부 참조나 공유하기 어려운 정보가 있어 옮길 수 없어요.'
 };
 const labels={
  BADGE_MEMBER_READ_FORBIDDEN:'지급 대상은 조합원 조회 권한이 있는 관리자만 확인할 수 있습니다.',
  CAPITAL_BADGE_FORBIDDEN:'뱃지 관리 권한을 확인해 주세요.',
  BADGE_FIELDS_INVALID:'이름과 아이콘, 금액, 표시 순서를 확인해 주세요.',
  BADGE_TEMPLATE_NOT_FOUND:'이 뱃지는 더 이상 불러올 수 없습니다. 목록을 다시 확인해 주세요.',
  BADGE_TEMPLATE_CHANGED:'원래 뱃지의 정의가 바뀌었어요. 목록을 다시 확인해 주세요.',
  BADGE_TEMPLATE_UNSUPPORTED:'이 뱃지의 조건은 옮길 수 없어요.',
  BADGE_DRAFT_CHANGED:'다른 창에서 초안이 바뀌었습니다. 작성 내용은 유지했습니다. 초안 목록에서 최신본을 확인해 주세요.',
  BADGE_REVIEW_CHANGED:'지급 대상이 바뀌었거나 확인 시간이 지났습니다. 다시 미리보기 해 주세요.',
  BADGE_MINIMUM_REQUIRED:'출자금 납입 기준을 먼저 입력해 주세요.',
  BADGE_ALREADY_ACTIVE:'이미 활성화된 뱃지입니다. 목록에서 확인해 주세요.',
  BADGE_DRAFT_NOT_FOUND:'초안을 찾을 수 없습니다. 목록을 다시 확인해 주세요.',
  BADGE_REQUEST_CHANGED:'기존 요청과 다른 내용입니다. 저장 결과를 먼저 확인해 주세요.',
  BADGE_REVIEW_REQUIRED:'지급 대상을 먼저 확인해 주세요.'
 };
 function mount({dialog,owner,api,onActivated=()=>{},timeout=12000}){
  const doc=dialog.ownerDocument, pick=k=>dialog.querySelector('[data-bw="'+k+'"]');
  const form=pick('form'), title=doc.getElementById('badge-workbench-title');
  const stored=new Map();
  let scope='',s=null,epoch=0,op=0,busy=false,trigger=null,review=null;
  const field=n=>form.elements.namedItem(n);
  const snapshot=value=>JSON.stringify(value);
  const message=text=>{pick('status').textContent=text;};
  const current=()=>!!scope&&scope===owner()&&dialog.open;
  const blank=()=>({view:'new',draft:null,local:null,unresolved:null,edits:new Map(),items:[],more:false,offset:0});
  function readFields(){
   const k=field('kind').value, amount=field('min_won').value.trim(), order=field('order').value;
   let min_won=null;
   if(k==='paid_capital'&&amount){
    if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(amount))throw Error('출자금 기준을 숫자로 입력해 주세요.');
    min_won=Number(amount.replaceAll(',',''));
    if(!Number.isSafeInteger(min_won)||min_won>1e12)throw Error('출자금 기준은 1원부터 1조 원까지 입력할 수 있습니다.');
   }
   if(!/^\d{1,6}$/.test(order))throw Error('표시 순서를 확인해 주세요.');
   const name=field('name').value.trim(),icon=field('icon').value.trim()||'🏅';
   if(!name)throw Error('뱃지 이름을 입력해 주세요.');
   return {kind:k,name,icon,description:field('description').value,color:field('color').value,order:Number(order),min_won};
  }
  const canonical=value=>{
   const {kind,name,icon,description,color,order,min_won}=value||{};
   return snapshot([kind,name,icon,description,color,order,min_won]);
  };
  const changed=()=>{
   if(!s?.draft)return true;
   try{return canonical(readFields())!==canonical(s.draft.fields);}catch{return true;}
  };
  function preserve(){
   if(!s||s.view!=='edit')return;
   s.local=Object.fromEntries([...form.elements].filter(e=>e.name).map(e=>[e.name,e.value]));
   const key=s.draft?.id||'new';
   if(changed())s.edits.set(key,{fields:s.local,revision:s.draft?.revision??null});
   else s.edits.delete(key);
  }
  function setFields(value){
   for(const key of Object.keys(fresh()))field(key).value=value[key]??'';
  }
  function clearReview(){
   review=null;
   pick('review-list').replaceChildren();
   pick('review-summary').textContent='';
   pick('review-box').hidden=true;
   pick('review-prev').hidden=pick('review-next').hidden=true;
   pick('activate').hidden=true;
  }
  function inactive(){
   if(!dialog.open&&!scope)return;
   preserve();clearReview();++epoch;busy=false;
   if(dialog.open)dialog.close();
   scope='';s=null;trigger=null;
   pick('rows').replaceChildren();form.reset();message('');
  }
  const inspect=()=>{if((scope&&scope!==owner())||doc.hidden)inactive();};
  doc.addEventListener('visibilitychange',inspect);
  root.addEventListener('pagehide',()=>{inactive();stored.clear();});
  const frame=root.frameElement;
  if(frame){
   const observer=new root.MutationObserver(inspect);
   observer.observe(frame,{attributes:true,attributeFilter:['hidden','style','class']});
  }
  function sync(){
   if(!s)return;
   const paid=field('kind').value==='paid_capital', edit=s.view==='edit', blocked=busy||!!s.unresolved;
   pick('amount').hidden=!paid;
   for(const e of form.elements)if(e.name)e.disabled=blocked;
   pick('save').disabled=blocked||!!s.draft?.badge_id;
   pick('preview').disabled=blocked||!s.draft||!!s.draft?.badge_id;
   pick('activate').hidden=!edit||!review||!!s.draft?.badge_id;
   pick('activate').disabled=blocked||!review||changed();
   pick('review-prev').disabled=pick('review-next').disabled=blocked;
   pick('more').disabled=pick('reload').disabled=blocked;
   for(const button of pick('rows').querySelectorAll('button'))button.disabled=blocked;
   pick('recovery').hidden=!s.unresolved;
   pick('check').disabled=pick('repeat').disabled=busy;
  }
  function chooser(view){
   s.view=view;
   title.textContent=view==='catalog'?'뱃지 불러오기':'뱃지 초안';
   pick('chooser').hidden=false;form.hidden=true;clearReview();
  }
  function editor(data,local=null){
   s.view='edit';s.draft=data;s.local=local;
   title.textContent=data?'뱃지 초안':'새 뱃지';
   pick('chooser').hidden=true;form.hidden=false;clearReview();
   setFields(local?.fields||data?.fields||fresh());
   sync();
  }
  function cards(){
   const rows=pick('rows');rows.replaceChildren();
   for(const row of s.items){
    const f=s.view==='catalog'?row:row.fields;
    const card=doc.createElement('div');card.className='bw-entry';
    const content=doc.createElement('div'), heading=doc.createElement('strong'), sub=doc.createElement('div');
    heading.textContent=[f.icon,f.name].filter(Boolean).join(' ');
    sub.className='small text-muted';
    const catalog=s.view==='catalog';
    const validMinimum=Number.isSafeInteger(f.min_won)&&f.min_won>0;
    const condition=f.kind==='paid_capital'
     ?(validMinimum?'납입 출자금 '+f.min_won.toLocaleString('ko-KR')+'원 이상':'출자금 납입 조건')
     :'직접 지급';
    const issue=catalog&&(row.reason?templateIssues[row.reason]||templateIssues.unsupported_condition
      :(!['manual','paid_capital'].includes(row.kind)||(row.kind==='paid_capital'&&!validMinimum)?templateIssues.unsupported_condition:''));
    sub.textContent=catalog?[row.source_label,issue?'가져올 수 없음':condition].filter(Boolean).join(' · '):condition;
    content.append(heading,sub);
    if(catalog&&f.description){
     const description=doc.createElement('p');description.className='small mb-0 mt-1';description.style.whiteSpace='pre-wrap';
     description.textContent=f.description;content.append(description);
    }
    if(issue){
      const note=doc.createElement('p');note.className='small text-muted mt-1 mb-0';note.textContent=issue;
      content.append(note);card.append(content);rows.append(card);continue;
    }
    const b=doc.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-primary';
    b.textContent=s.view==='catalog'?'초안으로 가져오기':'열기';
    b.setAttribute('aria-label',f.name+' '+b.textContent);
    b.addEventListener('click',()=>{if(s.view==='catalog')importDesign(row);else void loadDraft(row.id);});
    card.append(content,b);rows.append(card);
   }
   pick('more').hidden=!s.more;sync();
  }
  async function request(args,loading,ok,failed=undefined){
   if(!current()||busy)return false;
   const generation=epoch,operation=++op,active=()=>current()&&epoch===generation&&op===operation;
   busy=true;message(loading);sync();
   let timer;
   try{
    const result=await Promise.race([api(args),new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(Error('timeout')),timeout);})]);
    if(result.error)throw result.error;
    if(active())ok(result.data);
    return true;
   }catch(e){
    if(active()){
     const code=String(e?.message||'');
     if(labels[code])message(labels[code]);
     else message('결과를 확인하지 못했습니다. 다시 확인해 주세요.');
     failed?.(e);
    }
    return false;
   }finally{
    root.clearTimeout(timer);
    if(active()){busy=false;sync();}
   }
  }
  function list(more=false){
   const catalog=s.view==='catalog',last=more?s.items.at(-1):null,offset=more?s.offset:0;
   const moreButton=pick('more'),ownedFocus=more&&doc.activeElement===moreButton,pageEpoch=epoch;
   pick('reload').hidden=true;
   return request({p_action:s.view,...(catalog?{p_offset:offset}:last?{p_draft_id:last.id}:{})},'목록을 불러오는 중입니다…',data=>{
    if(!Array.isArray(data?.items))throw Error('NO_CATALOG');
    const first=s.items.length;
    const merged=more?s.items.concat(data.items):data.items;
    s.items=[...new Map(merged.map(row=>[catalog?row.template_key:row.id,row])).values()];
    if(catalog)s.offset=offset+data.items.length;
    s.more=data.more===true&&data.items.length>0;
    cards();message(s.items.length?'':(catalog?'가져올 뱃지가 없습니다.':'저장된 초안이 없습니다.'));
    if(ownedFocus)root.queueMicrotask(()=>{
     if(!current()||epoch!==pageEpoch||![doc.body,moreButton].includes(doc.activeElement))return;
     const next=[...pick('rows').children].slice(first).map(row=>row.querySelector('button:not(:disabled)')).find(Boolean);
     (next||(moreButton.hidden?title:moreButton)).focus();
    });
   },()=>{pick('reload').hidden=false;});
  }
  function loadDraft(id){
   return request({p_action:'draft',p_draft_id:id},'초안을 불러오는 중입니다…',data=>{
    const local=s.edits.get(id);
    editor(data,local?.revision===data.revision?local:null);
    message(local&&local.revision!==data.revision?'다른 창에서 초안이 바뀌어 저장된 버전을 열었습니다.':'');
    title.focus();
   },()=>{pick('reload').hidden=false;});
  }
  function success(kind,data){
   if(!data?.id)throw Error('NO_RECEIPT');
   s.unresolved=null;
   const local=kind==='import'&&data.import_reused?s.edits.get(data.id):null;
   if(!local)s.edits.delete(kind==='create'?'new':data.id);
   if(data.badge_id){
    clearReview();s.draft=data;
    form.hidden=true;pick('chooser').hidden=true;s.view='done';
    message(kind==='activate'?(data.awarded_count>0?'활성화했습니다. '+data.awarded_count+'명에게 지급했습니다.':'활성화했습니다.'):'이미 활성화된 뱃지입니다.');
    if(kind==='activate'){
     const activatedOwner=scope, completedEpoch=epoch;
     void Promise.resolve().then(()=>onActivated(activatedOwner)).catch(()=>{
      if(current()&&epoch===completedEpoch&&s.view==='done')message('활성화했습니다. 목록은 뱃지 관리에서 다시 확인해 주세요.');
     });
    }
   }else{
    editor(data,local?.revision===data.revision?local:null);
    message(kind==='import'?(local&&local.revision!==data.revision?'다른 창에서 초안이 바뀌어 저장된 버전을 열었습니다.':data.import_reused?'이미 가져온 초안을 열었습니다.':'초안으로 가져왔습니다.'):kind==='create'||kind==='save'?'초안을 저장했습니다.':'');
   }
   title.focus();
  }
  function mutation(args){
   const area=s;
   // Capture before awaiting; an input, tab or tenant must never change this request.
   const attempt={args,area};
   area.unresolved=attempt;
   return request(args,'처리 중입니다…',data=>success(args.p_action,data),e=>{
    if(labels[String(e?.message||'')]||e?.code==='23505'){
     area.unresolved=null;
     if(e.code==='23505')message('고유 식별자가 충돌했습니다. 다시 시도해 주세요.');
     if(args.p_action==='activate')clearReview();
     if(args.p_action==='import')pick('reload').hidden=false;
    }else message('처리 결과를 아직 확인하지 못했습니다. 먼저 결과를 확인해 주세요.');
   });
  }
  function importDesign(row){
   if(!current()||busy||s.unresolved||row.reason||!['manual','paid_capital'].includes(row.kind)||!row.template_revision)return;
   const id=root.crypto?.randomUUID?.();
   if(!id){message('보안 연결에서 다시 열어 주세요.');return;}
   void mutation({p_action:'import',p_template_key:row.template_key,p_template_revision:row.template_revision,p_request_id:id});
  }
  function save(){
   if(!current()||busy||s.unresolved)return;
   let f;try{f=readFields();}catch(e){message(e.message);return;}
   const d=s.draft, newid=d?null:root.crypto?.randomUUID?.();
   if(!d&&!newid){message('보안 연결에서 다시 열어 주세요.');return;}
   clearReview();
   void mutation(d?{p_action:'save',p_draft_id:d.id,p_revision:d.revision,p_fields:f}:{p_action:'create',p_request_id:newid,p_fields:f});
  }
  function showReview(offset=0,paging=false){
   if(!current()||busy||s.unresolved||!s.draft)return;
   if(changed()){message('바꾼 내용을 초안으로 먼저 저장해 주세요.');return;}
   const mode=field('kind').value,d=s.draft,previous=paging?review:null;
   if(!previous)clearReview();
   void request({p_action:'preview',p_draft_id:d.id,p_revision:d.revision,p_offset:offset,...(previous?{p_review:previous.review}:{})},'지급 대상을 확인하는 중입니다…',data=>{
    const generation=epoch;
    if(changed()||!data?.review||!Number.isInteger(data.count))return;
    review=data;
    pick('review-box').hidden=false;
    pick('review-summary').textContent=mode==='paid_capital'?'지금 지급 대상 '+data.count.toLocaleString('ko-KR')+'명':'직접 지급 뱃지는 활성화해도 자동 지급되지 않습니다.';
    const list=pick('review-list');list.replaceChildren();
    list.start=data.offset+1;
    for(const person of data.items){
     const row=doc.createElement('li');row.textContent=[person.name,person.number].filter(Boolean).join(' · ');list.append(row);
    }
    pick('review-prev').hidden=data.offset===0;
    pick('review-next').hidden=data.offset+data.items.length>=data.count;
    message('');
    root.queueMicrotask(()=>{if(current()&&epoch===generation&&review===data&&doc.activeElement===doc.body)pick('activate').focus();});
   },()=>clearReview());
  }
  function check(){
   const attempt=s?.unresolved;
   if(!attempt)return;
   const a=attempt.args,draft=a.p_draft_id,opening=!draft;
   void request(opening?{p_action:'request',p_request_id:a.p_request_id}:{p_action:'draft',p_draft_id:draft},'저장 결과를 확인하는 중입니다…',data=>{
    if(!data||(a.p_action==='activate'&&!data.badge_id)||(a.p_action==='save'&&(!data.badge_id&&data.revision<a.p_revision+1&&canonical(data.fields)!==canonical(a.p_fields)))){
     message('아직 원래 요청의 결과를 확인하지 못했습니다.');return;
    }
    if(a.p_action==='save'&&!data.badge_id&&canonical(data.fields)!==canonical(a.p_fields)){
     s.unresolved=null;message(labels.BADGE_DRAFT_CHANGED);return;
    }
    success(a.p_action,data);
   });
  }
  function close(restore=true){
   const button=trigger, before=scope;
   inactive();
   if(restore&&before===owner()&&button?.isConnected)button.focus({preventScroll:true});
  }
  pick('close').addEventListener('click',()=>close());
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',()=>{
   if(!current())return;
   preserve();clearReview();sync();
  });
  pick('save').addEventListener('click',save);
  pick('preview').addEventListener('click',()=>showReview());
  pick('review-prev').addEventListener('click',()=>{if(review)showReview(Math.max(0,review.offset-50),true);});
  pick('review-next').addEventListener('click',()=>{if(review)showReview(review.offset+50,true);});
  pick('activate').addEventListener('click',()=>{
   if(!current()||busy||s.unresolved||!review||changed())return;
   const d=s.draft;
   void mutation({p_action:'activate',p_draft_id:d.id,p_revision:d.revision,p_review:review.review});
  });
  pick('check').addEventListener('click',check);
  pick('repeat').addEventListener('click',()=>{if(!busy&&s?.unresolved)void mutation(s.unresolved.args);});
  pick('more').addEventListener('click',()=>void list(true));
  pick('reload').addEventListener('click',()=>void list());
  function open(view,button){
   const next=owner();if(!next||dialog.open)return false;
   scope=next;trigger=button;s=stored.get(next)||blank();stored.set(next,s);
   dialog.showModal();message('');
   if(s.unresolved){
    if(s.view==='edit')editor(s.draft,s.edits.get(s.draft?.id||'new'));
    else{chooser(s.view==='drafts'?'drafts':'catalog');cards();}
    if(s.unresolved)message('원래 요청의 결과부터 확인해 주세요.');
   }else if(view==='new')editor(null,s.edits.get('new'));
   else{chooser(view);s.items=[];s.more=false;s.offset=0;cards();void list();}
   sync();title.focus();
   return true;
  }
  return Object.freeze({open,invalidate:()=>close(false),forget:()=>{close(false);stored.clear();}});
 }
 root.AdminBadgeWorkbench=Object.freeze({version:'1.1.0',mount});
})(window);
