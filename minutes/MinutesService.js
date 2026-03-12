/*
Version: v1.0.30
Change: 2026-03-12 - Fallback to auth-linked personal member when active profile is a group/non-official account on e-sign pages.
*/
import { supabase } from '../vote/ElectionService.js';

let canUseMarkDocumentBoxSeenRpc = true;

async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session || null;
}

async function getMemberByEmail(email) {
    if (!email) return null;
    const { data, error } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('email', email)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function getMemberByAuthId(uid) {
    if (!uid) return null;
    const { data, error } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('id', uid)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function getMemberByProfileId(profileId) {
    if (!profileId) return null;
    const { data, error } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('id', profileId)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function getMemberByMemberId(memberId) {
    if (!memberId) return null;
    const { data, error } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('member_id', memberId)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function getMemberByKakaoId(kakaoId) {
    if (!kakaoId) return null;
    const { data, error } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name, email')
        .eq('kakao_id', kakaoId)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getActiveProfileId() {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            return window.sessionStorage.getItem('lastActiveProfile');
        }
    } catch (e) { void 0; }
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

async function getOfficialByMemberId(memberId) {
    if (!memberId) return null;
    const { data, error } = await supabase
        .from('coop_officials')
        .select('id, seal_url')
        .eq('member_id', memberId)
        .eq('status', 'active')
        .order('id', { ascending: false });
    if (error || !Array.isArray(data) || data.length === 0) return null;

    // If multiple rows exist for the same member (multiple roles/terms), prefer one that has a seal image.
    const withSeal = data.find(row => row && row.seal_url);
    return withSeal || data[0] || null;
}

async function getMyOfficial(session) {
    if (!session?.user) return { member: null, official: null };
    const member = await resolveMember(session.user.id, session);
    const official = await getOfficialByMemberId(member?.member_id);
    if (member && official) return { member, official };

    // 전자서명은 임원 본인 기준으로 동작해야 하므로,
    // 활성 프로필이 단체/가족 계정이면 auth에 묶인 개인 계정으로 한 번 더 찾는다.
    const authMember = await resolveMember(session.user.id, session, { includeActiveProfile: false });
    const authOfficial = await getOfficialByMemberId(authMember?.member_id);
    return {
        member: authMember || member || null,
        official: authOfficial || official || null
    };
}

async function getOfficials() {
    let data = null;
    let error = null;

    ({ data, error } = await supabase
        .from('coop_officials')
        .select('*'));

    if (error || !data) return [];

    const filtered = data.filter(o => !('status' in o) || o.status === 'active');
    const memberIds = filtered.map(o => o.member_id).filter(Boolean);
    const nameMap = {};
    if (memberIds.length > 0) {
        const { data: members } = await supabase
            .from('coop_members')
            .select('member_id, name')
            .in('member_id', memberIds);
        if (Array.isArray(members)) {
            members.forEach(m => { nameMap[m.member_id] = m.name; });
        }
    }
    return filtered.map(o => ({
        ...o,
        role: o.role || o.position || o.category || '',
        position: o.position || o.role || o.category || '',
        name: nameMap[o.member_id] || ''
    }));
}

async function getCompanyInfo() {
    const { data, error } = await supabase
        .from('ref_company_info')
        .select('key,value');
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
    const { data, error } = await supabase
        .from('minutes')
        .select('id,title,content,created_at,status,doc_type,requires_sign,published_at,visibility,doc_no,receiver,via,file_urls,signer_ids')
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function listPublishedMinutes() {
    const { data, error } = await supabase
        .from('minutes')
        .select('id,title,created_at,doc_type,published_at,visibility,file_urls,signer_ids')
        .not('published_at', 'is', null)
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function getLatestPublishedMinuteAt() {
    const { data, error } = await supabase
        .from('minutes')
        .select('published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1);
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
    const { data, error } = await supabase
        .from('site_documents')
        .select('id,title,content,event_date,version,is_current,file_url,category')
        .eq('category', 'doc')
        .order('event_date', { ascending: false });
    const rows = Array.isArray(data) ? data : [];
    const mapped = rows.map((row) => ({
        ...row,
        access_scope: inferDocumentAccessScope(row?.title)
    }));
    return { data: mapped, error };
}

function isMissingMarkDocumentBoxSeenRpc(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const status = Number(error.status || error.statusCode || 0);
    const message = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();
    const hint = String(error.hint || '').toLowerCase();
    const text = `${message} ${details} ${hint}`;
    return (
        code === 'PGRST202'
        || code === '404'
        || status === 404
        || text.includes('could not find the function public.mark_document_box_seen')
        || text.includes('function public.mark_document_box_seen')
    );
}

async function markDocumentBoxSeen(targetId = null, seenAt = null) {
    const session = await getSession();
    if (!session?.user) return { data: null, error: { message: '로그인이 필요합니다.' } };

    const member = await resolveMember(targetId || session.user.id, session);
    const memberId = targetId || member?.id || null;
    if (!memberId) return { data: null, error: { message: '조합원 프로필을 찾을 수 없습니다.' } };

    const markAt = seenAt || new Date().toISOString();

    if (canUseMarkDocumentBoxSeenRpc) {
        // Prefer RPC path if deployed (auth/manager/admin checks on DB side).
        const { error: rpcErr } = await supabase.rpc('mark_document_box_seen', {
            p_target_id: memberId,
            p_seen_at: markAt
        });
        if (!rpcErr) return { data: { member_id: memberId, seen_at: markAt }, error: null };

        // If RPC is not deployed yet, fallback to direct update path.
        if (!isMissingMarkDocumentBoxSeenRpc(rpcErr)) return { data: null, error: rpcErr };
        canUseMarkDocumentBoxSeenRpc = false;
    }

    const { error: updErr } = await supabase
        .from('coop_members')
        .update({ document_box_last_seen_at: markAt })
        .eq('id', memberId);
    if (updErr) return { data: null, error: updErr };
    return { data: { member_id: memberId, seen_at: markAt }, error: null };
}

	async function uploadMinuteFiles(fileList) {
	    if (!fileList || fileList.length === 0) return { urls: [], error: null };
	    const urls = [];
	    for (const file of fileList) {
	        const name = file.name || '';
        const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
        if (ext !== 'pdf') {
            return { urls: [], error: { message: `PDF만 업로드할 수 있습니다: ${name}` } };
        }
	        const safeName = `${crypto.randomUUID()}_${name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
	        const storagePath = `minutes/${safeName}`;
	        const { error } = await supabase.storage.from('attachments').upload(storagePath, file);
	        if (error) return { urls: [], error };
	        // Store a storage reference (not a public URL). Viewer resolves to a signed URL later.
	        urls.push(`attachments/${storagePath}?display_name=${encodeURIComponent(name || safeName)}`);
	    }
	    return { urls, error: null };
	}

async function updateMinuteAttachments(id, fileUrls) {
    return await supabase.from('minutes').update({ file_urls: fileUrls }).eq('id', id);
}

async function listApprovalNoticeDrafts() {
    const { data, error } = await supabase
        .from('coop_notices')
        .select('id,title,content,created_at,status,category,is_popup,file_url,file_urls,file_names,doc_no,source_approval_id')
        .not('source_approval_id', 'is', null)
        .neq('status', 'published')
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function listCompletedNoticeApprovals() {
    const { data, error } = await supabase
        .from('ref_approval')
        .select('id,title,content,created_at,processed_at,status,doc_type,doc_no,receiver,via,file_links')
        .eq('doc_type', '공문')
        .in('status', ['완료', '실물결재완료'])
        .order('processed_at', { ascending: false })
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function listNoticesByApprovalIds(ids) {
    if (!ids || ids.length === 0) return { data: [], error: null };
    const { data, error } = await supabase
        .from('coop_notices')
        .select('id,title,content,created_at,status,category,is_popup,file_url,file_urls,file_names,doc_no,source_approval_id')
        .in('source_approval_id', ids);
    return { data: data || [], error };
}

async function listNoticeMinutesByDocNos(docNos) {
    const safeDocNos = Array.from(
        new Set((Array.isArray(docNos) ? docNos : [])
            .map(v => String(v || '').trim())
            .filter(Boolean))
    );
    if (safeDocNos.length === 0) return { data: [], error: null };
    const { data, error } = await supabase
        .from('minutes')
        .select('id,doc_no,doc_type,published_at,status')
        .eq('doc_type', 'NOTICE')
        .in('doc_no', safeDocNos)
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function getApprovalsByIds(ids) {
    if (!ids || ids.length === 0) return { data: [], error: null };
    const { data, error } = await supabase
        .from('ref_approval')
        .select('id,file_links,doc_no')
        .in('id', ids);
    return { data: data || [], error };
}

async function upsertNotice(payload) {
    return await supabase.rpc('upsert_notice_secure', payload);
}

async function getMinuteById(minuteId) {
    const { data, error } = await supabase
        .from('minutes')
        .select('*')
        .eq('id', minuteId)
        .single();
    return { data, error };
}

async function listSignaturesForMinutes(minuteIds) {
    if (!minuteIds || minuteIds.length === 0) return { data: [], error: null };
    const { data, error } = await supabase
        .from('doc_signatures')
        .select('minute_id, official_id')
        .in('minute_id', minuteIds);
    return { data: data || [], error };
}

async function listSignaturesByMinuteId(minuteId) {
    const { data, error } = await supabase
        .from('doc_signatures')
        .select('official_id, signature_url')
        .eq('minute_id', minuteId);
    return { data, error };
}

async function listPendingSignMinutes(officialId) {
    if (!officialId) return { data: [], error: null };
    const { data: minutes, error } = await supabase
        .from('minutes')
        .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
        .eq('requires_sign', true)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false });
    if (error) return { data: [], error };
    const { data: signed } = await supabase
        .from('doc_signatures')
        .select('minute_id')
        .eq('official_id', officialId);
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
    return await supabase.from('minutes').insert(payload);
}

async function findMinuteByDocNoAndType(docNo, docType = 'NOTICE') {
    const safeDocNo = String(docNo || '').trim();
    const safeDocType = String(docType || '').trim();
    if (!safeDocNo || !safeDocType) return { data: null, error: null };
    const { data, error } = await supabase
        .from('minutes')
        .select('id,doc_no,doc_type,published_at,status')
        .eq('doc_no', safeDocNo)
        .eq('doc_type', safeDocType)
        .order('created_at', { ascending: false })
        .limit(1);
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return { data: row, error };
}

async function updateMinute(id, payload) {
    return await supabase.from('minutes').update(payload).eq('id', id);
}

async function updateMinuteStatus(id, status) {
    return await supabase.from('minutes').update({ status }).eq('id', id);
}

async function updateMinuteSignerIds(id, signerIds) {
    return await supabase.from('minutes').update({ signer_ids: signerIds }).eq('id', id);
}

async function togglePublish(id, publish, userId) {
    const payload = publish
        ? { published_at: new Date().toISOString(), published_by: userId }
        : { published_at: null, published_by: null };
    return await supabase.from('minutes').update(payload).eq('id', id);
}

async function deleteMinute(id) {
    return await supabase.from('minutes').delete().eq('id', id);
}

async function insertSignature(payload) {
    return await supabase.from('doc_signatures').insert(payload);
}

async function deleteSignature(minuteId, officialId) {
    if (!minuteId || !officialId) return { error: { message: 'missing ids' } };
    return await supabase.from('doc_signatures')
        .delete()
        .eq('minute_id', minuteId)
        .eq('official_id', officialId);
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
    getMyOfficial,
    getOfficials,
    getCompanyInfo,
    async getOfficialSealUrl() {
        const { data } = await supabase.storage.from('attachments').createSignedUrl('Official Seal.png', 3600);
        return data?.signedUrl || null;
    },
    async listOpenSignMinutes() {
        const { data, error } = await supabase
            .from('minutes')
            .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
            .eq('requires_sign', true)
            .eq('status', 'OPEN')
            .order('created_at', { ascending: false });
        return { data: data || [], error };
    },
    async listSignModeMinutes() {
        const { data, error } = await supabase
            .from('minutes')
            .select('id,title,created_at,status,requires_sign,signer_ids,doc_type')
            .eq('requires_sign', true)
            .in('status', ['OPEN', 'CLOSED'])
            .order('created_at', { ascending: false });
        return { data: data || [], error };
    },
    listMinutesAdmin,
    listPublishedMinutes,
    listLibraryDocuments,
    getLatestPublishedMinuteAt,
    markDocumentBoxSeen,
    listApprovalNoticeDrafts,
    listCompletedNoticeApprovals,
    listNoticesByApprovalIds,
    listNoticeMinutesByDocNos,
    getApprovalsByIds,
    upsertNotice,
    uploadMinuteFiles,
    updateMinuteAttachments,
    getMinuteById,
    listSignaturesForMinutes,
    listSignaturesByMinuteId,
    listPendingSignMinutes,
    createMinute,
    findMinuteByDocNoAndType,
    updateMinute,
    updateMinuteStatus,
    updateMinuteSignerIds,
    togglePublish,
    deleteMinute,
    insertSignature,
    createSignedUrl
};
