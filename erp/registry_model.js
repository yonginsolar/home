/* 시청 변경신고 준비 모형 0.2.2 — 저장·발송 없음. */
(function(root){
 'use strict';
 const kinds={capital:'출자금',members:'조합원 수',appointment:'임원 취임',renewal:'임원 중임',retirement:'임원 퇴임',resignation:'임원 사임',office:'주사무소 주소',purpose:'사업 목적',name:'조합 명칭',chair:'이사장 변경',chairAddress:'이사장 개인 주소',articles:'그 밖의 정관 변경'};
 const fieldRows=[['articles','정관'],['office','주된 사무소의 소재지'],['officers','임원'],['chairAddress','이사장(회장)의 주소'],['capital','출자금 납입총액'],['members','조합원(회원) 수']];
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const str=x=>String(x??'').trim();
 function number(x){const s=str(x);if(!s)return null;if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s))throw Error('금액·인원·좌수는 0 이상의 정수로 입력해 주세요.');const n=Number(s.replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('입력한 숫자가 너무 큽니다.');return n;}
 const display=x=>x===null||x===undefined||x===''?'확인 필요':typeof x==='number'?x.toLocaleString('ko-KR'):String(x);
 function period(year){const s=str(year);if(!/^\d{4}$/.test(s)||Number(s)<1901||Number(s)>9999)throw Error('신고연도를 확인해 주세요.');const target=Number(s)-1;return{reportYear:Number(s),targetYear:target,start:target+'-01-01',end:target+'-12-31',before:(target-1)+'-12-31'};}
 function capitalAt(rows,p,unit,coop){
  const sums={beforeCapital:0,increaseCapital:0,decreaseCapital:0,afterCapital:0},seen=new Set();
  for(const r of rows){if(r.coop_id!==coop||r.id==null||seen.has(String(r.id))||!date(r.deposit_date)||r.deposit_date>p.end||!/^[-]?\d+$/.test(String(r.amount)))throw Error('출자 원장의 조합·일자·금액을 확인해 주세요.');seen.add(String(r.id));const n=Number(r.amount);if(!Number.isSafeInteger(n))throw Error('출자 금액을 확인해 주세요.');if(r.deposit_date<=p.before)sums.beforeCapital+=n;else if(n>=0)sums.increaseCapital+=n;else sums.decreaseCapital-=n;sums.afterCapital+=n;if(Object.values(sums).some(v=>!Number.isSafeInteger(v)))throw Error('출자금 합계를 확인해 주세요.');}
  if(sums.beforeCapital<0||sums.afterCapital<0)throw Error('기초·기말 출자금이 음수입니다. 원장을 확인해 주세요.');
  if(!Number.isSafeInteger(unit)||unit<=0)throw Error('ERP의 1좌 금액을 확인해 주세요.');
  const values={...sums};for(const prefix of ['before','increase','decrease','after'])values[prefix+'Shares']=sums[prefix+'Capital']%unit===0?sums[prefix+'Capital']/unit:null;return values;
 }
 function deadline(end){if(!date(end))return '';const [y,m,d]=end.split('-').map(Number),target=new Date(Date.UTC(y,m+2,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);}
 function access(runtime){return !!runtime?.coop_id&&runtime.is_active!==false&&runtime.modules?.member_admin!==false&&Array.isArray(runtime.effective_permissions)&&runtime.effective_permissions.includes('member.admin')&&(!Array.isArray(runtime.base_effective_permissions)||runtime.base_effective_permissions.includes('member.admin'))&&(runtime.runtime_profile!=='site_member'||runtime.module_access?.member_admin===true);}
 function model(raw){
  const input=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,typeof v==='string'?str(v):v]));
  const selected=new Set((input.kinds||[]).filter(k=>Object.hasOwn(kinds,k)));if(!selected.size)throw Error('변경 유형을 하나 이상 선택해 주세요.');
  const missing=[],warnings=[],annual=selected.has('capital')||selected.has('members');
  if(!input.companyName)missing.push('조합 명칭');if(!input.officeAddress)missing.push('조합 소재지');if(!input.applicant)missing.push('신고인');if(!input.chairName)missing.push('이사장 성명');
  for(const [key,label]of [['corporateNumber','법인등록번호'],['applicantBirth','신고인 생년월일·법인등록번호'],['applicantAddress','신고인 주소'],['applicantPhone','신고인 전화번호'],['chairAddress','이사장 개인 주소']])if(!input[key])missing.push(label);
  if(!input.chairMemberId)missing.push('ERP 이사장 회원 연결');
  if(!date(input.printDate))missing.push('작성일');if(annual&&!date(input.fiscalEnd))missing.push('회계연도 말');
  const values={};for(const p of ['before','increase','decrease','after'])for(const q of ['Members','Shares','Capital'])values[p+q]=annual?number(input[p+q]):null;
  const unit=annual?number(input.unit):null;if(annual&&(!unit||unit<=0))missing.push('계산에 사용할 1좌 금액');
  const rows=[];
  const active={articles:['articles','purpose','name'].some(k=>selected.has(k))||input.unitReduced||input.businessAccountingChanged,office:selected.has('office'),officers:['appointment','renewal','retirement','resignation','chair'].some(k=>selected.has(k)),chairAddress:selected.has('chairAddress'),capital:selected.has('capital'),members:selected.has('members')};
  for(const [key,label]of fieldRows){if(!active[key])continue;let before,after;
   if(key==='capital'){before=values.beforeCapital;after=values.afterCapital;}
   else if(key==='members'){before=values.beforeMembers;after=values.afterMembers;}
   else {before=input[key+'Before']||'';after=input[key+'After']||'';}
   if(before===null||before==='')missing.push(label+' 변경 전');if(after===null||after==='')missing.push(label+' 변경 후');
   rows.push({key,label,before,after});
  }
  if(annual){for(const q of ['Members','Shares','Capital']){const b=values['before'+q],i=values['increase'+q],d=values['decrease'+q],a=values['after'+q];if([b,i,d,a].every(x=>x!==null)&&b+i-d!==a)warnings.push(({Members:'조합원 수',Shares:'출자좌수',Capital:'출자금'})[q]+'의 전기 + 증가 - 감소가 기말과 다릅니다.');}
   for(const p of ['before','increase','decrease','after'])for(const q of ['Members','Shares','Capital'])if(values[p+q]===null)missing.push(({before:'변경 전',increase:'당기 증가',decrease:'당기 감소',after:'기말'})[p]+' '+({Members:'조합원 수',Shares:'출자좌수',Capital:'출자금'})[q]);
   if(unit&&values.afterCapital!==null&&values.afterShares!==null&&unit*values.afterShares!==values.afterCapital)warnings.push('기말 좌수 × 1좌 금액과 기말 출자금이 다릅니다.');
   if(!date(input.beforeDate))missing.push('변경 전 기준일');
   let p;try{p=period(input.reportYear);}catch(_){missing.push('신고연도');}if(p&&(input.fiscalEnd!==p.end||input.beforeDate!==p.before))missing.push('신고연도에 맞는 대상연도·기준일');if(selected.has('capital')&&String(input.capitalSourceYear)!==String(input.reportYear))missing.push('대상연도의 ERP 출자금 조회');
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());if(input.fiscalEnd>today)missing.push('아직 종료되지 않은 회계연도');if(date(input.beforeDate)&&input.beforeDate>input.fiscalEnd)warnings.push('변경 전 기준일이 기말 기준일보다 늦습니다.');
  }
  const attachments=[{group:'법정 서식',text:'별지 제7호 변경신고서'}];
  if(active.articles)attachments.push({group:'유형별 법정 첨부',text:'변경한 정관 사본'});
  if(input.resolutionRequired||active.articles)attachments.push({group:'유형별 법정 첨부',text:'변경을 의결한 총회 의사록 사본'});
  if(selected.has('purpose')||input.businessAccountingChanged)attachments.push({group:'유형별 법정 첨부',text:'변경 후 사업계획서(별지 제4호)·수입지출 예산서(별지 제5호)'});
  if(input.unitReduced)attachments.push({group:'유형별 법정 첨부',text:'재무상태표·출자감소 의결·채권자 공고·이의신청 처리 등 증명서류'});
  if(selected.has('members'))attachments.push({group:'유형별 첨부',text:'시청 제출용 조합원 명부'});
  attachments.push({group:'담당 공무원 확인',text:'법인 등기사항증명서. 행정정보 공동이용에 동의하지 않으면 직접 제출합니다.'});
  return{input,selected:[...selected].map(k=>kinds[k]),rows,values,unit,annual,deadline:annual?deadline(input.fiscalEnd):'',attachments,missing:[...new Set(missing)],warnings,draft:missing.length>0||warnings.some(x=>/다릅니다|늦습니다/.test(x))};
 }
 function membershipAt(rows){
  if(!Array.isArray(rows))throw Error('연말 인원 응답을 확인하지 못했습니다.');
  const seen=new Set(),excluded=new Set(['07e99e55-bc64-432c-828d-66817d80c0d6','e4a11490-7c88-43ff-9c6b-b010a98f65dc']);let count=0,review=0;
  for(const r of rows){if(!r||typeof r.member_uid!=='string'||!r.member_uid||seen.has(r.member_uid)||!Array.isArray(r.review_codes)||r.review_codes.some(c=>typeof c!=='string')||![true,false,null].includes(r.is_member_on_cutoff)||!r.member_updated_at||!Number.isFinite(Date.parse(r.member_updated_at)))throw Error('연말 인원 응답이 불완전하거나 중복되었습니다.');seen.add(r.member_uid);if(excluded.has(r.member_uid.toLowerCase()))continue;if(r.is_member_on_cutoff===null||r.review_codes.length)review++;else if(r.is_member_on_cutoff)count++;}
  return{count:review?null:count,confirmed:count,review,revision:JSON.stringify(rows.map(r=>[r.member_uid,r.is_member_on_cutoff,r.review_codes,r.member_updated_at]).sort((a,b)=>a[0].localeCompare(b[0])))};
 }
 root.CoopRegistryModel={model,number,display,deadline,date,access,kinds,fieldRows,period,capitalAt,membershipAt};
})(typeof window==='undefined'?globalThis:window);
