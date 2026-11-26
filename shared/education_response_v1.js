(function () {
  'use strict';
  const find=id=>document.getElementById(id);
  const qs=new URLSearchParams(location.search), purpose=qs.get('purpose'), token=qs.get('qr');
  const status=find('publicStatus'), retry=find('retryContext'), member=find('memberArea');
  const guest=find('guestForm'), feedback=find('feedbackForm');
  const memberSubmit=find('memberSubmit'), login=find('memberSignIn'), loginHint=find('memberSignInHint');
  const controls=[...document.querySelectorAll('button,input,textarea,select')].filter(el=>el!==retry);
  let version=0, working=false, completed=false, open=false, receipt=null;
  const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const application=purpose==='application';
  if ((!application && purpose!=='feedback') || !valid.test(token||'')) {
    status.textContent='사용할 수 없는 QR입니다.';
    return;
  }
  const publicHost=window.CoopRouteGuard?.getPublicRuntimeHost?.(location) || location.hostname;
  const db=window.supabase?.createClient(
    'https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',
    {global:{headers:{'x-public-host':publicHost}},auth:{persistSession:application,autoRefreshToken:application,detectSessionInUrl:false}}
  );
  if (!db) {status.textContent='화면을 열지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.';return;}
  const formatter=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'long',timeStyle:'short'});
  const formatted=value=>value?formatter.format(new Date(value)):'';
  find('purposeLabel').textContent=application?'교육 사전 신청':'교육 익명 피드백';
  const messages={
    INVALID:'사용할 수 없는 QR입니다.', CLOSED:'사전 신청이 마감됐습니다.', NOT_OPEN:'교육이 끝난 뒤 피드백을 남길 수 있습니다.',
    GUEST_NOT_ALLOWED:'이 교육은 비조합원 사전 신청을 받지 않습니다.', LOGIN_REQUIRED:'이 조합의 조합원 계정으로 로그인해 주세요.',
    CONSENT_REQUIRED:'나이 확인과 개인정보 수집 동의가 필요합니다.', INVALID_INPUT:'입력한 내용을 다시 확인해 주세요.'
  };
  const hide=()=>{member.hidden=guest.hidden=feedback.hidden=true;};
  async function request(action,fields={}) {
    const {data,error}=await db.rpc('education_flow_public_v1',{p_purpose:purpose,p_action:action,p_token:token,p_fields:fields});
    if(error || !data?.status)throw new Error('EDUCATION_RESPONSE_UNCONFIRMED');
    return data;
  }
  async function load(message='') {
    if(completed||working)return;
    const requestVersion=++version;
    retry.hidden=true;open=false;
    try {
      const data=await request('context');
      if(requestVersion!==version || completed)return;
      if(data.title) {
        find('workshopTitle').textContent=data.title;
        const address=[data.location,data.address_detail].filter(Boolean).join(' ');
        const meta=find('workshopMeta');
        meta.textContent=[formatted(data.starts_at),address].filter(Boolean).join(' · ');
        meta.hidden=!meta.textContent;
        const details=find('workshopDetails');
        details.textContent=application?[data.instructor&&`강사: ${data.instructor}`,data.instructor_profile,data.education_content].filter(Boolean).join('\n'):'';
        details.hidden=!details.textContent;
      }
      hide();
      if(data.status!=='OPEN') {status.textContent=messages[data.status]||messages.INVALID;retry.hidden=data.status!=='NOT_OPEN';return;}
      open=true;status.textContent=message;
      if(application){
        member.hidden=false;memberSubmit.hidden=!data.member_can_apply;
        login.hidden=loginHint.hidden=!!data.member_can_apply;
        guest.hidden=!data.guest_registration || !!data.member_can_apply;
        if (!data.guest_registration && !data.member_can_apply && !message) status.textContent=messages.GUEST_NOT_ALLOWED;
      }else feedback.hidden=false;
    }catch(_){
      if(requestVersion!==version||completed)return;
      hide();retry.hidden=false;status.textContent='QR을 확인하지 못했습니다. 다시 시도해 주세요.';
    }
  }
  async function submit(action,fields) {
    if(!open||working||completed)return;
    working=true;++version;
    for(const input of controls)input.disabled=true;
    status.textContent='전송 중입니다.';
    let reload='';
    try{
      const data=await request(action,fields);
      if(data.status==='RECEIVED'){
        completed=true;open=false;hide();
        status.textContent=application?'사전 신청을 접수했습니다. 현장 출석은 별도 QR로 해 주세요.':'익명 피드백을 받았습니다.';
        if(action==='guest')guest.reset();
        if(!application)feedback.reset();
      }else{
        reload=messages[data.status]||'접수하지 못했습니다. 다시 확인해 주세요.';
        status.textContent=reload;
      }
    }catch(_){
      status.textContent='접수 결과를 확인하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.';
    }finally{
      working=false;
      if(!completed){for(const input of controls)input.disabled=false;if(reload)void load(reload);}
    }
  }
  retry.onclick=()=>void load();
  memberSubmit.onclick=()=>void submit('member',{});
  guest.onsubmit=event=>{
    event.preventDefault();
    if(guest.hidden)return;
    void submit('guest',{name:find('guestName').value,phone:find('guestPhone').value,age_confirmed:find('guestAge').checked,
      consent:find('guestConsent').checked,consent_version:'education-application-v1'});
  };
  feedback.onsubmit=event=>{
    event.preventDefault();
    if(feedback.hidden)return;
    if(!receipt)receipt=crypto.randomUUID();
    void submit('submit',{rating:Number(find('feedbackRating').value),comment:find('feedbackComment').value,receipt});
  };
  if(application){
    db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>void load(),0);});
    login.onclick=()=>{window.addEventListener('focus',()=>void load(),{once:true});};
  }
  void load();
})();
