(function(root){
 'use strict';
 const version='1.0.0', labels={anniversary:'가입 기념',capital:'납입 출자금'};
 function normalizeTarget(value,track){
  const v=String(value??'').trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(v))return null;
  const n=Number(v.replaceAll(',',''));
  return Number.isSafeInteger(n)&&n>0&&n<=(track==='anniversary'?150:1e12)?n:null;
 }
 function mount({dialog,owner,api,onAdded=()=>{},timeout=12000,delay=350}){
  const get=id=>dialog.querySelector('[data-bsx="'+id+'"]'),sel=get('track'),name=get('name'),icon=get('icon'),target=get('target');
  const submit=get('submit'),check=get('check'),close=get('close'),status=get('status'),number=get('eligible'),changes=get('changes');
  const roster=get('steps'),retry=get('retry'),add=get('new'),unit=get('unit');
  const drafts=new Map(),pending=new Map();
  let key='',launcher=null,series=[],preview=null,timer=0,sequence=0,busy=false,previousTrack='',listFailed=false;
  const nf=new Intl.NumberFormat('ko-KR');
  function valid(id=key){return !!id&&id===key&&id===owner()&&dialog.open;}
  function bump(){clearTimeout(timer);preview=null;return ++sequence;}
  function msg(s){status.textContent=s;}
  async function call(operation,args={}){
   let expiry;
   try{
    const res=await Promise.race([Promise.resolve().then(()=>api({p_action:operation,...args})),new Promise((_,reject)=>{
     expiry=setTimeout(()=>reject(new Error('BADGE_SERIES_TIMEOUT')),timeout);
    })]);
    if(res?.error)throw Object.assign(new Error(res.error.message),{code:res.error.code});
    return res?.data;
   }finally{clearTimeout(expiry);}
  }
  const byTrack=()=>series.find(s=>s.track===sel.value);
  const current=()=>({name:name.value.trim(),icon:icon.value.trim(),target:normalizeTarget(target.value,sel.value)});
  function capture(){if(key&&labels[sel.value])drafts.set(key+'|'+sel.value,{name:name.value,icon:icon.value,target:target.value,editing:!add.hidden});}
  function restore(){
   const d=drafts.get(key+'|'+sel.value);
   name.value=d?.name??'';icon.value=d?.icon??'🏅';target.value=d?.target??'';
   add.hidden=!(d?.editing&&byTrack());
   get('add').hidden=!byTrack()||!add.hidden;
   unit.textContent=sel.value==='anniversary'?'년':'원';
   target.inputMode='numeric';
   get('basis').textContent=sel.value==='anniversary'?'확인된 가입일 기준 · 가입 기간':'현재 납입 출자금 기준 · 이상';
  }
  function rows(value=null){
   const items=[...(byTrack()?.items??[])];
   if(value&& !items.some(x=>x.target===value.target))items.push({...value,editing:true});
   items.sort((a,b)=>a.target-b.target);
   const doc=dialog.ownerDocument;
   roster.replaceChildren(...items.map(x=>{
    const tr=doc.createElement('tr');
    for(const text of [x.icon,x.name,nf.format(x.target)+' '+unit.textContent,x.editing?'추가할 단계':'']){
     const cell=doc.createElement('td');cell.textContent=text??'';tr.append(cell);
    }
    if(x.editing)tr.classList.add('table-success');
    return tr;
   }));
  }
  function controls(){
   const p=pending.get(key);
   for(const node of [sel,name,icon,target,get('add')])node.disabled=busy||!!p;
   submit.disabled=busy||!!p||!preview;check.hidden=!p;check.disabled=busy;
   close.disabled=false;
  }
  function failureText(e){
   if(/THRESHOLD_EXISTS/.test(e?.message??''))return '이 기준의 배지가 이미 있어요. 다른 기준을 입력해 주세요.';
   if(/REVIEW_CHANGED|REVIEW_REQUIRED/.test(e?.message??''))return '대상이 바뀌었어요. 미리보기를 다시 확인해 주세요.';
   if(e?.code==='42501')return '이 단계형 배지를 편집할 권한을 확인해 주세요.';
   return '불러오지 못했어요. 다시 확인해 주세요.';
  }
  function rerender(){
   const i=bump(),id=key,f=current(),t=sel.value;
   number.textContent=changes.textContent='—';retry.hidden=true;
   rows(!add.hidden&&f.name&&f.target?f:null);controls();
   if(pending.has(id)){msg('저장 결과를 다시 확인해 주세요.');return;}
   if(!byTrack()||add.hidden){msg('');return;}
   if(!f.target||!f.name||!f.icon){msg('이름·아이콘·단계 기준을 입력해 주세요.');return;}
   if(byTrack().items.some(x=>x.target===f.target)){msg('이미 있는 단계 기준이에요.');return;}
   const request=root.crypto.randomUUID();
   msg('대상을 확인하고 있어요…');
   timer=setTimeout(async()=>{
    try{
     const r=await call('preview',{p_track:t,p_request:request,p_fields:f});
     if(!valid(id)||i!==sequence)return;
     if(typeof r?.review!=='string'||!Number.isSafeInteger(r.eligible)||!Number.isSafeInteger(r.representative))throw Error('BADGE_SERIES_PREVIEW_INVALID');
     preview={request,review:r.review,t,f};number.textContent=nf.format(r.eligible)+'명';changes.textContent=nf.format(r.representative)+'명';
     msg(r.unconfirmed?'가입일 확인이 필요한 '+nf.format(r.unconfirmed)+'명은 이번 지급에서 제외돼요.':'');
    }catch(err){if(!valid(id)||i!==sequence)return;msg(failureText(err));retry.hidden=false;}
    controls();
   },delay);
  }
  async function load(){
   const i=bump(),id=key,old=sel.value;
   busy=true;listFailed=false;controls();retry.hidden=true;msg('단계를 불러오는 중입니다…');
   try{
    const r=await call('list');
    if(!valid(id)||i!==sequence)return;
    if(!Array.isArray(r?.series))throw Error('BADGE_SERIES_LIST_INVALID');
    series=r.series.filter(s=>Object.hasOwn(labels,s.track)&&Array.isArray(s.items));
    const doc=dialog.ownerDocument;
    sel.replaceChildren(...series.map(s=>{const opt=doc.createElement('option');opt.value=s.track;opt.textContent=labels[s.track];return opt;}));
    const p=pending.get(id);
    if(series.some(s=>s.track===(p?.t||old)))sel.value=p?.t||old;
    busy=false;previousTrack=sel.value;restore();
    if(!series.length){rows();controls();msg('연결할 수 있는 기존 단계형 배지가 없어요.');return;}
    rerender();
   }catch(err){
    if(!valid(id)||i!==sequence)return;
    busy=false;listFailed=true;msg(failureText(err));retry.hidden=false;controls();
   }
  }
  async function finish(id,p,r){
   if(!r?.id)return false;
   pending.delete(id);drafts.delete(id+'|'+p.t);
   if(valid(id)){
    busy=true;controls();
    try{await onAdded(id);}catch{}
    if(valid(id)){
     await load();
     if(valid(id)&&!pending.has(id)&&!listFailed)msg('단계를 추가했어요. '+nf.format(r.awarded||0)+'명에게 이 단계만 지급했습니다.');
    }
   }
   return true;
  }
  async function insert(){
   const id=key,p=preview;
   if(!p||busy||!valid()||pending.has(id))return;
   capture();pending.set(id,p);bump();busy=true;controls();msg('단계를 저장하는 중입니다…');
   try{
    const r=await call('insert',{p_track:p.t,p_request:p.request,p_fields:p.f,p_review:p.review});
    if(await finish(id,p,r))return;
    throw Error('BADGE_SERIES_RESULT_UNKNOWN');
   }catch(err){
    const definite=['PT409','22023','42501','40001','40P01','55P03'].includes(err?.code);
    if(definite)pending.delete(id);
    if(!valid(id))return;
    busy=false;controls();
    if(definite){msg(failureText(err));retry.hidden=false;}
    else msg('저장 결과를 확인하지 못했어요. 다시 저장하지 않고 결과만 확인할 수 있어요.');
   }
  }
  async function checkResult(){
   const id=key,p=pending.get(id);
   if(!p||busy||!valid())return;
   busy=true;controls();msg('저장 결과를 확인하는 중입니다…');
   try{
    const r=await call('request',{p_request:p.request});
    if(await finish(id,p,r))return;
    if(valid(id))msg('아직 저장 결과가 확인되지 않았어요. 잠시 후 다시 확인해 주세요.');
   }catch{if(valid(id))msg('저장 결과를 조회하지 못했어요. 다시 확인해 주세요.');}
   finally{if(valid(id)){busy=false;controls();}}
  }
  function invalidate(restoreFocus=false){
   capture();bump();key='';busy=false;
   const focus=launcher;launcher=null;
   if(dialog.open)dialog.close();
   if(restoreFocus&&focus?.isConnected&&(!dialog.ownerDocument.activeElement||dialog.ownerDocument.activeElement===dialog.ownerDocument.body))
    focus.focus({preventScroll:true});
  }
  sel.addEventListener('change',()=>{
   // Capture the old group's exact inputs under its own key.
   const next=sel.value;sel.value=previousTrack;capture();sel.value=next;previousTrack=next;
   restore();rerender();
  });
  for(const f of [name,icon,target])f.addEventListener('input',()=>{capture();rerender();});
  get('add').addEventListener('click',()=>{
   if(!valid()||busy||pending.has(key))return;
   add.hidden=false;get('add').hidden=true;
   if(sel.value==='anniversary'&&!target.value){
    const latest=byTrack()?.items.at(-1)?.target;
    if(latest){target.value=String(latest+1);if(!name.value)name.value=(latest+1)+'주년';}
   }
   capture();rerender();name.focus();
  });
  retry.addEventListener('click',()=>{if(valid())listFailed||!series.length?void load():rerender();});
  submit.addEventListener('click',()=>void insert());
  check.addEventListener('click',()=>void checkResult());
  close.addEventListener('click',()=>invalidate(true));
  dialog.addEventListener('cancel',e=>{e.preventDefault();invalidate(true);});
  return {open(trigger){
   if(dialog.open||!owner())return false;
   key=owner();launcher=trigger;series=[];sel.replaceChildren();rows();add.hidden=true;get('add').hidden=true;controls();
   dialog.showModal();get('heading').focus({preventScroll:true});
   void load();
   return true;
  },invalidate};
 }
 root.AdminBadgeSeriesEditor=Object.freeze({version,mount,normalizeTarget});
})(typeof globalThis==='object'?globalThis:this);
