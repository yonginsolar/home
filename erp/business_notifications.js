/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Business notifications v1.0.2. Fence late preflight choices without retrying sends. */
(()=>{
 'use strict';const pending=new Map();let viewEpoch=0,frameObserver=null;
 const label={vote_open:'투표 시작',vote_reminder:'미투표자 마감',vote_published:'결과 공개',official_registered:'임원 등록',official_term_end:'임기 종료 예정'};
 function lockButton(job,button){if(button&&!job.buttons.has(button)){job.buttons.set(button,button.disabled);button.disabled=true;}}
 const visible=button=>!document.hidden&&!window.frameElement?.hidden&&(!button||button.isConnected&&!button.closest('[hidden],[inert],.hidden,.d-none,.tab-pane:not(.active)'));
 async function availability(client,body){let timer;try{return await Promise.race([client.functions.invoke('business-notification',{body}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('발송 준비 조회가 지연되고 있습니다. 다시 눌러 확인해 주세요.')),15000);})]);}finally{clearTimeout(timer);}}
 async function send(client,kind,sourceId,eventKey,button){
  if(frameObserver?.takeRecords().length)viewEpoch++;
  const key=[kind,sourceId,eventKey].join(':');
  if(pending.has(key)){const job=pending.get(key);lockButton(job,button);return job.promise;}
  if(!label[eventKey]||!sourceId||!visible(button))return;
  const epoch=viewEpoch,current=()=>epoch===viewEpoch&&visible(button);
  const job={buttons:new Map(),promise:null};pending.set(key,job);lockButton(job,button);
  job.promise=Promise.resolve().then(async()=>{
   const body={kind,source_id:String(sourceId),event_key:eventKey};
   const check=await availability(client,body);if(!current())return;
   if(check.error||!check.data?.available)throw Error('현재 상태 또는 업무 권한으로 이 안내를 보낼 수 없습니다.');
   if(!(await window.CoopDialog.confirm(label[eventKey]+' 안내를 발송할까요?'))||!current())return;
   const totals={accepted:0,failed:0,unknown:0,skipped:0};let remaining;
   do{
    const result=await client.functions.invoke('business-notification',{body:{...body,confirm:true}});
    if(result.error||!result.data?.ok)throw Error('발송 결과를 확인하지 못했습니다. 중복 발송을 막기 위해 자동 재시도하지 않습니다. 발송 내역을 확인해 주세요.');
    for(const k of Object.keys(totals))totals[k]+=Number(result.data[k]||0);
    remaining=Number(result.data.remaining||0);
    if(result.data.unknown){remaining=0;break;}
   }while(remaining>0);
   if(current())(await window.CoopDialog.alert('발송 접수 '+totals.accepted+'건 · 실패 '+totals.failed+'건 · 결과 확인 필요 '+totals.unknown+'건 · 사용 설정/연락처 확인 '+totals.skipped+'건'));
  }).catch(async e=>{if(current())await window.CoopDialog.alert(e.message||'안내 발송을 완료하지 못했습니다.');})
   .finally(()=>{pending.delete(key);for(const [trigger,wasDisabled]of job.buttons)if(trigger.isConnected)trigger.disabled=wasDisabled;});
  return job.promise;
 }
 window.ERPBusinessNotifications={send,isBusy:()=>pending.size>0};
 window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>viewEpoch++);document.addEventListener('visibilitychange',()=>{if(document.hidden)viewEpoch++;});
 if(window.frameElement){frameObserver=new MutationObserver(records=>{if(records.length)viewEpoch++;});frameObserver.observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});}
})();
