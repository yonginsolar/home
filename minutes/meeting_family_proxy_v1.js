export async function renderFamilyProxy({root,current,rpc,confirm}){
 const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(text,style='btn-gray')=>{const b=make('button',text);b.type='button';b.className='btn '+style;return b;};
 const note=make('p');note.setAttribute('role','status');
 const title=make('h3','가족 대리 출석');
 const rows=make('div');
 const messages={ROSTER_REQUIRED:'조합원 위임 접수를 먼저 열어 명부를 준비해 주세요.',
   NOT_TODAY:'대리 출석은 총회 당일 등록할 수 있습니다.',CHECKS_REQUIRED:'위임장·신분증·등본을 모두 확인해 주세요.',
   INPUT_INVALID:'위임인과 대리인 이름·생년월일을 확인해 주세요.',MEETING_CHANGED:'총회 정보가 바뀌었습니다. 최신 공고를 확인해 주세요.',
   CLOSED:'출석 확인이 마감되었습니다.',CONFLICT:'이미 출석했거나 위임이 등록된 사람입니다.',UNAVAILABLE:'이 총회는 가족 대리 출석을 등록할 수 없습니다.'};
 const say=text=>{if(current())note.textContent=messages[text]||text;};
 root.replaceChildren(title,note,rows);
 async function refresh(){
  const data=await rpc('family_proxy_list');
  if(!current())return null;
  rows.replaceChildren();
  if(data?.status!=='READY'){say(data?.status||'UNAVAILABLE');return null;}
  if(data.rows?.length){
   rows.append(make('h4',`확인한 대리 출석 ${data.rows.length}건`));
   for(const item of data.rows){
    const row=make('div');row.className='btn-group';
    const revoke=button('출석 확인 취소','btn-outline');
    row.append(make('span',`${item.name} · ${item.member_no}`),revoke);rows.append(row);
    revoke.onclick=async()=>{
     if(revoke.disabled||!current())return;revoke.disabled=true;
     try{
      if(!await confirm('이 가족 대리 출석을 취소할까요? 확인 이력은 남습니다.')||!current())return;
      const result=await rpc('family_proxy_revoke',{receipt:item.receipt});
      if(!current())return;
      if(result?.status==='REVOKED'){say('가족 대리 출석을 취소했습니다.');try{await refresh();}catch{say('취소했습니다. 목록을 다시 열어 확인해 주세요.');}}
      else say(result?.status||'UNAVAILABLE');
     }catch{say('취소 결과를 확인하지 못했습니다.');}
     finally{revoke.disabled=false;}
    };
   }
  }
  return data;
 }
 const initial=await refresh();
 if(!current()||!initial)return;
 if(!initial.can_record){say('NOT_TODAY');return;}
 const search=make('form'),entry=make('form');search.autocomplete=entry.autocomplete='off';
 const field=(caption,type)=>{
  const wrap=make('label',caption),input=make('input');wrap.className='input-group';
  input.className='form-control';input.type=type;input.required=true;input.autocomplete='off';wrap.append(input);return {wrap,input};
 };
 const query=field('위임인 조합원 이름','text');query.input.maxLength=80;
 const find=button('검색');find.type='submit';search.append(query.wrap,find);
 const list=make('select');list.className='form-control';list.required=true;list.id='meeting-family-principal';
 const pick=make('div');pick.className='input-group';const pickLabel=make('label','위임인 조합원');pickLabel.htmlFor=list.id;pick.append(pickLabel,list);
 const name=field('가족 대리인 이름','text'),birth=field('가족 대리인 생년월일','date');name.input.maxLength=80;
 birth.input.min='1900-01-01';birth.input.max=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const checks=make('fieldset'),checkboxes={};checks.append(make('legend','현장 확인'));
 for(const [key,label] of [['mandate','서명한 위임장'],['identity','대리인 신분증'],['residency','동거하는 가족임을 확인할 수 있는 주민등록등본']]){
  const wrap=make('label');wrap.className='structured-official-check';const box=make('input');box.type='checkbox';box.required=true;
  wrap.append(box,document.createTextNode(label));checks.append(wrap);checkboxes[key]=box;
 }
 const save=button('가족 대리 출석으로 등록','btn-blue');save.type='submit';
 const resetList=()=>list.replaceChildren(new Option('위임인 선택',''));
 resetList();entry.append(pick,name.wrap,birth.wrap,checks,save);entry.hidden=true;
 root.insertBefore(search,rows);root.insertBefore(entry,rows);
 let read=0,busy=false,pending=null;
 query.input.oninput=()=>{read++;entry.hidden=true;resetList();};
 search.onsubmit=async e=>{
  e.preventDefault();if(busy||!current())return;
  const version=++read,q=query.input.value.trim();entry.hidden=true;resetList();say('');
  try{
   const results=await rpc('attendance_search',{name:q});
   if(!current()||read!==version)return;
   if(!results?.length){say('일치하는 조합원이 없습니다.');return;}
   list.append(...results.map(p=>new Option(`${p.name} · ${p.member_no}`,p.person)));
   entry.hidden=false;list.focus();
  }catch{if(read===version)say('조합원 명부를 확인하지 못했습니다.');}
 };
 entry.onsubmit=async e=>{
  e.preventDefault();if(busy||!current()||entry.hidden||!entry.reportValidity())return;
  const fields={principal:list.value,name:name.input.value.trim(),birth_date:birth.input.value,
    checks:Object.fromEntries(Object.entries(checkboxes).map(([key,box])=>[key,box.checked]))};
  if(!fields.name){say('INPUT_INVALID');return;}
  const key=JSON.stringify(fields);if(pending?.key!==key)pending={key,receipt:crypto.randomUUID()};
  busy=true;save.disabled=find.disabled=true;
  try{
   const result=await rpc('family_proxy_record',{...fields,receipt:pending.receipt});
   if(!current())return;
   if(result?.status!=='RECORDED'){say(result?.status||'UNAVAILABLE');return;}
   entry.reset();search.reset();resetList();entry.hidden=true;pending=null;
   say('가족 대리 출석으로 등록했습니다.');
   try{await refresh();}catch{say('등록했습니다. 목록을 다시 열어 확인해 주세요.');}
  }catch{say('처리 결과를 확인하지 못했습니다. 입력을 유지했으니 다시 등록해 주세요.');}
  finally{busy=false;save.disabled=find.disabled=false;}
 };
}
