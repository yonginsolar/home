/* v1.0.2 — Preserve own locked drafts after setup expiry; no base permission changes. */
(function(root){
 'use strict';const $=id=>document.getElementById(id);let client,runtime,status,busy=false,area='basic',identity='',generation=0,brandingReady=false,accessKnown=false;
 const loaded=new Map(),baselines=new Map();const forms={basic:'setupBasicForm',capital:'setupCapitalForm',accounts:'setupAccountForm'};
 const snapshot=id=>JSON.stringify([...$(id).elements].filter(e=>e.matches('input,select,textarea')).map(e=>[e.id,e.type==='checkbox'?e.checked:e.value.replace(e.hasAttribute('data-number-group')?/,/g:/$^/g,'')]));
 const dirty=key=>baselines.has(key)&&snapshot(forms[key])!==baselines.get(key);
 const changed=()=>busy||[...baselines.keys()].some(dirty)||!!$('set_logoFile')?.files.length||!!$('set_favicon-file')?.files.length;
 const tell=message=>root.CoopDialog.alert(message);
 root.showAlert=tell;
 async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
 function availability(){
  const active=status?.active===true;for(const el of document.querySelectorAll('form input,form select,form button,#setCompany input,#setCompany button')){const key=el.closest('[data-panel]')?.dataset.panel||'basic';el.disabled=busy||!active||!status.areas?.[key]||!baselines.has(key)||(!!el.closest('#setCompany')&&!brandingReady);}
  $('setupManager').hidden=status?.can_manage!==true;
  if(active)$('setupContent').hidden=false;
  for(const el of document.querySelectorAll('[data-area]'))el.hidden=!status?.areas?.[el.dataset.area]&&!loaded.has(el.dataset.area);
  $('setupSiteLink').hidden=!active||!status?.areas?.site;
  $('setupStatus').textContent=active?'사용 기한: '+new Date(status.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):status?.can_manage?'직원의 초기 설정 권한을 부여·회수할 수 있습니다.':'초기 설정 기간이 끝났거나 권한이 회수되었습니다. 입력한 내용은 보존되며, 새 저장은 할 수 없습니다.';
  $('setupStatus').classList.toggle('setup-expired',!active&&status?.can_manage!==true);
 }
 async function refreshAccess(){
  try{status=await rpc('erp_initial_setup_status');accessKnown=true;availability();return status.active===true||status.can_manage===true;}
  catch(e){accessKnown=false;status={active:false,areas:{}};availability();$('setupStatus').textContent='권한을 확인하지 못했습니다. 다시 확인해 주세요. 입력한 내용은 유지됩니다.';return false;}
 }
 async function load(key){
  if(loaded.has(key)||dirty(key))return;const epoch=generation,value=await rpc('erp_initial_setup_config',{p_area:key});
  if(epoch!==generation||dirty(key))return;loaded.set(key,value);
  if(key==='basic'){for(const e of $(forms.basic).querySelectorAll('[data-key]'))e.value=value.data[e.dataset.key]||'';
   baselines.set(key,snapshot(forms[key]));availability();
   const brand=await rpc('erp_coop_branding',{p_action:'get'});if(epoch!==generation)return;
   root.CoopLogoSettings.sync({logo_horizontal_url:brand.display_url,logo_original_url:brand.original_url,logo_favicon_url:brand.icon_url,logo_favicon_original_url:brand.icon_original_url,logo_favicon_custom:String(brand.icon_custom),logo_revision:brand.revision});
   brandingReady=true;
  }else if(key==='capital'){$('setupMinimum').value=Number(value.data.minimum).toLocaleString('en-US');$('setupUnit').value=Number(value.data.unit).toLocaleString('en-US');}
  else{const body=$('setupAccountRows');body.replaceChildren();for(const row of value.data){const tr=document.createElement('tr');for(const key of ['type','code','category','name']){const td=document.createElement('td');td.textContent=row[key]||'';tr.append(td);}body.append(tr);}}
  if(key!=='basic')baselines.set(key,snapshot(forms[key]));root.ErpWorkspaceResume.checkpoint($(forms[key]));availability();
 }
 async function switchArea(key){
  if(busy||(!status?.areas?.[key]&&!loaded.has(key)))return;
  area=key;for(const node of document.querySelectorAll('[data-panel]'))node.hidden=node.dataset.panel!==key;
  for(const node of document.querySelectorAll('[data-area]'))node.classList.toggle('active',node.dataset.area===key);
  try{await load(key);}catch(e){await tell(root.ERPInitialSetupAccess.message(e));}
 }
 function payload(key){
  if(key==='basic'){const data={};for(const e of $(forms.basic).querySelectorAll('[data-key]'))data[e.dataset.key]=e.value.trim();data.orgName=data.company_name;data.ceoName=data.chairman_name;return data;}
  if(key==='capital')return {minimum:$('setupMinimum').value.replace(/,/g,''),unit:$('setupUnit').value.replace(/,/g,'')};
  return {type:$('setupAccountType').value,category:$('setupAccountCategory').value.trim(),name:$('setupAccountName').value.trim(),code:$('setupAccountCode').value.trim()};
 }
 async function save(key){
  if(busy||!loaded.has(key))return;if(!await refreshAccess()||!status.areas?.[key])return tell('초기 설정 권한이 종료되었습니다. 입력한 내용은 유지됩니다.');
  if(key==='capital'&&Object.values(payload(key)).some(v=>!/^\d{1,10}$/.test(v)||Number(v)<1||Number(v)>1000000000))return tell('출자금은 1원 이상 10억 원 이하로 입력해 주세요.');
  busy=true;availability();const value=payload(key);try{
   const result=await rpc('erp_initial_setup_config',{p_area:key,p_action:'save',p_data:value,p_expected_revision:loaded.get(key).revision});
   loaded.set(key,result);if(key==='accounts'){$(forms.accounts).reset();loaded.delete(key);await load(key);}
   baselines.set(key,snapshot(forms[key]));root.ErpWorkspaceResume.checkpoint($(forms[key]));await tell('저장했습니다.');
  }catch(e){await tell(root.ERPInitialSetupAccess.message(e));}finally{busy=false;availability();}
 }
 async function brandSave(){if(busy||!await refreshAccess()||!status.areas?.basic)return;busy=true;availability();
  try{const result=await root.CoopLogoSettings.saveIfSelected(client,runtime.coop_id);if(result){root.ErpWorkspaceResume.checkpoint($('setCompany'));await tell('로고·파비콘을 저장했습니다.');}else await tell('새 파일을 선택해 주세요.');}
  catch(e){await tell(root.ERPInitialSetupAccess.message(e));}finally{busy=false;availability();}}
 document.addEventListener('DOMContentLoaded',async()=>{
  console.log('[Version] v1.0.2 | initial_setup');
  client=root.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{global:{headers:{'x-erp-host':root.CoopRouteGuard?.getErpRuntimeHost(location)||location.hostname}}});
  const gate=await root.ErpRuntimeGuard.requireUser(client,{alertFn:tell,redirectUrl:'index.html'});if(!gate.ok)return;identity=gate.authUser?.id||'';runtime=await root.ErpRuntimeGuard.getRuntime(client);
  if(!await refreshAccess())return;
  if(status.can_manage)root.ERPInitialSetupAccess.mount(client,$('setupManager'));
  for(const formKey of Object.keys(forms))$(forms[formKey]).addEventListener('submit',event=>{event.preventDefault();void save(formKey);});
  for(const button of document.querySelectorAll('[data-area]'))button.addEventListener('click',()=>void switchArea(button.dataset.area));
  $('setupBrandSave').addEventListener('click',()=>void brandSave());
  for(const id of ['setupMinimum','setupUnit'])$(id).addEventListener('input',()=>{$(id).value=$(id).value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',');});
  if(status.active)await switchArea(['basic','capital','accounts'].find(k=>status.areas[k])||'basic');
  root.ErpWorkspaceResume.register({authorize:async()=>{await refreshAccess();return accessKnown;},busy:()=>changed(),refresh:async()=>{if(!status.active||!status.areas?.[area])return;if(!dirty(area))loaded.delete(area);await load(area);}});
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(session?.user?.id&&session.user.id!==identity)){generation++;status={active:false,areas:{}};availability();}});
  setInterval(()=>{if(!document.hidden&&!busy)void refreshAccess();},45000);
 });
 root.addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
})(window);
