(function(root){
 'use strict';
 function mount({dialog,owner,api,timeout=12000,nonce=()=>root.crypto.randomUUID()}){
  const $=key=>dialog.querySelector('[data-bsu="'+key+'"]');
  const document=dialog.ownerDocument;
  const sessions=new Map();
  const tabs=['compose','mine','inbox'];
  let scope='', trigger=null, pane='compose', sequence=0, opened=0, controller=null, active=null;
  function message(node,value){node.textContent=value;}
  function element(tag,text,cls){
   const out=document.createElement(tag);if(text!==undefined)out.textContent=text;if(cls)out.className=cls;return out;
  }
  function state(key){
   if(!sessions.has(key))sessions.set(key,{text:'',pending:null,busy:false,replies:new Map(),reviewer:false,ownNotice:''});
   return sessions.get(key);
  }
  function live(key=scope){return !!key&&scope===key&&owner()===key&&dialog.open;}
  function stopRead(){++sequence;controller?.abort();controller=null;active=null;}
  function finishClose(){
   stopRead();const from=trigger,key=scope;trigger=null;scope='';
   if(from?.isConnected&&owner()===key&&(document.activeElement===document.body||dialog.contains(document.activeElement)))from.focus();
  }
  function close(){
   if(dialog.open)dialog.close();
   finishClose();
  }
  function renderCompose(){
   const s=state(scope);
   $('idea').value=s.text;$('idea').readOnly=!!s.pending;
   $('send').disabled=s.busy;
   $('send').textContent=s.busy?'보내는 중…':s.pending?'다시 확인':'제안 보내기';
   message($('compose-status'),s.ownNotice);
  }
  function show(next,refresh=true){
   if(!live()||!tabs.includes(next)||next==='inbox'&&!state(scope).reviewer)return;
   stopRead();pane=next;
   for(const name of tabs){
    $('tab-'+name).setAttribute('aria-pressed',String(name===next));
    $('panel-'+name).hidden=name!==next;
   }
   if(next==='compose')renderCompose();else if(refresh)void load(next,0);
  }
  async function call(args,signal){
   let timer;
   try{
    return await Promise.race([Promise.resolve(api(args,signal)),new Promise(resolve=>{
     timer=setTimeout(()=>resolve({unknown:true}),timeout);
    })]);
   }catch{return {unknown:true};}finally{clearTimeout(timer);}
  }
  function listStatus(name,text){message($(name+'-status'),text);}
  const allowedErrors=/BADGE_SUGGESTION_(INVALID|LIMIT|FORBIDDEN|REQUEST_CHANGED|REPLIED|UNAVAILABLE)\b|CAPITAL_BADGE_FORBIDDEN/;
  function writeFailure(result){
   const error=String(result?.error?.message||'');
   if(!allowedErrors.test(error))return null;
   if(error.includes('LIMIT'))return '하루에 보낼 수 있는 제안 수를 넘었어요.';
   if(error.includes('REPLIED'))return '이미 답변이 등록됐어요. 목록을 다시 확인해 주세요.';
   if(error.includes('FORBIDDEN'))return '제안 권한을 다시 확인해 주세요.';
   return '내용을 다시 확인해 주세요.';
  }
  function stamp(iso){
   const d=new Date(iso);return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'}).format(d);
  }
  function renderItem(name,item,key){
   const card=element('article',undefined,'bsu-card');
   const status=item.decision==='made'?'반영했어요':item.decision==='unavailable'?'어려워요':'접수';
   card.append(element('div',[item.coop,stamp(item.created_at),status].filter(Boolean).join(' · '),'small text-muted'));
   card.append(element('p',String(item.idea??''),'bsu-body'));
   if(item.reply){
    const reply=element('section',undefined,'bsu-reply');
    reply.append(element('strong','답변'),element('p',String(item.reply),'bsu-body'));card.append(reply);
   }
   if(name!=='inbox'||item.decision||typeof item.id!=='string')return card;
   const session=state(key), draft=session.replies.get(item.id)||{text:'',decision:'made',busy:false,locked:false,status:''};
   session.replies.set(item.id,draft);
   if(draft.done){card.append(element('p',draft.status+' '+draft.text,'bsu-body'));return card;}
   const form=element('form'), note=element('p',draft.status,'small mb-1'), decision=element('select',undefined,'form-select form-select-sm'), body=element('textarea',undefined,'form-control'), save=element('button','답변 등록','btn btn-sm btn-primary');
   decision.setAttribute('aria-label','검토 결과');body.setAttribute('aria-label','답변');note.setAttribute('role','status');
   for(const [code,label] of [['made','반영했어요'],['unavailable','어려워요']]){
    const opt=element('option',label);opt.value=code;decision.append(opt);
   }
   decision.value=draft.decision;body.value=draft.text;body.maxLength=1500;body.required=true;body.rows=2;save.type='submit';
   function render(){decision.disabled=draft.locked;body.readOnly=draft.locked;save.disabled=draft.busy;save.textContent=draft.busy?'등록 중…':draft.locked?'다시 확인':'답변 등록';message(note,draft.status);}
   form.addEventListener('input',()=>{if(!draft.locked){draft.text=body.value;draft.decision=decision.value;}});
   form.addEventListener('submit',async e=>{
    e.preventDefault();if(!live(key)||pane!=='inbox'||draft.busy||draft.done)return;
    const reply=draft.text.trim();if(!reply||reply.length>1500){message(note,'답변을 입력해 주세요.');return;}
    draft.busy=true;draft.locked=true;draft.status='';render();
    const res=await call({p_action:'reply',p_id:item.id,p_body:reply,p_decision:draft.decision});
    draft.busy=false;
    if(res?.data?.id===item.id){draft.done=true;draft.status='답변을 등록했어요.';}
    else {const error=writeFailure(res);draft.status=error||'등록 결과를 확인하지 못했어요.';draft.locked=!error;}
    // Do not refresh or move focus while editing another reply.
    if(!live(key)||pane!=='inbox'||!card.isConnected)return;
    if(draft.done){
     const focused=form.contains(document.activeElement);
     form.replaceWith(element('p',draft.status+' '+reply,'bsu-body'));
     if(focused){card.tabIndex=-1;card.focus();}
    }else render();
   });
   render();form.append(decision,body,note,save);card.append(form);return card;
  }
  function load(name,offset,append=false){
   if(!live()||pane!==name||active)return;
   const key=scope,request=++sequence, read=new AbortController();controller=read;active=request;
   const list=$(name+'-list'),more=$(name+'-more');
   if(!append)list.replaceChildren();
   more.hidden=true;listStatus(name,'불러오는 중…');
   void call({p_action:name,p_offset:offset},read.signal).then(res=>{
    if(!live(key)||request!==sequence||pane!==name)return;
    active=null;controller=null;
    if(!Array.isArray(res?.data?.items)){
     listStatus(name,'제안을 불러오지 못했어요.');
     more.hidden=false;more.textContent='다시 확인';more.onclick=()=>load(name,offset,append);return;
    }
    listStatus(name,res.data.items.length||append?'':'아직 제안이 없어요.');
    const existing=new Set(Array.from(list.children).map(card=>card.dataset.id));
    for(const item of res.data.items){
     if(existing.has(item.id))continue;
     const card=renderItem(name,item,key);card.dataset.id=item.id;list.append(card);existing.add(item.id);
    }
    if(Number.isInteger(res.data.next)&&res.data.next>offset){
     more.hidden=false;more.textContent='더 보기';more.onclick=()=>load(name,res.data.next,true);
    }
   });
  }
  async function submit(e){
   e.preventDefault();if(!live()||pane!=='compose')return;
   const key=scope,s=state(key);
   if(s.busy)return;
   const text=(s.pending?.text||s.text).trim();
   if(text.length<3||text.length>1500){message($('compose-status'),'제안 내용을 3자 이상 입력해 주세요.');return;}
   if(!s.pending){
    try{s.pending={text,id:nonce()};}catch{message($('compose-status'),'제안을 보내지 못했어요. 다시 눌러 주세요.');return;}
   }
   const pending=s.pending;s.busy=true;s.ownNotice='';renderCompose();
   const res=await call({p_action:'submit',p_request:pending.id,p_body:pending.text});
   s.busy=false;
   if(typeof res?.data?.id==='string'){s.pending=null;s.text='';s.ownNotice='제안을 보냈어요. 답변은 내 제안에서 확인할 수 있어요.';}
   else {
    const error=writeFailure(res);if(error)s.pending=null;
    s.ownNotice=error||'접수 결과를 확인하지 못했어요. 같은 제안의 결과를 다시 확인할 수 있어요.';
   }
   if(live(key)&&pane==='compose')renderCompose();
  }
  $('idea').addEventListener('input',()=>{if(live()&&!state(scope).pending){const s=state(scope);s.text=$('idea').value;s.ownNotice='';message($('compose-status'),'');}});
  $('compose-form').addEventListener('submit',submit);
  $('close').addEventListener('click',close);
  dialog.addEventListener('close',()=>{if(!dialog.open&&scope)finishClose();});
  for(const name of tabs)$('tab-'+name).addEventListener('click',()=>show(name));
  return {
   open(from){
    const key=owner();if(!key||dialog.open)return;
    scope=key;trigger=from;dialog.showModal();
    const s=state(key);s.reviewer=false;$('tab-inbox').hidden=true;show('compose');$('idea').focus();
    const nonce=++sequence; // Independent from list navigation; don't replace the active tab.
    void call({p_action:'context'}).then(res=>{
     if(!live(key)||nonce!==opened)return;
     s.reviewer=res?.data?.reviewer===true;$('tab-inbox').hidden=!s.reviewer;
    });
    opened=nonce;
   },
   invalidate(){++opened;if(dialog.open||scope)close();}
  };
 }
 root.AdminBadgeSuggestions=Object.freeze({version:'1.0.0',mount});
})(window);
