/* v1.0.2 — Preserve reconnections and distinguish verified email from status-read failure. */
(function(root){
 'use strict';
 function create(options){
  const doc=root.document;let dialog,status,list,code,verify,send,refresh,close,authSection,authTitle,continueUnlink,cancelUnlink,view=0,opened=false,loading=null,state=null,op=null,opPending=false,returnTo=null,cooldown=0;
  const context=()=>options.getContext()||{},key=()=>{const c=context();return c.allowed&&c.actor&&c.coopId&&c.memberId?[c.actor,c.coopId,c.memberId].join('|'):'';};
  const active=(s,t)=>opened&&dialog.open&&state===s&&s.key===key()&&t===view;
  const params=(action,s,extra={})=>({p_action:action,p_coop_id:s.coopId,p_member_uid:s.memberId,...extra});
  function bounded(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(Error('READ_TIMEOUT')),15000);})]).finally(()=>root.clearTimeout(timer));}
  function message(value){if(opened&&state?.key===key()){status.textContent=value;status.hidden=!value;}}
  function button(text,fn){const n=doc.createElement('button');n.type='button';n.textContent=text;n.onclick=fn;return n;}
  function hide(restore=true){if(!dialog?.open)return;opened=false;++view;loading=null;dialog.close();code.value='';state.unlinkKind=null;const target=returnTo;returnTo=null;
   if(restore&&target?.isConnected&&!target.disabled&&[doc.body,dialog,null].includes(doc.activeElement))target.focus({preventScroll:true});
  }
  function paint(){if(!opened||state?.key!==key())return;const focusKind=list.contains(doc.activeElement)?doc.activeElement.dataset.kind:null;list.replaceChildren();const data=state.data;
   const card=(kind,name)=>{const section=doc.createElement('section'),icon=doc.createElement('span'),body=doc.createElement('div'),title=doc.createElement('strong');section.className='method-card method-'+kind;icon.className='method-icon';icon.textContent=kind==='email'?'@':kind==='kakao'?'💬':'N';icon.setAttribute('aria-hidden','true');body.className='method-content';title.textContent=name;body.append(title);section.append(icon,body);list.append(section);return {section,body};};
   const email=card('email','이메일'),detail=doc.createElement('p');detail.className='method-email';detail.textContent=state.user?.email||'확인 중';email.body.append(detail);
   const emailState=doc.createElement('span');emailState.className='method-state';emailState.textContent=data?.email_ready?'연결됨':data?'인증 필요':'확인 중';email.body.append(emailState);
   for(const kind of ['kakao','naver']){
    const item=data?.methods?.find(m=>m.kind===kind),{section,body}=card(kind,kind==='kakao'?'카카오':'네이버'),text=doc.createElement('p');text.className='method-state';text.textContent=item?(item.linked?'연결됨':'연결되지 않음'):'확인 중';section.classList.toggle('is-connected',!!item?.linked);body.append(text);
    if(item?.linked&&item.shared_with_other_coops===true){const note=doc.createElement('p');note.className='method-shared-notice';note.textContent='같은 연결을 쓰는 다른 조합에서도 함께 해제돼요.';body.append(note);}
    const action=button(item?.linked?'연결 해제':'연결하기',()=>item?.linked?unlink(kind):link(kind));action.className='method-action'+(item?.linked?'':' method-primary');action.dataset.kind=kind;if(item?.linked){action.setAttribute('aria-controls','login-methods-auth');action.setAttribute('aria-expanded',String(state.unlinkKind===kind));}action.disabled=!data||!!loading||opPending||!!op;section.append(action);
   }
   send.disabled=!state.user?.email||state.verifiedReadPending||!!loading||opPending||cooldown>Date.now();verify.disabled=!state.sent||!!loading||opPending;code.readOnly=!!loading||opPending;refresh.disabled=!!loading||opPending;
   refresh.textContent=op?'연결 상태 다시 확인':'다시 확인';
   authSection.hidden=!state.unlinkKind;authTitle.textContent=(state.unlinkKind==='naver'?'네이버':'카카오')+' 연결 해제';continueUnlink.disabled=!!loading||opPending||!data?.email_ready||!data?.recent_otp;cancelUnlink.disabled=opPending;
   if(focusKind&&doc.activeElement===doc.body){const next=list.querySelector('[data-kind="'+focusKind+'"]');if(next&&!next.disabled)next.focus({preventScroll:true});}
  }
  async function rpc(action,s,extra){const r=await options.client.rpc('member_login_methods',params(action,s,extra));if(r.error)throw r.error;return r.data;}
  async function read(){const s=state,t=view;if(!active(s,t)||loading)return;if(opPending){message('연결 처리를 기다리고 있어요…');return;}const recovering=s.verifiedReadPending,focusAfter=doc.activeElement===refresh,flight={};loading=flight;message('로그인 방법을 확인하고 있어요…');paint();
   try{
    const [user,result]=await bounded(Promise.all([options.client.auth.getUser(),rpc('status',s)]));
    if(!active(s,t))return;if(user.error||user.data?.user?.id!==s.actor)throw Error('ACTOR_CHANGED');
    s.user=user.data.user;s.data=result;s.verifiedReadPending=false;
    if(op?.key===s.key){
     const method=result.methods.find(m=>m.kind===op.kind);
     if(!method?.linked){
      const synced=await bounded(rpc('sync',s,{p_kind:op.kind,p_identity:op.identityId,p_expected:op.cacheRevision}));
      if(!active(s,t))return;
      if(!['linked','unlinked'].includes(synced.outcome))throw Error('SYNC_UNCONFIRMED');
      s.data=synced;
      if(synced.outcome==='unlinked')options.onUpdated?.(op.kind,s.user);
      op=null;s.unlinkKind=null;s.sent=false;code.value='';message(synced.outcome==='unlinked'?'연결을 해제했어요.':'새 연결이 확인됐어요. 현재 연결 상태를 표시했어요.');
     }else{op=null;message('아직 연결되어 있어요. 해제하려면 다시 선택해 주세요.');}
    }else message(recovering?'이메일 인증과 연결 상태를 확인했어요.':'');
   }catch(e){if(active(s,t))message(s.verifiedReadPending?'이메일 인증은 완료됐어요. 연결 상태를 불러오지 못했으니 ‘다시 확인’을 눌러 주세요.':op?'처리 결과를 확인하지 못했어요. 연결 상태를 다시 확인해 주세요.':'로그인 방법을 불러오지 못했어요. 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t)){paint();if(recovering&&focusAfter&&!continueUnlink.disabled&&doc.activeElement===refresh)continueUnlink.focus({preventScroll:true});}}
  }
  async function link(kind){const s=state,t=view;if(!active(s,t)||loading||opPending||op)return;const flight={};loading=flight;paint();
   try{const current=await bounded(rpc('prepare_link',s,{p_kind:kind}));if(!active(s,t))return;
    if(current.methods.find(m=>m.kind===kind)?.linked){s.data=current;return;}
    hide(false);await options.onLink(kind);
   }catch{if(active(s,t))message('로그인 상태를 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();}
  }
  async function sendCode(){const s=state,t=view;if(!active(s,t)||!s.unlinkKind||loading||opPending||cooldown>Date.now())return;
   if(!s.user?.email){message('인증할 로그인 이메일을 확인하지 못했어요.');return;}
   const flight={};loading=flight;cooldown=Date.now()+60000;s.sent=true;message('이메일로 인증코드를 보내고 있어요…');paint();
   try{
    const result=await bounded(options.client.auth.signInWithOtp({email:s.user.email,options:root.CoopAuthEmail.withOtpOptions({shouldCreateUser:false})}));
    if(!active(s,t))return;if(result.error)throw result.error;s.sent=true;cooldown=Date.now()+60000;message('메일로 받은 인증코드를 입력해 주세요.');if([send,code,doc.body].includes(doc.activeElement))code.focus({preventScroll:true});
   }catch{if(active(s,t))message('인증코드 발송 결과를 확인하지 못했어요. 메일함을 확인한 뒤 다시 시도해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();root.setTimeout(()=>{if(active(s,t))paint();},Math.max(0,cooldown-Date.now())+10);}
  }
  async function verifyCode(){const s=state,t=view;if(!active(s,t)||!s.unlinkKind||loading||opPending||!s.sent)return;
   const token=code.value.trim();if(!/^[0-9]{6,10}$/.test(token)){message('메일로 받은 인증코드를 입력해 주세요.');return;}
   const focusAfter=[verify,code].includes(doc.activeElement),flight={};let verified=false;loading=flight;paint();message('인증코드를 확인하고 있어요…');
   try{
    const r=await bounded(options.client.auth.verifyOtp({email:s.user.email,token,type:'email'}));
    if(!active(s,t))return;if(r.error||r.data?.user?.id!==s.actor)throw Error('AUTH_NOT_CONFIRMED');
    verified=true;code.value='';s.sent=false;s.verifiedReadPending=true;s.data=null;
    const data=await bounded(rpc('status',s));if(!active(s,t))return;s.data=data;s.verifiedReadPending=false;message('이메일을 인증했어요.');
   }catch{if(active(s,t))message(verified?'이메일 인증은 완료됐어요. 연결 상태를 불러오지 못했으니 ‘다시 확인’을 눌러 주세요.':'인증을 확인하지 못했어요. 코드와 로그인 계정을 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t)){paint();if(focusAfter&&[verify,code,doc.body,authSection].includes(doc.activeElement)){const target=s.verifiedReadPending?refresh:continueUnlink;if(!target.disabled)target.focus({preventScroll:true});}}}
  }
  async function unlink(kind){const s=state,t=view;if(!active(s,t)||loading||opPending||op)return;
   const method=s.data?.methods?.find(m=>m.kind===kind);if(!method?.linked)return;
   if(!s.data.email_ready||!s.data.recent_otp){s.unlinkKind=kind;paint();message('연결을 해제하려면 이메일을 인증해 주세요.');authSection.scrollIntoView?.({block:'nearest'});send.focus({preventScroll:true});return;}
   const origin=doc.activeElement,fromContinue=origin===continueUnlink,flight={};let cancelled=false;loading=flight;paint();
   try{
    const yes=await root.CoopDialog.confirm((kind==='kakao'?'카카오':'네이버')+' 로그인 연결을 해제할까요?'+(method.shared_with_other_coops===true?'\n같은 연결을 쓰는 다른 조합에서도 함께 해제돼요.':''),{title:'로그인 방법 관리',confirmText:'연결 해제'});
    if(!active(s,t))return;if(!yes){cancelled=true;return;}
    const checked=await bounded(rpc('prepare',s,{p_kind:kind,p_identity:method.identity_id,p_expected:s.data.revision}));
    if(!active(s,t))return;
    op={key:s.key,kind,identityId:method.identity_id,cacheRevision:checked.cache_revision};opPending=true;message('로그인 연결을 해제하고 있어요…');paint();
    // A timeout never means Auth stopped. Keep the original operation until its actual promise settles.
    const pending=Promise.resolve().then(()=>options.client.auth.unlinkIdentity({id:method.identity_id,provider:method.provider}));
    pending.finally(()=>{opPending=false;if(opened&&s.key===key()){paint();if(!loading&&op)void read();}}).catch(()=>{});
    await bounded(pending);
   }catch{if(active(s,t))message(op?'연결 해제 결과를 확인하지 못했어요. 연결 상태를 다시 확인해 주세요.':'연결 상태가 달라졌어요. 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t)){paint();if(cancelled&&[doc.body,dialog,origin].includes(doc.activeElement)){const target=fromContinue?continueUnlink:list.querySelector('[data-kind="'+kind+'"]');if(target&&!target.disabled)target.focus({preventScroll:true});}if(op&&!opPending)await read();}}
  }
  function build(){if(dialog)return;
   const style=doc.createElement('style');style.textContent=`.member-login-methods{box-sizing:border-box;width:min(580px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid var(--theme-border,#d8e2dc);border-radius:22px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033);font:inherit;word-break:keep-all;overflow-wrap:anywhere;box-shadow:0 24px 80px #0f172a33}.member-login-methods::backdrop{background:#0f172a75}.member-login-methods *{box-sizing:border-box}.member-login-methods [hidden]{display:none!important}.member-login-methods header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:22px}.member-login-methods h2{flex:1 1 12rem;font-size:1.25em;font-weight:750;margin:0;min-width:0}.member-login-methods p{margin:6px 0;line-height:1.65}.member-login-methods button,.member-login-methods input{font:inherit;min-height:44px;border:1px solid var(--theme-border,#cad5ce);border-radius:11px;padding:9px 14px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033);max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}.member-login-methods button{cursor:pointer;font-weight:600}.member-login-methods button:disabled{opacity:.5;cursor:default}.member-login-methods input{width:100%;min-width:0}.member-login-methods :focus-visible{outline:3px solid #328a51;outline-offset:3px}.member-login-methods .method-list{display:grid;gap:12px}.member-login-methods .method-card{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;padding:16px;border:1px solid var(--theme-border,#e2e8e4);border-radius:16px}.member-login-methods .method-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;font-size:20px;font-weight:850;background:#e8effd;color:#285db0}.member-login-methods .method-kakao .method-icon{background:#fee500;color:#271b16}.member-login-methods .method-naver .method-icon{background:#03b75b;color:#fff}.member-login-methods .method-content{min-width:0}.member-login-methods .method-content strong{font-size:1.04em;font-weight:700}.member-login-methods .method-state{font-size:.86em;color:var(--theme-muted,#69766f)}.member-login-methods .is-connected .method-state{color:#2c8050}.member-login-methods .method-email{font-size:.9em;overflow-wrap:anywhere;word-break:break-all}.member-login-methods .method-primary{background:#247847;color:#fff;border-color:#247847}.member-login-methods .method-action{font-size:.88em}.member-login-methods .method-shared-notice{font-size:.82em;color:var(--theme-muted,#69766f);margin-top:8px}.member-login-methods .method-auth{margin-top:16px;padding:18px;background:var(--theme-bg,#f4f8f5);border:1px solid var(--theme-border,#d9e6dc);border-radius:16px}.member-login-methods .method-auth h3{font-size:1em;font-weight:700;margin:0 0 8px}.member-login-methods .method-auth label{display:block;font-size:.9em;margin:10px 0 6px}.member-login-methods footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.member-login-methods .method-refresh-row{justify-content:flex-end;margin-top:18px}.member-login-methods [role=status]{font-size:.9em;margin-top:14px}html[data-theme=dark] .member-login-methods .is-connected .method-state{color:#8bd4a2}@media(max-width:420px){.member-login-methods{padding:18px}.member-login-methods .method-card{grid-template-columns:40px minmax(0,1fr);padding:14px;gap:10px}.member-login-methods .method-action{grid-column:2;justify-self:start}.member-login-methods .method-auth{padding:14px}}`;doc.head.append(style);
   dialog=doc.createElement('dialog');dialog.className='member-login-methods';dialog.setAttribute('aria-labelledby','login-methods-title');
   const header=doc.createElement('header'),title=doc.createElement('h2');title.id='login-methods-title';title.textContent='로그인 방법 관리';close=button('닫기',()=>hide());header.append(title,close);dialog.append(header);
   list=doc.createElement('div');list.className='method-list';dialog.append(list);authSection=doc.createElement('section');authSection.id='login-methods-auth';authSection.setAttribute('aria-labelledby','login-methods-auth-title');authSection.className='method-auth';authSection.hidden=true;authTitle=doc.createElement('h3');authTitle.id='login-methods-auth-title';const label=doc.createElement('label');label.htmlFor='login-methods-otp';label.textContent='이메일 인증코드';code=doc.createElement('input');code.id='login-methods-otp';code.inputMode='numeric';code.autocomplete='one-time-code';code.maxLength=10;code.placeholder='이메일 인증코드';code.dataset.erpQueryControl='';
   send=button('인증코드 받기',sendCode);verify=button('코드 확인',verifyCode);const tools=doc.createElement('footer');tools.append(send,verify);continueUnlink=button('연결 해제',()=>unlink(state.unlinkKind));continueUnlink.className='method-primary';cancelUnlink=button('취소',()=>{if(opPending)return;const kind=state.unlinkKind;++view;loading=null;state.unlinkKind=null;code.value='';message('');paint();list.querySelector('[data-kind="'+kind+'"]')?.focus({preventScroll:true});});const actions=doc.createElement('footer');actions.append(cancelUnlink,continueUnlink);authSection.append(authTitle,label,code,tools,actions);dialog.append(authSection);
   code.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();verifyCode();}};
   status=doc.createElement('p');status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);refresh=button('다시 확인',read);const refreshRow=doc.createElement('footer');refreshRow.className='method-refresh-row';refreshRow.append(refresh);dialog.append(refreshRow);doc.body.append(dialog);
   dialog.addEventListener('cancel',e=>{e.preventDefault();hide();});
   dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key!=='Tab')return;const nodes=[...dialog.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(!first)return;if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}});
   root.addEventListener('pagehide',()=>hide(false));doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide(false);});
   options.client.auth.onAuthStateChange?.((_event,session)=>{if(state&&session?.user?.id!==state.actor)hide(false);});
   new MutationObserver(()=>{if(opened&&state?.key!==key())hide(false);}).observe(doc.body,{childList:true,subtree:true});
  }
  function open(){const k=key();if(!k)return false;build();if(opened)return true;const c=context();if(!state||state.key!==k){state={key:k,actor:c.actor,coopId:c.coopId,memberId:c.memberId,sent:false};if(op?.key!==k)op=null;}
   opened=true;++view;returnTo=doc.activeElement;dialog.showModal();paint();close.focus({preventScroll:true});void read();return true;
  }
  return Object.freeze({open,suspend:()=>hide(false)});
 }
 root.MemberLoginMethods=Object.freeze({version:'1.0.2',create});
})(window);
