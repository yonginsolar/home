/* Election term planner 1.0.0. Explicit proposals only; no ballots, officials or notifications. */
const offices={executive:'임원',delegate:'대의원',election_comm:'선거관리위원'};
const days=(y,m)=>[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
const pad=(v,n=2)=>String(v).padStart(n,'0');
function dateParts(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('임기 시작일을 입력해 주세요.');
 const [y,m,d]=value.split('-').map(Number);
 if(y<1||m<1||m>12||d<1||d>days(y,m))throw Error('임기 날짜를 확인해 주세요.');return [y,m,d];
}
function dateText(y,m,d){if(y<1||y>9999)throw Error('계산할 수 있는 날짜 범위를 벗어났습니다.');return `${pad(y,4)}-${pad(m)}-${pad(d)}`;}
export function nextTermDay(value){let [y,m,d]=dateParts(value);if(++d>days(y,m)){d=1;if(++m>12){m=1;y++;}}return dateText(y,m,d);}
export function calculateTermEnd(value,months){
 let [y,m,d]=dateParts(value);if(!Number.isInteger(months)||months<1||months>1200)throw Error('임기 기간을 확인해 주세요.');
 const total=y*12+m-1+months;y=Math.floor(total/12);m=total%12+1;
 // If there is no anniversary day (Jan 31 / Feb 29), the last day of that month ends the period.
 if(d>days(y,m))return dateText(y,m,days(y,m));
 if(--d===0){if(--m===0){m=12;y--;}d=days(y,m);}return dateText(y,m,d);
}
export function pickTermPolicy(policies,office,start){return policies.filter(p=>p.office===office&&p.effective_date<=start).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.revision-a.revision)[0]||null;}
export function proposeTerm({kind,source,start,months}){
 if(kind==='runoff'){if(!source)throw Error('원선거를 선택해 주세요.');return {start:source.term_start_date,end:source.term_end_date};}
 if(kind==='by_election'){if(!source)throw Error('전임 임기의 정기선거를 선택해 주세요.');dateParts(start);if(start<source.term_start_date||start>source.term_end_date)throw Error('보궐 임기의 시작일은 전임 임기 안으로 입력해 주세요.');return {start,end:source.term_end_date};}
 const a=source?nextTermDay(source.term_end_date):start;return {start:a,end:calculateTermEnd(a,months)};
}
function field(label,node){const box=document.createElement('div');box.style.cssText='min-width:0;flex:1 1 180px;';const l=document.createElement('label');l.htmlFor=node.id;l.textContent=label;l.style.cssText='display:block;margin-bottom:6px;';l.dataset.workflowHelpIgnore='';node.style.width='100%';box.append(l,node);return box;}
function input(id,type='text'){const n=document.createElement('input');n.id=id;n.type=type;n.className='form-input';n.dataset.electionTermControl='';return n;}
function select(id,items){const n=document.createElement('select');n.id=id;n.className='form-input';n.dataset.electionTermControl='';for(const [v,t]of items){const o=document.createElement('option');o.value=v;o.textContent=t;n.append(o);}return n;}
function button(text,fn){const b=document.createElement('button');b.type='button';b.className='btn-control';b.style.cssText='margin:4px 8px 4px 0;padding:8px 12px;border:1px solid #cbd5e1;background:#f8fafc;color:#172033;';b.textContent=text;b.addEventListener('click',fn);return b;}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const visible=()=>!document.hidden&&!window.frameElement?.hidden;

export function createTermPlanning({client,context,authorize}){
 let cached=null,inflight=null,readController=null,readVersion=0;
 async function readContext(force=false){
  const coop=context();if(!coop)throw Error('현재 조합을 확인해 주세요.');
  if(!force&&cached?.coop_id===coop)return cached;
  if(!force&&inflight?.coop===coop)return inflight.promise;
  readController?.abort();const controller=new AbortController(),version=++readVersion;readController=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  const promise=(async()=>{try{
   const r=await client.rpc('erp_election_term_context').abortSignal(controller.signal);
   if(r.error||!r.data||r.data.coop_id!==coop)throw Error('임기 기준을 불러오지 못했습니다. 다시 조회해 주세요.');
   if(controller.signal.aborted||version!==readVersion||context()!==coop||!visible())throw Error('조회를 중단했습니다. 다시 조회해 주세요.');
   cached=r.data;return r.data;
  }finally{clearTimeout(timer);if(inflight?.promise===promise)inflight=null;}})();
  inflight={coop,promise};return promise;
 }
 const policyDrafts=new Map();let policyActive=null,policySeq=0,policyOpener=null;
 const dialog=document.createElement('dialog');dialog.id='election-policy-dialog';dialog.setAttribute('aria-label','정관상 임기 기준');
 dialog.style.cssText='width:min(600px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #cbd5e1;border-radius:16px;color:#172033;background:#fff;word-break:keep-all;';
 const h=document.createElement('h2');h.textContent='📜 정관상 임기 기준';dialog.append(h);
 const help=button('?',()=>{if(window.CoopWorkflowHelp?.visible()===false)return;help.focus({preventScroll:true});void window.CoopDialog.alert('💡 조합 정관에 정한 기간을 등록하면 새 임기의 종료일을 계산할 때 불러올 수 있어요.\n\n• 임원·대의원·선관위원의 기간은 각각 설정해요. 임원은 4년 이내입니다.\n\n• 정관 근거 조항과 적용 시작일을 함께 남겨 주세요. 선거에 저장된 임기는 기준이 바뀌어도 그대로 유지돼요.',{title:'정관상 임기 기준'});});help.className='coop-workflow-help election-help';help.style.cssText='';help.dataset.workflowHelpOptional='';help.setAttribute('aria-label','정관상 임기 기준 도움말');help.setAttribute('aria-haspopup','dialog');h.append(help);
 const office=select('term-policy-office',Object.entries(offices)),period=input('term-policy-period','number'),unit=select('term-policy-unit',[['12','년'],['1','개월']]),ref=input('term-policy-reference'),effective=input('term-policy-effective','date');
 period.min='1';period.max='1200';period.step='1';ref.maxLength=500;
 for(const [label,node]of [['대상',office],['정관상 기간',period],['기간 단위',unit],['정관 근거 조항',ref],['적용 시작일',effective]])dialog.append(field(label,node));
 const status=document.createElement('p');status.setAttribute('role','status');status.style.minHeight='3.3em';dialog.append(status);
 const closePolicy=()=>{capturePolicy();policySeq++;dialog.close();if(policyOpener?.isConnected)policyOpener.focus({preventScroll:true});};
 const close=button('닫기',closePolicy),retry=button('다시 조회',async()=>{
  const s=policyActive,seq=policySeq;if(!s||s.pending)return;
  if(!equal(s.values,s.base)&&!await window.CoopDialog.confirm('입력한 기준을 최신 저장값으로 되돌릴까요?'))return;
  if(policyActive!==s||seq!==policySeq||!dialog.open||!visible()||context()!==s.coop)return;
  await loadPolicy(true);
 }),save=button('기준 저장',async()=>{
  capturePolicy();const s=policyActive;if(!s||s.pending||!s.loaded||equal(s.values,s.base))return;
  const sent={...s.values},months=Number(sent.period)*Number(sent.unit),seq=policySeq;
  if(!Number.isInteger(months)||months<1||months>1200||(sent.office==='executive'&&months>48)||!sent.ref.trim()||!sent.effective){s.error='기간·정관 근거·적용일을 확인해 주세요. 임원은 4년 이내로 설정합니다.';paintPolicy();return;}
  s.pending=true;s.error='';paintPolicy();
  try{
   if(!visible()||context()!==s.coop||!await authorize())throw Error('현재 기준을 변경할 권한이 없습니다.');
   if(policyActive!==s||seq!==policySeq||!dialog.open||context()!==s.coop||!visible())throw Error('저장을 취소했습니다.');
   const r=await client.rpc('erp_save_election_term_policy',{p_office:sent.office,p_months:months,p_reference:sent.ref.trim(),p_effective:sent.effective,p_revision:s.revision});
   if(r.error||!r.data)throw Error(r.error?.code==='PT409'?'다른 담당자가 기준을 변경했습니다. 다시 조회해 주세요.':'저장 결과를 확인하지 못했습니다. 다시 조회해 주세요.');
   s.revision=r.data.revision;s.base=sent;
   if(cached?.coop_id===s.coop){cached={...cached,policies:[...cached.policies.filter(p=>!(p.office===sent.office&&p.revision===r.data.revision)),r.data]};}
   s.error=equal(s.values,s.base)?'저장했습니다.':'저장했습니다. 추가로 수정한 내용은 아직 저장하지 않았습니다.';
  }catch(e){s.error=e.message;}finally{s.pending=false;if(policyActive===s)paintPolicy();}
 });dialog.append(retry,close,save);document.body.append(dialog);
 function policyValues(){return {office:office.value,period:period.value,unit:unit.value,ref:ref.value,effective:effective.value};}
 function capturePolicy(){if(policyActive){policyActive.values=policyValues();paintPolicy();}}
 function paintPolicy(){const s=policyActive;save.disabled=!s?.loaded||s.pending||equal(s.values,s.base);retry.disabled=!!s?.pending;office.disabled=!!s?.pending;status.textContent=s?.pending?'저장 중입니다…':s?.error||(!s?.loaded?'기준을 불러오는 중입니다…':!equal(s.values,s.base)?'작성 중 · 아직 저장하지 않았습니다.':s.revision?'저장된 기준입니다.':'정관에 맞는 임기 기준을 등록해 주세요.');}
 function applyPolicyValues(v){office.value=v.office;period.value=v.period;unit.value=v.unit;ref.value=v.ref;effective.value=v.effective;}
 async function loadPolicy(reset=false){
  const s=policyActive,seq=++policySeq;s.loaded=false;s.error='';paintPolicy();
  try{const data=await readContext(true);if(policyActive!==s||seq!==policySeq||!dialog.open||context()!==s.coop)return;
   const latest=data.policies.filter(p=>p.office===s.values.office).sort((a,b)=>b.revision-a.revision)[0];
   const months=latest?.months,values={office:s.values.office,period:months?String(months%12===0?months/12:months):'',unit:months&&months%12!==0?'1':'12',ref:latest?.reference||'',effective:latest?.effective_date||today()};
   if(reset||equal(s.values,s.base)){s.base=values;s.values={...values};s.revision=latest?.revision||0;applyPolicyValues(values);}
   else if(s.revision!==(latest?.revision||0))s.error='저장된 기준이 변경되었습니다. 다시 조회해 주세요.';
   s.loaded=true;
  }catch(e){if(policyActive===s&&seq===policySeq)s.error=e.message;}finally{if(policyActive===s&&seq===policySeq)paintPolicy();}
 }
 async function openPolicy(opener,selected='executive'){
  if(dialog.open)return;const coop=context();if(!coop)return;
  policyOpener=opener;const key=coop+':'+selected;
  if(!policyDrafts.has(key)){const base={office:selected,period:'',unit:'12',ref:'',effective:today()};policyDrafts.set(key,{coop,base,values:{...base},revision:0,loaded:false,pending:false,error:''});}
  policyActive=policyDrafts.get(key);applyPolicyValues(policyActive.values);dialog.showModal();office.focus();await loadPolicy();
 }
 office.addEventListener('change',async()=>{if(!policyActive)return;const selected=office.value;policyActive.values={...policyActive.values,office:policyActive.base.office};const coop=context(),key=coop+':'+selected;if(!policyDrafts.has(key)){const base={office:selected,period:'',unit:'12',ref:'',effective:today()};policyDrafts.set(key,{coop,base,values:{...base},revision:0,loaded:false,pending:false,error:''});}policyActive=policyDrafts.get(key);applyPolicyValues(policyActive.values);await loadPolicy();});
 for(const n of [period,unit,ref,effective])n.addEventListener('input',capturePolicy);
 dialog.addEventListener('cancel',e=>{e.preventDefault();closePolicy();});
 dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closePolicy();}if(e.key==='Enter'&&e.target.tagName==='INPUT')e.preventDefault();});
 window.addEventListener('beforeunload',e=>{if([...policyDrafts.values()].some(s=>s.pending||!equal(s.values,s.base))){e.preventDefault();e.returnValue='';}});

 function planner({container,start,end,onChange=()=>{}}){
  const prefix=start.id+'-plan-',row=document.createElement('div');row.className='form-row';row.style.cssText='display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;';
  const category=select(prefix+'office',[['','직접 입력 · 종류 미분류'],...Object.entries(offices)]),kind=select(prefix+'kind',[['regular','정기선거'],['runoff','결선·재투표'],['by_election','보궐선거']]),source=select(prefix+'source',[['','첫 임기 · 이전 선거 선택 안 함']]),amount=input(prefix+'period','number'),units=select(prefix+'unit',[['12','년'],['1','개월']]);amount.min='1';amount.max='1200';amount.step='1';
  for(const [label,n]of [['선출 대상',category],['선거 구분',kind],['연결할 정기선거',source],['임기 기간',amount],['기간 단위',units]])row.append(field(label,n));
  const note=document.createElement('p');note.setAttribute('role','status');note.style.cssText='min-height:3.3em;line-height:1.65;';
  let sequence=0,base=null,currentRow=null,sources=[],policyRevision=null,mode='manual',sourceSnapshot=null,loaded=false,locked=false;
  const apply=button('정관 기간 불러오기',async()=>action(async data=>{
   if(!category.value)throw Error('선출 대상을 선택해 주세요.');dateParts(start.value);
   const p=pickTermPolicy(data.policies,category.value,start.value);if(!p)throw Error('해당 시작일에 적용할 정관 기준이 없습니다. 기준을 등록하거나 기간을 직접 입력해 주세요.');
   amount.value=String(p.months%12===0?p.months/12:p.months);units.value=p.months%12===0?'12':'1';policyRevision=p.revision;mode='calculated';recalculate();note.textContent=`📜 ${p.reference} · ${p.effective_date}부터 적용`;
  }));
  const propose=button('이전 임기 연결',async()=>action(async data=>{
   const s=data.sources.find(s=>s.id===source.value&&s.id!==currentRow?.id&&s.term_plan?.office===category.value);if(!s)throw Error('연결할 정기선거를 선택해 주세요.');
   sourceSnapshot={id:s.id,start:s.term_start_date,end:s.term_end_date};
   if(kind.value==='regular'){
    const a=nextTermDay(s.term_end_date),p=pickTermPolicy(data.policies,category.value,a);
    if(p&&(!amount.value||policyRevision!==null)){amount.value=String(p.months%12===0?p.months/12:p.months);units.value=p.months%12===0?'12':'1';policyRevision=p.revision;}else if(!p)policyRevision=null;
    const proposed=proposeTerm({kind:kind.value,source:s,start:a,months:months()});start.value=proposed.start;end.value=proposed.end;mode='calculated';
   }else{const proposed=proposeTerm({kind:kind.value,source:s,start:start.value});start.value=proposed.start;end.value=proposed.end;mode='manual';policyRevision=null;}
   note.textContent='제안한 임기를 확인해 주세요.';
  }));
  const calc=button('종료일 다시 계산',()=>{try{if(kind.value!=='regular')throw Error('결선·보궐은 연결한 정기선거의 임기를 사용합니다.');mode='calculated';recalculate();note.textContent='계산한 종료일을 확인해 주세요.';onChange();}catch(e){note.textContent=e.message;}});
  const settings=button('정관상 임기 기준',()=>openPolicy(settings,category.value||'executive'));
  container.prepend(row);const actions=document.createElement('div');actions.id=prefix+'actions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-top:12px;';actions.append(apply,propose,calc,settings);(end.closest('.form-row')||end).after(actions,note);
  function months(){const n=Number(amount.value)*Number(units.value);if(!amount.value||!Number.isInteger(n)||n<1||n>1200)throw Error('임기 기간을 입력해 주세요.');if(category.value==='executive'&&n>48)throw Error('임원 임기는 4년 이내로 설정해 주세요.');return n;}
  function recalculate(){end.value=calculateTermEnd(start.value,months());}
  function raw(){return category.value?{office:category.value,kind:kind.value,mode,months:amount.value?Number(amount.value)*Number(units.value):null,policy_revision:policyRevision,source_id:source.value||null,source_start:sourceSnapshot?.start||null,source_end:sourceSnapshot?.end||null}:null;}
  function paint(){kind.disabled=locked||!category.value;source.disabled=locked||!category.value;amount.disabled=locked||!category.value||kind.value!=='regular';units.disabled=amount.disabled;amount.max=String(category.value==='executive'?(units.value==='12'?4:48):(units.value==='12'?100:1200));apply.disabled=locked||!category.value||kind.value!=='regular';propose.disabled=locked||!source.value;calc.disabled=locked||!category.value||kind.value!=='regular';category.disabled=locked;end.readOnly=!!category.value&&kind.value!=='regular';start.readOnly=!!category.value&&kind.value==='runoff';
   kind.parentElement.hidden=!category.value;source.parentElement.hidden=!category.value;amount.parentElement.hidden=!category.value||kind.value!=='regular';units.parentElement.hidden=amount.parentElement.hidden;apply.hidden=amount.parentElement.hidden;calc.hidden=amount.parentElement.hidden;propose.hidden=!category.value;
  }
  function populate(data){sources=data.sources;const selected=source.value;source.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=kind.value==='regular'?'첫 임기 · 이전 선거 선택 안 함':'연결할 정기선거 선택';source.append(empty);for(const s of sources.filter(s=>s.id!==currentRow?.id&&s.term_plan?.office===category.value)){const o=document.createElement('option');o.value=s.id;o.textContent=`${s.title} (${s.term_start_date} ~ ${s.term_end_date})`;source.append(o);}if(selected&&!sources.some(s=>s.id===selected)){const o=document.createElement('option');o.value=selected;o.textContent='기존 연결 · 최신 조회 필요';source.append(o);}source.value=selected;paint();}
  async function refresh(){const seq=++sequence,coop=context();note.textContent='기준을 불러오는 중입니다…';try{const data=await readContext(true);if(seq!==sequence||context()!==coop)return;loaded=true;populate(data);note.textContent='정관 기간을 불러오거나 직접 입력해 주세요.';}catch(e){if(seq===sequence){loaded=false;note.textContent=e.message;}}}
  async function action(fn){const seq=++sequence,coop=context(),snapshot=JSON.stringify({plan:raw(),start:start.value,end:end.value});apply.disabled=true;propose.disabled=true;note.textContent='기준을 확인하는 중입니다…';try{const data=await readContext(true);if(seq!==sequence||context()!==coop||!visible()||snapshot!==JSON.stringify({plan:raw(),start:start.value,end:end.value}))return;loaded=true;populate(data);await fn(data);onChange();}catch(e){if(seq===sequence)note.textContent=e.message;}finally{if(seq===sequence)paint();}}
  for(const n of [category,kind])n.addEventListener('change',()=>{sequence++;source.value='';sourceSnapshot=null;policyRevision=null;mode='manual';paint();onChange();void refresh();});
  source.addEventListener('change',()=>{sequence++;sourceSnapshot=null;paint();onChange();});
  for(const n of [amount,units])n.addEventListener('input',()=>{sequence++;policyRevision=null;if(!locked&&category.value&&kind.value==='regular'){mode='calculated';try{recalculate();note.textContent='계산한 종료일을 확인해 주세요.';}catch(e){note.textContent=e.message;}}onChange();});
  start.addEventListener('input',()=>{sequence++;if(category.value&&kind.value==='regular'&&mode==='calculated'){try{recalculate();}catch(e){note.textContent=e.message;}}onChange();});
  end.addEventListener('input',()=>{sequence++;mode='manual';policyRevision=null;onChange();});
  return {
   raw,read(){const p=raw();if(!p)return null;if(p.kind!=='regular'&&!p.source_id)throw Error('연결할 정기선거를 선택해 주세요.');if(p.source_id&&!sourceSnapshot)throw Error('이전 임기 연결을 눌러 제안된 임기를 확인해 주세요.');
    if(sourceSnapshot){if(p.kind==='regular'&&start.value<=sourceSnapshot.end)throw Error('다음 임기는 이전 임기가 끝난 뒤에 시작해야 합니다.');if(p.kind==='runoff'&&(start.value!==sourceSnapshot.start||end.value!==sourceSnapshot.end))throw Error('결선·재투표는 원선거와 같은 임기를 사용합니다.');if(p.kind==='by_election'&&(start.value<sourceSnapshot.start||start.value>sourceSnapshot.end||end.value!==sourceSnapshot.end))throw Error('보궐은 전임자의 남은 임기를 사용합니다.');}
    if(p.mode==='calculated'&&p.kind==='regular'&&end.value!==calculateTermEnd(start.value,months()))throw Error('종료일을 다시 계산해 주세요.');return p;},
   bind(value,{isLocked=false}={}){sequence++;currentRow=value||null;locked=isLocked;const p=value?.term_plan;category.value=p?.office||'';kind.value=p?.kind||'regular';mode=p?.mode||'manual';policyRevision=p?.policy_revision||null;sourceSnapshot=p?.source_id?{id:p.source_id,start:p.source_start,end:p.source_end}:null;amount.value=p?.months?String(p.months%12===0?p.months/12:p.months):'';units.value=p?.months&&p.months%12!==0?'1':'12';source.replaceChildren();const o=document.createElement('option');o.value=p?.source_id||'';o.textContent=p?.source_id?'저장된 연결 선거':'첫 임기 · 이전 선거 선택 안 함';source.append(o);source.value=p?.source_id||'';base=raw();note.textContent=p?'저장된 임기입니다.':'임기 기준을 선택하거나 날짜를 직접 입력할 수 있어요.';paint();},
   dirty:()=>!equal(raw(),base),saved(){base=raw();},close(){sequence++;},refresh,
   setBusy(value){locked=value;paint();},
  };
 }
 return {planner,openPolicy,readContext};
}
