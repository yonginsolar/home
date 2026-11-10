/* v1.0.8 — Recover initial setup reads and keep draft ownership across retries. */
(function(root){
 'use strict';const $=id=>document.getElementById(id);let client,runtime,status,busy=false,area='basic',identity='',generation=0,brandingReady=false,accessKnown=false,accessPending=null,accessIssue='',ownerLost=false;
 let brandingState='idle',brandingPending=null,brandingRetryBusy=false;
 let certificateSetup;const loaded=new Map(),baselines=new Map(),confirmed=new Map(),configPending=new Map(),configNotes=new Map(),configReview=new Set();
 const forms={basic:'setupBasicForm',capital:'setupCapitalForm'},panels={basic:'setupBasic',capital:'setupCapital'};
 const snapshot=id=>JSON.stringify([...$(id).elements].filter(e=>e.matches('input,select,textarea')).map(e=>[e.id,e.type==='checkbox'?e.checked:e.value.replace(e.hasAttribute('data-number-group')?/,/g:/$^/g,'')]));
 const dirty=key=>baselines.has(key)&&snapshot(forms[key])!==baselines.get(key);
 const changed=()=>busy||certificateSetup?.dirty()||certificateSetup?.writing()||[...baselines.keys()].some(dirty)||!!$('set_logoFile')?.files.length||!!$('set_favicon-file')?.files.length;
 const tell=message=>root.CoopDialog.alert(message);
 root.showAlert=tell;
 async function rpc(name,args){const request=client.rpc(name,args);const {data,error,status:responseStatus}=await (typeof request.retry==='function'?request.retry(false):request);if(error)throw Object.assign(error,{responseStatus});return data;}
 const authorized=key=>!ownerLost&&accessKnown&&status?.active===true&&status.areas?.[key]===true;
 function availability(){
  const active=!ownerLost&&accessKnown&&status?.active===true;for(const el of document.querySelectorAll('form input,form select,form button,#setCompany input,#setCompany button')){if(el.id==='setupBrandRetry'||el.closest('#certificateSetupContainer'))continue;const key=el.closest('[data-panel]')?.dataset.panel||'basic';el.disabled=busy||!authorized(key)||!baselines.has(key)||configPending.has(key)||(!!el.closest('#setCompany')&&!brandingReady)||(el.type==='submit'&&configReview.has(key));}
  certificateSetup?.setEnabled(active&&status.areas?.basic===true&&!busy);
  $('setupBrandStatus').hidden=brandingState!=='loading'&&brandingState!=='error';
  $('setupBrandStatusText').textContent=brandingState==='loading'?'로고·파비콘 정보를 불러오고 있습니다.':brandingState==='error'?'로고·파비콘 정보를 불러오지 못했습니다. 작성 중인 내용은 그대로 유지됩니다.':'';
  $('setupBrandRetry').hidden=brandingState!=='error';$('setupBrandRetry').disabled=busy||brandingRetryBusy||!!brandingPending||!active||!status.areas?.basic||!loaded.has('basic');
  $('setupManager').hidden=true;
  if(active)$('setupContent').hidden=false;
  for(const el of document.querySelectorAll('[data-area]'))el.hidden=!status?.areas?.[el.dataset.area]&&!loaded.has(el.dataset.area);
  $('setupSiteLink').hidden=!active||!status?.areas?.site;
  $('setupLegalLink').hidden=!active||!status?.areas?.site;
  $('setupStatus').textContent=accessPending&&!accessKnown?'접속 권한을 확인하고 있습니다.':accessIssue||
   (active?'사용 기한: '+new Date(status.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):status?.can_manage?'초기 설정 권한 부여·회수는 직원 관리에서 확인하세요.':'초기 설정 기간이 끝났거나 권한이 없습니다. 입력한 내용은 보존되며, 새 저장은 할 수 없습니다.');
  $('setupStatus').classList.toggle('setup-expired',!active&&status?.can_manage!==true);
  $('setupAccessRetry').hidden=ownerLost||(!accessIssue&&active);
  $('setupAccessRetry').disabled=busy||!!accessPending;
  for(const [key,prefix] of Object.entries(panels)){
   const note=configNotes.get(key),el=$(prefix+'ReadStatus'),retry=$(prefix+'ReadRetry');
   el.hidden=!note;el.textContent=note?.text||'';
   retry.hidden=!note?.retry;retry.disabled=busy||configPending.has(key)||!authorized(key);
  }
 }
 async function refreshAccess(){
  if(ownerLost)return false;
  if(accessPending)return accessPending;
  const epoch=generation;
  const request=(async()=>{
   try{const next=await root.ERPInitialSetupAccess.read(client,'erp_initial_setup_status');if(epoch!==generation||ownerLost)return false;
    if(typeof next?.active!=='boolean')throw Error('SETUP_STATUS_INVALID');
    status=next;accessKnown=true;accessIssue='';return status.active===true||status.can_manage===true;
   }catch(_){if(epoch!==generation)return false;accessKnown=false;accessIssue='권한을 확인하지 못했습니다. 입력을 유지한 채 다시 확인할 수 있습니다.';return false;}
   finally{if(accessPending===request){accessPending=null;availability();}}
  })();accessPending=request;availability();return request;
 }
 async function loadBranding(){
  if(brandingPending)return brandingPending;
  const epoch=generation;brandingReady=false;brandingState='loading';availability();
  const request=(async()=>{
   try{const brand=await root.ERPInitialSetupAccess.read(client,'erp_coop_branding',{p_action:'get'});
    if(epoch!==generation)return;
    if(!accessKnown||!status?.active||!status.areas?.basic){brandingState='error';return;}
    root.CoopLogoSettings.sync({logo_horizontal_url:brand.display_url,logo_original_url:brand.original_url,logo_favicon_url:brand.icon_url,logo_favicon_original_url:brand.icon_original_url,logo_favicon_custom:String(brand.icon_custom),logo_revision:brand.revision});
    brandingReady=true;brandingState='ready';
   }catch(_){if(epoch===generation){brandingReady=false;brandingState='error';}}
   finally{if(brandingPending===request){brandingPending=null;availability();}}
  })();brandingPending=request;return request;
 }
 async function retryBranding(){
  if(busy||brandingRetryBusy||brandingPending||!loaded.has('basic'))return;
  const epoch=generation;brandingRetryBusy=true;availability();
  try{if(!await refreshAccess()||epoch!==generation||!status.active||!status.areas?.basic)return;await loadBranding();}
  finally{brandingRetryBusy=false;availability();}
 }
 function fieldEntries(key){
  return key==='basic'?[...$(forms[key]).querySelectorAll('[data-key]')].map(e=>[e.dataset.key,e]):
   [['minimum',$('setupMinimum')],['unit',$('setupUnit')]];
 }
 function fields(key,data){
  return Object.fromEntries(fieldEntries(key).map(([name,e])=>[name,String(data ? data[name]??'' : key==='capital'?e.value.replace(/,/g,''):e.value.trim())]));
 }
 function applyConfig(key,result,values){
  if(!result?.data||typeof result.revision!=='string'&&typeof result.revision!=='number')throw Error('SETUP_CONFIG_INVALID');
  const latest=fields(key,result.data);
  for(const [name,e] of fieldEntries(key))e.value=key==='capital'&&latest[name]!==''?Number(latest[name]).toLocaleString('en-US'):latest[name];
  baselines.set(key,snapshot(forms[key]));loaded.set(key,result);configReview.delete(key);
  for(const [name,e] of fieldEntries(key)){
   if(values[name]===latest[name])root.ErpWorkspaceResume.checkpoint(e);
   else e.value=key==='capital'?values[name].replace(/\B(?=(\d{3})+(?!\d))/g,','):values[name];
  }
  if(!dirty(key))root.ErpWorkspaceResume.checkpoint($(forms[key]));
 }
 function load(key,{refresh=false,review=false}={}){
  if(configPending.has(key))return configPending.get(key);
  if(!authorized(key)||busy||(!refresh&&loaded.has(key)))return;
  if(!review&&dirty(key))return;
  const epoch=generation,previous=loaded.get(key),draft=fields(key),wasReview=configReview.has(key);
  configNotes.set(key,{text:'설정을 불러오고 있습니다.'});
  const request=(async()=>{
   try{
    const result=await root.ERPInitialSetupAccess.read(client,'erp_initial_setup_config',{p_area:key,p_action:'get'});
    if(epoch!==generation||!authorized(key)||configPending.get(key)!==request)return;
    const latest=fields(key,result.data);
    const merge=review&&previous?root.ERPInitialSetupAccess.reconcile(fields(key,previous.data),draft,latest):{values:latest,conflicts:[]};
    if(merge.conflicts.length && !await root.CoopDialog.confirm('같은 항목이 다른 곳에서도 바뀌었습니다. 내 입력을 유지하고 최신 설정 기준으로 다시 검토할까요? 아직 저장하지 않습니다.')){
     if(epoch===generation)configNotes.set(key,{text:'내 입력을 보관했습니다. 다시 확인하기 전까지 저장하지 않습니다.',retry:true});
     return;
    }
    if(epoch!==generation||!authorized(key))return;
    applyConfig(key,result,merge.values);
    configNotes.delete(key);
    if(review&&dirty(key))configNotes.set(key,{text:'최신 설정을 확인했습니다. 남은 수정은 저장을 눌러 반영해 주세요.'});
    else if(review&&wasReview&&Object.keys(draft).every(name=>draft[name]===latest[name])){
     confirmed.set(key,snapshot(forms[key]));
     configNotes.set(key,{text:'같은 내용이 이미 반영되어 있습니다. 다시 저장하지 않습니다.'});
    }
    if(key==='basic'&&!brandingReady&&!brandingPending&&brandingState==='idle')void loadBranding();
   }catch(e){
    if(epoch===generation)configNotes.set(key,{text:e?.code==='42501'?'권한을 다시 확인해 주세요. 입력은 유지됩니다.':'설정을 불러오지 못했습니다. 입력은 유지됩니다. 다시 확인해 주세요.',retry:true});
   }finally{if(configPending.get(key)===request){configPending.delete(key);availability();}}
  })();configPending.set(key,request);availability();return request;
 }
 async function switchArea(key){
  if(busy||!Object.hasOwn(forms,key)||(!status?.areas?.[key]&&!loaded.has(key)))return;
  area=key;for(const node of document.querySelectorAll('[data-panel]'))node.hidden=node.dataset.panel!==key;
  for(const node of document.querySelectorAll('[data-area]'))node.classList.toggle('active',node.dataset.area===key);
  await load(key);
 }
 async function checkAccessAndOpen(){
  if(!await refreshAccess()||!status.active)return;
  await switchArea(status.areas?.[area]?area:['basic','capital'].find(k=>status.areas?.[k])||'basic');
 }
 async function retryConfig(key){
  if(busy||configPending.has(key)||accessPending)return;
  if(await refreshAccess()&&authorized(key))await load(key,{refresh:true,review:true});
 }
 function payload(key){
  if(key==='basic'){const data={};for(const e of $(forms.basic).querySelectorAll('[data-key]'))data[e.dataset.key]=e.value.trim();data.orgName=data.company_name;data.ceoName=data.chairman_name;return data;}
  if(key==='capital')return {minimum:$('setupMinimum').value.replace(/,/g,''),unit:$('setupUnit').value.replace(/,/g,'')};
  throw Error('INITIAL_SETUP_AREA_DENIED');
 }
 async function save(key){
  if(busy||certificateSetup?.busy()||configPending.has(key)||configReview.has(key)||!loaded.has(key)||!authorized(key))return;
  if(key==='capital'&&Object.values(payload(key)).some(v=>!/^\d{1,10}$/.test(v)||Number(v)<1||Number(v)>1000000000))return tell('출자금은 1원 이상 10억 원 이하로 입력해 주세요.');
  if(confirmed.get(key)===snapshot(forms[key])&&!dirty(key))return tell('이미 저장된 내용입니다.');
  const epoch=generation,value=payload(key);busy=true;availability();try{
   if(!await refreshAccess()||epoch!==generation||!authorized(key))return;
   const result=await rpc('erp_initial_setup_config',{p_area:key,p_action:'save',p_data:value,p_expected_revision:loaded.get(key).revision});
   if(epoch!==generation||!authorized(key))return;
   applyConfig(key,result,fields(key,result.data));confirmed.set(key,snapshot(forms[key]));configNotes.delete(key);await tell('저장했습니다.');
  }catch(e){
   if(epoch!==generation)return;
   if(e?.code==='PT409'||!e?.code||e?.responseStatus===0||e?.responseStatus===408||e?.responseStatus>=500){
    configReview.add(key);configNotes.set(key,{text:'저장 결과나 최신 설정을 확인해야 합니다. 입력은 유지됩니다. 다시 확인해 주세요.',retry:true});
   }else await tell(root.ERPInitialSetupAccess.message(e));
  }finally{busy=false;availability();}
 }
 async function brandSave(){if(busy||certificateSetup?.busy()||!brandingReady||!authorized('basic'))return;const epoch=generation;busy=true;availability();
  try{if(!await refreshAccess()||epoch!==generation||!authorized('basic'))return;const result=await root.CoopLogoSettings.saveIfSelected(client,runtime.coop_id);
   if(epoch!==generation)return;if(result){root.ErpWorkspaceResume.checkpoint($('setCompany'));await tell('로고·파비콘을 저장했습니다.');}else await tell('새 파일을 선택해 주세요.');}
  catch(e){if(epoch===generation)await tell(root.ERPInitialSetupAccess.message(e));}finally{busy=false;availability();}}
 document.addEventListener('DOMContentLoaded',async()=>{
  console.log('[Version] v1.0.8 | initial_setup');
  client=root.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{global:{headers:{'x-erp-host':root.CoopRouteGuard?.getErpRuntimeHost(location)||location.hostname}}});
  const gate=await root.ErpRuntimeGuard.requireUser(client,{alertFn:tell,redirectUrl:'index.html'});if(!gate.ok)return;identity=gate.authUser?.id||'';runtime=await root.ErpRuntimeGuard.getRuntime(client);
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(session?.user?.id&&session.user.id!==identity)){generation++;ownerLost=true;accessKnown=false;accessIssue='로그인 상태가 바뀌었습니다. 입력은 유지되며 저장하지 않습니다.';certificateSetup?.invalidate();availability();}});
  certificateSetup=root.CoopCertificateSetup?.mount($('certificateSetupContainer'),{client,coopId:()=>runtime.coop_id,authorize:async()=>await refreshAccess()&&status.active===true&&status.areas?.basic===true,seal:true});
  for(const formKey of Object.keys(forms))$(forms[formKey]).addEventListener('submit',event=>{event.preventDefault();void save(formKey);});
  for(const button of document.querySelectorAll('[data-area]'))button.addEventListener('click',()=>void switchArea(button.dataset.area));
  $('setupBrandSave').addEventListener('click',()=>void brandSave());
  $('setupBrandRetry').addEventListener('click',()=>void retryBranding());
  $('setupAccessRetry').addEventListener('click',()=>void checkAccessAndOpen());
  for(const [key,prefix] of Object.entries(panels))$(prefix+'ReadRetry').addEventListener('click',()=>void retryConfig(key));
  for(const id of ['setupMinimum','setupUnit'])$(id).addEventListener('input',()=>{$(id).value=$(id).value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',');});
  root.ErpWorkspaceResume.register({authorize:async()=>{await refreshAccess();return accessKnown;},busy:()=>changed()||certificateSetup?.busy()||brandingRetryBusy||!!brandingPending,refresh:async()=>{if(!configReview.has(area))await load(area,{refresh:true});}});
  setInterval(()=>{if(!document.hidden&&!busy&&accessKnown)void refreshAccess();},45000);
  await checkAccessAndOpen();
 });
 root.addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
})(window);
