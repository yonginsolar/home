/* Existing member administration authority. No reward writer or public member lookup. */
(function(root){
 'use strict';
 const doc=root.document,$=id=>doc.getElementById(id);
 const HWASEONG='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028';
 const states={pending_review:'검토대기',linked:'연결 완료',closed:'연결 없이 종료'};
 const uuid=v=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(v||''));
 function node(tag,text,cls){const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
 function bind(options){
  const bar=$('hcrec-referral-admin-actions'),dialog=$('hcrec-referral-admin-dialog'),list=$('hcrec-referral-admin-list');
  if(!bar||!dialog||!list||bar.dataset.bound)return null;bar.dataset.bound='true';
  const status=$('hcrec-referral-admin-status'),filter=$('hcrec-referral-admin-filter'),more=$('hcrec-referral-admin-more');
  const policy=$('hcrec-referral-admin-policy'),ledger=$('hcrec-referral-admin-ledger');
  let view=null,read=null,page=null,review=null;
  function owner(){const c=options.context();return c?.coop===HWASEONG&&c?.allowed===true&&c.owner?c.owner:'';}
  const current=v=>!!v&&view===v&&owner()===v.owner&&dialog.open&&!root.frameElement?.hidden;
  const note=text=>{status.textContent=text;};
  function invalidate(){read?.abort.abort();read=null;}
  function close(restore=false){const before=view;view=null;invalidate();page=null;list.replaceChildren();
   if(dialog.open)dialog.close();if(restore&&before?.trigger?.isConnected&&owner()===before.owner)before.trigger.focus({preventScroll:true});}
  function sync(){const key=owner();bar.hidden=!key;if(view&&view.owner!==key)close();}
  async function load(append=false){
   const v=view;if(!current(v)||read||append&&!page?.next)return;
   const query={p_state:v.mode==='points'?'linked':filter.value,p_before_time:append?page.next.created_at:null,p_before_id:append?page.next.id:null};
   const request={v,abort:new AbortController()};read=request;more.disabled=true;note('목록을 불러오는 중입니다.');
   let timer;
   const owns=()=>read===request&&current(v);
   try{
    const rpc=options.client.rpc('hcrec_admin_list_referrals',query);
    const {data,error}=await Promise.race([typeof rpc?.abortSignal==='function'?rpc.abortSignal(request.abort.signal):rpc,
      new Promise((_r,reject)=>{timer=setTimeout(()=>{request.abort.abort();reject(Error('READ_TIMEOUT'));},12000);})]);
    if(!owns())return;if(error||!Array.isArray(data?.rows))throw Error('REFERRAL_LIST_UNAVAILABLE');
    if(!append)list.replaceChildren();
    data.rows.filter(r=>uuid(r.applicant_uuid)&&Object.hasOwn(states,r.state)).forEach(r=>list.append(render(r,v)));
    page={next:data.has_more&&uuid(data.next?.id)&&typeof data.next?.created_at==='string'?data.next:null};
    more.hidden=!page.next;
    note(!list.children.length?v.mode==='points'?'연결 완료된 추천이 없습니다.':'이 상태의 추천 신청이 없습니다.':'');
   }catch(_){if(owns())note('목록을 확인하지 못했습니다. 다시 확인해 주세요.');}
   finally{clearTimeout(timer);if(read===request){read=null;more.disabled=false;}}
  }
  function render(row,v){
   const item=node('article','', 'border rounded p-3');item.dataset.referralId=row.applicant_uuid;
   item.append(node('h3',String(row.applicant_name||'신청 조합원')+(row.applicant_number?' · '+row.applicant_number:''),'h6 fw-bold'));
   item.append(node('p','입력한 추천인: '+String(row.input_name||'—'),'mb-1'));
   item.append(node('p',states[row.state]+(row.referrer_number?' · '+String(row.referrer_name||'')+' '+row.referrer_number:'')
     +(row.state==='linked'&&!row.referrer_number?' · 연결된 명부를 확인할 수 없습니다.':''),'small mb-1'));
   if(v.mode==='points'){item.append(node('span','지급 기준 미설정','badge text-bg-secondary'));return item;}
   if(row.state!=='pending_review')return item;
   const form=node('form','','mt-2');const number=node('input','','form-control');number.type='text';number.maxLength=40;number.autocomplete='off';
   const numberLabel=node('label','확인한 추천인의 조합원번호','form-label w-100');numberLabel.append(number);
   const verified=node('input','','form-check-input me-2');verified.type='checkbox';
   const label=node('label','','form-check-label');label.append(verified,doc.createTextNode('추천인과 본인 여부를 확인했습니다.'));
   const buttons=node('div','','d-flex flex-wrap gap-2 mt-2');
   const save=node('button','연결','btn btn-sm btn-success');save.type='submit';
   const dismiss=node('button','연결 없이 종료','btn btn-sm btn-outline-secondary');dismiss.type='button';
   const dismissGate=node('div','','border rounded p-2 mt-2');dismissGate.hidden=true;
   const confirm=node('button','종료 확인','btn btn-sm btn-danger me-2');confirm.type='button';
   const cancel=node('button','취소','btn btn-sm btn-outline-secondary');cancel.type='button';
   dismissGate.append(node('p','이 신청은 추천인 연결 없이 검토를 종료합니다.','small mb-2'),confirm,cancel);
   dismiss.onclick=()=>{if(!current(v)||review)return;dismissGate.hidden=false;confirm.focus({preventScroll:true});};
   cancel.onclick=()=>{dismissGate.hidden=true;dismiss.focus({preventScroll:true});};
   const feedback=node('p','','small mb-0 mt-2');feedback.setAttribute('role','status');
   form.append(numberLabel,label,buttons,dismissGate,feedback);buttons.append(save,dismiss);
   async function submit(action){
    if(!current(v)||!item.isConnected||review)return;
    if(action==='link'&&(!verified.checked||!number.value.trim())){feedback.textContent='추천인을 확인한 뒤 조합원번호와 확인란을 입력해 주세요.';return;}
    const task={v,id:row.applicant_uuid};review=task;save.disabled=true;confirm.disabled=true;
    const input=action==='link'?number.value.trim():null;
    try{
     const {data,error}=await options.client.rpc('hcrec_admin_review_referral',{p_applicant:row.applicant_uuid,p_revision:row.revision,
       p_action:action,p_member_number:input,p_confirmed:true});
     if(!current(v)||!item.isConnected||review!==task)return;if(error)throw error;
     if(!Object.hasOwn(states,data?.state))throw Error('REFERRAL_REVIEW_UNKNOWN');
     if(v.mode==='referrals'&&filter.value!=='all'&&filter.value!==data.state){
      const restore=item.contains(doc.activeElement);item.remove();if(restore)$('hcrec-referral-admin-retry').focus({preventScroll:true});
     }else{
      // Keep other entered rows; refresh this row's full values only on explicit reload.
      form.replaceWith(node('p',states[data.state]+' · 목록을 다시 확인하면 최신 상태를 볼 수 있습니다.','small mb-0'));
     }
     note('검토 결과를 반영했습니다. 포인트는 지급하지 않았습니다.');
    }catch(error){if(current(v)&&item.isConnected&&review===task)feedback.textContent=error?.code==='PT409'
      ?'이미 상태가 바뀌었습니다. 목록을 다시 확인해 주세요.'
      :error?.message==='REFERRAL_MEMBER_UNCONFIRMED'?'정상 조합원과 일치하지 않거나 같은 번호의 기록이 여러 개입니다. 확인 후 다시 입력해 주세요.'
      :'검토 결과를 확인하지 못했습니다. 요청을 반복하기 전에 목록을 다시 확인해 주세요.';}
    finally{if(review===task)review=null;if(item.isConnected){save.disabled=false;confirm.disabled=false;}}
   }
   form.addEventListener('submit',event=>{event.preventDefault();void submit('link');});confirm.onclick=()=>void submit('close');item.append(form);return item;
  }
  function open(mode,trigger){const key=owner();if(!key||view)return false;
   view={mode,owner:key,trigger};$('hcrec-referral-admin-title').textContent=mode==='points'?'추천 포인트 관리':'추천인 관리';
   filter.closest('label').hidden=mode==='points';policy.hidden=mode!=='points';ledger.hidden=mode!=='points'||!options.canOpenLedger();
   list.replaceChildren();more.hidden=true;dialog.showModal();$('hcrec-referral-admin-close').focus({preventScroll:true});void load();return true;}
  $('hcrec-referral-admin-open').onclick=e=>open('referrals',e.currentTarget);
  $('hcrec-referral-admin-points').onclick=e=>open('points',e.currentTarget);
  $('hcrec-referral-admin-close').onclick=()=>close(true);
  $('hcrec-referral-admin-retry').onclick=()=>{invalidate();void load();};
  ledger.onclick=()=>{if(!current(view)||!options.canOpenLedger())return;close();options.openLedger();};
  filter.onchange=()=>{invalidate();void load();};more.onclick=()=>void load(true);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close(true);});
  dialog.addEventListener('close',()=>{if(!dialog.open&&view)close();});
  const observer=new MutationObserver(sync);
  for(const n of [$('tab-members'),$('nav-members'),root.frameElement].filter(Boolean))observer.observe(n,{attributes:true,attributeFilter:['class','style','hidden']});
  window.addEventListener('pagehide',()=>close());sync();return Object.freeze({sync,open,close});
 }
 root.CoopHcrecReferralAdmin=Object.freeze({bind});
})(window);
