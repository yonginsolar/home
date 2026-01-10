/**
 * badges.js - 뱃지 시스템 공통 모듈
 * 기능: 뱃지 로드, 렌더링, N주년 체크
 */

const Badges = {
    // 1. 전체 뱃지 목록과 내 획득 현황을 가져와 렌더링
    async render(containerId, memberUid, supabase) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // (A) 전체 뱃지 정의 가져오기
        const { data: allBadges } = await supabase
            .from('site_badges')
            .select('*')
            .order('display_order', { ascending: true });

        // (B) 내가 획득한 뱃지 가져오기
        const { data: myBadges } = await supabase
            .from('coop_member_badges')
            .select('badge_id, granted_at')
            .eq('member_uid', memberUid);

        if (!allBadges) return;

        // 획득한 뱃지 ID를 Set으로 저장 (빠른 검색)
        const myBadgeSet = new Set(myBadges?.map(b => b.badge_id) || []);
        const myBadgeMap = new Map(myBadges?.map(b => [b.badge_id, b.granted_at]));

        let html = '<div class="d-flex flex-wrap gap-2 justify-content-center">';
        
        allBadges.forEach(badge => {
            const hasBadge = myBadgeSet.has(badge.id);
            const grantedDate = hasBadge ? new Date(myBadgeMap.get(badge.id)).toLocaleDateString() : '';
            
            // 스타일: 획득하면 컬러, 못하면 흑백+투명도
            const style = hasBadge 
                ? `background-color: ${badge.color || '#eee'}; color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2);` 
                : `background-color: #f0f0f0; color: #ccc; filter: grayscale(100%); opacity: 0.6; cursor: help;`;

            const icon = badge.icon || '🏅';
            const tooltip = hasBadge ? `획득일: ${grantedDate}` : `획득 조건: ${badge.description || '비공개'}`;

            html += `
            <div class="badge-item text-center p-2 rounded" 
                 style="width: 80px; ${style}" 
                 title="${tooltip}">
                <div style="font-size: 1.5rem;">${icon}</div>
                <div style="font-size: 0.7rem; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${badge.name}
                </div>
            </div>`;
        });
        html += '</div>';
        
        container.innerHTML = html;
    },

    // 2. 가입 N주년 자동 체크 및 뱃지 지급 요청
    async checkAnniversary(member, supabase) {
        if (!member.join_date) return;

        const joinDate = new Date(member.join_date);
        const today = new Date();
        
        // 연차 계산 (단순 연도 차이)
        const yearsDiff = today.getFullYear() - joinDate.getFullYear();
        
        // 월/일이 지났는지 확인 (정확한 N주년)
        const isPastDate = (today.getMonth() > joinDate.getMonth()) || 
                           (today.getMonth() === joinDate.getMonth() && today.getDate() >= joinDate.getDate());

        // N주년이 되었고, 1년 이상일 때
        if (yearsDiff > 0 && isPastDate) {
            const badgeCode = `YEAR_${yearsDiff}`; // 예: YEAR_1, YEAR_3 (DB site_badges에 이 코드가 있어야 함)
            
            // RPC 호출 (서버에서 중복 체크 후 지급)
            const { data: granted } = await supabase.rpc('check_and_grant_anniversary_badge', {
                target_uid: member.id,
                years_joined: yearsDiff,
                badge_code_param: badgeCode
            });

            if (granted) {
                // 방금 뱃지를 받았다면 축하 알림
                showModal(`🎉 축하합니다! 가입 ${yearsDiff}주년 기념 뱃지를 획득하셨습니다!`);
            }
        }
    }
};
/* badges.js 기존 코드 아래에 추가하세요 */

// 3. [공통] 모든 뱃지 정의 가져오기 (캐싱 지원)
// 관리자 페이지와 사용자 페이지 모두에서 뱃지 목록이 필요할 때 사용
Badges.getAll = async function(supabase) {
    const { data, error } = await supabase
        .from('site_badges')
        .select('*')
        .order('display_order', { ascending: true });
    
    if (error) {
        console.error("뱃지 로딩 실패:", error);
        return [];
    }
    return data;
};

// 4. [공통] 뱃지 알약(Pill) HTML 생성
// 파트너 목록이나 멤버 목록에서 '작은 뱃지 아이콘'을 그릴 때 사용
Badges.renderPill = function(badge) {
    if (!badge) return '';
    return `<span class="badge bg-${badge.color} me-1 fw-normal" title="${badge.description || ''}">
        ${badge.icon || ''} ${badge.name}
    </span>`;
};

// 5. [공통] 뱃지 선택 체크박스 렌더링
// 파트너 등록 모달 등에서 뱃지를 선택할 때 사용
Badges.renderCheckboxes = function(containerId, allBadges, selectedCodes = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (!allBadges || allBadges.length === 0) {
        container.innerHTML = '<span class="small text-muted">등록된 뱃지가 없습니다.</span>';
        return;
    }

    // Set으로 변환하여 검색 속도 향상
    const selectedSet = new Set(selectedCodes || []);

    let html = '';
    allBadges.forEach(b => {
        const isChecked = selectedSet.has(b.code) ? 'checked' : '';
        html += `
        <div class="form-check form-check-inline m-0 mb-1" title="${b.description || ''}">
            <input class="form-check-input" type="checkbox" id="badge-chk-${b.code}" value="${b.code}" ${isChecked}>
            <label class="form-check-label small" for="badge-chk-${b.code}">${b.icon || ''} ${b.name}</label>
        </div>`;
    });
    container.innerHTML = html;
};
