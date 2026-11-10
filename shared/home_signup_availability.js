/* Public signup links follow the current tenant's existing document readiness. */
(function(root){
 'use strict';
 function mount(client){
  if(!client?.rpc||document.documentElement.hasAttribute('data-home-signup-watch'))return;
  document.documentElement.setAttribute('data-home-signup-watch','');
  const substitutes=new Map();let pending=null,closed=false,queued=false;
  function target(a){
   if(!a?.hasAttribute('href')||a.hasAttribute('download')||a.hidden||a.style.display==='none'||a.getAttribute('aria-disabled')==='true')return null;
   try{const url=new URL(a.href,location.href);return url.origin===location.origin&&/^\/signup(?:\.html)?\/?$/.test(url.pathname)?url:null;}catch(_){return null;}
  }
  function paint(){
   for(const [a,b] of substitutes)if(!closed||!a.isConnected||!target(a)){a.removeAttribute('data-home-signup-replaced');if(document.activeElement===b&&a.isConnected)a.focus({preventScroll:true});b.remove();substitutes.delete(a);}
   if(!closed)return;
   for(const a of document.querySelectorAll('a[href]')){
    if(!target(a))continue;
    if(substitutes.has(a)){const b=substitutes.get(a),cls=(a.className+' home-signup-closed').trim();if(b.className!==cls)b.className=cls;continue;}
    const b=document.createElement('button');b.type='button';b.className=a.className;
    b.classList.add('home-signup-closed');b.textContent='가입 준비 중 · 다시 확인';
    b.addEventListener('click',async()=>{if(b.getAttribute('aria-busy')==='true')return;b.setAttribute('aria-busy','true');try{await refresh();}finally{b.removeAttribute('aria-busy');}});
    substitutes.set(a,b);a.after(b);a.setAttribute('data-home-signup-replaced','');
    if(document.activeElement===a)b.focus({preventScroll:true});
   }
  }
  function refresh(){
   if(pending)return pending;
   const controller=new AbortController();let timer;
   async function rpc(name,args){const req=client.rpc(name,args);const res=await (req.abortSignal?req.abortSignal(controller.signal):req);if(res.error)throw res.error;return res.data;}
   const work=(async()=>{
    const data=await rpc('get_public_signup_context'),context=Array.isArray(data)?data[0]:data;
    if(!context?.coop_id||!context.coop_code||controller.signal.aborted)throw Error('SIGNUP_CONTEXT_UNAVAILABLE');
    return rpc('get_public_signup_documents',{p_coop_code:context.coop_code});
   })();
   pending=Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SIGNUP_READ_TIMEOUT'));},8000);})])
    .then(data=>{if(typeof data?.ready!=='boolean')return;closed=!data.ready;paint();})
    .catch(()=>{}).finally(()=>{clearTimeout(timer);pending=null;});
   return pending;
  }
  const observer=new MutationObserver(()=>{if(!closed||queued)return;queued=true;queueMicrotask(()=>{queued=false;paint();});});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['href','hidden','style','class','aria-disabled']});
  root.addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&closed)void refresh();});
  root.setInterval(()=>{if(closed&&!document.hidden)void refresh();},15000);
  void refresh();
 }
 root.CoopHomeSignupAvailability=Object.freeze({mount});
})(window);
