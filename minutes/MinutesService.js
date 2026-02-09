/*
Version: v1.0.17
Change: 2026-02-09 - Include minute content in admin list for preview/template features.
*/
import { supabase } from '../vote/ElectionService.js';

async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session || null;
}

async function getMemberByEmail(email) {
    if (!email) return null;
    const { data } = await supabase
        .from('coop_members')
        .select('id, role, member_id, name')
        .eq('email', email)
        .maybeSingle();
    return data || null;
}

async function isAdmin(uid, email) {
    const member = await getMemberByEmail(email);
    const { data: adminRow } = await supabase
        .from('coop_admins')
        .select('id')
        .eq('id', uid)
        .maybeSingle();
    return (member?.role === 'admin') || !!adminRow;
}

async function getOfficialByMemberId(memberId) {
    if (!memberId) return null;
    const { data } = await supabase
        .from('coop_officials')
        .select('id, seal_url')
        .eq('member_id', memberId)
        .eq('status', 'active')
        .maybeSingle();
    return data || null;
}

async function getMyOfficial(session) {
    if (!session?.user?.email) return { member: null, official: null };
    const member = await getMemberByEmail(session.user.email);
    const official = await getOfficialByMemberId(member?.member_id);
    return { member, official };
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
        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(storagePath);
        urls.push(publicUrl);
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

async function updateMinuteStatus(id, status) {
    return await supabase.from('minutes').update({ status }).eq('id', id);
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
            .select('id,title,created_at,status,requires_sign')
            .eq('requires_sign', true)
            .eq('status', 'OPEN')
            .order('created_at', { ascending: false });
        return { data: data || [], error };
    },
    listMinutesAdmin,
    listPublishedMinutes,
    listApprovalNoticeDrafts,
    listCompletedNoticeApprovals,
    listNoticesByApprovalIds,
    getApprovalsByIds,
    upsertNotice,
    uploadMinuteFiles,
    updateMinuteAttachments,
    getMinuteById,
    listSignaturesForMinutes,
    listSignaturesByMinuteId,
    listPendingSignMinutes,
    createMinute,
    updateMinuteStatus,
    togglePublish,
    deleteMinute,
    insertSignature
};
