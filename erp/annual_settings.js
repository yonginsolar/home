/* Annual insurance/common settings v1.1.0. Drafts stay in owner-scoped memory. */
(function(global){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentYear=()=>Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const groups={pension:['pension_rate_emp','pension_rate_biz'],health:['health_rate_emp','health_rate_biz'],care:['care_rate_ratio'],employ:['employ_rate_emp']};
 const insurance=[...Object.values(groups).flat(),'employ_rate_biz_extra','worker_comp_rate'];
 const drafts=new Map(),reads=new Map();
 let api,root,tenantRoot,snapshot=null,year=currentYear(),period=`${year}-01-01`,activeOwner='',generation=0,pending=null,reading=false,readFailed=false,pastEdit=false,baseline={};
 const owner=()=>String(api?.owner?.()??'annual-settings');
 const key=(o=activeOwner,y=year,d=period)=>`${o}|${y}|${d}`;
 const elements=()=>[...document.querySelectorAll('[data-annual-value],[data-annual-control],#annualSource')];
 const raw=el=>el.hasAttribute('data-number-group')?global.ERPNumberInput.raw(el.value):el.value;
 const state=()=>Object.fromEntries(elements().map(el=>[el.id,el.type==='checkbox'?el.checked:raw(el)]));
 const canonical=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 function stash(){if(snapshot&&activeOwner)drafts.set(key(),{snapshot,fields:state(),baseline:{...baseline},pastEdit});}
 function dirty(){stash();return [...drafts].some(([k,d])=>k.startsWith(owner()+'|')&&!same(d.fields,d.baseline));}
 function status(text,error=false){const el=document.getElementById('annualSettingsStatus');if(!el)return;el.textContent=text;el.className='small mt-2 '+(error?'text-danger':'text-secondary');el.setAttribute('role','status');if(error){const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline-primary btn-sm ms-2';retry.textContent='최신 기준 다시 확인';retry.dataset.annualRead='true';el.append(retry);}}
 function message(error){return ({SETTINGS_ACCESS_DENIED:'이 설정을 조회하거나 수정할 권한이 없습니다.',HR_SETTINGS_CONTEXT_CHANGED:'현재 계정과 조합을 다시 확인해 주세요.',COMMON_SETTINGS_READ_ONLY:'공통 기준은 조회만 가능합니다.',SETTINGS_STALE_VERSION:'다른 관리자가 먼저 저장했습니다. 작성값은 남아 있습니다. 다시 불러온 기준과 확인해 주세요.',SETTINGS_SOURCE_REQUIRED:'적용 근거를 입력해 주세요.',SETTINGS_PAYROLL_VALUES_REQUIRED:'적용할 보험 요율·비과세 한도·지방소득세 기준을 모두 입력해 주세요.',SETTINGS_YEAR_NOT_REGISTERED:'해당 연도의 공통 기준이 아직 적용 등록되지 않았습니다.',SETTINGS_INSURANCE_CONFIRMATION_REQUIRED:'미확인 요율의 공식 근거와 확인 여부를 확인해 주세요.',SETTINGS_EMPLOYER_RATE_AMBIGUOUS:'사업주 고용보험 추가분을 다시 확인해 주세요.',SETTINGS_EMPLOYER_RATES_REQUIRED:'조합별로 적용할 보험 요율을 입력해 주세요.',ANNUAL_READ_TIMEOUT:'조회가 지연되고 있습니다. 다시 불러오기를 눌러 주세요.'})[error?.message]||'설정을 처리하지 못했습니다. 입력 내용을 유지한 채 다시 확인해 주세요.';}
 const editable=scope=>!!snapshot?.[scope==='common'?'can_edit_common':'can_edit_tenant'];
 const context=()=>({owner:activeOwner,key:key(),generation,signature:JSON.stringify(state())});
 const isCurrent=c=>c.owner===owner()&&c.owner===activeOwner&&c.key===key()&&c.generation===generation&&!global.frameElement?.hidden;
 function lock(){
  document.querySelectorAll('[data-annual-nav]').forEach(el=>el.disabled=!!pending);
  document.querySelectorAll('[data-annual-action]').forEach(el=>el.disabled=!!pending||reading||readFailed);
  elements().forEach(el=>{el.disabled=!!pending||!editable(el.dataset.scope)||(year<currentYear()&&!pastEdit)||el.dataset.inherited==='true';});
 }
 function years(){
  const list=[...new Set([currentYear()-1,currentYear(),currentYear()+1,year,...(snapshot?.years||[])])].sort((a,b)=>b-a);
  document.getElementById('settingTargetYear').innerHTML=list.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}년</option>`).join('');
  document.getElementById('annualYearTabs').innerHTML=[currentYear()-1,currentYear(),currentYear()+1].map(y=>`<button type="button" data-annual-nav data-year="${y}" class="btn ${y===year?'btn-primary':'btn-outline-secondary'} flex-fill">${y}년 · ${y===currentYear()?'올해':y<currentYear()?'지난해':'내년'}</button>`).join('');
  document.getElementById('annualYearLabel').textContent=`${year}년 ${year>currentYear()?'· 적용 예정':year<currentYear()?'· 과거 기준':''}`;
  document.getElementById('annualPastEdit').hidden=year>=currentYear()||pastEdit||!(editable('common')||editable('tenant'));
 }
 function field(scope,k,values,label){
  const s=snapshot.catalog[scope][k];if(!s)return '';
  const v=values[k],n=v==null?'':s.unit==='%'?Number((v*100).toFixed(6)):v;
  return `<div class="annual-field"><label for="annual-${scope}-${k}">${esc(label||s.label)} <span class="text-secondary">(${esc(s.unit)})</span></label><input class="form-control form-control-sm" type="number" ${s.unit==='원'?'data-number-group':''} min="${s.min||0}" max="${s.max*(s.unit==='%'?100:1)}" step="${s.unit==='%'?'0.0001':['원','일','개월'].includes(s.unit)?'1':'0.01'}" id="annual-${scope}-${k}" data-annual-value="${k}" data-scope="${scope}" data-unit="${esc(s.unit)}" value="${esc(n)}"></div>`;
 }
 function output(id,label){return `<div class="annual-field"><span>${esc(label)}</span><output id="annual-${id}" class="annual-total">확인 필요</output></div>`;}
 function override(k,values,label){
  const legacy=k==='employ_rate_biz_extra'&&values.employ_rate_biz!=null&&!Object.hasOwn(values,k),base=snapshot.legacy_employ_base,v={...values};
  if(legacy&&base!=null&&values.employ_rate_biz>=base)v[k]=Number((values.employ_rate_biz-base).toFixed(8));
  const mode=Object.hasOwn(values,k)?'own':legacy?'legacy':'common';
  return `<div class="annual-override"><label for="annual-mode-${k}">적용 기준</label><select id="annual-mode-${k}" data-annual-control data-scope="tenant" class="form-select form-select-sm" aria-label="${esc(label)} 적용 기준">${legacy?'<option value="legacy">기존 등록값 유지</option>':''}<option value="common">공통 기준 사용</option><option value="own">조합별 직접 입력</option></select>${field('tenant',k,v,label)}<span id="annual-origin-${k}" class="small text-secondary"></span><input type="hidden" id="annual-initial-mode-${k}" value="${mode}"></div>`;
 }
 function review(g){const ref=snapshot.insurance_reference?.[g];return `<div class="annual-review" data-review="${g}"><span id="annual-review-state-${g}"></span>${ref?.source_url?` <a href="${esc(ref.source_url)}" target="_blank" rel="noopener noreferrer">공식 근거 보기</a>`:''}<div id="annual-proof-${g}" class="mt-2"><label class="d-flex gap-2 align-items-start"><input id="annual-confirm-${g}" type="checkbox" data-annual-control data-scope="common"><span>해당 연도의 공식 자료와 입력 요율이 일치함을 확인했습니다.</span></label><label for="annual-proof-source-${g}">확인한 근거</label><input id="annual-proof-source-${g}" class="form-control form-control-sm" maxlength="3000" data-annual-control data-scope="common" placeholder="공식 고시·안내 자료의 제목 또는 주소"></div></div>`;}
 function render(){
  years();const c={...(snapshot.common?.values_json||snapshot.common_template||{})},t={...(snapshot.tenant?.values_json||snapshot.tenant_template||{})};
  if(!snapshot.common){Object.values(groups).flat().forEach(k=>delete c[k]);for(const ref of Object.values(snapshot.insurance_reference||{}))if(ref.confirmed)Object.assign(c,ref.values);}
  const ready=snapshot.common?.status==='published';document.getElementById('annualCommonState').textContent=ready?(period>today()?'등록됨 · 적용 예정':'등록됨'):'미등록 · 초안';
  const row=(g,title,body,note='')=>`<section class="annual-insurance-row" data-insurance="${g}" aria-labelledby="annual-heading-${g}"><h3 id="annual-heading-${g}">${title}</h3><div class="annual-insurance-fields">${body}</div>${note?`<p class="small text-secondary mb-0">${note}</p>`:''}${groups[g]?review(g):''}</section>`;
  root.innerHTML=`<div class="annual-insurance"><div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3"><p class="small text-secondary mb-0">법정 요율은 공통 기준을 사용하고, 사업장별 항목만 조합에 맞게 설정합니다.</p>${editable('common')?'<button type="button" class="btn btn-outline-primary btn-sm" data-annual-action="reference">확정 요율 불러오기</button>':''}</div>`+
   row('pension','국민연금',field('common','pension_rate_emp',c,'근로자')+field('common','pension_rate_biz',c,'사업주')+output('pension-total','전체'))+
   row('health','건강보험',field('common','health_rate_emp',c,'근로자')+field('common','health_rate_biz',c,'사업주')+output('health-total','전체'))+
   row('care','장기요양보험',field('common','care_rate_ratio',c,'건강보험료 대비')+output('care-emp','근로자')+output('care-biz','사업주')+output('care-total','전체'),'근로자·사업주가 각각 부담하는 건강보험료에 같은 비율을 곱합니다. 보수 대비 보험료율과는 다릅니다.')+
   row('employ','고용보험',field('common','employ_rate_emp',c,'근로자')+output('employ-base','사업주 기본분')+field('common','employ_rate_biz_extra',c,'사업주 추가분 · 공통 기본값')+override('employ_rate_biz_extra',t,'사업주 추가분 · 우리 조합')+output('employ-biz','사업주 합계')+output('employ-total','전체'),'사업주 추가분은 사업장 규모 등에 따라 달라집니다. 공통 기본값이 없으면 우리 조합의 적용값을 입력해 주세요.')+
   row('worker_comp','산재보험',output('worker-emp','근로자')+field('common','worker_comp_rate',c,'사업주 · 공통 기본값')+override('worker_comp_rate',t,'사업주 · 우리 조합')+output('worker-total','전체'),'사업장 업종에 따른 적용 요율을 확인해 주세요.')+
   `<details class="mt-3 border rounded p-3"><summary class="fw-semibold">비과세·세무 공통 기준</summary><div class="row g-3 mt-1">${Object.keys(snapshot.catalog.common).filter(k=>!insurance.includes(k)).map(k=>`<div class="col-12 col-sm-6">${field('common',k,c)}</div>`).join('')}</div></details><label class="form-label small mt-3 mb-1" for="annualSource">적용 근거</label><textarea id="annualSource" data-scope="common" class="form-control form-control-sm" rows="3" maxlength="3000">${esc(snapshot.common?.source_note||referenceNotes())}</textarea><div class="d-flex flex-wrap gap-2 mt-3">${editable('common')?`${!ready?'<button type="button" class="btn btn-outline-primary btn-sm" data-annual-action="draft">공통 기준 초안 저장</button>':''}<button type="button" class="btn btn-primary btn-sm" data-annual-action="common">${year}년 공통 기준 ${ready?'수정 저장':'확인 후 적용'}</button>`:'<span class="badge text-bg-light border">공통 기준 · 조회 전용</span>'}${editable('tenant')?'<button type="button" class="btn btn-outline-primary btn-sm" data-annual-action="tenant">조합별 설정 저장</button>':''}</div></div>`;
  tenantRoot.innerHTML=`<p class="small text-secondary">고용보험 사업주 추가분·산재보험은 ‘공통 기준’의 보험별 행에서 설정합니다.</p><div class="row g-3">${Object.keys(snapshot.catalog.tenant).filter(k=>!['employ_rate_biz',...insurance].includes(k)).map(k=>`<div class="col-12 col-sm-6">${field('tenant',k,t)}</div>`).join('')}</div>${editable('tenant')?'<button type="button" class="btn btn-primary btn-sm mt-3" data-annual-action="tenant">조합별 설정 저장</button>':''}`;
  for(const k of ['employ_rate_biz_extra','worker_comp_rate'])document.getElementById('annual-mode-'+k).value=document.getElementById('annual-initial-mode-'+k).value;
  for(const g of Object.keys(groups)){const proof=snapshot.common?.insurance_confirmations?.[g];if(proof?.kind==='manual'){document.getElementById('annual-confirm-'+g).checked=same(proof.values,groupValues(g));document.getElementById('annual-proof-source-'+g).value=proof.source_note||'';}}
  document.getElementById('annualPeriod').innerHTML=[...new Set([`${year}-01-01`,period,...(snapshot.periods||[])])].sort().map(d=>`<option value="${d}" ${d===period?'selected':''}>${d.slice(5,7)}월부터</option>`).join('');
  document.getElementById('annualAddPeriod').hidden=!(editable('common')||editable('tenant'));document.getElementById('annualMonth').value=period.slice(5,7);
  global.ERPNumberInput.refresh(root);global.ERPNumberInput.refresh(tenantRoot);sync();baseline=state();
 }
 function referenceNotes(){return Object.values(snapshot.insurance_reference||{}).filter(r=>r.confirmed).map(r=>r.source_note).join('\n');}
 function number(scope,k){const el=document.getElementById(`annual-${scope}-${k}`);return !el||el.value.trim()===''?null:Number((Number(raw(el))/(el.dataset.unit==='%'?100:1)).toFixed(8));}
 function groupValues(g){return Object.fromEntries(groups[g].map(k=>[k,number('common',k)]));}
 const pct=n=>n==null||!Number.isFinite(n)?'확인 필요':`${Number((n*100).toFixed(6))}%`;
 function sync(){
  if(!snapshot)return;const put=(id,v)=>{const el=document.getElementById('annual-'+id);if(el)el.textContent=v;};
  const sum=(a,b)=>a==null||b==null?null:a+b;
  put('pension-total',pct(sum(number('common','pension_rate_emp'),number('common','pension_rate_biz'))));put('health-total',pct(sum(number('common','health_rate_emp'),number('common','health_rate_biz'))));
  const ratio=pct(number('common','care_rate_ratio'));for(const side of ['emp','biz'])put('care-'+side,`본인 부담 건강보험료 × ${ratio}`);put('care-total',`건강보험료 합계 × ${ratio}`);
  const own=snapshot.tenant?.values_json||snapshot.tenant_template||{};
  for(const k of ['employ_rate_biz_extra','worker_comp_rate']){const mode=document.getElementById('annual-mode-'+k).value,el=document.getElementById('annual-tenant-'+k);el.dataset.inherited=String(mode!=='own');document.getElementById('annual-origin-'+k).textContent=mode==='common'?`공통 적용값: ${pct(number('common',k))}`:mode==='legacy'?`기존 사업주 총요율 ${pct(own.employ_rate_biz)} · 추가분은 당시 공통 기준으로 구분`:'조합별 적용값';}
  const mode=document.getElementById('annual-mode-employ_rate_biz_extra').value,base=number('common','employ_rate_emp'),extra=mode==='common'?number('common','employ_rate_biz_extra'):number('tenant','employ_rate_biz_extra'),biz=mode==='legacy'&&extra==null?own.employ_rate_biz:sum(base,extra);
  put('employ-base',pct(base));put('employ-biz',pct(biz));put('employ-total',pct(sum(base,biz)));put('worker-emp','부담 없음');put('worker-total',pct(document.getElementById('annual-mode-worker_comp_rate').value==='common'?number('common','worker_comp_rate'):number('tenant','worker_comp_rate')));
  for(const g of Object.keys(groups)){const ref=snapshot.insurance_reference?.[g],official=ref?.confirmed&&same(groupValues(g),ref.values);document.getElementById('annual-review-state-'+g).textContent=official?'공식 확정 요율과 일치':document.getElementById('annual-confirm-'+g).checked?'입력 요율 확인됨':'확인 필요 · 해당 연도 공식 자료를 확인해 주세요.';document.getElementById('annual-proof-'+g).hidden=!!official;}lock();
 }
 function restore(values){for(const [id,v] of Object.entries(values)){const el=document.getElementById(id);if(el){if(el.type==='checkbox')el.checked=v;else el.value=v;}}global.ERPNumberInput.refresh(root);global.ERPNumberInput.refresh(tenantRoot);sync();}
 function readRpc(args){const k=key(owner(),args.p_year,args.p_effective_on);if(reads.has(k))return reads.get(k);let timer;const p=Promise.race([Promise.resolve().then(()=>api.rpc(args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ANNUAL_READ_TIMEOUT')),15000);})]).finally(()=>{clearTimeout(timer);if(reads.get(k)===p)reads.delete(k);});reads.set(k,p);return p;}
 async function load(y=year,d=`${y}-01-01`,rebase=false){
  if(pending)return;stash();const o=owner(),token=++generation,sameSelection=o===activeOwner&&Number(y)===year&&d===period;
  if(!sameSelection){snapshot=null;baseline={};root.innerHTML='';tenantRoot.innerHTML='';}activeOwner=o;year=Number(y);period=d;reading=true;readFailed=false;lock();status('설정을 불러오는 중입니다.');
  try{if(!o)throw Error('HR_SETTINGS_CONTEXT_CHANGED');const result=await readRpc({p_action:'get',p_year:year,p_effective_on:period});if(token!==generation||o!==owner())return;if(result.error)throw result.error;
   if(sameSelection)stash();const draft=drafts.get(key()),keep=draft&&!same(draft.fields,draft.baseline);snapshot=keep&&!rebase?{...draft.snapshot,can_edit_common:result.data.can_edit_common,can_edit_tenant:result.data.can_edit_tenant,insurance_reference:result.data.insurance_reference}:result.data;
   pastEdit=keep?draft.pastEdit:false;reading=false;render();if(keep){restore(rebase?Object.fromEntries(Object.entries(draft.fields).filter(([id,v])=>v!==draft.baseline[id])):draft.fields);if(!rebase)baseline=draft.baseline;}stash();status(keep?'작성 중인 설정을 이어서 확인할 수 있습니다.':'');
  }catch(error){if(token!==generation||o!==owner())return;reading=false;readFailed=true;lock();status(message(error),true);throw error;}
 }
 function collect(scope){const values={};document.querySelectorAll(`[data-annual-value][data-scope="${scope}"]`).forEach(el=>{if(el.dataset.inherited==='true'||el.value.trim()==='')return;const n=Number(raw(el));if(!Number.isFinite(n)||n<Number(el.min)||n>Number(el.max))throw Error('SETTINGS_INVALID_VALUE');values[el.dataset.annualValue]=el.dataset.unit==='%'?Number((n/100).toFixed(8)):n;});
  if(scope==='tenant')for(const k of ['employ_rate_biz_extra','worker_comp_rate']){const mode=document.getElementById('annual-mode-'+k).value;if(mode==='own'&&values[k]==null)throw Error('SETTINGS_EMPLOYER_RATES_REQUIRED');if(mode==='legacy'){const n=number('tenant',k);if(n!=null)values[k]=Number(n.toFixed(8));else values.employ_rate_biz=(snapshot.tenant?.values_json||snapshot.tenant_template).employ_rate_biz;}}return values;
 }
 function proofs(publish){const out={};for(const g of Object.keys(groups)){const ref=snapshot.insurance_reference?.[g],values=groupValues(g);if(ref?.confirmed&&same(values,ref.values))continue;const checked=document.getElementById('annual-confirm-'+g).checked,note=document.getElementById('annual-proof-source-'+g).value;if(checked&&note.trim())out[g]={kind:'manual',values,source_note:note};else if(publish)throw Error('SETTINGS_INSURANCE_CONFIRMATION_REQUIRED');}return out;}
 async function save(kind){
  if(pending||reading||readFailed||!snapshot||owner()!==activeOwner||global.frameElement?.hidden)return;if(year<currentYear()&&!pastEdit)return status('과거 기준 수정 버튼을 먼저 눌러 주세요.',true);
  const scope=kind==='tenant'?'tenant':'common';if(!editable(scope))return;const ctx=context(),op={};pending=op;lock();
  try{
   if(kind==='reference'){if(!await api.confirm('확정된 보험 요율과 적용 근거를 불러올까요?'))return;if(!isCurrent(ctx)||ctx.signature!==JSON.stringify(state()))return;for(const r of Object.values(snapshot.insurance_reference||{}))if(r.confirmed)for(const [k,v] of Object.entries(r.values))document.getElementById('annual-common-'+k).value=Number((v*100).toFixed(6));document.getElementById('annualSource').value=referenceNotes();for(const g of Object.keys(groups))document.getElementById('annual-confirm-'+g).checked=false;sync();status('확정 요율을 불러왔습니다. 확인 후 적용해 주세요.');return;}
   const values=collect(scope),source=document.getElementById('annualSource').value,confirmations=scope==='common'?proofs(kind==='common'):{};
   if(kind==='common'&&!source.trim())throw Error('SETTINGS_SOURCE_REQUIRED');if(kind==='common'&&!await api.confirm(`${year}년 ${period.slice(5,7)}월부터 적용할 공통 기준을 저장할까요?`))return;
   if(!isCurrent(ctx)||ctx.signature!==JSON.stringify(state()))return;status('저장 중입니다.');const result=await api.rpc({p_action:scope==='common'?'save_common':'save_tenant',p_year:year,p_effective_on:period,p_values:scope==='common'?{values,confirmations}:values,p_expected_revision:snapshot[scope]?.revision||0,p_publish:kind==='common',p_source_note:source});if(result.error)throw result.error;
   if(!isCurrent(ctx))return;const other=Object.fromEntries(elements().filter(el=>el.dataset.scope!==scope).map(el=>[el.id,el.type==='checkbox'?el.checked:raw(el)]));snapshot=result.data;render();restore(other);stash();status(`${year}년 ${scope==='common'?'공통 기준':'조합별 설정'}을 ${kind==='draft'?'초안으로 ':''}저장했습니다.`);
  }catch(error){if(isCurrent(ctx))status(message(error),true);}finally{if(pending===op){pending=null;sync();stash();}}
 }
 function init(options){
  api=options;root=document.getElementById('annualCommonFields');tenantRoot=document.getElementById('annualTenantFields');if(!root||root.dataset.bound)return;root.dataset.bound='true';const navigate=(y,d)=>{if(!pending)load(Number(y),d).catch(()=>{});};
  document.getElementById('annualSettingsNav').addEventListener('click',e=>{const b=e.target.closest('[data-year]');if(b)navigate(b.dataset.year);});document.getElementById('settingTargetYear').addEventListener('change',e=>navigate(e.target.value));document.getElementById('annualPeriod').addEventListener('change',e=>navigate(year,e.target.value));
  document.getElementById('annualMonth').innerHTML=Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${i+1}월</option>`).join('');document.getElementById('annualAddPeriod').addEventListener('click',()=>navigate(year,`${year}-${document.getElementById('annualMonth').value}-01`));document.getElementById('annualPastEdit').addEventListener('click',()=>{pastEdit=true;years();sync();});
  const modal=document.getElementById('settingsModal');modal.addEventListener('click',async e=>{if(e.target.closest('[data-annual-read]')){if(pending||reading)return;const ctx=context(),op={};pending=op;lock();let approved=false;try{approved=!dirty()||await api.confirm('작성한 변경사항을 유지하고 최신 기준을 다시 불러올까요?');}finally{if(pending===op){pending=null;lock();}}if(approved&&isCurrent(ctx)&&ctx.signature===JSON.stringify(state()))load(year,period,true).catch(()=>{});return;}const b=e.target.closest('[data-annual-action]');if(b)void save(b.dataset.annualAction);});
  modal.addEventListener('input',e=>{const el=e.target;if(!el.matches('[data-annual-value],[data-annual-control],#annualSource'))return;const g=Object.keys(groups).find(g=>groups[g].includes(el.dataset.annualValue));if(g&&el.dataset.scope==='common')document.getElementById('annual-confirm-'+g).checked=false;sync();stash();});
  modal.addEventListener('change',e=>{if(e.target.matches('select[data-annual-control],input[type=checkbox][data-annual-control]')){sync();stash();}});modal.addEventListener('hide.bs.modal',e=>{if(pending){e.preventDefault();return;}stash();++generation;});
  if(global.frameElement)new MutationObserver(()=>{if(global.frameElement.hidden){stash();++generation;}}).observe(global.frameElement,{attributes:true,attributeFilter:['hidden']});
 }
 global.ERPAnnualSettings={init,load,save,isDirty:dirty,isBusy:()=>!!pending,errorMessage:message,currentYear,selection:()=>({year,period}),version:'1.1.0'};
})(window);
