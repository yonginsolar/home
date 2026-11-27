const labels={CLOSED:'출석 확인이 마감되었습니다.',NOT_TODAY:'가족 대리 출석은 총회 당일에 확인할 수 있습니다.',
 CONFLICT:'이미 출석했거나 다른 위임으로 등록된 사람입니다.',MEETING_CHANGED:'총회 정보가 바뀌었습니다.',
 CHECKS_REQUIRED:'신분증과 주민등록등본을 확인해 주세요.',UNAVAILABLE:'위임 정보를 확인할 수 없습니다.'};
const make=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const button=(text,style='btn-outline')=>{const node=make('button',text);node.type='button';node.className='btn '+style;return node;};
function printLink(meeting,receipt){
 const link=make('a',receipt?'위임장 보기·인쇄':'명단 보기·인쇄');
 const url=new URL('./assembly_proxy.html',location.href);
 url.searchParams.set('staff',receipt?'proof':'list');url.searchParams.set('meeting',meeting);
 if(receipt)url.searchParams.set('record',receipt);
 link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='btn btn-outline';return link;
}
export async function renderProxyRegister({root,current,rpc,confirm,meeting,storage}){
 const status=make('p');status.setAttribute('role','status');
 const entries=make('div');
 const say=text=>{if(current())status.textContent=labels[text]||text||'';};
 root.replaceChildren(make('h3','위임 명단'),status,entries);
 async function refresh(){
  const data=await rpc('proxy_staff_list');
  if(!current())return;
  if(data?.status!=='READY'){say('조합원 위임 접수를 먼저 열어 주세요.');return;}
  if(!data.rows?.length){entries.replaceChildren(make('p','접수된 위임이 없습니다.'));return;}
  entries.replaceChildren();
  if(data.rows.some(row=>row.represented))entries.append(printLink(meeting));
  for(const row of data.rows){
   const panel=make('section');panel.className='card';
   const family=row.kind==='family';
   const caption=row.represented?'대리 출석 확인':family?'현장 확인 전':'대리인 QR 출석 전';
   const agent=row.agent||'동거 가족', agentNo=!family&&row.agent_no?` (${row.agent_no})`:'';
   panel.append(make('h4',`${row.name} · ${row.member_no}`),make('p',`${agent}${agentNo} · ${caption}`));
   const actions=make('div');actions.className='btn-group';panel.append(actions);
   if(row.proof)actions.append(printLink(meeting,row.receipt));
   if(family&&row.proof&&!row.represented&&data.can_verify){
    const details=make('details'),summary=make('summary','현장 확인');details.append(summary);
    const form=make('form'),checks=[];
    for(const label of ['대리인 신분증','동거 가족이 표시된 주민등록등본']){
     const wrap=make('label');wrap.className='structured-official-check';
     const field=make('input');field.type='checkbox';field.required=true;checks.push(field);
     wrap.append(field,document.createTextNode(label));form.append(wrap);
    }
    const save=button('대리 출석 기록','btn-blue');save.type='submit';form.append(save);details.append(form);panel.append(details);
    form.onsubmit=async event=>{
     event.preventDefault();if(!current()||save.disabled||!form.reportValidity())return;
     save.disabled=true;checks.forEach(field=>field.disabled=true);say('');
     try{
      const result=await rpc('proxy_staff_verify',{receipt:row.receipt,identity:true,residency:true});
      if(!current())return;
      if(result?.status==='RECORDED'){say('가족 대리 출석을 기록했습니다.');await refresh();}
      else say(result?.status||'UNAVAILABLE');
     }catch{say('기록을 확인하지 못했습니다. 같은 버튼을 다시 눌러 주세요.');}
     finally{save.disabled=false;checks.forEach(field=>field.disabled=false);}
    };
   }
   if(family&&row.represented&&data.can_verify){
    const undo=button('출석 확인 취소');actions.append(undo);
    undo.onclick=async()=>{
     if(undo.disabled||!current())return;undo.disabled=true;
     try{
      if(!await confirm('이 가족 대리 출석 확인을 취소할까요?')||!current())return;
      const result=await rpc('family_proxy_revoke',{receipt:row.receipt});
      if(!current())return;
      if(result?.status==='REVOKED'){say('출석 확인을 취소했습니다.');await refresh();}
      else say(result?.status||'UNAVAILABLE');
     }catch{say('취소 결과를 확인하지 못했습니다.');}finally{undo.disabled=false;}
    };
   }
   if(family&&row.represented&&row.proof){
    if(row.registry){
     const download=button('주민등록등본 받기');actions.append(download);
     download.onclick=async()=>{
      if(!current()||download.disabled)return;download.disabled=true;
      try{
       const result=await rpc('proxy_staff_registry',{receipt:row.receipt});
       if(!current()||result?.status!=='READY'){say('등본을 확인할 수 없습니다.');return;}
       const {data:blob,error}=await storage().download(result.path);
       if(!current())return;
       if(error||!blob)throw error||Error('File missing');
       const url=URL.createObjectURL(blob),link=make('a');link.href=url;link.download='주민등록등본.pdf';link.click();
       setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch{say('등본을 받지 못했습니다.');}finally{download.disabled=false;}
     };
    }else{
     const entry=make('form'),label=make('label','주민등록등본 (PDF)'),input=make('input');
     input.type='file';input.accept='.pdf,application/pdf';input.required=true;label.append(input);
     const save=button('첨부','btn-gray');save.type='submit';entry.append(label,save);panel.append(entry);
     entry.onsubmit=async event=>{
      event.preventDefault();if(!current()||save.disabled||!entry.reportValidity())return;
      const file=input.files[0];if(!/\.pdf$/i.test(file.name)||!file.size||file.size>20*1024*1024){say('20MB 이하 PDF를 선택해 주세요.');return;}
      save.disabled=input.disabled=true;say('');
      try{
       const result=await rpc('proxy_staff_registry',{receipt:row.receipt});
       if(!current()||result?.status!=='READY'){say('등본을 첨부할 수 없습니다.');return;}
       const {error}=await storage().upload(result.path,file,{upsert:false,contentType:'application/pdf',cacheControl:'0'});
       if(!current())return;
       if(error){
        const latest=await rpc('proxy_staff_list');
        if(!latest?.rows?.some(item=>item.receipt===row.receipt&&item.registry))throw error;
       }
       say('등본을 첨부했습니다.');await refresh();
      }catch{say('첨부 결과를 확인하지 못했습니다. 파일을 유지했으니 다시 눌러 주세요.');}
      finally{save.disabled=input.disabled=false;}
     };
    }
   }
   entries.append(panel);
  }
 }
 await refresh();
}
