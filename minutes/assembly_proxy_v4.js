import { supabase } from '../shared/supabase-client.js';

const el=id=>document.getElementById(id);
const picker=el('meeting'), status=el('status'), confirm=el('confirm'), family=el('family'), kind=el('proxy-kind');
const familySubmit=el('family-submit');
let records=[], visit=0, draft=null, principal=null, active=null, proof=null, pending=null, busy=false, lookup=0;
const familyMode=()=>kind.querySelector('input:checked')?.value==='family';
el('family-birth').max=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=value=>{
 const d=new Date(value);
 return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(d):'';
};
const messages={CLOSED:'위임 접수가 마감되었습니다.',REVIEW_UPDATED:'총회 정보가 바뀌었습니다. 공고를 확인해 주세요.',
 RETRY:'잠시 뒤 다시 검색해 주세요.',UNAVAILABLE:'이 총회의 위임 정보를 확인할 수 없습니다.',
 INPUT_INVALID:'대리인 정보를 다시 확인해 주세요.',ALREADY_VERIFIED:'현장 출석이 이미 확인됐습니다.',
 CONFLICT:'위임이 이미 접수됐거나 출석이 기록됐습니다.'};
async function rpc(action,id=null,fields={}){
 const {data,error}=await supabase.rpc('meeting_member_portal',{p_action:'proxy_'+action,p_id:id,p_fields:fields});
 if(error)throw error;
 return data;
}
async function staffRpc(action,id,fields={}){
 const {data,error}=await supabase.rpc('assembly_minutes',{p_action:'proxy_staff_'+action,p_id:id,p_payload:fields});
 if(error)throw error;
 return data;
}
const current=(n,id)=>n===visit&&id===picker.value;
const say=value=>{status.textContent=messages[value]||value||'';};
const make=(tag,value)=>{const item=document.createElement(tag);if(value!=null)item.textContent=value;return item;};
function reset(){
 draft=principal=active=proof=pending=null;
 family.reset();el('search').reset();kind.querySelector('input[value="member"]').checked=true;
 family.hidden=true;el('member-fields').hidden=false;
 el('proof-fields').replaceChildren();
 for(const id of ['editor','candidates','review','proof','proof-actions'])el(id).hidden=true;
 delete document.body.dataset.printReady;el('choices').replaceChildren();
}
function renderProof(record,editable){
 const isFamily=record?.kind==='family';
 if(!record?.meeting?.title||!record.principal?.member_no||!record.record_no||!record.agent?.name||
  !(isFamily?record.agent.birth_date:record.agent.member_no))return false;
 el('editor').hidden=true;el('proof').hidden=false;el('proof-actions').hidden=false;el('withdraw').hidden=!editable;
 el('proof-state').textContent=record.meeting_status==='CANCELLED'?'취소된 총회':record.withdrawn_at?'철회된 위임장':'전자 위임 확인';
 const rows=[
  ...(record.meeting.coop_name?[['조합',record.meeting.coop_name]]:[]),
  ['총회',record.meeting.title],['일시',[record.meeting.date,record.meeting.start?.slice(0,5)].filter(Boolean).join(' ')],
  ['장소',record.meeting.place],['위임인',record.principal.name],['조합원 번호',record.principal.member_no],
  ['대리인 구분',isFamily?'동거 가족':'조합원'],['대리인',record.agent.name],
  isFamily?['대리인 생년월일',record.agent.birth_date]:['대리인 조합원 번호',record.agent.member_no],
  ['전자 제출 시각',stamp(record.confirmed_at)],['접수번호',record.record_no],
  ...(record.withdrawn_at?[['철회 시각',stamp(record.withdrawn_at)]]:[])];
 el('proof-fields').replaceChildren(...rows.map(([label,value])=>{
  const row=make('div');row.append(make('dt',label),make('dd',value||''));return row;
 }));
 proof=record;document.body.dataset.printReady='true';return true;
}
function renderList(packet){
 el('proof-title').textContent='총회 위임 명단';el('print').textContent='명단 인쇄';
 el('proof-state').textContent=[packet.meeting?.title,packet.meeting?.date].filter(Boolean).join(' · ');
 el('proof-statement').hidden=true;
 const list=el('list-content'),rows=(packet.rows||[]).filter(row=>row.represented);list.hidden=false;
 if(!rows.length){say('확인된 대리 출석이 없습니다.');return;}
 const table=make('table');table.className='print-list';
 const header=table.createTHead().insertRow();
 for(const text of ['위임인','위임인 조합원 번호','대리인','대리인 조합원 번호','구분'])header.append(make('th',text));
 const body=table.createTBody();
 for(const row of rows){
  const tr=body.insertRow();
  for(const value of [row.name,row.member_no,row.agent,row.kind==='member'?row.agent_no:'',row.kind==='family'?'동거 가족':'조합원'])tr.insertCell().textContent=value||'';
 }
 list.replaceChildren(make('p',`대리 출석 ${rows.length}명`),table);
 el('proof').classList.add('list-proof');el('proof').hidden=el('proof-actions').hidden=false;document.body.dataset.printReady='true';
}
async function choose(){
 if(busy)return;
 const id=picker.value,n=++visit;reset();say('');
 if(!id)return;
 try{
  const row=records.find(r=>r.id===id);
  if(row?.proof_id){
   const data=await rpc('receipt_proof',id,{request:row.proof_id});
   if(!current(n,id))return;
   if(data?.proof){
    const {meeting}=data.proof;
    const open=row.status==='READY'&&!data.proof.withdrawn_at&& data.proof.meeting_status!=='CANCELLED'
      &&new Date(`${meeting.date}T${meeting.start}+09:00`).getTime()>Date.now();
    if(!renderProof(data.proof,open))say('전자 위임 내용을 불러오지 못했습니다.');
    return;
   }
  }
  const ctx=await rpc('receipt_context',id);
  if(!current(n,id))return;
  if(ctx?.proof){if(!renderProof(ctx.proof,!ctx.proof.withdrawn_at&&ctx.proof.meeting_status!=='CANCELLED'))say('전자 위임 내용을 불러오지 못했습니다.');return;}
  if(ctx?.status==='OPEN'){
   draft=ctx.meeting;principal=ctx.principal;el('meeting-title').textContent=draft.title;el('editor').hidden=false;
  }else say(ctx?.status||'UNAVAILABLE');
 }catch{if(current(n,id))say('위임 정보를 불러오지 못했습니다. 총회를 다시 선택해 주세요.');}
}
function cancelReview(){++lookup;active=null;el('review').hidden=true;}
kind.addEventListener('change',()=>{
 if(busy||pending)return;
 cancelReview();say('');el('candidates').hidden=true;
 family.hidden=!familyMode();el('member-fields').hidden=familyMode();
});
family.addEventListener('submit',event=>{
 event.preventDefault();if(busy||!draft||!familyMode()||!principal?.member_no)return;
 if(pending){void submitProxy('family_confirm',null,familySubmit);return;}
 if(!family.reportValidity())return;
 const name=el('family-name').value.trim(),birth_date=el('family-birth').value;
 if(!name||!birth_date){say('INPUT_INVALID');return;}
 void submitProxy('family_confirm',{name,birth_date,confirmed:true},familySubmit);
});
el('search').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||pending||!draft||familyMode())return;
 const id=picker.value,n=visit;cancelReview();const key=lookup;
 el('candidates').hidden=true;el('choices').replaceChildren();
 const name=el('candidate-name').value.trim();say('');
 try{
  const found=await rpc('search',id,{name});
  if(!current(n,id)||key!==lookup||name!==el('candidate-name').value.trim())return;
  if(found?.status!=='RESULT'){say(found?.status||'UNAVAILABLE');return;}
  if(!found.candidates?.length){say('일치하는 대리인이 없습니다.');return;}
  for(const candidate of found.candidates){
   const label=make('label'),input=make('input');input.type='radio';input.name='candidate';input.value=candidate.candidate;
   label.append(input,document.createTextNode(`${candidate.name} · ${candidate.phone_last4}`));el('choices').append(label);
   input.addEventListener('change',()=>{if(pending)return;
    active=candidate;el('review-text').textContent=`${candidate.name} (${candidate.phone_last4}) 님에게 이 총회의 의결권을 위임합니다.`;el('review').hidden=false;
   });
  }
  el('candidates').hidden=false;el('choices').querySelector('input')?.focus();
 }catch{if(current(n,id)&&key===lookup)say('대리인을 검색하지 못했습니다.');}
});
el('candidate-name').addEventListener('input',()=>{if(!pending){cancelReview();el('candidates').hidden=true;}});
confirm.addEventListener('click',()=>{
 if(!familyMode()&&(active||pending))void submitProxy('confirm',{candidate:active?.candidate},confirm);
});
async function submitProxy(action,fields,button){
 if(busy||!draft||(pending&&pending.action!==action))return;
 const id=picker.value,n=visit;
 pending??={action,fields:{request:crypto.randomUUID(),reviewed:draft,...fields}};
 const lock=flag=>{for(const item of [picker,kind,el('candidates'),...el('search').elements,
  el('family-name'),el('family-birth')])item.disabled=flag;};
 say('');lock(true);busy=button.disabled=true;
 try{
  const result=await rpc(pending.action,id,pending.fields);
  if(!current(n,id))return;
  if(result?.status==='CONFIRMED'&&result.proof){
   const row=records.find(item=>item.id===id);if(row)row.proof_id=result.proof.record_no;
   pending=null;
   if(renderProof(result.proof,!result.proof.withdrawn_at&&result.proof.meeting_status!=='CANCELLED')){
    say('위임을 접수했습니다.');el('print').focus();
   }else say('위임을 접수했습니다. 총회를 다시 선택해 주세요.');
  }else if(result?.status){pending=null;say(result.status);}
  else say('접수 결과를 확인하지 못했습니다. 위임 제출을 다시 눌러 주세요.');
 }catch(error){if(current(n,id)){
  if(error?.code==='23505'){pending=null;say('이미 위임했거나 이 대리인이 다른 위임을 받았습니다.');}
  else say('접수 결과를 확인하지 못했습니다. 위임 제출을 다시 눌러 주세요.');
 }}finally{busy=button.disabled=false;lock(!!pending);}
}
el('print').addEventListener('click',()=>{if(document.body.dataset.printReady==='true'&&!busy)window.print();});
el('withdraw').addEventListener('click',async()=>{
 if(busy||!proof?.record_no)return;
 const id=picker.value,n=visit,key=proof.record_no;
 if(!await window.CoopDialog?.confirm('이 위임을 철회할까요?')||busy||!current(n,id)||proof?.record_no!==key)return;
 busy=true;el('withdraw').disabled=picker.disabled=true;
 try{
  const result=await rpc('receipt_withdraw',id,{request:key});
  if(current(n,id)&&result?.status==='WITHDRAWN'){
   const data=await rpc('receipt_proof',id,{request:key});
   if(current(n,id)&&data?.proof){renderProof(data.proof,false);say('위임을 철회했습니다.');}
  }else if(current(n,id))say(result?.status||'UNAVAILABLE');
 }catch{if(current(n,id))say('철회 결과를 확인하지 못했습니다.');}
 finally{busy=false;el('withdraw').disabled=picker.disabled=false;}
});
picker.addEventListener('change',()=>void choose());
async function start(){
 try{
  const result=await supabase.auth.getSession();
  if(!result.data?.session){location.replace(`./sign_login.html?next=${encodeURIComponent(location.href)}`);return;}
  const params=new URLSearchParams(location.search);
  if(['list','proof'].includes(params.get('staff'))){
   el('back').hidden=true;
   if(params.get('staff')==='list'){
    el('page-title').textContent='총회 위임 명단';
    const data=await staffRpc('list',params.get('meeting'));
    if(data?.status==='READY')renderList(data);else say('UNAVAILABLE');
   }else{
    const data=await staffRpc('proof',params.get('meeting'),{receipt:params.get('record')});
    if(!renderProof(data?.proof,false))say('UNAVAILABLE');
   }
   return;
  }
  const rows=await rpc('receipts');records=Array.isArray(rows)?rows:[];
  for(const row of records)picker.append(new Option(`${row.meeting_date} · ${row.title}`,row.id));
  el('meeting-picker').hidden=!records.length;
  if(!records.length)say('위임을 접수할 총회가 없습니다.');
  else if(records.length===1){picker.value=records[0].id;void choose();}
 }catch{say('위임 정보를 불러오지 못했습니다.');}
}
void start();
