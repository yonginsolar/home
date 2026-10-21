import {client,codeMessage} from './client.js';
import {createAttachments} from './attachments.js';
const $=id=>document.getElementById(id),forms={approval:$('approvalForm'),member:$('memberForm'),site:$('siteForm'),profile:$('profileForm')};
let model=null,readVersion=0,refreshing=false,ended=false,expiry=0;
const dirty=new Set(),pending=new Map(),busy=new Set(),baselines=new Map(),editVersions=new Map();
const values=form=>Object.fromEntries(new FormData(form)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
for(const [name,form] of Object.entries(forms))baselines.set(name,values(form));
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
const attachments=createAttachments({getModel:()=>model,isEnded:()=>ended,message,onChange:()=>{updateDraftState();saveDrafts();},onList:()=>renderApprovalFiles()});
function draftKey(){return model?`expo-draft-v1:${model.workspace}:${model.role}`:null;}
function saveDrafts(){
 if(!model)return;const data={expires:expiry,forms:{},pending:[...pending],versions:[...editVersions]};
 for(const [name,form] of Object.entries(forms))if(dirty.has(name))data.forms[name]=values(form);
 try{localStorage.setItem(draftKey(),JSON.stringify(data));}catch{message('이 브라우저에 초안을 보관하지 못했어요. 창을 닫기 전에 내용을 복사해 주세요.',true);}
}
function updateDraftState(){
 for(const name of Object.keys(forms)){const el=document.querySelector(`[data-form-state="${name}"]`);el.textContent=pending.has(name)?'결과 확인 대기':dirty.has(name)?'작성 중':'';
  forms[name].querySelector('[type="submit"]').textContent=pending.has(name)?'결과 다시 확인':({approval:'승인 요청',member:'예시 조합원 등록',site:'변경사항 저장',profile:'변경사항 저장'})[name];}
 $('draftState').textContent=dirty.size||attachments.hasDraft()?'✍️ 작성 중인 내용이 있어요':'';
}
// Defaults refresh only untouched fields. Late reads never replace a form node,
// its draft or a file input, and a write invalidates any older list response.
function fill(name,next){
 if(!dirty.has(name)&&!pending.has(name))for(const [key,value] of Object.entries(next)){const el=forms[name].elements.namedItem(key);if(el)el.value=value??'';}
 baselines.set(name,next);updateDraftState();
}
function restore(){
 let data;try{data=JSON.parse(localStorage.getItem(draftKey())||'null');}catch{}
 if(!data||data.expires!==expiry)return;
 for(const [name,fields] of Object.entries(data.forms||{}))if(forms[name]){
  for(const [key,value] of Object.entries(fields)){const el=forms[name].elements.namedItem(key);if(el&&typeof value==='string')el.value=value;}
  dirty.add(name);
 }
 for(const [name,item] of data.pending||[])if(['approval','member','site','profile'].includes(name)&&item?.request_id)pending.set(name,item);
 for(const [name,version] of data.versions||[])if(['site','profile'].includes(name)&&typeof version==='string')editVersions.set(name,version);
 updateDraftState();
}
function notifyResult(result){
 const text=result?.simulation?'🔔 시연 알림 · 이 단계에서 알림이 발송됩니다. 지금은 실제로 전송하지 않았어요.':'저장했어요.';
 message(text);void window.CoopDialog.alert(text);
}
function closeConfirm(){window.CoopDialog.cancelAll(window);}
const ask=(title,text)=>window.CoopDialog.confirm(text,{title});
for(const [name,form] of Object.entries(forms))form.addEventListener('input',()=>{
 if(ended)return;
 if(same(values(form),baselines.get(name))&&!pending.has(name)){dirty.delete(name);editVersions.delete(name);}
 else{if(!dirty.has(name)&&['site','profile'].includes(name))editVersions.set(name,model?.[name]?.version);dirty.add(name);}
 updateDraftState();saveDrafts();
});
window.addEventListener('beforeunload',event=>{if(dirty.size||pending.size||attachments.hasDraft()){event.preventDefault();event.returnValue='';}});
function block(reason){
 ended=true;++readVersion;closeConfirm(false);$('ended').hidden=false;$('ended').textContent=reason;
 for(const form of Object.values(forms))for(const el of form.elements){if(el.type==='submit')el.disabled=true;else if(el.matches('input,textarea'))el.readOnly=true;}
 for(const el of document.querySelectorAll('[data-approve]'))el.disabled=true;
 $('refresh').disabled=true;$('checkSafety').disabled=true;client.auth.stopAutoRefresh();
 attachments.block();
}
async function rpc(action,data={}){let query=client.rpc('erp_demo_business',{p_action:action,p_data:{...(model?{workspace:model.workspace}:{}),...data}});if(action==='context'&&typeof query.abortSignal==='function')query=query.abortSignal(AbortSignal.timeout(15000));const {data:result,error}=await query;if(error)throw error;return result;}
client.auth.onAuthStateChange((event,session)=>{
 if(model&&(event==='SIGNED_OUT'||session?.user?.app_metadata?.erp_demo_workspace_id!==model.workspace))queueMicrotask(()=>block('다른 체험 계정이 열렸어요. 이 화면은 확인용으로 남겨 두었으니 새 체험 화면을 이용해 주세요.'));
});
function render(){
 const role=model.role;$('identity').textContent={administrator:'관리자',employee:'직원',member:'조합원'}[role]+' 계정으로 체험 중';
 const visibility={approvals:model.can_submit||model.can_process,members:model.can_members,site:model.can_site};
 for(const [name,visible] of Object.entries(visibility))document.querySelector(`[data-view="${name}"]`).hidden=!visible;
 $('compose').hidden=!model.can_submit;
 $('roleHint').textContent=role==='employee'?'전자결재에서 새 문서를 작성해 보세요. 닫았다 다시 열어도 글이 남아 있어요.':role==='administrator'?'전자결재의 승인 대기 문서를 확인해 보세요. 조합원 등록과 홈페이지 문구 수정도 해볼 수 있어요.':'내 정보를 수정하고 우리 홈페이지를 확인해 보세요. 관리자·직원 화면과 역할이 달라요.';
 $('notificationCount').textContent=`🔔 이 체험에서 시연 알림 ${model.simulated_notifications}건`;
 $('profileName').textContent=`${model.profile.name} · ${model.profile.member_id||'체험 조합원'}`;
 for(const [id,key] of [['savedHeroTitle','hero_title'],['savedHeroHighlight','hero_highlight'],['savedHeroSubtitle','hero_subtitle']])$(id).textContent=model.site[key]||'';
 fill('site',Object.fromEntries(['hero_title','hero_highlight','hero_subtitle'].map(k=>[k,model.site[k]])));
 fill('profile',{address:model.profile.address});
 const focused=document.activeElement?.dataset?.approve;
 $('approvalList').replaceChildren();
 if(!model.approvals.length){const p=document.createElement('p');p.textContent='아직 올린 문서가 없어요. 새 문서부터 작성해 볼까요?';$('approvalList').append(p);}
 for(const doc of model.approvals){
  const item=document.createElement('article');item.className='item';
  const title=document.createElement('h3');title.textContent=doc.title;const state=document.createElement('p');state.className='muted';state.textContent=`${doc.drafter_name} · ${doc.status==='진행중'?'승인 대기':doc.status}`;
  const body=document.createElement('p');body.className='body';const parsed=new DOMParser().parseFromString(doc.content||'','text/html');body.textContent=parsed.body.textContent||'';item.append(title,state,body);
  if(model.can_process&&doc.status==='진행중'){const button=document.createElement('button');button.textContent='문서 승인';button.className='primary';button.dataset.approve=String(doc.id);button.disabled=refreshing||busy.has('approve:'+doc.id)||ended;button.addEventListener('click',()=>approve(doc));item.append(button);}
  item.dataset.docId=String(doc.id);$('approvalList').append(item);
 }
 if(focused)document.querySelector(`[data-approve="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
 $('memberList').replaceChildren();for(const member of model.members){const item=document.createElement('p');item.className='item';item.textContent=`${member.name} · ${member.member_id||''} · ${member.status||'미설정'}`;$('memberList').append(item);}
 renderApprovalFiles();
}
function renderApprovalFiles(){
 document.querySelectorAll('[data-doc-files]').forEach(el=>el.remove());
 for(const card of document.querySelectorAll('[data-doc-id]')){
  const files=attachments.rows().filter(f=>String(f.approval_id)===card.dataset.docId);if(!files.length)continue;
  const group=document.createElement('div');group.dataset.docFiles='';group.className='actions';
  for(const file of files){const b=document.createElement('button');b.type='button';b.textContent='📎 '+file.name;b.disabled=ended;b.addEventListener('click',()=>void attachments.download(file));group.append(b);}card.append(group);
 }
 updateDraftState();
}
async function refresh({quiet=false}={}){
 if(ended)return;const version=++readVersion;refreshing=true;$('refresh').disabled=true;
 document.querySelectorAll('[data-approve]').forEach(b=>b.disabled=true);
 if(!quiet)message('최신 체험 자료를 확인하고 있어요…');
 try{
  const result=await rpc('context');if(version!==readVersion||ended)return;
  const first=!model;if(model&&model.workspace!==result.workspace){block('체험 공간이 바뀌었어요. 새 체험 화면을 이용해 주세요.');return false;}model=result;expiry=Date.parse(model.access.expires_at);
  if(!model.access.active){block(codeMessage('DEMO_ACCESS_ENDED'));return;}
  if(first)restore();
  refreshing=false;render();if(model.can_submit||model.can_process)void attachments.refresh();if(first)try{const view=localStorage.getItem(draftKey()+':view');if(view)showView(view,false);}catch{}
  if(!quiet)message('최신 내용을 불러왔어요.');return true;
 }catch(error){if(version!==readVersion||ended)return false;const code=String(error.message||'');if(/DEMO_(ACCESS_ENDED|CONTEXT_CHANGED)/.test(code))block(codeMessage(code));else message('체험 자료를 불러오지 못했어요. ‘목록 다시 확인’을 눌러 주세요.',true);return false;}
 finally{if(version===readVersion&&!ended){refreshing=false;$('refresh').disabled=false;document.querySelectorAll('[data-approve]').forEach(b=>b.disabled=busy.has('approve:'+b.dataset.approve));}}
}
function showView(view,remember=true){
 const button=document.querySelector(`[data-view="${CSS.escape(view)}"]`);if(!button||button.hidden)return;
 if($('editor').open)$('editor').close();closeConfirm(false);
 for(const p of document.querySelectorAll('[data-panel]'))p.hidden=p.dataset.panel!==view;
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b===button?'page':'false');
 if(remember&&model)try{localStorage.setItem(draftKey()+':view',view);}catch{}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('compose').addEventListener('click',()=>{if(!ended&&!$('editor').open){$('editor').showModal();$('docTitle').focus();}});
$('closeEditor').addEventListener('click',()=>$('editor').close());
document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',()=>void window.CoopDialog.alert(b.dataset.help,{title:'이렇게 써 보세요'})));
async function write(name,action,extra={},confirmation=null){
 if(ended||busy.has(name)||!model)return;busy.add(name);
 const form=forms[name],snapshot=values(form);
 try{
  if(confirmation&&!await ask(confirmation[0],confirmation[1]))return;
  if(ended||!same(snapshot,values(form)))return message('입력이 바뀌었어요. 지금 내용을 확인한 뒤 다시 눌러 주세요.');
  let request=pending.get(name);
  if(!request){request={...snapshot,...extra,...(name==='approval'?{file_ids:attachments.ids()}:{}),workspace:model.workspace,request_id:crypto.randomUUID()};pending.set(name,request);saveDrafts();}
  ++readVersion;refreshing=false;$('refresh').disabled=false;
  form.querySelector('[type="submit"]').disabled=true;updateDraftState();
  const result=await rpc(action,request);pending.delete(name);if(name==='approval')attachments.submitted(request.file_ids||[]);
  // The request may have completed while another edit was made. Preserve it.
  const sentFields=Object.fromEntries(Object.keys(snapshot).map(k=>[k,request[k]]));
  if(same(values(form),sentFields)){
   dirty.delete(name);editVersions.delete(name);if(name==='approval'||name==='member')form.reset();
  }else dirty.add(name);
  updateDraftState();saveDrafts();if(name==='approval'&&$('editor').open)$('editor').close();
  const refreshed=await refresh({quiet:true});if(refreshed)notifyResult(result);else{message('저장했지만 목록을 다시 불러오지 못했어요. ‘목록 다시 확인’을 눌러 주세요.',true);void window.CoopDialog.alert('저장했지만 목록을 다시 불러오지 못했어요. ‘목록 다시 확인’을 눌러 주세요.');}
 }catch(error){
  const code=String(error.message||'');
  if(/DEMO_(INPUT_INVALID|PERMISSION_REQUIRED|DOCUMENT_CHANGED|SETTINGS_CHANGED|PROFILE_CHANGED|WRITE_LIMIT)/.test(code))pending.delete(name);
  if(/DEMO_(ACCESS_ENDED|CONTEXT_CHANGED)/.test(code))block(codeMessage(code));else{message(codeMessage(code),true);void window.CoopDialog.alert(codeMessage(code));}
  saveDrafts();updateDraftState();
 }finally{busy.delete(name);form.querySelector('[type="submit"]').disabled=ended;}
}
forms.approval.addEventListener('submit',e=>{e.preventDefault();if(!pending.has('approval')&&!attachments.canSubmit())return void window.CoopDialog.alert('선택한 파일을 먼저 올린 뒤 승인 요청을 눌러 주세요.');void write('approval','submit',{},['승인을 요청할까요?','관리자 화면의 승인 대기에 문서가 나타나요.']);});
forms.member.addEventListener('submit',e=>{e.preventDefault();if(!forms.member.elements.name.value.trim())return message('예시 이름을 입력해 주세요.');void write('member','member_add');});
forms.site.addEventListener('submit',e=>{e.preventDefault();if(!dirty.has('site')&&!pending.has('site'))return message('변경한 내용이 없어요.');void write('site','site_save',{version:editVersions.get('site')||model.site.version});});
forms.profile.addEventListener('submit',e=>{e.preventDefault();if(!dirty.has('profile')&&!pending.has('profile'))return message('변경한 내용이 없어요.');void write('profile','profile_save',{version:editVersions.get('profile')||model.profile.version});});
async function approve(doc){
 const key='approve:'+doc.id;if(ended||refreshing||busy.has(key))return;busy.add(key);
 try{
  if(!await ask('이 문서를 승인할까요?',doc.title))return;
  const current=model.approvals.find(d=>d.id===doc.id);if(ended||refreshing||!current||current.version!==doc.version)return message('문서 상태가 바뀌었어요. 최신 목록을 확인해 주세요.');
  const request=pending.get(key)||{request_id:crypto.randomUUID(),id:doc.id,version:doc.version,workspace:model.workspace};pending.set(key,request);
  ++readVersion;const result=await rpc('approve',request);pending.delete(key);const refreshed=await refresh({quiet:true});if(refreshed)notifyResult(result);else message('승인했지만 목록을 다시 불러오지 못했어요. ‘목록 다시 확인’을 눌러 주세요.',true);
 }catch(e){const code=String(e.message||'');if(code.includes('DEMO_DOCUMENT_CHANGED'))pending.delete(key);message(codeMessage(code),true);}
 finally{busy.delete(key);if(!ended)document.querySelector(`[data-approve="${doc.id}"]`)?.removeAttribute('disabled');}
}
$('refresh').addEventListener('click',()=>void refresh());
// The same read-only denial probes back the visible boundary check and QA.
// No token/session is exposed, no approval can pass the fixed invalid revision.
window.ExpoSafetyCheck=async function({otherWorkspace=crypto.randomUUID(),otherDocument=9007199254740990}={}){
 if(!model||ended)throw Error('DEMO_ACCESS_ENDED');
 const raw=await client.from('coop_members').select('id',{head:true,count:'exact'});
 const platform=await client.rpc('platform_get_context');
 const graph=await client.schema('graphql_public').rpc('graphql',{query:'{__typename}'});
 const context=await client.rpc('erp_demo_business',{p_action:'context',p_data:{workspace:otherWorkspace}});
 const document=await client.rpc('erp_demo_business',{p_action:'approve',p_data:{workspace:model.workspace,id:otherDocument,version:'boundary-probe',request_id:crypto.randomUUID()}});
 return {rawBlocked:raw.status===403&&!!raw.error,rawStatus:raw.status,platformBlocked:platform.error?.code==='PT403',graphBlocked:graph.error?.code==='PT403',
   contextBlocked:String(context.error?.message||'').includes('DEMO_CONTEXT_CHANGED'),otherDocBlocked:!!document.error};
};
// Same authenticated download path as the visible file button; no session,
// file content or capability URL is returned by this diagnostic.
window.ExpoAttachmentCheck=async function({otherWorkspace=crypto.randomUUID(),otherPath='erp-expo/'+crypto.randomUUID()+'/missing.txt'}={}){
 if(!model||ended)throw Error('DEMO_ACCESS_ENDED');
 const listed=await client.rpc('erp_demo_file',{p_action:'list',p_data:{workspace:model.workspace}});
 const wrong=await client.rpc('erp_demo_file',{p_action:'list',p_data:{workspace:otherWorkspace}});
 const file=listed.data?.[0];let ownDownload=false,signBlocked=false;
 if(file){try{const read=await attachments.fetchFile(file);ownDownload=read.size===file.size;}catch{}
  const signed=await client.storage.from('attachments').createSignedUrl(file.path,3600);signBlocked=!!signed.error;}
 const other=await client.storage.from('attachments').download(otherPath);
 return {ownFileAvailable:!!file,ownDownload,signBlocked,wrongWorkspaceBlocked:!!wrong.error,otherFileBlocked:!!other.error};
};
// Read-only server-boundary probe. Deliberately usable after the UI expires so
// the test verifies the server, not merely disabled controls. Returns no bytes,
// tokens, download links, or session data.
window.ExpoAttachmentBoundaryCheck=async function({workspace,id}={}){
 if(!/^[0-9a-f-]{36}$/.test(workspace||'')||!/^[0-9a-f-]{36}$/.test(id||''))throw Error('INVALID_PROBE');
 const metadata=await client.rpc('erp_demo_file_get',{p_workspace:workspace,p_file_id:id});
 const read=await client.functions.invoke('erp-expo-file',{body:{workspace,id},signal:AbortSignal.timeout(30000)});
 return {metadataBlocked:!!metadata.error,downloadBlocked:!!read.error,status:read.error?.context?.status||read.response?.status||0};
};
$('checkSafety').addEventListener('click',async()=>{
 $('checkSafety').disabled=true;$('safetyResult').textContent='이 계정의 접근 범위를 확인하고 있어요…';
 try{const result=await window.ExpoSafetyCheck();$('safetyResult').textContent=Object.values(result).every(Boolean)?'🔒 확인했어요. 이 체험 공간의 허용된 업무만 사용할 수 있어요.':'일부 차단 결과를 확인하지 못했어요. 안내 부스로 문의해 주세요.';}
 catch{$('safetyResult').textContent='확인하지 못했어요. 다시 눌러 주세요.';}
 finally{$('checkSafety').disabled=ended;}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!refreshing&&!ended)void refresh({quiet:true});});
setInterval(()=>{
 if(!expiry||ended)return;const seconds=Math.max(0,Math.ceil((expiry-Date.now())/1000));$('clock').textContent=`남은 시간 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 if(!seconds)block(codeMessage('DEMO_ACCESS_ENDED'));
},1000);
void refresh();
