(function(root){
 'use strict';
 const messages={BADGE_SERIES_THRESHOLD_EXISTS:'이미 쓰는 단계 기준이 있어요. 다른 기준을 입력해 주세요.',
  BADGE_SERIES_GROUP_CHANGED:'다른 창에서 묶음이 바뀌었어요. 닫았다 다시 열어 최신 내용을 확인해 주세요.',
  BADGE_SERIES_EXISTING_STAGE_FIXED:'운영 중인 묶음의 공통 조건은 바꿀 수 없어요.',
  BADGE_SERIES_RULES_UNCONFIRMED:'확인되지 않은 조건이 있어요. 조건과 기록을 확인해 주세요.',
  BADGE_SERIES_REVIEW_CHANGED:'대상이 바뀌었어요. 다시 확인해 주세요.',
  BADGE_SERIES_REVIEW_REQUIRED:'저장 전 미리보기를 먼저 확인해 주세요.',
  BADGE_CONVERT_SOURCE_UNAVAILABLE:'이미 전환됐거나 이 뱃지는 전환할 수 없어요. 목록을 다시 확인해 주세요.',
  BADGE_CONVERT_ORIGINAL_FIXED:'기존 뱃지를 첫 단계에 그대로 두고 더 높은 기준을 추가해 주세요.'};
 const nf=new Intl.NumberFormat('ko-KR'),ranges={anniversary:150,capital:1e12,education:999999,extra_capital:999999,referral:999999,director_terms:999999};
 const metrics={capital_min:'최소 납입 출자금 (원)',tenure_days:'최소 가입 기간 (일)',join_since:'이 날짜부터 가입',join_until:'이 날짜까지 가입',
  referral_count:'추천 가입 승인 (명)',education_count:'교육 실제 출석 (회)',quiz_completed_days:'퀴즈 완료일 (일)',
  delegate_attendance_count:'대의원총회 실제 참석 (회)',poll_participation_count:'설문 참여 (건)'};
 const periods={all:'전체',this_year:'올해',last_year:'작년',last_12m:'최근 12개월'};
 const ops={ge:'이상',gt:'초과',eq:'같음',le:'이하',lt:'미만'};
 const contextual=k=>/_(count|days)$/.test(k)&&k!=='tenure_days';
 function targetValue(v,basis){
  const s=String(v??'').trim(),i=Number(s.replaceAll(',',''));
  return /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(s)&&Number.isSafeInteger(i)&&i<=ranges[basis]?i:null;
 }
 function mount({dialog,owner,api,apiTemplates,onAdded=()=>{},timeout=12000,delay=330,ask=s=>root.confirm(s)}){
  const doc=dialog.ownerDocument,p=k=>dialog.querySelector('[data-bsx="'+k+'"]');
  const name=p('name'),track=p('track'),steps=p('steps'),save=p('submit'),activate=p('activate'),remove=p('remove'),retry=p('retry');
  const pending=new Map(),drafts=new Map();
  let ctx=null,seq=0,timer=null,review=null,busy=false,needsReload=false,draft=null;
  const blank=()=>({id:null,revision:0,state:'draft',basis:'anniversary',title:'',steps:[],rules:[],combine:'all'});
  const row=()=>({id:root.crypto.randomUUID(),name:'',icon:'🏅',target:''});
  const scopeKey=(c,id)=>c+'|'+(id??'new');
  const clone=f=>({title:f.title,basis:f.basis,steps:f.steps.map(s=>({...s,byBasis:{...s.byBasis}})),rules:(f.rules||[]).map(r=>({...r})),combine:f.combine||'all'});
  const live=c=>c===ctx&&c?.owner===owner()&&dialog.open;
  const base=()=>ctx?.base, archived=()=>base()?.state==='archived';
  const converting=()=>base()?.state==='conversion';
  const message=s=>{p('status').textContent=s;};
  const trackUnit=t=>t==='anniversary'?'년':t==='capital'?'원':t==='referral'?'명':t?'회':'';
  const countOnly=()=>converting()||draft?.basis==='referral';
  function showBasisNote(){
   const note=draft.basis==='extra_capital'?'신청과 납입이 연결된 건만 한 번씩 세요.':
    draft.basis==='director_terms'?'이사 임기가 끊김 없이 이어진 경우만 세요. 2회는 첫 연임이에요.':'';
   p('basis-note').hidden=!note;p('basis-note').textContent=note;
  }
  const inputLocked=()=>!live(ctx)||busy||needsReload||archived()||pending.has(ctx?.key);
  function values(){
   if(!draft||!draft.title.trim()||!draft.steps.length||!Object.hasOwn(ranges,draft.basis))return null;
   const rules=[],ruleKeys=new Set();
   for(const r of draft.rules){
    const v=String(r.value??'').trim(),key=r.key,dated=key==='join_since'||key==='join_until',counted=contextual(key);
    const sig=counted?key+':'+r.period:key;
    if(!Object.hasOwn(metrics,key)||ruleKeys.has(sig)||!v)return null;
    if(dated?!/^\d{4}-\d\d-\d\d$/.test(v):! /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(v))return null;
    const value=dated?v:Number(v.replaceAll(',',''));
    if(!dated&&(!Number.isSafeInteger(value)||value>(counted?999999:key==='tenure_days'?36525:1e12)
     ||(value===0&&(!counted||(key!=='referral_count'&&r.op!=='gt')))))return null;
    ruleKeys.add(sig);rules.push(counted?{key,value,period:r.period,op:r.op}:{key,value});
   }
   rules.sort((a,b)=>(a.key+':'+(a.period||'')).localeCompare(b.key+':'+(b.period||''),'en'));
   const fields={title:draft.title.trim(),basis:draft.basis,steps:[],rules,combine:rules.length<2?'all':draft.combine},seen=new Set();
   for(const s of draft.steps){
    const target=targetValue(s.target,draft.basis);
    if(!s.name.trim()||!s.icon.trim()||!target||seen.has(target))return null;
    const former=base()?.state==='active'&&base().steps.find(x=>x.id===s.id);
    if(former&&target!==former.target)s.replacementId||=root.crypto.randomUUID();
    seen.add(target);fields.steps.push({id:former&&target!==former.target?s.replacementId:s.id,name:s.name.trim(),icon:s.icon.trim(),target,
     ...(s.description!==undefined?{description:s.description}:{})});
   }
   fields.steps.sort((a,b)=>a.target-b.target);
   const original=draft.steps.find(s=>s.original);
   if((converting()&&fields.steps.length<2)||(original&&fields.steps[0].id!==original.id))return null;
   return fields;
  }
  const keyed=f=>f?JSON.stringify(f):null;
  function baseKey(){
   const b=base();
   return b?.id?keyed({title:b.title,basis:b.basis,steps:b.steps.map(({id,name,icon,target,description})=>({id,name,icon,target,
    ...(description!==undefined?{description}:{})})),
    rules:(b.rules||[]).map(r=>contextual(r.key)?{key:r.key,value:r.value,period:r.period,op:r.op}:{key:r.key,value:r.value}),combine:b.combine||'all'}):null;
  }
  function additions(fields){return base()?.state==='active'&&fields?.steps.some(s=>!base().steps.some(old=>old.id===s.id));}
  function changes(fields){return additions(fields)||(base()?.state==='active'&&fields&&base().steps.some(s=>!fields.steps.some(now=>now.id===s.id)));}
  const status=()=>{const b=base();return b?.state==='active'?'운영 중':b?.state==='archived'?'운영 종료':b?.id?'초안':'';};
  function controls(){
   const disabled=inputLocked(),b=base(),f=values(),dirty=keyed(f)!==baseKey();
   name.disabled=disabled;track.disabled=disabled||b?.state==='active';p('add').disabled=disabled||draft?.steps.length>=60;
   for(const el of steps.querySelectorAll('input,textarea,button'))el.disabled=disabled||el.dataset.fixed==='true';
   const conditionLocked=disabled||b?.state==='active';
   for(const el of p('conditions').querySelectorAll('input,select,button'))el.disabled=conditionLocked;
   p('condition-add').hidden=b?.state==='active'||archived();
   p('condition-add').disabled=conditionLocked||draft?.rules.length>=8;
   p('combine').disabled=conditionLocked;
   p('rules-region').hidden=converting();
   p('changes').hidden=countOnly();p('changes').previousElementSibling.hidden=countOnly();
   save.hidden=archived();save.disabled=disabled||!f||!dirty||((converting()||changes(f))&&review?.key!==keyed(f));
   save.textContent=converting()?(review?.eligible>0?'전환하고 지급':'단계형으로 전환'):b?.state==='active'?(additions(f)?'저장하고 새 단계 지급':'변경 저장'):'초안 저장';
   activate.hidden=!b?.id||b.state!=='draft';
   activate.disabled=disabled||!f||dirty||review?.key!==keyed(f);
   remove.hidden=!b?.id||archived()||converting();remove.disabled=disabled;remove.textContent=b?.state==='active'?'운영 종료':'초안 삭제';
   p('check').hidden=!pending.has(ctx?.key);p('check').disabled=busy;
  }
  async function call(code,args={},source=api){
   let timeoutId;
   try{
    const r=await Promise.race([Promise.resolve().then(()=>source(code===null?args:{p_action:code,...args})),new Promise((_,reject)=>{
      timeoutId=root.setTimeout(()=>reject(Error('timeout')),timeout);
    })]);
    if(r?.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});
    return r?.data;
   }finally{root.clearTimeout(timeoutId);}
  }
  function args(c,fields){return {p_group:c.id,p_expected:c.base.revision,...(fields?{p_fields:fields}:{})};}
  function clearReview(){
   root.clearTimeout(timer);timer=null;seq++;review=null;
   p('eligible').textContent=p('changes').textContent='—';p('review-note').textContent='';
  }
  function errText(e){
   if(e?.code==='23505')return '같은 이름이나 기준의 배지가 이미 있어요.';
   if(e?.code==='42501')return '단계형 배지 관리 권한을 확인해 주세요.';
   return messages[e?.message]||'처리 결과를 확인하지 못했어요.';
  }
  function preview(){
   clearReview();
   if(!live(ctx))return;
   if(pending.has(ctx.key)){controls();return;}
   const f=values(),fp=keyed(f),b=base();
   const should=!!b?.id&&(converting()||changes(f)||(b.state==='draft'&&fp===baseKey()));
   if(!f||!should||inputLocked()){controls();return;}
   const current=ctx,index=seq,request=root.crypto.randomUUID();
   p('review-note').textContent='대상을 확인하고 있어요.';controls();
   timer=root.setTimeout(async()=>{
    const valid=()=>live(current)&&index===seq;
    try{
     const r=await call('preview',{...args(current,f),p_request:request});
     if(!valid())return;
     if(typeof r?.review!=='string'||!Number.isSafeInteger(r.eligible)||(!countOnly()&&!Number.isSafeInteger(r.representative)))throw Error('preview');
     if(!(r.pending>0))review={key:fp,token:r.review,request,eligible:r.eligible};
     p('eligible').textContent=nf.format(r.eligible)+'명';
     if(!countOnly())p('changes').textContent=nf.format(r.representative)+'명';
     p('review-note').textContent=r.pending>0?'판정을 확인하지 못한 조합원이 있어요.':'';
    }catch(e){if(valid()){message(errText(e));p('review-note').textContent='';retry.hidden=false;}}
    if(valid())controls();
   },delay);
  }
  function edit(){if(inputLocked())return;message('');retry.hidden=true;preview();}
  function renderSteps(){
   const b=base();
   steps.replaceChildren(...draft.steps.map((s,i)=>{
    const wrap=doc.createElement('div');wrap.className='bsx-stage';wrap.dataset.id=s.id;
    for(const [field,label] of [['name','이름'],['icon','아이콘'],['target','기준'+(draft.basis?' ('+trackUnit(draft.basis)+')':'')]]){
     const box=doc.createElement('label'),x=doc.createElement('input');
     box.textContent=(i+1)+'단계 '+label;x.className='form-control form-control-sm';x.value=s[field];
     if(s.original&&(field!=='target'||!converting()))x.dataset.fixed='true';
     if(field==='target'){x.inputMode='numeric';}
     else x.maxLength=field==='name'?100:40;
     x.addEventListener('input',()=>{if(!inputLocked()){s[field]=x.value;edit();}});
     box.append(x);wrap.append(box);
    }
    const del=doc.createElement('button');del.type='button';del.className='btn btn-sm btn-outline-secondary';
    del.textContent=b.state==='active'?'단계 종료':'삭제';del.setAttribute('aria-label',(i+1)+'단계 '+(b.state==='active'?'종료':'삭제'));
    del.hidden=s.original||archived()||(b.state==='active'&&draft.steps.length===1);
    del.onclick=()=>{if(inputLocked()||del.hidden)return;draft.steps=draft.steps.filter(x=>x.id!==s.id);renderSteps();edit();
     (steps.children[Math.min(i,draft.steps.length-1)]?.querySelector('input')||p('add')).focus({preventScroll:true});};
    const actions=doc.createElement('div');actions.className='d-flex gap-1 flex-wrap';actions.append(del);
    const insert=doc.createElement('button');insert.type='button';insert.className=del.className;insert.textContent='아래에 추가';
    insert.setAttribute('aria-label',(i+1)+'단계 아래에 추가');
    insert.hidden=i===draft.steps.length-1||archived();insert.onclick=()=>addStage(i+1,false);
    actions.append(insert);wrap.append(actions);
    const details=doc.createElement('details'),summary=doc.createElement('summary'),description=doc.createElement('textarea');
    details.className='small';details.style.gridColumn='1 / -1';summary.textContent=(i+1)+'단계 설명';details.append(summary);
    if(s.original)description.dataset.fixed='true';
    description.className='form-control form-control-sm mt-1';description.rows=2;description.maxLength=500;
    description.setAttribute('aria-label',summary.textContent);description.value=s.description||'';
    description.oninput=()=>{if(!inputLocked()){s.description=description.value;edit();}};details.append(description);wrap.append(details);return wrap;
   }));
  }
  function selectOptions(values,label,current){
   const s=doc.createElement('select');s.className='form-select form-select-sm';s.setAttribute('aria-label',label);
   for(const [v,label] of Object.entries(values)){const o=doc.createElement('option');o.textContent=label;o.value=v;s.append(o);}s.value=current;return s;
  }
  function renderRules(focusIndex=-1){
   const box=p('conditions'),b=base();
   box.replaceChildren(...draft.rules.map((r,i)=>{
    const div=doc.createElement('div');div.className='bsx-condition';
    const select=selectOptions({'':'조건을 고르세요',...metrics},(i+1)+'번 추가 조건',r.key);
    select.onchange=()=>{if(inputLocked()||b.state==='active')return;draft.rules[i]={key:select.value,value:'',period:'all',op:'ge'};
     renderRules(i);edit();};div.append(select);
    if(!r.key){const del=doc.createElement('button');del.type='button';del.className='btn btn-sm btn-outline-secondary';del.textContent='삭제';del.onclick=()=>deleteRule(i);div.append(del);return div;}
    if(contextual(r.key)){
     const span=selectOptions(periods,'집계 기간',r.period),op=selectOptions(r.key==='referral_count'?ops:{ge:'이상',gt:'초과'},'비교 방식',r.op);
     span.onchange=()=>{r.period=span.value;edit();};op.onchange=()=>{r.op=op.value;edit();};div.append(span,op);
    }
    const v=doc.createElement('input');v.className='form-control form-control-sm';v.setAttribute('aria-label',metrics[r.key]+' 기준값');
    if(r.key.startsWith('join_')){v.type='date';v.min='1900-01-01';v.max='2100-12-31';}else v.inputMode='numeric';
    v.value=r.value;v.oninput=()=>{r.value=v.value;edit();};div.append(v);
    const del=doc.createElement('button');del.type='button';del.className='btn btn-sm btn-outline-secondary';del.textContent='삭제';
    del.hidden=b.state==='active'||archived();del.onclick=()=>deleteRule(i);div.append(del);return div;
   }));
   p('combine').hidden=draft.rules.length<2;p('combine').value=draft.combine;controls();
   if(focusIndex>=0)box.children[focusIndex]?.querySelector('select')?.focus({preventScroll:true});
  }
  function deleteRule(i){
   if(inputLocked()||base().state==='active')return;
   draft.rules.splice(i,1);renderRules();edit();p('condition-add').focus({preventScroll:true});
  }
  function render(){name.value=draft.title;track.value=draft.basis;const state=status();
   p('heading').textContent=converting()?'단계형으로 전환':(base().id?'단계형 배지':'단계형 배지 만들기')+(state?' · '+state:'');
   showBasisNote();
   renderSteps();renderRules();
  }
  function stash(){
   if(!ctx?.base||!draft||ctx.importing)return;
   drafts.set(ctx.key,{revision:ctx.base.revision,copy:clone(draft)});
  }
  function hydrate(b){
   ctx.base=b;ctx.id=b.id;ctx.key=scopeKey(ctx.owner,b.id)+(b.id?'':ctx.draftSuffix||'');
   const old=drafts.get(ctx.key);draft=old?.revision===b.revision?clone(old.copy):clone(b);
   if(b.state==='conversion'){
    draft.steps[0]={...b.steps[0],target:draft.steps[0]?.target??'',byBasis:{...draft.steps[0]?.byBasis}};
    if(!old&&draft.steps.length===1)draft.steps.push(row());
   }
   if(!b.id&&!draft.steps.length)draft.steps.push(row());
   render();preview();
  }
  async function load(c){
   if(!live(c))return;
   if(!c.id){busy=false;needsReload=false;hydrate(blank());return;}
   busy=true;needsReload=false;controls();
   try{
    const b=await call('open',{p_group:c.id});
    if(!live(c))return;
    if(!b?.id||!Array.isArray(b.steps))throw Error('BADGE_SERIES_GROUP_CHANGED');
    busy=false;hydrate(b);
   }catch(e){if(live(c)){busy=false;needsReload=true;retry.hidden=false;message(errText(e));controls();}}
  }
  async function finish(c,original,receipt){
   if(!(receipt?.id||receipt?.removed))return false;
   pending.delete(original);drafts.delete(original);
   if(live(c)){
    busy=false;needsReload=false;
    if(receipt.removed){close(true);return void Promise.resolve(onAdded(c.owner)).catch(()=>{})||true;}
    hydrate(receipt);message('');
    void Promise.resolve(onAdded(c.owner)).catch(()=>{});
   }
   return true;
  }
  async function mutate(action){
   if(inputLocked())return;
   const c=ctx,b=base(),f=values(),fp=keyed(f),baseFP=baseKey();
   if(action==='save'&&(!f||fp===baseFP))return;
   if(action==='activate'&&(!f||b.state!=='draft'||fp!==baseFP))return;
   if(action==='archive'&&(b.state!=='active'||!ask('새 지급과 다음 목표 표시를 멈춥니다. 이미 받은 배지는 남습니다. 운영을 종료할까요?')))return;
   if(action==='discard'&&(!b.id||b.state!=='draft'||!ask('저장한 이 묶음 초안을 삭제할까요?')))return;
   if(!live(c)||busy||pending.has(c.key))return;
   const checks=action==='activate'||(action==='save'&&(converting()||changes(f)));
   if(checks&&review?.key!==fp)return;
   if(action==='save'&&changes(f)&&b.steps.some(s=>!f.steps.some(t=>s.id===t.id))
    &&!ask('종료하거나 기준을 바꾼 단계의 기존 지급 내역은 그대로 남습니다. 변경할까요?'))return;
   const request=checks?review.request:root.crypto.randomUUID(),proof=checks?review.token:null,original=c.key;
   stash();clearReview();pending.set(original,request);busy=true;controls();message('저장 중…');
   try{
    const response=await call(action,{...args(c,['save','activate'].includes(action)?f:null),p_request:request,...(proof?{p_review:proof}:{})});
    if(await finish(c,original,response))return;
    throw Error('unknown');
   }catch(e){
    const definite=['PT409','PT404','22023','23505','42501','40001','40P01','55P03'].includes(e?.code);
    if(definite)pending.delete(original);
    if(!live(c))return;
    busy=false;message(definite?errText(e):'저장 결과를 먼저 확인해 주세요.');retry.hidden=!definite;controls();
   }
  }
  async function check(){
   const c=ctx,original=c?.key,request=pending.get(original);
   if(!live(c)||busy||!request)return;
   busy=true;controls();
   try{if(await finish(c,original,await call('request',{p_request:request})))return;
    if(live(c))message('아직 저장 결과를 확인하지 못했어요. 다시 확인해 주세요.');
   }catch{if(live(c))message('아직 저장 결과를 확인하지 못했어요. 다시 확인해 주세요.');}
   finally{if(live(c)){busy=false;controls();}}
  }
  function close(restore=false){
   const c=ctx;stash();clearReview();ctx=null;draft=null;
   if(dialog.open)dialog.close();
   if(restore&&c?.owner===owner()&&c.trigger?.isConnected&&doc.activeElement===doc.body)c.trigger.focus({preventScroll:true});
  }
  name.addEventListener('input',()=>{if(!inputLocked()){draft.title=name.value;edit();}});
  track.addEventListener('change',()=>{if(!inputLocked()){
   const from=draft.basis,to=track.value;
   if(from===to)return;
   if(converting())for(const s of draft.steps){
    s.byBasis={...s.byBasis,[from]:s.target};s.target=s.byBasis[to]??'';
   }
   draft.basis=to;showBasisNote();renderSteps();edit();
  }});
  function addStage(at,end){if(inputLocked()||draft.steps.length>=60)return;
   const s=row();if(end&&draft.basis==='anniversary'){
    const n=Math.max(0,...draft.steps.map(x=>targetValue(x.target,'anniversary')??0))+1;
    if(n<=150){s.target=n;s.name=n+'주년';}
   }
   draft.steps.splice(at,0,s);renderSteps();edit();steps.children[at]?.querySelector('input')?.focus();
  }
  p('add').onclick=()=>addStage(draft.steps.length,true);
  p('condition-add').onclick=()=>{if(!inputLocked()&&base().state!=='active'&&draft.rules.length<8){
   draft.rules.push({key:'',value:''});renderRules(draft.rules.length-1);edit();
  }};
  p('combine').onchange=()=>{if(!inputLocked()&&base().state!=='active'){draft.combine=p('combine').value;edit();}};
  p('close').onclick=()=>close(true);dialog.addEventListener('cancel',e=>{e.preventDefault();close(true);});
  save.onclick=()=>void mutate('save');activate.onclick=()=>void mutate('activate');
  remove.onclick=()=>void mutate(base().state==='active'?'archive':'discard');p('check').onclick=()=>void check();
  async function template(c,key=null){
   if(!live(c)||!c.importing||busy||typeof apiTemplates!=='function')return;
   busy=true;c.templateKey=key;retry.hidden=true;message('묶음을 불러오는 중…');
   const list=p('templates-items');for(const b of list.querySelectorAll('button'))b.disabled=true;
   try{
    const r=await call(null,{p_key:key},apiTemplates);
    if(!live(c)||!c.importing)return;
    if(key){
     const f=r?.fields;
     if(!f||!Object.hasOwn(ranges,f.basis)||!Array.isArray(f.steps)||!f.steps.length)throw Error('template');
     const suffix='|template|'+key;c.draftSuffix=suffix;c.importing=false;
     const previous=drafts.get(scopeKey(c.owner,null)+suffix);
     hydrate(blank());
     if(!previous)draft=clone({...f,steps:f.steps.map(s=>({...s,id:root.crypto.randomUUID()}))});
     p('templates').hidden=true;p('editor').hidden=p('actions').hidden=false;
     busy=false;message(pending.has(c.key)?'저장 결과를 먼저 확인해 주세요.':'');render();preview();name.focus({preventScroll:true});
    }else{
     if(!Array.isArray(r?.items))throw Error('template');
     list.replaceChildren(...r.items.map(t=>{
      const b=doc.createElement('button');b.type='button';b.className='list-group-item list-group-item-action';
      b.textContent=t.title+' · '+t.count+'단계 · '+t.source_name;b.onclick=()=>void template(c,t.template_key);return b;
     }));message(r.items.length?'':'불러올 수 있는 단계형 배지가 없어요.');
    }
   }catch(e){if(live(c)){message(e?.code==='42501'?errText(e):'묶음을 불러오지 못했어요.');retry.hidden=false;}}
   finally{if(live(c)){busy=false;for(const b of list.querySelectorAll('button'))b.disabled=false;}}
  }
  retry.onclick=()=>{if(ctx?.importing){void template(ctx,ctx.templateKey);return;}if(needsReload){retry.hidden=true;void load(ctx);}else edit();};
  return Object.freeze({open(trigger,id=null,importing=false){
   const o=owner();if(!o||dialog.open)return false;
   ctx={owner:o,trigger,id,key:scopeKey(o,id),base:blank(),importing};draft=clone(blank());needsReload=false;busy=false;
   retry.hidden=true;message('');dialog.showModal();render();p('heading').focus({preventScroll:true});
   p('templates').hidden=!importing;p('editor').hidden=p('actions').hidden=importing;
   if(importing){p('heading').textContent='단계형 배지 불러오기';p('templates-items').replaceChildren();void template(ctx);return true;}
   const c=ctx;void load(c).then(()=>{if(live(c)&&pending.has(c.key))message('저장 결과를 먼저 확인해 주세요.');});return true;
  },invalidate:close});
 }
 root.AdminBadgeSeriesGroupEditor=Object.freeze({version:'1.3.0',mount});
})(typeof globalThis==='object'?globalThis:this);
