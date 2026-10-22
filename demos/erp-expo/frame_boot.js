/* Expo-only adapter for unchanged ERP pages. Not an authorization substitute. */
(() => {
 'use strict';
 const role=/^expo-(admin|staff|member)-0[1-8]\.coopco\.kr$/;
 if(!role.test(location.hostname))return;
 const project='https://ifdqlwxgqgsvnawmhlfc.supabase.co',key='expo-runtime-workspace-v1';
 const member=location.hostname.startsWith('expo-member-'),uuid=/^[0-9a-f-]{36}$/;
 let workspace='',expires=0,stopped=false,verified=false,verifying=false;
 const clients=new Set(),nativeFetch=window.fetch.bind(window),diagnostics=[];
 let controlObserver;
 let finish;const readiness=new Promise(resolve=>{finish=resolve;});
 try{
  if(window.top!==window.self)workspace=String(window.top.ExpoImmutableWorkspace||'');
  else{
   const target=new URL(location.href),requested=target.searchParams.get('expo_workspace');
   if(requested&&uuid.test(requested)){sessionStorage.setItem(key,requested);target.searchParams.delete('expo_workspace');history.replaceState(history.state,'',target.href);}
   workspace=sessionStorage.getItem(key)||'';
  }
 }catch{}
 Object.defineProperty(window,'ExpoImmutableWorkspace',{value:workspace,writable:false,configurable:false});
 let tabNonce='';
 try{tabNonce=sessionStorage.getItem('expo-auth-tab-v1')||'';if(!uuid.test(tabNonce)){tabNonce=crypto.randomUUID();sessionStorage.setItem('expo-auth-tab-v1',tabNonce);}}
 catch{stopped=true;finish(false);}
 function authOptions(original={}){
  if(!uuid.test(workspace)||!uuid.test(tabNonce))return {...original,persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  if(original.persistSession===false)return {...original,persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storage:sessionStorage,storageKey:'expo-public-v1:'+tabNonce};
  return {...original,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:sessionStorage,storageKey:'expo-auth-v1:'+workspace+':'+tabNonce};
 }
 // Existing UI preference/draft keys are scoped to this tab and visitor too.
 // No default/operating localStorage entries are read, migrated, or removed.
 if(uuid.test(workspace)&&uuid.test(tabNonce)){
  const storage=sessionStorage,prefix='expo-app-v1:'+workspace+':'+tabNonce+':';
  const names=()=>{const out=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix))out.push(k.slice(prefix.length));}return out;};
  const methods={getItem:k=>storage.getItem(prefix+String(k)),setItem:(k,v)=>storage.setItem(prefix+String(k),String(v)),removeItem:k=>storage.removeItem(prefix+String(k)),clear:()=>names().forEach(k=>storage.removeItem(prefix+k)),key:i=>names()[i]??null};
  const scoped=new Proxy(Object.create(null),{get:(_,k)=>k==='length'?names().length:k===Symbol.toStringTag?'Storage':typeof k==='string'?(Object.hasOwn(methods,k)?methods[k]:methods.getItem(k)):undefined,
   set:(_,k,v)=>{methods.setItem(k,v);return true;},deleteProperty:(_,k)=>{methods.removeItem(k);return true;},ownKeys:names,
   getOwnPropertyDescriptor:(_,k)=>names().includes(k)?{enumerable:true,configurable:true,value:methods.getItem(k)}:undefined});
  Object.defineProperty(window,'localStorage',{configurable:true,get:()=>scoped});
  if(window.BroadcastChannel){const Channel=window.BroadcastChannel;window.BroadcastChannel=class extends Channel{constructor(name){super(prefix+String(name));}};}
 }
 function controls(){
  if(!document.body)return;
  for(const el of document.querySelectorAll('input,textarea')){
   if(['file','checkbox','radio','range'].includes(el.type)){if(!el.disabled)el.disabled=true;}
   else if(!el.readOnly)el.readOnly=true;
  }
  document.querySelectorAll('button,select,[contenteditable=true]').forEach(el=>{
   if(el.matches('[contenteditable]'))el.contentEditable='false';else if(!el.disabled)el.disabled=true;
  });
 }
 function observeControls(){
  if(!document.body)return;
  controlObserver ||= new MutationObserver(()=>{if(stopped)controls();});
  // Attribute observation starts only after expiry. A late menu finally may
  // remove disabled/readOnly without inserting any new DOM. Reapply the same
  // read-only state without replacing editors or their exact File objects.
  controlObserver.observe(document.body,{childList:true,subtree:true,...(stopped?{attributes:true,attributeFilter:['disabled','readonly','contenteditable']}:{})});
 }
 function banner(){
  if(window.top!==window.self||!document.body)return;
  let el=document.getElementById('expo-runtime-status');
  if(!el){el=document.createElement('aside');el.id='expo-runtime-status';el.setAttribute('role','status');
   el.style.cssText='position:sticky;top:0;background:#ecfdf5;color:#065f46;padding:.6rem 1rem;text-align:center;font:14px/1.5 system-ui;z-index:2147483647';
   document.body.prepend(el);}
  el.textContent=stopped?'체험을 마쳤어요. 작성 중인 내용은 화면에서 확인할 수 있어요.':verified?'🌱 나만의 ERP 체험 · 알림은 시연 표시로 대신해요.':'체험 공간을 확인하고 있어요…';
 }
 function stop(){
  if(stopped)return;stopped=true;verified=false;finish(false);
  for(const client of clients)client.auth?.stopAutoRefresh?.();
  window.ContributionCertPreview?.clear();
  window.CoopDialog?.cancelAll(window);banner();controls();observeControls();
  // Relay through each registered direct parent. A grandchild preview is not
  // a direct iframe of the shell, so sending only to top would be ignored.
  if(window.parent!==window.self)window.parent.postMessage({type:'erp-expo-ended'},location.origin);
  for(const frame of document.querySelectorAll('iframe'))frame.contentWindow?.postMessage({type:'erp-expo-ended'},location.origin);
 }
 const unavailable=()=>Response.json({code:'PT403',message:stopped?'DEMO_ACCESS_ENDED':'DEMO_CONTEXT_CHANGED'},{status:403});
 window.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  // Same verified public font bytes, fixed release and integrity. No arbitrary proxy or credentials.
  if(url.href==='https://raw.githubusercontent.com/orioncactus/pretendard/master/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf')
   return nativeFetch('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf',{
    credentials:'omit',redirect:'error',integrity:'sha384-xW61Q4J1NZyAOyvEFjblIB+1uEsV+n+5ChHAPwpsxpYIKS/9FsIGDRmBcuO1ING/'});
  if(url.origin!==project||!/^\/(rest|storage|functions)\/v1\//.test(url.pathname))return nativeFetch(input,init);
  if(!uuid.test(workspace)||stopped)return unavailable();
  // This diagnostic/access RPC is the only read allowed before authentication
  // verification. The server returns no business rows or credentials from it.
  const access=url.pathname==='/rest/v1/rpc/erp_demo_access';
  if(!access&&!verified&&!(await readiness))return unavailable();
  const request=new Request(input,init),headers=new Headers(request.headers);
  headers.set('x-client-info','expo-workspace/'+workspace+' '+(headers.get('x-client-info')||'erp-expo'));
  headers.set('x-public-host',location.hostname);
  if(member)headers.delete('x-erp-host');else headers.set('x-erp-host',location.hostname);
  const result=await nativeFetch(new Request(request,{headers}));
  // A lease may be closed before the cached expiry. Only the server's exact
  // demo boundary errors end the workspace; ordinary per-menu denials do not.
  if(result.status===403&&url.pathname.startsWith('/rest/v1/')){
   try{const failure=await result.clone().json();
    if(failure.code==='PT403'&&['DEMO_ACCESS_ENDED','DEMO_CONTEXT_CHANGED'].includes(failure.message))stop();
   }catch{}
  }
  // Bounded diagnostic metadata only. Never retain headers, URL queries,
  // request/response bodies, Auth data, file names or storage object paths.
  if(/^\/(rest|functions)\/v1\//.test(url.pathname)){
   diagnostics.push({api:url.pathname.replace(/^\/(rest|functions)\/v1\//,''),status:result.status});
   if(diagnostics.length>64)diagnostics.shift();
  }
  return result;
 };
 async function verify(client){
  if(verifying||verified||stopped)return;verifying=true;attempted.add(client);
  try{
   const {data:identity,error}=await client.auth.getUser();
   // Public branding clients intentionally have no persisted identity. Their
   // absence must not end a valid employee client on the same page.
   if(error||!identity?.user)return;
   if(identity.user.app_metadata?.erp_demo_workspace_id!==workspace){stop();return;}
   const {data:access,error:denied}=await client.rpc('erp_demo_access');
   if(denied||!access?.active||access.workspace!==workspace||access.full_runtime!==true){stop();return;}
   expires=Date.parse(access.expires_at);if(!Number.isFinite(expires)||expires<=Date.now()){stop();return;}
   verified=true;finish(true);banner();
  }catch{stop();}finally{verifying=false;
   if(!verified&&!stopped){const next=[...clients].find(candidate=>!attempted.has(candidate));if(next)void verify(next);}
  }
 }
 const unavailableAuth=async()=>({data:null,error:{code:'DEMO_ACTION_NOT_AVAILABLE',message:'계정 연결은 체험 입구에서 준비한 역할을 이용해 주세요.'}});
 const installed=new WeakSet(),attempted=new WeakSet();
 function install(client){
  if(!client?.auth||installed.has(client))return client;installed.add(client);clients.add(client);
  // Portal boot already has a verified room/profile binding. Never execute the
  // operating email/phone/social matching writer merely to open the demo.
  const originalRpc=client.rpc.bind(client);
  client.rpc=(name,args,options)=>originalRpc(name==='claim_member_profile'?'erp_expo_linked_member_context':name,args,options);
  // Do not send OTP/email or bind a visitor's real social identity from a demo.
  for(const name of ['signInWithOAuth','linkIdentity','unlinkIdentity','signInWithOtp','verifyOtp','signInWithPassword','signInWithIdToken','signInAnonymously','exchangeCodeForSession','reauthenticate','signUp','resetPasswordForEmail','updateUser'])if(typeof client.auth[name]==='function')client.auth[name]=unavailableAuth;
  client.auth.onAuthStateChange?.((event,session)=>{
   if(event==='SIGNED_OUT'||(session?.user&&session.user.app_metadata?.erp_demo_workspace_id!==workspace))queueMicrotask(stop);
   else if(session?.user&&!verified&&!verifying)queueMicrotask(()=>verify(client));
  });
  void verify(client);return client;
 }
 function intercept(name,adapt){
  let current=window[name];if(current)current=adapt(current);
  Object.defineProperty(window,name,{configurable:true,get:()=>current,set:value=>{current=adapt(value);}});
 }
 intercept('supabase',sdk=>sdk?.createClient?{...sdk,createClient(url,key,options={}){return install(sdk.createClient(url,key,{...options,auth:authOptions(options.auth)}));}}:sdk);
 intercept('CoopCheckedUploads',uploads=>uploads?.install?Object.freeze({...uploads,install(client){return install(uploads.install(client));}}):uploads);
 // A late read/write handler may request a new dialog after stop() cancelled
 // the old one. Resolve as cancellation, never create a locked overlay above
 // preserved drafts and never interpret expiry as approval.
 intercept('CoopDialog',dialog=>dialog?Object.freeze({...dialog,
  alert(...args){return stopped?Promise.resolve(false):dialog.alert(...args);},
  confirm(...args){return stopped?Promise.resolve(false):dialog.confirm(...args);},
  prompt(...args){return stopped?Promise.resolve(null):dialog.prompt(...args);},
  forOwner(owner,kind,...args){return stopped?Promise.resolve(kind==='prompt'?null:false):dialog.forOwner(owner,kind,...args);}
 }):dialog);
 let memberCertificateModule;
 intercept('MemberConfirmation',api=>api?Object.freeze({...api,async open(options){
  if(stopped||!options.isCurrent?.())return;
  try{
   memberCertificateModule ||= import('/demos/erp-expo/member_confirmation.js?v=1.0.0').catch(error=>{memberCertificateModule=null;throw error;});
   const module=await memberCertificateModule;
   if(!stopped&&options.isCurrent())return module.open({...options,generate:api.generate});
  }catch{if(!stopped&&options.isCurrent())options.notify?.('시연 확인서 도구를 불러오지 못했어요. 다시 시도해 주세요.');}
 }}):api);
 // Module-only clients can opt in without exposing Auth/session contents.
 window.ExpoRuntimeBridge=Object.freeze({install,authOptions,status:()=>({workspace,verified,stopped}),diagnostics:()=>diagnostics.map(row=>({...row}))});
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.type!=='erp-expo-ended')return;
  const ownFrame=[...document.querySelectorAll('iframe')].some(frame=>frame.contentWindow===e.source);
  if(e.source===window.parent||e.source===window.top||ownFrame)stop();
 });
 document.addEventListener('click',e=>{
  // Exhibition visitors need not supply personal documents/photos. The guided
  // private-attachment exercise remains available outside this unchanged-page
  // adapter; original menu file controls show the feature instead of uploading.
  if(e.target.matches?.('input[type=file]')){
   e.preventDefault();e.stopImmediatePropagation();
   if(!stopped)void window.CoopDialog?.alert('사진·PDF·엑셀을 선택해 미리 보고 등록하는 기능이에요. 박람회에서는 준비된 예시 자료로 살펴봐 주세요.',{title:'📎 파일 첨부'});
   return;
  }
  const a=e.target.closest?.('a[href]');if(!a)return;
  const target=new URL(a.href,location.href);
  if(['https://www.yonginsolar.kr','https://erp.yonginsun.kr','https://erp.yonginsolar.kr','https://erp.hcrec.kr'].includes(target.origin)){
   e.preventDefault();void window.CoopDialog?.alert('체험 화면의 메뉴에서 업무를 선택해 주세요.');
  }
 },true);
 document.addEventListener('drop',e=>{
  if(!e.dataTransfer?.files?.length)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!stopped)void window.CoopDialog?.alert('박람회에서는 준비된 예시 자료로 파일 첨부 기능을 살펴봐 주세요.',{title:'📎 파일 첨부'});
 },true);
 document.addEventListener('DOMContentLoaded',()=>{banner();if(stopped)controls();
  observeControls();
 },{once:true});
 if(!uuid.test(workspace))stop();
 setTimeout(()=>{if(!verified)stop();},15000);
 setInterval(()=>{if(expires&&Date.now()>=expires)stop();},1000);
})();
