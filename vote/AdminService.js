/*
Version: v1.0.11
Change: Fetch turnout counts in parallel to reduce polling latency.
*/
import { supabase } from '../shared/supabase-client.js';

let cachedRuntimeCoopId = null;

async function getRuntimeCoopId() {
    if (cachedRuntimeCoopId) return cachedRuntimeCoopId;
    const { data, error } = await supabase.rpc('get_my_coop_id');
    if (error) {
        console.error('AdminService coop_id 조회 실패:', error);
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

export class AdminService {
    
    // [보안] 관리자 여부 확인 (화면 진입 시 체크용)
    // 실제 보안은 DB RLS가 막아주지만, UX를 위해 1차 체크
// [수정] 관리자 여부 확인 (DB의 is_admin 함수를 직접 호출하여 정확도 100% 확보)
// [AdminService.js 내부]

    // [수정] 관리자 및 선관위 위원 권한 확인
    async isAdmin() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        // DB의 새로운 함수(is_election_admin) 호출
        // 이 함수는 coop_officials 테이블을 조회하여 'election_comm' 또는 'admin'인지 확인합니다.
        const { data, error } = await supabase.rpc('is_election_admin');
        
        if (error) {
            console.error("권한 체크 실패:", error);
            return false;
        }
        
        // true면 권한 있음, false면 권한 없음
        return data; 
    }

    // 1. 선거 정보 및 현재 상태 가져오기
// [수정됨] 선거 정보 가져오기 (ID 기반 조회)
    // 기존: 무조건 최근 1개 -> 변경: 요청받은 ID에 해당하는 선거 조회
    async getElectionInfo(electionId) {
        if (!electionId) {
            console.warn("getElectionInfo에 ID가 전달되지 않았습니다.");
            return null;
        }

        const coopId = await getRuntimeCoopId();

        const { data, error } = await scopeByTenant(supabase
            .from('elections')
            .select('*'), coopId)
            .eq('id', electionId) // [핵심] 특정 ID로 필터링
            .single();
            
        if (error) throw error;
        return data;
    }

// [수정] 선거 상태 변경 (+ 로그 기록)
    async updateStatus(electionId, newStatus, options = {}) {
        const coopId = await getRuntimeCoopId();
        const payload = { status: newStatus };
        if (Object.prototype.hasOwnProperty.call(options, 'actualClosedAt')) {
            payload.actual_closed_at = options.actualClosedAt;
        }
        if (options.clearActualClosedAt) {
            payload.actual_closed_at = null;
        }

        // 1. 상태 변경
        const { error } = await scopeByTenant(supabase
            .from('elections')
            .update(withTenantPayload(payload, coopId)), coopId)
            .eq('id', electionId);
            
        if (error) throw new Error('상태 변경 실패: ' + error.message);

        // 2. 로그 기록
        await this.logAction(electionId, 'STATUS_CHANGE', `선거 상태를 ${newStatus}로 변경`);
    }

    // 3. 승인 대기중인 후보자 목록 가져오기
    async getPendingCandidates(electionId) {
        const coopId = await getRuntimeCoopId();
        const { data, error } = await scopeByTenant(supabase
            .from('candidates')
            .select(`*, districts(name)`), coopId) // 선거구 이름도 같이
            .eq('election_id', electionId)
            .eq('status', 'PENDING');

        if (error) throw error;
        return data;
    }

    // 4. 후보자 승인/반려 처리
    async reviewCandidate(candidateId, decision) {
        // decision: 'APPROVED' or 'REJECTED'
        const coopId = await getRuntimeCoopId();
        const { error } = await scopeByTenant(supabase
            .from('candidates')
            .update(withTenantPayload({ status: decision }, coopId)), coopId)
            .eq('id', candidateId);
            
        if (error) throw error;
    }

    // 5. [모니터링] 실시간 투표율 집계
    // RLS 때문에 일반 유저는 못 쓰는 쿼리
    async getTurnoutStats(electionId) {
        const coopId = await getRuntimeCoopId();
        const [voterResult, voteResult] = await Promise.all([
            scopeByTenant(supabase
                .from('election_voters')
                .select('*', { count: 'exact', head: true }), coopId)
                .eq('election_id', electionId),
            scopeByTenant(supabase
                .from('vote_logs')
                .select('*', { count: 'exact', head: true }), coopId)
                .eq('election_id', electionId)
        ]);

        if (voterResult.error) throw voterResult.error;
        if (voteResult.error) throw voteResult.error;

        const totalVoters = voterResult.count || 0;
        const currentVotes = voteResult.count || 0;

        return {
            total: totalVoters,
            current: currentVotes,
            percent: totalVoters ? ((currentVotes / totalVoters) * 100).toFixed(1) : 0
        };
    }

    // 6. [개표] 결과 가져오기 (관리자 전용)
    async getResults(electionId) {
        const coopId = await getRuntimeCoopId();
        // 실제로는 DB RPC로 집계하는 게 빠르지만, MVP에서는 JS로 계산
        // 1. 모든 투표용지 가져오기
        const { data: ballots, error } = await scopeByTenant(supabase
            .from('ballots')
            .select(`
                district_id,
                candidate_id,
                choice,
                districts(name, vote_type),
                candidates(name)
            `), coopId)
            .eq('election_id', electionId);

        if (error) throw error;
        return ballots; // 화면에서 가공해서 그림
    }



// [AdminService.js 내부]

    // [수정] 로그 기록 (테이블명 변경: admin_logs -> vote_admin_logs)
    async logAction(electionId, actionType, details) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const coopId = await getRuntimeCoopId();

        const { error } = await supabase.from('vote_admin_logs').insert(withTenantPayload({
            election_id: electionId,
            admin_email: user.email,
            action_type: actionType,
            details: details
        }, coopId));

        if (error) console.error("로그 저장 실패:", error);
    }

    // [수정] 로그 목록 가져오기 (테이블명 변경: admin_logs -> vote_admin_logs)
    async getLogs(electionId) {
        const coopId = await getRuntimeCoopId();
        const { data, error } = await scopeByTenant(supabase
            .from('vote_admin_logs')  // 여기를 변경
            .select('*'), coopId)
            .eq('election_id', electionId)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) {
            console.error("로그 로드 실패:", error);
            return [];
        }
        return data;
    }

    // [추가] 후보자 목록(기호 포함) 가져오기
    async getCandidates(electionId) {
        const coopId = await getRuntimeCoopId();
        const { data, error } = await scopeByTenant(supabase
            .from('candidates')
            .select(`*, districts(name)`), coopId)
            .eq('election_id', electionId)
            .order('district_id', { ascending: true }) // 선거구별 정렬
            .order('symbol', { ascending: true }); // 기호순 정렬

        if (error) throw error;
        return data;
    }

    // [추가] 후보자 승인/반려 (+ 로그)
    async reviewCandidate(candId, decision, candName) {
        const coopId = await getRuntimeCoopId();
        const { error } = await scopeByTenant(supabase
            .from('candidates')
            .update(withTenantPayload({ status: decision }, coopId)), coopId)
            .eq('id', candId);
            
        if (error) throw error;
        
        // 로그 기록 시 electionId가 필요하지만, 
        // 편의상 화면에서 호출 후 별도로 남기거나 여기서 조회해야 함.
        // (MVP에서는 화면단에서 로그 함수를 따로 호출하는 게 빠름)
    }

    // [추가] 후보자 기호 저장
    async updateSymbol(candId, symbol) {
        const coopId = await getRuntimeCoopId();
        const { error } = await scopeByTenant(supabase
            .from('candidates')
            .update(withTenantPayload({ symbol: symbol }, coopId)), coopId)
            .eq('id', candId);
        
        if (error) throw error;
    }
    // [AdminService.js 내부]

    // [통합] 모든 선거 이력 가져오기 (HTML에서 이 이름을 호출함)
    async getAllElections() {
        const coopId = await getRuntimeCoopId();
        const { data, error } = await scopeByTenant(supabase
            .from('elections')
            .select('*'), coopId)
            .order('created_at', { ascending: false }); // 최신 선거 우선

        if (error) {
            console.error('선거 목록 로드 실패:', error);
            // 에러 발생 시 빈 배열 반환하여 화면 멈춤 방지
            return [];
        }
        return data || [];
    }

    // (참고) 만약 getElections() 라는 이름의 함수가 또 있다면 삭제하거나, 
    // 아래와 같이 위 함수를 가리키게 하여 호환성을 유지하세요.
    async getElections() {
        return this.getAllElections();
    }

}
