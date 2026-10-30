/* v1.0.0 — Own-account login methods. No passwords, identity SQL deletion or automatic retries. */
(function(root){
 'use strict';
 function create(options){
  const doc=root.document;let dialog,status,list,code,verify,send,refresh,close,view=0,opened=false,loading=null,state=null,op=null,opPending=false,returnTo=null,cooldown=0;
  const context=()=>options.getContext()||{},key=()=>{const c=context();return c.allowed&&c.actor&&c.coopId&&c.memberId?[c.actor,c.coopId,c.memberId].join('|'):'';};
  const active=(s,t)=>opened&&dialog.open&&state===s&&s.key===key()&&t===view;
  const params=(action,s,extra={})=>({p_action:action,p_coop_id:s.coopId,p_member_uid:s.memberId,...extra});
  function bounded(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(Error('READ_TIMEOUT')),15000);})]).finally(()=>root.clearTimeout(timer));}
  function message(value){if(opened&&state?.key===key())status.textContent=value;}
  function button(text,fn){const n=doc.createElement('button');n.type='button';n.textContent=text;n.onclick=fn;return n;}
  function hide(restore=true){if(!dialog?.open)return;opened=false;++view;loading=null;dialog.close();code.value='';const target=returnTo;returnTo=null;
   if(restore&&target?.isConnected&&!target.disabled&&[doc.body,dialog,null].includes(doc.activeElement))target.focus({preventScroll:true});
  }
  function paint(){if(!opened||state?.key!==key())return;const focusKind=list.contains(doc.activeElement)?doc.activeElement.dataset.kind:null;list.replaceChildren();const data=state.data;
   const email=doc.createElement('section'),label=doc.createElement('strong'),detail=doc.createElement('p');label.textContent='이메일';detail.textContent=state.user?.email||'이메일 확인 필요';email.append(label,detail);
   const emailState=doc.createElement('span');emailState.textContent=data?.email_ready?'이메일 로그인 연결됨':'이메일 로그인은 인증 후 확인할 수 있어요.';email.append(emailState);list.append(email);
   for(const kind of ['kakao','naver']){
    const item=data?.methods?.find(m=>m.kind===kind),section=doc.createElement('section'),title=doc.createElement('strong'),text=doc.createElement('p');title.textContent=kind==='kakao'?'카카오':'네이버';text.textContent=item?(item.linked?'연결됨':'연결되지 않음'):'확인 중';section.append(title,text);
    const action=button(item?.linked?'연결 해제':'연결하기',()=>item?.linked?unlink(kind):link(kind));action.dataset.kind=kind;action.disabled=!data||!!loading||opPending||!!op;section.append(action);list.append(section);
   }
   send.disabled=!state.user?.email||!!loading||opPending||cooldown>Date.now();verify.disabled=!state.sent||!!loading||opPending;code.readOnly=!!loading||opPending;refresh.disabled=!!loading||opPending;
   refresh.textContent=op?'연결 상태 다시 확인':'다시 확인';
   if(focusKind&&doc.activeElement===doc.body){const next=list.querySelector('[data-kind="'+focusKind+'"]');if(next&&!next.disabled)next.focus({preventScroll:true});}
  }
  async function rpc(action,s,extra){const r=await options.client.rpc('member_login_methods',params(action,s,extra));if(r.error)throw r.error;return r.data;}
  async function read(){const s=state,t=view;if(!active(s,t)||loading)return;if(opPending){message('연결 처리를 기다리고 있어요…');return;}const flight={};loading=flight;message('로그인 방법을 확인하고 있어요…');paint();
   try{
    const [user,result]=await bounded(Promise.all([options.client.auth.getUser(),rpc('status',s)]));
    if(!active(s,t))return;if(user.error||user.data?.user?.id!==s.actor)throw Error('ACTOR_CHANGED');
    s.user=user.data.user;s.data=result;
    if(op?.key===s.key){
     const method=result.methods.find(m=>m.kind===op.kind);
     if(!method?.linked){
      const synced=await bounded(rpc('sync',s,{p_kind:op.kind,p_identity:op.identityId,p_expected:op.cacheRevision}));
      if(!active(s,t))return;
      if(synced.outcome!=='unlinked')throw Error('SYNC_UNCONFIRMED');
      options.onUpdated?.(op.kind,s.user);op=null;message('연결을 해제했어요.');
     }else{op=null;message('아직 연결되어 있어요. 해제하려면 다시 선택해 주세요.');}
    }else message('연결할 로그인 방법을 선택해 주세요.');
   }catch(e){if(active(s,t))message(op?'처리 결과를 확인하지 못했어요. 이메일 인증 후 연결 상태를 다시 확인해 주세요.':'로그인 방법을 불러오지 못했어요. 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();}
  }
  async function link(kind){const s=state,t=view;if(!active(s,t)||loading||opPending||op)return;const flight={};loading=flight;paint();
   try{const current=await bounded(rpc('prepare_link',s,{p_kind:kind}));if(!active(s,t))return;
    if(current.methods.find(m=>m.kind===kind)?.linked){s.data=current;return;}
    hide(false);await options.onLink(kind);
   }catch{if(active(s,t))message('로그인 상태를 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();}
  }
  async function sendCode(){const s=state,t=view;if(!active(s,t)||loading||opPending||cooldown>Date.now())return;
   if(!s.user?.email){message('인증할 로그인 이메일을 확인하지 못했어요.');return;}
   const flight={};loading=flight;cooldown=Date.now()+60000;s.sent=true;message('이메일로 인증코드를 보내고 있어요…');paint();
   try{
    const result=await bounded(options.client.auth.signInWithOtp({email:s.user.email,options:root.CoopAuthEmail.withOtpOptions({shouldCreateUser:false})}));
    if(!active(s,t))return;if(result.error)throw result.error;s.sent=true;cooldown=Date.now()+60000;message('메일로 받은 인증코드를 입력해 주세요.');if([send,code,doc.body].includes(doc.activeElement))code.focus({preventScroll:true});
   }catch{if(active(s,t))message('인증코드 발송 결과를 확인하지 못했어요. 메일함을 확인한 뒤 다시 시도해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();root.setTimeout(()=>{if(active(s,t))paint();},Math.max(0,cooldown-Date.now())+10);}
  }
  async function verifyCode(){const s=state,t=view;if(!active(s,t)||loading||opPending||!s.sent)return;
   const token=code.value.trim();if(!/^[0-9]{6,10}$/.test(token)){message('메일로 받은 인증코드를 입력해 주세요.');return;}
   const flight={};loading=flight;paint();message('인증코드를 확인하고 있어요…');
   try{
    const r=await bounded(options.client.auth.verifyOtp({email:s.user.email,token,type:'email'}));
    if(!active(s,t))return;if(r.error||r.data?.user?.id!==s.actor)throw Error('AUTH_NOT_CONFIRMED');
    code.value='';s.sent=false;const data=await bounded(rpc('status',s));if(!active(s,t))return;s.data=data;message('이메일을 인증했어요. 해제할 로그인 방법을 선택해 주세요.');
   }catch{if(active(s,t))message('인증을 확인하지 못했어요. 코드와 로그인 계정을 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t))paint();}
  }
  async function unlink(kind){const s=state,t=view;if(!active(s,t)||loading||opPending||op)return;
   const method=s.data?.methods?.find(m=>m.kind===kind);if(!method?.linked)return;
   if(!s.data.email_ready||!s.data.recent_otp){message('연결 해제 전에 아래에서 이메일을 인증해 주세요.');send.focus({preventScroll:true});return;}
   const flight={};loading=flight;paint();
   try{
    const yes=await root.CoopDialog.confirm((kind==='kakao'?'카카오':'네이버')+' 로그인 연결을 해제할까요?',{title:'로그인 방법 관리',confirmText:'연결 해제'});
    if(!active(s,t)||!yes)return;
    const checked=await bounded(rpc('prepare',s,{p_kind:kind,p_identity:method.identity_id,p_expected:s.data.revision}));
    if(!active(s,t))return;
    op={key:s.key,kind,identityId:method.identity_id,cacheRevision:checked.cache_revision};opPending=true;message('로그인 연결을 해제하고 있어요…');paint();
    // A timeout never means Auth stopped. Keep the original operation until its actual promise settles.
    const pending=Promise.resolve().then(()=>options.client.auth.unlinkIdentity({id:method.identity_id,provider:method.provider}));
    pending.finally(()=>{opPending=false;if(opened&&s.key===key()){paint();if(!loading&&op)void read();}}).catch(()=>{});
    await bounded(pending);
   }catch{if(active(s,t))message(op?'연결 해제 결과를 확인하지 못했어요. 연결 상태를 다시 확인해 주세요.':'연결 상태가 달라졌어요. 다시 확인해 주세요.');}
   finally{if(loading===flight)loading=null;if(active(s,t)){paint();if(op&&!opPending)await read();}}
  }
  function build(){if(dialog)return;
   const style=doc.createElement('style');style.textContent='.member-login-methods{box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:22px;border:1px solid #94a3b8;border-radius:18px;background:#fff;color:#172033;font:inherit;word-break:keep-all;overflow-wrap:anywhere}.member-login-methods::backdrop{background:#0f172a80}.member-login-methods *{box-sizing:border-box}.member-login-methods header{display:flex;align-items:center;justify-content:space-between;gap:12px}.member-login-methods h2{font-size:1.2em;margin:0}.member-login-methods section{border-bottom:1px solid #cbd5e1;padding:16px 0}.member-login-methods p{margin:8px 0;line-height:1.6}.member-login-methods button,.member-login-methods input{font:inherit;min-height:44px;border:1px solid #64748b;border-radius:9px;padding:9px 12px;background:#fff;color:#172033;max-width:100%}.member-login-methods button{cursor:pointer}.member-login-methods button:disabled{opacity:.55}.member-login-methods input{width:100%;min-width:0}.member-login-methods :focus-visible{outline:3px solid #2563eb;outline-offset:2px}.member-login-methods footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}';doc.head.append(style);
   dialog=doc.createElement('dialog');dialog.className='member-login-methods';dialog.setAttribute('aria-labelledby','login-methods-title');
   const header=doc.createElement('header'),title=doc.createElement('h2');title.id='login-methods-title';title.textContent='로그인 방법 관리';close=button('닫기',()=>hide());header.append(title,close);dialog.append(header);
   const note=doc.createElement('p');note.textContent='연결은 본인 로그인 계정에 적용돼요. 같은 소셜 연결로 이용하는 다른 조합에서도 해당 로그인 방법이 함께 해제돼요.';dialog.append(note);
   list=doc.createElement('div');dialog.append(list);const section=doc.createElement('section'),label=doc.createElement('label');label.htmlFor='login-methods-otp';label.textContent='연결 해제 전 이메일 인증';code=doc.createElement('input');code.id='login-methods-otp';code.inputMode='numeric';code.autocomplete='one-time-code';code.maxLength=10;code.placeholder='이메일 인증코드';code.dataset.erpQueryControl='';
   send=button('인증코드 받기',sendCode);verify=button('코드 확인',verifyCode);const tools=doc.createElement('footer');tools.append(send,verify);section.append(label,code,tools);dialog.append(section);
   code.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();verifyCode();}};
   status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);refresh=button('다시 확인',read);dialog.append(refresh);doc.body.append(dialog);
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
 root.MemberLoginMethods=Object.freeze({version:'1.0.0',create});
})(window);
