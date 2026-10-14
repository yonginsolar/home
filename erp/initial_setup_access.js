/* v1.1.3 — Read current grant status whenever the card is reopened. */
(function(root){
 'use strict';
 const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'—';
 const message=e=>e?.message==='INITIAL_SETUP_COMPLETED'?'조합의 초기 설정이 완료되어 새 권한을 부여할 수 없습니다.':e?.code==='PT409'?'다른 변경이 있습니다. 현황을 다시 확인해 주세요.':e?.code==='42501'?'권한이 없거나 초기 설정 기간이 종료되었습니다. 입력한 내용은 그대로 유지됩니다.':e?.code==='22023'?'직원의 현재 권한·계정 연결과 입력 내용을 확인해 주세요.':'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.';
 async function rpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
 function mount(client,container){
  if(!container)return;if(container.setupController)return container.setupController;
  container.innerHTML='<details class="card p-3 mb-4"><summary class="fw-bold">초기 설정 권한</summary><p class="mt-3 mb-2">직원에게 결재 없이 최대 30일의 초기 설정 권한을 부여합니다. 만료·회수해도 기존 권한과 입력한 자료는 유지됩니다.</p><div class="row g-3 my-3"><section class="col-md-6 d-flex" data-setup-scope="allowed" aria-labelledby="initialSetupAllowedHeading"><div class="w-100 border border-success-subtle rounded-3 p-3 bg-success-subtle text-dark"><h2 class="h6 fw-bold" id="initialSetupAllowedHeading">설정할 수 있는 범위</h2><ul class="mb-0 ps-3" style="line-height:1.8"><li>홈페이지·가입 안내·약관</li><li>조합 기본정보·로고·파비콘</li><li>출자 기준</li><li>계정과목 추가</li></ul></div></section><section class="col-md-6 d-flex" data-setup-scope="excluded" aria-labelledby="initialSetupExcludedHeading"><div class="w-100 border rounded-3 p-3 bg-light text-dark"><h2 class="h6 fw-bold" id="initialSetupExcludedHeading">이번 권한으로 추가되지 않는 업무</h2><ul class="mb-0 ps-3" style="line-height:1.8"><li>직원·급여·근로계약 관리</li><li>회계 전표 조회·처리</li><li>다른 사람의 권한 변경·재위임</li><li>전자서명·알림 발송</li><li>통합관리자 업무</li></ul></div></section></div><p class="small text-muted">기존에 가진 업무 권한은 그대로 유지됩니다. 꺼둔 기능이나 차단한 업무는 사용할 수 없습니다.</p><div id="initialSetupNotice" role="status"></div><div id="initialSetupGrantFields"><div class="row g-3"><div class="col-md-7"><label for="initialSetupEmployee" class="form-label">권한 받을 사람</label><select id="initialSetupEmployee" class="form-select" data-erp-query-control><option value="">직원 선택</option></select></div><div class="col-md-5"><label for="initialSetupDays" class="form-label">사용 기간 (일)</label><input id="initialSetupDays" type="number" min="1" max="30" value="30" class="form-control" data-erp-query-control></div></div><div id="initialSetupState" class="mt-3"></div><button type="button" class="btn btn-primary mt-3" id="initialSetupGrant">권한 부여</button></div><div class="d-flex gap-2 mt-3 flex-wrap"><button type="button" class="btn btn-outline-secondary" id="initialSetupRefresh">현황 확인</button><button type="button" class="btn btn-outline-success" id="initialSetupComplete">조합 초기 설정 완료</button></div><h2 class="h6 fw-bold mt-4">부여 현황</h2><div id="initialSetupCurrent"></div></details>';
  const $=id=>container.querySelector('#'+id);let employees=[],known=false,busy=false,completed=false,revision=0,pending=null,generation=0;
  const selected=()=>employees.find(e=>e.emp_id===$('initialSetupEmployee').value&&e.eligible===true);
  function paint(){
   const e=selected();$('initialSetupGrantFields').hidden=completed||!known;
   $('initialSetupGrant').disabled=busy||!known||completed||!e?.connected;
   $('initialSetupComplete').hidden=completed;$('initialSetupComplete').disabled=busy||!known;
   $('initialSetupRefresh').disabled=busy;$('initialSetupEmployee').disabled=$('initialSetupDays').disabled=busy||!known;
   for(const b of $('initialSetupCurrent').querySelectorAll('button'))b.disabled=busy||!known;
   $('initialSetupState').textContent=e?'선택한 직원에게 필요한 초기 설정 권한만 추가합니다.':'직원을 선택해 주세요.';
   $('initialSetupNotice').textContent=!known?'현황을 확인해 주세요.':completed?'조합 초기 설정 완료 · 새 권한 부여는 종료되었습니다. 기존 권한은 기한까지 유지되며 조기 회수할 수 있습니다.':employees.some(e=>e.eligible)?'':'현재 새 권한을 부여할 대상이 없습니다.';
   $('initialSetupCurrent').hidden=!known;
  }
  function render(){
   const choice=$('initialSetupEmployee').value,select=$('initialSetupEmployee');select.replaceChildren(new Option('직원 선택',''));
   for(const e of employees.filter(e=>e.eligible===true))select.add(new Option(e.name+(e.position?' · '+e.position:''),e.emp_id));
   select.value=employees.some(e=>e.emp_id===choice&&e.eligible===true)?choice:'';
   const list=$('initialSetupCurrent');list.replaceChildren();
   for(const e of employees.filter(e=>e.revision>0)){
    const row=document.createElement('div');row.className='d-flex align-items-center justify-content-between border rounded p-3 mb-2 gap-3 flex-wrap';
    const info=document.createElement('span');info.textContent=e.name+' · '+(e.active?'사용 중 · 만료: '+date(e.expires_at):e.revoked_at?'회수됨 · '+date(e.revoked_at):'기간 종료 · '+date(e.expires_at));row.append(info);
    if(e.active===true&&!e.revoked_at){const b=document.createElement('button');b.type='button';b.className='btn btn-outline-danger btn-sm';b.textContent='조기 회수';b.addEventListener('click',()=>void mutate('revoke',e));row.append(b);}list.append(row);
   }
   if(!list.childElementCount)list.textContent='부여된 초기 설정 권한이 없습니다.';
  }
  async function refresh(){
   if(busy)return;busy=true;paint();const epoch=generation;
   try{const v=await rpc(client,'erp_initial_setup_manage',{p_action:'list'});if(epoch!==generation)return;employees=v.employees||[];completed=v.completed===true;revision=v.completion_revision||0;known=true;render();}
   catch(e){known=false;await root.CoopDialog.alert(message(e));}finally{busy=false;paint();}
  }
  async function mutate(action,target){
   if(busy||!known)return;const e=target||selected(),days=Number($('initialSetupDays').value);
   if(action!=='complete'&&!e)return;if(action==='grant'&&(completed||!e.eligible||!e.connected))return;
   if(action==='grant'&&(!Number.isInteger(days)||days<1||days>30))return root.CoopDialog.alert('사용 기간은 1~30일로 입력해 주세요.');
   const args=action==='complete'?{p_expected_revision:revision}:{p_action:action,p_emp_id:e.emp_id,p_days:action==='revoke'?30:days,p_expected_revision:e.revision};
   const fingerprint=JSON.stringify([action,e?.emp_id||'',action==='grant'?days:0]);
   if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,args:{...args,p_request_id:crypto.randomUUID()}};
   const request=pending.args,epoch=generation;busy=true;paint();
   try{
    const question=action==='complete'?'조합의 초기 설정을 완료할까요? 이후 새 초기 설정 권한은 부여할 수 없으며, 기존 권한과 자료·조기 회수는 유지됩니다.':action==='grant'?e.name+' 님에게 '+days+'일 동안 초기 설정 권한을 부여할까요?':e.name+' 님의 초기 설정 권한을 회수할까요? 등록한 자료와 기존 권한은 유지됩니다.';
    if(!await root.CoopDialog.confirm(question)||epoch!==generation)return;
    await rpc(client,action==='complete'?'erp_initial_setup_complete':'erp_initial_setup_manage',request);
    if(epoch!==generation)return;pending=null;
    await root.CoopDialog.alert(action==='complete'?'조합 초기 설정을 완료했습니다.':action==='grant'?'초기 설정 권한을 부여했습니다.':'초기 설정 권한을 회수했습니다.');
   }catch(e){if(['42501','22023','PT409'].includes(e.code))pending=null;await root.CoopDialog.alert(message(e));}
   finally{busy=false;paint();if(epoch===generation)await refresh();}
  }
  container.querySelector('details').addEventListener('toggle',()=>{if(container.querySelector('details').open)void refresh();});
  $('initialSetupEmployee').addEventListener('change',paint);$('initialSetupGrant').addEventListener('click',()=>void mutate('grant'));
  $('initialSetupComplete').addEventListener('click',()=>void mutate('complete'));$('initialSetupRefresh').addEventListener('click',()=>void refresh());paint();
  const controller={refresh,busy:()=>busy,invalidate(){generation++;known=false;pending=null;paint();}};container.setupController=controller;return controller;
 }
 root.ERPInitialSetupAccess=Object.freeze({mount,message});
})(window);
