/* Version: v1.0.0 — per-document leases and durable, exact-request save recovery. */
export function createMeetingDocumentEdits(rpc, uuid = () => crypto.randomUUID()) {
  const leases = new Map(), pending = new Map(), writes = new Map();
  const key = owner => JSON.stringify([owner.userId, owner.coopId, owner.packageId]);
  const leaseId = (owner, type) => `${key(owner)}:${type}`;
  const args = owner => ({p_package:owner.packageId,p_actor:owner.userId,p_coop:owner.coopId});
  const call = async (name, body) => {
    let timer;
    try {
      const response = await Promise.race([Promise.resolve(rpc(name, body)), new Promise((_,reject) => {
        timer=setTimeout(() => reject(Object.assign(new Error('요청 결과를 확인하지 못했습니다. 같은 저장 버튼으로 결과를 다시 확인해 주세요.'),{code:'MEETING_RESULT_UNKNOWN'})),15000);
      })]);
      if (response.error) throw response.error;
      return response.data;
    } finally { clearTimeout(timer); }
  };
  async function manage(owner, type, action='status', force=false) {
    const id=leaseId(owner,type);
    let entry=leases.get(id);
    if (!entry) { entry={token:uuid(),owned:false};leases.set(id,entry); }
    // A confirmed loss starts a new fencing token. An uncertain acquire retains its token.
    if (action==='acquire' && (force || entry.lost || (entry.expires_at && Date.parse(entry.expires_at)<=Date.now()))) { entry={token:uuid(),owned:false};leases.set(id,entry); }
    const token=entry.token;
    try {
      const data=await call('manage_meeting_document_edit',{...args(owner),p_type:type,p_lease_key:token,p_action:action,p_force:force});
      if (leases.get(id)===entry) Object.assign(entry,data,{lost:!data.owned,checkedAt:Date.now()});
      return data;
    } catch(error) {
      if (leases.get(id)===entry) {entry.owned=false;entry.checkedAt=0;}
      throw error;
    }
  }
  const owned = (owner,type) => {
    const l=leases.get(leaseId(owner,type));
    return !!(l?.owned && Date.parse(l.expires_at)>Date.now() && Date.now()-l.checkedAt<60000);
  };
  async function saveInternal(owner, documents) {
    const id=key(owner);
    let request=pending.get(id), previouslyUnknown=!!request;
    if (!request) {
      const rows=documents.map(({document_type:type,...payload}) => {
        const l=leases.get(leaseId(owner,type));
        if (!owned(owner,type)) throw Object.assign(new Error('먼저 문서의 편집권을 확인해 주세요. 작성한 내용은 남아 있습니다.'),{code:'MEETING_DOCUMENT_EDIT_REQUIRED'});
        return {document_type:type,lease_key:l.token,expected_revision:l.revision,payload:{
          title:payload.title,content_html:payload.content_html,version:payload.version||1,
          manually_edited:payload.manually_edited===true,generated_at:payload.generated_at||null
        }};
      });
      request={requestKey:uuid(),rows};pending.set(id,request);
    }
    try {
      let data;
      if (previouslyUnknown) {
        data=await call('get_meeting_document_save_result',{...args(owner),p_request_key:request.requestKey});
        if (!data.found) data=null;
      }
      if (!data) data=await call('save_meeting_documents_checked',{...args(owner),p_rows:request.rows,p_request_key:request.requestKey});
      if (!data?.verified || !Array.isArray(data.documents) || data.documents.length!==request.rows.length) throw new Error('저장 결과를 다시 확인해 주세요.');
      const result=data.documents.map(stamp=> {
        const row=request.rows.find(r=>r.document_type===stamp.document_type);
        if (!row) throw new Error('저장 대상 확인이 필요합니다.');
        const l=leases.get(leaseId(owner,row.document_type));
        // A replay after takeover confirms the old save, but must not resurrect its lease.
        if(l?.token===row.lease_key && l.owned) Object.assign(l,{revision:stamp.revision});
        return {...row.payload,...stamp};
      });
      pending.delete(id);
      return {data:result,error:null,recovered:previouslyUnknown};
    } catch(error) {
      // A denial of result lookup does not prove an earlier write failed.
      if(!previouslyUnknown && /^(PT409|22023|42501|23514|40001)$/.test(error.code||'')) pending.delete(id);
      return {data:null,error};
    }
  }
  function save(owner,documents) {
    const id=key(owner);
    if(writes.has(id))return writes.get(id);
    const task=saveInternal(owner,documents).finally(()=>{if(writes.get(id)===task)writes.delete(id);});
    writes.set(id,task);return task;
  }
  return {manage,owned,save,hasPending:owner=>pending.has(key(owner)),
    inspect:(owner,type)=>leases.get(leaseId(owner,type)),
    freeze(owner){for(const type of ['MATERIALS','SCENARIO','SCENARIO_SECRETARIAT']){const l=leases.get(leaseId(owner,type));if(l){l.owned=false;l.checkedAt=0;}}}
  };
}
