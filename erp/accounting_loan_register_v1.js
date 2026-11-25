/* Read and edit confirmed loan terms using the existing accounting scope. */
(function(root){
 'use strict';
 let active=null;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function open({client,coopId,current,canEdit}){
  if(!current()||!coopId)return;
  if(active){active.dispose();}
  const wrap=el('div','','modal'), dialog=el('div','','modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable');
  wrap.tabIndex=-1;wrap.setAttribute('aria-labelledby','erp-loan-register-title');
  const pane=el('div','','modal-content'),header=el('div','','modal-header'),body=el('div','','modal-body'),actions=el('div','','modal-footer');
  const title=el('h2','대출 관리','modal-title h5');title.id='erp-loan-register-title';
  const close=el('button','','btn-close');close.type='button';close.setAttribute('aria-label','닫기');header.append(title,close);
  const report=el('p','','mt-2');report.setAttribute('role','status');
  const results=el('div','','table-responsive');
  body.append(el('p','금융기관과 약정 내용을 기록합니다. 상환 일정, 전표와 송금은 만들지 않습니다.','text-muted'),report,results);
  const button=(name,cls)=>{const n=el('button',name,cls);n.type='button';return n;};
  const newer=button('대출 등록','btn btn-primary'),more=button('다음 50건','btn btn-outline-primary'),previous=button('이전 50건','btn btn-outline-primary');
  actions.append(previous,more,newer);
  const form=el('form','','row g-3 mt-2 d-none');form.hidden=true;
  const showForm=visible=>{form.hidden=!visible;form.classList.toggle('d-none',!visible);};
  const fields={};
  for(const [name,label,type,max] of [
   ['bank','은행','text',100],['loan_date','대출일','date'],['principal_krw','원금 (원)','text'],
   ['annual_rate_pct','약정 연이율 (%)','text'],['repayment_institution','상환기관','text']
  ]){
   const cell=el('div','',name==='repayment_institution'?'col-12':'col-sm-6'),caption=el('label',label,'form-label'),input=el('input','','form-control');
   input.type=type;input.required=true;input.id='erp-loan-'+name;input.name=name;caption.htmlFor=input.id;
   if(max)input.maxLength=max;
   if(name==='principal_krw'){input.inputMode='numeric';input.pattern='[1-9][0-9]{0,14}';}
   if(name==='annual_rate_pct'){input.inputMode='decimal';input.pattern='([0-9]|[1-9][0-9]|100)([.][0-9]{1,5})?';}
   cell.append(caption,input);form.append(cell);fields[name]=input;
  }
  const buttons=el('div','','col-12 d-flex gap-2');
  const cancel=button('편집 닫기','btn btn-outline-secondary'),save=button('저장','btn btn-primary');save.type='submit';
  buttons.append(cancel,save);form.append(buttons);body.append(form);
  pane.append(header,body,actions);dialog.append(pane);wrap.append(dialog);document.body.append(wrap);
  const modal=new bootstrap.Modal(wrap,{backdrop:'static'}); const opener=document.activeElement;
  let ctx, seq=0,offset=0,editing=null,req=null,busy=false,editable=false,disposed=false,subscription;
  const observer=new MutationObserver(()=>{if(!current())dispose();});
  if(root.frameElement)observer.observe(root.frameElement,{attributes:true,attributeFilter:['hidden','style']});
  const tab=document.getElementById('tabHistory');if(tab)observer.observe(tab,{attributes:true,attributeFilter:['class']});
  const live=()=>!disposed&&active===ctx&&current();
  function dispose(){
   if(disposed)return;disposed=true;seq++;busy=false;modal.hide();modal.dispose();wrap.remove();
   observer.disconnect();subscription?.unsubscribe();
   if(active===ctx)active=null;root.removeEventListener('pagehide',dispose);
  }
  active=ctx={dispose};
  subscription=client.auth?.onAuthStateChange(event=>{if(event==='SIGNED_OUT')dispose();else root.queueMicrotask(()=>{if(!current())dispose();});})?.data?.subscription;
  root.addEventListener('pagehide',dispose);
  close.onclick=()=>{if(!busy)modal.hide();};
  wrap.addEventListener('hide.bs.modal',e=>{if(busy)e.preventDefault();});
  wrap.addEventListener('hidden.bs.modal',()=>{dispose();if(opener?.isConnected&&current())opener.focus();});
  function edit(row){
   if(!live()||!editable||!canEdit()||busy||!form.hidden)return;
   editing=row||null;req=row ? null : root.crypto.randomUUID();showForm(true);
   for(const [key,input] of Object.entries(fields))input.value=row?.[key]??'';
   newer.disabled=true; previous.disabled=true; more.disabled=true;
   fields.bank.focus();
  }
  cancel.onclick=()=>{if(busy)return;showForm(false);req=null;editing=null;void load(offset);};
  async function load(nextOffset){
   const check=++seq;results.replaceChildren();
   report.textContent='대출 정보를 확인하고 있습니다…';newer.disabled=previous.disabled=more.disabled=true;
   try{
    const r=await client.rpc('erp_accounting_loan_register',{p_action:'list',p_args:{offset:nextOffset}});
    if(!live()||check!==seq)return;
    if(r.error||r.data?.coop_id!==coopId||!Array.isArray(r.data.items))throw Error('대출 정보를 불러오지 못했습니다.');
    offset=nextOffset;editable=r.data.editable===true&&canEdit();newer.hidden=!editable;newer.classList.toggle('d-none',!editable);
    newer.disabled=!form.hidden||!editable;previous.disabled=offset<=0||!form.hidden;more.disabled=r.data.items.length<=50||!form.hidden;
    const table=el('table','','table table-sm align-middle'),head=el('thead'),heading=el('tr'),rows=el('tbody');
    for(const text of ['은행','대출일','원금','약정 연이율','상환기관',...(editable?['편집']:[])]){
     const th=el('th',text);th.scope='col';heading.append(th);
    }
    head.append(heading);table.append(head,rows);
    for(const row of r.data.items.slice(0,50)){
     const tr=el('tr');
     for(const text of [row.bank,row.loan_date,BigInt(row.principal_krw).toLocaleString('ko-KR')+'원',row.annual_rate_pct+'%',row.repayment_institution])tr.append(el('td',text));
     if(editable){const td=el('td'),change=button('수정','btn btn-sm btn-outline-primary');change.onclick=()=>edit(row);td.append(change);tr.append(td);}
     rows.append(tr);
    }
    if(r.data.items.length)results.append(table);
    report.textContent=r.data.items.length?'':'등록된 대출이 없습니다.';
   }catch(error){
    if(!live()||check!==seq)return;
    report.textContent=error.message+' ';const retry=button('다시 조회','btn btn-sm btn-outline-primary');retry.onclick=()=>void load(nextOffset);report.append(retry);
   }
  }
  form.onsubmit=async e=>{
   e.preventDefault();
   if(busy||!live()||!editable||!canEdit())return;
   const draft=Object.fromEntries(new FormData(form));Object.assign(draft,editing?{id:editing.id,revision:editing.revision}:{request_id:req});
   busy=true;save.disabled=cancel.disabled=close.disabled=true;
   try{
    const r=await client.rpc('erp_accounting_loan_register',{p_action:'save',p_args:draft});
    if(!live())return;
    if(r.error||r.data?.coop_id!==coopId||!r.data.row){
     report.textContent=r.error?.code==='PT409'?'다른 화면에서 바뀌었거나 직전 등록 결과를 확인해야 합니다. 편집을 닫고 목록을 먼저 확인해 주세요.':'저장을 확인하지 못했습니다. 입력을 유지했습니다.';
     return;
    }
    showForm(false);req=null;editing=null;await load(offset);
   }catch(_){if(live())report.textContent='저장을 확인하지 못했습니다. 입력을 유지했습니다.';}
   finally{busy=false;save.disabled=cancel.disabled=close.disabled=false;}
  };
  newer.onclick=()=>edit(null);more.onclick=()=>{if(!busy)void load(offset+50);};previous.onclick=()=>{if(!busy)void load(Math.max(0,offset-50));};
  modal.show();void load(0);
 }
 root.CoopAccountingLoans=Object.freeze({version:'1.0.0',open,clear:()=>active?.dispose()});
})(window);
