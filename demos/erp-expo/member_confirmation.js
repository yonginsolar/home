/* Exhibition-only membership confirmation. No operating issuer or original seal. */
const root=window,pending=new Map();let busy=false;
const stopped=()=>!root.ExpoRuntimeBridge||root.ExpoRuntimeBridge.status().stopped;
const errors={
 PDF_NOT_READY:'PDF 출력 도구를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
 MEMBERSHIP_ACCESS_DENIED:'본인 또는 관리 권한이 있는 체험 조합원을 선택해 주세요.',
 MEMBERSHIP_NOT_CURRENT:'현재 조합원으로 확인된 경우에 준비할 수 있어요.',
 MEMBERSHIP_INFORMATION_INCOMPLETE:'성명·조합원 번호·가입일을 확인해 주세요.',
 MEMBERSHIP_CONTEXT_CHANGED:'확인서 정보가 달라졌어요. 다시 열어 확인해 주세요.'
};
async function read(client,name,args){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const call=client.rpc(name,args);return await(call.abortSignal?call.abortSignal(controller.signal):call);}finally{clearTimeout(timer);}
}
function demoSeal(){
 const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;
 const x=canvas.getContext('2d');x.strokeStyle='#b91c1c';x.lineWidth=8;x.strokeRect(10,10,220,220);
 x.fillStyle='#b91c1c';x.textAlign='center';x.font='bold 44px sans-serif';x.fillText('DEMO',120,112);x.fillText('SAMPLE',120,167);
 return canvas.toDataURL('image/png');
}
export async function open({client,memberId,coopId,isCurrent,authorize,prepare,notify,generate}){
 if(busy||stopped()||!client||!memberId||!coopId||!isCurrent?.())return;
 busy=true;let preview;
 const current=()=>!stopped()&&isCurrent();
 try{
  const identity=await client.auth.getUser();
  if(identity.error||!identity.data?.user||!current())throw Error('MEMBERSHIP_ACCESS_DENIED');
  const actor=identity.data.user.id;
  const check=async()=>{
   if(!current())throw Error('MEMBERSHIP_ACCESS_DENIED');
   await authorize?.();const who=await client.auth.getUser();
   if(who.error||who.data?.user?.id!==actor||!current())throw Error('MEMBERSHIP_ACCESS_DENIED');
   const response=await read(client,'erp_expo_get_member_confirmation',{p_member_id:memberId});
   if(response.error)throw response.error;const data=response.data;
   if(!current()||data?.verified!==true||data.simulation!==true||data.coop_id!==coopId
    ||data.workspace!==root.ExpoRuntimeBridge.status().workspace||data.snapshot?.member_id!==memberId)throw Error('MEMBERSHIP_ACCESS_DENIED');
   return data;
  };
  const context=await check();let issued;
  preview=root.ContributionCertPreview.start({title:'DEMO · 조합원 확인서',isCurrent:current,authorize:async()=>{
   const latest=await check();if(!issued||issued.revision!==latest.revision)throw Error('MEMBERSHIP_CONTEXT_CHANGED');
  }});
  try{await prepare?.();}catch{throw Error('PDF_NOT_READY');}
  if(!preview.isCurrent())return;
  if(typeof root.jspdf?.jsPDF!=='function')throw Error('PDF_NOT_READY');
  await getCertPretendardFontBase64();const seal=demoSeal();
  await check();if(!preview.isCurrent())return;
  const key=actor+'|'+coopId+'|'+memberId;
  const request=pending.get(key)||{p_member_id:memberId,p_request_key:crypto.randomUUID(),p_expected_revision:context.revision};
  pending.set(key,request);let timer,result;
  try{result=await Promise.race([client.rpc('erp_expo_issue_member_confirmation',request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RESULT_UNKNOWN')),20000);})]);}
  catch{if(preview.isCurrent())preview.fail('준비 결과를 확인하지 못했어요. 같은 조합원을 다시 열어 확인해 주세요.');return;}
  finally{clearTimeout(timer);}
  if(result.error){if(['PT400','PT403','PT409','42501','22023'].includes(String(result.error.code)))pending.delete(key);throw result.error;}
  issued=result.data;
  if(issued?.verified!==true||issued.simulation!==true||issued.coop_id!==coopId||issued.workspace!==context.workspace
   ||issued.snapshot?.member_id!==memberId||!/^DEMO-MC-[0-9]{4}-[0-9]{6}$/.test(issued.cert_number))throw Error('INVALID_RESPONSE');
  pending.delete(key);if(!preview.isCurrent())return;
  const latest=await check();if(latest.revision!==issued.revision)throw Error('MEMBERSHIP_CONTEXT_CHANGED');
  const pdf=await generate(issued,seal);
  pdf.doc.setFontSize(11);pdf.doc.setTextColor(155,35,35);
  pdf.doc.text('DEMO · 박람회 체험용 / 실제 확인서로 사용할 수 없습니다.',105,43,{align:'center'});
  pdf.fileName='DEMO_조합원확인서.pdf';
  if(preview.isCurrent())await preview.present(pdf);
 }catch(error){
  if(!current())return;
  const message=errors[error?.message]||'시연 확인서를 준비하지 못했어요. 다시 시도해 주세요.';
  if(preview?.isCurrent())preview.fail(message);else notify?.(message);
 }finally{busy=false;}
}
