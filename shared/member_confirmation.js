/* v1.0.0 — Current membership confirmation. No capital writes, notices or local data storage. */
(function (root) {
  'use strict';
  let busy = false;
  const pending = new Map();
  const messages = {
    MEMBERSHIP_ACCESS_DENIED: '본인 또는 등록된 단체 관리자의 발급 권한이 필요합니다.',
    MEMBERSHIP_NOT_CURRENT: '현재 조합원으로 확인된 경우에 발급할 수 있습니다.',
    MEMBERSHIP_INFORMATION_INCOMPLETE: '성명·조합원 번호·가입일을 확인해 주세요.',
    MEMBERSHIP_ISSUER_INCOMPLETE: '조합의 발급 정보와 직인을 확인해 주세요.',
    MEMBERSHIP_CONTEXT_CHANGED: '발급 정보가 변경되었습니다. 다시 열어 확인해 주세요.',
    MEMBERSHIP_REQUEST_CHANGED: '발급 요청을 확인하지 못했습니다. 다시 열어 확인해 주세요.'
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
    doc.setLineWidth(1);doc.rect(12,12,186,273);doc.setLineWidth(.3);doc.rect(14,14,182,269);
    doc.setFontSize(11);doc.text('발급번호  ' + record.cert_number,23,27);
    doc.setFontSize(28);doc.text('조합원 확인서',105,49,{align:'center'});
    doc.setFontSize(12);doc.text('확인 기준일  ' + formatKoreanDateLabel(s.basis_date),105,63,{align:'center'});
    let y=77;
    const row=(label,value)=>{
      doc.setFontSize(12);const lines=doc.splitTextToSize(String(value||''),116);
      const h=Math.max(13,lines.length*6+6);
      doc.rect(23,y,164,h);doc.line(62,y,62,y+h);
      doc.text(label,27,y+8);doc.text(lines,67,y+8);y+=h;
    };
    row(['단체','organization'].includes(s.member_type)?'단체명':'성명',s.member_name);
    row('조합원 번호',s.member_id);row('가입일',formatKoreanDateLabel(s.join_date));
    y+=17;doc.setFontSize(14);
    const subject=['단체','organization'].includes(s.member_type)?'위 단체는':'위 사람은';
    const statement=doc.splitTextToSize(`${subject} ${formatKoreanDateLabel(s.basis_date)} 현재 ${s.company_name}의 조합원임을 확인합니다.`,150);
    doc.text(statement,105,y,{align:'center',lineHeightFactor:1.6});y+=statement.length*8+13;
    doc.setFontSize(13);doc.text('발급일  '+formatKoreanDateLabel(s.issue_date),105,y,{align:'center'});y+=15;
    const signature=drawCertSignatureBlock(doc,{companyName:s.company_name,chairmanName:s.chairman_name,sealDataUrl},105,y,{companyFontSize:17,companyMinFontSize:13,chairmanFontSize:18,chairmanMinFontSize:14,sealWidth:22,sealLift:5,maxWidth:150});
    doc.addImage(sealDataUrl,'PNG',signature.sealX,signature.sealY,22,22);
    y=Math.max(signature.chairmanLayout.endY,signature.sealY+22)+14;
    doc.setFontSize(11);
    const footer=['사업자등록번호  '+s.business_number,'주소  '+s.address,'담당 연락처  '+s.contact];
    for(const text of footer){const lines=doc.splitTextToSize(text,164);if(y+(lines.length-1)*5.5>277)throw new Error('PDF_CONTENT_TOO_LONG');doc.text(lines,23,y);y+=lines.length*5.5+2;}
    const name=String(s.member_name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');
    return {doc,fileName:name+'_조합원확인서.pdf'};
  }
  async function read(client, name, args) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try { const request=client.rpc(name,args);return await (request.abortSignal?request.abortSignal(controller.signal):request); }
    finally {clearTimeout(timer);}
  }
  async function open({client,memberId,coopId,isCurrent,authorize,notify}) {
    if(busy || !client || !memberId || !coopId || !isCurrent?.())return;
    busy=true;let preview;
    try {
      const identity=await client.auth.getUser();
      if(identity.error || !identity.data?.user)throw new Error('MEMBERSHIP_ACCESS_DENIED');
      if(!isCurrent())return;
      const actor=identity.data.user.id;
      const check=async()=>{
        if(!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        await authorize?.();
        const who=await client.auth.getUser();
        if(who.error||who.data?.user?.id!==actor||!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        const response=await read(client,'get_member_confirmation_context',{p_member_id:memberId});
        if(response.error)throw response.error;
        if(response.data?.coop_id!==coopId||!isCurrent())throw new Error('MEMBERSHIP_ACCESS_DENIED');
        return response.data;
      };
      let context=await check();
      if(!root.ContributionCertPreview)throw new Error('PDF_NOT_READY');
      let issued;
      preview=root.ContributionCertPreview.start({title:'조합원 확인서',isCurrent,authorize:async()=>{
        const latest=await check();
        if(issued && latest.revision!==issued.revision)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      }});
      const key=actor+'|'+coopId+'|'+memberId;
      const existing=pending.get(key);
      const request=existing || {p_member_id:memberId,p_request_key:crypto.randomUUID(),p_expected_revision:context.revision};
      // Prepare the font and the existing private display seal before allocating a number.
      await getCertPretendardFontBase64();
      const seal=await downloadCertStorageAssetDataUrl(client,'attachments',context.snapshot.seal_path);
      if(!preview.isCurrent())return;
      await check();if(!preview.isCurrent())return;
      pending.set(key,request);
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
      context=await check();
      if(context.revision!==issued.revision)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      if(context.snapshot.seal_path!==issued.snapshot.seal_path)throw new Error('MEMBERSHIP_CONTEXT_CHANGED');
      const pdf=await generate(issued,seal);
      if(!preview.isCurrent())return;
      await preview.present(pdf);
    }catch(error){if(preview?.isCurrent())preview.fail(message(error));else if(!preview && isCurrent())notify?.(message(error));}
    finally{busy=false;}
  }
  root.MemberConfirmation=Object.freeze({open,generate});
})(window);
