/* Personal AI connection detail access. Never enabled by loading or reopening. */
(function () {
  'use strict';
  const consent = 'member-details-2026-11-v1';
  const operations = new WeakMap();
  const validId = id => typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
  const node = (tag, value, css) => {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (css) el.className = css;
    return el;
  };
  const btn = (value, style='secondary') => {
    const el = node('button',value,'btn btn-outline-'+style);
    el.type = 'button';
    el.addEventListener('keydown',e=>{ if(e.repeat && !e.isComposing && ['Enter',' '].includes(e.key)) e.preventDefault(); });
    return el;
  };
  const date = v => new Intl.DateTimeFormat('ko-KR',{ dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul' }).format(new Date(v));
  const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const validOrigin = v => {
    if (typeof v !== 'string' || v.length>270) return false;
    try { const u = new URL(v); return v===u.origin && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))); }
    catch { return false; }
  };
  const displayState = d => d && ['off','enabled','blocked'].includes(d.status) &&
    Number.isSafeInteger(d.revision) && d.revision>=0 && typeof d.name==='string' && Array.from(d.name).length<=80 &&
    Array.isArray(d.origins) && d.origins.length<=5 && d.origins.every(v=>{
      try { return validOrigin(new URL(v).origin) && new URL(v).pathname==='/' && !/[?#@]/.test(v); } catch {return false;}
    }) && validDate(d.connection_created_at) && validDate(d.possible_until) &&
    (d.status==='off'||validDate(d.expires_at));
  function withDeadline(work,ms=12000){
    let timer;return Promise.race([work,new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('TIMEOUT')),ms))]).finally(()=>clearTimeout(timer));
  }
  const changed = op => op.listeners.forEach(fn=>fn());
  function open(client, { id, current, opener }) {
    if (!validId(id) || !current() || document.querySelector('dialog.ai-member-details[open]')) return null;
    let active = operations.get(client);
    if (!active) { active = new Map(); operations.set(client,active); }
    const dlg = node('dialog',undefined,'ai-panel ai-member-details');
    dlg.setAttribute('aria-labelledby','aiMemberDetailsTitle');
    const title = node('h2','조합원 이름 조회');title.id='aiMemberDetailsTitle';
    const closeBtn = btn('닫기');closeBtn.autofocus=true;
    const head = node('header',undefined,'ai-admin-header');head.append(title,closeBtn);
    const body = node('div',undefined,'ai-admin-body');
    const line = node('p','');line.setAttribute('role','status');
    const detail = node('div');
    const retry = btn('다시 확인');retry.hidden=true;
    body.append(line,detail,retry);dlg.append(head,body);document.body.append(dlg);
    let closed=false, reading=false, snapshot=null, observed=null, notice='';
    const alive = ()=> !closed && dlg.open && current();
    const unwatch = ()=> {if(observed)observed.listeners.delete(paintOperation);observed=null;};
    const dispose = () => {
      if(closed) return;closed=true;unwatch();dlg.remove();
      const a=document.activeElement;
      if(current()&&opener?.isConnected&&(!a||a===document.body||a===dlg))opener.focus({preventScroll:true});
    };
    const close = () => {if(dlg.open)dlg.close();dispose();};
    dlg.addEventListener('close',dispose);closeBtn.addEventListener('click',close);
    try { dlg.showModal(); } catch {dispose();return null;}
    const call = async (action,d={})=>{
      const res=await client.rpc('erp_ai_member_details_manage',{p_action:action,p_data:{id,...d}});
      if(res.error)throw new Error('DETAIL_SETTINGS_UNAVAILABLE');
      return res.data;
    };
    function paintOperation(){
      if(!alive())return;
      const op=active.get(id);
      if(!op){line.textContent='설정 결과가 바뀌었습니다. 다시 확인해 주세요.';retry.hidden=false;retry.disabled=reading;return;}
      if(op.pending && !op.unknown){
        line.textContent='설정을 확인하고 있습니다.';retry.hidden=true;
      }else{
        line.textContent='처리 결과를 아직 확인하지 못했습니다. 다시 확인해 주세요.';
        retry.hidden=false;retry.disabled=reading;
      }
    }
    function watch(op){
      if(observed===op)return;unwatch();observed=op;
      if(op)op.listeners.add(paintOperation);
    }
    function render(data){
      if(!alive())return;
      snapshot=displayState(data)?data:null;
      detail.replaceChildren();retry.hidden=true;retry.disabled=false;
      if(!snapshot){
        line.textContent='이 연결에서는 조합원 이름 조회를 설정할 수 없습니다.';
        return;
      }
      const op=active.get(id);
      watch(op);
      const heading=node('p','AI 앱: '+data.name);
      const origins = data.origins.map(v=>new URL(v).origin).join(' · ');
      const target = node('p','등록 주소: '+origins,'ai-muted');
      detail.append(heading,target,node('p','연결 승인: '+date(data.connection_created_at),'ai-muted'),
        node('p','정조합원 이름과 가입일·조합원번호가 비어 있는 이유만 최대 10명까지 전달합니다. 조합원번호 자체는 전달하지 않습니다.'));
      if(data.status==='off'){
        line.textContent=notice||'꺼짐';
        detail.append(node('p','켜면 최대 7일 동안 이 AI 연결에만 적용됩니다. 현재 연결 기준 최장 '+date(data.possible_until)+'까지입니다. 언제든 끌 수 있습니다.','ai-muted'));
      }else{
        line.textContent=data.status==='blocked'?'현재 권한으로 이름을 조회할 수 없습니다.':notice||'켜짐';
        detail.append(node('p','만료: '+date(data.expires_at)+' · 끄면 이후 조회만 중단됩니다. 이미 전달된 결과는 AI 앱에 남을 수 있습니다.','ai-muted'));
      }
      if(op){paintOperation();return;}
      const turningOn=data.status==='off';
      const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=false;
      const label=node('label',undefined,'ai-member-details-check');
      label.append(checkbox,node('span',turningOn?'이 AI 연결에만 조합원 이름 조회를 허용합니다.':'이 AI 연결에서 조합원 이름 조회를 끕니다.'));
      const submit=btn(turningOn?'이름 조회 켜기':'이름 조회 끄기',turningOn?'primary':'danger');submit.disabled=true;
      checkbox.addEventListener('change',()=>{submit.disabled=!checkbox.checked;});
      submit.addEventListener('click',()=>{
        if(!alive()||reading||!checkbox.checked||snapshot!==data||active.has(id))return;
        send(turningOn?'enable':'revoke',data.revision);
      });
      detail.append(label,submit);
    }
    async function lookup(){
      if(!alive()||reading)return;
      reading=true;retry.disabled=true;
      const before=active.get(id);
      try{
        const answer=await withDeadline(call('status'));
        if(!alive())return;
        if (before && before===active.get(id)) {
          const complete=answer?.revision>before.revision || answer?.status==='not_available' ||
            (!before.pending && displayState(answer));
          if(complete){active.delete(id);unwatch();notice=answer?.status==='enabled'?'이름 조회가 켜져 있습니다.':answer?.status==='off'?'이름 조회가 꺼져 있습니다.':'';}
        }
        render(answer);
      }catch{
        if(alive()){snapshot=null;detail.replaceChildren();line.textContent='설정을 확인하지 못했습니다. 다시 확인해 주세요.';retry.hidden=false;}
      }finally{reading=false;if(alive())retry.disabled=false;}
    }
    function send(action,revision){
      const op={revision,pending:true,unknown:false,confirmed:false,definite:false,listeners:new Set()};
      active.set(id,op);watch(op);notice='';
      const selected=snapshot;
      render(selected);
      const raw=call(action,{revision,confirmed:true,consent_version:consent});
      let timer=setTimeout(()=>{if(op.pending){op.unknown=true;changed(op);}},12000);
      const settled=(d)=>{
        clearTimeout(timer);op.pending=false;
        op.confirmed=displayState(d)||d?.status==='not_available';
        op.definite=['access_denied','changed','confirmation_required','invalid_request'].includes(d?.error);
        if(active.get(id)!==op)return;
        if(op.confirmed||op.definite){
          active.delete(id);changed(op);if(alive()){unwatch();if(d.error){notice='설정이 바뀌었는지 다시 확인합니다.';void lookup();}
           else {notice=d.status==='enabled'?'이름 조회가 켜져 있습니다.':d.status==='off'?'이름 조회가 꺼져 있습니다.':'';render(d);}}
        }else{op.unknown=true;changed(op);}
      };
      raw.then(settled,()=>settled(null));
    }
    retry.addEventListener('click',()=>void lookup());
    void lookup();
    return { close };
  }
  window.ErpAiMemberDetailsSettings=Object.freeze({open});
})();
