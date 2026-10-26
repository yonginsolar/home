/* Document retention review v1.2.0. Management defaults never shorten existing/legal retention. */
(function(root){
'use strict';
const policies=Object.freeze({
 general3:{name:'일반 업무문서 · 3년',years:3,basis:'최종 승인·업무 완결일',law:'조합 내부 관리 기준 (별도 법정 기준 우선)'},
 tax_management5:{name:'세무 관리 기준 · 5년',years:5,basis:'귀속연도 다음 해 5월 1일 (문서연도 제안은 귀속연도 확인)',law:'내부 관리 기준 · 더 긴 법정 보존기간 우선'},
 tax5:{name:'세무 증빙 · 5년',years:5,basis:'해당 세금의 법정신고기한 다음 날',law:'국세기본법 제85조의3'},
 tax7:{name:'역외거래 세무 증빙 · 7년',years:7,basis:'해당 세금의 법정신고기한 다음 날',law:'국세기본법 제85조의3 · 역외거래'},
 important10:{name:'중요 업무문서 · 10년',years:10,basis:'문서별 법적 기산일 (장부는 폐쇄일)',law:'상법 제33조'},
 employment3:{name:'근로계약서 · 3년',years:3,basis:'근로관계가 끝난 날',law:'근로기준법 제42조·시행령 제22조'},
 payroll3:{name:'임금대장 · 3년',years:3,basis:'마지막으로 기입한 날',law:'근로기준법 제42조·시행령 제22조'},
 leave3:{name:'휴가 서류 · 3년',years:3,basis:'서류가 완결한 날 (승인·휴가 종료 중 늦은 날 확인)',law:'근로기준법 제42조·시행령 제22조'},
 permanent:{name:'장기 보존 · 기한 별도 검토',years:null,basis:'의결 기록 등 별도 보존 기준 확인',law:'조합의 문서 보존 기준 확인'}
});
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const d=new Date(value+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value?d:null;}
function addYears(value,years){const d=date(value);if(!d)return '';const year=d.getUTCFullYear()+years,month=d.getUTCMonth(),day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
const finalStates=new Set(['완료','실물결재완료','반려','결재취소','completed','void','PUBLISHED','FINAL','CLOSED','published','final','completed_signed']);
function defaultCodes(kind,type){
 if(kind==='employment')return ['employment3'];
 if(kind==='minutes')return ['공문','official','notice','meeting_notice'].includes(type)?['general3']:['important10'];
 if(kind==='meeting_attachment')return ['important10'];
 if(kind!=='approval')return [];
 if(/^(취소)?휴가(?:\(|$)/.test(type||''))return ['leave3'];
 if(/^지출결의(?:\(|$)/.test(type||'')||/^(취소)?출장신청$/.test(type||''))return ['tax_management5'];
 if(/계약|정관|규약|총회|이사회|의사록/.test(type||''))return ['important10'];
 return ['general3'];
}
function automatic(kind,row,context,template){
 const matching=context&&context.source_token===row.source_token;
 const year=matching&&/^\d{4}$/.test(String(context.tax_year||''))?Number(context.tax_year):null;
 const management=year>=1900&&year<2200?`${year+1}-05-01`:null;
 const tax=defaultCodes(kind,row.document_type).includes('tax_management5');
 const legalFloor=tax&&Array.isArray(row.rules)?row.rules.filter(r=>['tax5','tax7','important10'].includes(r.policy)).map(r=>addYears(r.basis_date,policies[r.policy].years)).sort().at(-1)||'':'';
 if(row.rules||row.revision!=null)return {...row,basis_context:matching?context:null,management_floor:tax&&management?management:null,legal_floor_end:legalFloor};
 if(!context||context.source_token!==row.source_token)return {...row,automatic_rules:[],automatic_reason:'문서 기준일 다시 확인 필요'};
 if(template?.conflict)return {...row,automatic_rules:[],automatic_reason:'같은 종류의 보존 기준이 달라 확인이 필요합니다.'};
 const suggested=template?.policies||defaultCodes(kind,row.document_type),codes=Array.isArray(suggested)?suggested:[],known=codes.every(code=>policies[code]);
 const dates=(Array.isArray(context.leave_dates)?context.leave_dates:[]).filter(v=>date(v)).sort();
 const leaveEnd=dates.at(-1),approved=date(context.approved_on)?context.approved_on:null,resolved=date(context.resolved_on)?context.resolved_on:null;
 const cancelled=/^취소휴가(?:\(|$)/.test(row.document_type||'')||row.document_status==='반려'||row.document_status==='결재취소';
 const leaveBase=resolved&&(cancelled?resolved:leaveEnd?[resolved,leaveEnd].sort().at(-1):null);
 const rules=known?codes.map(policy=>({policy,basis_date:policy==='tax_management5'?management:
  ['important10','general3'].includes(policy)?(kind==='approval'?(approved||resolved):kind==='minutes'&&date(context.published_on)?context.published_on:null):
  policy==='employment3'&&date(context.employment_ended_on)?context.employment_ended_on:policy==='leave3'?leaveBase:null})):[];
 return {...row,automatic_rules:rules,automatic_current:true,automatic_reason:(template?'같은 종류에 지정한 기준':'문서 종류별 기본 기준')+(tax?' · '+(context.tax_year_source==='document'?'문서연도 제안 · 귀속연도 확인':'귀속연도 기준'):'') ,basis_context:context,management_floor:tax?management:null};
}
function evaluate(row,review=row,asOf=today()){
 const rules=review.rules||(review===row?row.automatic_rules:null)||[];let until='',permanent=false;
 for(const rule of rules){const p=policies[rule.policy];if(!p)return {state:'unknown',label:'보존 기준 확인 필요',until:''};
 if(p.years===null){permanent=true;continue;}const end=addYears(rule.basis_date,p.years);if(!end)return {state:'unknown',label:'기산일 확인 필요',until:''};if(end>until)until=end;}
 if(!rules.length)return {state:'unknown',label:'보존 기준·기산일 확인 필요',until:''};
 if(row.management_floor){const end=addYears(row.management_floor,5);if(end>until)until=end;}
 if(row.legal_floor_end>until)until=row.legal_floor_end;
 if(!row.source_confirmed&&!row.automatic_current)return {state:'changed',label:'문서 변경 · 재검토 필요',until};
 if(permanent||String(review.hold_reason||'').trim()||review.review_decision==='keep')return {state:'hold',label:'보존 중',until:permanent?'':until};
 if(!finalStates.has(row.document_status))return {state:'progress',label:'문서 처리 중',until};
 if(until&&date(asOf)&&asOf>until){if((row.management_floor||rules.some(r=>r.policy==='tax_management5'))&&![...rules,...(row.rules||[])].some(r=>['tax5','tax7'].includes(r.policy)&&date(r.basis_date)))return {state:'unknown',label:'법정 보존 기준 확인 필요',until};return {state:'expired',label:review.review_decision==='propose_disposal'?'파기 검토 기록됨':'기한 경과 · 파기 검토',until};}
 return {state:'retained',label:'보존기간 내',until};
}
root.CoopRetentionRules=Object.freeze({version:'1.2.0',policies,date,addYears,today,evaluate,defaultCodes,automatic});
})(typeof window==='undefined'?globalThis:window);
