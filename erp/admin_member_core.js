/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
// ★ Supabase 설정 (브라우저용 publishable key + RPC/RLS 권한 검사)
const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
        headers: {
            'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(window.location) || String(window.location.hostname || '').trim().toLowerCase()
        }
    }
});
const _supabaseEdge = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
        headers: {
            'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(window.location) || String(window.location.hostname || '').trim().toLowerCase()
        }
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'erp-admin-member-edge-functions'
    }
});
let permissionSet = new Set();
let pendingAdminOtpEmail = '';
let g_adminMemberRuntime = null;
let memberOrgProfileRevision = null;
let memberOrgSettingsOwner = '', memberOrgSettingsBaseline = null, memberOrgSettingsSaving = false;
function memberOrgSettingsSnapshot() {
    return JSON.stringify([...document.querySelectorAll('#memberCertificateSettingsModal input,#memberCertificateSettingsModal select')].map(n=>[n.id,n.type==='file'?[...n.files].map(f=>[f.name,f.size,f.lastModified]):n.value]));
}
function canOpenFullCoopSettings() {
    return !isAdminMemberSiteProfile() && g_adminMemberRuntime?.is_active !== false
      && ((g_adminMemberRuntime?.effective_permissions?.includes('hr.admin') && g_adminMemberRuntime?.modules?.hr !== false)
        || g_adminMemberRuntime?.initial_setup?.active === true);
}
function ensureMemberOrgProfileFields() {
    if (document.getElementById('member-org-contact-name')) return;
    const row = document.getElementById('member-org-address')?.closest('.row');
    if (!row) return;
    const fields = document.createElement('div'); fields.className = 'col-12';
    fields.innerHTML = '<div class="row g-3"><div class="col-md-6"><label class="form-label" for="member-org-contact-name">공식 담당자</label><input id="member-org-contact-name" class="form-control" maxlength="100"></div><div class="col-md-6"><label class="form-label" for="member-org-est-date">설립일</label><input id="member-org-est-date" type="date" class="form-control"></div></div>';
    row.append(fields);
}
const MEMBER_CERTIFICATE_SEAL_PREFIX = 'company-seals';
const MEMBER_ORG_LOGO_PREFIX = 'coop-branding';
let memberCertificateSealStoragePath = '';
let memberCertificateSealPreviewObjectUrl = '';
let memberOrgLogoUrl = '';
let memberOrgOriginalLogoUrl = '';
let memberOrgLogoRevision = 0;
let memberOrgFaviconField = null;
let memberOrgLogoPreviewObjectUrl = '';
const ADMIN_MEMBER_PAGE_SCOPE = (() => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const scope = String(params.get('scope') || '').trim();
    return scope === 'member_admin' || scope === 'site_admin' || scope === 'documents_admin' ? scope : '';
  } catch (_) {
    return '';
  }
})();
const ADMIN_MEMBER_TABS = Object.freeze({
    member_admin: ['members', 'badges', 'funds-manage', 'applications', 'deposit', 'notifications'],
    site_admin: ['notices', 'site'],
    documents_admin: ['site']
});
const KST_TZ_ADMIN_MEMBER = 'Asia/Seoul';
const formatAdminMemberKstDate = (value, fallback = '-') => {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ_ADMIN_MEMBER, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const formatAdminMemberKstDateTime = (value, fallback = '-') => {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ_ADMIN_MEMBER, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
};
const formatAdminMemberKstDateTimeSeconds = (value, fallback = '-') => {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ_ADMIN_MEMBER, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
};
const getAdminMemberKstDateString = () => formatAdminMemberKstDate(new Date(), '');

async function loadAdminMemberPermissions(user) {
    const result = new Set();
    if (!user) return result;
    const data = await window.ErpRuntimeGuard.getEffectivePermissions(_supabase);
    data.forEach((permissionKey) => result.add(permissionKey));
    return result;
}

async function getAdminMemberCoopId() {
    if (g_adminMemberRuntime?.coop_id) return g_adminMemberRuntime.coop_id;
    try {
        const { data, error } = await _supabase.rpc('get_my_coop_id');
        if (error) throw error;
        return data || null;
    } catch (e) {
        CoopSafeLog.warn("getAdminMemberCoopId failed:", e);
        return null;
    }
}

function scopeAdminTenant(query) {
    const coopId = g_adminMemberRuntime?.coop_id || null;
    const safeCoopId = String(coopId || '').trim();
    return query.eq('coop_id', safeCoopId || '00000000-0000-0000-0000-000000000000');
}

function isAdminMemberSessionNearExpiry(session, thresholdMs = 2 * 60 * 1000) {
    const expiresAtSec = Number(session?.expires_at || 0);
    if (!Number.isFinite(expiresAtSec) || expiresAtSec <= 0) return true;
    return (expiresAtSec * 1000) <= (Date.now() + thresholdMs);
} // End of isAdminMemberSessionNearExpiry

async function getAdminMemberFunctionAccessToken(forceRefresh = false) {
    const { data: sessionData } = await _supabase.auth.getSession().catch(() => ({ data: null }));
    let session = sessionData?.session || null;
    let accessToken = session?.access_token || '';
    const needsRefresh = !!forceRefresh || !accessToken || isAdminMemberSessionNearExpiry(session);

    if (needsRefresh) {
        const { data: refreshedData, error: refreshError } = await _supabase.auth.refreshSession().catch(() => ({ data: null, error: null }));
        if (refreshError || !refreshedData?.session?.access_token) return '';
        session = refreshedData.session;
        accessToken = session.access_token || '';
    }

    return accessToken || '';
} // End of getAdminMemberFunctionAccessToken

function normalizeAdminMemberEdgeInvokeError(error) {
    if (!error) return 'unknown error';
    const status = Number(error?.context?.status || error?.status || error?.response?.status || 0);
    const message = String(error?.message || error?.name || error?.error || '').trim();
    let detailText = '';
    const context = error?.context;
    if (context && typeof context.text === 'function') {
        detailText = '[response body omitted]';
    } else if (context && typeof context === 'object') {
        try {
            detailText = JSON.stringify(context);
        } catch (_) { /* noop */ }
    }
    return [
        status ? `status=${status}` : '',
        message || '',
        detailText || ''
    ].filter(Boolean).join(' | ') || 'unknown error';
} // End of normalizeAdminMemberEdgeInvokeError

async function getAdminMemberEdgeErrorMessage(error) {
    if (!error) return '알 수 없는 오류';
    const normalized = normalizeAdminMemberEdgeInvokeError(error);
    const context = error?.context;
    let detail = '';
    if (context && typeof context.clone === 'function') {
        try {
            const responseText = await context.clone().text();
            if (responseText) {
                try {
                    const parsed = JSON.parse(responseText);
                    detail = String(parsed?.detail || parsed?.error || parsed?.message || '').trim();
                } catch (_) {
                    detail = String(responseText || '').trim();
                }
            }
        } catch (_) { /* noop */ }
    }
    if (/AUTH_SESSION_MISSING|AUTH_REFRESH_FAILED/.test(normalized)) {
        return '로그인 세션을 확인하지 못했습니다. 다시 로그인한 뒤 실행해주세요.';
    }
    return [detail, normalized].filter(Boolean).join(' | ') || '알 수 없는 오류';
} // End of getAdminMemberEdgeErrorMessage

async function invokeAdminMemberEdgeFunction(functionName, body, options = {}) {
    const safeFunctionName = String(functionName || '').trim();
    if (!safeFunctionName) {
        return { data: null, error: new Error('FUNCTION_NAME_REQUIRED') };
    }

    const ensureSession = async (forceRefresh = false) => {
        const token = await getAdminMemberFunctionAccessToken(forceRefresh);
        if (!token) return { ok: false, error: new Error(forceRefresh ? 'AUTH_REFRESH_FAILED' : 'AUTH_SESSION_MISSING') };
        return { ok: true, token };
    };

    const firstSession = await ensureSession(false);
    if (!firstSession.ok) {
        return { data: null, error: firstSession.error };
    }

    const buildInvokeOptions = (token) => ({
        body,
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    let { data, error } = await _supabaseEdge.functions.invoke(
        safeFunctionName,
        buildInvokeOptions(firstSession.token)
    );
    if (!error) return { data, error: null };

    const normalizedText = normalizeAdminMemberEdgeInvokeError(error);
    const shouldRetryAuth = options?.retryAuth !== false
        && (/status=401/.test(normalizedText) || /auth|jwt|unauthorized/i.test(normalizedText));
    if (!shouldRetryAuth) return { data, error };

    const refreshedSession = await ensureSession(true);
    if (!refreshedSession.ok) {
        return { data: null, error: refreshedSession.error };
    }

    const retryResult = await _supabaseEdge.functions.invoke(
        safeFunctionName,
        buildInvokeOptions(refreshedSession.token)
    );
    return { data: retryResult.data, error: retryResult.error || null };
} // End of invokeAdminMemberEdgeFunction

async function withAdminTenantPayload(payload) {
    const coopId = await getAdminMemberCoopId();
    if (!coopId || Object.prototype.hasOwnProperty.call(payload, 'coop_id')) return payload;
    return { ...payload, coop_id: coopId };
}

function revokeMemberCertificateSealPreview() {
    if (!memberCertificateSealPreviewObjectUrl) return;
    try { URL.revokeObjectURL(memberCertificateSealPreviewObjectUrl); } catch (_) {}
    memberCertificateSealPreviewObjectUrl = '';
} // End of revokeMemberCertificateSealPreview

function renderMemberCertificateSealPreview(url, statusText) {
    const wrap = document.getElementById('member-certificate-seal-preview-wrap');
    const image = document.getElementById('member-certificate-seal-preview');
    const status = document.getElementById('member-certificate-seal-status');
    const empty = document.getElementById('member-certificate-seal-empty');
    const safeUrl = String(url || '').trim();
    if (!wrap || !image || !status || !empty) return;
    if (safeUrl) {
        image.src = safeUrl;
        status.textContent = statusText || '현재 등록된 조합 직인';
        wrap.classList.remove('hidden');
        empty.classList.add('hidden');
    } else {
        image.removeAttribute('src');
        status.textContent = '';
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
    }
} // End of renderMemberCertificateSealPreview

function getMemberCertificateSealFile() {
    return document.getElementById('member-certificate-seal-file')?.files?.[0] || null;
} // End of getMemberCertificateSealFile

function validateMemberCertificateSealFile(file) {
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(String(file.type || '').toLowerCase())) {
        throw new Error('직인은 PNG, JPG 또는 WebP 이미지로 올려주세요.');
    }
    if (Number(file.size || 0) > 5 * 1024 * 1024) {
        throw new Error('직인 이미지는 5MB 이하로 올려주세요.');
    }
} // End of validateMemberCertificateSealFile

async function convertMemberCertificateSealToPng(file) {
    if (!file || String(file.type || '').toLowerCase() === 'image/png') return file;
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('직인 이미지를 읽을 수 없습니다.'));
            element.src = objectUrl;
        });
        const maxSide = 1600;
        const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * ratio));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('직인 이미지 변환을 준비할 수 없습니다.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error('직인 이미지를 변환하지 못했습니다.')), 'image/png');
        });
        return new File([blob], 'company_seal.png', { type: 'image/png' });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
} // End of convertMemberCertificateSealToPng

function previewMemberCertificateSeal() {
    const fileInput = document.getElementById('member-certificate-seal-file');
    const file = getMemberCertificateSealFile();
    if (!file) {
        renderMemberCertificateSealPreview('', '');
        return;
    }
    try {
        validateMemberCertificateSealFile(file);
        revokeMemberCertificateSealPreview();
        memberCertificateSealPreviewObjectUrl = URL.createObjectURL(file);
        renderMemberCertificateSealPreview(memberCertificateSealPreviewObjectUrl, `선택한 파일: ${file.name}`);
    } catch (error) {
        if (fileInput) fileInput.value = '';
        renderMemberCertificateSealPreview('', '');
        myAlert(error?.message || error, 'warning');
    }
} // End of previewMemberCertificateSeal

function revokeMemberOrgLogoPreview() {
    if (!memberOrgLogoPreviewObjectUrl) return;
    try { URL.revokeObjectURL(memberOrgLogoPreviewObjectUrl); } catch (_) {}
    memberOrgLogoPreviewObjectUrl = '';
} // End of revokeMemberOrgLogoPreview

function renderMemberOrgLogoPreview(url, statusText) {
    const wrap = document.getElementById('member-org-logo-preview-wrap');
    const image = document.getElementById('member-org-logo-preview');
    const status = document.getElementById('member-org-logo-status');
    const empty = document.getElementById('member-org-logo-empty');
    const safeUrl = String(url || '').trim();
    if (!wrap || !image || !status || !empty) return;
    if (safeUrl) {
        image.src = safeUrl;
        status.textContent = statusText || '현재 등록된 가로형 로고';
        wrap.classList.remove('hidden');
        empty.classList.add('hidden');
    } else {
        image.removeAttribute('src');
        status.textContent = '';
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
    }
} // End of renderMemberOrgLogoPreview

function validateMemberOrgLogoFile(file) {
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(String(file.type || '').toLowerCase())) {
        throw new Error('가로형 로고는 PNG, JPG 또는 WebP 이미지로 올려주세요.');
    }
    if (Number(file.size || 0) > 5 * 1024 * 1024) {
        throw new Error('가로형 로고 이미지는 5MB 이하로 올려주세요.');
    }
} // End of validateMemberOrgLogoFile

function previewMemberOrgLogo() {
    const input = document.getElementById('member-org-logo-file');
    const file = input?.files?.[0] || null;
    if (!file) return;
    try {
        validateMemberOrgLogoFile(file);
        revokeMemberOrgLogoPreview();
        memberOrgLogoPreviewObjectUrl = URL.createObjectURL(file);
        renderMemberOrgLogoPreview(memberOrgLogoPreviewObjectUrl, `선택한 파일: ${file.name}`);
    } catch (error) {
        if (input) input.value = '';
        renderMemberOrgLogoPreview(memberOrgLogoUrl, memberOrgLogoUrl ? '현재 등록된 가로형 로고' : '');
        myAlert(error?.message || error, 'warning');
    }
} // End of previewMemberOrgLogo

function clearMemberOrgLogo() {
    const input = document.getElementById('member-org-logo-file');
    if (input) input.value = '';
    revokeMemberOrgLogoPreview();
    memberOrgLogoUrl = '';
    renderMemberOrgLogoPreview('', '');
} // End of clearMemberOrgLogo

async function openMemberCertificateSettingsModal() {
    if (!isAdminMemberSiteProfile()) {
        if (!canOpenFullCoopSettings()) return;
        ErpWorkspaceResume.navigate(g_adminMemberRuntime?.initial_setup?.active && !g_adminMemberRuntime?.effective_permissions?.includes('hr.admin')
          ? 'initial_setup.html' : 'admin_employee.html?section=settings');
        return;
    }
    ensureMemberOrgProfileFields();
    const chairmanInput = document.getElementById('member-certificate-chairman-name');
    const shareUnitInput = document.getElementById('member-certificate-share-unit');
    const sealFileInput = document.getElementById('member-certificate-seal-file');
    const logoFileInput = document.getElementById('member-org-logo-file');
    if (!chairmanInput || !shareUnitInput || !sealFileInput || !logoFileInput) return;
    memberOrgFaviconField ||= CoopFaviconField.mount(logoFileInput.parentElement.parentElement, 'member-org-favicon');

    showLoading(true);
    try {
        const auth=await _supabase.auth.getUser();if(auth.error||!auth.data?.user?.id)throw Error('로그인 상태를 다시 확인해 주세요.');
        const owner=auth.data.user.id+'|'+await getAdminMemberCoopId();
        if(owner===memberOrgSettingsOwner&&memberOrgSettingsBaseline!==null&&memberOrgSettingsSnapshot()!==memberOrgSettingsBaseline){
            const check=await _supabase.rpc('get_my_site_member_org_settings');if(check.error)throw check.error;
            bootstrap.Modal.getOrCreateInstance(document.getElementById('memberCertificateSettingsModal')).show();return;
        }
        memberOrgSettingsOwner=owner;memberOrgSettingsBaseline=null;
        revokeMemberCertificateSealPreview();
        revokeMemberOrgLogoPreview();
        sealFileInput.value = '';
        logoFileInput.value = '';
        memberOrgFaviconField.reset();
        memberCertificateSealStoragePath = '';
        memberOrgLogoUrl = '';
        memberOrgOriginalLogoUrl = '';
        const { data, error } = await _supabase.rpc('get_my_site_member_org_settings');
        if (error) throw error;
        const config = data && typeof data === 'object' ? data : {};
        const profile = await _supabase.rpc('erp_coop_profile');
        if (profile.error) throw profile.error;
        memberOrgProfileRevision = profile.data.revision;
        Object.assign(config,profile.data.data);
        chairmanInput.value = String(config.chairman_name || config.ceoName || '');
        await refreshMemberCapitalDisplays();
        document.getElementById('member-org-address').value = String(config.company_address || '');
        document.getElementById('member-org-contact').value = String(config.company_contact_phone || '');
        document.getElementById('member-org-email').value = String(config.company_contact_email || '');
        document.getElementById('member-org-contact-name').value = String(config.company_contact_name || '');
        document.getElementById('member-org-est-date').value = String(config.estDate || '');
        document.getElementById('member-org-business-number').value = String(config.bizNum || '');
        document.getElementById('member-org-deposit-bank').value = String(config.member_capital_deposit_bank || '');
        document.getElementById('member-org-deposit-account').value = String(config.member_capital_deposit_account || '');
        document.getElementById('member-org-deposit-holder').value = String(config.member_capital_deposit_holder || '');
        memberCertificateSealStoragePath = String(config.seal_url || '').trim();
        memberOrgLogoUrl = String(config.logo_horizontal_url || '').trim();
        memberOrgOriginalLogoUrl = memberOrgLogoUrl;
        const branding = await _supabase.rpc('erp_coop_branding', {p_action:'get',p_data:{}});
        if (branding.error) throw branding.error;
        memberOrgLogoRevision = Number(branding.data?.revision || 0);
        memberOrgFaviconField.sync(branding.data || {});

        let previewUrl = '';
        if (memberCertificateSealStoragePath) {
            if (/^https?:\/\//i.test(memberCertificateSealStoragePath)) {
                previewUrl = memberCertificateSealStoragePath;
            } else {
                const { data: signedData, error: signedError } = await _supabase.storage
                    .from('attachments')
                    .createSignedUrl(memberCertificateSealStoragePath, 900);
                if (signedError) throw signedError;
                previewUrl = String(signedData?.signedUrl || '').trim();
            }
        }
        renderMemberCertificateSealPreview(previewUrl, '현재 등록된 조합 직인');
        if (memberOrgLogoUrl && !/^https?:\/\//i.test(memberOrgLogoUrl)) {
            const { data: publicData } = _supabase.storage.from('assets').getPublicUrl(memberOrgLogoUrl);
            memberOrgLogoUrl = String(publicData?.publicUrl || memberOrgLogoUrl).trim();
        }
        renderMemberOrgLogoPreview(memberOrgLogoUrl, '현재 등록된 가로형 로고');
        const modalEl = document.getElementById('memberCertificateSettingsModal');
        memberOrgSettingsBaseline=memberOrgSettingsSnapshot();
        if(!modalEl.dataset.orgSavingGuard){modalEl.dataset.orgSavingGuard='1';modalEl.addEventListener('hide.bs.modal',event=>{if(memberOrgSettingsSaving)event.preventDefault();});}
        applyAdminMemberModalLayer(modalEl);
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    } catch (error) {
        myAlert('조합 기본 설정을 불러오지 못했습니다: ' + (error?.message || error), 'error');
    } finally {
        showLoading(false);
    }
} // End of openMemberCertificateSettingsModal

async function saveMemberCertificateSettings() {
    if (!isAdminMemberSiteProfile() || memberOrgSettingsSaving) return;
    let coopId,auth;
    try{coopId=String(await getAdminMemberCoopId()||'').trim();auth=await _supabase.auth.getUser();}
    catch(_){return myAlert('계정 정보를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.','warning');}
    if(auth.error||auth.data?.user?.id+'|'+coopId!==memberOrgSettingsOwner)return myAlert('현재 계정의 조합 설정을 다시 확인해 주세요. 입력 내용은 유지됩니다.','warning');
    if(memberOrgSettingsSaving)return;
    const chairmanName = String(document.getElementById('member-certificate-chairman-name')?.value || '').trim();
    const shareUnitRaw = String(ERPNumberInput.raw(document.getElementById('member-certificate-share-unit')?.value) || '').trim();
    const shareUnitAmount = shareUnitRaw ? Math.trunc(Number(shareUnitRaw)) : null;
    const sealFileInput = document.getElementById('member-certificate-seal-file');
    const sealFile = getMemberCertificateSealFile();
    const logoFileInput = document.getElementById('member-org-logo-file');
    const logoFile = logoFileInput?.files?.[0] || null;
    const faviconFile = memberOrgFaviconField?.file();
    if (!coopId) return myAlert('조합 정보를 확인할 수 없습니다. 다시 로그인해 주세요.', 'error');
    if (shareUnitAmount !== null && (!Number.isInteger(shareUnitAmount) || shareUnitAmount <= 0)) return myAlert('출자 1좌 금액을 정확히 입력해 주세요.', 'warning');
    try {
        validateMemberCertificateSealFile(sealFile);
        validateMemberOrgLogoFile(logoFile);
        if (faviconFile) CoopLogoUpload.validate(faviconFile);
    } catch (error) {
        return myAlert(error?.message || error, 'warning');
    }

    const saveButton = document.getElementById('member-certificate-settings-save');
    const orgControls=[...document.querySelectorAll('#memberCertificateSettingsModal input,#memberCertificateSettingsModal select,#memberCertificateSettingsModal button')].map(element=>({element,disabled:element.disabled}));
    memberOrgSettingsSaving=true;orgControls.forEach(({element})=>element.disabled=true);
    if (saveButton) saveButton.disabled = true;
    showLoading(true);
    let newlyUploadedLogoUrl = '';
    let orgSettingsSaved = false;
    let profileSettingsSaved = false;
    const previousLogoUrl = memberOrgOriginalLogoUrl;
    try {
        const readProfile = id => String(document.getElementById(id)?.value || '').trim();
        const profileSaved = await _supabase.rpc('erp_coop_profile',{p_action:'save',p_expected_revision:memberOrgProfileRevision,p_data:{
          chairman_name:chairmanName,company_address:readProfile('member-org-address'),company_contact_name:readProfile('member-org-contact-name'),
          company_contact_phone:readProfile('member-org-contact'),company_contact_email:readProfile('member-org-email'),
          bizNum:readProfile('member-org-business-number'),estDate:readProfile('member-org-est-date')
        }});
        if (profileSaved.error) throw profileSaved.error;
        memberOrgProfileRevision = profileSaved.data.revision;
        profileSettingsSaved = true;
        let sealPath = memberCertificateSealStoragePath;
        if (sealFile) {
            const uploadFile = await convertMemberCertificateSealToPng(sealFile);
            sealPath = await CoopCompanySealUpload.upload(_supabase, coopId, uploadFile, sealFile);
        }

        let logoUrl = memberOrgLogoUrl;
        if (logoFile || faviconFile) {
            const branding = await CoopLogoUpload.saveSelection(_supabase, coopId, logoFile, faviconFile, memberOrgLogoRevision);
            newlyUploadedLogoUrl = branding.display_url;
            memberOrgLogoRevision = branding.revision;
            logoUrl = newlyUploadedLogoUrl;
            memberOrgFaviconField.sync(branding);
        }

        const read = (id) => String(document.getElementById(id)?.value || '').trim();
        const { error: saveError } = await _supabase.rpc('upsert_site_member_org_settings', {
            p_chairman_name: chairmanName,
            p_share_unit_amount: shareUnitAmount,
            p_seal_url: sealPath,
            p_company_address: read('member-org-address'),
            p_company_contact: read('member-org-contact'),
            p_company_email: read('member-org-email'),
            p_business_number: read('member-org-business-number'),
            p_logo_horizontal_url: logoUrl,
            p_deposit_bank: read('member-org-deposit-bank'),
            p_deposit_account: read('member-org-deposit-account'),
            p_deposit_holder: read('member-org-deposit-holder')
        });
        if (saveError) throw saveError;
        orgSettingsSaved = true;

        memberCertificateSealStoragePath = sealPath;
        memberOrgLogoUrl = logoUrl;
        memberOrgOriginalLogoUrl = logoUrl;
        if (sealFileInput) sealFileInput.value = '';
        if (logoFileInput) logoFileInput.value = '';
        memberOrgFaviconField?.clearSaved(faviconFile);
        revokeMemberCertificateSealPreview();
        revokeMemberOrgLogoPreview();
        // Previous originals and logo versions are preserved. Never delete on
        // an ambiguous settings reply or replace another cooperative's asset.
        const modalEl = document.getElementById('memberCertificateSettingsModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        memberOrgSettingsBaseline=memberOrgSettingsSnapshot();memberOrgSettingsSaving=false;
        window.ErpWorkspaceResume?.checkpoint(modalEl);
        if (modal) modal.hide();
        myAlert('조합 공식 정보, 출자증서와 입금 안내 설정을 저장했습니다.', 'success');
    } catch (error) {
        // A lost RPC reply is not proof of rollback. Keep newly uploaded files
        // rather than deleting a seal/logo that the server may have accepted.
        myAlert(orgSettingsSaved ? '설정은 저장되었습니다. 화면을 다시 열어 확인해 주세요.' : (profileSettingsSaved ? '기본정보는 저장되었지만 이미지·입금 안내 저장을 완료하지 못했습니다. 입력 내용은 유지됩니다. ' : '조합 기본 설정 저장 실패: ') + (error?.hint || error?.message || error), orgSettingsSaved || profileSettingsSaved ? 'warning' : 'error');
    } finally {
        memberOrgSettingsSaving=false;orgControls.forEach(({element,disabled})=>{if(element.isConnected)element.disabled=disabled;});
        showLoading(false);
        if (saveButton) saveButton.disabled = false;
    }
} // End of saveMemberCertificateSettings

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function escapeJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, '\\u0027')
        .replace(/"/g, '\\u0022')
        .replace(/&/g, '\\u0026')
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}
function encodeInlineArgument(value) {
    return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}
function decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value ?? '');
    return textarea.value;
}
function toPlainSummaryPreview(value, maxLen = 140) {
    const raw = String(value ?? '');
    if (!raw.trim()) return '-';
    const decoded = decodeHtmlEntities(raw);
    const stripped = decoded
        .replace(/<[^>]*>/g, ' ')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!stripped) return '-';
    if (stripped.length <= maxLen) return stripped;
    return `${stripped.slice(0, Math.max(0, maxLen - 3))}...`;
}
function sanitizeOrKeyword(value) {
    return String(value ?? '')
        .replace(/[,%()]/g, ' ')
        .replace(/["'`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function moveFocusOutsideModal(modalEl) {
    if (!modalEl) return;
    const activeEl = document.activeElement;
    if (!activeEl) return;
    if (activeEl !== modalEl && !modalEl.contains(activeEl)) return;

    if (typeof activeEl.blur === 'function') activeEl.blur();
    const fallback = document.getElementById('search-keyword') || document.getElementById('main-system') || document.body;
    if (!fallback || typeof fallback.focus !== 'function') return;

    const needsTabindex = !fallback.hasAttribute('tabindex');
    if (needsTabindex) fallback.setAttribute('tabindex', '-1');
    fallback.focus({ preventScroll: true });
    if (needsTabindex) {
        setTimeout(() => {
            if (fallback.getAttribute('tabindex') === '-1') fallback.removeAttribute('tabindex');
        }, 0);
    }
}

function closeMemberDetailModal() {
    if (memberDetailSaving) return;
    const modalEl = document.getElementById('memberDetailModal');
    if (!modalEl) return;
    moveFocusOutsideModal(modalEl);
    const inst = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
    setTimeout(() => {
        moveFocusOutsideModal(modalEl);
        inst.hide();
    }, 0);
}
window.closeMemberDetailModal = closeMemberDetailModal;

function bindMemberDetailModalFocusGuard() {
    const modalEl = document.getElementById('memberDetailModal');
    if (!modalEl || modalEl.dataset.focusGuardBound === '1') return;
    modalEl.addEventListener('hide.bs.modal', () => {
        moveFocusOutsideModal(modalEl);
        requestAnimationFrame(() => moveFocusOutsideModal(modalEl));
    });
    modalEl.addEventListener('pointerdown', (e) => {
        const trigger = e.target?.closest?.('.btn-close,[data-bs-dismiss="modal"]');
        if (trigger) moveFocusOutsideModal(modalEl);
    }, true);
    modalEl.dataset.focusGuardBound = '1';
}
bindMemberDetailModalFocusGuard();

function bindCustomAlertModalFocusGuard() {
    const modalEl = document.getElementById('customAlertModal');
    if (!modalEl || modalEl.dataset.focusGuardBound === '1') return;
    modalEl.addEventListener('hide.bs.modal', () => {
        moveFocusOutsideModal(modalEl);
        requestAnimationFrame(() => moveFocusOutsideModal(modalEl));
    });
    modalEl.addEventListener('pointerdown', (e) => {
        const trigger = e.target?.closest?.('.btn-close,[data-bs-dismiss="modal"]');
        if (trigger) moveFocusOutsideModal(modalEl);
    }, true);
    modalEl.dataset.focusGuardBound = '1';
}
bindCustomAlertModalFocusGuard();

function bindCustomConfirmModalFocusGuard() {
    const modalEl = document.getElementById('customConfirmModal');
    if (!modalEl || modalEl.dataset.focusGuardBound === '1') return;
    modalEl.addEventListener('hide.bs.modal', () => {
        moveFocusOutsideModal(modalEl);
        requestAnimationFrame(() => moveFocusOutsideModal(modalEl));
    });
    modalEl.addEventListener('pointerdown', () => {
        moveFocusOutsideModal(modalEl);
    }, true);
    modalEl.dataset.focusGuardBound = '1';
}
bindCustomConfirmModalFocusGuard();

function bindIssueDocModalFocusGuard() {
    const modalEl = document.getElementById('issueDocModal');
    if (!modalEl || modalEl.dataset.focusGuardBound === '1') return;
    modalEl.addEventListener('hide.bs.modal', () => {
        moveFocusOutsideModal(modalEl);
        requestAnimationFrame(() => moveFocusOutsideModal(modalEl));
    });
    modalEl.addEventListener('pointerdown', (e) => {
        const trigger = e.target?.closest?.('.btn-close,[data-bs-dismiss="modal"]');
        if (trigger) moveFocusOutsideModal(modalEl);
    }, true);
    modalEl.dataset.focusGuardBound = '1';
}
bindIssueDocModalFocusGuard();

const ADMIN_MEMBER_MODAL_Z_INDEX = {
    excelModal: 1055,
    capitalImportModal: 1055,
    memberCreateModal: 1055,
    memberCertificateSettingsModal: 1055,
    memberCapitalSettingsModal: 1065,
    applicationMemberModal: 1055,
    applicationRejectionModal: 1055,
    memberDetailModal: 1055,
    memberHistoryModal: 1065,
    issueDocModal: 1065,
    fundEditorModal: 1065,
    relationSelectModal: 1065,
    groupSearchModal: 1065,
    childRegisterModal: 1065,
    capitalNotificationConfirmModal: 1085,
    customConfirmModal: 1085,
    customAlertModal: 1095
};
const ADMIN_MEMBER_MODAL_Z_INDEX_STEP = 20;
let adminMemberModalOpenSequence = 0;
let adminMemberModalCloseInProgress = false;

function isAdminMemberManagedModal(modalEl) {
    return !!(
        modalEl instanceof HTMLElement &&
        ADMIN_MEMBER_MODAL_Z_INDEX[modalEl.id]
    );
} // End of isAdminMemberManagedModal

function markAdminMemberModalOpened(modalEl) {
    if (!isAdminMemberManagedModal(modalEl)) return;
    adminMemberModalOpenSequence += 1;
    modalEl.dataset.adminMemberModalOpenOrder = String(adminMemberModalOpenSequence);
    modalEl.dataset.adminMemberModalOpening = '1';
} // End of markAdminMemberModalOpened

function clearAdminMemberModalState(modalEl) {
    if (!isAdminMemberManagedModal(modalEl)) return;
    modalEl.removeAttribute('data-admin-member-modal-open-order');
    modalEl.removeAttribute('data-admin-member-modal-opening');
    modalEl.removeAttribute('data-admin-member-modal-close-after-shown');
    modalEl.removeAttribute('inert');
} // End of clearAdminMemberModalState

function getOpenAdminMemberModals() {
    return Array.from(document.querySelectorAll('.modal'))
        .filter(function (modalEl) {
            return isAdminMemberManagedModal(modalEl) && (
                modalEl.classList.contains('show') ||
                modalEl.dataset.adminMemberModalOpening === '1'
            );
        })
        .sort(function (a, b) {
            const orderA = Number(a.dataset.adminMemberModalOpenOrder || 0);
            const orderB = Number(b.dataset.adminMemberModalOpenOrder || 0);
            if (orderA !== orderB) return orderA - orderB;
            return ADMIN_MEMBER_MODAL_Z_INDEX[a.id] - ADMIN_MEMBER_MODAL_Z_INDEX[b.id];
        });
} // End of getOpenAdminMemberModals

function getAdminMemberModalZIndex(modalEl, index) {
    const configuredZIndex = Number(ADMIN_MEMBER_MODAL_Z_INDEX[modalEl.id] || 1055);
    const orderedZIndex = 1055 + (index * ADMIN_MEMBER_MODAL_Z_INDEX_STEP);
    return Math.max(configuredZIndex, orderedZIndex);
} // End of getAdminMemberModalZIndex

function focusTopAdminMemberModal() {
    if (document.querySelector('.contribution-cert-preview[open]')) return;
    const openModals = getOpenAdminMemberModals();
    const topModal = openModals[openModals.length - 1];
    if (!topModal || !topModal.classList.contains('show') || topModal.contains(document.activeElement)) return;
    topModal.focus({ preventScroll: true });
} // End of focusTopAdminMemberModal

function applyAdminMemberModalLayer(modalEl) {
    if (!modalEl) return;
    const zIndex = ADMIN_MEMBER_MODAL_Z_INDEX[modalEl.id];
    if (!zIndex) return;

    modalEl.style.zIndex = String(zIndex);
    syncAdminMemberModalLayers();
}

function syncAdminMemberModalLayers() {
    const openModals = getOpenAdminMemberModals();

    openModals.forEach(function (modalEl, index) {
        const isTopModal = index === openModals.length - 1;
        modalEl.style.zIndex = String(getAdminMemberModalZIndex(modalEl, index));
        if (isTopModal) modalEl.removeAttribute('inert');
        else modalEl.setAttribute('inert', '');
    });

    const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
    const managedBackdrops = backdrops.slice(Math.max(0, backdrops.length - openModals.length));
    managedBackdrops.forEach(function (backdrop, index) {
        const modalEl = openModals[index];
        if (!modalEl) return;
        const zIndex = getAdminMemberModalZIndex(modalEl, index);
        backdrop.style.zIndex = String(zIndex - 5);
        backdrop.dataset.modalFor = modalEl.id;
    });
} // End of syncAdminMemberModalLayers

function stopAdminMemberModalEscape(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
} // End of stopAdminMemberModalEscape

function handleAdminMemberModalEscape(event) {
    if (event.key !== 'Escape' || event.isComposing) return;
    if (document.querySelector('.contribution-cert-preview[open]')) return;

    const openModals = getOpenAdminMemberModals();
    if (adminMemberModalCloseInProgress && openModals.length > 0) {
        stopAdminMemberModalEscape(event);
        return;
    }
    if (openModals.length <= 1) return;

    stopAdminMemberModalEscape(event);
    const topModal = openModals[openModals.length - 1];
    const modalInstance = bootstrap.Modal.getInstance(topModal) || bootstrap.Modal.getOrCreateInstance(topModal);
    const keyboardEnabled = topModal.getAttribute('data-bs-keyboard') !== 'false' && modalInstance?._config?.keyboard !== false;
    if (!keyboardEnabled) return;

    adminMemberModalCloseInProgress = true;
    if (topModal.dataset.adminMemberModalOpening === '1') {
        topModal.dataset.adminMemberModalCloseAfterShown = '1';
        return;
    }
    modalInstance.hide();
} // End of handleAdminMemberModalEscape

function bindAdminMemberModalLayering() {
    if (window.__adminMemberModalLayeringBound) return;

    document.addEventListener('show.bs.modal', function (event) {
        markAdminMemberModalOpened(event.target);
        applyAdminMemberModalLayer(event.target);
    }, true);

    document.addEventListener('shown.bs.modal', function (event) {
        const shouldCloseAfterShown = event.target?.dataset?.adminMemberModalCloseAfterShown === '1';
        if (isAdminMemberManagedModal(event.target)) {
            event.target.removeAttribute('data-admin-member-modal-opening');
            event.target.removeAttribute('data-admin-member-modal-close-after-shown');
        }
        applyAdminMemberModalLayer(event.target);
        syncAdminMemberModalLayers();
        if (document.querySelectorAll('.modal.show').length > 0) {
            document.body.classList.add('modal-open');
        }
        if (shouldCloseAfterShown) {
            setTimeout(function () {
                const modalInstance = bootstrap.Modal.getInstance(event.target) || bootstrap.Modal.getOrCreateInstance(event.target);
                modalInstance.hide();
            }, 0);
            return;
        }
        requestAnimationFrame(focusTopAdminMemberModal);
    }, true);

    document.addEventListener('hide.bs.modal', function (event) {
        if (isAdminMemberManagedModal(event.target) && getOpenAdminMemberModals().length > 1) {
            adminMemberModalCloseInProgress = true;
        }
        moveFocusOutsideModal(event.target);
        requestAnimationFrame(function () {
            moveFocusOutsideModal(event.target);
        });
    }, true);

    document.addEventListener('hidden.bs.modal', function (event) {
        clearAdminMemberModalState(event.target);
        adminMemberModalCloseInProgress = false;
        const openModals = Array.from(document.querySelectorAll('.modal.show'));
        if (openModals.length > 0) {
            document.body.classList.add('modal-open');
            syncAdminMemberModalLayers();
            requestAnimationFrame(focusTopAdminMemberModal);
        }
    }, true);

    document.addEventListener('hidePrevented.bs.modal', function () {
        adminMemberModalCloseInProgress = false;
        syncAdminMemberModalLayers();
        requestAnimationFrame(focusTopAdminMemberModal);
    }, true);

    document.addEventListener('keydown', handleAdminMemberModalEscape, true);

    window.__adminMemberModalLayeringBound = true;
} // End of bindAdminMemberModalLayering
bindAdminMemberModalLayering();

let g_certGeneratorEnsurePromise = null;
let g_badgesEnsurePromise = null;
const BADGES_ASSET_VERSION = '20260331_01';

function isBadgesReady() {
    if (!window.Badges && typeof Badges !== 'undefined') {
        window.Badges = Badges;
    }
    return !!(
        window.Badges &&
        typeof window.Badges.getAll === 'function' &&
        typeof window.Badges.renderPill === 'function'
    );
}

function appendScriptAndWait(src, options) {
    return new Promise((resolve, reject) => {
        const forceReload = !!(options && options.forceReload);
        const abs = new URL(src, window.location.href).href;
        const existing = Array.from(document.scripts).find(s => s.src === abs);
        if (existing) {
            if (existing.dataset.loaded === '1') return resolve();
            if (forceReload) {
                existing.remove();
            } else {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('script load failed: ' + src)), { once: true });
                return;
            }
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => {
            s.dataset.loaded = '1';
            resolve();
        };
        s.onerror = () => {
            s.dataset.failed = '1';
            reject(new Error('script load failed: ' + src));
        };
        document.head.appendChild(s);
    });
}

async function ensureAdminMemberSpreadsheetReady() {
    try {
        await window.AdminMemberAssets.ensureSpreadsheet();
        return true;
    } catch (_) {
        myAlert('엑셀 도구를 불러오지 못했습니다. 입력한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.', 'error');
        return false;
    }
}

async function ensureCertGeneratorReady() {
    if (typeof window.jspdf?.jsPDF !== 'function') await window.AdminMemberAssets.ensurePdf();
    if (typeof generateContributionCert === 'function' && typeof generateDonationReceipt === 'function') return;
    if (!g_certGeneratorEnsurePromise) {
        g_certGeneratorEnsurePromise = (async () => {
            const routeOrigins = window.CoopRouteGuard ? CoopRouteGuard.buildSiteOrigins(window.location) : null;
            const publicOrigin = String(routeOrigins?.publicOrigin || '').trim().replace(/\/+$/, '');
            const remoteFallback = /^https?:\/\//i.test(publicOrigin)
                ? `${publicOrigin}/cert_generator.js?v=20261010_01`
                : 'https://www.yonginsolar.kr/cert_generator.js?v=20261010_01';
            const candidates = [
                '/cert_generator.js?v=20261010_01',
                '../cert_generator.js?v=20261010_01',
                remoteFallback
            ];
            for (const src of candidates) {
                try {
                    await appendScriptAndWait(src, { forceReload: true });
                } catch (_) {}
                if (typeof generateContributionCert === 'function' && typeof generateDonationReceipt === 'function') return;
            }
            throw new Error('cert_generator.js 최신본이 로드되지 않았습니다. 배포/캐시/경로를 확인해주세요.');
        })().catch((error) => {
            g_certGeneratorEnsurePromise = null;
            throw error;
        });
    }
    return g_certGeneratorEnsurePromise;
}

async function ensureBadgesReady() {
    if (isBadgesReady()) return;
    if (!g_badgesEnsurePromise) {
        g_badgesEnsurePromise = (async () => {
            const routeOrigins = window.CoopRouteGuard ? CoopRouteGuard.buildSiteOrigins(window.location) : null;
            const publicOrigin = String(routeOrigins?.publicOrigin || '').trim().replace(/\/+$/, '');
            const remoteFallback = /^https?:\/\//i.test(publicOrigin)
                ? `${publicOrigin}/badges.js?v=${BADGES_ASSET_VERSION}`
                : `https://www.yonginsolar.kr/badges.js?v=${BADGES_ASSET_VERSION}`;
            const candidates = [
                `/badges.js?v=${BADGES_ASSET_VERSION}`,
                `../badges.js?v=${BADGES_ASSET_VERSION}`,
                remoteFallback
            ];
            for (const src of candidates) {
                try {
                    await appendScriptAndWait(src);
                } catch (_) {}
                if (isBadgesReady()) return;
            }
            throw new Error('badges.js 최신본이 로드되지 않았습니다. 배포/캐시/경로를 확인해주세요.');
        })().catch((error) => {
            g_badgesEnsurePromise = null;
            throw error;
        });
    }
    return g_badgesEnsurePromise;
}

// 전역 변수
let g_members = [];
let g_member_import_rows = [];
let g_member_import_request_key = null;
let g_member_import_state = null;
let g_member_page = 0;
let g_member_page_size = 25;
let g_member_total_count = 0;
let g_member_fetch_revision = 0;
const ADMIN_MEMBER_SELECT_COLUMNS = [
    'id',
    'member_id',
    'name',
    'preferred_name',
    'preferred_name_position',
    'member_type',
    'phone',
    'email',
    'status',
    'join_date',
    'birth_date',
    'created_at',
    'address',
    'rrn_display',
    'corp_number',
    'business_number',
    'representative_name',
    'contact_name',
    'contact_position',
    'bank_name',
    'account_holder',
    'account_num_display',
    'admin_memo',
    'kakao_id',
    'naver_id',
    'join_category',
    'manager_id'
].join(',');

function createAdminBatchRequestKey(prefix) {
const safePrefix = String(prefix || 'batch').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'batch';
const randomPart = window.crypto && typeof window.crypto.randomUUID === 'function'
  ? window.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
return `${safePrefix}:${randomPart}`;
}
// 전역 변수
let g_plants = []; // [추가] 발전소 목록 기억용
let g_powerGenerationLogs = [];
let g_powerGenerationIntegrations = [];
let g_powerGenerationProviderCatalog = [];

const POWER_GENERATION_PROVIDER_FALLBACK_CATALOG = [
{
key: 'solaredge',
label: 'SolarEdge',
support_status: 'active',
summary: 'Monitoring API 기반 실동기화 지원',
docs_url: 'https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf'
},
{
key: 'sma',
label: 'SMA',
support_status: 'active',
summary: 'Monitoring API 기반 월별 일발전량 동기화 지원',
docs_url: 'https://developer.sma.de/'
},
{
key: 'fronius',
label: 'Fronius',
support_status: 'active',
summary: '공식 Solar API(JSON) 기준 오늘 발전량 동기화 지원',
docs_url: 'https://www.fronius.com/en/solar-energy/installers-partners/products/all-products/system-monitoring/open-interfaces/fronius-solar-api-json-'
},
{
key: 'enphase',
label: 'Enphase',
support_status: 'active',
summary: 'System API 기반 일별 발전량 동기화 지원',
docs_url: 'https://developer-v4.enphase.com/'
},
{
key: 'huawei_fusionsolar',
label: 'Huawei FusionSolar',
support_status: 'active',
summary: 'Northbound API 기반 일별 발전량 동기화 지원',
docs_url: 'https://support.huawei.com/enterprise/en/doc/EDOC1100440661/356f0ec1/fusionsolar-northbound-api-integration'
}
];

let g_badges = []; // DB에서 불러온 뱃지 목록을 기억해둠
const ADMIN_AUTO_MANAGED_BADGE_CODES = new Set(['educator', 'edu_steady', 'edu_master']);
let g_siteActivities = [];
let g_externalNewsAdmin = [];
let isSavingActivity = false;
let activityGalleryItems = [];
let activityGalleryObjectUrls = [];
let activityParticipationEvents = [];
let g_fund_page = 0; // [추가] 무한 스크롤 페이지 번호
const PAGE_SIZE = 20; // [추가] 한 번에 불러올 개수

const MEMBER_EXPORT_SHARE_UNIT_KEY = 'member_export_share_unit_amount';
const MEMBER_EXPORT_SECURE_PIN_MIN_LENGTH = 4;
let g_memberExportSecurePinConfigured = false;
let g_memberExportOrgName = '';

// [신규] 차트 인스턴스 관리용 (중복 생성 방지)
let g_charts = {
    capital: null,
    location: null,
    age: null,
    exit: null
};



// ★ [공통] 파일 업로드 함수 (한글 깨짐 방지 & 난수 이름 생성)
async function uploadFileToStorage(file, folderName) {
if (!file) return null;

// 1. 파일명 난수화 (예: '로고.png' -> 'partners/173901_x9z1a.png')
const fileExt = file.name.split('.').pop();
const randomName = Math.random().toString(36).substring(2, 10);
const safeFileName = `${folderName}/${Date.now()}_${randomName}.${fileExt}`;

// Keep the original; the public display copy is uploaded with the same authority.
if (window.CoopDisplayImages) return window.CoopDisplayImages.upload(_supabase,file,safeFileName);
// 2. 스토리지 업로드
const { error: uploadError } = await _supabase.storage.from('assets').upload(safeFileName, file);
if (uploadError) throw uploadError; // 에러 발생 시 호출한 곳으로 던짐

// 3. 공개 URL 반환
const { data } = _supabase.storage.from('assets').getPublicUrl(safeFileName);
return data.publicUrl;
}

// ★ [공통] 기존 파일 삭제 함수
async function deleteOldFile(fullUrl) {
if (!fullUrl) return;
try {
const path = fullUrl.split('/assets/')[1];
// Original image files are retained; replacing a display copy is not erasure.
if (path?.endsWith('.screen.webp')) await _supabase.storage.from('assets').remove([path]);
} catch (e) { CoopSafeLog.error("파일 삭제 오류:", e); }
}


// [신규] 관리자 활동 로그 기록
async function logAdminAction(type, target, details) {
    // site_member 조합은 조합별 erp_audit_logs를 사용한다.
    // 주 조합 전용 legacy admin_logs에 기록을 시도하면 RLS 오류와 교차 조합 혼동이 생긴다.
    if (isAdminMemberSiteProfile()) return;

    // 1. 현재 접속자 확인
    const userEmail = document.getElementById('adminProfile')
        ? document.getElementById('adminProfile').innerText
        : 'unknown';

    // 2. 로그 테이블에 Insert
    // (에러가 나도 사용자 흐름을 막지 않기 위해 await 없이 실행하거나 catch 처리)
    _supabase.from('admin_logs').insert({
        admin_email: userEmail,
        action_type: type, // VIEW, EDIT, DOWNLOAD, LOGIN
        target: target,
        details: details,
        ip_address: 'client-side' // 클라이언트에서 IP 확인은 어려우므로 일단 마킹
    }).then(({ error }) => {
        if(error) CoopSafeLog.error("로그 기록 실패:", error);
    });
}


// [권한 체크] RPC 함수로 보안 검증 (무한 루프 방지됨)
// [수정] 관리자 권한 체크 함수 (에러 방지 적용)
// [수정] 관리자 권한 체크 (방어 로직 강화 버전)
async function checkAdmin(user) {
// 1. [방어 코드] 인자로 user가 안 넘어왔다면, 스스로 다시 조회한다.
if (!user) {
const { data: { user: currentUser } } = await _supabase.auth.getUser();
user = currentUser;
}

// 2. 그래도 user가 없으면 로그인 안 된 상태 -> 튕겨냄
if (!user) {
location.href = 'index.html';
return;
}

// 3. 기존 로직 유지 (RPC 권한 체크)
showLoading(true);
const { data: role, error } = await _supabase.rpc('get_my_role');
showLoading(false);

    if (error) {
    CoopSafeLog.error("권한 조회 중 에러:", error);
    setAdminMemberBootMessage("권한 정보를 확인하지 못했습니다.\n연결 상태를 확인한 뒤 새로고침해 주세요.", true);
    return;
    }

// 4. 권한 분기 처리
if ((!permissionSet || permissionSet.size === 0) && user) {
    try {
        permissionSet = await loadAdminMemberPermissions(user);
        if (permissionSet.size > 0) {
            localStorage.setItem('erp_permissions', JSON.stringify(Array.from(permissionSet)));
        }
    } catch (_) {}
}
let cachedRole = '';
try {
    cachedRole = String(JSON.parse(localStorage.getItem('erp_user') || 'null')?.role || '').toLowerCase();
} catch (_) { cachedRole = ''; }
const cachedRoleIsAdmin = cachedRole === 'admin' || cachedRole === 'admin_all';
let hasScopedPermission = false;
if (permissionSet && permissionSet.size > 0) {
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin') {
        hasScopedPermission = permissionSet.has('member.admin');
    } else if (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin') {
        hasScopedPermission = permissionSet.has('site.admin') || permissionSet.has('member.admin');
    } else if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') {
        hasScopedPermission = permissionSet.has('documents.manage') || permissionSet.has('site.admin') || permissionSet.has('member.admin');
    } else {
        hasScopedPermission = permissionSet.has('member.admin') || permissionSet.has('site.admin');
    }
}

if (role === 'admin' || role === 'admin_all' || cachedRoleIsAdmin || hasScopedPermission) {
// (1) 로그인 게이트 숨김 (Null 체크 추가로 안전성 확보)
const loginGate = document.getElementById('login-gate');
if (loginGate) loginGate.classList.add('hidden');

const bootGate = document.getElementById('admin-boot-gate');
if (bootGate) {
bootGate.classList.add('hidden');
bootGate.setAttribute('aria-hidden', 'true');
bootGate.setAttribute('aria-busy', 'false');
}

// (2) 메인 시스템 노출
const mainSystem = document.getElementById('main-system');
if (mainSystem) mainSystem.classList.remove('hidden');

// (3) 프로필 이메일 표시 (여기서 에러 났었음 -> 이제 안전함)
const profileEl = document.getElementById('adminProfile');
if (profileEl && user.email) {
profileEl.innerText = user.email;
}

// (4) 데이터 로드 시작
// 초기 탭이 명부라면 로드 안 함(검색 유도), 대시보드라면 로드
// (fetchMembers()를 무조건 호출하던 기존 로직을 존중하되,
//  아까 변경한 탭 로직과 충돌나지 않게 탭 상태를 보고 결정하거나 일단 호출)
//  fetchMembers();

} else {
// 권한 없음 처리
    myAlert(`⛔ 접근 거부: 관리자 권한이 없습니다. (계정: ${user.email})`, 'error');
location.href = 'index.html';
}
}

function setAdminMemberBootMessage(message, isError) {
const bootGate = document.getElementById('admin-boot-gate');
const bootCard = document.getElementById('adminBootCard');
const messageEl = document.getElementById('adminBootMessage');
if (bootGate) {
bootGate.classList.remove('hidden');
bootGate.removeAttribute('aria-hidden');
bootGate.setAttribute('aria-busy', isError ? 'false' : 'true');
}
if (bootCard) bootCard.classList.toggle('is-error', !!isError);
if (messageEl) messageEl.textContent = String(message || '관리 화면을 준비하고 있습니다.');
} // End of setAdminMemberBootMessage

// [로그인] 매직링크 전송
async function sendLoginLink() {
const email = document.getElementById('adminEmail').value;
const otpArea = document.getElementById('adminOtpArea');
    if(!email) return myAlert('이메일을 입력하세요.', 'warning');
const btn = document.getElementById('btnLogin');
btn.innerText = "전송중..."; btn.disabled = true;

const { error } = await _supabase.auth.signInWithOtp({
email,
options: {
...window.CoopAuthEmail.withOtpOptions({ shouldCreateUser: true })
}
});

    if(error) {
    myAlert(error.message, 'error'); btn.innerText = "인증코드 받기"; btn.disabled = false;
    } else {
pendingAdminOtpEmail = String(email || '').trim().toLowerCase();
if (otpArea) otpArea.classList.remove('hidden');
document.getElementById('loginMsg').innerText = "메일로 받은 인증코드를 아래에 입력해 주세요.";
document.getElementById('loginMsg').style.display = 'block';
btn.innerText = "인증코드 다시 받기";
btn.disabled = false;
}
}

async function verifyAdminOtp() {
const email = String(pendingAdminOtpEmail || document.getElementById('adminEmail')?.value || '').trim().toLowerCase();
const token = String(document.getElementById('adminOtpInput')?.value || '').trim();
const btn = document.getElementById('btnVerifyAdminOtp');
if (!email) return myAlert('먼저 이메일로 인증코드를 받아주세요.', 'warning');
if (!token) return myAlert('메일로 받은 인증코드를 입력하세요.', 'warning');

btn.disabled = true;
btn.innerText = '확인중...';
try {
const { data, error } = await _supabase.auth.verifyOtp({
email,
token,
type: 'email'
});
if (error) {
    myAlert(error.message, 'error');
    return;
}
const user = data?.user || (await _supabase.auth.getUser()).data?.user || null;
if (!user) {
    myAlert('인증은 완료되었지만 세션을 확인하지 못했습니다. 다시 시도해 주세요.', 'error');
    return;
}
await checkAdmin(user);
} catch (error) {
myAlert('인증 실패: ' + (error?.message || error), 'error');
} finally {
btn.disabled = false;
btn.innerText = '코드 확인';
}
}

// ================================================================
// [기능 1] 조합원 관리 (RPC 사용)
// ================================================================


// 회원 수정 모달 열기
function openMemberEdit(id) {
const m = g_members.find(x => x.id === id);
if(!m) return;
document.getElementById('edit-id').value = m.id;
document.getElementById('edit-name').value = m.name;
document.getElementById('edit-phone').value = m.phone;
document.getElementById('edit-status').value = m.status;
document.getElementById('edit-note').value = m.note || '';
new bootstrap.Modal(document.getElementById('memberEditModal')).show();
}

// 회원 정보 저장 (RPC 호출)
async function saveMember() {
const updates = {
p_id: document.getElementById('edit-id').value,
p_name: document.getElementById('edit-name').value,
p_phone: document.getElementById('edit-phone').value,
p_status: document.getElementById('edit-status').value,
p_note: document.getElementById('edit-note').value
};

showLoading(true);
const { error } = await _supabase.rpc('update_member_secure', updates);
showLoading(false);

    if(error) myAlert('저장 실패: ' + error.message, 'error');
    else {
    myAlert('저장되었습니다.');
bootstrap.Modal.getInstance(document.getElementById('memberEditModal')).hide();
fetchMembers();
}
}

// 엑셀 다운로드 (보안/일반)
function getSelectedExcelOption() {
    return document.querySelector('input[name="excelOption"]:checked')?.value || 'public';
} // End of getSelectedExcelOption

function setMemberExportPinStatus(ready) {
    g_memberExportSecurePinConfigured = ready === true;
    document.getElementById('memberExportPinSetup')?.classList.toggle('d-none', ready !== false);
    document.getElementById('memberExportPinReset')?.classList.toggle('d-none', ready !== true);
    const save = document.getElementById('memberExportPinSave');
    if (save) save.disabled = ready !== false;
    const badge = document.getElementById('memberExportPinStatus');
    if (!badge) return;
    if (ready === null) {
        badge.className = 'badge bg-secondary';
        badge.textContent = '확인 중';
        return;
    }
    if (ready) {
        badge.className = 'badge bg-success';
        badge.textContent = 'PIN 설정됨';
        return;
    }
    badge.className = 'badge bg-secondary';
    badge.textContent = '미설정';
} // End of setMemberExportPinStatus

function syncExcelOptionState() {
    const selected = getSelectedExcelOption();
    const isSecret = selected === 'secret';
    const isCityReport = selected === 'city-report';
    const isSms = selected === 'sms';
    const pwdArea = document.getElementById('pwdArea');
    const cutoffField = document.getElementById('memberExportCutoffDateField');
    const reportYearField = document.getElementById('memberExportReportYearField');
    if (pwdArea) pwdArea.style.display = isSecret ? 'block' : 'none';
    if (cutoffField) cutoffField.classList.toggle('d-none', isCityReport);
    if (reportYearField) reportYearField.classList.toggle('d-none', !isCityReport);
    document.getElementById('memberExportCapitalField')?.classList.toggle('d-none', isSms);
    document.getElementById('memberExportPinPanel')?.classList.toggle('d-none', isSms);
} // End of syncExcelOptionState

function togglePwd(show) {
    const selected = getSelectedExcelOption();
    if (selected === 'secret') {
        syncExcelOptionState();
        return;
    }
    const pwdArea = document.getElementById('pwdArea');
    if (pwdArea) pwdArea.style.display = show ? 'block' : 'none';
} // End of togglePwd

function getTodayIsoDate() {
    return getAdminMemberKstDateString();
} // End of getTodayIsoDate

function getCurrentYearText() {
    return getAdminMemberKstDateString().slice(0, 4);
} // End of getCurrentYearText

function normalizeMemberExportReportYear(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}$/.test(raw)) return '';
    return raw;
} // End of normalizeMemberExportReportYear

function buildMemberExportCityReportCutoffDate(yearText) {
    const safeYear = normalizeMemberExportReportYear(yearText);
    if (!safeYear) return '';
    return `${safeYear}-12-31`;
} // End of buildMemberExportCityReportCutoffDate

function getMemberExportCutoffDate() {
    if (getSelectedExcelOption() === 'city-report') {
        const reportYearInput = document.getElementById('memberExportReportYear');
        return buildMemberExportCityReportCutoffDate(reportYearInput?.value);
    }
    const input = document.getElementById('memberExportCutoffDate');
    return String(input?.value || '').trim();
} // End of getMemberExportCutoffDate

function formatMemberExportCutoffDate(dateText) {
    const safe = String(dateText || '').trim();
    if (!safe) return '-';
    return safe.replace(/-/g, '.');
} // End of formatMemberExportCutoffDate

function normalizeMemberExportShareUnitAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric);
} // End of normalizeMemberExportShareUnitAmount

function formatMemberExportRatio(ratio) {
    const numeric = Number(ratio);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
} // End of formatMemberExportRatio

function formatMemberExportShareCount(capitalAmount, shareUnitAmount) {
    const capital = Number(capitalAmount || 0);
    const unit = normalizeMemberExportShareUnitAmount(shareUnitAmount);
    if (!unit) return '';
    return Number((capital / unit).toFixed(3));
} // End of formatMemberExportShareCount

function formatMemberExportBirthDateText(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '.') + '.';
    if (/^\d{4}\.\d{2}\.\d{2}\.?$/.test(raw)) return raw.endsWith('.') ? raw : `${raw}.`;
    return '-';
} // End of formatMemberExportBirthDateText

function formatMemberExportBirthDateFromRrnDisplay(rrnDisplay) {
    const raw = String(rrnDisplay || '').trim();
    const match = raw.match(/^(\d{2})(\d{2})(\d{2})-(\d)/);
    if (!match) return '-';
    const [, yy, mm, dd, centuryCode] = match;
    const centuryMap = {
        '1': '19',
        '2': '19',
        '5': '19',
        '6': '19',
        '3': '20',
        '4': '20',
        '7': '20',
        '8': '20',
        '9': '18',
        '0': '18'
    };
    const century = centuryMap[centuryCode];
    if (!century) return '-';
    return `${century}${yy}.${mm}.${dd}.`;
} // End of formatMemberExportBirthDateFromRrnDisplay

function formatMemberExportAmountDisplay(value) {
    const normalized = String(value ?? '').replace(/,/g, '').trim();
    const amount = Number(normalized || 0);
    if (!Number.isFinite(amount)) return '0';
    return amount.toLocaleString('ko-KR');
} // End of formatMemberExportAmountDisplay

function formatMemberExportIdentityValue(record) {
    const memberType = String(record?.member_type || '').trim();
    if (memberType === '단체') {
        return String(record?.corp_number || record?.business_number || '-').trim() || '-';
    }
    const birthDateText = formatMemberExportBirthDateText(record?.birth_date);
    if (birthDateText !== '-') return birthDateText;
    return formatMemberExportBirthDateFromRrnDisplay(record?.rrn_display);
} // End of formatMemberExportIdentityValue

function buildMemberExportWorksheet(exportType, rows, options = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (exportType !== 'city-report') {
        const ws = XLSX.utils.json_to_sheet(safeRows);
        const wscols = Object.keys(safeRows[0] || {}).map(() => ({ wch: 16 }));
        ws['!cols'] = wscols;
        return ws;
    }

    const shareUnitAmount = normalizeMemberExportShareUnitAmount(options.shareUnitAmount) || 0;
    const coopName = String(options.coopName || '').trim() || '협동조합';
    const aoa = [
        ['', '', `${coopName} 출자자 명부`],
        [`* 1좌당 금액: ${shareUnitAmount.toLocaleString()}원`, '', '', '', '', '(단위: 좌, 원, %)'],
        [],
        ['연번', '성명(법인명)', '생년월일(법인등록번호)', '출자좌수', '출자금액', '비율']
    ];

    safeRows.forEach((row) => {
        aoa.push([
            row['연번'] || '',
            row['성명(법인명)'] || '',
            row['생년월일(법인등록번호)'] || '',
            row['출자좌수'] || '',
            formatMemberExportAmountDisplay(row['출자금액']),
            row['비율'] || 0
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 8 },
        { wch: 18 },
        { wch: 20 },
        { wch: 12 },
        { wch: 14 },
        { wch: 10 }
    ];
    ws['!merges'] = [
        { s: { r: 0, c: 2 }, e: { r: 0, c: 5 } }
    ];
    return ws;
} // End of buildMemberExportWorksheet

async function loadMemberExportModalSettings() {
    const cutoffInput = document.getElementById('memberExportCutoffDate');
    const reportYearInput = document.getElementById('memberExportReportYear');
    const shareUnitInput = document.getElementById('memberExportShareUnitAmount');
    if (cutoffInput && !cutoffInput.value) cutoffInput.value = getTodayIsoDate();
    if (reportYearInput && !reportYearInput.value) reportYearInput.value = getCurrentYearText();
    if (shareUnitInput) shareUnitInput.value = '';
    setMemberExportPinStatus(null);
    g_memberExportOrgName = '';

    try {
        const { data: companyConfigs, error: shareError } = await scopeAdminTenant(
            _supabase
                .from('ref_company_info')
                .select('key, value')
                .in('key', [MEMBER_EXPORT_SHARE_UNIT_KEY, 'company_name', 'orgName'])
        );
        if (shareError) throw shareError;
        const configMap = new Map((companyConfigs || []).map((row) => [String(row.key || '').trim(), row.value]));
        await refreshMemberCapitalDisplays();
        g_memberExportOrgName = String(configMap.get('company_name') || configMap.get('orgName') || '').trim();
    } catch (error) {
        CoopSafeLog.warn("member export share unit load failed:", error);
    }

    try {
        const { data: pinReady, error: pinError } = await _supabase.rpc('member_export_secure_pin_status');
        if (pinError) throw pinError;
        setMemberExportPinStatus(!!pinReady);
    } catch (error) {
        CoopSafeLog.warn("member export secure pin status failed:", error);
        setMemberExportPinStatus(null);
        document.getElementById('memberExportPinStatus').textContent = '확인 실패 · 다시 열어 주세요';
    }
    syncExcelOptionState();
} // End of loadMemberExportModalSettings

async function saveMemberExportSecurePin() {
    const input = document.getElementById('memberExportSecurePin');
    const pin = String(input?.value || '').trim();
    if (pin.length < MEMBER_EXPORT_SECURE_PIN_MIN_LENGTH) {
        myAlert(`PIN은 ${MEMBER_EXPORT_SECURE_PIN_MIN_LENGTH}자리 이상 입력해주세요.`, 'warning');
        return false;
    }
    showLoading(true);
    try {
        const { error } = await _supabase.rpc('member_export_set_secure_pin', { p_pin: pin });
        if (error) throw error;
        setMemberExportPinStatus(true);
        window.MemberExportPinUI?.clear();
        if (input) input.value = '';
        myAlert('보안 엑셀 PIN이 저장되었습니다.');
        return true;
    } catch (error) {
        myAlert('보안 엑셀 PIN 저장 실패: ' + error.message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
} // End of saveMemberExportSecurePin

async function openExcelModal() {
    await loadMemberExportModalSettings();
    syncExcelOptionState();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('excelModal')).show();
} // End of openExcelModal

async function fetchMemberCapitalSnapshotByDate(cutoffDate) {
    const safeCutoffDate = String(cutoffDate || '').trim();
    const snapshotMap = {};
    if (!safeCutoffDate) return snapshotMap;
    const snapshotRequest = isAdminMemberSiteProfile()
        ? _supabase.rpc('member_export_capital_snapshot_secure', { p_cutoff_date: safeCutoffDate })
        : scopeAdminTenant(
            _supabase
                .from('ref_members')
                .select('member_id, amount')
                .lte('deposit_date', safeCutoffDate)
        );
    const { data, error } = await snapshotRequest;
    if (error) throw error;
    (data || []).forEach((row) => {
        const memberId = String(row.member_id || '').trim();
        if (!memberId) return;
        const amount = Number(row.total_capital ?? row.amount ?? 0);
        snapshotMap[memberId] = isAdminMemberSiteProfile()
            ? amount
            : (snapshotMap[memberId] || 0) + amount;
    });
    return snapshotMap;
} // End of fetchMemberCapitalSnapshotByDate

async function fetchAllMembersForExport() {
    const { data: members, error } = await scopeAdminTenant(
        _supabase
            .from('coop_members')
            .select([
                'id',
                'member_id',
                'name',
                'member_type',
                'phone',
                'email',
                'status',
                'join_date',
                'birth_date',
                'address',
                'rrn_display',
                'corp_number',
                'business_number',
                'bank_name',
                'account_holder',
                'account_num_display'
            ].join(','))
            .neq('status', '승인대기')
            .order('name', { ascending: true })
    );
    if (error) throw error;

    const list = Array.isArray(members) ? members : [];
    const memberUids = list.map((row) => row.id).filter(Boolean);
    const capitalMap = {};

    if (memberUids.length > 0) {
        const { data: assets, error: assetError } = await _supabase
            .from('view_my_assets')
            .select('member_uid, total_capital')
            .in('member_uid', memberUids);
        if (assetError) throw assetError;
        (assets || []).forEach((row) => {
            capitalMap[String(row.member_uid || '')] = Number(row.total_capital || 0);
        });
    }

    return list.map((row) => ({
        ...row,
        total_capital: capitalMap[String(row.id || '')] || 0,
        account_number: row.account_num_display || null
    }));
} // End of fetchAllMembersForExport

function normalizeMemberExportDateValue(value) {
    const safeValue = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : '';
} // End of normalizeMemberExportDateValue

function filterMemberExportRecordsByCutoffDate(records, cutoffDate) {
    const safeRecords = Array.isArray(records) ? records : [];
    const safeCutoffDate = normalizeMemberExportDateValue(cutoffDate);
    if (!safeCutoffDate) return safeRecords.slice();
    return safeRecords.filter((record) => {
        const joinDate = normalizeMemberExportDateValue(record?.join_date);
        return Boolean(joinDate) && joinDate <= safeCutoffDate;
    });
} // End of filterMemberExportRecordsByCutoffDate

function buildMemberExportRows(records, options = {}) {
    const safeRecords = Array.isArray(records) ? records : [];
    const cutoffDate = String(options.cutoffDate || '').trim();
    const cutoffLabel = formatMemberExportCutoffDate(cutoffDate);
    const shareUnitAmount = normalizeMemberExportShareUnitAmount(options.shareUnitAmount);
    const snapshotMap = options.snapshotMap || {};
    const exportType = String(options.exportType || 'public');
    const eligibleRecords = filterMemberExportRecordsByCutoffDate(safeRecords, cutoffDate);

    const normalizedRecords = eligibleRecords.map((record) => {
        const memberId = String(record.member_id || '').trim();
        const capitalAmount = Number(snapshotMap[memberId] ?? record.total_capital ?? 0);
        return {
            ...record,
            member_id: memberId,
            capitalAmount
        };
    });

    const totalCapital = normalizedRecords.reduce((sum, record) => sum + Number(record.capitalAmount || 0), 0);
    const overLimitMembers = [];

    const rows = normalizedRecords.map((record) => {
        const ratio = totalCapital > 0 ? (Number(record.capitalAmount || 0) / totalCapital) * 100 : 0;
        const normalizedRatio = formatMemberExportRatio(ratio);
        const overLimit = normalizedRatio > 30;
        if (overLimit) {
            overLimitMembers.push({ name: record.name || '-', ratio: normalizedRatio });
        }

        const commonFields = {
            "조합원번호": record.member_id || '-',
            "이름": record.name || '-',
            "유형": record.member_type || '-',
            "상태": record.status || '-',
            "가입일": record.join_date || '',
            "기준일": cutoffLabel,
            "출자좌수": formatMemberExportShareCount(record.capitalAmount, shareUnitAmount),
            "출자금액": formatMemberExportAmountDisplay(record.capitalAmount),
            "비율(%)": normalizedRatio,
            "30% 초과 여부": overLimit ? '주의' : ''
        };

        if (exportType === 'secret') {
            return {
                ...commonFields,
                "연락처": record.phone || '-',
                "주소": record.address || '-',
                "주민/사업자번호(전체)": record.decrypted_rrn || '-',
                "은행명": record.bank_name || '-',
                "예금주": record.account_holder || '-',
                "계좌번호(전체)": record.decrypted_account || '-'
            };
        }

        if (exportType === 'city-report') {
            return {
                "연번": 0,
                "성명(법인명)": record.name || '-',
                "생년월일(법인등록번호)": formatMemberExportIdentityValue(record),
                "출자좌수": formatMemberExportShareCount(record.capitalAmount, shareUnitAmount),
                "출자금액": formatMemberExportAmountDisplay(record.capitalAmount),
                "비율": normalizedRatio,
                "30% 초과 여부": overLimit ? '주의' : ''
            };
        }

        return {
            ...commonFields,
            "연락처": record.phone || '-',
            "주소": record.address || '-'
        };
    });

    if (exportType === 'city-report') {
        rows.forEach((row, index) => {
            row['연번'] = index + 1;
        });
    }

    return { rows, overLimitMembers, totalCapital };
} // End of buildMemberExportRows

function resetMemberCreateForm() {
const defaults = {
    'create-member-type': '개인',
    'create-personal-name': '',
    'create-personal-email': '',
    'create-personal-phone': '',
    'create-personal-rrn': '',
    'create-personal-address': '',
    'create-group-name': '',
    'create-group-email': '',
    'create-group-phone': '',
    'create-group-representative-name': '',
    'create-group-contact-name': '',
    'create-group-contact-position': '',
    'create-group-biz-num': '',
    'create-group-corp-num': '',
    'create-group-address': '',
    'create-status': '정상',
    'create-member-id': '',
    'create-join-category': '일반',
    'create-admin-memo': ''
};
Object.entries(defaults).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
});
const sameContact = document.getElementById('create-group-contact-same');
if (sameContact) sameContact.checked = false;
syncCreateGroupContactFromRepresentative();
syncCreateMemberTypeFields();
}

function openCreateMemberModal() {
const owner = memberDetailOwner();
if (!owner || memberCreateSaving) return;
if (memberCreateState?.owner !== owner) {
    resetMemberCreateForm();
    memberCreateState = {owner, baseline:memberCreateSnapshot()};
}
document.querySelectorAll('#memberCreateModal input,#memberCreateModal select,#memberCreateModal textarea,#memberCreateModal button')
    .forEach(node => { node.disabled = false; });
syncCreateGroupContactFromRepresentative();
syncCreateMemberTypeFields();
syncMemberCreateDraftButton();
bootstrap.Modal.getOrCreateInstance(document.getElementById('memberCreateModal')).show();
}

function getCreateMemberType() {
const type = String(document.getElementById('create-member-type')?.value || '개인').trim();
return type === '단체' ? '단체' : '개인';
}

function syncCreateMemberTypeFields() {
const isGroup = getCreateMemberType() === '단체';
const personalBox = document.getElementById('create-personal-fields');
const groupBox = document.getElementById('create-group-fields');
if (personalBox) personalBox.classList.toggle('d-none', isGroup);
if (groupBox) groupBox.classList.toggle('d-none', !isGroup);
}

function syncCreateGroupContactFromRepresentative() {
const sameCheckbox = document.getElementById('create-group-contact-same');
const representativeInput = document.getElementById('create-group-representative-name');
const contactInput = document.getElementById('create-group-contact-name');
if (!sameCheckbox || !representativeInput || !contactInput) return;

const isSame = sameCheckbox.checked;
contactInput.readOnly = isSame;
contactInput.classList.toggle('bg-light', isSame);
if (isSame) contactInput.value = representativeInput.value;
} // End of syncCreateGroupContactFromRepresentative

function normalizeRrnDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 13) return '';
return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function normalizeBusinessNumberDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 10) return '';
return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeCorpNumberDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 13) return '';
return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function maskRrnDisplay(rrnDisplay) {
const normalized = normalizeRrnDisplay(rrnDisplay);
if (!normalized) return '-';
return `${normalized.slice(0, 8)}******`;
}

function openMemberImportModal() {
const owner = memberDetailOwner();
if (!owner) return;
if (!g_member_import_state || g_member_import_state.owner !== owner) {
    resetMemberImportDraft();
    g_member_import_state = {owner, revision:0, file:null, phase:'ready', message:'', attempt:null, confirmation:null};
}
const modal = document.getElementById('memberImportModal');
if (!modal) return;
if (modal.dataset.importGuardBound !== '1') {
    modal.dataset.importGuardBound = '1';
    modal.addEventListener('hide.bs.modal', event => {
        if (g_member_import_state?.phase === 'saving') event.preventDefault();
        else pauseMemberImportRead();
    });
}
syncMemberImportUi();
bootstrap.Modal.getOrCreateInstance(modal).show();
if (g_member_import_state.phase === 'file_pending') {
    void readMemberImportExcel(document.getElementById('member-import-file'));
}
}

function resetMemberImportDraft() {
if (g_member_import_state) g_member_import_state.revision++;
g_member_import_state = null;
g_member_import_rows = [];
g_member_import_request_key = null;
const input = document.getElementById('member-import-file');
if (input) { input.value = ''; input.disabled = true; }
const filter = document.getElementById('member-import-filter');
if (filter) filter.value = 'all';
for (const id of ['member-import-tbody','member-import-count','member-import-summary','member-import-status']) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
}
const preview = document.getElementById('member-import-preview');
if (preview) preview.style.display = 'none';
syncMemberImportUi();
}

function isCurrentMemberImport(state, revision = state?.revision, visible = false) {
return !!state && g_member_import_state === state && state.revision === revision
    && state.owner === memberDetailOwner()
    && (!visible || (document.getElementById('memberImportModal')?.classList.contains('show')
        && (!window.frameElement || !window.frameElement.hidden)));
}

function hasMemberImportDraft() {
const state = g_member_import_state;
return !!state && isCurrentMemberImport(state) && !!(state.file || g_member_import_rows.length || state.attempt);
}

function pauseMemberImportRead() {
const state = g_member_import_state;
if (!state || state.phase === 'saving') return;
state.revision++;
state.confirmation = null;
if (['reading','checking','preparing'].includes(state.phase)) {
    state.phase = g_member_import_rows.length ? 'check_failed' : 'file_pending';
    state.message = g_member_import_rows.length ? '검사를 다시 진행해 주세요.' : '파일을 다시 읽을 준비가 됐습니다.';
} else if (state.phase === 'confirming') state.phase = state.attempt ? 'unknown' : 'ready';
syncMemberImportUi();
}

function syncMemberImportUi() {
const state = g_member_import_state;
const busy = !!state && ['reading','checking','preparing','confirming','saving'].includes(state.phase);
const locked = !state || ['preparing','confirming','saving','unknown'].includes(state.phase);
const file = document.getElementById('member-import-file');
if (file) file.disabled = locked;
const button = document.getElementById('member-import-submit');
if (button) {
    button.textContent = state?.phase === 'unknown' ? '결과 다시 확인'
        : g_member_import_rows.some(row => row.server_error) ? '실패 행 다시 등록' : '업로드 적용';
    button.disabled = !state || busy || state.phase === 'check_failed' || !g_member_import_rows.some(row => row.valid);
}
const retry = document.getElementById('member-import-recheck');
if (retry) {
    retry.hidden = !state || !['check_failed','file_pending'].includes(state.phase);
    retry.disabled = busy;
}
const status = document.getElementById('member-import-status');
if (status) status.textContent = state?.message || (state?.file ? '작성 중' : '');
document.querySelectorAll('#memberImportModal [data-bs-dismiss="modal"]').forEach(node => {
    node.disabled = state?.phase === 'saving';
});
}

async function saveNewMember() {
const state = memberCreateState;
if (memberCreateSaving || !state || state.owner !== memberDetailOwner()) return;
const memberType = getCreateMemberType();
const isGroup = memberType === '단체';
const name = isGroup
    ? (document.getElementById('create-group-name')?.value || '').trim()
    : (document.getElementById('create-personal-name')?.value || '').trim();
const email = isGroup
    ? (document.getElementById('create-group-email')?.value || '').trim()
    : (document.getElementById('create-personal-email')?.value || '').trim();
const phone = isGroup
    ? (document.getElementById('create-group-phone')?.value || '').trim()
    : (document.getElementById('create-personal-phone')?.value || '').trim();
const address = isGroup
    ? (document.getElementById('create-group-address')?.value || '').trim()
    : (document.getElementById('create-personal-address')?.value || '').trim();
const rrn = normalizeRrnDisplay(document.getElementById('create-personal-rrn')?.value || '');
const businessNumber = normalizeBusinessNumberDisplay(document.getElementById('create-group-biz-num')?.value || '');
const corpNumber = normalizeCorpNumberDisplay(document.getElementById('create-group-corp-num')?.value || '');
const representativeName = isGroup
    ? (document.getElementById('create-group-representative-name')?.value || '').trim()
    : '';
const contactName = isGroup
    ? (document.getElementById('create-group-contact-name')?.value || '').trim()
    : '';
const contactPosition = isGroup
    ? (document.getElementById('create-group-contact-position')?.value || '').trim()
    : '';

const payload = {
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_birth_date: null,
    p_member_type: memberType,
    p_status: document.getElementById('create-status')?.value || '정상',
    p_address: address || null,
    p_member_id: (document.getElementById('create-member-id')?.value || '').trim() || null,
    p_join_category: (document.getElementById('create-join-category')?.value || '').trim() || '일반',
    p_admin_memo: (document.getElementById('create-admin-memo')?.value || '').trim() || null,
    p_rrn: isGroup ? null : rrn,
    p_business_number: isGroup ? businessNumber || null : null,
    p_corp_number: isGroup ? corpNumber || null : null,
    p_join_date: null,
    p_representative_name: isGroup ? representativeName : null,
    p_contact_name: isGroup ? contactName : null,
    p_contact_position: isGroup ? contactPosition : null
};

if (!payload.p_name) return myAlert(isGroup ? '단체명을 입력하세요.' : '이름을 입력하세요.', 'warning');
if (!payload.p_email) return myAlert('이메일을 입력하세요.', 'warning');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.p_email)) {
    return myAlert('올바른 이메일 형식을 입력하세요.', 'warning');
}
if (!isGroup && /[0-9]/.test(payload.p_name)) {
    return myAlert('개인 이름에는 숫자를 포함할 수 없습니다.', 'warning');
}
if (!isGroup && !payload.p_rrn) {
    return myAlert('개인 등록에는 주민등록번호가 필요합니다.', 'warning');
}
if (isGroup && !payload.p_business_number) {
    return myAlert('단체 등록에는 사업자번호가 필요합니다.', 'warning');
}
if (isGroup && !payload.p_representative_name) {
    return myAlert('단체 대표자명을 입력하세요.', 'warning');
}
if (isGroup && !payload.p_contact_name) {
    return myAlert('단체 담당자명을 입력하세요.', 'warning');
}
if (isGroup && !payload.p_contact_position) {
    return myAlert('담당자 직함 또는 역할을 입력하세요.', 'warning');
}
if (isGroup && document.getElementById('create-group-corp-num')?.value && !payload.p_corp_number) {
    return myAlert('법인번호는 숫자 13자리로 입력해주세요.', 'warning');
}

const submitted = memberCreateSnapshot();
const controls = Array.from(document.querySelectorAll('#memberCreateModal input,#memberCreateModal select,#memberCreateModal textarea,#memberCreateModal button'))
    .map(node => [node,node.disabled]);
memberCreateSaving = true;
controls.forEach(([node]) => { node.disabled = true; });
showLoading(true);
try {
    const { error } = await _supabase.rpc('create_member_secure_v3', payload);
    if (error) throw error;
    if (memberCreateState !== state || state.owner !== memberDetailOwner()) return;
    // Normally inputs are locked. Preserve any later programmatic input as a new draft.
    const unchanged = memberCreateSnapshot() === submitted;
    if (unchanged) resetMemberCreateForm();
    state.baseline = unchanged ? memberCreateSnapshot() : submitted;
    if (unchanged) memberCreateFields().forEach(node => window.ErpWorkspaceResume?.checkpoint(node));
    myAlert('조합원이 등록되었습니다.');
    if (unchanged) {
        memberCreateSaving = false;
        bootstrap.Modal.getInstance(document.getElementById('memberCreateModal'))?.hide();
    }
    void fetchMembers();
} catch (error) {
    if (memberCreateState === state && state.owner === memberDetailOwner()) {
        CoopSafeLog.error('[erp/admin_member] operation failed', error);
        myAlert('조합원 등록 실패: ' + (error.hint || error.message), 'error');
    }
} finally {
    const current = memberCreateState === state && state.owner === memberDetailOwner();
    controls.forEach(([node,disabled]) => { if (node.isConnected) node.disabled = current ? disabled : true; });
    memberCreateSaving = false;
    syncMemberCreateDraftButton();
    showLoading(false);
}
}

async function downloadMemberImportTemplate() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
const wsData = [
  ['유형', '이름', '단체명', '주민등록번호', '이메일', '연락처', '사업자번호', '법인번호', '상태', '주소', '조합원번호', '가입구분', '가입일', '관리메모', '대표자명', '담당자명', '담당자 직함'],
  ['개인', '예시 개인', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['단체', '', '예시 단체', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
];
const ws = XLSX.utils.aoa_to_sheet(wsData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '조합원등록');
XLSX.writeFile(wb, '조합원_등록_양식.xlsx');
}

function normalizeMemberImportDate(value) {
if (value === null || value === undefined || value === '') return null;

if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (parsed && parsed.y && parsed.m && parsed.d) {
    return normalizeMemberImportDate(`${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`);
  }
}

if (value instanceof Date && !isNaN(value.getTime())) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

const raw = String(value).trim();
if (!raw) return null;
const normalized = raw.replace(/\./g, '-').replace(/\//g, '-');
const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
if (match) {
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day); parsed.setUTCHours(0,0,0,0);
  if (year >= 1 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
}
return null;
}

function normalizeMemberImportPhone(value) {
const digits = String(value ?? '').replace(/\D/g, '');
if (!digits) return '';
const fixed = digits.length === 10 && !digits.startsWith('0') ? `0${digits}` : digits;
if (fixed.length === 11) return `${fixed.slice(0,3)}-${fixed.slice(3,7)}-${fixed.slice(7)}`;
if (fixed.length === 10) return `${fixed.slice(0,3)}-${fixed.slice(3,6)}-${fixed.slice(6)}`;
return fixed;
}

function normalizeMemberImportRow(row, index) {
const pick = (...keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
};

const joinDateRaw = pick('가입일', 'join_date');
const memberType = String(pick('유형', 'member_type')).trim();
const status = String(pick('상태', 'status')).trim();
const isGroup = memberType === '단체';
const rrnRaw = pick('주민등록번호', '주민번호', 'rrn');
const businessRaw = pick('사업자번호', '사업자등록번호', '고유번호', '사업자·고유번호', 'business_number');
const corpRaw = pick('법인번호', '법인등록번호', 'corp_number');
const phoneRaw = String(pick('연락처', '전화번호', 'phone')).trim();
const name = isGroup
  ? String(pick('단체명', '법인명', '상호', '이름', 'name')).trim()
  : String(pick('이름', '성명', 'name', '단체명')).trim();
const rrn = normalizeRrnDisplay(rrnRaw);
const businessNumber = normalizeBusinessNumberDisplay(businessRaw);
const corpNumber = normalizeCorpNumberDisplay(corpRaw);
const identifierDisplay = isGroup
  ? (businessNumber || corpNumber || '-')
  : maskRrnDisplay(rrn);
const normalized = {
  rowNo: Number.isInteger(row.__rowNum__) ? row.__rowNum__ + 1 : index + 2,
  source_row: { ...row },
  name,
  email: String(pick('이메일', 'email')).trim(),
  phone: normalizeMemberImportPhone(phoneRaw),
  birth_date: null,
  member_type: memberType,
  status,
  address: String(pick('주소', 'address')).trim(),
  member_id: String(pick('조합원번호', 'member_id')).trim(),
  join_category: String(pick('가입구분', 'join_category')).trim(),
  join_date: normalizeMemberImportDate(joinDateRaw),
  admin_memo: String(pick('관리메모', '비고', 'admin_memo')).trim(),
  rrn,
  business_number: businessNumber,
  corp_number: corpNumber,
  representative_name: isGroup ? String(pick('대표자명', '대표자', 'representative_name')).trim() : '',
  contact_name: isGroup ? String(pick('담당자명', '담당자', 'contact_name')).trim() : '',
  contact_position: isGroup ? String(pick('담당자 직함', '담당자 직함/역할', '담당자 역할', 'contact_position')).trim() : '',
  identifier_display: identifierDisplay
};

const errors = [];
if (!normalized.name) errors.push(isGroup ? '단체명 누락' : '이름 누락');
if (normalized.email && (normalized.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))) errors.push('이메일 형식 오류');
if (!normalized.member_type) errors.push('유형 누락');
else if (!['개인', '단체'].includes(normalized.member_type)) errors.push('유형 오류');
if (normalized.status && !['정상', '승인대기', '탈퇴', '제명'].includes(normalized.status)) errors.push('상태 오류');
if (String(joinDateRaw).trim() && !normalized.join_date) errors.push('가입일 형식 오류');
if (normalized.name.length > 100 || /[\x00-\x1f\x7f]/.test(normalized.name)) errors.push('이름·단체명 형식 오류');
if (!isGroup && /[0-9]/.test(normalized.name)) errors.push('이름 형식 오류');
if (String(rrnRaw).trim() && (isGroup || !/^[0-9 -]+$/.test(String(rrnRaw)) || !normalized.rrn)) errors.push('주민번호 형식 오류');
if (String(businessRaw).trim() && (!isGroup || !/^[0-9 -]+$/.test(String(businessRaw)) || !normalized.business_number)) errors.push('사업자번호 형식 오류');
if (String(corpRaw).trim() && (!isGroup || !/^[0-9 -]+$/.test(String(corpRaw)) || !normalized.corp_number)) errors.push('법인번호 형식 오류');
if (phoneRaw && (!/^[0-9 ()+.-]+$/.test(phoneRaw) || !/^0[0-9]{8,10}$/.test(normalized.phone.replace(/\D/g,'')))) errors.push('연락처 형식 오류');
for (const field of ['representative_name','contact_name','contact_position']) {
  if (normalized[field].length > 100 || /[\x00-\x1f\x7f]/.test(normalized[field])) errors.push('담당 정보 형식 오류');
}

normalized.errors = errors;
normalized.valid = errors.length === 0;
return normalized;
}

async function applyMemberImportDuplicateChecks(rows, current = () => true) {
if (!current()) return false;
rows.forEach((row) => {
  row.errors = Array.isArray(row.errors) ? row.errors.filter((msg) => !String(msg).startsWith('중복')) : [];
  row.valid = row.errors.length === 0;
});

const baseValidRows = rows.filter((row) => row.valid);
const emailCounts = new Map();
const memberIdCounts = new Map();
const rrnCounts = new Map();
const businessCounts = new Map();
const corpCounts = new Map();
const nameCounts = new Map();
const lacksIdentifier = row => ![row.email,row.member_id,row.rrn,row.business_number,row.corp_number].some(Boolean);
const nameKey = row => `${row.member_type}:${row.name}`;

baseValidRows.forEach((row) => {
  nameCounts.set(nameKey(row), (nameCounts.get(nameKey(row)) || 0) + 1);
  const emailKey = String(row.email || '').trim().toLowerCase();
  const memberIdKey = String(row.member_id || '').trim();
  const rrnKey = String(row.rrn || '').trim();
  const businessKey = String(row.business_number || '').trim();
  const corpKey = String(row.corp_number || '').trim();
  if (emailKey) emailCounts.set(emailKey, (emailCounts.get(emailKey) || 0) + 1);
  if (memberIdKey) memberIdCounts.set(memberIdKey, (memberIdCounts.get(memberIdKey) || 0) + 1);
  if (rrnKey) rrnCounts.set(rrnKey, (rrnCounts.get(rrnKey) || 0) + 1);
  if (businessKey) businessCounts.set(businessKey, (businessCounts.get(businessKey) || 0) + 1);
  if (corpKey) corpCounts.set(corpKey, (corpCounts.get(corpKey) || 0) + 1);
});

baseValidRows.forEach((row) => {
  const emailKey = String(row.email || '').trim().toLowerCase();
  const memberIdKey = String(row.member_id || '').trim();
  const rrnKey = String(row.rrn || '').trim();
  const businessKey = String(row.business_number || '').trim();
  const corpKey = String(row.corp_number || '').trim();
  if (emailKey && (emailCounts.get(emailKey) || 0) > 1) row.errors.push('중복 이메일(파일)');
  if (memberIdKey && (memberIdCounts.get(memberIdKey) || 0) > 1) row.errors.push('중복 조합원번호(파일)');
  if (rrnKey && (rrnCounts.get(rrnKey) || 0) > 1) row.errors.push('중복 주민번호(파일)');
  if (businessKey && (businessCounts.get(businessKey) || 0) > 1) row.errors.push('중복 사업자번호(파일)');
  if (corpKey && (corpCounts.get(corpKey) || 0) > 1) row.errors.push('중복 법인번호(파일)');
  if (lacksIdentifier(row) && nameCounts.get(nameKey(row)) > 1) row.errors.push('중복 이름·유형 확인 필요(파일)');
  row.valid = row.errors.length === 0;
});

const emails = [...new Set(baseValidRows.map((row) => String(row.email || '').trim()).filter(Boolean))];
const memberIds = [...new Set(baseValidRows.map((row) => String(row.member_id || '').trim()).filter(Boolean))];
const businessNumbers = [...new Set(baseValidRows.map((row) => String(row.business_number || '').trim()).filter(Boolean))];
const corpNumbers = [...new Set(baseValidRows.map((row) => String(row.corp_number || '').trim()).filter(Boolean))];
const names = [...new Set(baseValidRows.filter(lacksIdentifier).map(row => row.name))];
if (names.length) {
  const {data,error} = await scopeAdminTenant(_supabase.from('coop_members').select('name,member_type').in('name', names));
  if (!current()) return false;
  if (error) throw error;
  const existing = new Set((data || []).map(nameKey));
  rows.forEach(row => {
    if (lacksIdentifier(row) && existing.has(nameKey(row))) row.errors.push('중복 이름·유형 확인 필요(DB)');
    row.valid = row.errors.length === 0;
  });
}

if (emails.length > 0) {
  const { data, error } = await scopeAdminTenant(
    _supabase.from('coop_members').select('email').in('email', emails)
  );
  if (!current()) return false;
  if (error) throw error;
  const existingEmails = new Set((data || []).map((item) => String(item.email || '').trim().toLowerCase()).filter(Boolean));
  rows.forEach((row) => {
    const emailKey = String(row.email || '').trim().toLowerCase();
    if (emailKey && existingEmails.has(emailKey)) row.errors.push('중복 이메일(DB)');
    row.valid = row.errors.length === 0;
  });
}

if (memberIds.length > 0) {
  const { data, error } = await scopeAdminTenant(
    _supabase.from('coop_members').select('member_id').in('member_id', memberIds)
  );
  if (!current()) return false;
  if (error) throw error;
  const existingMemberIds = new Set((data || []).map((item) => String(item.member_id || '').trim()).filter(Boolean));
  rows.forEach((row) => {
    const memberIdKey = String(row.member_id || '').trim();
    if (memberIdKey && existingMemberIds.has(memberIdKey)) row.errors.push('중복 조합원번호(DB)');
    row.valid = row.errors.length === 0;
  });
}

if (businessNumbers.length > 0) {
  const { data, error } = await scopeAdminTenant(
    _supabase.from('coop_members').select('business_number').in('business_number', businessNumbers)
  );
  if (!current()) return false;
  if (error) throw error;
  const existingBusinessNumbers = new Set((data || []).map((item) => String(item.business_number || '').trim()).filter(Boolean));
  rows.forEach((row) => {
    const businessKey = String(row.business_number || '').trim();
    if (businessKey && existingBusinessNumbers.has(businessKey)) row.errors.push('중복 사업자번호(DB)');
    row.valid = row.errors.length === 0;
  });
}

if (corpNumbers.length > 0) {
  const { data, error } = await scopeAdminTenant(
    _supabase.from('coop_members').select('corp_number').in('corp_number', corpNumbers)
  );
  if (!current()) return false;
  if (error) throw error;
  const existingCorpNumbers = new Set((data || []).map((item) => String(item.corp_number || '').trim()).filter(Boolean));
  rows.forEach((row) => {
    const corpKey = String(row.corp_number || '').trim();
    if (corpKey && existingCorpNumbers.has(corpKey)) row.errors.push('중복 법인번호(DB)');
    row.valid = row.errors.length === 0;
  });
}
return current();
}

function renderMemberImportPreview() {
const preview = document.getElementById('member-import-preview');
const tbody = document.getElementById('member-import-tbody');
const count = document.getElementById('member-import-count');
const summary = document.getElementById('member-import-summary');
const filter = document.getElementById('member-import-filter');
if (!tbody || !preview || !count || !summary || !filter) return;

const filteredRows = g_member_import_rows.filter((row) => {
  if (filter.value === 'valid') return row.valid;
  if (filter.value === 'invalid') return !row.valid || !!row.server_error;
  return true;
});

const getMemberImportErrorBadgeClass = (message) => {
  const text = String(message || '');
  if (text.includes('누락')) return 'bg-warning text-dark';
  if (text.includes('(파일)')) return 'bg-info text-dark';
  if (text.includes('(DB)')) return 'bg-secondary';
  if (text.includes('형식 오류')) return 'bg-danger';
  if (text.includes('유형 오류') || text.includes('상태 오류')) return 'bg-danger';
  return 'bg-danger';
};

tbody.innerHTML = '';
filteredRows.slice(0, 10).forEach((row) => {
  const errorBadges = [...row.errors, ...(row.server_error ? [row.server_error] : [])].map((message) => `<span class="badge ${getMemberImportErrorBadgeClass(message)} me-1 mb-1">${escapeHtml(message)}</span>`).join('');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${row.rowNo}</td>
    <td>${escapeHtml(row.name || '-')}</td>
    <td>${escapeHtml(row.email || '-')}</td>
    <td>${escapeHtml(row.member_type || '-')}</td>
    <td>${escapeHtml(row.identifier_display || '-')}</td>
    <td>${row.member_type === '단체' ? `${escapeHtml(row.representative_name || '-')}<br><span class="small text-muted">${escapeHtml(row.contact_name || '-')} · ${escapeHtml(row.contact_position || '-')}</span>` : '-'}</td>
    <td>${escapeHtml(row.status || '-')}</td>
    <td>${escapeHtml(row.join_date || '-')}</td>
    <td>${row.valid && !row.server_error ? '<span class="badge bg-success">정상</span>' : errorBadges}</td>
  `;
  tbody.appendChild(tr);
});

const validCount = g_member_import_rows.filter((row) => row.valid).length;
const invalidCount = g_member_import_rows.filter((row) => !row.valid || row.server_error).length;
const requiredMissingCount = g_member_import_rows.filter((row) => row.errors.some((msg) => String(msg).includes('누락'))).length;
const formatErrorCount = g_member_import_rows.filter((row) => row.errors.some((msg) => String(msg).includes('형식 오류') || String(msg).includes('유형 오류') || String(msg).includes('상태 오류'))).length;
const fileDupCount = g_member_import_rows.filter((row) => row.errors.some((msg) => String(msg).includes('(파일)'))).length;
const dbDupCount = g_member_import_rows.filter((row) => row.errors.some((msg) => String(msg).includes('(DB)'))).length;
count.textContent = `총 ${g_member_import_rows.length}건 / 등록 가능 ${validCount}건`;
summary.textContent = `검사 요약: 필수 누락 ${requiredMissingCount}건 / 형식 오류 ${formatErrorCount}건 / 파일 중복 ${fileDupCount}건 / 기존 조합원 ${dbDupCount}건 / 오류·중복 ${invalidCount}건`;
preview.style.display = 'block';
syncMemberImportUi();
}

async function downloadMemberImportFailedRows() {
const state = g_member_import_state;
if (!isCurrentMemberImport(state, state?.revision, true)) return;
const revision = state.revision;
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
if (!isCurrentMemberImport(state, revision, true)) return;
const failedRows = g_member_import_rows.filter((row) => !row.valid || !!row.server_error);
if (failedRows.length === 0) {
  return myAlert('내려받을 실패 행이 없습니다.', 'warning');
}

const rows = failedRows.map((row) => ({
  유형: row.source_row?.['유형'] ?? row.member_type ?? '',
  이름: row.source_row?.['이름'] ?? row.name ?? '',
  단체명: row.source_row?.['단체명'] ?? '',
  주민등록번호: row.source_row?.['주민등록번호'] ?? row.rrn ?? '',
  이메일: row.source_row?.['이메일'] ?? row.email ?? '',
  연락처: row.source_row?.['연락처'] ?? row.phone ?? '',
  사업자번호: row.source_row?.['사업자번호'] ?? row.business_number ?? '',
  법인번호: row.source_row?.['법인번호'] ?? row.corp_number ?? '',
  상태: row.source_row?.['상태'] ?? row.status ?? '',
  주소: row.source_row?.['주소'] ?? row.address ?? '',
  조합원번호: row.source_row?.['조합원번호'] ?? row.member_id ?? '',
  가입구분: row.source_row?.['가입구분'] ?? row.join_category ?? '',
  가입일: row.source_row?.['가입일'] ?? row.join_date ?? '',
  관리메모: row.source_row?.['관리메모'] ?? row.admin_memo ?? '',
  대표자명: row.source_row?.['대표자명'] ?? row.representative_name ?? '',
  담당자명: row.source_row?.['담당자명'] ?? row.contact_name ?? '',
  '담당자 직함': row.source_row?.['담당자 직함'] ?? row.contact_position ?? '',
  오류사유: [...row.errors, ...(row.server_error ? [row.server_error] : [])].join(', ')
}));

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '실패행');
XLSX.writeFile(wb, '조합원_등록_실패행.xlsx');
}

async function readMemberImportExcel(input) {
const state = g_member_import_state;
const file = input?.files?.[0];
if (!file || !isCurrentMemberImport(state, state?.revision, true)
    || ['preparing','confirming','saving','unknown'].includes(state.phase)) return;
const revision = ++state.revision;
state.file = file;
state.phase = 'reading';
state.message = '파일을 읽고 있습니다.';
state.attempt = null;
g_member_import_rows = [];
g_member_import_request_key = null;
document.getElementById('member-import-preview').style.display = 'none';
syncMemberImportUi();
const current = () => isCurrentMemberImport(state, revision, true) && state.file === file
    && input.isConnected && input.files?.[0] === file;
const failed = message => {
    if (!current()) return;
    state.phase = g_member_import_rows.length ? 'check_failed' : 'file_pending';
    state.message = message;
    syncMemberImportUi();
};
try {
if (!(await ensureAdminMemberSpreadsheetReady())) return failed('파일 도구를 불러오지 못했습니다. 다시 시도해 주세요.');
if (!current()) return;
const reader = new FileReader();
reader.onload = async function(e) {
  if (!current()) return;
  try {
  const data = new Uint8Array(e.target.result);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!json.length) {
    return failed('데이터가 없는 엑셀입니다. 다른 파일을 선택해 주세요.');
  }
  if (!current()) return;
  g_member_import_rows = json.map((row, index) => normalizeMemberImportRow(row, index))
    .filter(row => Object.values(row.source_row).some(value => String(value ?? '').trim() !== ''));
  if (!g_member_import_rows.length) return failed('데이터가 없는 엑셀입니다. 다른 파일을 선택해 주세요.');
  await recheckMemberImportRows(state, revision);
  } catch (_) {
    failed('엑셀 파일을 읽지 못했습니다. 파일을 확인한 뒤 다시 시도해 주세요.');
  }
};
reader.onerror = () => failed('파일을 읽지 못했습니다. 다시 시도해 주세요.');
reader.onabort = () => failed('파일 읽기가 중단됐습니다. 다시 시도해 주세요.');
reader.readAsArrayBuffer(file);
} catch (_) { failed('파일을 읽지 못했습니다. 다시 시도해 주세요.'); }
}

async function recheckMemberImportRows(state, revision, preparing = false) {
const current = () => isCurrentMemberImport(state, revision, true);
if (!current()) return false;
const rows = g_member_import_rows.map(row => ({...row, errors:[...row.errors]}));
state.phase = preparing ? 'preparing' : 'checking';
state.message = '등록 내용을 확인하고 있습니다.';
syncMemberImportUi();
try {
    const checked = await applyMemberImportDuplicateChecks(rows, current);
    if (!current() || checked === false) return false;
    g_member_import_rows = rows;
    state.phase = 'ready';
    state.message = '작성 중';
    renderMemberImportPreview();
    return true;
} catch (_) {
    if (!current()) return false;
    state.phase = 'check_failed';
    state.message = '중복 검사를 완료하지 못했습니다. 다시 검사해 주세요.';
    renderMemberImportPreview();
    return false;
}
}

async function retryMemberImportCheck() {
const state = g_member_import_state;
if (!isCurrentMemberImport(state, state?.revision, true)
    || !['check_failed','file_pending'].includes(state.phase)) return;
if (!g_member_import_rows.length) return readMemberImportExcel(document.getElementById('member-import-file'));
return recheckMemberImportRows(state, ++state.revision);
}

function memberImportPayload(rows) {
return rows.map(row => ({
    row_no:row.rowNo, name:row.name, email:row.email, phone:row.phone || null,
    birth_date:row.birth_date || null, member_type:row.member_type, status:row.status || null,
    address:row.address || null, member_id:row.member_id || null, join_category:row.join_category || null,
    admin_memo:row.admin_memo || null, rrn:row.member_type === '개인' ? row.rrn || null : null,
    business_number:row.member_type === '단체' ? row.business_number || null : null,
    corp_number:row.member_type === '단체' ? row.corp_number || null : null,
    representative_name:row.member_type === '단체' ? row.representative_name || null : null,
    contact_name:row.member_type === '단체' ? row.contact_name || null : null,
    contact_position:row.member_type === '단체' ? row.contact_position || null : null,
    join_date:row.join_date || null
}));
}

async function submitMemberImportBatch() {
const state = g_member_import_state;
if (!isCurrentMemberImport(state, state?.revision, true)
    || !['ready','unknown'].includes(state.phase)) return;
const revision = state.revision;
if (!g_member_import_rows.length) return myAlert('업로드된 데이터가 없습니다.', 'warning');
if (!state.attempt && !(await recheckMemberImportRows(state, revision, true))) return;
if (!isCurrentMemberImport(state, revision, true)) return;
const validRows = g_member_import_rows.filter((row) => row.valid);
if (!validRows.length) return myAlert('등록 가능한 행이 없습니다.', 'warning');
if (validRows.length > 500) return myAlert('한 번에 등록할 수 있는 최대 건수는 500건입니다.', 'warning');
const attempt = state.attempt || {key:createAdminBatchRequestKey('member-import'), payload:memberImportPayload(validRows)};
const token = {accepted:false};
state.confirmation = token;
state.phase = 'confirming';
syncMemberImportUi();
myConfirm(state.attempt ? '이전 등록 요청의 결과를 다시 확인할까요?' : `${validRows.length}건을 등록할까요?`, async () => {
  token.accepted = true;
  if (!isCurrentMemberImport(state, revision, true) || state.confirmation !== token || state.phase !== 'confirming') return;
  state.phase = 'saving';
  syncMemberImportUi();
  let sent = false;
  try {
    const identity = await _supabase.auth.getUser();
    if (identity.error || identity.data?.user?.id !== adminCertificateAuthId) throw new Error('IMPORT_AUTH_CHECK_FAILED');
    const gate = await window.ErpRuntimeGuard.enforce(_supabase, {moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
    if (!gate.ok || String(gate.runtime?.coop_id || '') !== String(g_adminMemberRuntime?.coop_id || '')
        || !isCurrentMemberImport(state, revision, true) || state.confirmation !== token) throw new Error('IMPORT_ACCESS_CHECK_FAILED');
    state.attempt = attempt;
    g_member_import_request_key = attempt.key;
    sent = true;
    const {data:result, error} = await _supabase.rpc('create_members_secure_batch', {
        p_request_key:attempt.key, p_rows:attempt.payload
    });
    if (!isCurrentMemberImport(state, revision)) return;
    const expected = new Set(attempt.payload.map(row => row.row_no));
    const items = Array.isArray(result?.items) ? result.items : [];
    if (error || items.length !== expected.size || new Set(items.map(item => item?.row_no)).size !== expected.size
        || items.some(item => !expected.has(item?.row_no) || typeof item.ok !== 'boolean')
        || Number(result?.success_count) !== items.filter(item => item.ok).length
        || Number(result?.failure_count) !== items.filter(item => !item.ok).length
        || (result.request_key && result.request_key !== attempt.key)) throw new Error('IMPORT_RESULT_UNCONFIRMED');
    const successful = new Set(items.filter(item => item.ok).map(item => item.row_no));
    const failed = new Map(items.filter(item => !item.ok).map(item => [item.row_no, item.hint || item.message || '등록에 실패했습니다. 다시 시도해 주세요.']));
    g_member_import_rows = g_member_import_rows.filter(row => !successful.has(row.rowNo));
    g_member_import_rows.forEach(row => { if (failed.has(row.rowNo)) row.server_error = String(failed.get(row.rowNo)); });
    state.attempt = null;
    g_member_import_request_key = null;
    state.phase = 'ready';
    state.message = `등록 완료 ${successful.size}건 · 남은 ${g_member_import_rows.length}건`;
    renderMemberImportPreview();
    if (!g_member_import_rows.length) {
        state.file = null;
        const input = document.getElementById('member-import-file');
        input.value = '';
        window.ErpWorkspaceResume?.checkpoint(input);
    }
    if (isCurrentMemberImport(state, revision, true)) myAlert(`등록 완료: ${successful.size}건\n실패·검토 필요: ${g_member_import_rows.length}건`);
    if (successful.size) {
        // A list refresh failure must not turn a confirmed registration into an unknown write.
        void Promise.resolve().then(() => fetchMembers()).catch(() => {
            if (isCurrentMemberImport(state, revision)) {
                state.message += ' · 목록은 새로고침해 주세요.';
                syncMemberImportUi();
            }
        });
    }
  } catch (_) {
    if (!isCurrentMemberImport(state, revision)) return;
    state.phase = sent || state.attempt ? 'unknown' : 'ready';
    state.message = state.phase === 'unknown'
        ? '등록 결과를 확인하지 못했습니다. 결과를 다시 확인해 주세요.'
        : '로그인과 등록 권한을 확인하지 못했습니다. 다시 시도해 주세요.';
    if (isCurrentMemberImport(state, revision, true)) myAlert(state.message, 'warning');
  } finally {
    if (g_member_import_state === state) {
        state.confirmation = null;
        syncMemberImportUi();
    }
  }
});
document.getElementById('customConfirmModal')?.addEventListener('hidden.bs.modal', () => {
    queueMicrotask(() => {
        if (!token.accepted && g_member_import_state === state && state.confirmation === token) {
            state.confirmation = null;
            state.phase = state.attempt ? 'unknown' : 'ready';
            syncMemberImportUi();
        }
    });
}, {once:true});
}

// [수정] 엑셀 다운로드 (보안 모드 RPC 연동 및 로그 기록)
let memberExcelExportAttempt = null;
function isCurrentMemberExcelExport(attempt) {
    return memberExcelExportAttempt === attempt && !attempt.cancelled
      && g_adminMemberRuntime === attempt.runtime && g_adminMemberRuntime?.coop_id === attempt.coopId
      && adminCertificateAuthId === attempt.authId && getSelectedExcelOption() === attempt.type
      && getMemberExportCutoffDate() === attempt.cutoffDate
      && (attempt.type !== 'secret' || document.getElementById('decryptKey')?.value === attempt.pin)
      && document.getElementById('excelModal')?.classList.contains('show') && !window.frameElement?.hidden;
}
function finishMemberExcelExport(attempt) {
    attempt.releaseLoading();
    if (memberExcelExportAttempt === attempt) memberExcelExportAttempt = null;
    attempt.cancelled = true;
    attempt.controllers.forEach(controller => controller.abort());
    attempt.pin = '';
}
function cancelMemberExcelExport() {
    if (memberExcelExportAttempt) finishMemberExcelExport(memberExcelExportAttempt);
}
function beginMemberExcelExport() {
    const modal=document.getElementById('excelModal');
    if (!modal?.classList.contains('show') || window.frameElement?.hidden) return null;
    if(!modal.dataset.excelReadBound){
        modal.addEventListener('hide.bs.modal',cancelMemberExcelExport);
        const changed=event=>{
            if(event.target.matches('input[name="excelOption"],#memberExportCutoffDate,#memberExportReportYear,#decryptKey')) cancelMemberExcelExport();
        };
        modal.addEventListener('input',changed);
        modal.addEventListener('change',changed);
        window.addEventListener('pagehide',cancelMemberExcelExport);
        if(window.frameElement) new MutationObserver(cancelMemberExcelExport).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
        modal.dataset.excelReadBound='1';
    }
    if(memberExcelExportAttempt && isCurrentMemberExcelExport(memberExcelExportAttempt)) return null;
    cancelMemberExcelExport();
    const type=getSelectedExcelOption();
    const attempt={runtime:g_adminMemberRuntime,coopId:g_adminMemberRuntime?.coop_id,authId:adminCertificateAuthId,
      type,cutoffDate:getMemberExportCutoffDate(),pin:type==='secret' ? document.getElementById('decryptKey')?.value || '' : '',
      cancelled:false,controllers:new Set(),loading:true};
    attempt.releaseLoading=()=>{
        if(!attempt.loading)return;
        attempt.loading=false;
        if(memberExcelExportAttempt===attempt)showLoading(false);
    };
    memberExcelExportAttempt=attempt;showLoading(true);
    return attempt;
}
async function readMemberExcelExport(attempt,read) {
    if(!isCurrentMemberExcelExport(attempt))throw new Error('MEMBER_EXPORT_CANCELLED');
    const controller=new AbortController();attempt.controllers.add(controller);
    let timer,onAbort;
    try {
        const result=await Promise.race([
            Promise.resolve().then(()=>{
                if(!isCurrentMemberExcelExport(attempt))throw new Error('MEMBER_EXPORT_CANCELLED');
                return read(controller.signal);
            }),
            new Promise((_,reject)=>{
                onAbort=()=>reject(new Error('MEMBER_EXPORT_CANCELLED'));
                controller.signal.addEventListener('abort',onAbort,{once:true});
                timer=setTimeout(()=>{reject(new Error('MEMBER_EXPORT_READ_TIMEOUT'));controller.abort();},15000);
            })
        ]);
        if(!isCurrentMemberExcelExport(attempt))throw new Error('MEMBER_EXPORT_CANCELLED');
        return result;
    } finally {
        clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);attempt.controllers.delete(controller);
    }
}
async function verifyMemberExcelExportAccess(attempt) {
    const identity=await readMemberExcelExport(attempt,()=>_supabase.auth.getUser());
    if(identity.error||!attempt.authId||identity.data?.user?.id!==attempt.authId)throw new Error('MEMBER_EXPORT_ACCESS_DENIED');
    const gate=await readMemberExcelExport(attempt,()=>window.ErpRuntimeGuard.enforce(_supabase,{moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'}));
    if(!gate.ok||!attempt.coopId||gate.runtime?.coop_id!==attempt.coopId)throw new Error('MEMBER_EXPORT_ACCESS_DENIED');
}
async function downloadMemberSmsExcel(attempt) {
    const current=()=>isCurrentMemberExcelExport(attempt),cutoffDate=attempt.cutoffDate;
    if (!normalizeMemberExportDateValue(cutoffDate)) return myAlert('기준일을 선택해 주세요.','warning');
    try {
        await verifyMemberExcelExportAccess(attempt);
        const records=[];let cursor=null;
        for(;;){
            let query=scopeAdminTenant(_supabase.from('coop_members').select('id,name,phone')
              .neq('status','승인대기').lte('join_date',cutoffDate).order('id',{ascending:true}).limit(500));
            if(cursor)query=query.gt('id',cursor);
            const {data,error}=await readMemberExcelExport(attempt,signal=>query.abortSignal(signal));
            if(!current())return;
            if(error||!Array.isArray(data))throw error||new Error('SMS_EXPORT_READ_FAILED');
            records.push(...data);
            if(data.length<500)break;
            const next=data[data.length-1]?.id;
            if(!next||next===cursor)throw new Error('SMS_EXPORT_PAGE_INVALID');
            cursor=next;
        }
        const rows=window.CoopMemberSmsExport.build(records);
        if(!current())return;
        if(!rows.length)return myAlert('문자 발송용으로 내려받을 휴대전화 번호가 없습니다.','warning');
        await verifyMemberExcelExportAccess(attempt);
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,window.CoopMemberSmsExport.worksheet(XLSX,rows),'문자 발송용');
        XLSX.writeFile(wb,`조합원명부_문자발송용_${cutoffDate}.xlsx`);
        logAdminAction('DOWNLOAD','조합원명부',`문자 발송용 다운로드 ${rows.length}건 (기준일 ${cutoffDate})`);
        bootstrap.Modal.getInstance(document.getElementById('excelModal'))?.hide();
    } catch (_) {
        if(current())myAlert('문자 발송용 명부를 불러오지 못했습니다. 다시 시도해 주세요.','error');
    }
}

async function downloadExcel() {
    const attempt=beginMemberExcelExport();
    if(!attempt)return;
    try {
    if (!(await readMemberExcelExport(attempt,()=>ensureAdminMemberSpreadsheetReady()))) return;
    const type = attempt.type;
    if(type==='sms')return await downloadMemberSmsExcel(attempt);
    const cutoffDate = attempt.cutoffDate;
    await verifyMemberExcelExportAccess(attempt);
    let shareUnitAmount;
    try { shareUnitAmount = (await readMemberExcelExport(attempt,()=>refreshMemberCapitalDisplays())).unit; }
    catch (_) { if(isCurrentMemberExcelExport(attempt))myAlert('출자 기준을 불러오지 못했습니다. 다시 시도해주세요.', 'error');return; }
    const coopName = String(g_memberExportOrgName || '').trim();
    let dataToExport = [];
    let fileName = "조합원명부_일반.xlsx";
    let exportSourceRecords = [];

    if (!cutoffDate) {
        return myAlert(type === 'city-report' ? '시청 신고용 연도를 입력해주세요.' : '기준일을 선택해주세요.', 'warning');
    }

    if (!shareUnitAmount) {
        return myAlert('출자 1좌 금액을 입력해주세요.', 'warning');
    }


    let snapshotMap = {};
    try {
        snapshotMap = await readMemberExcelExport(attempt,()=>fetchMemberCapitalSnapshotByDate(cutoffDate));
    } catch (snapshotError) {
        if(!isCurrentMemberExcelExport(attempt))return;
        attempt.releaseLoading();
        CoopSafeLog.error("[erp/admin_member] operation failed", snapshotError);
        return myAlert('기준일 출자금 계산 실패: ' + snapshotError.message, 'error');
    }

    try {
        exportSourceRecords = await readMemberExcelExport(attempt,()=>fetchAllMembersForExport());
    } catch (memberError) {
        if(!isCurrentMemberExcelExport(attempt))return;
        attempt.releaseLoading();
        CoopSafeLog.error("[erp/admin_member] operation failed", memberError);
        return myAlert('전체 조합원 명부 조회 실패: ' + memberError.message, 'error');
    }

    // 1. 보안용 엑셀 다운로드
    if(type === 'secret') {
        const inputPin = attempt.pin;

        if (!g_memberExportSecurePinConfigured) {
            attempt.releaseLoading();
            return myAlert('보안 엑셀 PIN이 아직 설정되지 않았습니다. 먼저 PIN을 저장해주세요.', 'warning');
        }

        if (!inputPin) {
            attempt.releaseLoading();
            return myAlert('보안 엑셀 PIN을 입력해주세요.', 'warning');
        }

        const { data, error } = await readMemberExcelExport(attempt,signal=>{
            const request=_supabase.rpc('get_full_members_secure', { p_pin: inputPin });
            return request.abortSignal ? request.abortSignal(signal) : request;
        });

        if(error) {
            attempt.releaseLoading();
            CoopSafeLog.error("[erp/admin_member] operation failed", error);
            return myAlert('보안 데이터 로드 실패: ' + error.message, 'error');
        }

        await verifyMemberExcelExportAccess(attempt);
        const exportResult = buildMemberExportRows(data || [], {
            cutoffDate,
            shareUnitAmount,
            snapshotMap,
            exportType: 'secret'
        });
        dataToExport = exportResult.rows;

        fileName = `조합원명부_보안_${cutoffDate}.xlsx`;

        // 로그 기록
        logAdminAction('DOWNLOAD', '조합원명부', `보안용 다운로드 (기준일 ${cutoffDate})`);
        if (exportResult.overLimitMembers.length > 0) {
            CoopSafeLog.warn("30% 초과 조합원", exportResult.overLimitMembers);
        }

        dataToExport = exportResult.rows;
        if (exportResult.overLimitMembers.length > 0) {
            attempt.releaseLoading();
            const ws = buildMemberExportWorksheet(type, dataToExport, { cutoffDate, shareUnitAmount, coopName });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "명부");
            XLSX.writeFile(wb, fileName);
            document.getElementById('decryptKey').value = '';
            bootstrap.Modal.getInstance(document.getElementById('excelModal')).hide();
            const warningText = exportResult.overLimitMembers.map((item) => `${item.name}(${item.ratio}%)`).join(', ');
            return myAlert(`다운로드되었습니다. 기준일 ${cutoffDate} 기준 30% 초과 조합원이 있습니다: ${warningText}`, 'warning');
        }
    } else {
        // 2. 일반용/시청 신고용 엑셀 다운로드 (가입일 기준일 이하 조합원 기준)
        await verifyMemberExcelExportAccess(attempt);
        const exportResult = buildMemberExportRows(exportSourceRecords, {
            cutoffDate,
            shareUnitAmount,
            snapshotMap,
            exportType: type
        });
        dataToExport = exportResult.rows;
        fileName = type === 'city-report'
            ? `조합원명부_시청신고용_${cutoffDate}.xlsx`
            : `조합원명부_일반_${cutoffDate}.xlsx`;
        logAdminAction('DOWNLOAD', '조합원명부', type === 'city-report' ? `시청 신고용 다운로드 (기준일 ${cutoffDate})` : `일반용 다운로드 (기준일 ${cutoffDate})`);

        if (exportResult.overLimitMembers.length > 0) {
            attempt.releaseLoading();
            const ws = buildMemberExportWorksheet(type, dataToExport, { cutoffDate, shareUnitAmount, coopName });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "명부");
            XLSX.writeFile(wb, fileName);
            document.getElementById('decryptKey').value = '';
            bootstrap.Modal.getInstance(document.getElementById('excelModal')).hide();
            const warningText = exportResult.overLimitMembers.map((item) => `${item.name}(${item.ratio}%)`).join(', ');
            return myAlert(`다운로드되었습니다. 기준일 ${cutoffDate} 기준 30% 초과 조합원이 있습니다: ${warningText}`, 'warning');
        }
    }

    // 3. 엑셀 파일 생성 및 다운로드 (SheetJS)
    attempt.releaseLoading();
    const ws = buildMemberExportWorksheet(type, dataToExport, { cutoffDate, shareUnitAmount, coopName });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "명부");
    XLSX.writeFile(wb, fileName);

    // 모달 닫기 및 초기화
    document.getElementById('decryptKey').value = '';
    bootstrap.Modal.getInstance(document.getElementById('excelModal')).hide();
    } catch (_) {
        if(isCurrentMemberExcelExport(attempt))myAlert('엑셀 명부를 불러오지 못했습니다. 다시 시도해 주세요.','error');
    } finally {finishMemberExcelExport(attempt);}
}


// ================================================================
// [기능 2] 입금 매칭 (자바스크립트 엑셀 처리)
// ================================================================
async function readExcel(input) {
    const selectedFile = input.files?.[0];
    if (!selectedFile || !(await ensureAdminMemberSpreadsheetReady())) return;
    if (input.files?.[0] !== selectedFile || !input.isConnected) return;
const file = input.files[0];
if(!file) return;

const reader = new FileReader();
reader.onload = async function(e) {
const data = new Uint8Array(e.target.result);
const workbook = XLSX.read(data, {type: 'array'});
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(sheet);

const tbody = document.getElementById('depositResultBody');
tbody.innerHTML = '';

if(json.length === 0) { tbody.innerHTML='<tr><td colspan="3">데이터가 없습니다.</td></tr>'; return; }

const depositRows = json.map(function normalizeDepositMatchRow(row) {
const rawName = row['입금자'] || row['성명'] || row['보낸분'] || row['내용'];
const rawAmount = row['입금액'] || row['금액'] || row['거래금액'];
return {
name: String(rawName || '').trim(),
amount: Number(String(rawAmount ?? '').replace(/,/g, '').trim())
};
}).filter(function keepDepositMatchRow(row) {
return row.name && Number.isFinite(row.amount);
});

const uniqueNames = [...new Set(depositRows.map(function takeDepositName(row) {
return row.name;
}))];
const membersByName = new Map();

if (uniqueNames.length > 0) {
const { data: matchedMembers, error } = await scopeAdminTenant(_supabase
.from('coop_members')
.select('id,member_id,name'))
.in('name', uniqueNames);

if (error) {
CoopSafeLog.error("입금 매칭 조합원 조회 실패:", error);
tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">조합원 정보를 불러오지 못했습니다.</td></tr>';
return;
}

(matchedMembers || []).forEach(function groupMatchedMember(member) {
const key = String(member.name || '').trim();
if (!membersByName.has(key)) membersByName.set(key, []);
membersByName.get(key).push(member);
});
}

depositRows.forEach(function renderDepositMatchRow(row) {
const matches = membersByName.get(row.name) || [];
const tr = document.createElement('tr');
const tdName = document.createElement('td');
const tdAmt = document.createElement('td');
const tdMatch = document.createElement('td');

tdName.textContent = row.name;
tdAmt.textContent = `${row.amount.toLocaleString()}원`;

if(matches.length === 1) {
const match = matches[0];
const span = document.createElement('span');
span.className = 'text-success fw-bold';
span.textContent = `${match.name} (${match.member_id})`;
tdMatch.appendChild(span);
} else if (matches.length > 1) {
const span = document.createElement('span');
span.className = 'text-warning fw-bold';
span.textContent = `동명이인 ${matches.length}명 (조합원번호 확인 필요)`;
tdMatch.appendChild(span);
} else {
const span = document.createElement('span');
span.className = 'text-danger';
span.textContent = '매칭 실패 (정보 없음)';
tdMatch.appendChild(span);
}

tr.appendChild(tdName);
tr.appendChild(tdAmt);
tr.appendChild(tdMatch);
tbody.appendChild(tr);
});
};
reader.readAsArrayBuffer(file);
}


// ================================================================
// [기능 3] 공지사항 관리
// ================================================================
// 직접 작성한 공지만 불러옵니다. 전자결재에서 승인된 공문은 공문 관리에서 다룹니다.
async function fetchNotices() {
    const tbody = document.getElementById('noticeListBody');
    if (!tbody) return false;
    const status = document.getElementById('notice-list-status');
    if (status) status.textContent = '공지사항을 불러오는 중입니다…';
    try {
    const { data, error } = await scopeAdminTenant(
        _supabase
            .from('coop_notices')
            .select('id,title,category,status,is_members_only,created_at')
            .is('source_approval_id', null)
    ).order('created_at', { ascending: false });

    if (error) throw error;
    if (status) status.textContent = '';

    if(!data || data.length===0) {
        tbody.innerHTML='<tr><td colspan="6" class="text-center py-3">글이 없습니다.</td></tr>';
        return true;
    }

    tbody.innerHTML = data.map(n => {
        // 날짜 포맷팅 (YYYY-MM-DD)
        const dateStr = formatAdminMemberKstDate(n.created_at);
        const noticeId = String(n.id ?? '');

        const visibilityBadge = n.is_members_only
            ? '<span class="badge bg-success">조합원</span>'
            : '<span class="badge bg-secondary">전체</span>';

        return `
            <tr>
                <td>${escapeHtml(dateStr)}</td>
                <td>${escapeHtml(n.category || '')}</td>
                <td class="text-start fw-bold">${escapeHtml(n.title || '')}</td>
                <td>${visibilityBadge}</td>
                <td>${escapeHtml(n.status || '')}</td>
                <td>
                    <button class="btn btn-sm btn-light border" type="button" data-open-notice="${escapeHtml(noticeId)}">수정</button>
                    <button class="btn btn-sm btn-outline-danger ms-1" type="button" data-delete-notice="${escapeHtml(noticeId)}">삭제</button>
                </td>
            </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-open-notice]').forEach((button) => {
        button.addEventListener('click', () => openNoticeModal(button.dataset.openNotice));
    });
    tbody.querySelectorAll('[data-delete-notice]').forEach((button) => {
        button.addEventListener('click', () => askDeleteNotice(button.dataset.deleteNotice));
    });
    return true;
    } catch (error) {
        CoopSafeLog.error('공지사항 목록 로딩 실패:', error);
        if (status) status.textContent = '최신 공지 목록을 불러오지 못했습니다. 잠시 후 공지사항 탭을 다시 눌러주세요.';
        return false;
    }
}

    // [신규] 공지사항 삭제 요청 함수
function askDeleteNotice(id) {
    if (!id || g_siteDeleting) return;

    myConfirm("정말 이 공지사항을 삭제하시겠습니까?\n복구할 수 없습니다.", async () => {
        await runSiteDelete('notice', id);
    });
}

// Only these site-editor dialogs use this guard; other ERP forms are unchanged.
function bindSiteMutationModal(modal) {
    if (modal.dataset.siteMutationBound === '1') return;
    modal.addEventListener('show.bs.modal', () => { modal.dataset.siteShown = '0'; });
    modal.addEventListener('shown.bs.modal', () => { modal.dataset.siteShown = '1'; });
    modal.addEventListener('hidden.bs.modal', () => { modal.dataset.siteShown = '0'; });
    modal.addEventListener('hide.bs.modal', event => {
        if (modal.dataset.siteBusy === '1') event.preventDefault();
    });
    modal.dataset.siteMutationBound = '1';
}

function lockSiteMutationModal(id, buttonId, label) {
    const modal = document.getElementById(id);
    bindSiteMutationModal(modal);
    const button = document.getElementById(buttonId);
    const controls = Array.from(modal.querySelectorAll('input,textarea,select,button')).map(el => [el,el.disabled]);
    const oldLabel = button.textContent;
    modal.dataset.siteBusy = '1';
    controls.forEach(([el]) => { el.disabled = true; });
    button.textContent = label;
    button.setAttribute('aria-busy', 'true');
    return () => {
        modal.dataset.siteBusy = '0';
        controls.forEach(([el,disabled]) => { el.disabled = disabled; });
        button.textContent = oldLabel;
        button.removeAttribute('aria-busy');
    };
}

function closeSiteMutationModal(id) {
    const modal = document.getElementById(id);
    modal.dataset.siteBusy = '0';
    if (!modal.classList.contains('show')) return Promise.resolve();
    return new Promise(resolve => {
        modal.addEventListener('hidden.bs.modal', resolve, {once:true});
        const hide = () => bootstrap.Modal.getOrCreateInstance(modal).hide();
        if (modal.dataset.siteShown === '0') modal.addEventListener('shown.bs.modal', hide, {once:true});
        else hide();
    });
}

let g_current_notice_id = null;
// 공지 모달 열기 (내용 불러오기 추가)

function safeParseArray(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function deriveNoticeFileName(url) {
    if (!url) return '-';
    let fileName = String(url).split('/').pop() || '';
    try { fileName = decodeURIComponent(fileName); } catch (e) {}
    return fileName.replace(/_/g, ' ');
}

function normalizeAdminHttpUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim(), window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (_) {}
    return '';
}

async function uploadNoticeFileToStorage(file) {
    const coopId = await getAdminMemberCoopId();
    if (!coopId) throw new Error('NOTICE_COOP_REQUIRED');
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    if (!/^[a-z0-9]{1,10}$/.test(ext)) throw new Error('FILE_FORMAT');
    const path = `notices/${coopId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await _supabase.storage.from('attachments').upload(path, file);
    if (error) throw error;
    return `attachments/${path}`;
}

async function deleteNoticeFile(url) {
    const ref = window.NoticeAttachments?.parse(url);
    if (!ref) {
        let parsed;
        try { parsed = new URL(url); } catch (_) { return; }
        const prefix = '/storage/v1/object/public/assets/notices/';
        if (parsed.origin !== new URL(SUPABASE_URL).origin || !parsed.pathname.startsWith(prefix)) return;
        const path = decodeURIComponent(parsed.pathname.slice('/storage/v1/object/public/assets/'.length));
        const { error } = await _supabase.storage.from('assets').remove([path]);
        if (error) throw error;
        return;
    }
    const { error } = await _supabase.storage.from(ref.bucket).remove([ref.path]);
    if (error) throw error;
}

async function ensureNoticeAttachmentPrivacy(url, name) {
    // Old published files stay unchanged unless their notice is saved as member-only.
    let parsed;
    try { parsed = new URL(url); } catch (_) { return url; }
    const prefix = '/storage/v1/object/public/assets/notices/';
    if (parsed.origin !== new URL(SUPABASE_URL).origin || !parsed.pathname.startsWith(prefix)) return url;
    const path = decodeURIComponent(parsed.pathname.slice('/storage/v1/object/public/assets/'.length));
    const { data, error } = await _supabase.storage.from('assets').download(path);
    if (error || !data) throw error || new Error('NOTICE_ATTACHMENT_UNAVAILABLE');
    const ext = path.split('.').pop();
    const uploadName = String(name || '').split('.').pop().toLowerCase() === ext.toLowerCase() ? name : `첨부파일.${ext}`;
    return uploadNoticeFileToStorage(new File([data], uploadName, { type: data.type }));
}

function renderNoticeFilePreview(urls, names) {
    const preview = document.getElementById('notice-file-preview');
    const list = document.getElementById('notice-file-list');
    if (!preview || !list) return;

    list.innerHTML = '';
    if (!Array.isArray(urls) || urls.length === 0) {
        preview.style.setProperty('display', 'none', 'important');
        return;
    }

    urls.forEach((url, idx) => {
        const privateRef = window.NoticeAttachments?.isPrivate(url);
        const safeUrl = privateRef ? '#' : normalizeAdminHttpUrl(url);
        if (!safeUrl) return;
        const rawName = (Array.isArray(names) && names[idx]) ? names[idx] : deriveNoticeFileName(url);
        const item = document.createElement('li');
        const link = document.createElement('a');
        item.className = 'mb-1';
        link.className = 'text-decoration-none';
        link.href = safeUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = String(rawName || '-');
        if (privateRef) window.NoticeAttachments.bindLink(link, _supabase, url, message => myAlert(message, 'warning'));
        item.appendChild(link);
        list.appendChild(item);
    });
    preview.style.setProperty('display', 'block', 'important');
}

function setNoticeFileState(urls, names) {
    const safeUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
    const safeNames = Array.isArray(names) ? names : [];
    document.getElementById('notice-file-urls').value = JSON.stringify(safeUrls);
    document.getElementById('notice-file-names').value = JSON.stringify(safeNames);
    document.getElementById('notice-file-url').value = safeUrls[0] || '';
    renderNoticeFilePreview(safeUrls, safeNames);
}

// [보조] 공지사항 파일 전체 삭제 (화면 처리)
function clearNoticeFile() {
    document.getElementById('notice-file').value = '';
    document.getElementById('notice-file-removed').value = '1';
    setNoticeFileState([], []);
}

let g_noticeEditorBridge = null;

function noticeContentToEditorHtml(rawContent) {
    const raw = String(rawContent || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return '<p></p>';
    if (/<\/?[a-z][^>]*>/i.test(raw)) return sanitizeAboutHtml(raw);
    return `<p>${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
}

async function ensureNoticeRichEditor() {
    if (!window.ApprovalRichEditor) throw new Error('편집기를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    await window.ApprovalRichEditor.loadTiptapModules();
    if (!g_noticeEditorBridge) {
        g_noticeEditorBridge = window.ApprovalRichEditor.createTiptapBridge({
            source: '#notice-content',
            editor: '#notice-content-editor',
            toolbar: '#notice-content-toolbar',
            placeholder: '공지 내용을 입력해 주세요.',
            buildHtmlFromSource: noticeContentToEditorHtml,
            normalizeHtml: sanitizeAboutHtml,
            askText: async (label, options) => (await window.CoopDialog.prompt(label, options?.value || '')),
            showMessage: (message) => myAlert(message, 'warning')
        });
    }
    g_noticeEditorBridge.ensure();
    return g_noticeEditorBridge;
}

let g_noticeOpening = false;
let g_noticeSaving = false;
let g_noticeRequest = null;
let g_noticeUploadedFiles = new Map();

function labelNoticeRichEditor() {
    const editor = g_noticeEditorBridge?.getEditor();
    if (editor?.setOptions) {
        // Persist accessibility in editor props; setEditable rebuilds the view.
        const props = editor.options.editorProps || {};
        editor.setOptions({editorProps: {...props, attributes: {...props.attributes,
            role:'textbox', 'aria-multiline':'true', 'aria-labelledby':'notice-content-label'}}});
    }
    const root = document.querySelector('#notice-content-editor .ProseMirror');
    root?.setAttribute('role', 'textbox');
    root?.setAttribute('aria-multiline', 'true');
    root?.setAttribute('aria-labelledby', 'notice-content-label');
}

async function openNoticeModal(id) {
    const modal = document.getElementById('noticeModal');
    if (g_noticeOpening || g_noticeSaving || modal.classList.contains('show')) return;
    bindSiteMutationModal(modal);
    g_noticeOpening = true;
    try {
        // Do not change the target or fields until the requested detail is available.
        let data = null;
        if (id) {
            const result = await scopeAdminTenant(_supabase.from('coop_notices')
                .select('*')).eq('id', id).single();
            if (result.error || !result.data) throw result.error || new Error('NOTICE_NOT_FOUND');
            data = result.data;
            if (data.source_approval_id) throw new Error('APPROVAL_NOTICE_NOT_EDITABLE');
        }
        await ensureNoticeRichEditor();
        document.getElementById('notice-title').value = data?.title || '';
        document.getElementById('notice-content').value = data?.content || '';
        const category = document.getElementById('notice-category');
        category.querySelectorAll('[data-notice-legacy-category]').forEach(option => option.remove());
        const categoryValue = data?.category || '공지';
        if (!Array.from(category.options).some(option => option.value === categoryValue)) {
            const option = document.createElement('option');
            option.value = categoryValue;
            option.textContent = categoryValue;
            option.dataset.noticeLegacyCategory = '1';
            category.appendChild(option);
        }
        category.value = categoryValue;
        document.getElementById('notice-status').value = data?.status || 'published';
        document.getElementById('notice-public').checked = data ? !data.is_members_only : false;
        document.getElementById('notice-doc-no').value = data?.doc_no || '';
        document.getElementById('notice-file').value = '';
        document.getElementById('notice-file-removed').value = '0';
        const urls = Array.isArray(data?.file_urls) && data.file_urls.length
            ? data.file_urls : (data?.file_url ? [data.file_url] : []);
        document.getElementById('notice-file-original').value = JSON.stringify(urls);
        setNoticeFileState(urls, Array.isArray(data?.file_names) ? data.file_names : []);
        if (!g_noticeEditorBridge.syncFromSource()) throw new Error('NOTICE_EDITOR_NOT_READY');
        labelNoticeRichEditor();
        g_current_notice_id = id || null;
        document.getElementById('notice-id').value = id || '';
        g_noticeRequest = null;
        g_noticeUploadedFiles = new Map();
        bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
        CoopSafeLog.error('Notice detail unavailable:', error);
        myAlert('공지를 불러오지 못했습니다. 기존 작성 내용은 저장하거나 덮어쓰지 않았습니다. 잠시 후 다시 열어주세요.', 'error');
    } finally {
        g_noticeOpening = false;
    }
}

// A single authorized RPC stores body, files and visibility in one transaction.
// The private request receipt makes an identical lost-response retry safe.
async function saveNotice() {
    if (g_noticeSaving || g_noticeOpening) return;
    const title = document.getElementById('notice-title').value;
    if (!title.trim()) return myAlert('제목을 입력해주세요.', 'warning');
    g_noticeSaving = true;
    const unlock = lockSiteMutationModal('noticeModal', 'btn-save-notice', '저장 중…');
    const editor = g_noticeEditorBridge?.getEditor();
    const wasEditable = editor?.isEditable;
    editor?.setEditable(false);
    showLoading(true);
    let confirmed = false;
    let phase = 'prepare';
    try {
        await ensureNoticeRichEditor();
        if (!g_noticeEditorBridge.syncToSource()) throw new Error('NOTICE_EDITOR_NOT_READY');
        const fileInput = document.getElementById('notice-file');
        const files = Array.from(fileInput.files || []);
        const originalUrls = safeParseArray(document.getElementById('notice-file-original').value);
        const finalUrls = safeParseArray(document.getElementById('notice-file-urls').value);
        const finalNames = safeParseArray(document.getElementById('notice-file-names').value);
        const removeFlag = document.getElementById('notice-file-removed').value === '1';
        const updates = {
            p_id: document.getElementById('notice-id').value || null,
            p_title: title,
            p_content: sanitizeAboutHtml(document.getElementById('notice-content').value),
            p_category: document.getElementById('notice-category').value,
            p_status: document.getElementById('notice-status').value,
            // Popups are not used. Keep the existing RPC argument for compatibility.
            p_is_popup: false,
            p_file_url: null,
            p_doc_no: document.getElementById('notice-doc-no').value || null,
            p_file_urls: null,
            p_file_names: null,
            p_is_members_only: !document.getElementById('notice-public').checked
        };
        phase = 'upload';
        const migratedUrls = originalUrls.filter(url => g_noticeUploadedFiles.has(url));
        for (const file of files) {
            let url = g_noticeUploadedFiles.get(file);
            if (!url) {
                url = await uploadNoticeFileToStorage(file);
                if (!url) throw new Error('NOTICE_FILE_UPLOAD_FAILED');
                g_noticeUploadedFiles.set(file, url);
            }
            if (!finalUrls.includes(url)) {
                finalUrls.push(url);
                finalNames.push(file.name || deriveNoticeFileName(url));
            }
            // Preserve successful uploads for a retry without uploading them twice.
            setNoticeFileState(finalUrls, finalNames);
        }
        if (updates.p_is_members_only) {
            for (let idx = 0; idx < finalUrls.length; idx += 1) {
                const previousUrl = finalUrls[idx];
                let privateUrl = g_noticeUploadedFiles.get(previousUrl);
                if (!privateUrl) {
                    privateUrl = await ensureNoticeAttachmentPrivacy(previousUrl, finalNames[idx]);
                    if (privateUrl !== previousUrl) g_noticeUploadedFiles.set(previousUrl, privateUrl);
                }
                if (privateUrl !== previousUrl) migratedUrls.push(previousUrl);
                finalUrls[idx] = privateUrl;
            }
        }
        finalUrls.forEach((url,idx) => {
            if (!finalNames[idx]) finalNames[idx] = deriveNoticeFileName(url);
        });
        setNoticeFileState(finalUrls, finalNames);
        fileInput.value = '';
        updates.p_file_url = finalUrls[0] || null;
        updates.p_file_urls = finalUrls.length ? finalUrls : null;
        updates.p_file_names = finalUrls.length ? finalNames : null;
        const fingerprint = JSON.stringify(updates);
        if (g_noticeRequest && g_noticeRequest.fingerprint !== fingerprint) {
            throw new Error('NOTICE_PENDING_SAVE_CHANGED');
        }
        if (!g_noticeRequest) g_noticeRequest = {fingerprint, id: crypto.randomUUID()};
        updates.p_request_id = g_noticeRequest.id;
        phase = 'rpc';
        const {data, error} = await _supabase.rpc('save_site_notice_secure', updates);
        if (error) throw error;
        if (!data?.id) throw new Error('NOTICE_SAVE_RECEIPT_MISSING');
        confirmed = true;
        document.getElementById('notice-id').value = data.id;
        document.getElementById('notice-doc-no').value = data.doc_no || '';
        g_current_notice_id = data.id;
        g_noticeRequest = null;
        document.getElementById('notice-file-original').value = JSON.stringify(finalUrls);
        document.getElementById('notice-file-removed').value = '0';
        await closeSiteMutationModal('noticeModal');
        // Old attachments must survive a failed notice write. Clean only after commit.
        let cleanupFailed = false;
        if (removeFlag || migratedUrls.length) {
            for (const url of originalUrls.filter(url => !finalUrls.includes(url) && (removeFlag || migratedUrls.includes(url)))) {
                try { await deleteNoticeFile(url); }
                catch (error) { cleanupFailed = true; CoopSafeLog.error('Notice saved; attachment cleanup failed:', error); }
            }
        }
        let refreshFailed = false;
        try { refreshFailed = await fetchNotices() === false; }
        catch (error) { refreshFailed = true; CoopSafeLog.error('Notice saved; list refresh failed:', error); }
        if (refreshFailed || cleanupFailed) {
            myAlert('공지는 저장되었습니다. ' + (refreshFailed ? '목록은 잠시 후 다시 열어 확인해주세요. ' : '') +
                (cleanupFailed ? '이전 첨부파일 정리가 완료되지 않았습니다. ' : '') + '다시 저장할 필요는 없습니다.', 'warning');
        } else myAlert('저장되었습니다.');
    } catch (error) {
        CoopSafeLog.error('Notice save result unavailable:', error);
        if (confirmed) {
            myAlert('공지는 저장되었습니다. 목록을 다시 열어 확인해주세요. 다시 저장할 필요는 없습니다.', 'warning');
        } else if (error?.message === 'NOTICE_PENDING_SAVE_CHANGED') {
            myAlert('이전 저장 결과를 확인하지 못한 상태입니다. 먼저 목록에서 저장 여부를 확인해주세요. 같은 내용의 재시도는 중복으로 등록되지 않습니다.', 'warning');
        } else if (phase === 'rpc') {
            // A known DB rejection is different from a lost transport response.
            if (['42501','22023','P0002'].includes(error?.code)) g_noticeRequest = null;
            myAlert('저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 목록에서 저장 여부를 확인하거나 같은 내용으로 다시 시도해주세요.', 'warning');
        } else myAlert('저장을 준비하지 못했습니다. 입력 내용과 기존 첨부파일은 유지됩니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
        showLoading(false);
        if (editor && wasEditable !== undefined) editor.setEditable(wasEditable);
        labelNoticeRichEditor();
        unlock();
        g_noticeSaving = false;
    }
}

// ================================================================
// [기능 4] 홈페이지 컨텐츠 (발전소, 연혁)
// ================================================================

// --- 발전소 ---
function normalizePlantProjectType(value) {
return String(value || '').trim() === 'participation' ? 'participation' : 'direct';
}

function getPlantProjectTypeLabel(value) {
return normalizePlantProjectType(value) === 'participation' ? '참여 발전형' : '직접 발전형';
}

function getPlantProjectTypeBadgeHtml(plant) {
const type = normalizePlantProjectType(plant?.project_type);
const className = type === 'participation'
? 'bg-info-subtle text-info border border-info-subtle'
: 'bg-success-subtle text-success border border-success-subtle';
return `<span class="badge ${className}">${escapeHtml(getPlantProjectTypeLabel(type))}</span>`;
}

function formatPlantNumber(value, suffix) {
const num = Number(value);
if (!Number.isFinite(num)) return '-';
return `${num.toLocaleString('ko-KR', {
minimumFractionDigits: num % 1 === 0 ? 0 : 2,
maximumFractionDigits: 2
})}${suffix || ''}`;
}

function formatPlantGenerationCalcMethodLabel(method) {
const normalized = String(method || '').trim();
if (normalized === 'share_percent') return '지분율 반영';
if (normalized === 'capacity_ratio') return '참여용량 반영';
if (normalized === 'direct_input') return '직접 입력값';
if (normalized === 'excluded') return '통계 제외';
if (normalized === 'direct_full') return '전체 반영';
return '미설정';
}

function getPlantParticipationSummary(plant) {
if (normalizePlantProjectType(plant?.project_type) !== 'participation') return '';
const parts = [];
if (plant?.participation_capacity !== null && plant?.participation_capacity !== undefined && plant?.participation_capacity !== '') {
parts.push(`참여용량 ${formatPlantNumber(plant.participation_capacity, 'kW')}`);
}
if (plant?.participation_share_percent !== null && plant?.participation_share_percent !== undefined && plant?.participation_share_percent !== '') {
parts.push(`지분율 ${formatPlantNumber(plant.participation_share_percent, '%')}`);
}
parts.push(formatPlantGenerationCalcMethodLabel(plant?.generation_calc_method));
return parts.join(' · ');
}

function getPowerGenerationPlantOptionLabel(plant) {
const typeLabel = getPlantProjectTypeLabel(plant?.project_type);
const calcLabel = formatPlantGenerationCalcMethodLabel(plant?.generation_calc_method || 'direct_full');
return `${plant?.name || '-'} (${typeLabel} · ${calcLabel})`;
}

function readNullableNumberInput(id) {
const el = document.getElementById(id);
if (!el) return null;
const raw = String(el.value || '').trim();
if (raw === '') return null;
const num = Number(raw);
return Number.isFinite(num) ? num : null;
}

function setPlantInputValue(id, value) {
const el = document.getElementById(id);
if (el) el.value = value ?? '';
}

function togglePlantProjectTypeFields() {
const type = normalizePlantProjectType(document.getElementById('plant-project-type')?.value);
const fields = document.getElementById('plant-participation-fields');
const capacityLabel = document.getElementById('plant-capacity-label');
if (fields) fields.style.display = type === 'participation' ? 'block' : 'none';
if (capacityLabel) capacityLabel.innerText = type === 'participation' ? '전체 사업 용량 (kW)' : '설비용량 (kW)';
}

// [수정] 발전소 목록 불러오기 (삭제 버튼 추가 + 전역변수 저장)
async function fetchPlants() {
const { data, error } = await scopeAdminTenant(_supabase.from('site_power_plants').select('*')).order('display_order');
const tbody = document.getElementById('plantListBody');
tbody.innerHTML = '';

if(error || !data) {
if (error) CoopSafeLog.error("[fetchPlants] failed:", error);
g_plants = []; // 데이터 없으면 빈 배열
updatePowerGenerationPlantOptions();
return;
}

g_plants = data; // ★ 핵심: 목록을 전역 변수에 저장 (나중에 순서 계산할 때 씀)

if(data.length === 0) {
tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">등록된 발전소가 없습니다.</td></tr>';
updatePowerGenerationPlantOptions();
return;
}

data.forEach(p => {
const monitorUrl = normalizeAdminHttpUrl(p.monitor_url);
const monitorHtml = monitorUrl
? `<a href="${escapeHtml(monitorUrl)}" target="_blank" rel="noopener noreferrer" class="text-truncate" style="max-width:140px; display:inline-block;">${escapeHtml(monitorUrl)}</a>`
: '-';
const participationSummary = getPlantParticipationSummary(p);
tbody.innerHTML += `<tr>
                   <td>${escapeHtml(String(p.display_order ?? ''))}</td>
                   <td>${getPlantProjectTypeBadgeHtml(p)}</td>
                   <td>
                       <div class="fw-semibold">${escapeHtml(p.name || '-')}</div>
                       ${participationSummary ? `<div class="small text-muted">${escapeHtml(participationSummary)}</div>` : ''}
                   </td>
                   <td>${escapeHtml(formatPlantNumber(p.capacity, 'kW'))}</td>
                   <td>${escapeHtml(p.status || '-')}</td>
                   <td>${monitorHtml}</td>
                   <td>
                       <button class="btn btn-sm btn-light" onclick="openPlantModal('${escapeJsString(p.id)}')">수정</button>
                       <button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeletePlant('${escapeJsString(p.id)}')">삭제</button>
                   </td>
               </tr>`;
});
updatePowerGenerationPlantOptions();
}
// [수정] 발전소 모달 열기 (순서 자동 계산)
// [수정 2] 발전소 모달 열기 (순서 자동 계산 + 빈칸 0 처리)

// [수정] 발전소 저장 (빈칸 -> 0 자동 변환 안전장치 추가)


// --- 연혁 ---
// 독립 연혁과 우리 소식에서 재사용하는 주요 연혁을 함께 불러온다.
async function fetchHistory() {
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*'))
  .in('category', ['history', 'activity'])
  .order('event_date', {ascending:false})
  .order('updated_at', {ascending:false});
const tbody = document.getElementById('historyListBody');
tbody.innerHTML = '';
if (error) {
CoopSafeLog.error("[fetchHistory] failed:", error);
tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">연혁을 불러오지 못했습니다.</td></tr>';
return false;
}
const historyRows = (Array.isArray(data) ? data : []).filter((row) => row.category === 'history' || row.is_history_milestone === true);
if (historyRows.length === 0) {
tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">등록된 연혁이 없습니다.</td></tr>';
return true;
}
historyRows.forEach(h => {
const historyId = escapeJsString(String(h.id || ''));
const isLinkedActivity = h.category === 'activity' && h.is_history_milestone === true;
const displayTitle = isLinkedActivity ? (h.history_title || h.title || '') : (h.title || '');
const rawContent = isLinkedActivity
? '우리 소식의 상세 내용과 사진을 재사용합니다.'
: String(h.content || '');
const contentTitle = escapeHtml(rawContent.replace(/\s+/g, ' ').trim());
const linkedBadge = isLinkedActivity ? '<span class="badge bg-warning text-dark ms-2">우리 소식 연동</span>' : '';
const actions = isLinkedActivity
? `<button class="btn btn-sm btn-outline-success" onclick="openActivityModal('${historyId}')">우리 소식 수정</button>`
: `<button class="btn btn-sm btn-light" onclick="openSiteHistoryModal('${historyId}')">수정</button>
   <button class="btn btn-sm btn-outline-danger" onclick="askDeleteHistory('${historyId}')">삭제</button>`;
tbody.innerHTML += `<tr class="${isLinkedActivity ? 'site-history-linked-row' : ''}">
                   <td class="site-history-date">${escapeHtml(h.event_date || '')}</td>
                   <td><div class="site-history-title">${escapeHtml(displayTitle)}${linkedBadge}</div></td>
                   <td><div class="site-history-content-preview" title="${contentTitle}">${escapeHtml(rawContent)}</div></td>
                   <td><div class="site-history-actions">${actions}</div></td>
               </tr>`;
});
return true;
}
let globalHistoryData = {
    ledger: [],
    donations: [],
    points: [],
    dividends: []
};
let activeMemberHistoryType = '';

function ensureMemberHistoryModal() {
    let modalEl = document.getElementById('memberHistoryModal');
    if (modalEl) return modalEl;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="memberHistoryModal" tabindex="-1" aria-hidden="true" aria-labelledby="historyModalTitle">
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h5 class="modal-title fw-bold mb-1" id="historyModalTitle">상세 내역</h5>
                            <div class="small text-muted" id="historyModalSummary">-</div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                    </div>
                    <div class="modal-body">
                        <div class="member-history-filter d-none" id="memberHistoryFilter">
                            <div class="member-history-filter-actions mb-2">
                                <button class="btn btn-sm btn-outline-secondary" type="button" onclick="setMemberHistoryQuickRange('all')">전체 기간</button>
                                <button class="btn btn-sm btn-outline-secondary" type="button" onclick="setMemberHistoryQuickRange('current-year')">올해</button>
                                <button class="btn btn-sm btn-outline-secondary" type="button" onclick="setMemberHistoryQuickRange('previous-year')">지난해</button>
                            </div>
                            <div class="row g-2 align-items-end">
                                <div class="col-sm-4">
                                    <label class="form-label" for="memberHistoryDateFrom">시작일</label>
                                    <input class="form-control form-control-sm" type="date" id="memberHistoryDateFrom">
                                </div>
                                <div class="col-sm-4">
                                    <label class="form-label" for="memberHistoryDateTo">종료일</label>
                                    <input class="form-control form-control-sm" type="date" id="memberHistoryDateTo">
                                </div>
                                <div class="col-sm-4 d-flex gap-2">
                                    <button class="btn btn-sm btn-primary flex-grow-1" type="button" onclick="applyMemberHistoryFilter()">조회</button>
                                    <button class="btn btn-sm btn-outline-secondary" type="button" onclick="setMemberHistoryQuickRange('all')">초기화</button>
                                </div>
                            </div>
                        </div>
                        <div id="historyModalList"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-dark" data-bs-dismiss="modal">닫기</button>
                    </div>
                </div>
            </div>
        </div>
    `);

    modalEl = document.getElementById('memberHistoryModal');
    applyAdminMemberModalLayer(modalEl);
    return modalEl;
} // End of ensureMemberHistoryModal

function getMemberHistoryDate(type, row) {
    if (type === 'ledger') return String(row?.deposit_date || '').slice(0, 10);
    if (type === 'donation') return String(row?.donation_date || '').slice(0, 10);
    return '';
} // End of getMemberHistoryDate

function getFilteredMemberHistoryRows(type) {
    const source = type === 'ledger'
        ? globalHistoryData.ledger
        : (type === 'donation' ? globalHistoryData.donations : []);
    const from = String(document.getElementById('memberHistoryDateFrom')?.value || '');
    const to = String(document.getElementById('memberHistoryDateTo')?.value || '');
    return (Array.isArray(source) ? source : []).filter((row) => {
        const date = getMemberHistoryDate(type, row);
        if (!date) return !from && !to;
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
    });
} // End of getFilteredMemberHistoryRows

function getFundPaymentMethodLabel(value) {
    const safeValue = String(value || '').trim().toLowerCase();
    if (safeValue === 'transfer') return '계좌이체';
    if (safeValue === 'cash') return '현금';
    if (safeValue === 'card') return '카드';
    if (safeValue === 'etc') return '기타';
    return safeValue || '-';
} // End of getFundPaymentMethodLabel

function getCapitalNotificationStatusMeta(item) {
    const status = String(item?.capital_notification_status || '').trim();
    const errorCode = String(item?.capital_notification_error_code || '').trim();
    if (!status) return null;
    if (status === 'accepted') return { label: '카톡 발송', className: 'text-bg-success', canSend: false };
    if (status === 'processing') return { label: '카톡 발송 중', className: 'text-bg-info', canSend: false };
    if (status === 'unknown') return { label: '카톡 확인 필요', className: 'text-bg-warning', canSend: false };
    if (status === 'queued') return { label: '카톡 발송 대기', className: 'text-bg-info', canSend: false };
    if (status === 'failed') return { label: '카톡 발송 실패', className: 'text-bg-danger', canSend: true };
    if (status === 'skipped' && errorCode === 'MEMBER_PHONE_UNAVAILABLE') {
        return { label: '전화번호 확인', className: 'text-bg-warning', canSend: true };
    }
    if (status === 'deferred' || status === 'skipped') return { label: '카톡 미발송', className: 'text-bg-secondary', canSend: true };
    return { label: '카톡 미발송', className: 'text-bg-secondary', canSend: true };
} // End of getCapitalNotificationStatusMeta

function renderCapitalNotificationHistoryControl(item) {
    if (isAdminMemberSiteProfile()) return '';
    const statusMeta = getCapitalNotificationStatusMeta(item);
    if (!statusMeta) return '';
    const capitalId = Number(item?.id || 0);
    const badgeHtml = `<span class="badge ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>`;
    if (!statusMeta.canSend || !Number.isInteger(capitalId) || capitalId <= 0) return badgeHtml;
    const buttonLabel = String(item?.capital_notification_status || '') === 'deferred' ? '알림톡 보내기' : '다시 보내기';
    return `${badgeHtml}<button class="btn btn-sm btn-outline-primary" type="button" onclick="openCapitalNotificationFromHistory(${capitalId})">${buttonLabel}</button>`;
} // End of renderCapitalNotificationHistoryControl

function renderMemberHistoryContent(type) {
    const titleEl = document.getElementById('historyModalTitle');
    const summaryEl = document.getElementById('historyModalSummary');
    const listEl = document.getElementById('historyModalList');
    if (!titleEl || !summaryEl || !listEl) return;

    let title = '';
    let total = 0;
    let html = '<div class="member-history-table-wrap"><table class="table table-sm table-striped small member-history-table"><thead>';

    if(type === 'ledger') {
        title = '출자금 납입 내역';
        html += '<tr class="table-success"><th>날짜</th><th class="text-end">금액</th><th>입금자</th><th>비고</th><th class="text-end">관리</th></tr></thead><tbody>';
        const data = getFilteredMemberHistoryRows(type);
        total = calculateMemberFundTotal(data);

        if(data.length === 0) html += '<tr><td colspan="5" class="member-history-empty text-center py-3 text-muted">해당 기간의 출자금 내역이 없습니다.</td></tr>';
        else {
            data.forEach(item => {
                const amount = Number(item.amount || 0);
                const amountClass = amount < 0 ? 'text-danger' : 'text-success';
                const rowData = encodeInlineArgument(JSON.stringify(item));
                const notificationControl = renderCapitalNotificationHistoryControl(item);
                html += `<tr>
                    <td data-label="날짜">${escapeHtml(formatAdminMemberKstDate(item.deposit_date))}</td>
                    <td data-label="금액" class="text-end fw-bold ${amountClass}">${amount.toLocaleString('ko-KR')}원</td>
                    <td data-label="입금자">${escapeHtml(item.depositor || '-')}</td>
                    <td data-label="비고" class="member-history-note" title="${escapeHtml(item.note || '')}">${escapeHtml(item.note || '-')}</td>
                    <td data-label="관리" class="text-end"><div class="member-history-manage-actions"><button class="btn btn-sm btn-light border" type="button" onclick="openFundEditorFromHistory('capital','${rowData}')">수정</button>${notificationControl}</div></td>
                </tr>`;
            });
        }
        const from = String(document.getElementById('memberHistoryDateFrom')?.value || '');
        const to = String(document.getElementById('memberHistoryDateTo')?.value || '');
        summaryEl.innerText = from || to
            ? `${from || '최초'} ~ ${to || '현재'} · ${data.length.toLocaleString('ko-KR')}건 · 기간 내 변동 ${total.toLocaleString('ko-KR')}원`
            : `현재 출자금 ${total.toLocaleString('ko-KR')}원 · 총 ${data.length.toLocaleString('ko-KR')}건`;

    } else if(type === 'donation') {
        title = '기부금 납부 내역';
        html += '<tr class="table-primary"><th>날짜</th><th class="text-end">금액</th><th>입금 방식</th><th>전표 상태</th><th>메모</th><th class="text-end">관리</th></tr></thead><tbody>';
        const data = getFilteredMemberHistoryRows(type);
        total = calculateMemberFundTotal(data);

        if(data.length === 0) html += '<tr><td colspan="6" class="member-history-empty text-center py-3 text-muted">해당 기간의 기부금 내역이 없습니다.</td></tr>';
        else {
            data.forEach(item => {
                const rowData = encodeInlineArgument(JSON.stringify(item));
                const noteParts = getDonationNoteParts(item.note);
                html += `<tr>
                    <td data-label="날짜">${escapeHtml(formatAdminMemberKstDate(item.donation_date))}</td>
                    <td data-label="금액" class="text-end fw-bold text-primary">${Number(item.amount || 0).toLocaleString('ko-KR')}원</td>
                    <td data-label="입금 방식">${escapeHtml(getFundPaymentMethodLabel(item.payment_method || item.type))}</td>
                    <td data-label="전표 상태">${renderDonationJournalStatus(noteParts.completed)}</td>
                    <td data-label="메모" class="member-history-note" title="${escapeHtml(noteParts.memo)}">${escapeHtml(noteParts.memo || '-')}</td>
                    <td data-label="관리" class="text-end"><button class="btn btn-sm btn-light border" type="button" onclick="openFundEditorFromHistory('donation','${rowData}')">수정</button></td>
                </tr>`;
            });
        }
        const from = String(document.getElementById('memberHistoryDateFrom')?.value || '');
        const to = String(document.getElementById('memberHistoryDateTo')?.value || '');
        summaryEl.innerText = from || to
            ? `${from || '최초'} ~ ${to || '현재'} · ${data.length.toLocaleString('ko-KR')}건 · 기간 기부금 ${total.toLocaleString('ko-KR')}원`
            : `누적 기부금 ${total.toLocaleString('ko-KR')}원 · 총 ${data.length.toLocaleString('ko-KR')}건`;

    } else if(type === 'point') {
        title = '이용실적 보상 적립/차감 내역';
        html += '<tr class="table-warning"><th>날짜</th><th>내용</th><th class="text-end">변동</th></tr></thead><tbody>';
        const data = globalHistoryData.points || [];
        total = data.reduce((a,c)=>a+Number(c.change_amount),0);

        if(data.length === 0) html += '<tr><td colspan="3" class="member-history-empty text-center py-3">내역 없음</td></tr>';
        else {
            data.forEach(item => {
                const isPlus = item.change_amount > 0;
                const style = isPlus ? 'text-primary' : 'text-danger';
                const sign = isPlus ? '+' : '';
                html += `<tr>
                    <td data-label="날짜">${formatAdminMemberKstDate(item.created_at)}</td>
                    <td data-label="내용">${escapeHtml(item.reason || item.transaction_type || '-')}</td>
                    <td data-label="변동" class="text-end fw-bold ${style}">${sign}${Number(item.change_amount).toLocaleString()}</td>
                </tr>`;
            });
        }
        summaryEl.innerText = `현재 잔액: ${Number(total).toLocaleString()}원`;

    } else if(type === 'dividend') {
        title = '확정 배당금 내역';
        html += '<tr class="table-primary"><th>연도</th><th>회차</th><th>지급기준일</th><th>상태</th><th class="text-end">세전</th><th class="text-end">세후</th></tr></thead><tbody>';
        const data = globalHistoryData.dividends || [];
        total = data.reduce((a,c)=>a+Number(c.net_amount || c.total_amount || 0),0);

        if(data.length === 0) html += '<tr><td colspan="6" class="member-history-empty text-center py-3">내역 없음</td></tr>';
        else {
            data.forEach(item => {
                html += `<tr>
                    <td data-label="연도">${item.fiscal_year}년</td>
                    <td data-label="회차" class="text-start">${escapeHtml(item.title || '-')}</td>
                    <td data-label="지급기준일">${formatAdminMemberKstDate(item.paid_at || item.payment_due_date || item.payment_base_date)}</td>
                    <td data-label="상태">${getDividendExportStatusBadge(item.payment_status || item.status || '-')}</td>
                    <td data-label="세전" class="text-end fw-bold">${Number(item.total_amount || item.gross_amount || 0).toLocaleString()}원</td>
                    <td data-label="세후" class="text-end fw-bold text-primary">${Number(item.net_amount || 0).toLocaleString()}원</td>
                </tr>`;
            });
        }
        summaryEl.innerText = `세후 합계: ${Number(total).toLocaleString()}원`;
    }

    html += '</tbody></table></div>';

    titleEl.innerText = title;
    listEl.innerHTML = html;
} // End of renderMemberHistoryContent

function applyMemberHistoryFilter() {
    if (!['ledger', 'donation'].includes(activeMemberHistoryType)) return;
    const from = String(document.getElementById('memberHistoryDateFrom')?.value || '');
    const to = String(document.getElementById('memberHistoryDateTo')?.value || '');
    if (from && to && from > to) {
        myAlert('조회 시작일은 종료일보다 늦을 수 없습니다.', 'warning');
        return;
    }
    renderMemberHistoryContent(activeMemberHistoryType);
} // End of applyMemberHistoryFilter

function setMemberHistoryQuickRange(rangeKey) {
    const fromEl = document.getElementById('memberHistoryDateFrom');
    const toEl = document.getElementById('memberHistoryDateTo');
    if (!fromEl || !toEl) return;

    if (rangeKey === 'all') {
        fromEl.value = '';
        toEl.value = '';
    } else {
        const today = todayYmdKst();
        const currentYear = Number(today.slice(0, 4));
        const selectedYear = rangeKey === 'previous-year' ? currentYear - 1 : currentYear;
        fromEl.value = `${selectedYear}-01-01`;
        toEl.value = rangeKey === 'previous-year' ? `${selectedYear}-12-31` : today;
    }
    applyMemberHistoryFilter();
} // End of setMemberHistoryQuickRange

function openFundEditorFromHistory(type, rowDataStr) {
    const historyModalEl = document.getElementById('memberHistoryModal');
    const openEditor = function () {
        openFundEditor(type, rowDataStr);
    };
    if (!historyModalEl || !historyModalEl.classList.contains('show')) {
        openEditor();
        return;
    }

    historyModalEl.addEventListener('hidden.bs.modal', openEditor, { once: true });
    bootstrap.Modal.getOrCreateInstance(historyModalEl).hide();
} // End of openFundEditorFromHistory

function openHistoryModal(type) {
    const statusKey = { point: 'points', dividend: 'dividends' }[type] || String(type || '');
    const status = g_member_fund_status[statusKey];
    if (status && status !== 'ready') {
        myAlert(status === 'loading' ? '내역을 불러오는 중입니다.' : '내역을 불러오지 못했습니다. 다시 조회해 주세요.', 'warning');
        return;
    }
    const modalEl = ensureMemberHistoryModal();
    const filterEl = document.getElementById('memberHistoryFilter');
    const fromEl = document.getElementById('memberHistoryDateFrom');
    const toEl = document.getElementById('memberHistoryDateTo');
    if (!modalEl || !filterEl || !fromEl || !toEl) {
        CoopSafeLog.error("[openHistoryModal] history modal elements missing");
        myAlert('상세 내역 모달을 열 수 없습니다. 화면을 새로고침한 뒤 다시 시도해주세요.', 'error');
        return;
    }

    activeMemberHistoryType = String(type || '');
    const fundHistory = ['ledger', 'donation'].includes(activeMemberHistoryType);
    filterEl.classList.toggle('d-none', !fundHistory);
    fromEl.value = '';
    toEl.value = '';
    renderMemberHistoryContent(activeMemberHistoryType);

    // 조합원 상세 모달 위에서 다시 열릴 수 있으므로 별도 Bootstrap 모달로 띄운다.
    applyAdminMemberModalLayer(modalEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}


let currentHistoryEditId = null;
let isSavingSiteHistory = false;

/* SITE_LAZY: normalizeHistoryContentForCompare */

/* SITE_LAZY: isHistoryRowMatched */

/* SITE_LAZY: updateSiteHistoryContentCounter */

// [수정] 사이트 연혁 모달 열기 (이름 변경: openSiteHistoryModal)
/* SITE_LAZY: openSiteHistoryModal */

// [수정] 사이트 연혁 저장 (이름 변경: saveSiteHistory)
/* SITE_LAZY: saveSiteHistory */


// 유틸리티
function showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
function logout() { window.ContributionCertPreview?.clear(); _supabase.auth.signOut().then(() => location.href='index.html'); }
// [수정] 탭 전환 함수 (대시보드 로직 추가)

// ================================================================
// [기능 5] 섹션(메뉴) 관리 (ON/OFF)
// ================================================================

const REQUIRED_SITE_SECTIONS = Object.freeze([
Object.freeze({
id: 'activities',
name: '활동 내역',
display_order: 7,
is_visible: true
}),
Object.freeze({
id: 'ops-system',
name: '협동조합 운영 시스템',
display_order: 7,
is_visible: true
}),
Object.freeze({
id: 'game-hall',
name: '햇빛 게임 명예의 전당',
display_order: 10,
is_visible: true
})
]);

const SITE_MEMBER_REQUIRED_SITE_SECTIONS = Object.freeze([
Object.freeze({
id: 'impact',
name: '조합원·출자금 현황',
display_order: 3,
is_visible: true
})
]);

const SITE_MEMBER_REMOVED_SECTION_IDS = Object.freeze([
'calculator',
'ops-system',
'game-hall'
]);

function isSiteMemberRemovedSection(sectionId) {
return isAdminMemberSiteProfile()
&& SITE_MEMBER_REMOVED_SECTION_IDS.includes(String(sectionId || '').trim());
}

function getRequiredSiteSectionsForCurrentProfile() {
const requiredSections = isAdminMemberSiteProfile()
? [...REQUIRED_SITE_SECTIONS, ...SITE_MEMBER_REQUIRED_SITE_SECTIONS]
: [...REQUIRED_SITE_SECTIONS];
return requiredSections.filter((section) => !isSiteMemberRemovedSection(section?.id));
}

const SECTION_VISUAL_ORDER = Object.freeze({
hero: 1,
about: 2,
impact: 3,
progress: 3,
status: 4,
portfolio: 5,
calculator: 6,
activities: 7,
 'ops-system': 7,
documents: 8,
partners: 9,
'game-hall': 10,
faq: 11,
contact: 12
});

let g_siteSections = [];
let g_sectionDrafts = [];
let g_siteInitialSectionsRequested = false;
let g_sectionLoadPromise = null;
let g_sectionSaving = false;
let g_sectionReadRevision = 0;

/* SITE_LAZY: openSectionSettings */

/* SITE_LAZY: loadInitialSiteSections */

/* SITE_LAZY: getSectionDisplayOrder */

/* SITE_LAZY: createSectionSnapshot */

/* SITE_LAZY: createSectionExpectedSnapshot */

/* SITE_LAZY: hasPendingSectionChanges */

/* SITE_LAZY: updateSectionSaveButton */

/* SITE_LAZY: getSortedSectionDrafts */

/* SITE_LAZY: renderSectionRows */

/* SITE_LAZY: renderSectionSeedHint */

/* SITE_LAZY: renderSectionSeedButton */

// 1. 섹션 목록 불러오기
/* SITE_LAZY: fetchSections */

/* SITE_LAZY: loadSectionRows */

/* SITE_LAZY: applySectionRows */

/* SITE_LAZY: reloadSectionSettings */

/* SITE_LAZY: showSectionSaveError */

/* SITE_LAZY: seedRequiredSections */

/* SITE_LAZY: moveSectionOrder */

/* SITE_LAZY: toggleSection */

/* SITE_LAZY: saveSectionChanges */
// 연혁 삭제 함수

// [수정 1] 삭제 요청 (모달 띄우기)
// 연혁 삭제 요청
/* SITE_LAZY: askDeleteHistory */

// [수정 2] 실제 삭제 실행 (모달에서 '삭제하기' 클릭 시)
/* SITE_LAZY: confirmDeleteHistory */
// ================================================================
// [기능 6] About(소개) 관리
// ================================================================
/* SITE_LAZY: getSiteSectionEditorTarget */

/* SITE_LAZY: openSiteSectionEditor */

const g_siteEditorDrafts = new Map();
const g_siteEditorFieldLocks = new Map();

/* SITE_LAZY: siteEditorFormSnapshot */

/* SITE_LAZY: getSiteEditorDraft */

/* ADMIN_SITE_BOOT_START */
let g_siteCodeRequest = null;
function setAdminMemberSiteLoading(phase) {
    const pane = document.getElementById('tab-site');
    if (!pane || ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') return;
    pane.inert = phase !== 'ready';
    pane.setAttribute('aria-busy', String(phase === 'loading'));
    let panel = document.getElementById('admin-site-code-status');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'admin-site-code-status';
        panel.className = 'alert alert-light border';
        const message = document.createElement('span');
        message.setAttribute('role', 'status');
        panel.append(message);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn-sm btn-outline-primary ms-3';
        retry.textContent = '다시 불러오기';
        retry.onclick = () => { void openAdminMemberSiteEditor(); };
        panel.append(retry);
        pane.before(panel); // Retry stays outside the inert editor; original input nodes are untouched.
    }
    panel.hidden = phase === 'ready' || phase === 'idle' || pane.style.display === 'none';
    panel.firstElementChild.textContent = phase === 'error'
        ? '편집 도구를 불러오지 못했습니다. 다시 시도해 주세요.'
        : '편집 도구를 불러오는 중입니다…';
    panel.querySelector('button').hidden = phase !== 'error';
}
setAdminMemberSiteLoading('idle');

function canInitializeAdminMemberSite(runtime, authId) {
    return !!runtime && !!authId && g_adminMemberRuntime === runtime
        && adminCertificateAuthId === authId
        && canAccessAdminMemberTab('site')
        && !document.getElementById('main-system')?.classList.contains('hidden');
}
function ensureAdminMemberSiteReady() {
    const runtime = g_adminMemberRuntime, authId = adminCertificateAuthId;
    if (!canInitializeAdminMemberSite(runtime, authId) || ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') return Promise.resolve(false);
    if (window.AdminMemberSite?.isInitialized()) return Promise.resolve(true);
    if (g_siteCodeRequest) return g_siteCodeRequest;
    setAdminMemberSiteLoading('loading');
    g_siteCodeRequest = (async () => {
        try {
            const site = await AdminMemberAssets.ensureSite();
            // A delayed code download must not start tenant reads after the session or scope changed.
            if (!canInitializeAdminMemberSite(runtime, authId)) {
                setAdminMemberSiteLoading('idle');
                return false;
            }
            site.initialize();
            setAdminMemberSiteLoading('ready');
            return true;
        } catch (_) {
            setAdminMemberSiteLoading('error');
            return false;
        } finally {
            g_siteCodeRequest = null;
        }
    })();
    return g_siteCodeRequest;
}
async function openAdminMemberSiteEditor() {
    if (!(await ensureAdminMemberSiteReady())) return false;
    if (document.getElementById('tab-site')?.style.display === 'none') return true;
    await loadInitialSiteSections();
    return true;
}
/* ADMIN_SITE_BOOT_END */

let g_homeSettingsSaving = false;
let g_homeSettingsRecord = {};
let g_homePreviewModal = null;
let g_homePreviewTimer = 0;
let g_homePreviewSourceWindow = null;
let g_homePreviewChannel = null;
let g_homePreviewStorageKey = '';
let g_homePreviewRevision = 0;
let g_homePreviewImpactSource = 'sections';
const g_homePreviewFiles = new WeakMap();
let g_homeVisualStarted = false;
const HOME_CTA_PRESETS = new Set(['/signup.html', '#about', '#activities', '#contact', '']);

/* SITE_LAZY: setHomeImagePreview */

/* SITE_LAZY: previewHomeImage */

/* SITE_LAZY: clearHomeImage */

/* SITE_LAZY: updateHomeOverlayLabel */

/* SITE_LAZY: setHomeCtaValue */

/* SITE_LAZY: toggleHomeCtaCustom */

/* SITE_LAZY: readHomeCtaValue */

/* SITE_LAZY: normalizeHomeImpactRegions */

/* SITE_LAZY: renderHomeImpactRegions */

/* SITE_LAZY: addHomeImpactRegion */

/* SITE_LAZY: readHomeImpactRegions */

/* SITE_LAZY: updateHomeImpactModeUi */

/* SITE_LAZY: setHomeSettingsMode */

/* SITE_LAZY: handleHomeSettingsModeKey */

/* SITE_LAZY: initializeHomeFontOptions */

/* SITE_LAZY: updateHomeFontSelection */

/* SITE_LAZY: selectHomeFontPair */

/* SITE_LAZY: recommendHomeFonts */

/* SITE_LAZY: selectHomeTemplate */

/* SITE_LAZY: setHomeSettingsForm */

/* SITE_LAZY: fetchHomeSettings */

/* SITE_LAZY: validateHomeCtaUrl */

/* SITE_LAZY: collectHomeSettingsPayload */

/* SITE_LAZY: saveHomeSettings */

/* SITE_LAZY: readHomePreviewFile */

/* SITE_LAZY: collectSitePreviewDraft */

/* SITE_LAZY: collectHomePreviewSettings */

/* SITE_LAZY: getHomePreviewUrl */

/* SITE_LAZY: sendHomePreviewSettings */

/* Preview listener is installed by AdminMemberSite.initialize(). */

/* SITE_LAZY: queueHomePreviewUpdate */

/* SITE_LAZY: bindHomePreviewInputs */

/* SITE_LAZY: setHomePreviewDevice */

/* SITE_LAZY: openHomePreview */

let g_aboutSettingsSaving = false;
let g_aboutOriginalImageUrl = '';
let g_aboutPreviewObjectUrl = '';

function sanitizeAboutHtml(rawHtml) {
const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SPAN', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A']);
const doc = new DOMParser().parseFromString(`<div>${String(rawHtml || '')}</div>`, 'text/html');
const root = doc.body.firstElementChild;
if (!root) return '';
Array.from(root.querySelectorAll('*')).forEach((node) => {
if (!allowedTags.has(node.tagName)) {
if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH'].includes(node.tagName)) { node.remove(); return; }
node.replaceWith(...Array.from(node.childNodes));
return;
}
Array.from(node.attributes).forEach((attr) => {
const name = attr.name.toLowerCase();
if (node.tagName === 'SPAN' && name === 'style') {
const safe = [];
for (const property of ['color','background-color']) {
const value = node.style.getPropertyValue(property).trim();
if (/^(#[a-f0-9]{3,8}|rgba?\([0-9.,%\s]+\))$/i.test(value)) safe.push(`${property}:${value}`);
}
if (safe.length) node.setAttribute('style', safe.join(';')); else node.removeAttribute('style');
return;
}
if (node.tagName === 'A' && name === 'href') {
const href = String(attr.value || '').trim();
if (!/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(href)) node.removeAttribute(attr.name);
return;
}
node.removeAttribute(attr.name);
});
if (node.tagName === 'A' && node.hasAttribute('href')) {
node.setAttribute('rel', 'noopener noreferrer');
}
});
return root.innerHTML.trim();
}

/* SITE_LAZY: aboutHtmlToEditableText */

/* SITE_LAZY: parseAboutListItems */

/* SITE_LAZY: revokeAboutPreviewObjectUrl */

/* SITE_LAZY: setAboutImageStatus */

/* SITE_LAZY: previewAboutImageFile */

/* SITE_LAZY: clearAboutImage */

/* SITE_LAZY: isManagedAboutImageUrl */

/* SITE_LAZY: deleteManagedAboutImage */

/* SITE_LAZY: fetchAboutSettings */




// [보조 함수] 전체 미리보기 업데이트 (탭 누를 때 실행됨)
// [수정] 전체 미리보기 (입력 안 한 건 안 보이게 처리)
// [수정] 전체 미리보기 (점 제거 반영)
let totalPreviewUpdateTimer = null;

/* SITE_LAZY: queueTotalPreviewUpdate */

/* SITE_LAZY: updateTotalPreview */

// [수정] 소개글 저장하기 (모달 적용)
/* SITE_LAZY: saveAboutSettings */

let g_siteCertifications = [];
let g_siteCertificationsLoaded = false;
let g_siteCertificationSaving = false;

/* SITE_LAZY: formatCertificationDate */

/* SITE_LAZY: resetSiteCertificationForm */

/* SITE_LAZY: clearSiteCertificationImage */

/* SITE_LAZY: editSiteCertification */

/* SITE_LAZY: renderSiteCertifications */

/* SITE_LAZY: fetchSiteCertifications */

/* SITE_LAZY: isManagedCertificationImageUrl */

/* SITE_LAZY: deleteManagedCertificationImage */

/* SITE_LAZY: saveSiteCertification */

/* SITE_LAZY: askDeleteSiteCertification */
// [보조 함수] 상태에 따라 슬라이더 숨기기/보이기
function toggleProgressSlider() {
const status = document.getElementById('plant-status').value;
const area = document.getElementById('plant-progress-area');

if (status === '운영중') {
area.style.display = 'none'; // 운영중이면 100%니까 숨김
} else {
area.style.display = 'block'; // 공사/준비중이면 보임
}
}

// [수정] 발전소 모달 열기 (진행률 불러오기 추가)


// [수정] 발전소 저장 (진행률 포함 전송)

// [추가] 발전소 삭제 요청
function askDeletePlant(id) {
deleteType = 'plant';
document.getElementById('delete-target-id').value = id;
// 버튼에 이벤트 연결
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}


// [수정] 통합 삭제 실행 함수 (중복 선언 해결 & 뱃지 삭제 추가)
// [수정] 통합 삭제 실행 함수 (중복 선언 해결 & 뱃지 삭제 추가)

const ADMIN_PLANT_PROGRESS_STAGES = Object.freeze([
Object.freeze({ value: 0, title: '후보지 선정' }),
Object.freeze({ value: 20, title: '부지 확보' }),
Object.freeze({ value: 40, title: '인허가' }),
Object.freeze({ value: 60, title: '착공·시공' }),
Object.freeze({ value: 80, title: '사용전검사·계통연계' }),
Object.freeze({ value: 100, title: '완공·상업운전' })
]);

function normalizeAdminPlantProgress(val) {
const numericValue = Number(val);
const safeValue = Math.max(0, Math.min(100, Number.isFinite(numericValue) ? numericValue : 0));
const stageValue = safeValue === 30 ? 0 : safeValue;
let normalizedValue = 0;
ADMIN_PLANT_PROGRESS_STAGES.forEach(stage => {
if (stageValue >= stage.value) normalizedValue = stage.value;
});
return normalizedValue;
}

function updateProgressLabel(val) {
const normalizedValue = normalizeAdminPlantProgress(val);
const stageIndex = ADMIN_PLANT_PROGRESS_STAGES.findIndex(stage => stage.value === normalizedValue);
const currentStage = ADMIN_PLANT_PROGRESS_STAGES[stageIndex];
const nextStage = ADMIN_PLANT_PROGRESS_STAGES[stageIndex + 1];
document.getElementById('plant-progress-label').innerText = `현재: ${currentStage.title} · 다음: ${nextStage ? nextStage.title : '운영 발전소로 전환'}`;
}



// [신규] 스토리지에서 실제 파일 삭제하는 함수


// [신규] 사진 삭제 버튼 클릭 시 (화면에서만 먼저 지움)
function clearPlantImage() {
document.getElementById('plant-file').value = ''; // 파일 선택 취소
document.getElementById('plant-img-url').value = ''; // 저장될 URL 비움

// 프리뷰 감추기
document.getElementById('plant-img-preview').style.display = 'none';
document.getElementById('plant-img-preview').src = '';
document.getElementById('plant-img-placeholder').style.display = 'block';
}

// [기존 수정] 이미지 미리보기
function previewImage(input) {
const file = input.files[0];
const preview = document.getElementById('plant-img-preview');
const placeholder = document.getElementById('plant-img-placeholder');

if(file) {
const reader = new FileReader();
reader.onload = function(e) {
preview.src = e.target.result;
preview.style.display = 'block';
placeholder.style.display = 'none';
}
reader.readAsDataURL(file);
}
}

// [기존 수정] 발전소 모달 열기 (기존 이미지 URL 기억하기)
let g_plantModalOpening = false;
async function openPlantModal(id) {
const modal = document.getElementById('plantModal');
if (g_plantModalOpening || g_plantSaving || modal.classList.contains('show')) return;
g_plantModalOpening = true;
try {

if(id) {
// 수정 모드
const { data, error } = await scopeAdminTenant(_supabase.from('site_power_plants').select('*')).eq('id', id).single();
if (error || !data) throw error || new Error('PLANT_NOT_FOUND');
	if(data) {
	document.getElementById('plant-project-type').value = normalizePlantProjectType(data.project_type);
	document.getElementById('plant-name').value = data.name;
	document.getElementById('plant-capacity').value = data.capacity;
	document.getElementById('plant-order').value = data.display_order;
	document.getElementById('plant-location').value = data.location || '';
	document.getElementById('plant-area').value = data.area || '';
	document.getElementById('plant-date').value = data.completion_date || '';
	document.getElementById('plant-status').value = data.status;
	document.getElementById('plant-url').value = data.monitor_url || '';
	document.getElementById('plant-participation-method').value = data.participation_method || 'equity';
	document.getElementById('plant-generation-calc-method').value = data.generation_calc_method && data.generation_calc_method !== 'direct_full' ? data.generation_calc_method : 'excluded';
	setPlantInputValue('plant-owner-name', data.project_owner_name);
	setPlantInputValue('plant-participation-capacity', data.participation_capacity);
	setPlantInputValue('plant-participation-share', data.participation_share_percent);
	setPlantInputValue('plant-public-note', data.public_note);

	const rate = normalizeAdminPlantProgress(data.progress_rate);
	document.getElementById('plant-progress').value = rate;
updateProgressLabel(rate);

// ★ 이미지 처리 (원본 기억 + 현재 상태 설정)
const imgUrl = data.image_url || '';
document.getElementById('plant-img-original').value = imgUrl; // [중요] 원본 기억 (나중에 삭제할 때 씀)
document.getElementById('plant-img-url').value = imgUrl;      // 현재 상태

const preview = document.getElementById('plant-img-preview');
const placeholder = document.getElementById('plant-img-placeholder');
if(imgUrl) {
preview.src = imgUrl;
preview.style.display = 'block';
placeholder.style.display = 'none';
} else {
preview.style.display = 'none';
placeholder.style.display = 'block';
}
}
	} else {
	// 신규 모드
	const maxOrder = g_plants.length > 0 ? Math.max(...g_plants.map(p => p.display_order)) : 0;
	['plant-name','plant-capacity','plant-url','plant-location','plant-area','plant-date','plant-img-url','plant-img-original','plant-owner-name','plant-participation-capacity','plant-participation-share','plant-public-note'].forEach(id => document.getElementById(id).value = '');

	document.getElementById('plant-project-type').value = 'direct';
	document.getElementById('plant-participation-method').value = 'equity';
	document.getElementById('plant-generation-calc-method').value = 'excluded';
	document.getElementById('plant-order').value = maxOrder + 1;
	document.getElementById('plant-status').value = '준비중';
	document.getElementById('plant-progress').value = 0;
updateProgressLabel(0);

document.getElementById('plant-img-preview').style.display = 'none';
	document.getElementById('plant-img-placeholder').style.display = 'block';
	}
	toggleProgressSlider();
	togglePlantProjectTypeFields();
document.getElementById('plant-id').value = id || '';
document.getElementById('plant-file').value = '';
bootstrap.Modal.getOrCreateInstance(modal).show();
} catch (error) {
CoopSafeLog.error('Plant detail load failed:', error);
myAlert('발전소 정보를 불러오지 못했습니다. 잠시 후 해당 발전소의 수정을 다시 눌러주세요.', 'error');
} finally {
g_plantModalOpening = false;
}
}

// Keep the record's current photo until its replacement has been saved.
let g_plantSaving = false;
async function savePlant() {
if (g_plantSaving) return;
const name = String(document.getElementById('plant-name').value || '').trim();
if (!name) { myAlert("발전소명을 입력해주세요.", 'warning'); return; }

const capVal = document.getElementById('plant-capacity').value;
const orderVal = document.getElementById('plant-order').value;
const capacity = (capVal === '' || isNaN(capVal)) ? 0 : Number(capVal);
const order = (orderVal === '' || isNaN(orderVal)) ? 0 : Number(orderVal);
const status = document.getElementById('plant-status').value;
const progress = (status === '운영중') ? 100 : Number(document.getElementById('plant-progress').value);
const projectType = normalizePlantProjectType(document.getElementById('plant-project-type').value);
const participationMethod = document.getElementById('plant-participation-method').value || 'equity';
const participationCapacity = readNullableNumberInput('plant-participation-capacity');
const participationShare = readNullableNumberInput('plant-participation-share');
const generationCalcMethod = projectType === 'direct'
? 'direct_full'
: (document.getElementById('plant-generation-calc-method').value || 'excluded');

if (!Number.isFinite(capacity) || capacity < 0) {
myAlert('설비용량은 0 이상으로 입력해주세요.', 'warning');
return;
}
if (projectType === 'participation') {
const hasParticipationCapacity = Number.isFinite(participationCapacity) && participationCapacity > 0;
const hasParticipationShare = Number.isFinite(participationShare) && participationShare > 0;
if (!hasParticipationCapacity && !hasParticipationShare) {
myAlert('참여 발전형은 조합 참여 용량 또는 조합 지분율 중 하나를 입력해야 합니다.', 'warning');
return;
}
if (participationCapacity !== null && (!Number.isFinite(participationCapacity) || participationCapacity < 0)) {
myAlert('조합 참여 용량은 0 이상으로 입력해주세요.', 'warning');
return;
}
if (participationShare !== null && (!Number.isFinite(participationShare) || participationShare <= 0 || participationShare > 100)) {
myAlert('조합 지분율은 0보다 크고 100 이하로 입력해주세요.', 'warning');
return;
}
if (generationCalcMethod === 'capacity_ratio' && (!hasParticipationCapacity || capacity <= 0)) {
myAlert('참여용량 반영 기준을 쓰려면 전체 사업 용량과 조합 참여 용량을 모두 입력해야 합니다.', 'warning');
return;
}
if (generationCalcMethod === 'share_percent' && !hasParticipationShare) {
myAlert('지분율 반영 기준을 쓰려면 조합 지분율을 입력해야 합니다.', 'warning');
return;
}
}

const fileInput = document.getElementById('plant-file');
const originalUrl = document.getElementById('plant-img-original').value;
const newFile = fileInput.files[0] || null;
// Snapshot the whole form before the first asynchronous operation.
const updates = {
p_id: document.getElementById('plant-id').value || null,
	p_name: name,
	p_capacity: capacity,
	p_status: status,
	p_display_order: order,
p_progress: progress,
p_location: document.getElementById('plant-location').value,
p_area: document.getElementById('plant-area').value,
p_completion_date: document.getElementById('plant-date').value || null,
p_image_url: document.getElementById('plant-img-url').value,
p_monitor_url: document.getElementById('plant-url').value || null,
p_project_type: projectType,
p_participation_method: projectType === 'participation' ? participationMethod : null,
p_project_owner_name: projectType === 'participation' ? document.getElementById('plant-owner-name').value : null,
p_participation_capacity: projectType === 'participation' ? participationCapacity : null,
p_participation_share_percent: projectType === 'participation' ? participationShare : null,
p_generation_calc_method: generationCalcMethod,
p_public_note: projectType === 'participation' ? document.getElementById('plant-public-note').value : null
};

g_plantSaving = true;
showLoading(true);
try {
if (newFile) updates.p_image_url = await uploadFileToStorage(newFile, 'plants');
const { error } = await _supabase.rpc('upsert_plant_project_secure', updates);
if (error) throw error;
// A lost response may still mean the server committed. On failure keep both
// files; only a confirmed save permits cleanup of the previous photo.
if (originalUrl && originalUrl !== updates.p_image_url) await deleteOldFile(originalUrl);
bootstrap.Modal.getInstance(document.getElementById('plantModal'))?.hide();
await fetchPlants();
} catch (error) {
myAlert('저장 실패: ' + (error?.hint || error?.message || error), 'error');
} finally {
showLoading(false);
g_plantSaving = false;
}
}

function formatPowerGenerationKwh(value) {
const num = Number(value || 0);
if (!Number.isFinite(num)) return '0';
return num.toLocaleString('ko-KR', {
minimumFractionDigits: num % 1 === 0 ? 0 : 2,
maximumFractionDigits: 2
});
}

function formatPowerGenerationDate(value) {
if (!value) return '-';
const date = new Date(String(value).length <= 10 ? `${value}T00:00:00+09:00` : value);
if (Number.isNaN(date.getTime())) return String(value);
return new Intl.DateTimeFormat('ko-KR', {
timeZone: 'Asia/Seoul',
year: 'numeric',
month: '2-digit',
day: '2-digit'
}).format(date).replace(/\.\s?/g, '.').replace(/\.$/, '');
}

function formatPowerGenerationDateTime(value) {
if (!value) return '-';
const date = new Date(value);
if (Number.isNaN(date.getTime())) return String(value);
return new Intl.DateTimeFormat('ko-KR', {
timeZone: 'Asia/Seoul',
year: 'numeric',
month: '2-digit',
day: '2-digit',
hour: '2-digit',
minute: '2-digit',
hour12: false
}).format(date).replace(/\.\s?/g, '.').replace(/\.$/, '');
}

function getCurrentKstMonthString() {
const now = new Date();
const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
const year = kst.getFullYear();
const month = String(kst.getMonth() + 1).padStart(2, '0');
return `${year}-${month}`;
}

function ensurePowerGenerationFiltersReady() {
const monthInput = document.getElementById('power-generation-month');
if (monthInput && !monthInput.value) monthInput.value = getCurrentKstMonthString();
updatePowerGenerationPlantOptions();
}

function updatePowerGenerationPlantOptions() {
const options = (Array.isArray(g_plants) ? g_plants : [])
.slice()
.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));

const filterEl = document.getElementById('power-generation-plant-filter');
const modalEl = document.getElementById('power-generation-plant');
if (filterEl) {
const current = filterEl.value;
filterEl.innerHTML = '<option value="">전체 발전소</option>' + options.map((plant) => `<option value="${escapeHtml(String(plant.id || ''))}">${escapeHtml(getPowerGenerationPlantOptionLabel(plant))}</option>`).join('');
if (current && options.some((plant) => String(plant.id) === current)) filterEl.value = current;
}
if (modalEl) {
const current = modalEl.value;
modalEl.innerHTML = options.map((plant) => `<option value="${escapeHtml(String(plant.id || ''))}">${escapeHtml(getPowerGenerationPlantOptionLabel(plant))}</option>`).join('');
if (current && options.some((plant) => String(plant.id) === current)) modalEl.value = current;
}
}

function getPowerGenerationProviderCatalogSafe() {
return Array.isArray(g_powerGenerationProviderCatalog) && g_powerGenerationProviderCatalog.length > 0
? g_powerGenerationProviderCatalog
: POWER_GENERATION_PROVIDER_FALLBACK_CATALOG;
}

function getPowerGenerationProviderMeta(providerKey) {
const normalized = String(providerKey || '').trim().toLowerCase();
return getPowerGenerationProviderCatalogSafe().find((item) => String(item.key || '').trim().toLowerCase() === normalized) || POWER_GENERATION_PROVIDER_FALLBACK_CATALOG[0];
}

async function fetchPowerGenerationProviderCatalog() {
try {
const { data, error } = await _supabase.rpc('get_power_generation_provider_catalog');
if (error) throw error;
if (Array.isArray(data) && data.length > 0) {
g_powerGenerationProviderCatalog = data;
return g_powerGenerationProviderCatalog;
}
if (Array.isArray(data?.providers)) {
g_powerGenerationProviderCatalog = data.providers;
return g_powerGenerationProviderCatalog;
}
} catch (error) {
CoopSafeLog.warn("[fetchPowerGenerationProviderCatalog] fallback:", error?.message || error);
}
g_powerGenerationProviderCatalog = POWER_GENERATION_PROVIDER_FALLBACK_CATALOG;
return g_powerGenerationProviderCatalog;
}

function updatePowerGenerationIntegrationPlantOptions() {
const el = document.getElementById('power-generation-integration-plant');
if (!el) return;
const options = (Array.isArray(g_plants) ? g_plants : [])
.slice()
.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
const current = String(el.value || '');
el.innerHTML = options.map((plant) => `<option value="${escapeHtml(String(plant.id || ''))}">${escapeHtml(plant.name || '-')}</option>`).join('');
if (current && options.some((plant) => String(plant.id) === current)) el.value = current;
else if (options[0]?.id) el.value = String(options[0].id);
}

function renderPowerGenerationProviderCards() {
const container = document.getElementById('power-generation-provider-grid');
if (!container) return;
const selectedProviderKey = String(document.getElementById('power-generation-provider-key')?.value || 'solaredge').trim().toLowerCase();
container.innerHTML = getPowerGenerationProviderCatalogSafe().map((provider) => {
const key = String(provider.key || '');
const isActive = String(provider.support_status || '') === 'active';
const isSelected = key.toLowerCase() === selectedProviderKey;
return `
<div class="power-generation-provider-card ${isSelected ? 'active' : ''} ${isActive ? '' : 'power-generation-provider-status-planned'}" onclick="selectPowerGenerationProvider('${escapeJsString(key)}')">
  <div class="d-flex justify-content-between align-items-start gap-2">
    <div class="provider-title">${escapeHtml(provider.label || key)}</div>
    <span class="badge ${isActive ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle'}">${isActive ? '지원중' : '준비중'}</span>
  </div>
  <div class="provider-summary">${escapeHtml(provider.summary || '')}</div>
  <div class="mt-2">
    <a class="provider-link" href="${escapeHtml(provider.docs_url || '#')}" target="_blank" rel="noopener" onclick="event.stopPropagation()">공식 문서 보기</a>
  </div>
</div>`;
}).join('');
}

function renderPowerGenerationIntegrationRows() {
const container = document.getElementById('power-generation-integrations-list');
if (!container) return;
if (!Array.isArray(g_powerGenerationIntegrations) || g_powerGenerationIntegrations.length === 0) {
container.innerHTML = '<div class="text-muted small border rounded-3 bg-light px-3 py-4">저장된 고급 연동이 없습니다. 지원 공급사를 선택해 연동을 추가해보세요.</div>';
return;
}

container.innerHTML = g_powerGenerationIntegrations.map((row) => {
const provider = getPowerGenerationProviderMeta(row.provider_key);
const status = String(row.last_sync_status || 'idle');
const statusBadge = status === 'success'
? '<span class="badge bg-success-subtle text-success border border-success-subtle">최근 동기화 성공</span>'
: status === 'error'
  ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">최근 동기화 실패</span>'
  : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">아직 동기화 전</span>';
const enabledBadge = row.is_enabled
? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">사용중</span>'
: '<span class="badge bg-light text-dark border">중지됨</span>';
const lastSyncText = row.last_synced_at ? formatPowerGenerationDateTime(row.last_synced_at) : '아직 기록 없음';
const messageText = String(row.last_sync_message || '').trim();
return `
<div class="power-generation-integration-item">
  <div class="d-flex justify-content-between align-items-start gap-3">
    <div>
      <div class="title">${escapeHtml(row.integration_name || '-')}</div>
      <div class="meta mt-1">${escapeHtml(row.plant_name || '-')} · ${escapeHtml(provider.label || row.provider_key || '-')}</div>
      <div class="meta mt-1">최근 동기화: ${escapeHtml(lastSyncText)}</div>
      ${messageText ? `<div class="meta mt-1">${escapeHtml(messageText)}</div>` : ''}
    </div>
    <div class="d-flex flex-column align-items-end gap-2">
      <div class="d-flex flex-wrap justify-content-end gap-2">${enabledBadge}${statusBadge}</div>
      <div class="actions">
        <button class="btn btn-sm btn-outline-secondary" onclick="editPowerGenerationIntegration('${escapeJsString(String(row.id || ''))}')">수정</button>
        <button class="btn btn-sm btn-outline-primary" onclick="syncPowerGenerationIntegration('${escapeJsString(String(row.id || ''))}')">지금 동기화</button>
        <button class="btn btn-sm btn-outline-danger" onclick="askDeletePowerGenerationIntegration('${escapeJsString(String(row.id || ''))}')">삭제</button>
      </div>
    </div>
  </div>
</div>`;
}).join('');
}

function getPowerGenerationProviderSectionIds() {
return ['solaredge', 'sma', 'fronius', 'enphase', 'huawei_fusionsolar'];
}

function setPowerGenerationInputValue(id, value) {
const el = document.getElementById(id);
if (el) el.value = value == null ? '' : String(value);
}

function getPowerGenerationInputValue(id) {
return String(document.getElementById(id)?.value || '').trim();
}

function getPowerGenerationWindowDays(id, fallbackValue) {
const raw = Number(document.getElementById(id)?.value || fallbackValue || 35);
const safe = Number.isFinite(raw) ? Math.trunc(raw) : Number(fallbackValue || 35);
return Math.max(1, Math.min(365, safe || 35));
}

function clearPowerGenerationCredentialInputs() {
[
'power-generation-solaredge-api-key',
'power-generation-sma-access-token',
'power-generation-enphase-api-key',
'power-generation-enphase-access-token',
'power-generation-huawei-system-code'
].forEach((id) => setPowerGenerationInputValue(id, ''));
}

function buildPowerGenerationIntegrationFormPayload(providerKey, integrationId) {
const isNew = !String(integrationId || '').trim();
switch (providerKey) {
case 'solaredge': {
const siteId = getPowerGenerationInputValue('power-generation-solaredge-site-id');
const apiKey = getPowerGenerationInputValue('power-generation-solaredge-api-key');
if (!siteId) throw new Error('SolarEdge Site ID를 입력해주세요.');
if (isNew && !apiKey) throw new Error('처음 저장할 때는 SolarEdge API Key가 필요합니다.');
return {
configJson: {
site_id: siteId,
window_days: getPowerGenerationWindowDays('power-generation-solaredge-window-days', 35)
},
credentialsJson: apiKey ? {
api_key: apiKey,
base_url: 'https://monitoringapi.solaredge.com'
} : null
};
}
case 'sma': {
const remotePlantId = getPowerGenerationInputValue('power-generation-sma-plant-id');
const accessToken = getPowerGenerationInputValue('power-generation-sma-access-token');
const baseUrl = getPowerGenerationInputValue('power-generation-sma-base-url') || 'https://monitoring.smaapis.de';
if (!remotePlantId) throw new Error('SMA Plant ID를 입력해주세요.');
if (isNew && !accessToken) throw new Error('처음 저장할 때는 SMA Access Token이 필요합니다.');
return {
configJson: {
remote_plant_id: remotePlantId,
base_url: baseUrl,
window_days: getPowerGenerationWindowDays('power-generation-sma-window-days', 35)
},
credentialsJson: accessToken ? {
access_token: accessToken
} : null
};
}
case 'fronius': {
const baseUrl = getPowerGenerationInputValue('power-generation-fronius-base-url');
if (!baseUrl) throw new Error('Fronius Base URL을 입력해주세요.');
return {
configJson: {
base_url: baseUrl
},
credentialsJson: null
};
}
case 'enphase': {
const systemId = getPowerGenerationInputValue('power-generation-enphase-system-id');
const apiKey = getPowerGenerationInputValue('power-generation-enphase-api-key');
const accessToken = getPowerGenerationInputValue('power-generation-enphase-access-token');
const baseUrl = getPowerGenerationInputValue('power-generation-enphase-base-url') || 'https://api.enphaseenergy.com';
if (!systemId) throw new Error('Enphase System ID를 입력해주세요.');
if (isNew && (!apiKey || !accessToken)) throw new Error('처음 저장할 때는 Enphase API Key와 Access Token이 모두 필요합니다.');
return {
configJson: {
system_id: systemId,
base_url: baseUrl,
window_days: getPowerGenerationWindowDays('power-generation-enphase-window-days', 35)
},
credentialsJson: (apiKey || accessToken) ? {
api_key: apiKey,
access_token: accessToken
} : null
};
}
case 'huawei_fusionsolar': {
const baseUrl = getPowerGenerationInputValue('power-generation-huawei-base-url');
const stationCode = getPowerGenerationInputValue('power-generation-huawei-station-code');
const userName = getPowerGenerationInputValue('power-generation-huawei-user-name');
const systemCode = getPowerGenerationInputValue('power-generation-huawei-system-code');
if (!baseUrl) throw new Error('FusionSolar Base URL을 입력해주세요.');
if (!stationCode) throw new Error('Station Code를 입력해주세요.');
if (!userName) throw new Error('API 계정 ID를 입력해주세요.');
if (isNew && !systemCode) throw new Error('처음 저장할 때는 System Code가 필요합니다.');
return {
configJson: {
base_url: baseUrl,
station_code: stationCode,
user_name_hint: userName,
window_days: getPowerGenerationWindowDays('power-generation-huawei-window-days', 35)
},
credentialsJson: (userName || systemCode) ? {
user_name: userName,
system_code: systemCode
} : null
};
}
default:
throw new Error('지원하지 않는 공급사입니다.');
}
}

function syncPowerGenerationProviderUI() {
const providerKey = String(document.getElementById('power-generation-provider-key')?.value || 'solaredge').trim().toLowerCase();
const provider = getPowerGenerationProviderMeta(providerKey);
const providerNameEl = document.getElementById('power-generation-provider-name');
const providerHintEl = document.getElementById('power-generation-provider-hint');
const plannedBox = document.getElementById('power-generation-provider-settings-planned');
const saveBtn = document.getElementById('power-generation-integration-save-btn');

if (providerNameEl) providerNameEl.innerText = provider.label || providerKey;
if (providerHintEl) providerHintEl.innerText = provider.summary || '';
getPowerGenerationProviderSectionIds().forEach((key) => {
const section = document.getElementById(`power-generation-provider-settings-${key}`);
if (section) section.classList.toggle('d-none', key !== providerKey);
});
const isActive = String(provider.support_status || '') === 'active';
plannedBox?.classList.toggle('d-none', isActive);
if (isActive) saveBtn?.removeAttribute('disabled');
else saveBtn?.setAttribute('disabled', 'disabled');

renderPowerGenerationProviderCards();
}

function selectPowerGenerationProvider(providerKey) {
document.getElementById('power-generation-provider-key').value = providerKey || 'solaredge';
clearPowerGenerationCredentialInputs();
syncPowerGenerationProviderUI();
}

function resetPowerGenerationIntegrationForm() {
document.getElementById('power-generation-integration-id').value = '';
document.getElementById('power-generation-provider-key').value = 'solaredge';
document.getElementById('power-generation-integration-name').value = '';
document.getElementById('power-generation-integration-enabled').checked = true;
setPowerGenerationInputValue('power-generation-solaredge-site-id', '');
setPowerGenerationInputValue('power-generation-solaredge-api-key', '');
setPowerGenerationInputValue('power-generation-solaredge-window-days', '35');
setPowerGenerationInputValue('power-generation-sma-plant-id', '');
setPowerGenerationInputValue('power-generation-sma-base-url', 'https://monitoring.smaapis.de');
setPowerGenerationInputValue('power-generation-sma-access-token', '');
setPowerGenerationInputValue('power-generation-sma-window-days', '35');
setPowerGenerationInputValue('power-generation-fronius-base-url', '');
setPowerGenerationInputValue('power-generation-enphase-system-id', '');
setPowerGenerationInputValue('power-generation-enphase-base-url', 'https://api.enphaseenergy.com');
setPowerGenerationInputValue('power-generation-enphase-api-key', '');
setPowerGenerationInputValue('power-generation-enphase-access-token', '');
setPowerGenerationInputValue('power-generation-enphase-window-days', '35');
setPowerGenerationInputValue('power-generation-huawei-base-url', '');
setPowerGenerationInputValue('power-generation-huawei-station-code', '');
setPowerGenerationInputValue('power-generation-huawei-window-days', '35');
setPowerGenerationInputValue('power-generation-huawei-user-name', '');
setPowerGenerationInputValue('power-generation-huawei-system-code', '');
updatePowerGenerationIntegrationPlantOptions();
syncPowerGenerationProviderUI();
}

function populatePowerGenerationIntegrationForm(row) {
if (!row) return;
document.getElementById('power-generation-integration-id').value = String(row.id || '');
document.getElementById('power-generation-provider-key').value = String(row.provider_key || 'solaredge');
document.getElementById('power-generation-integration-name').value = row.integration_name || '';
document.getElementById('power-generation-integration-enabled').checked = row.is_enabled !== false;
updatePowerGenerationIntegrationPlantOptions();
document.getElementById('power-generation-integration-plant').value = String(row.plant_id || '');
const config = row.config_json && typeof row.config_json === 'object' ? row.config_json : {};
setPowerGenerationInputValue('power-generation-solaredge-site-id', config.site_id || '');
setPowerGenerationInputValue('power-generation-solaredge-window-days', Number(config.window_days || 35));
setPowerGenerationInputValue('power-generation-solaredge-api-key', '');
setPowerGenerationInputValue('power-generation-sma-plant-id', config.remote_plant_id || '');
setPowerGenerationInputValue('power-generation-sma-base-url', config.base_url || 'https://monitoring.smaapis.de');
setPowerGenerationInputValue('power-generation-sma-access-token', '');
setPowerGenerationInputValue('power-generation-sma-window-days', Number(config.window_days || 35));
setPowerGenerationInputValue('power-generation-fronius-base-url', config.base_url || '');
setPowerGenerationInputValue('power-generation-enphase-system-id', config.system_id || '');
setPowerGenerationInputValue('power-generation-enphase-base-url', config.base_url || 'https://api.enphaseenergy.com');
setPowerGenerationInputValue('power-generation-enphase-api-key', '');
setPowerGenerationInputValue('power-generation-enphase-access-token', '');
setPowerGenerationInputValue('power-generation-enphase-window-days', Number(config.window_days || 35));
setPowerGenerationInputValue('power-generation-huawei-base-url', config.base_url || '');
setPowerGenerationInputValue('power-generation-huawei-station-code', config.station_code || '');
setPowerGenerationInputValue('power-generation-huawei-window-days', Number(config.window_days || 35));
setPowerGenerationInputValue('power-generation-huawei-user-name', config.user_name_hint || '');
setPowerGenerationInputValue('power-generation-huawei-system-code', '');
syncPowerGenerationProviderUI();
}

function editPowerGenerationIntegration(id) {
const target = (Array.isArray(g_powerGenerationIntegrations) ? g_powerGenerationIntegrations : []).find((item) => String(item.id || '') === String(id || ''));
if (!target) {
myAlert('연동 설정을 찾지 못했습니다.', 'warning');
return;
}
populatePowerGenerationIntegrationForm(target);
}

async function fetchPowerGenerationIntegrations(silent) {
if (!Array.isArray(g_plants) || g_plants.length === 0) {
await fetchPlants();
}
updatePowerGenerationIntegrationPlantOptions();
await fetchPowerGenerationProviderCatalog();
renderPowerGenerationProviderCards();

const { data, error } = await _supabase.rpc('get_power_generation_integrations');
if (error) {
CoopSafeLog.error("[fetchPowerGenerationIntegrations] failed:", error);
g_powerGenerationIntegrations = [];
renderPowerGenerationIntegrationRows();
if (!silent) myAlert('고급 연동 목록을 불러오지 못했습니다: ' + error.message, 'error');
return;
}

g_powerGenerationIntegrations = Array.isArray(data) ? data : [];
renderPowerGenerationIntegrationRows();
syncPowerGenerationProviderUI();
}

async function savePowerGenerationIntegration() {
const providerKey = String(document.getElementById('power-generation-provider-key').value || '').trim().toLowerCase();
const provider = getPowerGenerationProviderMeta(providerKey);
if (String(provider.support_status || '') !== 'active') {
return myAlert('현재 이 공급사는 아직 지원 준비중입니다.', 'warning');
}

const integrationId = String(document.getElementById('power-generation-integration-id').value || '').trim();
const plantId = String(document.getElementById('power-generation-integration-plant').value || '').trim();
const integrationName = String(document.getElementById('power-generation-integration-name').value || '').trim();
const isEnabled = document.getElementById('power-generation-integration-enabled').checked;

if (!plantId) return myAlert('발전소를 선택해주세요.', 'warning');
if (!integrationName) return myAlert('연동 이름을 입력해주세요.', 'warning');

let formPayload;
try {
formPayload = buildPowerGenerationIntegrationFormPayload(providerKey, integrationId);
} catch (error) {
return myAlert((error && error.message) || '입력값을 다시 확인해주세요.', 'warning');
}

const payload = {
p_id: integrationId || null,
p_plant_id: plantId,
p_provider_key: providerKey,
p_integration_name: integrationName,
p_is_enabled: isEnabled,
p_config_json: formPayload.configJson,
p_credentials_json: formPayload.credentialsJson
};

showLoading(true);
const { data, error } = await _supabase.rpc('upsert_power_generation_integration_secure', payload);
showLoading(false);

if (error) {
CoopSafeLog.error("[savePowerGenerationIntegration] failed:", error);
return myAlert('고급 연동 저장 실패: ' + error.message, 'error');
}

document.getElementById('power-generation-integration-id').value = String(data || integrationId || '');
clearPowerGenerationCredentialInputs();
await fetchPowerGenerationIntegrations(true);
resetPowerGenerationIntegrationForm();
myAlert('고급 연동 설정이 저장되었습니다.');
}

async function syncPowerGenerationIntegration(id) {
const integrationId = String(id || document.getElementById('power-generation-integration-id').value || '').trim();
if (!integrationId) return myAlert('먼저 저장된 연동을 선택해주세요.', 'warning');

showLoading(true);
const { data, error } = await _supabase.functions.invoke('erp-power-generation-sync', {
body: { integrationId }
});
showLoading(false);

if (error) {
CoopSafeLog.error("[syncPowerGenerationIntegration] failed:", error);
await fetchPowerGenerationIntegrations(true);
return myAlert('발전량 동기화 실패: ' + (error.message || '알 수 없는 오류'), 'error');
}

await fetchPowerGenerationIntegrations(true);
await fetchPowerGenerationLogs();
const syncedCount = Number(data?.synced_count || 0);
myAlert(`발전량 동기화가 완료되었습니다. (${syncedCount.toLocaleString('ko-KR')}건 반영)`);
}

function askDeletePowerGenerationIntegration(id) {
deleteType = 'power-generation-integration';
document.getElementById('delete-target-id').value = id;
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

async function fetchPowerGenerationStats() {
const { data, error } = await _supabase.rpc('get_my_power_generation_stats');
if (error) {
CoopSafeLog.error("[fetchPowerGenerationStats] failed:", error);
document.getElementById('power-generation-summary-note').innerText = '발전량 집계를 불러오지 못했습니다.';
return;
}

const stats = data || {};
document.getElementById('power-generation-latest-day').innerText = formatPowerGenerationKwh(stats.latest_day_total_kwh || 0);
document.getElementById('power-generation-month-total').innerText = formatPowerGenerationKwh(stats.current_month_total_kwh || 0);
document.getElementById('power-generation-cumulative').innerText = formatPowerGenerationKwh(stats.cumulative_total_kwh || 0);
document.getElementById('power-generation-operating-count').innerText = Number(stats.operating_plant_count || 0).toLocaleString('ko-KR');
document.getElementById('power-generation-latest-date').innerText = stats.latest_generation_date
? `최근 입력일 ${formatPowerGenerationDate(stats.latest_generation_date)}`
: '최근 입력일이 없습니다.';
document.getElementById('power-generation-last-updated').innerText = stats.latest_logged_at
? `최근 반영 ${formatPowerGenerationDateTime(stats.latest_logged_at)}`
: '아직 반영된 발전량 기록이 없습니다.';
const participationCount = Number(stats.participating_project_count || 0);
document.getElementById('power-generation-summary-note').innerText = stats.latest_generation_date
? `홈페이지 발전 현황은 ${formatPowerGenerationDate(stats.latest_generation_date)} 입력값까지 집계합니다.${participationCount > 0 ? ' 참여 발전형은 설정된 반영 기준으로 계산됩니다.' : ''}`
: '발전량을 입력하면 홈페이지 발전 현황이 이 데이터를 기준으로 집계됩니다.';
}

function renderPowerGenerationRows(rows) {
const tbody = document.getElementById('powerGenerationListBody');
if (!tbody) return;
const plantMap = new Map((Array.isArray(g_plants) ? g_plants : []).map((plant) => [String(plant.id), plant]));
tbody.innerHTML = '';

if (!Array.isArray(rows) || rows.length === 0) {
tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">입력된 발전량 기록이 없습니다.</td></tr>';
return;
}

rows.forEach((row) => {
const plant = plantMap.get(String(row.plant_id || ''));
const plantName = plant?.name || '-';
const sourceLabel = String(row.source_type || '').toLowerCase() === 'api'
? '<span class="badge bg-info-subtle text-info border border-info-subtle">API</span>'
: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">수동</span>';
tbody.innerHTML += `
<tr>
<td class="text-center">${formatPowerGenerationDate(row.generation_date)}</td>
<td>${escapeHtml(plantName)}</td>
<td class="text-end fw-bold">${formatPowerGenerationKwh(row.generated_kwh)} kWh</td>
<td class="text-center">${sourceLabel}</td>
<td>${escapeHtml(row.note || '-')}</td>
<td class="text-center">
<button class="btn btn-sm btn-light" onclick="openPowerGenerationModal('${escapeJsString(String(row.id || ''))}')">수정</button>
<button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeletePowerGenerationLog('${escapeJsString(String(row.id || ''))}')">삭제</button>
</td>
</tr>`;
});
}

async function fetchPowerGenerationLogs() {
if (!Array.isArray(g_plants) || g_plants.length === 0) {
await fetchPlants();
}
ensurePowerGenerationFiltersReady();
await fetchPowerGenerationStats();

let query = scopeAdminTenant(_supabase
.from('site_power_generation_logs')
.select('*'))
.order('generation_date', { ascending: false })
.order('updated_at', { ascending: false })
.limit(120);

const monthValue = String(document.getElementById('power-generation-month')?.value || '').trim();
if (monthValue) {
const [year, month] = monthValue.split('-').map((v) => Number(v));
if (Number.isFinite(year) && Number.isFinite(month)) {
const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
const monthEndDate = new Date(Date.UTC(year, month, 0));
const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getUTCDate()).padStart(2, '0')}`;
query = query.gte('generation_date', monthStart).lte('generation_date', monthEnd);
}
}

const plantId = String(document.getElementById('power-generation-plant-filter')?.value || '').trim();
if (plantId) query = query.eq('plant_id', plantId);

const { data, error } = await query;
if (error) {
CoopSafeLog.error("[fetchPowerGenerationLogs] failed:", error);
myAlert('발전량 기록을 불러오지 못했습니다: ' + error.message, 'error');
return;
}

g_powerGenerationLogs = Array.isArray(data) ? data : [];
renderPowerGenerationRows(g_powerGenerationLogs);
}

async function openPowerGenerationModal(id) {
if (!Array.isArray(g_plants) || g_plants.length === 0) {
await fetchPlants();
}
updatePowerGenerationPlantOptions();
if (!Array.isArray(g_plants) || g_plants.length === 0) {
myAlert('먼저 발전소를 등록해주세요.', 'warning');
return;
}

document.getElementById('power-generation-id').value = id || '';
document.getElementById('power-generation-note').value = '';
document.getElementById('power-generation-kwh').value = '';
document.getElementById('power-generation-date').value = getAdminMemberKstDateString();

if (id) {
const { data, error } = await scopeAdminTenant(_supabase.from('site_power_generation_logs').select('*')).eq('id', id).single();
if (error) {
myAlert('발전량 기록을 불러오지 못했습니다: ' + error.message, 'error');
return;
}
document.getElementById('power-generation-plant').value = data.plant_id || '';
document.getElementById('power-generation-date').value = data.generation_date || getAdminMemberKstDateString();
document.getElementById('power-generation-kwh').value = data.generated_kwh ?? '';
document.getElementById('power-generation-note').value = data.note || '';
} else {
document.getElementById('power-generation-plant').value = String(g_plants[0]?.id || '');
}

bootstrap.Modal.getOrCreateInstance(document.getElementById('powerGenerationModal')).show();
}

async function savePowerGenerationLog() {
const plantId = String(document.getElementById('power-generation-plant').value || '').trim();
const generationDate = String(document.getElementById('power-generation-date').value || '').trim();
const generatedKwh = Number(document.getElementById('power-generation-kwh').value || 0);
const note = document.getElementById('power-generation-note').value || '';

if (!plantId) return myAlert('발전소를 선택해주세요.', 'warning');
if (!generationDate) return myAlert('발전일을 선택해주세요.', 'warning');
if (!Number.isFinite(generatedKwh) || generatedKwh < 0) return myAlert('발전량은 0 이상으로 입력해주세요.', 'warning');

showLoading(true);
const { error } = await _supabase.rpc('upsert_power_generation_log_secure', {
p_id: document.getElementById('power-generation-id').value || null,
p_plant_id: plantId,
p_generation_date: generationDate,
p_generated_kwh: generatedKwh,
p_note: note,
p_source_type: 'manual'
});
showLoading(false);

if (error) {
CoopSafeLog.error("[savePowerGenerationLog] failed:", error);
myAlert('저장 실패: ' + error.message, 'error');
return;
}

bootstrap.Modal.getInstance(document.getElementById('powerGenerationModal'))?.hide();
await fetchPowerGenerationLogs();
myAlert('발전량 기록이 저장되었습니다.');
}

function askDeletePowerGenerationLog(id) {
deleteType = 'power-generation';
document.getElementById('delete-target-id').value = id;
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

async function openPowerGenerationAdvancedModal() {
await fetchPowerGenerationIntegrations(true);
resetPowerGenerationIntegrationForm();
bootstrap.Modal.getOrCreateInstance(document.getElementById('powerGenerationAdvancedModal')).show();
}
// ================================================================
// [기능 8] 문서 관리 (정관/규약)
// ================================================================

function getDocVisibilityMetaByTitle(title) {
const text = String(title || '').trim();
if (text.includes('정관') || text.includes('규약')) {
return {
scope: 'PUBLIC',
label: '전체 공개',
badgeClass: 'bg-success-subtle text-success border border-success-subtle'
};
}
if (text.includes('규정')) {
return {
scope: 'MEMBERS',
label: '조합원 공개',
badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle'
};
}
return {
scope: 'MEMBERS',
label: '조합원 공개',
badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle'
};
}

function getDocVisibilityMeta(scope, title) {
const normalizedScope = String(scope || '').toUpperCase();
if (normalizedScope === 'PUBLIC') {
return {
scope: 'PUBLIC',
label: '전체 공개',
badgeClass: 'bg-success-subtle text-success border border-success-subtle'
};
}
if (normalizedScope === 'OFFICIALS') {
return {
scope: 'OFFICIALS',
label: '대의원·임원 공개',
badgeClass: 'bg-warning-subtle text-warning border border-warning-subtle'
};
}
if (normalizedScope === 'MEMBERS') {
return {
scope: 'MEMBERS',
label: '조합원 공개',
badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle'
};
}
return getDocVisibilityMetaByTitle(title);
}

function getDocRevisionGroupKey(doc) {
const groupId = String(doc?.document_group_id || '').trim();
if (groupId) return `group:${groupId}`;
return `title:${String(doc?.title || '').trim().toLowerCase()}`;
}

function getDocSortTimestamp(doc) {
return String(doc?.event_date || doc?.updated_at || '');
}

function sortDocsByRevisionDesc(a, b) {
const currentDelta = Number(b?.is_current === true) - Number(a?.is_current === true);
if (currentDelta) return currentDelta;
const dateCompare = String(b?.event_date || '').localeCompare(String(a?.event_date || ''));
if (dateCompare) return dateCompare;
return String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''));
}

function buildDocFileButton(doc) {
const fileUrl = normalizeAdminHttpUrl(doc?.file_url);
return fileUrl
? `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-outline-success"><i class="bi bi-file-pdf"></i> 보기</a>`
: '<span class="text-muted text-xs">없음</span>';
}

function normalizeRevisionSummaryPreview(value, maxLen = 260) {
const raw = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
if (!raw) return '';
if (!Number.isFinite(maxLen) || maxLen <= 0 || raw.length <= maxLen) return raw;
return `${raw.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function renderRevisionSummaryPreview(value, maxLen = 260) {
const normalized = normalizeRevisionSummaryPreview(value, maxLen);
if (!normalized) return '';
return `<div class="doc-revision-summary-preview fw-semibold">${escapeHtml(normalized)}</div>`;
}

function buildDocSummaryCell(doc, contentMaxLen = 90) {
const revisionSummaryHtml = renderRevisionSummaryPreview(doc?.revision_summary || '', 260);
const contentSummary = toPlainSummaryPreview(doc?.content || '', contentMaxLen);
const parts = [];
if (revisionSummaryHtml) {
parts.push(revisionSummaryHtml);
}
if (contentSummary !== '-') {
parts.push(`<div class="doc-content-summary-preview">${escapeHtml(contentSummary)}</div>`);
}
return parts.length ? parts.join('') : '<span class="text-muted">-</span>';
}

function buildDocDateVersionCell(doc) {
const versionText = escapeHtml(doc?.version || '-');
const dateText = escapeHtml(doc?.event_date || '-');
const currentBadge = doc?.is_current === true
? '<span class="badge bg-success-subtle text-success border border-success-subtle mt-1">현재 적용</span>'
: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle mt-1">구판</span>';
return `<div class="fw-bold">${versionText}</div><small class="text-muted d-block">${dateText}</small>${currentBadge}`;
}

function buildDocActionButtons(doc, historyCount = 0) {
const id = escapeJsString(String(doc?.id || ''));
const historyButton = historyCount > 0
? `<button class="btn btn-sm btn-outline-secondary ms-1" type="button" data-bs-toggle="collapse" data-bs-target="#docHistory_${id.replace(/[^a-zA-Z0-9_-]/g, '')}"><i class="bi bi-clock-history"></i> 개정 이력 ${historyCount}건</button>`
: '';
return `
<button class="btn btn-sm btn-outline-primary" onclick="openDocRevisionModal('${id}')">개정판 등록</button>
<button class="btn btn-sm btn-light ms-1" onclick="openDocModal('${id}')">수정</button>
${historyButton}
<button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeleteDoc('${id}')">삭제</button>`;
}

function buildDocHistoryRows(historyDocs) {
return historyDocs.map((doc) => {
const id = escapeJsString(String(doc?.id || ''));
const visibilityMeta = getDocVisibilityMeta(doc?.access_scope, doc?.title);
const visibilityBadge = `<span class="badge ${visibilityMeta.badgeClass}">${visibilityMeta.label}</span>`;
return `<tr>
<td class="text-start">${buildDocDateVersionCell(doc)}</td>
<td class="text-start">${escapeHtml(doc?.title || '-')}</td>
<td>${visibilityBadge}</td>
<td class="text-start small">${buildDocSummaryCell(doc, 70)}</td>
<td>${buildDocFileButton(doc)}</td>
<td>
  <button class="btn btn-sm btn-light" onclick="openDocHistoryViewModal('${id}')">보기</button>
  <button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeleteDoc('${id}')">삭제</button>
</td>
</tr>`;
}).join('');
}

// 1. 문서 목록 불러오기
async function fetchDocs() {
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*'))
  .eq('category', 'doc')
  .order('event_date', { ascending: false })
  .order('updated_at', { ascending: false });
const tbody = document.getElementById('docListBody');
tbody.innerHTML = '';

if (error) {
CoopSafeLog.error("[fetchDocs] failed:", error);
tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-danger">문서를 불러오지 못했습니다.</td></tr>';
return;
}

if(!data || data.length === 0) {
tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-muted">등록된 문서가 없습니다.</td></tr>';
return;
}

const groupsByKey = new Map();
data.forEach((doc) => {
const key = getDocRevisionGroupKey(doc);
if (!groupsByKey.has(key)) groupsByKey.set(key, []);
groupsByKey.get(key).push(doc);
});

const groups = Array.from(groupsByKey.values()).map((docs) => {
const sortedDocs = docs.slice().sort(sortDocsByRevisionDesc);
const currentDoc = sortedDocs.find((doc) => doc?.is_current === true) || sortedDocs[0];
return {
currentDoc,
historyDocs: sortedDocs.filter((doc) => String(doc?.id || '') !== String(currentDoc?.id || '')),
sortKey: getDocSortTimestamp(currentDoc)
};
}).sort((a, b) => String(b.sortKey || '').localeCompare(String(a.sortKey || '')));

const rows = [];
groups.forEach((group) => {
const doc = group.currentDoc;
const id = escapeJsString(String(doc?.id || ''));
const collapseId = `docHistory_${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
const visibilityMeta = getDocVisibilityMeta(doc?.access_scope, doc?.title);
const visibilityBadge = `<span class="badge ${visibilityMeta.badgeClass}">${visibilityMeta.label}</span>`;
rows.push(`<tr>
<td class="text-start">${buildDocDateVersionCell(doc)}</td>
<td class="text-start">
  <div class="fw-bold">${escapeHtml(doc?.title || '-')}</div>
  ${group.historyDocs.length > 0 ? `<div class="text-muted x-small mt-1">구판 ${group.historyDocs.length}건 보관 중</div>` : ''}
</td>
<td>${visibilityBadge}</td>
<td class="text-start small" style="max-width:260px;">${buildDocSummaryCell(doc)}</td>
<td>${buildDocFileButton(doc)}</td>
<td>${buildDocActionButtons(doc, group.historyDocs.length)}</td>
</tr>`);
if (group.historyDocs.length > 0) {
rows.push(`<tr class="bg-light">
<td colspan="6" class="p-0">
<div class="collapse p-3" id="${collapseId}">
  <div class="text-start fw-bold small mb-2"><i class="bi bi-clock-history me-1"></i>개정 이력</div>
  <div class="table-responsive">
    <table class="table table-sm table-bordered bg-white mb-0 align-middle">
      <thead class="table-light text-center">
        <tr>
          <th style="width:150px;">날짜/버전</th>
          <th>제목</th>
          <th style="width:130px;">공개대상</th>
          <th>개정 내용</th>
          <th style="width:90px;">파일</th>
          <th style="width:130px;">관리</th>
        </tr>
      </thead>
      <tbody>${buildDocHistoryRows(group.historyDocs)}</tbody>
    </table>
  </div>
</div>
</td>
</tr>`);
}
});

tbody.innerHTML = rows.join('');
}

// 2. 모달 열기
// [수정] 문서 모달 열기


// [수정] 문서 저장 (is_current 포함)

function setDocRevisionHint(mode) {
const hintEl = document.getElementById('doc-revision-hint');
if (!hintEl) return;
hintEl.className = 'alert alert-primary small hidden';
hintEl.textContent = '기존 문서를 바꾸지 않고 새 개정판을 등록합니다. 저장하면 이전 버전은 그대로 남습니다.';
if (mode === 'revision') {
hintEl.className = 'alert alert-primary small';
} else if (mode === 'history') {
hintEl.className = 'alert alert-light border small';
hintEl.textContent = '구판은 개정 이력으로 보관되는 문서입니다. 내용 수정은 현재판에서 새 개정판을 등록해 반영하세요.';
}
}

function setDocModalReadonly(isReadonly) {
['doc-title', 'doc-version', 'doc-access-scope', 'doc-date', 'doc-revision-summary', 'doc-content', 'doc-current'].forEach((fieldId) => {
const field = document.getElementById(fieldId);
if (field) field.disabled = !!isReadonly;
});
const saveBtn = document.getElementById('btn-save-doc');
if (saveBtn) saveBtn.classList.toggle('hidden', !!isReadonly);
}

function populateDocModalFields(data = {}) {
document.getElementById('doc-title').value = data.title || '';
document.getElementById('doc-version').value = data.version || '';
document.getElementById('doc-date').value = data.event_date || getAdminMemberKstDateString();
document.getElementById('doc-revision-summary').value = data.revision_summary || '';
document.getElementById('doc-content').value = data.content || '';
document.getElementById('doc-current').checked = data.is_current !== false;
document.getElementById('doc-access-scope').value = getDocVisibilityMeta(data.access_scope, data.title).scope;
}

function showDocModal() {
bootstrap.Modal.getOrCreateInstance(document.getElementById('docModal')).show();
}

// [수정] 문서 모달 열기 (파일 관련 제거)
async function openDocModal(id) {
document.getElementById('doc-id').value = id || '';
document.getElementById('doc-revision-source-id').value = '';
setDocModalReadonly(false);
setDocRevisionHint('');
const titleEl = document.getElementById('doc-modal-title');
if (titleEl) titleEl.innerHTML = '<i class="bi bi-file-earmark-text text-primary me-2"></i>규정/문서 등록';

if(id) {
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*')).eq('id', id).single();
if (error) return myAlert('문서를 불러오지 못했습니다: ' + error.message, 'error');
if(data) populateDocModalFields(data);
} else {
populateDocModalFields({
title: '정관',
version: '',
event_date: getAdminMemberKstDateString(),
content: '',
revision_summary: '',
is_current: true,
access_scope: 'PUBLIC'
});
}
showDocModal();
}

async function openDocRevisionModal(id) {
if (!id) return;
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*')).eq('id', id).single();
if (error) return myAlert('원본 문서를 불러오지 못했습니다: ' + error.message, 'error');
if (!data) return myAlert('원본 문서를 불러오지 못했습니다.', 'warning');

document.getElementById('doc-id').value = '';
document.getElementById('doc-revision-source-id').value = id;
setDocModalReadonly(false);
populateDocModalFields({
title: data.title || '',
version: '',
event_date: getAdminMemberKstDateString(),
content: data.content || '',
revision_summary: '',
is_current: true,
access_scope: getDocVisibilityMeta(data.access_scope, data.title).scope
});
const titleEl = document.getElementById('doc-modal-title');
if (titleEl) titleEl.innerHTML = '<i class="bi bi-file-earmark-plus text-primary me-2"></i>규정 개정판 등록';
setDocRevisionHint('revision');
showDocModal();
}

async function openDocHistoryViewModal(id) {
if (!id) return;
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*')).eq('id', id).single();
if (error) return myAlert('구판 문서를 불러오지 못했습니다: ' + error.message, 'error');
if (!data) return myAlert('구판 문서를 불러오지 못했습니다.', 'warning');

document.getElementById('doc-id').value = id;
document.getElementById('doc-revision-source-id').value = '';
populateDocModalFields(data);
setDocModalReadonly(true);
const titleEl = document.getElementById('doc-modal-title');
if (titleEl) titleEl.innerHTML = '<i class="bi bi-clock-history text-secondary me-2"></i>규정 구판 보기';
setDocRevisionHint('history');
showDocModal();
}

// [수정] 문서 저장 (파일 로직 삭제)
async function saveDoc() {
const title = document.getElementById('doc-title').value;
if(!title) return myAlert("제목을 입력하세요.", 'warning');
const saveBtn = document.getElementById('btn-save-doc');
if (saveBtn?.disabled) return;

if (saveBtn) {
saveBtn.disabled = true;
saveBtn.textContent = '저장 중...';
}
showLoading(true);

// 파일 업로드 로직 삭제됨 (순수 텍스트만 저장)

const updates = {
p_id: document.getElementById('doc-id').value || null,
p_category: 'doc',
p_title: title,
p_date: document.getElementById('doc-date').value,
p_content: document.getElementById('doc-content').value,
p_version: document.getElementById('doc-version').value,
p_file_url: null, // 파일 없음
p_is_current: document.getElementById('doc-current').checked,
p_access_scope: document.getElementById('doc-access-scope').value,
p_revision_summary: document.getElementById('doc-revision-summary').value || null,
p_revision_source_id: document.getElementById('doc-revision-source-id').value || null
};

try {
const { error } = await _supabase.rpc('upsert_document_secure', updates);
if(error) myAlert('저장 실패: ' + error.message, 'error');
else {
bootstrap.Modal.getInstance(document.getElementById('docModal')).hide();
fetchDocs();
}
} finally {
showLoading(false);
if (saveBtn) {
saveBtn.disabled = false;
saveBtn.textContent = '저장하기';
}
}
}

// 삭제 (기존 삭제 함수 재활용)
function askDeleteDoc(id) {
deleteType = 'history'; // 문서는 기술적으로 history와 같은 테이블(site_documents)을 씀
document.getElementById('delete-target-id').value = id;
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

const ACTIVITY_GALLERY_META_RE = /<!--\s*ACTIVITY_GALLERY:([\s\S]*?)\s*-->/;

/* SITE_LAZY: normalizeActivityGalleryUrls */

/* SITE_LAZY: parseActivityContentWithGallery */

/* SITE_LAZY: buildActivityContentWithGallery */

/* SITE_LAZY: normalizeActivityContentForEditor */

/* SITE_LAZY: releaseActivityCoverPreviewObjectUrl */

/* SITE_LAZY: getActivityGalleryUrlsFromState */

/* SITE_LAZY: syncActivityCoverHiddenFields */

/* SITE_LAZY: renderActivityCoverPreview */

/* SITE_LAZY: setActivityGalleryItemsFromUrls */

/* SITE_LAZY: setActivityCoverState */

/* SITE_LAZY: addActivityGalleryFiles */

/* SITE_LAZY: previewActivityCover */

/* SITE_LAZY: handleActivityGalleryDrag */

/* SITE_LAZY: handleActivityGalleryDrop */

/* SITE_LAZY: setActivityGalleryCover */

/* SITE_LAZY: removeActivityGalleryImage */

/* SITE_LAZY: clearActivityCover */

/* SITE_LAZY: getActivitySourceEventId */

/* SITE_LAZY: setActivitySourceEventId */

/* SITE_LAZY: formatActivitySourceEventDate */

/* SITE_LAZY: activitySourceTypeLabel */

/* SITE_LAZY: loadActivityParticipationEvents */

/* SITE_LAZY: getActivityParticipationPhotoPreview */

/* SITE_LAZY: buildActivitySourceSummary */

/* SITE_LAZY: applyActivitySourceEvent */

/* SITE_LAZY: loadSelectedActivitySourceEvent */

/* SITE_LAZY: activityPublishedPhotoExtension */

/* SITE_LAZY: publishActivityParticipationPhoto */

/* SITE_LAZY: deleteActivityPhotoIfUnreferenced */

/* SITE_LAZY: fetchActivities */

let g_activityEditorBridge = null;
let g_activityModalOpening = false;
let g_activityOriginalBody = '';
let g_activityEditorLoadedHtml = '';
let g_activityDateUserEdited = false;
let g_activityDraftBaseline = '';
let g_activityDiscardPending = false;
let g_activityAllowClose = false;

/* SITE_LAZY: getActivityDraftSnapshot */

/* SITE_LAZY: hasUnsavedActivityChanges */

/* SITE_LAZY: bindActivityDraftGuard */

/* SITE_LAZY: closeActivityAfterSave */

/* SITE_LAZY: ensureActivityRichEditor */

/* SITE_LAZY: updateActivitySaveLabel */

/* SITE_LAZY: openActivityModal */

/* SITE_LAZY: syncActivityHistoryMilestoneUi */

/* SITE_LAZY: saveActivity */

/* SITE_LAZY: askDeleteActivity */

/* SITE_LAZY: getExternalNewsAdminScopeLabel */

/* SITE_LAZY: normalizeExternalNewsAdminUrl */

/* SITE_LAZY: renderExternalNewsSyncStatus */

/* SITE_LAZY: fetchExternalNewsAdmin */

/* SITE_LAZY: syncExternalNewsAdmin */

/* SITE_LAZY: hasPartnerPendingChanges */

/* SITE_LAZY: resolvePartnerPendingPreview */

let g_partnerBadgeSyncTimer = null;
let g_partnerBadgePreviewRequestSeq = 0;

/* SITE_LAZY: renderPartnerSyncedBadgePreview */

/* SITE_LAZY: fetchPartnerMemberBadgeCodes */

/* SITE_LAZY: refreshPartnerBadgeSyncPreview */

/* SITE_LAZY: bindPartnerBadgeSyncInput */

const PARTNER_REQUEST_LOG_LIMIT = 100;

/* SITE_LAZY: parsePartnerRequestSnapshot */

/* SITE_LAZY: getPartnerRequestKindLabel */

/* SITE_LAZY: getPartnerRequestStageLabel */

/* SITE_LAZY: getPartnerRequestOutcomeBadge */

/* SITE_LAZY: renderPartnerRequestLogs */

/* SITE_LAZY: fetchPartnerRequestLogs */

// [수정] 파트너 목록 불러오기 (badges.js 활용)
/* SITE_LAZY: fetchPartners */
// [수정] 파트너 모달 열기 (수정 요청 데이터 우선 로드)
let g_partnerModalOpening = false;
/* SITE_LAZY: openPartnerModal */
// 4. 파트너 저장
// [3] 저장 함수 (ID 처리 + 공통 파일 함수 사용)
let g_partnerSaving = false;
/* SITE_LAZY: savePartner */

// 5. 파트너 삭제
/* SITE_LAZY: askDeletePartner */
// [보조] 이미지 프리뷰 공통 처리 함수 (코드 중복 줄이기)
/* SITE_LAZY: handleImagePreview */
// [보조] 파일 선택 시 프리뷰 (HTML onchange에 연결됨)
/* SITE_LAZY: previewPartnerImage */

// [보조] 이미지 삭제 버튼
/* SITE_LAZY: clearPartnerImage */
// 1. 뱃지 목록 불러오기
// [수정] 뱃지 목록 조회 (badges.js 활용)
async function fetchBadges() {
    const tbody = document.getElementById('badgeListBody');
    if (!tbody) return false;
    const status = document.getElementById('badge-list-status');
    if (status) status.textContent = '뱃지를 불러오는 중입니다…';
    try {
    await ensureBadgesReady();
    const {data, error} = await scopeAdminTenant(_supabase.from('site_badges')
        .select('*').eq('is_active', true)).order('display_order', {ascending:true});
    if (error) throw error;
    if (status) status.textContent = '';
    g_badges = data || [];
    tbody.innerHTML = '';
    g_badges.forEach(b => {
        const badgeIdArg = escapeJsString(String(b.id || ''));
        const badgeColor = ['primary','secondary','success','danger','warning','info','light','dark'].includes(String(b.color || '').toLowerCase())
            ? String(b.color).toLowerCase() : 'secondary';
        const colorBadge = '<span class="badge bg-' + badgeColor + ' text-white">' + escapeHtml(b.color || badgeColor) + '</span>';
        tbody.innerHTML += '<tr><td>' + escapeHtml(b.display_order ?? '') + '</td><td class="fs-4">' + escapeHtml(b.icon || '') +
            '</td><td class="text-start"><div class="fw-bold">' + escapeHtml(b.name || '') + '</div><div class="small text-muted">' +
            escapeHtml(b.description || '-') + '</div></td><td class="small font-monospace">' + escapeHtml(b.code || '') +
            '</td><td>' + colorBadge + '</td><td><button class="btn btn-sm btn-light" onclick="openBadgeModal(\'' + badgeIdArg +
            '\')">수정</button><button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeleteBadge(\'' + badgeIdArg + '\')">삭제</button></td></tr>';
    });
    return true;
    } catch (error) {
        CoopSafeLog.error('Badge list unavailable:', error);
        if (status) status.textContent = '최신 뱃지 목록을 불러오지 못했습니다. 잠시 후 뱃지 관리 탭을 다시 눌러주세요.';
        return false;
    }
}

let g_badgeSaving = false;
async function openBadgeModal(id) {
    const modal = document.getElementById('badgeModal');
    if (g_badgeSaving || modal.classList.contains('show')) return;
    bindSiteMutationModal(modal);
    const b = id ? g_badges.find(item => String(item.id) === String(id)) : null;
    if (id && !b) return myAlert('뱃지 정보를 찾지 못했습니다. 목록을 다시 불러온 뒤 선택해주세요.', 'warning');
    document.getElementById('bg-id').value = id || '';
    document.getElementById('bg-code').value = b?.code || '';
    document.getElementById('bg-icon').value = b?.icon || '🏅';
    document.getElementById('bg-name').value = b?.name || '';
    document.getElementById('bg-desc').value = b?.description || '';
    document.getElementById('bg-color').value = b?.color || 'primary';
    document.getElementById('bg-order').value = b?.display_order ?? g_badges.length + 1;
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function saveBadge() {
    if (g_badgeSaving) return;
    const updates = {
        p_id: document.getElementById('bg-id').value || null,
        p_code: document.getElementById('bg-code').value,
        p_icon: document.getElementById('bg-icon').value,
        p_name: document.getElementById('bg-name').value,
        p_desc: document.getElementById('bg-desc').value,
        p_color: document.getElementById('bg-color').value,
        p_order: Number(document.getElementById('bg-order').value)
    };
    if (!updates.p_name.trim() || !updates.p_code.trim() || !Number.isFinite(updates.p_order))
        return myAlert('뱃지 이름과 코드, 순서를 확인해주세요.', 'warning');
    g_badgeSaving = true;
    const unlock = lockSiteMutationModal('badgeModal', 'btn-save-badge', '저장 중…');
    showLoading(true);
    let confirmed = false;
    try {
        const {error} = await _supabase.rpc('upsert_badge_secure', updates);
        if (error) throw error;
        confirmed = true;
        Badges._allBadgesCache = null;
        await closeSiteMutationModal('badgeModal');
        try {
            if (await fetchBadges() === false) throw new Error('BADGE_LIST_REFRESH_FAILED');
        } catch (error) {
            CoopSafeLog.error('Badge saved; refresh failed:', error);
            myAlert('뱃지는 저장되었습니다. 목록을 다시 열어 확인해주세요. 다시 저장할 필요는 없습니다.', 'warning');
        }
    } catch (error) {
        CoopSafeLog.error('Badge save result unavailable:', error);
        myAlert(confirmed ? '뱃지는 저장되었습니다. 목록을 다시 열어 확인해주세요.' :
            '저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 중복 등록을 피하려면 목록에서 저장 여부를 먼저 확인해주세요.', 'warning');
    } finally {
        showLoading(false);
        unlock();
        g_badgeSaving = false;
    }
}

// 4. 뱃지 삭제
function askDeleteBadge(id) {
deleteType = 'badge';
document.getElementById('delete-target-id').value = id;
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}
// ================================================================
// [기능 10] FAQ 관리
// ================================================================

// 1. FAQ 목록 불러오기
/* SITE_LAZY: fetchFaqs */

/* SITE_LAZY: closeFaqAfterSave */

// 2. 모달 열기 (등록/수정)
let g_faqModalOpening = false;
let g_faqSaving = false;
let g_faqSaveConfirmed = false;
/* SITE_LAZY: openFaqModal */

// 3. 저장 함수
/* SITE_LAZY: saveFaq */

// 4. 삭제 요청
/* SITE_LAZY: askDeleteFaq */


// ================================================================
// [수정] 통합 삭제 함수에 FAQ 추가 (기존 confirmDelete 교체)
// ================================================================
let g_siteDeleting = false;
async function runSiteDelete(type, id) {
    if (g_siteDeleting) return;
    const routes = {
        history: ['delete_document_secure', fetchHistory],
        plant: ['delete_plant_secure', fetchPlants],
        'power-generation': ['delete_power_generation_log_secure', fetchPowerGenerationLogs],
        'power-generation-integration': ['delete_power_generation_integration_secure', () => fetchPowerGenerationIntegrations(true)],
        partner: ['delete_partner_secure', () => fetchPartners()],
        badge: ['delete_badge_secure', fetchBadges],
        faq: ['delete_faq_secure', () => fetchFaqs()],
        notice: ['delete_notice_secure', fetchNotices]
    };
    const route = routes[type];
    if (!route || !id) return myAlert('삭제할 항목을 다시 선택해주세요.', 'warning');
    const faqContext = type === 'faq' ? window.AdminMemberSite?.captureFaqDelete?.(id) : null;
    g_siteDeleting = true;
    const unlock = lockSiteMutationModal('deleteConfirmModal', 'btn-real-delete', '삭제 중…');
    showLoading(true);
    let confirmed = false;
    try {
        const {error} = await _supabase.rpc(route[0], {p_id:id});
        if (error) throw error;
        confirmed = true;
        if (type === 'faq') window.AdminMemberSite?.completeFaqDelete?.(faqContext);
        if (type === 'badge') Badges._allBadgesCache = null;
        await closeSiteMutationModal('deleteConfirmModal');
        try {
            if (await route[1]() === false) throw new Error('SITE_DELETE_REFRESH_FAILED');
        } catch (error) {
            CoopSafeLog.error('Site item deleted; list refresh failed:', error);
            myAlert('삭제는 완료되었습니다. 목록을 다시 열어 확인해주세요. 다시 삭제할 필요는 없습니다.', 'warning');
        }
    } catch (error) {
        CoopSafeLog.error('Site delete result unavailable:', error);
        myAlert(confirmed ? '삭제는 완료되었습니다. 목록을 다시 열어 확인해주세요.' :
            '삭제 결과를 확인하지 못했습니다. 목록에서 삭제 여부를 먼저 확인해주세요.', 'warning');
    } finally {
        showLoading(false);
        unlock();
        g_siteDeleting = false;
    }
}

async function confirmDelete() {
    // Capture both before any await; changing another dialog cannot switch the refresh target.
    const type = deleteType;
    const id = document.getElementById('delete-target-id').value;
    await runSiteDelete(type, id);
}

// ================================================================
// [기능 0] 대시보드 로드 및 유틸
// ================================================================


// Reuse the roster's existing permission check and scoped search; no new role is granted.
function goToRegularMembers() {
  if (!canAccessAdminMemberTab('members')) { switchTab('members'); return; }
  const status = document.getElementById('filter-status');
  const type = document.getElementById('filter-type');
  const keyword = document.getElementById('search-keyword');
  if (status) status.value = '정상';
  if (type) type.value = 'all';
  if (keyword) keyword.value = '';
  switchTab('members');
  resetMemberPageAndFetch();
}

// 승인 대기 카드 클릭 시 조합원 탭으로 이동
function goToPendingMembers() {
  // 이 페이지는 Bootstrap Tab이 아니라 switchTab 기반
  switchTab('members');

  // 필터 적용 후 조회
  setTimeout(() => {
    const statusEl = document.getElementById('filter-status');
    if (statusEl) statusEl.value = '승인대기';
    fetchMembers();
  }, 80);
}

function openCapitalReturnManagement() {
  g_app_type_filter = 'governance';
  g_app_filter = 'pending';
  switchTab('applications');
  filterAppType('governance');
  filterAppList('pending');

  document.querySelectorAll('.sidebar-menu .nav-link').forEach(function (el) {
    el.classList.remove('active');
  });
  const returnNav = document.getElementById('nav-capital-returns');
  if (returnNav) returnNav.classList.add('active');
}

function isAdminMemberRuntimeModuleEnabled(moduleKey) {
const modules = g_adminMemberRuntime && typeof g_adminMemberRuntime.modules === 'object'
? g_adminMemberRuntime.modules
: null;
if (!modules || !(moduleKey in modules)) return true;
return modules[moduleKey] !== false;
}

function isAdminMemberSiteProfile() {
return String(g_adminMemberRuntime?.runtime_profile || '') === 'site_member';
}

function usesAdminMemberFullPayoutWorkflow() {
return !isAdminMemberSiteProfile()
    && isAdminMemberRuntimeModuleEnabled('approval')
    && isAdminMemberRuntimeModuleEnabled('accounting');
}

function hasAdminMemberScopePermission(scopeKey) {
const safeScope = String(scopeKey || '').trim();
let cachedRole = '';
try {
    const userStored = localStorage.getItem('erp_user');
    if (userStored) cachedRole = String(JSON.parse(userStored)?.role || '').toLowerCase();
} catch (_) { cachedRole = ''; }
const cachedRoleIsAdmin = cachedRole === 'admin' || cachedRole === 'admin_all';
if (
    String(g_adminMemberRuntime?.runtime_profile || '') === 'site_member'
    && ['member_admin', 'site_admin'].includes(safeScope)
    && g_adminMemberRuntime?.module_access?.[safeScope] === true
) return cachedRoleIsAdmin;
if (!permissionSet || permissionSet.size === 0) return cachedRoleIsAdmin;
if (safeScope === 'member_admin') return permissionSet.has('member.admin');
if (safeScope === 'site_admin') return permissionSet.has('site.admin') || permissionSet.has('member.admin');
if (safeScope === 'documents_admin') return permissionSet.has('documents.manage') || permissionSet.has('site.admin') || permissionSet.has('member.admin');
return cachedRoleIsAdmin;
}

function hasAdminMemberBadgePermission() {
return isAdminMemberRuntimeModuleEnabled('site_admin')
    && (!isAdminMemberSiteProfile() || g_adminMemberRuntime?.module_access?.site_admin === true)
    && (permissionSet?.size ? permissionSet.has('site.admin') : hasAdminMemberScopePermission('site_admin'));
}

function canManageAdminMemberIndividualBadges() {
return !isAdminMemberSiteProfile()
    || (hasAdminMemberBadgePermission() && hasAdminMemberScopePermission('member_admin'));
}

function canAccessAdminMemberTab(tabName) {
const safeTab = String(tabName || '').trim();
if (!safeTab) return true;
if (safeTab === 'badges' && !hasAdminMemberBadgePermission()) return false;
const knownTabs = new Set(['dashboard', ...ADMIN_MEMBER_TABS.member_admin, ...ADMIN_MEMBER_TABS.site_admin]);
if (!knownTabs.has(safeTab)) return false;
if (isAdminMemberSiteProfile() && safeTab === 'funds-manage') return false;
if (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin' && safeTab === 'dashboard') return false;
if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' && safeTab !== 'site') return false;
if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && ADMIN_MEMBER_TABS.site_admin.includes(safeTab)) return false;
if (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin' && ADMIN_MEMBER_TABS.member_admin.includes(safeTab)) return false;
if (safeTab === 'dashboard') return ADMIN_MEMBER_PAGE_SCOPE !== 'site_admin' && ADMIN_MEMBER_PAGE_SCOPE !== 'documents_admin';
if (ADMIN_MEMBER_TABS.member_admin.includes(safeTab)) return isAdminMemberRuntimeModuleEnabled('member_admin') && hasAdminMemberScopePermission('member_admin');
if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' && ADMIN_MEMBER_TABS.documents_admin.includes(safeTab)) return isAdminMemberRuntimeModuleEnabled('documents') && hasAdminMemberScopePermission('documents_admin');
if (ADMIN_MEMBER_TABS.site_admin.includes(safeTab)) return isAdminMemberRuntimeModuleEnabled('site_admin') && hasAdminMemberScopePermission('site_admin');
return true;
}

function selectAdminMemberSiteSubTab(subTabId) {
const safeSubTabId = String(subTabId || '').trim();
if (!safeSubTabId) return;
document.querySelectorAll('#tab-site .tab-content > .tab-pane').forEach((pane) => {
const isTarget = pane.id === safeSubTabId;
pane.classList.toggle('show', isTarget);
pane.classList.toggle('active', isTarget);
});
document.querySelectorAll('#tab-site .nav-link[data-bs-toggle="tab"]').forEach((link) => {
const href = String(link.getAttribute('href') || '').replace(/^#/, '');
link.classList.toggle('active', href === safeSubTabId);
});
}

function applyAdminMemberSiteScopeUi() {
const documentsScope = ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin';
const documentsAdminEnabled = isAdminMemberRuntimeModuleEnabled('documents') && hasAdminMemberScopePermission('documents_admin');
const titleEl = document.getElementById('site-content-title');
if (titleEl) titleEl.textContent = documentsScope ? '📚 규정·정관 관리' : '🖥️ 홈페이지 관리';

const tabsEl = document.getElementById('site-content-tabs');
if (tabsEl) tabsEl.classList.toggle('hidden', documentsScope);

const movedNoteEl = document.getElementById('site-documents-moved-note');
if (movedNoteEl) movedNoteEl.classList.toggle('hidden', documentsScope || !documentsAdminEnabled);

const docsNavItem = document.getElementById('site-docs-nav-item');
if (docsNavItem) docsNavItem.classList.toggle('hidden', !documentsScope);

if (documentsScope) {
selectAdminMemberSiteSubTab('sub-docs');
} else {
const activePane = document.querySelector('#tab-site .tab-content > .tab-pane.show.active');
if (activePane?.id === 'sub-docs') selectAdminMemberSiteSubTab('sub-sections');
}
}

function applyAdminMemberRuntimeUi(runtime) {
g_adminMemberRuntime = runtime && typeof runtime === 'object' ? runtime : null;
const isSiteMemberProfile = isAdminMemberSiteProfile();
const memberAdminEnabled = isAdminMemberRuntimeModuleEnabled('member_admin') && hasAdminMemberScopePermission('member_admin') && ADMIN_MEMBER_PAGE_SCOPE !== 'site_admin' && ADMIN_MEMBER_PAGE_SCOPE !== 'documents_admin';
const meetingParticipationEnabled = memberAdminEnabled && isAdminMemberRuntimeModuleEnabled('minutes');
const voteEnabled = memberAdminEnabled && isAdminMemberRuntimeModuleEnabled('vote');
const documentsAdminEnabled = isAdminMemberRuntimeModuleEnabled('documents') && hasAdminMemberScopePermission('documents_admin');
const siteAdminEnabled = isAdminMemberRuntimeModuleEnabled('site_admin') && hasAdminMemberScopePermission('site_admin') && ADMIN_MEMBER_PAGE_SCOPE !== 'member_admin' && ADMIN_MEMBER_PAGE_SCOPE !== 'documents_admin';
const dashboardEnabled = ADMIN_MEMBER_PAGE_SCOPE !== 'site_admin' && ADMIN_MEMBER_PAGE_SCOPE !== 'documents_admin';
[
['nav-dashboard', dashboardEnabled],
['memberAdminCategory', memberAdminEnabled],
['nav-members', memberAdminEnabled],
['nav-badges', memberAdminEnabled && hasAdminMemberBadgePermission()],
['member-capital-settings-button', memberAdminEnabled],
['capital-import-button', memberAdminEnabled],
['nav-org-settings', memberAdminEnabled && (isSiteMemberProfile || canOpenFullCoopSettings())],
['nav-meeting-participation', meetingParticipationEnabled],
['nav-funds-manage', memberAdminEnabled && !isSiteMemberProfile],
['nav-applications', memberAdminEnabled],
['nav-capital-returns', memberAdminEnabled],
['nav-deposit', memberAdminEnabled],
['nav-notifications', memberAdminEnabled],
['nav-vote-hub', voteEnabled],
['siteOpsCategory', siteAdminEnabled || documentsAdminEnabled],
['nav-notices', siteAdminEnabled],
['nav-documents-admin', documentsAdminEnabled],
['siteAdminCategory', siteAdminEnabled],
['nav-site', siteAdminEnabled]
].forEach(([id, enabled]) => {
const el = document.getElementById(id);
if (!el) return;
el.classList.toggle('hidden', !enabled);
});
capitalImportController?.syncContext();
[
['site-external-news-nav-item', !isSiteMemberProfile],
['site-legal-nav-item', siteAdminEnabled],
['partnerInnerTabs', !isSiteMemberProfile],
['site-org-settings-button', siteAdminEnabled && (isSiteMemberProfile || canOpenFullCoopSettings())],
['sub-external-news', !isSiteMemberProfile],
['tab-badges', memberAdminEnabled && hasAdminMemberBadgePermission()],
['sub-legal', siteAdminEnabled],
['partner-request-log-pane', !isSiteMemberProfile]
].forEach(([id, enabled]) => {
const el = document.getElementById(id);
if (el) el.classList.toggle('hidden', !enabled);
});

const fundsNav = document.getElementById('nav-funds-manage');
if (fundsNav) {
  fundsNav.innerHTML = isSiteMemberProfile
    ? '<i class="bi bi-piggy-bank-fill"></i> 운영자금 관리'
    : '<i class="bi bi-piggy-bank-fill"></i> 자금 및 이용고 배당 관리';
}
const fundsTitle = document.getElementById('funds-manage-title');
if (fundsTitle) fundsTitle.textContent = isSiteMemberProfile ? '💰 운영자금 관리' : '💰 운영자금 및 배당 관리';
['funds-usage-ledger-tab', 'funds-dividend-batches-tab', 'funds-dividend-exports-tab'].forEach((id) => {
  const el = document.getElementById(id);
  const item = el?.closest('li');
  if (item) item.classList.toggle('hidden', isSiteMemberProfile);
});
['sub-tab-dividends', 'sub-tab-dividend-batches', 'sub-tab-dividend-exports'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', isSiteMemberProfile);
});

const detailFundsTab = document.getElementById('member-detail-funds-tab');
if (detailFundsTab) detailFundsTab.textContent = isSiteMemberProfile ? '💰 출자금' : '💰 출자/배당/자금';
const detailBankHeading = document.getElementById('member-detail-bank-heading');
if (detailBankHeading) detailBankHeading.textContent = '🏦 조합원 계좌 정보';
const faqFinanceCategory = document.getElementById('faq-finance-category');
if (faqFinanceCategory) faqFinanceCategory.textContent = isSiteMemberProfile ? '출자/자금' : '출자/배당';
[
  'member-detail-donation-card',
  'member-detail-point-card',
  'member-detail-dividend-card',
  'member-detail-donation-certificate-button',
  'member-detail-family-tab-item',
  'member-detail-participation-tab-item',
  'md-tab-family',
  'md-tab-participation',
  'member-detail-account-manager-panel',
  'member-detail-sns-status-column'
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', isSiteMemberProfile);
});
const detailBadgesGroup = document.getElementById('member-detail-badges-group');
if (detailBadgesGroup) detailBadgesGroup.classList.toggle('hidden', !canManageAdminMemberIndividualBadges());
const preferredNameInput = document.getElementById('md-preferred-name');
if (preferredNameInput) preferredNameInput.placeholder = '';
const preferredNamePosition = document.getElementById('md-preferred-name-position');
if (preferredNamePosition) {
  const beforeOption = preferredNamePosition.querySelector('option[value="before"]');
  const afterOption = preferredNamePosition.querySelector('option[value="after"]');
  if (beforeOption) beforeOption.textContent = '이름 앞';
  if (afterOption) afterOption.textContent = '이름 뒤';
}
const certificateSettingsButton = document.getElementById('member-certificate-settings-button');
if (certificateSettingsButton) certificateSettingsButton.classList.toggle('hidden', !isSiteMemberProfile);
const capitalCertificateButton = document.getElementById('member-detail-capital-certificate-button');
if (capitalCertificateButton) capitalCertificateButton.textContent = isSiteMemberProfile ? '🖨️ 출자증서' : '🖨️ 출자증명서';

const capitalChartColumn = document.getElementById('dashboard-capital-chart-column');
if (capitalChartColumn) {
  capitalChartColumn.classList.toggle('col-lg-6', !isSiteMemberProfile);
  capitalChartColumn.classList.toggle('col-12', isSiteMemberProfile);
}
['dashboard-yongin-composition-column', 'dashboard-gyeonggi-composition-column'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', isSiteMemberProfile);
});
const demographicAgeHelp = document.getElementById('member-demographic-age-status');
if (demographicAgeHelp) demographicAgeHelp.classList.remove('hidden');
if (isSiteMemberProfile) {
const activeSitePane = document.querySelector('#tab-site .tab-content > .tab-pane.show.active');
if (activeSitePane && activeSitePane.id === 'sub-external-news') {
selectAdminMemberSiteSubTab('sub-sections');
}
}
applyAdminMemberSiteScopeUi();
}

function getInitialAdminMemberTab() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const requested = String(params.get('tab') || '').trim();
    if (requested && canAccessAdminMemberTab(requested)) return requested;
  } catch (_) {}
  if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin') return 'dashboard';
  if (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin') return 'site';
  if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') return 'site';
  return 'dashboard';
}

async function openAdminMemberActivityDeepLink() {
try {
const params = new URLSearchParams(window.location.search || '');
if (params.get('sub') !== 'activities' || getInitialAdminMemberTab() !== 'site') return;
if (!(await ensureAdminMemberSiteReady())) return;
selectAdminMemberSiteSubTab('sub-activities');
CoopHomeVisualEditor.select('activities', false);
await fetchActivities();
const sourceEventId = String(params.get('activity_event') || '').trim();
if (!sourceEventId) return;
const existing = (g_siteActivities || []).find((row) => String(row.source_participation_event_id || '') === sourceEventId);
await openActivityModal(existing?.id || null, sourceEventId);
} catch (error) {
CoopSafeLog.error("[openAdminMemberActivityDeepLink] failed:", error);
myAlert('우리 소식 작성 화면을 열지 못했습니다: ' + (error?.message || error), 'error');
}
} // End of openAdminMemberActivityDeepLink

async function openAdminMemberSiteSubDeepLink() {
try {
const params = new URLSearchParams(window.location.search || '');
if (getInitialAdminMemberTab() !== 'site') return;
const requestedSub = String(params.get('sub') || '').trim();
if (requestedSub === 'legal' && hasAdminMemberScopePermission('site_admin') && isAdminMemberRuntimeModuleEnabled('site_admin')) {
if (!(await ensureAdminMemberSiteReady())) return;
selectAdminMemberSiteSubTab('sub-legal');
CoopHomeVisualEditor.select('legal', false);
await fetchSiteLegalDocuments();
const kind = params.get('document');
if (['signup_purpose','signup_privacy','terms','privacy'].includes(kind)) CoopSiteLegalEditor.select(kind);
}
if (requestedSub === 'plants') {
if (!(await ensureAdminMemberSiteReady())) return;
selectAdminMemberSiteSubTab('sub-plants');
CoopHomeVisualEditor.select('progress', false);
await fetchPlants();
}
} catch (error) {
CoopSafeLog.error("[openAdminMemberSiteSubDeepLink] failed:", error);
}
} // End of openAdminMemberSiteSubDeepLink


// 숫자 애니메이션 효과 함수
function animateNumber(id, target, isMoney = false) {
const el = document.getElementById(id);
if(!el) return;

const start = 0;
const duration = 1000; // 1초 동안 실행
const startTime = performance.now();

function update(currentTime) {
const elapsed = currentTime - startTime;
const progress = Math.min(elapsed / duration, 1);
const value = Math.floor(progress * (target - start) + start);

el.innerText = isMoney
? value.toLocaleString() + '원'
: value.toLocaleString() + (id.includes('capital') ? '' : (id.includes('consult')?'건':'명'));

if (progress < 1) requestAnimationFrame(update);
else el.innerText = isMoney
? target.toLocaleString() + '원'
: target.toLocaleString() + (id.includes('capital') ? '' : (id.includes('consult')?'건':'명'));
}
requestAnimationFrame(update);
}


// ================================================================
// [기능 1] 조합원 목록 조회 (검색/필터/정렬 완비)
// ================================================================



// 테이블 렌더링 함수
// [수정 1] 탭 전환 함수 (딜레이 없이 즉시 전환)
// [수정] 탭 전환 함수 (모든 탭 ID 매칭 보장)
// 기존 switchTab 함수를 찾아서 이 부분만 바꾸거나 함수 전체를 교체하세요.

// [수정] 탭 전환 함수 (전체 코드)
function switchTab(tabName) {
    if (!canAccessAdminMemberTab(tabName)) {
        const message = ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin'
            ? '문서관리 모듈 사용이 중지되었습니다.'
            : (ADMIN_MEMBER_TABS.member_admin.includes(tabName)
                ? '조합원 관리 모듈 사용이 중지되었습니다.'
                : '홈페이지 관리 모듈 사용이 중지되었습니다.');
        myAlert(message, 'warning');
        return;
    }

    invalidateDonationListRead();
    invalidateUsageLedgerRead();
    if (!document.getElementById('tab-' + tabName)?.classList.contains('active')) {
        invalidateMemberReturnSummaryRead();
        invalidateAdminDashboardRead();
    }
    if (tabName !== 'applications' && !document.getElementById('tab-' + tabName)?.classList.contains('active')) invalidateApplicationListRead();
    memberFundListResume = null;
    // 1. 모든 탭 숨김 처리
    const panes = document.querySelectorAll('.main-content > .tab-pane');
    panes.forEach(el => {
        el.classList.remove('show', 'active');
        el.style.display = 'none';
    });

    // 2. 선택한 탭 보임 처리
    const target = document.getElementById('tab-' + tabName);
    if (target) {
        target.style.display = 'block';
        target.classList.add('show', 'active');
    }
    if (tabName !== 'site') {
        const siteStatus = document.getElementById('admin-site-code-status');
        if (siteStatus) siteStatus.hidden = true;
    }

    // 3. 사이드바 네비게이션 활성화 표시
    document.querySelectorAll('.sidebar-menu .nav-link').forEach(el => el.classList.remove('active'));

    const navBtn = (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' && tabName === 'site')
        ? document.getElementById('nav-documents-admin')
        : document.getElementById('nav-' + tabName);
    if (navBtn) navBtn.classList.add('active');

    // 4. 탭별 데이터 로드 로직 (분기 처리)
    if (tabName === 'dashboard') {
        loadDashboard();
    }
    else if (tabName === 'members') {
        // 회원 탭은 자동 조회 대신 '검색 유도 화면' 표시
        if(typeof renderEmptyState === 'function') renderEmptyState();
    }
    else if (tabName === 'notifications') {
        void window.MemberNotificationAdmin?.open();
    }
    else if (tabName === 'notices') {
        fetchNotices();
    }
    else if (tabName === 'badges') {
        void fetchBadges();
    }
    else if (tabName === 'site') {
        applyAdminMemberSiteScopeUi();
        if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') {
            fetchDocs();
        } else {
            void openAdminMemberSiteEditor();
        }
    }
    else if (tabName === 'funds-manage') {
        // 자금 관리 탭: 날짜 기본값 세팅
        const startEl = document.getElementById('don-date-start');
        const endEl = document.getElementById('don-date-end');

        if (startEl && !startEl.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');

            startEl.value = `${yyyy}-01-01`; // 1월 1일
            endEl.value = `${yyyy}-${mm}-${dd}`; // 오늘

        }
        void refreshVisibleMemberFundList();
    }
    // ★ [신규 추가됨] 업무 신청 관리 탭 연결
    else if (tabName === 'applications') {
        if(typeof fetchApplications === 'function') fetchApplications();
    }
}
    // 'deposit'(입금매칭), 'site'(홈페이지관리) 등은 별도 초기 로드 함수 없이 UI만 전환됨

// [보조] 최근 N개월 라벨 생성 (YYYY-MM)

// [보조] 월별 출자금 유입 합계 (입금 건만)

// [보조] 업무 신청(대기) 건수 즉시 조회

function toSafeReturnSummaryNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function updateMemberReturnSummary(summary) {
    const source = summary && typeof summary === 'object' ? summary : {};
    const personCount = toSafeReturnSummaryNumber(source.person_count);
    const expectedAmount = toSafeReturnSummaryNumber(source.expected_amount);
    const reductionPeople = toSafeReturnSummaryNumber(source.reduction_person_count);
    const reductionAmount = toSafeReturnSummaryNumber(source.reduction_expected_amount);
    const withdrawalPeople = toSafeReturnSummaryNumber(source.withdrawal_person_count);
    const withdrawalAmount = toSafeReturnSummaryNumber(source.withdrawal_expected_amount);
    const newRequests = toSafeReturnSummaryNumber(source.new_request_count);
    const meetingPending = toSafeReturnSummaryNumber(source.meeting_pending_count);
    const paymentPending = toSafeReturnSummaryNumber(source.payment_pending_count);

    setText('dash-return-summary', `${personCount.toLocaleString('ko-KR')}명 · ${expectedAmount.toLocaleString('ko-KR')}원`);
    setText(
        'dash-return-breakdown',
        `감자 ${reductionPeople.toLocaleString('ko-KR')}명 · ${reductionAmount.toLocaleString('ko-KR')}원 / 탈퇴 ${withdrawalPeople.toLocaleString('ko-KR')}명 · ${withdrawalAmount.toLocaleString('ko-KR')}원`
    );
    setText(
        'dash-return-stages',
        `신규 확인 ${newRequests.toLocaleString('ko-KR')}건 · 총회 대기 ${meetingPending.toLocaleString('ko-KR')}건 · 지급 대기 ${paymentPending.toLocaleString('ko-KR')}건`
    );

    const sidebarBadge = document.getElementById('sidebar-return-badge');
    if (sidebarBadge) {
        sidebarBadge.textContent = `${personCount.toLocaleString('ko-KR')}명`;
        sidebarBadge.classList.toggle('hidden', personCount <= 0);
    }
    setText(
        'sidebar-return-amount',
        personCount > 0 ? `예상 ${expectedAmount.toLocaleString('ko-KR')}원` : '처리 중 반환 없음'
    );
}

function markMemberReturnSummaryUnavailable() {
    setText('dash-return-summary', '확인 필요');
    setText('dash-return-breakdown', '감자·탈퇴 반환 현황을 불러오지 못했습니다.');
    setText('dash-return-stages', '감자·탈퇴 관리에서 다시 확인해주세요.');
    setText('sidebar-return-amount', '현황 확인 필요');
    const sidebarBadge = document.getElementById('sidebar-return-badge');
    if (sidebarBadge) sidebarBadge.classList.add('hidden');
}

function fetchMemberReturnSummary() {
    const owner = memberDetailOwner();
    if (!owner || !canAccessAdminMemberTab('applications')
        || document.getElementById('main-system')?.classList.contains('hidden')) return Promise.resolve(null);
    if (window.frameElement?.hidden) {
        memberReturnSummaryResume = {owner,revision:memberReturnSummaryRevision};
        return Promise.resolve(null);
    }
    if (memberReturnSummaryRequest?.pending && isCurrentMemberReturnSummaryRead(memberReturnSummaryRequest)) return memberReturnSummaryRequest.promise;
    const request = {owner,revision:++memberReturnSummaryRevision,pending:true,promise:null};
    memberReturnSummaryRequest = request;
    request.promise = (async () => {
        try {
            const { data, error } = await _supabase.rpc('admin_get_member_return_summary');
            if (!isCurrentMemberReturnSummaryRead(request)) return null;
            if (error) throw error;
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_MEMBER_RETURN_SUMMARY');
            updateMemberReturnSummary(data);
            return data;
        } catch (error) {
            if (!isCurrentMemberReturnSummaryRead(request)) return null;
            CoopSafeLog.error("감자·탈퇴 반환 현황 조회 실패:", error);
            markMemberReturnSummaryUnavailable();
            return null;
        } finally {
            request.pending = false;
        }
    })();
    return request.promise;
}















// [수정] 대시보드 데이터 로드 (통계 차트 연동)
/* ADMIN_DASHBOARD_LAZY_START */
async function loadDashboard() {
    const owner = memberDetailOwner();
    if (!owner || !canAccessAdminMemberTab('dashboard') || !isAdminMemberRuntimeModuleEnabled('member_admin')
        || document.getElementById('main-system')?.classList.contains('hidden')) return;
    if (window.frameElement?.hidden) {
        adminDashboardResume = {owner,revision:adminDashboardRevision};
        return;
    }
    if (adminDashboardRequest?.pending && isCurrentAdminDashboardRead(adminDashboardRequest)) return adminDashboardRequest.promise;
    const request = {owner,runtime:g_adminMemberRuntime,identity:adminCertificateAuthId,revision:++adminDashboardRevision,applicationRevision:applicationListRevision,pending:true,promise:null};
    adminDashboardRequest = request;
    request.promise = (async () => { try {
        const dashboard = await window.AdminMemberAssets.ensureDashboard();
        if (!isCurrentAdminDashboardRead(request)) return;
        return await dashboard.load({
            isCurrent: () => isCurrentAdminDashboardRead(request),
            isPendingCountCurrent: () => isCurrentAdminDashboardRead(request) && request.applicationRevision === applicationListRevision
        });
    } catch (_) {
        if (!isCurrentAdminDashboardRead(request)) return;
        myAlert('대시보드를 불러오지 못했습니다. 입력한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.', 'error');
    } finally { request.pending = false; } })();
    return request.promise;
}
/* ADMIN_DASHBOARD_LAZY_END */

function refreshMemberDashboardAfterSave() {
    // A successful write invalidates pre-write reads, but hidden statistics wait
    // for their normal tab entry. Reuse the guarded lazy loader, not its private functions.
    invalidateAdminDashboardRead();
    if (document.getElementById('tab-dashboard')?.classList.contains('active')) return loadDashboard();
    return Promise.resolve();
}

// [보조] 차트 렌더링 헬퍼 함수


// [보조] 텍스트 세팅 헬퍼
function setText(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }


function renderMemberPagination() {
    const wrap = document.getElementById('memberListPagination');
    const meta = document.getElementById('memberListMeta');
    const current = document.getElementById('memberPageCurrent');
    const prev = document.getElementById('memberPagePrev');
    const next = document.getElementById('memberPageNext');
    if (!wrap || !meta || !current || !prev || !next) return;

    if (!(g_member_total_count > 0)) {
        wrap.style.setProperty('display', 'none', 'important');
        return;
    }

    const totalPages = Math.max(1, Math.ceil(g_member_total_count / g_member_page_size));
    const start = (g_member_page * g_member_page_size) + 1;
    const end = Math.min(g_member_total_count, start + g_members.length - 1);
    wrap.style.removeProperty('display');
    meta.textContent = `전체 ${g_member_total_count.toLocaleString()}명 중 ${start.toLocaleString()}-${end.toLocaleString()}명`;
    current.textContent = `${g_member_page + 1} / ${totalPages}`;
    prev.disabled = g_member_page <= 0;
    next.disabled = g_member_page >= totalPages - 1;
} // End of renderMemberPagination

function resetMemberPageAndFetch() {
    g_member_page = 0;
    fetchMembers();
} // End of resetMemberPageAndFetch

function changeMemberPage(direction) {
    const totalPages = Math.max(1, Math.ceil(g_member_total_count / g_member_page_size));
    const nextPage = Math.min(Math.max(g_member_page + Number(direction || 0), 0), totalPages - 1);
    if (nextPage === g_member_page) return;
    g_member_page = nextPage;
    fetchMembers();
} // End of changeMemberPage

function changeMemberPageSize(value) {
    const nextSize = [25, 50, 100].includes(Number(value)) ? Number(value) : 25;
    g_member_page_size = nextSize;
    g_member_page = 0;
    fetchMembers();
} // End of changeMemberPageSize

// [수정] 조합원 검색/목록 로드: 서버 페이지네이션 + 전체 결과 기준 정렬
// The optional import tool owns only its File/preview state; no member editor is reset.
let capitalImportController = null;
let capitalImportOpening = false;
function capitalImportContext() {
    const actor = String(adminCertificateAuthId || '');
    const coopId = String(g_adminMemberRuntime?.coop_id || '');
    return {owner: actor && coopId ? JSON.stringify([actor,coopId]) : '', coopId,
        allowed: !!actor && !!coopId && g_adminMemberRuntime?.is_active !== false && canAccessAdminMemberTab('members')};
}
async function openCapitalImportModal() {
    const before = capitalImportContext();
    if (!before.allowed || capitalImportOpening) return;
    capitalImportOpening = true;
    try {
        const feature = await window.AdminMemberAssets.ensureCapitalImport();
        const current = capitalImportContext();
        if (!current.allowed || current.owner !== before.owner || window.frameElement?.hidden) return;
        if (!capitalImportController) capitalImportController = feature.create({
            client: _supabase, getContext: capitalImportContext,
            ensureSpreadsheet: () => window.AdminMemberAssets.ensureSpreadsheet(),
            refresh: async () => {
                const updated = await fetchMembers();
                await refreshMemberDashboardAfterSave();
                return updated === true;
            }
        });
        capitalImportController.open();
    } catch (_) {
        if (capitalImportContext().owner === before.owner && capitalImportContext().allowed && !window.frameElement?.hidden)
            myAlert('출자금 엑셀 도구를 불러오지 못했습니다. 다시 열어 주세요.', 'error');
    } finally { capitalImportOpening = false; }
}

async function fetchMembers() {
    const requestRevision = ++g_member_fetch_revision;
    // ✅ DOM 요소 단축 선택자
    const $ = (id) => document.getElementById(id);

    // 1. 검색 조건 수집
    const keyword =
        ($('search-keyword')?.value || $('memberSearchKeyword')?.value || '').trim();

    // 필터 값 수집 (없으면 기본값 처리)
    const statusEl = $('filter-status') || $('searchStatus');
    const typeEl = $('filter-type') || $('searchType');
    const sortEl = $('sort-order');

    const status = statusEl ? statusEl.value : 'all';
    const type = typeEl ? typeEl.value : 'all';
    const sort = sortEl ? sortEl.value : 'name'; // 정렬 기준 (기본 이름순)
    const page = g_member_page;
    const pageSize = g_member_page_size;

    try {
        if (typeof showLoading === 'function') showLoading(true);

        const { data, error } = await _supabase.rpc('get_admin_member_page_v3', {
            p_keyword: keyword || null,
            p_status: status === 'all' ? null : status,
            p_member_type: type === 'all' ? null : type,
            p_sort: sort,
            p_page: page,
            p_page_size: pageSize
        });
        if (requestRevision !== g_member_fetch_revision) return;
        if (error) throw error;

        const list = Array.isArray(data?.rows) ? data.rows : [];
        g_member_total_count = Number(data?.total_count || 0);
        if (g_member_page > 0 && list.length === 0 && g_member_total_count > 0) {
            g_member_page = Math.max(0, Math.ceil(g_member_total_count / g_member_page_size) - 1);
            return fetchMembers();
        }
        g_members = list.map(m => normalizeAdminMemberRow(m, m.total_capital || 0));

        // 3. 화면 렌더링
        if (!g_members.length) {
             void window.MemberAdmissionAdmin?.list({client:_supabase,rows:g_members,context:()=>({coop_id:g_adminMemberRuntime?.coop_id,actor:adminCertificateAuthId}),current:()=>requestRevision===g_member_fetch_revision,refresh:()=>fetchMembers()});
             if (!keyword && status === 'all' && type === 'all') {
                 renderNoMembersState();
             } else if (typeof renderMemberTable === 'function') {
                 renderMemberTable([]);
             }
             renderMemberPagination();
             return true;
        }

        renderMemberTable(g_members);
        renderMemberPagination();
        void window.MemberAdmissionAdmin?.list({client:_supabase,rows:g_members,context:()=>({coop_id:g_adminMemberRuntime?.coop_id,actor:adminCertificateAuthId}),current:()=>requestRevision===g_member_fetch_revision,refresh:()=>fetchMembers()});
        return true;
    } catch (err) {
        if (requestRevision !== g_member_fetch_revision) return;
        CoopSafeLog.error("[erp/admin_member] operation failed", err);
        // Alert 대신 모달 사용 권장 (기존 myAlert 함수가 있다면)
        if (typeof myAlert === 'function') {
            myAlert('데이터를 불러오지 못했습니다: ' + (err?.message || err), 'error');
        }
        return false;
    } finally {
        if (requestRevision === g_member_fetch_revision && typeof showLoading === 'function') showLoading(false);
    }
}


// [수정] 테이블 렌더링 (member_type 값 그대로 표시)
// [수정] 테이블 렌더링 (한글 상태값 완벽 대응)
// [수정] 테이블 렌더링 (주소 컬럼 제거 & 관리 버튼 추가 & 정렬 수정)
// [수정] 테이블 렌더링 (행 클릭 시 상세 이동 + 수정 버튼 제거)
function renderMemberTable(list) {
  const tbody = document.getElementById('memberListBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!Array.isArray(list) || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-5">검색 결과가 없습니다.</td></tr>`;
    return;
  }

  const startIndex = g_member_page * g_member_page_size;
  const rowsHtml = list.map((m, idx) => {
    const type = m.member_type || m.type || '-';
    const name = m.name || '-';
    const memberId = m.member_id || '';
    const phone = m.phone || '-';
    const isGroup = String(type).includes('단체');
    const preferredName = String(m.preferred_name || '').trim();
    const preferredPositionLabel = m.preferred_name_position === 'after' ? '이름 뒤' : '이름 앞';
    const preferredNameHtml = !isGroup && preferredName
      ? `<div class="small text-muted mt-1"><span class="badge text-bg-light border me-1">별칭</span>${escapeHtml(preferredName)} · ${preferredPositionLabel}</div>`
      : '';
    const representativeName = m.representative_name || '미입력';
    const contactLabel = [m.contact_name, m.contact_position].filter(Boolean).join(' · ') || '미입력';
    const managerLabel = m.manager_name
      ? [m.manager_name, m.manager_member_id ? `(${m.manager_member_id})` : ''].filter(Boolean).join(' ')
      : '미연결';
    const groupContactHtml = isGroup
      ? `<div class="small text-start lh-sm">
           <div><span class="text-muted">대표</span> ${escapeHtml(representativeName)}</div>
           <div class="mt-1"><span class="text-muted">담당</span> ${escapeHtml(contactLabel)}</div>
           <div class="mt-1"><span class="text-muted">관리</span> ${escapeHtml(managerLabel)}</div>
         </div>`
      : '<span class="text-muted">-</span>';

    // 날짜 포맷팅
    const joinRaw = m.join_date || '';
    const joinDate = joinRaw ? formatAdminMemberKstDate(joinRaw) : '-';

    const status = m.status || '-';
    const totalCapital = Number(m.total_capital || 0).toLocaleString() + '원';

    // 상태 뱃지 스타일
    const statusBadgeClass =
      status === '승인대기' ? 'bg-warning text-dark' :
      status === '정상' ? 'bg-success' :
      (status === '탈퇴' || status === '제명') ? 'bg-secondary' :
      'bg-light text-dark border';
    const welcomeNotificationHtml = status === '승인대기'
      ? renderPendingWelcomeNotificationStatus(m)
      : '';

    // 클릭 시 넘길 키값 (UUID 우선)
    const keyForDetail = m.member_uid || m.uid || m.id || memberId;
    const safeKey = encodeInlineArgument(keyForDetail || '');

    return `
      <tr onclick="openMemberDetail(decodeURIComponent('${safeKey}'))" style="cursor: pointer;">
        <td>${startIndex + idx + 1}</td>
        <td>${escapeHtml(type)}</td>
        <td class="text-start">
          <div class="fw-bold">${escapeHtml(name)}</div>
          ${preferredNameHtml}
          <div class="small text-muted">${memberId ? '(' + escapeHtml(memberId) + ')' : ''}</div>
        </td>
        <td>${escapeHtml(phone)}</td>
        <td>${groupContactHtml}</td>
        <td>
          <div class="small">${escapeHtml(joinDate)}</div>
          <span class="badge ${statusBadgeClass}">${escapeHtml(status)}</span>
          ${welcomeNotificationHtml}
          ${status === '승인대기' ? `<div data-admission-member="${escapeHtml(m.id || m.member_uid || '')}" hidden></div>` : ''}
        </td>
        <td class="fw-bold">${totalCapital}</td>
        <td>
           <button class="btn btn-sm btn-outline-primary">상세</button>
        </td>
      </tr>
    `;
  }).join('');
  tbody.innerHTML = rowsHtml;
  if (!isAdminMemberSiteProfile()) void window.ChildDirectAdmin?.loadList(_supabase, tbody);
}

function renderPendingWelcomeNotificationStatus(member) {
  if (isAdminMemberSiteProfile()) return '';
  const isManagedFamilyProfile = Boolean(String(member?.manager_id || '').trim());
  if (isManagedFamilyProfile) {
    return window.ChildDirectAdmin?.placeholder(member) || '';
  }
  const rawStatus = String(member?.welcome_notification_status || '').trim().toLowerCase();
  const isSent = member?.is_welcome_sent === true || rawStatus === 'accepted';
  const views = {
    accepted: { label: '가입 알림톡 발송 접수', className: 'bg-success' },
    processing: { label: '가입 알림톡 처리중', className: 'bg-primary' },
    unknown: { label: '가입 알림톡 결과 확인 필요', className: 'bg-warning text-dark' },
    failed: { label: '가입 알림톡 발송 실패', className: 'bg-danger' },
    skipped: { label: '가입 알림톡 미발송', className: 'bg-secondary' },
    deferred: { label: '가입 알림톡 발송 보류', className: 'bg-secondary' },
    not_sent: { label: '가입 알림톡 미발송', className: 'bg-light text-dark border' }
  };
  const view = isSent ? views.accepted : (views[rawStatus] || views.not_sent);
  const updatedAt = String(member?.welcome_notification_updated_at || '').trim();
  const updatedLabel = updatedAt ? formatAdminMemberKstDateTime(updatedAt) : '';
  return `
    <div class="mt-1">
      <span class="badge ${view.className}">${view.label}</span>
      ${updatedLabel ? `<div class="small text-muted mt-1">${escapeHtml(updatedLabel)}</div>` : ''}
    </div>
  `;
} // End of renderPendingWelcomeNotificationStatus

function renderNoMembersState() {
  const tbody = document.getElementById('memberListBody');
  if (!tbody) return;

  g_members = [];
  g_member_total_count = 0;
  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center text-muted py-5">
        <div class="mb-2">등록된 조합원이 없습니다.</div>
        <div class="d-flex gap-2 justify-content-center">
          <button class="btn btn-sm btn-primary" onclick="openCreateMemberModal()">첫 조합원 등록</button>
          <button class="btn btn-sm btn-outline-primary" onclick="openMemberImportModal()">엑셀 등록</button>
        </div>
      </td>
    </tr>
  `;
  renderMemberPagination();
}



// [신규] 조합원 명부 초기 상태 (검색 유도 화면)
function renderEmptyState() {
  const tbody = document.getElementById('memberListBody');
  if (!tbody) return;

  g_members = [];
  g_member_total_count = 0;
  g_member_page = 0;
  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center text-muted py-5">
        🔎 검색 조건을 입력하고 <b>검색</b>을 눌러주세요.
      </td>
    </tr>
  `;
  renderMemberPagination();
}


// ================================================================
// [기능 2] 조합원 상세 관리 (슈퍼 모달)
// ================================================================

let g_current_member_id = null; // 현재 보고 있는 조합원 UUID
let g_current_member_row = null; // 현재 상세 모달의 조합원 원본 데이터
// Personal edit buffers live only in this authorized page, never browser storage.
const memberDetailDrafts = new Map();
let memberDetailEditState = null;
let memberDetailDraftOwner = '';
let memberDetailSaving = false;
const memberConsultDrafts = new Map();
const memberConsultPending = new Set();
let memberConsultState = null;
let memberCreateState = null;
let memberCreateSaving = false;
const memberChildDrafts = new Map();
let memberChildState = null;
let memberChildSaving = false;
let memberFamilyRetry = null;
let memberAddressSearch = null;
let memberGroupSearchState = null;
let memberGroupConfirmation = null;
let memberGroupConnectPending = null;
function invalidateMemberAddressSearch() { memberAddressSearch = null; }
function invalidateMemberRelationSearches() {
    invalidateMemberAddressSearch();
    memberGroupSearchState = null;
    memberGroupConfirmation = null;
    const list = document.getElementById('group-search-result');
    if (list) list.textContent = '단체명을 입력하고 검색해 주세요.';
}
function createMemberGroupSearchState() {
    const owner = memberDetailOwner(), member = String(g_current_member_id || '');
    if (!owner || !member || member !== String(document.getElementById('md-uid')?.value || '')
        || window.frameElement?.hidden || !document.getElementById('memberDetailModal')?.classList.contains('show')) return null;
    return {owner,member,revision:g_member_detail_revision,read:null,result:null};
}
function isCurrentMemberGroupSearch(state = memberGroupSearchState) {
    return !!state && state === memberGroupSearchState && state.owner === memberDetailOwner()
        && state.member === String(g_current_member_id || '') && state.member === String(document.getElementById('md-uid')?.value || '')
        && state.revision === g_member_detail_revision && !window.frameElement?.hidden
        && document.getElementById('memberDetailModal')?.classList.contains('show')
        && document.getElementById('groupSearchModal')?.classList.contains('show');
}
for (const id of ['md-addr','md-addr-detail']) document.getElementById(id)?.addEventListener('input',invalidateMemberAddressSearch);
document.getElementById('group-search-input')?.addEventListener('input',() => {
    if (memberGroupSearchState) { memberGroupSearchState.read = null; memberGroupSearchState.result = null; }
    memberGroupConfirmation = null;
    const list = document.getElementById('group-search-result');
    if (list) list.textContent = '검색 버튼을 눌러주세요.';
});
document.getElementById('groupSearchModal')?.addEventListener('hide.bs.modal',invalidateMemberRelationSearches);
const memberFundDrafts = new Map();
let memberFundState = null;
let donationGrantState = null;
let donationBatchState = null;
let donationListRevision = 0;
let donationListRequest = null;
let usageLedgerRevision = 0;
let usageLedgerRequest = null;
let usageLedgerPage = null;
let memberFundListResume = null;
let memberFundRefreshSequence = 0;
let applicationListRevision = 0;
let applicationListRequest = null;
let applicationListResume = null;
let memberReturnSummaryRevision = 0;
let memberReturnSummaryRequest = null;
let memberReturnSummaryResume = null;
let adminDashboardRevision = 0;
let adminDashboardRequest = null;
let adminDashboardResume = null;

function invalidateAdminDashboardRead() {
    adminDashboardRevision++;
    adminDashboardRequest = null;
    adminDashboardResume = null;
}
function isCurrentAdminDashboardRead(request) {
    const owner = memberDetailOwner();
    return !!request && adminDashboardRequest === request && request.revision === adminDashboardRevision
        && request.runtime === g_adminMemberRuntime && request.identity === adminCertificateAuthId
        && !!owner && request.owner === owner && canAccessAdminMemberTab('dashboard')
        && isAdminMemberRuntimeModuleEnabled('member_admin') && !window.frameElement?.hidden
        && !document.getElementById('main-system')?.classList.contains('hidden');
}
window.addEventListener('pagehide', invalidateAdminDashboardRead);

function invalidateMemberReturnSummaryRead() {
    memberReturnSummaryRevision++;
    memberReturnSummaryRequest = null;
    memberReturnSummaryResume = null;
}
function isCurrentMemberReturnSummaryRead(request) {
    const owner = memberDetailOwner();
    return !!request && memberReturnSummaryRequest === request && request.revision === memberReturnSummaryRevision
        && !!owner && request.owner === owner && canAccessAdminMemberTab('applications')
        && !window.frameElement?.hidden && !document.getElementById('main-system')?.classList.contains('hidden');
}
window.addEventListener('pagehide', invalidateMemberReturnSummaryRead);

function invalidateDonationListRead(event) {
    const dateEvent = ['don-date-start','don-date-end'].includes(event?.target?.id);
    if (dateEvent && donationListRequest?.pending && isCurrentDonationListRead(donationListRequest)) return;
    const pending = donationListRequest?.pending;
    donationListRevision++;
    donationListRequest = null;
    if (dateEvent && pending) {
        const body = document.getElementById('donationGlobalBody');
        if (body) body.innerHTML = '<tr><td colspan="6" class="py-5 text-muted">조회 조건을 확인하고 조회를 눌러 주세요.</td></tr>';
        const total = document.getElementById('don-total-sum');
        if (total) total.innerText = '—';
    }
}
function isCurrentDonationListRead(request) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-funds-manage');
    return !!request && donationListRequest === request && request.revision === donationListRevision
        && request.owner === owner && !!owner && !isAdminMemberSiteProfile()
        && canAccessAdminMemberTab('funds-manage') && !window.frameElement?.hidden
        && (pane?.classList.contains('active') || pane?.style.display === 'block')
        && document.getElementById('sub-tab-donations')?.classList.contains('active')
        && document.getElementById('don-date-start')?.value === request.startDate
        && document.getElementById('don-date-end')?.value === request.endDate;
}
function invalidateUsageLedgerRead(event) {
    // A commit/blur or whitespace-only edit is not a new effective search.
    // Non-field invalidations (menu, frame, auth/authority) always continue below.
    if (event?.target?.id === 'div-search-keyword' && usageLedgerRequest?.pending
        && event.target.value.trim() === usageLedgerRequest.keyword
        && isCurrentUsageLedgerRead(usageLedgerRequest)) return;
    usageLedgerRevision++;
    const pending = usageLedgerRequest?.pending;
    usageLedgerRequest?.controller?.abort();
    usageLedgerRequest = null;
    if (pending && event?.target?.id === 'div-search-keyword') {
        const status = document.getElementById('usage-ledger-status');
        if (status) status.textContent = '검색을 눌러 새 조건을 조회해 주세요.';
        if (!usageLedgerPage) document.getElementById('dividendGlobalBody').innerHTML = '<tr><td colspan="5" class="py-5 text-muted">검색 조건을 확인하고 검색을 눌러 주세요.</td></tr>';
    }
    syncUsageLedgerUi();
}
function syncUsageLedgerUi() {
    const more = document.getElementById('usage-ledger-more');
    if (!more) return;
    const owner = JSON.stringify([String(adminCertificateAuthId || ''),String(g_adminMemberRuntime?.coop_id || '')]);
    more.hidden = !usageLedgerPage?.hasMore;
    more.disabled = !!usageLedgerRequest?.pending || !usageLedgerPage
        || usageLedgerPage.owner !== owner
        || usageLedgerPage.keyword !== document.getElementById('div-search-keyword')?.value.trim()
        || !canAccessAdminMemberTab('funds-manage') || isAdminMemberSiteProfile() || !!window.frameElement?.hidden;
    more.textContent = usageLedgerRequest?.pending && usageLedgerRequest.append ? '불러오는 중' : '더 보기';
}
function renderUsageLedgerRows(rows) {
    const tbody = document.getElementById('dividendGlobalBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted py-5">검색 결과가 없습니다.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(p => {
        const amt = Number(p.change_amount || 0);
        let typeBadge = `<span class="badge bg-light text-dark border">${escapeHtml(p.transaction_type || '')}</span>`;
        let colorClass = 'text-dark', sign = '';
        if (p.transaction_type === 'earn') {
            typeBadge = '<span class="badge bg-primary bg-opacity-10 text-primary">지급(Earn)</span>';
            colorClass = 'text-primary fw-bold'; sign = '+';
        } else if (p.transaction_type === 'use') {
            typeBadge = '<span class="badge bg-danger bg-opacity-10 text-danger">차감(Use)</span>';
            colorClass = 'text-danger fw-bold'; if (amt > 0) sign = '-';
        } else if (p.transaction_type === 'withdraw') typeBadge = '<span class="badge bg-secondary">출금</span>';
        else if (p.transaction_type === 'refund') typeBadge = '<span class="badge bg-success">환불</span>';
        return `<tr>
            <td class="small text-secondary">${escapeHtml(formatAdminMemberKstDateTime(p.created_at, '-'))}</td>
            <td class="fw-bold text-start ps-4">${escapeHtml(p.member_name || '미확인')} <span class="small text-muted ms-1">(${escapeHtml(p.member_id || '-')})</span></td>
            <td>${typeBadge}</td><td class="text-end pe-4 ${colorClass}">${sign}${Math.abs(amt).toLocaleString()}</td>
            <td class="text-start small text-truncate" style="max-width:250px;" title="${escapeHtml(p.reason || '')}">${escapeHtml(p.reason || '-')}</td>
        </tr>`;
    }).join('');
}
function isCurrentUsageLedgerRead(request) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-funds-manage');
    return !!request && usageLedgerRequest === request && request.revision === usageLedgerRevision
        && request.owner === owner && !!owner && !isAdminMemberSiteProfile()
        && canAccessAdminMemberTab('funds-manage') && !window.frameElement?.hidden
        && (pane?.classList.contains('active') || pane?.style.display === 'block')
        && document.getElementById('sub-tab-dividends')?.classList.contains('active')
        && document.getElementById('div-search-keyword')?.value.trim() === request.keyword;
}
function invalidateApplicationListRead() {
    applicationListRevision++;
    applicationListRequest = null;
    applicationListResume = null;
}
function isCurrentApplicationListRead(request) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-applications');
    return !!request && applicationListRequest === request && request.revision === applicationListRevision
        && !!owner && request.owner === owner && canAccessAdminMemberTab('applications')
        && !window.frameElement?.hidden && (pane?.classList.contains('active') || pane?.style.display === 'block');
}
function requestApplicationListRefresh(sequence) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-applications');
    if (!owner || !canAccessAdminMemberTab('applications')
        || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    if (window.frameElement?.hidden) {
        applicationListResume = {owner,sequence};
        return Promise.resolve();
    }
    return fetchApplications();
}
function refreshApplicationsAfterConfirmedChange(owner) {
    if (!owner || owner !== memberDetailOwner() || !canAccessAdminMemberTab('applications')
        || document.getElementById('main-system')?.classList.contains('hidden')) return Promise.resolve();
    invalidateApplicationListRead();
    invalidateMemberReturnSummaryRead();
    invalidateAdminDashboardRead();
    const pane = document.getElementById('tab-applications');
    if (pane?.classList.contains('active') || pane?.style.display === 'block') {
        return requestApplicationListRefresh(memberFundRefreshSequence);
    }
    return fetchMemberReturnSummary();
}
window.addEventListener('pagehide', invalidateApplicationListRead);
function refreshVisibleMemberFundList() {
    const pane = document.getElementById('tab-funds-manage');
    if (!memberDetailOwner() || isAdminMemberSiteProfile() || !canAccessAdminMemberTab('funds-manage')
        || window.frameElement?.hidden || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    if (document.getElementById('sub-tab-donations')?.classList.contains('active')) return fetchGlobalDonations();
    if (document.getElementById('sub-tab-dividends')?.classList.contains('active')) return fetchGlobalDividends();
    return Promise.resolve();
}
function requestMemberFundListRefresh(sequence) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-funds-manage');
    if (!owner || isAdminMemberSiteProfile() || !canAccessAdminMemberTab('funds-manage')
        || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    if (window.frameElement?.hidden) {
        memberFundListResume = {owner,sequence};
        return Promise.resolve();
    }
    return refreshVisibleMemberFundList();
}
for (const id of ['don-date-start','don-date-end']) {
    document.getElementById(id)?.addEventListener('input', invalidateDonationListRead);
    document.getElementById(id)?.addEventListener('change', invalidateDonationListRead);
}
document.getElementById('tab-funds-manage')?.addEventListener('hidden.bs.tab', event => {
    if (event.target?.getAttribute('data-bs-target') === '#sub-tab-donations') invalidateDonationListRead();
    if (event.target?.getAttribute('data-bs-target') === '#sub-tab-dividends') invalidateUsageLedgerRead();
});
document.getElementById('div-search-keyword')?.addEventListener('input', invalidateUsageLedgerRead);
document.getElementById('div-search-keyword')?.addEventListener('change', invalidateUsageLedgerRead);

function isCurrentDonationBatch(state=donationBatchState, revision=state?.revision, visible=false) {
    return !!state && state===donationBatchState && state.revision===revision && state.owner===memberDetailOwner()
        && !isAdminMemberSiteProfile() && canAccessAdminMemberTab('funds-manage')
        && (!visible || (!window.frameElement?.hidden && document.getElementById('donationModal')?.classList.contains('show')
            && document.getElementById('tab-don-batch')?.classList.contains('active')));
}
function donationBatchBusy() {
    return !!donationBatchState && ['preparing','saving'].includes(donationBatchState.phase);
}
function hasDonationBatchDraft() {
    const state=donationBatchState;
    return isCurrentDonationBatch(state) && state.phase!=='complete' && !!(state.file || state.rows.length || state.attempt);
}
function pauseDonationBatchRead() {
    const state=donationBatchState;
    if(!state || donationBatchBusy())return;
    state.revision++;
    state.confirmation=null;
    try{state.reader?.abort();}catch(_){}
    state.reader=null;
    if(state.phase==='reading')state.phase='file_pending';
    else if(state.phase==='confirming')state.phase=state.attempt?'unknown':'ready';
    syncDonationBatchUi();
}
function syncDonationBatchUi() {
    const state=donationBatchState, current=isCurrentDonationBatch(state);
    const busy=current && ['confirming','preparing','saving'].includes(state.phase);
    const file=document.getElementById('don-excel-file');
    if(file)file.disabled=!current || busy || state.phase==='unknown' || !!donationGrantState?.busy;
    const submit=document.getElementById('don-excel-submit');
    if(submit){
        submit.textContent=state?.phase==='unknown'?'결과 다시 확인':state?.phase==='complete'?'등록 완료':'일괄 등록하기';
        submit.disabled=!current || !!donationGrantState?.busy || !['ready','unknown'].includes(state.phase) || !state.rows.length;
    }
    const retry=document.getElementById('don-excel-retry');
    if(retry){retry.hidden=!current || !['file_pending','read_failed'].includes(state.phase);retry.disabled=busy || !!donationGrantState?.busy;}
    const status=document.getElementById('don-excel-status');
    if(status)status.textContent=!current?'':state.phase==='saving'?'등록 중':state.phase==='preparing'?'권한 확인 중'
        :state.phase==='confirming'?'등록 확인 중':state.phase==='reading'?'파일을 읽고 있습니다.'
        :state.phase==='unknown'?'등록 결과를 확인하지 못했습니다. 결과를 다시 확인해 주세요.'
        :state.message || (state.file?'작성 중':'');
    document.querySelectorAll('#donationTab button,#donationModal [data-bs-dismiss="modal"]').forEach(node=>{
        node.disabled=!!donationGrantState?.busy || donationBatchBusy();
    });
}
function restoreDonationBatchFile(state) {
    const input=document.getElementById('don-excel-file');
    if(input && state?.file && input.files?.[0]!==state.file){
        try{const files=new DataTransfer();files.items.add(state.file);input.files=files.files;}catch(_){}
    }
}
function resetDonationBatchDraft() {
    const state=donationBatchState;
    donationBatchState=null;
    try{state?.reader?.abort();}catch(_){}
    if(typeof g_donation_excel_data!=='undefined')g_donation_excel_data=[];
    if(typeof g_donation_batch_request_key!=='undefined')g_donation_batch_request_key=null;
    const file=document.getElementById('don-excel-file');if(file)file.value='';
    const preview=document.getElementById('don-excel-preview');if(preview)preview.style.display='none';
    const rows=document.getElementById('don-excel-tbody');if(rows)rows.textContent='';
    const count=document.getElementById('don-excel-count');if(count)count.textContent='';
    syncDonationBatchUi();
}

function donationGrantFields() {
    return ['dn-member-id','dn-member-name','dn-date','dn-amount','dn-method','dn-note'].map(id=>document.getElementById(id)).filter(Boolean);
}
function donationGrantSnapshot() {
    return JSON.stringify(donationGrantFields().map(node=>[node.id,node.id==='dn-amount'?String(node.value).replace(/,/g,''):node.value]));
}
function isCurrentDonationGrant(state=donationGrantState) {
    return !!state && state===donationGrantState && state.owner===memberDetailOwner()
        && !isAdminMemberSiteProfile() && canAccessAdminMemberTab('funds-manage');
}
function hasDonationGrantDraft() {
    return isCurrentDonationGrant() && !donationGrantState.completed
        && (donationGrantState.busy || donationGrantState.uncertain || donationGrantSnapshot()!==donationGrantState.baseline);
}
function syncDonationGrantState() {
    const state=donationGrantState,current=isCurrentDonationGrant(state);
    const status=document.getElementById('donation-grant-status');
    if(status){status.hidden=!current || !hasDonationGrantDraft();status.textContent=state?.busy?'등록 중':state?.uncertain?'결과 확인 필요':'작성 중';}
    document.querySelectorAll('#tab-don-single input,#tab-don-single select,#tab-don-single button').forEach(node=>{
        node.disabled=!current || state.busy || state.uncertain || state.completed || donationBatchBusy();
    });
    syncDonationBatchUi();
}
function clearDonationGrantDraft(clearBatch=true) {
    donationGrantState=null;
    for(const node of donationGrantFields())node.value=node.id==='dn-method'?'transfer':'';
    if(clearBatch)resetDonationBatchDraft();
    document.querySelectorAll('#tab-don-single input,#tab-don-single select,#tab-don-single button').forEach(node=>{node.disabled=true;});
    const status=document.getElementById('donation-grant-status');if(status)status.hidden=true;
}
document.getElementById('tab-don-single')?.addEventListener('input',syncDonationGrantState);
document.getElementById('tab-don-single')?.addEventListener('change',syncDonationGrantState);
document.getElementById('donationModal')?.addEventListener('hide.bs.modal',event=>{
    if((donationGrantState?.busy && !donationGrantState.completed) || donationBatchBusy()){event.preventDefault();return;}
    if(donationGrantState)donationGrantState.confirmation=null;
    pauseDonationBatchRead();
});
document.getElementById('donationTab')?.addEventListener('shown.bs.tab',()=>{
    if(donationGrantState)donationGrantState.confirmation=null;
    pauseDonationBatchRead();
    if(donationBatchState?.phase==='file_pending')void retryDonationBatchRead();
});

function memberFundFields() {
    return ['fund-date','fund-amount','fund-note','fund-depositor','fund-method'].map(id => document.getElementById(id)).filter(Boolean);
}
function memberFundSnapshot() {
    return memberFundFields().map(node => [node.id,node.value]);
}
function memberFundSource(type, row) {
    if (!row) return null;
    const value = {amount:Number(row.amount),date:String(row.deposit_date || row.donation_date || '').slice(0,10),note:row.note ?? null};
    if (type === 'capital') Object.assign(value,{depositor:row.depositor ?? null,status:row.status ?? null});
    else value.method = Object.prototype.hasOwnProperty.call(row,'type') ? row.type : row.payment_method ?? null;
    return value;
}
function setMemberFundMethod(value) {
    const select = document.getElementById('fund-method'), method = String(value ?? '');
    select.querySelectorAll('[data-fund-legacy-method]').forEach(node=>node.remove());
    if (!Array.from(select.options).some(node=>node.value===method)) {
        const option=document.createElement('option');option.value=method;option.textContent=method ? `기존 값: ${method}` : '미설정';
        option.dataset.fundLegacyMethod='';select.append(option);
    }
    select.value=method;
}
function memberFundRequest(state, action, values) {
    const args={p_member_uuid:state.member,p_kind:state.type,p_action:action,p_row_id:state.id===null?null:Number(state.id),p_values:values,p_expected:state.source};
    const signature=JSON.stringify(args);
    if (!state.request || state.request.signature!==signature) state.request={signature,key:crypto.randomUUID()};
    return {...args,p_request_key:state.request.key};
}
function resolveMemberFundConflict(state, current) {
    if (!isCurrentMemberFund(state) || !current || typeof current!=='object') return;
    const before=memberFundSnapshot(), old=new Map(state.baseline), mine=new Map(before);
    const parts=getDonationNoteParts(current.note);
    const fresh=new Map([['fund-date',String(current.date || '')],['fund-amount',String(current.amount ?? '')],
        ['fund-note',state.type==='capital'?String(current.note || ''):parts.memo],
        ['fund-depositor',state.type==='capital'?String(current.depositor || ''):mine.get('fund-depositor')],
        ['fund-method',state.type==='donation'?String(current.method ?? ''):mine.get('fund-method')]]);
    const equal=(id,a,b)=>id==='fund-amount'?String(a??'').replace(/,/g,'')===String(b??'').replace(/,/g,''):a===b;
    const names={'fund-date':'날짜','fund-amount':'금액','fund-note':'메모','fund-depositor':'입금자명','fund-method':'입금 방식'};
    const both=Array.from(fresh).filter(([id,value])=>!equal(id,mine.get(id),old.get(id))&&!equal(id,value,old.get(id))&&!equal(id,mine.get(id),value)).map(([id])=>names[id]);
    const message='저장된 내역이 변경되었습니다.\n작성한 항목은 유지하고, 수정하지 않은 항목은 최신 값으로 맞출까요?'
        +(both.length?'\n\n함께 수정된 항목은 작성 중인 값을 사용합니다: '+both.join(', '):'');
    myConfirm(message,()=>{
        if (!isCurrentMemberFund(state) || state.busy || state.uncertain || window.frameElement?.hidden
            || !document.getElementById('fundEditorModal')?.classList.contains('show')) return;
        if (JSON.stringify(memberFundSnapshot())!==JSON.stringify(before)) return myAlert('작성 내용이 바뀌었습니다. 다시 확인해 주세요.','warning');
        if (state.type==='donation') {
            setMemberFundMethod(equal('fund-method',mine.get('fund-method'),old.get('fund-method'))?current.method:mine.get('fund-method'));
            g_fundDonationJournalCompleted=parts.completed;g_fundDonationOriginalNote=String(current.note || '');g_fundDonationInitialMemo=parts.memo;
            state.journalCompleted=parts.completed;state.journalOriginal=g_fundDonationOriginalNote;state.journalMemo=parts.memo;
            document.getElementById('fund-journal-status').innerHTML=renderDonationJournalStatus(parts.completed);
        }
        for (const [id,value] of fresh) if (id!=='fund-method' && equal(id,mine.get(id),old.get(id))) document.getElementById(id).value=value;
        state.baseline=Array.from(fresh);state.source=current;state.request=null;
        captureMemberFundDraft();syncMemberFundDraftStatus();
    });
}
function acceptMemberFundJoinDate(state, nextJoinDate) {
    const date=String(nextJoinDate || '').slice(0,10);
    if (!isCurrentMemberFund(state) || !isAdminMemberSiteProfile() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (g_current_member_row) g_current_member_row.join_date=date;
    const cached=findCachedAdminMember(state.member) || findCachedAdminMember(state.memberTextId);
    if (cached) cached.join_date=date;
    const edit=memberDetailEditState, input=document.getElementById('md-join-date');
    if (input && isCurrentMemberDetailEditor(edit)) {
        if (input.value===(new Map(edit.baseline).get('md-join-date') || '')) input.value=date;
        edit.baseline=edit.baseline.map(([id,value])=>[id,id==='md-join-date'?date:value]);
        if(input.value===date)window.ErpWorkspaceResume?.checkpoint(input);
        retainMemberDetailEdit();
    }
    if (typeof g_members!=='undefined') renderMemberTable(g_members);
}
function isCurrentMemberFund(state = memberFundState) {
    return !!state && state === memberFundState && state.owner === memberDetailOwner()
        && state.member === String(g_current_member_id || '');
}
function captureMemberFundDraft() {
    const state = memberFundState;
    if (!isCurrentMemberFund(state) || state.busy || state.completed) return;
    const values = memberFundSnapshot();
    const normalize = rows => JSON.stringify(rows.map(([key,value]) => [key,key==='fund-amount' ? value.replace(/,/g,'') : value]));
    if (state.uncertain || normalize(values) !== normalize(state.baseline)) memberFundDrafts.set(state.key, {...state,values});
    else memberFundDrafts.delete(state.key);
    syncMemberFundDraftStatus();
}
function syncMemberFundDraftStatus() {
    const label = document.getElementById('fund-draft-status'),state=memberFundState;
    if (!label) return;
    label.hidden = !state || !(state.busy || state.uncertain || memberFundDrafts.has(state.key));
    label.textContent = state?.busy ? '저장 중' : state?.uncertain ? '결과 확인 필요' : '작성 중';
    const button=document.getElementById('fund-save-button');
    if (button) button.disabled = !state || state.busy || state.uncertain || !isCurrentMemberFund(state);
    const remove=document.getElementById('btn-fund-delete');
    if (remove) remove.disabled = !state || !state.id || state.busy || state.uncertain || !isCurrentMemberFund(state);
}
function clearMemberFundDrafts() {
    memberFundDrafts.clear(); memberFundState=null;
    document.querySelectorAll('#fundEditorModal input,#fundEditorModal select,#fundEditorModal button').forEach(node=>{node.disabled=true;});
}
document.getElementById('fundEditorModal')?.addEventListener('input',captureMemberFundDraft);
document.getElementById('fundEditorModal')?.addEventListener('change',captureMemberFundDraft);
document.getElementById('fundEditorModal')?.addEventListener('hide.bs.modal',event=>{
    if (memberFundState?.busy && !memberFundState.completed) {event.preventDefault();return;}
    captureMemberFundDraft();
});

function clearMemberDetailEdits() {
    capitalImportController?.syncContext();
    invalidateMemberRelationSearches();
    invalidateDonationListRead();
    invalidateUsageLedgerRead();
    invalidateApplicationListRead();
    invalidateMemberReturnSummaryRead();
    invalidateAdminDashboardRead();
    memberFundListResume = null;
    usageLedgerPage = null;
    syncUsageLedgerUi();
    clearMemberFundDrafts();
    clearDonationGrantDraft();
    if (typeof resetMemberImportDraft === 'function') resetMemberImportDraft();
    memberDetailDrafts.clear();
    memberDetailEditState = null;
    memberDetailDraftOwner = '';
    memberConsultDrafts.clear();
    memberConsultState = null;
    memberChildDrafts.clear();
    memberChildState = null;
    clearMemberFamilyRetry();
    memberChildFields().forEach(node => { node.value = ''; node.disabled = true; });
    const childParent = document.getElementById('child-parent-name');
    if (childParent) childParent.value = '';
    const consultation = document.getElementById('md-consult-input');
    if (consultation) consultation.value = '';
    memberCreateState = null;
    resetMemberCreateForm();
    document.querySelectorAll('#memberCreateModal input,#memberCreateModal select,#memberCreateModal textarea,#memberCreateModal button')
        .forEach(node => { node.disabled = true; });
    syncMemberCreateDraftButton();
}

function memberCreateFields() {
    return Array.from(document.querySelectorAll('#memberCreateModal input,#memberCreateModal select,#memberCreateModal textarea'));
}

function memberChildFields() {
    return ['child-name','child-rrn','child-phone','child-address'].map(id => document.getElementById(id)).filter(Boolean);
}
function memberChildSnapshot() {
    return memberChildFields().map(node => [node.id,node.value]);
}
function isCurrentMemberChild(state = memberChildState, visible = false) {
    const owner = memberDetailOwner();
    return !!owner && !!state && memberChildState === state && state.owner === owner
        && state.parent === String(g_current_member_id || '')
        && state.parent === String(document.getElementById('md-uid')?.value || '')
        && (!visible || (!window.frameElement?.hidden && document.getElementById('childRegisterModal')?.classList.contains('show')));
}
function retainMemberChildDraft() {
    const state = memberChildState;
    if (!isCurrentMemberChild(state) || memberChildSaving) return;
    const current = memberChildSnapshot();
    if (JSON.stringify(current) !== JSON.stringify(state.baseline)) memberChildDrafts.set(state.key,{current,baseline:state.baseline});
    else memberChildDrafts.delete(state.key);
}
function clearMemberFamilyRetry() {
    memberFamilyRetry = null;
}
function showMemberFamilyReadFailure(read, owner, message = '가족·단체 목록을 불러오지 못했습니다.') {
    if (!isCurrentMemberDetailRead(read) || !owner || owner !== memberDetailOwner()) return {ok:false,stale:true};
    memberFamilyRetry = {read,owner,message,pending:false};
    const tbody = document.getElementById('md-family-list');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><div class="text-danger small"></div><button type="button" id="member-family-retry" class="btn btn-sm btn-outline-primary mt-2" onclick="retryMemberFamily()">목록 다시 불러오기</button></td></tr>';
    tbody.querySelector('.text-danger').textContent = message;
    return {ok:false};
}
function restoreMemberFamilyRetry() {
    const retry = memberFamilyRetry;
    if (!retry || retry.owner !== memberDetailOwner() || !isCurrentMemberDetailRead(retry.read)
        || retry.read.memberId !== String(document.getElementById('md-uid')?.value || '')
        || !document.getElementById('memberDetailModal')?.classList.contains('show')) return;
    const button = document.getElementById('member-family-retry');
    if (button && (retry.pending || button.disabled)) {
        // Called only after the workspace's fresh permission check. A new identity
        // makes any earlier gate response obsolete without re-running a writer.
        showMemberFamilyReadFailure(retry.read,retry.owner,retry.message);
    }
}
async function retryMemberFamily() {
    const retry = memberFamilyRetry;
    const current = () => !!retry && memberFamilyRetry === retry && retry.owner === memberDetailOwner() && isCurrentMemberDetailRead(retry.read)
        && retry.read.memberId === String(document.getElementById('md-uid')?.value || '')
        && !window.frameElement?.hidden && document.getElementById('memberDetailModal')?.classList.contains('show');
    if (!current() || retry.pending) return;
    retry.pending = true;
    const button = document.getElementById('member-family-retry');
    if (button) button.disabled = true;
    try {
        const gate = await window.ErpRuntimeGuard.enforce(_supabase,{moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
        if (!current()) return;
        if (!gate.ok || String(gate.runtime?.coop_id || '') !== String(g_adminMemberRuntime?.coop_id || '')) {
            return showMemberFamilyReadFailure(retry.read,retry.owner,'현재 조회 권한을 확인하지 못했습니다. 다시 확인해 주세요.');
        }
        return await loadMemberFamily(retry.read.memberId);
    } catch (error) {
        if (!current()) return;
        CoopSafeLog.error('[erp/admin_member] family list retry failed',error);
        return showMemberFamilyReadFailure(retry.read,retry.owner);
    } finally {
        if (memberFamilyRetry === retry) {
            retry.pending = false;
            if (current() && button?.isConnected) button.disabled = false;
        }
    }
}
document.getElementById('childRegisterModal')?.addEventListener('input', () => {
    if (memberChildState) ++memberChildState.revision;
    retainMemberChildDraft();
});
document.getElementById('childRegisterModal')?.addEventListener('change', () => {
    if (memberChildState) ++memberChildState.revision;
    retainMemberChildDraft();
});
document.getElementById('childRegisterModal')?.addEventListener('hide.bs.modal', event => {
    if (memberChildSaving) { event.preventDefault(); return; }
    retainMemberChildDraft();
    if (memberChildState) ++memberChildState.revision;
});

function memberCreateSnapshot() {
    return JSON.stringify(memberCreateFields().map(node => [node.id,node.type === 'checkbox' ? node.checked : node.value]));
}

function hasMemberCreateDraft() {
    const owner = memberDetailOwner();
    return !!owner && memberCreateState?.owner === owner && memberCreateSnapshot() !== memberCreateState.baseline;
}

function syncMemberCreateDraftButton() {
    const button = document.getElementById('member-create-discard');
    if (button) button.disabled = memberCreateSaving || !memberCreateState
        || memberCreateSnapshot() === memberCreateState.baseline;
}

function discardMemberCreateDraft() {
    const state = memberCreateState;
    if (memberCreateSaving || !state || state.owner !== memberDetailOwner()) return;
    const submitted = memberCreateSnapshot();
    const editor = document.getElementById('memberCreateModal');
    const origin = document.activeElement;
    document.getElementById('customConfirmModal')?.addEventListener('hidden.bs.modal', () => {
        requestAnimationFrame(() => {
            if (memberCreateSaving || memberCreateState !== state || state.owner !== memberDetailOwner()
                || window.frameElement?.hidden || document.getElementById('main-system')?.classList.contains('hidden')
                || !editor?.classList.contains('show') || editor.hasAttribute('inert')
                || getOpenAdminMemberModals().at(-1) !== editor) return;
            const visible = node => node?.isConnected && !node.disabled && node.getClientRects().length;
            const target = editor.contains(origin) && visible(origin) ? origin
                : Array.from(editor.querySelectorAll('input:not([type="hidden"]),select,textarea,button')).find(visible);
            (target || editor).focus({preventScroll:true});
        });
    }, {once:true});
    myConfirm('이 초안을 버릴까요?', () => {
        if (memberCreateSaving || memberCreateState !== state || state.owner !== memberDetailOwner()) return;
        if (memberCreateSnapshot() !== submitted) return myAlert('입력 내용이 바뀌었습니다. 다시 확인해 주세요.', 'warning');
        resetMemberCreateForm();
        state.baseline = memberCreateSnapshot();
        memberCreateFields().forEach(node => window.ErpWorkspaceResume?.checkpoint(node));
        syncMemberCreateDraftButton();
    });
}

function bindMemberCreateModalKeyboard() {
    const editor = document.getElementById('memberCreateModal');
    if (!editor || editor.dataset.keyboardBound === '1') return;
    editor.dataset.keyboardBound = '1';
    editor.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !editor.classList.contains('show') || editor.hasAttribute('inert')
            || getOpenAdminMemberModals().at(-1) !== editor) return;
        const controls = Array.from(editor.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[tabindex]'))
            .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
        const first = controls[0], last = controls.at(-1), active = document.activeElement;
        if (!first || (event.shiftKey ? active === first || active === editor : active === last || active === editor)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus({preventScroll:true});
        }
    });
}
bindMemberCreateModalKeyboard();

function retainMemberConsultEdit() {
    const state = memberConsultState;
    if (!state || state.owner !== memberDetailOwner() || state.member !== String(g_current_member_id || '')) return;
    const value = document.getElementById('md-consult-input')?.value || '';
    if (value) memberConsultDrafts.set(state.key, value);
    else memberConsultDrafts.delete(state.key);
}

function initializeMemberConsultEdit(owner, member) {
    const key = JSON.stringify([owner,String(member)]);
    memberConsultState = {key,owner,member:String(member)};
    document.getElementById('md-consult-input').value = memberConsultDrafts.get(key) || '';
    const button = document.getElementById('member-consult-submit');
    if (button) button.disabled = memberConsultPending.has(key);
}

document.getElementById('md-consult-input')?.addEventListener('input', retainMemberConsultEdit);
document.getElementById('memberCreateModal')?.addEventListener('input', syncMemberCreateDraftButton);
document.getElementById('memberCreateModal')?.addEventListener('change', syncMemberCreateDraftButton);
document.getElementById('memberCreateModal')?.addEventListener('hide.bs.modal', event => {
    if (memberCreateSaving) event.preventDefault();
});

function memberDetailOwner() {
    const auth = String(adminCertificateAuthId || '');
    const coop = String(g_adminMemberRuntime?.coop_id || '');
    const allowed = auth && coop && g_adminMemberRuntime?.is_active !== false
        && canAccessAdminMemberTab('members');
    const owner = allowed ? JSON.stringify([auth, coop]) : '';
    if (owner !== memberDetailDraftOwner) {
        clearMemberDetailEdits();
        memberDetailDraftOwner = owner;
    }
    return owner;
}

function memberDetailFields() {
    return Array.from(document.querySelectorAll('#md-tab-basic input,#md-tab-basic select,#md-tab-basic textarea'))
        .filter(node => node.type !== 'file' && (node.id || node.type === 'checkbox')
            && !node.closest('#md-notification-status,#md-child-direct,#md-guardian'));
}

function memberDetailSnapshot() {
    return memberDetailFields().map(node => [node.id || 'badge:' + node.value,
        node.type === 'checkbox' ? node.checked : node.value]);
}

function applyMemberDetailSnapshot(values) {
    const snapshot = new Map(values);
    for (const node of memberDetailFields()) {
        const key = node.id || 'badge:' + node.value;
        if (!snapshot.has(key)) continue;
        if (node.type === 'checkbox') node.checked = snapshot.get(key) === true;
        else node.value = snapshot.get(key);
    }
}

function isCurrentMemberDetailEditor(state = memberDetailEditState) {
    const owner = memberDetailOwner();
    return !!state && memberDetailEditState === state && !!owner
        && state.owner === owner && state.member === String(g_current_member_id || '');
}

function retainMemberDetailEdit() {
    const state = memberDetailEditState;
    if (!isCurrentMemberDetailEditor(state) || memberDetailSaving) return;
    const current = memberDetailSnapshot();
    if (state.editing && JSON.stringify(current) !== JSON.stringify(state.baseline)) {
        memberDetailDrafts.set(state.key, {current});
    } else memberDetailDrafts.delete(state.key);
}

function initializeMemberDetailEdit(owner, member) {
    if (!owner || owner !== memberDetailOwner()) return;
    const key = JSON.stringify([owner, String(member)]);
    const state = {key, owner, member:String(member), baseline:memberDetailSnapshot(), editing:false};
    memberDetailEditState = state;
    const draft = memberDetailDrafts.get(key);
    if (draft) {
        applyMemberDetailSnapshot(draft.current);
        toggleEditMode(true);
    }
}

function cancelMemberBasicEdit() {
    const state = memberDetailEditState;
    if (memberDetailSaving || !isCurrentMemberDetailEditor(state)) return;
    applyMemberDetailSnapshot(state.baseline);
    MemberInformation.renderBankAccountStatus(document.getElementById('md-bank-entered'),
        {account_num_display:new Map(state.baseline).get('md-bank-account') || ''});
    memberDetailDrafts.delete(state.key);
    toggleEditMode(false);
    memberDetailFields().forEach(node => window.ErpWorkspaceResume?.checkpoint(node));
}

function acceptMemberBasicSave(state, submitted, updates, includeBadges = false, savedJoinDetails = null) {
    if (!isCurrentMemberDetailEditor(state)) return;
    const old = new Map(state.baseline);
    const savedEmail = updates.p_email || old.get('md-email-original') || '';
    const joinValue = (key, input) => savedJoinDetails && Object.prototype.hasOwnProperty.call(savedJoinDetails, key)
        ? String(savedJoinDetails[key] || '') : String(updates.p_join_details?.[key] || old.get(input) || '');
    const savedJoinDate = joinValue('join_date', 'md-join-date');
    const savedJoinCategory = joinValue('join_category', 'md-join-category');
    const account = String(updates.p_bank_account || '').replace(/[\s-]/g, '');
    const mask = updates.p_bank_account
        ? (/^[0-9]{8,30}$/.test(account) ? '****' + account.slice(-4) : '****')
        : (old.get('md-bank-account') || '');
    const badgeIds = new Set(Array.from(document.querySelectorAll('#member-badge-checkboxes input')).map(n => n.id || 'badge:' + n.value));
    state.baseline = submitted.map(([key,value]) => [key,
        key === 'md-bank-account' ? mask : key === 'md-rrn' ? ''
        : (key === 'md-email' || key === 'md-email-original') ? savedEmail
        : key === 'md-join-date' ? savedJoinDate : key === 'md-join-category' ? savedJoinCategory
        : (!includeBadges && badgeIds.has(key) ? old.get(key) : value)]);
    const current = memberDetailSnapshot().map(([key,value]) => [key,
        key === 'md-bank-account' ? mask : key === 'md-rrn' ? ''
        : (key === 'md-email' || key === 'md-email-original') ? savedEmail
        : key === 'md-join-date' ? savedJoinDate : key === 'md-join-category' ? savedJoinCategory : value]);
    applyMemberDetailSnapshot(current);
    MemberInformation.renderBankAccountStatus(document.getElementById('md-bank-entered'), {account_num_display:mask});
    // Keep the authorized local row consistent until its usual list refresh completes.
    const fields = {name:'p_name',phone:'p_phone',email:'p_email',address:'p_address',bank_name:'p_bank_name',
        account_holder:'p_bank_owner',status:'p_status',member_type:'p_member_type',admin_memo:'p_admin_memo',
        corp_number:'p_corp_number',business_number:'p_business_number',representative_name:'p_representative_name',
        contact_name:'p_contact_name',contact_position:'p_contact_position',preferred_name:'p_preferred_name',preferred_name_position:'p_preferred_name_position'};
    if (g_current_member_row) {
        for (const [key,param] of Object.entries(fields)) g_current_member_row[key] = key === 'email' ? (savedEmail || null) : updates[param];
        g_current_member_row.account_number = mask || null;
        g_current_member_row.account_num_display = mask || null;
        g_current_member_row.join_date = savedJoinDate || null;
        g_current_member_row.join_category = savedJoinCategory || null;
    }
}

window.addEventListener('beforeunload', event => {
    retainMemberDetailEdit();
    retainMemberConsultEdit();
    retainMemberChildDraft();
    captureMemberFundDraft();
    if (memberDetailOwner() && (memberFundDrafts.size || memberFundState?.busy || memberFundState?.uncertain || memberDetailSaving || memberDetailDrafts.size || memberConsultDrafts.size
        || memberConsultPending.size || memberCreateSaving || hasMemberCreateDraft() || memberChildSaving || memberChildDrafts.size
        || hasDonationGrantDraft() || hasDonationBatchDraft() || (typeof hasMemberImportDraft === 'function' && hasMemberImportDraft()))) {
        event.preventDefault();
        event.returnValue = '';
    }
});
let g_member_detail_revision = 0;
let g_member_detail_loading = false;
const g_member_detail_requests = {};
const g_member_fund_status = {};

function beginMemberDetailRead(section, memberId = g_current_member_id) {
    const target = String(memberId || '');
    if (target !== String(g_current_member_id || '')) {
        return { section, request: null, revision: g_member_detail_revision, memberId: target };
    }
    const request = (g_member_detail_requests[section] || 0) + 1;
    g_member_detail_requests[section] = request;
    return { section, request, revision: g_member_detail_revision, memberId: target };
}

function isCurrentMemberDetailRead(read) {
    return read.request !== null && read.revision === g_member_detail_revision
        && read.request === g_member_detail_requests[read.section]
        && read.memberId === String(g_current_member_id || '');
}

function setMemberDetailReadBusy(busy) {
    const modal = document.getElementById('memberDetailModal');
    if (!modal) return;
    modal.setAttribute('aria-busy', String(busy));
    modal.querySelectorAll('.modal-body,.modal-footer').forEach(el => { el.inert = busy; });
}

document.getElementById('memberDetailModal')?.addEventListener('hide.bs.modal', event => {
    if (memberDetailSaving || memberFundState?.busy || memberChildSaving) { event.preventDefault(); return; }
    invalidateMemberRelationSearches();
    retainMemberChildDraft();
    if (memberChildState) ++memberChildState.revision;
    captureMemberFundDraft();
    retainMemberDetailEdit();
    retainMemberConsultEdit();
    window.MemberNotificationAdmin?.clearDetail();
    window.ContributionCertPreview?.clear();
    ++g_member_detail_revision;
    setMemberDetailReadBusy(false);
    if (g_member_detail_loading) {
        g_member_detail_loading = false;
        if (typeof showLoading === 'function') showLoading(false);
    }
});

function normalizeAdminMemberRow(row, totalCapital) {
    if (!row) return null;

    return {
        ...row,
        total_capital: Number(totalCapital || row.total_capital || 0),
        account_number: MemberInformation.bankAccountDisplay(row) || null,
        birth_date: row.birth_date || null
    };
}

function getAdminMemberDisplayName(member) {
    const name = String(member?.name || '').trim();
    const preferredName = String(member?.preferred_name || '').trim();
    if (!preferredName || String(member?.member_type || '').includes('단체')) return name;
    return member?.preferred_name_position === 'after'
        ? `${name} ${preferredName}`.trim()
        : `${preferredName} ${name}`.trim();
}

function findCachedAdminMember(id) {
    const safeId = String(id || '').trim();
    if (!safeId || !Array.isArray(g_members)) return null;

    return g_members.find(x => String(x.id || x.member_uid || x.uid || '') === safeId)
        || g_members.find(x => String(x.member_id || '') === safeId)
        || null;
}

function upsertCachedAdminMember(row) {
    if (!row) return null;
    if (!Array.isArray(g_members)) g_members = [];

    const rowUid = String(row.id || row.member_uid || row.uid || '');
    const rowMemberId = String(row.member_id || '');
    const existingIndex = g_members.findIndex(x => {
        const xUid = String(x.id || x.member_uid || x.uid || '');
        const xMemberId = String(x.member_id || '');
        return (rowUid && xUid === rowUid) || (rowMemberId && xMemberId === rowMemberId);
    });

    if (existingIndex >= 0) {
        g_members[existingIndex] = { ...g_members[existingIndex], ...row };
        return g_members[existingIndex];
    }

    g_members.push(row);
    return row;
}

function syncMemberDetailTypeLayout() {
    const typeStr = document.getElementById('md-type')?.value || '개인';
    const isGroup = String(typeStr).includes('단체');
    const areaInd = document.getElementById('area-individual');
    const areaGrp = document.getElementById('area-group');
    const isEdit = document.getElementById('btn-save-group')?.style.display !== 'none';

    if (areaInd) areaInd.style.display = isGroup ? 'none' : 'block';
    if (areaGrp) areaGrp.style.display = isGroup ? 'block' : 'none';

    const nameLabel = document.getElementById('md-name-label');
    const phoneLabel = document.getElementById('md-phone-label');
    const emailLabel = document.getElementById('md-email-label');
    if (nameLabel) nameLabel.textContent = isGroup ? '단체명' : '이름(입금·세무 기준)';
    if (phoneLabel) phoneLabel.textContent = isGroup ? '담당자 연락처' : '연락처';
    if (emailLabel) emailLabel.textContent = isGroup ? '담당자 이메일' : '이메일';

    const preferredNameGroup = document.getElementById('md-preferred-name-group');
    const preferredPositionGroup = document.getElementById('md-preferred-position-group');
    if (preferredNameGroup) preferredNameGroup.style.display = isGroup ? 'none' : '';
    if (preferredPositionGroup) preferredPositionGroup.style.display = isGroup ? 'none' : '';

    ['md-corp-num', 'md-biz-num'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.disabled = !(isGroup && isEdit);
        input.classList.toggle('bg-light', !isGroup || !isEdit);
    });
}

async function resolveMemberAccountManagerLabel(member) {
    if (!member?.manager_id) return '미연결';

    if (member.manager_name || member.manager_member_id) {
        const name = member.manager_name || '이름 없음';
        const memberId = member.manager_member_id ? ` (${member.manager_member_id})` : '';
        return `${name}${memberId}`;
    }

    try {
        const { data, error } = await scopeAdminTenant(_supabase
            .from('coop_members')
            .select('id, name, member_id'))
            .eq('id', member.manager_id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return '연결 계정 확인 불가';
        return `${data.name || '이름 없음'}${data.member_id ? ` (${data.member_id})` : ''}`;
    } catch (error) {
        CoopSafeLog.error("단체 계정 관리자 조회 실패:", error);
        return '연결 계정 확인 실패';
    }
}

function fetchAdminMemberCapitalRows(memberTextId) {
    const safeMemberTextId = String(memberTextId || '').trim();
    if (!safeMemberTextId || ['ID없음', '-'].includes(safeMemberTextId)) {
        return Promise.resolve({ data: [], error: null });
    }

    if (isAdminMemberSiteProfile()) {
        return _supabase.rpc('admin_list_member_capital_secure', {
            p_member_text_id: safeMemberTextId
        });
    }

    return _supabase
        .from('ref_members')
        .select('*')
        .eq('member_id', safeMemberTextId)
        .order('deposit_date', { ascending: false });
} // End of fetchAdminMemberCapitalRows

async function fetchAdminMemberDetailRow(id) {
    const safeId = String(id || '').trim();
    if (!safeId) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeId);
    let q = scopeAdminTenant(_supabase
        .from('coop_members')
        .select(ADMIN_MEMBER_SELECT_COLUMNS));

    q = isUuid ? q.eq('id', safeId) : q.eq('member_id', safeId);

    const { data, error } = await q.maybeSingle();
    if (error) {
        CoopSafeLog.error("조합원 상세 직접 조회 실패:", error);
        throw error;
    }
    if (!data) return null;

    let totalCapital = Number(data.total_capital || 0);
    const memberUid = data.id || data.member_uid || data.uid || null;
    if (isAdminMemberSiteProfile() && data.member_id) {
        const { data: capitalRows, error: capitalError } = await fetchAdminMemberCapitalRows(data.member_id);
        if (!capitalError) {
            totalCapital = calculateMemberFundTotal(capitalRows);
        } else {
            CoopSafeLog.error("조합원 상세 출자금 보안 조회 실패:", capitalError);
        }
    } else if (memberUid) {
        const { data: asset, error: assetError } = await _supabase
            .from('view_my_assets')
            .select('total_capital')
            .eq('member_uid', memberUid)
            .maybeSingle();

        if (!assetError && asset) {
            totalCapital = Number(asset.total_capital || 0);
        } else if (assetError) {
            CoopSafeLog.error("조합원 상세 출자금 직접 조회 실패:", assetError);
        }
    }

    return normalizeAdminMemberRow(data, totalCapital);
}

let adminMemberParticipationLoadedFor = null;
let adminMemberParticipationData = { events:[] };
let adminMemberParticipationActiveTab = 'EDUCATION';
let adminMemberQuizLoadedFor = null;
let adminMemberQuizData = { attempts:[] };

function adminMemberParticipationTypeLabel(type) {
    if (type === 'BOARD') return '이사회';
    if (type === 'DELEGATE_ASSEMBLY') return '대의원 총회';
    return '교육';
} // End of adminMemberParticipationTypeLabel

function adminMemberParticipationStatusLabel(status, eventType, isTarget) {
    if (status === 'ATTENDED' && eventType !== 'EDUCATION' && isTarget === false) return '배석';
    if (status === 'ATTENDED') return '참석';
    if (status === 'ABSENT') return '불참';
    if (status === 'EXCUSED') return '사유 불참';
    return '확인 전';
} // End of adminMemberParticipationStatusLabel

function adminMemberParticipationStatusClass(status, eventType, isTarget) {
    if (status === 'ATTENDED' && eventType !== 'EDUCATION' && isTarget === false) return 'admin-participation-status-observer';
    if (status === 'ATTENDED') return 'admin-participation-status-attended';
    if (status === 'ABSENT') return 'admin-participation-status-absent';
    if (status === 'EXCUSED') return 'admin-participation-status-excused';
    return 'admin-participation-status-pending';
} // End of adminMemberParticipationStatusClass

function syncAdminMemberParticipationTabs() {
    const tabMap = {
        EDUCATION: document.getElementById('md-participation-tab-education'),
        MEETING: document.getElementById('md-participation-tab-meeting'),
        QUIZ: document.getElementById('md-participation-tab-quiz')
    };
    Object.entries(tabMap).forEach(function([tabName, tabElement]) {
        const isActive = adminMemberParticipationActiveTab === tabName;
        tabElement?.classList.toggle('active', isActive);
        tabElement?.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tabElement?.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    document.getElementById('md-participation-list')?.setAttribute(
        'aria-labelledby',
        `md-participation-tab-${adminMemberParticipationActiveTab.toLowerCase()}`
    );
} // End of syncAdminMemberParticipationTabs

function switchAdminMemberParticipationTab(tab) {
    adminMemberParticipationActiveTab = ['EDUCATION', 'MEETING', 'QUIZ'].includes(tab) ? tab : 'EDUCATION';
    syncAdminMemberParticipationTabs();
    if (adminMemberParticipationActiveTab === 'QUIZ') {
        void loadAdminMemberQuizHistory();
        return;
    }
    renderAdminMemberParticipationHistory(adminMemberParticipationData);
} // End of switchAdminMemberParticipationTab

function reloadAdminMemberParticipationActiveTab() {
    if (adminMemberParticipationActiveTab === 'QUIZ') {
        void loadAdminMemberQuizHistory(true);
        return;
    }
    void loadAdminMemberParticipationHistory(true);
} // End of reloadAdminMemberParticipationActiveTab

function handleAdminMemberParticipationTabKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [
        document.getElementById('md-participation-tab-education'),
        document.getElementById('md-participation-tab-meeting'),
        document.getElementById('md-participation-tab-quiz')
    ].filter(Boolean);
    if (!tabs.length) return;
    const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
    const targetIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? tabs.length - 1
            : (currentIndex + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    const targetTab = ({
        'md-participation-tab-education':'EDUCATION',
        'md-participation-tab-meeting':'MEETING',
        'md-participation-tab-quiz':'QUIZ'
    })[tabs[targetIndex]?.id] || 'EDUCATION';
    switchAdminMemberParticipationTab(targetTab);
    tabs[targetIndex]?.focus();
} // End of handleAdminMemberParticipationTabKeydown

function renderAdminMemberParticipationHistory(data) {
    const list = document.getElementById('md-participation-list');
    const summary = document.getElementById('md-participation-summary');
    const events = Array.isArray(data?.events) ? data.events : [];
    const educationEvents = events.filter(function(event) { return event.event_type === 'EDUCATION'; });
    const meetingEvents = events.filter(function(event) { return event.event_type !== 'EDUCATION'; });
    const educationAttendedCount = educationEvents.filter(function(event) { return String(event.attendance_status) === 'ATTENDED'; }).length;
    const meetingAttendedCount = meetingEvents.filter(function(event) {
        return String(event.attendance_status) === 'ATTENDED' && event.is_target !== false;
    }).length;
    const meetingObserverCount = meetingEvents.filter(function(event) {
        return String(event.attendance_status) === 'ATTENDED' && event.is_target === false;
    }).length;
    const educationCount = document.getElementById('md-participation-education-count');
    const meetingCount = document.getElementById('md-participation-meeting-count');
    if (educationCount) educationCount.textContent = `참석 ${educationAttendedCount.toLocaleString('ko-KR')}회`;
    if (meetingCount) meetingCount.textContent = `참석 ${meetingAttendedCount.toLocaleString('ko-KR')}회 · 배석 ${meetingObserverCount.toLocaleString('ko-KR')}회`;
    if (adminMemberParticipationActiveTab === 'QUIZ') {
        renderAdminMemberQuizHistory(adminMemberQuizData);
        return;
    }
    const visibleEvents = adminMemberParticipationActiveTab === 'EDUCATION' ? educationEvents : meetingEvents;
    if (summary) {
        summary.textContent = adminMemberParticipationActiveTab === 'EDUCATION'
            ? `교육 참석 ${educationAttendedCount.toLocaleString('ko-KR')}회 · 등록 ${educationEvents.length.toLocaleString('ko-KR')}건`
            : `회의 참석 ${meetingAttendedCount.toLocaleString('ko-KR')}회 · 배석 ${meetingObserverCount.toLocaleString('ko-KR')}회 · 등록 ${meetingEvents.length.toLocaleString('ko-KR')}건`;
    }
    if (!list) return;
    if (visibleEvents.length === 0) {
        list.innerHTML = `<div class="text-center text-muted py-5">등록된 ${adminMemberParticipationActiveTab === 'EDUCATION' ? '교육' : '회의'} 참여 이력이 없습니다.</div>`;
        return;
    }
    list.innerHTML = visibleEvents.map(function(event) {
        const status = String(event.attendance_status || 'PENDING');
        const timeText = event.ends_at
            ? `${formatAdminMemberKstDateTime(event.starts_at)} ~ ${formatAdminMemberKstDateTime(event.ends_at)}`
            : formatAdminMemberKstDateTime(event.starts_at);
        const signatureHtml = event.signature_required_snapshot
            ? (event.signature_signed_at
                ? `<span class="badge bg-success-subtle text-success-emphasis border">서명 완료 · ${escapeHtml(formatAdminMemberKstDateTime(event.signature_signed_at))}</span>`
                : '<span class="badge bg-warning-subtle text-warning-emphasis border">미서명</span>')
            : '';
        const educationHtml = event.event_type === 'EDUCATION'
            ? `<div class="small text-secondary mt-2">${event.instructor ? `<strong>강사</strong> ${escapeHtml(event.instructor)}<br>` : ''}${event.education_content ? `<strong>교육 내용</strong> ${escapeHtml(event.education_content)}` : ''}</div>`
            : '';
        const actualAttendeeHtml = event.actual_attendee_name
            ? `<div class="small text-secondary mt-2"><strong>단체 실제 참석자</strong> ${escapeHtml(event.actual_attendee_name)}</div>`
            : '';
        return `
            <article class="admin-participation-history-item">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div><div class="small text-muted mb-1">${escapeHtml(adminMemberParticipationTypeLabel(event.event_type))}</div><div class="fw-bold">${escapeHtml(event.title || '-')}</div></div>
                    <span class="admin-participation-status ${adminMemberParticipationStatusClass(status, event.event_type, event.is_target)}">${adminMemberParticipationStatusLabel(status, event.event_type, event.is_target)}</span>
                </div>
                <div class="admin-participation-history-meta"><span>🗓️ ${escapeHtml(timeText)}</span><span>📍 ${escapeHtml(event.location || '-')}</span>${event.role_snapshot ? `<span>직책 ${escapeHtml(event.role_snapshot)}</span>` : ''}</div>
                ${educationHtml}${actualAttendeeHtml}${signatureHtml ? `<div class="mt-2">${signatureHtml}</div>` : ''}
            </article>`;
    }).join('');
} // End of renderAdminMemberParticipationHistory

async function loadAdminMemberParticipationHistory(forceReload = false) {
    const memberUuid = g_current_member_id;
    const list = document.getElementById('md-participation-list');
    const summary = document.getElementById('md-participation-summary');
    if (!memberUuid || !list || !summary) return;
    if (!forceReload && String(adminMemberParticipationLoadedFor) === String(memberUuid)) return;
    const read = beginMemberDetailRead('participation', memberUuid);
    summary.textContent = '불러오는 중...';
    list.innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2"></span>불러오는 중...</div>';
    try {
        const { data, error } = await _supabase.rpc('participation_admin_get_member_history', { p_member_uuid:memberUuid });
        if (error) throw error;
        if (!isCurrentMemberDetailRead(read)) return;
        adminMemberParticipationLoadedFor = memberUuid;
        adminMemberParticipationData = data || { events:[] };
        renderAdminMemberParticipationHistory(adminMemberParticipationData);
    } catch (error) {
        if (!isCurrentMemberDetailRead(read)) return;
        CoopSafeLog.error("loadAdminMemberParticipationHistory failed:", error);
        summary.textContent = '조회 실패';
        list.innerHTML = `<div class="text-center text-danger py-5">${escapeHtml(error?.message || '교육·회의 참여 이력을 불러오지 못했습니다.')}</div>`;
    }
} // End of loadAdminMemberParticipationHistory

function formatAdminMemberQuizPercent(value) {
    return `${Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits:1 })}%`;
} // End of formatAdminMemberQuizPercent

function renderAdminMemberQuizHistory(data) {
    const list = document.getElementById('md-participation-list');
    const summary = document.getElementById('md-participation-summary');
    const count = document.getElementById('md-participation-quiz-count');
    if (!list || !summary) return;

    const attempts = Array.isArray(data?.attempts) ? data.attempts : [];
    const completedAttempts = Number(data?.completed_attempts || 0);
    const answerCount = Number(data?.answer_count || 0);
    const correctRate = formatAdminMemberQuizPercent(data?.correct_rate);
    const perfectAttempts = Number(data?.perfect_attempts || 0);
    const inProgressAttempts = Number(data?.in_progress_attempts || 0);
    if (count) count.textContent = `완료 ${completedAttempts.toLocaleString('ko-KR')}회 · 정답률 ${correctRate}`;
    summary.textContent = `퀴즈 완료 ${completedAttempts.toLocaleString('ko-KR')}회 · 누적 답변 ${answerCount.toLocaleString('ko-KR')}회 · 정답률 ${correctRate}`;

    const latestCompleted = data?.latest_completed_at
        ? formatAdminMemberKstDateTime(data.latest_completed_at)
        : '아직 없음';
    const summaryHtml = `
        <div class="admin-member-quiz-summary" aria-label="선택한 조합원의 퀴즈 참여 요약">
            <div class="admin-member-quiz-stat"><span>완료</span><strong>${completedAttempts.toLocaleString('ko-KR')}회</strong></div>
            <div class="admin-member-quiz-stat"><span>누적 답변</span><strong>${answerCount.toLocaleString('ko-KR')}회</strong></div>
            <div class="admin-member-quiz-stat"><span>정답률</span><strong>${escapeHtml(correctRate)}</strong></div>
            <div class="admin-member-quiz-stat"><span>만점</span><strong>${perfectAttempts.toLocaleString('ko-KR')}회</strong></div>
            <div class="admin-member-quiz-stat"><span>진행 중</span><strong>${inProgressAttempts.toLocaleString('ko-KR')}회</strong></div>
            <div class="admin-member-quiz-stat"><span>최근 완료</span><strong>${escapeHtml(latestCompleted)}</strong></div>
        </div>`;

    if (attempts.length === 0) {
        list.innerHTML = `${summaryHtml}<div class="text-center text-muted py-5">완료한 퀴즈 기록이 없습니다.</div>`;
        return;
    }

    const attemptHtml = attempts.map(function(attempt) {
        const totalQuestions = Number(attempt.total_questions || 0);
        const correctCount = Number(attempt.correct_count || 0);
        const reviewCount = Number(attempt.review_count || 0);
        const hallOfFame = attempt.hall_of_fame_consent === true
            ? '<span class="badge bg-warning-subtle text-warning-emphasis border">🏆 명예의 전당 공개 동의</span>'
            : attempt.is_perfect
                ? '<span class="badge bg-light text-secondary border">명예의 전당 미동의</span>'
                : '';
        const challenge = attempt.challenge_selected === true
            ? '<span class="badge bg-info-subtle text-info-emphasis border">✨ 도전문제 포함</span>'
            : '';
        return `
            <article class="admin-participation-history-item">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div><div class="small text-muted mb-1">${escapeHtml(formatAdminMemberKstDateTime(attempt.completed_at))}</div><div class="fw-bold">${correctCount.toLocaleString('ko-KR')} / ${totalQuestions.toLocaleString('ko-KR')} 정답</div></div>
                    <span class="admin-participation-status ${attempt.is_perfect ? 'admin-participation-status-attended' : 'admin-participation-status-pending'}">${attempt.is_perfect ? '만점' : escapeHtml(formatAdminMemberQuizPercent(attempt.correct_rate))}</span>
                </div>
                <div class="admin-member-quiz-attempt-meta"><span>답변 ${Number(attempt.answer_count || 0).toLocaleString('ko-KR')}개</span><span>복습 문제 ${reviewCount.toLocaleString('ko-KR')}개</span>${attempt.challenge_count ? `<span>도전문제 ${Number(attempt.challenge_count).toLocaleString('ko-KR')}개</span>` : ''}</div>
                ${hallOfFame || challenge ? `<div class="d-flex flex-wrap gap-2 mt-2">${hallOfFame}${challenge}</div>` : ''}
            </article>`;
    }).join('');
    list.innerHTML = `${summaryHtml}<div class="small text-muted mt-3">최근 완료 기록 ${attempts.length.toLocaleString('ko-KR')}건${data?.history_limit ? ` · 최대 ${Number(data.history_limit).toLocaleString('ko-KR')}건 표시` : ''}</div>${attemptHtml}`;
} // End of renderAdminMemberQuizHistory

async function loadAdminMemberQuizHistory(forceReload = false) {
    const memberUuid = g_current_member_id;
    const list = document.getElementById('md-participation-list');
    const summary = document.getElementById('md-participation-summary');
    if (!memberUuid || !list || !summary) return;
    const read = beginMemberDetailRead('participation', memberUuid);
    if (!forceReload && String(adminMemberQuizLoadedFor) === String(memberUuid)) {
        renderAdminMemberQuizHistory(adminMemberQuizData);
        return;
    }
    summary.textContent = '퀴즈 참여 기록을 불러오는 중...';
    list.innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2"></span>퀴즈 참여 기록을 불러오는 중...</div>';
    try {
        const { data, error } = await _supabase.rpc('quiz_admin_get_member_detail', { p_member_id:memberUuid });
        if (error) throw error;
        if (!isCurrentMemberDetailRead(read)) return;
        adminMemberQuizLoadedFor = memberUuid;
        adminMemberQuizData = data || { attempts:[] };
        renderAdminMemberQuizHistory(adminMemberQuizData);
    } catch (error) {
        if (!isCurrentMemberDetailRead(read)) return;
        CoopSafeLog.error("loadAdminMemberQuizHistory failed:", error);
        summary.textContent = '퀴즈 참여 기록 조회 실패';
        list.innerHTML = `<div class="text-center text-danger py-5">${escapeHtml(error?.message || '퀴즈 참여 기록을 불러오지 못했습니다.')}</div>`;
    }
} // End of loadAdminMemberQuizHistory

async function openMemberDetail(id) {
    if (memberDetailSaving || memberFundState?.busy || memberChildSaving) return;
    const editorOwner = memberDetailOwner();
    if (!editorOwner) return;
    invalidateMemberRelationSearches();
    captureMemberFundDraft();
    const fundModal=document.getElementById('fundEditorModal');
    if (fundModal?.classList.contains('show')) bootstrap.Modal.getInstance(fundModal)?.hide();
    retainMemberDetailEdit();
    retainMemberConsultEdit();
    retainMemberChildDraft();
    if (memberChildState) ++memberChildState.revision;
    window.ContributionCertPreview?.clear();
    const requestRevision = ++g_member_detail_revision;
    setMemberDetailReadBusy(true);
    try {
    // 1. 데이터 매칭
    let m = findCachedAdminMember(id);

    if (!m) {
        try {
            g_member_detail_loading = true;
            if (typeof showLoading === 'function') showLoading(true);
            m = await fetchAdminMemberDetailRow(id);
            if (requestRevision !== g_member_detail_revision || editorOwner !== memberDetailOwner()) return;
            if (m) m = upsertCachedAdminMember(m);
        } catch (err) {
            if (requestRevision !== g_member_detail_revision) return;
            const message = err?.message || err;
            return myAlert("데이터를 불러오지 못했습니다: " + message, 'error');
        } finally {
            if (requestRevision === g_member_detail_revision && typeof showLoading === 'function') showLoading(false);
        }
    }

    if (editorOwner !== memberDetailOwner()) return;
    if (!m) return myAlert("데이터를 찾을 수 없습니다.", 'error');
    if (m.coop_id && String(m.coop_id) !== String(g_adminMemberRuntime?.coop_id)) return;

    const memberUid = m.id || m.member_uid || m.uid || null;
    if (!memberUid) return myAlert("조합원 UUID를 찾을 수 없습니다.", 'error');

    const typeStr = m.member_type || m.type || '개인';
    const isGroup = String(typeStr).includes('단체');
    let accountManagerLabel = '-';
    let myBadgeCodes = [];
    if (isGroup) {
        accountManagerLabel = await resolveMemberAccountManagerLabel(m);
        if (requestRevision !== g_member_detail_revision) return;
    }
    if (canManageAdminMemberIndividualBadges()) {
        await ensureBadgesReady();
        if (requestRevision !== g_member_detail_revision) return;
        if (!g_badges || g_badges.length === 0) {
            const badges = await Badges.getAll(_supabase);
            if (requestRevision !== g_member_detail_revision) return;
            g_badges = badges;
        }
        const { data: myRows, error: badgeError } = await _supabase
            .from('coop_member_badges').select('badge_id').eq('member_uid', memberUid);
        if (requestRevision !== g_member_detail_revision) return;
        if (myRows && !badgeError) {
            myBadgeCodes = myRows.map(row => g_badges.find(b => b.id == row.badge_id)?.code)
                .filter(code => code != null);
        }
    }

    if (editorOwner !== memberDetailOwner()) return;
    g_current_member_id = memberUid;
    g_current_member_row = m;
    adminMemberParticipationLoadedFor = null;
    adminMemberParticipationData = { events:[] };
    adminMemberParticipationActiveTab = 'EDUCATION';
    adminMemberQuizLoadedFor = null;
    adminMemberQuizData = { attempts:[] };
    syncAdminMemberParticipationTabs();
    const participationSummaryEl = document.getElementById('md-participation-summary');
    const participationListEl = document.getElementById('md-participation-list');
    const participationEducationCountEl = document.getElementById('md-participation-education-count');
    const participationMeetingCountEl = document.getElementById('md-participation-meeting-count');
    const participationQuizCountEl = document.getElementById('md-participation-quiz-count');
    if (participationSummaryEl) participationSummaryEl.textContent = '탭을 선택하면 불러옵니다.';
    if (participationListEl) participationListEl.innerHTML = '<div class="text-center text-muted py-5">교육·회의·퀴즈 참여 이력을 불러오려면 이 탭을 선택하세요.</div>';
    if (participationEducationCountEl) participationEducationCountEl.textContent = '참석 -회';
    if (participationMeetingCountEl) participationMeetingCountEl.textContent = '참석 -회 · 배석 -회';
    if (participationQuizCountEl) participationQuizCountEl.textContent = '완료 -회 · 정답률 -%';

    // 2. UI 초기화 & 데이터 바인딩
    document.getElementById('md-uid').value = memberUid;
    document.getElementById('md-title').innerText = `${getAdminMemberDisplayName(m) || m.name} 님 상세`;
    document.getElementById('md-id-text').innerText = m.member_id || 'ID없음';

    document.getElementById('md-type-badge').innerText = typeStr;

    // 폼 값 채우기
    document.getElementById('md-name').value = m.name || '';
    document.getElementById('md-preferred-name').value = m.preferred_name || '';
    document.getElementById('md-preferred-name-position').value = m.preferred_name_position === 'after' ? 'after' : 'before';
    document.getElementById('md-phone').value = m.phone || '';
    document.getElementById('md-email').value = m.email || '';
    document.getElementById('md-email-original').value = m.email || '';
    document.getElementById('md-status').value = m.status || '';
    document.getElementById('md-join-date').value = String(m.join_date || '').slice(0, 10);
    document.getElementById('md-join-category').value = m.join_category || '';
    const currentTarget = () => requestRevision === g_member_detail_revision ? g_current_member_id : null;
    void window.GuardianAdmin?.load(_supabase,memberUid,currentTarget);
    void window.ChildDirectAdmin?.load(_supabase,{...m,id:memberUid},currentTarget);
    document.getElementById('md-type').value = typeStr;
    document.getElementById('md-addr').value = m.address || '';
    document.getElementById('md-addr-detail').value = '';
    document.getElementById('md-memo').value = m.admin_memo || '';
    document.getElementById('md-bank-name').value = m.bank_name || '';
    document.getElementById('md-bank-owner').value = m.account_holder || '';
    document.getElementById('md-bank-account').value = MemberInformation.bankAccountDisplay(m);
    MemberInformation.renderBankAccountStatus(document.getElementById('md-bank-entered'), m);

    // 3. 개인/단체 구분 표시 및 단체 대표·담당자 정보
    syncMemberDetailTypeLayout();

    if (isGroup) {
        document.getElementById('md-representative-name').value = m.representative_name || '';
        document.getElementById('md-contact-name').value = m.contact_name || '';
        document.getElementById('md-contact-position').value = m.contact_position || '';
        document.getElementById('md-account-manager').textContent = accountManagerLabel;
        document.getElementById('md-corp-num').value = m.corp_number || '';
        document.getElementById('md-biz-num').value = m.business_number || '';
        document.getElementById('md-rrn-view').innerText = '-';
        document.getElementById('md-rrn').value = '';
    } else {
        document.getElementById('md-representative-name').value = '';
        document.getElementById('md-contact-name').value = '';
        document.getElementById('md-contact-position').value = '';
        document.getElementById('md-account-manager').textContent = '-';
        document.getElementById('md-corp-num').value = '';
        document.getElementById('md-biz-num').value = '';

        const rrn = m.rrn_display || '';
        let displayInfo = '정보 없음';

        if (rrn) {
            const cleanRrn = rrn.replace(/[^0-9]/g, '');
            if (cleanRrn.length >= 7) {
                const yPre = cleanRrn.substr(6, 1);
                const year = (yPre === '1' || yPre === '2') ? '19' : '20';
                const gender = (yPre === '1' || yPre === '3') ? '남성' : '여성';
                displayInfo = `${year}${cleanRrn.substr(0, 2)}년 ${cleanRrn.substr(2, 2)}월 ${cleanRrn.substr(4, 2)}일 (${gender})`;
            }
        }
        document.getElementById('md-rrn-view').innerText = displayInfo;
        document.getElementById('md-rrn').value = '';
    }

    // 4. SNS 연동 상태 표시 (기존 로직 유지)
    let snsHtml = '';
    if (m.kakao_id) snsHtml += '<span class="badge bg-warning text-dark me-1"><i class="bi bi-chat-fill"></i> Kakao</span>';
    if (m.naver_id) snsHtml += '<span class="badge bg-success"><span class="naver-mark naver-mark-inverse me-1" aria-hidden="true">N</span> Naver</span>';
    document.getElementById('md-sns-status').innerHTML = snsHtml || '<span class="text-muted small">SNS 미연동</span>';

    if (!isAdminMemberSiteProfile()) {
        Badges.renderCheckboxes('member-badge-checkboxes', g_badges, myBadgeCodes);
        markAutoManagedBadgeControls();
    } else {
        const badgeContainer = document.getElementById('member-badge-checkboxes');
        if (badgeContainer) badgeContainer.innerHTML = '';
    }

    // 5. 모달 설정 및 하위 데이터 로드 (기존 유지)
    toggleEditMode(false);
    initializeMemberDetailEdit(editorOwner, memberUid);
    initializeMemberConsultEdit(editorOwner, memberUid);
    loadMemberFunds(memberUid, m.member_id, true);
    loadConsultLogs(memberUid);
    void window.MemberNotificationAdmin?.detail(memberUid);
    if (!isAdminMemberSiteProfile()) loadMemberFamily(memberUid);

    const basicTabBtn = document.querySelector('#memberDetailTab [data-bs-target="#md-tab-basic"]');
    if (basicTabBtn && bootstrap.Tab) {
        bootstrap.Tab.getOrCreateInstance(basicTabBtn).show();
    }

    const detailModalEl = document.getElementById('memberDetailModal');
    if (detailModalEl) {
        const detailModal = bootstrap.Modal.getOrCreateInstance(detailModalEl);
        applyAdminMemberModalLayer(detailModalEl);
        if (!detailModalEl.classList.contains('show')) {
            detailModal.show();
        }
    }
    } catch (error) {
        if (requestRevision === g_member_detail_revision) {
            CoopSafeLog.error('[openMemberDetail] load failed', error);
            myAlert('조합원 정보를 불러오지 못했습니다. 다시 열어주세요.', 'error');
        }
    } finally {
        if (requestRevision === g_member_detail_revision) {
            setMemberDetailReadBusy(false);
            if (g_member_detail_loading) {
                g_member_detail_loading = false;
                if (typeof showLoading === 'function') showLoading(false);
            }
        }
    }
}

function todayYmdKst() {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kst.toISOString().slice(0, 10);
}

function monthStartYmdKst() {
    const today = todayYmdKst();
    return today.slice(0, 8) + '01';
}

function syncIssueDocAmountMode() {
    const typeEl = document.getElementById('issue-doc-type');
    const modeEl = document.getElementById('issue-amount-mode');
    const amountEl = document.getElementById('issue-manual-amount');
    const dateEl = document.getElementById('issue-cutoff-date');
    const rangeGroupEl = document.getElementById('issue-range-group');
    const rangeFromEl = document.getElementById('issue-range-from');
    const rangeToEl = document.getElementById('issue-range-to');
    if (!modeEl || !amountEl || !dateEl || !typeEl) return;

    const isDonation = typeEl.value === 'donation';
    const submitEl = document.getElementById('issue-doc-submit');
    if (submitEl) submitEl.textContent = isDonation ? '발급' : '미리보기';
    const manual = modeEl.value === 'manual';
    amountEl.disabled = !manual;
    dateEl.disabled = manual || isDonation;

    const showRange = isDonation && !manual;
    if (rangeGroupEl) rangeGroupEl.classList.toggle('d-none', !showRange);
    if (rangeFromEl) rangeFromEl.disabled = !showRange;
    if (rangeToEl) rangeToEl.disabled = !showRange;
    if (showRange && dateEl && rangeToEl) {
        dateEl.value = rangeToEl.value || todayYmdKst();
    }
}

function openIssueDocModal(docType) {
    if (!g_current_member_row || !g_current_member_id) {
        return myAlert('먼저 조합원 상세를 열어주세요.', 'warning');
    }

    const typeEl = document.getElementById('issue-doc-type');
    const titleEl = document.getElementById('issueDocTitle');
    const memberEl = document.getElementById('issue-doc-member');
    const modeEl = document.getElementById('issue-amount-mode');
    const dateEl = document.getElementById('issue-cutoff-date');
    const amountEl = document.getElementById('issue-manual-amount');
    const rangeFromEl = document.getElementById('issue-range-from');
    const rangeToEl = document.getElementById('issue-range-to');

    if (!typeEl || !titleEl || !memberEl || !modeEl || !dateEl || !amountEl || !rangeFromEl || !rangeToEl) return;

    const name = g_current_member_row.name || '-';
    const memberId = g_current_member_row.member_id || 'ID없음';
    typeEl.value = docType;
    titleEl.textContent = docType === 'donation'
        ? '기부금 수령 확인서 발급 기준 설정'
        : (isAdminMemberSiteProfile() ? '출자증서 발급 기준 설정' : '출자증명서 발급 기준 설정');
    memberEl.textContent = `${name} (${memberId})`;
    modeEl.value = 'cutoff';
    dateEl.value = todayYmdKst();
    rangeFromEl.value = monthStartYmdKst();
    rangeToEl.value = todayYmdKst();
    amountEl.value = '';
    syncIssueDocAmountMode();

    new bootstrap.Modal(document.getElementById('issueDocModal')).show();
}

async function calcIssueAmountByCriteria(docType, mode, cutoffDate, manualAmount, memberRow, periodFrom, periodTo) {
    if (mode === 'manual') {
        const amount = Number(manualAmount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('직접 지정 금액을 1원 이상 입력해주세요.');
        }
        return amount;
    }

    if (!cutoffDate) throw new Error('기준일을 선택해주세요.');
    const memberId = memberRow.member_id || '';
    const memberUid = memberRow.id || memberRow.member_uid || memberRow.uid || g_current_member_id;

    if (docType === 'donation') {
        if (!periodFrom || !periodTo) throw new Error('기부금 조회 기간(시작일/종료일)을 입력해주세요.');
        if (periodFrom > periodTo) throw new Error('조회 시작일은 종료일보다 늦을 수 없습니다.');
        let q = _supabase.from('coop_donations').select('amount');
        if (memberId && memberId !== 'ID없음' && memberId !== '-') q = q.eq('member_id', memberId);
        else q = q.eq('member_uid', memberUid);
        q = q.gte('donation_date', periodFrom).lte('donation_date', periodTo);

        const { data, error } = await q;
        if (error) throw error;
        return (data || []).reduce((acc, row) => acc + Number(row.amount || 0), 0);
    }

    if (!memberId || memberId === 'ID없음' || memberId === '-') {
        throw new Error('출자증명서 발급에는 조합원 번호(member_id)가 필요합니다.');
    }

    const capitalRequest = isAdminMemberSiteProfile()
        ? _supabase.rpc('admin_list_member_capital_secure', { p_member_text_id: memberId })
        : _supabase
            .from('ref_members')
            .select('amount, deposit_date')
            .eq('member_id', memberId)
            .lte('deposit_date', cutoffDate);
    const { data, error } = await capitalRequest;
    if (error) throw error;
    return (data || [])
        .filter((row) => !isAdminMemberSiteProfile() || !row.deposit_date || row.deposit_date <= cutoffDate)
        .reduce((acc, row) => acc + Number(row.amount || 0), 0);
}

async function fetchDonationRowsForReceipt(memberRow, periodFrom, periodTo) {
    const memberId = memberRow.member_id || '';
    const memberUid = memberRow.id || memberRow.member_uid || memberRow.uid || g_current_member_id;
    let q = _supabase
        .from('coop_donations')
        .select('donation_date, amount')
        .order('donation_date', { ascending: true });
    if (memberId && memberId !== 'ID없음' && memberId !== '-') q = q.eq('member_id', memberId);
    else q = q.eq('member_uid', memberUid);
    q = q.gte('donation_date', periodFrom).lte('donation_date', periodTo);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

async function fetchChairmanName() {
    const { data, error } = await scopeAdminTenant(_supabase
        .from('ref_company_info')
        .select('value')
        .eq('key', 'chairman_name')
        .single());
    if (error || !data?.value) return '이사장';
    return data.value;
}

function buildDonationReceiptNumber(memberRow) {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const keyRaw = (memberRow.member_id || memberRow.id || '').toString().replace(/[^0-9]/g, '');
    const key = (keyRaw.slice(-4) || '0000').padStart(4, '0');
    return `DON-${y}${m}${d}-${key}`;
}

let adminIssueDocBusy = false;
let adminCertificateAuthId = '';

function bindAdminCertificateContext(authId) {
    adminCertificateAuthId = String(authId || '');
    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (session?.user?.id && session.user.id !== adminCertificateAuthId)) {
            adminCertificateAuthId = '';
            clearMemberDetailEdits();
            window.ContributionCertPreview?.clear();
            window.MemberNotificationAdmin?.clear();
            window.MemberAdmissionAdmin?.clear();
        }
    });
    // A parked workspace retains editor input, not an open personal certificate.
    const frame = window.frameElement;
    if (frame) {
        const observer = new MutationObserver(() => {
            if (frame.hidden) {
                invalidateDonationListRead();
                invalidateUsageLedgerRead();
                invalidateApplicationListRead();
                invalidateMemberReturnSummaryRead();
                invalidateAdminDashboardRead();
                memberFundListResume = null;
                window.ContributionCertPreview?.clear();
                if (typeof pauseMemberImportRead === 'function') pauseMemberImportRead();
            } else {
                const dashboard = adminDashboardResume;
                adminDashboardResume = null;
                if (dashboard && dashboard.revision === adminDashboardRevision && dashboard.owner === memberDetailOwner()) {
                    void loadDashboard();
                }
                const summary = memberReturnSummaryResume;
                memberReturnSummaryResume = null;
                if (summary && summary.revision === memberReturnSummaryRevision && summary.owner === memberDetailOwner()) {
                    void fetchMemberReturnSummary();
                }
                const queued = memberFundListResume;
                memberFundListResume = null;
                if (queued && queued.sequence === memberFundRefreshSequence && queued.owner === memberDetailOwner()) {
                    void refreshVisibleMemberFundList().catch(error => CoopSafeLog.error('[erp/admin_member] fund list resume failed', error));
                }
                const application = applicationListResume;
                applicationListResume = null;
                if (application && application.sequence === memberFundRefreshSequence && application.owner === memberDetailOwner()) {
                    void fetchApplications().catch(error => CoopSafeLog.error('[erp/admin_member] application list resume failed', error));
                }
            }
        });
        observer.observe(frame, { attributes: true, attributeFilter: ['hidden'] });
        window.addEventListener('pagehide', () => {observer.disconnect();memberFundListResume=null;memberFundRefreshSequence++;}, { once: true });
    }
}

async function hideIssueDocForPreview() {
    const modalEl = document.getElementById('issueDocModal');
    if (!modalEl?.classList.contains('show')) return;
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) return;
    await new Promise(resolve => {
        modalEl.addEventListener('hidden.bs.modal', resolve, { once: true });
        const hide = () => { moveFocusOutsideModal(modalEl); modal.hide(); };
        if (modalEl.dataset.adminMemberModalOpening === '1') modalEl.addEventListener('shown.bs.modal', hide, { once: true });
        else hide();
    });
}

async function submitIssueDoc() {
    if (adminIssueDocBusy) return;
    const typeEl = document.getElementById('issue-doc-type');
    const modeEl = document.getElementById('issue-amount-mode');
    const dateEl = document.getElementById('issue-cutoff-date');
    const amountEl = document.getElementById('issue-manual-amount');
    const rangeFromEl = document.getElementById('issue-range-from');
    const rangeToEl = document.getElementById('issue-range-to');

    if (!typeEl || !modeEl || !dateEl || !amountEl || !rangeFromEl || !rangeToEl) return;
    if (!g_current_member_row || !g_current_member_id) {
        return myAlert('조합원 정보가 없습니다. 다시 열어주세요.', 'warning');
    }

    const docType = typeEl.value;
    const mode = modeEl.value;
    const cutoffDate = dateEl.value;
    const manualAmount = ERPNumberInput.raw(amountEl.value);
    const periodFrom = rangeFromEl.value;
    const periodTo = rangeToEl.value;
    const memberData = { ...g_current_member_row, id: g_current_member_id };
    const coopId = String(g_adminMemberRuntime?.coop_id || '').trim();
    const authId = adminCertificateAuthId;
    const revision = g_member_detail_revision;
    const current = () => String(g_current_member_id) === String(memberData.id)
        && g_current_member_row?.member_id === memberData.member_id
        && g_member_detail_revision === revision
        && String(g_adminMemberRuntime?.coop_id || '').trim() === coopId
        && adminCertificateAuthId === authId
        && (!window.frameElement || !window.frameElement.hidden);
    let preview;
    const authorize = async () => {
        const [identity, access] = await Promise.all([
            _supabase.auth.getUser(), _supabase.rpc('get_my_erp_runtime')
        ]);
        if (identity.error || access.error) throw new Error('로그인과 발급 권한을 확인하지 못했습니다. 다시 시도해 주세요.');
        const runtime = access.data;
        const allowed = runtime?.coop_id === coopId && runtime.is_active !== false
            && window.ErpRuntimeGuard.isModuleEnabled(runtime, 'member_admin')
            && window.ErpRuntimeGuard.isModuleAssigned(runtime, 'member_admin')
            && (runtime.effective_permissions?.includes('member.admin')
                || (runtime.runtime_profile === 'site_member' && runtime.module_access?.member_admin === true));
        if (!authId || identity.data?.user?.id !== authId || !current() || !allowed) {
            window.ContributionCertPreview?.clear();
            throw Object.assign(new Error('로그인 계정, 조합 또는 발급 권한이 변경되었습니다. 다시 열어주세요.'), {code:'CERTIFICATE_CONTEXT_CHANGED'});
        }
    };
    adminIssueDocBusy = true;
    const submitEl = document.getElementById('issue-doc-submit');
    if (submitEl) submitEl.disabled = true;

    if (docType === 'donation') showLoading(true, '발급 자료 준비 중...');

    try {
        if (docType !== 'donation') {
            if (!window.ContributionCertPreview) throw new Error('증명서 미리보기를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
            await hideIssueDocForPreview();
            if (!current()) return;
            preview = window.ContributionCertPreview.start({ isCurrent: current, authorize });
            await authorize();
            if (!preview.isCurrent()) return;
        }
        await ensureCertGeneratorReady();
        if (preview && !preview.isCurrent()) return;
        if (typeof window.jspdf?.jsPDF !== 'function') {
            throw new Error('PDF 라이브러리(jsPDF) 로드에 실패했습니다. 네트워크/차단 설정을 확인해주세요.');
        }
        const amount = await calcIssueAmountByCriteria(
            docType,
            mode,
            cutoffDate,
            manualAmount,
            memberData,
            periodFrom,
            periodTo
        );
        if (preview && !preview.isCurrent()) return;
        if (!amount || amount <= 0) {
            throw new Error(docType === 'donation'
                ? '기준 조건에 해당하는 기부금이 없어 발급할 수 없습니다.'
                : '기준 조건에 해당하는 출자금이 없어 발급할 수 없습니다.');
        }

        const chairmanName = await fetchChairmanName();
        if (isAdminMemberSiteProfile() && (!chairmanName || chairmanName === '이사장')) {
            throw new Error('출자증서 발급 전에 출자증서 설정에서 이사장 성명을 등록해주세요.');
        }

        if (docType === 'donation') {
            if (typeof generateDonationReceipt !== 'function') {
                throw new Error('cert_generator.js 최신본이 로드되지 않았습니다. 배포/캐시를 확인해주세요.');
            }
            const receiptNo = buildDonationReceiptNumber(memberData);
            const detailRows = mode === 'cutoff'
                ? await fetchDonationRowsForReceipt(memberData, periodFrom, periodTo)
                : [];
            await generateDonationReceipt(
                memberData,
                amount,
                {
                    mode,
                    cutoff_date: cutoffDate || null,
                    period_from: periodFrom || null,
                    period_to: periodTo || null,
                    details: detailRows,
                    coopId: String(g_adminMemberRuntime?.coop_id || '').trim() || null
                },
                receiptNo,
                chairmanName,
                _supabase
            );
        } else {
            if (!memberData.member_id || memberData.member_id === 'ID없음' || memberData.member_id === '-') {
                throw new Error('출자증명서 발급에는 조합원 번호(member_id)가 필요합니다.');
            }
            if (String(memberData.member_type || '').includes('단체')) getContributionCertificateOrganizationIdentity(memberData);
            if (typeof generateContributionCert !== 'function' || typeof prepareContributionCertCompanyProfile !== 'function') {
                throw new Error('cert_generator.js 최신본이 로드되지 않았습니다. 배포/캐시를 확인해주세요.');
            }

            const companyProfile = await prepareContributionCertCompanyProfile(_supabase, {
                coopId,
                fallbackChairmanName: chairmanName
            });
            if (typeof getCertPretendardFontBase64 === 'function') await getCertPretendardFontBase64();
            if (!preview.isCurrent()) return;
            await authorize();
            if (!preview.isCurrent()) return;

            const { data: cert, error } = await _supabase.rpc('issue_contribution_certificate', {
                p_member_id: memberData.member_id,
                p_amount: amount
            });
            if (error) throw error;
            if (!preview.isCurrent()) return;
            if (!cert?.cert_number) throw new Error('증명서 발급 번호를 확인하지 못했습니다. 다시 시도해 주세요.');

            const result = await generateContributionCert(memberData, amount, cert.cert_number, chairmanName, _supabase, {
                output: 'preview',
                issueDate: mode === 'cutoff' ? cutoffDate : null,
                coopId,
                requireSeal: true,
                companyProfile
            });
            await authorize();
            if (!preview.isCurrent()) return;
            await preview.present(result);
            return;
        }

        showLoading(false);
        const issueModalEl = document.getElementById('issueDocModal');
        const issueModal = bootstrap.Modal.getInstance(issueModalEl);
        if (issueModal) {
            moveFocusOutsideModal(issueModalEl);
            issueModal.hide();
        }
        myAlert('문서 발급이 완료되었습니다.', 'success');
    } catch (e) {
        showLoading(false);
        CoopSafeLog.error("[erp/admin_member] operation failed", e);
        if (preview) {
            if (preview.isCurrent()) preview.fail('증명서 준비 실패: ' + (e?.message || '다시 시도해 주세요.'));
            else if (e?.code === 'CERTIFICATE_CONTEXT_CHANGED') myAlert(e.message, 'warning');
            return;
        }
        const issueModalEl = document.getElementById('issueDocModal');
        moveFocusOutsideModal(issueModalEl);
        const issueModal = bootstrap.Modal.getInstance(issueModalEl);
        if (issueModal) issueModal.hide();
        myAlert('문서 발급 실패: ' + (e?.message || e), 'error');
    } finally {
        adminIssueDocBusy = false;
        if (submitEl) submitEl.disabled = false;
    }
}


function markAutoManagedBadgeControls() {
    const badgeChecks = document.querySelectorAll('#member-badge-checkboxes input[type="checkbox"]');
    badgeChecks.forEach(chk => {
        const isAutoManaged = ADMIN_AUTO_MANAGED_BADGE_CODES.has(chk.value);
        chk.dataset.autoManaged = isAutoManaged ? 'true' : 'false';
        if (!isAutoManaged) return;

        chk.disabled = true;
        const label = chk.closest('.form-check')?.querySelector('label');
        if (label && !label.querySelector('[data-auto-managed-badge-label]')) {
            const autoLabel = document.createElement('span');
            autoLabel.className = 'badge rounded-pill text-bg-info ms-1 fw-normal';
            autoLabel.dataset.autoManagedBadgeLabel = 'true';
            autoLabel.textContent = '자동';
            label.appendChild(autoLabel);
        }
    });
} // End of markAutoManagedBadgeControls

function toggleEditMode(isEdit) {
    if (!isEdit) invalidateMemberAddressSearch();
    if (isCurrentMemberDetailEditor()) memberDetailEditState.editing = !!isEdit;
    // 1. 일반 입력창 제어 (기존 로직)
    const inputs = document.querySelectorAll('#md-tab-basic input:not([type=checkbox]), #md-tab-basic select, #md-tab-basic textarea');
    inputs.forEach(el => {
        if(el.id === 'md-addr') el.disabled = true;

        // [수정] 단체 번호 인풋들은 별도 로직으로 처리하기 위해 스킵 (아래 4번에서 처리)
        else if(el.id === 'md-corp-num' || el.id === 'md-biz-num') {
            // pass
        }
        else {
            el.disabled = !isEdit;
            el.classList.toggle('bg-light', !isEdit);
        }
    });

    // 2. ★ [추가됨] 뱃지 체크박스 제어
    // 수정 모드일 때만 체크박스 클릭 가능하게 설정
    const badgeChecks = document.querySelectorAll('#member-badge-checkboxes input[type="checkbox"]');
    badgeChecks.forEach(chk => {
        const isAutoManaged = chk.dataset.autoManaged === 'true' || ADMIN_AUTO_MANAGED_BADGE_CODES.has(chk.value);
        chk.disabled = !isEdit || isAutoManaged;
    });

    // 3. 버튼 및 UI 제어 (기존 로직 유지)
    const btnSearch = document.getElementById('btn-addr-search');
    const addrDetail = document.getElementById('md-addr-detail');

    if(isEdit) {
        document.getElementById('btn-edit-mode').style.display = 'none';
        document.getElementById('btn-save-group').style.display = 'flex';
        document.getElementById('rrn-edit-area').style.display = 'block';
        document.getElementById('rrn-view-area').style.display = 'none';
        btnSearch.style.display = 'inline-block';
        addrDetail.style.display = 'block';
    } else {
        document.getElementById('btn-edit-mode').style.display = 'inline-block';
        document.getElementById('btn-save-group').style.display = 'none';
        document.getElementById('rrn-edit-area').style.display = 'none';
        document.getElementById('rrn-view-area').style.display = 'block';
        btnSearch.style.display = 'none';
        addrDetail.style.display = 'none';
    }

    // 4. [수정] 단체용 인풋 박스 제어 (Edit 모드일 때 + 단체 영역이 보일 때만)
    const corpInput = document.getElementById('md-corp-num');
    const bizInput = document.getElementById('md-biz-num');

    const isGroupVisible = document.getElementById('area-group').style.display !== 'none';

    if (isGroupVisible) {
        corpInput.disabled = !isEdit;
        bizInput.disabled = !isEdit;

        // 배경색 처리
        corpInput.classList.toggle('bg-light', !isEdit);
        bizInput.classList.toggle('bg-light', !isEdit);
    }

    syncMemberDetailTypeLayout();
}

// [교체] 주소 검색 (검색 결과 -> 기본창, 포커스 -> 상세창)
function searchAddress() {
const editor = memberDetailEditState;
if (!isCurrentMemberDetailEditor(editor) || !editor.editing || memberDetailSaving
    || window.frameElement?.hidden || !document.getElementById('memberDetailModal')?.classList.contains('show')) return;
const main = document.getElementById('md-addr'), detail = document.getElementById('md-addr-detail');
const request = {editor,revision:g_member_detail_revision,main:main.value,detail:detail.value};
memberAddressSearch = request;
try {
new daum.Postcode({
oncomplete: function(data) {
if (memberAddressSearch !== request || !isCurrentMemberDetailEditor(editor) || !editor.editing || memberDetailSaving
    || request.revision !== g_member_detail_revision || window.frameElement?.hidden
    || !document.getElementById('memberDetailModal')?.classList.contains('show')
    || main.value !== request.main || detail.value !== request.detail || detail.disabled) return;
invalidateMemberAddressSearch();
const fullAddr = `(${data.zonecode}) ${data.roadAddress || data.jibunAddress}`;
main.value = fullAddr;
detail.value = '';
main.dispatchEvent(new Event('input',{bubbles:true}));
detail.dispatchEvent(new Event('input',{bubbles:true}));
detail.focus();
},
onclose: function() {
if (memberAddressSearch === request) invalidateMemberAddressSearch();
}
}).open();
} catch (_) {
if (memberAddressSearch === request) {
invalidateMemberAddressSearch();
myAlert('주소 검색을 열지 못했습니다. 잠시 후 다시 시도해 주세요.','warning');
}
}
}

async function saveMemberBasic() {
    const editState = memberDetailEditState;
    if (memberDetailSaving || !isCurrentMemberDetailEditor(editState) || !editState.editing) return;
    myConfirm("수정된 정보를 저장하시겠습니까?", async () => {
        if (memberDetailSaving || !isCurrentMemberDetailEditor(editState) || !editState.editing
            || !document.getElementById('memberDetailModal')?.classList.contains('show')
            || window.frameElement?.hidden) return;
        memberDetailSaving = true;
        let lockedControls = [], basicSaved = false, completed = false;
        // 1. 주소 및 기본값 처리
        const memberUid = document.getElementById('md-uid').value;
        const basicAddr = document.getElementById('md-addr').value;
        const detailAddr = document.getElementById('md-addr-detail').value;
        const finalAddr = detailAddr ? `${basicAddr} ${detailAddr}` : basicAddr;

        let bankAcc = document.getElementById('md-bank-account').value;
        if (bankAcc && (!bankAcc.trim() || bankAcc.includes('*'))) bankAcc = null;

        showLoading(true);

        try {
            // [수정] 단체 정보도 함께 수집
            const corpNum = document.getElementById('md-corp-num').value || null;
            const bizNum = document.getElementById('md-biz-num').value || null;
            const emailInput = (document.getElementById('md-email').value || '').trim();
            const nextEmail = emailInput || null;
            const memberType = document.getElementById('md-type').value;
            const isGroup = String(memberType).includes('단체');
            const memberName = (document.getElementById('md-name').value || '').trim();
            if (!memberName || Array.from(memberName).length > 100 || /[\u0000-\u001f\u007f]/.test(memberName)) {
                throw new Error('이름·단체명을 제어 문자 없이 100자 이내로 입력해주세요.');
            }
            const joinBaseline = new Map(editState.baseline);
            const joinDetails = {};
            const joinDate = document.getElementById('md-join-date').value;
            const joinCategory = document.getElementById('md-join-category').value.trim();
            if (joinDate && joinDate !== joinBaseline.get('md-join-date')) {
                joinDetails.join_date = joinDate;
                joinDetails.expected_join_date = joinBaseline.get('md-join-date') || null;
            }
            if (joinCategory && joinCategory !== (joinBaseline.get('md-join-category') || '').trim()) {
                if (Array.from(joinCategory).length > 100 || /[\u0000-\u001f\u007f]/.test(joinCategory)) throw new Error('가입구분을 제어 문자 없이 100자 이내로 입력해주세요.');
                joinDetails.join_category = joinCategory;
                joinDetails.expected_join_category = joinBaseline.get('md-join-category') || null;
            }
            const representativeName = isGroup
                ? (document.getElementById('md-representative-name').value || '').trim()
                : '';
            const contactName = isGroup
                ? (document.getElementById('md-contact-name').value || '').trim()
                : '';
            const contactPosition = isGroup
                ? (document.getElementById('md-contact-position').value || '').trim()
                : '';
            const preferredName = isGroup
                ? null
                : (document.getElementById('md-preferred-name').value || '').trim() || null;
            const preferredNamePosition = isGroup
                ? 'before'
                : (document.getElementById('md-preferred-name-position').value || 'before');

            if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
                throw new Error('이메일 형식이 올바르지 않습니다.');
            }
            for (const [label, value] of [['대표자명', representativeName], ['담당자명', contactName], ['담당자 직함 또는 역할', contactPosition]]) {
                if (value && (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value))) {
                    throw new Error(`${label}은 제어 문자 없이 100자 이내로 입력해주세요.`);
                }
            }

            // 2. 기본 정보와 단체 담당자 정보를 하나의 보안 RPC로 업데이트
            const updates = {
                p_id: memberUid,
                p_name: memberName,
                p_phone: (document.getElementById('md-phone').value || '').trim() || null,
                p_email: nextEmail,
                p_address: finalAddr,
                p_bank_name: document.getElementById('md-bank-name').value,
                p_bank_owner: document.getElementById('md-bank-owner').value,
                p_bank_account: bankAcc,
                p_status: document.getElementById('md-status').value || null,
                p_member_type: memberType,
                p_admin_memo: document.getElementById('md-memo').value,
                p_rrn: (document.getElementById('md-rrn').value || '').trim() || null,
                p_corp_number: corpNum,
                p_business_number: bizNum,
                p_representative_name: isGroup ? representativeName : null,
                p_contact_name: isGroup ? contactName : null,
                p_contact_position: isGroup ? contactPosition : null,
                p_preferred_name: preferredName,
                p_preferred_name_position: preferredNamePosition,
                p_join_details: joinDetails
            };
            const submitted = memberDetailSnapshot();
            lockedControls = Array.from(document.querySelectorAll('#memberDetailModal input,#memberDetailModal select,#memberDetailModal textarea,#memberDetailModal button'))
                .map(node => [node,node.disabled]);
            lockedControls.forEach(([node]) => { node.disabled = true; });

            const { data: savedJoinDetails, error: basicError } = await _supabase.rpc('update_member_details_secure_v4', updates);
            if (basicError) throw basicError;
            if (!isCurrentMemberDetailEditor(editState)) return;
            basicSaved = true;
            acceptMemberBasicSave(editState, submitted, updates, false, savedJoinDetails);

            if (canManageAdminMemberIndividualBadges()) {
                const selectedCodes = [];
                document.querySelectorAll('#member-badge-checkboxes input:checked').forEach(cb => {
                    selectedCodes.push(cb.value);
                });

                const selectedIds = selectedCodes.map(code => {
                    const match = g_badges.find(b => b.code === code);
                    return match ? Number(match.id) : null;
                }).filter(id => id !== null);

                const { error: badgeError } = await _supabase.rpc('sync_member_badges', {
                    p_member_uid: memberUid,
                    p_badge_ids: selectedIds
                });

                if (badgeError) throw new Error('뱃지 동기화 실패: ' + badgeError.message);
            }
            if (!isCurrentMemberDetailEditor(editState)) return;
            acceptMemberBasicSave(editState, submitted, updates, true, savedJoinDetails);
            completed = true;
            memberDetailDrafts.delete(editState.key);

            showLoading(false);
            myAlert('저장되었습니다.');
            void loadMemberInformationSummary();
            void refreshMemberDashboardAfterSave();
            if (!document.getElementById('member-information-list-panel').hidden) void loadMemberInformationList(true);

            // 3. 리스트 갱신 (딜레이 확보)
            setTimeout(() => { fetchMembers(); }, 300);

        } catch (err) {
            showLoading(false);
            if (!isCurrentMemberDetailEditor(editState)) return;
            CoopSafeLog.error("[erp/admin_member] operation failed", err);
            myAlert((basicSaved ? '기본 정보는 저장됐지만 나머지 처리를 완료하지 못했습니다. ' : '오류 발생: ') + err.message, 'error');
        } finally {
            const current = isCurrentMemberDetailEditor(editState);
            lockedControls.forEach(([node,disabled]) => { if (node.isConnected) node.disabled = current ? disabled : true; });
            memberDetailSaving = false;
            if (current) {
                if (completed) {
                    toggleEditMode(false);
                    memberDetailFields().forEach(node => window.ErpWorkspaceResume?.checkpoint(node));
                }
                retainMemberDetailEdit();
            }
            showLoading(false);
        }
    });
}


// [수정] 상담 이력 로드 (최신이 위로 오도록 정렬 보강)
async function loadConsultLogs(uuid) { // uuid는 유지(호출부 호환), 내부는 textId 사용
  const listEl = document.getElementById('md-consult-list');
  if (!listEl) return;
  const read = beginMemberDetailRead('consult', uuid || g_current_member_id);
  if (!isCurrentMemberDetailRead(read)) return;

  const textId = document.getElementById('md-id-text').innerText;

  if (!textId || textId === '-' || textId === 'ID없음') {
    listEl.innerHTML = '<div class="text-center text-muted py-3 small">조합원 번호가 없어 조회할 수 없습니다.</div>';
    return;
  }

  listEl.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';

  const { data, error } = await Promise.resolve().then(() => _supabase.rpc('get_member_consultations', {
    p_member_id: textId
  })).catch(error => ({ data: null, error }));
  if (!isCurrentMemberDetailRead(read)) return;

  listEl.innerHTML = '';

  if (error) {
    CoopSafeLog.error("상담 로드 에러:", error);
    listEl.innerHTML = '<div class="text-center text-danger py-3 small">불러오기 실패</div>';
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<div class="text-center text-muted py-3 small">상담 이력이 없습니다.</div>';
    return;
  }

  // ★ 핵심: 최근 이력이 위로 오도록(created_at 기준 내림차순)
  const sorted = [...data].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  sorted.forEach(log => {
    const dateStr = formatAdminMemberKstDateTime(log.created_at, '-');

    listEl.innerHTML += `
      <div class="list-group-item bg-light border-0 mb-1 rounded">
        <div class="d-flex justify-content-between">
          <small class="fw-bold text-dark">${escapeHtml(log.author_email || '관리자')}</small>
          <small class="text-muted" style="font-size:0.8em">${escapeHtml(dateStr)}</small>
        </div>
        <div class="mt-1 text-secondary" style="font-size:0.9rem; white-space: pre-wrap;">${escapeHtml(log.content || '')}</div>
      </div>
    `;
  });
}


// [수정] 상담 등록 (UUID 대신 텍스트 ID 사용)
async function addConsultLog() {
const state = memberConsultState;
if (!state || state.owner !== memberDetailOwner() || state.member !== String(g_current_member_id || '')
    || memberConsultPending.has(state.key) || window.frameElement?.hidden) return;
const inputEl = document.getElementById('md-consult-input');
const content = inputEl.value;

if(!content.trim()) return myAlert('내용을 입력하세요.', 'warning');

const userEmail = document.getElementById('adminProfile') ? document.getElementById('adminProfile').innerText : 'admin';
const textId = document.getElementById('md-id-text').innerText; // 화면에 있는 텍스트 ID

if(!textId || textId === '-') return myAlert('조합원 번호가 없는 사용자입니다.', 'warning');

retainMemberConsultEdit();
memberConsultPending.add(state.key);
const button = document.getElementById('member-consult-submit');
if (button) button.disabled = true;
showLoading(true);
try {
const { error } = await _supabase.rpc('add_consultation', {
p_member_id: textId,
p_author_email: userEmail,
p_content: content
});
if (error) throw error;
if (state.owner !== memberDetailOwner()) return;
if (memberConsultState?.key === state.key) {
    if (inputEl.value === content) {
        inputEl.value = '';
        window.ErpWorkspaceResume?.checkpoint(inputEl);
    }
    retainMemberConsultEdit();
    if (!window.frameElement?.hidden) void loadConsultLogs(state.member);
} else if (memberConsultDrafts.get(state.key) === content) {
    memberConsultDrafts.delete(state.key);
}
} catch (error) {
    if (state.owner === memberDetailOwner() && memberConsultState?.key === state.key) {
        CoopSafeLog.error('[erp/admin_member] operation failed', error);
        myAlert('등록 실패: ' + error.message, 'error');
    }
} finally {
    memberConsultPending.delete(state.key);
    if (memberConsultState?.key === state.key && state.owner === memberDetailOwner() && button) button.disabled = false;
    showLoading(false);
}
}


// 5. 자금 로드 (출자금, 기부금 등) - Phase 2에서는 '조회' 위주


function formatManagedFamilyBirthDisplay(member) {
    if (String(member?.member_type || '').trim() === '단체') return '-';

    const birthDateText = formatMemberExportBirthDateText(member?.birth_date);
    if (birthDateText !== '-') return birthDateText;

    return formatMemberExportBirthDateFromRrnDisplay(member?.rrn_display);
} // End of formatManagedFamilyBirthDisplay

function getManagedFamilyStatusClass(status) {
    const value = String(status || '');
    if (value === '승인대기') return 'bg-danger';
    if (value === '탈퇴') return 'bg-secondary';
    return 'bg-success';
} // End of getManagedFamilyStatusClass

function getManagedFamilyRelationBadge(relationKind, member) {
    if (relationKind === 'parent') {
        return '<span class="badge bg-primary">보호자/관리자</span>';
    }
    if (member?.member_type === '단체') {
        return '<span class="badge bg-info">🏢 단체</span>';
    }
    if (member?.join_category === '가족') {
        return '<span class="badge bg-warning text-dark">👶 자녀</span>';
    }
    return '<span class="badge bg-secondary">기타</span>';
} // End of getManagedFamilyRelationBadge

// [수정] 가족/단체 목록 로드 (내가 관리자인 계정 + 나를 관리하는 계정 조회)
async function loadMemberFamily(parentId) {
    const tbody = document.getElementById('md-family-list');
    if (!tbody) return {ok:false,stale:true};
    const read = beginMemberDetailRead('family', parentId);
    const owner = memberDetailOwner();
    const current = () => !!owner && owner === memberDetailOwner() && isCurrentMemberDetailRead(read);
    if (!current()) return {ok:false,stale:true};
    clearMemberFamilyRetry();
    try {

    // 1. 로딩 표시
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';

    // 2. DB 조회
    // 뷰에는 manager_id가 없을 수 있으므로 원본 테이블을 조회합니다.
    const familySelect = 'id, name, birth_date, rrn_display, status, member_type, join_category, join_date, manager_id';
    const { data: currentMember, error: currentError } = await scopeAdminTenant(_supabase
        .from('coop_members')
        .select('id, manager_id')
        .eq('id', parentId))
        .maybeSingle();
    if (!current()) return {ok:false,stale:true};

    if (currentError) {
        CoopSafeLog.error("현재 조합원 가족 연결 기준 로드 실패:", currentError);
        return showMemberFamilyReadFailure(read,owner);
    }
    if (!currentMember) {
        return showMemberFamilyReadFailure(read,owner,'선택한 조합원 정보를 확인하지 못했습니다. 목록을 다시 불러와 주세요.');
    }

    const { data: childList, error: childError } = await scopeAdminTenant(_supabase
        .from('coop_members')
        .select(familySelect))
        .eq('manager_id', parentId)
        .order('join_date', { ascending: false });
    if (!current()) return {ok:false,stale:true};

    if (childError) {
        CoopSafeLog.error("가족 목록 로드 실패:", childError);
        return showMemberFamilyReadFailure(read,owner);
    }

    let parentMember = null;
    if (currentMember?.manager_id) {
        const { data: parentData, error: parentError } = await scopeAdminTenant(_supabase
            .from('coop_members')
            .select(familySelect)
            .eq('id', currentMember.manager_id))
            .maybeSingle();
        if (!current()) return {ok:false,stale:true};

        if (parentError) {
            CoopSafeLog.error("보호자/관리자 연결 로드 실패:", parentError);
            return showMemberFamilyReadFailure(read,owner);
        }
        if (!parentData) {
            return showMemberFamilyReadFailure(read,owner,'연결된 보호자·관리자 정보를 확인하지 못했습니다. 목록을 다시 불러와 주세요.');
        }
        parentMember = parentData;
    }

    const familyRows = [];
    if (parentMember) {
        familyRows.push({
            relationKind: 'parent',
            member: parentMember,
            managedId: parentId,
            managerId: parentMember.id
        });
    }

    (childList || []).forEach((member) => {
        familyRows.push({
            relationKind: 'child',
            member,
            managedId: member.id,
            managerId: parentId
        });
    });

    // 3. 데이터 없음 처리
    if (familyRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted small py-3">연결된 가족이나 단체가 없습니다.</td></tr>';
        return {ok:true};
    }

    // 4. 목록 렌더링
    tbody.innerHTML = '';

    familyRows.forEach(({ relationKind, member: m, managedId, managerId }) => {
        const typeBadge = getManagedFamilyRelationBadge(relationKind, m);
        const birthDisplay = formatManagedFamilyBirthDisplay(m);
        const statusClass = getManagedFamilyStatusClass(m.status);
        const safeId = escapeJsString(m.id || '');
        const safeManagedId = escapeJsString(managedId || '');
        const safeManagerId = escapeJsString(managerId || '');
        const safeNameText = escapeHtml(m.name || '-');
        const safeBirthDisplay = escapeHtml(birthDisplay);
        const safeStatus = escapeHtml(m.status || '-');
        const safeNameArg = escapeJsString(m.name || '');
        const safeTypeArg = escapeJsString(m.member_type || '');

        tbody.innerHTML += `
            <tr>
                <td>${typeBadge}</td>
                <td class="fw-bold">${safeNameText}</td>
                <td class="small">${safeBirthDisplay}</td>
                <td><span class="badge ${statusClass}">${safeStatus}</span></td>
                <td class="d-flex gap-1 justify-content-center flex-wrap">
                    <button type="button" class="btn btn-xs btn-outline-dark border" onclick="openMemberDetail('${safeId}')">
                        상세보기
                    </button>
                    <button type="button" class="btn btn-xs btn-outline-danger border" onclick="confirmDisconnectManagedMember('${safeManagedId}', '${safeNameArg}', '${safeTypeArg}', '${safeManagerId}')">
                        연결 해제
                    </button>
                </td>
            </tr>
        `;
    });
    return {ok:true};
    } catch (error) {
        if (!current()) return {ok:false,stale:true};
        CoopSafeLog.error('[loadMemberFamily] load failed', error);
        return showMemberFamilyReadFailure(read,owner);
    }
}

function getManagedLinkErrorMessage(error) {
    const message = String(error?.message || error || '');
    if (message.includes('GROUP_ALREADY_MANAGED')) {
        return '이미 다른 관리자에게 연결된 단체입니다. 먼저 기존 연결을 해제한 뒤 다시 연결해 주세요.';
    }
    if (message.includes('MANAGED_MEMBER_LINK_MISMATCH')) {
        return '현재 상세 조합원에게 연결된 계정이 아닙니다. 목록을 새로고침한 뒤 다시 확인해 주세요.';
    }
    if (message.includes('MANAGED_MEMBER_NOT_FOUND')) {
        return '연결된 계정을 찾을 수 없습니다.';
    }
    if (message.includes('GROUP_NOT_FOUND')) {
        return '단체 계정을 찾을 수 없습니다.';
    }
    if (message.includes('MANAGER_NOT_FOUND')) {
        return '관리자 계정을 찾을 수 없습니다.';
    }
    if (message.includes('COOP_CONTEXT_REQUIRED')) {
        return '조합 정보를 확인할 수 없습니다. 다시 로그인해 주세요.';
    }
    return message || '처리 중 오류가 발생했습니다.';
}

function confirmDisconnectManagedMember(managedId, managedName, memberType, managerId) {
    const currentDetailId = g_current_member_id || document.getElementById('md-uid')?.value || '';
    const resolvedManagerId = managerId || currentDetailId;
    if (!currentDetailId) return myAlert('현재 상세 조합원 정보를 찾을 수 없습니다.', 'error');
    if (!resolvedManagerId) return myAlert('관리자 연결 정보를 찾을 수 없습니다.', 'error');
    if (!managedId) return myAlert('연결된 계정 정보를 찾을 수 없습니다.', 'error');

    const typeLabel = String(memberType || '').includes('단체') ? '단체' : '개인/가족';
    const displayName = managedName || '선택한 계정';
    const msg = `'${displayName}' ${typeLabel} 연결을 해제하시겠습니까?\n계정은 삭제되지 않고, 현재 조합원과의 관리 연결만 해제됩니다.`;

    myConfirm(msg, async () => {
        showLoading(true);
        const { error } = await _supabase.rpc('disconnect_managed_member', {
            managed_uuid: managedId,
            manager_uuid: resolvedManagerId
        });
        showLoading(false);

        if (error) {
            myAlert('연결 해제 실패: ' + getManagedLinkErrorMessage(error), 'error');
            return;
        }

        const cached = findCachedAdminMember(managedId);
        if (cached) {
            cached.manager_id = null;
            if (String(cached.member_type || '').includes('단체')) cached.rep_uuid = null;
        }

        const currentCached = findCachedAdminMember(currentDetailId);
        if (currentCached && String(currentDetailId) === String(managedId)) {
            currentCached.manager_id = null;
        }

        await loadMemberFamily(currentDetailId);
        myAlert('연결이 해제되었습니다.');
    });
}

// ================================================================
// [기능] 자금 관리 (출자/기부 CRUD)
// ================================================================

// [수정] 에디터 모달 열기 (삭제 버튼 제어 로직 추가)
let g_fundDonationJournalCompleted = false;
let g_fundDonationOriginalNote = '', g_fundDonationInitialMemo = '';
function getDonationNoteParts(note) {
    const rawNote = String(note || '');
    return { completed: rawNote.includes('[전표완료]'), memo: rawNote.replace(/\[전표완료\]/g, '').trim() };
}

function renderDonationJournalStatus(completed) {
    return completed
        ? '<span class="badge bg-success bg-opacity-10 text-success border">전표 완료</span>'
        : '<span class="badge bg-light text-muted border">미처리</span>';
}

function openFundEditor(type, rowDataStr) {
    const owner=memberDetailOwner(), member=String(g_current_member_id || '');
    if (!owner || !member || window.frameElement?.hidden || memberFundState?.busy || !['capital','donation'].includes(type)
        || (type==='donation' && isAdminMemberSiteProfile())) return;
    captureMemberFundDraft();
    let record=null;
    try {record=rowDataStr ? JSON.parse(decodeURIComponent(rowDataStr)) : null;}
    catch (_) {return myAlert('내역을 불러오지 못했습니다. 다시 열어주세요.','error');}
    const key=JSON.stringify([owner,member,type,record?.id || 'new']);
    const held=memberFundDrafts.get(key);
    memberFundState=null;
    const modalEl = document.getElementById('fundEditorModal');
    modalEl.querySelectorAll('input,select,button').forEach(node=>{node.disabled=false;});
    const titleEl = document.getElementById('fund-modal-title');
    const delBtn = document.getElementById('btn-fund-delete'); // 삭제 버튼

    // 필드 초기화
    document.getElementById('fund-edit-type').value = type;
    document.getElementById('fund-edit-id').value = '';
    const memberJoinDate = String(g_current_member_row?.join_date || '').slice(0, 10);
    document.getElementById('fund-date').value = type === 'capital'
        && !rowDataStr
        && isAdminMemberSiteProfile()
        && /^\d{4}-\d{2}-\d{2}$/.test(memberJoinDate)
        ? memberJoinDate
        : getAdminMemberKstDateString();
    document.getElementById('fund-amount').value = '';
    document.getElementById('fund-note').value = '';
    g_fundDonationJournalCompleted = false;
    g_fundDonationOriginalNote = ''; g_fundDonationInitialMemo = '';
    const journalWrap = document.getElementById('fund-journal-status-wrap');
    journalWrap.hidden = type === 'capital';
    document.getElementById('fund-journal-status').innerHTML = renderDonationJournalStatus(false);
    document.getElementById('fund-depositor').value = '';

    // UI 분기 (출자금 vs 기부금)
    if (type === 'capital') {
        titleEl.innerText = '💰 출자금 입금 내역';
        titleEl.className = 'modal-title fw-bold text-success';
        document.getElementById('fund-method-group').style.display = 'none';
        document.getElementById('fund-depositor-group').style.display = 'block';

        if (!rowDataStr) document.getElementById('fund-depositor').value = document.getElementById('md-name').value;
    } else {
        titleEl.innerText = '🎁 자산수증이익 내역';
        titleEl.className = 'modal-title fw-bold text-primary';
        document.getElementById('fund-method-group').style.display = 'block';
        document.getElementById('fund-depositor-group').style.display = 'none';
        setMemberFundMethod('transfer');
    }

    // ★ [핵심] 수정 모드 vs 신규 모드
    if (rowDataStr) {
        // 수정 모드: 데이터 채우기 & 삭제 버튼 보이기
        try {
            const data = JSON.parse(decodeURIComponent(rowDataStr));
            document.getElementById('fund-edit-id').value = data.id;
            document.getElementById('fund-date').value = data.deposit_date || data.donation_date;
            document.getElementById('fund-amount').value = data.amount;
            document.getElementById('fund-note').value = data.note || '';

            if (type !== 'capital') {
                const noteParts = getDonationNoteParts(data.note);
                g_fundDonationJournalCompleted = noteParts.completed;
                g_fundDonationOriginalNote = String(data.note || '');
                g_fundDonationInitialMemo = noteParts.memo;
                document.getElementById('fund-note').value = noteParts.memo;
                document.getElementById('fund-journal-status').innerHTML = renderDonationJournalStatus(noteParts.completed);
            }

            if(type === 'capital') document.getElementById('fund-depositor').value = data.depositor || '';
            else setMemberFundMethod(Object.prototype.hasOwnProperty.call(data,'type') ? data.type : data.payment_method ?? null);

            // 삭제 버튼 노출
            delBtn.style.display = 'block';
        } catch (e) { CoopSafeLog.error("[erp/admin_member] operation failed", e); }
    } else {
        // 신규 모드: 삭제 버튼 숨김
        delBtn.style.display = 'none';
    }

    const state={key,owner,member,type,id:record?.id || null,source:memberFundSource(type,record),request:null,memberTextId:document.getElementById('md-id-text').innerText,
        baseline:memberFundSnapshot(),busy:false,uncertain:false,completed:false,
        journalCompleted:g_fundDonationJournalCompleted,journalOriginal:g_fundDonationOriginalNote,journalMemo:g_fundDonationInitialMemo};
    memberFundState=held ? {...held,busy:false,completed:false} : state;
    if (held) {
        if (type==='donation') setMemberFundMethod(new Map(held.values).get('fund-method'));
        for (const [id,value] of held.values) {const node=document.getElementById(id);if(node)node.value=value;}
        g_fundDonationJournalCompleted=held.journalCompleted;
        g_fundDonationOriginalNote=held.journalOriginal;g_fundDonationInitialMemo=held.journalMemo;
        document.getElementById('fund-journal-status').innerHTML=renderDonationJournalStatus(held.journalCompleted);
    }
    syncMemberFundDraftStatus();
    modalEl.style.zIndex = 2000;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function setMemberFundReadState(type, state, label = '') {
    const prefix = { ledger: 'capital', donation: 'donation', points: 'point', dividends: 'dividend' }[type];
    if (!prefix) return;
    g_member_fund_status[type] = state;
    const total = document.getElementById(`md-${prefix}-total`);
    const meta = document.getElementById(`md-${prefix}-meta`);
    if (state !== 'ready' && total) total.innerText = '—';
    if (!meta) return;
    const actions = meta.closest('.fund-summary-card')?.querySelector('.fund-summary-actions');
    actions?.querySelector('[data-member-fund-retry]')?.remove();
    meta.replaceChildren(document.createTextNode(label || (state === 'ready' ? '' : state === 'loading' ? '불러오는 중…' : '조회 실패')));
    if (state === 'error' && actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-secondary ms-2';
        button.textContent = '다시 조회';
        button.dataset.memberFundRetry = type;
        button.onclick = retryMemberFunds;
        actions.append(button);
    }
}

function retryMemberFunds() {
    const member = g_current_member_row;
    if (!member || String(member.id || member.member_uid || member.uid || '') !== String(g_current_member_id || '')) return;
    return loadMemberFunds(g_current_member_id, member.member_id, true);
}

function resetMemberFundsSummaryCards() {
    globalHistoryData = {
        ledger: [],
        donations: [],
        points: [],
        dividends: []
    };

    ['ledger', 'donation', 'points', 'dividends'].forEach(type => setMemberFundReadState(type, 'loading'));
} // End of resetMemberFundsSummaryCards

function isFinalizedDividendBatchStatus(status) {
    return ['FINALIZED', 'PAYMENT_READY', 'PARTIALLY_PAID', 'PAID'].includes(String(status || ''));
} // End of isFinalizedDividendBatchStatus

async function loadMemberRewardAndDividendSummary(uuid, textId) {
    const read = beginMemberDetailRead('rewards', uuid);
    if (!isCurrentMemberDetailRead(read)) return;
    try {
    const pointTotalEl = document.getElementById('md-point-total');
    const pointMetaEl = document.getElementById('md-point-meta');
    const dividendTotalEl = document.getElementById('md-dividend-total');
    const dividendMetaEl = document.getElementById('md-dividend-meta');

    if (pointMetaEl) pointMetaEl.innerText = '조회 중...';
    if (dividendMetaEl) dividendMetaEl.innerText = '조회 중...';

    if (textId && textId !== 'ID없음' && textId !== '-') {
        const { data: points, error: pointError } = await _supabase
            .from('coop_points')
            .select('created_at,change_amount,reason,transaction_type')
            .eq('member_id', textId)
            .order('created_at', { ascending: false })
            .limit(500);
        if (!isCurrentMemberDetailRead(read)) return;

        if (pointError) {
            CoopSafeLog.warn("조합원 이용실적 보상 원장 로드 실패:", pointError);
            globalHistoryData.points = [];
            setMemberFundReadState('points', 'error', '이용실적 조회 실패');
        } else {
            setMemberFundReadState('points', 'ready');
            globalHistoryData.points = Array.isArray(points) ? points : [];
            const pointTotal = globalHistoryData.points.reduce((sum, row) => sum + normalizeDividendExportNumber(row.change_amount), 0);
            if (pointTotalEl) pointTotalEl.innerText = `${Math.trunc(pointTotal).toLocaleString('ko-KR')} 원`;
            if (pointMetaEl) pointMetaEl.innerText = `${globalHistoryData.points.length.toLocaleString('ko-KR')}건 기준`;
        }
    } else if (pointMetaEl) {
        setMemberFundReadState('points', 'ready');
        if (pointTotalEl) pointTotalEl.innerText = '0 원';
        pointMetaEl.innerText = '조합원 번호 없음';
    }

    if (uuid) {
        const { data: dividendItems, error: dividendError } = await scopeAdminTenant(_supabase
            .from('coop_dividend_batch_items')
            .select('id,batch_id,capital_dividend_gross,usage_dividend_gross,gross_amount,income_tax_amount,local_income_tax_amount,net_amount,payment_status,payment_due_date,paid_at,created_at'))
            .eq('member_uuid', uuid)
            .order('created_at', { ascending: false })
            .limit(200);
        if (!isCurrentMemberDetailRead(read)) return;

        if (dividendError) {
            CoopSafeLog.warn("조합원 확정 배당 내역 로드 실패:", dividendError);
            globalHistoryData.dividends = [];
            setMemberFundReadState('dividends', 'error', '배당금 조회 실패');
            return;
        }

        const items = Array.isArray(dividendItems) ? dividendItems : [];
        const batchIds = [...new Set(items.map((item) => item.batch_id).filter(Boolean))];
        const batchMap = new Map();

        if (batchIds.length > 0) {
            const { data: batches, error: batchError } = await scopeAdminTenant(_supabase
                .from('coop_dividend_batches')
                .select('id,fiscal_year,title,status,payment_due_date,period_start,period_end'))
                .in('id', batchIds);
            if (!isCurrentMemberDetailRead(read)) return;

            if (batchError) {
                CoopSafeLog.warn("조합원 배당 회차 메타 로드 실패:", batchError);
                globalHistoryData.dividends = [];
                setMemberFundReadState('dividends', 'error', '배당금 조회 실패');
                return;
            } else {
                (batches || []).forEach((batch) => batchMap.set(String(batch.id), batch));
            }
        }

        globalHistoryData.dividends = items
            .map((item) => {
                const batch = batchMap.get(String(item.batch_id)) || {};
                return {
                    ...item,
                    fiscal_year: batch.fiscal_year || '-',
                    title: batch.title || '-',
                    status: batch.status || item.payment_status,
                    payment_due_date: item.payment_due_date || batch.payment_due_date,
                    payment_base_date: item.paid_at || item.payment_due_date || batch.payment_due_date,
                    total_amount: item.gross_amount
                };
            })
            .filter((item) => isFinalizedDividendBatchStatus(item.status));

        const unpaidRows = globalHistoryData.dividends.filter((item) => {
            return normalizeDividendExportNumber(item.net_amount) > 0
                && !['PAID', 'CANCELED'].includes(String(item.payment_status || ''));
        });
        const unpaidTotal = unpaidRows.reduce((sum, item) => sum + normalizeDividendExportNumber(item.net_amount), 0);

        setMemberFundReadState('dividends', 'ready');
        if (dividendTotalEl) dividendTotalEl.innerText = `${Math.trunc(unpaidTotal).toLocaleString('ko-KR')} 원`;
        if (dividendMetaEl) {
            dividendMetaEl.innerText = globalHistoryData.dividends.length > 0
                ? `확정 ${globalHistoryData.dividends.length.toLocaleString('ko-KR')}건 · 미지급 ${unpaidRows.length.toLocaleString('ko-KR')}건`
                : '확정 배당 내역 없음';
        }
    } else if (dividendMetaEl) {
        setMemberFundReadState('dividends', 'error', '조합원 정보 확인 필요');
    }
    } catch (error) {
        if (!isCurrentMemberDetailRead(read)) return;
        CoopSafeLog.error('[loadMemberRewardAndDividendSummary] load failed', error);
        ['points', 'dividends'].forEach(type => {
            if (g_member_fund_status[type] === 'loading') {
                globalHistoryData[type] = [];
                setMemberFundReadState(type, 'error');
            }
        });
    }
} // End of loadMemberRewardAndDividendSummary

function calculateMemberFundTotal(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((total, row) => {
        const amount = Number(row?.amount || 0);
        return Number.isFinite(amount) ? total + amount : total;
    }, 0);
} // End of calculateMemberFundTotal

function updateMemberFundSummary(type, rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const capital = type === 'capital';
    setMemberFundReadState(capital ? 'ledger' : 'donation', 'ready');
    const totalEl = document.getElementById(capital ? 'md-capital-total' : 'md-donation-total');
    const metaEl = document.getElementById(capital ? 'md-capital-meta' : 'md-donation-meta');
    const dateKey = capital ? 'deposit_date' : 'donation_date';
    const total = calculateMemberFundTotal(safeRows);
    const latestDate = safeRows.reduce((latest, row) => {
        const date = String(row?.[dateKey] || '').slice(0, 10);
        return date > latest ? date : latest;
    }, '');

    if (totalEl) totalEl.innerText = `${total.toLocaleString('ko-KR')} 원`;
    if (metaEl) {
        metaEl.innerText = safeRows.length > 0
            ? `총 ${safeRows.length.toLocaleString('ko-KR')}건${latestDate ? ` · 최근 ${latestDate}` : ''}`
            : '등록된 내역 없음';
    }
} // End of updateMemberFundSummary

// 조합원 자금 요약과 상세 모달이 같은 조회 결과를 재사용한다.
async function loadMemberFunds(uuid, textId, reset=false) {
    const read = beginMemberDetailRead('funds', uuid);
    if (!isCurrentMemberDetailRead(read)) return;
    if (reset) resetMemberFundsSummaryCards();
    else {
        ['ledger', 'donation', 'points', 'dividends'].forEach(type => setMemberFundReadState(type, 'loading'));
    }
    g_member_detail_requests.rewards = (g_member_detail_requests.rewards || 0) + 1;

    const safeTextId = String(textId || '').trim();
    const hasTextId = !!safeTextId && !['ID없음', '-'].includes(safeTextId);
    const safeUuid = String(uuid || '').trim();

    const readFailure = error => ({ data: null, error });
    const capitalPromise = Promise.resolve().then(() => fetchAdminMemberCapitalRows(safeTextId)).catch(readFailure);

    const capitalNotificationPromise = hasTextId && !isAdminMemberSiteProfile()
        ? Promise.resolve().then(() => _supabase.rpc('admin_list_member_capital_notification_status', {
            p_member_text_id: safeTextId
        })).catch(readFailure)
        : Promise.resolve({ data: [], error: null });

    let donationQuery = null;
    if (!isAdminMemberSiteProfile() && hasTextId) {
        donationQuery = scopeAdminTenant(_supabase
            .from('coop_donations')
            .select('*'))
            .eq('member_id', safeTextId)
            .order('donation_date', { ascending: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
    } else if (!isAdminMemberSiteProfile() && safeUuid) {
        donationQuery = scopeAdminTenant(_supabase
            .from('coop_donations')
            .select('*'))
            .eq('member_uid', safeUuid)
            .order('donation_date', { ascending: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
    }
    const donationPromise = Promise.resolve(donationQuery || { data: [], error: null }).catch(readFailure);

    const [capitalResult, donationResult, capitalNotificationResult] = await Promise.all([
        capitalPromise,
        donationPromise,
        capitalNotificationPromise
    ]);
    if (!isCurrentMemberDetailRead(read)) return;
    if (capitalResult.error) CoopSafeLog.error("출자금 로드 실패:", capitalResult.error);
    if (donationResult.error) CoopSafeLog.error("기부금 로드 실패:", donationResult.error);
    if (capitalNotificationResult.error) CoopSafeLog.error("출자금 알림 상태 로드 실패:", capitalNotificationResult.error);

    const capitalNotificationMap = new Map();
    (Array.isArray(capitalNotificationResult.data) ? capitalNotificationResult.data : []).forEach(function (row) {
        capitalNotificationMap.set(String(row?.capital_id || ''), row);
    });
    globalHistoryData.ledger = (Array.isArray(capitalResult.data) ? capitalResult.data : []).map(function (row) {
        const notification = capitalNotificationMap.get(String(row?.id || ''));
        if (!notification) return row;
        return {
            ...row,
            capital_notification_event_type: notification.notification_event_type,
            capital_notification_status: notification.delivery_status,
            capital_notification_error_code: notification.error_code,
            capital_notification_requested_at: notification.requested_at,
            capital_notification_accepted_at: notification.accepted_at,
            capital_notification_attempt_count: notification.attempt_count
        };
    });
    globalHistoryData.donations = Array.isArray(donationResult.data) ? donationResult.data : [];
    if (capitalResult.error) {
        globalHistoryData.ledger = [];
        setMemberFundReadState('ledger', 'error', '출자금 조회 실패');
    } else updateMemberFundSummary('capital', globalHistoryData.ledger);
    if (donationResult.error) {
        globalHistoryData.donations = [];
        setMemberFundReadState('donation', 'error', '자산수증이익 조회 실패');
    } else if (!isAdminMemberSiteProfile()) updateMemberFundSummary('donation', globalHistoryData.donations);

    if (!isAdminMemberSiteProfile()) await loadMemberRewardAndDividendSummary(uuid, textId);
} // End of loadMemberFunds

// [최종] 자금 내역 삭제 함수
async function deleteFundData() {
    const state=memberFundState, modal=document.getElementById('fundEditorModal');
    if (!isCurrentMemberFund(state) || !state.id || state.busy || state.uncertain || window.frameElement?.hidden || !modal?.classList.contains('show')) return;
    const before=JSON.stringify(memberFundSnapshot());
    myConfirm('이 내역을 삭제할까요?',async()=>{
        if (!isCurrentMemberFund(state) || state.busy || state.uncertain || window.frameElement?.hidden || !modal.classList.contains('show')) return;
        if (before!==JSON.stringify(memberFundSnapshot())) return myAlert('작성 내용이 바뀌었습니다. 다시 확인해 주세요.','warning');
        captureMemberFundDraft();state.busy=true;syncMemberFundDraftStatus();
        const locked=Array.from(modal.querySelectorAll('input,select,button')).map(node=>[node,node.disabled]);
        locked.forEach(([node])=>{node.disabled=true;});showLoading(true);
        try {
            const {data,error}=await _supabase.rpc('admin_apply_member_fund_secure',memberFundRequest(state,'delete',{}));
            if (!isCurrentMemberFund(state)) return;
            if (error) {
                if (!error.code || /fetch|network|timeout/i.test(String(error.code))) state.uncertain=true;
                myAlert('삭제하지 못했습니다. '+error.message,'error');return;
            }
            if (data?.outcome==='conflict') {resolveMemberFundConflict(state,data.current);return;}
            if (data?.outcome!=='deleted' || Number(data.deleted_id)!==Number(state.id)) throw Error('FUND_RESULT_UNCONFIRMED');
            state.completed=true;memberFundDrafts.delete(state.key);
            memberFundFields().forEach(node=>window.ErpWorkspaceResume?.checkpoint(node));
            void loadMemberFunds(state.member,state.memberTextId,true);void loadDashboard();
            runAfterFundEditorClosed(()=>{if(isCurrentMemberFund(state))myAlert('삭제했습니다.');});
        } catch (_) {
            if (isCurrentMemberFund(state)) {
                if(!state.completed)state.uncertain=true;
                myAlert(state.completed?'삭제했습니다. 목록을 다시 불러와 주세요.':'삭제 결과를 확인하지 못했습니다. 내역을 확인해 주세요.','warning');
            }
        } finally {
            state.busy=false;
            locked.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=isCurrentMemberFund(state)?disabled:true;});
            if(isCurrentMemberFund(state)){captureMemberFundDraft();syncMemberFundDraftStatus();}showLoading(false);
        }
    });
}

let capitalNotificationPromptState = {
    context: null,
    onComplete: null,
    sending: false
};

function normalizeCapitalNotificationPromptContext(value) {
    const source = value && typeof value === 'object' ? value : {};
    const capitalId = Number(source.capital_id || source.capitalId || 0);
    const reflectionAmount = Number(source.reflection_amount || source.reflectionAmount || 0);
    const balanceAfter = Number(source.balance_after || source.balanceAfter || 0);
    const eventType = String(source.event_type || source.notification_event_type || source.eventType || '').trim();
    return {
        capitalId: Number.isInteger(capitalId) && capitalId > 0 ? capitalId : 0,
        memberName: String(source.member_name || source.memberName || '조합원').trim() || '조합원',
        memberTextId: String(source.member_text_id || source.memberTextId || '').trim(),
        reflectionDate: String(source.reflection_date || source.reflectionDate || '').slice(0, 10),
        reflectionAmount: Number.isFinite(reflectionAmount) ? reflectionAmount : 0,
        balanceAfter: Number.isFinite(balanceAfter) ? balanceAfter : 0,
        eventType: eventType === 'capital_membership_complete'
            ? 'capital_membership_complete'
            : 'capital_reflection',
        notificationKind: eventType === 'capital_membership_complete'
            ? 'membership_complete'
            : 'capital_reflection'
    };
} // End of normalizeCapitalNotificationPromptContext

function getCapitalNotificationDisplayCopy(context) {
    const membershipComplete = context?.notificationKind === 'membership_complete';
    return membershipComplete
        ? {
            title: '조합원 가입 완료 알림톡',
            subtitle: '정상 조합원 전환이 완료되었습니다.',
            description: '위 내용으로 조합원 가입 완료 안내를 보낼까요? 나중에 출자금 내역에서 다시 발송할 수 있습니다.',
            label: '조합원 가입 완료 알림톡'
        }
        : {
            title: '출자금 반영 알림톡',
            subtitle: '출자금 원장 저장은 완료되었습니다.',
            description: '위 내용으로 조합원에게 공식 반영 안내를 보낼까요? 나중에 출자금 내역에서 다시 발송할 수 있습니다.',
            label: '출자금 반영 알림톡'
        };
} // End of getCapitalNotificationDisplayCopy

function setCapitalNotificationFeedback(message, type) {
    const feedbackEl = document.getElementById('capitalNotificationFeedback');
    if (!feedbackEl) return;
    const safeMessage = String(message || '').trim();
    feedbackEl.className = `capital-notification-feedback alert mt-3 mb-0 alert-${type === 'danger' ? 'danger' : 'warning'}`;
    feedbackEl.textContent = safeMessage;
    feedbackEl.classList.toggle('d-none', !safeMessage);
} // End of setCapitalNotificationFeedback

function setCapitalNotificationSending(sending) {
    capitalNotificationPromptState.sending = sending === true;
    const laterButton = document.getElementById('capitalNotificationLaterButton');
    const sendButton = document.getElementById('capitalNotificationSendButton');
    const sendLabel = sendButton?.querySelector('.capital-notification-send-label');
    const spinner = document.getElementById('capitalNotificationSpinner');
    if (laterButton) laterButton.disabled = capitalNotificationPromptState.sending;
    if (sendButton) sendButton.disabled = capitalNotificationPromptState.sending;
    if (sendLabel) sendLabel.classList.toggle('d-none', capitalNotificationPromptState.sending);
    if (spinner) spinner.classList.toggle('d-none', !capitalNotificationPromptState.sending);
} // End of setCapitalNotificationSending

function completeCapitalNotificationPrompt(result) {
    if (capitalNotificationPromptState.sending) return;
    const modalEl = document.getElementById('capitalNotificationConfirmModal');
    const onComplete = capitalNotificationPromptState.onComplete;
    const notificationKind = capitalNotificationPromptState.context?.notificationKind || 'capital_reflection';
    capitalNotificationPromptState.onComplete = null;

    const finish = function () {
        capitalNotificationPromptState.context = null;
        if (typeof onComplete !== 'function') return;
        try {
            Promise.resolve(onComplete({
                ...(result || { outcome: 'deferred' }),
                notificationKind
            })).catch(function (error) {
                CoopSafeLog.error("[capital notification] completion failed:", error);
                myAlert('후속 화면 처리 중 오류가 발생했습니다: ' + (error?.message || error), 'error');
            });
        } catch (error) {
            CoopSafeLog.error("[capital notification] completion failed:", error);
            myAlert('후속 화면 처리 중 오류가 발생했습니다: ' + (error?.message || error), 'error');
        }
    };

    const modalInstance = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
    if (modalEl && modalInstance && modalEl.classList.contains('show')) {
        modalEl.addEventListener('hidden.bs.modal', finish, { once: true });
        moveFocusOutsideModal(modalEl);
        modalInstance.hide();
        return;
    }
    finish();
} // End of completeCapitalNotificationPrompt

function deferCapitalNotificationPrompt() {
    completeCapitalNotificationPrompt({ outcome: 'deferred' });
} // End of deferCapitalNotificationPrompt

function openCapitalNotificationPrompt(context, onComplete) {
    const normalized = normalizeCapitalNotificationPromptContext(context);
    if (!normalized.capitalId) {
        if (typeof onComplete === 'function') onComplete({ outcome: 'unavailable' });
        return;
    }

    capitalNotificationPromptState.context = normalized;
    capitalNotificationPromptState.onComplete = typeof onComplete === 'function' ? onComplete : null;
    setCapitalNotificationSending(false);
    setCapitalNotificationFeedback('', 'warning');

    const memberEl = document.getElementById('capitalNotificationMember');
    const dateEl = document.getElementById('capitalNotificationDate');
    const amountEl = document.getElementById('capitalNotificationAmount');
    const balanceEl = document.getElementById('capitalNotificationBalance');
    const titleEl = document.getElementById('capitalNotificationConfirmTitle');
    const subtitleEl = document.getElementById('capitalNotificationSubtitle');
    const descriptionEl = document.getElementById('capitalNotificationDescription');
    const displayCopy = getCapitalNotificationDisplayCopy(normalized);
    if (titleEl) titleEl.textContent = displayCopy.title;
    if (subtitleEl) subtitleEl.textContent = displayCopy.subtitle;
    if (descriptionEl) descriptionEl.textContent = displayCopy.description;
    if (memberEl) {
        memberEl.textContent = normalized.memberTextId
            ? `${normalized.memberName} (${normalized.memberTextId})`
            : normalized.memberName;
    }
    if (dateEl) dateEl.textContent = normalized.reflectionDate || '-';
    if (amountEl) amountEl.textContent = `${normalized.reflectionAmount.toLocaleString('ko-KR')}원`;
    if (balanceEl) balanceEl.textContent = `${normalized.balanceAfter.toLocaleString('ko-KR')}원`;

    const laterButton = document.getElementById('capitalNotificationLaterButton');
    const sendButton = document.getElementById('capitalNotificationSendButton');
    if (laterButton) laterButton.onclick = deferCapitalNotificationPrompt;
    if (sendButton) sendButton.onclick = sendCapitalReflectionNotification;

    const modalEl = document.getElementById('capitalNotificationConfirmModal');
    applyAdminMemberModalLayer(modalEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
} // End of openCapitalNotificationPrompt

function getCapitalNotificationOutcomeMessage(result) {
    const outcome = String(result?.outcome || '').trim();
    const label = result?.notificationKind === 'membership_complete'
        ? '조합원 가입 완료 알림톡'
        : '출자금 반영 알림톡';
    if (outcome === 'accepted') {
        return { message: `${label} 발송이 접수되었습니다.`, type: 'success' };
    }
    if (outcome === 'processing') {
        return { message: '이미 발송 처리 중인 알림입니다. 출자금 내역에서 상태를 확인할 수 있습니다.', type: 'warning' };
    }
    if (outcome === 'unknown') {
        return { message: '발송 결과를 확정할 수 없어 중복 발송을 막았습니다. 솔라피 발송 내역을 확인해주세요.', type: 'warning' };
    }
    if (outcome === 'unavailable') {
        return { message: '출자금은 저장되었지만 알림 발송 정보를 준비하지 못했습니다.', type: 'warning' };
    }
    return {
        message: result?.notificationKind === 'membership_complete'
            ? '조합원 상태는 정상으로 변경되었으며 가입 완료 알림톡은 나중에 출자금 내역에서 발송할 수 있습니다.'
            : '출자금은 저장되었으며 알림톡은 나중에 출자금 내역에서 발송할 수 있습니다.',
        type: 'success'
    };
} // End of getCapitalNotificationOutcomeMessage

async function sendApprovedExtraCapitalNotification(capitalId) {
    const numericCapitalId = Number(capitalId || 0);
    if (!Number.isInteger(numericCapitalId) || numericCapitalId <= 0) {
        return {
            outcome: 'unavailable',
            message: '승인과 장부 기록은 완료되었지만 알림톡 발송 대상 원장을 확인하지 못했습니다.',
            type: 'warning'
        };
    }

    try {
        const { data, error } = await invokeAdminMemberEdgeFunction('send-capital-reflection-kakao', {
            capitalId: numericCapitalId
        });
        if (error) {
            const detail = await getAdminMemberEdgeErrorMessage(error);
            return {
                outcome: 'failed',
                message: `승인과 장부 기록은 완료되었지만 알림톡 발송 요청에 실패했습니다. 출자금 내역에서 다시 보낼 수 있습니다.\n${detail}`,
                type: 'warning'
            };
        }

        if (data?.accepted === true) {
            return {
                outcome: 'accepted',
                message: '출자금 반영 알림톡 발송이 접수되었습니다.',
                type: 'success'
            };
        }

        const skipped = String(data?.skipped || '').trim();
        const deliveryStatus = String(data?.delivery_status || '').trim();
        if (skipped === 'already_attempted' && deliveryStatus === 'accepted') {
            return {
                outcome: 'accepted',
                message: '출자금 반영 알림톡은 이미 발송 접수되었습니다.',
                type: 'success'
            };
        }
        if (skipped === 'already_attempted' && deliveryStatus === 'processing') {
            return {
                outcome: 'processing',
                message: '출자금 반영 알림톡이 이미 발송 처리 중입니다.',
                type: 'warning'
            };
        }
        if (skipped === 'already_attempted' && deliveryStatus === 'unknown') {
            return {
                outcome: 'unknown',
                message: '알림톡 발송 결과를 확정할 수 없어 중복 발송을 막았습니다. 솔라피 발송 내역을 확인해주세요.',
                type: 'warning'
            };
        }
        if (skipped === 'template_not_sendable') {
            return {
                outcome: 'deferred',
                message: '승인과 장부 기록은 완료되었지만 템플릿이 아직 발송 가능한 상태가 아닙니다. 출자금 내역에서 다시 보낼 수 있습니다.',
                type: 'warning'
            };
        }
        if (skipped === 'member_phone_unavailable') {
            return {
                outcome: 'deferred',
                message: '승인과 장부 기록은 완료되었지만 조합원 전화번호가 없거나 형식이 올바르지 않아 알림톡을 보내지 못했습니다.',
                type: 'warning'
            };
        }
        if (skipped === 'kakao_member_alerts_disabled') {
            return {
                outcome: 'deferred',
                message: '승인과 장부 기록은 완료되었지만 이 조합의 조합원 알림톡 기능이 꺼져 있습니다.',
                type: 'warning'
            };
        }
        if (skipped === 'kakao_capital_reflection_not_configured') {
            return {
                outcome: 'deferred',
                message: '승인과 장부 기록은 완료되었지만 출자금 반영 알림톡 설정이 완료되지 않았습니다.',
                type: 'warning'
            };
        }
        if (skipped === 'kakao_first_capital_not_configured') {
            return {
                outcome: 'deferred',
                message: '승인과 장부 기록은 완료되었지만 조합원 가입 완료 알림톡 설정이 완료되지 않았습니다.',
                type: 'warning'
            };
        }
        return {
            outcome: 'deferred',
            message: '승인과 장부 기록은 완료되었지만 알림톡 발송이 완료되지 않았습니다. 출자금 내역에서 다시 보낼 수 있습니다.',
            type: 'warning'
        };
    } catch (error) {
        CoopSafeLog.error("[sendApprovedExtraCapitalNotification] failed:", error);
        return {
            outcome: 'failed',
            message: '승인과 장부 기록은 완료되었지만 알림톡 발송 요청 중 오류가 발생했습니다. 출자금 내역에서 다시 보낼 수 있습니다.',
            type: 'warning'
        };
    }
} // End of sendApprovedExtraCapitalNotification

async function sendCapitalReflectionNotification() {
    if (capitalNotificationPromptState.sending) return;
    const context = capitalNotificationPromptState.context;
    if (!context?.capitalId) {
        setCapitalNotificationFeedback('발송할 출자금 내역을 확인할 수 없습니다.', 'danger');
        return;
    }

    setCapitalNotificationFeedback('', 'warning');
    setCapitalNotificationSending(true);
    try {
        const { data, error } = await invokeAdminMemberEdgeFunction('send-capital-reflection-kakao', {
            capitalId: context.capitalId
        });
        if (error) throw error;

        if (data?.accepted === true) {
            setCapitalNotificationSending(false);
            completeCapitalNotificationPrompt({ outcome: 'accepted' });
            return;
        }

        const skipped = String(data?.skipped || '').trim();
        const deliveryStatus = String(data?.delivery_status || '').trim();
        if (skipped === 'already_attempted' && ['accepted', 'processing', 'unknown'].includes(deliveryStatus)) {
            setCapitalNotificationSending(false);
            completeCapitalNotificationPrompt({ outcome: deliveryStatus });
            return;
        }
        if (skipped === 'template_not_sendable') {
            setCapitalNotificationFeedback('템플릿이 아직 발송 가능한 상태가 아닙니다. 검수 승인 후 이 내역에서 다시 보내주세요.', 'warning');
            return;
        }
        if (skipped === 'member_phone_unavailable') {
            setCapitalNotificationFeedback('조합원 전화번호가 없거나 형식이 올바르지 않습니다. 기본 정보를 수정한 뒤 다시 보내주세요.', 'warning');
            return;
        }
        if (skipped === 'kakao_member_alerts_disabled') {
            setCapitalNotificationFeedback('이 조합의 조합원 알림톡 기능이 꺼져 있습니다.', 'warning');
            return;
        }
        if (skipped === 'kakao_capital_reflection_not_configured') {
            setCapitalNotificationFeedback('출자금 반영 알림톡 설정이 완료되지 않았습니다.', 'warning');
            return;
        }
        if (skipped === 'kakao_first_capital_not_configured') {
            setCapitalNotificationFeedback('조합원 가입 완료 알림톡 설정이 완료되지 않았습니다.', 'warning');
            return;
        }
        setCapitalNotificationFeedback('발송이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.', 'warning');
    } catch (error) {
        CoopSafeLog.error("[sendCapitalReflectionNotification] failed:", error);
        setCapitalNotificationFeedback('알림톡 발송 요청에 실패했습니다: ' + (error?.message || error), 'danger');
    } finally {
        setCapitalNotificationSending(false);
    }
} // End of sendCapitalReflectionNotification

function openCapitalNotificationFromHistory(capitalId) {
    const numericCapitalId = Number(capitalId || 0);
    const item = (Array.isArray(globalHistoryData.ledger) ? globalHistoryData.ledger : []).find(function (row) {
        return Number(row?.id || 0) === numericCapitalId;
    });
    if (!item) {
        myAlert('출자금 내역을 다시 불러온 뒤 시도해주세요.', 'warning');
        return;
    }

    const context = {
        capital_id: numericCapitalId,
        member_name: String(document.getElementById('md-name')?.value || '조합원').trim() || '조합원',
        member_text_id: String(document.getElementById('md-id-text')?.innerText || '').trim(),
        reflection_date: item.deposit_date,
        reflection_amount: item.amount,
        balance_after: calculateMemberFundTotal(globalHistoryData.ledger),
        event_type: item.capital_notification_event_type
    };
    openCapitalNotificationPrompt(context, async function (result) {
        const memberUid = String(document.getElementById('md-uid')?.value || '').trim();
        const memberTextId = String(document.getElementById('md-id-text')?.innerText || '').trim();
        await loadMemberFunds(memberUid, memberTextId, true);
        if (activeMemberHistoryType === 'ledger') renderMemberHistoryContent('ledger');
        if (String(result?.outcome || '') !== 'deferred') {
            const outcomeMessage = getCapitalNotificationOutcomeMessage(result);
            myAlert(outcomeMessage.message, outcomeMessage.type);
        }
    });
} // End of openCapitalNotificationFromHistory

function continueAfterCapitalNotification(result) {
    const outcomeMessage = getCapitalNotificationOutcomeMessage(result);
    myAlert(outcomeMessage.message, outcomeMessage.type);
} // End of continueAfterCapitalNotification

function applyActivatedMemberStatusToAdminUi(memberTextId) {
    const statusEl = document.getElementById('md-status');
    if (statusEl) statusEl.value = '정상';

    if (g_current_member_row) g_current_member_row.status = '정상';
    if (Array.isArray(g_members)) {
        g_members.forEach((member) => {
            if (String(member?.member_id || '') === String(memberTextId || '')) {
                member.status = '정상';
            }
        });
    }
} // End of applyActivatedMemberStatusToAdminUi

function promptMemberActivationAfterCapitalSave(memberTextId, memberUid, capitalContext) {
    const safeMemberTextId = String(memberTextId || '').trim();
    if (!safeMemberTextId || safeMemberTextId === 'ID없음' || safeMemberTextId === '-') return;

    const capitalId = Number(capitalContext?.capital_id || 0);
    if (!Number.isInteger(capitalId) || capitalId <= 0) {
        myAlert('출자금은 저장되었지만 정상 전환에 필요한 원장 번호를 확인하지 못했습니다.', 'warning');
        return;
    }

    const memberName = String(document.getElementById('md-name')?.value || '해당 조합원').trim() || '해당 조합원';
    const message = isAdminMemberSiteProfile()
        ? `${memberName} 조합원의 첫 출자금이 저장되었습니다.\n조합원 상태를 정상(정조합원)으로 변경할까요?`
        : `${memberName} 조합원의 첫 출자금이 저장되었습니다.\n조합원 상태를 정상(정조합원)으로 변경할까요?\n\n정상 전환 후 가입 완료 알림톡 발송 여부를 선택할 수 있습니다.`;

    myConfirm(message, async () => {
        showLoading(true);
        const activationParams = isAdminMemberSiteProfile()
            ? { p_member_text_id: safeMemberTextId }
            : { p_member_text_id: safeMemberTextId, p_capital_id: capitalId };
        const { data, error } = await _supabase.rpc('admin_activate_member_after_first_capital_secure', activationParams);
        showLoading(false);

        if (error) {
            myAlert('상태 변경 실패: ' + error.message, 'error');
            return;
        }

        if (data?.success === true && data?.current_status === '정상') {
            applyActivatedMemberStatusToAdminUi(safeMemberTextId);
            showLoading(true);
            try {
                await loadMemberFunds(memberUid, safeMemberTextId, true);
                if (activeMemberHistoryType === 'ledger') renderMemberHistoryContent('ledger');
            } finally {
                showLoading(false);
            }
            loadDashboard();

            if (!isAdminMemberSiteProfile() && data?.notification_available === true && Number(data?.capital_id || 0) > 0) {
                openCapitalNotificationPrompt(data, async function (result) {
                    showLoading(true);
                    try {
                        await loadMemberFunds(memberUid, safeMemberTextId, true);
                        if (activeMemberHistoryType === 'ledger') renderMemberHistoryContent('ledger');
                    } finally {
                        showLoading(false);
                    }
                    continueAfterCapitalNotification(result);
                });
                return;
            }

            myAlert(
                isAdminMemberSiteProfile()
                    ? '조합원 상태가 정상(정조합원)으로 변경되었습니다.'
                    : (data.message || '조합원 상태가 정상(정조합원)으로 변경되었습니다. 가입 완료 알림은 출자금 내역에서 확인해주세요.'),
                isAdminMemberSiteProfile() ? 'success' : 'warning'
            );
            return;
        }

        myAlert(data?.message || '상태 변경 조건에 해당하지 않아 조합원 상태는 유지했습니다.', 'warning');
    });
} // End of promptMemberActivationAfterCapitalSave

function runAfterFundEditorClosed(callback) {
    const modalEl = document.getElementById('fundEditorModal');
    const modalInstance = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
    if (modalEl && modalInstance && modalEl.classList.contains('show')) {
        modalEl.addEventListener('hidden.bs.modal', callback, { once: true });
        modalInstance.hide();
        return;
    }
    callback();
} // End of runAfterFundEditorClosed

// [수정] 저장 실행 (Foreign Key 에러 방지 적용)
async function saveFundData() {
    const state=memberFundState;
    if (!isCurrentMemberFund(state) || state.busy || state.uncertain || window.frameElement?.hidden
        || !document.getElementById('fundEditorModal')?.classList.contains('show')) return;
    // 1. 폼 데이터 수집
    const type = document.getElementById('fund-edit-type').value;

    // ID가 빈 문자열이면 null로 보내야 DB에서 INSERT로 인식함
    let idVal = document.getElementById('fund-edit-id').value;
    if (!idVal || idVal.trim() === '') idVal = null;

    const amount = Number(ERPNumberInput.raw(document.getElementById('fund-amount').value));
    const date = document.getElementById('fund-date').value;
    const memo = document.getElementById('fund-note').value;
    // Preserve the existing accounting marker; editing a memo never removes posting state.
    const note = type !== 'capital' && memo === g_fundDonationInitialMemo
        ? g_fundDonationOriginalNote
        : type !== 'capital' && g_fundDonationJournalCompleted && !memo.includes('[전표완료]')
            ? (memo ? `${memo} [전표완료]` : '[전표완료]')
            : memo;
    const isNewCapital = type === 'capital' && idVal === null;

    // 유효성 검사
    if (!Number.isSafeInteger(amount) || amount <= 0) return myAlert('정확한 금액을 입력해주세요.', 'warning');
    if (!date) return myAlert('날짜를 선택해주세요.', 'warning');

    // 현재 상세 모달에 띄워진 조합원 정보 가져오기
    const memberUid = document.getElementById('md-uid').value;           // UUID
    const memberTextId = document.getElementById('md-id-text').innerText; // 텍스트 ID (예: 2024-001)
    if (memberUid!==state.member || memberTextId!==state.memberTextId || type!==state.type || String(idVal || '')!==String(state.id || '')) return;
    captureMemberFundDraft();
    state.busy=true;syncMemberFundDraftStatus();
    const locked=Array.from(document.querySelectorAll('#fundEditorModal input,#fundEditorModal select,#fundEditorModal button')).map(node=>[node,node.disabled]);
    locked.forEach(([node])=>{node.disabled=true;});
    try {

    showLoading(true);

    const values={amount,date,note};
    if(type==='capital') values.depositor=document.getElementById('fund-depositor').value;
    else {
        const method=document.getElementById('fund-method').value;
        values.method=method==='' && state.source?.method==null ? null : method;
    }

    // 3. RPC 호출
    const { data, error } = await _supabase.rpc('admin_apply_member_fund_secure',memberFundRequest(state,'save',values));
    if (!isCurrentMemberFund(state)) return;

    showLoading(false);

    if (error) {
        if (!error.code || /fetch|network|timeout/i.test(String(error.code))) state.uncertain=true;
        myAlert('저장 실패: ' + error.message, 'error');
    } else {
        if(data?.outcome==='conflict'){resolveMemberFundConflict(state,data.current);return;}
        if(data?.outcome!=='saved')throw Error('FUND_RESULT_UNCONFIRMED');
        state.completed=true;memberFundDrafts.delete(state.key);
        memberFundFields().forEach(node=>window.ErpWorkspaceResume?.checkpoint(node));
        if(type==='capital' && data?.member_join_date) acceptMemberFundJoinDate(state,data.member_join_date);
        const requiresActivation = isNewCapital && data?.requires_activation === true;
        const hasCapitalNotificationPrompt = !isAdminMemberSiteProfile()
            && isNewCapital
            && !requiresActivation
            && Boolean(data?.capital_id)
            && data?.notification_event_type === 'capital_reflection';
        // 신규 출자금은 알림 선택이 끝난 뒤 원장과 알림 상태를 한 번에 다시 읽는다.
        if (!hasCapitalNotificationPrompt) {
            loadMemberFunds(memberUid, memberTextId, true);
        }

        // 대시보드 통계도 갱신 (금액이 변했으므로)
        loadDashboard();

        runAfterFundEditorClosed(function () {
            if (!isCurrentMemberFund(state)) return;
            if (hasCapitalNotificationPrompt) {
                openCapitalNotificationPrompt(data, async function (result) {
                    showLoading(true);
                    try {
                        await loadMemberFunds(memberUid, memberTextId, true);
                        if (activeMemberHistoryType === 'ledger') renderMemberHistoryContent('ledger');
                    } finally {
                        showLoading(false);
                    }
                    continueAfterCapitalNotification(result);
                });
                return;
            }
            if (requiresActivation) {
                promptMemberActivationAfterCapitalSave(memberTextId, memberUid, data);
                return;
            }
            myAlert('성공적으로 저장되었습니다.');
        });
    }
    } catch (error) {
        if (isCurrentMemberFund(state)) {
            if (!state.completed) state.uncertain=true;
            myAlert(state.completed ? '저장했습니다. 목록을 다시 불러와 주세요.' : '저장 결과를 확인하지 못했습니다. 내역을 확인해 주세요.','warning');
        }
    } finally {
        state.busy=false;
        locked.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=isCurrentMemberFund(state)?disabled:true;});
        if (isCurrentMemberFund(state)) {captureMemberFundDraft();syncMemberFundDraftStatus();}
        showLoading(false);
    }
} // End of saveFundData


// 1. [유틸] 알럿 -> 모달 대체
function myAlert(msg, type='success') {
const iconEl = document.getElementById('alertIcon');
const textEl = document.getElementById('alertText');
if (iconEl) {
iconEl.textContent = '';
const icon = document.createElement('i');
if (type === 'warning') {
icon.className = 'bi bi-exclamation-triangle-fill text-warning';
} else if (type === 'error') {
icon.className = 'bi bi-exclamation-triangle-fill text-danger';
} else {
icon.className = 'bi bi-check-circle-fill text-success';
}
icon.style.fontSize = '2rem';
iconEl.appendChild(icon);
}
if (textEl) textEl.textContent = msg || '';
bootstrap.Modal.getOrCreateInstance(document.getElementById('customAlertModal')).show();
}

function myConfirm(msg, callback) {
document.getElementById('confirmText').textContent = msg || '';
const btn = document.getElementById('btnConfirmYes');
const modalEl = document.getElementById('customConfirmModal');

// 이벤트 리스너 중복 방지를 위한 노드 복제 교체
const newBtn = btn.cloneNode(true);
btn.parentNode.replaceChild(newBtn, btn);

newBtn.onclick = () => {
const inst = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
const runCallback = () => {
try {
Promise.resolve(callback()).catch((err) => {
CoopSafeLog.error("confirm callback failed:", err);
myAlert('처리 중 오류가 발생했습니다: ' + (err?.message || err), 'error');
});
} catch (err) {
CoopSafeLog.error("confirm callback failed:", err);
myAlert('처리 중 오류가 발생했습니다: ' + (err?.message || err), 'error');
}
};
modalEl.addEventListener('hidden.bs.modal', runCallback, { once: true });
moveFocusOutsideModal(modalEl);
requestAnimationFrame(() => moveFocusOutsideModal(modalEl));
inst.hide();
};
bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

// 2. [유틸] 자동 하이픈 (HTML oninput="autoHyphen(this)" 연결 필요)

function autoHyphen(target) {
    // 숫자만 남기고 제거
    let val = target.value.replace(/[^0-9]/g, '');

    if(target.id === 'md-phone' || target.id === 'create-personal-phone' || target.id === 'create-group-phone') { // 전화번호
        if(val.length < 4) target.value = val;
        else if(val.length < 7) target.value = val.substr(0, 3) + '-' + val.substr(3);
        else if(val.length < 11) target.value = val.substr(0, 3) + '-' + val.substr(3, 3) + '-' + val.substr(6);
        else target.value = val.substr(0, 3) + '-' + val.substr(3, 4) + '-' + val.substr(7);

    } else if(target.id === 'md-rrn' || target.id === 'create-personal-rrn') { // 주민번호 (6-7)
        if(val.length < 7) target.value = val;
        else target.value = val.substr(0, 6) + '-' + val.substr(6, 7);

    } else if(target.id === 'md-corp-num' || target.id === 'create-group-corp-num') { // [추가] 법인번호 (6-7)
        // 예: 110111-1234567
        if(val.length < 7) target.value = val;
        else target.value = val.substr(0, 6) + '-' + val.substr(6);

    } else if(target.id === 'md-biz-num' || target.id === 'create-group-biz-num') { // [추가] 사업자번호 (3-2-5)
        // 예: 123-45-67890
        if(val.length < 4) target.value = val;
        else if(val.length < 6) target.value = val.substr(0, 3) + '-' + val.substr(3);
        else target.value = val.substr(0, 3) + '-' + val.substr(3, 2) + '-' + val.substr(5);
    }
}



// 1. 단체 검색 모달 열기
function openGroupSearch() {
if (memberGroupConnectPending) return;
const state = createMemberGroupSearchState();
if (!state) return;
memberGroupSearchState = state;
memberGroupConfirmation = null;
document.getElementById('group-search-input').value = '';
document.getElementById('group-search-result').innerHTML = '';
const modalEl = document.getElementById('groupSearchModal');
if (modalEl) {
modalEl.addEventListener('shown.bs.modal', () => {
document.getElementById('group-search-input')?.focus();
}, { once: true });
bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
}

// 2. 검색 실행
async function searchGroups() {
if (memberGroupConnectPending) return;
const keyword = document.getElementById('group-search-input').value.trim();
if (!isCurrentMemberGroupSearch()) {
    memberGroupSearchState = createMemberGroupSearchState();
    if (!isCurrentMemberGroupSearch()) return;
}
const state = memberGroupSearchState;
const list = document.getElementById('group-search-result');
if (!keyword) { state.read = null; state.result = null; list.textContent = '단체명을 입력하고 검색해 주세요.'; return; }
if (state.read?.keyword === keyword) return state.read.promise;
memberGroupConfirmation = null;
state.result = null;
const request = {keyword,promise:null};
state.read = request;
const current = () => isCurrentMemberGroupSearch(state) && state.read === request
    && document.getElementById('group-search-input').value.trim() === keyword;
list.innerHTML = '<div class="p-3 text-center text-muted">검색 중...</div>';
request.promise = (async () => {
try {
const { data, error } = await _supabase.rpc('search_groups', { keyword });
if (!current()) return;
if (error) throw error;
state.result = request;
list.innerHTML = '';

if(!data || data.length===0) { list.innerHTML = '<div class="p-3 text-center text-muted">결과 없음</div>'; return; }

    data.forEach(g => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action';
    if (g.rep_name) {
    btn.classList.add('list-group-item-warning');
    btn.title = '이미 관리자에게 연결된 단체입니다.';
    btn.addEventListener('click', () => {
    myAlert('이미 관리자에게 연결된 단체입니다. 먼저 기존 연결을 해제한 뒤 다시 연결해 주세요.', 'warning');
    });
    } else {
    btn.addEventListener('click', () => {
        if (isCurrentMemberGroupSearch(state) && state.result === request
            && document.getElementById('group-search-input').value.trim() === keyword)
            tryConnectGroup(g.id, g.name || '', g.rep_name || '',request);
    });
    }

    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-center';

    const nameEl = document.createElement('span');
    nameEl.className = 'fw-bold';
    nameEl.innerText = g.name || '';

    const statusWrap = document.createElement('small');
    const statusBadge = document.createElement('span');
    statusBadge.className = g.rep_name ? 'badge bg-warning text-dark' : 'badge bg-success';
    statusBadge.innerText = g.rep_name ? `현재 관리자: ${g.rep_name}` : '관리자 없음';
    statusWrap.appendChild(statusBadge);

    row.appendChild(nameEl);
    row.appendChild(statusWrap);
    btn.appendChild(row);
    list.appendChild(btn);
    });
} catch (error) {
    if (!current()) return;
    CoopSafeLog.error('search_groups failed:',error);
    list.textContent = '단체를 불러오지 못했습니다. 검색 버튼을 눌러 다시 시도해 주세요.';
} finally {
    if (state.read === request) state.read = null;
}
})();
return request.promise;
}

// 3. 연결 시도
function tryConnectGroup(groupId, groupName, currentManager, result = memberGroupSearchState?.result) {
const state = memberGroupSearchState;
if (memberGroupConnectPending || !isCurrentMemberGroupSearch(state) || !result || state.result !== result
    || document.getElementById('group-search-input').value.trim() !== result.keyword) return;
const myName = document.getElementById('md-name').value;
let msg = `'${groupName}'의 관리자로 등록하시겠습니까?`;

if(currentManager) {
myAlert(`현재 '${currentManager}'님이 관리자로 연결되어 있습니다. 먼저 기존 연결을 해제한 뒤 '${myName}'님에게 다시 연결해 주세요.`, 'warning');
return;
}

const confirmation = {state,result,group:groupId,member:state.member,busy:false,button:null};
memberGroupConfirmation = confirmation;
const current = () => memberGroupConfirmation === confirmation && isCurrentMemberGroupSearch(state)
    && state.result === result && document.getElementById('group-search-input').value.trim() === result.keyword
    && document.getElementById('btnConfirmYes') === confirmation.button;
myConfirm(msg, async () => {
    if (confirmation.busy || memberGroupConnectPending || !current()) return;
    confirmation.busy = true;
    memberGroupConnectPending = confirmation;
    let locked = [],loading = false;
    try {
        const gate = await window.ErpRuntimeGuard.enforce(_supabase,{moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
        if (!current()) return;
        if (!gate.ok || String(gate.runtime?.coop_id || '') !== String(g_adminMemberRuntime?.coop_id || ''))
            return myAlert('현재 변경 권한을 확인하지 못했습니다. 다시 확인해 주세요.','warning');
        locked = Array.from(document.querySelectorAll('#groupSearchModal button,#groupSearchModal input')).map(node=>[node,node.disabled]);
        locked.forEach(([node])=>{node.disabled=true;});
        showLoading(true); loading = true;
        const { error } = await _supabase.rpc('connect_group_manager',{group_uuid:confirmation.group,manager_uuid:confirmation.member});
        if (!current()) return;
        if (error) throw error;
        const modal = document.getElementById('groupSearchModal');
        const finish = async () => {
            if (state.owner !== memberDetailOwner() || state.member !== String(g_current_member_id || '')
                || state.revision !== g_member_detail_revision || window.frameElement?.hidden
                || !document.getElementById('memberDetailModal')?.classList.contains('show')) return;
            const read = await loadMemberFamily(confirmation.member);
            if (state.owner !== memberDetailOwner() || state.member !== String(g_current_member_id || '')
                || state.revision !== g_member_detail_revision || window.frameElement?.hidden) return;
            myAlert(read?.ok === false ? '연결했습니다. 목록은 다시 불러와 주세요.' : '연결되었습니다.');
        };
        if (modal?.classList.contains('show')) {
            modal.addEventListener('hidden.bs.modal',()=>{finish().catch(error=>CoopSafeLog.error('group family refresh failed:',error));},{once:true});
            moveFocusOutsideModal(modal);
            bootstrap.Modal.getOrCreateInstance(modal).hide();
        } else await finish();
    } catch (error) {
        if (current()) {
            if (['GROUP_LINK_CONFLICT','GROUP_ALREADY_MANAGED'].includes(String(error?.message || ''))) {
                state.result = null;
                memberGroupConfirmation = null;
                document.getElementById('group-search-result').textContent = '단체 연결이 변경되었습니다. 검색 버튼을 눌러 다시 확인해 주세요.';
                myAlert('단체 연결이 변경되어 반영하지 못했습니다. 다시 검색해 주세요.','warning');
            } else myAlert('연결 실패: ' + getManagedLinkErrorMessage(error),'error');
        }
    } finally {
        if (memberGroupConnectPending === confirmation) memberGroupConnectPending = null;
        confirmation.busy = false;
        if (state.owner === memberDetailOwner()) locked.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});
        if (loading) showLoading(false);
    }
});
confirmation.button = document.getElementById('btnConfirmYes');
}
// [신규] 관계 선택 모달 열기
function openRelationSelectModal() {
// 상세 모달 위에 띄워야 하므로 z-index 관리 필요할 수 있음 (Bootstrap이 자동 처리하기도 함)
bootstrap.Modal.getOrCreateInstance(document.getElementById('relationSelectModal')).show();
}

// [신규] 선택 후 다음 단계 이동
function confirmRelationType() {
const type = document.querySelector('input[name="relationType"]:checked').value;

// 현재 모달 닫기
const modalEl = document.getElementById('relationSelectModal');
const modalInstance = bootstrap.Modal.getInstance(modalEl);
if (modalEl && modalEl.contains(document.activeElement)) {
document.activeElement.blur();
}

const openNextStep = () => {
if (type === 'child') {
openChildForm();
} else {
openGroupSearch();
}
};

if (modalEl) {
modalEl.addEventListener('hidden.bs.modal', openNextStep, { once: true });
}
if (modalInstance) {
modalInstance.hide();
} else {
openNextStep();
}
}
// [신규] 자녀 등록 폼 열기
function openChildForm() {
    const owner = memberDetailOwner(), parentId = String(document.getElementById('md-uid').value || '');
    if (!owner || memberChildSaving || parentId !== String(g_current_member_id || '')) return;
    const parent = findCachedAdminMember(parentId) || g_current_member_row;
    if (!parent || String(parent.id) !== parentId || (parent.coop_id && String(parent.coop_id) !== String(g_adminMemberRuntime?.coop_id || ''))) return;
    retainMemberChildDraft();
    const key = JSON.stringify([owner,parentId]), draft = memberChildDrafts.get(key);
    const baseline = draft?.baseline || [['child-name',''],['child-rrn',''],['child-phone',parent.phone || ''],['child-address',parent.address || '']];
    memberChildState = {owner,parent:parentId,key,baseline,revision:0};
    const values = new Map(draft?.current || baseline);
    memberChildFields().forEach(node => { node.value = values.get(node.id) || ''; node.disabled = false; });
    document.getElementById('child-parent-name').value = `${parent.name} (${parent.member_id || '-'})`;
    document.querySelectorAll('#childRegisterModal button').forEach(node => { node.disabled = false; });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('childRegisterModal')).show();
}

// [신규] 자녀 저장 실행
async function saveChildMember() {
    const state = memberChildState;
    if (memberChildSaving || !isCurrentMemberChild(state,true)) return;
    const parentId = state.parent;
    const name = document.getElementById('child-name').value.trim();
    const rrn = document.getElementById('child-rrn').value.replace(/[^0-9]/g, ''); // 숫자만 추출
    const phone = document.getElementById('child-phone').value;
    const address = document.getElementById('child-address').value;

    // 유효성 검사
    if(!name) return myAlert("자녀 이름을 입력해주세요.", 'warning');
    if(rrn.length !== 13) return myAlert("주민번호 13자리를 정확히 입력해주세요.", 'warning');

    const submitted = JSON.stringify(memberChildSnapshot()), revision = ++state.revision;
    myConfirm(`${name} 자녀를 등록하시겠습니까?`, async () => {
        const current = () => isCurrentMemberChild(state,true) && state.revision === revision
            && JSON.stringify(memberChildSnapshot()) === submitted;
        if (memberChildSaving || !current()) return;
        memberChildSaving = true;
        const controls = Array.from(document.querySelectorAll('#childRegisterModal input,#childRegisterModal button'));
        const disabled = controls.map(node => node.disabled);
        controls.forEach(node => { node.disabled = true; });
        showLoading(true);
        try {
        const gate = await window.ErpRuntimeGuard.enforce(_supabase,{moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
        if (!current()) return;
        if (!gate.ok || String(gate.runtime?.coop_id || '') !== String(g_adminMemberRuntime?.coop_id || '')) throw new Error('현재 권한을 확인하지 못했습니다. 다시 확인해 주세요.');
        const params = {
            p_manager_id: parentId, // 부모 ID 연결
            p_name: name,
            p_rrn: rrn,
            p_phone: phone,
            p_address: address,
            p_memo: '자녀 계정 (부모에 의해 생성됨)'
        };

        const { error } = await _supabase.rpc('create_child_member', params);
        if (error) throw error;
        if (!current()) return;
        memberChildDrafts.delete(state.key);
        const baseline = new Map(state.baseline);
        memberChildFields().forEach(node => { node.value = baseline.get(node.id) || ''; window.ErpWorkspaceResume?.checkpoint(node); });
        memberChildSaving = false;
        bootstrap.Modal.getInstance(document.getElementById('childRegisterModal'))?.hide();
        let familyResult;
        try { familyResult = await loadMemberFamily(parentId); }
        catch (error) {
            CoopSafeLog.error('[erp/admin_member] child family list refresh failed',error);
            if (isCurrentMemberChild(state)) myAlert('등록했습니다. 가족 목록은 다시 확인해 주세요.','warning');
            return;
        }
        if (isCurrentMemberChild(state) && !familyResult?.stale) {
            myAlert(familyResult?.ok === false ? '등록했습니다. 가족 목록은 다시 확인해 주세요.' : '자녀 계정이 등록되었습니다.',familyResult?.ok === false ? 'warning' : undefined);
        }
        } catch (error) {
            if (isCurrentMemberChild(state)) myAlert('자녀 등록을 완료하지 못했습니다. ' + (error?.message || '다시 확인해 주세요.'),'error');
        } finally {
            memberChildSaving = false;
            if (isCurrentMemberChild(state)) {
                controls.forEach((node,index) => { node.disabled = disabled[index]; });
                retainMemberChildDraft();
                showLoading(false);
            }
        }
    });
}

// ================================================================
// [초기화] 통합 윈도우 로드 함수 (중복 선언 금지)
// ================================================================
window.onload = async function() {

    setAdminMemberBootMessage('로그인 상태와 권한을 확인하고 있습니다.', false);
    const memberUserGate = await window.ErpRuntimeGuard.requireUser(_supabase, {
        alertFn: function(msg) { setAdminMemberBootMessage(msg, true); },
        redirectUrl: 'index.html'
    });
    if (!memberUserGate.ok) return;
    const cachedRole = String(memberUserGate.user?.role || '').toLowerCase();
    const cachedRoleIsAdmin = cachedRole === 'admin' || cachedRole === 'admin_all';
    const user = memberUserGate.authUser || null;
    const permStored = localStorage.getItem('erp_permissions');
    const runtimeModuleKeys = ADMIN_MEMBER_PAGE_SCOPE === 'member_admin'
        ? ['member_admin']
        : (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin'
            ? ['site_admin']
            : (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' ? ['documents'] : ['site_admin', 'member_admin']));
    const memberRuntimeGate = await window.ErpRuntimeGuard.enforce(_supabase, {
        moduleKey: runtimeModuleKeys.length === 1 ? runtimeModuleKeys[0] : '',
        moduleKeysAny: runtimeModuleKeys.length > 1 ? runtimeModuleKeys : [],
        moduleLabel: ADMIN_MEMBER_PAGE_SCOPE === 'member_admin'
            ? '조합원 관리'
            : (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin'
                ? '홈페이지 관리'
                : (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' ? '문서관리' : '조합원/홈페이지 관리')),
        alertFn: function(msg) { setAdminMemberBootMessage(msg, true); },
        redirectUrl: 'index.html'
    });
    if (!memberRuntimeGate.ok) return;
    const hasAssignedSiteMemberAccess = String(memberRuntimeGate.runtime?.runtime_profile || '') === 'site_member'
        && runtimeModuleKeys.length === 1
        && ['member_admin', 'site_admin'].includes(runtimeModuleKeys[0])
        && memberRuntimeGate.runtime?.module_access?.[runtimeModuleKeys[0]] === true
        && cachedRoleIsAdmin;

    if (user) {
        try {
            permissionSet = await loadAdminMemberPermissions(user);
            if (permissionSet.size > 0) {
                localStorage.setItem('erp_permissions', JSON.stringify(Array.from(permissionSet)));
            }
        } catch (_) {}
    }
    if ((!permissionSet || permissionSet.size === 0) && permStored) {
        try {
            permissionSet = new Set(JSON.parse(permStored));
        } catch (_) { permissionSet = new Set(); }
    }
    if (permissionSet && permissionSet.size > 0) {
        let hasAdminAccess = cachedRoleIsAdmin;
        if (!hasAssignedSiteMemberAccess) {
            if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin') {
                hasAdminAccess = permissionSet.has('member.admin');
            } else if (ADMIN_MEMBER_PAGE_SCOPE === 'site_admin') {
                hasAdminAccess = permissionSet.has('site.admin') || permissionSet.has('member.admin');
            } else if (ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin') {
                hasAdminAccess = permissionSet.has('documents.manage') || permissionSet.has('site.admin') || permissionSet.has('member.admin');
            } else {
                hasAdminAccess = permissionSet.has('member.admin') || permissionSet.has('site.admin');
            }
        }
        if (!hasAdminAccess) {
            myAlert('⛔ 접근 권한이 없습니다.', 'error');
            location.href = 'index.html';
            return;
        }
    }

    // checkAdmin 내부에서 권한 확인 및 페이지 리다이렉트 처리
    setAdminMemberBootMessage('관리 권한을 확인하고 있습니다.', false);
    await checkAdmin(user);
    const mainSystem = document.getElementById('main-system');
    if (mainSystem && mainSystem.classList.contains('hidden')) {
        return;
    }
    applyAdminMemberRuntimeUi(memberRuntimeGate.runtime);
    bindAdminCertificateContext(user?.id);
    window.MemberNotificationAdmin?.configure(_supabase,memberRuntimeGate.runtime,user?.id);
    window.MemberExportPinUI?.init({client:_supabase,alert:myAlert});

    // 2. 사이드바 메뉴 활성화 (현재 URL 기반)
    const currentPath = window.location.pathname.split('/').pop(); // 예: admin_member.html

    // href가 현재 파일명과 일치하는 링크 찾기
    const activeLink = document.querySelector(`.sidebar-menu .nav-link[href="${currentPath}"]`);

    if (activeLink) {
        activeLink.classList.add('active');
        // closest 사용 시 null 에러 방지를 위한 안전장치 추가
        const parentItem = activeLink.closest('.nav-item');
        if(parentItem) parentItem.classList.add('active');
    }

    // 3. 초기 탭 로드
    const initialTab = getInitialAdminMemberTab();
    switchTab(initialTab);
    if (initialTab !== 'dashboard' && canAccessAdminMemberTab('applications')) {
        fetchMemberReturnSummary();
    }
    await openAdminMemberActivityDeepLink();
    await openAdminMemberSiteSubDeepLink();
    const workEntry = new URLSearchParams(window.location.search);
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && canAccessAdminMemberTab('members') && hasAdminMemberScopePermission('member_admin') && isAdminMemberRuntimeModuleEnabled('member_admin') && workEntry.get('sub') === 'signup-pending') {
        goToPendingMembers();
    }
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && canAccessAdminMemberTab('applications') && workEntry.get('sub') === 'pending-all') {
        filterAppType('all'); filterAppList('pending');
    }
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && canAccessAdminMemberTab('notifications') && workEntry.get('sub') === 'settings') {
        await window.MemberNotificationAdmin?.select('settings');
    }
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && hasAdminMemberScopePermission('member_admin') && isAdminMemberRuntimeModuleEnabled('member_admin') && workEntry.get('sub') === 'capital') {
        await openMemberCapitalSettings();
    }
    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin' && hasAdminMemberScopePermission('member_admin') && isAdminMemberRuntimeModuleEnabled('member_admin') && workEntry.get('sub') === 'payment-policy') {
        await window.MemberAdmissionPolicy?.open();
    }

    if (ADMIN_MEMBER_PAGE_SCOPE === 'member_admin') {
        window.ErpWorkspaceTask = {ready:true, refresh:async function(options = {}) {
            invalidateMemberRelationSearches();
            const sequence = ++memberFundRefreshSequence;
            memberFundListResume = null;
            applicationListResume = null;
            let gate;
            try {
                gate = await window.ErpRuntimeGuard.enforce(_supabase, {moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
            } catch (error) {
                if (sequence === memberFundRefreshSequence) {
                    invalidateApplicationListRead();
                    invalidateMemberReturnSummaryRead();
                    invalidateAdminDashboardRead();
                }
                throw error;
            }
            if (sequence !== memberFundRefreshSequence) return;
            if (!gate.ok || String(gate.runtime?.coop_id || '') !== String(g_adminMemberRuntime?.coop_id || '')) {
                invalidateApplicationListRead();
                invalidateMemberReturnSummaryRead();
                invalidateAdminDashboardRead();
                throw new Error('ERP_TASK_ACCESS_DENIED');
            }
            restoreMemberFamilyRetry();
            window.MemberNotificationAdmin?.configure(_supabase,gate.runtime,adminCertificateAuthId);
            const pane = document.querySelector('.main-content > .tab-pane.active')?.id;
            // Do not repopulate an open member editor or overwrite unfinished input.
            if (options.dirty || document.querySelector('.modal.show,dialog[open]')) {
                await Promise.all([fetchMemberReturnSummary(), requestMemberFundListRefresh(sequence), requestApplicationListRefresh(sequence),
                    pane === 'tab-dashboard' ? loadDashboard() : null]); return;
            }
            if (pane === 'tab-dashboard') await loadDashboard();
            else if (pane === 'tab-notifications') await window.MemberNotificationAdmin?.refresh();
            else if (pane === 'tab-members' && g_member_fetch_revision > 0) await fetchMembers();
            else if (pane === 'tab-applications') await requestApplicationListRefresh(sequence);
            else if (pane === 'tab-funds-manage') await requestMemberFundListRefresh(sequence);
            else await fetchMemberReturnSummary();
        }};
    } else {
        window.ErpWorkspaceResume.register({modules:runtimeModuleKeys,refresh:async()=>{
            const pane=document.querySelector('.main-content > .tab-pane.active')?.id;
            if(pane==='tab-notices')await fetchNotices();
            else if(ADMIN_MEMBER_PAGE_SCOPE==='documents_admin'&&pane==='tab-site')await fetchDocs();
            // Website settings and their live preview are editors, not refreshable lists.
        }});
    }

};

    // ================================================================
// [기능 11] 관리자 로그 뷰어 (신규 추가)
// ================================================================

// 전역 변수: 로그 페이지 관리용
let g_log_page = 0;
const LOG_PAGE_SIZE = 20;

// 1. 로그 뷰어 모달 열기
function openAdminLogModal() {
    if (isAdminMemberSiteProfile()) {
        location.href = 'audit_logs.html';
        return;
    }

    // 초기화: 첫 페이지, 필터 초기화, 검색어 초기화
    g_log_page = 0;
    document.getElementById('log-filter-type').value = 'all';
    document.getElementById('log-search-keyword').value = '';

    // 데이터 로드
    fetchAdminLogs();

    // 모달 표시
    new bootstrap.Modal(document.getElementById('adminLogModal')).show();
}

// 2. 로그 데이터 조회 (Supabase)
async function fetchAdminLogs() {
    const tbody = document.getElementById('logListBody');
    const typeFilter = document.getElementById('log-filter-type').value;
    const keyword = document.getElementById('log-search-keyword').value.trim();

    // 로딩 표시
    tbody.innerHTML = '<tr><td colspan="6" class="py-5"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        // 쿼리 작성 (최신순 정렬)
        let query = _supabase
            .from('admin_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        // 필터 적용: 유형
        if (typeFilter !== 'all') {
            query = query.eq('action_type', typeFilter);
        }

        // 필터 적용: 검색어 (대상, 내용, 이메일 통합 검색)
        if (keyword) {
            // ilike를 사용하여 대소문자 구분 없이 검색
            // target, details, admin_email 칼럼 중 하나라도 포함되면 검색
            const safeKeyword = sanitizeOrKeyword(keyword);
            if (safeKeyword) {
                query = query.or(`target.ilike.%${safeKeyword}%,details.ilike.%${safeKeyword}%,admin_email.ilike.%${safeKeyword}%`);
            }
        }

        // 페이징 적용 (range: 0부터 시작)
        const from = g_log_page * LOG_PAGE_SIZE;
        const to = from + LOG_PAGE_SIZE - 1;
        query = query.range(from, to);

        // 실행
        const { data, count, error } = await query;

        if (error) throw error;

        // UI 업데이트
        document.getElementById('log-total-count').innerText = `총 ${count ? count.toLocaleString() : 0}건`;
        document.getElementById('log-page-num').innerText = `Page ${g_log_page + 1}`;

        // 테이블 렌더링
        renderLogTable(data);

    } catch (err) {
        CoopSafeLog.error("로그 로드 실패:", err);
        tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-danger">데이터를 불러오지 못했습니다.<br><small>${escapeHtml(err.message)}</small></td></tr>`;
    }
}

// 3. 로그 테이블 렌더링 (HTML 생성)
function renderLogTable(list) {
    const tbody = document.getElementById('logListBody');
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-5 text-muted">기록된 활동 로그가 없습니다.</td></tr>';
        return;
    }

    list.forEach(log => {
        // 날짜 포맷팅 (KST, YYYY-MM-DD HH:MM:SS)
        const dateStr = formatAdminMemberKstDateTimeSeconds(log.created_at, '-');

        // 유형별 뱃지 스타일
        let typeBadge = `<span class="badge bg-secondary">${escapeHtml(log.action_type || '')}</span>`;
        if (log.action_type === 'DOWNLOAD') typeBadge = `<span class="badge bg-danger">📥 다운로드</span>`;
        else if (log.action_type === 'EDIT') typeBadge = `<span class="badge bg-primary">✏️ 수정</span>`;
        else if (log.action_type === 'VIEW') typeBadge = `<span class="badge bg-light text-dark border">👁️ 조회</span>`;
        else if (log.action_type === 'LOGIN') typeBadge = `<span class="badge bg-success">🔑 로그인</span>`;

        // 이메일 마스킹 (선택 사항이지만 관리자끼리니 일단 다 보여줌)
        const email = log.admin_email || 'unknown';

        tbody.innerHTML += `
            <tr>
                <td class="text-muted small">${escapeHtml(dateStr)}</td>
                <td class="fw-bold text-dark">${escapeHtml(email)}</td>
                <td>${typeBadge}</td>
                <td class="text-start">${escapeHtml(log.target || '-')}</td>
                <td class="text-start text-truncate" style="max-width: 300px;" title="${escapeHtml(log.details || '')}">
                    ${escapeHtml(log.details || '-')}
                </td>
                <td class="text-muted small">${escapeHtml(log.ip_address || '-')}</td>
            </tr>
        `;
    });
}

// 4. 페이지 변경 함수
function changeLogPage(direction) {
    const next = g_log_page + direction;
    if (next < 0) return; // 0페이지 미만 방지

    // 다음 페이지가 있는지 확인하는 로직은 count를 이용해 정교하게 짤 수도 있지만,
    // 간단하게는 '현재 리스트가 꽉 찼으면 다음이 있다'고 가정하거나,
    // fetchAdminLogs 안에서 count를 전역으로 저장해서 비교할 수 있습니다.
    // 여기서는 일단 요청을 보내고 데이터가 없으면 빈 화면이 나오는 기본 방식으로 처리 후,
    // 개선한다면 'count'를 확인하여 버튼을 비활성화하는 로직을 추가할 수 있습니다.

    // 단순화: 일단 이동하고 조회
    g_log_page = next;
    fetchAdminLogs();
}
// [수정] 자산수증이익(기부금) 전체 조회 (Member ID 기준 매핑으로 변경)
function fetchGlobalDonations() {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-funds-manage');
    if (!owner || isAdminMemberSiteProfile() || !canAccessAdminMemberTab('funds-manage') || window.frameElement?.hidden
        || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    const startDate = document.getElementById('don-date-start').value;
    const endDate = document.getElementById('don-date-end').value;
    const tbody = document.getElementById('donationGlobalBody');
    if (donationListRequest?.pending && isCurrentDonationListRead(donationListRequest)) return donationListRequest.promise;
    const request = {owner,startDate,endDate,revision:++donationListRevision,pending:true,promise:null};
    donationListRequest = request;

    tbody.innerHTML = '<tr><td colspan="6" class="py-5"><div class="spinner-border text-primary"></div></td></tr>';
    document.getElementById('don-total-sum').innerText = '—';
    request.promise = (async () => {
    try {

    // 1. 기부금 내역 조회
    const { data: donations, error } = await scopeAdminTenant(_supabase
        .from('coop_donations')
        .select('*'))
        .gte('donation_date', startDate)
        .lte('donation_date', endDate)
        .order('donation_date', { ascending: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
    if (!isCurrentDonationListRead(request)) return;

    if (error) {
        CoopSafeLog.error("[erp/admin_member] operation failed", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger py-4">데이터 로드 실패: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    if (!donations || donations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted py-5">해당 기간의 자산수증(기부) 내역이 없습니다.</td></tr>';
        document.getElementById('don-total-sum').innerText = '0';
        return;
    }

    // 2. ★ [핵심 수정] UUID가 아닌 member_id(조합원번호)로 회원 정보 조회
    // 기부금 데이터에서 member_id만 추출 (중복 제거)
    const memberIds = [...new Set(donations.map(d => d.member_id).filter(Boolean))];
    let memberMap = {}; // { "2024-001": "홍길동" }

    if (memberIds.length > 0) {
        const { data: members, error: memberError } = await scopeAdminTenant(_supabase
            .from('coop_members')
            .select('member_id, name')) // 이름과 ID만 필요
            .in('member_id', memberIds);
        if (!isCurrentDonationListRead(request)) return;

        if (!memberError && members) {
            members.forEach(m => {
                memberMap[m.member_id] = m.name;
            });
        }
    }

    // 3. 데이터 병합 및 렌더링
    let totalSum = 0;
    tbody.innerHTML = '';

    donations.forEach(d => {
        totalSum += Number(d.amount);

        // 결제수단 뱃지
        let methodBadge = '<span class="badge bg-light text-dark border">기타</span>';
        if(d.type === 'transfer') methodBadge = '<span class="badge bg-info bg-opacity-10 text-dark">계좌</span>';
        else if(d.type === 'card') methodBadge = '<span class="badge bg-warning bg-opacity-10 text-dark">카드</span>';
        else if(d.type === 'cash') methodBadge = '<span class="badge bg-success bg-opacity-10 text-dark">현금</span>';

        // ★ 수정됨: member_id로 맵에서 이름 찾기
        // 맵에 없으면(탈퇴/삭제 등) 그냥 '미확인' 대신 빈 문자열 처리하거나 원본 표시
        const name = memberMap[d.member_id] || '미확인';
        const noteParts = getDonationNoteParts(d.note);

        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(d.donation_date || '')}</td>
                <td class="text-start ps-4">
                    <span class="fw-bold">${escapeHtml(name)}</span>
                    <small class="text-muted">(${escapeHtml(d.member_id || '')})</small>
                </td>
                <td class="fw-bold text-end pe-4">${Number(d.amount).toLocaleString()}</td>
                <td>${methodBadge}</td>
                <td>${renderDonationJournalStatus(noteParts.completed)}</td>
                <td class="text-start text-muted small">${escapeHtml(noteParts.memo || '-')}</td>
            </tr>
        `;
    });

    // 총액 업데이트
    document.getElementById('don-total-sum').innerText = totalSum.toLocaleString();
    } catch (error) {
        if (!isCurrentDonationListRead(request)) return;
        CoopSafeLog.error('[erp/admin_member] donation list failed', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-danger py-4">목록을 불러오지 못했습니다. 다시 조회해 주세요.</td></tr>';
        document.getElementById('don-total-sum').innerText = '—';
    } finally {
        request.pending = false;
    }
    })();
    return request.promise;
}

// [수정] 이용고배당(포인트) 전체 조회 (Member ID 기준 매핑으로 변경)
function fetchGlobalDividends(append = false) {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-funds-manage');
    if (!owner || isAdminMemberSiteProfile() || !canAccessAdminMemberTab('funds-manage') || window.frameElement?.hidden
        || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    const keyword = document.getElementById('div-search-keyword').value.trim();
    const tbody = document.getElementById('dividendGlobalBody'), status = document.getElementById('usage-ledger-status');
    append = append === true;
    if (append && (!usageLedgerPage?.hasMore || usageLedgerPage.owner !== owner || usageLedgerPage.keyword !== keyword)) return Promise.resolve();
    if (usageLedgerRequest?.pending && usageLedgerRequest.append === append && isCurrentUsageLedgerRead(usageLedgerRequest)) return usageLedgerRequest.promise;
    usageLedgerRequest?.controller?.abort();
    const page = append ? usageLedgerPage : null;
    const request = {owner,keyword,append,page,revision:++usageLedgerRevision,pending:true,promise:null,controller:new AbortController()};
    usageLedgerRequest = request;
    if (!append) {
        usageLedgerPage = null;
        tbody.innerHTML = '<tr><td colspan="5" class="py-5"><div class="spinner-border text-info"></div></td></tr>';
    }
    if (status) status.textContent = append ? '추가 내역을 불러오고 있습니다.' : '조회 중';
    syncUsageLedgerUi();
    const timer = setTimeout(() => request.controller.abort(), 15000);
    request.promise = (async () => {
        try {
            const { data, error } = await _supabase.rpc('admin_usage_ledger_page', {
                p_keyword:keyword,p_before_created_at:page?.cursor?.created_at ?? null,p_before_id:page?.cursor?.id ?? null
            }).abortSignal(request.controller.signal);
            if (!isCurrentUsageLedgerRead(request)) return;
            if (error) throw error;
            if (!data || !Array.isArray(data.rows) || data.rows.length > 100 || typeof data.has_more !== 'boolean'
                || data.rows.some(row => !row || typeof row.id !== 'string' || !/^\d+$/.test(row.id))
                || (data.has_more && (!data.rows.length || !data.next_cursor || !/^\d+$/.test(data.next_cursor.id)
                    || data.next_cursor.id !== data.rows.at(-1).id))) throw new Error('INVALID_USAGE_LEDGER_PAGE');
            if (append && usageLedgerPage !== page) return;
            const rows = append ? [...page.rows,...data.rows] : data.rows;
            if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('DUPLICATE_USAGE_LEDGER_PAGE');
            usageLedgerPage = {owner,keyword,rows,hasMore:data.has_more,cursor:data.next_cursor};
            renderUsageLedgerRows(rows);
            if (status) status.textContent = `${rows.length.toLocaleString()}건 표시`;
        } catch (error) {
            if (!isCurrentUsageLedgerRead(request)) return;
            CoopSafeLog.error('[erp/admin_member] usage ledger failed', error);
            if (!append) tbody.innerHTML = '<tr><td colspan="5" class="text-danger py-4">원장을 불러오지 못했습니다. 다시 조회해 주세요.</td></tr>';
            if (status) status.textContent = append ? '추가 내역을 불러오지 못했습니다. 더 보기를 눌러 다시 조회해 주세요.' : '조회 실패';
        } finally {
            clearTimeout(timer);
            request.pending = false;
            if (usageLedgerRequest === request) syncUsageLedgerUi();
        }
    })();
    return request.promise;
}

const DIVIDEND_CAPITAL_STATUSES = Object.freeze(['완료', '전표완료']);
let g_dividend_capital_preview_token = 0;

const g_dividend_batch_state = {
    initialized: false,
    batches: [],
    selectedBatchId: '',
    minutes: []
};

function getDividendManageSelectedBatch() {
    const selectedId = g_dividend_batch_state.selectedBatchId;
    return g_dividend_batch_state.batches.find((batch) => String(batch.id) === String(selectedId)) || null;
} // End of getDividendManageSelectedBatch

let g_dividend_calculation_settings = null;
let g_dividend_settings_request = 0;
let g_dividend_settings_saving = false;
let g_dividend_settings_baseline = null;

function dividendMethodLabel(method) {
    return ({ MONTH_END_SHARES: '월말 출자잔액의 월 좌수 합계', MONTH_END_BALANCE: '월말 출자잔액 합계', DAILY_BALANCE: '입금일별 보유일수' })[method] || '산출 방법 미등록';
}

async function loadDividendCalculationSettings(preserveDraft = false) {
    const request = ++g_dividend_settings_request;
    const methodEl = document.getElementById('dividendCalculationMethod');
    const ruleEl = document.getElementById('dividendCalculationRule');
    const before = JSON.stringify([methodEl?.value, ruleEl?.value]);
    const { data, error } = await _supabase.rpc('dividend_calculation_settings');
    if (request !== g_dividend_settings_request) return;
    const status = document.getElementById('dividendCalculationSettingStatus');
    if (error) { if (status) status.innerText = '산출 방법을 불러오지 못했습니다. 배당 회차 탭을 다시 열어 주세요.'; return; }
    g_dividend_calculation_settings = data;
    if (!preserveDraft && (g_dividend_settings_baseline === null || before === g_dividend_settings_baseline)
        && before === JSON.stringify([methodEl?.value, ruleEl?.value])) {
        if (methodEl) methodEl.value = data?.method || '';
        if (ruleEl) ruleEl.value = data?.rule_basis || '';
        g_dividend_settings_baseline = JSON.stringify([methodEl?.value, ruleEl?.value]);
    }
    if (status) status.innerText = data?.configured
        ? `${dividendMethodLabel(data.method)} · 출자 1좌 ${formatDividendExportMoney(data.unit)}`
        : '이 조합의 규약에 맞는 산출 방법을 선택하고 저장해 주세요.';
    const help = document.getElementById('dividendCapitalMethodHelp');
    if (help) help.innerText = data?.method === 'MONTH_END_SHARES'
        ? '매월 말 출자잔액을 1좌 금액으로 나누고 소수점 이하를 버린 월 좌수를 합산합니다.'
        : data?.method === 'MONTH_END_BALANCE' ? '매월 말 출자잔액을 합산하여 계산합니다.'
        : data?.method === 'DAILY_BALANCE' ? '입금일별 보유일수를 연도별 실제 일수로 나누어 계산합니다.' : '산출 방법을 먼저 등록해 주세요.';
}

async function saveDividendCalculationSettings() {
    if (g_dividend_settings_saving) return;
    if (!g_dividend_calculation_settings) { await loadDividendCalculationSettings(); return; }
    const method = getDividendBatchFormValue('dividendCalculationMethod');
    const rule = getDividendBatchFormValue('dividendCalculationRule');
    if (!method || !rule) return myAlert('산출 방법과 규약 근거를 입력해 주세요.', 'warning');
    g_dividend_settings_saving = true;
    try {
        const { data, error } = await _supabase.rpc('dividend_calculation_settings', {
            p_method: method, p_rule_basis: rule, p_expected_revision: g_dividend_calculation_settings.revision
        });
        if (error) throw error;
        g_dividend_calculation_settings = data;
        g_dividend_settings_baseline = JSON.stringify([method, rule]);
        document.getElementById('dividendCalculationSettingStatus').innerText = `${dividendMethodLabel(data.method)} 저장됨 · 출자 1좌 ${formatDividendExportMoney(data.unit)}`;
        await refreshDividendCapitalPoolPreview();
    } catch (error) {
        if (error.code === 'PT409') await loadDividendCalculationSettings(true);
        myAlert('산출 방법 저장 실패: ' + error.message, 'error');
    }
    finally { g_dividend_settings_saving = false; }
}

function getDividendBatchFormValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
} // End of getDividendBatchFormValue

function normalizeDividendBatchRate(id) {
    const value = Number(getDividendBatchFormValue(id).replace(/,/g, ''));
    return Number.isFinite(value) && value >= 0 ? value : null;
} // End of normalizeDividendBatchRate

function calculateDividendCapitalPoolFromRate(capitalAnnualRateBasisTotal, capitalRatePercent) {
    const basisTotal = normalizeDividendExportNumber(capitalAnnualRateBasisTotal);
    const rate = normalizeDividendExportNumber(capitalRatePercent);
    if (basisTotal <= 0 || rate <= 0) return 0;
    // The server provides the annual-rate basis for the cooperative's saved method.
    return Math.trunc(basisTotal * (rate / 100));
} // End of calculateDividendCapitalPoolFromRate

async function fetchDividendCapitalBasisSummary(capitalStart, capitalEnd) {
    const safeCapitalStart = String(capitalStart || '').trim();
    const safeCapitalEnd = String(capitalEnd || '').trim();
    if (!safeCapitalStart || !safeCapitalEnd) {
        return { paidTotal: 0, weightedTotal: 0, averageTotal: 0, annualRateBasisTotal: 0, memberCount: 0 };
    }

    const coopId = await getAdminMemberCoopId();
    if (!coopId) throw new Error('현재 조합을 확인할 수 없습니다.');

    const { data, error } = await _supabase.rpc('dividend_capital_basis_summary', {
        p_coop_id: coopId,
        p_basis_start: safeCapitalStart,
        p_basis_end: safeCapitalEnd
    });

    if (error) throw error;

    if (!data || !data.method) throw new Error('배당 산출 기준을 확인하지 못했습니다.');
    return data;
} // End of fetchDividendCapitalBasisSummary

async function refreshDividendCapitalPoolPreview() {
    const previewEl = document.getElementById('dividendBatchCapitalPoolPreview');
    const basisEl = document.getElementById('dividendBatchCapitalBasisPreview');
    if (!previewEl || !basisEl) return;

    const token = ++g_dividend_capital_preview_token;
    const capitalStart = getDividendBatchFormValue('dividendBatchCapitalStart');
    const capitalEnd = getDividendBatchFormValue('dividendBatchCapitalEnd');
    const rate = normalizeDividendBatchRate('dividendBatchCapitalRate');

    if (!capitalStart || !capitalEnd) {
        previewEl.innerText = '0원';
        basisEl.innerText = '출자금 기준 기간을 입력하세요.';
        return;
    }

    if (rate === null || rate > 10) {
        previewEl.innerText = '0원';
        basisEl.innerText = '요율은 0% 이상 10% 이하로 입력하세요.';
        return;
    }

    basisEl.innerText = '기준 출자금 계산 중...';
    try {
        const capitalBasis = await fetchDividendCapitalBasisSummary(capitalStart, capitalEnd);
        if (token !== g_dividend_capital_preview_token) return;
        const capitalPool = calculateDividendCapitalPoolFromRate(capitalBasis.annualRateBasisTotal, rate);
        previewEl.innerText = formatDividendExportMoney(capitalPool);
        basisEl.innerText = `${dividendMethodLabel(capitalBasis.method)} · 연 요율 적용 기준액 ${formatDividendExportMoney(capitalBasis.annualRateBasisTotal)} × 연 ${rate}% · 대상 ${Number(capitalBasis.memberCount).toLocaleString('ko-KR')}명`;
    } catch (error) {
        if (token !== g_dividend_capital_preview_token) return;
        CoopSafeLog.warn("출자금 배당 재원 미리보기 실패:", error);
        previewEl.innerText = '계산 실패';
        basisEl.innerText = error.message || '기준 출자금을 불러오지 못했습니다.';
    }
} // End of refreshDividendCapitalPoolPreview

function resetDividendBatchCreateForm() {
    const year = new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const defaults = {
        dividendBatchFiscalYear: year,
        dividendBatchTitle: `${year}년 정기 배당`,
        dividendBatchPeriodStart: start,
        dividendBatchPeriodEnd: end,
        dividendBatchCapitalStart: start,
        dividendBatchCapitalEnd: end,
        dividendBatchUsageStart: start,
        dividendBatchUsageEnd: end,
        dividendBatchCapitalRate: 0,
        dividendBatchIncomeTaxRate: 0.14,
        dividendBatchLocalTaxRate: 0.014
    };

    Object.entries(defaults).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });

    const firstDividendEl = document.getElementById('dividendBatchIsFirst');
    if (firstDividendEl) firstDividendEl.checked = false;
    refreshDividendCapitalPoolPreview();
} // End of resetDividendBatchCreateForm

function renderDividendBatchSelectedPanel(batch) {
    document.getElementById('dividendBatchSelectedTitle').innerText = batch?.title || '선택된 회차 없음';
    document.getElementById('dividendBatchSelectedMeta').innerText = batch
        ? `${batch.fiscal_year}년 · ${formatDividendExportDateValue(batch.period_start)} ~ ${formatDividendExportDateValue(batch.period_end)} · ${batch.capital_calculation_method ? dividendMethodLabel(batch.capital_calculation_method) + (batch.capital_share_unit_snapshot ? ' (1좌 ' + formatDividendExportMoney(batch.capital_share_unit_snapshot) + ')' : '') : '기존 회차 산출 기준'}`
        : '회차를 선택하면 총회 승인과 확정을 진행할 수 있습니다.';
    document.getElementById('dividendBatchSelectedStatus').innerText = batch?.status || '-';

    const meetingDateEl = document.getElementById('dividendBatchMeetingDate');
    const paymentDueDateEl = document.getElementById('dividendBatchPaymentDueDate');
    const agendaEl = document.getElementById('dividendBatchAgenda');
    const minutesEl = document.getElementById('dividendBatchMinutesDocId');
    const resolutionEl = document.getElementById('dividendBatchResolutionResult');

    if (meetingDateEl) meetingDateEl.value = batch?.general_meeting_date ? formatDividendExportDateValue(batch.general_meeting_date, '') : '';
    if (paymentDueDateEl) paymentDueDateEl.value = batch?.payment_due_date ? formatDividendExportDateValue(batch.payment_due_date, '') : '';
    if (agendaEl) agendaEl.value = batch?.general_meeting_agenda || '';
    if (minutesEl) {
        if (!batch) minutesEl.value = '';
        renderDividendGeneralAssemblyMinutesOptions();
        minutesEl.value = batch?.minutes_doc_id || '';
    }
    if (resolutionEl) resolutionEl.value = batch?.general_meeting_resolution_result || 'APPROVED';

    renderDividendAccountDeadlinePreview(batch?.account_change_deadline || '');
    fetchDividendBatchItemsPreview(batch?.id || '');
} // End of renderDividendBatchSelectedPanel

function getDividendDefaultAccountDeadlineDate(paymentDueDate) {
    const raw = String(paymentDueDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    const date = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
} // End of getDividendDefaultAccountDeadlineDate

function renderDividendAccountDeadlinePreview(savedDeadline = '') {
    const previewEl = document.getElementById('dividendBatchAccountDeadlinePreview');
    if (!previewEl) return;
    if (savedDeadline) {
        previewEl.innerText = `계좌 등록·변경 마감: ${formatAdminMemberKstDateTime(savedDeadline)}`;
        return;
    }
    const dueDate = getDividendBatchFormValue('dividendBatchPaymentDueDate');
    const deadlineDate = getDividendDefaultAccountDeadlineDate(dueDate);
    previewEl.innerText = deadlineDate
        ? `계좌 등록·변경 마감: ${deadlineDate} 23:59`
        : '계좌 등록·변경 마감: 지급예정일 전날 23:59';
} // End of renderDividendAccountDeadlinePreview

function renderDividendManageBatches() {
    const tbody = document.getElementById('dividendBatchManageBody');
    if (!tbody) return;

    const batches = g_dividend_batch_state.batches;
    if (!batches.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-5 text-muted">배당 회차가 없습니다.</td></tr>';
        renderDividendBatchSelectedPanel(null);
        renderDividendBatchItemPreview([], '');
        return;
    }

    tbody.innerHTML = batches.map((batch) => {
        const selectedClass = String(batch.id) === String(g_dividend_batch_state.selectedBatchId) ? 'table-primary' : '';
        const canCalculate = ['DRAFT', 'CALCULATED', 'REVIEW_READY', 'REVISION_REQUIRED'].includes(batch.status);
        const itemCount = Number(batch.item_count || 0);
        const grossTotal = normalizeDividendExportNumber(batch.item_gross_total || batch.total_gross_amount);
        const netTotal = normalizeDividendExportNumber(batch.item_net_total);

        return `
            <tr class="${selectedClass}">
                <td>${escapeHtml(batch.fiscal_year || '-')}</td>
                <td class="text-start">
                    <div class="fw-bold">${escapeHtml(batch.title || '-')}</div>
                    <small class="text-muted">${escapeHtml(formatDividendExportDateValue(batch.period_start))} ~ ${escapeHtml(formatDividendExportDateValue(batch.period_end))}</small>
                </td>
                <td>${getDividendExportStatusBadge(batch.status)}</td>
                <td class="text-end">${escapeHtml(formatDividendExportMoney(grossTotal))}</td>
                <td class="text-end fw-bold">${escapeHtml(formatDividendExportMoney(netTotal))}</td>
                <td>${itemCount.toLocaleString('ko-KR')}건</td>
                <td>
                    <div class="d-flex flex-wrap gap-1 justify-content-center">
                        <button class="btn btn-xs btn-outline-primary" type="button" onclick="selectDividendManageBatch('${escapeJsString(batch.id)}')">선택</button>
                        <button class="btn btn-xs btn-outline-success" type="button" ${canCalculate ? '' : 'disabled'} onclick="runDividendCapitalCalculation('${escapeJsString(batch.id)}')">출자계산</button>
                        <button class="btn btn-xs btn-outline-info" type="button" ${canCalculate ? '' : 'disabled'} onclick="runDividendUsageCalculation('${escapeJsString(batch.id)}')">이용고</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
} // End of renderDividendManageBatches

function renderDividendBatchItemPreview(items, batchId) {
    const tbody = document.getElementById('dividendBatchItemPreviewBody');
    const metaEl = document.getElementById('dividendBatchItemPreviewMeta');
    if (!tbody) return;

    const rows = Array.isArray(items) ? items : [];
    if (!batchId) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-5 text-muted">산출 내역이 없습니다.</td></tr>';
        if (metaEl) metaEl.innerText = '회차를 선택한 뒤 출자/이용 계산을 실행하세요.';
        return;
    }

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-5 text-muted">아직 계산된 조합원별 배당 내역이 없습니다.</td></tr>';
        if (metaEl) metaEl.innerText = '출자계산 또는 이용고 계산을 실행하면 표시됩니다.';
        return;
    }

    let grossTotal = 0;
    let netTotal = 0;
    let taxTotal = 0;
    tbody.innerHTML = rows.map((item) => {
        const incomeTax = normalizeDividendExportNumber(item.income_tax_amount);
        const localTax = normalizeDividendExportNumber(item.local_income_tax_amount);
        const rowTax = incomeTax + localTax;
        const gross = normalizeDividendExportNumber(item.gross_amount);
        const net = normalizeDividendExportNumber(item.net_amount);
        grossTotal += gross;
        netTotal += net;
        taxTotal += rowTax;

        return `
            <tr>
                <td class="text-start">
                    <div class="fw-bold">${escapeHtml(item.member_name_snapshot || '-')}</div>
                    <small class="text-muted">${escapeHtml(item.member_no_snapshot || '-')}</small>
                </td>
                <td class="text-end">${escapeHtml(formatDividendExportMoney(item.capital_dividend_gross))}</td>
                <td class="text-end">${escapeHtml(formatDividendExportMoney(item.usage_dividend_gross))}</td>
                <td class="text-end fw-bold">${escapeHtml(formatDividendExportMoney(gross))}</td>
                <td class="text-end text-danger">${escapeHtml(formatDividendExportMoney(rowTax))}</td>
                <td class="text-end fw-bold text-primary">${escapeHtml(formatDividendExportMoney(net))}</td>
                <td>${getDividendExportStatusBadge(item.payment_status || 'NOT_READY')}</td>
            </tr>
        `;
    }).join('');

    if (metaEl) {
        metaEl.innerText = `${rows.length.toLocaleString('ko-KR')}명 · 세전 ${formatDividendExportMoney(grossTotal)} · 세금 ${formatDividendExportMoney(taxTotal)} · 세후 ${formatDividendExportMoney(netTotal)}`;
    }
} // End of renderDividendBatchItemPreview

async function fetchDividendBatchItemsPreview(batchId) {
    const safeBatchId = String(batchId || '').trim();
    const tbody = document.getElementById('dividendBatchItemPreviewBody');
    const metaEl = document.getElementById('dividendBatchItemPreviewMeta');
    if (!tbody) return;
    if (!safeBatchId) {
        renderDividendBatchItemPreview([], '');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" class="py-5"><div class="spinner-border text-primary"></div></td></tr>';
    if (metaEl) metaEl.innerText = '조합원별 산출 내역을 불러오는 중...';

    const { data, error } = await scopeAdminTenant(_supabase
        .from('coop_dividend_batch_items')
        .select('member_no_snapshot,member_name_snapshot,capital_dividend_gross,usage_dividend_gross,gross_amount,income_tax_amount,local_income_tax_amount,net_amount,payment_status'))
        .eq('batch_id', safeBatchId)
        .order('member_no_snapshot', { ascending: true })
        .limit(500);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-5 text-danger">${escapeHtml(error.message)}</td></tr>`;
        if (metaEl) metaEl.innerText = '산출 내역 조회 실패';
        return;
    }

    renderDividendBatchItemPreview(data || [], safeBatchId);
} // End of fetchDividendBatchItemsPreview

function buildDividendMinutesOptionLabel(row) {
    const docNo = String(row?.doc_no || '').trim();
    const title = String(row?.title || '').trim() || '총회 의사록';
    const publishedAt = formatAdminMemberKstDate(row?.published_at, '-');
    return `${docNo ? `${docNo} · ` : ''}${title} · 공개 ${publishedAt}`;
} // End of buildDividendMinutesOptionLabel

function renderDividendGeneralAssemblyMinutesOptions() {
    const selectEl = document.getElementById('dividendBatchMinutesDocId');
    const helpEl = document.getElementById('dividendBatchMinutesHelp');
    if (!selectEl) return;

    const currentValue = selectEl.value || getDividendManageSelectedBatch()?.minutes_doc_id || '';
    const minutes = g_dividend_batch_state.minutes || [];
    const options = ['<option value="">총회 의사록을 선택하세요.</option>'];

    minutes.forEach((row) => {
        const id = String(row.id || '').trim();
        if (!id) return;
        options.push(`<option value="${escapeHtml(id)}">${escapeHtml(buildDividendMinutesOptionLabel(row))}</option>`);
    });

    if (currentValue && !minutes.some((row) => String(row.id) === String(currentValue))) {
        options.push(`<option value="${escapeHtml(currentValue)}">현재 연결된 의사록 (${escapeHtml(currentValue)})</option>`);
    }

    selectEl.innerHTML = options.join('');
    selectEl.value = currentValue;
    if (helpEl) helpEl.innerText = minutes.length
        ? `${minutes.length.toLocaleString('ko-KR')}건의 공개 완료 총회 의사록을 불러왔습니다.`
        : '문서함에 공개 완료된 총회 의사록이 없으면 먼저 의사록을 마감/공개해야 합니다.';
} // End of renderDividendGeneralAssemblyMinutesOptions

async function fetchDividendGeneralAssemblyMinutes(showToast = false) {
    const selectEl = document.getElementById('dividendBatchMinutesDocId');
    const helpEl = document.getElementById('dividendBatchMinutesHelp');
    if (selectEl) selectEl.innerHTML = '<option value="">총회 의사록을 불러오는 중...</option>';
    if (helpEl) helpEl.innerText = '문서함의 공개 완료 총회 의사록을 조회하고 있습니다.';

    const { data, error } = await scopeAdminTenant(_supabase
        .from('minutes')
        .select('id,title,doc_no,doc_type,status,published_at'))
        .eq('doc_type', 'GENERAL_ASSEMBLY')
        .eq('status', 'CLOSED')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(100);

    if (error) {
        g_dividend_batch_state.minutes = [];
        if (selectEl) selectEl.innerHTML = '<option value="">총회 의사록을 불러오지 못했습니다.</option>';
        if (helpEl) helpEl.innerText = error.message || '총회 의사록 조회 실패';
        if (showToast) myAlert('총회 의사록 조회 실패: ' + error.message, 'error');
        return;
    }

    g_dividend_batch_state.minutes = Array.isArray(data) ? data : [];
    renderDividendGeneralAssemblyMinutesOptions();
    if (showToast) myAlert('총회 의사록 목록을 새로 불러왔습니다.');
} // End of fetchDividendGeneralAssemblyMinutes

async function initializeDividendBatchTab() {
    if (!g_dividend_batch_state.initialized) {
        g_dividend_batch_state.initialized = true;
        resetDividendBatchCreateForm();
    }
    if (!g_dividend_calculation_settings) await loadDividendCalculationSettings();
    await fetchDividendGeneralAssemblyMinutes(false);
    await fetchDividendManageBatches(false);
} // End of initializeDividendBatchTab

async function fetchDividendManageBatches(showToast = false) {
    const tbody = document.getElementById('dividendBatchManageBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="py-5"><div class="spinner-border text-primary"></div></td></tr>';

    const { data: batches, error } = await scopeAdminTenant(_supabase
        .from('coop_dividend_batches')
        .select('id,fiscal_year,title,period_start,period_end,is_first_dividend,capital_basis_start,capital_basis_end,usage_basis_start,usage_basis_end,capital_dividend_pool,usage_dividend_pool,total_gross_amount,income_tax_rate,local_income_tax_rate,status,minutes_doc_id,general_meeting_date,general_meeting_agenda,general_meeting_resolution_result,payment_due_date,account_change_deadline,payment_accounts_locked_at,capital_calculation_method,capital_share_unit_snapshot,created_at,updated_at'))
        .order('fiscal_year', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-5 text-danger">${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    const rows = Array.isArray(batches) ? batches : [];
    const ids = rows.map((batch) => batch.id).filter(Boolean);
    let itemRows = [];

    if (ids.length > 0) {
        const { data: items, error: itemError } = await scopeAdminTenant(_supabase
            .from('coop_dividend_batch_items')
            .select('batch_id,gross_amount,net_amount,payment_status'))
            .in('batch_id', ids);

        if (itemError) {
            CoopSafeLog.warn("배당 회차 항목 집계 실패:", itemError);
        } else {
            itemRows = Array.isArray(items) ? items : [];
        }
    }

    const summaryByBatch = new Map();
    itemRows.forEach((item) => {
        const key = String(item.batch_id || '');
        if (!summaryByBatch.has(key)) {
            summaryByBatch.set(key, { item_count: 0, item_gross_total: 0, item_net_total: 0 });
        }
        const summary = summaryByBatch.get(key);
        summary.item_count += 1;
        summary.item_gross_total += normalizeDividendExportNumber(item.gross_amount);
        summary.item_net_total += normalizeDividendExportNumber(item.net_amount);
    });

    g_dividend_batch_state.batches = rows.map((batch) => ({
        ...batch,
        ...(summaryByBatch.get(String(batch.id)) || { item_count: 0, item_gross_total: 0, item_net_total: 0 })
    }));

    const selectedStillExists = g_dividend_batch_state.batches.some((batch) => String(batch.id) === String(g_dividend_batch_state.selectedBatchId));
    if (!selectedStillExists) {
        g_dividend_batch_state.selectedBatchId = g_dividend_batch_state.batches[0]?.id || '';
    }

    renderDividendManageBatches();
    renderDividendBatchSelectedPanel(getDividendManageSelectedBatch());
    if (showToast) myAlert('배당 회차 목록을 새로고침했습니다.');
} // End of fetchDividendManageBatches

function selectDividendManageBatch(batchId) {
    g_dividend_batch_state.selectedBatchId = String(batchId || '');
    renderDividendManageBatches();
    renderDividendBatchSelectedPanel(getDividendManageSelectedBatch());
} // End of selectDividendManageBatch

async function createDividendBatch() {
    const fiscalYear = Number(getDividendBatchFormValue('dividendBatchFiscalYear'));
    const title = getDividendBatchFormValue('dividendBatchTitle');
    const periodStart = getDividendBatchFormValue('dividendBatchPeriodStart');
    const periodEnd = getDividendBatchFormValue('dividendBatchPeriodEnd');
    const capitalStart = getDividendBatchFormValue('dividendBatchCapitalStart');
    const capitalEnd = getDividendBatchFormValue('dividendBatchCapitalEnd');
    const usageStart = getDividendBatchFormValue('dividendBatchUsageStart');
    const usageEnd = getDividendBatchFormValue('dividendBatchUsageEnd');
    const capitalRate = normalizeDividendBatchRate('dividendBatchCapitalRate');
    const incomeTaxRate = Number(getDividendBatchFormValue('dividendBatchIncomeTaxRate'));
    const localIncomeTaxRate = Number(getDividendBatchFormValue('dividendBatchLocalTaxRate'));

    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return myAlert('회계연도를 확인해주세요.', 'warning');
    if (!title) return myAlert('회차명을 입력해주세요.', 'warning');
    if (!periodStart || !periodEnd || periodEnd < periodStart) return myAlert('결산 기간을 확인해주세요.', 'warning');
    if (!capitalStart || !capitalEnd || capitalEnd < capitalStart) return myAlert('출자금 기준 기간을 확인해주세요.', 'warning');
    if (!usageStart || !usageEnd || usageEnd < usageStart) return myAlert('이용실적 기준 기간을 확인해주세요.', 'warning');
    if (capitalRate === null || capitalRate > 10) return myAlert('출자금 배당 요율은 0% 이상 10% 이하로 입력해주세요.', 'warning');
    if (!Number.isFinite(incomeTaxRate) || incomeTaxRate < 0 || !Number.isFinite(localIncomeTaxRate) || localIncomeTaxRate < 0) return myAlert('세율을 확인해주세요.', 'warning');

    let capitalBasis = { paidTotal: 0, weightedTotal: 0, averageTotal: 0, annualRateBasisTotal: 0, memberCount: 0 };
    try {
        capitalBasis = await fetchDividendCapitalBasisSummary(capitalStart, capitalEnd);
    } catch (error) {
        return myAlert('출자금 기준 금액 조회 실패: ' + error.message, 'error');
    }
    const capitalPool = calculateDividendCapitalPoolFromRate(capitalBasis.annualRateBasisTotal, capitalRate);

    const coopId = await getAdminMemberCoopId();
    const payload = {
        fiscal_year: fiscalYear,
        title,
        period_start: periodStart,
        period_end: periodEnd,
        is_first_dividend: !!document.getElementById('dividendBatchIsFirst')?.checked,
        capital_basis_start: capitalStart,
        capital_basis_end: capitalEnd,
        usage_basis_start: usageStart,
        usage_basis_end: usageEnd,
        capital_dividend_pool: Math.trunc(capitalPool),
        capital_annual_rate_percent: capitalRate,
        capital_settings_revision: capitalBasis.settingsRevision,
        usage_dividend_pool: 0,
        income_tax_rate: incomeTaxRate,
        local_income_tax_rate: localIncomeTaxRate,
        status: 'DRAFT'
    };
    if (coopId) payload.coop_id = coopId;

    myConfirm(`${title} 회차를 생성하시겠습니까?\n\n산출 방법: ${dividendMethodLabel(capitalBasis.method)}\n출자금 배당 요율: 연 ${capitalRate}%\n연 요율 적용 기준액: ${formatDividendExportMoney(capitalBasis.annualRateBasisTotal)}\n예상 출자금 배당 총액: ${formatDividendExportMoney(capitalPool)}\n이용고 배당은 수동 지급 원장을 불러와 계산합니다.`, async () => {
        showLoading(true);
        const { data, error } = await _supabase
            .from('coop_dividend_batches')
            .insert(payload)
            .select('id')
            .single();
        showLoading(false);

        if (error) return myAlert('배당 회차 생성 실패: ' + error.message, 'error');

        g_dividend_batch_state.selectedBatchId = data?.id || '';
        myAlert('배당 회차가 생성되었습니다.');
        fetchDividendManageBatches(false);
    });
} // End of createDividendBatch

function requireDividendManageBatchId() {
    const batchId = String(g_dividend_batch_state.selectedBatchId || '').trim();
    if (!batchId) {
        myAlert('배당 회차를 먼저 선택해주세요.', 'warning');
        return '';
    }
    return batchId;
} // End of requireDividendManageBatchId

async function runDividendCapitalCalculation(batchId) {
    const targetId = String(batchId || requireDividendManageBatchId()).trim();
    if (!targetId) return;

    myConfirm('선택한 회차의 출자금 기준 배당을 계산하시겠습니까?', async () => {
        showLoading(true);
        const { error } = await _supabase.rpc('calculate_capital_dividend_batch', {
            p_batch_id: targetId,
            p_confirm_replace: true,
            p_capital_statuses: ['완료', '전표완료']
        });
        showLoading(false);

        if (error) return myAlert('출자금 배당 계산 실패: ' + error.message, 'error');
        myAlert('출자금 배당 계산이 완료되었습니다.');
        await fetchDividendManageBatches(false);
    });
} // End of runDividendCapitalCalculation

async function importLegacyUsageLedgerForDividendBatch(batch) {
    const sinceDate = batch?.usage_basis_start ? `${formatDividendExportDateValue(batch.usage_basis_start, '')}T00:00:00+09:00` : null;
    const { data, error } = await _supabase.rpc('import_legacy_coop_points_to_reward_ledger', {
        p_since: sinceDate
    });
    if (error) throw error;
    return data || {};
} // End of importLegacyUsageLedgerForDividendBatch

async function runDividendUsageCalculation(batchId) {
    const targetId = String(batchId || requireDividendManageBatchId()).trim();
    if (!targetId) return;
    const batch = g_dividend_batch_state.batches.find((row) => String(row.id) === targetId) || null;

    myConfirm('선택한 회차의 이용고 배당을 계산하시겠습니까?\n\n기존 수동 지급/차감 내역을 이용실적 보상 원장으로 먼저 불러온 뒤 계산합니다.', async () => {
        showLoading(true);
        let importResult = {};
        let calcError = null;
        try {
            importResult = await importLegacyUsageLedgerForDividendBatch(batch);
            const { error } = await _supabase.rpc('calculate_usage_dividend_batch', {
                p_batch_id: targetId,
                p_confirm_replace: true
            });
            calcError = error;
        } catch (error) {
            calcError = error;
        }
        showLoading(false);

        if (calcError) return myAlert('이용고 배당 계산 실패: ' + calcError.message, 'error');
        const insertedCount = Number(importResult?.inserted_count || 0);
        myAlert(`이용고 배당 계산이 완료되었습니다. 원장 신규 반영 ${insertedCount.toLocaleString('ko-KR')}건`);
        await fetchDividendManageBatches(false);
    });
} // End of runDividendUsageCalculation

async function approveSelectedDividendBatch() {
    const batchId = requireDividendManageBatchId();
    if (!batchId) return;

    const minutesDocId = getDividendBatchFormValue('dividendBatchMinutesDocId');
    const meetingDate = getDividendBatchFormValue('dividendBatchMeetingDate');
    const agenda = getDividendBatchFormValue('dividendBatchAgenda');
    const resolutionResult = getDividendBatchFormValue('dividendBatchResolutionResult') || 'APPROVED';

    if (!minutesDocId) return myAlert('총회 의사록을 선택해주세요.', 'warning');
    if (!meetingDate) return myAlert('총회일을 입력해주세요.', 'warning');
    if (!agenda) return myAlert('안건명을 입력해주세요.', 'warning');

    myConfirm('선택한 배당 회차에 총회 승인 근거를 반영하시겠습니까?', async () => {
        showLoading(true);
        const { error } = await _supabase.rpc('approve_dividend_batch_by_general_meeting', {
            p_batch_id: batchId,
            p_minutes_doc_id: minutesDocId,
            p_general_meeting_date: meetingDate,
            p_general_meeting_agenda: agenda,
            p_resolution_result: resolutionResult
        });
        showLoading(false);

        if (error) return myAlert('총회 승인 반영 실패: ' + error.message, 'error');
        myAlert('총회 승인 근거가 반영되었습니다.');
        fetchDividendManageBatches(false);
    });
} // End of approveSelectedDividendBatch

async function finalizeSelectedDividendBatch() {
    const batchId = requireDividendManageBatchId();
    if (!batchId) return;

    const paymentDueDate = getDividendBatchFormValue('dividendBatchPaymentDueDate');
    if (!paymentDueDate) return myAlert('지급예정일을 입력해주세요.', 'warning');

    myConfirm('선택한 배당 회차를 조합원 공개 상태로 확정하시겠습니까?', async () => {
        showLoading(true);
        const { data, error } = await _supabase.rpc('finalize_dividend_batch_with_payment_policy', {
            p_batch_id: batchId,
            p_payment_due_date: paymentDueDate,
            p_account_change_deadline: null
        });
        if (error) {
            showLoading(false);
            return myAlert('배당 확정 실패: ' + error.message, 'error');
        }
        const heldCount = Number(data?.held_item_count || 0);
        const deadline = data?.account_change_deadline ? formatAdminMemberKstDateTime(data.account_change_deadline) : '지급예정일 전날 23:59';
        const notificationResult = await dispatchDividendKakaoNotifications(batchId, 'dividend_finalized', false);
        showLoading(false);
        await fetchDividendManageBatches(false);
        const notificationText = formatDividendNotificationDispatchResult(notificationResult);
        const alertType = getDividendNotificationDispatchAlertType(notificationResult);
        myAlert(`배당 회차가 확정되었습니다.\n계좌 등록·변경 마감: ${deadline}${heldCount > 0 ? `\n계좌 미등록 지급보류: ${heldCount.toLocaleString('ko-KR')}명` : ''}\n${notificationText}`, alertType);
    });
} // End of finalizeSelectedDividendBatch

const DIVIDEND_BANK_TRANSFER_SAMPLE_BANK_NAMES = Object.freeze([
    '* 입금 은행명 입니다. ',
    'BNK투자증권',
    'BOA은행',
    'DB금융투자',
    'HSBC은행',
    'IBK기업은행',
    'IBK투자증권',
    'KB국민은행',
    'KB증권',
    'KDB산업은행',
    'K뱅크',
    'NH농협은행',
    'NH투자증권',
    'SC제일은행',
    'SK증권',
    '경남은행',
    '광주은행',
    '교보증권',
    '기타외국은행',
    '농협회원조합',
    '다올투자증권',
    'iM뱅크 (구)대구',
    '대신증권',
    '도이치은행',
    '메리츠증권',
    '미래에셋대우',
    '미즈호은행',
    '부국증권',
    '부산은행',
    '비엔피파리바은행',
    '산림조합중앙회',
    '산업은행',
    '삼성증권',
    '새마을금고',
    '수출입은행',
    '수협은행',
    '신영증권',
    '신한은행',
    '신한투자증권',
    '신협',
    '에이비엔암로은행',
    '엠유에프지은행',
    '우리은행',
    '우리종합금융',
    '우체국',
    '유안타증권',
    '유진투자증권',
    '엘에스증권',
    '저축은행',
    '전북은행',
    '제이피모간체이스은행',
    '제주은행',
    '중국건설은행',
    '중국공상은행',
    '중국은행',
    '카카오뱅크',
    '카카오페이증권',
    '케이프투자증권',
    '키움증권　　',
    '토스뱅크',
    '토스증권',
    '하나은행',
    '하나증권',
    '하이투자증권',
    '씨티은행',
    '한국은행',
    '한국투자증권',
    '한국포스증권',
    '한화투자증권',
    '현대차증권'
]);

const g_dividend_export_state = {
    initialized: false,
    batches: [],
    selectedBatchId: '',
    bankRows: null,
    taxRows: null,
    withholdingSummaryRows: null,
    paymentRuns: [],
    selectedPaymentRunId: '',
    paymentRunItems: [],
    notificationSummary: [],
    notificationDispatching: false,
    withdrawalDeemedDividendRows: []
};

function getWithdrawalDeemedDividendRow(withdrawalId) {
    return g_dividend_export_state.withdrawalDeemedDividendRows.find((row) => String(row.withdrawal_id) === String(withdrawalId)) || null;
}

function getWithdrawalDeemedDividendStatusBadge(row) {
    if (row?.tax_status === 'review_pending') return '<span class="badge bg-warning text-dark">세무 검토 대기</span>';
    if (row?.workflow_status === 'refunded') return '<span class="badge bg-success">지급 완료</span>';
    if (row?.tax_status === 'confirmed') return '<span class="badge bg-primary bg-opacity-10 text-primary">세무 검토 완료</span>';
    return '<span class="badge bg-light text-dark border">상태 확인</span>';
}

function renderWithdrawalDeemedDividendReviews() {
    const body = document.getElementById('withdrawalDeemedDividendBody');
    if (!body) return;
    const rows = Array.isArray(g_dividend_export_state.withdrawalDeemedDividendRows)
        ? g_dividend_export_state.withdrawalDeemedDividendRows
        : [];
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">의제배당 검토 대상인 탈퇴 지분환급이 없습니다.</td></tr>';
        return;
    }
    body.innerHTML = rows.map((row) => {
        const taxTotal = Number(row.income_tax_amount || 0) + Number(row.local_tax_amount || 0);
        const action = row.tax_status === 'review_pending'
            ? `<button class="btn btn-xs btn-primary" type="button" onclick="openWithdrawalDeemedDividendTaxModal('${escapeJsString(row.withdrawal_id)}')">원천세 검토</button>`
            : '<span class="text-muted">확정됨</span>';
        return `
            <tr>
                <td>${escapeHtml(formatDividendExportDateValue(row.decision_meeting_date))}</td>
                <td><div class="fw-bold">${escapeHtml(row.member_name || '-')}</div><div class="x-small text-muted">${escapeHtml(row.member_no || '-')} · ${escapeHtml(row.member_type || '-')}</div></td>
                <td class="text-end">${escapeHtml(formatDividendExportMoney(row.gross_return_amount))}</td>
                <td class="text-end fw-bold text-primary">${escapeHtml(formatDividendExportMoney(row.deemed_dividend_gross_amount))}</td>
                <td class="text-end">${escapeHtml(formatDividendExportMoney(taxTotal))}</td>
                <td class="text-end fw-bold">${escapeHtml(formatDividendExportMoney(row.net_payment_amount))}</td>
                <td>${getWithdrawalDeemedDividendStatusBadge(row)}</td>
                <td>${action}</td>
            </tr>`;
    }).join('');
}

async function fetchWithdrawalDeemedDividendReviews(showToast = false) {
    const body = document.getElementById('withdrawalDeemedDividendBody');
    if (!body) return [];
    body.innerHTML = '<tr><td colspan="8" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
    const { data, error } = await _supabase.rpc('admin_list_withdrawal_deemed_dividend_reviews');
    if (error) {
        body.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${escapeHtml(error.message || '조회 실패')}</td></tr>`;
        if (showToast) myAlert('탈퇴 지분환급 의제배당 조회 실패: ' + (error.message || error), 'error');
        return [];
    }
    g_dividend_export_state.withdrawalDeemedDividendRows = Array.isArray(data) ? data : [];
    renderWithdrawalDeemedDividendReviews();
    if (showToast) myAlert('탈퇴 지분환급 의제배당 목록을 새로 불러왔습니다.');
    return g_dividend_export_state.withdrawalDeemedDividendRows;
}

function syncWithdrawalDeemedDividendTaxNet() {
    const withdrawalId = document.getElementById('withdrawalDeemedDividendTaxId')?.value || '';
    const row = getWithdrawalDeemedDividendRow(withdrawalId);
    const grossReturn = Math.max(0, Math.trunc(Number(row?.gross_return_amount || 0)));
    const deemedGross = Math.max(0, Math.trunc(Number(row?.deemed_dividend_gross_amount || 0)));
    const incomeTax = Math.max(0, Math.trunc(Number(ERPNumberInput.raw(document.getElementById('withdrawalDeemedDividendIncomeTax')?.value || 0))));
    const localTax = Math.max(0, Math.trunc(Number(ERPNumberInput.raw(document.getElementById('withdrawalDeemedDividendLocalTax')?.value || 0))));
    const taxTotal = incomeTax + localTax;
    const net = Math.max(0, grossReturn - taxTotal);
    const netEl = document.getElementById('withdrawalDeemedDividendNet');
    const feedback = document.getElementById('withdrawalDeemedDividendTaxFeedback');
    if (netEl) netEl.textContent = `${net.toLocaleString('ko-KR')}원`;
    if (feedback) {
        const invalid = taxTotal > deemedGross;
        feedback.textContent = invalid ? '원천세 합계는 의제배당 검토액을 넘을 수 없습니다.' : '';
        feedback.classList.toggle('d-none', !invalid);
    }
    return { incomeTax, localTax, taxTotal, net, valid: taxTotal <= deemedGross };
}

function openWithdrawalDeemedDividendTaxModal(withdrawalId) {
    const row = getWithdrawalDeemedDividendRow(withdrawalId);
    if (!row || row.tax_status !== 'review_pending') {
        myAlert('세무 검토 대상을 다시 불러온 뒤 시도해주세요.', 'warning');
        return;
    }
    const gross = Math.max(0, Math.trunc(Number(row.deemed_dividend_gross_amount || 0)));
    const isIndividual = String(row.member_type || '').trim() === '개인';
    const suggestedIncomeTax = isIndividual ? Math.floor(gross * 0.14) : 0;
    const suggestedLocalTax = isIndividual ? Math.floor(suggestedIncomeTax * 0.1) : 0;
    document.getElementById('withdrawalDeemedDividendTaxId').value = row.withdrawal_id;
    document.getElementById('withdrawalDeemedDividendTaxMember').textContent = `${row.member_name || '-'} · ${row.member_no || '-'}`;
    document.getElementById('withdrawalDeemedDividendGross').value = `${gross.toLocaleString('ko-KR')}원`;
    document.getElementById('withdrawalDeemedDividendMemberType').value = row.member_type || '-';
    document.getElementById('withdrawalDeemedDividendIncomeTax').value = String(suggestedIncomeTax);
    document.getElementById('withdrawalDeemedDividendLocalTax').value = String(suggestedLocalTax);
    document.getElementById('withdrawalDeemedDividendTaxNote').value = isIndividual
        ? '개인 조합원 · 의제배당 검토액에 일반 배당 원천징수율 참고'
        : '';
    const help = document.getElementById('withdrawalDeemedDividendTaxHelp');
    if (help) help.textContent = isIndividual
        ? '개인 조합원 참고값으로 소득세 14%와 그 소득세의 10%를 넣었습니다. 실제 적용 여부와 세율을 검토한 뒤 확정하세요.'
        : '단체 조합원은 수령인 유형에 따라 원천징수 여부가 달라질 수 있어 세액을 자동 제안하지 않습니다. 세무 검토 후 직접 입력하세요.';
    document.getElementById('withdrawalDeemedDividendTaxFeedback').classList.add('d-none');
    syncWithdrawalDeemedDividendTaxNet();
    const modalEl = document.getElementById('withdrawalDeemedDividendTaxModal');
    applyAdminMemberModalLayer(modalEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function openWithdrawalDeemedDividendTaxFromApplication(withdrawalId) {
    showLoading(true);
    try {
        const rows = await fetchWithdrawalDeemedDividendReviews(false);
        const row = Array.isArray(rows)
            ? rows.find((item) => String(item?.withdrawal_id) === String(withdrawalId))
            : null;
        if (!row) {
            myAlert('의제배당 세무 검토 대상을 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해주세요.', 'warning');
            return;
        }
        openWithdrawalDeemedDividendTaxModal(withdrawalId);
    } catch (error) {
        myAlert('의제배당 세무 검토 정보를 불러오지 못했습니다: ' + (error?.message || error), 'error');
    } finally {
        showLoading(false);
    }
}

async function submitWithdrawalDeemedDividendTaxReview() {
    const refreshOwner = memberDetailOwner();
    const withdrawalId = Number(document.getElementById('withdrawalDeemedDividendTaxId')?.value || 0);
    const note = String(document.getElementById('withdrawalDeemedDividendTaxNote')?.value || '').trim();
    const amounts = syncWithdrawalDeemedDividendTaxNet();
    const feedback = document.getElementById('withdrawalDeemedDividendTaxFeedback');
    const submit = document.getElementById('withdrawalDeemedDividendTaxSubmit');
    if (!withdrawalId) return myAlert('세무 검토 대상을 다시 선택해주세요.', 'warning');
    if (!amounts.valid) return myAlert('원천세 합계를 다시 확인해주세요.', 'warning');
    if (!note) return myAlert('적용 세율이나 비원천징수 판단의 검토 근거를 입력해주세요.', 'warning');
    submit.disabled = true;
    showLoading(true);
    try {
        const { data, error } = await _supabase.rpc('admin_confirm_withdrawal_deemed_dividend_tax', {
            p_withdrawal_id: withdrawalId,
            p_income_tax_amount: amounts.incomeTax,
            p_local_tax_amount: amounts.localTax,
            p_tax_note: note
        });
        if (error) throw error;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('withdrawalDeemedDividendTaxModal')).hide();
        await Promise.all([fetchWithdrawalDeemedDividendReviews(false), refreshApplicationsAfterConfirmedChange(refreshOwner)]);
        await loadDashboard();
        myAlert(data?.message || '의제배당 세무 검토를 확정했습니다.', 'success');
    } catch (error) {
        const rawMessage = String(error?.hint || error?.message || error || '처리하지 못했습니다.');
        feedback.textContent = rawMessage.includes('PAYOUT_APPROVAL_AND_ACCOUNTING_SYNC_REQUIRED')
            ? '출자금 반환 지출결의를 완료하고 회계관리의 전자결재 연동까지 마친 뒤 지급 완료를 처리해주세요.'
            : rawMessage;
        feedback.classList.remove('d-none');
    } finally {
        showLoading(false);
        submit.disabled = false;
    }
}

async function downloadWithdrawalDeemedDividendTaxLedgerXlsx() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const rows = await fetchWithdrawalDeemedDividendReviews(false);
    if (!rows.length) return myAlert('내려받을 탈퇴 지분환급 의제배당 내역이 없습니다.', 'warning');
    const sheetRows = [
        ['총회 의결일', '조합원번호', '조합원명', '조합원구분', '총 반환액', '출자원금 반환분', '의제배당 검토액', '소득세', '지방소득세', '실지급액', '세무검토상태', '세무검토근거', '지급일'],
        ...rows.map((row) => [
            formatDividendExportDateValue(row.decision_meeting_date, ''),
            row.member_no || '',
            row.member_name || '',
            row.member_type || '',
            Math.trunc(Number(row.gross_return_amount || 0)),
            Math.trunc(Number(row.capital_refund_amount || 0)),
            Math.trunc(Number(row.deemed_dividend_gross_amount || 0)),
            Math.trunc(Number(row.income_tax_amount || 0)),
            Math.trunc(Number(row.local_tax_amount || 0)),
            Math.trunc(Number(row.net_payment_amount || 0)),
            row.tax_status || '',
            row.tax_note || '',
            formatDividendExportDateValue(row.payment_date, '')
        ])
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
    applyDividendExportSheetWidths(sheet, [14, 14, 14, 12, 14, 16, 18, 12, 14, 14, 16, 42, 14]);
    XLSX.utils.book_append_sheet(workbook, sheet, '탈퇴의제배당');
    const today = getAdminMemberKstDateString().replace(/-/g, '');
    XLSX.writeFile(workbook, `탈퇴지분환급_의제배당_세무검토_${today}.xlsx`);
    myAlert(`탈퇴 지분환급 의제배당 세무 검토 장부 ${rows.length.toLocaleString('ko-KR')}건을 만들었습니다.`);
}

function normalizeDividendExportNumber(value) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
} // End of normalizeDividendExportNumber

function formatDividendExportMoney(value) {
    return `${Math.trunc(normalizeDividendExportNumber(value)).toLocaleString('ko-KR')}원`;
} // End of formatDividendExportMoney

function formatDividendExportDateValue(value, fallback = '-') {
    const raw = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return formatAdminMemberKstDate(value, fallback);
} // End of formatDividendExportDateValue

function sanitizeDividendExportFilePart(value, fallback = '배당') {
    const normalized = String(value ?? '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 36);
    return normalized || fallback;
} // End of sanitizeDividendExportFilePart

function getDividendExportSelectedBatch() {
    const selectedId = g_dividend_export_state.selectedBatchId;
    return g_dividend_export_state.batches.find((batch) => String(batch.batch_id) === String(selectedId)) || null;
} // End of getDividendExportSelectedBatch

function getDividendSelectedPaymentRun() {
    const selectedId = String(g_dividend_export_state.selectedPaymentRunId || '');
    return g_dividend_export_state.paymentRuns.find((run) => String(run.payment_run_id) === selectedId) || null;
} // End of getDividendSelectedPaymentRun

function makeDividendExportFileName(suffix, extension) {
    const batch = getDividendExportSelectedBatch();
    const fiscalYear = sanitizeDividendExportFilePart(batch?.fiscal_year || '연도');
    const title = sanitizeDividendExportFilePart(batch?.title || '확정배당');
    const today = getAdminMemberKstDateString().replace(/-/g, '');
    const cleanSuffix = sanitizeDividendExportFilePart(suffix, '파일');
    return `배당_${fiscalYear}_${title}_${cleanSuffix}_${today}.${extension}`;
} // End of makeDividendExportFileName

function getDividendExportRpcErrorMessage(error) {
    const message = String(error?.message || error?.hint || error || '알 수 없는 오류');
    if (/Could not find the function|schema cache|42883|not exist/i.test(message)) {
        return '배당 지급 7단계 DB 스크립트 적용 후 사용할 수 있습니다.';
    }
    if (message.includes('ACCOUNT_CHANGE_DEADLINE_NOT_REACHED')) return '계좌 등록·변경 마감 전에는 지급파일을 확정할 수 없습니다.';
    if (message.includes('ACTIVE_DIVIDEND_PAYMENT_RUN_EXISTS')) return '이미 확정된 지급파일이 있습니다. 기존 지급파일을 완료하거나 취소한 뒤 다시 시도하세요.';
    if (message.includes('ACCOUNT_CHANGE_DEADLINE_NOT_SET')) return '배당 확정 단계에서 계좌 등록·변경 마감일을 먼저 설정해야 합니다.';
    if (message.includes('PAYOUT_APPROVAL_AND_ACCOUNTING_SYNC_REQUIRED')) return '배당금 지출결의를 완료하고 회계관리의 전자결재 연동까지 마친 뒤 지급파일을 만들 수 있습니다.';
    if (message.includes('PAYMENT_RUN_NOT_CONFIRMABLE')) return '현재 지급파일은 결과를 반영할 수 있는 상태가 아닙니다.';
    return message;
} // End of getDividendExportRpcErrorMessage

function getDividendExportStatusBadge(status) {
    const safeStatus = escapeHtml(status || '-');
    if (status === 'DRAFT') return '<span class="badge bg-light text-dark border">작성중</span>';
    if (status === 'CALCULATED') return '<span class="badge bg-secondary bg-opacity-10 text-secondary">계산완료</span>';
    if (status === 'REVIEW_READY') return '<span class="badge bg-warning bg-opacity-10 text-dark">검토대기</span>';
    if (status === 'GENERAL_MEETING_APPROVED') return '<span class="badge bg-success bg-opacity-10 text-success">총회승인</span>';
    if (status === 'FINALIZED') return '<span class="badge bg-primary bg-opacity-10 text-primary">확정</span>';
    if (status === 'PAYMENT_READY') return '<span class="badge bg-info bg-opacity-10 text-info">지급준비</span>';
    if (status === 'PARTIALLY_PAID') return '<span class="badge bg-warning bg-opacity-10 text-dark">부분지급</span>';
    if (status === 'PAID') return '<span class="badge bg-success">지급완료</span>';
    if (status === 'REVISION_REQUIRED') return '<span class="badge bg-danger bg-opacity-10 text-danger">수정필요</span>';
    if (status === 'CANCELED') return '<span class="badge bg-dark">취소</span>';
    if (status === 'READY') return '<span class="badge bg-info bg-opacity-10 text-info">지급대기</span>';
    if (status === 'FILE_EXPORTED') return '<span class="badge bg-primary bg-opacity-10 text-primary">파일생성</span>';
    if (status === 'FAILED') return '<span class="badge bg-danger bg-opacity-10 text-danger">지급실패</span>';
    if (status === 'HELD') return '<span class="badge bg-secondary">보류</span>';
    if (status === 'NOT_READY') return '<span class="badge bg-light text-dark border">미준비</span>';
    return `<span class="badge bg-light text-dark border">${safeStatus}</span>`;
} // End of getDividendExportStatusBadge

function renderDividendExportSelectedBatch(batch) {
    document.getElementById('dividendExportSelectedTitle').innerText = batch?.title || '선택된 회차 없음';
    document.getElementById('dividendExportSelectedMeta').innerText = batch
        ? `${batch.fiscal_year}년 · ${formatDividendExportDateValue(batch.period_start)} ~ ${formatDividendExportDateValue(batch.period_end)} · 지급예정 ${formatDividendExportDateValue(batch.payment_due_date)} · 계좌마감 ${batch.account_change_deadline ? formatAdminMemberKstDateTime(batch.account_change_deadline) : '미설정'}`
        : '확정 배당 회차를 선택해주세요.';
    document.getElementById('dividendExportSelectedStatus').innerText = batch?.status || '-';
    document.getElementById('dividendExportPayableCount').innerText = `${Number(batch?.payable_count || 0).toLocaleString('ko-KR')}건`;
    document.getElementById('dividendExportMissingBankCount').innerText = `${Number(batch?.missing_bank_count || 0).toLocaleString('ko-KR')}건`;
    document.getElementById('dividendExportMissingIdentifierCount').innerText = `${Number(batch?.missing_identifier_count || 0).toLocaleString('ko-KR')}건`;
} // End of renderDividendExportSelectedBatch

function renderDividendPaymentRunState() {
    const run = getDividendSelectedPaymentRun();
    const statusEl = document.getElementById('dividendPaymentRunStatus');
    const metaEl = document.getElementById('dividendPaymentRunMeta');
    const bodyEl = document.getElementById('dividendPaymentRunItemBody');
    const confirmButton = document.getElementById('dividendPaymentConfirmButton');
    const cancelButton = document.getElementById('dividendPaymentCancelButton');
    if (!statusEl || !metaEl || !bodyEl) return;

    if (!run) {
        statusEl.className = 'badge bg-light text-dark border';
        statusEl.innerText = '지급파일 없음';
        metaEl.innerText = '지급파일을 확정하면 계좌가 잠기고 처리 결과를 기록할 수 있습니다.';
        bodyEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">지급파일을 먼저 확정해주세요.</td></tr>';
        if (confirmButton) confirmButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;
        return;
    }

    statusEl.innerHTML = getDividendExportStatusBadge(run.status);
    statusEl.className = '';
    metaEl.innerText = `파일 생성 ${formatAdminMemberKstDateTime(run.exported_at)} · 이체대상 ${Number(run.item_count || 0).toLocaleString('ko-KR')}명 · 보류 ${Number(run.held_count || 0).toLocaleString('ko-KR')}명 · ${formatDividendExportMoney(run.total_net_amount)}`;

    const items = Array.isArray(g_dividend_export_state.paymentRunItems) ? g_dividend_export_state.paymentRunItems : [];
    bodyEl.innerHTML = items.length ? items.map((item) => {
        const canMarkFailed = run.status === 'EXPORTED' && item.status === 'READY';
        return `
            <tr>
                <td class="text-center">
                    <input class="form-check-input dividend-payment-failed-check" type="checkbox" value="${escapeHtml(item.run_item_id || '')}" ${canMarkFailed ? '' : 'disabled'} aria-label="은행 이체 실패 표시">
                </td>
                <td>
                    <div class="fw-bold">${escapeHtml(item.member_name || '-')}</div>
                    <div class="x-small text-muted">${escapeHtml(item.member_no || '-')}</div>
                </td>
                <td>${escapeHtml(item.payment_account_display || '미등록')}</td>
                <td class="text-end fw-bold">${escapeHtml(formatDividendExportMoney(item.transfer_amount))}</td>
                <td>${getDividendExportStatusBadge(item.status)}</td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="5" class="text-center text-muted py-3">지급 항목이 없습니다.</td></tr>';

    if (confirmButton) confirmButton.disabled = run.status !== 'EXPORTED' || Number(run.item_count || 0) <= 0;
    if (cancelButton) cancelButton.disabled = run.status !== 'EXPORTED';
} // End of renderDividendPaymentRunState

function renderDividendNotificationSummary() {
    const summaryEl = document.getElementById('dividendNotificationSummary');
    if (!summaryEl) return;
    const rows = Array.isArray(g_dividend_export_state.notificationSummary) ? g_dividend_export_state.notificationSummary : [];
    if (!rows.length) {
        summaryEl.innerText = '발송 대기 또는 처리된 배당 알림이 없습니다.';
        return;
    }
    summaryEl.innerHTML = rows.map((row) => {
        const label = row.event_type === 'dividend_paid' ? '지급완료' : '확정';
        return `<div><strong>${label}</strong> · 대기 ${Number(row.queued_count || 0).toLocaleString('ko-KR')} · 처리중 ${Number(row.processing_count || 0).toLocaleString('ko-KR')} · 접수 ${Number(row.accepted_count || 0).toLocaleString('ko-KR')} · 실패 ${Number(row.failed_count || 0).toLocaleString('ko-KR')} · 결과확인 ${Number(row.unknown_count || 0).toLocaleString('ko-KR')} · 미발송 ${Number(row.skipped_count || 0).toLocaleString('ko-KR')}</div>`;
    }).join('');
} // End of renderDividendNotificationSummary

async function fetchDividendPaymentState() {
    const batchId = String(g_dividend_export_state.selectedBatchId || '');
    if (!batchId) {
        g_dividend_export_state.paymentRuns = [];
        g_dividend_export_state.selectedPaymentRunId = '';
        g_dividend_export_state.paymentRunItems = [];
        g_dividend_export_state.notificationSummary = [];
        renderDividendPaymentRunState();
        renderDividendNotificationSummary();
        return;
    }

    const [runResult, notificationResult] = await Promise.all([
        _supabase.rpc('list_dividend_payment_runs', { p_batch_id: batchId }),
        _supabase.rpc('get_dividend_notification_summary', { p_batch_id: batchId })
    ]);

    if (runResult.error) {
        document.getElementById('dividendPaymentRunMeta').innerText = getDividendExportRpcErrorMessage(runResult.error);
        g_dividend_export_state.paymentRuns = [];
        g_dividend_export_state.paymentRunItems = [];
    } else {
        g_dividend_export_state.paymentRuns = Array.isArray(runResult.data) ? runResult.data : [];
        const selectedExists = g_dividend_export_state.paymentRuns.some((run) => String(run.payment_run_id) === String(g_dividend_export_state.selectedPaymentRunId));
        if (!selectedExists) {
            const activeRun = g_dividend_export_state.paymentRuns.find((run) => run.status === 'EXPORTED');
            g_dividend_export_state.selectedPaymentRunId = activeRun?.payment_run_id || g_dividend_export_state.paymentRuns[0]?.payment_run_id || '';
        }

        if (g_dividend_export_state.selectedPaymentRunId) {
            const itemResult = await _supabase.rpc('list_dividend_payment_run_items', {
                p_payment_run_id: g_dividend_export_state.selectedPaymentRunId
            });
            g_dividend_export_state.paymentRunItems = itemResult.error || !Array.isArray(itemResult.data) ? [] : itemResult.data;
        } else {
            g_dividend_export_state.paymentRunItems = [];
        }
    }

    g_dividend_export_state.notificationSummary = notificationResult.error || !Array.isArray(notificationResult.data)
        ? []
        : notificationResult.data;
    renderDividendPaymentRunState();
    renderDividendNotificationSummary();
} // End of fetchDividendPaymentState

function renderDividendExportBatches() {
    const tbody = document.getElementById('dividendExportBatchBody');
    const batches = g_dividend_export_state.batches;

    if (!batches.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-5 text-muted">확정된 배당 회차가 없습니다.</td></tr>';
        renderDividendExportSelectedBatch(null);
        return;
    }

    tbody.innerHTML = batches.map((batch) => {
        const selectedClass = String(batch.batch_id) === String(g_dividend_export_state.selectedBatchId) ? 'table-primary' : '';
        const missingBank = Number(batch.missing_bank_count || 0);
        const bankBadge = missingBank > 0
            ? `<span class="badge bg-danger">${missingBank.toLocaleString('ko-KR')}건 누락</span>`
            : '<span class="badge bg-success bg-opacity-10 text-success">확인</span>';

        return `
            <tr class="${selectedClass}">
                <td>${escapeHtml(batch.fiscal_year || '-')}</td>
                <td class="text-start">
                    <div class="fw-bold">${escapeHtml(batch.title || '-')}</div>
                    <small class="text-muted">${escapeHtml(formatDividendExportDateValue(batch.period_start))} ~ ${escapeHtml(formatDividendExportDateValue(batch.period_end))}</small>
                </td>
                <td>${getDividendExportStatusBadge(batch.status)}</td>
                <td class="text-end fw-bold">${escapeHtml(formatDividendExportMoney(batch.net_total))}</td>
                <td>${bankBadge}</td>
                <td>
                    <button class="btn btn-xs btn-outline-primary" type="button" onclick="selectDividendExportBatch('${escapeJsString(batch.batch_id)}')">
                        선택
                    </button>
                </td>
            </tr>
        `;
    }).join('');
} // End of renderDividendExportBatches

async function initializeDividendExportTab() {
    if (g_dividend_export_state.initialized) return;
    g_dividend_export_state.initialized = true;
    await Promise.all([
        fetchDividendExportBatches(false),
        fetchWithdrawalDeemedDividendReviews(false)
    ]);
} // End of initializeDividendExportTab

async function fetchDividendExportBatches(showToast = false) {
    const tbody = document.getElementById('dividendExportBatchBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-5"><div class="spinner-border text-primary"></div></td></tr>';

    const { data, error } = await _supabase.rpc('list_dividend_export_batches', { p_limit: 50 });

    if (error) {
        const message = getDividendExportRpcErrorMessage(error);
        tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-danger">${escapeHtml(message)}</td></tr>`;
        document.getElementById('dividendExportLastLoaded').innerText = message;
        return;
    }

    const rows = Array.isArray(data) ? data : [];
    const batchIds = rows.map((row) => row.batch_id).filter(Boolean);
    let policyMap = new Map();
    if (batchIds.length > 0) {
        const { data: policyRows, error: policyError } = await scopeAdminTenant(_supabase
            .from('coop_dividend_batches')
            .select('id,account_change_deadline,payment_accounts_locked_at'))
            .in('id', batchIds);
        if (!policyError) {
            policyMap = new Map((policyRows || []).map((row) => [String(row.id), row]));
        }
    }
    g_dividend_export_state.batches = rows.map((row) => ({
        ...row,
        ...(policyMap.get(String(row.batch_id)) || {})
    }));

    const selectedStillExists = g_dividend_export_state.batches.some((batch) => String(batch.batch_id) === String(g_dividend_export_state.selectedBatchId));
    if (!selectedStillExists) {
        g_dividend_export_state.selectedBatchId = g_dividend_export_state.batches[0]?.batch_id || '';
    }

    g_dividend_export_state.bankRows = null;
    g_dividend_export_state.taxRows = null;
    g_dividend_export_state.withholdingSummaryRows = null;

    renderDividendExportBatches();
    renderDividendExportSelectedBatch(getDividendExportSelectedBatch());
    document.getElementById('dividendExportLastLoaded').innerText = g_dividend_export_state.selectedBatchId
        ? '회차를 선택했습니다. 다운로드 버튼을 누르면 최신 행을 조회합니다.'
        : '파일 데이터가 아직 준비되지 않았습니다.';

    await fetchDividendPaymentState();
    if (showToast) myAlert('확정 배당 회차를 새로고침했습니다.');
} // End of fetchDividendExportBatches

async function selectDividendExportBatch(batchId) {
    g_dividend_export_state.selectedBatchId = String(batchId || '');
    g_dividend_export_state.bankRows = null;
    g_dividend_export_state.taxRows = null;
    g_dividend_export_state.withholdingSummaryRows = null;
    renderDividendExportBatches();
    renderDividendExportSelectedBatch(getDividendExportSelectedBatch());
    document.getElementById('dividendExportLastLoaded').innerText = '선택한 회차의 파일 데이터가 아직 준비되지 않았습니다.';
    await fetchDividendPaymentState();
} // End of selectDividendExportBatch

function requireDividendExportBatchId() {
    const batchId = String(g_dividend_export_state.selectedBatchId || '').trim();
    if (!batchId) {
        myAlert('확정 배당 회차를 먼저 선택해주세요.', 'warning');
        return '';
    }
    return batchId;
} // End of requireDividendExportBatchId

async function loadDividendExportRows(forceRefresh = false) {
    const batchId = requireDividendExportBatchId();
    if (!batchId) return null;

    if (!forceRefresh
        && Array.isArray(g_dividend_export_state.bankRows)
        && Array.isArray(g_dividend_export_state.taxRows)
        && Array.isArray(g_dividend_export_state.withholdingSummaryRows)) {
        return {
            bankRows: g_dividend_export_state.bankRows,
            taxRows: g_dividend_export_state.taxRows,
            withholdingSummaryRows: g_dividend_export_state.withholdingSummaryRows
        };
    }

    const debitMemo = document.getElementById('dividendExportDebitMemo')?.value || '배당금';
    const creditMemo = document.getElementById('dividendExportCreditMemo')?.value || '배당금';

    showLoading(true);
    try {
        const [bankResult, taxResult, summaryResult] = await Promise.all([
            _supabase.rpc('get_dividend_bank_transfer_rows', {
                p_batch_id: batchId,
                p_debit_memo: debitMemo,
                p_credit_memo: creditMemo
            }),
            _supabase.rpc('get_dividend_tax_ledger_rows', { p_batch_id: batchId }),
            _supabase.rpc('get_dividend_withholding_summary', { p_batch_id: batchId })
        ]);

        const error = bankResult.error || taxResult.error || summaryResult.error;
        if (error) throw error;

        g_dividend_export_state.bankRows = Array.isArray(bankResult.data) ? bankResult.data : [];
        g_dividend_export_state.taxRows = Array.isArray(taxResult.data) ? taxResult.data : [];
        g_dividend_export_state.withholdingSummaryRows = Array.isArray(summaryResult.data) ? summaryResult.data : [];
        document.getElementById('dividendExportLastLoaded').innerText = `${formatAdminMemberKstDateTime(new Date())} 기준 파일 데이터 준비 완료`;

        return {
            bankRows: g_dividend_export_state.bankRows,
            taxRows: g_dividend_export_state.taxRows,
            withholdingSummaryRows: g_dividend_export_state.withholdingSummaryRows
        };
    } catch (e) {
        const message = getDividendExportRpcErrorMessage(e);
        document.getElementById('dividendExportLastLoaded').innerText = message;
        myAlert('파일 데이터 조회 실패: ' + message, 'error');
        return null;
    } finally {
        showLoading(false);
    }
} // End of loadDividendExportRows

function applyDividendExportSheetWidths(sheet, widths) {
    sheet['!cols'] = widths.map((wch) => ({ wch }));
} // End of applyDividendExportSheetWidths

function createDividendPaymentRequestKey(batchId) {
    const randomPart = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `dividend-payment:${batchId}:${randomPart}`;
} // End of createDividendPaymentRequestKey

async function downloadDividendBankTransferXlsx() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const batchId = requireDividendExportBatchId();
    if (!batchId) return;

    const debitMemo = document.getElementById('dividendExportDebitMemo')?.value || '배당금';
    const creditMemo = document.getElementById('dividendExportCreditMemo')?.value || '배당금';
    showLoading(true);
    try {
        const { data: run, error: runError } = await _supabase.rpc('prepare_dividend_payment_run', {
            p_batch_id: batchId,
            p_adapter_key: 'bank_bulk_transfer_sample_xlsx',
            p_debit_memo: debitMemo,
            p_credit_memo: creditMemo,
            p_request_key: createDividendPaymentRequestKey(batchId)
        });
        if (runError) throw runError;

        const runId = String(run?.payment_run_id || '');
        if (!runId) throw new Error('지급파일 생성 이력이 반환되지 않았습니다.');
        const { data, error } = await _supabase.rpc('get_dividend_payment_run_rows', {
            p_payment_run_id: runId
        });
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        g_dividend_export_state.selectedPaymentRunId = runId;
        if (!rows.length) {
            await fetchDividendPaymentState();
            myAlert(`은행 이체 대상이 없습니다. 계좌 미등록 등으로 ${Number(run?.held_count || 0).toLocaleString('ko-KR')}명이 지급보류되었습니다.`, 'warning');
            return;
        }

        const transferSheetRows = [
            ['입금은행', '입금계좌', '이체금액(원)', '입금계좌 예금주', '내통장표시내용', '받는분통장표시내용'],
            ...rows.map((row) => [
                String(row.bank_name || '').trim(),
                String(row.bank_account || '').replace(/\s+/g, ''),
                Math.trunc(normalizeDividendExportNumber(row.transfer_amount)),
                String(row.bank_holder || row.member_name || '').trim(),
                String(row.debit_memo || '배당금').trim(),
                String(row.credit_memo || '배당금').trim()
            ])
        ];
        const auditSheetRows = [
            ['지급 run ID', runId],
            ['계좌 마감', formatAdminMemberKstDateTime(run?.account_change_deadline)],
            ['이체 대상', rows.length],
            ['지급 보류', Number(run?.held_count || 0)],
            ['생성 시각', formatAdminMemberKstDateTime(new Date())]
        ];
        const bankNameSheetRows = DIVIDEND_BANK_TRANSFER_SAMPLE_BANK_NAMES.map((bankName) => [bankName]);
        const workbook = XLSX.utils.book_new();
        const transferSheet = XLSX.utils.aoa_to_sheet(transferSheetRows);
        const auditSheet = XLSX.utils.aoa_to_sheet(auditSheetRows);
        const bankNameSheet = XLSX.utils.aoa_to_sheet(bankNameSheetRows);

        applyDividendExportSheetWidths(transferSheet, [16, 22, 14, 18, 18, 22]);
        applyDividendExportSheetWidths(auditSheet, [20, 42]);
        applyDividendExportSheetWidths(bankNameSheet, [24]);
        XLSX.utils.book_append_sheet(workbook, transferSheet, '대량이체');
        XLSX.utils.book_append_sheet(workbook, auditSheet, '지급확정정보');
        XLSX.utils.book_append_sheet(workbook, bankNameSheet, '은행명');
        XLSX.writeFile(workbook, makeDividendExportFileName('은행대량이체', 'xlsx'));

        document.getElementById('dividendExportLastLoaded').innerText = `${formatAdminMemberKstDateTime(new Date())} 지급계좌 잠금 및 은행 XLSX 생성 완료`;
        await fetchDividendExportBatches(false);
        myAlert(`은행 지급파일을 확정했습니다.\n이체 대상 ${rows.length.toLocaleString('ko-KR')}명 · 보류 ${Number(run?.held_count || 0).toLocaleString('ko-KR')}명\n은행 이체가 끝난 뒤 반드시 지급 결과를 반영하세요.`);
    } catch (error) {
        myAlert('지급파일 생성 실패: ' + getDividendExportRpcErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
} // End of downloadDividendBankTransferXlsx

async function cancelSelectedDividendPaymentRun() {
    const run = getDividendSelectedPaymentRun();
    if (!run || run.status !== 'EXPORTED') return myAlert('취소할 지급파일이 없습니다.', 'warning');

    myConfirm('이 지급파일을 취소하시겠습니까?\n이미 은행에서 이체를 실행했다면 취소하지 말고 지급 결과를 반영해야 합니다.', async () => {
        showLoading(true);
        const { error } = await _supabase.rpc('cancel_dividend_payment_run', {
            p_payment_run_id: run.payment_run_id,
            p_reason: '관리자 지급파일 재생성'
        });
        showLoading(false);
        if (error) return myAlert('지급파일 취소 실패: ' + getDividendExportRpcErrorMessage(error), 'error');
        g_dividend_export_state.selectedPaymentRunId = '';
        await fetchDividendExportBatches(false);
        myAlert('지급파일을 취소했습니다. 계좌 마감 기준으로 다시 생성할 수 있습니다.');
    });
} // End of cancelSelectedDividendPaymentRun

async function confirmSelectedDividendPaymentRun() {
    const run = getDividendSelectedPaymentRun();
    if (!run || run.status !== 'EXPORTED') return myAlert('결과를 반영할 지급파일이 없습니다.', 'warning');
    const failedIds = Array.from(document.querySelectorAll('.dividend-payment-failed-check:checked'))
        .map((input) => String(input.value || '').trim())
        .filter(Boolean);
    const successCount = Math.max(0, Number(run.item_count || 0) - failedIds.length);
    const confirmText = failedIds.length > 0
        ? `은행 이체 결과를 반영하시겠습니까?\n성공 ${successCount.toLocaleString('ko-KR')}명 · 실패 ${failedIds.length.toLocaleString('ko-KR')}명\n체크한 조합원은 지급실패로 남습니다.`
        : `은행에서 전원 이체가 완료된 것을 확인했습니까?\n${Number(run.item_count || 0).toLocaleString('ko-KR')}명을 지급완료 처리합니다.`;

    myConfirm(confirmText, async () => {
        showLoading(true);
        const { data, error } = await _supabase.rpc('confirm_dividend_payment_run', {
            p_payment_run_id: run.payment_run_id,
            p_paid_at: new Date().toISOString(),
            p_failed_run_item_ids: failedIds,
            p_failure_reason: failedIds.length > 0 ? '은행 이체 결과에서 실패 확인' : null
        });
        if (error) {
            showLoading(false);
            return myAlert('지급 결과 반영 실패: ' + getDividendExportRpcErrorMessage(error), 'error');
        }

        const notificationResult = await dispatchDividendKakaoNotifications(g_dividend_export_state.selectedBatchId, 'dividend_paid', false);
        showLoading(false);
        await fetchDividendExportBatches(false);
        const notificationText = formatDividendNotificationDispatchResult(notificationResult);
        const alertType = getDividendNotificationDispatchAlertType(notificationResult);
        myAlert(`지급 결과를 반영했습니다.\n지급완료 ${Number(data?.paid_count || 0).toLocaleString('ko-KR')}명 · 실패 ${Number(data?.failed_count || 0).toLocaleString('ko-KR')}명 · 보류 ${Number(data?.held_count || 0).toLocaleString('ko-KR')}명\n${notificationText}`, alertType);
    });
} // End of confirmSelectedDividendPaymentRun

const DIVIDEND_NOTIFICATION_CLAIM_LIMIT = 50;

function setDividendNotificationDispatchUi(isDispatching, message) {
    document.querySelectorAll('[data-dividend-notification-dispatch]').forEach(function (button) {
        button.disabled = Boolean(isDispatching);
    });
    const summaryEl = document.getElementById('dividendNotificationSummary');
    if (summaryEl && message) summaryEl.textContent = message;
} // End of setDividendNotificationDispatchUi

function getDividendNotificationEventLabel(eventType) {
    return eventType === 'dividend_paid' ? '지급완료' : '확정';
} // End of getDividendNotificationEventLabel

function getDividendNotificationSkipReasonText(reason) {
    const safeReason = String(reason || '').trim();
    if (safeReason === 'dividend_kakao_disabled') return '조합의 배당 알림톡 설정이 비활성 상태입니다.';
    if (safeReason === 'dividend_kakao_not_configured') return '알림톡 템플릿 또는 발신번호 설정이 필요합니다.';
    if (safeReason === 'template_not_sendable') return '알림톡 템플릿 검수가 완료되지 않아 대기열에 보관했습니다.';
    return safeReason ? `발송 준비가 완료되지 않았습니다. (${safeReason})` : '';
} // End of getDividendNotificationSkipReasonText

function formatDividendNotificationDispatchResult(result) {
    if (!result) return '알림톡 처리 결과를 확인하지 못했습니다.';
    if (result.busy) return '다른 배당 알림을 처리 중이어서 이번 자동 처리는 시작하지 않았습니다.';
    if (!result.ok) return `알림톡 자동 처리 실패: ${result.errorMessage || '알 수 없는 오류'}`;
    if (result.skipReason) return getDividendNotificationSkipReasonText(result.skipReason);
    if (Number(result.claimed || 0) <= 0) return '발송 대기 중인 알림톡이 없습니다.';
    return `알림톡 자동 처리: ${Number(result.batchCount || 0).toLocaleString('ko-KR')}회 · 접수 ${Number(result.accepted || 0).toLocaleString('ko-KR')}건 · 실패 ${Number(result.failed || 0).toLocaleString('ko-KR')}건 · 결과확인 ${Number(result.unknown || 0).toLocaleString('ko-KR')}건 · 미발송 ${Number(result.skipped || 0).toLocaleString('ko-KR')}건`;
} // End of formatDividendNotificationDispatchResult

function getDividendNotificationDispatchAlertType(result) {
    if (!result || result.busy || !result.ok || result.skipReason) return 'warning';
    if (Number(result.failed || 0) > 0 || Number(result.unknown || 0) > 0 || Number(result.skipped || 0) > 0) return 'warning';
    return 'success';
} // End of getDividendNotificationDispatchAlertType

async function dispatchDividendKakaoNotifications(batchId, eventType, showToast = true) {
    const safeBatchId = String(batchId || '').trim();
    const safeEventType = String(eventType || '').trim();
    if (!safeBatchId || !['dividend_finalized', 'dividend_paid'].includes(safeEventType)) {
        return { ok: false, errorMessage: '배당 회차 또는 알림 종류가 올바르지 않습니다.' };
    }
    if (g_dividend_export_state.notificationDispatching) {
        if (showToast) myAlert('배당 알림을 처리 중입니다. 잠시만 기다려주세요.', 'warning');
        return { ok: false, busy: true, errorMessage: '배당 알림 처리 중' };
    }

    const eventLabel = getDividendNotificationEventLabel(safeEventType);
    const outcome = {
        ok: false,
        busy: false,
        batchCount: 0,
        claimed: 0,
        accepted: 0,
        failed: 0,
        unknown: 0,
        skipped: 0,
        skipReason: '',
        errorMessage: ''
    };
    g_dividend_export_state.notificationDispatching = true;
    setDividendNotificationDispatchUi(true, `${eventLabel} 알림 자동 처리를 시작합니다.`);
    try {
        let hasMore = true;
        while (hasMore) {
            setDividendNotificationDispatchUi(
                true,
                `${eventLabel} 알림 자동 처리 중 · ${outcome.batchCount + 1}차(최대 ${DIVIDEND_NOTIFICATION_CLAIM_LIMIT}건) 요청`
            );
            const { data, error } = await invokeAdminMemberEdgeFunction('send-dividend-kakao', {
                batchId: safeBatchId,
                eventType: safeEventType,
                limit: DIVIDEND_NOTIFICATION_CLAIM_LIMIT
            });
            if (error) throw new Error(await getAdminMemberEdgeErrorMessage(error));
            if (data?.ok === false) throw new Error(String(data?.detail || data?.error || '배당 알림 처리 실패'));

            const claimed = Math.max(0, normalizeDividendExportNumber(data?.claimed));
            const skipReason = typeof data?.skipped === 'string' ? String(data.skipped) : '';
            outcome.claimed += claimed;
            outcome.accepted += Math.max(0, normalizeDividendExportNumber(data?.accepted));
            outcome.failed += Math.max(0, normalizeDividendExportNumber(data?.failed));
            outcome.unknown += Math.max(0, normalizeDividendExportNumber(data?.unknown));
            outcome.skipped += typeof data?.skipped === 'number' ? Math.max(0, normalizeDividendExportNumber(data.skipped)) : 0;
            if (claimed > 0) outcome.batchCount += 1;

            setDividendNotificationDispatchUi(
                true,
                `${eventLabel} 알림 자동 처리 중 · ${outcome.batchCount.toLocaleString('ko-KR')}회 · 접수 ${outcome.accepted.toLocaleString('ko-KR')}건 · 실패 ${outcome.failed.toLocaleString('ko-KR')}건`
            );

            if (skipReason) {
                outcome.skipReason = skipReason;
                break;
            }
            if (claimed <= 0) break;
            hasMore = data?.hasMore === true;
        }
        outcome.ok = true;
    } catch (error) {
        CoopSafeLog.warn("[dividend-kakao] dispatch failed:", error);
        outcome.errorMessage = String(error?.message || error || '알 수 없는 오류');
    } finally {
        g_dividend_export_state.notificationDispatching = false;
        setDividendNotificationDispatchUi(false, `${eventLabel} 알림 자동 처리가 끝났습니다.`);
        if (String(g_dividend_export_state.selectedBatchId) === safeBatchId) {
            try {
                await fetchDividendPaymentState();
            } catch (refreshError) {
                CoopSafeLog.warn("[dividend-kakao] summary refresh failed:", refreshError);
            }
        }
    }

    if (showToast) {
        myAlert(formatDividendNotificationDispatchResult(outcome), getDividendNotificationDispatchAlertType(outcome));
    }
    return outcome;
} // End of dispatchDividendKakaoNotifications

async function dispatchSelectedDividendNotifications(eventType) {
    const batchId = requireDividendExportBatchId();
    if (!batchId) return;
    await dispatchDividendKakaoNotifications(batchId, eventType, true);
} // End of dispatchSelectedDividendNotifications

function getDividendTaxIdentifierReviewText(row) {
    if (row?.recipient_identifier_status === 'ENCRYPTED_REFERENCE_PRESENT') return '암호화참조 있음 - 원문 확인 필요';
    return '주민/사업자번호 원문 확인 필요';
} // End of getDividendTaxIdentifierReviewText

async function downloadDividendTaxLedgerXlsx() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const loaded = await loadDividendExportRows(true);
    if (!loaded) return;

    const taxRows = loaded.taxRows || [];
    const summaryRows = loaded.withholdingSummaryRows || [];

    if (!taxRows.length) {
        myAlert('세무 장부로 내보낼 배당 산출 행이 없습니다.', 'warning');
        return;
    }

    const ledgerSheetRows = [
        ['귀속연도', '지급기준일', '지급예정일', '조합원번호', '성명', '식별번호 확인', '세전배당', '소득세', '지방소득세', '세후지급액', '출자금배당', '이용실적배당', '지급상태', '회차'],
        ...taxRows.map((row) => [
            row.tax_year || '',
            formatDividendExportDateValue(row.payment_base_date, ''),
            formatDividendExportDateValue(row.payment_due_date, ''),
            row.member_no || '',
            row.member_name || '',
            getDividendTaxIdentifierReviewText(row),
            Math.trunc(normalizeDividendExportNumber(row.gross_amount)),
            Math.trunc(normalizeDividendExportNumber(row.income_tax_amount)),
            Math.trunc(normalizeDividendExportNumber(row.local_income_tax_amount)),
            Math.trunc(normalizeDividendExportNumber(row.net_amount)),
            Math.trunc(normalizeDividendExportNumber(row.capital_dividend_gross)),
            Math.trunc(normalizeDividendExportNumber(row.usage_dividend_gross)),
            row.payment_status || '',
            row.batch_title || ''
        ])
    ];

    const summarySheetRows = [
        ['지급월', '귀속연도', '대상자수', '세전배당합계', '소득세합계', '지방소득세합계', '원천세합계', '세후지급합계', '원천세 납부기한 검토', '지급명세서 제출기한 검토'],
        ...summaryRows.map((row) => [
            row.payment_month || '',
            row.tax_year || '',
            row.recipient_count || 0,
            Math.trunc(normalizeDividendExportNumber(row.gross_total)),
            Math.trunc(normalizeDividendExportNumber(row.income_tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.local_income_tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.net_total)),
            formatDividendExportDateValue(row.withholding_due_date, ''),
            formatDividendExportDateValue(row.payment_statement_due_date, '')
        ])
    ];

    const checkSheetRows = [
        ['확인항목', '내용'],
        ['파일 성격', '내부 검토 및 세무대리인 전달용 장부입니다.'],
        ['홈택스 전산매체', '고정폭 업로드 파일이 아니므로 홈택스 직접 제출 전 최신 제출요령으로 변환해야 합니다.'],
        ['식별번호', '주민등록번호/사업자등록번호 원문은 이 파일에 자동 노출하지 않습니다. 세무 처리 권한이 있는 경로에서 별도 확인해야 합니다.'],
        ['간이지급명세서', '순수 배당소득 기본 경로가 아니며, 향후 미션 보상이 사업/기타/근로소득으로 분류될 때 별도 report_kind로 사용합니다.']
    ];

    const workbook = XLSX.utils.book_new();
    const ledgerSheet = XLSX.utils.aoa_to_sheet(ledgerSheetRows);
    const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows);
    const checkSheet = XLSX.utils.aoa_to_sheet(checkSheetRows);

    applyDividendExportSheetWidths(ledgerSheet, [12, 12, 12, 16, 14, 30, 14, 12, 14, 14, 14, 14, 12, 24]);
    applyDividendExportSheetWidths(summarySheet, [12, 12, 10, 16, 14, 16, 14, 16, 18, 22]);
    applyDividendExportSheetWidths(checkSheet, [18, 92]);

    XLSX.utils.book_append_sheet(workbook, ledgerSheet, '세무검토장부');
    XLSX.utils.book_append_sheet(workbook, summarySheet, '원천세집계');
    XLSX.utils.book_append_sheet(workbook, checkSheet, '제출전확인');
    XLSX.writeFile(workbook, makeDividendExportFileName('세무검토장부', 'xlsx'));
} // End of downloadDividendTaxLedgerXlsx

function toDividendCsvCell(value) {
    const raw = String(value ?? '');
    if (!/[",\r\n]/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
} // End of toDividendCsvCell

function downloadDividendCsvFile(fileName, rows) {
    const csv = rows.map((row) => row.map(toDividendCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
} // End of downloadDividendCsvFile

async function downloadDividendHometaxPaymentStatementCsv() {
    const loaded = await loadDividendExportRows(true);
    if (!loaded) return;

    const taxRows = loaded.taxRows || [];
    if (!taxRows.length) {
        myAlert('지급명세서 CSV로 내보낼 배당 산출 행이 없습니다.', 'warning');
        return;
    }

    const csvRows = [
        ['귀속연도', '지급기준일', '소득구분', '조합원번호', '성명', '식별번호확인', '세전배당', '소득세', '지방소득세', '세후지급액', '출자금배당', '이용실적배당', '비고'],
        ...taxRows.map((row) => [
            row.tax_year || '',
            formatDividendExportDateValue(row.payment_base_date, ''),
            '배당소득',
            row.member_no || '',
            row.member_name || '',
            getDividendTaxIdentifierReviewText(row),
            Math.trunc(normalizeDividendExportNumber(row.gross_amount)),
            Math.trunc(normalizeDividendExportNumber(row.income_tax_amount)),
            Math.trunc(normalizeDividendExportNumber(row.local_income_tax_amount)),
            Math.trunc(normalizeDividendExportNumber(row.net_amount)),
            Math.trunc(normalizeDividendExportNumber(row.capital_dividend_gross)),
            Math.trunc(normalizeDividendExportNumber(row.usage_dividend_gross)),
            '홈택스 이자ㆍ배당소득 지급명세서 입력 보조용'
        ])
    ];

    downloadDividendCsvFile(makeDividendExportFileName('홈택스_이자배당_지급명세서_검토용', 'csv'), csvRows);
} // End of downloadDividendHometaxPaymentStatementCsv

async function downloadDividendWithholdingSummaryCsv() {
    const loaded = await loadDividendExportRows(true);
    if (!loaded) return;

    const summaryRows = loaded.withholdingSummaryRows || [];
    if (!summaryRows.length) {
        myAlert('원천세 집계 CSV로 내보낼 자료가 없습니다.', 'warning');
        return;
    }

    const csvRows = [
        ['지급월', '귀속연도', '대상자수', '세전배당합계', '소득세합계', '지방소득세합계', '원천세합계', '세후지급합계', '원천세 납부기한 검토', '지급명세서 제출기한 검토', '비고'],
        ...summaryRows.map((row) => [
            row.payment_month || '',
            row.tax_year || '',
            row.recipient_count || 0,
            Math.trunc(normalizeDividendExportNumber(row.gross_total)),
            Math.trunc(normalizeDividendExportNumber(row.income_tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.local_income_tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.tax_total)),
            Math.trunc(normalizeDividendExportNumber(row.net_total)),
            formatDividendExportDateValue(row.withholding_due_date, ''),
            formatDividendExportDateValue(row.payment_statement_due_date, ''),
            '홈택스 원천세 신고 입력 보조용'
        ])
    ];

    downloadDividendCsvFile(makeDividendExportFileName('홈택스_원천세_집계_검토용', 'csv'), csvRows);
} // End of downloadDividendWithholdingSummaryCsv

let g_donation_excel_data = [];
let g_donation_batch_request_key = null;

function getDonationMethodLabel(method) {
    if (method === 'transfer') return '계좌이체';
    if (method === 'cash') return '현금';
    if (method === 'card') return '카드';
    if (method === 'etc') return '기타';
    return '계좌이체';
}

function normalizeDonationMethod(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return 'transfer';
    if (['transfer', '계좌이체', '계좌', '이체', 'bank'].includes(raw)) return 'transfer';
    if (['cash', '현금'].includes(raw)) return 'cash';
    if (['card', '카드'].includes(raw)) return 'card';
    if (['etc', '기타'].includes(raw)) return 'etc';
    return 'transfer';
}

function normalizeDonationBatchRow(row) {
    const pick = (...keys) => {
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
            const value = row[key];
            if (value === null || value === undefined) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            return value;
        }
        return '';
    };

    const memberId = String(pick('조합원ID', 'ID', '아이디', 'member_id', 'memberId') || '').trim();
    const amountRaw = pick('금액', 'amount', 'Amount');
    const amountText = String(amountRaw ?? '').trim();
    const amount = Number(amountText.replace(/,/g, ''));
    const amountError = !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
        ? '금액은 1원 이상의 정수로 입력해 주세요.'
        : !Number.isSafeInteger(amount) ? '금액이 입력 가능한 범위를 넘었습니다.' : '';
    const donationDate = normalizeMemberImportDate(pick('날짜', '기부일', '입금일', 'donation_date', 'date')) || '';
    const method = normalizeDonationMethod(pick('수단', '입금방식', '방식', 'method', 'type'));
    const note = String(pick('비고', '메모', '사유', 'note', 'remark') || '').trim();

    return { memberId, amount, amountText, amountError, donationDate, method, note };
}

function openDonationModal() {
    const owner=memberDetailOwner();
    if(!owner || isAdminMemberSiteProfile() || !canAccessAdminMemberTab('funds-manage') || window.frameElement?.hidden)return;
    if(donationGrantState?.busy || donationGrantState?.completed)return;
    if(!donationGrantState){
        document.getElementById('dn-date').value=getAdminMemberKstDateString();
        donationGrantState={owner,baseline:donationGrantSnapshot(),busy:false,uncertain:false,completed:false,attempt:null,confirmation:null};
    }
    if(!donationBatchState)donationBatchState={owner,revision:0,phase:'ready',file:null,rows:[],key:null,attempt:null,confirmation:null,reader:null,result:null,message:''};
    if(['reading','confirming'].includes(donationBatchState.phase))pauseDonationBatchRead();
    syncDonationGrantState();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('donationModal')).show();
    if(donationBatchState.phase==='file_pending')void retryDonationBatchRead();
}

async function submitDonationGrant() {
    const state=donationGrantState,modal=document.getElementById('donationModal');
    if(!isCurrentDonationGrant(state) || state.busy || state.uncertain || state.completed || donationBatchBusy() || window.frameElement?.hidden
        || !modal?.classList.contains('show') || !document.getElementById('tab-don-single')?.classList.contains('active'))return;
    const memberId = document.getElementById('dn-member-id').value.trim();
    const memberName = document.getElementById('dn-member-name').value.trim();
    const amount = Number(ERPNumberInput.raw(document.getElementById('dn-amount').value));
    const donationDate = document.getElementById('dn-date').value;
    const method = normalizeDonationMethod(document.getElementById('dn-method').value);
    const note = document.getElementById('dn-note').value.trim();

    if (!memberId) return myAlert('대상 조합원을 선택해주세요.', 'warning');
    if (!Number.isSafeInteger(amount) || amount <= 0) return myAlert('정확한 금액을 입력해주세요.', 'warning');
    if (!donationDate) return myAlert('기부일을 선택해주세요.', 'warning');

    const snapshot=donationGrantSnapshot(),confirmation={};state.confirmation=confirmation;
    const args={p_member_text_id:memberId,p_values:{amount, date:donationDate,method,note}};
    const memberLabel = memberName ? `[${memberId}] ${memberName}` : `[${memberId}]`;
    myConfirm(`${memberLabel} 조합원에게\n자산수증이익 ${amount.toLocaleString()}원을 등록하시겠습니까?`, async () => {
        if(!isCurrentDonationGrant(state) || state.confirmation!==confirmation || state.busy || state.uncertain || state.completed || donationBatchBusy()
            || window.frameElement?.hidden || !modal.classList.contains('show') || !document.getElementById('tab-don-single').classList.contains('active'))return;
        if(snapshot!==donationGrantSnapshot())return myAlert('작성 내용이 바뀌었습니다. 다시 확인해 주세요.','warning');
        const signature=JSON.stringify(args);
        if(state.attempt?.signature!==signature)state.attempt={signature,key:crypto.randomUUID()};
        const locked=Array.from(modal.querySelectorAll('input,select,button')).map(node=>[node,node.disabled]);
        state.busy=true;syncDonationGrantState();
        locked.forEach(([node])=>{node.disabled=true;});showLoading(true);
        try{
            const {data,error}=await _supabase.rpc('admin_create_member_donation_secure',{...args,p_request_key:state.attempt.key});
            if(!isCurrentDonationGrant(state))return;
            if(error){
                state.uncertain=!/^(?:22[A-Z0-9]{3}|23[A-Z0-9]{3}|42[A-Z0-9]{3}|P000[0-9]|PT4[0-9]{2}|PGRST202)$/.test(String(error.code||''));
                myAlert(state.uncertain?'등록 결과를 확인하지 못했습니다. 목록에서 등록 여부를 확인해 주세요.':'등록하지 못했습니다. '+error.message,'warning');return;
            }
            if(data?.outcome!=='saved')throw Error('DONATION_RESULT_UNCONFIRMED');
            state.completed=true;
            donationGrantFields().forEach(node=>window.ErpWorkspaceResume?.checkpoint(node));
            modal.addEventListener('hidden.bs.modal',()=>{
                if(!isCurrentDonationGrant(state))return;
                clearDonationGrantDraft(false);
                donationGrantFields().forEach(node=>window.ErpWorkspaceResume?.checkpoint(node));
                if(!window.frameElement?.hidden)myAlert('등록했습니다.');
            },{once:true});
            bootstrap.Modal.getOrCreateInstance(modal).hide();
            void Promise.resolve(fetchGlobalDonations()).catch(()=>{
                if(!donationGrantState && state.owner===memberDetailOwner() && !window.frameElement?.hidden)myAlert('등록했습니다. 목록을 다시 불러와 주세요.','warning');
            });
        }catch(_){
            if(isCurrentDonationGrant(state)){
                if(state.completed)myAlert('등록했습니다. 목록을 다시 불러와 주세요.','warning');
                else{state.uncertain=true;myAlert('등록 결과를 확인하지 못했습니다. 목록에서 등록 여부를 확인해 주세요.','warning');}
            }
        }finally{
            state.busy=false;
            const allowed=state.owner===memberDetailOwner() && !isAdminMemberSiteProfile() && canAccessAdminMemberTab('funds-manage');
            locked.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=allowed?disabled:true;});
            if(isCurrentDonationGrant(state))syncDonationGrantState();syncDonationBatchUi();showLoading(false);
        }
    });
} // End of submitDonationGrant

async function downloadDonationTemplate() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const wsData = [
        ['조합원ID', '금액', '날짜', '수단', '비고'],
        ['2024-001', '100000', '2026-03-23', '계좌이체', '운영기금 후원'],
        ['2024-002', '50000', '2026-03-23', '현금', '행사 모금']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '자산수증이익일괄등록');
    XLSX.writeFile(wb, '자산수증이익_일괄등록_양식.xlsx');
}

async function readDonationExcel(input) {
    const state=donationBatchState,file=input?.files?.[0];
    if(!file || !isCurrentDonationBatch(state,state?.revision,true))return;
    if(['confirming','preparing','saving','unknown'].includes(state.phase) || donationGrantState?.busy){restoreDonationBatchFile(state);return;}
    const revision=++state.revision;
    try{state.reader?.abort();}catch(_){}
    state.reader=null;state.confirmation=null;state.file=file;state.rows=[];state.key=null;state.attempt=null;state.result=null;state.phase='reading';state.message='';
    g_donation_excel_data=[];g_donation_batch_request_key=null;
    document.getElementById('don-excel-preview').style.display='none';
    syncDonationBatchUi();
    const current=()=>{
        if(!isCurrentDonationBatch(state,revision) || state.file!==file || !input.isConnected || input.files?.[0]!==file)return false;
        if(isCurrentDonationBatch(state,revision,true))return true;
        state.phase='file_pending';state.reader=null;state.message='파일을 다시 읽어 주세요.';syncDonationBatchUi();return false;
    };
    const failed=message=>{if(!current())return;state.phase='read_failed';state.reader=null;state.message=message;syncDonationBatchUi();};
    try{
    if(!(await ensureAdminMemberSpreadsheetReady()))return failed('파일 도구를 불러오지 못했습니다. 다시 시도해 주세요.');
    if(!current())return;
    const reader=state.reader=new FileReader();
    reader.onload=function(e){
        if(!current())return;
        try{
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (json.length === 0) {
            return failed('데이터가 없는 엑셀입니다. 다른 파일을 선택해 주세요.');
        }
        if(!current())return;
        state.rows=json;state.key=createAdminBatchRequestKey('donation-import');state.phase='ready';state.reader=null;state.message='작성 중';
        g_donation_excel_data=state.rows;g_donation_batch_request_key=state.key;
        renderDonationBatchPreview();
        }catch(_){failed('엑셀 파일을 읽지 못했습니다. 다시 시도해 주세요.');}
    };
    reader.onerror=()=>failed('파일을 읽지 못했습니다. 다시 시도해 주세요.');
    reader.readAsArrayBuffer(file);
    }catch(_){failed('파일을 읽지 못했습니다. 다시 시도해 주세요.');}
}

async function retryDonationBatchRead() {
    const state=donationBatchState,input=document.getElementById('don-excel-file');
    if(!isCurrentDonationBatch(state,state?.revision,true) || !['file_pending','read_failed'].includes(state.phase) || !state.file)return;
    restoreDonationBatchFile(state);
    if(input?.files?.[0]===state.file)await readDonationExcel(input);
}

function renderDonationBatchPreview() {
    const state=donationBatchState;
    if(!isCurrentDonationBatch(state))return;
    const tbody=document.getElementById('don-excel-tbody');tbody.textContent='';
    state.rows.slice(0,5).forEach(row=>{
            const parsed = normalizeDonationBatchRow(row);
            const tr = document.createElement('tr');

            const tdId = document.createElement('td');
            const tdDate = document.createElement('td');
            const tdAmt = document.createElement('td');
            const tdMethod = document.createElement('td');
            const tdNote = document.createElement('td');

            tdId.textContent = parsed.memberId || '-';
            tdDate.textContent = parsed.donationDate || '-';
            tdAmt.textContent = parsed.amountError ? `${parsed.amountText || '빈칸'} (잘못된 금액)` : parsed.amount.toLocaleString();
            if (parsed.amountError) {tdAmt.classList.add('text-danger');tdAmt.title=parsed.amountError;}
            tdMethod.textContent = getDonationMethodLabel(parsed.method);
            tdNote.textContent = parsed.note || '-';

            tr.appendChild(tdId);
            tr.appendChild(tdDate);
            tr.appendChild(tdAmt);
            tr.appendChild(tdMethod);
            tr.appendChild(tdNote);
            tbody.appendChild(tr);
        });

    const invalidAmounts = state.rows.flatMap((row,index) => normalizeDonationBatchRow(row).amountError ? [index+2] : []);
    document.getElementById('don-excel-count').textContent=`총 ${state.rows.length}건` + (invalidAmounts.length
        ? ` · 잘못된 금액 ${invalidAmounts.length}건: 엑셀 ${invalidAmounts.slice(0,10).join(', ')}행${invalidAmounts.length>10?' 외':''}` : '');
    document.getElementById('don-excel-preview').style.display=state.rows.length?'block':'none';
    syncDonationBatchUi();
}

async function submitDonationBatch() {
    const state=donationBatchState;
    if(!isCurrentDonationBatch(state,state?.revision,true) || !['ready','unknown'].includes(state.phase) || donationGrantState?.busy)return;
    const revision=state.revision;
    if(!state.rows.length)return myAlert('데이터가 없습니다.','warning');
    let attempt=state.attempt;
    if(!attempt){
        let invalidCount = 0;
        const payload = [];
        state.rows.forEach((row, index) => {
            const parsed = normalizeDonationBatchRow(row);
            if (!parsed.memberId || !parsed.donationDate || parsed.amountError) {
                invalidCount++;
                return;
            }
            payload.push({
                row_no: index + 2,
                member_id: parsed.memberId,
                amount: parsed.amount,
                donation_date: parsed.donationDate,
                method: parsed.method,
                note: parsed.note
            });
        });

        if(!payload.length)return myAlert('등록 가능한 행이 없습니다.','warning');
        if(payload.length>500)return myAlert('한 번에 등록할 수 있는 최대 건수는 500건입니다.','warning');
        attempt={key:state.key || createAdminBatchRequestKey('donation-import'),payload,invalidCount};
    }
    const snapshot=JSON.stringify(state.rows),token={accepted:false};
    state.confirmation=token;state.phase='confirming';syncDonationBatchUi();
    myConfirm(state.attempt?'이전 등록 요청의 결과를 다시 확인할까요?':`${attempt.payload.length}건을 등록할까요?${attempt.invalidCount?` 확인이 필요한 ${attempt.invalidCount}건은 제외됩니다.`:''}`,async()=>{
        token.accepted=true;
        if(!isCurrentDonationBatch(state,revision,true) || state.confirmation!==token || state.phase!=='confirming' || donationGrantState?.busy){
            if(isCurrentDonationBatch(state,revision) && state.confirmation===token && state.phase==='confirming'){
                state.confirmation=null;state.phase=state.attempt?'unknown':'ready';syncDonationBatchUi();
            }
            return;
        }
        if(snapshot!==JSON.stringify(state.rows)){
            state.confirmation=null;state.phase=state.attempt?'unknown':'ready';syncDonationBatchUi();
            return myAlert('검토 내용이 바뀌었습니다. 다시 확인해 주세요.','warning');
        }
        state.phase='preparing';syncDonationGrantState();
        let sent=false;
        try{
            const identity=await _supabase.auth.getUser();
            if(identity.error || identity.data?.user?.id!==adminCertificateAuthId)throw Error('DONATION_AUTH_UNCONFIRMED');
            const gate=await window.ErpRuntimeGuard.enforce(_supabase,{moduleKey:'member_admin',moduleLabel:'조합원 관리',redirectUrl:'index.html'});
            if(!gate.ok || String(gate.runtime?.coop_id || '')!==String(g_adminMemberRuntime?.coop_id || '')
                || gate.runtime?.runtime_profile==='site_member' || !isCurrentDonationBatch(state,revision,true)
                || state.confirmation!==token || snapshot!==JSON.stringify(state.rows))throw Error('DONATION_ACCESS_UNCONFIRMED');
            state.attempt=attempt;state.key=attempt.key;g_donation_batch_request_key=attempt.key;
            state.phase='saving';syncDonationGrantState();sent=true;
            const {data:result,error}=await _supabase.rpc('create_donations_secure_batch',{p_request_key:attempt.key,p_rows:attempt.payload});
            if(!isCurrentDonationBatch(state,revision))return;
            const expected=new Set(attempt.payload.map(row=>row.row_no)),items=Array.isArray(result?.items)?result.items:[];
            if(error || result?.request_key!==attempt.key || result?.operation_type!=='DONATION_CREATE'
                || items.length!==expected.size || new Set(items.map(item=>item?.row_no)).size!==expected.size
                || items.some(item=>!expected.has(item?.row_no) || typeof item.ok!=='boolean')
                || result.success_count!==items.filter(item=>item.ok).length || result.failure_count!==items.filter(item=>!item.ok).length)throw Error('DONATION_RESULT_UNCONFIRMED');
            state.result={success:result.success_count,failed:result.failure_count+attempt.invalidCount};
            state.phase='complete';state.message=`등록 완료: ${state.result.success}건 · 실패·검토 필요: ${state.result.failed}건`;
            window.ErpWorkspaceResume?.checkpoint(document.getElementById('don-excel-file'));
            syncDonationGrantState();
            if(isCurrentDonationBatch(state,revision,true))myAlert(state.message);
            if(state.result.success)void Promise.resolve().then(()=>fetchGlobalDonations()).catch(()=>{
                if(!isCurrentDonationBatch(state,revision) || state.phase!=='complete')return;
                state.message='등록했습니다. 목록을 다시 불러와 주세요.';syncDonationBatchUi();
            });
        }catch(_){
            if(!isCurrentDonationBatch(state,revision))return;
            state.phase=state.result?'complete':sent || state.attempt?'unknown':'ready';
            state.message=state.phase==='complete'?'등록했습니다. 목록을 다시 불러와 주세요.':state.phase==='unknown'?'등록 결과를 확인하지 못했습니다. 결과를 다시 확인해 주세요.'
                :'로그인과 등록 권한을 확인하지 못했습니다. 다시 시도해 주세요.';
            if(isCurrentDonationBatch(state,revision,true))myAlert(state.message,'warning');
        }finally{
            if(isCurrentDonationBatch(state,revision)){state.confirmation=null;syncDonationGrantState();}
        }
    });
    document.getElementById('customConfirmModal')?.addEventListener('hidden.bs.modal',()=>{
        queueMicrotask(()=>{
            if(!token.accepted && donationBatchState===state && state.confirmation===token){
                state.confirmation=null;state.phase=state.attempt?'unknown':'ready';syncDonationBatchUi();
            }
        });
    },{once:true});
}

let g_dividend_current_balance = null;

function resetDividendCurrentBalance() {
    g_dividend_current_balance = null;
    const box = document.getElementById('dv-current-balance-box');
    const valueEl = document.getElementById('dv-current-balance');
    const metaEl = document.getElementById('dv-current-balance-meta');

    if (!box || !valueEl || !metaEl) return;

    box.style.display = 'none';
    valueEl.className = 'fw-bold text-primary';
    valueEl.innerText = '0원';
    metaEl.innerText = '';
}

async function refreshDividendCurrentBalance(memberId) {
    const box = document.getElementById('dv-current-balance-box');
    const valueEl = document.getElementById('dv-current-balance');
    const metaEl = document.getElementById('dv-current-balance-meta');

    if (!box || !valueEl || !metaEl) return;

    if (!memberId) {
        resetDividendCurrentBalance();
        return;
    }

    box.style.display = 'block';
    valueEl.className = 'fw-bold text-secondary';
    valueEl.innerText = '조회 중...';
    metaEl.innerText = '이용고배당 내역을 불러오는 중입니다.';

    const { data, error } = await _supabase
        .from('coop_points')
        .select('change_amount')
        .eq('member_id', memberId);

    if (document.getElementById('dv-member-id').value !== memberId) return;

    if (error) {
        g_dividend_current_balance = null;
        valueEl.className = 'fw-bold text-danger';
        valueEl.innerText = '조회 실패';
        metaEl.innerText = error.message || '잔액을 불러오지 못했습니다.';
        return;
    }

    const rows = Array.isArray(data) ? data : [];
    const balance = rows.reduce((sum, row) => sum + Number(row.change_amount || 0), 0);
    g_dividend_current_balance = balance;

    valueEl.className = `fw-bold ${balance >= 0 ? 'text-primary' : 'text-danger'}`;
    valueEl.innerText = `${balance.toLocaleString()}원`;
    metaEl.innerText = rows.length > 0 ? `총 ${rows.length}건 기준 현재 잔액` : '아직 지급/차감 내역이 없습니다.';
}

// 기존 openDividendModal 함수 교체
function openDividendModal() {
    // 필드 초기화
    document.getElementById('dv-member-id').value = '';
    document.getElementById('dv-member-name').value = '';
    document.getElementById('dv-amount').value = '';
    document.getElementById('dv-reason').value = '';
    resetDividendCurrentBalance();

    // 엑셀 탭 초기화
    document.getElementById('div-excel-file').value = '';
    document.getElementById('div-excel-preview').style.display = 'none';
    g_dividend_batch_request_key = null;

    // 첫 번째 탭 선택
    const firstTab = new bootstrap.Tab(document.querySelector('#dividendTab button[data-bs-target="#tab-div-single"]'));
    firstTab.show();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('dividendModal')).show();
}

// 4. 이용고배당 지급 실행 (RPC)
async function submitDividendGrant() {
    const textId = document.getElementById('dv-member-id').value.trim();
    const amount = Number(ERPNumberInput.raw(document.getElementById('dv-amount').value));
    const reason = document.getElementById('dv-reason').value.trim();

    if(!textId || !Number.isFinite(amount) || amount === 0 || !reason) {
        return myAlert("모든 항목을 올바르게 입력해주세요. 금액은 0이 될 수 없습니다.", "warning");
    }

    const currentBalance = Number.isFinite(g_dividend_current_balance) ? g_dividend_current_balance : null;
    const afterBalance = currentBalance === null ? null : currentBalance + amount;
    const balanceSummary = afterBalance === null
        ? ''
        : `\n현재 잔액 ${currentBalance.toLocaleString()}원 → 적용 후 ${afterBalance.toLocaleString()}원`;

    // 용어 통일: 포인트 -> 이용고배당
    myConfirm(`[${textId}] 조합원에게\n이용고배당 ${amount.toLocaleString()}원을 적용하시겠습니까?${balanceSummary}`, async () => {
        showLoading(true);

        const { error } = await _supabase.rpc('grant_dividend_manual', {
            p_member_text_id: textId,
            p_amount: Math.trunc(amount),
            p_reason: reason,
            p_admin_email: document.getElementById('adminProfile').innerText
        });

        showLoading(false);

        if(error) {
            myAlert("처리 실패: " + error.message, "error");
        } else {
            myAlert("이용고배당 적용이 완료되었습니다.");
            bootstrap.Modal.getOrCreateInstance(document.getElementById('dividendModal')).hide();
            fetchGlobalDividends(); // 목록 새로고침
        }
    });
}
    let g_excel_data = []; // 업로드한 데이터 임시 저장
    let g_dividend_batch_request_key = null;

// 엑셀 양식 다운로드
async function downloadDividendTemplate() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const ws_data = [
        ["조합원ID", "금액", "사유"], // 헤더
        ["2024-001", "1000", "2025년 배당금"], // 예시
        ["2024-002", "500", "행사 참여"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배당일괄지급");
    XLSX.writeFile(wb, "이용고배당_일괄지급_양식.xlsx");
}

// 엑셀 파일 읽기
async function readDividendExcel(input) {
    const selectedFile = input.files?.[0];
    if (!selectedFile || !(await ensureAdminMemberSpreadsheetReady())) return;
    if (input.files?.[0] !== selectedFile || !input.isConnected) return;
    const file = input.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet); // 첫 줄 헤더 자동 인식

        if(json.length === 0) {
            myAlert('데이터가 없는 엑셀입니다.', 'warning');
            return;
        }

        g_excel_data = json; // 전역 변수에 저장
        g_dividend_batch_request_key = createAdminBatchRequestKey('usage-reward-import');

        // 미리보기 렌더링 (최대 5개)
        const tbody = document.getElementById('div-excel-tbody');
        tbody.innerHTML = '';

        // 헤더 매핑 유연하게 (조합원ID, ID, 아이디 / 금액, point, amount / 사유, reason)
        const previewList = json.slice(0, 5);
        previewList.forEach(row => {
            const id = row['조합원ID'] || row['ID'] || row['아이디'] || '-';
            const amt = row['금액'] || row['amount'] || 0;
            const reason = row['사유'] || row['비고'] || '-';
            const tr = document.createElement('tr');
            const tdId = document.createElement('td');
            const tdName = document.createElement('td');
            const tdAmt = document.createElement('td');
            const tdReason = document.createElement('td');
            tdId.textContent = String(id);
            tdName.textContent = '-';
            tdAmt.textContent = Number(amt).toLocaleString();
            tdReason.textContent = String(reason);
            tr.appendChild(tdId);
            tr.appendChild(tdName);
            tr.appendChild(tdAmt);
            tr.appendChild(tdReason);
            tbody.appendChild(tr);
        });

        document.getElementById('div-excel-count').innerText = `총 ${json.length}건 대기 중`;
        document.getElementById('div-excel-preview').style.display = 'block';
    };
    reader.readAsArrayBuffer(file);
}

// 엑셀 데이터 일괄 적용
async function submitDividendBatch() {
    if(g_excel_data.length === 0) return myAlert("데이터가 없습니다.", 'warning');

    myConfirm(`총 ${g_excel_data.length}건의 배당을 지급하시겠습니까?\n시간이 조금 걸릴 수 있습니다.`, async () => {
        showLoading(true);

        let invalidCount = 0;
        const adminEmail = document.getElementById('adminProfile').innerText;
        const payload = [];
        g_excel_data.forEach((row, index) => {
            const id = row['조합원ID'] || row['ID'] || row['아이디'];
            const amt = row['금액'] || row['amount'];
            const reason = row['사유'] || row['비고'] || '일괄지급';
            const amount = Number(String(amt ?? '').replace(/,/g, '').trim());

            if (id && Number.isFinite(amount) && amount !== 0) {
                payload.push({
                    row_no: index + 2,
                    member_id: String(id).trim(),
                    amount: Math.trunc(amount),
                    reason: String(reason)
                });
            } else {
                invalidCount++;
            }
        });

        if (payload.length === 0) {
            showLoading(false);
            return myAlert('지급 가능한 행이 없습니다.', 'warning');
        }
        if (payload.length > 500) {
            showLoading(false);
            return myAlert('한 번에 지급할 수 있는 최대 건수는 500건입니다.', 'warning');
        }

        const requestKey = g_dividend_batch_request_key || createAdminBatchRequestKey('usage-reward-import');
        g_dividend_batch_request_key = requestKey;
        const { data: result, error } = await _supabase.rpc('grant_usage_rewards_secure_batch', {
            p_request_key: requestKey,
            p_rows: payload,
            p_admin_email: adminEmail
        });

        showLoading(false);
        if (error) {
            CoopSafeLog.error("이용고배당 일괄 지급 실패:", error);
            myAlert(`일괄 지급 요청에 실패했습니다.<br>${escapeHtml(error.message || error)}`, 'error');
            return;
        }

        const successCnt = Number(result?.success_count || 0);
        const failCnt = invalidCount + Number(result?.failure_count || 0);
        myAlert(`완료되었습니다.<br>성공: ${successCnt}건, 실패: ${failCnt}건`);

        g_dividend_batch_request_key = null;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('dividendModal')).hide();
        fetchGlobalDividends();
    });
}
let g_search_target = ''; // 검색 요청한 출처 (dividend 등)
let g_member_search_open_sequence = 0;
let g_member_search_request_sequence = 0;
let g_member_search_pending_keyword = '';

// 검색 모달 열기
function openMemberSearch(target) {
    g_search_target = target;
    const modalEl = document.getElementById('memberSearchModal');
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    const openSequence = ++g_member_search_open_sequence;
    const seedKeyword = getMemberSearchSeed(target);
    document.getElementById('ms-keyword').value = seedKeyword;
    document.getElementById('ms-result-list').innerHTML = '<div class="text-center py-4 text-muted x-small">이름을 입력하세요.</div>';
    g_member_search_request_sequence += 1;
    g_member_search_pending_keyword = '';

    const focusAndSearch = () => {
        if (openSequence !== g_member_search_open_sequence || !modalEl.classList.contains('show')) return;
        const keywordEl = document.getElementById('ms-keyword');
        keywordEl.focus();
        if (seedKeyword) {
            keywordEl.select();
            searchMemberForModal();
        }
    };

    if (modalEl.classList.contains('show')) {
        requestAnimationFrame(focusAndSearch);
        return;
    }

    modalEl.addEventListener('shown.bs.modal', focusAndSearch, { once: true });
    modalInstance.show();
} // End of openMemberSearch

function getMemberSearchSeed(target) {
    if (target === 'donation') {
        return String(document.getElementById('dn-member-name')?.value || document.getElementById('dn-member-id')?.value || '').trim();
    }
    if (target === 'dividend') {
        return String(document.getElementById('dv-member-name')?.value || document.getElementById('dv-member-id')?.value || '').trim();
    }
    return '';
} // End of getMemberSearchSeed

function clearDonationMemberSelection() {
    const idEl = document.getElementById('dn-member-id');
    if (!idEl) return;
    idEl.value = '';
    syncDonationGrantState();
} // End of clearDonationMemberSelection

// 조합원 검색 실행 (메모리상 데이터 g_members 활용)
function searchMemberForModal() {
    const keyword = document.getElementById('ms-keyword').value.trim();
    const listEl = document.getElementById('ms-result-list');
    const modalEl = document.getElementById('memberSearchModal');

    if(!keyword) return;
    if (g_member_search_pending_keyword === keyword) return;

    const requestSequence = ++g_member_search_request_sequence;
    g_member_search_pending_keyword = keyword;

    // g_members가 비어있다면 한번 로드 시도 (또는 DB 직접 조회)
    // 여기서는 안전하게 RPC 대신 DB 직접 조회 (이름만)
    // 100명 이하라면 g_members 써도 되지만, 안전하게 DB 검색

    listEl.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';

    scopeAdminTenant(_supabase
        .from('coop_members')
        .select('id, name, member_id, phone, status'))
        .ilike('name', `%${keyword}%`)
        .limit(10)
        .then(({ data, error }) => {
            if (
                requestSequence !== g_member_search_request_sequence ||
                !modalEl.classList.contains('show') ||
                document.getElementById('ms-keyword').value.trim() !== keyword
            ) return;
            g_member_search_pending_keyword = '';

            if(error || !data || data.length === 0) {
                listEl.innerHTML = '<div class="text-center py-3 text-muted x-small">검색 결과가 없습니다.</div>';
                return;
            }

            listEl.innerHTML = '';
            data.forEach(m => {
                const phoneEnd = m.phone ? m.phone.slice(-4) : '????';
                const safeMemberIdArg = escapeJsString(m.member_id || '');
                const safeMemberNameArg = escapeJsString(m.name || '');
                const safeMemberNameText = escapeHtml(m.name || '');
                const safeStatusText = escapeHtml(m.status || '');
                const safeMemberIdText = escapeHtml(m.member_id || '');
                listEl.innerHTML += `
                    <button class="list-group-item list-group-item-action py-2" onclick="selectMemberForModal('${safeMemberIdArg}', '${safeMemberNameArg}')">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold small">${safeMemberNameText}</span>
                            <span class="badge bg-light text-dark border">${safeStatusText}</span>
                        </div>
                        <div class="d-flex justify-content-between x-small text-muted mt-1">
                            <span>ID: ${safeMemberIdText}</span>
                            <span>☎ ${phoneEnd}</span>
                        </div>
                    </button>
                `;
            });
        });
}

// 조합원 선택 시 처리
function selectMemberForModal(id, name) {
    const searchTarget = g_search_target;
    if(g_search_target === 'dividend') {
        document.getElementById('dv-member-id').value = id;
        document.getElementById('dv-member-name').value = name;
        refreshDividendCurrentBalance(id);
    } else if (g_search_target === 'donation') {
        if(!isCurrentDonationGrant() || donationGrantState.busy || donationGrantState.uncertain || donationGrantState.completed
            || window.frameElement?.hidden || !document.getElementById('donationModal')?.classList.contains('show'))return;
        document.getElementById('dn-member-id').value = id;
        document.getElementById('dn-member-name').value = name;
        syncDonationGrantState();
    }
    // 다른 곳에서 쓸 경우 else if 추가

    g_member_search_request_sequence += 1;
    g_member_search_pending_keyword = '';
    const modalEl = document.getElementById('memberSearchModal');
    const returnFocusEl = searchTarget === 'donation'
        ? document.getElementById('dn-member-name')
        : document.getElementById('dv-member-name');
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (returnFocusEl && returnFocusEl.closest('.modal')?.classList.contains('show')) {
            returnFocusEl.focus({ preventScroll: true });
        }
    }, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
}

    // ================================================================
// [신규 기능] 업무 신청 관리 (Applications)
// ================================================================

let g_apps = []; // 데이터 저장용
let g_withdrawal_workflows = new Map();
let g_withdrawal_general_assembly_minutes = [];
let g_app_filter = 'pending'; // 현재 탭 상태
let g_app_type_filter = 'extra'; // 추가출자 / 감자·탈퇴 / 전체
let g_application_member_request_sequence = 0;
let g_application_rejection_context = null;
let g_application_rejection_in_flight = false;

// 1. 신청 목록 불러오기
// [디버깅용] fetchApplications 함수
function fetchApplications() {
    const owner = memberDetailOwner();
    const pane = document.getElementById('tab-applications');
    const tbody = document.getElementById('appListBody');
    if (!tbody || !owner || !canAccessAdminMemberTab('applications') || window.frameElement?.hidden
        || !(pane?.classList.contains('active') || pane?.style.display === 'block')) return Promise.resolve();
    if (applicationListRequest?.pending && isCurrentApplicationListRead(applicationListRequest)) return applicationListRequest.promise;
    const request = {owner,revision:++applicationListRevision,pending:true,promise:null};
    applicationListRequest = request;
    tbody.innerHTML = '<tr><td colspan="7" class="py-5"><div class="spinner-border spinner-border-sm text-primary"></div> 로딩중...</td></tr>';
    request.promise = (async () => {
        try {
            // Start together so workspace/list callers share one in-flight summary,
            // even when that read completes before the application sources do.
            void Promise.resolve(fetchMemberReturnSummary()).catch(error => {
                if (isCurrentApplicationListRead(request)) CoopSafeLog.error('[erp/admin_member] application summary failed', error);
            });
            const [applicationsResult, withdrawalResult] = await Promise.all([
                scopeAdminTenant(_supabase.from('coop_applications').select('*'))
                    .order('created_at', { ascending: false }).limit(100),
                _supabase.rpc('admin_list_member_exit_workflows')
            ]);
            if (!isCurrentApplicationListRead(request)) return;
            if (applicationsResult.error) throw applicationsResult.error;
            if (withdrawalResult.error) throw withdrawalResult.error;
            if (!Array.isArray(applicationsResult.data) || !Array.isArray(withdrawalResult.data)) throw new Error('INVALID_APPLICATION_LIST');
            const workflows = new Map(withdrawalResult.data.map(row => [String(row.application_id),row]));
            g_apps = applicationsResult.data;
            g_withdrawal_workflows = workflows;
            renderAppList();
            updateAppBadges();
        } catch (error) {
            if (!isCurrentApplicationListRead(request)) return;
            CoopSafeLog.error('[erp/admin_member] application list failed', error);
            tbody.innerHTML = '<tr><td colspan="7" class="text-danger py-4">신청 내역을 불러오지 못했습니다. <button type="button" class="btn btn-sm btn-outline-primary ms-2" onclick="fetchApplications()">다시 조회</button></td></tr>';
        } finally {
            request.pending = false;
        }
    })();
    return request.promise;
}

function isApplicationWorkPending(app) {
    if (!app || typeof app !== 'object') return false;
    if (app.status === 'pending') return true;
    if (app.type !== 'withdraw') return false;
    const workflow = g_withdrawal_workflows.get(String(app.id || '')) || null;
    return ['refund_calculation_pending', 'deemed_dividend_review_pending', 'refund_payment_pending'].includes(String(workflow?.workflow_status || ''));
}

// 2. 화면 렌더링 (필터 적용)
function renderAppList() {
    const tbody = document.getElementById('appListBody');
    tbody.innerHTML = '';

    // 탭 필터링
    const list = g_apps.filter(item => {
        const matchesType = g_app_type_filter === 'extra'
            ? item.type === 'extra'
            : g_app_type_filter === 'governance'
            ? ['reduction', 'withdraw', 'rejoin'].includes(item.type)
            : true;
        const matchesStatus = g_app_filter === 'pending' ? isApplicationWorkPending(item) : true;
        return matchesType && matchesStatus;
    });

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-muted py-5">해당하는 신청 내역이 없습니다.</td></tr>';
        return;
    }

    const typeMap = { 'extra': '추가출자', 'reduction': '감자', 'withdraw': '탈퇴', 'rejoin': '재가입', 'connect': '계정연결' };

    list.forEach(app => {
        const dateStr = formatAdminMemberKstDate(app.created_at);
        const withdrawal = g_withdrawal_workflows.get(String(app.id || '')) || null;
        const withdrawalAmount = Number(withdrawal?.estimated_refund_amount ?? withdrawal?.decision_amount ?? withdrawal?.capital_balance_at_exit ?? 0);
        const amountStr = app.type === 'withdraw'
            ? `${Math.max(Number.isFinite(withdrawalAmount) ? withdrawalAmount : 0, 0).toLocaleString('ko-KR')}원`
            : app.amount
            ? Number(app.amount).toLocaleString('ko-KR') + '원'
            : '-';
        const safeName = escapeHtml(app.name || '');
        const safeMemberId = escapeHtml(app.member_id || '');
        const safeReason = app.reason ? escapeHtml(app.reason) : '-';
        const safeRejectionReason = app.rejection_reason ? escapeHtml(app.rejection_reason) : '';
        const safeAppIdArg = escapeJsString(String(app.id || ''));
        const applicantCell = app.type === 'extra'
            ? `
                <button type="button"
                        class="btn btn-link text-dark text-decoration-none text-start p-0"
                        onclick="openApplicationMemberModal('${safeAppIdArg}')"
                        aria-haspopup="dialog"
                        aria-label="${safeName} 신청자 기본 정보 확인">
                    <span class="d-block fw-bold">${safeName}</span>
                    <span class="d-block small text-muted">${safeMemberId}</span>
                    <span class="d-inline-flex align-items-center gap-1 small text-primary mt-1">
                        <i class="bi bi-person-vcard" aria-hidden="true"></i> 정보 확인
                    </span>
                </button>
            `
            : `
                <div class="fw-bold">${safeName}</div>
                <small class="text-muted">${safeMemberId}</small>
            `;

        // 상태 뱃지
        let statusBadge = `<span class="badge bg-secondary">${escapeHtml(app.status || '')}</span>`;
        let actionBtns = '-';

        if (app.type === 'withdraw' && app.status === 'pending') {
            const accountReady = Boolean(withdrawal?.refund_account_ready);
            statusBadge = `<span class="badge bg-warning text-dark">탈퇴 신청 대기</span><span class="d-block small mt-1 ${accountReady ? 'text-success' : 'text-danger'}">환급계좌 ${accountReady ? '등록됨' : '미등록'}</span>`;
            actionBtns = `
                <button class="btn btn-sm btn-warning fw-bold py-0" ${accountReady ? `onclick="openWithdrawalWorkflowModal('effect', ${app.id})"` : 'disabled'}>
                    <i class="bi bi-box-arrow-right"></i> 탈퇴 효력 처리
                </button>
                <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="openApplicationRejectionModal(${app.id}, 'withdraw')">승인하지 않음</button>
            `;
        } else if (app.type === 'withdraw' && app.status === 'approved' && withdrawal) {
            const stage = String(withdrawal.workflow_status || '');
            const decisionMinutesLabel = [withdrawal.decision_minutes_doc_no, withdrawal.decision_minutes_title]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .join(' · ');
            const stageLabel = stage === 'refund_calculation_pending'
                ? '탈퇴 완료 · 총회 의결 대기'
                : stage === 'deemed_dividend_review_pending'
                ? '총회 의결 완료 · 의제배당 세무 검토 대기'
                : stage === 'refund_payment_pending'
                ? '총회 의결 완료 · 지급 대기'
                : stage === 'refunded'
                ? (withdrawal.settlement_without_payment ? '반환 없음 · 지분 정산 완료' : '반환 지급 완료')
                : '처리 상태 확인 필요';
            statusBadge = `<span class="badge ${stage === 'refunded' ? 'bg-success' : 'bg-info text-dark'}">${escapeHtml(stageLabel)}</span><span class="d-block small text-muted mt-1">탈퇴 효력일 ${escapeHtml(formatAdminMemberKstDate(withdrawal.effective_date))}</span>${decisionMinutesLabel ? `<span class="d-block small text-primary mt-1"><i class="bi bi-journal-check"></i> ${escapeHtml(decisionMinutesLabel)}</span>` : ''}`;
            if (stage === 'refund_calculation_pending') {
                actionBtns = `<button class="btn btn-sm btn-info fw-bold py-0" onclick="openWithdrawalWorkflowModal('decision', ${app.id})"><i class="bi bi-people"></i> 총회 의결 기록</button>`;
            } else if (stage === 'deemed_dividend_review_pending') {
                actionBtns = usesAdminMemberFullPayoutWorkflow()
                    ? `<button class="btn btn-sm btn-outline-primary fw-bold py-0" onclick="document.getElementById('funds-dividend-exports-tab')?.click()"><i class="bi bi-receipt"></i> 배당 세무 검토로 이동</button>`
                    : `<button class="btn btn-sm btn-outline-primary fw-bold py-0" onclick="openWithdrawalDeemedDividendTaxFromApplication('${escapeJsString(withdrawal.withdrawal_id)}')"><i class="bi bi-receipt"></i> 원천세 검토</button>`;
            } else if (stage === 'refund_payment_pending') {
                const paymentLabel = usesAdminMemberFullPayoutWorkflow() ? '환급 지급 완료' : '수동 송금 확인';
                actionBtns = `<button class="btn btn-sm btn-danger fw-bold py-0" onclick="openWithdrawalWorkflowModal('payment', ${app.id})"><i class="bi bi-bank"></i> ${paymentLabel}</button>`;
            }
        } else if (app.status === 'pending') {
            statusBadge = `<span class="badge bg-warning text-dark">대기중</span>`;
            const safeAppType = escapeJsString(app.type || '');
            const approveButtonClass = app.type === 'extra' ? 'btn-primary' : app.type === 'reduction' ? 'btn-warning' : 'btn-primary';
            const approveButtonLabel = app.type === 'extra'
                ? '<i class="bi bi-cash-coin"></i> 입금 확인·승인'
                : app.type === 'reduction'
                ? '<i class="bi bi-calendar-check"></i> 총회 승인 후 처리'
                : app.type === 'rejoin'
                ? '<i class="bi bi-arrow-repeat"></i> 재가입 승인'
                : '<i class="bi bi-check-lg"></i> 승인/확인';
            actionBtns = app.type === 'connect' ? `
                <button class="btn btn-sm ${approveButtonClass} fw-bold py-0" onclick="processApp(${app.id}, 'approve', '${safeAppType}', ${app.amount})">${approveButtonLabel}</button>
                <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="processApp(${app.id}, 'reject')">거절</button>
            ` : `
                <button class="btn btn-sm ${approveButtonClass} fw-bold py-0" onclick="processApp(${app.id}, 'approve', '${safeAppType}', ${app.amount})">${approveButtonLabel}</button>
                <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="openApplicationRejectionModal(${app.id}, '${safeAppType}')">승인하지 않음</button>
            `;
        } else if (app.status === 'approved') {
            statusBadge = `<span class="badge bg-success">처리완료</span>`;
        } else if (app.status === 'rejected') {
            statusBadge = app.type === 'connect'
                ? `<span class="badge bg-danger">거절됨</span>`
                : `<span class="badge bg-danger">신청 미승인</span><span class="d-block small text-danger mt-1">미승인 사유: ${safeRejectionReason || '기존 처리 건으로 사유 기록 없음'}</span>`;
        } else if (app.status === 'cancelled') {
            statusBadge = `<span class="badge bg-secondary">신청취소</span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td>${dateStr}</td>
                <td><span class="badge bg-light text-dark border">${typeMap[app.type] || app.type}</span></td>
                <td class="text-start ps-4">
                    ${applicantCell}
                </td>
                <td class="text-end fw-bold pe-3">${amountStr}</td>
                <td class="text-start text-truncate" style="max-width: 200px;">${safeReason}</td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    });
}

function renderApplicationMemberModal(app, member, loadErrorMessage = '') {
    const bodyEl = document.getElementById('application-member-modal-body');
    if (!bodyEl) return;

    const applicationName = String(app?.name || '').trim();
    const applicationMemberId = String(app?.member_id || '').trim();
    const currentName = String(member?.name || '').trim();
    const currentMemberId = String(member?.member_id || '').trim();
    const amountValue = Number(app?.amount || 0);
    const amountText = Number.isFinite(amountValue) && amountValue > 0
        ? `${amountValue.toLocaleString()}원`
        : '-';
    const applicationDate = formatAdminMemberKstDate(app?.created_at);
    const identityMismatch = !!member && (
        (applicationName && currentName && applicationName !== currentName) ||
        (applicationMemberId && currentMemberId && applicationMemberId !== currentMemberId)
    );

    const noticeHtml = loadErrorMessage
        ? `<div class="alert alert-danger small mb-3"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(loadErrorMessage)}</div>`
        : !member
        ? '<div class="alert alert-warning small mb-3"><i class="bi bi-exclamation-triangle me-1"></i>현재 조합원 명부에서 연결된 정보를 찾지 못했습니다. 신청서의 이름과 조합원 번호를 먼저 확인해주세요.</div>'
        : identityMismatch
        ? '<div class="alert alert-warning small mb-3"><i class="bi bi-exclamation-triangle me-1"></i>신청 당시 정보와 현재 조합원 명부의 이름 또는 조합원 번호가 다릅니다.</div>'
        : '';

    const memberFieldsHtml = member
        ? `
            <div class="row g-3">
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">이름</div>
                    <div class="fw-bold text-break">${escapeHtml(currentName || '-')}</div>
                </div>
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">조합원 번호</div>
                    <div class="fw-bold text-break">${escapeHtml(currentMemberId || '-')}</div>
                </div>
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">전화번호</div>
                    <div class="fw-semibold text-break">${escapeHtml(member.phone || '-')}</div>
                </div>
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">이메일</div>
                    <div class="fw-semibold text-break">${escapeHtml(member.email || '-')}</div>
                </div>
                <div class="col-12">
                    <div class="small text-muted mb-1">주소</div>
                    <div class="fw-semibold text-break" style="white-space: pre-line;">${escapeHtml(member.address || '-')}</div>
                </div>
                <div class="col-6">
                    <div class="small text-muted mb-1">조합원 유형</div>
                    <div>${escapeHtml(member.member_type || '-')}</div>
                </div>
                <div class="col-6">
                    <div class="small text-muted mb-1">현재 상태</div>
                    <div>${escapeHtml(member.status || '-')}</div>
                </div>
            </div>
        `
        : `
            <div class="row g-3">
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">신청자 이름</div>
                    <div class="fw-bold text-break">${escapeHtml(applicationName || '-')}</div>
                </div>
                <div class="col-12 col-sm-6">
                    <div class="small text-muted mb-1">신청서 조합원 번호</div>
                    <div class="fw-bold text-break">${escapeHtml(applicationMemberId || '-')}</div>
                </div>
            </div>
        `;

    bodyEl.innerHTML = `
        <div class="alert alert-light border d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <span><span class="badge bg-primary me-1">추가출자</span>${escapeHtml(amountText)}</span>
            <span class="small text-muted">신청일 ${escapeHtml(applicationDate || '-')}</span>
        </div>
        ${noticeHtml}
        <div class="border rounded-3 p-3">
            ${memberFieldsHtml}
        </div>
    `;
} // End of renderApplicationMemberModal

async function openApplicationMemberModal(appId) {
    const safeAppId = String(appId || '').trim();
    const app = g_apps.find(function (item) {
        return String(item?.id || '') === safeAppId;
    });
    if (!app || app.type !== 'extra') {
        myAlert('추가출자 신청 정보를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해주세요.', 'warning');
        return;
    }

    const modalEl = document.getElementById('applicationMemberModal');
    const bodyEl = document.getElementById('application-member-modal-body');
    if (!modalEl || !bodyEl) return;

    const requestSequence = ++g_application_member_request_sequence;
    bodyEl.innerHTML = `
        <div class="text-center text-muted py-5">
            <div class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></div>
            조합원 정보를 불러오는 중입니다.
        </div>
    `;

    if (modalEl.dataset.applicationMemberResetBound !== '1') {
        modalEl.addEventListener('hidden.bs.modal', function () {
            g_application_member_request_sequence += 1;
        });
        modalEl.dataset.applicationMemberResetBound = '1';
    }

    applyAdminMemberModalLayer(modalEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    const memberUid = String(app.member_uid || '').trim();
    const memberId = String(app.member_id || '').trim();
    if (!memberUid && !memberId) {
        if (requestSequence === g_application_member_request_sequence) {
            renderApplicationMemberModal(app, null);
        }
        return;
    }

    try {
        let query = scopeAdminTenant(_supabase
            .from('coop_members')
            .select('id,member_id,name,member_type,phone,email,status,address'));
        query = memberUid ? query.eq('id', memberUid) : query.eq('member_id', memberId);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (requestSequence !== g_application_member_request_sequence || !modalEl.classList.contains('show')) return;
        renderApplicationMemberModal(app, data || null);
    } catch (error) {
        CoopSafeLog.error("추가출자 신청자 기본 정보 조회 실패:", error);
        if (requestSequence !== g_application_member_request_sequence || !modalEl.classList.contains('show')) return;
        renderApplicationMemberModal(app, null, '조합원 기본 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
} // End of openApplicationMemberModal

// 3. 상태 탭 전환 (대기중 / 전체)
function filterAppList(mode) {
    g_app_filter = mode;
    // 탭 스타일 변경
    const tabs = document.querySelectorAll('#app-status-tabs .nav-link');
    tabs.forEach(t => t.classList.remove('active', 'fw-bold'));
    if(mode === 'pending') tabs[0].classList.add('active', 'fw-bold');
    else tabs[1].classList.add('active', 'fw-bold');

    renderAppList();
} // End of filterAppList

// 4. 유형 탭 전환 (추가출자 / 감자·탈퇴 / 전체)
function filterAppType(mode) {
    const safeMode = ['extra', 'governance', 'all'].includes(mode) ? mode : 'extra';
    g_app_type_filter = safeMode;

    document.querySelectorAll('#app-type-tabs .nav-link').forEach(tab => {
        tab.classList.remove('active', 'fw-bold');
        tab.classList.add('text-secondary');
    });
    const activeTab = document.getElementById(`app-type-${safeMode}`);
    if (activeTab) {
        activeTab.classList.add('active', 'fw-bold');
        activeTab.classList.remove('text-secondary');
    }

    const governanceNotice = document.getElementById('app-governance-notice');
    if (governanceNotice) governanceNotice.classList.toggle('d-none', safeMode !== 'governance');
    renderAppList();
} // End of filterAppType

function buildWithdrawalMinutesOptionLabel(row) {
    const docNo = String(row?.doc_no || '').trim();
    const title = String(row?.title || '').trim() || '총회 의사록';
    const publishedAt = formatAdminMemberKstDate(row?.published_at, '-');
    return `${docNo ? `${docNo} · ` : ''}${title} · 공개 ${publishedAt}`;
}

function syncWithdrawalDecisionReferenceMode() {
    const minutesEnabled = isAdminMemberRuntimeModuleEnabled('minutes');
    const selectEl = document.getElementById('withdrawalDecisionMinutesId');
    const minutesGroup = document.getElementById('withdrawalDecisionMinutesGroup');
    const referenceGroup = document.getElementById('withdrawalDecisionReferenceGroup');
    const hasSelectedMinutes = minutesEnabled && Boolean(String(selectEl?.value || '').trim());
    if (minutesGroup) minutesGroup.classList.toggle('d-none', !minutesEnabled);
    if (referenceGroup) referenceGroup.classList.toggle('d-none', hasSelectedMinutes);
}

function getWithdrawalDecisionBaselineAmount() {
    const amountEl = document.getElementById('withdrawalDecisionAmount');
    const value = Number(amountEl?.dataset?.baseline || 0);
    return Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;
}

function updateWithdrawalDecisionAmountState() {
    const amountEl = document.getElementById('withdrawalDecisionAmount');
    const adjustmentEl = document.getElementById('withdrawalDecisionAdjustment');
    const requiredEl = document.getElementById('withdrawalDecisionCalculationRequired');
    const taxNoticeEl = document.getElementById('withdrawalDecisionTaxNotice');
    if (!amountEl || !adjustmentEl) return;

    const baseline = getWithdrawalDecisionBaselineAmount();
    const amount = Number(ERPNumberInput.raw(amountEl.value));
    const validAmount = amountEl.value !== '' && Number.isFinite(amount) && Number.isInteger(amount) && amount >= 0;
    const difference = validAmount ? amount - baseline : 0;
    const differs = validAmount && difference !== 0;

    adjustmentEl.classList.remove('text-success', 'text-danger', 'text-primary');
    if (!validAmount) {
        adjustmentEl.textContent = '0원 이상의 정수 금액을 입력해주세요.';
        adjustmentEl.classList.add('text-danger');
    } else if (amount === 0) {
        adjustmentEl.textContent = `반환 없음 · 탈퇴 시점 출자금 ${baseline.toLocaleString('ko-KR')}원은 지분 정산으로 소멸합니다.`;
        adjustmentEl.classList.add('text-danger');
    } else if (difference === 0) {
        adjustmentEl.textContent = '탈퇴 시점 출자금과 같은 금액입니다.';
        adjustmentEl.classList.add('text-success');
    } else if (difference > 0) {
        adjustmentEl.textContent = `탈퇴 시점 출자금보다 ${difference.toLocaleString('ko-KR')}원 많습니다.`;
        adjustmentEl.classList.add('text-primary');
    } else {
        adjustmentEl.textContent = `탈퇴 시점 출자금보다 ${Math.abs(difference).toLocaleString('ko-KR')}원 적습니다.`;
        adjustmentEl.classList.add('text-danger');
    }
    if (requiredEl) requiredEl.classList.toggle('d-none', !differs);
    if (taxNoticeEl) taxNoticeEl.classList.toggle('d-none', !(validAmount && difference > 0));
}

function applyWithdrawalDecisionPreset(mode) {
    const amountEl = document.getElementById('withdrawalDecisionAmount');
    if (!amountEl) return;
    amountEl.value = mode === 'none' ? '0' : String(getWithdrawalDecisionBaselineAmount());
    updateWithdrawalDecisionAmountState();
    amountEl.focus({ preventScroll: true });
}

function normalizeWithdrawalTransferBankName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const compact = raw.replace(/\s+/g, '').toLowerCase();
    const aliases = {
        '국민': 'KB국민은행',
        '국민은행': 'KB국민은행',
        'kb국민': 'KB국민은행',
        'kb국민은행': 'KB국민은행',
        '기업': 'IBK기업은행',
        '기업은행': 'IBK기업은행',
        'ibk기업': 'IBK기업은행',
        'ibk기업은행': 'IBK기업은행',
        '농협은행': 'NH농협은행',
        'nh농협': 'NH농협은행',
        'nh농협은행': 'NH농협은행',
        '신한': '신한은행',
        '우리': '우리은행',
        '하나': '하나은행',
        '하나은행': '하나은행',
        '대구': 'iM뱅크 (구)대구',
        '대구은행': 'iM뱅크 (구)대구',
        'im뱅크': 'iM뱅크 (구)대구',
        '토스': '토스뱅크',
        '카카오': '카카오뱅크',
        '신용협동조합': '신협'
    };
    const normalized = aliases[compact] || raw;
    const allowed = new Set(DIVIDEND_BANK_TRANSFER_SAMPLE_BANK_NAMES
        .map((bankName) => String(bankName || '').trim())
        .filter((bankName) => bankName && !bankName.startsWith('*')));
    return allowed.has(normalized) ? normalized : '';
}

async function downloadWithdrawalBankTransferXlsx() {
    if (!(await ensureAdminMemberSpreadsheetReady())) return;
    const fullWorkflow = usesAdminMemberFullPayoutWorkflow();
    const readinessText = fullWorkflow
        ? '총회 반환액 확정, 출자금 반환 지출결의 승인과 회계 연동까지 마친 미지급 건'
        : '총회 반환액 확정과 필요한 원천세 검토를 마친 미지급 건';
    myConfirm(
        `${readinessText}을 신협 대량이체 파일로 내려받습니다. 의제배당 초과분이 있는 건은 세무 검토가 끝난 뒤 원천세를 뺀 실지급액만 포함됩니다.\n\n은행에 올리기 전에 대상자·계좌·금액을 다시 확인하시겠습니까?`,
        async function () {
            showLoading(true);
            try {
                const { data, error } = await _supabase.rpc('admin_get_withdrawal_refund_bank_export_rows');
                if (error) throw error;

                const sourceRows = Array.isArray(data) ? data : [];
                const heldRows = [];
                const readyRows = [];
                sourceRows.forEach((row) => {
                    const normalizedBankName = normalizeWithdrawalTransferBankName(row?.bank_name);
                    const amount = Math.trunc(Number(row?.transfer_amount || 0));
                    if (!row?.export_ready || !normalizedBankName || amount <= 0) {
                        heldRows.push({
                            ...row,
                            hold_reason: row?.hold_reason || (!normalizedBankName ? '신협 양식 은행명 확인 필요' : '반환액 확인 필요')
                        });
                        return;
                    }
                    readyRows.push({ ...row, normalized_bank_name: normalizedBankName, transfer_amount: amount });
                });

                if (!readyRows.length) {
                    const heldMessage = heldRows.length
                        ? `\n계좌 또는 은행명 확인이 필요한 보류 ${heldRows.length.toLocaleString('ko-KR')}건이 있습니다.`
                        : '';
                    const emptyGuide = fullWorkflow
                        ? '출자금 반환 지출결의 완료와 회계관리의 전자결재 연동 여부를 확인해주세요.'
                        : '총회 반환액 확정, 원천세 검토와 환급계좌 등록 여부를 확인해주세요.';
                    myAlert(`현재 내려받을 반환 지급 대상이 없습니다. ${emptyGuide}${heldMessage}`, 'warning');
                    return;
                }

                const transferSheetRows = [
                    ['입금은행', '입금계좌', '이체금액(원)', '입금계좌 예금주', '내통장표시내용', '받는분통장표시내용'],
                    ...readyRows.map((row) => [
                        row.normalized_bank_name,
                        String(row.bank_account || '').replace(/\s+/g, ''),
                        row.transfer_amount,
                        String(row.bank_holder || row.member_name || '').trim(),
                        String(row.debit_memo || `${row.member_name || ''}환급`).trim(),
                        String(row.credit_memo || '탈퇴지분정산').trim()
                    ])
                ];
                const bankNameSheetRows = DIVIDEND_BANK_TRANSFER_SAMPLE_BANK_NAMES.map((bankName) => [bankName]);
                const workbook = XLSX.utils.book_new();
                const transferSheet = XLSX.utils.aoa_to_sheet(transferSheetRows);
                const bankNameSheet = XLSX.utils.aoa_to_sheet(bankNameSheetRows);
                applyDividendExportSheetWidths(transferSheet, [16, 22, 14, 18, 18, 22]);
                applyDividendExportSheetWidths(bankNameSheet, [24]);
                XLSX.utils.book_append_sheet(workbook, transferSheet, '대량이체');
                XLSX.utils.book_append_sheet(workbook, bankNameSheet, '은행명');

                const today = getAdminMemberKstDateString().replace(/-/g, '');
                XLSX.writeFile(workbook, `탈퇴지분정산_신협대량이체_${today}.xlsx`);

                const totalAmount = readyRows.reduce((sum, row) => sum + row.transfer_amount, 0);
                const withheldTaxTotal = readyRows.reduce((sum, row) => sum + Number(row.income_tax_amount || 0) + Number(row.local_tax_amount || 0), 0);
                myAlert(
                    `신협 대량이체 파일을 만들었습니다.\n이체 대상 ${readyRows.length.toLocaleString('ko-KR')}건 · 실지급 ${totalAmount.toLocaleString('ko-KR')}원${withheldTaxTotal > 0 ? `\n의제배당 원천세 별도 관리 ${withheldTaxTotal.toLocaleString('ko-KR')}원` : ''}${heldRows.length ? `\n계좌 또는 은행명 확인으로 제외 ${heldRows.length.toLocaleString('ko-KR')}건` : ''}\n\n실제 이체가 끝난 뒤 각 건의 반환 지급 완료를 처리해주세요.`,
                    heldRows.length ? 'warning' : 'success'
                );
            } catch (error) {
                const message = String(error?.hint || error?.message || error || '알 수 없는 오류');
                myAlert('신협 대량이체 파일 생성 실패: ' + message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

function renderWithdrawalGeneralAssemblyMinutesOptions() {
    const selectEl = document.getElementById('withdrawalDecisionMinutesId');
    const helpEl = document.getElementById('withdrawalDecisionMinutesHelp');
    if (!selectEl) return;

    const currentValue = String(selectEl.value || '').trim();
    const options = ['<option value="">직접 입력</option>'];
    g_withdrawal_general_assembly_minutes.forEach((row) => {
        const id = String(row?.id || '').trim();
        if (!id) return;
        options.push(`<option value="${escapeHtml(id)}">${escapeHtml(buildWithdrawalMinutesOptionLabel(row))}</option>`);
    });
    selectEl.innerHTML = options.join('');
    if (currentValue && g_withdrawal_general_assembly_minutes.some((row) => String(row?.id || '') === currentValue)) {
        selectEl.value = currentValue;
    }
    if (helpEl) {
        helpEl.textContent = g_withdrawal_general_assembly_minutes.length
            ? `${g_withdrawal_general_assembly_minutes.length.toLocaleString('ko-KR')}건의 마감된 총회 의사록을 불러왔습니다.`
            : '연결할 총회 의사록이 없으면 의결 근거를 직접 입력해주세요.';
    }
    syncWithdrawalDecisionReferenceMode();
}

async function fetchWithdrawalGeneralAssemblyMinutes(showToast = false) {
    if (!isAdminMemberRuntimeModuleEnabled('minutes')) {
        g_withdrawal_general_assembly_minutes = [];
        syncWithdrawalDecisionReferenceMode();
        return [];
    }

    const selectEl = document.getElementById('withdrawalDecisionMinutesId');
    const helpEl = document.getElementById('withdrawalDecisionMinutesHelp');
    if (selectEl) selectEl.innerHTML = '<option value="">총회 의사록을 불러오는 중...</option>';
    if (helpEl) helpEl.textContent = '문서함의 마감된 총회 의사록을 조회하고 있습니다.';

    const { data, error } = await scopeAdminTenant(_supabase
        .from('minutes')
        .select('id,title,doc_no,doc_type,status,published_at,created_at'))
        .eq('doc_type', 'GENERAL_ASSEMBLY')
        .eq('status', 'CLOSED')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        g_withdrawal_general_assembly_minutes = [];
        if (selectEl) selectEl.innerHTML = '<option value="">직접 입력</option>';
        if (helpEl) helpEl.textContent = error.message || '총회 의사록 조회 실패';
        syncWithdrawalDecisionReferenceMode();
        if (showToast) myAlert('총회 의사록 조회 실패: ' + error.message, 'error');
        return [];
    }

    g_withdrawal_general_assembly_minutes = Array.isArray(data) ? data : [];
    renderWithdrawalGeneralAssemblyMinutesOptions();
    if (showToast) myAlert('총회 의사록 목록을 새로 불러왔습니다.');
    return g_withdrawal_general_assembly_minutes;
}

function openWithdrawalWorkflowModal(action, applicationId) {
    const app = g_apps.find((item) => Number(item?.id) === Number(applicationId));
    const workflow = g_withdrawal_workflows.get(String(applicationId || '')) || null;
    if (!app || app.type !== 'withdraw') {
        myAlert('탈퇴 신청 정보를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해주세요.', 'error');
        return;
    }

    if (action === 'effect' && !workflow?.refund_account_ready) {
        myAlert('환급 계좌가 등록되지 않았습니다. 조합원 정보에서 은행·계좌번호·예금주를 먼저 입력해주세요.', 'warning');
        return;
    }

    const fullWorkflow = usesAdminMemberFullPayoutWorkflow();
    const config = {
        effect: { title: '탈퇴 효력 처리', submit: '탈퇴 효력 확정' },
        decision: { title: '총회 의결 및 반환액 확정', submit: '반환액 확정' },
        payment: fullWorkflow
            ? { title: '환급 지급 완료', submit: '지급 및 회계 처리 완료' }
            : { title: '수동 송금 확인', submit: '송금 완료 기록' }
    }[action];
    if (!config) return;

    document.getElementById('withdrawalWorkflowAction').value = action;
    document.getElementById('withdrawalWorkflowApplicationId').value = app.id;
    document.getElementById('withdrawalWorkflowId').value = workflow?.withdrawal_id || '';
    document.getElementById('withdrawalWorkflowModalLabel').textContent = config.title;
    document.getElementById('withdrawalWorkflowMember').textContent = `${app.name || '-'} · ${app.member_id || '-'}`;
    document.getElementById('withdrawalWorkflowSubmit').textContent = config.submit;
    document.getElementById('withdrawalWorkflowFeedback').classList.add('d-none');
    document.getElementById('withdrawalEffectFields').classList.toggle('d-none', action !== 'effect');
    document.getElementById('withdrawalDecisionFields').classList.toggle('d-none', action !== 'decision');
    document.getElementById('withdrawalPaymentFields').classList.toggle('d-none', action !== 'payment');
    const paymentNotice = document.getElementById('withdrawalPaymentNotice');
    if (paymentNotice) {
        paymentNotice.textContent = fullWorkflow
            ? '실제 송금이 끝난 뒤에만 완료 처리해주세요. 의제배당 초과분이 있으면 원천세를 뺀 실지급액 기준으로 미지급금 지급 전표가 기록됩니다.'
            : '은행 이체를 실제로 마친 뒤 기록해주세요. 조합원 출자 내역과 감사 로그에는 남지만, 사용하지 않는 회계 전표는 만들지 않습니다.';
    }

    const today = formatAdminMemberKstDate(new Date(), '');
    if (action === 'effect') document.getElementById('withdrawalEffectiveDate').value = today;
    if (action === 'decision') {
        document.getElementById('withdrawalMeetingDate').value = '';
        document.getElementById('withdrawalMeetingDate').min = workflow?.claim_available_on || '';
        const baseline = Math.max(Math.trunc(Number(workflow?.capital_balance_at_exit || 0)), 0);
        const decisionAmountEl = document.getElementById('withdrawalDecisionAmount');
        decisionAmountEl.dataset.baseline = String(baseline);
        decisionAmountEl.value = String(baseline);
        document.getElementById('withdrawalCapitalBaseline').value = `${baseline.toLocaleString('ko-KR')}원`;
        document.getElementById('withdrawalDecisionCalculationNote').value = '';
        const taxNotice = document.getElementById('withdrawalDecisionTaxNotice');
        if (taxNotice) {
            taxNotice.innerHTML = fullWorkflow
                ? '납입출자금을 넘는 금액은 세무상 의제배당 검토 대상입니다. 총회 의결을 저장한 뒤 <b>배당 관리 → 지급·세무 자료 → 탈퇴 지분환급 의제배당</b>에서 원천세를 확인해야 은행 지급 대상으로 전환됩니다.'
                : '납입출자금을 넘는 금액은 세무상 의제배당 검토 대상입니다. 총회 의결을 저장한 뒤 <b>업무 신청 관리 → 감자·탈퇴 관리</b>에서 원천세를 확인해야 은행 지급 대상으로 전환됩니다.';
        }
        updateWithdrawalDecisionAmountState();
        document.getElementById('withdrawalDecisionReference').value = '';
        const minutesSelect = document.getElementById('withdrawalDecisionMinutesId');
        if (minutesSelect) minutesSelect.value = '';
        syncWithdrawalDecisionReferenceMode();
        if (isAdminMemberRuntimeModuleEnabled('minutes')) fetchWithdrawalGeneralAssemblyMinutes(false);
    }
    if (action === 'payment') {
        document.getElementById('withdrawalPaymentDate').value = today;
        document.getElementById('withdrawalPaymentDate').min = workflow?.decision_meeting_date || '';
    }

    const modalEl = document.getElementById('withdrawalWorkflowModal');
    applyAdminMemberModalLayer(modalEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function submitWithdrawalWorkflow() {
    const refreshOwner = memberDetailOwner();
    const action = document.getElementById('withdrawalWorkflowAction').value;
    const applicationId = Number(document.getElementById('withdrawalWorkflowApplicationId').value || 0);
    const withdrawalId = Number(document.getElementById('withdrawalWorkflowId').value || 0);
    const feedback = document.getElementById('withdrawalWorkflowFeedback');
    const submitButton = document.getElementById('withdrawalWorkflowSubmit');
    let rpcName = '';
    let params = {};

    if (action === 'effect') {
        const date = document.getElementById('withdrawalEffectiveDate').value;
        if (!date) return myAlert('탈퇴 효력일을 입력해주세요.', 'warning');
        rpcName = 'admin_confirm_withdrawal_effective';
        params = { p_application_id: applicationId, p_effective_date: date };
    } else if (action === 'decision') {
        const date = document.getElementById('withdrawalMeetingDate').value;
        const amountRaw = ERPNumberInput.raw(document.getElementById('withdrawalDecisionAmount').value);
        const amount = Number(amountRaw);
        const baseline = getWithdrawalDecisionBaselineAmount();
        const calculationNote = document.getElementById('withdrawalDecisionCalculationNote').value.trim();
        const minutesDocId = isAdminMemberRuntimeModuleEnabled('minutes')
            ? String(document.getElementById('withdrawalDecisionMinutesId')?.value || '').trim()
            : '';
        const reference = document.getElementById('withdrawalDecisionReference').value.trim();
        if (!date) return myAlert('총회 의결일을 입력해주세요.', 'warning');
        if (amountRaw === '' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
            return myAlert('총회가 확정한 반환액을 0원 이상의 정수로 입력해주세요.', 'warning');
        }
        if (amount !== baseline && !calculationNote) {
            return myAlert('탈퇴 시점 출자금과 다른 금액을 확정한 결산·지분 산정 근거를 입력해주세요.', 'warning');
        }
        if (!minutesDocId && !reference) return myAlert('총회 의사록을 선택하거나 의결 근거를 입력해주세요.', 'warning');
        rpcName = 'admin_record_withdrawal_refund_decision_v5';
        params = {
            p_withdrawal_id: withdrawalId,
            p_meeting_date: date,
            p_decision_amount: amount,
            p_decision_reference: reference || null,
            p_minutes_doc_id: minutesDocId || null,
            p_calculation_note: calculationNote || null
        };
    } else if (action === 'payment') {
        const date = document.getElementById('withdrawalPaymentDate').value;
        if (!date) return myAlert('실제 지급일을 입력해주세요.', 'warning');
        rpcName = 'admin_complete_withdrawal_refund';
        params = { p_withdrawal_id: withdrawalId, p_payment_date: date };
    } else {
        return;
    }

    submitButton.disabled = true;
    feedback.classList.add('d-none');
    showLoading(true);
    try {
        const { data, error } = await _supabase.rpc(rpcName, params);
        if (error) throw error;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('withdrawalWorkflowModal')).hide();
        await refreshApplicationsAfterConfirmedChange(refreshOwner);
        await loadDashboard();
        myAlert(data?.message || '처리되었습니다.', 'success');
    } catch (error) {
        feedback.textContent = error?.hint || error?.message || String(error);
        feedback.classList.remove('d-none');
    } finally {
        showLoading(false);
        submitButton.disabled = false;
    }
}

// 5. 승인/반려 실행 (핵심)
async function processApp(appId, action, type, amount) {
    let msg = "";
    if (action === 'reject') {
        msg = "이 신청을 반려하시겠습니까?";
    } else {
        // 승인 시 안내 메시지
        if (type === 'extra') msg = `[추가 출자] ${Number(amount).toLocaleString()}원 입금을 확인하셨습니까?\n승인 시 출자금 원장에 '입금' 기록됩니다.`;
        else if (type === 'reduction') msg = `[감자] 총회 승인과 ${Number(amount).toLocaleString()}원 반환금 지급을 모두 완료하셨습니까?\n처리 시 출자금 원장에 '차감(-)' 기록됩니다.`;
        else if (type === 'withdraw') return myAlert('탈퇴는 탈퇴 효력 처리 → 총회 의결 → 환급 지급 순서로 처리해주세요.', 'warning');
        else if (type === 'rejoin') msg = `[재가입] ${Number(amount).toLocaleString()}원 새 출자 약정으로 승인하시겠습니까?\n승인 후 실제 출자금 납입을 확인하면 정조합원으로 전환됩니다.`;
        else msg = "이 신청을 승인 처리하시겠습니까?";
    }

    myConfirm(msg, async function () {
        showLoading(true);
        let resultData = null;
        let processingError = null;
        let notificationResult = null;

        try {
            const { data: authData, error: authError } = await _supabase.auth.getUser();
            if (authError) throw authError;
            if (!authData?.user?.id) throw new Error('로그인 세션을 확인할 수 없습니다.');

            const refreshOwner = memberDetailOwner();
            const { data, error } = await _supabase.rpc('admin_process_application', {
                p_app_id: appId,
                p_action: action,
                p_admin_id: authData.user.id
            });
            if (error) throw error;
            resultData = data || {};
            void refreshApplicationsAfterConfirmedChange(refreshOwner);

            if (!isAdminMemberSiteProfile() && action === 'approve' && type === 'extra') {
                notificationResult = await sendApprovedExtraCapitalNotification(resultData.ref_member_id);
            }

            loadDashboard();     // 대시보드 갱신
        } catch (error) {
            processingError = error;
        } finally {
            showLoading(false);
        }

        if (processingError) {
            myAlert('처리 실패: ' + (processingError?.message || processingError), 'error');
            return;
        }

        const resultMessage = String(resultData?.message || '처리되었습니다.');
        if (notificationResult) {
            myAlert(`${resultMessage}\n${notificationResult.message}`, notificationResult.type);
            return;
        }
        myAlert(resultMessage, 'success');
    });
} // End of processApp

function setApplicationRejectionFeedback(message) {
    const feedbackEl = document.getElementById('applicationRejectionFeedback');
    if (!feedbackEl) return;
    const safeMessage = String(message || '').trim();
    feedbackEl.textContent = safeMessage;
    feedbackEl.classList.toggle('d-none', !safeMessage);
} // End of setApplicationRejectionFeedback

function setApplicationRejectionBusy(isBusy) {
    g_application_rejection_in_flight = Boolean(isBusy);
    const submitButton = document.getElementById('applicationRejectionSubmitButton');
    const cancelButton = document.getElementById('applicationRejectionCancelButton');
    if (submitButton) {
        submitButton.disabled = g_application_rejection_in_flight;
        submitButton.textContent = g_application_rejection_in_flight ? '처리 중...' : '미승인 처리';
    }
    if (cancelButton) cancelButton.disabled = g_application_rejection_in_flight;
} // End of setApplicationRejectionBusy

function syncApplicationRejectionReasonUI() {
    const selected = document.querySelector('input[name="applicationRejectionReason"]:checked');
    const customWrap = document.getElementById('applicationRejectionCustomWrap');
    const customText = document.getElementById('applicationRejectionCustomText');
    const isCustom = selected?.value === 'custom';
    if (customWrap) customWrap.classList.toggle('d-none', !isCustom);
    if (customText) {
        customText.disabled = !isCustom;
        if (!isCustom) customText.value = '';
        if (isCustom) requestAnimationFrame(function () { customText.focus(); });
    }
    setApplicationRejectionFeedback('');
} // End of syncApplicationRejectionReasonUI

function openApplicationRejectionModal(appId, appType) {
    const safeAppId = Number(appId || 0);
    const safeAppType = String(appType || '').trim();
    if (!Number.isInteger(safeAppId) || safeAppId <= 0) {
        myAlert('신청 정보를 확인할 수 없습니다.', 'error');
        return;
    }
    if (!['extra', 'reduction', 'withdraw', 'rejoin'].includes(safeAppType)) {
        myAlert('이 신청은 미승인 사유 처리 대상이 아닙니다.', 'error');
        return;
    }

    g_application_rejection_context = { appId: safeAppId, appType: safeAppType };
    document.querySelectorAll('input[name="applicationRejectionReason"]').forEach(function (input) {
        input.checked = false;
    });
    const customText = document.getElementById('applicationRejectionCustomText');
    if (customText) customText.value = '';
    syncApplicationRejectionReasonUI();
    setApplicationRejectionBusy(false);

    const modalEl = document.getElementById('applicationRejectionModal');
    if (!modalEl) return;
    modalEl.addEventListener('shown.bs.modal', function () {
        document.getElementById('application-rejection-duplicate')?.focus();
    }, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
} // End of openApplicationRejectionModal

function getApplicationRejectionErrorMessage(error) {
    const raw = String(error?.message || error || '').trim();
    if (raw.includes('APPLICATION_REJECTION_REASON_REQUIRED')) return '미승인 사유를 선택해 주세요.';
    if (raw.includes('APPLICATION_REJECTION_CUSTOM_REASON_REQUIRED')) return '직접 입력할 미승인 사유를 작성해 주세요.';
    if (raw.includes('APPLICATION_REJECTION_REASON_TOO_LONG')) return '미승인 사유는 500자 이하로 입력해 주세요.';
    if (raw.includes('APPLICATION_REJECTION_REASON_INVALID')) return '미승인 사유 선택값을 확인해 주세요.';
    if (raw.includes('APPLICATION_REJECTION_ADMIN_REQUIRED')) return '조합 관리자만 신청을 미승인 처리할 수 있습니다.';
    if (raw.includes('APPLICATION_NOT_PENDING')) return '이미 처리되었거나 미승인 처리할 수 없는 신청입니다.';
    if (raw.includes('APPLICATION_NOT_FOUND_OR_FORBIDDEN')) return '신청을 찾을 수 없거나 처리 권한이 없습니다.';
    return raw || '미승인 처리 중 오류가 발생했습니다.';
} // End of getApplicationRejectionErrorMessage

function closeApplicationRejectionModalThen(callback) {
    const modalEl = document.getElementById('applicationRejectionModal');
    if (!modalEl) {
        callback();
        return;
    }
    modalEl.addEventListener('hidden.bs.modal', callback, { once: true });
    moveFocusOutsideModal(modalEl);
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.hide();
} // End of closeApplicationRejectionModalThen

async function submitApplicationRejection() {
    const refreshOwner = memberDetailOwner();
    if (g_application_rejection_in_flight) return;
    const context = g_application_rejection_context;
    const selected = document.querySelector('input[name="applicationRejectionReason"]:checked');
    const reasonCode = String(selected?.value || '').trim();
    const customReason = String(document.getElementById('applicationRejectionCustomText')?.value || '').trim();

    if (!context || !reasonCode) {
        setApplicationRejectionFeedback('미승인 사유를 선택해 주세요.');
        return;
    }
    if (reasonCode === 'custom' && !customReason) {
        setApplicationRejectionFeedback('직접 입력할 미승인 사유를 작성해 주세요.');
        document.getElementById('applicationRejectionCustomText')?.focus();
        return;
    }
    if (customReason.length > 500) {
        setApplicationRejectionFeedback('미승인 사유는 500자 이하로 입력해 주세요.');
        return;
    }

    setApplicationRejectionFeedback('');
    setApplicationRejectionBusy(true);

    try {
        const { data: authData, error: authError } = await _supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData?.user?.id) throw new Error('로그인 세션을 확인할 수 없습니다.');

        const { data, error } = await _supabase.rpc('admin_reject_application', {
            p_app_id: context.appId,
            p_admin_id: authData.user.id,
            p_reason_code: reasonCode,
            p_reason_detail: reasonCode === 'custom' ? customReason : null
        });
        if (error) throw error;

        void refreshApplicationsAfterConfirmedChange(refreshOwner);
        const resultMessage = String(data?.message || '신청 미승인 처리가 완료되었습니다.');
        g_application_rejection_context = null;
        closeApplicationRejectionModalThen(function () {
            loadDashboard();
            myAlert(resultMessage, 'success');
        });
    } catch (error) {
        setApplicationRejectionFeedback(getApplicationRejectionErrorMessage(error));
    } finally {
        setApplicationRejectionBusy(false);
    }
} // End of submitApplicationRejection

// 6. 뱃지 업데이트 (대시보드/사이드바/유형 탭)
function updateAppBadges(pendingCountOverride = null) {
    const pendingCount = (typeof pendingCountOverride === 'number')
        ? pendingCountOverride
        : g_apps.filter(a => a.status === 'pending').length;

    // 대시보드 카드
    const dashEl = document.getElementById('dash-app-pending');
    if(dashEl) dashEl.innerText = pendingCount + '건';

    // 사이드바 뱃지
    const sideEl = document.getElementById('sidebar-app-badge');
    if(sideEl) {
        sideEl.innerText = pendingCount;
        if(pendingCount > 0) sideEl.classList.remove('hidden');
        else sideEl.classList.add('hidden');
    }

    const setTypeCount = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.innerText = count;
    };
    setTypeCount('app-type-extra-count', g_apps.filter(a => a.type === 'extra' && isApplicationWorkPending(a)).length);
    setTypeCount('app-type-governance-count', g_apps.filter(a => ['reduction', 'withdraw', 'rejoin'].includes(a.type) && isApplicationWorkPending(a)).length);
    setTypeCount('app-type-all-count', g_apps.filter(isApplicationWorkPending).length);
} // End of updateAppBadges

// ================================================================
// [신규 기능] 대리 접수 (Proxy)
// ================================================================

let g_proxy_capital_rules = null;
let g_proxy_capital_revision = 0;
let g_proxy_capital_error = false;
let g_proxy_submit_busy = false;
let g_proxy_search_revision = 0;
let g_proxy_search_pending = false;
let g_proxy_selected_member = null;

function resetProxyMemberSearch() {
    ++g_proxy_search_revision;
    g_proxy_search_pending = false;
    g_proxy_selected_member = null;
    ['proxy-member-name', 'proxy-member-uid', 'proxy-member-id'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('proxy-search-results')?.replaceChildren();
    const status = document.getElementById('proxy-search-status');
    if (status) status.textContent = '';
    syncProxyApplicationFields();
}

document.getElementById('proxyModal')?.addEventListener('hide.bs.modal', () => {
    resetProxyMemberSearch();
    ++g_proxy_capital_revision;
});

function selectProxyMember(member, keyword, revision) {
    if (g_proxy_submit_busy || g_proxy_search_pending || revision !== g_proxy_search_revision
        || document.getElementById('proxy-keyword').value.trim() !== keyword) return;
    g_proxy_selected_member = { ...member, keyword };
    document.getElementById('proxy-member-name').value = `${member.name || '이름 미입력'}${member.member_id ? ` (${member.member_id})` : ''}`;
    document.getElementById('proxy-member-uid').value = member.id;
    document.getElementById('proxy-member-id').value = member.member_id || '';
    document.getElementById('proxy-search-status').textContent = '신청자를 선택했습니다.';
    document.querySelectorAll('#proxy-search-results button').forEach(button => {
        button.classList.toggle('active', button.dataset.memberId === String(member.id));
        button.setAttribute('aria-pressed', String(button.dataset.memberId === String(member.id)));
    });
    syncProxyApplicationFields();
}

function hasSelectedProxyMember() {
    return !g_proxy_search_pending && !!g_proxy_selected_member
        && g_proxy_selected_member.keyword === document.getElementById('proxy-keyword').value.trim()
        && String(g_proxy_selected_member.id) === document.getElementById('proxy-member-uid').value;
}

async function loadProxyCapitalRules() {
    const requestRevision = ++g_proxy_capital_revision;
    g_proxy_capital_error = false;
    try {
        const rules = await window.CoopMemberCapital.load(_supabase, true);
        if (requestRevision !== g_proxy_capital_revision) return null;
        g_proxy_capital_rules = rules;
        syncProxyApplicationFields();
        return rules;
    } catch (error) {
        if (requestRevision !== g_proxy_capital_revision) return null;
        g_proxy_capital_rules = null;
        g_proxy_capital_error = true;
        syncProxyApplicationFields();
        throw error;
    }
}

async function openProxyModal() {
    if (g_proxy_submit_busy) return;
    g_proxy_capital_rules = null;
    g_proxy_capital_error = false;
    document.getElementById('proxy-keyword').value = '';
    document.getElementById('proxy-member-name').value = '';
    document.getElementById('proxy-member-uid').value = '';
    document.getElementById('proxy-member-id').value = '';
    document.getElementById('proxy-type').value = 'extra';
    document.getElementById('proxy-amount').value = '';
    document.getElementById('proxy-reason').value = '';
    resetProxyMemberSearch();
    new bootstrap.Modal(document.getElementById('proxyModal')).show();
    try { await loadProxyCapitalRules(); }
    catch (_) {
        const hint = document.getElementById('proxy-capital-guidance');
        if (hint) hint.textContent = '출자 기준을 불러오지 못했습니다. 창을 닫고 다시 열어주세요.';
    }
}

function syncProxyApplicationFields() {
    const typeEl = document.getElementById('proxy-type');
    const amountEl = document.getElementById('proxy-amount');
    const amountFieldEl = document.getElementById('proxy-amount-field');
    const withdrawNoteEl = document.getElementById('proxy-withdraw-note');
    if (!typeEl || !amountEl || !amountFieldEl || !withdrawNoteEl) return;

    const isWithdrawal = typeEl.value === 'withdraw';
    amountFieldEl.classList.toggle('d-none', isWithdrawal);
    withdrawNoteEl.classList.toggle('d-none', !isWithdrawal);
    amountEl.disabled = isWithdrawal || !g_proxy_capital_rules || g_proxy_submit_busy;
    if (isWithdrawal) amountEl.value = '';
    const submitButton = document.getElementById('proxy-submit');
    if (submitButton) submitButton.disabled = g_proxy_submit_busy || !hasSelectedProxyMember() || (!isWithdrawal && !g_proxy_capital_rules);
    ['proxy-keyword', 'proxy-search', 'proxy-type', 'proxy-reason'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = g_proxy_submit_busy;
    });
    document.querySelectorAll('#proxy-search-results button').forEach(button => { button.disabled = g_proxy_submit_busy; });
    const guidance = document.getElementById('proxy-capital-guidance');
    if (g_proxy_capital_rules) {
        window.CoopMemberCapital.applyInput(amountEl, g_proxy_capital_rules, false);
        if (guidance) guidance.textContent = `${g_proxy_capital_rules.unit.toLocaleString()}원 단위로 입력해주세요.`
            + (typeEl.value === 'reduction' ? ` 감자 후 출자금은 최소 ${g_proxy_capital_rules.minimum.toLocaleString()}원 이상이어야 합니다.` : '');
    } else if (guidance) {
        guidance.textContent = g_proxy_capital_error
            ? '출자 기준을 불러오지 못했습니다. 창을 닫고 다시 열어주세요.'
            : '출자 기준을 불러오는 중입니다.';
    }
} // End of syncProxyApplicationFields

// 멤버 검색
async function searchProxyMember() {
    if (g_proxy_submit_busy) return;
    const key = document.getElementById('proxy-keyword').value.trim();
    resetProxyMemberSearch();
    if(key.length < 2) return myAlert("검색어를 2글자 이상 입력하세요.", 'warning');
    const safeKey = sanitizeOrKeyword(key);
    if (!safeKey) return myAlert("검색어를 다시 입력하세요.", 'warning');

    const revision = g_proxy_search_revision;
    g_proxy_search_pending = true;
    const status = document.getElementById('proxy-search-status');
    const results = document.getElementById('proxy-search-results');
    status.textContent = '검색 중…';
    try {
    const { data, error } = await scopeAdminTenant(_supabase
        .from('coop_members')
        .select('id, name, member_id'))
        .or(`name.eq.${safeKey},member_id.eq.${safeKey},phone.eq.${safeKey}`)
        .order('name', { ascending: true })
        .order('member_id', { ascending: true })
        .limit(21);
    if (revision !== g_proxy_search_revision || document.getElementById('proxy-keyword').value.trim() !== key) return;
    if (error) throw error;
    const members = Array.isArray(data) ? data.filter(member => member.id) : [];
    status.textContent = members.length > 20 ? '결과가 많습니다. 조합원 번호나 전화번호로 다시 검색해 주세요.'
        : members.length ? '신청할 사람을 선택해 주세요.' : '검색 결과가 없습니다. 이름 또는 번호를 확인해 주세요.';
    members.slice(0, 20).forEach(member => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'list-group-item list-group-item-action';
        button.dataset.memberId = String(member.id);
        button.textContent = `${member.name || '이름 미입력'} · ${member.member_id || '조합원 번호 미등록'}`;
        button.setAttribute('aria-pressed', 'false');
        button.onclick = () => selectProxyMember(member, key, revision);
        results.append(button);
    });
    } catch (_) {
        if (revision !== g_proxy_search_revision || document.getElementById('proxy-keyword').value.trim() !== key) return;
        status.textContent = '검색하지 못했습니다. 다시 검색해 주세요.';
    } finally {
        if (revision === g_proxy_search_revision) {
            g_proxy_search_pending = false;
            syncProxyApplicationFields();
        }
    }
}

// 대리 등록 실행
async function submitProxyData() {
    const refreshOwner = memberDetailOwner();
    if (g_proxy_submit_busy) return;
    const uid = document.getElementById('proxy-member-uid').value;
    const mid = document.getElementById('proxy-member-id').value; // 텍스트 ID
    const nameStr = document.getElementById('proxy-member-name').value.split(' (')[0]; // 이름만 추출
    const type = document.getElementById('proxy-type').value;
    const rawAmount = ERPNumberInput.raw(document.getElementById('proxy-amount').value);
    const amount = type === 'withdraw' ? 0 : Number(rawAmount || 0);
    const reason = document.getElementById('proxy-reason').value;

    if (!uid || !hasSelectedProxyMember()) return myAlert("검색 결과에서 신청자를 선택해주세요.", 'warning');
    if (type !== 'withdraw' && amount <= 0) return myAlert("금액을 입력해주세요.", 'warning');
    if (!reason) return myAlert("비고란에 접수 사유(전화 등)를 입력해주세요.", 'warning');

    g_proxy_submit_busy = true;
    syncProxyApplicationFields();
    showLoading(true);
    let rules = null;
    try {
      if (type !== 'withdraw') {
        rules = await loadProxyCapitalRules();
        if (!rules) return;
        if (!window.CoopMemberCapital.valid(amount, rules, false)) {
          return myAlert(`금액은 ${rules.unit.toLocaleString()}원 이상, ${rules.unit.toLocaleString()}원 단위의 정수로 입력해주세요.`, 'warning');
        }
      }
      // 기존 서버 권한·현재 조합·좌단위·감자 잔액 검사를 그대로 사용한다.
      const { error } = await _supabase.from('coop_applications').insert(await withAdminTenantPayload({
        member_uid: uid,
        member_id: mid,
        name: nameStr,
        type: type,
        amount: amount,
        reason: '[대리접수] ' + reason,
        status: 'pending'
      }));

      if (error) {
        if (error.message === 'CAPITAL_AMOUNT_INVALID' && rules) {
          myAlert(`금액은 ${rules.unit.toLocaleString()}원 단위로 입력해주세요. 출자 기준이 변경되었다면 창을 다시 열어 확인해주세요.`, 'warning');
        } else if (error.message === 'CAPITAL_MINIMUM_BALANCE_REQUIRED' && rules) {
          myAlert(`감자 후 출자금은 최소 ${rules.minimum.toLocaleString()}원 이상 남아 있어야 합니다. 전액 반환을 원하시면 탈퇴 신청을 선택해주세요.`, 'warning');
        } else if (error.code === '42501') {
          myAlert('이 조합의 신청을 접수할 권한이 없습니다.', 'error');
        } else {
          myAlert('접수하지 못했습니다. 입력 내용을 확인하고 다시 시도해주세요.', 'error');
        }
      } else {
        myAlert("접수되었습니다.\n목록에서 확인 후 승인 처리해주세요.");
        bootstrap.Modal.getInstance(document.getElementById('proxyModal')).hide();
        void refreshApplicationsAfterConfirmedChange(refreshOwner);
      }
    } catch (_) {
      myAlert(rules || type === 'withdraw'
        ? '접수 결과를 확인하지 못했습니다. 업무 신청 목록을 확인한 뒤 다시 시도해주세요.'
        : '출자 기준을 불러오지 못했습니다. 창을 다시 열어 확인해주세요.', 'error');
    } finally {
      g_proxy_submit_busy = false;
      showLoading(false);
      syncProxyApplicationFields();
    }
}



async function loadOfficialSignatures() {
    const body = document.getElementById('officialSignBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">로딩 중...</td></tr>';

    const { data: officials, error } = await scopeAdminTenant(_supabase
        .from('coop_officials')
        .select('id, member_id, role, category, seal_url, status'));

    if (error || !Array.isArray(officials)) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">임원 정보를 불러오지 못했습니다.</td></tr>';
        myAlert('임원 목록 로드 실패: ' + (error?.message || 'Unknown error'), 'error');
        return;
    }

    // Default to active officials to avoid duplicate rows for expired terms.
    const filtered = officials.filter(o => !('status' in o) || !o.status || o.status === 'active');

    const memberIds = [...new Set(filtered.map(o => o.member_id).filter(Boolean))];
    let nameMap = {};
    if (memberIds.length > 0) {
        const { data: members } = await scopeAdminTenant(_supabase
            .from('coop_members')
            .select('member_id, name')
            .in('member_id', memberIds));
        if (Array.isArray(members)) {
            members.forEach(m => { nameMap[m.member_id] = m.name; });
        }
    }

    // Group by member_id so one signature can be reused across multiple rows (roles/terms).
    const groups = {};
    const groupKeys = [];
    filtered.forEach(o => {
        const rawMemberId = o.member_id ? String(o.member_id) : '';
        const keyBase = rawMemberId || String(o.id);
        const key = (rawMemberId ? 'm_' : 'o_') + keyBase.replace(/[^a-zA-Z0-9_-]/g, '_');

        if (!groups[key]) {
            groups[key] = {
                key,
                member_id: rawMemberId,
                officialIds: [],
                roles: new Set(),
                categories: new Set(),
                seal_url: null
            };
            groupKeys.push(key);
        }
        groups[key].officialIds.push(o.id);
        if (o.role) groups[key].roles.add(String(o.role));
        if (o.category) groups[key].categories.add(String(o.category));
        if (o.seal_url) groups[key].seal_url = o.seal_url;
    });

    // Expose to upload handler
    window.__officialSignGroups = groups;

    const rows = groupKeys.map(k => {
        const g = groups[k];
        const name = escapeHtml(nameMap[g.member_id] || g.member_id || '-');

        const categories = Array.from(g.categories);
        const hasDelegate = categories.some(c => String(c).toLowerCase() === 'delegate');
        const hasExec = categories.some(c => String(c).toLowerCase() === 'executive');
        const hasElection = categories.some(c => String(c).toLowerCase() === 'election_comm');
        const categoryParts = [];
        if (hasExec) categoryParts.push('임원');
        if (hasDelegate) categoryParts.push('대의원');
        if (hasElection) categoryParts.push('선거관리');
        const categoryLabel = categoryParts.length ? categoryParts.join('/') : '임원';

        const role = escapeHtml(Array.from(g.roles).filter(Boolean).join(', '));
        const sealStatus = g.seal_url ? '<span class="badge bg-success">등록됨</span>' : '<span class="badge bg-secondary">없음</span>';
        return `
            <tr>
                <td>${name}</td>
                <td>${categoryLabel}</td>
                <td>${role || '-'}</td>
                <td>${sealStatus}</td>
                <td>
                    <input type="file" id="seal-file-${g.key}" accept="image/*" class="form-control form-control-sm">
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="uploadOfficialSeal('${g.key}')">업로드</button>
                </td>
            </tr>
        `;
    });

    body.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="text-center text-muted">등록된 임원이 없습니다.</td></tr>';
}

async function uploadOfficialSeal(groupKey) {
    const group = (window.__officialSignGroups && window.__officialSignGroups[groupKey]) ? window.__officialSignGroups[groupKey] : null;
    if (!group) {
        myAlert('대상 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.', 'warning');
        return;
    }

    const input = document.getElementById(`seal-file-${groupKey}`);
    if (!input || !input.files || input.files.length === 0) {
        myAlert('업로드할 이미지 파일을 선택해주세요.', 'warning');
        return;
    }
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
        myAlert('이미지 파일만 업로드할 수 있습니다.', 'warning');
        return;
    }

	    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'png';
	    const memberSafe = String(group.member_id || groupKey).replace(/[^a-zA-Z0-9_-]/g, '_');
        const sealCoop = String(await getAdminMemberCoopId() || '').trim();
        if (!sealCoop) { myAlert('조합 정보를 확인한 뒤 다시 시도해주세요.', 'warning'); return; }
	    const fileName = `official_seals/${sealCoop}/${memberSafe}/${Date.now()}.${ext}`;

    const { error: uploadError } = await _supabase
        .storage
        .from('attachments')
        .upload(fileName, file, { upsert: true, contentType: file.type });

    if (uploadError) {
        myAlert('업로드 실패: ' + uploadError.message, 'error');
        return;
    }

    let updateError = null;
    if (group.member_id) {
        ({ error: updateError } = await scopeAdminTenant(_supabase
            .from('coop_officials')
            .update({ seal_url: fileName })
            .eq('member_id', group.member_id)));
    } else if (Array.isArray(group.officialIds) && group.officialIds.length > 0) {
        ({ error: updateError } = await scopeAdminTenant(_supabase
            .from('coop_officials')
            .update({ seal_url: fileName })
            .in('id', group.officialIds)));
    } else {
        updateError = { message: 'missing official ids' };
    }

    if (updateError) {
        myAlert('저장 실패: ' + updateError.message, 'error');
        return;
    }

    myAlert('서명 이미지가 등록되었습니다.');
    loadOfficialSignatures();
}
