/* v2.0.0 — Mobile-first 390px member portal: digital membership card, 4-button single-open funding selector, and dark-mode-independent 3x4 appearance themes. */
(function (root) {
  'use strict';

  const DESIGN_STORAGE_KEY = 'coop_portal_design_v1';
  const STYLE_ALLOWLIST = Object.freeze(['wallet', 'editorial', 'glass']);
  const CARD_ALLOWLIST = Object.freeze(['forest', 'champagne', 'navy', 'terracotta']);
  const STYLE_SET = new Set(STYLE_ALLOWLIST);
  const CARD_SET = new Set(CARD_ALLOWLIST);
  const FUND_ORDER = Object.freeze(['extra', 'reduction', 'cert', 'withdraw']);
  const FUND_META = Object.freeze({
    extra: { label: '추가 출자', icon: 'plus-circle', tone: 'normal' },
    reduction: { label: '출자금 줄이기(감자)', icon: 'dash-circle', tone: 'normal' },
    cert: { label: '증명서 발급', icon: 'file-earmark-text', tone: 'normal' },
    withdraw: { label: '탈퇴 신청', icon: 'exclamation-octagon', tone: 'danger' }
  });
  const STYLE_META = Object.freeze({
    wallet: { label: '프리미엄 월렛', desc: '선명한 카드형' },
    editorial: { label: '웜 에디토리얼', desc: '따뜻한 종이 질감' },
    glass: { label: '햇빛 글래스', desc: '은은한 글래스 표면' }
  });
  const CARD_META = Object.freeze({
    forest: { label: '햇빛 숲', swatch: '#1b4d3e' },
    champagne: { label: '샴페인 골드', swatch: '#dfc491' },
    navy: { label: '솔라 네이비', swatch: '#1f3d68' },
    terracotta: { label: '테라코타', swatch: '#893927' }
  });

  function readDesignPrefs() {
    try {
      const raw = root.localStorage?.getItem?.(DESIGN_STORAGE_KEY);
      if (!raw) return { style: 'wallet', card: 'forest' };
      const parsed = JSON.parse(raw);
      return {
        style: STYLE_SET.has(parsed?.style) ? parsed.style : 'wallet',
        card: CARD_SET.has(parsed?.card) ? parsed.card : 'forest'
      };
    } catch (_) {
      return { style: 'wallet', card: 'forest' };
    }
  }

  function writeDesignPrefs(style, card) {
    const safe = {
      style: STYLE_SET.has(style) ? style : 'wallet',
      card: CARD_SET.has(card) ? card : 'forest'
    };
    try {
      root.localStorage?.setItem?.(DESIGN_STORAGE_KEY, JSON.stringify(safe));
    } catch (_) {}
    return safe;
  }

  function formatJoinDate(raw) {
    const text = String(raw || '').trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) return '';
    return `${match[1]}.${match[2]}.${match[3]} 가입`;
  }

  function formatWon(amount) {
    if (!Number.isFinite(amount)) return '확인 필요';
    return `${Math.trunc(amount).toLocaleString('ko-KR')}원`;
  }

  function create(options = {}) {
    const doc = root.document;
    const dashboard = doc.getElementById('dashboardSection');
    if (!dashboard || dashboard.dataset.purposeMounted) return null;

    const ids = [
      'portalProfileGroup',
      'assetSummaryRow',
      'quickLinksRow',
      'portalApplicationColumn',
      'portalTimelineColumn',
      'portalApplicationsAndHistory',
      'memberBadgeCollectionCard',
      'hallOfFameCard',
      'memberFreeBoardCard',
      'memberFamilyAccountCard'
    ];
    const nodes = Object.fromEntries(ids.map(id => [id, doc.getElementById(id)]));
    if (ids.some(id => !nodes[id])) return null;

    let verified = '';
    let selected = 'summary';
    let certClickLock = false;
    let appearance = readDesignPrefs();

    const choices = new Map();
    const selectedFunds = new Map();
    const expanded = new Map();
    const panels = {};
    const buttons = {};
    const fundButtons = {};
    const styleButtons = {};
    const cardButtons = {};
    const dialogs = [];

    const names = { summary: '요약', funds: '출자·신청', activity: '활동·내역', profile: '내 정보' };
    const icons = { summary: 'grid', funds: 'wallet2', activity: 'journal-text', profile: 'person' };

    const context = () => String(options.getContext?.() || '');
    const current = () => !!verified && verified === context();

    const element = (tag, className, text) => {
      const n = doc.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined && text !== null && text !== '') n.textContent = text;
      return n;
    };
    const action = (text, handler, className = 'btn btn-outline-success') => {
      const n = element('button', className, text);
      n.type = 'button';
      n.onclick = handler;
      return n;
    };
    const allowed = node => {
      if (!node?.isConnected) return false;
      for (let n = node; n && n !== dashboard; n = n.parentElement) {
        if (n.classList.contains('portal-purpose-panel')) break;
        if (n.hidden || n.classList.contains('hidden') || n.style.display === 'none') return false;
      }
      return true;
    };

    const style = element('style');
    style.id = 'portal-purpose-style';
    style.textContent = `
      #dashboardSection.portal-purpose-layout {
        --pp-bg: transparent;
        --pp-surface: #ffffff;
        --pp-surface-subtle: #f4f7f5;
        --pp-border: #d5e1d8;
        --pp-text: #16281e;
        --pp-muted: #4a5d52;
        --pp-accent: #1b4d3e;
        --pp-accent-fg: #ffffff;
        --pp-accent-soft: #e6f2ec;
        --pp-radius: 18px;
        --pp-nav-bg: #ffffff;
        --pp-shadow: 0 6px 20px rgba(18, 36, 27, 0.06);
        --pp-focus: #2563eb;
        --pp-danger: #991b1b;
        --pp-danger-bg: #fef2f2;
        --pp-danger-border: #f3b4b4;
        --pp-todo-bg: #fff8e6;
        --pp-todo-border: #e0b84c;
        --pp-todo-text: #4d3800;
        color: var(--pp-text);
      }
      #dashboardSection.portal-purpose-layout[data-portal-style="editorial"] {
        --pp-bg: #f7f4ee;
        --pp-surface: #fdfbf7;
        --pp-surface-subtle: #efeae0;
        --pp-border: #d4cdc0;
        --pp-text: #221d15;
        --pp-muted: #574e41;
        --pp-accent: #2c3e2e;
        --pp-accent-fg: #ffffff;
        --pp-accent-soft: #e8ece5;
        --pp-radius: 10px;
        --pp-nav-bg: #fdfbf7;
        --pp-shadow: 0 2px 8px rgba(34, 29, 21, 0.04);
      }
      #dashboardSection.portal-purpose-layout[data-portal-style="glass"] {
        --pp-bg: linear-gradient(160deg, #f2f8f4 0%, #fcf7eb 100%);
        --pp-surface: rgba(255, 255, 255, 0.94);
        --pp-surface-subtle: rgba(240, 246, 242, 0.96);
        --pp-border: rgba(27, 77, 62, 0.2);
        --pp-text: #14261c;
        --pp-muted: #46594e;
        --pp-accent: #185843;
        --pp-accent-fg: #ffffff;
        --pp-accent-soft: rgba(226, 242, 233, 0.95);
        --pp-radius: 20px;
        --pp-nav-bg: rgba(255, 255, 255, 0.94);
        --pp-shadow: 0 8px 24px rgba(20, 38, 28, 0.07);
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout,
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout {
        --pp-bg: transparent;
        --pp-surface: #16221c;
        --pp-surface-subtle: #1e2e26;
        --pp-border: #2f463b;
        --pp-text: #eef5f0;
        --pp-muted: #b3c6ba;
        --pp-accent: #7fd4a8;
        --pp-accent-fg: #0d2118;
        --pp-accent-soft: #21382d;
        --pp-nav-bg: #14201a;
        --pp-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
        --pp-focus: #60a5fa;
        --pp-danger: #fca5a5;
        --pp-danger-bg: #31171a;
        --pp-danger-border: #7f2d33;
        --pp-todo-bg: #2d2412;
        --pp-todo-border: #856823;
        --pp-todo-text: #fde68a;
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout[data-portal-style="editorial"],
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout[data-portal-style="editorial"] {
        --pp-bg: #171613;
        --pp-surface: #201e1a;
        --pp-surface-subtle: #2a2722;
        --pp-border: #433e35;
        --pp-text: #f5f0e6;
        --pp-muted: #c8bfb0;
        --pp-accent: #dfc08a;
        --pp-accent-fg: #1d180e;
        --pp-accent-soft: #312c22;
        --pp-nav-bg: #201e1a;
        --pp-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout[data-portal-style="glass"],
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout[data-portal-style="glass"] {
        --pp-bg: linear-gradient(160deg, #101b16 0%, #17212b 100%);
        --pp-surface: rgba(21, 33, 28, 0.95);
        --pp-surface-subtle: rgba(30, 46, 39, 0.96);
        --pp-border: rgba(148, 197, 170, 0.28);
        --pp-text: #f0f7f2;
        --pp-muted: #b8ccc0;
        --pp-accent: #8adbb1;
        --pp-accent-fg: #0c2017;
        --pp-accent-soft: rgba(33, 55, 45, 0.96);
        --pp-nav-bg: rgba(19, 30, 25, 0.95);
        --pp-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shell {
        box-sizing: border-box;
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        padding: 14px 12px 24px;
        border-radius: calc(var(--pp-radius) + 4px);
        background: var(--pp-bg);
      }
      @media (min-width: 768px) {
        #dashboardSection.portal-purpose-layout .portal-purpose-shell {
          padding: 18px 20px 28px;
        }
      }
      #dashboardSection.portal-purpose-layout :is(.portal-purpose-top, .portal-purpose-nav, .portal-purpose-panel, .portal-purpose-overview) {
        box-sizing: border-box;
        width: 100%;
        max-width: 820px;
        min-width: 0;
        margin-left: auto;
        margin-right: auto;
      }
      #dashboardSection.portal-purpose-layout .dashboard-card {
        background: var(--pp-surface) !important;
        background-color: var(--pp-surface) !important;
        color: var(--pp-text) !important;
        border: 1px solid var(--pp-border) !important;
        border-radius: var(--pp-radius);
        box-shadow: var(--pp-shadow);
      }
      #dashboardSection.portal-purpose-layout[data-portal-style="glass"] :is(.dashboard-card, .portal-purpose-nav, .portal-purpose-shortcuts button, .portal-fund-selector) {
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      #dashboardSection.portal-purpose-layout :is(button, a, summary, input, select, textarea):focus-visible,
      .portal-purpose-dialog :is(button, a, summary, input, select, textarea):focus-visible,
      .portal-document-reader :is(button, a, summary, input, select, textarea):focus-visible {
        outline: 3px solid var(--pp-focus, #2563eb) !important;
        outline-offset: 2px !important;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-top h2 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--pp-text) !important;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-nav {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 18px;
        padding: 6px;
        background: var(--pp-nav-bg);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        box-shadow: var(--pp-shadow);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-nav button {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 50px;
        padding: 8px 4px;
        border: 1px solid transparent;
        border-radius: calc(var(--pp-radius) - 6px);
        background: transparent;
        color: var(--pp-text);
        font: inherit;
        font-size: 0.9rem;
        font-weight: 700;
        line-height: 1.25;
        word-break: keep-all;
        overflow-wrap: break-word;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
      }
      @media (min-width: 640px) {
        #dashboardSection.portal-purpose-layout .portal-purpose-nav button {
          flex-direction: row;
          gap: 7px;
          font-size: 0.95rem;
          padding: 10px 12px;
        }
      }
      @media (max-width: 22.5rem) {
        #dashboardSection.portal-purpose-layout .portal-purpose-nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        #dashboardSection.portal-purpose-layout .portal-purpose-nav button {
          flex-direction: row;
          gap: 6px;
        }
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-nav button[aria-selected="true"] {
        background: var(--pp-accent);
        color: var(--pp-accent-fg);
      }
      #dashboardSection.portal-purpose-layout[data-portal-style="editorial"] .portal-purpose-nav button[aria-selected="true"] {
        border-radius: 6px;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-nav button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #dashboardSection.portal-purpose-layout [data-purpose-panel][hidden],
      #dashboardSection.portal-purpose-layout #portalApplicationsAndHistory[hidden] {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-panel {
        min-width: 0;
        padding: 0;
        overflow: visible;
      }

      /* Digital Membership Hero Card (strictly scoped skins) */
      #portalDigitalMemberCard {
        --card-bg: linear-gradient(135deg, #163f32 0%, #1f5745 58%, #13352a 100%);
        --card-bg-solid: #184537;
        --card-fg: #ffffff;
        --card-muted: #d7ece3;
        --card-badge-bg: #26604d;
        --card-badge-fg: #ffffff;
        --card-divider: rgba(255, 255, 255, 0.18);
        --card-cta-bg: #f6efe0;
        --card-cta-fg: #14392d;
        --card-subbtn-bg: rgba(12, 35, 28, 0.42);
        --card-subbtn-fg: #ffffff;
        --card-subbtn-border: rgba(255, 255, 255, 0.34);
        --card-focus: #93c5fd;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
        width: 100%;
        padding: 20px 18px 18px;
        margin-bottom: 16px;
        border-radius: calc(var(--pp-radius) + 2px);
        background-color: var(--card-bg-solid);
        background-image: var(--card-bg);
        color: var(--card-fg);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 12px 28px rgba(15, 35, 27, 0.18);
      }
      #portalDigitalMemberCard[data-card-skin="champagne"] {
        --card-bg: linear-gradient(135deg, #f5ead2 0%, #ead6ad 55%, #dfc491 100%);
        --card-bg-solid: #ead6ad;
        --card-fg: #1d170d;
        --card-muted: #4a3b22;
        --card-badge-bg: #2c2213;
        --card-badge-fg: #fdf7ea;
        --card-divider: rgba(29, 23, 13, 0.16);
        --card-cta-bg: #1b4d3e;
        --card-cta-fg: #ffffff;
        --card-subbtn-bg: rgba(255, 252, 244, 0.78);
        --card-subbtn-fg: #1d170d;
        --card-subbtn-border: rgba(29, 23, 13, 0.32);
        --card-focus: #1d4ed8;
        border-color: #cab07c;
      }
      #portalDigitalMemberCard[data-card-skin="navy"] {
        --card-bg: linear-gradient(135deg, #142847 0%, #1f3d68 58%, #102039 100%);
        --card-bg-solid: #193358;
        --card-fg: #ffffff;
        --card-muted: #d6e4f7;
        --card-badge-bg: #2a4d7f;
        --card-badge-fg: #ffffff;
        --card-divider: rgba(255, 255, 255, 0.18);
        --card-cta-bg: #f4f7fc;
        --card-cta-fg: #142847;
        --card-subbtn-bg: rgba(11, 24, 44, 0.45);
        --card-subbtn-fg: #ffffff;
        --card-subbtn-border: rgba(255, 255, 255, 0.34);
        --card-focus: #93c5fd;
      }
      #portalDigitalMemberCard[data-card-skin="terracotta"] {
        --card-bg: linear-gradient(135deg, #6e2d1e 0%, #893927 56%, #592317 100%);
        --card-bg-solid: #7a3322;
        --card-fg: #ffffff;
        --card-muted: #f7dfd8;
        --card-badge-bg: #521f14;
        --card-badge-fg: #ffffff;
        --card-divider: rgba(255, 255, 255, 0.2);
        --card-cta-bg: #fdf4ef;
        --card-cta-fg: #592317;
        --card-subbtn-bg: rgba(54, 19, 12, 0.46);
        --card-subbtn-fg: #ffffff;
        --card-subbtn-border: rgba(255, 255, 255, 0.34);
        --card-focus: #93c5fd;
      }
      #portalDigitalMemberCard button:focus-visible {
        outline: 3px solid var(--card-focus) !important;
        outline-offset: 2px !important;
      }
      #portalDigitalMemberCard .portal-card-sun {
        position: absolute;
        right: -28px;
        top: -28px;
        width: 148px;
        height: 148px;
        opacity: 0.12;
        pointer-events: none;
        color: var(--card-fg);
      }
      #portalDigitalMemberCard .portal-card-head,
      #portalDigitalMemberCard .portal-card-identity,
      #portalDigitalMemberCard .portal-card-metrics,
      #portalDigitalMemberCard .portal-card-actions {
        position: relative;
        z-index: 1;
      }
      #portalDigitalMemberCard .portal-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      #portalDigitalMemberCard .portal-card-coop {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--card-muted);
        word-break: keep-all;
        overflow-wrap: break-word;
      }
      #portalDigitalMemberCard .portal-card-badges {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      #portalDigitalMemberCard .portal-card-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
        background: var(--card-badge-bg);
        color: var(--card-badge-fg);
        word-break: keep-all;
      }
      #portalDigitalMemberCard .portal-card-identity {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 12px;
        padding-bottom: 14px;
        margin-bottom: 14px;
        border-bottom: 1px solid var(--card-divider);
      }
      #portalDigitalMemberCard .portal-card-name {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--card-fg) !important;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      #portalDigitalMemberCard .portal-card-meta {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--card-muted);
        word-break: keep-all;
      }
      #portalDigitalMemberCard .portal-card-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      #portalDigitalMemberCard .portal-card-metrics[data-single="true"] {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 21.5rem) {
        #portalDigitalMemberCard .portal-card-metrics {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      #portalDigitalMemberCard .portal-card-metric {
        min-width: 0;
      }
      #portalDigitalMemberCard .portal-card-metric[hidden] {
        display: none !important;
      }
      #portalDigitalMemberCard .portal-card-metric-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--card-muted);
        margin-bottom: 3px;
        word-break: keep-all;
      }
      #portalDigitalMemberCard .portal-card-metric-val {
        font-size: 1.22rem;
        font-weight: 800;
        line-height: 1.25;
        color: var(--card-fg);
        font-variant-numeric: tabular-nums;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      #portalDigitalMemberCard .portal-card-metric-sub {
        margin-top: 2px;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--card-muted);
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      #portalDigitalMemberCard .portal-card-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
      }
      #portalDigitalMemberCard .portal-card-subbtn,
      #portalDigitalMemberCard .portal-card-cta {
        min-height: 44px;
        padding: 9px 14px;
        border-radius: 12px;
        font: inherit;
        font-size: 0.9rem;
        font-weight: 700;
        word-break: keep-all;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      #portalDigitalMemberCard .portal-card-subbtn {
        margin-right: auto;
        background: var(--card-subbtn-bg);
        color: var(--card-subbtn-fg);
        border: 1px solid var(--card-subbtn-border);
      }
      #portalDigitalMemberCard .portal-card-cta {
        background: var(--card-cta-bg);
        color: var(--card-cta-fg);
        border: 1px solid transparent;
      }
      #portalDigitalMemberCard :is(.portal-card-subbtn, .portal-card-cta):disabled,
      #portalDigitalMemberCard :is(.portal-card-subbtn, .portal-card-cta)[aria-disabled="true"] {
        opacity: 0.58;
        cursor: not-allowed;
      }
      #portalDigitalMemberCard :is(.portal-card-subbtn, .portal-card-cta)[hidden] {
        display: none !important;
      }

      /* Action To-Do Banner */
      #dashboardSection.portal-purpose-layout .portal-purpose-todos:empty {
        display: none;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-todos {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 14px;
        margin-bottom: 16px;
        border-radius: calc(var(--pp-radius) - 2px);
        background: var(--pp-todo-bg);
        border: 1px solid var(--pp-todo-border);
        color: var(--pp-todo-text);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-todos button {
        min-height: 44px;
        padding: 8px 14px;
        border-radius: 10px;
        background: var(--pp-accent);
        color: var(--pp-accent-fg);
        border: 0;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 700;
        white-space: normal;
        word-break: keep-all;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      /* Slim 3 Quick Tiles */
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        min-width: 0;
        min-height: 98px;
        padding: 13px 12px;
        white-space: normal;
        word-break: keep-all;
        overflow-wrap: break-word;
        text-align: left;
        border-radius: var(--pp-radius);
        background: var(--pp-surface);
        color: var(--pp-text);
        border: 1px solid var(--pp-border);
        box-shadow: var(--pp-shadow);
        font: inherit;
        cursor: pointer;
        transition: border-color 0.15s, transform 0.15s;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button:hover {
        border-color: var(--pp-accent);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button[hidden] {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout .portal-shortcut-icon {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #e4f4e9;
        color: #1c5e38;
        font-size: 18px;
        flex: none;
      }
      #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="blue"] {
        background: #e8f0fe;
        color: #284e94;
      }
      #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="gold"] {
        background: #fef1d6;
        color: #785204;
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon,
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon {
        background: #224433;
        color: #a7f3d0;
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="blue"],
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="blue"] {
        background: #1e3356;
        color: #bfdbfe;
      }
      html[data-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="gold"],
      [data-bs-theme="dark"] #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone="gold"] {
        background: #423215;
        color: #fde68a;
      }
      #dashboardSection.portal-purpose-layout .portal-shortcut-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts strong {
        font-size: 0.96rem;
        font-weight: 800;
        color: var(--pp-text);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts small {
        font-size: 0.78rem;
        line-height: 1.3;
        color: var(--pp-muted);
      }
      @media (max-width: 23.5rem) {
        #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts {
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
        }
        #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button {
          flex-direction: row;
          align-items: center;
          min-height: 58px;
          padding: 10px 14px;
          gap: 12px;
        }
      }

      /* Summary vs Funds Asset Row Dedup */
      #portalPurposePanel-summary #assetSummaryRow > div:has([onclick*="'ledger'"]),
      #portalPurposePanel-summary #assetSummaryRow > div:has([onclick*="'dividend'"]),
      #portalPurposePanel-summary #assetSummaryRow > div:has([onclick*="'dividend_net'"]) {
        display: none !important;
      }
      #portalPurposePanel-summary #assetSummaryRow:not(:has(> div:not([style*="display: none"]))) {
        margin-bottom: 0 !important;
      }
      #dashboardSection.portal-purpose-layout #assetSummaryRow .count-title {
        color: var(--pp-muted) !important;
      }
      #dashboardSection.portal-purpose-layout #assetSummaryRow .count-val {
        color: var(--pp-text) !important;
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: normal;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-asset-detail {
        min-height: 44px;
        white-space: normal;
        margin-top: 6px;
      }

      /* Recent History */
      #dashboardSection.portal-purpose-layout .portal-purpose-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-heading h3 {
        font-size: 1.05rem;
        font-weight: 800;
        margin: 0;
        color: var(--pp-text) !important;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-heading button {
        min-height: 44px;
        white-space: normal;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-recent {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-recent li {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 14px;
        align-items: flex-start;
        padding: 12px 0;
        border-top: 1px solid var(--pp-border);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-recent time {
        font-size: 0.82rem;
        min-width: 0;
        max-width: 100%;
        overflow-wrap: anywhere;
        color: var(--pp-muted);
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-recent strong {
        display: block;
        font-size: 0.94rem;
        color: var(--pp-text);
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      #dashboardSection.portal-purpose-layout .portal-purpose-recent small {
        color: var(--pp-muted);
      }

      /* Funds 4-Button Single-Open Selector */
      #dashboardSection.portal-purpose-layout #portalApplicationColumn {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout #portalTimelineColumn {
        width: 100%;
        padding: 0;
      }
      #dashboardSection.portal-purpose-layout #portalModifyDraftList {
        margin-bottom: 14px;
      }
      #dashboardSection.portal-purpose-layout #portalModifyDraftList button {
        min-height: 44px;
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 16px;
        padding: 8px;
        background: var(--pp-surface);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        box-shadow: var(--pp-shadow);
      }
      @media (min-width: 42rem) {
        #dashboardSection.portal-purpose-layout .portal-fund-selector {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      @media (max-width: 20.5rem) {
        #dashboardSection.portal-purpose-layout .portal-fund-selector {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector button {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 48px;
        padding: 9px 10px;
        border-radius: calc(var(--pp-radius) - 6px);
        border: 1px solid var(--pp-border);
        background: var(--pp-surface-subtle);
        color: var(--pp-text);
        font: inherit;
        font-size: 0.88rem;
        font-weight: 700;
        line-height: 1.25;
        word-break: keep-all;
        overflow-wrap: break-word;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        text-align: center;
        cursor: pointer;
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector button[hidden] {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector button[aria-selected="true"] {
        background: var(--pp-accent);
        color: var(--pp-accent-fg);
        border-color: var(--pp-accent);
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector button[data-tone="danger"] {
        color: var(--pp-danger);
        background: var(--pp-danger-bg);
        border-color: var(--pp-danger-border);
      }
      #dashboardSection.portal-purpose-layout .portal-fund-selector button[data-tone="danger"][aria-selected="true"] {
        background: #b91c1c;
        color: #ffffff;
        border-color: #b91c1c;
      }
      #dashboardSection.portal-purpose-layout .portal-direct-grid {
        display: block;
      }
      #dashboardSection.portal-purpose-layout .portal-direct-card {
        min-width: 0;
        height: auto;
        overflow: visible;
        padding: 20px 18px;
        margin: 0 0 18px;
      }
      #dashboardSection.portal-purpose-layout .portal-direct-card[hidden] {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout .portal-direct-card:not([hidden]) > [data-direct-section] {
        display: block !important;
      }
      #dashboardSection.portal-purpose-layout #tabCert > button,
      #dashboardSection.portal-purpose-layout .portal-direct-card button {
        min-height: 44px;
        white-space: normal;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout .portal-direct-history-list {
        max-height: 30rem;
        overflow: auto;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }

      /* Activity & Quick Cards Harmonization */
      #dashboardSection.portal-purpose-layout .portal-activity-accordion {
        margin-bottom: 20px;
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        background: var(--pp-surface);
        color: var(--pp-text);
        box-shadow: var(--pp-shadow);
        overflow: hidden;
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion > summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        list-style: none;
        min-height: 60px;
        padding: 16px 20px;
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion > summary::-webkit-details-marker {
        display: none;
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion > summary::after {
        content: '⌄';
        flex: none;
        transition: transform 0.15s;
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion[open] > summary::after {
        transform: rotate(180deg);
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion > summary h5 {
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        font-size: 1.02rem;
        color: var(--pp-text) !important;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout .portal-activity-accordion > #timelineList {
        padding: 0 20px 18px;
      }
      #dashboardSection.portal-purpose-layout #quickLinksRow .quick-card {
        background: var(--pp-surface);
        color: var(--pp-text);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        box-shadow: var(--pp-shadow);
      }
      #dashboardSection.portal-purpose-layout #quickLinksRow .quick-desc,
      #dashboardSection.portal-purpose-layout #quickLinksRow .quick-meta {
        color: var(--pp-muted);
      }
      #dashboardSection.portal-purpose-layout #quickLinksRow .quick-btn {
        min-height: 44px;
        border-radius: 10px;
        font-weight: 700;
      }

      /* Profile & Appearance Customizer Card */
      #dashboardSection.portal-purpose-layout .portal-appearance-card {
        padding: 18px;
        margin-bottom: 18px;
      }
      #dashboardSection.portal-purpose-layout .portal-appearance-sub {
        margin: 0 0 14px;
        font-size: 0.84rem;
        color: var(--pp-muted);
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout .portal-appearance-label {
        font-size: 0.86rem;
        font-weight: 700;
        color: var(--pp-text);
        margin-bottom: 8px;
      }
      #dashboardSection.portal-purpose-layout .portal-style-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }
      #dashboardSection.portal-purpose-layout .portal-skin-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      @media (min-width: 38rem) {
        #dashboardSection.portal-purpose-layout .portal-skin-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      @media (max-width: 24rem) {
        #dashboardSection.portal-purpose-layout .portal-style-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 20rem) {
        #dashboardSection.portal-purpose-layout .portal-skin-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      #dashboardSection.portal-purpose-layout .portal-choice-btn {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 48px;
        padding: 9px 11px;
        border-radius: 12px;
        border: 1px solid var(--pp-border);
        background: var(--pp-surface-subtle);
        color: var(--pp-text);
        font: inherit;
        text-align: left;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        cursor: pointer;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout .portal-choice-btn[aria-checked="true"] {
        border: 2px solid var(--pp-accent);
        background: var(--pp-accent-soft);
      }
      #dashboardSection.portal-purpose-layout .portal-choice-main {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      #dashboardSection.portal-purpose-layout .portal-choice-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      #dashboardSection.portal-purpose-layout .portal-choice-text strong {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--pp-text);
      }
      #dashboardSection.portal-purpose-layout .portal-choice-text small {
        font-size: 0.76rem;
        color: var(--pp-muted);
      }
      #dashboardSection.portal-purpose-layout .portal-skin-swatch {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        flex: none;
      }
      #dashboardSection.portal-purpose-layout .portal-choice-check {
        font-size: 0.85rem;
        font-weight: 800;
        color: var(--pp-text);
        flex: none;
      }
      #dashboardSection.portal-purpose-layout .portal-choice-btn[aria-checked="false"] .portal-choice-check {
        visibility: hidden;
      }

      /* Profile Existing Controls Responsive Safety */
      #dashboardSection.portal-purpose-layout #profileSwitcher {
        margin: 0 !important;
        max-width: 100%;
      }
      #dashboardSection.portal-purpose-layout #profileSwitcher > button {
        min-height: 44px;
        white-space: normal;
        max-width: 100%;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup {
        background: var(--pp-surface);
        color: var(--pp-text);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        box-shadow: var(--pp-shadow);
        padding: 18px;
        margin-bottom: 18px;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup > .d-flex {
        flex-wrap: wrap;
        gap: 12px;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup .d-flex {
        min-width: 0;
        max-width: 100%;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup .d-flex.align-items-center.mb-2 {
        flex-wrap: wrap;
        gap: 8px;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup h5.text-nowrap {
        white-space: normal !important;
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: keep-all;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup .member-number-badge {
        max-width: 100%;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      #dashboardSection.portal-purpose-layout #portalProfileGroup button {
        min-height: 44px;
      }

      /* Documents & Dialogs */
      .portal-documents-surface {
        min-width: 0;
        height: auto;
        overflow: visible;
      }
      .portal-documents-surface .portal-purpose-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 18px;
      }
      .portal-documents-surface .portal-purpose-heading h3 {
        font-size: 1.1rem;
        margin: 0;
      }
      .portal-documents-surface .portal-document-controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .portal-documents-surface .portal-document-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .portal-documents-surface .portal-document-field label {
        font-size: 0.9rem;
        color: var(--theme-muted, #586a5d);
        word-break: keep-all;
      }
      .portal-documents-surface .portal-document-controls :is(input, select) {
        box-sizing: border-box;
        width: 100%;
        font: inherit;
        max-width: 100%;
        min-width: 0;
        min-height: 46px;
        background: var(--theme-surface, #fff);
        color: var(--theme-text, #172033);
        border: 1px solid var(--theme-border, #d4e1d7);
        border-radius: 10px;
        padding: 10px;
      }
      .portal-documents-surface .portal-document-row {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
        box-sizing: border-box;
        min-width: 0;
        min-height: 78px;
        text-align: left;
        white-space: normal;
        word-break: keep-all;
        overflow-wrap: anywhere;
        padding: 16px;
        border: 1px solid var(--theme-border, #d4e1d7);
        border-radius: 12px;
        background: var(--theme-surface, #fff);
        color: var(--theme-text, #172033);
        font: inherit;
      }
      .portal-documents-surface .portal-document-row:hover {
        border-color: #609a77;
      }
      .portal-documents-surface .portal-document-row:disabled {
        opacity: 0.6;
      }
      .portal-documents-surface .portal-document-row > i {
        font-size: 1.4rem;
        color: var(--theme-muted, #586a5d);
        flex: none;
      }
      .portal-documents-surface .portal-document-row > span {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }
      .portal-documents-surface .portal-document-row small {
        color: var(--theme-muted, #68766c);
      }
      .portal-documents-surface .portal-document-list {
        display: grid;
        gap: 10px;
        margin-bottom: 18px;
      }
      #dashboardSection.portal-purpose-layout[data-inline-documents] #quickMinutesViewCard {
        display: none !important;
      }
      #dashboardSection.portal-purpose-layout[data-inline-documents] #quickLinksRow > .quick-col:has(> #quickMinutesViewCard) {
        display: none !important;
      }
      .portal-document-reader,
      .portal-purpose-dialog {
        max-width: none;
        max-height: calc(100dvh - 24px);
        box-sizing: border-box;
        border: 1px solid var(--theme-border, #d4e1d7);
        border-radius: 16px;
        background: var(--theme-surface, #fff);
        color: var(--theme-text, #172033);
      }
      html[data-theme="dark"] :is(.portal-document-reader, .portal-purpose-dialog),
      [data-bs-theme="dark"] :is(.portal-document-reader, .portal-purpose-dialog) {
        background: #16221c;
        color: #eef5f0;
        border-color: #2f463b;
      }
      .portal-document-reader {
        width: min(1100px, calc(100vw - 24px));
        height: calc(100dvh - 24px);
        padding: 14px;
      }
      .portal-document-reader[open] {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .portal-document-reader::backdrop {
        background: #0f172a80;
      }
      .portal-document-reader .portal-dialog-heading {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .portal-document-reader h3 {
        font-size: 1.1rem;
        margin: 0;
      }
      .portal-document-reader button {
        font: inherit;
        min-height: 44px;
        white-space: normal;
      }
      .portal-document-reader iframe {
        width: 100%;
        min-height: 0;
        flex: 1;
        border: 0;
        background: var(--theme-surface, #fff);
      }
      .portal-purpose-dialog {
        width: min(920px, calc(100vw - 24px));
        height: min(780px, calc(100dvh - 24px));
        padding: 0;
        overflow: hidden;
        margin: auto;
      }
      .portal-purpose-dialog[open] {
        display: flex;
        flex-direction: column;
      }
      .portal-purpose-dialog::backdrop {
        background: #0f172a80;
      }
      .portal-purpose-dialog > .portal-dialog-heading {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--theme-border, #d4e1d7);
      }
      .portal-purpose-dialog h2 {
        font-size: 1.2rem;
        margin: 0;
        word-break: keep-all;
      }
      .portal-purpose-dialog button {
        min-height: 44px;
        white-space: normal;
        font: inherit;
      }
      .portal-purpose-dialog > .portal-dialog-body {
        padding: 20px;
        min-height: 0;
        flex: 1;
        overflow: auto;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      .portal-purpose-dialog .portal-documents-surface {
        border: 0;
        box-shadow: none;
        padding: 0;
        margin: 0 !important;
        background: transparent;
      }
      body:has(#dashboardSection.portal-purpose-layout) :is(#memberInformationDialog, .member-login-methods, .member-identity-claim) {
        height: min(760px, calc(100dvh - 24px));
        max-height: calc(100dvh - 24px);
        overflow: auto;
        box-sizing: border-box;
      }
      body:has(#dashboardSection.portal-purpose-layout) .custom-modal-overlay .custom-modal-box {
        height: min(720px, calc(100dvh - 32px));
        max-height: calc(100dvh - 32px);
        overflow: auto;
        box-sizing: border-box;
      }
      body:has(#dashboardSection.portal-purpose-layout) :is(#customModalOverlay, #findEmailModalOverlay, #modifyAppModal, #socialEmailVerifyModal) .custom-modal-box {
        height: min(440px, calc(100dvh - 32px));
      }
      body:has(#dashboardSection.portal-purpose-layout) dialog.coop-dialog {
        height: min(400px, calc(100dvh - 40px));
        overflow: auto;
      }
      body:has(#dashboardSection.portal-purpose-layout) .portal-login-tool-recovery {
        height: min(400px, calc(100dvh - 24px));
      }
      .portal-purpose-dialog .portal-documents-surface .portal-purpose-heading h3 {
        display: none;
      }
      .portal-purpose-dialog .portal-dividend-content {
        min-width: 0;
      }
      .portal-dividend-content .row {
        --bs-gutter-x: 0.75rem;
      }
      @media (max-width: 575px) {
        .portal-documents-surface .portal-document-controls {
          grid-template-columns: 1fr;
        }
        .portal-purpose-dialog > .portal-dialog-body {
          padding: 14px;
        }
        .portal-dividend-content .col-6 {
          width: 100%;
        }
        #dashboardSection.portal-purpose-layout #assetSummaryRow {
          --bs-gutter-x: 12px;
        }
        #dashboardSection.portal-purpose-layout #portalProfileGroup .input-group {
          flex-wrap: wrap;
          min-width: 0;
        }
        #dashboardSection.portal-purpose-layout #portalProfileGroup .input-group > button {
          white-space: normal;
          overflow-wrap: anywhere;
          min-width: 0;
          max-width: 100%;
          flex: 0 1 auto;
        }
        #dashboardSection.portal-purpose-layout #portalProfileGroup .input-group > .form-control {
          min-width: 0;
          width: 100%;
          flex: 1 1 100%;
        }
        #dashboardSection.portal-purpose-layout #editAddressBox > .d-flex {
          flex-wrap: wrap;
        }
        #dashboardSection.portal-purpose-layout #editAddressBox button {
          white-space: normal !important;
          overflow-wrap: anywhere;
          max-width: 100%;
          min-width: 0;
          flex: 0 1 auto;
        }
        body:has(#dashboardSection.portal-purpose-layout) #header > .container {
          gap: 8px;
        }
        body:has(#dashboardSection.portal-purpose-layout) #header .logo {
          min-width: 0;
          flex: 1;
        }
        body:has(#dashboardSection.portal-purpose-layout) #header .logo h1 {
          margin: 0;
          line-height: 1.2;
        }
        body:has(#dashboardSection.portal-purpose-layout) #headerCoopLink {
          display: block;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        body:has(#dashboardSection.portal-purpose-layout) #header > .container > .d-flex {
          flex: none;
        }
        body:has(#dashboardSection.portal-purpose-layout) #header .header-link {
          display: inline-grid;
          place-items: center;
          min-width: 44px;
          min-height: 44px;
          margin-left: 4px;
          font-size: 24px;
        }
        #dashboardSection.portal-purpose-layout .portal-purpose-top h2 {
          font-size: 1.2rem;
        }
      }
    `;
    doc.head.append(style);

    const shell = element('div', 'portal-purpose-shell');
    const top = element('div', 'portal-purpose-top');
    const title = element('h2', '', '내 정보 보기');
    top.append(title);
    const switcher = doc.getElementById('profileSwitcher');
    if (switcher) top.append(switcher);

    const nav = element('div', 'portal-purpose-nav');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', '조합원 메뉴');

    for (const [key, label] of Object.entries(names)) {
      const button = action('', () => show(key, { focus: true }), '');
      button.id = 'portalPurposeTab-' + key;
      button.dataset.purposeTab = key;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'portalPurposePanel-' + key);
      const icon = element('i', 'bi bi-' + icons[key]);
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon, doc.createTextNode(label));
      nav.append(button);
      buttons[key] = button;

      const panel = element('section', 'portal-purpose-panel');
      panel.id = 'portalPurposePanel-' + key;
      panel.dataset.purposePanel = key;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panels[key] = panel;
    }

    shell.append(top);
    const directory = doc.getElementById('profileDirectoryStatus');
    if (directory) shell.append(directory);
    shell.append(nav, ...Object.values(panels));
    dashboard.append(shell);

    const overview = element('div', 'portal-purpose-overview');
    const summaryAssets = element('div', 'portal-summary-extra-assets');
    const fundAssets = element('div', 'portal-purpose-overview');
    panels.summary.append(overview);

    /* Digital Membership Card Hero (no coop logo, no color swatches, no referral code) */
    const heroCard = element('section', 'portal-digital-member-card');
    heroCard.id = 'portalDigitalMemberCard';
    heroCard.setAttribute('aria-label', '디지털 조합원증');
    heroCard.dataset.cardSkin = appearance.card;
    heroCard.dataset.cardState = 'loading';
    heroCard.setAttribute('aria-busy', 'true');

    const sunDecoration = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sunDecoration.setAttribute('class', 'portal-card-sun');
    sunDecoration.setAttribute('viewBox', '0 0 120 120');
    sunDecoration.setAttribute('aria-hidden', 'true');
    sunDecoration.innerHTML = '<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 6"/><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="1"/>';

    const cardHead = element('div', 'portal-card-head');
    const cardCoopName = element('div', 'portal-card-coop', '협동조합');
    cardCoopName.id = 'portalCardCoopName';
    const cardBadges = element('div', 'portal-card-badges');
    const cardRoleBadge = element('span', 'portal-card-badge', '확인 중');
    cardRoleBadge.id = 'portalCardBadge';
    const cardNoBadge = element('span', 'portal-card-badge', 'NO. —');
    cardNoBadge.id = 'portalCardNumber';
    cardBadges.append(cardRoleBadge, cardNoBadge);
    cardHead.append(cardCoopName, cardBadges);

    const cardIdentity = element('div', 'portal-card-identity');
    const cardMemberName = element('h3', 'portal-card-name', '조합원 정보를 불러오는 중…');
    cardMemberName.id = 'portalCardName';
    const cardJoined = element('span', 'portal-card-meta', '');
    cardJoined.id = 'portalCardJoined';
    cardJoined.hidden = true;
    cardIdentity.append(cardMemberName, cardJoined);

    const cardMetrics = element('div', 'portal-card-metrics');
    const capMetric = element('div', 'portal-card-metric');
    capMetric.id = 'portalCardCapitalBox';
    const capLabel = element('div', 'portal-card-metric-label', '총 납입 출자금');
    const capVal = element('div', 'portal-card-metric-val', '불러오는 중…');
    capVal.id = 'portalCardCapitalValue';
    const capSub = element('div', 'portal-card-metric-sub', '');
    capSub.id = 'portalCardCapitalSub';
    capSub.hidden = true;
    capMetric.append(capLabel, capVal, capSub);

    const divMetric = element('div', 'portal-card-metric');
    divMetric.id = 'portalCardDividendBox';
    const divLabel = element('div', 'portal-card-metric-label', '누적 배당금 (세후)');
    const divVal = element('div', 'portal-card-metric-val', '불러오는 중…');
    divVal.id = 'portalCardDividendValue';
    const divSub = element('div', 'portal-card-metric-sub', '');
    divSub.id = 'portalCardDividendSub';
    divSub.hidden = true;
    divMetric.append(divLabel, divVal, divSub);
    cardMetrics.append(capMetric, divMetric);

    const cardActions = element('div', 'portal-card-actions');
    const cardLedgerBtn = action('출자 내역', () => {
      if (!current()) return;
      const ledgerCard = nodes.assetSummaryRow.querySelector('[onclick*="\'ledger\'"]');
      if (ledgerCard) ledgerCard.click();
    }, 'portal-card-subbtn');
    cardLedgerBtn.id = 'portalCardLedgerButton';

    const heroCertBtn = action('', event => invokeCertificate('memberContributionCertificateView', event.currentTarget), 'portal-card-cta');
    heroCertBtn.id = 'portalHeroCertButton';
    const heroCertIcon = element('i', 'bi bi-award');
    heroCertIcon.setAttribute('aria-hidden', 'true');
    heroCertBtn.append(heroCertIcon, doc.createTextNode('출자증서 바로 보기'));
    cardActions.append(cardLedgerBtn, heroCertBtn);

    heroCard.append(sunDecoration, cardHead, cardIdentity, cardMetrics, cardActions);

    const birthday = doc.getElementById('birthdayBanner');
    if (birthday) overview.append(birthday);
    overview.append(heroCard);

    const todos = element('div', 'portal-purpose-todos');
    todos.setAttribute('aria-label', '확인할 일');
    overview.append(todos);

    const shortcuts = element('div', 'portal-purpose-shortcuts');
    shortcuts.setAttribute('aria-label', '바로가기');
    function shortcut(label, icon, description, tone, handler) {
      const b = action('', handler, '');
      b.setAttribute('aria-label', label);
      const mark = element('span', 'portal-shortcut-icon');
      mark.dataset.tone = tone;
      const i = element('i', 'bi bi-' + icon);
      i.setAttribute('aria-hidden', 'true');
      mark.append(i);
      const copy = element('span', 'portal-shortcut-copy');
      copy.append(element('strong', '', label), element('small', '', description));
      b.append(mark, copy);
      return b;
    }
    const cert = shortcut('출자증서', 'file-earmark-text', '납입 확인·발급', 'green', event => invokeCertificate('memberContributionCertificateView', event.currentTarget));
    const documentShortcut = shortcut('문서함', 'folder2-open', '공지·규정·의사록', 'blue', event => openDocuments(event.currentTarget));
    const dividendShortcut = shortcut('배당내역', 'graph-up-arrow', '세전·세후 내역', 'gold', event => openDividends(event.currentTarget));
    shortcuts.append(cert, documentShortcut, dividendShortcut);
    overview.append(shortcuts, summaryAssets);

    const recent = element('section', 'dashboard-card mb-4 portal-direct-card');
    const heading = element('div', 'portal-purpose-heading');
    const recentTitle = element('h3', '', '최근 내역');
    const all = action('전체 내역', () => {
      if (show('activity', { focus: false })) {
        activityDetails.open = true;
        expanded.set(verified, true);
        focusNode(activitySummary);
      }
    }, 'btn btn-sm btn-outline-secondary');
    heading.append(recentTitle, all);
    const recentList = element('ol', 'portal-purpose-recent');
    const status = element('p', 'text-muted mb-0');
    recent.append(heading, recentList, status);
    overview.append(recent);

    /* Funds 4-Button Selector & Single-Open Panels */
    const modify = doc.getElementById('portalModifyDraftList');
    const fundSelector = element('div', 'portal-fund-selector');
    fundSelector.setAttribute('role', 'tablist');
    fundSelector.setAttribute('aria-label', '출자·신청 항목');

    for (const type of FUND_ORDER) {
      const meta = FUND_META[type];
      const fBtn = action('', () => selectFund(type, { focus: true, invoke: true }), '');
      fBtn.id = 'portalFundTab-' + type;
      fBtn.dataset.fundTab = type;
      fBtn.dataset.tone = meta.tone;
      fBtn.setAttribute('role', 'tab');
      fBtn.setAttribute('aria-controls', 'portalDirectCard-' + type);
      fBtn.setAttribute('aria-selected', 'false');
      const icon = element('i', 'bi bi-' + meta.icon);
      icon.setAttribute('aria-hidden', 'true');
      fBtn.append(icon, element('span', '', meta.label));
      fundSelector.append(fBtn);
      fundButtons[type] = fBtn;
    }

    const directGrid = element('div', 'portal-direct-grid');
    const sectionCards = new Map();
    function directSection(type, parent) {
      const node = doc.getElementById('tab' + type[0].toUpperCase() + type.slice(1));
      const card = element('section', 'portal-direct-card dashboard-card');
      card.id = 'portalDirectCard-' + type;
      if (FUND_META[type]) {
        card.setAttribute('role', 'tabpanel');
        card.setAttribute('aria-labelledby', 'portalFundTab-' + type);
      }
      node.dataset.directSection = type;
      node.classList.remove('py-3');
      card.append(node);
      parent.append(card);
      sectionCards.set(type, card);
      return card;
    }

    panels.funds.append(fundAssets);
    if (modify) panels.funds.append(modify);
    panels.funds.append(fundSelector, nodes.portalApplicationColumn, directGrid);

    directSection('extra', directGrid);
    const reductionCard = directSection('reduction', directGrid);
    const redRetry = action('다시 확인', () => options.openApplication?.('reduction'), 'btn btn-sm btn-outline-secondary mt-2');
    redRetry.id = 'portalDirectRedRetry';
    redRetry.hidden = true;
    reductionCard.append(redRetry);
    directSection('withdraw', directGrid);
    directSection('cert', directGrid);

    /* Activity Panel */
    panels.activity.append(
      nodes.quickLinksRow,
      nodes.portalTimelineColumn,
      nodes.memberFreeBoardCard,
      nodes.memberBadgeCollectionCard,
      nodes.hallOfFameCard
    );
    const timelineCard = nodes.portalTimelineColumn.querySelector('.dashboard-card');
    const activityHeading = timelineCard.querySelector('h5');
    const activityDetails = element('details', 'portal-activity-accordion');
    const activitySummary = element('summary');
    activityDetails.id = 'portalActivityAccordion';
    activitySummary.append(activityHeading);
    activityDetails.append(activitySummary, doc.getElementById('timelineList'));
    timelineCard.replaceWith(activityDetails);
    function retainExpansion() {
      if (verified) expanded.set(verified, activityDetails.open);
    }

    /* Profile Panel + Appearance Customizer Card (no referral codes inside customizer) */
    const appearanceCard = element('section', 'dashboard-card portal-appearance-card');
    appearanceCard.id = 'portalAppearanceCard';
    appearanceCard.setAttribute('aria-labelledby', 'portalAppearanceTitle');
    const appHead = element('div', 'portal-purpose-heading');
    const appTitle = element('h3', '', '화면 스타일 · 조합원증 꾸미기');
    appTitle.id = 'portalAppearanceTitle';
    const appPreviewBtn = action('요약에서 확인 →', () => show('summary', { focus: true }), 'btn btn-sm btn-outline-secondary');
    appPreviewBtn.id = 'portalAppearancePreviewBtn';
    appHead.append(appTitle, appPreviewBtn);
    const appSub = element('p', 'portal-appearance-sub', '이 기기·브라우저에만 저장되며 야간모드와 독립으로 적용됩니다.');

    const styleLabel = element('div', 'portal-appearance-label', '포털 화면 스타일');
    const styleGrid = element('div', 'portal-style-grid');
    styleGrid.setAttribute('role', 'radiogroup');
    styleGrid.setAttribute('aria-label', '포털 화면 스타일');
    for (const key of STYLE_ALLOWLIST) {
      const meta = STYLE_META[key];
      const btn = action('', () => setAppearance({ style: key }), 'portal-choice-btn');
      btn.id = 'portalStyleBtn-' + key;
      btn.dataset.styleChoice = key;
      btn.setAttribute('role', 'radio');
      const main = element('span', 'portal-choice-main');
      const textWrap = element('span', 'portal-choice-text');
      textWrap.append(element('strong', '', meta.label), element('small', '', meta.desc));
      main.append(textWrap);
      const check = element('span', 'portal-choice-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      btn.append(main, check);
      styleGrid.append(btn);
      styleButtons[key] = btn;
    }

    const skinLabel = element('div', 'portal-appearance-label', '조합원증 카드 색');
    const skinGrid = element('div', 'portal-skin-grid');
    skinGrid.setAttribute('role', 'radiogroup');
    skinGrid.setAttribute('aria-label', '조합원증 카드 색');
    for (const key of CARD_ALLOWLIST) {
      const meta = CARD_META[key];
      const btn = action('', () => setAppearance({ card: key }), 'portal-choice-btn');
      btn.id = 'portalCardSkinBtn-' + key;
      btn.dataset.cardChoice = key;
      btn.setAttribute('role', 'radio');
      const main = element('span', 'portal-choice-main');
      const swatch = element('span', 'portal-skin-swatch');
      swatch.style.backgroundColor = meta.swatch;
      swatch.setAttribute('aria-hidden', 'true');
      const textWrap = element('span', 'portal-choice-text');
      textWrap.append(element('strong', '', meta.label));
      main.append(swatch, textWrap);
      const check = element('span', 'portal-choice-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      btn.append(main, check);
      skinGrid.append(btn);
      cardButtons[key] = btn;
    }

    appearanceCard.append(appHead, appSub, styleLabel, styleGrid, skinLabel, skinGrid);
    panels.profile.append(nodes.portalProfileGroup, appearanceCard);
    directSection('partner', panels.profile);
    panels.profile.append(nodes.memberFamilyAccountCard);

    function applyAppearanceDom() {
      dashboard.dataset.portalStyle = appearance.style;
      heroCard.dataset.cardSkin = appearance.card;
      for (const key of STYLE_ALLOWLIST) {
        const on = key === appearance.style;
        styleButtons[key].setAttribute('aria-checked', String(on));
        styleButtons[key].tabIndex = on ? 0 : -1;
      }
      for (const key of CARD_ALLOWLIST) {
        const on = key === appearance.card;
        cardButtons[key].setAttribute('aria-checked', String(on));
        cardButtons[key].tabIndex = on ? 0 : -1;
      }
    }

    function setAppearance(next = {}) {
      const nextStyle = next.style !== undefined ? next.style : appearance.style;
      const nextCard = next.card !== undefined ? next.card : appearance.card;
      appearance = writeDesignPrefs(nextStyle, nextCard);
      applyAppearanceDom();
      return { ...appearance };
    }

    function getAppearance() {
      return { ...appearance };
    }

    styleGrid.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const idx = STYLE_ALLOWLIST.indexOf(event.target.dataset?.styleChoice);
      if (idx < 0) return;
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;
      const nextKey = STYLE_ALLOWLIST[(idx + delta + STYLE_ALLOWLIST.length) % STYLE_ALLOWLIST.length];
      setAppearance({ style: nextKey });
      styleButtons[nextKey].focus({ preventScroll: true });
    });

    skinGrid.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const idx = CARD_ALLOWLIST.indexOf(event.target.dataset?.cardChoice);
      if (idx < 0) return;
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;
      const nextKey = CARD_ALLOWLIST[(idx + delta + CARD_ALLOWLIST.length) % CARD_ALLOWLIST.length];
      setAppearance({ card: nextKey });
      cardButtons[nextKey].focus({ preventScroll: true });
    });

    /* Dialogs (Documents & Dividends) */
    const docHost = element('section', 'dashboard-card mb-4');
    docHost.id = 'portalInlineDocuments';
    const docDialog = makeDialog('문서함', 'portalDocumentsDialog', () => {
      documents?.close(false);
      syncDirectSections();
    });
    docDialog.body.append(docHost);
    const documents = root.MemberPortalDocuments && options.documents
      ? root.MemberPortalDocuments.create({ ...options.documents, container: docHost, isActive: () => current() && docDialog.node.open })
      : null;

    const dividendDialog = makeDialog('배당 내역', 'portalDividendDialog', () => {
      dividendModalSummary.replaceChildren();
      dividendModalList.replaceChildren();
    });
    const dividendModalTitle = element('h3');
    const dividendModalSummary = element('div', 'mb-3 small');
    const dividendModalList = element('div', 'portal-dividend-content');
    dividendModalTitle.hidden = true;
    dividendDialog.body.append(dividendModalTitle, dividendModalSummary, dividendModalList);

    if (documents) dashboard.dataset.inlineDocuments = 'true';
    else docHost.hidden = true;
    nodes.portalApplicationsAndHistory.hidden = true;

    function focusNode(node) {
      if (!node?.isConnected || !current()) return;
      if (!node.matches('button,a,input,select,textarea')) node.tabIndex = -1;
      node.focus({ preventScroll: true });
      node.scrollIntoView?.({ block: 'nearest' });
    }

    function makeDialog(label, id, onClose) {
      const node = element('dialog', 'portal-purpose-dialog');
      const head = element('div', 'portal-dialog-heading');
      const h = element('h2', '', label);
      const closeButton = action('닫기', () => close(), 'btn btn-outline-secondary');
      const body = element('div', 'portal-dialog-body');
      node.id = id;
      h.id = id + 'Title';
      node.setAttribute('aria-labelledby', h.id);
      head.append(h, closeButton);
      node.append(head, body);
      doc.body.append(node);
      let trigger = null;

      function close(restore = true) {
        if (!node.open) return;
        const owned = node.contains(doc.activeElement) || doc.activeElement === doc.body;
        node.close();
        onClose?.();
        const target = trigger;
        trigger = null;
        if (restore && owned && target?.isConnected && current()) target.focus({ preventScroll: true });
      }

      node.addEventListener('cancel', event => {
        event.preventDefault();
        close();
      });
      node.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !node.open || doc.querySelector('.portal-document-reader[open]')) return;
        const focusable = [...node.querySelectorAll('button,input,select,a[href],summary,[tabindex="0"]')]
          .filter(n => !n.disabled && n.getClientRects().length);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && ((event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last))) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      });

      const api = {
        node,
        body,
        close,
        open(from) {
          if (!current() || node.open) return;
          trigger = from;
          node.showModal();
          closeButton.focus({ preventScroll: true });
        }
      };
      dialogs.push(api);
      return api;
    }

    function canDividends() {
      return current() && options.canViewDividends?.() !== false;
    }

    function openDividends(trigger) {
      if (!canDividends()) return;
      options.renderHistory?.('dividend_net', dividendModalTitle, dividendModalSummary, dividendModalList);
      dividendDialog.open(trigger);
    }

    function openDocuments(trigger) {
      if (!current() || !allowed(doc.getElementById('quickMinutesViewCard'))) return;
      if (!documents) {
        options.documents?.openFull?.();
        return;
      }
      docDialog.body.append(docHost);
      docHost.hidden = false;
      docDialog.open(trigger);
      documents.activate(true);
    }

    function isCertBusy() {
      return Boolean(
        certClickLock ||
        options.isCertificateBusy?.() ||
        doc.querySelector('dialog.contribution-cert-preview[open]')
      );
    }

    function invokeCertificate(id, trigger = null) {
      const button = doc.getElementById(id);
      if (!current() || !allowed(doc.querySelector('.menu-btn[onclick*="cert"]')) || button?.disabled) return;
      if (isCertBusy()) return;
      certClickLock = true;
      Promise.resolve().then(() => { certClickLock = false; });
      const opener = (trigger && trigger.isConnected) ? trigger : doc.activeElement;
      if (id === 'memberContributionCertificateView' && typeof options.openContributionCertificate === 'function') {
        options.openContributionCertificate(opener, button);
        return;
      }
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
      button?.click();
    }

    function isFundPermitted(type) {
      return allowed(doc.querySelector('.menu-btn[onclick*="' + type + '"]'));
    }

    function getPermittedFunds() {
      return FUND_ORDER.filter(isFundPermitted);
    }

    function resolveActiveFund() {
      if (!current()) return '';
      const permitted = getPermittedFunds();
      if (!permitted.length) return '';
      const stored = selectedFunds.get(verified);
      if (stored && permitted.includes(stored)) return stored;
      const domOpen = permitted.find(type => {
        const el = doc.getElementById('tab' + type[0].toUpperCase() + type.slice(1));
        return el && !el.classList.contains('hidden');
      });
      const chosen = domOpen || permitted[0];
      selectedFunds.set(verified, chosen);
      return chosen;
    }

    function selectFund(type, settings = {}) {
      if (!FUND_META[type] || !current() || !isFundPermitted(type)) return false;
      if (settings.invoke !== false && options.canSwitchFund?.() === false) return false;
      selectedFunds.set(verified, type);
      syncDirectSections();
      if (settings.focus) fundButtons[type]?.focus({ preventScroll: true });
      if (settings.invoke !== false) options.openApplication?.(type);
      return true;
    }

    function getSelectedFund() {
      return resolveActiveFund();
    }

    fundSelector.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !current()) return;
      const permitted = getPermittedFunds();
      const at = permitted.indexOf(event.target.dataset?.fundTab);
      if (at < 0 || !permitted.length) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? permitted.length - 1
          : (at + ((event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1) + permitted.length) % permitted.length;
      selectFund(permitted[nextIndex], { focus: true, invoke: true });
    });

    function fallbackCardSnapshot() {
      if (!current()) return { state: 'loading' };
      const cur = root.curMem;
      if (!cur) return { state: 'loading' };
      const summaryAssetsObj = root.globalAssetSummary;
      const hasCap = Number.isFinite(Number(summaryAssetsObj?.total_capital ?? cur.total_capital));
      const totalCapital = hasCap ? Number(summaryAssetsObj?.total_capital ?? cur.total_capital) : null;
      const canDiv = canDividends();
      const hasDiv = canDiv && summaryAssetsObj && Number.isFinite(Number(summaryAssetsObj.total_dividend_net));
      return {
        state: 'ready',
        coopName: doc.getElementById('headerCoopLink')?.textContent?.trim() || '협동조합',
        displayName: doc.getElementById('summaryName')?.textContent?.trim() || String(cur.name || '').trim() || '이름 확인 필요',
        memberId: String(cur.member_id || '').trim(),
        joinDate: String(cur.join_date || '').trim(),
        isGroup: String(cur.member_type || '').trim() === '단체' || String(cur.member_type || '').trim() === 'organization',
        isSiteMember: false,
        isChild: String(cur.join_category || '') === '가족',
        isOwnPersonal: true,
        hasCapital: hasCap,
        totalCapital,
        shareUnit: null,
        canDividends: canDiv,
        hasDividend: Boolean(hasDiv),
        dividendNet: hasDiv ? Number(summaryAssetsObj.total_dividend_net) : null,
        dividendGross: hasDiv && Number.isFinite(Number(summaryAssetsObj.total_dividend_gross)) ? Number(summaryAssetsObj.total_dividend_gross) : null
      };
    }

    function syncCard() {
      const snap = options.getMemberCardSnapshot ? options.getMemberCardSnapshot() : fallbackCardSnapshot();
      const canCert = current() && allowed(doc.querySelector('.menu-btn[onclick*="cert"]'));
      const state = !snap ? 'loading' : (snap.state === 'error' ? 'error' : (!current() || snap.state !== 'ready' ? 'loading' : 'ready'));

      heroCard.dataset.cardState = state;
      heroCard.setAttribute('aria-busy', String(state === 'loading'));

      if (state === 'loading') {
        cardCoopName.textContent = snap?.coopName || doc.getElementById('headerCoopLink')?.textContent?.trim() || '협동조합';
        cardRoleBadge.textContent = '확인 중';
        cardNoBadge.textContent = 'NO. —';
        cardMemberName.textContent = '조합원 정보를 불러오는 중…';
        cardJoined.textContent = '';
        cardJoined.hidden = true;
        divMetric.hidden = false;
        cardMetrics.dataset.single = 'false';
        capVal.textContent = '불러오는 중…';
        capSub.textContent = '';
        capSub.hidden = true;
        divVal.textContent = '불러오는 중…';
        divSub.textContent = '';
        divSub.hidden = true;
        heroCertBtn.disabled = true;
        cardLedgerBtn.disabled = true;
        return;
      }

      if (state === 'error') {
        cardCoopName.textContent = snap?.coopName || doc.getElementById('headerCoopLink')?.textContent?.trim() || '협동조합';
        cardRoleBadge.textContent = '확인 실패';
        cardNoBadge.textContent = 'NO. 확인 필요';
        cardMemberName.textContent = '정보를 불러오지 못했습니다';
        cardJoined.textContent = '';
        cardJoined.hidden = true;
        divMetric.hidden = false;
        cardMetrics.dataset.single = 'false';
        capVal.textContent = '확인 실패';
        capSub.textContent = '다시 시도해 주세요';
        capSub.hidden = false;
        divVal.textContent = '확인 실패';
        divSub.textContent = '다시 시도해 주세요';
        divSub.hidden = false;
        heroCertBtn.disabled = true;
        cardLedgerBtn.disabled = true;
        return;
      }

      cardCoopName.textContent = snap.coopName || '협동조합';
      cardRoleBadge.textContent = snap.isSiteMember
        ? '누리집 회원'
        : snap.isGroup
          ? '단체 조합원'
          : snap.isChild
            ? '가족 연결 · 자녀'
            : snap.isOwnPersonal
              ? '정조합원'
              : '연결 프로필';
      cardNoBadge.textContent = snap.memberId ? `NO. ${snap.memberId}` : 'NO. 확인 필요';
      cardMemberName.textContent = snap.displayName || '이름 확인 필요';

      const joinedText = formatJoinDate(snap.joinDate);
      cardJoined.textContent = joinedText;
      cardJoined.hidden = !joinedText;

      if (snap.hasCapital && Number.isFinite(snap.totalCapital)) {
        capVal.textContent = formatWon(snap.totalCapital);
        if (snap.shareUnit > 0 && snap.totalCapital >= 0 && snap.totalCapital % snap.shareUnit === 0) {
          const shares = Math.trunc(snap.totalCapital / snap.shareUnit);
          capSub.textContent = `${shares.toLocaleString('ko-KR')}좌 기준`;
          capSub.hidden = false;
        } else {
          capSub.textContent = '';
          capSub.hidden = true;
        }
      } else {
        capVal.textContent = '확인 필요';
        capSub.textContent = '';
        capSub.hidden = true;
      }

      const showDiv = Boolean(snap.canDividends && canDividends());
      divMetric.hidden = !showDiv;
      cardMetrics.dataset.single = String(!showDiv);
      if (showDiv) {
        if (snap.hasDividend && Number.isFinite(snap.dividendNet)) {
          divVal.textContent = formatWon(snap.dividendNet);
          if (Number.isFinite(snap.dividendGross) && snap.dividendGross > 0) {
            divSub.textContent = `세전 ${formatWon(snap.dividendGross)}`;
            divSub.hidden = false;
          } else {
            divSub.textContent = '';
            divSub.hidden = true;
          }
        } else {
          divVal.textContent = '확인 필요';
          divSub.textContent = '';
          divSub.hidden = true;
        }
      }

      heroCertBtn.hidden = !canCert;
      heroCertBtn.disabled = !canCert;
      const hasLedgerCard = Boolean(nodes.assetSummaryRow.querySelector('[onclick*="\'ledger\'"]'));
      cardLedgerBtn.hidden = !hasLedgerCard;
      cardLedgerBtn.disabled = !hasLedgerCard;
    }

    function syncDirectSections() {
      const activeFund = resolveActiveFund();
      const permittedCount = getPermittedFunds().length;
      fundSelector.hidden = !current() || permittedCount === 0;

      for (const [type, card] of sectionCards) {
        if (type === 'partner') {
          const menu = doc.querySelector('.menu-btn[onclick*="partner"]');
          card.hidden = !current() || !allowed(menu);
          continue;
        }
        const permitted = isFundPermitted(type);
        const fBtn = fundButtons[type];
        if (fBtn) {
          fBtn.hidden = !permitted;
          fBtn.disabled = !current() || !permitted;
          const isSelected = current() && permitted && type === activeFund;
          fBtn.setAttribute('aria-selected', String(isSelected));
          fBtn.tabIndex = isSelected ? 0 : -1;
        }
        card.hidden = !current() || !permitted || type !== activeFund;
      }

      const docCard = doc.getElementById('quickMinutesViewCard');
      const canRead = !!documents && current() && allowed(docCard);
      if (!canRead) docDialog.close(false);
      docHost.hidden = !canRead;
      if (documents) documents.activate(canRead && docDialog.node.open);
    }

    function updateOverview() {
      cert.hidden = !allowed(doc.querySelector('.menu-btn[onclick*="cert"]'));
      documentShortcut.hidden = !allowed(doc.getElementById('quickMinutesViewCard'));
      dividendShortcut.hidden = !canDividends();
      syncDirectSections();
      syncCard();

      if (!current()) {
        recentList.replaceChildren();
        status.hidden = false;
        status.textContent = '내역을 다시 확인해 주세요.';
        todos.replaceChildren();
        return;
      }

      const items = [...doc.querySelectorAll('#timelineList .timeline-item')].slice(0, 3);
      recentList.replaceChildren();
      for (const item of items) {
        const li = element('li');
        const date = element('time', '', item.querySelector('.timeline-date')?.textContent.trim() || '');
        const body = element('div');
        const label = item.querySelector('.timeline-content h6,.timeline-content h5,.timeline-content .fw-bold')?.cloneNode(true);
        label?.querySelectorAll('button').forEach(n => n.remove());
        body.append(element('strong', '', label?.textContent.trim() || '활동 내역'));
        const badge = item.querySelector('.badge');
        if (badge) body.append(element('small', '', badge.textContent.trim()));
        li.append(date, body);
        recentList.append(li);
      }
      status.hidden = items.length > 0;
      status.textContent = doc.getElementById('timelineList').textContent.includes('활동 내역이 없습니다.')
        ? '아직 활동 내역이 없습니다.'
        : '내역을 불러오고 있어요.';

      todos.replaceChildren();
      for (const [badgeId, cardId, label] of [
        ['voteTodoBadge', 'quickVoteCard', '선거·투표 확인'],
        ['signTodoBadge', 'quickMinutesSignCard', '서명 요청 확인'],
        ['docTodoBadge', 'quickMinutesViewCard', '문서함 확인']
      ]) {
        const badge = doc.getElementById(badgeId);
        const card = doc.getElementById(cardId);
        if (!allowed(badge) || !allowed(card)) continue;
        const button = action('', event => {
          if (!current() || !allowed(badge) || !allowed(card)) return;
          if (cardId === 'quickMinutesViewCard') openDocuments(event.currentTarget);
          else card.querySelector('button,a')?.click();
        }, '');
        const alertIcon = element('i', 'bi bi-bell-fill');
        alertIcon.setAttribute('aria-hidden', 'true');
        button.append(alertIcon, doc.createTextNode(label));
        todos.append(button);
      }
    }

    function enhanceAssets() {
      for (const card of nodes.assetSummaryRow.querySelectorAll('.dashboard-card[onclick]')) {
        if (card.querySelector('.portal-purpose-asset-detail')) continue;
        const old = card.querySelector('.x-small');
        if (old) old.hidden = true;
        const button = action('상세내역', event => {
          event.stopPropagation();
          if (current() && ['summary', 'funds'].includes(selected) && allowed(card)) card.click();
        }, 'btn btn-sm btn-outline-success portal-purpose-asset-detail');
        card.append(button);
      }
      syncCard();
    }

    function paint() {
      for (const key of Object.keys(names)) {
        panels[key].hidden = key !== selected;
        buttons[key].setAttribute('aria-selected', String(key === selected));
        buttons[key].tabIndex = key === selected ? 0 : -1;
        buttons[key].disabled = !current();
      }
      (selected === 'funds' ? fundAssets : summaryAssets).append(nodes.assetSummaryRow);
      nav.setAttribute('aria-busy', String(!current()));
    }

    function show(key, settings = {}) {
      if (!Object.hasOwn(names, key) || !current() || doc.hidden || root.frameElement?.hidden || dashboard.classList.contains('hidden')) return false;
      if (key === selected) {
        if (settings.focus) buttons[key].focus({ preventScroll: true });
        return true;
      }
      if (options.beforeChange?.(selected, key) === false) return false;
      retainExpansion();
      for (const dialog of dialogs) dialog.close(false);
      selected = key;
      choices.set(verified, key);
      paint();
      updateOverview();
      if (settings.focus) buttons[key].focus({ preventScroll: true });
      options.onEnter?.(key, settings);
      return true;
    }

    function refresh() {
      const key = context();
      if (!key) {
        suspend();
        return;
      }
      if (verified !== key) {
        retainExpansion();
        for (const dialog of dialogs) dialog.close(false);
        verified = key;
        selected = choices.get(key) || 'summary';
        activityDetails.open = expanded.get(key) || false;
      }
      paint();
      updateOverview();
      options.onEnter?.(selected, { reason: 'refresh' });
    }

    function suspend() {
      retainExpansion();
      verified = '';
      documents?.suspend();
      for (const dialog of dialogs) dialog.close(false);
      for (const b of Object.values(buttons)) b.disabled = true;
      for (const fBtn of Object.values(fundButtons)) fBtn.disabled = true;
      nav.setAttribute('aria-busy', 'true');
      updateOverview();
    }

    nav.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !current()) return;
      const keys = Object.keys(names);
      const at = keys.indexOf(event.target.dataset.purposeTab);
      if (at < 0) return;
      event.preventDefault();
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? keys.length - 1
          : (at + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
      show(keys[next], { focus: true });
    });

    const observer = new MutationObserver(updateOverview);
    observer.observe(doc.getElementById('timelineList'), { childList: true, subtree: true, characterData: true });
    observer.observe(nodes.quickLinksRow, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'], characterData: true });
    observer.observe(nodes.portalApplicationColumn, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });

    const assetsObserver = new MutationObserver(enhanceAssets);
    assetsObserver.observe(nodes.assetSummaryRow, { childList: true, subtree: true });

    applyAppearanceDom();
    enhanceAssets();
    dashboard.classList.add('portal-purpose-layout');
    dashboard.dataset.purposeMounted = 'true';
    refresh();

    return Object.freeze({
      isDirect: true,
      show,
      refresh,
      suspend,
      syncCard,
      getSelected: () => selected,
      selectFund,
      getSelectedFund,
      getFundButton: type => fundButtons[type] || null,
      setAppearance,
      getAppearance
    });
  }

  root.MemberPortalLayout = Object.freeze({ version: '2.0.0', create });
})(window);
