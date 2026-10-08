/* v1.0.1 — Capital settings in member management, with server-owned permissions. */
(function (global) {
  'use strict';
  let revision = '', busy = false, returnModal = null;
  function client() { return global._client || global._supabase || (typeof _supabase !== 'undefined' ? _supabase : null); }
  function notice(message, kind) {
    if (global.myAlert) global.myAlert(message, kind || 'error');
    else if (global.showStatus) global.showStatus(message, kind === 'success' ? 'success' : 'danger');
    else global.alert(message);
  }
  function syncDisplays(rules) {
    ['memberExportShareUnitAmount', 'member-certificate-share-unit', 'set_memberShareUnitAmount', 'member_export_share_unit_amount'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = String(rules.unit);
    });
  }
  global.refreshMemberCapitalDisplays = async function () {
    const rules = await global.CoopMemberCapital.load(client(), true);
    syncDisplays(rules);
    return rules;
  };
  function ensureModal() {
    let modal = document.getElementById('memberCapitalSettingsModal');
    if (modal) return modal;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="modal fade" id="memberCapitalSettingsModal" tabindex="-1" aria-labelledby="memberCapitalSettingsTitle" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="memberCapitalSettingsTitle">출자 기준 설정</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"><div class="mb-3"><label class="form-label" for="member-capital-minimum">최소 출자금</label><div class="input-group"><input class="form-control" type="number" id="member-capital-minimum" min="1" step="1" inputmode="numeric"><span class="input-group-text">원</span></div></div><div><label class="form-label" for="member-capital-unit">출자 1좌 금액</label><div class="input-group"><input class="form-control" type="number" id="member-capital-unit" min="1" step="1" inputmode="numeric"><span class="input-group-text">원</span></div></div></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">취소</button><button class="btn btn-primary" id="member-capital-save" onclick="saveMemberCapitalSettings()">저장</button></div></div></div></div>';
    modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    return modal;
  }
  global.openMemberCapitalSettings = async function () {
    const modal = ensureModal();
    if (!modal || busy) return;
    busy = true;
    try {
      const rules = await global.CoopMemberCapital.load(client(), true);
      revision = rules.revision;
      document.getElementById('member-capital-minimum').value = String(rules.minimum);
      document.getElementById('member-capital-unit').value = String(rules.unit);
      if (!modal.dataset.capitalReturnBound) {
        modal.addEventListener('hidden.bs.modal', () => {
          const parent = returnModal;
          returnModal = null;
          if (parent?.isConnected) global.bootstrap.Modal.getOrCreateInstance(parent).show();
        });
        modal.dataset.capitalReturnBound = '1';
      }
      const parent = document.activeElement?.closest?.('.modal.show')
        || Array.from(document.querySelectorAll('.modal.show')).filter(el => el !== modal).pop();
      if (parent && parent !== modal) {
        returnModal = parent;
        if (parent.contains(document.activeElement)) document.activeElement.blur();
        await new Promise(resolve => {
          parent.addEventListener('hidden.bs.modal', resolve, { once: true });
          global.bootstrap.Modal.getOrCreateInstance(parent).hide();
        });
      }
      global.applyAdminMemberModalLayer?.(modal);
      global.bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (_) { notice('출자 기준을 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { busy = false; }
  };
  global.saveMemberCapitalSettings = async function () {
    if (busy) return;
    const minimum = Number(document.getElementById('member-capital-minimum').value);
    const unit = Number(document.getElementById('member-capital-unit').value);
    if (![minimum, unit].every(value => Number.isSafeInteger(value) && value > 0 && value <= 1000000000)) {
      return notice('최소 출자금과 1좌 금액을 1원 이상 정수로 입력해주세요.', 'warning');
    }
    busy = true;
    const button = document.getElementById('member-capital-save');
    button.disabled = true;
    try {
      const { data, error } = await client().rpc('save_member_capital_rules', { p_minimum: minimum, p_unit: unit, p_expected_revision: revision });
      if (error) throw error;
      revision = data.revision;
      await global.refreshMemberCapitalDisplays();
      global.bootstrap.Modal.getOrCreateInstance(document.getElementById('memberCapitalSettingsModal')).hide();
      notice('출자 기준을 저장했습니다.', 'success');
    } catch (error) {
      notice(error?.message === 'CAPITAL_SETTINGS_CHANGED'
        ? '다른 관리자가 출자 기준을 변경했습니다. 설정을 다시 열어 확인해주세요.'
        : '출자 기준을 저장하지 못했습니다. 권한과 입력값을 확인해주세요.');
    } finally { busy = false; button.disabled = false; }
  };
})(window);
