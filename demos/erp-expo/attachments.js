import {client,codeMessage} from './client.js';
// The File objects remain on this page across modal/menu changes. Uploaded
// object IDs may be resumed, but no bytes, blob URLs or signed URLs are cached.
export function createAttachments({getModel,isEnded,onChange,onList,message}){
 const input=document.getElementById('attachmentInput'),button=document.getElementById('uploadAttachments'),list=document.getElementById('attachmentList');
 let rows=[],choices=[],selected=new Set(),generation=0,uploading=false,restored=false;
 const urls=new Set(),opening=new Set(),reads=new Map();
 const key=()=>{const m=getModel();return m?`expo-files-v1:${m.workspace}:${m.role}`:null;};
 const remember=()=>{try{if(key())localStorage.setItem(key(),JSON.stringify([...selected]));}catch{}};
 const rpc=async(action,data={})=>{
  const m=getModel();if(!m||isEnded())throw Error('DEMO_ACCESS_ENDED');
  let request=client.rpc('erp_demo_file',{p_action:action,p_data:{workspace:m.workspace,...data}});
  if(action==='list'&&request.abortSignal)request=request.abortSignal(AbortSignal.timeout(15000));
  const {data:result,error}=await request;if(error)throw error;return result;
 };
 const render=()=>{
  list.replaceChildren();
  for(const row of rows.filter(r=>!r.approval_id)){
   const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=isEnded()||uploading;
   check.addEventListener('change',()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);remember();onChange();});
   const text=document.createElement('span');text.textContent=`${row.name} · 업로드됨`;
   const open=document.createElement('button');open.type='button';open.textContent='열기';open.disabled=isEnded();open.addEventListener('click',()=>void download(row));
   label.append(check,text);li.append(label,open);list.append(li);
  }
  for(const item of choices){const li=document.createElement('li');li.textContent=`${item.file.name} · ${item.state||'선택됨'}`;list.append(li);}
  button.disabled=isEnded()||uploading||!choices.length;input.disabled=isEnded()||uploading;
 };
 async function refresh(){
  const current=++generation,workspace=getModel()?.workspace;
  try{const result=await rpc('list');if(current!==generation||isEnded()||workspace!==getModel()?.workspace)return;
   rows=result;
   if(!restored){try{const saved=JSON.parse(localStorage.getItem(key())||'[]');if(Array.isArray(saved))selected=new Set([...selected,...saved.filter(id=>rows.some(r=>r.id===id&&!r.approval_id))]);}catch{}restored=true;}
   selected=new Set([...selected].filter(id=>rows.some(r=>r.id===id&&!r.approval_id)));remember();render();onList(rows);
  }catch(e){if(current===generation&&!isEnded()){message('첨부 목록을 불러오지 못했어요. ‘목록 다시 확인’을 눌러 주세요.',true);}}
 }
 async function download(row){
  if(isEnded()||opening.has(row.id))return;opening.add(row.id);const workspace=getModel()?.workspace;
  try{const data=await fetchFile(row);
   if(isEnded()||workspace!==getModel()?.workspace)return;
   const url=URL.createObjectURL(data);urls.add(url);const a=document.createElement('a');a.href=url;a.download=row.name;a.click();
   setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);
  }catch(error){if(!isEnded())message(String(error?.message||'').includes('DEMO_DOWNLOAD_LIMIT')?codeMessage('DEMO_DOWNLOAD_LIMIT'):'파일을 열지 못했어요. 체험 시간이 남아 있다면 다시 눌러 주세요.',true);}
  finally{opening.delete(row.id);}
 }
 async function fetchFile(row){
  const m=getModel();if(!m||isEnded())throw Error('DEMO_ACCESS_ENDED');
  const key=m.workspace+':'+row.id;if(reads.has(key))return await reads.get(key);
  const task=(async()=>{const {data,error,response}=await client.functions.invoke('erp-expo-file',{body:{workspace:m.workspace,id:row.id},signal:AbortSignal.timeout(30000)});
   if(error){let code;try{code=(await error.context.json()).error;}catch{}throw Error(code==='DEMO_DOWNLOAD_LIMIT'?code:'DEMO_FILE_UNAVAILABLE');}
   if(!(data instanceof Blob)||data.size!==row.size)throw Error('DEMO_FILE_UNAVAILABLE');
   const mime=response?.headers.get('X-Coop-File-Mime')||'application/octet-stream';
   return new Blob([data],{type:mime});})();reads.set(key,task);
  try{return await task;}finally{if(reads.get(key)===task)reads.delete(key);}
 }
 input.addEventListener('change',()=>{
  if(isEnded()||uploading)return;
  const incoming=[...input.files];
  if(incoming.length>5||incoming.some(f=>!f.size||f.size>10485760||!/\.(pdf|png|jpe?g|webp|txt)$/i.test(f.name))){
   input.value='';message('PDF·PNG·JPG·WebP·TXT를 파일당 10MB, 한 번에 5개까지 선택해 주세요.',true);return;
  }
  choices=incoming.map(file=>({file,id:crypto.randomUUID()}));render();onChange();
 });
 document.getElementById('sampleAttachment').addEventListener('click',()=>{
  if(isEnded()||uploading)return;input.value='';
  choices=[{id:crypto.randomUUID(),file:new File(['박람회 ERP 첨부파일 체험\n실제 개인정보나 업무 자료가 없는 예시입니다.\n'],'체험 안내.txt',{type:'text/plain'})}];render();onChange();
 });
 button.addEventListener('click',async()=>{
  if(uploading||isEnded()||!choices.length)return;
  if(!window.CoopCheckedUploads){message('파일 검사 도구를 불러오지 못했어요. 체험 화면을 다시 열어 주세요.',true);return;}
  if(selected.size+choices.length>5){message('문서에는 파일을 5개까지 첨부할 수 있어요. 첨부 선택을 확인해 주세요.',true);return;}
  uploading=true;++generation;render();
  const original=choices,workspace=getModel()?.workspace;
  try{
   for(const item of original){
    // Result-unknown retry checks immutable server receipt before another upload.
    const existing=await rpc('list');let row=existing.find(r=>r.id===item.id);
    if(!row){const type=({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain'})[item.file.name.split('.').at(-1).toLowerCase()];
     const reservation=await rpc('reserve',{id:item.id,name:item.file.name,size:item.file.size,mime:type});
     if(isEnded()||workspace!==getModel()?.workspace)throw Error('DEMO_ACCESS_ENDED');
     const {error}=await client.storage.from('attachments').upload(reservation.path,item.file,{upsert:false,cacheControl:'0'});if(error)throw error;
     // Independently confirm Storage success, not only Edge HTTP 200.
     row=(await rpc('list')).find(r=>r.id===item.id);if(!row)throw Error('DEMO_FILE_UNAVAILABLE');
    }
    if(isEnded()||workspace!==getModel()?.workspace)return;
    rows=[...rows.filter(r=>r.id!==row.id),row];selected.add(row.id);item.state='업로드됨';remember();
   }
   if(choices===original){choices=[];input.value='';}message('첨부파일을 올렸어요. 승인 요청을 누르면 문서에 함께 첨부돼요.');onChange();
  }catch(error){if(!isEnded())message(error?.name==='StorageApiError'?error.message:codeMessage(error?.message),true);}
  finally{uploading=false;render();onList(rows);}
 });
 return {
  refresh,download,fetchFile,rows:()=>rows,ids:()=>[...selected],hasDraft:()=>choices.length>0||selected.size>0,
  canSubmit:()=>!uploading&&!choices.length,
  submitted(ids){selected=new Set([...selected].filter(id=>!ids.includes(id)));remember();render();},
  block(){++generation;for(const url of urls)URL.revokeObjectURL(url);urls.clear();document.getElementById('sampleAttachment').disabled=true;render();},
 };
}
