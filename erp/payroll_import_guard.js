/* Payroll import 1.0.0: scoped preview, explicit contract review, one atomic save.
 * Draft and retry state live only in this page's memory. No automatic saves. */
(function(global){
 'use strict';
 const amounts=['pay_meal','pay_car','pay_child','pay_position','pay_service','pay_overtime','pay_bonus','ded_pension','ded_health','ded_care','ded_employ','ded_income','ded_local','ded_advance','ded_capital'];
 const messages={PAYROLL_RECORD_CHANGED:'다른 담당자가 급여를 변경했습니다. 다시 확인해 주세요.',SETTINGS_ACCOUNTED_PAYROLL_LOCKED:'회계 반영된 급여는 일괄입력으로 바꿀 수 없습니다.',PAYROLL_CONTRACT_BASIS_CHANGED:'계약 조건이 변경되었습니다. 다시 확인해 주세요.',PAYROLL_CONTRACT_REVIEW_REQUIRED:'계약 조건과 지급액·근로시간을 확인해 주세요.',PAYROLL_CONTRACT_SNAPSHOT_LOCKED:'기존 급여의 적용 계약은 변경할 수 없습니다.',PAYROLL_TOTAL_MISMATCH:'지급액·공제액·실지급액의 합계를 확인해 주세요.',PAYROLL_MINUTE_PRECISION_REQUIRED:'근로시간은 분 단위로 입력해 주세요.',PAYROLL_FIELD_NOT_ALLOWED:'지원하지 않는 급여 항목이 있습니다.',EMPLOYEE_NOT_FOUND:'현재 조합의 직원을 확인하지 못했습니다.',SETTINGS_ACCESS_DENIED:'현재 업무 권한을 확인하지 못했습니다.',PAYROLL_AMOUNT_INVALID:'급여 금액은 0 이상의 정수로 입력해 주세요.',SETTINGS_EMPLOYER_RATES_REQUIRED:'조합의 사업주 보험 요율을 먼저 등록해 주세요.'};
 const num=(v,f=0)=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):f;
 function sourceKey(state,month){return JSON.stringify([month,state?.headerSignature,state?.mapping,state?.previewRows?.map(r=>[r.rowNumber,r.resolvedEmployee?.matched?.emp_id,r.mappedValues,r.providedFields,r.errors])]);}
 function valuesFor(row,saved,basis){
  const input=row.mappedValues||{},old=saved||{},v={};
  const provided=row.providedFields;
  const has=k=>provided?provided.includes(k):Number.isFinite(input[k]);
  for(const k of amounts)v[k]=has(k)?num(input[k]):num(old[k]);
  v.pay_total=Number.isFinite(input.pay_total)?input.pay_total:num(old.pay_total);
  v.pay_basic=has('pay_basic')?num(input.pay_basic):v.pay_total-amounts.filter(k=>k.startsWith('pay_')).reduce((s,k)=>s+v[k],0);
  v.ded_total=has('ded_total')?num(input.ded_total):amounts.filter(k=>k.startsWith('ded_')).reduce((s,k)=>s+v[k],0)-num(old.payroll_tax_adjustment_income)-num(old.payroll_tax_adjustment_local);
  v.net_pay=has('net_pay')?num(input.net_pay):v.pay_total-v.ded_total;
  v.work_description=String(input.work_description||old.work_description||'').trim();
  v.work_days=Number.isFinite(input.work_days)?input.work_days:old.work_days??null;
  v.work_hours=Number.isFinite(input.work_hours)?input.work_hours:old.work_hours??null;
  if(saved){if(saved.contract_snapshot)v.contract_snapshot=saved.contract_snapshot;}
  else if(basis?.segments?.some(s=>['contract','expired'].includes(s.source))){
   if(v.work_days===null||v.work_hours===null)throw Error('계약이 적용되는 새 급여는 엑셀에 근로일수와 근로시간도 입력해 주세요.');
  }else{v.work_days=v.work_days??0;v.work_hours=v.work_hours??0;}
  if(v.pay_basic<0)throw Error('수당 합계가 지급총액을 넘습니다.');
  if(v.net_pay!==v.pay_total-v.ded_total)throw Error('지급총액-공제총액과 실지급액이 일치하지 않습니다.');
  return v;
 }
 function errorText(error){let d;try{d=JSON.parse(error?.details||'null');}catch(_){}
  const reason=d?.reason||error?.message;
  return (d?.row_number?'엑셀 '+d.row_number+'행: ':'')+(messages[reason]||'입력 내용 또는 저장 상태를 확인하지 못했습니다. 다시 확인해 주세요.');
 }
 function create(opt){
  let context=null,sequence=0,pending=null,busy=false,completed=false;
  const same=c=>c&&c.state===opt.state()&&c.owner===opt.owner()&&c.key===sourceKey(opt.state(),opt.month());
  const current=c=>same(c)&&opt.visible();
  function updateButton(){const el=opt.button();if(el){el.disabled=busy||completed||!current(context)||context.error||context.rows.some(r=>r.error||r.required&&!r.reviewed);el.textContent=completed?'반영 완료':'일괄 반영';}}
  function clear(){sequence++;context=null;pending=null;completed=false;opt.reviewRoot()?.replaceChildren();updateButton();}
  function render(){const root=opt.reviewRoot();if(!root||!same(context))return;root.replaceChildren();
   const intro=document.createElement('p');intro.className='small '+(context.error?'text-danger':'text-muted');intro.textContent=context.error||'한 행이라도 저장할 수 없으면 전체를 반영하지 않습니다.';root.append(intro);
   for(const row of context.rows){
    if(row.error){const p=document.createElement('p');p.className='small text-danger';p.textContent=`엑셀 ${row.row.rowNumber}행 · ${row.name}: ${row.error}`;root.append(p);}
    if(!row.required)continue;
    const card=document.createElement('details');card.className='border rounded p-3 mb-2';card.open=!row.reviewed;
    const title=document.createElement('summary');title.className='fw-bold mb-2';title.textContent=`엑셀 ${row.row.rowNumber}행 · ${row.name} · 계약 조건 확인`;card.append(title);
    const terms=document.createElement('div');opt.renderContract(terms,row.basis);card.append(terms);
    const entered=document.createElement('p');entered.className='mt-2 mb-2';entered.textContent=`엑셀 지급총액: ${num(row.values?.pay_total).toLocaleString('ko-KR')}원 · 근로일수: ${row.values?.work_days??'미입력'}일 · 근로시간: ${row.values?.work_hours??'미입력'}시간`;card.append(entered);
    const label=document.createElement('label');label.className='form-check';const input=document.createElement('input');input.type='checkbox';input.className='form-check-input';input.checked=row.reviewed;input.disabled=busy||!!row.error;input.dataset.payrollContractReview=String(row.row.rowNumber);
    input.addEventListener('change',()=>{if(busy||!current(context))return;row.reviewed=input.checked;pending=null;updateButton();});
    const text=document.createElement('span');text.className='form-check-label';text.textContent='적용 계약과 이번 달 지급액·근로일수·근로시간을 확인했습니다.';label.append(input,text);card.append(label);root.append(card);
   }updateButton();
  }
  async function prepare(){
   if(busy)return;
   const state=opt.state(),month=opt.month(),key=sourceKey(state,month),owner=opt.owner();
   if(pending&&pending.key===key&&pending.owner===owner){render();return;}
   const previous=same(context)?context:null;
   const request=++sequence;pending=null;completed=false;context=null;updateButton();
   const rows=state?.previewRows||[];
   if(!rows.length||rows.some(r=>r.errors?.length))return;
   const c={state,month,key,owner,rows:[],error:null};
   if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||rows.length>500){c.error='귀속월과 대상 행을 확인해 주세요. 한 번에 500명까지 반영할 수 있습니다.';context=c;render();return;}
   try{
    const result=await opt.client().rpc('erp_hr_payroll_import_preview',{p_year_month:month,p_emp_ids:rows.map(r=>String(r.resolvedEmployee.matched.emp_id))});
    if(request!==sequence||!current(c))return;
    if(result.error)throw result.error;
    if(!Array.isArray(result.data)||result.data.length!==rows.length)throw Error('PREVIEW_INVALID');
    const byId=new Map(result.data.map(r=>[r.emp_id,r]));
    c.rows=rows.map(row=>{const emp=row.resolvedEmployee.matched,info=byId.get(String(emp.emp_id));if(!info)throw Error('PREVIEW_INVALID');
     const item={row,name:String(emp.emp_name||'직원'),saved:info.saved,basis:info.basis,reviewed:false,required:!info.saved&&info.basis?.segments?.some(s=>['contract','expired'].includes(s.source)),error:null};
     try{item.values=valuesFor(row,info.saved,info.basis);if(info.saved?.is_accounted)item.error=messages.SETTINGS_ACCOUNTED_PAYROLL_LOCKED;}catch(e){item.error=e.message;}
     const prior=previous?.rows.find(r=>String(r.row.resolvedEmployee.matched.emp_id)===String(emp.emp_id));
     item.reviewed=!!prior?.reviewed&&prior.basis?.basis_key===item.basis?.basis_key&&prior.saved?.row_key===item.saved?.row_key&&JSON.stringify(prior.values)===JSON.stringify(item.values);
     return item;
    });
   }catch(e){if(request!==sequence||!current(c))return;c.error=errorText(e);}
   if(request!==sequence||!current(c))return;context=c;render();
  }
  function freezeControls(on){opt.modal()?.querySelectorAll('button,input,select').forEach(el=>{
   if(on){el.dataset.payrollImportWasDisabled=el.disabled?'1':'0';el.disabled=true;}
   else if(el.dataset.payrollImportWasDisabled!=null){el.disabled=el.dataset.payrollImportWasDisabled==='1';delete el.dataset.payrollImportWasDisabled;}
  });updateButton();}
  function save(){
   if(busy||completed)return;
   if(!current(context)||context.error)return opt.alert(context?.error||'급여와 계약 조건을 다시 확인해 주세요.');
   if(context.rows.some(r=>r.error||r.required&&!r.reviewed))return opt.alert('오류 행을 확인하고 적용 계약을 모두 확인해 주세요.');
   const c=context,confirmed=JSON.stringify(c.rows.map(r=>r.reviewed));
   opt.confirm(`총 ${c.rows.length}건을 ${c.month} 급여에 반영하시겠습니까?\n한 행이라도 실패하면 전체를 취소합니다.`,async()=>{
    if(busy||!current(c)||confirmed!==JSON.stringify(c.rows.map(r=>r.reviewed)))return opt.alert('입력 내용이 변경되었습니다. 다시 확인해 주세요.');
    busy=true;freezeControls(true);
    const request=pending&&pending.key===c.key&&pending.owner===c.owner?pending:{key:c.key,owner:c.owner,args:{p_year_month:c.month,p_request_key:crypto.randomUUID(),p_mapping:opt.mapping(),p_rows:c.rows.map(r=>({emp_id:String(r.row.resolvedEmployee.matched.emp_id),row_number:r.row.rowNumber,expected_key:r.saved?.row_key||null,values:r.required?{...r.values,contract_snapshot:{basis_key:r.basis.basis_key,reviewed:r.reviewed}}:{...r.values}}))}};
    pending=request;
    try{
     const result=await opt.client().rpc('erp_hr_payroll_import',request.args);
     if(result.error){if(/^(PT[0-9]{3}|[0-9]{5})$/.test(result.error.code||''))pending=null;throw result.error;}
     if(!result.data||result.data.count!==c.rows.length)throw Error('SAVE_RESULT_UNKNOWN');
     if(same(c)){completed=true;pending=null;opt.mappingSaved(request.args.p_mapping);opt.alert(`${c.month} 급여 ${result.data.saved}건을 반영했습니다.${result.data.unchanged?' 동일한 '+result.data.unchanged+'건은 그대로 유지했습니다.':''}`);try{await opt.afterSave(c.month);}catch(_){opt.alert('급여는 반영됐지만 화면을 새로 조회하지 못했습니다. 작성 중 내용은 유지됩니다.');}}
    }catch(e){
     if(same(c))opt.alert(pending?'저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 반영하면 중복 저장을 방지해 확인합니다.':'전체 급여를 반영하지 않았습니다. '+errorText(e));
    }finally{busy=false;freezeControls(false);}
   });
  }
  return Object.freeze({prepare,save,clear,busy:()=>busy,onHide:()=>{sequence++;},render});
 }
 global.PayrollImportGuard=Object.freeze({create,valuesFor,errorText,sourceKey});
})(window);
