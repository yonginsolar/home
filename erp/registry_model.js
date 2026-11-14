/* 시청 변경신고 준비 모형 0.2.13 — 저장·발송 없음. */
(function(root){
 'use strict';
 const kinds={capital:'출자금',members:'조합원 수',appointment:'임원 취임',renewal:'임원 중임',retirement:'임원 퇴임',resignation:'임원 사임',office:'주사무소 주소',purpose:'사업 목적',name:'조합 명칭',chair:'이사장 변경',chairAddress:'이사장 개인 주소',articles:'그 밖의 정관 변경'};
 const fieldRows=[['name','조합 명칭'],['purpose','사업 목적'],['articles','정관'],['office','주된 사무소의 소재지'],['officers','임원'],['chair','이사장'],['chairAddress','이사장(회장)의 주소'],['capital','출자금 납입총액'],['members','조합원(회원) 수']];
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const str=x=>String(x??'').trim();
 function number(x){const s=str(x);if(!s)return null;if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s))throw Error('금액·인원·좌수는 0 이상의 정수로 입력해 주세요.');const n=Number(s.replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('입력한 숫자가 너무 큽니다.');return n;}
 const display=x=>x===null||x===undefined||x===''?'확인 필요':typeof x==='number'?x.toLocaleString('ko-KR'):String(x);
 function period(year){const s=str(year);if(!/^\d{4}$/.test(s)||Number(s)<1901||Number(s)>9999)throw Error('신고연도를 확인해 주세요.');const target=Number(s)-1;return{reportYear:Number(s),targetYear:target,start:target+'-01-01',end:target+'-12-31',before:(target-1)+'-12-31'};}
 function capitalAt(rows,p,unit,coop){
  const sums={beforeCapital:0,increaseCapital:0,decreaseCapital:0,afterCapital:0},seen=new Set();
  for(const r of rows){if(r.coop_id!==coop||r.id==null||seen.has(String(r.id))||!date(r.deposit_date)||r.deposit_date>p.end||!/^[-]?\d+$/.test(String(r.amount)))throw Error('출자 원장의 조합·일자·금액을 확인해 주세요.');seen.add(String(r.id));const n=Number(r.amount);if(!Number.isSafeInteger(n))throw Error('출자 금액을 확인해 주세요.');if(r.deposit_date<=p.before)sums.beforeCapital+=n;else if(n>=0)sums.increaseCapital+=n;else sums.decreaseCapital-=n;sums.afterCapital+=n;if(Object.values(sums).some(v=>!Number.isSafeInteger(v)))throw Error('출자금 합계를 확인해 주세요.');}
  if(!rows.length)throw Error('출자 원장 근거가 없습니다. 0원으로 확정하지 않습니다.');
  if(sums.beforeCapital<0||sums.afterCapital<0)throw Error('기초·기말 출자금이 음수입니다. 원장을 확인해 주세요.');
  if(!Number.isSafeInteger(unit)||unit<=0)throw Error('ERP의 1좌 금액을 확인해 주세요.');
  const values={...sums};if(!rows.some(r=>r.deposit_date<=p.before))values.beforeCapital=null;for(const prefix of ['before','increase','decrease','after'])values[prefix+'Shares']=values[prefix+'Capital']!==null&&sums[prefix+'Capital']%unit===0?sums[prefix+'Capital']/unit:null;return values;
 }
 function birthFromRrn(value,day){const s=String(value||'').replace('-', '');if(!/^\d{13}$/.test(s))throw Error('이사장 주민번호의 생년월일 형식을 확인해 주세요.');const century=({1:1900,2:1900,3:2000,4:2000,5:1900,6:1900,7:2000,8:2000,9:1800,0:1800})[s[6]],birth=String(century+Number(s.slice(0,2)))+'-'+s.slice(2,4)+'-'+s.slice(4,6),today=day||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());if(!date(birth)||birth>today)throw Error('이사장 주민번호의 생년월일을 확인해 주세요.');return birth;}
 function originalCharter(coop,rows){return coop==='a4e65bb0-aa8e-4cef-a895-cd7865a67fef'&&rows.length===1&&rows[0].is_current===true;}
 function deadline(end){if(!date(end))return '';const [y,m,d]=end.split('-').map(Number),target=new Date(Date.UTC(y,m+2,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);}
 function access(runtime){return !!runtime?.coop_id&&runtime.is_active!==false&&runtime.modules?.member_admin!==false&&Array.isArray(runtime.effective_permissions)&&runtime.effective_permissions.includes('member.admin')&&(!Array.isArray(runtime.base_effective_permissions)||runtime.base_effective_permissions.includes('member.admin'))&&(runtime.runtime_profile!=='site_member'||runtime.module_access?.member_admin===true);}
 function changeScope(input){const k=new Set(input.kinds||[]),other=[...k].some(x=>!['capital','members'].includes(x));return {unitReduced:k.has('capital')&&!!input.unitReduced,businessAccountingChanged:(k.has('purpose')||k.has('articles'))&&!!input.businessAccountingChanged,resolutionRequired:other&&!!input.resolutionRequired};}
 // 과거 신고 사실만 별도 표시한다. ERP 집계·가입사건·원장은 보정하지 않는다.
 function reportedMembershipNote(input){return input.coopId==='a4e65bb0-aa8e-4cef-a895-cd7865a67fef'&&String(input.reportYear)==='2027'&&(input.kinds||[]).some(k=>k==='capital'||k==='members')?'2025년 기말 신고 인원: 240명':'';}
 function model(raw){
  const input=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,typeof v==='string'?str(v):v]));
  Object.assign(input,changeScope(input));const selected=new Set((input.kinds||[]).filter(k=>Object.hasOwn(kinds,k)));if(!selected.size)throw Error('변경 유형을 하나 이상 선택해 주세요.');
  const missing=[],warnings=[],annual=selected.has('capital')||selected.has('members');
  if(!input.companyName)missing.push('조합 명칭');if(!input.officeAddress)missing.push('조합 소재지');if(!input.applicant)missing.push('신고인');if(!input.chairName)missing.push('이사장 성명');
  for(const [key,label]of [['applicantBirth',input.applicantType==='corporation'?'신고인 법인의 법인등록번호':'신고인 생년월일'],['applicantAddress','신고인 주소'],['applicantPhone','신고인 전화번호'],['chairAddress','이사장 개인 주소'],['chairPhone','이사장 전화번호']])if(!input[key])missing.push(key==='applicantBirth'&&input.applicantBirthFromSecure?'신고인 생년월일 출력 전 보안 확인':label);
  if(input.applicantType==='person'&&input.applicantBirth&&!date(input.applicantBirth))missing.push('신고인 생년월일 형식');
  if(input.applicantType==='corporation'&&input.applicantBirth&&!/^\d{6}-?\d{7}$/.test(input.applicantBirth))missing.push('신고인 법인등록번호 형식');
  if(!input.chairMemberId)missing.push('ERP 이사장 회원 연결');
  if(!date(input.printDate))missing.push('작성일');if(annual&&!date(input.fiscalEnd))missing.push('회계연도 말');
  const values={};for(const p of ['before','increase','decrease','after'])for(const q of ['Members','Shares','Capital'])values[p+q]=annual?number(input[p+q]):null;
  const unit=annual?number(input.unit):null;if(annual&&(!unit||unit<=0))missing.push('계산에 사용할 1좌 금액');
  const rows=[];
  const active={name:selected.has('name'),purpose:selected.has('purpose'),chair:selected.has('chair'),articles:selected.has('articles')||input.unitReduced||input.businessAccountingChanged,office:selected.has('office'),officers:['appointment','renewal','retirement','resignation'].some(k=>selected.has(k)),chairAddress:selected.has('chairAddress'),capital:selected.has('capital'),members:selected.has('members')};
  for(const [key]of fieldRows)if(!active[key]){delete input[key+'Before'];delete input[key+'After'];delete input['history_'+key];}if(!active.articles&&!active.name&&!active.purpose){delete input.beforeDocument;delete input.afterDocument;}input.officerChanges=Object.fromEntries(Object.entries(input.officerChanges||{}).filter(([key])=>selected.has(key)));
  for(const [key,label]of fieldRows){if(!active[key])continue;let before,after;
   if(key==='officers'){for(const kind of ['appointment','renewal','retirement','resignation'])if(selected.has(kind)){const change=input.officerChanges?.[kind];if(!change?.before||!change?.after||change.error)missing.push(kinds[kind]+' ERP 이력 확인');rows.push({key:kind,label:kinds[kind],before:change?.before||'',after:change?.after||''});}continue;}
   if(key==='capital'){before=values.beforeCapital;after=values.afterCapital;}
   else if(key==='members'){before=values.beforeMembers;after=values.afterMembers;}
   else {before=input[key+'Before']||'';after=input[key+'After']||'';}
   if(before===null||before==='')missing.push(label+' 변경 전');if(after===null||after==='')missing.push(label+' 변경 후');if(input.sourceState&&input.sourceState[key]&&input.sourceState[key]!=='ready')missing.push(label+' ERP 이전 근거 확인');
   rows.push({key,label,before,after});
  }
  if(annual&&input.manualMembers&&String(input.manualMembersYear)!==String(input.reportYear))missing.push('직접 입력 인원의 신고연도 재확인');
  if(annual&&!input.manualMembers&&input.activityState==='confirmed'&&input.activityMemberValues&&(['beforeMembers','increaseMembers','decreaseMembers','afterMembers'].some(key=>values[key]!==input.activityMemberValues[key])||String(input.activityMemberValues.year)!==String(input.reportYear)))missing.push('ERP 집계와 다른 인원 입력 확인');
  if(annual&&input.activityState&&input.activityState!=='confirmed'&&!input.manualMembers)missing.push('연중 가입·탈퇴 인원 확인');
  if(annual&&!/^\d{6}-?\d{7}$/.test(input.corporateNumber||''))missing.push('출자금 확인서의 법인등록번호 13자리');
  if(annual){for(const q of ['Members','Shares','Capital']){const b=values['before'+q],i=values['increase'+q],d=values['decrease'+q],a=values['after'+q];if([b,i,d,a].every(x=>x!==null)&&b+i-d!==a)warnings.push(({Members:'조합원 수',Shares:'출자좌수',Capital:'출자금'})[q]+'의 전기 + 증가 - 감소가 기말과 다릅니다.');}
   for(const p of ['before','increase','decrease','after'])for(const q of ['Members','Shares','Capital'])if(values[p+q]===null)missing.push(({before:'변경 전',increase:'당기 증가',decrease:'당기 감소',after:'기말'})[p]+' '+({Members:'조합원 수',Shares:'출자좌수',Capital:'출자금'})[q]);
   if(unit&&values.afterCapital!==null&&values.afterShares!==null&&unit*values.afterShares!==values.afterCapital)warnings.push('기말 좌수 × 1좌 금액과 기말 출자금이 다릅니다.');
   if(!date(input.beforeDate))missing.push('변경 전 기준일');
   let p;try{p=period(input.reportYear);}catch(_){missing.push('신고연도');}if(p&&(input.fiscalEnd!==p.end||input.beforeDate!==p.before))missing.push('신고연도에 맞는 대상연도·기준일');if(selected.has('capital')&&String(input.capitalSourceYear)!==String(input.reportYear))missing.push('대상연도의 ERP 출자금 조회');
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());if(input.fiscalEnd>today)missing.push('아직 종료되지 않은 회계연도');if(date(input.beforeDate)&&input.beforeDate>input.fiscalEnd)warnings.push('변경 전 기준일이 기말 기준일보다 늦습니다.');
  }
  const attachments=[{group:'법정 서식',text:'별지 제7호 변경신고서'}];
  if(active.articles||active.name||active.purpose)attachments.push({group:'유형별 법정 첨부',text:'변경한 정관 사본'});
  if(input.resolutionRequired||active.articles||active.name||active.purpose)attachments.push({group:'유형별 법정 첨부',text:'변경을 의결한 총회 의사록 사본'});
  if(selected.has('purpose')||input.businessAccountingChanged)attachments.push({group:'유형별 법정 첨부',text:'변경 후 사업계획서(별지 제4호)·수입지출 예산서(별지 제5호)'});
  if(input.unitReduced)attachments.push({group:'유형별 법정 첨부',text:'재무상태표·출자감소 의결·채권자 공고·이의신청 처리 등 증명서류'});
  if(selected.has('members'))attachments.push({group:'유형별 첨부',text:'시청 제출용 조합원 명부'});
  attachments.push({group:'담당 공무원 확인',text:'법인 등기사항증명서. 행정정보 공동이용에 동의하지 않으면 직접 제출합니다.'});
  return{input,reportedMembershipNote:reportedMembershipNote(input),selected:[...selected].map(k=>kinds[k]),rows,values,unit,annual,deadline:annual?deadline(input.fiscalEnd):'',attachments,missing:[...new Set(missing)],warnings,draft:missing.length>0||warnings.some(x=>/다릅니다|늦습니다/.test(x))};
 }
 function activityCounts(value,year,day){
  const today=day||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),end=String(year)+'-12-31',asof=end<today?end:today;
  const keys=['review_members','confirmed_join_events','confirmed_exit_events','confirmed_join_people','confirmed_exit_people'];
  if(!value||value.schema_version!==2||value.year!==year||!['confirmed','review_required'].includes(value.status)||value.as_of!==asof||value.period_end!==end||value.provisional!==(asof<end)||!date(value.as_of)||!Array.isArray(value.review_codes)||value.review_codes.some(x=>typeof x!=='string')||!keys.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)||!/^([a-f0-9]{32})$/.test(value.source_revision))throw Error('연중 가입·탈퇴 집계를 확인하지 못했습니다.');
  const nullable=['before_members','after_members','increase_members','decrease_members'];if(nullable.some(k=>value[k]!==null&&(!Number.isSafeInteger(value[k])||value[k]<0)))throw Error('연중 인원 응답이 불완전합니다.');
  if(value.status==='confirmed'&&(value.review_members||value.review_codes.length||nullable.some(k=>value[k]===null)||value.increase_members!==value.confirmed_join_events||value.decrease_members!==value.confirmed_exit_events||!Number.isSafeInteger(value.before_members+value.increase_members)||value.before_members+value.increase_members-value.decrease_members!==value.after_members))throw Error('연중 인원 집계의 근거가 일치하지 않습니다.');
  if(value.confirmed_join_people>value.confirmed_join_events||value.confirmed_exit_people>value.confirmed_exit_events||value.status!=='confirmed'&&(!value.review_codes.length||nullable.some(k=>value[k]!==null)))throw Error('미확인 인원을 확정할 수 없습니다.');return value;
 }
 function membershipAt(rows){
  if(!Array.isArray(rows))throw Error('연말 인원 응답을 확인하지 못했습니다.');
  const seen=new Set(),excluded=new Set(['07e99e55-bc64-432c-828d-66817d80c0d6','e4a11490-7c88-43ff-9c6b-b010a98f65dc']);let count=0,review=0;
  for(const r of rows){if(!r||typeof r.member_uid!=='string'||!r.member_uid||seen.has(r.member_uid)||!Array.isArray(r.review_codes)||r.review_codes.some(c=>typeof c!=='string')||![true,false,null].includes(r.is_member_on_cutoff)||!r.member_updated_at||!Number.isFinite(Date.parse(r.member_updated_at)))throw Error('연말 인원 응답이 불완전하거나 중복되었습니다.');seen.add(r.member_uid);if(excluded.has(r.member_uid.toLowerCase()))continue;if(r.is_member_on_cutoff===null||r.review_codes.length)review++;else if(r.is_member_on_cutoff)count++;}
  return{count:review?null:count,confirmed:count,review,revision:JSON.stringify(rows.map(r=>[r.member_uid,r.is_member_on_cutoff,r.review_codes,r.member_updated_at]).sort((a,b)=>a[0].localeCompare(b[0])))};
 }
 function officialSummary(r){return [r.name,r.role,r.term_count?'제'+r.term_count+'기':''].filter(Boolean).join(' · ')+'\n임기 '+(r.term_start_date||'미등록')+' ~ '+(r.term_end_date||'미등록');}
 function officialChange(kind,id,records){const row=records.find(r=>String(r.id)===String(id));if(!row)return{before:'',after:'',error:'ERP 임원을 선택해 주세요.'};if(!row.name||!row.role||!date(row.term_start_date)||!date(row.term_end_date))return{before:'',after:'',error:'임원 성명·직책·임기를 ERP에서 확인해 주세요.'};
  if(kind==='appointment')return{before:'없음',after:officialSummary(row)};
  if(row.term_end_date<row.term_start_date)return{before:'',after:'',error:'ERP 임기 순서를 확인해 주세요.'};
  if(kind==='renewal'){if(!row.member_id||!Number.isSafeInteger(Number(row.term_count))||Number(row.term_count)<2)return{before:'',after:'',error:'중임 회원 연결·기수를 확인해 주세요.'};const previous=records.filter(r=>r.id!==row.id&&r.member_id===row.member_id&&r.role===row.role&&r.category===row.category&&Number(r.term_count)===Number(row.term_count)-1&&date(r.term_start_date)&&date(r.term_end_date)&&r.term_start_date<row.term_start_date&&r.term_end_date<row.term_start_date);return previous.length===1?{before:officialSummary(previous[0]),after:officialSummary(row)}:{before:'',after:officialSummary(row),error:'중임 전 임기를 ERP 이력에서 하나로 확인하지 못했습니다.'};}
  if(kind==='resignation')return row.end_reason==='resignation'&&date(row.real_end_date)&&row.real_end_date>=row.term_start_date?{before:officialSummary(row),after:row.name+' · '+row.role+'\n사임일 '+row.real_end_date}:{before:officialSummary(row),after:'',error:'ERP에 처리된 사임 효력일이 없습니다.'};
  if(kind==='retirement')return date(row.real_end_date)&&row.real_end_date>=row.term_start_date&&!!row.end_reason&&row.end_reason!=='resignation'?{before:officialSummary(row),after:row.name+' · '+row.role+'\n퇴임일 '+row.real_end_date}:{before:officialSummary(row),after:'',error:'ERP에 처리된 퇴임일이 없습니다.'};return{before:'',after:'',error:'변경 구분을 확인해 주세요.'};
 }
 function purposeFromText(text){const value=String(text||'').replace(/\r/g,''),matches=[...value.matchAll(/(?:^|\n)\s*제\s*\d+\s*조\s*[（(]\s*목\s*적\s*[)）]/g)];if(matches.length!==1)return'';const start=matches[0].index,tail=value.slice(start+matches[0][0].length),next=tail.search(/\n\s*제\s*\d+\s*조\s*[（(]/);return value.slice(start,start+matches[0][0].length+(next<0?tail.length:next)).trim();}
 root.CoopRegistryModel={model,reportedMembershipNote,number,display,deadline,date,access,kinds,fieldRows,period,capitalAt,membershipAt,activityCounts,changeScope,officialSummary,officialChange,purposeFromText,birthFromRrn,originalCharter};
})(typeof window==='undefined'?globalThis:window);
