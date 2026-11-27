const catalog=Object.freeze({
 'previous-minute':{label:'전차 의사록 확인',kind:'DECISION'},
 'audit-report':{label:'감사보고',kind:'DECISION'},
 'closing-report':{label:'사업보고·결산 승인',kind:'DECISION'},
 'surplus-appropriation':{label:'잉여금 처분·배당',kind:'DECISION'},
 'capital-return':{label:'탈퇴 조합원 출자금 환급',kind:'DECISION',decision:'refund'},
 'capital-reduction':{label:'출자금 감자',kind:'DECISION'},
 'business-plan':{label:'사업계획·예산 승인',kind:'DECISION'},
 'borrowing-limit':{label:'차입금 최고한도',kind:'DECISION'},
 'additional':{label:'직접 등록한 안건',kind:'OTHER'},
 'other-agenda':{label:'기타 안건',kind:'OTHER'}
});
export const assemblyBaseOptions=catalog;
export const assemblyDecisionTypes=Object.freeze({
 ordinary:'일반 의결',charter:'정관 변경 · 신고만',charter_registry:'정관 변경 · 등기 항목',
 charter_name:'정관 변경 · 조합 명칭',charter_purpose:'정관 변경 · 사업 목적',
 office:'주사무소 이전',officer:'임원 취임·중임·퇴임',chair:'이사장 변경',expulsion:'조합원 제명',refund:'탈퇴 조합원 출자금 환급',
 merger:'합병·분할',dissolve:'해산',suspend:'휴업·계속',priority:'다른 협동조합에 우선출자'
});
const supermajority=new Set(['charter','charter_registry','charter_name','charter_purpose','expulsion','refund','merger','dissolve','suspend','priority']);
const delegatesCannotVote=new Set(['merger','dissolve']);
export function assemblyVoteRequirement(type,{delegates=false}={}) {
 if(delegates&&delegatesCannotVote.has(type))return '대의원총회에서 의결할 수 없음';
 return supermajority.has(type)?'출석자 3분의 2 이상 찬성 필요':'';
}
export function votesNeeded(type,present,eligible) {
 if(!Number.isSafeInteger(present)||!Number.isSafeInteger(eligible)||present<=Math.floor(eligible/2)||present>eligible||eligible<1||!Object.hasOwn(assemblyDecisionTypes,type))return null;
 return supermajority.has(type)?Math.ceil(present*2/3):Math.floor(present/2)+1;
}
export function delegateVotesNeeded(type,present,eligible) {
 return delegatesCannotVote.has(type)?null:votesNeeded(type,present,eligible);
}
export function assemblyMinutePlan(plan, booklet={}) {
 return plan.map(item=>{
  const source=item.sourceAgenda;
  const id=source?.id || item.key;
  const kind=source?.agenda_kind || catalog[item.key]?.kind || 'OTHER';
  const selected=source?.id?booklet.assembly_agenda_types?.[source.id]:catalog[item.key]?.decision;
  return {id,title:String(item.title||'').trim(),kind,type:kind==='DECISION'?(selected||'ordinary'):null};
 });
}
export function encodeAssemblyMinutePlan(rows) {
 return Array.from(new TextEncoder().encode(JSON.stringify(rows)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function isRecordedPass(value) {
 return /^(?:가결|원안가결|수정가결|APPROVED)$/i.test(String(value||'').trim().replace(/\s+/g,''));
}
export function canRegister(type) {
 return ['charter','charter_registry','charter_name','charter_purpose','office','officer','chair'].includes(type);
}
export function currentBaseOrder(raw) {
 const keys=Array.isArray(raw)?raw:Object.keys(catalog);
 return [...new Set(keys.filter(x=>Object.hasOwn(catalog,x)))];
}
export function agendaSkeleton(row){
 // A prior amount, year, personal decision, or attachment is not a template.
 const title=String(row?.title||'').trim()
   .replace(/(?:₩|(?<![\p{L}\p{N}])금\s*)?\d[\d,]*(?:\.\d+)?\s*(?:억\s*원|만\s*원|천\s*원|원|좌|명)/gu,'')
   .replace(/(?:19|20)\d{2}\s*(?:년도?|[-./]\d{1,2}[-./]\d{1,2})/g,'')
   .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g,'').replace(/\s+/g,' ').trim();
 if(!title)return null;
 return {title:title.slice(0,180),agenda_kind:['REPORT','DECISION','DISCUSSION','OTHER'].includes(row.agenda_kind)?row.agenda_kind:'OTHER'};
}
