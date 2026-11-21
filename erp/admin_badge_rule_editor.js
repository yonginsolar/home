/* PC badge authoring. Imported and legacy badge workbench stays separate. */
(function(root){
 'use strict';
 const catalog=Object.freeze({
  capital_min:{label:'납입 출자금',unit:'원 이상',hint:'출자금 납입자본 납부 입금 금액 주금',type:'number'},
  join_since:{label:'가입일 이후',unit:'이 날짜부터 (포함)',hint:'가입 입회 입단 등록 시작 날짜 신입 가입일',type:'date'},
  join_until:{label:'가입일 이전',unit:'이 날짜까지 (포함)',hint:'가입 입회 등록 날짜 옛 기존 가입일',type:'date'},
  tenure_days:{label:'가입 기간',unit:'일 이상',hint:'가입 기간 가입연수 근속 오래 장기 경과 회원 일수 기간',type:'number'}
 });
 const labels={
  BADGE_FIELDS_INVALID:'뱃지 이름·아이콘·표시 순서를 확인해 주세요.',
  BADGE_RULE_INVALID:'지원하는 조건과 입력값을 다시 확인해 주세요.',
  BADGE_RULE_DATE_CONFLICT:'시작일이 종료일보다 늦어요. 날짜 범위를 확인해 주세요.',
  BADGE_REVIEW_REQUIRED:'지급 대상을 먼저 확인해 주세요.',
  BADGE_REVIEW_CHANGED:'조건이나 지급 대상이 바뀌었어요. 대상을 다시 확인해 주세요.',
  BADGE_DRAFT_CHANGED:'다른 창에서 초안이 바뀌었어요. 저장한 초안을 다시 확인해 주세요.',
  BADGE_DRAFT_NOT_FOUND:'초안을 찾을 수 없어요.',
  BADGE_ALREADY_ACTIVE:'이미 활성화된 뱃지입니다.',
  CAPITAL_BADGE_FORBIDDEN:'뱃지 관리 권한을 확인해 주세요.'
 };
 const newFields=()=>({name:'',icon:'🏅',description:'',color:'primary',order:0,combine:'all',rules:[]});
 const fingerprint=f=>JSON.stringify([f.name,f.icon,f.description,f.color,Number(f.order),f.rules.length<2?'all':f.combine,
  f.rules.map(r=>[r.key,String(r.value)]).sort()]);
 function mount({dialog,owner,api,onActivated=()=>{},timeout=12000}){
  const doc=dialog.ownerDocument,p=k=>dialog.querySelector('[data-bre="'+k+'"]'),form=p('form'),title=dialog.querySelector('#badge-rule-title');
  const f=k=>form.elements.namedItem(k),make=(tag,s='',cls='')=>{const n=doc.createElement(tag);n.textContent=s;if(cls)n.className=cls;return n;};
  const makeButton=(s,fn)=>{const b=make('button',s,'btn btn-outline-secondary bre-option');b.type='button';b.onclick=fn;return b;};
  const storage=new Map();let scope='',s=null,trigger=null,generation=0,busy=false,review=null;
  const state=()=>({id:'new',pages:new Map([['new',{fields:newFields(),receipt:null}]]),pending:null,draftOffset:0});
  const page=()=>s.pages.get(s.id),current=()=>!!scope&&dialog.open&&owner()===scope;
  const status=t=>p('status').textContent=t;
  function read(){
   const r=page().fields.rules.map(x=>({...x}));
   return {name:f('name').value.trim(),icon:f('icon').value.trim()||'🏅',description:f('description').value,color:f('color').value,
    order:f('order').value,combine:r.length<2?'all':f('combine').value,rules:r};
  }
  function valid(){
   const d=read();
   if(!d.name||!/^\d{1,6}$/.test(d.order))throw Error('뱃지 이름과 표시 순서를 확인해 주세요.');
   for(const r of d.rules){
    if(!catalog[r.key]||!String(r.value).trim())throw Error('추가한 조건의 기준값을 입력해 주세요.');
    if(catalog[r.key].type==='number'){
     const raw=String(r.value).trim();
     if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(raw))throw Error('기준값을 1 이상의 정수로 입력해 주세요.');
     r.value=Number(raw.replaceAll(',',''));
     if(!Number.isSafeInteger(r.value)||r.value>(r.key==='capital_min'?1e12:36525))throw Error('조건의 기준값이 너무 커요.');
    }
   }
   return d;
  }
  function safeFingerprint(){try{return fingerprint(valid());}catch{return null;}}
  function clearReview(){review=null;p('review-box').hidden=true;p('people').replaceChildren();}
  function disable(){
   const locked=busy||!!s.pending,active=!!page().receipt?.badge_id;
   for(const el of form.querySelectorAll('input,textarea,select,button'))el.disabled=locked||active;
   const r=page().fields.rules,proof=review?.local===safeFingerprint();
   p('save').disabled=locked||active||(r.length>0&&!proof);
   p('activate').hidden=active||!proof||!review?.saved;
   p('recover').hidden=!s.pending;
   p('check').disabled=p('repeat').disabled=busy;p('drafts').disabled=locked;
   for(const el of p('draft-list').querySelectorAll('button'))el.disabled=locked;
  }
  function updateRuleMode(){
   const rules=page().fields.rules;
   p('combine-wrapper').hidden=rules.length<2;
   p('mode').textContent=!rules.length?'조건이 없으면 직접 지급하는 뱃지입니다.':
     rules.length===1&&rules[0].key==='capital_min'?'승인된 조합원의 확정 납입액이 기준에 도달하면 지급합니다.':
     '활성화할 때 조건을 충족한 승인 조합원에게 지급합니다.';
  }
  function changed(){page().fields=read();clearReview();updateRuleMode();disable();}
  function options(open=true){
   const list=p('options'),query=p('search').value.normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean),rules=page().fields.rules;
   list.hidden=!open;p('add').setAttribute('aria-expanded',String(open));list.replaceChildren();
   if(!open)return;
   for(const [key,row] of Object.entries(catalog)){
    if(rules.some(r=>r.key===key)||!query.every(term=>(row.label+' '+row.hint).includes(term)))continue;
    list.append(makeButton(row.label,()=>{page().fields.rules.push({key,value:''});drawRules();options(false);
     changed();p('rules').querySelector('[data-rule-key="'+key+'"]')?.focus();}));
   }
   if(!list.children.length)list.append(make('p','추가할 수 있는 조건이 없어요.','small mb-1'));
  }
  function drawRules(){
   const rules=page().fields.rules,box=p('rules');box.replaceChildren();
   for(const r of rules){
    const c=catalog[r.key];if(!c)continue;
    const row=make('div','','bre-rule'),label=make('label',c.label+' · '+c.unit,'form-label mb-0');
    const input=make('input','','form-control');input.dataset.ruleKey=r.key;input.type=c.type==='date'?'date':'text';
    if(c.type==='date'){input.min='1900-01-01';input.max='2100-12-31';}else input.inputMode='numeric';
    input.value=r.value;input.addEventListener('input',()=>{const registered=page().fields.rules.find(x=>x.key===r.key);if(registered)registered.value=input.value;});
    const remove=make('button','빼기','btn btn-outline-secondary');remove.type='button';remove.setAttribute('aria-label',c.label+' 조건 빼기');
    remove.onclick=()=>{page().fields.rules=page().fields.rules.filter(x=>x.key!==r.key);drawRules();changed();p('add').focus();};
    label.append(input);row.append(label,remove);box.append(row);
   }
   updateRuleMode();
  }
  function hydrate(){
   const x=page();for(const k of ['name','icon','description','color','order','combine'])f(k).value=x.fields[k];
   drawRules();p('search').value='';options(false);clearReview();p('draft-list').hidden=true;disable();
  }
  function invalidate(restore=false){
   ++generation;busy=false;
   if(dialog.open){if(s)page().fields=read();dialog.close();}
   const from=trigger,id=scope;scope='';trigger=null;s=null;clearReview();
   if(restore&&id===owner()&&from?.isConnected)from.focus({preventScroll:true});
  }
  function open(from){
   const id=owner();if(!id||dialog.open)return false;
   scope=id;trigger=from;s=storage.get(id)||state();storage.set(id,s);
   if(page().receipt?.badge_id)s.id='new';
   dialog.showModal();hydrate();status(s.pending?'저장 결과를 먼저 확인해 주세요.':'');title.focus();return true;
  }
  async function request(args,apply,fail){
   if(!current()||busy)return;
   const id=scope,at=generation;let timer;
   const live=()=>current()&&scope===id&&generation===at;
   busy=true;disable();status('확인 중…');
   try{
    const out=await Promise.race([api(args),new Promise((_,r)=>{timer=root.setTimeout(()=>r(Error('timeout')),timeout);})]);
    if(out.error)throw out.error;if(live())apply(out.data);
   }catch(e){if(live()){status(labels[e?.message]||'결과를 확인하지 못했어요. 다시 확인해 주세요.');fail?.(e);}}
   finally{root.clearTimeout(timer);if(live()){busy=false;disable();}}
  }
  function showPreview(data,snapshot){
   if(!data?.review||!Array.isArray(data.items)||!Number.isInteger(data.count))throw Error('BADGE_REVIEW_INVALID');
   review={...data,local:fingerprint(snapshot)};p('review-box').hidden=false;
   p('activate').textContent=snapshot.rules.length?'활성화하고 지급':'활성화';
   p('summary').textContent=snapshot.rules.length?'지급 대상 '+data.count.toLocaleString('ko-KR')+'명':'직접 지급 뱃지는 활성화만으로 지급되지 않아요.';
   const list=p('people');list.start=data.offset+1;list.replaceChildren();
   for(const row of data.items){
    const li=make('li'),name=make('strong',[row.name,row.number].filter(Boolean).join(' · '));
    const reasons=(row.reasons||[]).flatMap(key=>{const rule=snapshot.rules.find(x=>x.key===key);if(!rule||!catalog[key])return [];
     return [catalog[key].label+' '+(typeof rule.value==='number'?rule.value.toLocaleString('ko-KR'):rule.value)+(catalog[key].type==='number'?catalog[key].unit:'')];});
    li.append(name,make('div',reasons.join(' · '),'small text-secondary'));list.append(li);
   }
   p('review-prev').hidden=!data.offset;p('review-next').hidden=data.offset+data.items.length>=data.count;
   status(data.saved?'':snapshot.rules.length?'대상을 확인했어요. 초안으로 저장할 수 있습니다.':'');
  }
  const target=()=>page().receipt?{p_id:page().receipt.id,p_revision:page().receipt.revision}:{};
  function preview(offset=0,paging=false){
   let snapshot;try{snapshot=valid();}catch(e){status(e.message);return;}
   const proof=paging&&review?.review;if(!paging)clearReview();
   return request({p_action:'preview',...target(),p_fields:snapshot,p_offset:offset,...(proof?{p_review:proof}:{})},d=>showPreview(d,snapshot),clearReview);
  }
  function receipt(data,action){
   if(!data?.id||!data.fields)throw Error('NO_BADGE_RECEIPT');
   if(action==='create')s.pages.set('new',{fields:newFields(),receipt:null});
   s.id=data.id;s.pages.set(s.id,{receipt:data,fields:{...data.fields,rules:data.fields.rules.map(x=>({...x}))}});s.pending=null;
   hydrate();status(data.badge_id?'활성화했어요. '+(data.awarded_count?data.awarded_count.toLocaleString('ko-KR')+'명에게 지급했습니다.':''):'초안을 저장했어요. 활성화하려면 대상을 다시 확인해 주세요.');
   if(data.badge_id)void Promise.resolve(onActivated(scope)).catch(()=>{});
  }
  function mutate(args){
   if(!current()||busy)return;
   s.pending=args;
   request(args,d=>receipt(d,args.p_action),e=>{
    if(labels[e?.message]){s.pending=null;if(e.message.startsWith('BADGE_REVIEW'))clearReview();}
    else status('저장 결과를 아직 확인하지 못했어요.');
   });
  }
  function save(){
   if(!current()||busy||s.pending)return;
   let data;try{data=valid();}catch(e){status(e.message);return;}
   if(data.rules.length&&review?.local!==fingerprint(data)){status(labels.BADGE_REVIEW_REQUIRED);return;}
   const existing=page().receipt,newId=!existing&&root.crypto?.randomUUID?.();
   if(!existing&&!newId){status('보안 연결에서 다시 열어 주세요.');return;}
   mutate({p_action:existing?'save':'create',...target(),...(newId?{p_request:newId}:{}),p_fields:data,...(review?{p_review:review.review}:{})});
  }
  function check(){
   if(!s?.pending)return;const a=s.pending;
   request(a.p_action==='create'?{p_action:'request',p_request:a.p_request}:{p_action:'open',p_id:a.p_id},result=>{
    if(!result||(a.p_action==='activate'&&!result.badge_id)
       ||(a.p_action==='save'&&fingerprint(result.fields)!==fingerprint(a.p_fields))){status('아직 같은 요청의 결과를 확인하지 못했어요.');return;}
    receipt(result,a.p_action);
   });
  }
  function selectDraft(id){
   if(!current()||busy||s.pending)return;
   page().fields=read();
   if(id==='new'){s.id='new';hydrate();status('');return;}
   request({p_action:'open',p_id:id},data=>{
    const old=s.pages.get(id);s.id=id;
    if(old?.receipt?.revision===data.revision&&!data.badge_id)s.pages.set(id,{...old,receipt:data});
    else s.pages.set(id,{receipt:data,fields:{...data.fields,rules:data.fields.rules.map(x=>({...x}))}});
    hydrate();status('');
   });
  }
  function drafts(more=false){
   if(!current()||busy||s.pending)return;
   p('draft-list').hidden=false;const offset=more?s.draftOffset:0;
   if(!more)p('draft-items').replaceChildren();
   request({p_action:'list',p_offset:offset},data=>{
    if(!Array.isArray(data?.items))throw Error('BADGE_DRAFT_LIST_INVALID');
    for(const row of data.items)p('draft-items').append(makeButton(row.fields.name,()=>selectDraft(row.id)));
    s.draftOffset=offset+data.items.length;p('draft-more').hidden=!data.more;status(data.items.length?'':'저장한 초안이 없어요.');
   });
  }
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',e=>{if(current()&&e.target!==p('search'))changed();});
  p('search').addEventListener('input',()=>options());
  p('search').addEventListener('keydown',e=>{
   if(e.isComposing)return;
   if(e.key==='ArrowDown'){e.preventDefault();if(p('options').hidden)options();p('options').querySelector('button')?.focus();}
   if(e.key==='Enter'&&!p('options').hidden){e.preventDefault();if(!e.repeat)p('options').querySelector('button')?.click();}
   if(e.key==='Escape'&&!p('options').hidden){e.preventDefault();e.stopPropagation();options(false);}
  });
  p('add').onclick=()=>{options(p('options').hidden);if(!p('options').hidden)p('search').focus();};
  p('close').onclick=()=>invalidate(true);dialog.addEventListener('cancel',e=>{e.preventDefault();invalidate(true);});
  p('preview').onclick=()=>void preview();p('save').onclick=save;
  p('review-prev').onclick=()=>{if(review)void preview(Math.max(0,review.offset-50),true);};
  p('review-next').onclick=()=>{if(review)void preview(review.offset+50,true);};
  p('activate').onclick=()=>{
   if(!current()||s.pending||!review?.saved||review.local!==safeFingerprint())return;
   mutate({p_action:'activate',...target(),p_review:review.review});
  };
  p('check').onclick=check;p('repeat').onclick=()=>{if(s?.pending&&!busy)mutate(s.pending);};
  p('drafts').onclick=()=>drafts();p('draft-more').onclick=()=>drafts(true);p('new').onclick=()=>selectDraft('new');
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&dialog.open)invalidate();});
  const frame=root.frameElement;
  if(frame)new root.MutationObserver(()=>{if(dialog.open&&!current())invalidate();}).observe(frame,{attributes:true,attributeFilter:['hidden','class','style']});
  root.addEventListener('pagehide',()=>{invalidate();storage.clear();});
  return Object.freeze({open,invalidate,forget(){invalidate();storage.clear();}});
 }
 root.AdminBadgeRuleEditor=Object.freeze({version:'1.0.0',mount});
})(window);
