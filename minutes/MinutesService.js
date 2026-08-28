/*
Version: v1.0.48
Change: 2026-08-28 - Include signature row IDs so document viewers can request separate low-resolution previews.
*/
import { supabase } from '../shared/supabase-client.js';

let cachedRuntimeCoopId = null;
let cachedVisibleCoopId = undefined;

async function getRuntimeCoopId() {
    if (cachedRuntimeCoopId) return cachedRuntimeCoopId;
    const { data, error } = await supabase.rpc('get_my_erp_runtime');
    if (error || !data?.coop_id) return null;
    cachedRuntimeCoopId = data.coop_id;
    return cachedRuntimeCoopId;
}

async function getVisibleCoopId() {
    if (cachedVisibleCoopId !== undefined) return cachedVisibleCoopId;
    const { data, error } = await supabase.rpc('get_visible_coop_id');
    if (error) {
        console.warn('MinutesService.getVisibleCoopId failed:', error);
        cachedVisibleCoopId = null;
        return cachedVisibleCoopId;
    }
    cachedVisibleCoopId = data || null;
    return cachedVisibleCoopId;
}

function scopeByCoop(query, coopId) {
    const safeCoopId = String(coopId || '').trim();
    return query.eq('coop_id', safeCoopId || '00000000-0000-0000-0000-000000000000');
}

function withTenantPayload(payload, coopId) {
    if (!coopId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    return { ...payload, coop_id: coopId };
}

function normalizeAttachmentFileName(value, fallback = '') {
    const raw = String(value || fallback || '').trim();
    if (!raw) return '';
    try {
        return raw.normalize('NFC');
    } catch (e) {
        return raw;
    }
}

async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session || null;
}

async function getMemberByEmail(email) {
    if (!email) return null;
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .ilike('email', String(email).trim())
        .maybeSingle(), coopId);
    if (error) return null;
    return data || null;
}

async function getMemberByAuthId(uid) {
    if (!uid) return null;
    const coopId = await getVisibleCoopId();
    const { data: byAuthUserId, error: authUserIdError } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('auth_user_id', uid)
        .maybeSingle(), coopId);
    if (!authUserIdError && byAuthUserId) return byAuthUserId;

    const { data, error } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('id', uid)
        .maybeSingle(), coopId);
    if (error) return null;
    return data || null;
}

async function getMemberByProfileId(profileId) {
    if (!profileId) return null;
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('id', profileId)
        .maybeSingle(), coopId);
    if (error) return null;
    return data || null;
}

async function getMemberByMemberId(memberId) {
    if (!memberId) return null;
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('member_id', memberId)
        .maybeSingle(), coopId);
    if (error) return null;
    return data || null;
}

async function getMemberByKakaoId(kakaoId) {
    if (!kakaoId) return null;
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('kakao_id', kakaoId)
        .maybeSingle(), coopId);
    if (error) return null;
    return data || null;
}

function getActiveProfileId() {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            return window.sessionStorage.getItem('lastActiveProfile');
        }
    } catch (e) {}
    return null;
}

function getSessionMemberIdMeta(user) {
    return user?.user_metadata?.member_id || user?.user_metadata?.memberId || null;
}

function getSessionKakaoId(user) {
    return user?.identities?.find(i => i.provider === 'kakao')?.id || user?.user_metadata?.kakao_id || null;
}

async function resolveMember(uid, sessionOverride = null, options = {}) {
    const session = sessionOverride || await getSession();
    const user = session?.user || null;
    const resolvedUid = uid || user?.id || null;
    const includeActiveProfile = options.includeActiveProfile !== false;

    // 1) membermanage에서 선택한 활성 프로필(uuid)
    if (includeActiveProfile) {
        const activeProfileId = getActiveProfileId();
        const byProfile = await getMemberByProfileId(activeProfileId);
        if (byProfile) return byProfile;
    }

    // 2) auth 세션 메타데이터의 member_id(text)
    const memberIdMeta = getSessionMemberIdMeta(user);
    const byMemberId = await getMemberByMemberId(memberIdMeta);
    if (byMemberId) return byMemberId;

    // 3) 카카오 identity id 매칭
    const kakaoId = getSessionKakaoId(user);
    const byKakao = await getMemberByKakaoId(kakaoId);
    if (byKakao) return byKakao;

    // 4) uid 매칭 (있으면 사용)
    const byUid = await getMemberByAuthId(resolvedUid);
    if (byUid) return byUid;

    // 5) 이메일 fallback은 사용하지 않음 (중복 이메일 계정 오매칭 방지)
    return null;
}

async function isAdmin(uid, email) {
    const session = await getSession();
    const resolvedUid = uid || session?.user?.id || null;
    const member = await resolveMember(resolvedUid, session);
    const { data: adminRow } = await supabase
        .from('coop_admins')
        .select('id')
        .eq('id', resolvedUid)
        .maybeSingle();
    return (member?.role === 'admin') || !!adminRow;
}

async function getOfficialsByMemberId(memberId) {
    if (!memberId) return [];
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_officials')
        .select('id, seal_url, role, category, status')
        .eq('member_id', memberId)
        .eq('status', 'active')
        .order('id', { ascending: false }), coopId);
    if (error || !Array.isArray(data) || data.length === 0) return [];
    return data;
}

function getDocumentBoxEligibleOfficials(officials) {
    const safeOfficials = Array.isArray(officials) ? officials.filter(Boolean) : [];
    return safeOfficials.filter((official) => {
        const category = String(official?.category || '').toLowerCase();
        return category === 'delegate' || category === 'executive';
    });
}

async function getDocumentBoxAccess(uid = null, sessionOverride = null) {
    const session = sessionOverride || await getSession();
    const user = session?.user || null;
    const resolvedUid = uid || user?.id || null;
    const member = await resolveMember(resolvedUid, session);
    const allOfficials = await getOfficialsByMemberId(member?.member_id);
    const eligibleOfficials = getDocumentBoxEligibleOfficials(allOfficials);
    const admin = resolvedUid ? await isAdmin(resolvedUid, user?.email || '') : false;
    return {
        member: member || null,
        isAdmin: !!admin,
        officials: eligibleOfficials,
        canAccess: !!admin || eligibleOfficials.length > 0
    };
}

function pickPrimaryOfficial(officials) {
    const safeOfficials = Array.isArray(officials) ? officials.filter(Boolean) : [];
    if (safeOfficials.length === 0) return null;

    const ranked = [...safeOfficials].sort((a, b) => {
        const aExecutive = String(a.category || '').toLowerCase() === 'executive' ? 0 : 1;
        const bExecutive = String(b.category || '').toLowerCase() === 'executive' ? 0 : 1;
        if (aExecutive !== bExecutive) return aExecutive - bExecutive;

        const aChair = String(a.role || '').includes('이사장') ? 0 : 1;
        const bChair = String(b.role || '').includes('이사장') ? 0 : 1;
        if (aChair !== bChair) return aChair - bChair;

        const aSeal = a.seal_url ? 0 : 1;
        const bSeal = b.seal_url ? 0 : 1;
        if (aSeal !== bSeal) return aSeal - bSeal;

        return Number(a.id || 0) - Number(b.id || 0);
    });

    return ranked[0] || null;
}

async function getMyOfficial(session) {
    if (!session?.user) return { member: null, official: null, officials: [] };
    const member = await resolveMember(session.user.id, session);
    const officials = await getOfficialsByMemberId(member?.member_id);
    const official = pickPrimaryOfficial(officials);
    if (member && official) return { member, official, officials };

    // 전자서명은 임원 본인 기준으로 동작해야 하므로,
    // 활성 프로필이 단체/가족 계정이면 auth에 묶인 개인 계정으로 한 번 더 찾는다.
    const authMember = await resolveMember(session.user.id, session, { includeActiveProfile: false });
    const authOfficials = await getOfficialsByMemberId(authMember?.member_id);
    const authOfficial = pickPrimaryOfficial(authOfficials);
    return {
        member: authMember || member || null,
        official: authOfficial || official || null,
        officials: authOfficials.length > 0 ? authOfficials : officials
    };
}

async function getOfficials() {
    const coopId = await getVisibleCoopId();
    let data = null;
    let error = null;

    ({ data, error } = await scopeByCoop(supabase
        .from('coop_officials')
        .select('*'), coopId));

    if (error || !data) return [];

    const filtered = data.filter(o => !('status' in o) || o.status === 'active');
    const memberIds = filtered.map(o => o.member_id).filter(Boolean);
    const memberMap = {};
    if (memberIds.length > 0) {
        const { data: members } = await scopeByCoop(supabase
            .from('coop_members')
            .select('member_id, name, member_type')
            .in('member_id', memberIds), coopId);
        if (Array.isArray(members)) {
            members.forEach(m => { memberMap[m.member_id] = m; });
        }
    }
    return filtered.map(o => ({
        ...o,
        role: o.role || o.position || o.category || '',
        position: o.position || o.role || o.category || '',
        name: memberMap[o.member_id]?.name || '',
        member_type: memberMap[o.member_id]?.member_type || ''
    }));
}

async function getCompanyInfo() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('ref_company_info')
        .select('key,value'), coopId);
    const info = {};
    if (Array.isArray(data)) {
        data.forEach(row => {
            if (row?.key) info[row.key] = row.value;
        });
    }
    if (info.logo_horizontal_url && !String(info.logo_horizontal_url).startsWith('http')) {
        const { data: logoData } = supabase.storage.from('assets').getPublicUrl(info.logo_horizontal_url);
        if (logoData?.publicUrl) info.logo_horizontal_url = logoData.publicUrl;
    }
    return { data: info, error };
}

async function listMinutesAdmin() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('id,title,content,created_at,status,doc_type,requires_sign,published_at,visibility,doc_no,receiver,via,file_urls,signer_ids')
        .order('created_at', { ascending: false }), coopId);
    return { data: data || [], error };
}

async function listPublishedMinutes() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('id,title,created_at,doc_type,published_at,visibility,file_urls,signer_ids')
        .not('published_at', 'is', null)
        .order('created_at', { ascending: false }), coopId);
    return { data: data || [], error };
}

async function getLatestPublishedMinuteAt() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1), coopId);
    if (error) return { data: null, error };
    const latest = Array.isArray(data) && data.length > 0 ? (data[0]?.published_at || null) : null;
    return { data: latest, error: null };
}

function inferDocumentAccessScope(title) {
    const text = String(title || '').trim();
    if (text.includes('규정')) return 'MEMBERS';
    if (text.includes('정관') || text.includes('규약')) return 'PUBLIC';
    return 'MEMBERS';
}

async function listLibraryDocuments() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('site_documents')
        .select('id,title,event_date,version,is_current,file_url,category,access_scope,updated_at,document_group_id,revision_summary')
        .eq('category', 'doc')
        .order('event_date', { ascending: false }), coopId);
    const rows = Array.isArray(data) ? data : [];
    const mapped = rows.map((row) => ({
        ...row,
        access_scope: String(row?.access_scope || '').toUpperCase() || inferDocumentAccessScope(row?.title)
    }));
    return { data: mapped, error };
}

async function getLibraryDocumentById(documentId) {
    const safeId = String(documentId || '').trim();
    if (!safeId) return { data: null, error: { message: 'missing document id' } };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('site_documents')
        .select('id,title,content,event_date,version,is_current,file_url,category,access_scope,updated_at,document_group_id,revision_summary')
        .eq('category', 'doc')
        .eq('id', safeId), coopId)
        .maybeSingle();
    if (error || !data) return { data: data || null, error };
    return {
        data: {
            ...data,
            access_scope: String(data?.access_scope || '').toUpperCase() || inferDocumentAccessScope(data?.title)
        },
        error: null
    };
}

async function markDocumentBoxSeen(targetId = null, seenAt = null) {
    const session = await getSession();
    if (!session?.user) return { data: null, error: { message: '로그인이 필요합니다.' } };

    const member = await resolveMember(targetId || session.user.id, session);
    const memberId = targetId || member?.id || null;
    if (!memberId) return { data: null, error: { message: '조합원 프로필을 찾을 수 없습니다.' } };

    const markAt = seenAt || new Date().toISOString();
    const coopId = await getVisibleCoopId();

    const { error: updErr } = await scopeByCoop(supabase
        .from('coop_members')
        .update({ document_box_last_seen_at: markAt }), coopId)
        .eq('id', memberId);
    if (updErr) return { data: null, error: updErr };
    return { data: { member_id: memberId, seen_at: markAt }, error: null };
}

	async function uploadMinuteFiles(fileList) {
	    if (!fileList || fileList.length === 0) return { urls: [], error: null };
	    const urls = [];
	    for (const file of fileList) {
	        const name = normalizeAttachmentFileName(file.name || '');
	        const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
	        if (ext !== 'pdf') {
	            return { urls: [], error: { message: `PDF만 업로드할 수 있습니다: ${name}` } };
	        }
	        const safeName = `${crypto.randomUUID()}_${name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
	        const storagePath = `minutes/${safeName}`;
	        const { error } = await supabase.storage.from('attachments').upload(storagePath, file);
	        if (error) return { urls: [], error };
	        // Store a storage reference (not a public URL). Viewer resolves to a signed URL later.
	        urls.push(`attachments/${storagePath}?display_name=${encodeURIComponent(normalizeAttachmentFileName(name || safeName))}`);
	    }
	    return { urls, error: null };
	}

async function updateMinuteAttachments(id, fileUrls) {
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').update(withTenantPayload({ file_urls: fileUrls }, coopId)).eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function listApprovalNoticeDrafts() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_notices')
        .select('id,title,content,created_at,status,category,is_popup,file_url,file_urls,file_names,doc_no,source_approval_id')
        .not('source_approval_id', 'is', null)
        .neq('status', 'published')
        .order('created_at', { ascending: false }), coopId);
    return { data: data || [], error };
}

async function listCompletedNoticeApprovals() {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('ref_approval')
        .select('id,title,content,created_at,processed_at,status,doc_type,doc_no,receiver,via,file_links,drafter_id,drafter_name,approval_line')
        .eq('doc_type', '공문')
        .in('status', ['완료', '실물결재완료'])
        .order('processed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }), coopId);
    return { data: data || [], error };
}

async function getEmployeePositionByEmpId(empId) {
    const safeEmpId = String(empId || '').trim();
    if (!safeEmpId) return { data: null, error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('ref_employees')
        .select('position')
        .eq('emp_id', safeEmpId)
        .limit(1), coopId);
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return { data: row?.position || null, error };
}

async function listNoticesByApprovalIds(ids) {
    if (!ids || ids.length === 0) return { data: [], error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('coop_notices')
        .select('id,title,content,created_at,status,category,is_popup,file_url,file_urls,file_names,doc_no,source_approval_id')
        .in('source_approval_id', ids), coopId);
    return { data: data || [], error };
}

async function listNoticeMinutesByDocNos(docNos) {
    const safeDocNos = Array.from(
        new Set((Array.isArray(docNos) ? docNos : [])
            .map(v => String(v || '').trim())
            .filter(Boolean))
    );
    if (safeDocNos.length === 0) return { data: [], error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('id,doc_no,doc_type,published_at,status')
        .eq('doc_type', 'NOTICE')
        .in('doc_no', safeDocNos)
        .order('created_at', { ascending: false }), coopId);
    return { data: data || [], error };
}

async function getApprovalsByIds(ids) {
    if (!ids || ids.length === 0) return { data: [], error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('ref_approval')
        .select('id,file_links,doc_no')
        .in('id', ids), coopId);
    return { data: data || [], error };
}

async function upsertNotice(payload) {
    return await supabase.rpc('upsert_notice_secure', payload);
}

async function getMinuteById(minuteId) {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('*')
        .eq('id', minuteId), coopId)
        .single();
    return { data, error };
}

async function listSignaturesForMinutes(minuteIds) {
    if (!minuteIds || minuteIds.length === 0) return { data: [], error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('doc_signatures')
        .select('minute_id, official_id, signed_at')
        .in('minute_id', minuteIds), coopId);
    return { data: data || [], error };
}

async function listSignaturesByMinuteId(minuteId) {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('doc_signatures')
        .select('id, official_id, signature_url, signed_at')
        .eq('minute_id', minuteId), coopId);
    return { data, error };
}

async function listSignatureStatusesByMinuteId(minuteId) {
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('doc_signatures')
        .select('id, official_id, signed_at')
        .eq('minute_id', minuteId), coopId);
    return { data, error };
}

async function listPendingSignMinutes(officialId) {
    if (!officialId) return { data: [], error: null };
    const coopId = await getVisibleCoopId();
    const { data: minutes, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
        .eq('requires_sign', true)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false }), coopId);
    if (error) return { data: [], error };
    const { data: signed } = await scopeByCoop(supabase
        .from('doc_signatures')
        .select('minute_id')
        .eq('official_id', officialId), coopId);
    const signedIds = new Set((signed || []).map(s => s.minute_id));
    const targets = (minutes || []).filter(m => {
        if (signedIds.has(m.id)) return false;
        if (Array.isArray(m.signer_ids) && m.signer_ids.length > 0) {
            return m.signer_ids.includes(officialId);
        }
        return true;
    });
    return { data: targets, error: null };
}

async function createMinute(payload) {
    const coopId = await getRuntimeCoopId();
    return await supabase.from('minutes').insert(withTenantPayload(payload, coopId));
}

async function findMinuteByDocNoAndType(docNo, docType = 'NOTICE') {
    const safeDocNo = String(docNo || '').trim();
    const safeDocType = String(docType || '').trim();
    if (!safeDocNo || !safeDocType) return { data: null, error: null };
    const coopId = await getVisibleCoopId();
    const { data, error } = await scopeByCoop(supabase
        .from('minutes')
        .select('id,doc_no,doc_type,published_at,status')
        .eq('doc_no', safeDocNo)
        .eq('doc_type', safeDocType)
        .order('created_at', { ascending: false })
        .limit(1), coopId);
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return { data: row, error };
}

async function updateMinute(id, payload) {
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').update(withTenantPayload(payload, coopId)).eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function updateMinuteStatus(id, status) {
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').update(withTenantPayload({ status }, coopId)).eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function updateMinuteSignerIds(id, signerIds) {
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').update(withTenantPayload({ signer_ids: signerIds }, coopId)).eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function togglePublish(id, publish, userId) {
    const payload = publish
        ? { published_at: new Date().toISOString(), published_by: userId }
        : { published_at: null, published_by: null };
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').update(withTenantPayload(payload, coopId)).eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function deleteMinute(id) {
    const coopId = await getRuntimeCoopId();
    let query = supabase.from('minutes').delete().eq('id', id);
    query = scopeByCoop(query, coopId);
    return await query;
}

async function insertSignature(payload) {
    const coopId = await getRuntimeCoopId();
    return await supabase.from('doc_signatures').insert(withTenantPayload(payload, coopId));
}

async function deleteSignature(minuteId, officialId) {
    if (!minuteId || !officialId) return { error: { message: 'missing ids' } };
    return await supabase.rpc('cancel_my_signature', {
        p_minute_id: minuteId,
        p_official_id: officialId
    });
}

async function createSignedUrl(bucket, path, expiresIn = 3600) {
    if (!bucket || !path) return { data: null, error: { message: 'missing bucket or path' } };
    return await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
}

export const MinutesService = {
    getSession,
    getMemberByEmail,
    getMemberByAuthId,
    isAdmin,
    getDocumentBoxAccess,
    getMyOfficial,
    getOfficials,
    getCompanyInfo,
    async getOfficialSealUrl() {
        const { data } = await supabase.storage.from('attachments').createSignedUrl('Official Seal.png', 3600);
        return data?.signedUrl || null;
    },
    async listOpenSignMinutes() {
        const coopId = await getVisibleCoopId();
        const { data, error } = await scopeByCoop(supabase
            .from('minutes')
            .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
            .eq('requires_sign', true)
            .eq('status', 'OPEN')
            .order('created_at', { ascending: false }), coopId);
        return { data: data || [], error };
    },
    async listSignModeMinutes() {
        const coopId = await getVisibleCoopId();
        const { data, error } = await scopeByCoop(supabase
            .from('minutes')
            .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
            .eq('requires_sign', true)
            .in('status', ['OPEN', 'CLOSED'])
            .order('created_at', { ascending: false }), coopId);
        return { data: data || [], error };
    },
    listMinutesAdmin,
    listPublishedMinutes,
    listLibraryDocuments,
    getLibraryDocumentById,
    getLatestPublishedMinuteAt,
    markDocumentBoxSeen,
    listApprovalNoticeDrafts,
    listCompletedNoticeApprovals,
    getEmployeePositionByEmpId,
    listNoticesByApprovalIds,
    listNoticeMinutesByDocNos,
    getApprovalsByIds,
    upsertNotice,
    uploadMinuteFiles,
    updateMinuteAttachments,
    getMinuteById,
    listSignaturesForMinutes,
    listSignaturesByMinuteId,
    listSignatureStatusesByMinuteId,
    listPendingSignMinutes,
    createMinute,
    findMinuteByDocNoAndType,
    updateMinute,
    updateMinuteStatus,
    updateMinuteSignerIds,
    togglePublish,
    deleteMinute,
    insertSignature,
    deleteSignature,
    createSignedUrl
};
