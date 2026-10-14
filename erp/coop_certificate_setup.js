/* v1.0.0 — Canonical deposit guide and private seal preparation, not member issuance. */
(function(root){
 'use strict';
 const stages=new WeakMap(),types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
 function validate(file){if(!file||!types[file.type]||!file.size||file.size>5242880)throw Error('PNG·JPG·WebP 이미지, 5MB 이하 파일을 선택해 주세요.');return types[file.type];}
 async function prepare(file){
  validate(file);const image=await root.createImageBitmap(file,{imageOrientation:'from-image'});
  try{if(image.width*image.height>40000000||!image.width||!image.height)throw Error('이미지 해상도를 줄여서 선택해 주세요.');
   const ratio=Math.min(1,1024/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob||blob.type!=='image/png')throw Error('직인 표시본을 만들지 못했습니다.');return new File([blob],'display.png',{type:'image/png'});
  }finally{image.close();}
 }
 async function stage(client,coopId,file){
  if(!/^[0-9a-f-]{36}$/i.test(coopId))throw Error('조합 정보를 다시 확인해 주세요.');validate(file);
  let files=stages.get(client);if(!files){files=new WeakMap();stages.set(client,files);}let scopes=files.get(file);if(!scopes){scopes=new Map();files.set(file,scopes);}
  let entry=scopes.get(coopId);if(!entry){const prefix='company-seals/'+coopId+'/'+root.crypto.randomUUID()+'/';entry={paths:{seal_path:prefix+'display.png',seal_original_path:prefix+'original.'+validate(file)},done:new Set()};scopes.set(coopId,entry);}
  if(!entry.pending){entry.pending=(async()=>{const display=await prepare(file);for(const [key,input]of[['seal_original_path',file],['seal_path',display]]){if(entry.done.has(key))continue;const {error}=await client.storage.from('attachments').upload(entry.paths[key],input,{upsert:false,contentType:input.type,cacheControl:'3600'});if(error)throw error;entry.done.add(key);}return entry.paths;})().finally(()=>{entry.pending=null;});}
  return entry.pending;
 }
 function message(error){return error?.code==='PT409'?'다른 담당자가 설정을 변경했습니다. 입력은 유지됩니다. 최신 설정을 확인한 후 다시 저장해 주세요.':error?.code==='42501'?'이 설정을 변경할 권한이 없거나 초기 설정 기간이 종료되었습니다. 입력은 유지됩니다.':error?.code==='22023'?'은행·계좌번호·예금주 또는 선택한 직인 파일을 확인해 주세요.':'설정을 처리하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.';}
 function mount(container,{client,coopId,authorize,seal=false,checkpoint=()=>{},onSaved=()=>{}}){
  if(!container||container.certificateSetupController)return container?.certificateSetupController;
  const prefix=container.id,get=key=>container.querySelector('[data-cert="'+key+'"]');let info=null,baseline='',known=false,enabled=true,writing=false,pending=null,generation=0,preview='',previewGeneration=0;
  container.innerHTML=`<details data-cert="details"><summary class="fw-bold">${seal?'출자금 납입 안내·직인':'출자금 납입 안내'}</summary><p class="form-text mt-2">가입·추가 출자 안내에 표시할 계좌입니다. 다른 업무의 계좌는 변경하지 않습니다.</p><div data-cert="status" role="status" class="small mb-2"></div><button type="button" class="btn btn-outline-secondary btn-sm mb-3" data-cert="retry" data-erp-query-control>다시 불러오기</button><form data-cert="deposit"><div class="row g-3"><div class="col-md-4"><label class="form-label" for="${prefix}-bank">은행</label><input id="${prefix}-bank" data-cert="bank" class="form-control" maxlength="80" disabled></div><div class="col-md-4"><label class="form-label" for="${prefix}-account">계좌번호</label><input id="${prefix}-account" data-cert="account" class="form-control" inputmode="numeric" maxlength="100" disabled></div><div class="col-md-4"><label class="form-label" for="${prefix}-holder">예금주</label><input id="${prefix}-holder" data-cert="holder" class="form-control" maxlength="80" disabled></div></div><div class="d-flex gap-2 mt-3"><button class="btn btn-primary btn-sm" type="submit" disabled>납입 안내 저장</button><button class="btn btn-outline-secondary btn-sm" type="button" data-cert="cancel" disabled>입력 취소</button></div></form>${seal?`<hr><form data-cert="seal"><label class="form-label" for="${prefix}-file">조합 직인</label><input id="${prefix}-file" data-cert="file" type="file" accept="image/png,image/jpeg,image/webp" class="form-control" disabled><p class="form-text">투명 배경 PNG 권장, PNG·JPG·WebP 5MB 이하. 원본은 보존하고 출자증서에는 비율을 유지한 PNG 표시본을 사용합니다.</p><img data-cert="preview" alt="조합 직인 미리보기" hidden style="width:100px;height:100px;object-fit:contain"><p class="small" data-cert="sealStatus"></p><a data-cert="original" target="_blank" rel="noopener noreferrer" hidden>등록 원본 보기</a><div class="d-flex gap-2 mt-3"><button class="btn btn-primary btn-sm" type="submit" disabled>직인 저장</button><button class="btn btn-outline-secondary btn-sm" type="button" data-cert="sealCancel" disabled>선택 취소</button></div></form>`:''}</details>`;
  const values=()=>Object.fromEntries(['bank','account','holder'].map(k=>[k,get(k).value.trim()]));
  const signature=()=>JSON.stringify(values()),dirty=()=>!!baseline&&signature()!==baseline||!!get('file')?.files.length;
  function paint(){for(const field of container.querySelectorAll('input,form button'))field.disabled=writing||!known||!enabled;get('retry').disabled=writing||!!pending||!enabled;}
  function mark(node){checkpoint(node);root.ErpWorkspaceResume?.checkpoint(node);}
  function revoke(){previewGeneration++;if(preview)URL.revokeObjectURL(preview);preview='';if(seal){get('preview').hidden=true;get('preview').removeAttribute('src');get('original').hidden=true;get('original').removeAttribute('href');}}
  async function sealPreview(){
   if(!seal)return;revoke();const epoch=previewGeneration,file=get('file').files[0];
   if(file){preview=URL.createObjectURL(file);get('preview').src=preview;get('preview').hidden=false;get('sealStatus').textContent='저장 전 미리보기';return;}
   get('sealStatus').textContent=info?.seal_path?'등록된 직인':'등록된 직인이 없습니다.';if(!info?.seal_path)return;
   try{const {data,error}=await client.storage.from('attachments').createSignedUrl(info.seal_path,300);if(epoch!==previewGeneration||!enabled)return;if(error)throw error;get('preview').src=data.signedUrl;get('preview').hidden=false;
    get('original').hidden=false;get('original').href='#';
   }catch(_){if(epoch===previewGeneration)get('sealStatus').textContent='직인 미리보기를 불러오지 못했습니다. 다시 불러오기로 재시도할 수 있습니다.';}
  }
  async function load(){
   if(pending||writing||!enabled)return pending;const epoch=generation;known=false;paint();get('status').textContent='납입 안내·직인 설정을 불러오고 있습니다.';
   const request=(async()=>{let timer,abort;try{
    if(!await authorize())throw {code:'42501'};if(epoch!==generation)return;
    abort=new AbortController();const builder=client.rpc('erp_coop_certificate_setup',{p_action:'get'}),call=builder.abortSignal?builder.abortSignal(abort.signal):builder;
    const result=await Promise.race([Promise.resolve(call),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('READ_TIMEOUT'));},15000);})]);
    if(epoch!==generation)return;if(result.error)throw result.error;if(result.data.coop_id!==coopId()||!await authorize()||epoch!==generation)throw {code:'42501'};
    // A read/retry cannot overwrite a held draft or silently rebase its revision.
    const depositDirty=!!baseline&&signature()!==baseline,old=info;info={...result.data,...(depositDirty&&old?{deposit_revision:old.deposit_revision}:{}),...(get('file')?.files.length&&old?{seal_revision:old.seal_revision}:{})};
    if(!depositDirty){for(const k of ['bank','account','holder'])get(k).value=info[k]||'';baseline=signature();mark(get('deposit'));}
    known=true;get('status').textContent=depositDirty&&old.deposit_revision!==result.data.deposit_revision?'서버 설정이 변경되었습니다. 작성 중인 입력은 유지됩니다. 입력 취소를 선택하면 최신 설정을 불러올 수 있습니다.':'';void sealPreview();
   }catch(error){if(epoch===generation){known=false;get('status').textContent=message(error);}}finally{clearTimeout(timer);if(pending===request){pending=null;paint();}}})();pending=request;paint();return request;
  }
  async function save(action){
   if(writing||!known||!enabled)return;const epoch=generation;let allowed;
   try{allowed=await authorize();}catch(_){known=false;paint();return root.CoopDialog.alert('권한을 확인하지 못했습니다. 입력은 유지됩니다. 다시 불러오기로 확인해 주세요.');}
   if(!allowed||epoch!==generation){enabled=false;paint();return root.CoopDialog.alert('설정 권한이 종료되었습니다. 입력은 유지됩니다.');}
   const input=action==='save_deposit'?values():get('file')?.files[0];if(action==='save_seal'&&!input)return root.CoopDialog.alert('새 직인 파일을 선택해 주세요.');
   if(action==='save_deposit'&&Object.values(input).some(Boolean)&&(!input.bank||!input.holder||!/^[0-9 -]+$/.test(input.account)||input.account.replace(/[^0-9]/g,'').length<6))return root.CoopDialog.alert('은행·계좌번호·예금주를 모두 입력해 주세요.');
   writing=true;paint();try{
    const data=action==='save_deposit'?input:await stage(client,coopId(),input);if(epoch!==generation||!enabled)throw {code:'42501'};
    const {data:result,error}=await client.rpc('erp_coop_certificate_setup',{p_action:action,p_data:data,p_expected_revision:info[action==='save_deposit'?'deposit_revision':'seal_revision']});if(error)throw error;if(epoch!==generation)return;
    // Only checkpoint the successfully saved part; other settings remain dirty.
    if(action==='save_deposit'){info={...info,bank:result.bank,account:result.account,holder:result.holder,deposit_revision:result.deposit_revision};baseline=signature();mark(get('deposit'));}
    else {info={...info,seal_path:result.seal_path,seal_original_path:result.seal_original_path,seal_revision:result.seal_revision};if(get('file').files[0]===input)get('file').value='';mark(get('seal'));void sealPreview();}
    onSaved(action,result);get('status').textContent='저장했습니다.';
   }catch(error){if(epoch===generation){get('status').textContent=message(error);await root.CoopDialog.alert(message(error));}}
   finally{writing=false;paint();}
  }
  get('details').addEventListener('toggle',()=>{if(get('details').open&&!writing&&!dirty())void load();});get('retry').addEventListener('click',()=>void load());
  get('deposit').addEventListener('submit',event=>{event.preventDefault();void save('save_deposit');});
  get('cancel').addEventListener('click',async()=>{if(writing||!enabled)return;const epoch=generation;if(signature()!==baseline&&!await root.CoopDialog.confirm('작성한 납입 안내를 취소하고 저장된 설정을 불러올까요?'))return;if(epoch!==generation||writing||!enabled)return;for(const k of ['bank','account','holder'])get(k).value=info?.[k]||'';baseline=signature();mark(get('deposit'));void load();});
  if(seal){get('seal').addEventListener('submit',event=>{event.preventDefault();void save('save_seal');});get('file').addEventListener('change',()=>{try{if(get('file').files[0])validate(get('file').files[0]);void sealPreview();}catch(error){get('file').value='';void root.CoopDialog.alert(error.message);}});get('sealCancel').addEventListener('click',()=>{if(writing||!enabled)return;get('file').value='';mark(get('seal'));void sealPreview();});get('original').addEventListener('click',async event=>{event.preventDefault();const epoch=previewGeneration;try{if(!enabled||!known||!await authorize())return;const {data,error}=await client.storage.from('attachments').createSignedUrl(info.seal_original_path,300);if(epoch!==previewGeneration||!enabled)return;if(error)throw error;root.open(data.signedUrl,'_blank','noopener,noreferrer');}catch(_){if(epoch===previewGeneration)void root.CoopDialog.alert('원본을 열지 못했습니다. 다시 시도해 주세요.');}});}
  const controller={load,dirty,writing:()=>writing,busy:()=>writing||!!pending,setEnabled(value){enabled=value===true;if(!enabled)revoke();paint();},invalidate(){generation++;known=false;enabled=false;revoke();paint();},dispose(){generation++;revoke();}};
  container.certificateSetupController=controller;paint();return controller;
 }
 root.CoopCertificateSetup=Object.freeze({mount,prepare,stage,validate,message,version:'1.0.0'});
})(window);
