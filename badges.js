/**
 * badges.js
 * 기능: 뱃지 시스템 공통 모듈 (통폐합 및 최적화 버전)
 * - _utils: 보안 및 공통 로직 중앙화
 * - 캐싱: getAll 호출 시 DB 부하 감소
 * - 컬러: Bootstrap 클래스와 Hex 코드 양방향 지원
 */

const Badges = {
    // 내부 캐시 저장소
    _allBadgesCache: null,

    // ============================================================
    // [Core] 내부 유틸리티 (중복 제거 및 로직 중앙화)
    // ============================================================
    _utils: {
        // HTML 특수문자 이스케이프 (XSS 방지)
        escapeHtml: (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        
        // 속성값 이스케이프 (XSS 방지)
        escapeAttr: (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),

        // 날짜 파싱 (YYYY-MM-DD 문자열 또는 Date 객체 대응)
        parseDate: (value) => {
            if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const [y, m, d] = value.split("-").map(n => parseInt(n, 10));
                const dt = new Date(y, m - 1, d);
                return isNaN(dt.getTime()) ? null : dt;
            }
            const dt = new Date(value);
            return isNaN(dt.getTime()) ? null : dt;
        },

        // 텍스트 가독성을 위한 컬러 계산 (배경색에 따른 흑/백 글자 자동 판별)
        pickTextColor: (bgHex) => {
            if (!bgHex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bgHex)) return "#fff";
            
            const hex = bgHex.replace("#", "");
            const parse = (h) => parseInt(h, 16);
            let r, g, b;
            
            if (hex.length === 3) {
                r = parse(hex[0] + hex[0]); g = parse(hex[1] + hex[1]); b = parse(hex[2] + hex[2]);
            } else {
                r = parse(hex.slice(0, 2)); g = parse(hex.slice(2, 4)); b = parse(hex.slice(4, 6));
            }
            
            // 상대 휘도(Luminance) 계산
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            return luminance > 0.62 ? "#212529" : "#fff";
        },

        // 컬러 스타일 통합 해결사
        resolveStyle: (rawColor) => {
            const bsColorMap = {
                primary: "#0d6efd", secondary: "#6c757d", success: "#198754",
                danger: "#dc3545", warning: "#ffc107", info: "#0dcaf0",
                light: "#f8f9fa", dark: "#212529"
            };
            
            const key = (rawColor ?? "").toString().trim();
            const isBootstrap = Object.prototype.hasOwnProperty.call(bsColorMap, key);
            
            // Hex 코드이거나, 알 수 없는 문자열이면 그대로 사용, 없으면 회색 기본값
            let bgCode = isBootstrap ? bsColorMap[key] : (key || "#6c757d");
            
            // 텍스트 컬러 자동 계산
            const fgCode = Badges._utils.pickTextColor(bgCode);

            return { 
                isBootstrap,    // Bootstrap 클래스 여부
                className: key, // 클래스명 (primary 등)
                bg: bgCode,     // 실제 Hex 컬러
                fg: fgCode      // 대비되는 텍스트 컬러
            };
        }
    },

    // ============================================================
    // 1. 전체 뱃지 데이터 가져오기 (캐싱 적용: 2분)
    // ============================================================
    async getAll(supabase) {
        const CACHE_TTL_MS = 2 * 60 * 1000; 
        const now = Date.now();

        // 캐시 유효하면 재사용
        if (this._allBadgesCache && this._allBadgesCache.data && (now - this._allBadgesCache.at < CACHE_TTL_MS)) {
            return this._allBadgesCache.data;
        }

        const { data, error } = await supabase
            .from("site_badges")
            .select("*")
            .order("display_order", { ascending: true });

        if (error) {
            console.error("뱃지 로딩 실패:", error);
            return [];
        }

        this._allBadgesCache = { data: data || [], at: now };
        return data || [];
    },

    // ============================================================
    // 2. 뱃지 현황판 렌더링 (마이페이지 등)
    // ============================================================
    async render(containerId, memberUid, supabase) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 전체 뱃지 로드 (캐시 사용)
        const allBadges = await this.getAll(supabase);
        if (!allBadges.length) {
            container.innerHTML = '<div class="text-muted small text-center">등록된 뱃지가 없습니다.</div>';
            return;
        }

        // 내 뱃지 로드
        const { data: myBadges, error } = await supabase
            .from("coop_member_badges")
            .select("badge_id, granted_at")
            .eq("member_uid", memberUid);

        if (error) console.error("내 뱃지 조회 실패:", error);

        // 빠른 조회를 위한 Set/Map 변환
        const myBadgeSet = new Set((myBadges ?? []).map(b => b.badge_id));
        const myBadgeMap = new Map((myBadges ?? []).map(b => [b.badge_id, b.granted_at]));

        let html = '<div class="d-flex flex-wrap gap-2 justify-content-center">';
        
        allBadges.forEach(badge => {
            const hasBadge = myBadgeSet.has(badge.id);
            let grantedDateStr = "";
            
            if (hasBadge) {
                const d = this._utils.parseDate(myBadgeMap.get(badge.id));
                grantedDateStr = d ? d.toLocaleDateString() : "";
            }

            const icon = badge.icon || "🏅";
            const tooltip = hasBadge
                ? `획득일: ${grantedDateStr || "알 수 없음"}`
                : `획득 조건: ${badge.description || "비공개"}`;

            // 스타일 결정
            const { bg, fg } = this._utils.resolveStyle(badge.color);
            
            const style = hasBadge
                ? `background-color: ${bg}; color: ${fg}; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`
                : `background-color: #f0f0f0; color: #ccc; filter: grayscale(100%); opacity: 0.6; cursor: help;`;

            html += `
                <div class="badge-item text-center p-2 rounded"
                     style="width: 80px; ${style}"
                     title="${this._utils.escapeAttr(tooltip)}">
                    <div style="font-size: 1.5rem;">${this._utils.escapeHtml(icon)}</div>
                    <div style="font-size: 0.7rem; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${this._utils.escapeHtml(badge.name)}
                    </div>
                </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    // ============================================================
    // 3. 알약(Pill) 형태 렌더링 (테이블/리스트 내 표시용)
    // ============================================================
    renderPill(badge) {
        if (!badge) return "";
        
        const { isBootstrap, className, bg, fg } = this._utils.resolveStyle(badge.color);
        const safeDesc = this._utils.escapeAttr(badge.description || "");
        const safeIcon = this._utils.escapeHtml(badge.icon || "");
        const safeName = this._utils.escapeHtml(badge.name || "");

        // Bootstrap 클래스인 경우 (class 활용)
        if (isBootstrap) {
            // warning, light는 글자색 검정, 나머지는 흰색
            const textClass = (className === "warning" || className === "light") ? "text-dark" : "text-white";
            return `<span class="badge bg-${this._utils.escapeHtml(className)} ${textClass} me-1 fw-normal" 
                          title="${safeDesc}">${safeIcon} ${safeName}</span>`;
        }

        // Custom Hex인 경우 (style 활용)
        return `<span class="badge me-1 fw-normal" 
                      style="background-color:${this._utils.escapeAttr(bg)}; color:${this._utils.escapeAttr(fg)};" 
                      title="${safeDesc}">${safeIcon} ${safeName}</span>`;
    },

    // ============================================================
    // 4. 체크박스 렌더링 (관리자/폼용)
    // ============================================================
    renderCheckboxes(containerId, allBadges, selectedCodes = []) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";
        if (!allBadges || !allBadges.length) {
            container.innerHTML = '<span class="small text-muted">등록된 뱃지가 없습니다.</span>';
            return;
        }

        const selectedSet = new Set(selectedCodes || []);
        let html = "";
        
        allBadges.forEach(b => {
            const isChecked = selectedSet.has(b.code) ? "checked" : "";
            const safeCode = this._utils.escapeAttr(b.code);
            
            html += `
              <div class="form-check form-check-inline m-0 mb-1" title="${this._utils.escapeAttr(b.description || "")}">
                <input class="form-check-input" type="checkbox" id="badge-chk-${safeCode}" 
                       value="${safeCode}" ${isChecked}>
                <label class="form-check-label small" for="badge-chk-${safeCode}">
                    ${this._utils.escapeHtml(b.icon || "")} ${this._utils.escapeHtml(b.name)}
                </label>
              </div>`;
        });
        container.innerHTML = html;
    },

    // ============================================================
    // 5. 가입 N주년 자동 체크
    // ============================================================
    async checkAnniversary(member, supabase) {
        if (!member || !member.join_date) return;

        const joinDate = this._utils.parseDate(member.join_date);
        if (!joinDate) return;

        const today = new Date();
        const yearsDiff = today.getFullYear() - joinDate.getFullYear();
        
        // 월/일이 지났는지 확인
        const isPastDate = today.getMonth() > joinDate.getMonth() || 
                           (today.getMonth() === joinDate.getMonth() && today.getDate() >= joinDate.getDate());

        if (yearsDiff > 0 && isPastDate) {
            const badgeCode = `YEAR_${yearsDiff}`;
            
            // 대상 ID 방어적 확보
            const targetUid = member.id || member.member_uid || member.uid;
            if (!targetUid) {
                console.error("Anniversary badge error: member UID not found");
                return;
            }

            const { data: granted, error } = await supabase.rpc("check_and_grant_anniversary_badge", {
                target_uid: targetUid,
                years_joined: yearsDiff,
                badge_code_param: badgeCode,
            });

            if (error) {
                console.error("Anniversary badge RPC failed:", error);
                return;
            }

            if (granted && typeof showModal === 'function') {
                showModal(`🎉 축하합니다! 가입 ${yearsDiff}주년 기념 뱃지를 획득하셨습니다!`);
            }
        }
    }
};
