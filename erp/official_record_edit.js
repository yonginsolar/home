/* v1.0.0 — official record correction and history. */
(() => {
  'use strict';
  const fields = ['name','term_start_date','term_end_date','is_registered'];
  const labels = {name:'등록명',term_start_date:'임기 시작일',term_end_date:'임기 종료일',is_registered:'등기 여부'};
  const lockText = {ENDED:'종료된 직책 기록입니다.',ELECTION:'선거에서 가져온 기록입니다. 원본은 수정할 수 없습니다.',
    REFERENCED:'회의 또는 서명에서 참조한 기록입니다. 원본은 수정할 수 없습니다.',
    LEGACY_ELECTION_REVIEW:'선거와 연결됐는지 확인이 필요한 기존 기록입니다. 이 화면에서는 수정할 수 없습니다.'};
  const revision = v => /^\d+$/.test(String(v ?? ''));
  const formatValue = (key,value) => key==='is_registered' && value!=null ? (value?'등기':'미등기') : (value??'—');
  function create({client,dialog,getContext,refresh,findReturnFocus}) {
    const find = key => dialog.querySelector(`[data-official-edit=${key}]`);
    const select=find('record'), form=find('form'), save=find('save'), message=find('status'), list=find('history');
    const originals=find('source'), retry=find('retry'), controls=Object.fromEntries(fields.map(f=>[f,find(f)]));
    let view=null, seq=0, previous=null;
    const drafts=new Map(), submitting=new Set();
    const key=(scope,id)=>JSON.stringify([scope,id]);
    const now=()=>{const c=getContext();return c?.allowed ? c.key : '';};
    const active=r=>view===r && r.seq===seq && dialog.open && now()===r.owner && r.id===select.value;
    const input=()=>Object.fromEntries(fields.map(f=>[f,f==='is_registered'?controls[f].checked:controls[f].value]));
    const write=values=>fields.forEach(f=>{ if(f==='is_registered')controls[f].checked=values?.[f]===true;else controls[f].value=values?.[f]??''; });
    const baseline=data=>({name:data.name||'',term_start_date:data.term_start_date||'',term_end_date:data.term_end_date||'',is_registered:data.is_registered===true});
    const note=text=>{message.textContent=text;};
    const pending=r=>submitting.has(key(r.owner,r.id));
    function retain(){
      const r=view;
      if(!r?.data || r.data.lock_reason)return;
      const id=key(r.owner,r.id), v=input();
      if(JSON.stringify(v)===JSON.stringify(r.baseline))drafts.delete(id);
      else drafts.set(id,{revision:r.expected,values:v});
    }
    function sync(r){
      const editable=!!r?.data && !r.data.lock_reason && !r.conflict, busy=!!r && pending(r);
      fields.forEach(f=>{controls[f].disabled=!editable||busy||(f==='is_registered' && r.data.category!=='executive');});
      save.disabled=!editable||busy||JSON.stringify(input())===JSON.stringify(r?.baseline);
      select.disabled=busy; save.textContent=busy?'저장 중…':'저장';
    }
    function history(items){
      list.replaceChildren(); const d=dialog.ownerDocument;
      for(const entry of Array.isArray(items)?items:[]){
        const item=d.createElement('li'), who=d.createElement('div');
        const time=Date.parse(entry.updated_at);
        who.className='fw-semibold';who.textContent=`${entry.actor_label || '관리자'} · ${Number.isFinite(time)?new Date(time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—'}`;
        item.append(who);
        Object.entries(entry.changes||{}).forEach(([f,pair])=>{
          if(!labels[f] || !Array.isArray(pair))return;
          const line=d.createElement('div');line.textContent=`${labels[f]}: ${formatValue(f,pair[0])} → ${formatValue(f,pair[1])}`;item.append(line);
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
      write(cached?.values); originals.textContent='';history([]);retry.hidden=true;note('임원 정보와 변경 기록을 확인하고 있습니다…');sync(r);
      let timer;
      try {
        const response=await Promise.race([client.rpc('read_official_record_edit',{p_official_id:id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('조회 지연')),12000);})]);
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
      if(!r?.data||!active(r)||r.data.lock_reason||r.conflict||pending(r))return;
      const values=input(), name=values.name.trim();
      if(JSON.stringify(values)===JSON.stringify(r.baseline))return;
      if(name.length>80||/[\x00-\x1f@]/.test(name)||name.replace(/[^0-9]/g,'').length>=9 || !values.term_start_date||!values.term_end_date||values.term_end_date<values.term_start_date){note('등록명과 임기 날짜를 확인해 주세요.');return;}
      const dk=key(r.owner,r.id);retain();submitting.add(dk);sync(r);note('저장하고 있습니다…');
      let refreshAfter=false;
      try {
        const {data,error}=await client.rpc('update_official_record',{p_official_id:r.id,p_expected_revision:r.expected,
          p_name:name||null,p_term_start:values.term_start_date,p_term_end:values.term_end_date,p_is_registered:values.is_registered});
        if(error)throw error;
        if(String(data?.id)!==r.id || !revision(data?.revision))throw Error('응답 불명');
        drafts.delete(dk);refreshAfter=now()===r.owner;
        if(active(r)){r.baseline=values;r.data=null;}
      } catch(error){
        if(!active(r))return;
        if(error?.code==='PT409'){
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
    function close(){
      if(!dialog.open)return;
      retain();const origin=previous, restore=origin?.owner===now() && dialog.contains(dialog.ownerDocument.activeElement);
      view=null;previous=null;++seq;dialog.close();
      if(restore) (origin.trigger?.isConnected ? origin.trigger : findReturnFocus?.(origin.ids))?.focus({preventScroll:true});
    }
    function open(rows,trigger){
      const owner=now();if(!owner || !rows?.length || dialog.open)return;
      previous={trigger,owner,ids:rows.map(row=>String(row.id))};select.replaceChildren();
      for(const row of rows){const option=dialog.ownerDocument.createElement('option');option.value=String(row.id);option.textContent=`${row.role || '직책'} · ${row.term_start_date || '—'}${row.status==='inactive'?' · 종료':''}`;select.append(option);}
      dialog.showModal();select.focus({preventScroll:true});void read();
    }
    form.addEventListener('submit',event=>{void submit(event);});
    form.addEventListener('input',()=>{retain();sync(view);});
    select.addEventListener('change',()=>{void read();});
    retry.addEventListener('click',()=>{void read(select.value,!!view?.conflict);});
    find('close').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    return Object.freeze({open,pause:close});
  }
  window.OfficialRecordEdit=Object.freeze({create});
})();
