/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Version: 1.0.5 | 2026-11-09. Scope designation to its nested access tab. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let selectedEmpId = '';
  let savedValue = false;
  let busy = false;
  let activeRead=null, resumeRead=null, failedRead=null, readyRead=null, viewEpoch=0;
  const owner=()=>typeof getHrSettingsOwner==='function'?getHrSettingsOwner():'';
  const revision=()=>typeof employeeDetailRevision==='number'?employeeDetailRevision:0;
  const grouped=()=>$('tabAccessGroup');
  const section=()=>grouped()?$('tabSunVillageTotalManager'):$('sunVillageTotalManagerTabNav');
  const accessTab=()=>$('sunVillageTotalManagerAccessTab');
  const visible=()=>!window.frameElement?.hidden&&(!grouped()||isEmployeeDetailTabVisible('tabAccessGroup'));
  const editorVisible=()=>visible()&&(!accessTab()||isEmployeeDetailTabVisible('tabSunVillageTotalManager'));
  const sameSelection=read=>read.owner===owner()&&read.revision===revision()
    &&read.empId===String(currentEmpId||'')&&read.empId===selectedEmpId;
  const owned=read=>sameSelection(read)&&(typeof isHrSettingsContextCurrent!=='function'||isHrSettingsContextCurrent(read.owner));

  function stopRead(read) {
    if(!read)return;
    clearTimeout(read.timer);read.controller?.abort();read.cancel?.();
  }

  function clearReadNotice(followFocus=false) {
    const notice=$('sunVillageTotalManagerReadNotice'),retry=$('sunVillageTotalManagerRetry');
    if(followFocus&&retry&&document.activeElement===retry&&document.hasFocus()&&visible()){
      const nav=$('sunVillageTotalManagerTabNav');
      const active=document.querySelector('#empTab .nav-link.active');
      const target=grouped()?(!section()?.hidden?(accessTab()||$('sunVillageTotalManagerHeading')):active)
        :!nav?.hidden?nav?.querySelector('a'):active?.closest('[hidden]')?document.querySelector('#empTab a[href="#tabInfo"]'):active;
      target?.focus({preventScroll:true});
    }
    if(notice){notice.hidden=true;notice.setAttribute('aria-busy','false');}
    if(retry){retry.hidden=false;retry.setAttribute('aria-disabled','false');}
  }

  function paintReadNotice(message, pending=false, retryable=true) {
    const notice=$('sunVillageTotalManagerReadNotice'),retry=$('sunVillageTotalManagerRetry');
    if(!notice||!retry)return;
    $('sunVillageTotalManagerReadMessage').textContent=message;
    notice.hidden=false;notice.setAttribute('aria-busy',String(pending));
    if(!retryable&&document.activeElement===retry&&document.hasFocus()&&!window.frameElement?.hidden)notice.focus({preventScroll:true});
    retry.hidden=!retryable;retry.setAttribute('aria-disabled',String(pending||!retryable));
  }

  function retryRead() {
    const read=failedRead;
    if(!read||!read.retryable||activeRead||!owned(read)||!visible())return;
    return load(read.empId,{retry:true});
  }

  function messageFor(error) {
    const code = String(error?.message || error || '');
    if (code.includes('LAST_TOTAL_MANAGER_REQUIRED')) return '마지막 전체 관리자는 해제할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.';
    if (code.includes('ACTIVE_LINKED_EMPLOYEE_REQUIRED')) return '재직 중이며 로그인이 연결된 직원만 지정할 수 있습니다.';
    if (code.includes('OPERATING_ADMIN_REQUIRED')) return '이 조합의 관리자만 지정할 수 있습니다.';
    return '관리자 지정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function updateSaveState() {
    const checkbox = $('sunVillageTotalManagerEnabled');
    const button = $('sunVillageTotalManagerSave');
    if (!checkbox || !button) return;
    button.disabled = busy || checkbox.disabled || checkbox.checked === savedValue;
  }
  function toggleSection(allowed) {
    const panel=section(), tab=accessTab();
    if(panel)panel.hidden=!allowed;
    if(tab){tab.hidden=!allowed;tab.disabled=!allowed;}
  }

  function select(empId) {
    viewEpoch++;
    const previous=activeRead;
    activeRead=resumeRead=failedRead=readyRead=null;
    stopRead(previous); clearReadNotice();
    selectedEmpId=String(empId||'').trim(); savedValue=false;
    const checkbox=$('sunVillageTotalManagerEnabled'),button=$('sunVillageTotalManagerSave');
    toggleSection(false);
    if(checkbox){checkbox.checked=false;checkbox.disabled=true;}
    if(button)button.disabled=true;
  }

  function ensure() {
    if(!visible()||!selectedEmpId)return;
    if(activeRead&&owned(activeRead))return;
    if(readyRead&&owned(readyRead)||failedRead&&owned(failedRead))return;
    return load(selectedEmpId,{retry:resumeRead?.retry===true});
  }

  async function load(empId, options={}) {
    const previous=activeRead;
    selectedEmpId = String(empId || '').trim();
    const read={empId:selectedEmpId,owner:owner(),revision:revision(),controller:new AbortController(),retry:options.retry===true};
    activeRead=read;resumeRead=null;failedRead=null;readyRead=null;stopRead(previous);
    if(options.retry)paintReadNotice('마을 관리자 지정 상태를 다시 확인하는 중입니다.',true);
    else clearReadNotice();
    const current=()=>activeRead===read&&owned(read)&&visible();
    const nav = section();
    const status = $('sunVillageTotalManagerStatus');
    const checkbox = $('sunVillageTotalManagerEnabled');
    const button = $('sunVillageTotalManagerSave');
    if (!nav || !status || !checkbox || !button) {activeRead=null;return;}
    toggleSection(false);
    checkbox.checked = false;
    checkbox.disabled = true;
    button.disabled = true;
    status.textContent = '지정 상태를 확인하는 중입니다.';
    // Expo rooms are standalone fictional cooperatives, never village operators.
    if (window.ExpoRuntimeBridge) {readyRead=read;activeRead=null;return;}
    if (!selectedEmpId || typeof _supabase === 'undefined'||!current()) {activeRead=null;return;}
    try {
      const cancelled=new Promise(resolve=>{read.cancel=()=>resolve(null);});
      const timeout=new Promise((_,reject)=>{read.timer=setTimeout(()=>{
        read.controller.abort();reject(new Error('MANAGER_CONTEXT_TIMEOUT'));
      },15000);});
      const request = _supabase.rpc('sun_village_total_manager_context', {
        p_emp_id: selectedEmpId
      });
      const response=await Promise.race([typeof request.abortSignal==='function'?request.abortSignal(read.controller.signal):request,timeout,cancelled]);
      if(!current()||!response)return;
      const {data,error}=response;
      if (error) {read.httpStatus=response.status;throw error;}
      if(!data||typeof data.enabled!=='boolean'||(data.enabled&&typeof data.can_assign!=='boolean'))throw new Error('MANAGER_CONTEXT_UNAVAILABLE');
      if (!current()) return;
      readyRead=read;
      if (!data?.enabled || !data?.can_assign) {clearReadNotice(options.retry);return;}
      toggleSection(true);
      savedValue = data.target_assigned === true;
      checkbox.checked = savedValue;
      checkbox.disabled = !data.target_active || !data.target_login_linked;
      status.textContent = !data.target_active
        ? '재직 중인 직원만 지정할 수 있습니다.'
        : !data.target_login_linked
          ? '이 직원의 ERP 로그인이 연결되면 지정할 수 있습니다.'
          : savedValue ? '현재 전체 관리자로 지정되어 있습니다.' : '현재 전체 관리자로 지정되지 않았습니다.';
      updateSaveState();
      if(grouped())checkpointEmployeeDetailDraft(checkbox);
      clearReadNotice(options.retry);
    } catch (error) {
      if (!current()) return;
      console.warn('Sun village manager status unavailable:', String(error?.code || 'unknown'));
      status.textContent = '지정 상태를 확인하지 못했습니다.';
      const httpStatus=Number(error?.status||read.httpStatus);
      const denied=String(error?.code||'')==='42501'||httpStatus===401||httpStatus===403;
      const limited=httpStatus===429;
      read.retryable=!denied&&!limited;failedRead=read;
      paintReadNotice(denied?'현재 권한으로 마을 관리자 지정 상태를 확인할 수 없습니다.':limited?'조회 요청이 많아 잠시 제한되었습니다. 잠시 후 직원 상세를 다시 열어 주세요.':'마을 관리자 지정 상태를 확인하지 못했습니다. 다시 확인해 주세요.',false,read.retryable);
    } finally { clearTimeout(read.timer);if(activeRead===read)activeRead=null; }
  }

  async function save() {
    const checkbox = $('sunVillageTotalManagerEnabled');
    const button = $('sunVillageTotalManagerSave');
    const status = $('sunVillageTotalManagerStatus');
    const target=readyRead, epoch=viewEpoch;
    if (!target || !owned(target) || !editorVisible() || section()?.hidden || !checkbox || !button
        || checkbox.disabled || busy || checkbox.checked === savedValue) return;
    const empId = target.empId;
    const enabled = checkbox.checked;
    const action = enabled ? '전체 관리자로 지정' : '전체 관리자에서 해제';
    busy = true;
    updateSaveState();
    try {
      const confirmed=await window.CoopDialog.confirm(`${currentEmpName || '선택한 직원'}을(를) 햇빛소득마을 ${action}할까요?`);
      if (!confirmed || target!==readyRead || epoch!==viewEpoch || !owned(target) || !editorVisible()
          || checkbox.disabled || checkbox.checked!==enabled) return;
      status.textContent = '관리자 지정을 저장하는 중입니다.';
      const { data, error } = await _supabase.rpc('sun_village_set_total_manager', {
        p_emp_id: empId, p_enabled: enabled
      });
      if (error) throw error;
      if (target!==readyRead || !sameSelection(target)) return;
      savedValue = data?.target_assigned === true;
      if(checkbox.checked===enabled)checkbox.checked = savedValue;
      if(grouped())checkpointSavedEmployeeDetailTab('tabSunVillageTotalManager',new Map([[checkbox.id,savedValue]]));
      status.textContent = savedValue
        ? '전체 관리자로 지정했습니다. 햇빛소득마을 운영관리에서 마을별 관리자를 지정할 수 있습니다.'
        : '전체 관리자 지정을 해제했습니다.';
    } catch (error) {
      if(target===readyRead&&sameSelection(target))status.textContent = messageFor(error);
    } finally {
      busy = false;
      updateSaveState();
      if(grouped()&&target!==readyRead)void ensure();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sunVillageTotalManagerEnabled')?.addEventListener('change', updateSaveState);
    $('sunVillageTotalManagerSave')?.addEventListener('click', save);
    $('sunVillageTotalManagerRetry')?.addEventListener('click', retryRead);
  });
  window.SunVillageTotalManagerAdmin = { load, select, ensure,
    suspend(resume=false){
      viewEpoch++;
      const read=activeRead;resumeRead=resume?(read||resumeRead):null;activeRead=null;stopRead(read);
      if(!resume){failedRead=null;clearReadNotice();}
    },
    resume(){
      const read=resumeRead;
      if(window.frameElement?.hidden)return;
      if(!read){if(failedRead&&!owned(failedRead)){failedRead=null;clearReadNotice();}return;}
      resumeRead=null;
      if(owned(read))return load(read.empId);
    }
  };
})();
