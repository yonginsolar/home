import { supabase } from '../shared/supabase-client.js';

const el=id=>document.getElementById(id);
const switcher=el('meeting'), status=el('status'), confirm=el('confirm'), search=el('search'),family=el('family'),kind=el('proxy-kind');
let records=[], visit=0, draft=null, principal=null, active=null, pending=null, busy=false, proofVersion=0;
const familyMode=()=>kind.querySelector('input:checked')?.value==='family';
el('family-birth').max=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=value=>{
 const d=new Date(value);
 return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(d):'';
};
const messages={CLOSED:'이 총회의 위임 접수가 마감되었습니다.',REVIEW_UPDATED:'총회 정보가 바뀌었습니다. 공고를 확인한 뒤 다시 열어 주세요.',RETRY:'잠시 뒤 다시 검색해 주세요.',UNAVAILABLE:'이 총회의 위임 정보를 확인할 수 없습니다.',INPUT_INVALID:'대리인 이름을 다시 확인해 주세요.'};
async function rpc(action,id=null,fields={}){
 const response=await supabase.rpc('meeting_member_portal',{p_action:'proxy_'+action,p_id:id,p_fields:fields});
 if(response.error)throw response.error;
 return response.data;
}
const current=(n,id)=>n===visit&&id===switcher.value;
const say=value=>{status.textContent=messages[value]||value||'';};
function reset(){
 draft=principal=active=pending=null;
 family.reset();kind.querySelector('input[value="member"]').checked=true;
 family.hidden=true;el('member-fields').hidden=false;
 el('proof-fields').replaceChildren();
 for(const id of ['editor','candidates','review','proof','proof-actions'])el(id).hidden=true;
 delete document.body.dataset.printReady;el('choices').replaceChildren();
}
function renderProof(proof,editable,isFamily=false){
 if(!proof?.meeting?.title||!proof.principal?.member_no||(!isFamily&&(!proof.record_no||!proof.agent?.member_no)))return;
 el('editor').hidden=true;el('proof').hidden=false;el('proof-actions').hidden=false;el('withdraw').hidden=!editable;
 const cancelled=proof.meeting_status==='CANCELLED';
 el('proof-state').textContent=isFamily?'현장 확인용':cancelled?'취소된 총회':proof.withdrawn_at?'철회된 위임장':'본인 계정으로 전자 확인';
 for(const id of ['proof-family-sign','edit-family'])el(id).hidden=!isFamily;
 const rows=[...(proof.meeting.coop_name?[['조합',proof.meeting.coop_name]]:[]),
  ['총회',proof.meeting.title],['일시',[proof.meeting.date,proof.meeting.start?.slice(0,5)].filter(Boolean).join(' ')],
  ['장소',proof.meeting.place],['위임인',proof.principal.name],['위임인 조합원 번호',proof.principal.member_no],
  ['대리인 구분',isFamily?'□ 조합원　■ 동거 가족':'■ 조합원　□ 동거 가족'],['대리인',proof.agent.name],
  ...(isFamily?[['대리인 생년월일',proof.agent.birth_date],['신분 확인 서류','대리인 신분증'],['동거 확인 서류','주민등록등본']]:[['대리인 조합원 번호',proof.agent.member_no],['전자 확인 시각',stamp(proof.confirmed_at)],
    ['확인 번호',proof.record_no],...(proof.withdrawn_at?[['철회 시각',stamp(proof.withdrawn_at)]]:[])])];
 el('proof-fields').replaceChildren(...rows.map(([label,value])=>{
  const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=value||'';row.append(dt,dd);return row;
 }));
 active=isFamily?null:proof;document.body.dataset.printReady='true';
}
async function choose(){
 if(busy)return;
 const id=switcher.value,n=++visit; reset();say('');
 if(!id)return;
 try{
  const row=records.find(r=>r.id===id);
  if(row?.proof_id){
   const proof=await rpc('proof',id,{request:row.proof_id});
   if(!current(n,id))return;
   if(proof?.proof&&!row.withdrawn){renderProof(proof.proof,row.status==='READY'&&proof.proof.meeting_status!=='CANCELLED'
    && new Date(`${proof.proof.meeting.date}T${proof.proof.meeting.start}+09:00`).getTime()>Date.now());return;}
   if(proof?.proof&&proof.proof.withdrawn_at){renderProof(proof.proof,false);return;}
  }
  const context=await rpc('context',id);
  if(!current(n,id))return;
  if(context?.status==='OPEN'){
   if(context.proof){renderProof(context.proof,true);return;}
   draft=context.meeting;principal=context.principal;kind.querySelector('input[value="family"]').disabled=!principal?.member_no;
   el('meeting-title').textContent=draft.title;el('editor').hidden=false;
  }else say(context?.status||'UNAVAILABLE');
 }catch{if(current(n,id))say('위임 정보를 불러오지 못했습니다. 총회를 다시 선택해 주세요.');}
}
kind.addEventListener('change',()=>{
 if(busy||pending)return;
 ++proofVersion;active=null;say('');el('review').hidden=el('candidates').hidden=true;
 family.hidden=!familyMode();el('member-fields').hidden=familyMode();
});
family.addEventListener('submit',event=>{
 event.preventDefault();if(busy||!draft||!familyMode()||!principal?.member_no)return;
 const name=el('family-name').value.trim(),birth_date=el('family-birth').value;
 if(!name||!birth_date||!family.reportValidity())return;
 say('');renderProof({meeting:draft,principal,agent:{name,birth_date}},false,true);
 el('print').focus();
});
el('edit-family').addEventListener('click',()=>{
 if(busy||!draft||!familyMode())return;
 el('proof').hidden=el('proof-actions').hidden=true;el('editor').hidden=false;el('proof-fields').replaceChildren();
 delete document.body.dataset.printReady;el('family-name').focus();
});
search.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||pending||!draft||familyMode())return;
 const id=switcher.value,n=visit,key=++proofVersion;
 el('review').hidden=true;el('candidates').hidden=true;el('choices').replaceChildren();
 const name=el('candidate-name').value.trim();say('');
 try{
  const found=await rpc('search',id,{name});
  if(!current(n,id)||key!==proofVersion||name!==el('candidate-name').value.trim())return;
  if(found?.status!=='RESULT'){say(found?.status||'UNAVAILABLE');return;}
  if(!found.candidates?.length){say('일치하는 대리인이 없습니다.');return;}
  for(const candidate of found.candidates){
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='radio';input.name='candidate';input.value=candidate.candidate;
   label.append(input,document.createTextNode(`${candidate.name} · ${candidate.phone_last4}`));el('choices').append(label);
   input.addEventListener('change',()=>{if(pending)return;
    active=candidate;el('review-text').textContent=`${candidate.name} (${candidate.phone_last4}) 님에게 이 총회의 의결권을 위임합니다.`;el('review').hidden=false;});
  }
  el('candidates').hidden=false;
 }catch{if(current(n,id)&&key===proofVersion)say('대리인을 검색하지 못했습니다.');}
});
el('candidate-name').addEventListener('input',()=>{if(pending)return;++proofVersion;active=null;el('candidates').hidden=true;el('review').hidden=true;});
confirm.addEventListener('click',async()=>{
 if(busy||!draft||familyMode()||(!active&&!pending))return;
 const id=switcher.value,n=visit;
 pending??={request:crypto.randomUUID(),candidate:active.candidate,reviewed:draft};
 busy=true;confirm.disabled=switcher.disabled=el('candidate-name').disabled=kind.disabled=true;
 try{
  const result=await rpc('confirm',id,pending);
  if(!current(n,id))return;
  if(result?.status==='CONFIRMED'&&result.proof){
   const row=records.find(item=>item.id===id);if(row)row.proof_id=result.proof.record_no;
   pending=null;renderProof(result.proof,true);say('위임을 기록했습니다.');
  }else if(result?.status){pending=null;say(result.status);}
 }catch(error){if(current(n,id)){
  if(error?.code==='23505'){pending=null;say('이미 위임했거나 이 대리인이 다른 위임을 받았습니다.');}
  else say('처리 결과를 확인하지 못했습니다. 같은 버튼으로 다시 확인해 주세요.');
 }}finally{busy=false;confirm.disabled=switcher.disabled=el('candidate-name').disabled=false;kind.disabled=!!pending;}
});
el('print').addEventListener('click',()=>{if(document.body.dataset.printReady==='true'&&!busy)window.print();});
el('withdraw').addEventListener('click',async()=>{
 if(busy||!active?.record_no||!window.confirm('이 위임을 철회할까요?'))return;
 const id=switcher.value,n=visit,key=active.record_no;
 busy=true;el('withdraw').disabled=switcher.disabled=true;
 try{
  const result=await rpc('withdraw',id,{request:key});
  if(current(n,id)&&result?.status==='WITHDRAWN'){
   const proved=await rpc('proof',id,{request:key});
   if(current(n,id)&&proved?.proof){renderProof(proved.proof,false);say('위임을 철회했습니다.');}
  }else if(current(n,id))say(result?.status||'UNAVAILABLE');
 }catch{if(current(n,id))say('철회 결과를 확인하지 못했습니다.');}
 finally{busy=false;el('withdraw').disabled=switcher.disabled=false;}
});
switcher.addEventListener('change',()=>void choose());
async function start(){
 try{
  const result=await supabase.auth.getSession();
  if(!result.data?.session){location.replace(`./sign_login.html?next=${encodeURIComponent(location.href)}`);return;}
  const rows=await rpc('list');records=Array.isArray(rows)?rows:[];
  for(const row of records)switcher.append(new Option(`${row.meeting_date} · ${row.title}`,row.id));
  el('meeting-picker').hidden=!records.length;
  if(!records.length)say('위임할 수 있는 총회나 발급된 위임장이 없습니다.');
  else if(records.length===1){switcher.value=records[0].id;void choose();}
 }catch{say('위임 목록을 불러오지 못했습니다.');}
}
void start();
