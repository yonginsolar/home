window.ErpRuntimeGuard = {
  version: '1.2.0',
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
  getErrorStatus: function(error) {
    const value = Number(error?.status || error?.statusCode || error?.context?.status || 0);
    return Number.isFinite(value) ? value : 0;
  },
  isAuthError: function(error) {
    if (!error) return false;
    const status = window.ErpRuntimeGuard.getErrorStatus(error);
    const code = String(error?.code || error?.name || '').trim().toUpperCase();
    const message = String(error?.message || error || '').trim().toUpperCase();
    if (status === 401 || status === 403) return true;
    if (code === 'PGRST301' || code === 'AUTHSESSIONMISSINGERROR') return true;
    return message.includes('JWT EXPIRED')
      || message.includes('INVALID JWT')
      || message.includes('AUTH SESSION MISSING')
      || message.includes('REFRESH TOKEN');
  },
  waitForRetry: function(delayMs) {
    return new Promise(function(resolve) {
      setTimeout(resolve, Math.max(0, Number(delayMs || 0)));
    });
  },
  requestWithRetry: async function(requestFn, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const attempts = Math.max(1, Number(opts.attempts || 2));
    const delayMs = Math.max(0, Number(opts.delayMs || 180));
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        if (window.ErpRuntimeGuard.isAuthError(error) || attempt >= attempts - 1) break;
        await window.ErpRuntimeGuard.waitForRetry(delayMs);
      }
    }
    throw lastError || new Error('ERP_REQUEST_FAILED');
  },
  getSessionState: async function(_supabase) {
    try {
      const { data, error } = await _supabase.auth.getSession();
      if (error) throw error;
      const session = data?.session || null;
      if (!session?.user) {
        return { ok: false, reason: 'auth_required', session: null, user: null, error: null };
      }
      return { ok: true, reason: null, session: session, user: session.user, error: null };
    } catch (error) {
      return {
        ok: false,
        reason: window.ErpRuntimeGuard.isAuthError(error) ? 'auth_required' : 'auth_unavailable',
        session: null,
        user: null,
        error: error
      };
    }
  },
  buildLoginRedirectUrl: function(redirectUrl, preserveNext) {
    const fallback = String(redirectUrl || 'index.html').trim() || 'index.html';
    let target = null;
    try {
      target = new URL(fallback, window.location.href);
    } catch (_) {
      return fallback;
    }
    const currentPath = String(window.location.pathname || '');
    const targetPath = String(target.pathname || '');
    const isAlreadyTarget = currentPath === targetPath;
    if (preserveNext !== false && !isAlreadyTarget) {
      target.searchParams.set('next', window.location.href);
    }
    return target.href;
  },
  redirectToLogin: function(options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      localStorage.removeItem('erp_user');
      localStorage.removeItem('erp_permissions');
    } catch (_) {}
    const targetUrl = window.ErpRuntimeGuard.buildLoginRedirectUrl(
      opts.redirectUrl || 'index.html',
      opts.preserveNext
    );
    window.location.replace(targetUrl);
  },
  getBoundEmployee: async function(_supabase) {
    return window.ErpRuntimeGuard.requestWithRetry(async function() {
      const { data, error } = await _supabase.rpc('erp_get_bound_login_employee');
      if (error) throw error;
      return data || null;
    }, { attempts: 2, delayMs: 180 });
  },
  requireUser: async function(_supabase, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const alertFn = typeof opts.alertFn === 'function'
      ? opts.alertFn
      : function(msg) {
          window.ErpRuntimeGuard.showInlineAlert(String(msg || '확인이 필요합니다.'));
        };
    const sessionState = await window.ErpRuntimeGuard.getSessionState(_supabase);
    if (!sessionState.ok) {
      if (sessionState.reason === 'auth_required') {
        window.ErpRuntimeGuard.redirectToLogin(opts);
      } else {
        console.error('ErpRuntimeGuard session check failed:', sessionState.error);
        alertFn('로그인 상태를 확인하지 못했습니다.\n연결 상태를 확인한 뒤 새로고침해 주세요.');
      }
      return {
        ok: false,
        reason: sessionState.reason,
        user: null,
        authUser: null,
        session: null,
        error: sessionState.error
      };
    }

    let employee = null;
    try {
      employee = await window.ErpRuntimeGuard.getBoundEmployee(_supabase);
    } catch (error) {
      console.error('ErpRuntimeGuard employee load failed:', error);
      if (window.ErpRuntimeGuard.isAuthError(error)) {
        window.ErpRuntimeGuard.redirectToLogin(opts);
        return {
          ok: false,
          reason: 'auth_required',
          user: null,
          authUser: null,
          session: null,
          error: error
        };
      }
      alertFn('직원 정보를 확인하지 못했습니다.\n연결 상태를 확인한 뒤 새로고침해 주세요.');
      return {
        ok: false,
        reason: 'employee_unavailable',
        user: null,
        authUser: sessionState.user,
        session: sessionState.session,
        error: error
      };
    }

    if (!employee) {
      window.ErpRuntimeGuard.redirectToLogin(opts);
      return {
        ok: false,
        reason: 'employee_missing',
        user: null,
        authUser: sessionState.user,
        session: sessionState.session,
        error: null
      };
    }

    try {
      localStorage.setItem('erp_user', JSON.stringify(employee));
    } catch (_) {}
    return {
      ok: true,
      reason: null,
      user: employee,
      authUser: sessionState.user,
      session: sessionState.session,
      error: null
    };
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
      runtime = await window.ErpRuntimeGuard.requestWithRetry(function() {
        return window.ErpRuntimeGuard.getRuntime(_supabase);
      }, { attempts: 2, delayMs: 180 });
    } catch (error) {
      console.error('ErpRuntimeGuard.getRuntime failed:', error);
      if (window.ErpRuntimeGuard.isAuthError(error)) {
        alertFn('로그인 세션이 만료되었습니다.\n다시 로그인해 주세요.');
        window.ErpRuntimeGuard.redirectToLogin({ redirectUrl: redirectUrl });
        return { ok: false, reason: 'auth_required', runtime: null, error: error };
      }
      alertFn('조합 실행 정보를 확인하지 못했습니다.\n연결 상태를 확인한 뒤 새로고침해 주세요.');
      return { ok: false, reason: 'runtime_unavailable', runtime: null, error: error };
    }

    if (!runtime || !runtime.coop_id) {
      alertFn('조합 실행 정보가 준비되지 않았습니다.\n잠시 후 새로고침해 주세요.');
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
