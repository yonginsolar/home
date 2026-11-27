export async function renderGuestReceipts({root,current,rpc,confirm}){
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const button=text=>{const b=node('button',text);b.type='button';b.className='btn btn-gray';return b;};
 const note=node('p');note.setAttribute('role','status');root.replaceChildren(note);
 async function show(){
  const rows=await rpc('attendance_receipts');
  if(!current())return;
  root.replaceChildren(note);
  if(!Array.isArray(rows)||!rows.length){note.textContent='확인할 비로그인 접수가 없습니다.';return;}
  note.textContent='';
  for(const r of rows){
   const card=node('article');card.className='card';
   card.append(node('p',`${r.submitted_name||'이름 없음'}${r.phone_last4?' · '+r.phone_last4:''} · ${r.present===true?'출석 확인':r.present===false?'출석 해제':'확인 대기'}`));
   const search=document.createElement('form'),label=node('label','명부에서 이름으로 찾기'),input=document.createElement('input');
   const box=document.createElement('select'),find=button('검색'),save=button('출석으로 확인'),clear=button('출석 해제');
   input.className=box.className='form-control';input.maxLength=80;input.autocomplete='off';input.required=true;
   label.append(input);find.type='submit';box.setAttribute('aria-label','출석할 사람');
   box.append(new Option('명부에서 선택',''));
   if(r.candidate_id&&r.candidate_name){box.append(new Option(r.candidate_name,r.candidate_id));box.value=r.candidate_id;}
   save.disabled=!box.value;clear.hidden=r.present!==true;
   search.append(label,find);card.append(search,box,save,clear);root.append(card);
   let reading=0,busy=false;
   box.addEventListener('change',()=>{save.disabled=!box.value;});
   input.addEventListener('input',()=>{reading++;});
   search.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!current())return;
    const mark=++reading;
    try{
     const results=await rpc('attendance_search',{name:input.value.trim()});
     if(!current()||reading!==mark)return;
     box.replaceChildren(new Option('명부에서 선택',''),...results.map(p=>new Option(`${p.name} · ${p.member_no}`,p.person)));
     save.disabled=true;if(!results.length)note.textContent='일치하는 사람이 없습니다.';else box.focus();
    }catch{if(current()&&reading===mark)note.textContent='명부를 확인하지 못했습니다.';}
   });
   const update=async present=>{
    const person=present?box.value:r.candidate_id;
    if(!person||busy||!current())return;
    busy=true;save.disabled=clear.disabled=true;
    try{
     if(!await confirm(present?'선택한 사람의 출석으로 반영할까요?':'이 접수에서 반영한 출석을 해제할까요?')||!current())return;
     const result=await rpc('attendance_review',{receipt:r.request_id,person,revision:r.revision,present});
     if(!current())return;
     if(result?.status==='RECORDED'){await show();if(current())note.textContent=present?'출석을 반영했습니다.':'출석을 해제했습니다.';}
     else if(result?.status==='CONFLICT'){await show();if(current())note.textContent='먼저 처리된 접수가 있습니다. 현황을 확인해 주세요.';}
     else note.textContent='이 접수를 출석에 반영할 수 없습니다.';
    }catch{if(current())note.textContent='출석 처리 결과를 확인하지 못했습니다.';}
    finally{busy=false;if(current()){save.disabled=!box.value;clear.disabled=false;}}
   };
   save.onclick=()=>void update(true);clear.onclick=()=>void update(false);
  }
 }
 await show();
}
