/* v1.2.0 — Unavailable public signup links display a passive readiness label. */
(function(root){
 'use strict';
 function mount(client,{getContext}={}){
  if(!client?.rpc||document.documentElement.hasAttribute('data-home-signup-watch'))return;
  document.documentElement.setAttribute('data-home-signup-watch','');
  const substitutes=new Map();let pending=null,closed=false,coopCode='';
  function target(a){
   if(!a?.hasAttribute('href')||a.hasAttribute('download')||a.hidden||a.style.display==='none'||a.getAttribute('aria-disabled')==='true')return null;
   try{const url=new URL(a.href,location.href);return url.origin===location.origin&&/^\/signup(?:\.html)?\/?$/.test(url.pathname)?url:null;}catch(_){return null;}
  }
  function paintLink(a){
    if(!closed||!a.isConnected||!target(a)){
     const b=substitutes.get(a);if(!b)return;
     a.removeAttribute('data-home-signup-replaced');
     if(document.activeElement===b&&a.isConnected&&!a.hidden)a.focus({preventScroll:true});
     b.remove();substitutes.delete(a);return;
    }
    if(substitutes.has(a)){const b=substitutes.get(a),cls=(a.className+' home-signup-closed').trim();if(b.className!==cls)b.className=cls;if(a.nextElementSibling!==b)a.after(b);return;}
    const b=document.createElement('span');b.className=a.className;
    b.classList.add('home-signup-closed');b.textContent='가입 준비 중';
    substitutes.set(a,b);a.after(b);a.setAttribute('data-home-signup-replaced','');
  }
  function refresh(){
   if(pending)return pending;
   const controller=new AbortController();let timer;
   async function rpc(name,args){const req=client.rpc(name,args);const res=await (req.abortSignal?req.abortSignal(controller.signal):req);if(res.error)throw res.error;return res.data;}
   const work=(async()=>{
    if(!coopCode){
     const data=getContext?await getContext():null;
     let context=Array.isArray(data)?data[0]:data;
     if(!context?.coop_id||!context.coop_code){
      if(controller.signal.aborted)throw Error('SIGNUP_CONTEXT_UNAVAILABLE');
      const fallback=await rpc('get_public_signup_context');context=Array.isArray(fallback)?fallback[0]:fallback;
     }
     if(!context?.coop_id||!context.coop_code||controller.signal.aborted)throw Error('SIGNUP_CONTEXT_UNAVAILABLE');
     coopCode=context.coop_code;
    }
    return rpc('get_public_signup_documents',{p_coop_code:coopCode});
   })();
   pending=Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SIGNUP_READ_TIMEOUT'));},8000);})])
    .then(data=>{
     if(typeof data?.ready!=='boolean'||closed===!data.ready)return;
     closed=!data.ready;
     for(const a of closed?document.querySelectorAll('a[href]'):[...substitutes.keys()])paintLink(a);
    })
    .catch(()=>{}).finally(()=>{clearTimeout(timer);pending=null;});
   return pending;
  }
  const observer=new MutationObserver(records=>{
   if(!closed)return;
   const changed=new Set();let removed=false;
   for(const m of records){
    if(m.type==='attributes'){if(m.target.matches('a'))changed.add(m.target);continue;}
    for(const n of m.addedNodes)if(n.nodeType===1){
     if(n.matches('a[href]'))changed.add(n);
     else if(n.childElementCount)for(const a of n.querySelectorAll('a[href]'))changed.add(a);
    }
    for(const n of m.removedNodes)if(n.nodeType===1&&(n.matches('a')||n.childElementCount))removed=true;
   }
   if(removed)for(const a of substitutes.keys())if(!a.isConnected)changed.add(a);
   for(const a of changed)paintLink(a);
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['href','hidden','style','class','aria-disabled']});
  root.addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&closed)void refresh();});
  root.setInterval(()=>{if(closed&&!document.hidden)void refresh();},15000);
  void refresh();
 }
 root.CoopHomeSignupAvailability=Object.freeze({mount});
})(window);
