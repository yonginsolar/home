/*
Version: v1.0.1
Change: 2026-05-16 - Fix preference poll admin save flow for tenant-scoped insert/upsert writes.
*/
import { supabase, resolveCurrentMemberProfileId } from './ElectionService.js';
export { supabase };

let cachedRuntimeCoopId = null;

export const PREFERENCE_POLL_PHASE = Object.freeze({
    DRAFT: 'DRAFT',
    READY: 'READY',
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    SETTLED: 'SETTLED'
});

export function toValidPreferencePollDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function derivePreferencePollPhase(poll, now = new Date()) {
    const status = String(poll?.status || '').trim().toUpperCase();
    if (status === PREFERENCE_POLL_PHASE.DRAFT) return PREFERENCE_POLL_PHASE.DRAFT;
    if (status === PREFERENCE_POLL_PHASE.SETTLED) return PREFERENCE_POLL_PHASE.SETTLED;
    if (status === PREFERENCE_POLL_PHASE.CLOSED) return PREFERENCE_POLL_PHASE.CLOSED;

    const nowDate = toValidPreferencePollDate(now) || new Date();
    const startAt = toValidPreferencePollDate(poll?.start_at);
    const endAt = toValidPreferencePollDate(poll?.actual_closed_at || poll?.end_at);

    if (startAt && nowDate < startAt) return PREFERENCE_POLL_PHASE.READY;
    if (endAt && nowDate > endAt) return PREFERENCE_POLL_PHASE.CLOSED;
    return PREFERENCE_POLL_PHASE.OPEN;
}

async function getRuntimeCoopId() {
    if (cachedRuntimeCoopId) return cachedRuntimeCoopId;
    const { data, error } = await supabase.rpc('get_my_coop_id');
    if (error) {
        console.error('PreferencePollService coop_id 조회 실패:', error);
        return null;
    }
    cachedRuntimeCoopId = data || null;
    return cachedRuntimeCoopId;
}

function withTenantPayload(payload, coopId) {
    if (!coopId || Object.prototype.hasOwnProperty.call(payload, 'coop_id')) return payload;
    return { ...payload, coop_id: coopId };
}

function scopeByTenant(query, coopId) {
    const safeCoopId = String(coopId || '').trim();
    return query.eq('coop_id', safeCoopId || '00000000-0000-0000-0000-000000000000');
}

function normalizeOptions(options = []) {
    return (Array.isArray(options) ? options : [])
        .map((option, index) => {
            const label = String(option?.label || '').trim();
            const id = String(option?.id || '').trim();
            if (!label) return null;
            return {
                id: id || null,
                label,
                sort_order: index + 1,
                is_active: option?.is_active !== false
            };
        })
        .filter(Boolean)
        .slice(0, 9);
}

async function getAuthUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user || null;
}

async function hasAdminFallbackViaRpc() {
    try {
        const { data, error } = await supabase.rpc('is_election_admin');
        if (error) return false;
        return data === true;
    } catch (_) {
        return false;
    }
}

function hasStoredErpFallback() {
    try {
        const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
        const permissionList = JSON.parse(localStorage.getItem('erp_permissions') || '[]');
        const permissionSet = new Set(Array.isArray(permissionList) ? permissionList : []);
        return !!(user && (user.role === 'admin' || user.role === 'admin_all' || permissionSet.has('member.admin')));
    } catch (_) {
        return false;
    }
}

export class PreferencePollService {
    constructor() {
        this.currentUser = null;
        this.currentCoopId = null;
        this.currentMemberProfileId = null;
    }

    async initializeMemberContext() {
        this.currentUser = await getAuthUser();
        if (!this.currentUser) return null;
        this.currentCoopId = await getRuntimeCoopId();
        if (!this.currentCoopId) return null;
        this.currentMemberProfileId = await resolveCurrentMemberProfileId(this.currentUser.id, this.currentCoopId) || this.currentUser.id;
        return {
            user: this.currentUser,
            coopId: this.currentCoopId,
            memberProfileId: this.currentMemberProfileId
        };
    }

    async canAdmin() {
        this.currentUser = this.currentUser || await getAuthUser();
        if (!this.currentUser) return false;
        return (await hasAdminFallbackViaRpc()) || hasStoredErpFallback();
    }

    async initializeAdminContext() {
        this.currentUser = await getAuthUser();
        if (!this.currentUser) return null;
        this.currentCoopId = await getRuntimeCoopId();
        if (!this.currentCoopId) return null;
        const canAdmin = await this.canAdmin();
        return {
            user: this.currentUser,
            coopId: this.currentCoopId,
            canAdmin
        };
    }

    async listPortalPolls(memberUuid = null) {
        if (!this.currentCoopId) this.currentCoopId = await getRuntimeCoopId();
        const { data, error } = await supabase.rpc('preference_list_portal_polls', {
            p_member_uuid: memberUuid || this.currentMemberProfileId || null
        });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async getPortalPoll(pollId, memberUuid = null) {
        const { data, error } = await supabase.rpc('preference_get_poll_for_member', {
            p_poll_id: pollId,
            p_member_uuid: memberUuid || this.currentMemberProfileId || null
        });
        if (error) throw error;
        return data || null;
    }

    async submitPortalBallot({ pollId, memberUuid = null, optionIds = [] }) {
        const cleanOptionIds = [...new Set((Array.isArray(optionIds) ? optionIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
        const { data, error } = await supabase.rpc('submit_preference_poll_ballot', {
            p_poll_id: pollId,
            p_member_uuid: memberUuid || this.currentMemberProfileId || null,
            p_option_ids: cleanOptionIds
        });
        if (error) throw error;
        return data || null;
    }

    async listAdminPolls() {
        if (!this.currentCoopId) this.currentCoopId = await getRuntimeCoopId();
        const { data, error } = await scopeByTenant(
            supabase.from('preference_polls').select('*'),
            this.currentCoopId
        ).order('created_at', { ascending: false });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async getAdminPoll(pollId) {
        if (!this.currentCoopId) this.currentCoopId = await getRuntimeCoopId();
        const [pollRes, optionRes, rewardRes] = await Promise.all([
            scopeByTenant(supabase.from('preference_polls').select('*'), this.currentCoopId)
                .eq('id', pollId)
                .maybeSingle(),
            scopeByTenant(supabase.from('preference_poll_options').select('*'), this.currentCoopId)
                .eq('poll_id', pollId)
                .order('sort_order', { ascending: true }),
            scopeByTenant(supabase.from('vote_reward_policies').select('*'), this.currentCoopId)
                .eq('source_kind', 'PREFERENCE_POLL')
                .eq('source_id', pollId)
                .maybeSingle()
        ]);
        if (pollRes.error) throw pollRes.error;
        if (optionRes.error) throw optionRes.error;
        if (rewardRes.error && rewardRes.error.code !== 'PGRST116') throw rewardRes.error;
        return {
            poll: pollRes.data || null,
            options: Array.isArray(optionRes.data) ? optionRes.data : [],
            rewardPolicy: rewardRes.data || null
        };
    }

    async savePoll(payload = {}) {
        if (!this.currentCoopId) this.currentCoopId = await getRuntimeCoopId();
        const options = normalizeOptions(payload.options);
        if (options.length < 2) throw new Error('옵션은 최소 2개 이상 필요합니다.');
        if (options.length > 9) throw new Error('옵션은 최대 9개까지 등록할 수 있습니다.');

        const allowedMax = options.length <= 2 ? 1 : options.length - 1;
        const minChoices = Math.max(1, Number(payload.minChoices) || 1);
        const maxChoices = Math.max(1, Number(payload.maxChoices) || 1);
        if (minChoices > maxChoices) throw new Error('최소 선택 수는 최대 선택 수보다 클 수 없습니다.');
        if (maxChoices > allowedMax) throw new Error('최대 선택 수가 허용 범위를 벗어났습니다.');

        const title = String(payload.title || '').trim();
        const description = String(payload.description || '').trim();
        const startAt = String(payload.startAt || '').trim();
        const endAt = String(payload.endAt || '').trim();
        if (!title) throw new Error('투표명을 입력해주세요.');
        if (!startAt || !endAt) throw new Error('투표 기간을 입력해주세요.');
        if (new Date(startAt).getTime() >= new Date(endAt).getTime()) throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.');

        const currentId = String(payload.id || '').trim();
        let nextPollId = currentId;
        let currentPoll = null;
        if (currentId) {
            const { data, error } = await scopeByTenant(
                supabase.from('preference_polls').select('*'),
                this.currentCoopId
            ).eq('id', currentId).maybeSingle();
            if (error) throw error;
            currentPoll = data || null;
            if (!currentPoll) throw new Error('수정할 투표를 찾을 수 없습니다.');

            if (!['DRAFT', 'READY'].includes(String(currentPoll.status || '').toUpperCase())) {
                throw new Error('작성중 또는 공개 준비 상태의 투표만 수정할 수 있습니다.');
            }

            const { count, error: ballotCountError } = await scopeByTenant(
                supabase.from('preference_poll_ballots').select('*', { count: 'exact', head: true }),
                this.currentCoopId
            ).eq('poll_id', currentId);
            if (ballotCountError) throw ballotCountError;
            if ((count || 0) > 0) {
                throw new Error('이미 제출된 투표가 있어 설정을 수정할 수 없습니다.');
            }
        }

        const basePayload = withTenantPayload({
            title,
            description,
            start_at: startAt,
            end_at: endAt,
            min_choices: minChoices,
            max_choices: maxChoices,
            allow_revote: payload.allowRevote !== false,
            result_visibility: 'ADMIN_ONLY',
            option_order_mode: payload.optionOrderMode === 'FIXED' ? 'FIXED' : 'RANDOM_PER_MEMBER',
            target_scope: 'ALL_ACTIVE_MEMBERS',
            status: currentPoll ? 'DRAFT' : 'DRAFT',
            actual_closed_at: null,
            closed_by: null
        }, this.currentCoopId);

        if (!currentId) {
            const { data, error } = await supabase
                .from('preference_polls')
                .insert(withTenantPayload(basePayload, this.currentCoopId))
                .select()
                .single();
            if (error) throw error;
            nextPollId = data.id;
        } else {
            const { error } = await scopeByTenant(
                supabase.from('preference_polls').update(basePayload),
                this.currentCoopId
            ).eq('id', currentId);
            if (error) throw error;
        }

        const existingIds = new Set();
        if (currentId) {
            const { data, error } = await scopeByTenant(
                supabase.from('preference_poll_options').select('id'),
                this.currentCoopId
            ).eq('poll_id', currentId);
            if (error) throw error;
            (data || []).forEach((row) => existingIds.add(String(row.id)));
        }

        const keepIds = new Set();
        const upserts = options.map((option) => {
            const safeId = option.id && existingIds.has(String(option.id)) ? String(option.id) : null;
            if (safeId) keepIds.add(safeId);
            const nextPayload = withTenantPayload({
                poll_id: nextPollId,
                label: option.label,
                sort_order: option.sort_order,
                is_active: option.is_active
            }, this.currentCoopId);
            if (safeId) nextPayload.id = safeId;
            return nextPayload;
        });

        if (upserts.length > 0) {
            const { error } = await supabase
                .from('preference_poll_options')
                .upsert(upserts, { onConflict: 'id' });
            if (error) throw error;
        }

        if (existingIds.size > 0) {
            const removeIds = [...existingIds].filter((id) => !keepIds.has(id));
            if (removeIds.length > 0) {
                const { error } = await scopeByTenant(
                    supabase.from('preference_poll_options').delete(),
                    this.currentCoopId
                ).in('id', removeIds);
                if (error) throw error;
            }
        }

        return nextPollId;
    }

    async publishPoll(pollId) {
        const { data, error } = await supabase.rpc('preference_publish_poll', { p_poll_id: pollId });
        if (error) throw error;
        return data || null;
    }

    async closePoll(pollId) {
        const { data, error } = await supabase.rpc('preference_close_poll', { p_poll_id: pollId });
        if (error) throw error;
        return data || null;
    }

    async getAdminResults(pollId) {
        const { data, error } = await supabase.rpc('preference_get_admin_results', { p_poll_id: pollId });
        if (error) throw error;
        return data || null;
    }
}
