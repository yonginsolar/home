/* ERP employee detail: appoint the operating cooperative's village manager. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let selectedEmpId = '';
  let savedValue = false;
  let busy = false;

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

  async function load(empId) {
    selectedEmpId = String(empId || '').trim();
    const nav = $('sunVillageTotalManagerTabNav');
    const status = $('sunVillageTotalManagerStatus');
    const checkbox = $('sunVillageTotalManagerEnabled');
    const button = $('sunVillageTotalManagerSave');
    if (!nav || !status || !checkbox || !button) return;
    nav.hidden = true;
    checkbox.checked = false;
    checkbox.disabled = true;
    button.disabled = true;
    status.textContent = '지정 상태를 확인하는 중입니다.';
    if (!selectedEmpId || typeof _supabase === 'undefined') return;
    try {
      const { data, error } = await _supabase.rpc('sun_village_total_manager_context', {
        p_emp_id: selectedEmpId
      });
      if (error) throw error;
      if (selectedEmpId !== String(empId || '').trim() || selectedEmpId !== String(currentEmpId || '')) return;
      if (!data?.enabled || !data?.can_assign) return;
      nav.hidden = false;
      savedValue = data.target_assigned === true;
      checkbox.checked = savedValue;
      checkbox.disabled = !data.target_active || !data.target_login_linked;
      status.textContent = !data.target_active
        ? '재직 중인 직원만 지정할 수 있습니다.'
        : !data.target_login_linked
          ? '이 직원의 ERP 로그인이 연결되면 지정할 수 있습니다.'
          : savedValue ? '현재 전체 관리자로 지정되어 있습니다.' : '현재 전체 관리자로 지정되지 않았습니다.';
      updateSaveState();
    } catch (error) {
      console.warn('Sun village manager status unavailable:', String(error?.code || 'unknown'));
      status.textContent = '지정 상태를 확인하지 못했습니다.';
    }
  }

  async function save() {
    const checkbox = $('sunVillageTotalManagerEnabled');
    const button = $('sunVillageTotalManagerSave');
    const status = $('sunVillageTotalManagerStatus');
    if (!selectedEmpId || !checkbox || !button || busy || checkbox.checked === savedValue) return;
    const empId = selectedEmpId;
    const enabled = checkbox.checked;
    const action = enabled ? '전체 관리자로 지정' : '전체 관리자에서 해제';
    if (!window.confirm(`${currentEmpName || '선택한 직원'}을(를) 햇빛소득마을 ${action}할까요?`)) {
      checkbox.checked = savedValue;
      updateSaveState();
      return;
    }
    busy = true;
    updateSaveState();
    status.textContent = '관리자 지정을 저장하는 중입니다.';
    try {
      const { data, error } = await _supabase.rpc('sun_village_set_total_manager', {
        p_emp_id: empId, p_enabled: enabled
      });
      if (error) throw error;
      if (selectedEmpId !== empId) return;
      savedValue = data?.target_assigned === true;
      checkbox.checked = savedValue;
      status.textContent = savedValue
        ? '전체 관리자로 지정했습니다. 햇빛소득마을 운영관리에서 마을별 관리자를 지정할 수 있습니다.'
        : '전체 관리자 지정을 해제했습니다.';
    } catch (error) {
      checkbox.checked = savedValue;
      status.textContent = messageFor(error);
    } finally {
      busy = false;
      updateSaveState();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sunVillageTotalManagerEnabled')?.addEventListener('change', updateSaveState);
    $('sunVillageTotalManagerSave')?.addEventListener('click', save);
  });
  window.SunVillageTotalManagerAdmin = { load };
})();
