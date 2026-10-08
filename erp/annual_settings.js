/* Annual common / tenant settings. ERP light theme only. */
(function(global){
 'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentYear=()=>Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
 const today=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const value=type=>parts.find(p=>p.type===type).value;return `${value('year')}-${value('month')}-${value('day')}`;};
 const mainKeys=['pension_rate_emp','pension_rate_biz','health_rate_emp','health_rate_biz','care_rate_ratio','employ_rate_emp'];
 let api,root,tenantRoot,year=currentYear(),period=`${year}-01-01`,snapshot=null,sequence=0,busy=false,pastEdit=false,baseline='',closingApproved=false;
 function message(error){return ({SETTINGS_ACCESS_DENIED:'이 설정을 조회하거나 수정할 권한이 없습니다.',COMMON_SETTINGS_READ_ONLY:'공통 기준은 조회만 가능합니다.',SETTINGS_STALE_VERSION:'다른 관리자가 먼저 저장했습니다. 입력 내용은 유지됩니다. 다시 불러온 뒤 확인해 주세요.',SETTINGS_SOURCE_REQUIRED:'적용 근거를 입력해 주세요.',SETTINGS_PAYROLL_VALUES_REQUIRED:'보험 요율·비과세 한도·지방소득세 기준을 모두 입력해 주세요.',SETTINGS_YEAR_NOT_REGISTERED:'해당 연도의 공통 기준이 아직 등록되지 않았습니다.',SETTINGS_EMPLOYER_RATES_REQUIRED:'사업주 고용보험·산재보험 요율을 조합별 설정에 입력해 주세요.'})[error?.message]||error?.message||'설정을 불러오지 못했습니다.';}
 const status=(text,error=false)=>{const el=document.getElementById('annualSettingsStatus');if(el){el.textContent=text;el.className='small mt-2 '+(error?'text-danger':'text-secondary');}};
 function inputs(){return [...document.querySelectorAll('[data-annual-value],#annualSource')];}
 function fingerprint(){return JSON.stringify(inputs().map(el=>[el.id,el.value]));}
 function dirty(){return snapshot!==null&&fingerprint()!==baseline;}
 async function confirmDiscard(){return !dirty()||await api.confirm('저장하지 않은 설정이 있습니다. 변경 내용을 버리고 이동할까요?');}
 function lock(){document.querySelectorAll('[data-annual-nav],[data-annual-action]').forEach(el=>el.disabled=busy);inputs().forEach(el=>el.disabled=busy||el.dataset.canEdit!=='true'||(year<currentYear()&&!pastEdit));}
 function years(){const list=[...new Set([currentYear()-1,currentYear(),currentYear()+1,year,...(snapshot?.years||[])])].sort((a,b)=>b-a);
  document.getElementById('settingTargetYear').innerHTML=list.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}년</option>`).join('');
  document.getElementById('annualYearTabs').innerHTML=[currentYear()-1,currentYear(),currentYear()+1].map(y=>`<button type="button" data-annual-nav data-year="${y}" class="btn ${y===year?'btn-primary':'btn-outline-secondary'} flex-fill">${y}년 · ${y===currentYear()?'올해':y<currentYear()?'지난해':'내년'}</button>`).join('');
  document.getElementById('annualYearLabel').textContent=`${year}년 ${year>currentYear()?'· 적용 예정':year<currentYear()?'· 과거 기준':''}`;
  document.getElementById('annualPastEdit').hidden=year>=currentYear()||pastEdit||!(snapshot?.can_edit_common||snapshot?.can_edit_tenant);
 }
 function fields(scope,keys,values){const catalog=snapshot.catalog[scope];return keys.map(key=>{const spec=catalog[key],value=values[key],can=scope==='common'?snapshot.can_edit_common:snapshot.can_edit_tenant;const display=value==null?'':spec.unit==='%'?Number((value*100).toFixed(6)):value;
  return `<div class="col-12 col-sm-6"><label class="form-label small mb-1" for="annual-${scope}-${escape(key)}">${escape(spec.label)} <span class="text-secondary">(${escape(spec.unit)})</span></label><input class="form-control form-control-sm" type="number" min="${spec.min||0}" max="${spec.max*(spec.unit==='%'?100:1)}" step="${spec.unit==='%'?'0.0001':spec.unit==='원'||spec.unit==='일'||spec.unit==='개월'?'1':'0.01'}" id="annual-${scope}-${escape(key)}" data-annual-value="${escape(key)}" data-scope="${scope}" data-unit="${escape(spec.unit)}" data-can-edit="${can}" value="${escape(display)}"></div>`;
 }).join('');}
 function render(){years();const common=snapshot.common,tenant=snapshot.tenant,commonValues=common?.values_json||snapshot.common_template||{},tenantValues=tenant?.values_json||snapshot.tenant_template||{};
  const ready=common?.status==='published';document.getElementById('annualCommonState').textContent=ready?(period>today()?'등록됨 · 적용 예정':'등록됨'):'미등록 · 초안';
  root.innerHTML=`<div class="row g-3">${fields('common',mainKeys,commonValues)}</div><details class="mt-3 border rounded p-3"><summary class="fw-semibold">비과세·세무 기준</summary><div class="row g-3 mt-1">${fields('common',Object.keys(snapshot.catalog.common).filter(k=>!mainKeys.includes(k)),commonValues)}</div></details><label class="form-label small mt-3 mb-1" for="annualSource">적용 근거</label><textarea id="annualSource" class="form-control form-control-sm" rows="2" maxlength="3000" data-can-edit="${snapshot.can_edit_common}">${escape(common?.source_note||'')}</textarea><div class="d-flex flex-wrap gap-2 mt-3">${snapshot.can_edit_common?`${!ready?'<button type="button" class="btn btn-outline-primary btn-sm" data-annual-action="draft">초안 저장</button>':''}<button type="button" class="btn btn-primary btn-sm" data-annual-action="common">${year}년 공통 기준 ${ready?'수정 저장':'적용 등록'}</button>`:'<span class="badge text-bg-light border">공통 기준 · 조회 전용</span>'}</div>`;
  tenantRoot.innerHTML=`<div class="row g-3">${fields('tenant',Object.keys(snapshot.catalog.tenant),tenantValues)}</div>${snapshot.can_edit_tenant?`<button type="button" class="btn btn-primary btn-sm mt-3" data-annual-action="tenant">${year}년 조합별 설정 저장</button>`:''}`;
  document.getElementById('annualPeriod').innerHTML=[...new Set([`${year}-01-01`,period,...snapshot.periods])].sort().map(d=>`<option value="${d}" ${d===period?'selected':''}>${d.slice(5,7)}월부터</option>`).join('');
  document.getElementById('annualAddPeriod').hidden=!(snapshot.can_edit_common||snapshot.can_edit_tenant);
  document.getElementById('annualMonth').value=period.slice(5,7);
  baseline=fingerprint();lock();status('');
 }
 async function load(targetYear=year,targetPeriod=`${targetYear}-01-01`){const token=++sequence;busy=true;lock();status('설정을 불러오는 중입니다.');try{const {data,error}=await api.rpc({p_action:'get',p_year:targetYear,p_effective_on:targetPeriod});if(token!==sequence)return;if(error)throw error;
   year=targetYear;period=targetPeriod;snapshot=data;pastEdit=false;busy=false;render();
  }catch(error){if(token!==sequence)return;busy=false;snapshot=null;baseline='';root.innerHTML='';tenantRoot.innerHTML='';lock();status(message(error),true);throw error;}}
 async function navigate(nextYear,nextPeriod){if(busy||!await confirmDiscard()){years();document.getElementById('annualPeriod').value=period;return;}return load(Number(nextYear),nextPeriod);}
 function collect(scope){const values={};document.querySelectorAll(`[data-annual-value][data-scope="${scope}"]`).forEach(el=>{if(el.value==='')return;const number=Number(el.value);if(!el.checkValidity()||!Number.isFinite(number))throw Error('입력한 값의 범위를 확인해 주세요.');values[el.dataset.annualValue]=el.dataset.unit==='%'?Number((number/100).toFixed(8)):number;});return values;}
 async function save(kind){if(busy||!snapshot)return;if(year<currentYear()&&!pastEdit)return status('과거 기준 수정 버튼을 먼저 눌러 주세요.',true);
  const scope=kind==='tenant'?'tenant':'common';if(!snapshot[scope==='common'?'can_edit_common':'can_edit_tenant'])return;
  let values;try{values=collect(scope);}catch(error){return status(message(error),true);}
  if(kind==='common'&&!await api.confirm(`${year}년 ${period.slice(5,7)}월부터 적용할 공통 기준을 저장할까요? 이미 저장된 급여는 변경하지 않습니다.`))return;
  busy=true;lock();status('저장 중입니다.');try{const {data,error}=await api.rpc({p_action:scope==='common'?'save_common':'save_tenant',p_year:year,p_effective_on:period,p_values:values,p_expected_revision:snapshot[scope]?.revision||0,p_publish:kind==='common',p_source_note:document.getElementById('annualSource').value});if(error)throw error;
   // Preserve edits in the other section after a successful partial save.
   const other=scope==='common'?'tenant':'common',otherFields=[...document.querySelectorAll(`[data-annual-value][data-scope="${other}"]`)].map(el=>[el.id,el.value]),otherSource=document.getElementById('annualSource').value;
   snapshot=data;busy=false;render();const clean=baseline;for(const [id,value] of otherFields){const el=document.getElementById(id);if(el)el.value=value;}if(other==='common')document.getElementById('annualSource').value=otherSource;baseline=clean;
   status(`${year}년 ${scope==='common'?'공통 기준':'조합별 설정'}을 ${kind==='draft'?'초안으로 ':''}저장했습니다.`);
  }catch(error){busy=false;lock();status(message(error),true);}}
 function init(options){api=options;root=document.getElementById('annualCommonFields');tenantRoot=document.getElementById('annualTenantFields');if(!root||root.dataset.bound)return;root.dataset.bound='true';
  document.getElementById('annualSettingsNav').addEventListener('click',event=>{const target=event.target.closest('[data-year]');if(target)navigate(Number(target.dataset.year)).catch(()=>{});});
  document.getElementById('settingTargetYear').addEventListener('change',event=>navigate(Number(event.target.value)).catch(()=>{}));
  document.getElementById('annualPeriod').addEventListener('change',event=>navigate(year,event.target.value).catch(()=>{}));
  document.getElementById('annualMonth').innerHTML=Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${i+1}월</option>`).join('');
  document.getElementById('annualAddPeriod').addEventListener('click',()=>navigate(year,`${year}-${document.getElementById('annualMonth').value}-01`).catch(()=>{}));
  document.getElementById('annualPastEdit').addEventListener('click',()=>{pastEdit=true;years();lock();});
  document.getElementById('settingsModal').addEventListener('click',event=>{const target=event.target.closest('[data-annual-action]');if(target)save(target.dataset.annualAction);});
  document.getElementById('settingsModal').addEventListener('hide.bs.modal',event=>{if(busy){event.preventDefault();return;}if(dirty()&&!closingApproved){event.preventDefault();confirmDiscard().then(ok=>{if(ok){closingApproved=true;api.close();closingApproved=false;}});}});
 }
 global.ERPAnnualSettings={init,load,save,isDirty:dirty,isBusy:()=>busy,errorMessage:message,currentYear};
})(window);
