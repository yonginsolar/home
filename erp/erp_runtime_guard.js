window.ErpRuntimeGuard = {
  showInlineAlert: function(message) {
    const text = String(message || '확인이 필요합니다.').trim() || '확인이 필요합니다.';
    try {
      const existing = document.getElementById('__erpRuntimeGuardAlert');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const alertBox = document.createElement('div');
      alertBox.id = '__erpRuntimeGuardAlert';
      alertBox.setAttribute('role', 'alert');
      alertBox.style.cssText = [
        'position:fixed',
        'top:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:99999',
        'max-width:min(92vw,420px)',
        'padding:14px 16px',
        'border-radius:14px',
        'border:1px solid #fdba74',
        'background:#fff7ed',
        'color:#9a3412',
        'box-shadow:0 16px 40px rgba(15,23,42,0.18)',
        'font-family:\"Malgun Gothic\",\"Apple SD Gothic Neo\",sans-serif',
        'font-size:14px',
        'line-height:1.6',
        'white-space:pre-wrap'
      ].join(';');
      alertBox.textContent = text;
      document.body.appendChild(alertBox);
      setTimeout(function() {
        if (alertBox.parentNode) alertBox.parentNode.removeChild(alertBox);
      }, 3200);
    } catch (error) {
      console.error('ErpRuntimeGuard inline alert failed:', error, text);
    }
  },
  getRuntime: async function(_supabase) {
    const { data, error } = await _supabase.rpc('get_my_erp_runtime');
    if (error) throw error;
    return data || null;
  },
  isModuleEnabled: function(runtime, moduleKey) {
    if (!moduleKey) return true;
    if (!runtime || typeof runtime !== 'object') return false;
    const modules = runtime.modules && typeof runtime.modules === 'object' ? runtime.modules : null;
    if (!modules || !(moduleKey in modules)) return true;
    return modules[moduleKey] !== false;
  },
  isAnyModuleEnabled: function(runtime, moduleKeys) {
    const keys = Array.isArray(moduleKeys) ? moduleKeys : [];
    if (keys.length === 0) return true;
    return keys.some(function(moduleKey) {
      return window.ErpRuntimeGuard.isModuleEnabled(runtime, moduleKey);
    });
  },
  enforce: async function(_supabase, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const moduleKey = String(opts.moduleKey || '').trim();
    const moduleKeysAny = Array.isArray(opts.moduleKeysAny)
      ? opts.moduleKeysAny.map(function(item) { return String(item || '').trim(); }).filter(Boolean)
      : [];
    const moduleLabel = String(opts.moduleLabel || '이 기능').trim() || '이 기능';
    const redirectUrl = String(opts.redirectUrl || 'index.html').trim() || 'index.html';
    const signOutOnInactive = opts.signOutOnInactive !== false;
    const alertFn = typeof opts.alertFn === 'function'
      ? opts.alertFn
      : function(msg) {
          window.ErpRuntimeGuard.showInlineAlert(String(msg || '확인이 필요합니다.'));
        };

    let runtime = null;
    try {
      runtime = await window.ErpRuntimeGuard.getRuntime(_supabase);
    } catch (error) {
      console.error('ErpRuntimeGuard.getRuntime failed:', error);
      alertFn('조합 실행 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
      setTimeout(function() {
        location.href = redirectUrl;
      }, 1200);
      return { ok: false, reason: 'runtime_error', runtime: null, error: error };
    }

    if (!runtime || !runtime.coop_id) {
      alertFn('조합 정보가 없어 페이지를 열 수 없습니다. 다시 로그인해 주세요.');
      setTimeout(function() {
        location.href = redirectUrl;
      }, 1200);
      return { ok: false, reason: 'runtime_missing', runtime: runtime, error: null };
    }

    if (runtime.is_active === false) {
      alertFn('현재 조합 ERP 사용이 중지되었습니다.\n통합 관리자에게 문의해주세요.');
      try {
        localStorage.removeItem('erp_user');
        localStorage.removeItem('erp_permissions');
      } catch (_) {}
      if (signOutOnInactive) {
        try {
          await _supabase.auth.signOut();
        } catch (_) {}
      }
      setTimeout(function() {
        location.href = redirectUrl;
      }, 1200);
      return { ok: false, reason: 'coop_inactive', runtime: runtime, error: null };
    }

    if (moduleKey && !window.ErpRuntimeGuard.isModuleEnabled(runtime, moduleKey)) {
      alertFn(moduleLabel + ' 모듈 사용이 중지되었습니다.\n통합 관리자에게 문의해주세요.');
      setTimeout(function() {
        location.href = redirectUrl;
      }, 1200);
      return { ok: false, reason: 'module_disabled', runtime: runtime, error: null };
    }

    if (moduleKeysAny.length > 0 && !window.ErpRuntimeGuard.isAnyModuleEnabled(runtime, moduleKeysAny)) {
      alertFn(moduleLabel + ' 모듈 사용이 중지되었습니다.\n통합 관리자에게 문의해주세요.');
      setTimeout(function() {
        location.href = redirectUrl;
      }, 1200);
      return { ok: false, reason: 'module_group_disabled', runtime: runtime, error: null };
    }

    return { ok: true, reason: null, runtime: runtime, error: null };
  }
};
