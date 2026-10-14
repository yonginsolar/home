/* Initial setup delegation v1.0.0. Server-owned expiry; no base permission writes or notifications. */
(function(root){
 'use strict';
 const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'—';
 const message=error=>error?.code==='PT409'?'다른 변경이 있습니다. 현황을 다시 확인해 주세요.':error?.code==='42501'?'권한이 없거나 초기 설정 기간이 종료되었습니다. 입력한 내용은 그대로 유지됩니다.':error?.code==='22023'?'직원 연결 상태와 입력 내용을 확인해 주세요.':'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.';
 async function rpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
 function mount(client,container){
  if(!container||container.dataset.setupMounted)return;
  container.dataset.setupMounted='true';
  container.innerHTML='<details class="card p-3 mb-4"><summary class="fw-bold">초기 설정 권한</summary><p class="mt-3 mb-2">직원에게 결재 없이 최대 30일의 초기 설정 권한을 부여합니다. 기간이 끝나거나 회수하면 기존 권한과 등록한 자료만 유지됩니다.</p><p class="small text-muted">홈페이지·가입 안내와 약관, 조합 기본정보·로고, 출자 기준, 계정과목 설정. 직원·급여·근로계약, 전표 처리, 권한 변경, 서명·알림 발송은 포함하지 않습니다. 꺼둔 기능이나 차단한 업무는 열리지 않습니다.</p><div class="row g-3"><div class="col-md-7"><label for="initialSetupEmployee" class="form-label">권한 받을 사람</label><select id="initialSetupEmployee" class="form-select" data-erp-query-control><option value="">직원 선택</option></select></div><div class="col-md-5"><label for="initialSetupDays" class="form-label">사용 기간 (일)</label><input id="initialSetupDays" type="number" min="1" max="30" value="30" class="form-control" data-erp-query-control></div></div><div id="initialSetupState" class="mt-3" role="status"></div><div class="d-flex gap-2 mt-3 flex-wrap"><button type="button" class="btn btn-primary" id="initialSetupGrant">권한 부여</button><button type="button" class="btn btn-outline-danger" id="initialSetupRevoke">조기 회수</button><button type="button" class="btn btn-outline-secondary" id="initialSetupRefresh">현황 확인</button></div></details>';
  const $=id=>container.querySelector('#'+id);let employees=[],loaded=false,busy=false,pending=null;
  const selected=()=>employees.find(e=>e.emp_id===$('initialSetupEmployee').value);
  function paint(){const e=selected();$('initialSetupGrant').disabled=busy||!e?.connected;$('initialSetupRevoke').disabled=busy||!e?.active;
   $('initialSetupState').textContent=!e?'직원을 선택해 주세요.':!e.connected?'먼저 직원이 ERP 계정을 연결해야 합니다.':e.active?'사용 중 · 만료: '+date(e.expires_at):e.revoked_at?'회수됨 · '+date(e.revoked_at):e.expires_at?'기간 종료 · '+date(e.expires_at):'부여된 초기 설정 권한이 없습니다.';}
  async function refresh(){if(busy)return;busy=true;paint();const choice=$('initialSetupEmployee').value;
   try{const value=await rpc(client,'erp_initial_setup_manage',{p_action:'list'});employees=value.employees||[];const select=$('initialSetupEmployee');select.replaceChildren(new Option('직원 선택',''));for(const e of employees)select.add(new Option(e.name+(e.position?' · '+e.position:''),e.emp_id));select.value=employees.some(e=>e.emp_id===choice)?choice:'';loaded=true;}
   catch(e){await root.CoopDialog.alert(message(e));}finally{busy=false;paint();}}
  async function mutate(action){
   if(busy)return;const e=selected();if(!e?.connected)return;const days=Number($('initialSetupDays').value);
   if(action==='grant'&&(!Number.isInteger(days)||days<1||days>30))return root.CoopDialog.alert('사용 기간은 1~30일로 입력해 주세요.');
   const args={p_action:action,p_emp_id:e.emp_id,p_days:days,p_expected_revision:e.revision};
   const fingerprint=JSON.stringify([action,e.emp_id,days]);
   if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,args:{...args,p_request_id:crypto.randomUUID()}};
   if(!await root.CoopDialog.confirm(action==='grant'?e.name+' 님에게 '+days+'일 동안 초기 설정 권한을 부여할까요?':e.name+' 님의 초기 설정 권한을 회수할까요? 등록한 자료와 기존 권한은 유지됩니다.'))return;
   busy=true;paint();$('initialSetupEmployee').disabled=$('initialSetupDays').disabled=true;
   try{await rpc(client,'erp_initial_setup_manage',pending.args);pending=null;await root.CoopDialog.alert(action==='grant'?'초기 설정 권한을 부여했습니다.':'초기 설정 권한을 회수했습니다.');}
   catch(error){if(error.code==='42501'||error.code==='22023'||error.code==='PT409')pending=null;await root.CoopDialog.alert(message(error));}
   finally{busy=false;$('initialSetupEmployee').disabled=$('initialSetupDays').disabled=false;await refresh();}
  }
  container.querySelector('details').addEventListener('toggle',()=>{if(container.querySelector('details').open&&!loaded)void refresh();});
  $('initialSetupEmployee').addEventListener('change',paint);$('initialSetupGrant').addEventListener('click',()=>void mutate('grant'));$('initialSetupRevoke').addEventListener('click',()=>void mutate('revoke'));$('initialSetupRefresh').addEventListener('click',()=>void refresh());paint();
 }
 root.ERPInitialSetupAccess=Object.freeze({mount,message});
})(window);
