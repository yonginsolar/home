/* v1.0.1 - Reauthenticate using the current cooperative's social provider. */
(function(global) {
  'use strict';
  let context, pending, popup, socialUrl='', busy=false;
  const STORAGE_KEY='coop_export_pin_reauth';
  const el=id=>document.getElementById(id);
  const message=text=>{if(el('memberExportPinReauthMessage'))el('memberExportPinReauthMessage').textContent=text;};
  const errors={
    PIN_REAUTH_REQUIRED:'같은 계정으로 다시 인증한 뒤 PIN을 변경해 주세요.',
    PIN_RESET_EXPIRED:'인증 시간이 지났습니다. PIN 재설정을 다시 눌러 주세요.',
    PIN_RESET_RATE_LIMIT:'잠시 후 PIN 재설정을 다시 시도해 주세요.',
    PIN_REGISTERED_EMAIL_REQUIRED:'직원 정보의 이메일과 현재 로그인 계정의 이메일을 확인해 주세요.',
    PIN_LOGIN_METHOD_UNAVAILABLE:'현재 계정의 로그인 방법을 확인할 수 없습니다. 다시 로그인해 주세요.'
  };
  function fail(error) {
    const code=Object.keys(errors).find(code=>String(error?.message||'').includes(code));
    message(errors[code]||'인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  function clear() {
    pending=null;
    socialUrl='';
    el('memberExportPinSocialStart')?.classList.add('d-none');
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('coop_export_pin_return');
    el('memberExportPinOtp')?.classList.add('d-none');
    if(el('memberExportPinOtpCode'))el('memberExportPinOtpCode').value='';
    message('');
  }
  async function confirmed() {
    const {data:{user},error}=await context.client.auth.getUser();
    if(error||user?.id!==pending?.userId)throw new Error('PIN_REAUTH_REQUIRED');
    const result=await context.client.rpc('member_export_confirm_pin_reset',{p_request_id:pending.requestId});
    if(result.error)throw result.error;
    el('memberExportPinOtp')?.classList.add('d-none');
    el('memberExportPinSocialStart')?.classList.add('d-none');
    if(el('memberExportPinOtpCode'))el('memberExportPinOtpCode').value='';
    el('memberExportPinSetup')?.classList.remove('d-none');
    if(el('memberExportPinSave'))el('memberExportPinSave').disabled=false;
    message('인증을 확인했습니다. 새 PIN을 입력하고 저장해 주세요.');
    el('memberExportSecurePin')?.focus();
  }
  async function start() {
    if(busy||!context)return;
    busy=true;
    try {
      if(popup&&!popup.closed)popup.close();
      clear();
      const {data:{user},error}=await context.client.auth.getUser();
      if(error||!user)throw new Error('PIN_REAUTH_REQUIRED');
      const result=await context.client.rpc('member_export_begin_pin_reset');
      if(result.error)throw result.error;
      const info=result.data;
      pending={requestId:info.request_id,userId:user.id,email:info.email,provider:info.provider};
      sessionStorage.setItem(STORAGE_KEY,JSON.stringify({requestId:pending.requestId,userId:user.id}));
      if(info.provider==='email') {
        const options=global.CoopAuthEmail.withOtpOptions({shouldCreateUser:false});
        const sent=await context.client.auth.signInWithOtp({email:info.email,options});
        if(sent.error)throw sent.error;
        el('memberExportPinOtp').classList.remove('d-none');
        message('현재 계정의 이메일로 인증코드를 보냈습니다.');
        el('memberExportPinOtpCode').focus();
      } else {
        if(/KAKAOTALK/i.test(navigator.userAgent))throw new Error('PIN_LOGIN_METHOD_UNAVAILABLE');
        const callback=new URL('auth_callback',location.href);
        const returnUrl=new URL('member_export_pin_reauth.html',location.href);
        callback.searchParams.set('next',returnUrl.href);
        const kind=global.AuthBrokerHelper.providerKind(info.provider);
        const params=kind==='kakao'?{prompt:'login'}:{auth_type:'reauthenticate',prompt:'login'};
        socialUrl=global.AuthBrokerHelper.buildStartUrl({provider:info.provider,mode:'login',app:'erp',callback:callback.href,
          scopes:global.AuthBrokerHelper.socialScopes(info.provider,info.provider==='custom:naver'?'openid profile':undefined),queryParams:params});
        if(!socialUrl)throw new Error('PIN_LOGIN_METHOD_UNAVAILABLE');
        el('memberExportPinSocialStart').classList.remove('d-none');
        el('memberExportPinSocialStart').textContent=(kind==='kakao'?'카카오':'네이버')+'로 다시 인증';
        message('아래 버튼에서 현재 계정으로 다시 로그인해 주세요.');
      }
    } catch(error) { fail(error); }
    finally {busy=false;}
  }
  function openSocial() {
    if(!socialUrl||!pending)return;
    popup=global.open(socialUrl,'coop-pin-reauth','popup,width=520,height=720');
    if(!popup) {
      if(!global.confirm('브라우저가 인증창을 차단했습니다. 현재 화면에서 작성 중인 내용을 저장한 뒤 인증 화면으로 이동할까요?'))return;
      const current=new URL(location.href);current.searchParams.set('pin_reauth_return','1');
      sessionStorage.setItem('coop_export_pin_return',current.href);
      location.assign(socialUrl);
    }
  }
  async function verifyEmail() {
    if(busy||!pending||pending.provider!=='email')return;
    const code=String(el('memberExportPinOtpCode')?.value||'').trim();
    if(!code){message('이메일로 받은 인증코드를 입력해 주세요.');return;}
    busy=true;
    try {
      const result=await context.client.auth.verifyOtp({email:pending.email,token:code,type:'email'});
      if(result.error)throw result.error;
      await confirmed();
    } catch(error){fail(error);}finally{busy=false;}
  }
  function init(options) {
    context=options;
    global.addEventListener('message',async event=>{
      if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='coop-pin-reauth'
        ||event.data.requestId!==pending?.requestId)return;
      try{await confirmed();}catch(error){fail(error);}
    });
    if(new URL(location.href).searchParams.has('pin_reauth_return')) {
      const current=new URL(location.href);current.searchParams.delete('pin_reauth_return');
      history.replaceState(null,'',current.href);
      try{pending=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');}catch(_){pending=null;}
      if(pending)global.setTimeout(async()=>{
        try{await openExcelModal();await confirmed();}catch(error){fail(error);}
      },0);
    }
  }
  global.MemberExportPinUI=Object.freeze({init,start,openSocial,verifyEmail,clear});
})(window);
