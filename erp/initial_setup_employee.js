/* v1.0.1 — Refresh only delegation metadata on an authorized HR return. */
(function(root){
 'use strict';
 async function status(client){const {data,error}=await client.rpc('erp_initial_setup_status');if(error)throw error;return data;}
 async function refresh(client,runtime){
  const box=document.getElementById('employeeInitialSetupAccess');
  if(!box)return;
  try{const s=runtime?.initial_setup||await status(client);box.hidden=s.can_manage!==true;
   if(s.can_manage){const controller=root.ERPInitialSetupAccess.mount(client,box);if(box.querySelector('details').open&&!controller.busy())await controller.refresh();}
   else box.setupController?.invalidate();
   const link=document.getElementById('employeeSetupWorkLink');if(link)link.hidden=s.active!==true;
  }catch(_){box.setupController?.invalidate();box.hidden=true;}
 }
 const attach=client=>refresh(client);
 const busy=()=>document.getElementById('employeeInitialSetupAccess')?.setupController?.busy()===true;
 async function boot(client){
  if(new URLSearchParams(location.search).get('section')!=='initial_setup')return false;
  const box=document.getElementById('hrInitialSetupOnly');
  let controller,owner='';
  try{
   const gate=await root.ErpRuntimeGuard.requireUser(client,{alertFn:root.CoopDialog.alert,redirectUrl:'index.html'});
   if(!gate.ok)return true;owner=gate.authUser?.id||'';
   const s=await status(client);if(s.can_manage!==true)throw Error('SETUP_MANAGE_DENIED');
   document.getElementById('hrLoadingScreen').classList.add('hidden');box.classList.remove('hidden');
   controller=root.ERPInitialSetupAccess.mount(client,document.getElementById('hrInitialSetupOnlyAccess'));
   box.querySelector('details').open=true;
   root.ErpWorkspaceResume.register({authorize:async()=>{try{return (await status(client)).can_manage===true;}catch(_){controller.invalidate();box.classList.add('hidden');return false;}},busy:controller.busy,refresh:controller.refresh});
   client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(session?.user?.id&&session.user.id!==owner)){controller.invalidate();box.classList.add('hidden');}});
  }catch(_){document.getElementById('hrLoadingScreen').classList.add('hidden');await root.CoopDialog.alert('초기 설정 권한 관리 권한을 확인하지 못했습니다.');}
  return true;
 }
 root.ERPInitialSetupEmployee=Object.freeze({boot,attach,refresh,busy});
})(window);
