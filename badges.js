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





/* 1) Badges.render 교체 */
Badges.render = async function (containerId, memberUid, supabase) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const escapeAttr = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const bsColorMap = {
    primary: "#0d6efd",
    secondary: "#6c757d",
    success: "#198754",
    danger: "#dc3545",
    warning: "#ffc107",
    info: "#0dcaf0",
    light: "#f8f9fa",
    dark: "#212529",
  };

  const isHex = (c) => typeof c === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim());
  const isBootstrapVariant = (c) => typeof c === "string" && Object.prototype.hasOwnProperty.call(bsColorMap, c.trim());

  const resolveBgColor = (raw) => {
    const c = (raw ?? "").toString().trim();
    if (isHex(c)) return c;
    if (isBootstrapVariant(c)) return bsColorMap[c];
    // 기타 문자열(예: 'rebeccapurple' 등)은 브라우저가 이해할 수도 있으니 그대로 시도
    if (c) return c;
    return bsColorMap.secondary;
  };

  const pickTextColor = (bg) => {
    // bg가 hex가 아닐 때는 안전하게 흰색
    if (!isHex(bg)) return "#fff";
    const hex = bg.replace("#", "");
    const parse = (h) => parseInt(h, 16);

    let r, g, b;
    if (hex.length === 3) {
      r = parse(hex[0] + hex[0]);
      g = parse(hex[1] + hex[1]);
      b = parse(hex[2] + hex[2]);
    } else {
      r = parse(hex.slice(0, 2));
      g = parse(hex.slice(2, 4));
      b = parse(hex.slice(4, 6));
    }
    // 상대휘도 기반 단순 판정
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.62 ? "#212529" : "#fff";
  };

  // (A) 전체 뱃지 정의 가져오기 (getAll로 통일: 캐싱 적용)
  const allBadges = await Badges.getAll(supabase);
  if (!allBadges || allBadges.length === 0) {
    container.innerHTML = '<div class="text-muted small text-center">등록된 뱃지가 없습니다.</div>';
    return;
  }

  // (B) 내가 획득한 뱃지 가져오기
  const { data: myBadges, error: myBadgesError } = await supabase
    .from("coop_member_badges")
    .select("badge_id, granted_at")
    .eq("member_uid", memberUid);

  if (myBadgesError) {
    console.error("내 뱃지 조회 실패:", myBadgesError);
  }

  const myBadgeSet = new Set((myBadges ?? []).map((b) => b.badge_id));
  const myBadgeMap = new Map((myBadges ?? []).map((b) => [b.badge_id, b.granted_at]));

  let html = '<div class="d-flex flex-wrap gap-2 justify-content-center">';

  allBadges.forEach((badge) => {
    const hasBadge = myBadgeSet.has(badge.id);

    let grantedDate = "";
    if (hasBadge) {
      const raw = myBadgeMap.get(badge.id);
      const d = raw ? new Date(raw) : null;
      grantedDate = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : "";
    }

    const icon = badge.icon || "🏅";
    const tooltip = hasBadge
      ? `획득일: ${grantedDate || "알 수 없음"}`
      : `획득 조건: ${badge.description || "비공개"}`;

    // color가 'success' 같은 부트스트랩 키워드 or '#8D6E63' 같은 hex 모두 지원
    const bgColor = resolveBgColor(badge.color);
    const fgColor = pickTextColor(bgColor);

    const style = hasBadge
      ? `background-color: ${bgColor}; color: ${fgColor}; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`
      : `background-color: #f0f0f0; color: #ccc; filter: grayscale(100%); opacity: 0.6; cursor: help;`;

    html += `
      <div class="badge-item text-center p-2 rounded"
           style="width: 80px; ${style}"
           title="${escapeAttr(tooltip)}">
        <div style="font-size: 1.5rem;">${escapeHtml(icon)}</div>
        <div style="font-size: 0.7rem; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(badge.name)}
        </div>
      </div>`;
  });

  html += "</div>";
  container.innerHTML = html;
};


/* 2) Badges.checkAnniversary 교체 */
Badges.checkAnniversary = async function (member, supabase) {
  if (!member || !member.join_date) return;

  const parseJoinDate = (value) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const joinDate = parseJoinDate(member.join_date);
  if (!joinDate) return;

  const today = new Date();

  const yearsDiff = today.getFullYear() - joinDate.getFullYear();

  const isPastDate =
    today.getMonth() > joinDate.getMonth() ||
    (today.getMonth() === joinDate.getMonth() && today.getDate() >= joinDate.getDate());

  if (yearsDiff > 0 && isPastDate) {
    const badgeCode = `YEAR_${yearsDiff}`;

    const targetUid = member.id || member.member_uid || member.uid;
    if (!targetUid) {
      console.error("Anniversary badge: target uid 누락 (member.id/member_uid/uid 없음)");
      return;
    }

    const { data: granted, error } = await supabase.rpc("check_and_grant_anniversary_badge", {
      target_uid: targetUid,
      years_joined: yearsDiff,
      badge_code_param: badgeCode,
    });

    if (error) {
      console.error("anniversary badge RPC 실패:", error);
      return;
    }

    if (granted) {
      showModal(`🎉 축하합니다! 가입 ${yearsDiff}주년 기념 뱃지를 획득하셨습니다!`);
    }
  }
};


/* 3) Badges.getAll 교체 (캐싱 추가) */
Badges.getAll = async function (supabase) {
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2분
  const now = Date.now();

  // 내부 캐시 객체가 있으면 재사용
  if (Badges._allBadgesCache && Badges._allBadgesCache.data && now - Badges._allBadgesCache.at < CACHE_TTL_MS) {
    return Badges._allBadgesCache.data;
  }

  const { data, error } = await supabase
    .from("site_badges")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("뱃지 로딩 실패:", error);
    return [];
  }

  Badges._allBadgesCache = { data: data || [], at: now };
  return data || [];
};


/* 4) Badges.renderPill 교체 (color: success/hex 모두 지원) */
Badges.renderPill = function (badge) {
  if (!badge) return "";

  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const escapeAttr = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const bsVariants = new Set(["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"]);
  const isHex = (c) => typeof c === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim());

  const pickTextColor = (bg) => {
    if (!isHex(bg)) return "#fff";
    const hex = bg.replace("#", "");
    const parse = (h) => parseInt(h, 16);

    let r, g, b;
    if (hex.length === 3) {
      r = parse(hex[0] + hex[0]);
      g = parse(hex[1] + hex[1]);
      b = parse(hex[2] + hex[2]);
    } else {
      r = parse(hex.slice(0, 2));
      g = parse(hex.slice(2, 4));
      b = parse(hex.slice(4, 6));
    }
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.62 ? "#212529" : "#fff";
  };

  const rawColor = (badge.color ?? "").toString().trim();

  // 1) 부트스트랩 변형이면 class 방식 (있으면 예쁘게, 없어도 깨지진 않음)
  if (bsVariants.has(rawColor)) {
    const textClass = rawColor === "warning" || rawColor === "light" ? "text-dark" : "text-white";
    return `<span class="badge bg-${escapeHtml(rawColor)} ${textClass} me-1 fw-normal" title="${escapeAttr(
      badge.description || ""
    )}">${escapeHtml(badge.icon || "")} ${escapeHtml(badge.name)}</span>`;
  }

  // 2) hex 또는 기타 CSS 컬러면 inline style
  const bg = rawColor || "#6c757d";
  const fg = pickTextColor(bg);

  return `<span class="badge me-1 fw-normal" style="background-color:${escapeAttr(bg)}; color:${escapeAttr(
    fg
  )};" title="${escapeAttr(badge.description || "")}">${escapeHtml(badge.icon || "")} ${escapeHtml(
    badge.name
  )}</span>`;
};


/* 5) Badges.renderCheckboxes 교체 (title/label 안전 처리만 추가) */
Badges.renderCheckboxes = function (containerId, allBadges, selectedCodes = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const escapeAttr = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  container.innerHTML = "";
  if (!allBadges || allBadges.length === 0) {
    container.innerHTML = '<span class="small text-muted">등록된 뱃지가 없습니다.</span>';
    return;
  }

  const selectedSet = new Set(selectedCodes || []);

  let html = "";
  allBadges.forEach((b) => {
    const isChecked = selectedSet.has(b.code) ? "checked" : "";
    html += `
      <div class="form-check form-check-inline m-0 mb-1" title="${escapeAttr(b.description || "")}">
        <input class="form-check-input" type="checkbox" id="badge-chk-${escapeAttr(b.code)}" value="${escapeAttr(
      b.code
    )}" ${isChecked}>
        <label class="form-check-label small" for="badge-chk-${escapeAttr(b.code)}">${escapeHtml(b.icon || "")} ${escapeHtml(
      b.name
    )}</label>
      </div>`;
  });

  container.innerHTML = html;
};

