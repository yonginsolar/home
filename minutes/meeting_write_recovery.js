/* Version v1.0.0. Memory-only request identity; never an authority cache. */
export function createMeetingWriteRecovery({call, owner, confirmPrevious=async()=>false, uuid=()=>crypto.randomUUID(), deadline=15000}) {
  const pending=new Map();
  const scope=(who,action,target)=>JSON.stringify([who.userId,who.coopId,action,target]);
  const identity=who=>JSON.stringify([who.userId,who.coopId]);
  const error=(message,code)=>Object.assign(new Error(message),{code});
  async function bounded(task) {
    let timer;
    try {return await Promise.race([Promise.resolve().then(task),new Promise(resolve=>{
      timer=setTimeout(()=>resolve({error:error('처리 결과를 아직 확인하지 못했습니다. 같은 버튼으로 이전 결과를 다시 확인해 주세요.','MEETING_WRITE_UNKNOWN')}),deadline);
    })]);} finally {clearTimeout(timer);}
  }
  async function invoke(entry,check) {
    const reply=await bounded(()=>call('meeting_write_once',{p_action:entry.action,p_request_key:entry.key,
      p_package_id:entry.packageId,p_body:entry.body,p_check_only:check}));
    if(reply.error)throw reply.error;
    return reply.data;
  }
  async function execute(action,packageId,body,{target=packageId,before,after,retainSuccess=false,current=()=>true}={}) {
    const who=await owner();
    if(!who.userId||!who.coopId)throw error('로그인과 현재 조합을 다시 확인해 주세요.','MEETING_ACCESS_DENIED');
    const slot=scope(who,action,target),serialized=JSON.stringify(body);
    let entry=pending.get(slot);
    if(entry?.running)return entry.running;
    const previous=!!entry;
    if(!entry){entry={action,packageId,key:uuid(),body:JSON.parse(serialized),serialized,who,before,after};pending.set(slot,entry);}
    const changed=entry.serialized!==serialized;
    entry.running=(async()=>{
      // First resolve an earlier attempt before considering any newer input.
      let reply=await invoke(entry,true);
      if(!reply?.found){
        if(!current())throw error('화면이 바뀌어 이전 준비를 중단했습니다. 원래 화면에서 다시 확인해 주세요.','MEETING_WRITE_STALE');
        if(changed && !(await confirmPrevious('이전 요청의 결과를 확인하지 못했습니다. 새 입력은 그대로 두고 이전 요청만 같은 내용으로 다시 확인할까요?')))
          throw error('새 입력은 유지했습니다. 이전 요청의 결과를 먼저 확인해 주세요.','MEETING_WRITE_PENDING_CHANGED');
        if(identity(await owner())!==identity(who))throw error('계정이나 조합이 바뀌어 이전 요청을 이어가지 않았습니다.','MEETING_WRITE_STALE');
        if(entry.before){const beforeReply=await bounded(()=>entry.before(entry,previous));if(beforeReply?.error)throw beforeReply.error;}
        if(!current()||identity(await owner())!==identity(who))throw error('계정·조합이나 화면이 바뀌어 이전 준비를 중단했습니다.','MEETING_WRITE_STALE');
        reply=await invoke(entry,false);
      }
      if(!reply?.found)throw error('처리 결과를 아직 확인하지 못했습니다. 다시 확인해 주세요.','MEETING_WRITE_UNKNOWN');
      if(identity(await owner())!==identity(who))throw error('계정이나 조합이 바뀌었습니다. 원래 계정에서 처리 결과를 다시 확인해 주세요.','MEETING_WRITE_STALE');
      if(entry.after){const afterReply=await bounded(()=>entry.after(reply.result,entry));if(afterReply?.error)throw afterReply.error;}
      entry.result=reply.result;
      if(!retainSuccess)pending.delete(slot);
      return {data:reply.result,error:null,previousInput:changed};
    })().catch(e=>{
      // Only an explicit SQL validation/authorization/conflict reply is definitive.
      // HTTP/network/timeout/cancellation keep the same key and exact body/File.
      if(/^(22|23|42|P0002|PT409|55000)/.test(String(e.code||'')) && !String(e.message).includes('UPLOAD_UNCONFIRMED'))pending.delete(slot);
      return {data:null,error:e};
    }).finally(()=>{entry.running=null;});
    return entry.running;
  }
  return {execute,acknowledge:async(action,target,id)=>{const who=await owner(),slot=scope(who,action,target),entry=pending.get(slot);
    if(entry?.result?.id===id && !entry.running)pending.delete(slot);},
    hasPending:async(action,target)=>{const who=await owner();return pending.has(scope(who,action,target));}};
}
