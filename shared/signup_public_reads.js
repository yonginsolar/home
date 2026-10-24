/* v1.0.1 — Preserve received HTTP status even when the response body stalls.
 * No member lookup/save, Auth, storage, or diagnostic/notification requests.
 */
(function(root){
 'use strict';
 const names=new Set(['get_public_signup_context','resolve_public_signup_coop','get_public_member_admission_policy','get_member_capital_rules','get_public_home_settings','get_public_capital_deposit_guide','get_public_signup_documents']);
 const delayedStatuses=new Set([502,503,504,520,521,522,523,524]);
 function create({url,key,getHost}){
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!String(key).startsWith('sb_publishable_')||typeof getHost!=='function')throw Error('SIGNUP_PUBLIC_CONFIG_INVALID');
  const pending=new Map();
  const hostNow=()=>String(getHost()||'').trim().toLowerCase();
  function assertHost(host){if(!host||hostNow()!==host)throw Error('SIGNUP_COOP_CONTEXT_MISSING');}
  async function attempt(name,args,host){
   assertHost(host);const controller=new AbortController();let timer,status=null;
   try{
    // The deadline includes reading the body, not just receipt of HTTP headers.
    const request=(async()=>{
     const response=await root.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{apikey:key,'Content-Type':'application/json','x-public-host':host},body:JSON.stringify(args)});
     status=response.status;
     let value;
     try{value=await response.json();}catch(error){if(response.ok)throw error;value={message:'SIGNUP_PUBLIC_READ_FAILED'};}
     assertHost(host);
     return{data:response.ok?value:null,error:response.ok?null:(value&&typeof value==='object'?value:{message:'SIGNUP_PUBLIC_READ_FAILED'}),status:response.status,statusText:response.statusText};
    })();
    return await Promise.race([request,new Promise((_,reject)=>{timer=root.setTimeout(()=>{const error=Error('SIGNUP_PREPARATION_TIMEOUT');error.name='TimeoutError';reject(error);controller.abort();},6000);})]);
   }catch(error){
    // Preserve headers without retaining response text or applicant input.
    if(error&&typeof error==='object'&&status!==null)error.status=status;
    throw error;
   }finally{root.clearTimeout(timer);}
  }
  async function read(name,args,host){
   for(let n=0;n<2;n++){
    assertHost(host);
    try{
     const result=await attempt(name,args,host);
     if(n===0&&delayedStatuses.has(result.status)){await new Promise(resolve=>root.setTimeout(resolve,250));continue;}
     return result;
    }catch(error){
     // Only a known read may be retried. Permission, data, host and 429 failures
     // never trigger an automatic retry; writes are not part of this facade.
     const knownFailure=Number(error?.status)>=400;
     if(n!==0||knownFailure&&!delayedStatuses.has(Number(error.status))||!(error?.name==='TimeoutError'||error?.name==='TypeError'&&/fetch|network|load failed/i.test(error.message)))throw error;
     await new Promise(resolve=>root.setTimeout(resolve,250));
    }
   }
  }
  function rpc(name,args){
   if(!names.has(name))throw Error('SIGNUP_PUBLIC_READ_ONLY');
   const withCode=name==='get_public_signup_documents'||name==='resolve_public_signup_coop';
   if(withCode?(!args||Object.keys(args).length!==1||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(args.p_coop_code)):args!==undefined&&(!args||Object.keys(args).length!==0))throw Error('SIGNUP_PUBLIC_ARGUMENTS_INVALID');
   const input=withCode?{p_coop_code:args.p_coop_code}:{},host=hostNow(),id=JSON.stringify([host,name,input]);
   if(pending.has(id))return pending.get(id);
   const task=read(name,input,host).finally(()=>{if(pending.get(id)===task)pending.delete(id);});
   pending.set(id,task);return task;
  }
  return{rpc};
 }
 root.CoopSignupPublicReads=Object.freeze({create});
})(window);
