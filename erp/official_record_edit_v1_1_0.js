/* v1.1.0 — 기존 임원 수정 창의 감사 가능한 오기 삭제. */
(() => {
  'use strict';
  const fields = ['name','term_start_date','term_end_date','is_registered','term_count'];
  const labels = {name:'등록명',term_start_date:'임기 시작일',term_end_date:'임기 종료일',is_registered:'등기 여부',term_count:'회차'};
  const lockText = {ENDED:'종료된 직책 기록입니다.',ELECTION:'선거에서 가져온 기록입니다. 원본은 수정할 수 없습니다.',
    REFERENCED:'회의 또는 서명에서 참조한 기록입니다. 원본은 수정할 수 없습니다.',
    LEGACY_ELECTION_REVIEW:'선거와 연결됐는지 확인이 필요한 기존 기록입니다. 이 화면에서는 수정할 수 없습니다.',
    VOIDED:'오기 삭제된 기록입니다.'};
  const deleteLocks={REGISTRATION:'등기 또는 등기 여부 미확인 기록은 삭제할 수 없습니다.',
    PROTECTED:'서명·회의 등 보호 이력이 있는 기록은 삭제할 수 없습니다.'};
  const cleanReason=value=>value.replace(/^[\s\u200b]+|[\s\u200b]+$/g,'');
  const revision = v => /^\d+$/.test(String(v ?? ''));
  const formatValue = (key,value) => key==='is_registered' && value!=null ? (value?'등기':'미등기') : (value??'—');
  function create({client,dialog,getContext,refresh,findReturnFocus}) {
    const find = key => dialog.querySelector(`[data-official-edit=${key}]`);
    const select=find('record'), form=find('form'), save=find('save'), message=find('status'), list=find('history');
    const originals=find('source'), retry=find('retry'), controls=Object.fromEntries(fields.map(f=>[f,find(f)]));
    const remove=find('delete'), deleteForm=find('delete_form'), reason=find('delete_reason'), confirm=find('delete_confirm');
    const cancel=find('delete_cancel'), target=find('delete_target'), blocked=find('delete_block'), closeButton=find('close');
    let view=null, seq=0, previous=null;
    const drafts=new Map(), submitting=new Set(), deleting=new Set();
    const key=(scope,id)=>JSON.stringify([scope,id]);
    const now=()=>{const c=getContext();return c?.allowed ? c.key : '';};
    const active=r=>view===r && r.seq===seq && dialog.open && now()===r.owner && r.id===select.value;
    const input=()=>Object.fromEntries(fields.map(f=>[f,f==='is_registered'?controls[f].checked:controls[f].value]));
    const write=values=>fields.forEach(f=>{ if(f==='is_registered')controls[f].checked=values?.[f]===true;else controls[f].value=values?.[f]??''; });
    const baseline=data=>({name:data.name||'',term_start_date:data.term_start_date||'',term_end_date:data.term_end_date||'',
      is_registered:data.is_registered===true,term_count:data.term_count==null?'':String(data.term_count)});
    const note=text=>{message.textContent=text;};
    const pending=r=>submitting.has(key(r.owner,r.id))||deleting.has(key(r.owner,r.id));
    const canDelete=r=>r?.data?.delete_block_reason===null && !r.data.lock_reason && !r.conflict;
    function retain(){
      const r=view;
      if(!r?.data || r.data.lock_reason)return;
      const id=key(r.owner,r.id), v=input();
      if(JSON.stringify(v)===JSON.stringify(r.baseline))drafts.delete(id);
      else drafts.set(id,{revision:r.expected,values:v});
    }
    function sync(r){
      const editable=!!r?.data && !r.data.lock_reason && !r.conflict, busy=!!r && pending(r);
      const deleteBusy=!!r && deleting.has(key(r.owner,r.id)), preparing=r?.deleteMode===true;
      fields.forEach(f=>{controls[f].disabled=!editable||busy||preparing||(f==='is_registered' && r.data.category!=='executive');});
      save.disabled=!editable||busy||preparing||JSON.stringify(input())===JSON.stringify(r?.baseline);
      select.disabled=busy; save.textContent=busy&&!deleteBusy?'저장 중…':'저장';
      remove.hidden=!canDelete(r)||preparing;
      remove.disabled=busy;
      blocked.textContent=deleteLocks[r?.data?.delete_block_reason]||'';
      blocked.hidden=!blocked.textContent||!!r?.data?.lock_reason;
      deleteForm.hidden=!preparing;
      target.textContent=preparing?`${r.data.name||'선택한 임원'} · ${r.data.role||'직책'}`:'';
      reason.disabled=deleteBusy; confirm.disabled=busy||!canDelete(r);
      confirm.textContent=deleteBusy?'처리 중…':'삭제 확정';
      cancel.disabled=closeButton.disabled=deleteBusy;
    }
    function history(items){
      list.replaceChildren(); const d=dialog.ownerDocument;
      for(const entry of Array.isArray(items)?items:[]){
        const item=d.createElement('li'), who=d.createElement('div');
        const time=Date.parse(entry.updated_at);
        who.className='fw-semibold';who.textContent=`${entry.actor_label || '관리자'} · ${Number.isFinite(time)?new Date(time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—'}`;
        item.append(who);
        Object.entries(entry.changes||{}).forEach(([f,pair])=>{
          if(!Array.isArray(pair))return;
          const value=f==='delete_reason'?'오기 삭제 · 사유: '+String(pair[1]??'')
            : labels[f]?`${labels[f]}: ${formatValue(f,pair[0])} → ${formatValue(f,pair[1])}`:'';
          if(value){const line=d.createElement('div');line.textContent=value;item.append(line);}
        });
        list.append(item);
      }
      find('history_empty').hidden=list.childElementCount>0;
    }
    async function read(id=select.value, discard=false){
      const owner=now();if(!owner||!dialog.open||!revision(id))return;
      retain();
      const dk=key(owner,id);
      if(discard)drafts.delete(dk);
      const cached=drafts.get(dk), r={owner,id,seq:++seq};view=r;
      reason.value='';write(cached?.values); originals.textContent='';history([]);retry.hidden=true;note('임원 정보와 변경 기록을 확인하고 있습니다…');sync(r);
      let timer;
      try {
        const response=await Promise.race([client.rpc('read_official_record_edit_v2',{p_official_id:id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('조회 지연')),12000);})]);
        if(!active(r))return;
        const data=response.data;
        if(response.error||String(data?.id)!==id||!revision(data?.revision))throw Error('조회 실패');
        r.data=data;r.baseline=baseline(data);r.expected=cached?.revision??data.revision;
        originals.textContent=`${data.role || '직책'}${data.lock_reason ? ' · 읽기 전용' : ''}`;
        r.conflict=!!cached && String(r.expected)!==String(data.revision) && !data.lock_reason;
        write(data.lock_reason ? r.baseline : cached?.values??r.baseline);history(data.history);
        if(r.conflict){note('다른 곳에서 먼저 수정했습니다. 입력은 유지됩니다. 최신 값을 불러오려면 아래 버튼을 눌러 주세요.');retry.hidden=false;retry.textContent='작성값 버리고 최신 값 보기';}
        else note(data.lock_reason?(lockText[data.lock_reason]||'원본으로 연결된 기록은 수정할 수 없습니다.'):'');
        sync(r);
      } catch {if(active(r)){note('임원 정보를 확인하지 못했습니다.');retry.hidden=false;retry.textContent='다시 확인';}}
      finally{clearTimeout(timer);}
    }
    async function submit(event){
      event.preventDefault();const r=view;
      if(!r?.data||!active(r)||r.data.lock_reason||r.conflict||r.deleteMode||pending(r))return;
      const values=input(), name=values.name.trim();
      if(JSON.stringify(values)===JSON.stringify(r.baseline))return;
      const count=values.term_count===''?null:Number(values.term_count);
      if(controls.term_count.validity?.badInput||(count===null && r.baseline.term_count!=='') ||
         (count!==null && (!/^\d+$/.test(values.term_count)||!Number.isSafeInteger(count)||count<1||count>2147483646))){
        note('회차는 1 이상의 정수로 입력해 주세요.');return;
      }
      if(name.length>80||/[\x00-\x1f@]/.test(name)||name.replace(/[^0-9]/g,'').length>=9 || !values.term_start_date||!values.term_end_date||values.term_end_date<values.term_start_date){note('등록명과 임기 날짜를 확인해 주세요.');return;}
      const dk=key(r.owner,r.id);retain();submitting.add(dk);sync(r);note('저장하고 있습니다…');
      let refreshAfter=false;
      try {
        const {data,error}=await client.rpc('update_official_record_v2',{p_official_id:r.id,p_expected_revision:r.expected,
          p_name:name||null,p_term_start:values.term_start_date,p_term_end:values.term_end_date,p_is_registered:values.is_registered,p_term_count:count});
        if(error)throw error;
        if(String(data?.id)!==r.id || !revision(data?.revision))throw Error('응답 불명');
        drafts.delete(dk);refreshAfter=now()===r.owner;
        if(active(r)){r.baseline=values;r.data=null;}
      } catch(error){
        if(!active(r))return;
        if(error?.message==='OFFICIAL_TERM_COUNT_DUPLICATE'){
          note('이 조합원의 같은 직책에 이미 쓰인 회차입니다. 다른 회차를 선택해 주세요.');
        }else if(error?.message==='OFFICIAL_TERM_COUNT_INVALID'){
          note('회차는 1 이상의 정수로 입력해 주세요.');
        }else if(error?.code==='PT409'){
          r.conflict=true;note('다른 곳에서 수정했거나 기록이 잠겼습니다. 작성한 내용은 남겨두었습니다.');
          retry.hidden=false;retry.textContent='작성값 버리고 최신 값 보기';
        }else note('저장 결과를 확인하지 못했습니다. 작성한 내용은 유지됩니다.');
      } finally {submitting.delete(dk);if(active(r))sync(r);}
      if(active(r)&&!r.data){
        await read(r.id);
        if(view?.data && active(view) && view.id===r.id && !view.conflict)note('저장했습니다.');
      }
      if(refreshAfter)await refresh?.();
    }
    function cancelDelete(){
      const r=view;
      if(!r?.deleteMode||pending(r))return;
      r.deleteMode=false;reason.value='';note('');sync(r);
      (remove.hidden?select:remove).focus();
    }
    async function deleteRecord(event){
      event.preventDefault();const r=view;
      if(!r?.deleteMode||!active(r)||!canDelete(r)||pending(r))return;
      const why=cleanReason(reason.value);
      if(!why||why.length>300){note('삭제 사유를 입력해 주세요.');reason.focus();return;}
      const dk=key(r.owner,r.id);deleting.add(dk);note('삭제하고 있습니다…');sync(r);
      let timer, done=false;
      try{
        const {data,error}=await Promise.race([
          client.rpc('void_official_record',{p_official_id:r.id,p_expected_revision:r.expected,p_reason:why}),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('처리 지연')),12000);})
        ]);
        if(error)throw error;
        if(String(data?.id)!==r.id||!revision(data?.revision)||data.status!=='voided'||typeof data.changed!=='boolean')throw Error('응답 불명');
        drafts.delete(dk);done=true;
      }catch(error){
        if(!active(r))return;
        if(error?.code==='PT409'||error?.code==='42501'){
          r.conflict=true;note('기록이나 권한이 달라졌습니다. 최신 기록을 확인해 주세요.');
          retry.hidden=false;retry.textContent=JSON.stringify(input())===JSON.stringify(r.baseline)
            ?'최신 기록 보기':'작성값 버리고 최신 값 보기';
        }else if(error?.code==='55P03')note('연결된 기록을 확인 중입니다. 잠시 후 다시 시도해 주세요.');
        else note('삭제 결과를 확인하지 못했습니다. 같은 사유로 다시 확인해 주세요.');
      }finally{clearTimeout(timer);deleting.delete(dk);if(active(r))sync(r);}
      if(active(r)&&done){
        const selected=select.selectedOptions[0];
        if(selected&&!selected.textContent.endsWith(' · 삭제됨'))selected.textContent+=' · 삭제됨';
        r.data=null;await read(r.id);
        if(view?.data&&active(view)&&view.id===r.id&&view.data.lock_reason==='VOIDED'){note('삭제했습니다.');closeButton.focus();}
      }
      if(done&&now()===r.owner)await refresh?.();
    }
    function close(force=false){
      if(!dialog.open)return;
      if(!force&&view&&deleting.has(key(view.owner,view.id)))return;
      retain();const origin=previous, restore=origin?.owner===now() && dialog.contains(dialog.ownerDocument.activeElement);
      view=null;previous=null;++seq;dialog.close();
      if(restore) (origin.trigger?.isConnected ? origin.trigger : findReturnFocus?.(origin.ids))?.focus({preventScroll:true});
    }
    function open(rows,trigger){
      const owner=now();if(!owner || !rows?.length || dialog.open)return;
      previous={trigger,owner,ids:rows.map(row=>String(row.id))};select.replaceChildren();
      for(const row of rows){const option=dialog.ownerDocument.createElement('option');option.value=String(row.id);option.textContent=`${row.role || '직책'} · ${row.term_start_date || '—'}${row.status==='voided'?' · 삭제됨':row.status==='inactive'?' · 종료':''}`;select.append(option);}
      dialog.showModal();select.focus({preventScroll:true});void read();
    }
    form.addEventListener('submit',event=>{void submit(event);});
    form.addEventListener('input',()=>{retain();sync(view);});
    select.addEventListener('change',()=>{void read();});
    retry.addEventListener('click',()=>{void read(select.value,!!view?.conflict);});
    remove.addEventListener('click',()=>{
      const r=view;if(!r||!active(r)||!canDelete(r)||pending(r))return;
      r.deleteMode=true;note('');sync(r);reason.focus();
    });
    cancel.addEventListener('click',cancelDelete);
    deleteForm.addEventListener('submit',event=>{void deleteRecord(event);});
    closeButton.addEventListener('click',()=>close());
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(view?.deleteMode)cancelDelete();else close();});
    return Object.freeze({open,pause:()=>close(true)});
  }
  window.OfficialRecordEdit=Object.freeze({create});
})();
