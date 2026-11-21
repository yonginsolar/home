/* PC badge authoring. Imported and legacy badge workbench stays separate. */
(function(root){
 'use strict';
 const catalog=Object.freeze({
  capital_min:{label:'납입 출자금',unit:'원 이상',hint:'출자금 납입자본 납부 입금 금액 주금',type:'number'},
  join_since:{label:'가입일 이후',unit:'이 날짜부터 (포함)',hint:'가입 입회 입단 등록 시작 날짜 신입 가입일',type:'date'},
  join_until:{label:'가입일 이전',unit:'이 날짜까지 (포함)',hint:'가입 입회 등록 날짜 옛 기존 가입일',type:'date'},
  tenure_days:{label:'가입 기간',unit:'일 이상',hint:'가입 기간 가입연수 근속 오래 장기 경과 회원 일수 기간',type:'number'},
  referral_count:{label:'추천 가입 승인 인원',unit:'명',hint:'추천인 추천 지인 소개 신규 가입 승인 고유 인원 명수',type:'count'},
  education_count:{label:'교육 실제 출석',unit:'회',hint:'교육 출석 참석 수업 강의 실제 참여 횟수',type:'count'},
  quiz_completed_days:{label:'햇빛 퀴즈 완료일 수',unit:'일',hint:'퀴즈 완료한 날짜 일수 햇빛 quiz',type:'count'},
  delegate_attendance_count:{label:'대의원총회 실제 참석',unit:'회',hint:'대의원 총회 참석 출석 실제 개최',type:'count'},
  poll_participation_count:{label:'조합 설문 참여 수',unit:'회',hint:'조합 설문 참여 완료 선호도 ',type:'count'}
 });
 const periods={all:'전체',this_year:'올해',last_year:'작년',last_12m:'최근 12개월'};
 const comparisons={ge:'이상',gt:'초과',eq:'같음',le:'이하',lt:'미만'};
 const comparisonWords={이상:'ge',초과:'gt',넘게:'gt',같음:'eq',이하:'le',미만:'lt'};
 const countType=key=>catalog[key]?.type==='count';
 const ruleId=r=>countType(r.key)?r.key+':'+r.period:r.key;
 const firstPeriod=(key,rules)=>Object.keys(periods).find(period=>!rules.some(r=>r.key===key&&r.period===period));
 const createRule=(key,rules)=>countType(key)?{key,value:'',period:firstPeriod(key,rules),op:'ge'}:{key,value:''};
 const acceptedCount=(key,op,value)=>Number.isInteger(value)&&value>=0&&value<=999999&&Object.hasOwn(comparisons,op)
  &&(key==='referral_count'||op==='gt'||(op==='ge'&&value>0));
 const labels={
  BADGE_FIELDS_INVALID:'뱃지 이름·아이콘·표시 순서를 확인해 주세요.',
  BADGE_RULE_INVALID:'지원하는 조건과 입력값을 다시 확인해 주세요.',
  BADGE_RULE_DATE_CONFLICT:'시작일이 종료일보다 늦어요. 날짜 범위를 확인해 주세요.',
  BADGE_REVIEW_REQUIRED:'지급 대상을 먼저 확인해 주세요.',
  BADGE_REVIEW_CHANGED:'조건이나 지급 대상이 바뀌었어요. 대상을 다시 확인해 주세요.',
  BADGE_DRAFT_CHANGED:'다른 창에서 초안이 바뀌었어요. 저장한 초안을 다시 확인해 주세요.',
  BADGE_DRAFT_NOT_FOUND:'초안을 찾을 수 없어요.',
  BADGE_ALREADY_ACTIVE:'이미 활성화된 뱃지입니다.',
  CAPITAL_BADGE_FORBIDDEN:'뱃지 관리 권한을 확인해 주세요.',
  BADGE_RULE_DUPLICATE:'이 조건의 배지가 이미 있어요.',
  BADGE_RULE_EVIDENCE_PENDING:'기록을 확인할 수 없는 대상이 있어 활성화할 수 없어요.',
  QUIZ_ADMIN_PERMISSION_REQUIRED:'퀴즈 조회 권한을 확인해 주세요.',
  PARTICIPATION_ADMIN_REQUIRED:'교육·회의 참여 조회 권한을 확인해 주세요.',
  PREFERENCE_POLL_ADMIN_REQUIRED:'조합 설문 조회 권한을 확인해 주세요.'
 };
 const newFields=()=>({name:'',icon:'🏅',description:'',color:'primary',order:0,combine:'all',rules:[]});
 const ideaSets=[
  ['올해 햇빛 퀴즈 완료 3일 이상','대의원총회 참석 1회 이상'],
  ['납입 출자금 10만 원 이상','가입 기간 365일 이상'],
  ['최근 12개월 교육 출석 2회 이상','올해 조합 설문 참여 1회 이상'],
  ['올해 추천 가입 승인 3명 이상','올해 교육 출석 2회 이상 그리고 올해 햇빛 퀴즈 완료 3일 이상'],
  ['작년 조합 설문 참여 2회 이상','최근 12개월 햇빛 퀴즈 완료 5일 이상']
 ];
 const fieldNames=['name','icon','description','color','order','combine'];
 const cloneFields=data=>({...data,rules:data.rules.map(r=>({...r}))});
 const wordNumbers={하루:1,한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10};
 const numberText='(?:[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)';
 const moneyText='('+numberText+')(억|만|천)?원';
 const amountPatterns=[
  new RegExp('^(?:납입출자금|출자금납입액|출자금|출자금을)'+moneyText+'이상(?:을)?(?:납입(?:했|한)?|낸)?$'),
  new RegExp('^'+moneyText+'이상(?:의)?(?:납입출자금|출자금납입액|출자금|출자금을)(?:납입(?:했|한)?|낸)?$'),
  new RegExp('^출자금을'+moneyText+'(?:이상납입한|이상낸)$')
 ];
 const dateText='(\\d{4})(?:([-./])(\\d{1,2})\\2(\\d{1,2})|년(\\d{1,2})월(\\d{1,2})일)';
 const joinDatePatterns=[
  new RegExp('^(?:가입일(?:이|은)?)?'+dateText+'(부터|이후|까지|이전)(?:에)?(?:가입(?:한|했)?|입회한)?$'),
  new RegExp('^(?:가입일(?:이|은)?)'+dateText+'(이상|이하)$')
 ];
 const plus=(str,units)=>Number(str.replaceAll(',',''))*({억:1e8,만:1e4,천:1e3}[units]||1);
 function individualIdea(part){
  const text=part.trim().replace(/(?:조합원(?:에게|들)?|사람(?:에게|들)?|회원(?:에게|들)?)(?:만)?$/,'')
    .replace(/\s+/g,'').replace(/(이상|이하|이후|이전)인$/,'$1');
  const countText=/^(올해|금년|작년|지난해|최근12개월|전체|누적)?(?:(추천인|추천|추천가입|추천가입승인|교육실제출석|교육출석|햇빛퀴즈완료(?:일수)?|대의원총회(?:실제)?참석|조합설문(?:참여|완료))([0-9]{1,6}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(명|회|일)(이상|초과|넘게|같음|이하|미만)|내(?:소개로|추천으로)([0-9]{1,6}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)명(?:가입|가입승인)(?:했음|한)?)$/.exec(text);
  if(countText){
   const [,span,subject,n,unit,operation,exact]=countText;
   const key=subject?.startsWith('교육')?'education_count':subject?.startsWith('햇빛퀴즈')?'quiz_completed_days':
    subject?.startsWith('대의원총회')?'delegate_attendance_count':subject?.startsWith('조합설문')?'poll_participation_count':'referral_count';
   const period=({올해:'this_year',금년:'this_year',작년:'last_year',지난해:'last_year',최근12개월:'last_12m'})[span]||'all';
   const value=wordNumbers[n||exact]||Number(n||exact),op=exact?'eq':comparisonWords[operation];
   if((exact||unit===catalog[key].unit)&&acceptedCount(key,op,value))return {key,period,op,value};
  }
  for(const re of amountPatterns){
   const m=re.exec(text);if(!m)continue;
   const value=plus(m[1],m[2]);if(Number.isSafeInteger(value)&&value>=1&&value<=1e12)return {key:'capital_min',value};
  }
  const duration=/^(?:가입기간(?:이|은)?|가입한지|가입후|가입)([1-9][0-9]{0,4}|하루|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(일|일째|일경과)?이상$/.exec(text);
  if(duration&&(duration[2]||duration[1]==='하루')){
   const value=wordNumbers[duration[1]]||Number(duration[1]);if(value<=36525)return {key:'tenure_days',value};
  }
  for(const re of joinDatePatterns){
   const m=re.exec(text);if(!m)continue;
   const [,year,,mo,day,koMo,koDay,range]=m;
   const month=String(mo||koMo).padStart(2,'0'),date=String(day||koDay).padStart(2,'0');
   const iso=year+'-'+month+'-'+date, parsed=new Date(iso+'T00:00:00Z');
   if(year<'1900'||year>'2100'||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==iso)continue;
   return {key:['부터','이후','이상'].includes(range)?'join_since':'join_until',value:iso};
  }
  return null;
 }
 function suggest(raw){
  if(typeof raw!=='string'||raw.length>240)return null;
  const text=raw.normalize('NFKC').trim().replace(/[.!?。]+$/,'').trim();
  const items=text.split(/(그리고|또는|혹은|및)/g);
  if(!text||items.length>15)return null;
  const rules=[],modes=new Set();
  for(let i=0;i<items.length;i++){
   if(i%2){modes.add(['그리고','및'].includes(items[i])?'all':'any');continue;}
   const rule=individualIdea(items[i]);if(!rule||rules.some(r=>ruleId(r)===ruleId(rule)))return null;
   rules.push(rule);
  }
  if(modes.size>1)return null;
  const combine=modes.has('any')?'any':'all';
  if(conflicting(rules,combine))return null;
  return {rules,combine};
 }
 function conflicting(rules,combine){
  const since=rules.find(r=>r.key==='join_since')?.value,until=rules.find(r=>r.key==='join_until')?.value;
  return combine==='all'&&!!since&&!!until&&since>until;
 }
 const fingerprint=f=>JSON.stringify([f.name,f.icon,f.description,f.color,Number(f.order),f.rules.length<2?'all':f.combine,
  f.rules.map(r=>[ruleId(r),r.op||'',String(r.value)]).sort()]);
 function mount({dialog,owner,api,checkIdeas=false,onActivated=()=>{},timeout=12000,previewDelay=350}){
  const doc=dialog.ownerDocument,p=k=>dialog.querySelector('[data-bre="'+k+'"]'),form=p('form'),title=dialog.querySelector('#badge-rule-title');
  const f=k=>form.elements.namedItem(k),make=(tag,s='',cls='')=>{const n=doc.createElement(tag);n.textContent=s;if(cls)n.className=cls;return n;};
  const makeButton=(s,fn)=>{const b=make('button',s,'btn btn-outline-secondary bre-option');b.type='button';b.onclick=fn;return b;};
  const storage=new Map();let scope='',s=null,trigger=null,generation=0,busy=false,review=null,forbidden=false;
  let previewTimer=null,previewWork=null,expiryTimer=null,duplicate=null,ideaWork=null;
  const state=()=>({id:'new',pages:new Map([['new',{fields:newFields(),receipt:null}]]),pending:null,draftOffset:0,ideaSet:0});
  const page=()=>s.pages.get(s.id),current=()=>!!scope&&dialog.open&&owner()===scope;
  const status=t=>p('status').textContent=t;
  const editing=()=>current()&&!busy&&!s.pending&&!forbidden&&p('draft-list').hidden&&!page().receipt?.badge_id;
  const exampleButtons=[...form.querySelectorAll('[data-idea-example]')];
  function paintIdeas(announce=false){
   const ideas=checkIdeas?s.ideaPool?.slice(2*s.ideaSet,2*s.ideaSet+2)??[]:ideaSets[s.ideaSet];
   exampleButtons.forEach((b,i)=>{b.hidden=!ideas[i];b.dataset.ideaExample=ideas[i]??'';b.textContent=ideas[i]??'';});
   p('idea-refresh').hidden=checkIdeas&&!s.ideaFailed&&!(s.ideaPool?.length>2);
   p('idea-refresh').textContent=s.ideaFailed?'다시 확인':'다른 예시';
   p('idea-announce').textContent=announce&&ideas.length?'새 예시: '+ideas.join(' / '):'';
  }
  function stopIdeas(){const old=ideaWork;ideaWork=null;old?.abort();}
  async function lookupIdeas(){
   if(!checkIdeas||!current()||ideaWork)return;
   const at=generation,abort=ideaWork=new root.AbortController(),choices=ideaSets.flat();
   let timer;
   s.ideaPool=null;s.ideaFailed=false;paintIdeas();
   const live=()=>ideaWork===abort&&current()&&generation===at;
   try{
    const req=api({p_action:'idea_availability',p_fields:{candidates:choices.map(suggest)}});
    const out=await Promise.race([typeof req?.abortSignal==='function'?req.abortSignal(abort.signal):req,
      new Promise((_,reject)=>{timer=root.setTimeout(()=>{abort.abort();reject(Error('timeout'));},timeout);})]);
    if(!live())return;
    const indexes=out?.data?.available;
    if(out?.error||!Array.isArray(indexes)||new Set(indexes).size!==indexes.length||
       indexes.some(i=>!Number.isInteger(i)||i<0||i>=choices.length))throw Error('BADGE_IDEA_LOOKUP_FAILED');
    s.ideaPool=indexes.map(i=>choices[i]);s.ideaSet=0;paintIdeas();
   }catch{if(live()){s.ideaFailed=true;paintIdeas();}}
   finally{root.clearTimeout(timer);if(live()){ideaWork=null;disable();}}
  }
  const baseFields=()=>page().receipt?.fields??newFields();
  function resettable(){
   const a=baseFields(),b=read();
   return !!p('idea').value||fieldNames.some(k=>k!=='combine'&&String(a[k])!==f(k).value)||fingerprint(a)!==fingerprint(b);
  }
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
    if(countType(r.key)){
     if(!/^\d{1,6}$/.test(String(r.value))||!Object.hasOwn(periods,r.period)||!acceptedCount(r.key,r.op,Number(r.value)))
      throw Error('횟수·인원과 비교 기준을 확인해 주세요.');
     r.value=Number(r.value);
    }else if(catalog[r.key].type==='number'){
     const raw=String(r.value).trim();
     if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(raw))throw Error('기준값을 1 이상의 정수로 입력해 주세요.');
     r.value=Number(raw.replaceAll(',',''));
     if(!Number.isSafeInteger(r.value)||r.value>(r.key==='capital_min'?1e12:36525))throw Error('조건의 기준값이 너무 커요.');
    }else if(!/^\d{4}-\d{2}-\d{2}$/.test(r.value)||r.value<'1900-01-01'||r.value>'2100-12-31')
      throw Error('조건의 날짜를 확인해 주세요.');
   }
   if(new Set(d.rules.map(ruleId)).size!==d.rules.length)throw Error('같은 지표와 기간은 한 번만 넣어 주세요.');
   if(conflicting(d.rules,d.combine))throw Error(labels.BADGE_RULE_DATE_CONFLICT);
   return d;
  }
  function safeFingerprint(){try{return fingerprint(valid());}catch{return null;}}
  function note(t){p('review-note').textContent=t;}
  function stopPreview(){
   root.clearTimeout(previewTimer);previewTimer=null;
   const old=previewWork;previewWork=null;old?.abort.abort();
  }
  function clearReview(){
   stopPreview();root.clearTimeout(expiryTimer);expiryTimer=null;review=null;duplicate=null;
   p('duplicate').hidden=true;
   const list=p('people');list.replaceChildren();list.hidden=true;list.scrollTop=0;
   p('summary').textContent='—';note('');
  }
  const proofCurrent=()=>!!review&&review.expires>Date.now()&&review.local===safeFingerprint();
  function disable(){
   const locked=busy||!!s.pending||forbidden,active=!!page().receipt?.badge_id,inDrafts=!p('draft-list').hidden;
   for(const el of form.querySelectorAll('input,textarea,select,button'))el.disabled=locked||active;
   p('idea-make').disabled=locked||active||inDrafts;
   p('idea-refresh').disabled=locked||active||inDrafts||!!ideaWork;
   for(const example of exampleButtons)example.disabled=locked||active||inDrafts;
   p('reset').disabled=locked||active||inDrafts||!resettable();
   p('undo-reset').hidden=locked||active||inDrafts||!page().beforeReset;
   const r=page().fields.rules,proof=proofCurrent();
   p('save').disabled=locked||active||inDrafts||!safeFingerprint()||(r.length>0&&!proof);
   p('activate').disabled=locked||active||inDrafts||!proof||!review?.saved||!!review?.pending||!page().receipt;
   p('duplicate-open').disabled=locked;
   p('activate').textContent=active?'활성화 완료':r.length?'활성화하고 지급':'활성화';
   p('recover').hidden=!s.pending;
   p('check').disabled=p('repeat').disabled=busy||forbidden;p('drafts').disabled=locked;
   for(const el of p('draft-list').querySelectorAll('button'))el.disabled=locked;
  }
  function updateRuleMode(){
   const rules=page().fields.rules;
   p('combine-wrapper').hidden=rules.length<2;
   p('mode').textContent=!rules.length?'조건이 없으면 직접 지급하는 뱃지입니다.':
     rules.length===1&&rules[0].key==='capital_min'?'승인된 조합원의 확정 납입액이 기준에 도달하면 지급합니다.':
     '활성화할 때 조건을 충족한 승인 조합원에게 지급합니다.';
  }
  function changed(){
   page().beforeReset=null;
   page().fields=read();status('');showIdea('');p('icon-preview').textContent=page().fields.icon;
   updateRuleMode();queuePreview();
   p('existing').hidden=true;
  }
  function showIdea(text,failed=false){
   p('idea-status').textContent=text;p('idea-manual').hidden=!failed;
  }
  function makeIdea(){
   if(!editing())return;
   const x=page(),proposal=suggest(p('idea').value);
   const fail=()=>showIdea('추천할 조건을 찾지 못했어요.'+(x.fields.rules.length?' 기존 조건은 그대로예요.':''),true);
   if(!proposal){
    if(/행사|해마다|매년/.test(p('idea').value))showIdea('추천할 조건을 찾지 못했어요. 일반 행사 출석이나 매년 기록을 확인할 수 없어요. 교육 실제 출석처럼 확인 가능한 조건을 골라 주세요.'+
     (x.fields.rules.length?' 기존 조건은 그대로예요.':''),true);
    else fail();
    return;
   }
   const was=x.fields.rules;
   const same=(old,next)=>countType(old.key)?old.op===next.op&&/^\d{1,6}$/.test(String(old.value))&&Number(old.value)===next.value:
    catalog[old.key].type==='number'?Number(String(old.value).replaceAll(',',''))===next.value:old.value===next.value;
   const previousMode=was.length<2?'all':f('combine').value;
   if(proposal.rules.some(r=>was.some(o=>ruleId(o)===ruleId(r)&&!same(o,r)))||
      (was.length>0&&proposal.rules.length>1&&previousMode!==proposal.combine)){fail();return;}
   const next=[...was,...proposal.rules.filter(r=>!was.some(o=>ruleId(o)===ruleId(r)))];
   const combine=was.length?previousMode:proposal.combine;
   if(next.length>8||conflicting(next,combine)){fail();return;}
   if(next.length===was.length){showIdea('이미 들어 있는 조건이에요.');return;}
   x.fields.rules=next;f('combine').value=combine;
   drawRules();options(false);changed();showIdea(was.length?'기존 조건에 새 조건을 추가했어요.':'조건 초안을 추가했어요.');
  }
  function options(open=true){
   const list=p('options'),query=p('search').value.normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean),rules=page().fields.rules;
   p('picker').hidden=list.hidden=!open;p('add').setAttribute('aria-expanded',String(open));list.replaceChildren();
   if(!open)return;
   for(const [key,row] of Object.entries(catalog)){
    if(rules.length>=8||(countType(key)?!firstPeriod(key,rules):rules.some(r=>r.key===key))||!query.every(term=>(row.label+' '+row.hint).includes(term)))continue;
    list.append(makeButton(row.label,()=>{const rule=createRule(key,rules);page().fields.rules.push(rule);drawRules();options(false);
     changed();p('rules').querySelector('[data-rule-key="'+ruleId(rule)+'"]')?.focus({preventScroll:true});}));
   }
   if(!list.children.length)list.append(make('p','추가할 수 있는 조건이 없어요.','small mb-1'));
  }
  function drawRules(){
   const rules=page().fields.rules,box=p('rules');box.replaceChildren();
   for(const [i,r] of rules.entries()){
    const c=catalog[r.key];if(!c)continue;
    const row=make('div','','bre-rule'),label=make('label','','bre-value');
    const number=make('span',String(i+1),'bre-number');number.setAttribute('aria-hidden','true');
    const type=make('select','','form-select');type.setAttribute('aria-label','조건 '+(i+1)+' 항목');
    for(const [key,option] of Object.entries(catalog)){
     if(key!==r.key&&(countType(key)?!firstPeriod(key,rules):rules.some(x=>x.key===key)))continue;
     const node=make('option',option.label);node.value=key;type.append(node);
    }
    type.value=r.key;
    type.onchange=e=>{
     const key=e.target.value;if(!current()||!catalog[key]||key===r.key||(countType(key)?!firstPeriod(key,rules):rules.some(x=>x.key===key)))return;
     const next=createRule(key,rules);page().fields.rules[i]=next;drawRules();changed();
     box.querySelector('[data-rule-key="'+ruleId(next)+'"]')?.focus({preventScroll:true});
    };
    const input=make('input','','form-control');input.dataset.ruleKey=ruleId(r);input.type=c.type==='date'?'date':'text';
    input.setAttribute('aria-label',c.label+' · '+c.unit+(countType(r.key)?' · '+periods[r.period]:''));
    if(c.type==='date'){input.min='1900-01-01';input.max='2100-12-31';}else input.inputMode='numeric';
    input.value=r.value;input.addEventListener('input',()=>{const registered=page().fields.rules.find(x=>ruleId(x)===ruleId(r));if(registered)registered.value=input.value;});
    const remove=make('button','×','btn btn-outline-secondary bre-remove');remove.type='button';remove.setAttribute('aria-label',c.label+' 조건 빼기');
    if(countType(r.key))remove.setAttribute('aria-label',c.label+' '+periods[r.period]+' 조건 빼기');
    remove.onclick=()=>{page().fields.rules=page().fields.rules.filter(x=>ruleId(x)!==ruleId(r));drawRules();changed();p('add').focus({preventScroll:true});};
    label.append(input,make('span',c.unit,'small text-body-secondary'));row.append(number,type,label,remove);box.append(row);
    if(countType(r.key)){
     const extras=make('div','','bre-rule-extras');
     const select=(choices,name,currentValue)=>{const el=make('select','','form-select form-select-sm');el.setAttribute('aria-label',name);
      for(const [key,label] of Object.entries(choices)){const o=make('option',label);o.value=key;el.append(o);}
      el.value=currentValue;return el;};
     const eligible=Object.fromEntries(Object.entries(periods).filter(([key])=>key===r.period||!rules.some(x=>x.key===r.key&&x.period===key)));
     const span=select(eligible,'조건 '+(i+1)+' 기간',r.period),
       cmp=select(r.key==='referral_count'?comparisons:{ge:'이상',gt:'초과'},'조건 '+(i+1)+' 비교 방식',r.op);
     const edit=(field,value)=>{
      const at=page().fields.rules.findIndex(x=>ruleId(x)===ruleId(r));if(!current()||at<0)return;
      page().fields.rules[at]={...page().fields.rules[at],[field]:value};drawRules();changed();
      box.children[i]
       ?.querySelector('[aria-label="조건 '+(i+1)+(field==='period'?' 기간':' 비교 방식')+'"]')?.focus({preventScroll:true});
     };
     span.onchange=()=>edit('period',span.value);cmp.onchange=()=>edit('op',cmp.value);
     extras.append(span,cmp);row.append(extras);
    }
   }
   updateRuleMode();
  }
  function hydrate(){
   const x=page();for(const k of fieldNames)f(k).value=x.fields[k];
   p('idea').value=x.idea||'';showIdea('');p('existing').hidden=true;
   p('icon-preview').textContent=x.fields.icon||'🏅';
   drawRules();p('search').value='';options(false);p('draft-list').hidden=true;queuePreview();
  }
  function reset(){
   if(!editing()||!resettable())return;
   const x=page(),previous=cloneFields(x.fields);
   for(const k of fieldNames)previous[k]=f(k).value;
   x.beforeReset={fields:previous,idea:p('idea').value};
   x.fields=cloneFields(baseFields());x.idea='';
   hydrate();status('');
   p('undo-reset').focus({preventScroll:true});
  }
  function undoReset(){
   if(!editing()||!page().beforeReset)return;
   const x=page(),saved=x.beforeReset;
   x.fields=saved.fields;x.idea=saved.idea;x.beforeReset=null;
   hydrate();status('');p('reset').focus({preventScroll:true});
  }
  function invalidate(restore=false){
   ++generation;busy=false;stopIdeas();
   if(dialog.open){if(s){page().fields=read();page().beforeReset=null;}dialog.close();}
   const from=trigger,id=scope;scope='';trigger=null;s=null;clearReview();
   if(restore&&id===owner()&&from?.isConnected)from.focus({preventScroll:true});
  }
  function open(from){
   const id=owner();if(!id||dialog.open)return false;
   scope=id;trigger=from;s=storage.get(id)||state();storage.set(id,s);forbidden=false;
   if(page().receipt?.badge_id)s.id='new';
   if(checkIdeas){s.ideaPool=null;s.ideaFailed=false;s.ideaSet=0;}
   dialog.showModal();paintIdeas();hydrate();void lookupIdeas();
   status(s.pending?'저장 결과를 먼저 확인해 주세요.':'');title.focus({preventScroll:true});return true;
  }
  async function request(args,apply,fail){
   if(!current()||busy||forbidden)return;
   const id=scope,at=generation;let timer;
   const live=()=>current()&&scope===id&&generation===at;
   stopPreview();busy=true;disable();status('확인 중…');
   try{
    const out=await Promise.race([api(args),new Promise((_,r)=>{timer=root.setTimeout(()=>r(Error('timeout')),timeout);})]);
    if(out.error)throw out.error;if(live())apply(out.data);
   }catch(e){if(live()){if(e?.code==='42501'&&e?.message!=='BADGE_REVIEW_REQUIRED'){
      forbidden=true;clearReview();note('뱃지 관리 권한을 확인해 주세요.');
    }
    status(labels[e?.message]||'결과를 확인하지 못했어요. 다시 확인해 주세요.');fail?.(e);}}
   finally{root.clearTimeout(timer);if(live()){busy=false;disable();}}
  }
  function showPreview(data,snapshot,offset){
   if(offset===0&&typeof data?.duplicate?.name==='string'&&
     (typeof data.duplicate.id==='string'||/^\d+$/.test(data.duplicate.badge_id||''))){
    duplicate=data.duplicate;p('duplicate-name').textContent=duplicate.name;p('duplicate').hidden=false;
    note(labels.BADGE_RULE_DUPLICATE);return;
   }
   if(typeof data?.review!=='string'||!data.review||!Array.isArray(data.items)||!Number.isInteger(data.count)||
      data.count<offset||data.offset!==offset||data.items.length!==Math.min(50,data.count-offset)||
      (data.pending!=null&&(!Number.isInteger(data.pending)||data.pending<0))||
      typeof data.saved!=='boolean'||data.items.some(p=>typeof p?.name!=='string'||!Array.isArray(p.reasons)||
       !p.reasons.length||p.reasons.some(k=>!snapshot.rules.some(r=>ruleId(r)===k))))throw Error('BADGE_REVIEW_INVALID');
   const before=review,expires=offset===0?Date.now()+570000:before.expires;
   review={...data,local:fingerprint(snapshot),shown:offset+data.items.length,expires};
   p('summary').textContent=snapshot.rules.length&&(!data.pending||data.count)?data.count.toLocaleString('ko-KR')+'명':'—';
   note(data.pending?'기록을 확인할 수 없는 '+data.pending.toLocaleString('ko-KR')+'명은 판정을 보류했어요.':
    snapshot.rules.length?(data.count?'조건을 충족한 조합원이에요.':'조건을 충족한 조합원이 없어요.'):'직접 부여하는 뱃지입니다.');
   const list=p('people');if(!offset)list.replaceChildren();
   for(const row of data.items){
    const li=make('li'),name=make('strong',[row.name,row.number].filter(Boolean).join(' · '));
    const reasons=(row.reasons||[]).flatMap(key=>{const rule=snapshot.rules.find(x=>ruleId(x)===key);if(!rule)return [];
     if(countType(rule.key))return [periods[rule.period]+' '+catalog[rule.key].label+' '+rule.value+catalog[rule.key].unit+' '+comparisons[rule.op]];
     return [catalog[key].label+' '+(typeof rule.value==='number'?rule.value.toLocaleString('ko-KR'):rule.value)+(catalog[key].type==='number'?catalog[key].unit:'')];});
    const avatar=make('span',Array.from(row.name.trim())[0]||'·','bre-avatar');avatar.setAttribute('aria-hidden','true');
    const entry=make('div');entry.append(name,make('div',reasons.join(' · '),'small text-body-secondary'));
    li.append(avatar,entry);list.append(li);
   }
   list.hidden=!review.shown;list.tabIndex=0;
   if(offset===0){root.clearTimeout(expiryTimer);expiryTimer=root.setTimeout(()=>{if(current())queuePreview();},expires-Date.now());}
  }
  const target=()=>page().receipt?{p_id:page().receipt.id,p_revision:page().receipt.revision}:{};
  function queuePreview(){
   clearReview();
   const x=page();
   if(forbidden){note('뱃지 관리 권한을 확인해 주세요.');disable();return;}
   if(x.receipt?.badge_id||s.pending||!p('draft-list').hidden){disable();return;}
   if(!x.fields.rules.length&&!x.receipt){note('조건을 추가하면 대상을 볼 수 있어요.');disable();return;}
   let data;try{data=valid();}catch(e){note(e.message);disable();return;}
   note('대상을 확인하고 있어요.');disable();
   previewTimer=root.setTimeout(()=>{
    previewTimer=null;if(current()&&page()===x&&safeFingerprint()===fingerprint(data))void preview(data);
   },previewDelay);
  }
  async function preview(snapshot,offset=0){
   if(!current()||busy||s.pending||forbidden||previewWork||!p('draft-list').hidden)return;
   if(offset&&(!proofCurrent()||review.shown!==offset||offset>=review.count))return;
   const x=page(),at=generation,proof=offset?review.review:null,local=fingerprint(snapshot);
   const task=previewWork={abort:new root.AbortController()};let deadline;
   const live=()=>previewWork===task&&current()&&generation===at&&page()===x&&!busy&&safeFingerprint()===local;
   try{
    const call=api({p_action:'preview',...target(),p_fields:snapshot,p_offset:offset,...(proof?{p_review:proof}:{})});
    const pending=typeof call?.abortSignal==='function'?call.abortSignal(task.abort.signal):call;
    const out=await Promise.race([pending,new Promise((_,reject)=>{deadline=root.setTimeout(()=>{task.abort.abort();reject(Error('timeout'));},timeout);})]);
    if(!live())return;
    if(out.error)throw out.error;
    if(offset&&(out.data?.review!==proof||out.data?.count!==review.count||out.data?.saved!==review.saved||out.data?.pending!==review.pending))throw Error('BADGE_REVIEW_CHANGED');
    showPreview(out.data,snapshot,offset);
   }catch(e){if(live()){
    if(e?.code==='42501'){
     const scoped=['QUIZ_ADMIN_PERMISSION_REQUIRED','QUIZ_ADMIN_AUTH_REQUIRED','PARTICIPATION_ADMIN_REQUIRED','PARTICIPATION_AUTH_REQUIRED','PREFERENCE_POLL_ADMIN_REQUIRED'].includes(e.message);
     if(!scoped)forbidden=true;clearReview();note(labels[e?.message]||'이 조건을 조회할 권한을 확인해 주세요.');
    }
    else if(offset&&e?.code!=='PT409'&&e?.message!=='BADGE_REVIEW_CHANGED'){note('나머지 대상을 불러오지 못했어요.');}
    else if(offset)queuePreview();
    else{clearReview();note(labels[e?.message]||'대상을 불러오지 못했어요.');}
   }}finally{root.clearTimeout(deadline);if(previewWork===task)previewWork=null;if(current())disable();}
  }
  function receipt(data,action){
   if(!data?.id||!data.fields)throw Error('NO_BADGE_RECEIPT');
   if(action==='create')s.pages.set('new',{fields:newFields(),receipt:null});
   s.id=data.id;s.pages.set(s.id,{receipt:data,fields:{...data.fields,rules:data.fields.rules.map(x=>({...x}))}});s.pending=null;
   hydrate();status(data.badge_id?'활성화했어요. '+(data.awarded_count?data.awarded_count.toLocaleString('ko-KR')+'명에게 지급했습니다.':''):'초안을 저장했어요.');
   if(data.badge_id){stopIdeas();void lookupIdeas();void Promise.resolve(onActivated(scope)).catch(()=>{});}
  }
  function mutate(args){
   if(!current()||busy||forbidden)return;
   s.pending=args;
   request(args,d=>receipt(d,args.p_action),e=>{
    if(labels[e?.message]){s.pending=null;if(e.message.startsWith('BADGE_REVIEW')||['BADGE_RULE_DUPLICATE','BADGE_RULE_EVIDENCE_PENDING'].includes(e.message))queuePreview();}
    else status('저장 결과를 아직 확인하지 못했어요.');
   });
  }
  function save(){
   if(!current()||busy||s.pending||forbidden||!p('draft-list').hidden)return;
   let data;try{data=valid();}catch(e){status(e.message);return;}
   if(data.rules.length&&!proofCurrent()){status(labels.BADGE_REVIEW_REQUIRED);return;}
   const existing=page().receipt,newId=!existing&&root.crypto?.randomUUID?.();
   if(!existing&&!newId){status('보안 연결에서 다시 열어 주세요.');return;}
   mutate({p_action:existing?'save':'create',...target(),...(newId?{p_request:newId}:{}),p_fields:data,...(proofCurrent()?{p_review:review.review}:{})});
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
   page().fields=read();page().beforeReset=null;
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
   page().beforeReset=null;
   p('draft-list').hidden=false;clearReview();const offset=more?s.draftOffset:0;
   if(!more)p('draft-items').replaceChildren();
   request({p_action:'list',p_offset:offset},data=>{
    if(!Array.isArray(data?.items))throw Error('BADGE_DRAFT_LIST_INVALID');
    for(const row of data.items)p('draft-items').append(makeButton(row.fields.name,()=>selectDraft(row.id)));
    s.draftOffset=offset+data.items.length;p('draft-more').hidden=!data.more;status(data.items.length?'':'저장한 초안이 없어요.');
   });
  }
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',e=>{if(current()&&e.target!==p('search')&&e.target!==p('idea'))changed();});
  p('idea').addEventListener('input',()=>{if(editing()){page().idea=p('idea').value;page().beforeReset=null;showIdea('');disable();}});
  p('idea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(!e.repeat)makeIdea();}});
  p('idea-make').onclick=makeIdea;
  p('idea-manual').onclick=()=>{if(!current())return;p('search').value='';options();p('search').focus();};
  p('idea-refresh').onclick=()=>{
   if(!editing())return;
   if(s.ideaFailed){void lookupIdeas();return;}
   const count=checkIdeas?Math.ceil((s.ideaPool?.length??0)/2):ideaSets.length;
   if(count>1){s.ideaSet=(s.ideaSet+1)%count;paintIdeas(true);}
  };
  for(const b of exampleButtons)b.onclick=()=>{
   if(!editing())return;page().beforeReset=null;page().idea=p('idea').value=b.dataset.ideaExample;showIdea('');disable();p('idea').focus({preventScroll:true});
  };
  p('reset').onclick=reset;p('undo-reset').onclick=undoReset;
  p('search').addEventListener('input',()=>{if(current()&&!p('picker').hidden)options();});
  p('search').addEventListener('keydown',e=>{
   if(e.isComposing)return;
   if(e.key==='ArrowDown'){e.preventDefault();if(p('options').hidden)options();p('options').querySelector('button')?.focus();}
   if(e.key==='Enter'&&!p('options').hidden){e.preventDefault();if(!e.repeat)p('options').querySelector('button')?.click();}
   if(e.key==='Escape'&&!p('options').hidden){e.preventDefault();e.stopPropagation();options(false);p('add').focus({preventScroll:true});}
  });
  p('add').onclick=()=>{options(p('options').hidden);if(!p('options').hidden)p('search').focus();};
  p('close').onclick=()=>invalidate(true);dialog.addEventListener('cancel',e=>{e.preventDefault();invalidate(true);});
  p('save').onclick=save;
  p('duplicate-open').onclick=()=>{
   if(!current()||!duplicate||busy||s.pending)return;
   const found=duplicate;
   if(found.id){selectDraft(found.id);return;}
   request({p_action:'open_existing',p_fields:{badge_id:found.badge_id}},data=>{
    if(data?.badge_id!==found.badge_id||typeof data.name!=='string')throw Error('BADGE_DRAFT_NOT_FOUND');
    p('existing-name').textContent=[data.icon,data.name].filter(Boolean).join(' ');
    p('existing-condition').textContent='납입 출자금 '+Number(data.value).toLocaleString('ko-KR')+'원 이상'+(data.active?'':' · 비활성');
    p('existing-description').textContent=data.description||'';p('existing').hidden=false;
    p('existing').focus({preventScroll:true});status('');
   });
  };
  p('existing-close').onclick=()=>{p('existing').hidden=true;if(!p('duplicate').hidden)p('duplicate-open').focus({preventScroll:true});};
  p('people').addEventListener('scroll',()=>{
   const list=p('people');
   if(!proofCurrent()||previewWork||review.shown>=review.count||review.shown>100000||
      list.scrollTop+list.clientHeight<list.scrollHeight-24)return;
   const x=review;try{void preview(valid(),x.shown);}catch(_){}
  });
  p('activate').onclick=()=>{
   if(!current()||busy||s.pending||forbidden||!p('draft-list').hidden||!proofCurrent()||!review.saved||review.pending)return;
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
 root.AdminBadgeRuleEditor=Object.freeze({version:'1.6.0',mount,suggest});
})(window);
