import { delegateVotesNeeded } from './assembly_agenda_controls_v1.js';

export const ASSEMBLY_RESULT_SLOT='<!--assembly-vote-results-->';
const results=Object.freeze({PASS:'가결',REJECT:'부결',DEFER:'보류',NOTED:'확인'});
const notForDelegates=new Set(['merger','dissolve']);
const isDecision=a=>a.kind==='DECISION';
const choices=a=>!isDecision(a)?['NOTED','DEFER']:notForDelegates.has(a.type)?['DEFER']:['PASS','REJECT','DEFER'];
const el=id=>document.getElementById(id);
const option=(label,value)=>new Option(label,value);
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function renderAssemblyResults(rows) {
 return '<div class="assembly-recorded-results"><h4>안건별 결과</h4><ol>'+rows.map(a=>
  '<li>'+escape(a.title)+' — '+escape(results[a.result])+'</li>').join('')+'</ol></div>';
}

export function bindAssemblyMinute({rpc,current,readSchedule,applySchedule,attendance,confirm}) {
 const open=el('assembly-minute-open'),panel=el('assembly-minute-panel'),list=el('assembly-minute-choice');
 const apply=el('assembly-minute-apply'),close=el('assembly-minute-close'),status=el('assembly-minute-status');
 const outcomePanel=el('assembly-minute-outcomes'),outcomeList=el('assembly-minute-outcome-list');
 let selected=null,revision=0;
 async function request(action,id=null,payload={}) {
  const {data,error}=await rpc('assembly_minutes',{p_action:action,p_id:id,p_payload:payload});
  if(error)throw error;
  return data;
 }
 function hide(focus=false) {
  revision++;panel.hidden=true;open.setAttribute('aria-expanded','false');open.disabled=false;
  apply.disabled=true;list.disabled=true;
  if(focus)open.focus();
 }
 function reset(){
  hide();selected=null;outcomePanel.hidden=true;outcomeList.replaceChildren();status.textContent='';
 }
 function refresh(){
  if(!selected)return;
  const {present,eligible}=attendance();
  for(const [index,node] of [...outcomeList.children].entries()){
   const row=selected.agendas[index];
   const needed=delegateVotesNeeded(row.type,present,eligible);
   node.querySelector('small').textContent=!isDecision(row)?'':notForDelegates.has(row.type)
    ?'대의원총회에서 의결할 수 없는 안건입니다.':needed===null?'':`찬성 ${needed.toLocaleString('ko-KR')}명 필요`;
  }
 }
 function showOutcomes(previous=new Map()){
  outcomePanel.hidden=false;
  el('assembly-minute-loaded').textContent=selected.title;
  outcomeList.replaceChildren(...selected.agendas.map((row,index)=>{
   const item=document.createElement('li'),label=document.createElement('label'),select=document.createElement('select');
   const help=document.createElement('small');
   const title=document.createElement('span');
   title.textContent=row.title;label.append(title,select);select.id=`assembly-result-${index}`;select.className='form-control';
   select.append(option('결과 선택',''),...choices(row).map(key=>option(results[key],key)));
   const retained=previous.get(JSON.stringify(row));
   if(choices(row).includes(retained))select.value=retained;
   help.className='text-muted';item.append(label,help);
   return item;
  }));
  refresh();
 }
 open.addEventListener('click',async()=>{
  if(!panel.hidden){hide(true);return;}
  const stamp=++revision,active=()=>stamp===revision&&current();
  panel.hidden=false;open.setAttribute('aria-expanded','true');
  list.replaceChildren(option('총회 선택',''));list.disabled=true;apply.disabled=true;
  status.textContent='준비한 총회를 불러오는 중…';
  try{
   const found=await request('list');
   if(!active())return;
   for(const row of found)list.append(option(`${row.meeting_date} · ${row.title}`,row.id));
   list.disabled=!found.length;
   status.textContent=found.length?'':'불러올 총회가 없습니다. 회의자료가 완성된 총회만 표시됩니다.';
   if(found.length)list.focus();
  }catch{if(active())status.textContent='총회를 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.';}
 });
 list.addEventListener('change',()=>{revision++;apply.disabled=!list.value;status.textContent='';});
 close.addEventListener('click',()=>hide(true));
 apply.addEventListener('click',async()=>{
  const id=list.value;if(!id){hide(true);return;}
  const before=JSON.stringify(readSchedule()),stamp=++revision;
  const active=()=>stamp===revision&&current()&&id===list.value;
  apply.disabled=true;status.textContent='안건을 불러오는 중…';
  try{
   const row=await request('read',id);
   if(!active())return;
   if(before!==JSON.stringify(readSchedule())){status.textContent='입력 내용이 바뀌었습니다. 다시 불러오기를 눌러 주세요.';return;}
   const currentSchedule=readSchedule();
   const same=selected?.id===id;
   const sameAgendas=same&&JSON.stringify(selected.agendas)===JSON.stringify(row.agendas);
   if(!sameAgendas&&(selected||currentSchedule.title||currentSchedule.location)&&!await confirm('총회 기본정보와 안건을 바꿀까요? 참석 체크, 본문, 첨부는 그대로 둡니다.')){
    if(active())status.textContent='';return;
   }
   if(!active()||before!==JSON.stringify(readSchedule()))return;
   const previous=same ? new Map(selected.agendas.map((a,index)=>[JSON.stringify(a),el(`assembly-result-${index}`)?.value])) : new Map();
   if(same)row.title=currentSchedule.title||row.title;
   selected=row;applySchedule(row);showOutcomes(previous);hide();
   outcomeList.querySelector('select')?.focus();
  }catch(error){if(active())status.textContent=assemblyMinuteError(error,'안건을 불러오지 못했습니다.');}
  finally{if(active())apply.disabled=false;}
 });
 return {reset,refresh,hide,collect(){
  if(!selected)return null;
  const {notice_date,meeting_date,start_time,end_time,location}=readSchedule();
  for(const [key,value] of Object.entries({notice_date,meeting_date,start_time,end_time,location})){
   if(String(selected[key]||'').slice(0,key.endsWith('_time')?5:undefined)!==String(value||''))return {error:'불러온 총회의 일시·장소가 바뀌었습니다. 회의 준비 자료를 확인해 주세요.'};
  }
  const {ids,present,eligible}=attendance();
  const rows=selected.agendas.map((a,index)=>({...a,result:el(`assembly-result-${index}`).value}));
  for(const a of rows){
   if(!choices(a).includes(a.result))return {error:`‘${a.title}’ 안건의 결과를 선택하세요.`};
   if(isDecision(a)&&['PASS','REJECT'].includes(a.result)&&delegateVotesNeeded(a.type,present,eligible)===null)
    return {error:`‘${a.title}’의 결과를 기록하려면 실제 참석 대의원 수를 확인하세요.`};
  }
  return {rows, payload:{package_id:selected.id,revision:selected.revision,attendees:ids,results:rows.map(a=>({id:a.id,result:a.result}))}};
 }};
}

export function assemblyMinuteError(error,fallback) {
 const code=String(error?.message||'');
 return ({
  ASSEMBLY_PACKET_CHANGED:'준비 자료가 바뀌었습니다. 총회를 다시 불러와 안건을 확인해 주세요.',
  ASSEMBLY_ALREADY_LINKED:'이미 이 총회에 연결된 의사록이 있습니다. 의사록 목록에서 확인해 주세요.',
  ASSEMBLY_PACKET_UNAVAILABLE:'안건을 불러올 수 없습니다. 회의 준비에서 회의자료를 확인해 주세요.',
  ASSEMBLY_RESULTS_INVALID:'안건 결과와 실제 참석 대의원을 다시 확인해 주세요.',
  ASSEMBLY_ACCESS_REQUIRED:'이 업무를 열 수 있는 권한이 없습니다.',
  ASSEMBLY_FINAL_REQUIRED:'필요한 서명을 모두 받은 뒤 의사록을 마감해 주세요.'
 })[code]||fallback;
}

export async function mountAssemblyFollowup({rpc,id,body,current}) {
 const call=(action,payload={})=>rpc('assembly_minutes',{p_action:action,p_id:id,p_payload:payload});
 const heading=document.createElement('h4'),pane=document.createElement('section');
 const load=document.createElement('button'),note=document.createElement('p');
 heading.textContent='의결 후 할 일';note.setAttribute('role','status');
 load.type='button';load.className='btn btn-gray';load.textContent='후속 업무 확인';
 pane.append(heading,load,note);body.prepend(pane);
 load.onclick=async()=>{
  if(load.disabled||!current())return;load.disabled=true;note.textContent='';
  try {
   const {data,error}=await call('followups');
   if(!current())return;if(error)throw error;
   load.remove();
   if(!data.length){pane.remove();return;}
   for(const row of data){
    const item=document.createElement('p'),name=document.createElement('strong');
    name.textContent=row.title+' · ';item.append(name);
    const anchor=document.createElement('a');
    if(row.kind==='refund'){
     anchor.href='/erp/admin_member.html?scope=member_admin&tab=funds-manage';anchor.textContent='출자금 환급 관리 열기';item.append(anchor);
    }else{
     const make=document.createElement('button');make.type='button';make.className='btn btn-gray';
     anchor.href='/erp/registry_hub.html#cases';anchor.textContent='등기 진행관리 열기';anchor.hidden=true;
     make.textContent=row.kind==='report'?'변경신고 할 일 만들기':'등기·변경신고 할 일 만들기';
     item.append(make,anchor);make.onclick=async()=>{
      if(make.disabled||!current())return;make.disabled=true;
      try{
       const out=await call('prepare',{agenda_id:row.id});
       if(!current())return;if(out.error||!out.data?.id)throw out.error;
       make.remove();anchor.hidden=false;anchor.focus();note.textContent='진행관리에 연결했습니다.';
      }catch(error){if(current()){make.disabled=false;note.textContent=assemblyMinuteError(error,'후속 업무를 만들지 못했습니다.');}}
     };
    }
    pane.append(item);
   }
  }catch(error){if(current()){load.disabled=false;note.textContent=assemblyMinuteError(error,'후속 업무를 불러오지 못했습니다.');}}
 };
}
