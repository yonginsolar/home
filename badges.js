/* Version: v1.2.0
Change: 2026-08-28 - Show the highest earned tier, the next challenge, and birthday badges only on birthdays.
*/
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

    _collectionGroups: {
        celebration: { label: "처음과 기념일", order: 10 },
        education: { label: "교육 참여", order: 20 },
        quiz: { label: "햇빛 퀴즈", order: 30 },
        capital: { label: "출자금", order: 40 },
        extra_capital: { label: "추가 출자", order: 50 },
        anniversary: { label: "함께한 시간", order: 60 },
        event: { label: "특별한 참여", order: 70 },
        honor: { label: "활동 기록", order: 80 },
        role: { label: "역할과 공적", order: 90 },
        challenge: { label: "다음 도전", order: 100 }
    },

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
        },

        collectionGroupKey: (badge) => {
            const track = String(badge?.progress_track || "").trim();
            if (Badges._collectionGroups[track]) return track;
            const group = String(badge?.badge_group || "challenge").trim();
            return Badges._collectionGroups[group] ? group : "challenge";
        },

        formatProgressValue: (value, unit) => {
            const numberValue = Number(value || 0);
            if (!Number.isFinite(numberValue)) return "0";
            if (unit === "원" && Math.abs(numberValue) >= 10000) {
                const manWon = numberValue / 10000;
                const digits = Number.isInteger(manWon) ? 0 : 1;
                return `${manWon.toLocaleString("ko-KR", { maximumFractionDigits: digits })}만원`;
            }
            return `${numberValue.toLocaleString("ko-KR")}${unit || ""}`;
        },

        displayTrack: (badge) => {
            if (badge?.code === "newbie" || badge?.progress_track === "anniversary") return "membership_time";
            const track = String(badge?.progress_track || "").trim();
            return ["education", "quiz", "capital", "extra_capital"].includes(track) ? track : "";
        },

        displayTier: (badge) => badge?.code === "newbie" ? 0 : Number(badge?.progress_tier || 0),

        kstMonthDay: (value) => {
            const date = Badges._utils.parseDate(value);
            if (!date) return "";
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Seoul",
                month: "2-digit",
                day: "2-digit"
            }).formatToParts(date);
            const month = parts.find(part => part.type === "month")?.value || "";
            const day = parts.find(part => part.type === "day")?.value || "";
            return month && day ? `${month}-${day}` : "";
        },

        selectVisibleFallback: (badges) => {
            const rows = Array.isArray(badges) ? badges : [];
            const highestEarnedTier = new Map();
            rows.forEach((badge) => {
                const track = Badges._utils.displayTrack(badge);
                if (!track || !badge?.is_earned) return;
                const tier = Badges._utils.displayTier(badge);
                const previous = highestEarnedTier.get(track);
                if (previous === undefined || tier > previous) highestEarnedTier.set(track, tier);
            });

            const nextUnearnedTier = new Map();
            rows.forEach((badge) => {
                const track = Badges._utils.displayTrack(badge);
                if (!track || badge?.is_earned || badge?.locked_visibility !== "next") return;
                const tier = Badges._utils.displayTier(badge);
                const highest = highestEarnedTier.get(track) ?? -1;
                if (tier <= highest) return;
                const previous = nextUnearnedTier.get(track);
                if (previous === undefined || tier < previous) nextUnearnedTier.set(track, tier);
            });

            const todayMonthDay = Badges._utils.kstMonthDay(new Date());
            return rows.filter((badge) => {
                if (badge?.code === "BIRTHDAY") {
                    return badge?.is_earned
                        && todayMonthDay
                        && Badges._utils.kstMonthDay(badge?.granted_at) === todayMonthDay;
                }

                const track = Badges._utils.displayTrack(badge);
                if (track) {
                    const tier = Badges._utils.displayTier(badge);
                    if (badge?.is_earned) return tier === highestEarnedTier.get(track);
                    return badge?.locked_visibility === "next" && tier === nextUnearnedTier.get(track);
                }

                if (badge?.is_earned) return true;
                if (badge?.locked_visibility === "always") return true;
                return false;
            });
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
            .eq("is_active", true)
            .order("display_order", { ascending: true });

        if (error) {
            console.error("뱃지 로딩 실패:", error);
            return [];
        }

        this._allBadgesCache = { data: data || [], at: now };
        return data || [];
    },

    // ============================================================
    // 2. 뱃지 현황판 렌더링 (정보창 표시 & 클릭 선택 방식)
    // ============================================================
    async render(containerId, memberUid, supabase) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '<div class="text-muted small text-center w-100 py-3"><span class="spinner-border spinner-border-sm me-1"></span>배지를 정리하는 중...</div>';

        let collection = [];
        const { data: collectionData, error: collectionError } = await supabase.rpc("get_member_badge_collection", {
            p_member_uid: memberUid
        });

        if (!collectionError && Array.isArray(collectionData)) {
            collection = collectionData;
        } else {
            console.warn("단계형 뱃지 로딩 실패, 호환 조회로 전환:", collectionError);
            const allBadges = await this.getAll(supabase);
            const { data: myBadges, error: myBadgeError } = await supabase
                .from("coop_member_badges")
                .select("badge_id, granted_at")
                .eq("member_uid", memberUid);
            if (myBadgeError) console.warn("내 뱃지 호환 조회 실패:", myBadgeError);
            const myBadgeMap = new Map((myBadges || []).map((badge) => [badge.badge_id, badge.granted_at]));
            collection = this._utils.selectVisibleFallback(allBadges.map((badge) => ({
                ...badge,
                is_earned: myBadgeMap.has(badge.id),
                granted_at: myBadgeMap.get(badge.id) || null,
                progress_value: null
            })));
        }

        if (!collection.length) {
            container.innerHTML = '<div class="text-muted small text-center w-100 py-3">아직 표시할 배지가 없습니다.</div>';
            return;
        }

        const grouped = new Map();
        collection.forEach((badge) => {
            const key = this._utils.collectionGroupKey(badge);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(badge);
        });

        const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
            return (this._collectionGroups[a[0]]?.order || 999) - (this._collectionGroups[b[0]]?.order || 999);
        });

        container.innerHTML = sortedGroups.flatMap(([groupKey, badges]) => {
            const groupLabel = this._collectionGroups[groupKey]?.label || "배지";
            return badges.map((badge) => {
                const hasBadge = badge.is_earned === true;
                const d = hasBadge ? this._utils.parseDate(badge.granted_at) : null;
                const dateStr = d ? d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
                const descStr = badge.description || (hasBadge ? "획득한 배지입니다." : "다음 도전 배지입니다.");
                const { bg, fg } = this._utils.resolveStyle(badge.color);
                const style = hasBadge
                    ? `background-color:${bg};color:${fg};box-shadow:0 2px 7px rgba(15,23,42,.18);`
                    : "background-color:#f1f5f9;color:#64748b;border:1px dashed #cbd5e1;";
                const current = Number(badge.progress_value || 0);
                const target = Number(badge.progress_target || 0);
                const progressText = !hasBadge && target > 0
                    ? `${this._utils.formatProgressValue(current, badge.progress_unit)} / ${this._utils.formatProgressValue(target, badge.progress_unit)}`
                    : "";
                const progressPercent = target > 0 ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0;
                const progressMarkup = progressText ? `
                    <div class="badge-progress-label">${this._utils.escapeHtml(progressText)}</div>
                    <div class="badge-progress-track" aria-hidden="true"><span style="width:${progressPercent}%"></span></div>` : "";
                return `
                    <button type="button" class="badge-item text-center rounded user-select-none"
                            style="${style}"
                            data-name="${this._utils.escapeAttr(badge.name)}"
                            data-icon="${this._utils.escapeAttr(badge.icon || "🏅")}"
                            data-has="${hasBadge}"
                            data-date="${this._utils.escapeAttr(dateStr)}"
                            data-desc="${this._utils.escapeAttr(descStr)}"
                            data-group="${this._utils.escapeAttr(groupLabel)}"
                            data-progress="${this._utils.escapeAttr(progressText)}"
                            aria-label="${this._utils.escapeAttr(`${badge.name} ${hasBadge ? "획득 완료" : "다음 도전"}`)}"
                            onclick="Badges.selectBadge(this)">
                        <div class="badge-item-icon">${this._utils.escapeHtml(badge.icon || "🏅")}</div>
                        <div class="badge-item-name">${this._utils.escapeHtml(badge.name)}</div>
                        ${progressMarkup}
                    </button>`;
            });
        }).join("");
    },

    // [신규] 뱃지 클릭 시 정보창 업데이트 함수
    selectBadge(element) {
        // 1. 기존 선택 해제
        document.querySelectorAll('.badge-item').forEach(el => el.classList.remove('selected'));
        
        // 2. 현재 선택 표시
        element.classList.add('selected');

        // 3. 데이터 추출
        const name = element.dataset.name;
        const icon = element.dataset.icon;
        const has = element.dataset.has === 'true';
        const date = element.dataset.date;
        const desc = element.dataset.desc;
        const group = element.dataset.group;
        const progress = element.dataset.progress;
        const infoBox = document.getElementById('selectedBadgeInfo');
        if (!infoBox) return;
        const safeIcon = this._utils.escapeHtml(icon || '');
        const safeName = this._utils.escapeHtml(name || '');
        const safeDate = this._utils.escapeHtml(date || '');
        const safeDesc = this._utils.escapeHtml(desc || '');
        const safePlainDesc = this._utils.escapeHtml(String(desc || '').replace(/^🔒\s*/, ''));
        const safeGroup = this._utils.escapeHtml(group || '배지');
        const safeProgress = this._utils.escapeHtml(progress || '');

        // 4. 정보창 내용 업데이트
        if(has) {
            infoBox.innerHTML = `
                <div class="fs-1 mb-1">${safeIcon}</div>
                <h6 class="fw-bold text-dark">${safeName}</h6>
                <div class="badge-detail-group mb-2">${safeGroup}</div>
                <div class="text-success small fw-bold mb-2">🎉 ${safeDate} 획득</div>
                <div class="text-secondary small">${safeDesc}</div>
            `;
        } else {
            infoBox.innerHTML = `
                <div class="fs-1 mb-1 opacity-50">${safeIcon}</div>
                <h6 class="fw-bold text-muted">${safeName}</h6>
                <div class="badge-detail-group mb-2">${safeGroup}</div>
                <div class="text-muted small mb-1">다음 도전</div>
                ${safeProgress ? `<div class="text-primary small fw-bold mb-2">현재 ${safeProgress}</div>` : ''}
                <div class="text-secondary small bg-white p-2 rounded d-inline-block border">조건: ${safePlainDesc}</div>
            `;
        }
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

if (typeof window !== "undefined") {
    window.Badges = Badges;
}
if (typeof globalThis !== "undefined") {
    globalThis.Badges = Badges;
}
