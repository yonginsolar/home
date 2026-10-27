/* v1.1.4 — Include bounded transport evidence, never raw errors or applicant input. */
(function(root){
 'use strict';
 const fallback={tenant:'TENANT_READ_FAILED',auth_start:'AUTH_START_FAILED',auth_return:'AUTH_SESSION_UNAVAILABLE',email_send:'EMAIL_SEND_FAILED',email_verify:'EMAIL_VERIFY_FAILED',member_lookup:'MEMBER_LOOKUP_FAILED',submit:'SIGNUP_SAVE_FAILED',runtime:'RUNTIME_ERROR'};
 const operations=['unspecified','signup_context','resolve_coop','admission_policy','capital_rules','home_settings','legal_documents','page_setup','member_link','duplicate_email','duplicate_phone','signup_save','email_send','email_verify','auth_session','oauth_start','auth_callback','page_runtime'];
 const rpcOps={get_public_signup_context:'signup_context',resolve_public_signup_coop:'resolve_coop',get_public_member_admission_policy:'admission_policy',get_member_capital_rules:'capital_rules',get_public_home_settings:'home_settings',get_public_signup_documents:'legal_documents',create_public_signup_member_v5:'signup_save',create_public_signup_member_v6:'signup_save'};
 const stageOps={tenant:'unspecified',auth_start:'oauth_start',auth_return:'auth_session',email_send:'email_send',email_verify:'email_verify',member_lookup:'member_link',submit:'signup_save',runtime:'page_runtime'};
 const operationStage={signup_context:'tenant',resolve_coop:'tenant',admission_policy:'tenant',capital_rules:'tenant',home_settings:'tenant',legal_documents:'tenant',page_setup:'tenant',member_link:'member_lookup',duplicate_email:'member_lookup',duplicate_phone:'member_lookup',signup_save:'submit',email_send:'email_send',email_verify:'email_verify',auth_session:'auth_return',oauth_start:'auth_start',auth_callback:'auth_return',page_runtime:'runtime'};
 const apiCodes=new Set(['P0001','42501','23505','23502','23503','23514','22023','22P02','40001','40P01','57014','53300','08000','08001','08006','XX000','42883','42P01','42703','PGRST000','PGRST001','PGRST002','PGRST100','PGRST102','PGRST106','PGRST116','PGRST200','PGRST201','PGRST202','PGRST203','PGRST204','PGRST205','PGRST301','PGRST302','PGRST303']);
 const expected=new Set(['23505','EMAIL_ALREADY_EXISTS','BUSINESS_NUMBER_ALREADY_EXISTS','CORP_NUMBER_ALREADY_EXISTS','PRIVACY_CONSENT_VERSION_INVALID','PRIVACY_CONSENT_REQUIRED','RRN_NOTICE_CONFIRMATION_REQUIRED','RRN_NOTICE_VERSION_INVALID','CAPITAL_AMOUNT_INVALID','GUARDIAN_SIGNUP_REQUIRED','UNDER_14_CONTACT_OFFICE','otp_expired','otp_disabled','over_email_send_rate_limit','email_address_invalid','validation_failed','access_denied']);
 let config=null,count=0,provider='unknown',listeners=false;const reported=new Set(),handledErrors=new WeakSet(),metadata=new WeakMap(),observed=new WeakSet();
 const object=e=>e&&typeof e==='object';
 function chain(e){const a=[];try{for(let i=0;object(e)&&i<4&&!a.includes(e);i++,e=e.cause)a.push(e);}catch{}return a;}
 function kind(value){const s=String(value||'').toLowerCase();return s.includes('naver')?'naver':s.includes('kakao')?'kakao':s==='email'?'email':'unknown';}
 function remember(error,info){try{if(object(error))metadata.set(error,{...info,...metadata.get(error)});}catch{}return error;}
 function codeFor(stage,error){
  try{const c=chain(error),e=c.at(-1)||error,code=typeof e?.code==='string'?e.code:'',message=typeof e?.message==='string'?e.message:'';
   if(expected.has(code)||expected.has(message))return '';
   if(message==='MEMBER_TENANT_ACCESS_DENIED'||code==='MEMBER_TENANT_ACCESS_DENIED')return 'MEMBER_TENANT_ACCESS_DENIED';
   if((e?.name==='TypeError'||!code)&&/fetch|network|load failed/i.test(message))return stage==='submit'?'SIGNUP_RESULT_UNKNOWN':'NETWORK_ERROR';
   if(['PGRST000','PGRST001','PGRST002'].includes(code))return 'DATABASE_UNAVAILABLE';
  }catch{}return fallback[stage]||'';
 }
 function detailFor(stage,error,extra){
  let operation=stageOps[stage]||'unspecified',reason='UNKNOWN',api_code=null,status=null,transport;
  try{const c=chain(error),e=c.at(-1)||error,info=Object.assign({},...c.map(x=>metadata.get(x)).filter(Boolean)),message=String(error?.message||''),inner=String(e?.message||'');
   if(operations.includes(info.operation))operation=info.operation;if(operations.includes(extra?.operation))operation=extra.operation;
   transport=c.map(x=>root.CoopSignupPublicReads?.details?.(x)).find(Boolean);
   if(apiCodes.has(e?.code))api_code=e.code;
   const n=Number(info.status??e?.status);if(Number.isInteger(n)&&n>=100&&n<=599)status=n;
   if(status===401)reason='UNAUTHORIZED';else if(status===403)reason='FORBIDDEN';else if(status===429)reason='RATE_LIMITED';
   else if(e?.name==='TimeoutError'||/_TIMEOUT$/.test(message)||api_code==='57014')reason='TIMEOUT';
   else if(e?.name==='AbortError')reason='ABORTED';
   else if(status===401)reason='UNAUTHORIZED';else if(status===403||api_code==='42501')reason='FORBIDDEN';
   else if(status===429)reason='RATE_LIMITED';else if(status!==null&&status>=500)reason='SERVER_ERROR';
   else if(api_code)reason='API_ERROR';
   else if(/fetch|network|load failed/i.test(inner))reason='NETWORK';
   else if(message==='SIGNUP_DEPENDENCY_MISSING'||inner==='SIGNUP_DEPENDENCY_MISSING')reason='SCRIPT_MISSING';
   else if(['ADMISSION_READ_FAILED','CONTEXT_SHAPE_INVALID','CAPITAL_SETTINGS_INVALID'].includes(message))reason='DATA_INVALID';
   else if(['SIGNUP_COOP_CONTEXT_MISSING','SIGNUP_COOP_NOT_FOUND'].includes(message))reason='TENANT_MISMATCH';
   else if(['ReferenceError','TypeError','SyntaxError','RangeError'].includes(e?.name))reason='CLIENT_EXECUTION';
  }catch{}return{operation,reason,api_code,status,...(transport?{transport}:{})};
 }
 function configure(value){
  if(!value||value.enabled===false)return;
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(String(value.url||''))||!String(value.key||'').startsWith('sb_publishable_')||!['signup','auth_callback'].includes(value.page)||!/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(value.revision))return;
  config={endpoint:String(value.url).replace(/\/$/,'')+'/functions/v1/signup-failure-alert',key:value.key,page:value.page,revision:value.revision};
  if(listeners)return;listeners=true;
  root.addEventListener('error',event=>{if(event.error)report(config?.page==='auth_callback'?'auth_return':'runtime',event.error);});
  root.addEventListener('unhandledrejection',event=>report(config?.page==='auth_callback'?'auth_return':'runtime',event.reason));
 }
 function setProvider(value){provider=kind(value);}
 function report(stage,error,selected,extra){
  try{
   if(!config||!Object.hasOwn(fallback,stage)||chain(error).some(e=>handledErrors.has(e)))return Promise.resolve(false);
   const detail=detailFor(stage,error,extra);stage=operationStage[detail.operation]||stage;
   const code=codeFor(stage,error);if(!code)return Promise.resolve(false);
   const p=selected===undefined?provider:kind(selected),key=[stage,p,code,detail.operation,detail.reason,detail.api_code,detail.status].join('|');
   if(count>=4||reported.has(key))return Promise.resolve(false);reported.add(key);count++;chain(error).forEach(e=>handledErrors.add(e));
   const body=JSON.stringify({stage,provider:p,code,page:config.page,revision:config.revision,...detail});
   return Promise.resolve(root.fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body,credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:AbortSignal.timeout(4000)})).then(r=>r.ok,()=>false);
  }catch{return Promise.resolve(false);}
 }
 // Observe only known RPC response metadata. Preserve the original thenable,
 // builder methods/abortSignal, and arguments; do not send RPC input values.
 function observeClient(client){
  try{if(!client||typeof client.rpc!=='function'||observed.has(client))return client;observed.add(client);const rpc=client.rpc;
   client.rpc=function(name,args){const q=rpc.apply(this,arguments);try{let operation=rpcOps[name];
    if(name==='check_duplicate_signup')operation=args?.check_field==='email'?'duplicate_email':args?.check_field==='phone'?'duplicate_phone':undefined;
    if(!operation||!q||typeof q.then!=='function')return q;const then=q.then;
    q.then=function(resolve,reject){return then.call(this,result=>{if(result?.error)remember(result.error,{operation,status:result.status});return typeof resolve==='function'?resolve(result):result;},error=>{remember(error,{operation});if(typeof reject==='function')return reject(error);throw error;});};}catch{}return q;};
  }catch{}return client;
 }
 async function preparationStep(operation,action){try{return await action();}catch(error){remember(error,{operation});report('tenant',error);throw error;}}
 function retryMessage(error){const op=detailFor('tenant',error).operation;const labels={signup_context:'가입 조합 정보',resolve_coop:'가입 조합 정보',admission_policy:'출자금 납입기한 안내',capital_rules:'출자금 입력 기준',home_settings:'가입 화면 설정',legal_documents:'가입 안내·약관',page_setup:'가입 화면'};return labels[op]?labels[op]+' 확인 중 문제가 생겼습니다. 다시 확인해 주세요.':null;}
 root.CoopSignupFailure=Object.freeze({configure,setProvider,report,observeClient,preparationStep,retryMessage});
})(window);
