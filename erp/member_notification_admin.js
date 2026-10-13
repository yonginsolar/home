/* Member notification administration v1.0.5. Read on demand; no tokens or local persistence. */
(() => {
 'use strict';
 let client,owner='',generation=0,tab='summary',ctx,events=[],detailRevision=0;
 const drafts=new Map(),reads=new Map(),busy=new Set();
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=value=>Number(value||0).toLocaleString('ko-KR');
 const date=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
 const stateLabel={linked:'연결됨',pending:'연결 안됨 · 연결 대기',unlinked:'연결 안됨',inactive:'연결 안됨 · 비활성',
  accepted:'발송 접수',delivered:'수신 완료',sent:'발송 접수',failed:'실패',unknown:'결과 확인 필요',
  sending:'처리 중',processing:'처리 중',queued:'대기',skipped:'발송 안 함',deferred:'보류',legacy_unconfirmed:'기존 기록 · 결과 미확인'};
 const errorText=e=>/PT409|SETTINGS_CHANGED/.test(String(e?.message||''))?'다른 담당자가 설정을 변경했습니다. 새로 확인한 뒤 다시 저장해 주세요.':
  /REQUIRED|DENIED|NOT_FOUND/.test(String(e?.message||''))?'권한 또는 조회 대상을 확인해 주세요.':'불러오지 못했습니다. 다시 시도해 주세요.';
 function capture(key){const read=(reads.get(key)||0)+1;reads.set(key,read);const gen=generation;return()=>gen===generation&&reads.get(key)===read;}
 async function rpc(action,data={}){const r=await client.rpc('member_notification_admin',{p_action:action,p_data:data});if(r.error)throw r.error;return r.data;}
 function range(){
  const start=$('notification-start')?.value,end=$('notification-end')?.value;
  return {...(start?{start:start+'T00:00:00+09:00'}:{}),...(end?{end:end+'T23:59:59.999+09:00'}:{})};
 }
 function mount(){
  const root=$('tab-notifications');if(!root||root.dataset.mounted)return;root.dataset.mounted='1';
  root.innerHTML='<div class="d-flex align-items-center justify-content-between gap-3 mb-3"><h3 class="fw-bold mb-0">알림 관리</h3><button type="button" class="btn btn-outline-secondary btn-sm" data-notification-refresh>새로 확인</button></div>'+
   '<div class="notification-tabs nav nav-pills mb-3" role="tablist">'+[['summary','현황'],['connections','텔레그램 연결'],['history','발송 내역'],['settings','메시지 설정']].map(([k,t])=>'<button type="button" role="tab" class="nav-link" data-notification-tab="'+k+'">'+t+'</button>').join('')+'</div>'+
   '<div id="notification-period" class="d-flex flex-wrap align-items-end gap-2 mb-3"><label>시작일<input class="form-control" data-erp-query-control type="date" id="notification-start"></label><label>종료일<input class="form-control" data-erp-query-control type="date" id="notification-end"></label><button type="button" class="btn btn-outline-primary" data-notification-refresh>조회</button></div>'+
   '<div id="notification-status" role="status" class="mb-3"></div><div id="notification-content"></div>';
  const today=new Date(),end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(today);
  today.setDate(today.getDate()-30);
  $('notification-start').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(today);$('notification-end').value=end;
  root.addEventListener('click',async e=>{
   const t=e.target.closest('[data-notification-tab]');if(t){tab=t.dataset.notificationTab;await refresh();return;}
   if(e.target.closest('[data-notification-refresh]')){await refresh();return;}
   const message=e.target.closest('[data-notification-message]');if(message){await preview(message.dataset.notificationMessage);return;}
   const save=e.target.closest('[data-notification-save]');if(save){await saveSetting(save.dataset.notificationSave);return;}
   const next=e.target.closest('[data-notification-offset]');if(next){await loadList(Number(next.dataset.notificationOffset));return;}
   const member=e.target.closest('[data-notification-member]');if(member&&typeof window.openMemberDetail==='function')window.openMemberDetail(member.dataset.notificationMember);
  });
  root.addEventListener('change',e=>{
   const toggle=e.target.closest('[data-notification-setting]');if(!toggle)return;
   const key=toggle.dataset.notificationSetting,event=events.find(x=>x.event_key===key);if(!event)return;
   if(toggle.checked===event.requested_enabled)drafts.delete(key);else drafts.set(key,{value:toggle.checked,revision:event.revision});
   const save=root.querySelector('[data-notification-save="'+key+'"]');if(save)save.disabled=!drafts.has(key);
  });
 }
 async function refresh(){
  mount();if(!client)return;
  const current=capture('main');
  document.querySelectorAll('[data-notification-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.notificationTab===tab);b.setAttribute('aria-selected',String(b.dataset.notificationTab===tab));});
  $('notification-period').classList.toggle('d-none',!['summary','history'].includes(tab));$('notification-status').textContent='조회 중…';
  // Keep a settings editor and its drafts while revalidating the server context.
  if(tab!=='settings')$('notification-content').replaceChildren();
  try{
   if(tab==='connections'||tab==='history'){await loadList(0);if(current())$('notification-status').textContent='';return;}
   const result=await rpc(tab,range());if(!current())return;ctx=result;
   if(tab==='settings'){events=result.events||[];renderSettings();}
   else {
    const t=result.telegram||{},r=result.results||{};
    $('notification-content').innerHTML='<div class="notification-metrics">'+[['텔레그램 연결',t.linked],['연결 대기',t.pending],['미연결',t.unlinked],['기간 내 발송 접수',r.accepted],['실패·결과 확인 필요',Number(r.failed||0)+Number(r.unknown||0)]].map(([label,n])=>'<div class="card p-3"><div class="text-secondary">'+label+'</div><strong class="fs-3">'+num(n)+'</strong></div>').join('')+'</div>';
   }
   $('notification-status').textContent='';
  }catch(e){if(current()){
   $('notification-status').textContent=errorText(e);
   if(tab==='settings'&&events.length){ctx={...ctx,can_edit:false};renderSettings();}
   else if(!drafts.size)$('notification-content').replaceChildren();
  }}
 }
 function renderSettings(){
  const ownChannel=events.find(x=>x.channel_name)?.channel_name;
  $('notification-content').innerHTML='<div class="notification-channel border rounded p-3 mb-3"><strong>카카오 채널</strong><span class="ms-2">'+esc(ownChannel||'연결되지 않음')+'</span><span class="ms-3 text-secondary">문자 대체발송: 꺼짐</span><p class="mt-2 mb-0 notification-routing">텔레그램 연결 시 먼저 발송합니다. 일시적인 실패는 한 번 재시도하며, 연결되지 않은 경우에만 아래 설정에 따라 카톡을 발송합니다. 접수 여부가 불확실하면 중복 발송을 막기 위해 재전송을 멈추고 결과를 확인합니다. 법정대리인 동의 요청·접수는 카톡으로 발송합니다. 검수·연동 대기 알림은 아직 발송하지 않습니다.</p></div>'+
   '<div class="table-responsive"><table class="table align-middle"><thead><tr><th>알림</th><th>카톡 사용</th><th>설정 상태</th><th>문구</th><th>저장</th></tr></thead><tbody>'+events.map(e=>{
    const draft=drafts.get(e.event_key),value=e.adapter==='telegram_only'?false:draft?draft.value:e.requested_enabled,locked=!ctx.can_edit||!e.ready;
    return '<tr><td>'+esc(e.label)+'</td><td><label class="form-check form-switch"><input type="checkbox" class="form-check-input" data-erp-query-control data-notification-setting="'+esc(e.event_key)+'" aria-label="'+esc(e.label)+' 카톡 사용" '+(value?'checked ':'')+(locked?'disabled':'')+'></label></td>'+
     '<td>'+(e.adapter==='telegram_only'?'텔레그램 전용':!e.ready?(e.adapter==='common_prepared'?'승인 · 업무 연결 준비':e.adapter==='pending'?'검수·연동 대기':'채널 연결 필요'):(draft?'미저장':e.enabled?'사용':'사용 안 함'))+'</td><td><button type="button" class="btn btn-outline-secondary btn-sm" data-notification-message="'+esc(e.event_key)+'">문구 보기</button></td>'+
     '<td><button type="button" class="btn btn-primary btn-sm" data-notification-save="'+esc(e.event_key)+'" '+(!draft||!ctx.can_edit||busy.has(e.event_key)?'disabled':'')+'>저장</button></td></tr>';
   }).join('')+'</tbody></table></div>';
 }
 async function saveSetting(key){
  const draft=drafts.get(key);if(!draft||busy.has(key))return;const gen=generation;busy.add(key);renderSettings();
  const savedEvent=events.find(e=>e.event_key===key);
  if(savedEvent&&draft.revision!==savedEvent.revision){
   if(!window.confirm('다른 담당자가 변경한 현재 설정에 이 변경을 적용할까요?')){busy.delete(key);renderSettings();return;}
   draft.revision=savedEvent.revision;
  }
  try{
   const result=await rpc('save',{event_key:key,enabled:draft.value,revision:draft.revision});if(gen!==generation)return;
   if(drafts.get(key)===draft)drafts.delete(key);ctx=result;events=result.events||[];
   $('notification-status').textContent='저장되었습니다.';
  }catch(e){
   if(gen===generation){
    $('notification-status').textContent=errorText(e);
    if(/PT409|SETTINGS_CHANGED/.test(String(e?.code||'')+' '+String(e?.message||''))){
     try{const current=await rpc('settings');if(gen===generation){ctx=current;events=current.events||[];}}catch{}
    }
   }
  }
  finally{if(gen===generation){busy.delete(key);renderSettings();}}
 }
 async function loadList(offset){
  const current=capture('list'),mode=tab;if(!['history','connections'].includes(mode))return;
  const content=$('notification-content'),search=$('notification-search')?.value||'',channel=$('notification-channel-filter')?.value||'',status=$('notification-result-filter')?.value||'',connectionState=$('notification-connection-filter')?.value||'';
  $('notification-status').textContent='조회 중…';
  try{
   const result=await rpc(mode,{...range(),offset,search,channel,status,...(mode==='connections'?{connection_state:connectionState}:{})});if(!current()||tab!==mode)return;ctx=result;
   const all=mode==='history'?(result.history||[]):(result.rows||[]),more=all.length>25,rows=all.slice(0,25);
   content.innerHTML='<form id="notification-search-form" class="d-flex flex-wrap gap-2 mb-3"><input class="form-control notification-search" id="notification-search" data-erp-query-control placeholder="이름 검색" aria-label="이름 검색">'+
    (mode==='history'?'<select class="form-select notification-filter" id="notification-channel-filter" data-erp-query-control aria-label="발송 채널"><option value="">전체 채널</option><option value="telegram">텔레그램</option><option value="kakao">카톡</option></select><select class="form-select notification-filter" id="notification-result-filter" data-erp-query-control aria-label="발송 결과"><option value="">전체 결과</option>'+['accepted','failed','unknown','skipped','queued','legacy_unconfirmed'].map(k=>'<option value="'+k+'">'+stateLabel[k]+'</option>').join('')+'</select>':'<select class="form-select notification-filter" id="notification-connection-filter" data-erp-query-control aria-label="텔레그램 연결 상태"><option value="">전체 연결 상태</option><option value="linked">연결됨</option><option value="unlinked">연결 안됨</option></select>')+
    '<button class="btn btn-outline-primary" type="submit">검색</button></form>'+
    (rows.length?'<div class="table-responsive"><table class="table align-middle"><thead><tr>'+ (mode==='connections'?'<th>조합원</th><th>연결 상태</th><th>연결일</th>':'<th>시간</th><th>대상자</th><th>알림</th><th>채널</th><th>결과</th>')+'</tr></thead><tbody>'+rows.map(r=>mode==='connections'?'<tr><td><button type="button" class="btn btn-link p-0" data-notification-member="'+esc(r.member_uid)+'">'+esc(r.name)+'</button><span class="small text-secondary ms-2">'+esc(r.member_number)+'</span></td><td>'+esc(stateLabel[r.state]||'확인 필요')+'</td><td>'+esc(date(r.linked_at))+'</td></tr>':
     '<tr><td>'+esc(date(r.at))+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.event)+'</td><td>'+(r.channel==='telegram'?'텔레그램':'카톡')+'</td><td>'+esc(stateLabel[r.status]||'확인 필요')+(r.error_code?'<div class="small text-secondary">'+esc(r.error_code)+'</div>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="border rounded p-4 text-secondary">조회된 내역이 없습니다.</div>')+
    '<div class="d-flex justify-content-end gap-2 mt-2"><button type="button" class="btn btn-outline-secondary btn-sm" data-notification-offset="'+Math.max(0,offset-25)+'" '+(!offset?'disabled':'')+'>이전</button><button type="button" class="btn btn-outline-secondary btn-sm" data-notification-offset="'+(offset+25)+'" '+(!more?'disabled':'')+'>다음</button></div>';
   $('notification-search').value=search;if(mode==='history'){$('notification-channel-filter').value=channel;$('notification-result-filter').value=status;}else $('notification-connection-filter').value=connectionState;
   $('notification-search-form').addEventListener('submit',e=>{e.preventDefault();void loadList(0);});
   $('notification-status').textContent='';
  }catch(e){if(current()){$('notification-status').textContent=errorText(e);content.replaceChildren();}}
 }
 async function preview(key){
  let dialog=$('notification-message-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='notification-message-dialog';dialog.className='notification-message-dialog';dialog.setAttribute('aria-labelledby','notification-message-title');dialog.innerHTML='<div class="d-flex justify-content-between align-items-center mb-3"><h4 class="mb-0" id="notification-message-title">알림 문구</h4><button type="button" class="btn-close" aria-label="닫기"></button></div><div class="nav nav-pills mb-3" role="tablist"><button type="button" role="tab" class="nav-link active" data-preview-channel="telegram">텔레그램</button><button type="button" role="tab" class="nav-link" data-preview-channel="kakao">카톡</button></div><p id="notification-message-state" role="status"></p><pre id="notification-message-body" tabindex="0"></pre>';document.body.append(dialog);dialog.querySelector('.btn-close').onclick=()=>dialog.close();}
  const current=capture('preview');dialog.dataset.channel='telegram';dialog.showModal();$('notification-message-state').textContent='조회 중…';$('notification-message-body').textContent='';
  dialog.querySelectorAll('[data-preview-channel]').forEach(b=>{b.onclick=null;b.disabled=true;b.classList.toggle('active',b.dataset.previewChannel==='telegram');});
  try{
   const result=await client.functions.invoke('notification-template-preview',{body:{event_key:key},headers:{'x-erp-host':location.hostname}});
   if(result.error||result.data?.error)throw result.error||new Error(result.data.error);if(!current()||!dialog.open)return;
   const data=result.data;
   const render=()=>{
    const channel=dialog.dataset.channel,text=data[channel];
    $('notification-message-state').textContent=channel==='kakao'?({telegram_only:'카톡으로 발송하지 않습니다.',review_pending:'검수 중인 문안',approved_prepared:'승인 문안 · 업무 연결 준비 중',not_connected:'이 조합의 카카오 채널이 연결되지 않았습니다.',not_configured:'템플릿 설정이 필요합니다.',not_sendable:'사용 가능한 승인 템플릿을 확인할 수 없습니다.',approved:'연결된 승인 문안'}[data.source]||''):
     (data.source==='telegram_only'?'텔레그램으로만 발송합니다.':data.source==='approved_prepared'?'승인 문안 · 업무 연결 준비 중':data.source==='review_pending'||['guardian_request','guardian_complete'].includes(key)?'연동 준비 문안':'');
    $('notification-message-body').textContent=text||'이 알림은 해당 채널로 발송하지 않습니다.';
    dialog.querySelectorAll('[data-preview-channel]').forEach(b=>{b.classList.toggle('active',b.dataset.previewChannel===channel);b.setAttribute('aria-selected',String(b.dataset.previewChannel===channel));});
   };
   dialog.querySelectorAll('[data-preview-channel]').forEach(b=>{b.disabled=false;b.onclick=()=>{dialog.dataset.channel=b.dataset.previewChannel;render();};});render();
  }catch(e){if(current()&&dialog.open)$('notification-message-state').textContent=errorText(e);}
 }
 async function detail(memberUid){
  const box=$('md-notification-status');if(!box||!client)return;const rev=++detailRevision,gen=generation;box.hidden=false;box.textContent='알림 연결 확인 중…';
  try{
   const data=await rpc('detail',{member_uid:memberUid,limit:5});
   if(rev!==detailRevision||gen!==generation)return;
   const link=data.rows?.[0];if(!link)throw new Error('MEMBER_NOT_FOUND');
   box.innerHTML='<h6 class="fw-bold">알림</h6><div>텔레그램: '+esc(stateLabel[link.state]||'확인 필요')+(link.linked_at?' <span class="small text-secondary">'+esc(date(link.linked_at))+'</span>':'')+'</div>'+
    '<details class="mt-2"><summary>최근 알림 내역</summary><div class="mt-2">'+(data.history||[]).slice(0,5).map(r=>'<div class="small mb-2">'+esc(date(r.at))+' · '+esc(r.event)+' · '+(r.channel==='telegram'?'텔레그램':'카톡')+' · '+esc(stateLabel[r.status]||'확인 필요')+'</div>').join('')+(!(data.history||[]).length?'<span class="text-secondary small">최근 30일 내역이 없습니다.</span>':'')+'</div></details>';
  }catch(e){if(rev===detailRevision&&gen===generation)box.textContent=errorText(e);}
 }
 function clearDetail(){++detailRevision;const box=$('md-notification-status');if(box){box.replaceChildren();box.hidden=true;}}
 function clear(){
  ++generation;++detailRevision;reads.clear();drafts.clear();busy.clear();ctx=null;events=[];owner='';client=null;
  const root=$('tab-notifications');if(root){root.replaceChildren();delete root.dataset.mounted;}
  const d=$('notification-message-dialog');if(d){if(d.open)d.close();d.remove();}clearDetail();
 }
 function configure(api,runtime,userId){
  const key=String(userId||'')+':'+String(runtime?.coop_id||'');if(key!==owner){clear();owner=key;}client=api;
 }
 window.addEventListener('beforeunload',e=>{if(drafts.size||busy.size){e.preventDefault();e.returnValue='';}});
 window.MemberNotificationAdmin={configure,open:refresh,refresh,detail,clearDetail,clear,hasUnsaved:()=>drafts.size>0||busy.size>0};
})();
