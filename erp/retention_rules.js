/* Document retention review v1.0.0. Pure dates/state; never deletes documents or files. */
(function(root){
'use strict';
const policies=Object.freeze({
 tax5:{name:'세무 증빙 · 5년',years:5,basis:'해당 세금의 법정신고기한 다음 날',law:'국세기본법 제85조의3'},
 important10:{name:'중요 업무문서 · 10년',years:10,basis:'문서별 법적 기산일 (장부는 폐쇄일)',law:'상법 제33조'},
 employment3:{name:'근로계약서 · 3년',years:3,basis:'근로관계가 끝난 날',law:'근로기준법 제42조·시행령 제22조'},
 payroll3:{name:'임금대장 · 3년',years:3,basis:'마지막으로 기입한 날',law:'근로기준법 제42조·시행령 제22조'},
 permanent:{name:'장기 보존 · 기한 별도 검토',years:null,basis:'의결 기록 등 별도 보존 기준 확인',law:'조합의 문서 보존 기준 확인'}
});
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const d=new Date(value+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value?d:null;}
function addYears(value,years){const d=date(value);if(!d)return '';const year=d.getUTCFullYear()+years,month=d.getUTCMonth(),day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
const finalStates=new Set(['완료','실물결재완료','반려','결재취소','completed','void','PUBLISHED','FINAL','CLOSED','published','final','completed_signed']);
function evaluate(row,review=row,asOf=today()){
 const rules=review.rules||[];let until='',permanent=false;
 for(const rule of rules){const p=policies[rule.policy];if(!p)return {state:'unknown',label:'보존 기준 확인 필요',until:''};
 if(p.years===null){permanent=true;continue;}const end=addYears(rule.basis_date,p.years);if(!end)return {state:'unknown',label:'기산일 확인 필요',until:''};if(end>until)until=end;}
 if(!rules.length)return {state:'unknown',label:'보존 기준·기산일 확인 필요',until:''};
 if(!row.source_confirmed)return {state:'changed',label:'문서 변경 · 재검토 필요',until};
 if(permanent||String(review.hold_reason||'').trim()||review.review_decision==='keep')return {state:'hold',label:'보존 중',until:permanent?'':until};
 if(!finalStates.has(row.document_status))return {state:'progress',label:'문서 처리 중',until};
 if(until&&date(asOf)&&asOf>until)return {state:'expired',label:review.review_decision==='propose_disposal'?'파기 검토 기록됨':'기한 경과 · 파기 검토',until};
 return {state:'retained',label:'보존기간 내',until};
}
root.CoopRetentionRules=Object.freeze({version:'1.0.0',policies,date,addYears,today,evaluate});
})(typeof window==='undefined'?globalThis:window);
