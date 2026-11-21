(function(root){
 'use strict';
 const messages={BADGE_SERIES_THRESHOLD_EXISTS:'이미 쓰는 단계 기준이 있어요. 다른 기준을 입력해 주세요.',
  BADGE_SERIES_GROUP_CHANGED:'다른 창에서 묶음이 바뀌었어요. 닫았다 다시 열어 최신 내용을 확인해 주세요.',
  BADGE_SERIES_EXISTING_STAGE_FIXED:'이미 운영한 단계의 기준과 순서는 유지해 주세요.',
  BADGE_SERIES_REVIEW_CHANGED:'대상이 바뀌었어요. 다시 확인해 주세요.',
  BADGE_SERIES_REVIEW_REQUIRED:'저장 전 미리보기를 먼저 확인해 주세요.'};
 const nf=new Intl.NumberFormat('ko-KR'),ranges={anniversary:150,capital:1e12};
 function targetValue(v,basis){
  const s=String(v??'').trim(),i=Number(s.replaceAll(',',''));
  return /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(s)&&Number.isSafeInteger(i)&&i<=ranges[basis]?i:null;
 }
 function mount({dialog,owner,api,onAdded=()=>{},timeout=12000,delay=330,ask=s=>root.confirm(s)}){
  const doc=dialog.ownerDocument,p=k=>dialog.querySelector('[data-bsx="'+k+'"]');
  const name=p('name'),track=p('track'),steps=p('steps'),save=p('submit'),activate=p('activate'),remove=p('remove'),retry=p('retry');
  const pending=new Map(),drafts=new Map();
  let ctx=null,seq=0,timer=null,review=null,busy=false,needsReload=false,draft=null;
  const blank=()=>({id:null,revision:0,state:'draft',basis:'anniversary',title:'',steps:[]});
  const row=()=>({id:root.crypto.randomUUID(),name:'',icon:'🏅',target:''});
  const scopeKey=(c,id)=>c+'|'+(id??'new');
  const clone=f=>({title:f.title,basis:f.basis,steps:f.steps.map(s=>({...s}))});
  const live=c=>c===ctx&&c?.owner===owner()&&dialog.open;
  const base=()=>ctx?.base, archived=()=>base()?.state==='archived';
  const message=s=>{p('status').textContent=s;};
  const trackUnit=t=>t==='anniversary'?'년':'원';
  const inputLocked=()=>!live(ctx)||busy||needsReload||archived()||pending.has(ctx?.key);
  function values(){
   if(!draft||!draft.title.trim()||!draft.steps.length)return null;
   const fields={title:draft.title.trim(),basis:draft.basis,steps:[]},seen=new Set();
   for(const s of draft.steps){
    const target=targetValue(s.target,draft.basis);
    if(!s.name.trim()||!s.icon.trim()||!target||seen.has(target))return null;
    seen.add(target);fields.steps.push({id:s.id,name:s.name.trim(),icon:s.icon.trim(),target});
   }
   fields.steps.sort((a,b)=>a.target-b.target);
   return fields;
  }
  const keyed=f=>f?JSON.stringify(f):null;
  function baseKey(){
   const b=base();
   return b?.id?keyed({title:b.title,basis:b.basis,steps:b.steps.map(({id,name,icon,target})=>({id,name,icon,target}))}):null;
  }
  function additions(fields){return base()?.state==='active'&&fields?.steps.some(s=>!base().steps.some(old=>old.id===s.id));}
  const status=()=>{const b=base();return b?.state==='active'?'운영 중':b?.state==='archived'?'보관됨':b?.id?'초안':'';};
  function controls(){
   const disabled=inputLocked(),b=base(),f=values(),dirty=keyed(f)!==baseKey();
   name.disabled=disabled;track.disabled=disabled||b?.state==='active';p('add').disabled=disabled||draft?.steps.length>=60;
   for(const el of steps.querySelectorAll('input,button'))el.disabled=disabled||el.dataset.fixed==='true';
   save.hidden=archived();save.disabled=disabled||!f||!dirty||(additions(f)&&review?.key!==keyed(f));
   save.textContent=b?.state==='active'?(additions(f)?'저장하고 새 단계 지급':'변경 저장'):'초안 저장';
   activate.hidden=!b?.id||b.state!=='draft';
   activate.disabled=disabled||!f||dirty||review?.key!==keyed(f);
   remove.hidden=!b?.id||archived();remove.disabled=disabled;remove.textContent=b?.state==='active'?'묶음 보관':'초안 삭제';
   p('check').hidden=!pending.has(ctx?.key);p('check').disabled=busy;
  }
  async function call(code,args={}){
   let timeoutId;
   try{
    const r=await Promise.race([Promise.resolve().then(()=>api({p_action:code,...args})),new Promise((_,reject)=>{
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
   const should=!!b?.id&&(additions(f)||(b.state==='draft'&&fp===baseKey()));
   if(!f||!should||inputLocked()){controls();return;}
   const current=ctx,index=seq,request=root.crypto.randomUUID();
   p('review-note').textContent='대상을 확인하고 있어요.';controls();
   timer=root.setTimeout(async()=>{
    const valid=()=>live(current)&&index===seq;
    try{
     const r=await call('preview',{...args(current,f),p_request:request});
     if(!valid())return;
     if(typeof r?.review!=='string'||!Number.isSafeInteger(r.eligible)||!Number.isSafeInteger(r.representative))throw Error('preview');
     review={key:fp,token:r.review,request};
     p('eligible').textContent=nf.format(r.eligible)+'명';
     p('changes').textContent=nf.format(r.representative)+'명';
     p('review-note').textContent='';
    }catch(e){if(valid()){message(errText(e));p('review-note').textContent='';retry.hidden=false;}}
    if(valid())controls();
   },delay);
  }
  function edit(){if(inputLocked())return;message('');retry.hidden=true;preview();}
  function renderSteps(){
   const b=base();
   steps.replaceChildren(...draft.steps.map((s,i)=>{
    const wrap=doc.createElement('div');wrap.className='bsx-stage';wrap.dataset.id=s.id;
    const fixed=b.state==='active'&&b.steps.some(k=>k.id===s.id);
    for(const [field,label] of [['name','이름'],['icon','아이콘'],['target','기준 ('+trackUnit(draft.basis)+')']]){
     const box=doc.createElement('label'),x=doc.createElement('input');
     box.textContent=(i+1)+'단계 '+label;x.className='form-control form-control-sm';x.value=s[field];
     if(field==='target'){x.inputMode='numeric';x.dataset.fixed=String(fixed);}
     else x.maxLength=field==='name'?100:40;
     x.addEventListener('input',()=>{if(!inputLocked()){s[field]=x.value;edit();}});
     box.append(x);wrap.append(box);
    }
    const del=doc.createElement('button');del.type='button';del.className='btn btn-sm btn-outline-secondary';
    del.textContent='빼기';del.setAttribute('aria-label',(i+1)+'단계 빼기');del.hidden=fixed||archived();
    del.onclick=()=>{if(inputLocked()||fixed)return;draft.steps=draft.steps.filter(x=>x.id!==s.id);renderSteps();edit();p('add').focus();};
    wrap.append(del);return wrap;
   }));
  }
  function render(){name.value=draft.title;track.value=draft.basis;const state=status();
   p('heading').textContent=(base().id?'단계형 배지':'단계형 배지 만들기')+(state?' · '+state:'');
   renderSteps();controls();
  }
  function stash(){
   if(!ctx?.base||!draft)return;
   drafts.set(ctx.key,{revision:ctx.base.revision,copy:clone(draft)});
  }
  function hydrate(b){
   ctx.base=b;ctx.id=b.id;ctx.key=scopeKey(ctx.owner,b.id);
   const old=drafts.get(ctx.key);draft=old?.revision===b.revision?clone(old.copy):clone(b);
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
    busy=false;
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
   if(action==='archive'&&(b.state!=='active'||!ask('새 지급과 다음 목표 표시를 멈춥니다. 이미 받은 배지는 남습니다. 묶음을 보관할까요?')))return;
   if(action==='discard'&&(!b.id||b.state!=='draft'||!ask('저장한 이 묶음 초안을 삭제할까요?')))return;
   if(!live(c)||busy||pending.has(c.key))return;
   const checks=action==='activate'||(action==='save'&&additions(f));
   if(checks&&review?.key!==fp)return;
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
   draft.basis=track.value;renderSteps();edit();
  }});
  p('add').onclick=()=>{if(inputLocked()||draft.steps.length>=60)return;
   const s=row();if(draft.basis==='anniversary'){
    const n=Math.max(0,...draft.steps.map(x=>targetValue(x.target,'anniversary')??0))+1;
    if(n<=150){s.target=n;s.name=n+'주년';}
   }
   draft.steps.push(s);renderSteps();edit();steps.lastElementChild?.querySelector('input')?.focus();
  };
  p('close').onclick=()=>close(true);dialog.addEventListener('cancel',e=>{e.preventDefault();close(true);});
  save.onclick=()=>void mutate('save');activate.onclick=()=>void mutate('activate');
  remove.onclick=()=>void mutate(base().state==='active'?'archive':'discard');p('check').onclick=()=>void check();
  retry.onclick=()=>{if(needsReload){retry.hidden=true;void load(ctx);}else edit();};
  return Object.freeze({open(trigger,id=null){
   const o=owner();if(!o||dialog.open)return false;
   ctx={owner:o,trigger,id,key:scopeKey(o,id),base:blank()};draft=clone(blank());needsReload=false;
   retry.hidden=true;message('');dialog.showModal();render();p('heading').focus({preventScroll:true});
   const c=ctx;void load(c).then(()=>{if(live(c)&&pending.has(c.key))message('저장 결과를 먼저 확인해 주세요.');});return true;
  },invalidate:close});
 }
 root.AdminBadgeSeriesGroupEditor=Object.freeze({version:'1.0.0',mount});
})(typeof globalThis==='object'?globalThis:this);
