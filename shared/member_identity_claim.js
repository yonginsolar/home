/* v1.0.1 — Existing personal member claim. Memory-only drafts; no automatic writes/retries. */
(function(root){
 'use strict';
 const messages={NOT_MATCHED:'입력한 정보와 연결할 수 있는 조합원을 찾지 못했어요. 이름·주민등록번호·전화번호를 확인해 주세요.',INVALID_INPUT:'이름·주민등록번호·전화번호를 모두 확인해 주세요.',RATE_LIMITED:'확인이 여러 번 이어졌어요. 잠시 후 다시 시도해 주세요.',REQUEST_CHANGED:'연결 요청의 정보가 달라졌어요. 내용을 다시 확인해 주세요.',CONFLICT:'연결할 정보가 변경됐어요. 내용을 다시 확인해 주세요.'};
 function create(options){
  const doc=root.document,drafts=new Map();let dialog,form,status,review,primary,recheck,continueButton,inputs={},opened=null,epoch=0,previous=null,authActor=String(options.getOwner()||'');
  const host=()=>String(options.getHost()||'').trim().toLowerCase(),key=()=>{const a=String(options.getOwner()||'');return a&&a===authActor?a+'|'+host():'';};
  const active=s=>opened===s&&dialog?.open&&s.key===key(),busy=s=>s?.phase==='preparing'||!!s?.request&&['saving','unknown','checking','retry'].includes(s.phase);
  const saved=()=>{if(opened)for(const n of Object.keys(inputs))opened.values[n]=inputs[n].value;};
  function paint(){const s=opened;if(!active(s))return;const locked=busy(s)||s.phase==='success';for(const input of Object.values(inputs))input.readOnly=locked;
   status.textContent=s.message||'';status.setAttribute('role',s.error?'alert':'status');review.hidden=s.phase!=='review';
   primary.textContent=s.phase==='review'?'연결하기':s.phase==='retry'?'같은 요청으로 다시 시도':'입력 정보 확인';
   primary.hidden=s.phase==='success'||['unknown','checking'].includes(s.phase);primary.disabled=['saving','preparing'].includes(s.phase);primary.setAttribute('aria-busy',String(['saving','preparing'].includes(s.phase)));
   recheck.hidden=!['unknown','checking','retry'].includes(s.phase);recheck.disabled=s.phase==='checking';recheck.textContent=s.phase==='checking'?'결과 확인 중…':'결과 다시 확인';
   continueButton.hidden=s.phase!=='success';
  }
  function suspend(restore=false){if(!dialog?.open)return;saved();if(opened.phase==='preparing'){opened.preparation=null;opened.phase='edit';opened.message='';}++epoch;dialog.close();opened=null;
   const target=previous;previous=null;if(restore&&target?.isConnected&&!target.disabled&&[doc.body,dialog,null].includes(doc.activeElement))target.focus({preventScroll:true});
  }
  function known(s,request,response){if(s.request!==request||s.phase==='success'&&response?.data?.ok!==true)return;request.running=false;
   const data=response?.data;
   if(response?.error){const code=String(response.error.code||''),http=Number(response.status||response.error.status);if([401,403,429].includes(http)||/^PT40[1359]$|^42501$/.test(code)){
    s.phase='edit';s.request=null;s.error=true;s.message=code==='PT401'?'로그인한 이메일을 다시 인증한 뒤 연결해 주세요.':'현재 계정에서 연결을 진행할 수 없어요. 로그인 상태를 확인해 주세요.';
   }else{s.phase='unknown';s.message='연결 결과를 확인하지 못했어요. 결과 다시 확인을 눌러 주세요.';s.error=true;}
   }else if(data?.ok===true){s.phase='success';s.result=data;s.message='계정을 연결했어요.';s.error=false;
   }else if(data?.ok===false){s.phase='edit';s.request=null;s.message=messages[data.code]||'연결을 완료하지 못했어요. 잠시 후 다시 확인해 주세요.';s.error=true;
   }else{s.phase='unknown';s.message='연결 결과를 확인하지 못했어요. 결과 다시 확인을 눌러 주세요.';s.error=true;}
   paint();
  }
  async function send(s,retry=false){if(s.key!==key()||!active(s)||s.phase!==(retry?'retry':'review'))return;saved();const view=epoch;
   let request=s.request;
   if(!retry){let id,coop;const preparation={};s.preparation=preparation;try{id=root.crypto.randomUUID();coop=options.getCoop?.();if(!coop){s.phase='preparing';s.message='가입한 조합을 확인하고 있어요…';paint();let deadline;try{const r=await Promise.race([Promise.resolve(options.client.rpc('get_public_signup_context')),new Promise((_,reject)=>{deadline=root.setTimeout(()=>reject(Error('CLAIM_CONTEXT_TIMEOUT')),8000);})]);if(r.error)throw Error('CLAIM_CONTEXT_FAILED');coop=(Array.isArray(r.data)?r.data[0]:r.data)?.coop_id;}finally{root.clearTimeout(deadline);}}if(!coop)throw Error('CLAIM_CONTEXT_FAILED');}catch{if(s.preparation!==preparation||s.key!==key()||view!==epoch||!active(s))return;s.preparation=null;s.phase='edit';s.error=true;s.message='연결 요청을 준비하지 못했어요. 다시 확인해 주세요.';paint();return;}
    if(s.preparation!==preparation||s.key!==key()||view!==epoch||!active(s))return;s.preparation=null;
    request={id,values:{...s.values},actor:s.key.split('|')[0],coop,running:false,generation:0};s.request=request;
   }
   if(!request||request.running)return;request.running=true;const generation=++request.generation;s.phase='saving';s.error=false;s.message='기존 조합원 계정에 연결하고 있어요…';paint();
   const pending=Promise.resolve().then(()=>{if(s.key!==key()||epoch!==view||!active(s)){if(s.request===request&&generation===request.generation){s.phase='edit';s.request=null;s.message='';s.error=false;request.running=false;paint();}return null;}return options.client.rpc('claim_member_by_identity',{p_name:request.values.name,p_rrn:request.values.rrn,p_phone:request.values.phone,p_request_key:request.id,p_actor:request.actor,p_coop:request.coop});});
   let timer;const timeout=new Promise(resolve=>{timer=root.setTimeout(()=>{if(s.request===request&&generation===request.generation&&request.running){request.running=false;s.phase='unknown';s.message='응답이 늦어지고 있어요. 입력을 유지한 채 연결 결과를 확인할 수 있어요.';paint();}resolve();},15000);});
   const settled=pending.then(r=>{if(r&&generation===request.generation)known(s,request,r);},()=>{if(generation===request.generation)known(s,request,{error:{}});}).finally(()=>root.clearTimeout(timer));
   await Promise.race([settled,timeout]);
  }
  async function check(){const s=opened;if(!active(s)||!s.request||s.phase==='checking')return;const request=s.request,view=epoch;s.phase='checking';s.message='이전 연결 결과를 확인하고 있어요…';paint();
   let timer;try{const response=await Promise.race([Promise.resolve(options.client.rpc('get_member_identity_claim_result',{p_request_key:request.id,p_actor:request.actor,p_coop:request.coop})),new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(Error('CLAIM_RESULT_TIMEOUT')),8000);})]);
    if(s.request!==request||s.phase==='success')return;
    if(response.error)throw Error('CLAIM_RESULT_FAILED');
    if(response.data?.state==='linked'||response.data?.state==='failed')known(s,request,{data:response.data});
    else{request.running=false;s.phase=response.data?.state==='not_recorded'?'retry':'unknown';s.message=s.phase==='retry'?'아직 결과가 확인되지 않았어요. 같은 요청으로 다시 시도할 수 있어요.':'아직 처리 결과를 기다리고 있어요. 잠시 후 결과를 다시 확인해 주세요.';s.error=false;paint();}
   }catch{if(s.request===request&&s.phase!=='success'){s.phase='unknown';s.error=true;s.message='연결 결과를 불러오지 못했어요. 다시 확인해 주세요.';paint();
     if(active(s)&&view===epoch&&[recheck,doc.body].includes(doc.activeElement))recheck.focus({preventScroll:true});
   }}finally{root.clearTimeout(timer);}
  }
  function setup(){if(dialog)return;
   const style=doc.createElement('style');style.textContent='.member-identity-claim{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);border:1px solid #94a3b8;border-radius:18px;padding:22px;background:#fff;color:#172033;overflow:auto;font:inherit;word-break:keep-all;overflow-wrap:anywhere}.member-identity-claim::backdrop{background:#0f172a80}.member-identity-claim *{box-sizing:border-box}.member-identity-claim header{display:flex;align-items:start;justify-content:space-between;gap:12px}.member-identity-claim h2{font-size:1.2em;line-height:1.5;margin:0}.member-identity-claim p{line-height:1.65}.member-identity-claim label{display:block;font-weight:600;margin-top:14px}.member-identity-claim input{display:block;width:100%;min-width:0;font:inherit;padding:11px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#172033}.member-identity-claim button{font:inherit;min-height:44px;padding:9px 13px;border:1px solid #64748b;border-radius:9px;background:#fff;color:#172033;cursor:pointer}.member-identity-claim button[data-primary]{background:#166534;color:#fff;border-color:#166534}.member-identity-claim footer{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}.member-identity-claim :focus-visible{outline:3px solid #2563eb;outline-offset:2px}.member-identity-claim [hidden]{display:none!important}.member-identity-claim input[readonly]{background:#f1f5f9}.member-identity-claim [role=alert]{color:#9f1239}';doc.head.append(style);
   dialog=doc.createElement('dialog');dialog.className='member-identity-claim';dialog.setAttribute('aria-labelledby','member-identity-claim-title');dialog.setAttribute('aria-describedby','member-identity-claim-help');
   const header=doc.createElement('header'),title=doc.createElement('h2'),close=doc.createElement('button');title.id='member-identity-claim-title';title.textContent='기존 조합원 계정 연결';close.type='button';close.textContent='×';close.setAttribute('aria-label','닫기');close.onclick=()=>suspend(true);header.append(title,close);dialog.append(header);
   const help=doc.createElement('p');help.id='member-identity-claim-help';help.textContent='명부에 이메일이 등록되지 않은 조합원은 기존 이름·주민등록번호·전화번호를 확인해 로그인 계정을 연결할 수 있어요.';dialog.append(help);
   form=doc.createElement('form');form.noValidate=true;form.autocomplete='off';
   for(const [name,label,type,max]of [['name','이름','text',100],['rrn','주민등록번호','password',14],['phone','전화번호','tel',20]]){const l=doc.createElement('label'),input=doc.createElement('input');input.id='member-identity-claim-'+name;input.type=type;input.maxLength=max;input.required=true;input.autocomplete='off';if(name!=='name')input.inputMode='numeric';l.htmlFor=input.id;l.textContent=label;inputs[name]=input;form.append(l,input);
    input.addEventListener('input',()=>{const s=opened;if(!active(s)||busy(s)||s.phase==='success')return;saved();s.phase='edit';s.request=null;s.error=false;s.message='';paint();});}
   review=doc.createElement('p');review.hidden=true;review.textContent='입력한 정보로 기존 조합원에 연결합니다. 확인했다면 연결하기를 눌러 주세요.';form.append(review);
   status=doc.createElement('p');status.setAttribute('aria-live','polite');form.append(status);
   const actions=doc.createElement('footer');primary=doc.createElement('button');primary.type='submit';primary.dataset.primary='';recheck=doc.createElement('button');recheck.type='button';recheck.onclick=check;continueButton=doc.createElement('button');continueButton.type='button';continueButton.textContent='내 정보 보기';continueButton.onclick=()=>{const s=opened;if(!active(s)||s.phase!=='success')return;const result=s.result;suspend(false);options.onContinue?.(result);};actions.append(primary,recheck,continueButton);form.append(actions);dialog.append(form);doc.body.append(dialog);
   form.onsubmit=event=>{event.preventDefault();const s=opened;if(!active(s)||['saving','preparing','unknown','checking','success'].includes(s.phase))return;
    if(s.phase==='review'||s.phase==='retry'){send(s,s.phase==='retry');return;}
    saved();if(!s.values.name.trim()||!/^[0-9]{13}$/.test(s.values.rrn.replace(/[ -]/g,''))||!/^0[0-9]{8,10}$/.test(s.values.phone.replace(/[ ()+.-]/g,''))){s.error=true;s.message=messages.INVALID_INPUT;paint();return;}
    s.phase='review';s.error=false;s.message='';paint();primary.focus({preventScroll:true});};
   dialog.addEventListener('cancel',e=>{e.preventDefault();suspend(true);});
   dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key!=='Tab')return;const nodes=[...dialog.querySelectorAll('button,input')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!first)return;if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}});
  }
  function open(prefill={}){const k=key();if(!k)return false;setup();if(dialog.open&&opened?.key===k)return true;if(dialog.open)suspend(false);
   const existing=drafts.get(k),s=existing||{key:k,values:{name:'',rrn:'',phone:''},phase:'edit',message:'',error:false};drafts.set(k,s);
   if(!existing){for(const n of Object.keys(s.values))s.values[n]=String(prefill[n]||'');s.base={...s.values};}
   if(s.phase==='review')s.phase='edit';opened=s;++epoch;previous=doc.activeElement;for(const n of Object.keys(inputs))inputs[n].value=s.values[n];dialog.showModal();paint();(busy(s)?recheck:inputs.name).focus({preventScroll:true});return true;
  }
  options.client.auth?.onAuthStateChange?.((event,session)=>{const actor=String(session?.user?.id||'');if(actor!==authActor){suspend(false);authActor=actor;}});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)suspend(false);});root.addEventListener('pagehide',()=>suspend(false));
  root.addEventListener('beforeunload',e=>{const s=drafts.get(key());if(s&&(busy(s)||s.phase!=='success'&&Object.keys(s.values).some(n=>s.values[n]!==s.base[n]))){e.preventDefault();e.returnValue='';}});
  return Object.freeze({open,suspend,busy:()=>busy(drafts.get(key()))});
 }
 root.MemberIdentityClaim=Object.freeze({create});
})(window);
