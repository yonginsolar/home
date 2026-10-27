/* v1.0.1 — Review incoming email clearing and unique personal-to-organization linkage. */
(function(root){'use strict';
  const client=root.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{
    global:{headers:{'x-erp-host':location.hostname,'x-public-host':location.hostname}}
  });
  const $=id=>document.getElementById(id);
  let context={owner:'',coopId:'',allowed:false},controller=null,generation=0,expiryTimer=null,opening=false,knownActor='';
  const message=text=>{$('uploadStatus').textContent=text;};
  function revoke(){context={...context,allowed:false};$('openUpload').disabled=true;controller?.syncContext();}
  async function readContext(){
    const own=++generation;clearTimeout(expiryTimer);revoke();$('retryContext').disabled=true;
    message('로그인과 임시 업로드 대상을 확인하고 있습니다…');
    try{
      let authTimer;
      const result=await Promise.race([client.auth.getUser(),new Promise((_,reject)=>{authTimer=setTimeout(()=>reject(Error('AUTH_TIMEOUT')),12000);})]).finally(()=>clearTimeout(authTimer));
      if(own!==generation)return;
      const user=result.data?.user;
      if(result.error||!user){message('용인 ERP에 로그인한 뒤 접근 다시 확인을 눌러 주세요.');return;}
      knownActor=user.id;
      const ctl=new AbortController();let timer;
      try{
        const response=await Promise.race([
          client.rpc('temporary_member_upload',{p_action:'context'}).abortSignal(ctl.signal),
          new Promise((_,reject)=>{timer=setTimeout(()=>{ctl.abort();reject(Error('TIMEOUT'));},12000);})
        ]);
        if(own!==generation)return;
        if(response.error)throw response.error;
        const r=response.data;
        if(!r?.allowed||!r.coop_id||!r.expires_at)throw Error('CONTEXT_INVALID');
        context={owner:JSON.stringify([user.id,r.coop_id]),coopId:r.coop_id,allowed:true};
        $('uploadTarget').textContent=r.coop_name+' 명부에 등록합니다.';
        message(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(r.expires_at))+'까지 · 남은 등록 한도 '+r.remaining+'명');
        $('openUpload').disabled=false;controller?.syncContext();
        expiryTimer=setTimeout(()=>{revoke();message('임시 업로드 이용 시간이 끝났습니다.');},Math.max(0,new Date(r.expires_at).getTime()-Date.now()));
      }finally{clearTimeout(timer);}
    }catch(error){
      if(own!==generation)return;
      revoke();message(error?.code==='42501'?'이 로그인 계정에 사용할 수 있는 임시 업로드 권한이 없거나 이용 시간이 끝났습니다.':'접근 정보를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');
    }finally{if(own===generation)$('retryContext').disabled=false;}
  }
  async function openUpload(){
    if(!context.allowed||opening)return;
    const owner=context.owner;opening=true;
    try{
      const feature=await root.AdminMemberAssets.ensureMemberWorkbook();
      if(!context.allowed||owner!==context.owner)return;
      if(!controller){
        const adapter={rpc:(name,args)=>{
          if(name!=='member_workbook_admin'||args.p_coop_id!==context.coopId)throw Error('INVALID_SCOPE');
          return client.rpc('temporary_member_upload',{p_action:args.p_action,p_data:args.p_data,p_request_key:args.p_request_key});
        }};
        controller=feature.create({client:adapter,getContext:()=>context,
          ensureSpreadsheet:()=>root.AdminMemberAssets.ensureSpreadsheet(),
          normalizeMember:root.TemporaryUploadMemberTools.normalizeMemberImportRow,
          memberPayload:root.TemporaryUploadMemberTools.memberImportPayload,refresh:async()=>true});
      }
      controller.open();
      const modal=document.getElementById('memberWorkbookModal');
      modal.querySelector('#memberWorkbookTitle').textContent='회원 엑셀 등록';
      modal.querySelector('[data-sheet=members]').click();
      modal.querySelector('[data-sheet=payments]').hidden=true;
      modal.querySelector('p.small.text-muted').textContent='조합원 시트에 회원을 한 줄씩 입력하세요. 유형과 이름·단체명만 필수입니다. 파일 10MB·최대 500명까지 검사합니다.';
      const template=modal.querySelector('[data-template]');template.textContent='회원 등록 양식 다운로드';
      template.onclick=async()=>{await root.AdminMemberAssets.ensureSpreadsheet();if(!context.allowed)return;const X=root.XLSX,book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([feature.memberHeaders]),'조합원');X.writeFile(book,'회원_등록_양식.xlsx');};
      modal.querySelector('[data-help]').onclick=()=>void root.CoopDialog.alert('유형과 이름·단체명만 필수입니다. 이메일·주민번호·법인등록번호 등 없는 항목은 비워 두세요. 잘못된 형식이나 중복 식별정보가 있는 행은 검토 목록에 남습니다.\n\n이 화면에서는 명부에 새 회원을 등록합니다. 로그인 계정 연결은 별도로 확인합니다.\n\n등록 대상을 확인한 뒤 등록 버튼을 눌러 주세요.',{title:'회원 엑셀 등록'});
    }catch(error){if(owner===context.owner)message('엑셀 도구를 준비하지 못했습니다. 엑셀 선택·검토를 다시 눌러 주세요.');}
    finally{opening=false;}
  }
  $('retryContext').onclick=()=>void readContext();$('openUpload').onclick=()=>void openUpload();
  root.addEventListener('beforeunload',event=>{if(controller?.hasDraft()){event.preventDefault();event.returnValue='';}});
  client.auth.onAuthStateChange((event,session)=>{const id=session?.user?.id||'';if(event==='SIGNED_OUT'||event==='USER_UPDATED'||event==='SIGNED_IN'&&knownActor&&id!==knownActor){generation++;knownActor=id;context={owner:'',coopId:'',allowed:false};revoke();message('로그인 계정이 바뀌었습니다. 접근 다시 확인을 눌러 주세요.');}});
  void readContext();
})(window);
