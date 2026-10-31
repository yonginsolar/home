/* v1.0.7 — Refresh the current owned request after a shared result read. */
(function () {
  'use strict';
  let opening = false, current = null, dialog = null;
  const tasks = new Map();
  let revision = 0;
  const valid = ctx => { try { return ctx?.isCurrent === undefined || (typeof ctx.isCurrent === 'function' && ctx.isCurrent() === true); } catch (_) { return false; } };
  const messages = {
    CHILD_GUARDIAN_REQUIRED: '법정대리인 본인의 정조합원 계정으로 신청해 주세요.',
    CHILD_GUARDIAN_PHONE_REQUIRED: '법정대리인 계정의 휴대전화번호를 먼저 확인해 주세요.',
    CHILD_CONSENT_EXPIRED: '동의 화면의 유효시간이 지났습니다. 닫은 뒤 다시 확인해 주세요.',
    CHILD_AGE_INVALID: '가입 신청자의 생년월일을 확인해 주세요. 이 메뉴는 만 19세 미만 신청용입니다.',
    INVALID_BIRTH_DATE: '생년월일을 정확하게 입력해 주세요.',
    CHILD_CONSENT_REQUIRED: '필수 동의 항목을 모두 확인해 주세요.',
    CHILD_ALREADY_REGISTERED: '이미 등록된 신청자입니다. 연결된 계정 목록을 확인해 주세요.',
    CHILD_REQUEST_CHANGED: '이미 접수된 신청과 내용이 다릅니다. 신청 내역을 확인해 주세요.',
    INVALID_CHILD_EMAIL: '가입 신청자의 이메일 형식을 확인해 주세요.',
    DUPLICATE_CHILD_EMAIL: '이미 사용 중인 이메일입니다. 기존 계정 연결을 확인해 주세요.',
    CHILD_CAPITAL_INVALID: '출자금은 10만원 이상, 1만원 단위로 입력해 주세요.'
  };
  function errorText(error) { return window.CoopMemberCapital?.errorMessage(error) || messages[error?.message] || '접수 결과를 확인하지 못했습니다. 같은 화면에서 다시 확인하면 중복 접수되지 않습니다.'; }
  function close() {
    const ctx=current,focus=document.activeElement,inside=dialog?.contains(focus);
    clear();
    const family = document.getElementById('familyModalOverlay');
    if (family) family.style.display = 'flex';
    if(ctx?.task.phase==='failed'){tasks.delete(ctx.owner);keep(ctx.task,true);}
    if(inside&&valid(ctx)&&ctx.returnFocus?.isConnected)ctx.returnFocus.focus({preventScroll:true});
  }
  function clear() {
    ++revision; opening = false;
    for(const r of tasks.values()){let same=false;try{const a=JSON.parse(r.owner),b=JSON.parse(r.getOwner?.()||'null');same=Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1];}catch(_){}if(!same){r.data=null;r.lastBodyKey=null;r.consented=false;r.bodyMatches=false;}}
    dialog?.remove(); dialog = null; current = null;
  }
  function clearScope(){
    for(const [owner,r]of tasks){
      if(r.pending||['saving','unknown','not_recorded','registered'].includes(r.phase)){r.data=null;r.lastBodyKey=null;r.consented=false;r.bodyMatches=false;}
      else tasks.delete(owner);
    }
    clear();
  }
  function node(tag, text, className) {
    const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
  }
  const key = options => options.owner || 'current-child-form';
  const normalized = data => Object.freeze({...data,rrn2:String(data?.rrn2||'').charAt(0)});
  const dataKey = data => JSON.stringify(['name','rrn1','rrn2','email','capital','relationship','bank','acc'].map(k=>normalized(data)[k]));
  function keep(r,remove=false){try{const k='coop-child-direct:v1:'+r.owner;if(remove){if(sessionStorage.getItem(k)===r.id)sessionStorage.removeItem(k);}else sessionStorage.setItem(k,r.id);}catch(_){/* Memory and the existing exit warning remain. */}}
  function restore(options){try{const id=sessionStorage.getItem('coop-child-direct:v1:'+key(options));if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||''))return null;
    const r={id,owner:key(options),manager:options.parentId,client:options.client,getOwner:options.getOwner,phase:'unknown',pending:false,everUnknown:true};tasks.set(r.owner,r);return r;
  }catch(_){return null;}}
  const owned = ctx => current===ctx&&dialog&&valid(ctx)&&tasks.get(ctx.owner)===ctx.task;
  const ambiguous = response => !response?.error||response.status===0||response.status>=500||/fetch|network|timeout|abort/i.test(String(response.error?.message||''))||(!response.status&&!response.error?.code&&!/^[A-Z][A-Z0-9_]{3,}$/.test(String(response.error?.message||'')));
  function render(r){const ctx=current;if(!ctx||ctx.task!==r||!owned(ctx))return;
    const status=document.getElementById('childDirectError'),submit=document.getElementById('childDirectSubmit'),read=document.getElementById('childDirectResult'),readFocused=document.activeElement===read;
    status.textContent=r.readPromise?'접수 결과를 확인하고 있습니다.':r.phase==='saving'?'신청을 처리하고 있습니다.':r.phase==='unknown'?'접수 결과를 아직 확인하지 못했습니다. 결과를 다시 확인해 주세요.':r.phase==='registered'?(r.bodyMatches!==false&&r.data&&dataKey(r.data)===dataKey(ctx.data)?'이 신청이 접수되었습니다.':'이전 신청이 접수되었습니다. 현재 작성한 신청은 아직 제출하지 않았습니다.'):r.phase==='not_recorded'?'접수 내역이 확인되지 않았습니다. 입력 내용을 다시 확인해 주세요.':r.phase==='unavailable'?'이전 신청의 준비 정보가 만료되었습니다. 입력 내용을 다시 확인해 주세요.':r.message||'';
    status.className=['ready','registered','saving','not_recorded'].includes(r.phase)?'small mt-3':'text-danger small mt-3';
    submit.textContent=r.phase==='registered'?'접수 확인':['not_recorded','unavailable'].includes(r.phase)?'입력 내용 다시 확인':'동의하고 신청 접수';
    document.getElementById('childDirectClose').textContent=['ready','failed'].includes(r.phase)?'취소':'닫기';
    submit.disabled=!!r.readPromise||(r.pending&&r.phase!=='registered')||['saving','unknown'].includes(r.phase);
    read.hidden=!['saving','unknown','not_recorded'].includes(r.phase);read.setAttribute('aria-disabled',String(!!r.readPromise));read.setAttribute('aria-busy',String(!!r.readPromise));
    for(const id of ['privacy','membership','guardian']){const input=document.getElementById('childDirect-'+id);if(input)input.disabled=!['ready','failed'].includes(r.phase);}
    if(readFocused&&read.hidden&&!submit.disabled)submit.focus({preventScroll:true});
  }
  async function finish(ctx){if(!owned(ctx))return;const r=ctx.task,same=r.bodyMatches!==false&&!!r.data&&dataKey(r.data)===dataKey(ctx.data);
    tasks.delete(r.owner);keep(r,true);clear();
    if(same)await ctx.onSuccess();else{const family=document.getElementById('familyModalOverlay');if(family)family.style.display='flex';ctx.onError('이전 신청이 접수되었습니다. 현재 작성한 신청은 아직 제출하지 않았습니다.');const b=document.getElementById('btnModalYes');if(b)b.textContent='확인';}
  }
  function check(r){if(r.readPromise)return r.readPromise;const writeRevision=r.writeRevision||0;let timer;
    const request=Promise.race([Promise.resolve().then(()=>r.client.rpc('get_child_direct_request_result',{p_request_id:r.id,p_manager_id:r.manager})),new Promise(resolve=>{timer=setTimeout(()=>resolve({error:{message:'RESULT_TIMEOUT'},status:0}),15000);})]).then(response=>{
      if((r.writeRevision||0)!==writeRevision)return;
      if(r.phase==='registered')return;
      if(response?.error){r.phase='unknown';r.everUnknown=true;return;}
      const value=response?.data;
      if(value?.state==='registered')r.phase='registered';
      else if(value?.state==='not_recorded'&&!r.pending){r.phase='not_recorded';r.request=value.request||r.request;}
      else if(value?.state==='unavailable'&&!r.pending)r.phase='unavailable';else r.phase='unknown';
    },()=>{if((r.writeRevision||0)===writeRevision&&r.phase!=='registered'){r.phase='unknown';r.everUnknown=true;}}).finally(()=>{clearTimeout(timer);if(r.readPromise===request)r.readPromise=null;render(r);});
    r.readPromise=request;render(r);return request;
  }
  async function open(options) {
    // Cached older portal HTML also loads this versioned helper. Its existing
    // owner/profile functions provide the same boundary, never a shared key.
    options={...options,owner:options.owner||(typeof getFamilyRegistrationOwner==='function'?getFamilyRegistrationOwner():''),parentId:options.parentId||(typeof getActiveMemberProfileId==='function'?getActiveMemberProfileId():null),getOwner:options.getOwner||(()=>typeof getFamilyRegistrationOwner==='function'?getFamilyRegistrationOwner():'')};
    if(!options.owner||!options.parentId){if(valid(options))options.onError('로그인 정보를 다시 확인해 주세요.');return;}
    if (opening || dialog || !valid(options)) return;
    const serial = ++revision;
    opening = true;
    try {
      let task=tasks.get(key(options))||restore(options),data,error;
      if(task){data=task.request||{request_id:task.id,terms:{},version:''};}
      else ({data,error}=await options.client.rpc('child_direct_registration', { p_action: 'prepare', p_data: {} }));
      if (serial !== revision || !valid(options)) return;
      if (error) throw error;
      if (!data?.request_id || (!task&&(!data.terms||!data.version))) throw new Error('CHILD_REQUEST_UNAVAILABLE');
      const applicationNotice=options.loadApplicationNotice?await options.loadApplicationNotice():options.applicationNotice;
      if (serial !== revision || !valid(options)) return;
      // Only a masked display identifier is sent; the remaining RR number is never retained.
      if(!task){task={id:data.request_id,owner:key(options),manager:options.parentId,client:options.client,getOwner:options.getOwner,request:data,phase:'ready',pending:false};tasks.set(task.owner,task);}
      const recover=!['ready','failed'].includes(task.phase);
      if(!recover&&task.data&&dataKey(task.data)!==dataKey(options.data)){task.consented=false;}
      current = { ...options, owner:key(options),data:normalized(options.data),request:data,task,returnFocus:document.activeElement };
      const family = document.getElementById('familyModalOverlay'); if (family) family.style.display = 'none';
      dialog = node('div'); dialog.id = 'childDirectConsentDialog';
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'childDirectTitle');
      Object.assign(dialog.style, {position:'fixed',inset:'0',zIndex:'2100',background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
      const card = node('div'); Object.assign(card.style,{background:'var(--theme-surface, #fff)',color:'var(--theme-text, #212529)',padding:'24px',borderRadius:'16px',maxWidth:'650px',width:'100%',maxHeight:'calc(100dvh - 32px)',overflowY:'auto',boxSizing:'border-box',wordBreak:'keep-all',overflowWrap:'anywhere'});
      const title = node('h2','미성년자 가입·법정대리인 동의','h5 fw-bold'); title.id = 'childDirectTitle'; card.append(title);
      const shown=task.data||current.data;card.append(node('p',recover&&!task.data?'이전 신청의 접수 결과를 확인해 주세요.':`${recover?'이전 신청: ':''}${shown.name} · 신청 출자금 ${Number(shown.capital).toLocaleString('ko-KR')}원 · 관계: ${shown.relationship}`,'fw-bold'));
      const labels = {privacy:'개인정보 수집·이용',membership:'가입·출자 동의',guardian:'법정대리인 확인',notice:'동의 접수 안내'};
      for (const [key, label] of Object.entries(labels)) { card.append(node('h3',label,'h6 fw-bold mt-3'),node('p',data.terms[key],'small')); }
      if(typeof applicationNotice==='string'&&applicationNotice){const notice=node('p',applicationNotice,'small mt-3');notice.dataset.applicationNotice='';card.append(notice);}
      card.append(node('p',`안내받을 법정대리인 휴대전화번호 끝 4자리: ${data.phone_tail}`,'small'));
      for (const [id,label] of [['privacy','신청자의 개인정보 수집·이용에 동의합니다.'],['membership','위 신청 내용과 출자금액을 확인하고 가입·출자에 동의합니다.'],['guardian','본인은 적법한 법정대리인이며 위 확인 내용에 동의합니다.']]) {
        const wrap = node('label',null,'d-flex gap-2 my-3 small');
        const input = node('input'); input.type='checkbox'; input.id=`childDirect-${id}`; input.className='form-check-input flex-shrink-0';input.checked=!!task.consented;
        wrap.append(input,node('span',`(필수) ${label}`)); card.append(wrap);
      }
      const errorEl=node('p',null,'text-danger small'); errorEl.id='childDirectError'; errorEl.setAttribute('role','alert'); card.append(errorEl);
      const actions=node('div',null,'d-flex flex-wrap gap-2');
      const cancel=node('button','취소','btn btn-outline-secondary'); cancel.type='button';cancel.id='childDirectClose'; cancel.onclick=close;
      const submit=node('button','동의하고 신청 접수','btn btn-primary flex-grow-1'); submit.type='button'; submit.id='childDirectSubmit'; submit.onclick=send;
      const read=node('button','결과 다시 확인','btn btn-outline-primary');read.type='button';read.id='childDirectResult';read.onclick=()=>owned(current)&&check(task);
      for(const button of [cancel,submit,read]){button.style.minHeight='44px';button.style.whiteSpace='normal';button.style.maxWidth='100%';}
      cancel.textContent=recover?'닫기':'취소';actions.append(cancel,submit,read); card.append(actions); dialog.append(card); document.body.append(dialog);render(task);(submit.disabled?cancel:submit).focus();
      if(recover&&!task.request)check(task);
    } catch(error) { if (serial === revision && valid(options)) options.onError(errorText(error)); } finally { if (serial === revision) opening=false; }
  }
  async function send() {
    if (!current) return;
    if (!valid(current)) { clear(); return; }
    const ctx=current,r=ctx.task;
    if(r.phase==='registered')return finish(ctx);
    if(r.pending||r.readPromise)return;
    if(['saving','unknown'].includes(r.phase))return check(r);
    if(['not_recorded','unavailable'].includes(r.phase)){
      if(r.request?.expired){r.phase='failed';r.message=messages.CHILD_CONSENT_EXPIRED;render(r);return;}
      if(r.phase==='unavailable'){tasks.delete(r.owner);keep(r,true);clear();document.getElementById('familyModalOverlay').style.display='flex';return;}
      r.phase='ready';r.consented=!!r.consented&&!!r.data&&dataKey(r.data)===dataKey(ctx.data);r.data=null;clear();document.getElementById('familyModalOverlay').style.display='flex';return open(ctx);
    }
    const consent = ['privacy','membership','guardian'].every(id=>document.getElementById(`childDirect-${id}`)?.checked);
    const errorEl=document.getElementById('childDirectError');
    if (!consent) { errorEl.textContent=messages.CHILD_CONSENT_REQUIRED; return; }
    const d=ctx.data,body=dataKey(d);if(r.lastBodyKey&&r.lastBodyKey!==body)r.bodyMatches=false;else if(!r.lastBodyKey)r.bodyMatches=!r.everUnknown;r.lastBodyKey=body;
    r.data=d;r.consented=true;r.pending=true;r.phase='saving';r.writeRevision=(r.writeRevision||0)+1;keep(r);render(r);
    const focus=document.activeElement;let timer;
    const operation=Promise.resolve().then(()=>owned(ctx)?ctx.client.rpc('child_direct_registration',{p_action:'submit',p_data:{request_id:r.id,version:ctx.request.version,name:d.name,rrn_display:`${d.rrn1}-${d.rrn2}******`,email:d.email||'',capital:d.capital,relationship:d.relationship,bank:d.bank||'',acc:d.acc||'',privacy_agreed:true,membership_agreed:true,guardian_declared:true}}):{error:{code:'CHILD_REQUEST_CONTEXT_CHANGED',message:'CHILD_REQUEST_CONTEXT_CHANGED'},status:409}).then(async response=>{
      r.pending=false;
      if(response?.data?.ok&&!response.error){r.phase='registered';r.bodyMatches=true;}else if(r.phase!=='registered'){r.everUnknown=r.everUnknown||ambiguous(response);r.phase=r.everUnknown?'unknown':'failed';r.message=errorText(response?.error);if(r.phase==='failed')keep(r,true);}
      render(r);if(owned(ctx)&&r.phase==='registered'&&document.activeElement===focus&&!focus?.matches('input,textarea,select,[contenteditable="true"]'))await finish(ctx);
    },()=>{r.pending=false;r.everUnknown=true;if(r.phase!=='registered')r.phase='unknown';render(r);});
    r.waiter=Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>{if(r.pending&&r.phase!=='registered'){r.everUnknown=true;r.phase='unknown';render(r);}resolve();},15000);})]).finally(()=>clearTimeout(timer));return r.waiter;
  }
  document.addEventListener('keydown',event=>{
    if(!dialog||document.getElementById('customModalOverlay')?.style.display==='flex')return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button,input')].filter(n=>!n.disabled&&!n.hidden),first=nodes[0],last=nodes.at(-1);if(!first)return;if(event.shiftKey&&(!nodes.includes(document.activeElement)||document.activeElement===first)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(!nodes.includes(document.activeElement)||document.activeElement===last)){event.preventDefault();first.focus();}}
  });
  window.addEventListener('beforeunload',event=>{if([...tasks.values()].some(r=>r.getOwner?.()===r.owner&&(r.pending||['saving','unknown','not_recorded'].includes(r.phase)))){event.preventDefault();event.returnValue='';}});
  window.ChildDirectConsent=Object.freeze({open,clear,clearScope});
  document.addEventListener('DOMContentLoaded',()=>{
    const host=String(window.CoopRouteGuard?.getPublicRuntimeHost?.()||location.hostname||'').toLowerCase();
    if(!['www.yonginsolar.kr','yonginsolar.kr','localhost','127.0.0.1'].includes(host))return;
    const rrn=document.getElementById('newFamRrn2');
    if(rrn){rrn.maxLength=1;rrn.placeholder='뒤 첫 숫자';rrn.inputMode='numeric';rrn.setAttribute('aria-label','주민등록번호 뒷자리 첫 숫자만 입력');}
  });
})();
