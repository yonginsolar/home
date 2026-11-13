/* 시청 변경신고 준비 모형 0.1.0 — 저장·발송 없음. */
(function(root){
 'use strict';
 const kinds={capital:'출자금',members:'조합원 수',appointment:'임원 취임',renewal:'임원 중임',retirement:'임원 퇴임',resignation:'임원 사임',office:'주사무소 주소',purpose:'사업 목적',name:'조합 명칭',chair:'이사장 변경',chairAddress:'이사장 개인 주소',articles:'그 밖의 정관 변경'};
 const fieldRows=[['articles','정관'],['office','주된 사무소의 소재지'],['officers','임원'],['chairAddress','이사장(회장)의 주소'],['capital','출자금 납입총액'],['members','조합원(회원) 수']];
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const str=x=>String(x??'').trim();
 function number(x){const s=str(x);if(!s)return null;if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s))throw Error('금액·인원·좌수는 0 이상의 정수로 입력해 주세요.');const n=Number(s.replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('입력한 숫자가 너무 큽니다.');return n;}
 const display=x=>x===null||x===undefined||x===''?'확인 필요':typeof x==='number'?x.toLocaleString('ko-KR'):String(x);
 function deadline(end){if(!date(end))return '';const [y,m,d]=end.split('-').map(Number),target=new Date(Date.UTC(y,m+2,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);}
 function access(runtime){return !!runtime?.coop_id&&runtime.is_active!==false&&runtime.modules?.member_admin!==false&&Array.isArray(runtime.effective_permissions)&&runtime.effective_permissions.includes('member.admin')&&(!Array.isArray(runtime.base_effective_permissions)||runtime.base_effective_permissions.includes('member.admin'))&&(runtime.runtime_profile!=='site_member'||runtime.module_access?.member_admin===true);}
 function model(raw){
  const input=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,typeof v==='string'?str(v):v]));
  const selected=new Set((input.kinds||[]).filter(k=>Object.hasOwn(kinds,k)));if(!selected.size)throw Error('변경 유형을 하나 이상 선택해 주세요.');
  const missing=[],warnings=[],annual=selected.has('capital')||selected.has('members');
  if(!input.companyName)missing.push('조합 명칭');if(!input.officeAddress)missing.push('조합 소재지');if(!input.applicant)missing.push('신고인');if(!input.chairName)missing.push('이사장 성명');
  for(const [key,label]of [['corporateNumber','법인등록번호'],['applicantBirth','신고인 생년월일·법인등록번호'],['applicantAddress','신고인 주소'],['applicantPhone','신고인 전화번호'],['chairIdentity','이사장 식별정보'],['chairAddress','이사장 개인 주소']])if(!input[key])missing.push(label);
  if((selected.has('name')||selected.has('chair')||selected.has('office'))&&!input.headerConfirmed)missing.push('신고서의 변경 후 기본정보 확인');
  if(!date(input.printDate))missing.push('작성일');if(annual&&!date(input.fiscalEnd))missing.push('회계연도 말');
  const values={};for(const p of ['before','increase','decrease','after'])for(const q of ['Members','Shares','Capital'])values[p+q]=annual?number(input[p+q]):null;
  const unit=annual?number(input.unit):null;if(annual&&(!unit||unit<=0))missing.push('기준일의 1좌 금액');
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
   if(!input.basisConfirmed)missing.push('연말 자료 확인');if(!date(input.beforeDate))missing.push('변경 전 기준일');
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());if(input.fiscalEnd>today)missing.push('아직 종료되지 않은 회계연도');if(date(input.beforeDate)&&input.beforeDate>input.fiscalEnd)warnings.push('변경 전 기준일이 기말 기준일보다 늦습니다.');
   warnings.push('기존 명부는 현재 탈퇴자를 제외합니다. 기준일 이후 탈퇴한 회원·가입일 미상 회원의 누락 여부를 확인해 주세요.');
  }
  const attachments=[{group:'법정 서식',text:'별지 제7호 변경신고서'}];
  if(active.articles)attachments.push({group:'유형별 법정 첨부',text:'변경한 정관 사본'});
  if(input.resolutionRequired||active.articles)attachments.push({group:'유형별 법정 첨부',text:'변경을 의결한 총회 의사록 사본'});
  if(selected.has('purpose')||input.businessAccountingChanged)attachments.push({group:'유형별 법정 첨부',text:'변경 후 사업계획서(별지 제4호)·수입지출 예산서(별지 제5호)'});
  if(input.unitReduced)attachments.push({group:'유형별 법정 첨부',text:'재무상태표·출자감소 의결·채권자 공고·이의신청 처리 등 증명서류'});
  if(selected.has('members'))attachments.push({group:'유형별 법정 첨부',text:'변경 후 조합원 명부(별지 제6호). 기존 시청 신고용 명부의 필수 기재항목·기준일을 확인하세요.'});
  attachments.push({group:'담당 공무원 확인',text:'법인 등기사항증명서. 행정정보 공동이용에 동의하지 않으면 직접 제출합니다.'});
  return{input,selected:[...selected].map(k=>kinds[k]),rows,values,unit,annual,deadline:annual?deadline(input.fiscalEnd):'',attachments,missing:[...new Set(missing)],warnings,draft:missing.length>0||warnings.some(x=>/다릅니다|늦습니다/.test(x))};
 }
 root.CoopRegistryModel={model,number,display,deadline,date,access,kinds,fieldRows};
})(typeof window==='undefined'?globalThis:window);
