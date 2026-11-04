/* v1.0.0 — review and link existing entries without posting money again. */
(function(root){'use strict';
 function create(api){
  const dialog=document.getElementById('capitalLinkModal'),body=document.getElementById('capitalLinkItems'),status=document.getElementById('capitalLinkStatus');
  const refresh=document.getElementById('capitalLinkRefresh'),commit=document.getElementById('capitalLinkCommit');
  const pending=new Map(),working=new Map();let epoch=0,rows=[],scope=null,returnTo=null;
  const modal=bootstrap.Modal.getOrCreateInstance(dialog);
  const own=()=>api.owner(),live=t=>t.epoch===epoch&&t.owner===own()&&api.editable()&&api.current(t.scope)&&dialog.classList.contains('show');
  const token=()=>({epoch,owner:own(),scope});
  function message(t,text){if(live(t))status.textContent=text;}
  function sync(){const p=pending.get(own()),busy=working.has(own());refresh.textContent=p?'연결 결과 확인':'다시 확인';refresh.disabled=busy||!api.editable();
   commit.disabled=busy||!!p||!api.editable()||!body.querySelector('input:checked');for(const n of body.querySelectorAll('input'))n.disabled=busy||!!p||!api.editable();}
  async function call(action,t){const controller=new AbortController();let timer;
   try{const query=api.client().rpc('accounting_capital_links',{p_action:action,p_items:t.items||[],p_request_key:t.key||null});
    const request=typeof query.abortSignal==='function'?query.abortSignal(controller.signal):query;
    const r=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('LINK_TIMEOUT'));},15000);})]);
    if(r.error)throw r.error;return r.data;
   }finally{clearTimeout(timer);controller.abort();}}
  function error(e){return e?.code==='42501'?'현재 권한을 다시 확인해 주세요.':e?.code==='PT409'?'전표나 출자금 내역이 달라졌습니다. 다시 확인해 주세요.':'조회하지 못했습니다. 다시 확인해 주세요.';}
  function render(items){body.replaceChildren();rows=items;
   for(const row of items){const card=document.createElement('section');card.className='border rounded p-3 mb-3';
    const label=document.createElement('label');label.className='d-flex align-items-start gap-2 fw-bold';
    if(row.revision&&!row.review_required){const check=document.createElement('input');check.type='checkbox';check.className='form-check-input flex-shrink-0';check.dataset.source=String(row.source_id);check.addEventListener('change',sync);label.append(check);}
    const title=document.createElement('span');title.textContent=`${row.date} · ${row.name} · ${Number(row.amount).toLocaleString()}원`;label.append(title);card.append(label);
    if(row.mode==='donation_conversion'){const note=document.createElement('p');note.className='small mt-2 mb-1';note.textContent='기부금 입금 → 출자금 전환';card.append(note);}
    for(const e of row.evidence||[]){const line=document.createElement('p');line.className='small mb-1 mt-2';line.style.overflowWrap='anywhere';line.textContent=`${e.date} · ${e.transaction||'전표번호 없음'} · ${e.account} · 차변 ${Number(e.debit||0).toLocaleString()} / 대변 ${Number(e.credit||0).toLocaleString()}원\n${e.description||''}`;card.append(line);}
    if(row.review_required){const note=document.createElement('p');note.className='mt-2 mb-0 text-danger';note.textContent='일치하는 전표를 하나로 확정하지 못했습니다. 장부와 원입금 내역을 확인해 주세요.';card.append(note);}body.append(card);
   }
  }
  async function read(){if(!api.editable()||working.has(own())||pending.has(own()))return;const t=token();working.set(t.owner,t);sync();message(t,'기존 전표를 확인하고 있습니다…');
   try{const r=await call('list',t);if(!live(t))return;if(!Array.isArray(r?.items))throw Error('INVALID');render(r.items);message(t,r.items.length?'입금일·입금자·금액과 전표를 대조한 뒤 연결할 항목을 선택해 주세요.':'연결을 확인할 이전 내역이 없습니다.');}
   catch(e){if(live(t)){render([]);message(t,error(e));}}finally{if(working.get(t.owner)===t)working.delete(t.owner);if(live(t))sync();}}
  function settled(t,r){if(r?.verified!==true||r.linked!==t.items.length)throw Error('UNVERIFIED');if(pending.get(t.owner)!==t)return;pending.delete(t.owner);if(live(t)){render(rows.filter(x=>!t.items.some(y=>String(y.source_id)===String(x.source_id))));message(t,`${r.linked}건의 기존 전표를 연결했습니다.`);}}
  async function send(t){try{settled(t,await call('link',t));}catch(e){if(pending.get(t.owner)!==t)return;
   if(['42501','PT409','22023','55P03','57014','23505'].includes(e?.code)){pending.delete(t.owner);message(t,error(e));}
   else message(t,'연결 결과를 아직 확인하지 못했습니다. ‘연결 결과 확인’을 눌러 주세요.');}}
  async function save(){if(!api.editable()||pending.has(own())||working.has(own()))return;
   const ids=new Set([...body.querySelectorAll('input:checked')].map(x=>x.dataset.source));const items=rows.filter(r=>ids.has(String(r.source_id))&&r.revision).map(r=>({source_id:r.source_id,revision:r.revision}));if(!items.length)return;
   const t={...token(),items,key:crypto.randomUUID()};working.set(t.owner,t);sync();
   try{const accepted=await api.confirm(`${items.length}건을 기존 전표에 연결할까요?\n금액을 다시 기표하지 않고 연결 정보만 저장합니다.`);
    if(!accepted||!live(t)||!api.editable())return;pending.set(t.owner,t);sync();await send(t);
   }finally{if(working.get(t.owner)===t)working.delete(t.owner);if(live(t))sync();}}
  async function recover(){const t=pending.get(own());if(!t)return read();if(working.has(own())||!api.editable())return;const view=token();working.set(t.owner,view);sync();
   try{const r=await call('result',t);if(!live(view))return;
    // A previous window's request may settle here, but cannot reopen it or alter another owner.
    const originalEpoch=t.epoch;t.epoch=view.epoch;t.scope=view.scope;
    if(r.found===true)settled(t,r);else if(r.found===false){message(view,'처리 기록이 없습니다. 같은 요청으로 다시 연결할 수 있습니다.');
     const accepted=await api.confirm('아직 연결되지 않았습니다. 같은 요청으로 다시 연결할까요?');if(accepted&&live(view)&&api.editable())await send(t);}
    else throw Error('INVALID');if(pending.get(t.owner)===t)t.epoch=originalEpoch;
   }catch(e){message(view,error(e));}finally{if(working.get(t.owner)===view)working.delete(t.owner);if(live(view))sync();}}
  function detach(){const t=working.get(own());if(t&&!pending.has(own()))working.delete(own());}
  function leave(){detach();epoch++;scope=null;modal.hide();}
  function open(button){if(!api.editable())return;returnTo=button||document.activeElement;scope=api.scope();epoch++;render([]);status.textContent=pending.has(own())?'이전 연결 결과를 먼저 확인해 주세요.':'';modal.show();sync();}
  dialog.addEventListener('shown.bs.modal',()=>{if(!pending.has(own()))void read();});
  dialog.addEventListener('hidden.bs.modal',()=>{detach();const oldScope=scope,origin=returnTo;epoch++;scope=null;rows=[];body.replaceChildren();
   if(oldScope&&api.current(oldScope)&&origin?.isConnected&&[document.body,dialog].includes(document.activeElement))origin.focus({preventScroll:true});});
  refresh.addEventListener('click',()=>void recover());commit.addEventListener('click',()=>void save());
  dialog.addEventListener('keydown',event=>{
   if(event.key!=='Tab'||document.querySelector('dialog.coop-dialog[open]'))return;
   const nodes=[...dialog.querySelectorAll('button,input,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
   if(!nodes.length){event.preventDefault();dialog.focus();return;}
   const i=nodes.indexOf(document.activeElement);
   if(i<0||(!event.shiftKey&&i===nodes.length-1)||(event.shiftKey&&i===0)){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0].focus();}
  });
  return Object.freeze({open,leave,isBusy:()=>pending.size>0});
 }
 root.AccountingCapitalLinks=Object.freeze({version:'1.0.0',create});
})(window);
