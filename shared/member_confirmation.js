/* v1.3.0 — Recoverable preparation, canonical issuer/unknown-result receipt unchanged. */
(function (root) {
  'use strict';
  let busy = false;
  let activeRun = null;
  const pending = new Map();
  const messages = {
    MEMBERSHIP_ACCESS_DENIED: '본인 또는 등록된 단체 관리자의 발급 권한이 필요합니다.',
    MEMBERSHIP_NOT_CURRENT: '현재 조합원으로 확인된 경우에 발급할 수 있습니다.',
    MEMBERSHIP_INFORMATION_INCOMPLETE: '성명·조합원 번호·가입일을 확인해 주세요.',
    MEMBERSHIP_ISSUER_INCOMPLETE: '조합의 발급 정보와 직인을 확인해 주세요.',
    MEMBERSHIP_CONTEXT_CHANGED: '발급 정보가 변경되었습니다. 다시 열어 확인해 주세요.',
    MEMBERSHIP_REQUEST_CHANGED: '발급 요청을 확인하지 못했습니다. 다시 열어 확인해 주세요.',
    PDF_NOT_READY: 'PDF 출력 도구를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
  };
  function message(error) {
    return messages[error?.message] || '확인서를 준비하지 못했습니다. 다시 시도해 주세요.';
  }
  async function generate(record, sealDataUrl) {
    const s = record.snapshot;
    if (!s || !record.cert_number || !sealDataUrl || !root.jspdf?.jsPDF) throw new Error('PDF_NOT_READY');
    const doc = new root.jspdf.jsPDF('p', 'mm', 'a4');
    const font = await getCertPretendardFontBase64();
    doc.addFileToVFS('Pretendard.ttf', font); doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');doc.setFont('Pretendard');
    root.CoopCertificateTemplate.paintMembership(doc,record,sealDataUrl);
    const name=String(s.member_name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');
    return {doc,fileName:name+'_조합원확인서.pdf'};
  }
  async function read(client, name, args) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try { const request=client.rpc(name,args);return await (request.abortSignal?request.abortSignal(controller.signal):request); }
    finally {clearTimeout(timer);}
  }
  async function open({client,memberId,coopId,isCurrent,authorize,prepare,notify}) {
    if(!client || !memberId || !coopId || !isCurrent?.())return;
    const retry=()=>open({client,memberId,coopId,isCurrent,authorize,prepare,notify});
    if(busy && activeRun?.phase==='preparation' && !activeRun.preview?.isCurrent()) {
      const previous=activeRun;previous.preview?.close();
      if(activeRun===previous){activeRun=null;busy=false;}
    }
    if(busy){
      if(activeRun && !activeRun.preview?.isCurrent() && !activeRun.waiting?.isCurrent() && root.ContributionCertPreview){
        activeRun.waiting=root.ContributionCertPreview.start({title:'조합원 확인서',isCurrent});
        activeRun.waitingRetry=retry;
        activeRun.waiting.fail('발급 결과를 확인하고 있습니다.');
      }
      return;
    }
    const run={phase:'preparation',preview:null,waiting:null};
    activeRun=run;busy=true;let preview;
    try {
      let actor='';
      const requireIdentity=who=>{
        if(who.error||!who.data?.user?.id||(actor&&who.data.user.id!==actor)||!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        actor=who.data.user.id;
      };
      const check=async()=>{
        if(!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        await authorize?.();
        const [who,response]=await Promise.all([
          client.auth.getUser(),read(client,'get_member_confirmation_context',{p_member_id:memberId})
        ]);
        requireIdentity(who);
        if(response.error)throw response.error;
        if(response.data?.coop_id!==coopId||!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        return response.data;
      };
      if(!root.ContributionCertPreview)throw new Error('PDF_NOT_READY');
      let issued;
      preview=root.ContributionCertPreview.start({title:'조합원 확인서',isCurrent,onClose:()=>{
        if(run.phase==='preparation' && activeRun===run){activeRun=null;busy=false;}
      },authorize:async()=>{
        const latest=await check();
        if(issued && latest.revision!==issued.revision)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      }});
      run.preview=preview;
      let context=await preview.read(check);
      const key=actor+'|'+coopId+'|'+memberId;
      const existing=pending.get(key);
      const request=existing || {p_member_id:memberId,p_request_key:crypto.randomUUID(),p_expected_revision:context.revision};
      // The private seal is needed for HTML; font/jsPDF wait until explicit output.
      const seal=await preview.read(()=>downloadCertStorageAssetDataUrl(client,'attachments',context.snapshot.seal_path));
      if(!preview.isCurrent())return;
      // The canonical issuer rereads and locks this context, checks the expected
      // revision and current target permission. Keep fresh actor/ERP authorization
      // here, without fetching the same context immediately before that writer.
      await preview.read(()=>authorize?.());
      requireIdentity(await preview.read(()=>client.auth.getUser()));
      if(!preview.isCurrent())return;
      pending.set(key,request);
      run.phase='issuance';
      let result;
      let timer;
      try {result=await Promise.race([client.rpc('issue_member_confirmation_certificate',request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RESULT_UNKNOWN')),20000);})]);}
      catch(_){preview.fail('발급 결과를 확인하지 못했습니다. 같은 조합원을 다시 열어 확인해 주세요.');return;}
      finally{clearTimeout(timer);}
      if(result.error){
        if(result.error.code && !['500','502','503','504'].includes(String(result.error.code)) && !String(result.error.message||'').includes('Failed to fetch'))pending.delete(key);
        throw result.error;
      }
      issued=result.data;
      if(!issued?.cert_number||issued.coop_id!==coopId)throw new Error('INVALID_RESPONSE');
      pending.delete(key);
      if(!preview.isCurrent())return;
      run.phase='preparation';
      context=await preview.read(check);
      if(context.revision!==issued.revision)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      if(context.snapshot.seal_path!==issued.snapshot.seal_path)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      const record={...issued,snapshot:{...issued.snapshot}};
      const element=root.ContributionCertPreview.documentPreview({kind:'membership',record,sealDataUrl:seal});
      await preview.presentHtml({element,createPdf:async()=>{
        if(!preview.isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        if(prepare)await prepare();else await ensureCertPdfReady();
        if(!preview.isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        return generate(record,seal);
      }});
    }catch(error){
      if(preview?.isCurrent()) {
        if(error?.code==='CERTIFICATE_PREPARATION_TIMEOUT')preview.fail('증명서 준비가 지연되고 있습니다. 다시 확인해 주세요.',{retry});
        else preview.fail(message(error));
      }else if(!preview && isCurrent())notify?.(message(error));
    }
    finally{
      if(activeRun===run){activeRun=null;busy=false;}
      run.waiting?.fail('발급 상태를 다시 확인해 주세요.',{retry:run.waitingRetry});
    }
  }
  root.MemberConfirmation=Object.freeze({open,generate});
})(window);
