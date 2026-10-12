/* Confirmed contract -> new payroll defaults. No Auth cache, storage or automatic save. */
(function(global){
 'use strict';
 const labels={annual:'연봉',monthly:'월급',daily:'일급',hourly:'시급'};
 const num=v=>Number(v||0), won=v=>Math.round(num(v)).toLocaleString('ko-KR')+'원';
 function defaults(basis){
  const segments=basis?.segments||[],s=segments[0],t=s?.terms||{};
  const linked=segments.some(x=>['contract','expired'].includes(x.source));
  if(!linked)return {linked:false,dailyHours:8};
  if(segments.some(x=>x.source==='expired'))return {linked:true,manual:true,reason:'계약 기간이 끝난 구간이 있습니다. 적용할 계약과 지급액·근로시간을 확인해 주세요.'};
  if(segments.length!==1)return {linked:true,manual:true,reason:'월 중간에 적용 조건이 바뀝니다. 기간별 조건을 확인해 지급액과 근로시간을 입력해 주세요.'};
  const payBasis=t.wage_basis,meal=num(t.monthly_meal_allowance),position=num(t.monthly_position_allowance),other=num(t.monthly_other_fixed_allowance);
  const result={linked:true,terms:t,dailyHours:num(t.daily_work_hours),meal,position,other};
  if(['daily','hourly'].includes(payBasis))return {...result,units:payBasis,manual:num(t.monthly_basic_pay)>0,reason:num(t.monthly_basic_pay)>0?'시급·일급과 월 기본급이 함께 있습니다. 계약의 계산 기준을 확인해 지급액을 직접 입력해 주세요.':''};
  const total=payBasis==='annual'?Math.floor(num(t.wage_amount)/12):num(t.wage_amount);
  const basic=num(t.monthly_basic_pay),parts=basic+meal+position+other;
  if(meal+position+other>total||(basic>0&&parts!==total))return {...result,manual:true,reason:'기준 임금과 월 구성액이 일치하지 않습니다. 계약 조건을 확인해 지급액을 입력해 주세요.'};
  return {...result,total};
 }
 function render(root,basis,saved=false){
  root.replaceChildren();
  const d=defaults(basis);
  if(saved){root.textContent='이미 확정한 급여의 금액과 근로시간을 그대로 불러왔습니다.';return d;}
  if(!d.linked){root.textContent='등록된 적용 계약이 없어 직원의 기존 연봉 기준을 사용합니다.';return d;}
  for(const s of basis.segments){
   const p=document.createElement('p'),t=s.terms;
   p.className='mb-2';
   p.textContent=s.source==='expired'?`${s.from} ~ ${s.to} · 계약 ${s.version_no}판의 기간 종료`:`${s.from} ~ ${s.to} · ${s.source==='contract'?'계약 '+s.version_no+'판':'기존 직원 기준'} · ${labels[t.wage_basis]||''} ${won(t.wage_amount)} · 1일 ${num(t.daily_work_hours)}시간${t.weekly_work_hours?' / 주 '+num(t.weekly_work_hours)+'시간':''}${t.work_days?' · '+t.work_days:''}${t.wage_calculation_terms?'\n'+t.wage_calculation_terms:''}`;
   p.style.whiteSpace='pre-line';root.append(p);
  }
  if(d.reason){const p=document.createElement('p');p.className='mb-0 text-danger';p.textContent=d.reason;root.append(p);}
  return d;
 }
 function unitTotal(d,units){
  const n=Number(units);
  if(!d?.units||d.manual||!Number.isFinite(n)||n<0||n>10000)throw Error('지급 대상 일수·시간을 확인해 주세요.');
  return Math.floor(n*num(d.terms.wage_amount))+d.meal+d.position+d.other;
 }
 global.ContractPayroll=Object.freeze({defaults,render,unitTotal});
})(window);
