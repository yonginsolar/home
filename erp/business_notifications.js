/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Business notifications v1.0.0. No recipients, templates or tenant IDs supplied by the browser. */
(()=>{
 'use strict';const pending=new Map();
 const label={vote_open:'투표 시작',vote_reminder:'미투표자 마감',vote_published:'결과 공개',official_registered:'임원 등록',official_term_end:'임기 종료 예정'};
 async function send(client,kind,sourceId,eventKey,button){
  const key=[kind,sourceId,eventKey].join(':');if(pending.has(key))return pending.get(key);
  if(!label[eventKey]||!sourceId)return;
  const task=(async()=>{
   const body={kind,source_id:String(sourceId),event_key:eventKey};
   const check=await client.functions.invoke('business-notification',{body});
   if(check.error||!check.data?.available)throw Error('현재 상태 또는 업무 권한으로 이 안내를 보낼 수 없습니다.');
   if(!(await window.CoopDialog.confirm(label[eventKey]+' 안내를 발송할까요? 이미 처리한 대상에게는 중복 발송하지 않습니다.')))return;
   const totals={accepted:0,failed:0,unknown:0,skipped:0};let remaining;
   do{
    const result=await client.functions.invoke('business-notification',{body:{...body,confirm:true}});
    if(result.error||!result.data?.ok)throw Error('발송 결과를 확인하지 못했습니다. 중복 발송을 막기 위해 자동 재시도하지 않습니다. 발송 내역을 확인해 주세요.');
    for(const k of Object.keys(totals))totals[k]+=Number(result.data[k]||0);
    remaining=Number(result.data.remaining||0);
    if(result.data.unknown){remaining=0;break;}
   }while(remaining>0);
   (await window.CoopDialog.alert('발송 접수 '+totals.accepted+'건 · 실패 '+totals.failed+'건 · 결과 확인 필요 '+totals.unknown+'건 · 사용 설정/연락처 확인 '+totals.skipped+'건'));
  })();pending.set(key,task);const oldDisabled=button?.disabled;if(button)button.disabled=true;
  try{await task;}catch(e){(await window.CoopDialog.alert(e.message||'안내 발송을 완료하지 못했습니다.'));}
  finally{pending.delete(key);if(button?.isConnected)button.disabled=oldDisabled;}
 }
 window.ERPBusinessNotifications={send,isBusy:()=>pending.size>0};
 window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});
})();
