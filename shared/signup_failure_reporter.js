/* v1.0.0 — Fixed signup diagnostics only; no applicant data or raw errors. */
(function(root){
 'use strict';
 const fallback={tenant:'TENANT_READ_FAILED',auth_start:'AUTH_START_FAILED',auth_return:'AUTH_SESSION_UNAVAILABLE',email_send:'EMAIL_SEND_FAILED',email_verify:'EMAIL_VERIFY_FAILED',member_lookup:'MEMBER_LOOKUP_FAILED',submit:'SIGNUP_SAVE_FAILED',runtime:'RUNTIME_ERROR'};
 const expected=new Set(['23505','EMAIL_ALREADY_EXISTS','BUSINESS_NUMBER_ALREADY_EXISTS','CORP_NUMBER_ALREADY_EXISTS','PRIVACY_CONSENT_VERSION_INVALID','PRIVACY_CONSENT_REQUIRED','RRN_NOTICE_CONFIRMATION_REQUIRED','RRN_NOTICE_VERSION_INVALID','CAPITAL_AMOUNT_INVALID','GUARDIAN_SIGNUP_REQUIRED','UNDER_14_CONTACT_OFFICE','otp_expired','otp_disabled','over_email_send_rate_limit','email_address_invalid','validation_failed','access_denied']);
 let config=null,reported=new Set(),count=0,provider='unknown',listeners=false;const handledErrors=new WeakSet();
 function kind(value){const s=String(value||'').toLowerCase();return s.includes('naver')?'naver':s.includes('kakao')?'kakao':s==='email'?'email':'unknown';}
 function codeFor(stage,error){
  try{
   const code=typeof error?.code==='string'?error.code:'',message=typeof error?.message==='string'?error.message:'';
   if(expected.has(code)||expected.has(message))return '';
   if(message==='MEMBER_TENANT_ACCESS_DENIED'||code==='MEMBER_TENANT_ACCESS_DENIED')return 'MEMBER_TENANT_ACCESS_DENIED';
   if((error?.name==='TypeError'||!code)&&/fetch|network/i.test(message))return stage==='submit'?'SIGNUP_RESULT_UNKNOWN':'NETWORK_ERROR';
   if(code==='PGRST000'||code==='PGRST001'||code==='PGRST002')return 'DATABASE_UNAVAILABLE';
  }catch{ /* Error getters must never interrupt signup. */ }
  return fallback[stage]||'';
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
 function report(stage,error,selected){
  try{
   if(!config||!Object.hasOwn(fallback,stage))return Promise.resolve(false);
   if(error&&typeof error==='object'&&handledErrors.has(error))return Promise.resolve(false);
   const code=codeFor(stage,error);if(!code)return Promise.resolve(false);
   const p=selected===undefined?provider:kind(selected),key=stage+'|'+p+'|'+code;
   if(count>=4||reported.has(key))return Promise.resolve(false);reported.add(key);count++;
   if(error&&typeof error==='object')handledErrors.add(error);
   const body=JSON.stringify({stage,provider:p,code,page:config.page,revision:config.revision});
   // Independent of the Auth SDK lock; no session or user identity is sent.
   return Promise.resolve(root.fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body,credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:AbortSignal.timeout(4000)})).then(r=>r.ok,()=>false);
  }catch{return Promise.resolve(false);}
 }
 root.CoopSignupFailure=Object.freeze({configure,setProvider,report});
})(window);
