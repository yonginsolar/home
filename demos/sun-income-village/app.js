(() => {
  'use strict';

  function enforceHostedErpEntry() {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    const isHosted = host === 'yonginsolar.kr' || host === 'www.yonginsolar.kr' || host === 'erp.yonginsolar.kr';
    if (!isHosted) return true;
    let openedByErpLauncher = false;
    try {
      const parentPath = window.parent !== window ? String(window.parent.location.pathname || '') : '';
      openedByErpLauncher = /\/(?:erp\/)?sun_income_village_demo(?:\.html)?\/?$/.test(parentPath);
    } catch (_) {
      openedByErpLauncher = false;
    }
    if (openedByErpLauncher) return true;
    const launcherPath = host === 'erp.yonginsolar.kr' ? '/sun_income_village_demo.html' : '/erp/sun_income_village_demo.html';
    window.location.replace(launcherPath);
    return false;
  }

  if (!enforceHostedErpEntry()) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const views = new Set(['dashboard', 'operations-fees', 'members', 'accounting', 'approvals', 'governance', 'rules', 'plant-finance']);
  let selectedVillage = 'all';
  let memberFilter = 'all';
  let activeMeetingId = null;
  let toastTimer = null;

  const villages = {
    gaon: { name: '가온리 햇빛소득마을', short: '가온리', manager: '김운영', status: '운영 중', capacity: 200, members: 82, fullMembers: 76, payees: 72, review: 6, balance: 76450000, revenue: 7850000, expense: 1280000, generation: 21400, reconcileState: '통장 일치', reconcileDifference: 0, unsigned: 0, feeState: '입금 완료' },
    deulkkot: { name: '들꽃리 햇빛소득마을', short: '들꽃리', manager: '이관리', status: '운영 중', capacity: 150, members: 67, fullMembers: 61, payees: 58, review: 6, balance: 48900000, revenue: 6120000, expense: 660000, generation: 16800, reconcileState: '통장 일치', reconcileDifference: 0, unsigned: 0, feeState: '청구 완료' },
    solsaem: { name: '솔샘리 햇빛소득마을', short: '솔샘리', manager: '김운영', status: '준비 중', capacity: 100, members: 49, fullMembers: 41, payees: 39, review: 8, balance: 26350000, revenue: 0, expense: 4200000, generation: 0, reconcileState: '확인 필요', reconcileDifference: 120000, unsigned: 1, feeState: '입금 대기' }
  };

  const members = [
    { name: '김햇빛', village: 'gaon', type: '개인', role: '이사', capital: 3000000, payee: true, status: '정조합원' },
    { name: '이마을', village: 'gaon', type: '주민', role: '세대대표', capital: 1000000, payee: false, status: '확인 필요' },
    { name: '최공동', village: 'gaon', type: '개인', role: '대의원', capital: 5000000, payee: true, status: '정조합원' },
    { name: '정들꽃', village: 'deulkkot', type: '개인', role: '이사장', capital: 5000000, payee: true, status: '정조합원' },
    { name: '박공동', village: 'deulkkot', type: '단체', role: '조합원', capital: 10000000, payee: true, status: '정조합원' },
    { name: '윤새봄', village: 'deulkkot', type: '주민', role: '가입 신청', capital: 1000000, payee: false, status: '확인 필요' },
    { name: '한솔샘', village: 'solsaem', type: '개인', role: '준비위원', capital: 2000000, payee: true, status: '정조합원' },
    { name: '오햇살', village: 'solsaem', type: '주민', role: '서류 보완', capital: 0, payee: false, status: '확인 필요' }
  ];

  const ledger = [
    { date: '09.01', village: 'gaon', description: '8월 전력판매 수입', debit: '보통예금', credit: '전력판매수익', amount: 7850000, approval: '연결 완료' },
    { date: '09.01', village: 'deulkkot', description: '8월 전력판매 수입', debit: '보통예금', credit: '전력판매수익', amount: 6120000, approval: '연결 완료' },
    { date: '09.02', village: 'gaon', description: '발전소 정기점검비', debit: '유지보수비', credit: '보통예금', amount: 1280000, approval: '결재 2026-41' },
    { date: '09.02', village: 'deulkkot', description: '발전소 재산종합보험', debit: '보험료', credit: '보통예금', amount: 660000, approval: '결재 2026-38' },
    { date: '09.02', village: 'solsaem', description: '개발행위허가 용역비', debit: '건설중인자산', credit: '보통예금', amount: 4200000, approval: '결재 2026-12' }
  ];

  const approvals = [
    { id: 'A-042', village: 'gaon', kind: '지출결의', title: '인버터 정기점검비 지급', detail: '점검보고서·세금계산서 첨부', amount: 1280000, status: '검토 중', linked: false, icon: '🧾' },
    { id: 'A-041', village: 'gaon', kind: '일반결재', title: '3분기 운영보고서 확정', detail: '발전량·수입·유지보수 내역', amount: 0, status: '승인 완료', linked: false, icon: '📗' },
    { id: 'A-039', village: 'deulkkot', kind: '지출결의', title: '발전소 보험료 지급', detail: '보험증권·납입안내서 첨부', amount: 660000, status: '승인 완료', linked: true, icon: '🛡️' },
    { id: 'A-038', village: 'deulkkot', kind: '계약결재', title: '제초관리 연간계약', detail: '견적서 2건 비교 필요', amount: 1800000, status: '대기', linked: false, icon: '📝' },
    { id: 'A-013', village: 'solsaem', kind: '지출결의', title: '개발행위허가 보완 용역', detail: '보완 요청서·용역 산출내역', amount: 4200000, status: '승인 완료', linked: true, icon: '📐' },
    { id: 'A-014', village: 'solsaem', kind: '일반결재', title: '부지 사용협약 검토', detail: '토지 사용기간·갱신조건 확인', amount: 0, status: '대기', linked: false, icon: '🏞️' }
  ];

  const meetings = [
    { id: 'M-gaon-1', village: 'gaon', type: '이사회', date: '2026-09-08', day: '8', month: '9월', title: '3분기 운영실적과 유지보수비 의결', place: '가온리 마을회관', target: '이사 5명 · 감사 1명', agenda: '발전량·전력판매 수입 보고, 정기점검비 의결', signatureRule: '정관에 따라 의장·출석 이사 지정', disclosure: '서명 완료 후 공개', signed: 0, signers: 5, state: '소집 완료' },
    { id: 'M-gaon-2', village: 'gaon', type: '총회', date: '2026-08-22', day: '22', month: '8월', title: '상반기 결산 및 운영보고', place: '가온리 마을회관', target: '정조합원 76명', agenda: '상반기 결산 승인과 운영현황 보고', signatureRule: '의장 + 총회에서 선출한 조합원 3명', disclosure: '조합원 열람 가능', signed: 4, signers: 4, state: '서명 완료' },
    { id: 'M-deul-1', village: 'deulkkot', type: '이사회', date: '2026-09-12', day: '12', month: '9월', title: '제초관리 계약과 보험료 보고', place: '들꽃리 경로당', target: '이사 4명 · 감사 1명', agenda: '연간 제초계약 업체 선정과 보험 가입 보고', signatureRule: '정관에 따라 의장·출석 이사 지정', disclosure: '서명 완료 후 공개', signed: 0, signers: 4, state: '안건 준비' },
    { id: 'M-sol-1', village: 'solsaem', type: '총회', date: '2026-09-20', day: '20', month: '9월', title: '부지 사용협약과 사업계획 의결', place: '솔샘리 마을회관', target: '정조합원 41명', agenda: '부지 사용협약, 사업비와 차입 한도 의결', signatureRule: '의장 + 총회에서 선출한 조합원 3명', disclosure: '의결·서명 후 공개', signed: 0, signers: 4, state: '소집 준비' }
  ];

  const documents = [
    { village: 'gaon', title: '상반기 결산 및 운영보고 총회 의사록', date: '2026.08.22', signature: '4/4', status: '완료' },
    { village: 'deulkkot', title: '제7차 이사회 의사록', date: '2026.08.19', signature: '4/4', status: '완료' },
    { village: 'solsaem', title: '설립준비위원회 회의록', date: '2026.08.15', signature: '3/4', status: '서명 중' }
  ];

  const rules = [
    { village: 'gaon', type: '정관', title: '가온리햇빛협동조합 정관', version: '제3차', resolution: '2026 정기총회', effective: '2026.03.01', isPublic: true, status: '시행 중', revisions: 3 },
    { village: 'gaon', type: '규약', title: '조합원 가입·탈퇴 규약', version: '제1차', resolution: '2025 임시총회', effective: '2025.07.15', isPublic: true, status: '시행 중', revisions: 1 },
    { village: 'gaon', type: '규정', title: '이사회 운영 및 의사록 규정', version: '제2차', resolution: '제5차 이사회', effective: '2026.05.20', isPublic: true, status: '시행 중', revisions: 2 },
    { village: 'gaon', type: '규정', title: '잉여금·시설 수선적립금 운영규정', version: '초안', resolution: '제8차 이사회 상정', effective: '-', isPublic: false, status: '의결 준비', revisions: 0 },
    { village: 'deulkkot', type: '정관', title: '들꽃리햇빛협동조합 정관', version: '제2차', resolution: '2026 정기총회', effective: '2026.02.21', isPublic: true, status: '시행 중', revisions: 2 },
    { village: 'deulkkot', type: '규약', title: '마을공동사업 수익금 활용규약', version: '제1차', resolution: '2026 정기총회', effective: '2026.02.21', isPublic: true, status: '시행 중', revisions: 1 },
    { village: 'deulkkot', type: '규정', title: '발전소 유지관리 규정', version: '제1차', resolution: '제4차 이사회', effective: '2026.04.01', isPublic: true, status: '시행 중', revisions: 1 },
    { village: 'solsaem', type: '정관', title: '솔샘리햇빛협동조합 정관안', version: '설립안', resolution: '창립총회 상정', effective: '-', isPublic: false, status: '의결 준비', revisions: 0 },
    { village: 'solsaem', type: '규약', title: '구성원 가입 및 출자 규약안', version: '초안', resolution: '창립총회 상정', effective: '-', isPublic: false, status: '검토 중', revisions: 0 },
    { village: 'solsaem', type: '규정', title: '부지·발전소 운영규정안', version: '초안', resolution: '설립준비위원회', effective: '-', isPublic: false, status: '검토 중', revisions: 0 }
  ];

  const plantFinancePlans = {
    gaon: {
      period: '2026년 8월', forecastSales: 94200000, operatingCost: 16800000, tax: 4500000, loan: 28000000, statutoryReserve: 4500000, repairReserve: 12000000,
      availability: '99.2%', settlement: '정산 완료', nextInspection: '2026.11.15', incident: '가동중단 0시간', maintenance: '11월 인버터 정밀점검 예정 · 예상비 320만원',
      uses: [
        { stage: '먼저 반영', title: '발전소 운영·유지비', planned: 16800000, executed: 10100000, decision: '2026 사업예산', status: '집행 중' },
        { stage: '먼저 반영', title: '세금 납부 재원', planned: 4500000, executed: 2800000, decision: '세금계산 반영', status: '확인 중' },
        { stage: '먼저 반영', title: '대출 원리금 상환', planned: 28000000, executed: 18700000, decision: '대출상환계획', status: '정상 상환' },
        { stage: '적립', title: '법정적립금', planned: 4500000, executed: 4500000, decision: '2026 정기총회', status: '적립 완료' },
        { stage: '적립', title: '시설 수선·교체 임의적립금', planned: 12000000, executed: 8000000, decision: '2026 정기총회', status: '적립 중' },
        { stage: '활용', title: '마을공동사업', planned: 10000000, executed: 6000000, decision: '제6차 이사회', status: '집행 중' },
        { stage: '활용', title: '조합원 배당 계획', planned: 12000000, executed: 0, decision: '결산 후 총회', status: '확정 전' },
        { stage: '이월', title: '다음 연도 이월', planned: 6400000, executed: 0, decision: '결산 후 확정', status: '예정' }
      ]
    },
    deulkkot: {
      period: '2026년 8월', forecastSales: 73440000, operatingCost: 12000000, tax: 3200000, loan: 20000000, statutoryReserve: 3800000, repairReserve: 9000000,
      availability: '98.7%', settlement: '정산 완료', nextInspection: '2026.10.04', incident: '가동중단 2.5시간', maintenance: '10월 구조물·배선 정기점검 예정 · 예상비 180만원',
      uses: [
        { stage: '먼저 반영', title: '발전소 운영·유지비', planned: 12000000, executed: 7200000, decision: '2026 사업예산', status: '집행 중' },
        { stage: '먼저 반영', title: '세금 납부 재원', planned: 3200000, executed: 1900000, decision: '세금계산 반영', status: '확인 중' },
        { stage: '먼저 반영', title: '대출 원리금 상환', planned: 20000000, executed: 13300000, decision: '대출상환계획', status: '정상 상환' },
        { stage: '적립', title: '법정적립금', planned: 3800000, executed: 3800000, decision: '2026 정기총회', status: '적립 완료' },
        { stage: '적립', title: '시설 수선·교체 임의적립금', planned: 9000000, executed: 5000000, decision: '2026 정기총회', status: '적립 중' },
        { stage: '활용', title: '마을공동사업', planned: 8000000, executed: 4500000, decision: '제5차 이사회', status: '집행 중' },
        { stage: '활용', title: '조합원 배당 계획', planned: 11000000, executed: 0, decision: '결산 후 총회', status: '확정 전' },
        { stage: '이월', title: '다음 연도 이월', planned: 6440000, executed: 0, decision: '결산 후 확정', status: '예정' }
      ]
    },
    solsaem: {
      period: '상업운전 준비', forecastSales: 0, operatingCost: 0, tax: 0, loan: 0, statutoryReserve: 0, repairReserve: 0,
      availability: '-', settlement: '운전 전', nextInspection: '사용전검사 일정 미정', incident: '발전자료 없음', maintenance: '상업운전 후 장기 유지관리와 시설 수선·교체 적립계획을 작성합니다.',
      uses: []
    }
  };

  const operationContracts = [
    { village: 'gaon', manager: '김운영', start: '2026.01.01', setupFee: 300000, setupState: '납부 완료', monthlyFee: 80000, monthlyNote: 'VAT 별도', messagePolicy: '사용량 실비', billingDay: '매월 5일', status: '운영 중' },
    { village: 'deulkkot', manager: '이관리', start: '2026.02.01', setupFee: 300000, setupState: '납부 완료', monthlyFee: 80000, monthlyNote: 'VAT 별도', messagePolicy: '사용량 실비', billingDay: '매월 5일', status: '운영 중' },
    { village: 'solsaem', manager: '김운영', start: '2026.08.20', setupFee: 300000, setupState: '입금 대기', monthlyFee: 80000, monthlyNote: '운영 개시 후 · VAT 별도', messagePolicy: '사용량 실비', billingDay: '운영 개시일', status: '구축 중' }
  ];

  const operationBillings = [
    { village: 'gaon', kind: '9월 이용료', baseAmount: 80000, messageAmount: 18500, due: '2026.09.05', status: '입금 완료', received: 108350 },
    { village: 'deulkkot', kind: '9월 이용료', baseAmount: 80000, messageAmount: 12400, due: '2026.09.05', status: '청구 완료', received: 0 },
    { village: 'solsaem', kind: '초기 설정비', baseAmount: 300000, messageAmount: 0, due: '2026.09.10', status: '입금 대기', received: 0 }
  ];

  const tasks = [
    { village: 'gaon', priority: '검토', type: 'normal', title: '정기점검비 지출결의 확인', note: '결재 A-042 · 이사장 검토 중' },
    { village: 'deulkkot', priority: '확인', type: 'normal', title: '제초관리 계약 견적 비교', note: '결재 A-038 · 견적서 1건 추가 필요' },
    { village: 'solsaem', priority: '회의', type: '', title: '총회 소집통지 발송', note: '9월 20일 총회 · 정조합원 41명' },
    { village: 'solsaem', priority: '보완', type: '', title: '구성원 가입서류 8명 확인', note: '주민등록·출자금 납입 상태 점검' }
  ];

  const recent = [
    { village: 'gaon', icon: '📒', title: '전력판매 수입 전표 반영', note: '9월 1일 · 785만원' },
    { village: 'deulkkot', icon: '✅', title: '발전소 보험료 결재 완료', note: '9월 2일 · 회계 연결 완료' },
    { village: 'gaon', icon: '✍️', title: '상반기 총회 의사록 서명 완료', note: '8월 23일 · 서명 4/4' },
    { village: 'solsaem', icon: '👥', title: '가입 신청 3명 접수', note: '8월 31일 · 서류 확인 중' }
  ];

  function selectedKeys() {
    return selectedVillage === 'all' ? Object.keys(villages) : [selectedVillage];
  }

  function matchesVillage(item) {
    return selectedVillage === 'all' || item.village === selectedVillage;
  }

  function sumVillage(field) {
    return selectedKeys().reduce((sum, key) => sum + Number(villages[key][field] || 0), 0);
  }

  function won(value) {
    return `${Number(value || 0).toLocaleString('ko-KR')}원`;
  }

  function compactWon(value) {
    const amount = Number(value || 0);
    if (amount >= 100000000) {
      const billions = Math.floor(amount / 100000000);
      const rest = Math.round((amount % 100000000) / 10000);
      return rest ? `${billions}억 ${rest.toLocaleString('ko-KR')}만원` : `${billions}억원`;
    }
    return `${Math.round(amount / 10000).toLocaleString('ko-KR')}만원`;
  }

  function billingAmounts(item) {
    const supply = Number(item.baseAmount || 0) + Number(item.messageAmount || 0);
    const vat = Math.round(supply * 0.1);
    return { supply, vat, total: supply + vat };
  }

  function statusBadge(status) {
    const type = status === '승인 완료' || status === '완료' || status === '운영 중' || status === '서명 완료' || status === '시행 중' || status === '정산 완료' || status === '통장 일치' || status === '입금 완료'
      ? 'status-done'
      : status === '검토 중' || status === '서명 중' || status === '확인 필요'
        ? 'status-review'
        : status === '대기' || status === '준비 중' || status === '청구 완료' || status === '입금 대기'
          ? 'status-wait'
          : 'status-progress';
    return `<span class="status-badge ${type}">${status}</span>`;
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setView(view, options = {}) {
    const nextView = views.has(view) ? view : 'dashboard';
    $$('[data-view-panel]').forEach((panel) => {
      const active = panel.dataset.viewPanel === nextView;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === nextView;
      button.classList.toggle('active', active);
      if (button.classList.contains('nav-item')) button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (!options.skipHistory) history.replaceState(null, '', `#${nextView}`);
    window.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  }

  function currentSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    const safeMode = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
    document.documentElement.dataset.theme = safeMode === 'auto' ? currentSystemTheme() : safeMode;
    document.documentElement.dataset.themeMode = safeMode;
    $$('[data-theme-mode]').forEach((button) => button.classList.toggle('active', button.dataset.themeMode === safeMode));
    try { localStorage.setItem('sun-village-lite-theme', safeMode); } catch (_) {}
  }

  function renderScopeGuards() {
    const locked = selectedVillage === 'all';
    ['members', 'accounting', 'approvals', 'governance', 'rules', 'plant-finance'].forEach((view) => {
      const panel = $(`[data-view-panel="${view}"]`);
      if (!panel) return;
      panel.classList.toggle('scope-unselected', locked);
      const label = $('[data-scope-label]', panel);
      const lockMessage = $('[data-scope-lock]', panel);
      const createButton = $('.page-heading [data-demo-action]', panel);
      if (label) label.textContent = locked ? '마을을 선택해야 상세 자료가 열립니다' : `${villages[selectedVillage].name} 자료만 표시 중`;
      if (lockMessage) lockMessage.hidden = !locked;
      if (createButton) {
        createButton.disabled = locked;
        createButton.setAttribute('aria-disabled', locked ? 'true' : 'false');
      }
      $$('[data-scope-village]', panel).forEach((button) => button.classList.toggle('active', button.dataset.scopeVillage === selectedVillage));
    });
  }

  function renderDashboard() {
    const keys = selectedKeys();
    const label = selectedVillage === 'all' ? '관리 중인 마을' : '현재 관리 대상';
    const villageName = selectedVillage === 'all' ? null : villages[selectedVillage].name;
    $('#dashboardDescription').textContent = villageName
      ? `햇살에너지협동조합이 ${villageName}의 오늘 할 일을 확인합니다.`
      : '햇살에너지협동조합이 관리하는 3개 마을의 오늘 할 일을 확인합니다.';
    $('#metricVillageLabel').textContent = label;
    $('#metricVillages').textContent = selectedVillage === 'all' ? `${keys.length}곳` : villages[selectedVillage].short;
    $('#metricVillageNote').textContent = selectedVillage === 'all' ? '운영 2 · 준비 1' : `${villages[selectedVillage].capacity}kW · ${villages[selectedVillage].status}`;
    $('#metricMembers').textContent = `${sumVillage('members')}명`;
    $('#metricMembersNote').textContent = `정조합원 ${sumVillage('fullMembers')}명`;
    $('#metricBalance').textContent = compactWon(sumVillage('balance'));
    const pending = approvals.filter((item) => matchesVillage(item) && (item.status === '대기' || item.status === '검토 중')).length;
    $('#metricPending').textContent = `${pending}건`;
    $('#metricPendingNote').textContent = pending ? '검토가 필요한 문서' : '대기 문서 없음';

    $('#controlRows').innerHTML = keys.map((key) => {
      const village = villages[key];
      const approvalPending = approvals.filter((item) => item.village === key && (item.status === '대기' || item.status === '검토 중')).length;
      const difference = Number(village.reconcileDifference || 0);
      return `<tr><td><strong>${village.name}</strong><small>담당 ${village.manager}</small></td><td>${statusBadge(village.reconcileState)}<small>${difference ? `차이 ${won(difference)}` : '차이 0원'}</small></td><td class="money">${won(village.revenue)}</td><td class="money">${won(village.expense)}</td><td><span class="work-count ${approvalPending ? 'needs-attention' : ''}">${approvalPending}건</span></td><td><span class="work-count ${village.unsigned ? 'needs-attention' : ''}">${village.unsigned}건</span></td><td>${statusBadge(village.feeState)}</td><td><div class="table-actions"><button type="button" data-open-village="${key}" data-open-view="accounting">회계</button><button type="button" data-open-village="${key}" data-open-view="approvals">결재</button></div></td></tr>`;
    }).join('');
    $('#controlCount').textContent = `${keys.length}곳`;

    $('#villageList').innerHTML = keys.map((key) => {
      const village = villages[key];
      return `<button class="village-row ${selectedVillage === key ? 'active' : ''}" type="button" data-select-village="${key}">
        <span class="village-symbol">🌻</span><span class="village-name"><strong>${village.name}</strong><small>${village.capacity}kW · ${village.status}</small></span>
        <span class="village-data"><span>구성원</span><b>${village.members}명</b></span><span class="village-data"><span>통장 잔액</span><b>${compactWon(village.balance)}</b></span><span class="village-data"><span>이번 달 수입</span><b>${compactWon(village.revenue)}</b></span>${statusBadge(village.status)}
      </button>`;
    }).join('');
    $('#villageCount').textContent = `${keys.length}곳`;

    const filteredTasks = tasks.filter(matchesVillage);
    $('#taskList').innerHTML = filteredTasks.length ? filteredTasks.map((task) => `<li><span class="task-priority ${task.type}">${task.priority}</span><div><strong>${villages[task.village].short} · ${task.title}</strong><small>${task.note}</small></div></li>`).join('') : '<li class="empty-state">처리할 업무가 없습니다.</li>';
    $('#taskCount').textContent = `${filteredTasks.length}건`;

    $('#plantRows').innerHTML = keys.map((key) => {
      const village = villages[key];
      return `<tr><td><strong>${village.name}</strong></td><td>${village.capacity}kW</td><td>${village.generation ? `${village.generation.toLocaleString('ko-KR')}kWh` : '상업운전 전'}</td><td class="money">${village.revenue ? won(village.revenue) : '-'}</td><td>${statusBadge(village.status)}</td></tr>`;
    }).join('');

    const filteredRecent = recent.filter(matchesVillage);
    $('#recentList').innerHTML = filteredRecent.map((item) => `<li><span class="recent-icon">${item.icon}</span><div><strong>${villages[item.village].short} · ${item.title}</strong><small>${item.note}</small></div></li>`).join('');
  }

  function renderOperationFees() {
    const contracts = operationContracts.filter(matchesVillage);
    const billings = operationBillings.filter(matchesVillage);
    const active = contracts.filter((item) => item.status === '운영 중').length;
    const billingTotal = billings.reduce((sum, item) => sum + billingAmounts(item).total, 0);
    const receivedTotal = billings.reduce((sum, item) => sum + Number(item.received || 0), 0);
    const overdueTotal = billings.filter((item) => item.status === '연체').reduce((sum, item) => sum + Math.max(0, billingAmounts(item).total - Number(item.received || 0)), 0);

    $('#feeActiveContracts').textContent = `${active}/${contracts.length}건`;
    $('#feeBillingTotal').textContent = won(billingTotal);
    $('#feeReceivedTotal').textContent = won(receivedTotal);
    $('#feeOutstandingTotal').textContent = won(Math.max(0, billingTotal - receivedTotal));
    $('#feeOverdueNote').textContent = `연체 ${won(overdueTotal)}`;
    $('#contractCount').textContent = `${contracts.length}건`;
    $('#contractRows').innerHTML = contracts.length ? contracts.map((item) => `<tr><td><strong>${villages[item.village].name}</strong></td><td>${item.manager}</td><td>${item.start}</td><td class="money"><strong>${won(item.setupFee)}</strong><small>${item.setupState} · VAT 별도</small></td><td class="money"><strong>${won(item.monthlyFee)}</strong><small>${item.monthlyNote}</small></td><td>${item.messagePolicy}</td><td>${item.billingDay}</td><td>${statusBadge(item.status)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty-state">표시할 운영 계약이 없습니다.</td></tr>';
    $('#billingCount').textContent = `${billings.length}건`;
    $('#billingRows').innerHTML = billings.length ? billings.map((item) => {
      const amounts = billingAmounts(item);
      return `<tr><td><strong>${villages[item.village].name}</strong></td><td>${item.kind}</td><td class="money">${won(item.baseAmount)}</td><td class="money">${won(item.messageAmount)}</td><td class="money">${won(amounts.vat)}</td><td class="money">${won(amounts.total)}</td><td>${item.due}</td><td>${statusBadge(item.status)}</td><td><button class="table-link" type="button" data-open-village="${item.village}" data-open-view="accounting">장부 열기</button></td></tr>`;
    }).join('') : '<tr><td colspan="9" class="empty-state">표시할 청구 내역이 없습니다.</td></tr>';
  }

  function renderMembers() {
    if (selectedVillage === 'all') {
      $('#memberRows').innerHTML = '';
      $('#memberCount').textContent = '마을 선택 필요';
      $('#memberTotal').textContent = '-';
      $('#fullMemberTotal').textContent = '-';
      $('#payeeTotal').textContent = '-';
      $('#memberReviewTotal').textContent = '-';
      return;
    }
    const query = ($('#memberSearch')?.value || '').trim().toLowerCase();
    const filtered = members.filter((member) => {
      const statusMatch = memberFilter === 'all' || member.status === memberFilter;
      const text = `${member.name} ${villages[member.village].name} ${member.type} ${member.role} ${member.status}`.toLowerCase();
      return matchesVillage(member) && statusMatch && (!query || text.includes(query));
    });
    $('#memberRows').innerHTML = filtered.length ? filtered.map((member) => `<tr>
      <td><div class="person-cell"><span class="avatar">${member.name.slice(0, 1)}</span><strong>${member.name}</strong></div></td>
      <td>${villages[member.village].short}</td><td><strong>${member.type}</strong><small>${member.role}</small></td><td class="money">${won(member.capital)}</td>
      <td><span class="small-badge ${member.payee ? 'yes' : 'pending'}">${member.payee ? '포함' : '확인 필요'}</span></td><td><span class="small-badge ${member.status === '정조합원' ? 'yes' : 'pending'}">${member.status}</span></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">조건에 맞는 가상 구성원이 없습니다.</td></tr>';
    $('#memberCount').textContent = `${filtered.length}명 표시`;
    $('#memberTotal').textContent = `${sumVillage('members')}명`;
    $('#fullMemberTotal').textContent = `${sumVillage('fullMembers')}명`;
    $('#payeeTotal').textContent = `${sumVillage('payees')}명`;
    $('#memberReviewTotal').textContent = `${sumVillage('review')}명`;
  }

  function renderAccounting() {
    if (selectedVillage === 'all') {
      $('#accountBalance').textContent = '-';
      $('#accountRevenue').textContent = '-';
      $('#accountExpense').textContent = '-';
      $('#reconcileState').textContent = '대기';
      $('#reconcileNote').textContent = '마을 선택 필요';
      $('#ledgerCount').textContent = '마을 선택 필요';
      $('#ledgerRows').innerHTML = '';
      return;
    }
    const rows = ledger.filter(matchesVillage);
    $('#accountBalance').textContent = compactWon(sumVillage('balance'));
    $('#accountRevenue').textContent = compactWon(sumVillage('revenue'));
    $('#accountExpense').textContent = compactWon(sumVillage('expense'));
    const village = villages[selectedVillage];
    $('#reconcileState').textContent = village.reconcileState;
    $('#reconcileNote').textContent = village.reconcileDifference ? `차이 ${won(village.reconcileDifference)}` : '차이 0원';
    $('#ledgerCount').textContent = `${rows.length}건`;
    $('#ledgerRows').innerHTML = rows.map((entry) => `<tr><td>${entry.date}</td><td>${villages[entry.village].short}</td><td><strong>${entry.description}</strong></td><td>${entry.debit}</td><td>${entry.credit}</td><td class="money">${won(entry.amount)}</td><td><span class="small-badge yes">${entry.approval}</span></td></tr>`).join('');
  }

  function renderApprovals() {
    if (selectedVillage === 'all') {
      $('#approvalPending').textContent = '-';
      $('#approvalReview').textContent = '-';
      $('#approvalDone').textContent = '-';
      $('#approvalLinked').textContent = '-';
      $('#approvalCount').textContent = '마을 선택 필요';
      $('#approvalList').innerHTML = '';
      return;
    }
    const rows = approvals.filter(matchesVillage);
    const waiting = rows.filter((item) => item.status === '대기').length;
    const review = rows.filter((item) => item.status === '검토 중').length;
    const done = rows.filter((item) => item.status === '승인 완료').length;
    const linked = rows.filter((item) => item.linked).length;
    $('#approvalPending').textContent = `${waiting}건`;
    $('#approvalReview').textContent = `${review}건`;
    $('#approvalDone').textContent = `${done}건`;
    $('#approvalLinked').textContent = `${linked}건`;
    $('#approvalCount').textContent = `${rows.length}건`;
    $('#approvalList').innerHTML = rows.length ? rows.map((item) => `<article class="approval-item">
      <span class="approval-icon">${item.icon}</span><div class="approval-copy"><small>${villages[item.village].short} · ${item.kind} · ${item.id}</small><strong>${item.title}</strong><p>${item.detail}</p></div>
      <div class="approval-amount"><span>금액</span><strong>${item.amount ? won(item.amount) : '해당 없음'}</strong></div>${statusBadge(item.status)}
    </article>`).join('') : '<div class="empty-state">표시할 결재 문서가 없습니다.</div>';
  }

  function renderMeetingDetail(id) {
    const available = meetings.filter(matchesVillage);
    const meeting = available.find((item) => item.id === id) || available[0];
    activeMeetingId = meeting?.id || null;
    $$('.meeting-item').forEach((button) => button.classList.toggle('active', button.dataset.meetingId === activeMeetingId));
    if (!meeting) {
      $('#meetingDetail').innerHTML = '<div class="empty-state">표시할 회의가 없습니다.</div>';
      return;
    }
    const percent = meeting.signers ? Math.round((meeting.signed / meeting.signers) * 100) : 0;
    $('#meetingDetail').innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">${villages[meeting.village].name}</span><h2>${meeting.title}</h2></div>${statusBadge(meeting.state)}</div>
      <dl class="detail-list"><div><dt>회의 구분</dt><dd>${meeting.type}</dd></div><div><dt>일시·장소</dt><dd>${meeting.date} · ${meeting.place}</dd></div><div><dt>참석 대상</dt><dd>${meeting.target}</dd></div><div><dt>주요 안건</dt><dd>${meeting.agenda}</dd></div><div><dt>의사록 서명 기준</dt><dd>${meeting.signatureRule}</dd></div><div><dt>열람·공개</dt><dd>${meeting.disclosure}</dd></div></dl>
      <div class="signature-box"><div><strong>의사록 전자서명</strong><span>회의 종료 후 지정된 서명자에게 요청합니다.</span></div><div class="signature-progress"><b>${meeting.signed}/${meeting.signers}명</b><div><i style="width:${percent}%"></i></div></div></div>`;
  }

  function renderGovernance() {
    if (selectedVillage === 'all') {
      activeMeetingId = null;
      $('#meetingCount').textContent = '마을 선택 필요';
      $('#meetingList').innerHTML = '';
      $('#meetingDetail').innerHTML = '';
      $('#documentRows').innerHTML = '';
      return;
    }
    const rows = meetings.filter(matchesVillage);
    $('#meetingCount').textContent = `${rows.length}건`;
    $('#meetingList').innerHTML = rows.length ? rows.map((meeting) => `<button type="button" class="meeting-item ${meeting.id === activeMeetingId ? 'active' : ''}" data-meeting-id="${meeting.id}"><time datetime="${meeting.date}"><strong>${meeting.day}</strong><span>${meeting.month}</span></time><div><span class="meeting-type ${meeting.type === '총회' ? 'general' : ''}">${meeting.type}</span><h3>${meeting.title}</h3><p>${villages[meeting.village].short} · ${meeting.place}</p></div><span>›</span></button>`).join('') : '<div class="empty-state">표시할 회의가 없습니다.</div>';
    renderMeetingDetail(activeMeetingId);
    const docs = documents.filter(matchesVillage);
    $('#documentRows').innerHTML = docs.length ? docs.map((doc) => `<tr><td>${villages[doc.village].short}</td><td><strong>${doc.title}</strong></td><td>${doc.date}</td><td>${doc.signature}</td><td>${statusBadge(doc.status)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">표시할 의사록이 없습니다.</td></tr>';
  }

  function renderRules() {
    if (selectedVillage === 'all') {
      $('#ruleCurrentTotal').textContent = '-';
      $('#ruleRevisionTotal').textContent = '-';
      $('#rulePublicTotal').textContent = '-';
      $('#ruleReviewTotal').textContent = '-';
      $('#ruleCount').textContent = '마을 선택 필요';
      $('#ruleRows').innerHTML = '';
      return;
    }
    const rows = rules.filter(matchesVillage);
    const reviewCount = rows.filter((item) => item.status !== '시행 중').length;
    $('#ruleCurrentTotal').textContent = `${rows.filter((item) => item.status === '시행 중').length}건`;
    $('#ruleRevisionTotal').textContent = `${rows.reduce((sum, item) => sum + Number(item.revisions || 0), 0)}회`;
    $('#rulePublicTotal').textContent = `${rows.filter((item) => item.isPublic).length}건`;
    $('#ruleReviewTotal').textContent = `${reviewCount}건`;
    $('#ruleCount').textContent = `${rows.length}건`;
    $('#ruleRows').innerHTML = rows.length ? rows.map((item) => `<tr><td><span class="small-badge ${item.type === '정관' ? 'yes' : 'no'}">${item.type}</span></td><td><strong>${item.title}</strong></td><td>${item.version}</td><td>${item.resolution}</td><td>${item.effective}</td><td>${item.isPublic ? '<span class="small-badge yes">공개</span>' : '<span class="small-badge pending">준비 중</span>'}</td><td>${statusBadge(item.status)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">등록된 가상 문서가 없습니다.</td></tr>';
  }

  function renderPlantFinance() {
    if (selectedVillage === 'all') {
      $('#planSales').textContent = '-';
      $('#planOperating').textContent = '-';
      $('#planLoan').textContent = '-';
      $('#planReserve').textContent = '-';
      $('#plantSettlementState').textContent = '마을 선택 필요';
      $('#plantOperationDetail').innerHTML = '';
      $('#maintenanceAlert').innerHTML = '';
      $('#moneyFlow').innerHTML = '';
      $('#revenueUseCount').textContent = '마을 선택 필요';
      $('#revenueUseRows').innerHTML = '';
      return;
    }
    const village = villages[selectedVillage];
    const plan = plantFinancePlans[selectedVillage];
    const operatingAndTax = plan.operatingCost + plan.tax;
    const reserves = plan.statutoryReserve + plan.repairReserve;
    const availableAfterReserve = Math.max(0, plan.forecastSales - operatingAndTax - plan.loan - reserves);
    $('#planSales').textContent = compactWon(plan.forecastSales);
    $('#planOperating').textContent = compactWon(operatingAndTax);
    $('#planLoan').textContent = compactWon(plan.loan);
    $('#planReserve').textContent = compactWon(reserves);
    $('#plantSettlementState').textContent = plan.settlement;
    $('#plantOperationDetail').innerHTML = `<div><dt>자료 기준</dt><dd>${plan.period}</dd></div><div><dt>설비용량</dt><dd>${village.capacity}kW</dd></div><div><dt>월 발전량</dt><dd>${village.generation ? `${village.generation.toLocaleString('ko-KR')}kWh` : '-'}</dd></div><div><dt>가동률</dt><dd>${plan.availability}</dd></div><div><dt>전력판매 수입</dt><dd>${village.revenue ? won(village.revenue) : '-'}</dd></div><div><dt>장애·중단</dt><dd>${plan.incident}</dd></div><div><dt>다음 점검</dt><dd>${plan.nextInspection}</dd></div><div><dt>정산 상태</dt><dd>${plan.settlement}</dd></div>`;
    $('#maintenanceAlert').innerHTML = `<span>🔧</span><div><strong>유지관리 일정</strong><p>${plan.maintenance}</p></div>`;
    const flowSteps = [
      { label: '예상 판매수입', amount: plan.forecastSales, note: '발전·정산자료' },
      { label: '운영비·세금·대출', amount: operatingAndTax + plan.loan, note: '먼저 반영' },
      { label: '법정·수선 적립금', amount: reserves, note: '총회 의결' },
      { label: '활용·배당·이월', amount: availableAfterReserve, note: '남은 재원' }
    ];
    $('#moneyFlow').innerHTML = flowSteps.map((step, index) => `<div class="money-flow-step"><span>${index + 1}</span><div><small>${step.note}</small><strong>${step.label}</strong><b>${compactWon(step.amount)}</b></div></div>${index < flowSteps.length - 1 ? '<i aria-hidden="true">↓</i>' : ''}`).join('');
    $('#revenueUseCount').textContent = plan.uses.length ? `${plan.uses.length}개 항목` : '상업운전 후 작성';
    $('#revenueUseRows').innerHTML = plan.uses.length ? plan.uses.map((item) => `<tr><td><span class="small-badge ${item.stage === '적립' ? 'yes' : item.stage === '먼저 반영' ? 'pending' : 'no'}">${item.stage}</span></td><td><strong>${item.title}</strong></td><td class="money">${won(item.planned)}</td><td class="money">${won(item.executed)}</td><td class="money">${won(Math.max(0, item.planned - item.executed))}</td><td><strong>${item.decision}</strong><small>${item.status}</small></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">상업운전과 첫 결산자료가 생기면 수익금 활용계획을 작성합니다.</td></tr>';
  }

  function renderAll() {
    renderScopeGuards();
    renderDashboard();
    renderOperationFees();
    renderMembers();
    renderAccounting();
    renderApprovals();
    renderGovernance();
    renderRules();
    renderPlantFinance();
  }

  function setVillage(key, notify = true) {
    selectedVillage = key === 'all' || villages[key] ? key : 'all';
    $('#villageSelect').value = selectedVillage;
    activeMeetingId = null;
    renderAll();
    if (notify) showToast(selectedVillage === 'all' ? '전체 운영 현황으로 돌아갑니다. 상세 업무는 마을을 선택해야 합니다.' : `${villages[selectedVillage].name} 자료만 표시합니다.`);
  }

  function bindEvents() {
    $$('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    $$('[data-view-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); setView(link.dataset.viewLink); }));
    $$('[data-theme-mode]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.themeMode)));
    $('#villageSelect').addEventListener('change', (event) => setVillage(event.target.value));
    $('#memberSearch').addEventListener('input', renderMembers);
    $$('[data-member-filter]').forEach((button) => button.addEventListener('click', () => {
      memberFilter = button.dataset.memberFilter;
      $$('[data-member-filter]').forEach((chip) => chip.classList.toggle('active', chip === button));
      renderMembers();
    }));
    document.addEventListener('click', (event) => {
      const scopeButton = event.target.closest('[data-scope-village]');
      if (scopeButton) setVillage(scopeButton.dataset.scopeVillage);
      const villageButton = event.target.closest('[data-select-village]');
      if (villageButton) setVillage(villageButton.dataset.selectVillage);
      const meetingButton = event.target.closest('[data-meeting-id]');
      if (meetingButton) renderMeetingDetail(meetingButton.dataset.meetingId);
      const openVillageButton = event.target.closest('[data-open-village]');
      if (openVillageButton) {
        const key = openVillageButton.dataset.openVillage;
        const nextView = openVillageButton.dataset.openView || 'dashboard';
        setVillage(key, false);
        setView(nextView);
        showToast(`${villages[key].name}의 ${nextView === 'accounting' ? '회계' : '결재'} 상세 업무를 엽니다.`);
        return;
      }
      const demoAction = event.target.closest('[data-demo-action]');
      if (!demoAction) return;
      const messages = {
        'new-member': '실제 도입 시 가입 신청·출자금 확인·승인 순서로 구성원을 등록합니다.',
        'new-journal': '실제 도입 시 통장 거래를 불러오거나 차변·대변 전표를 직접 입력합니다.',
        'new-approval': '실제 도입 시 지출결의·계약·일반결재 양식 중 하나를 선택합니다.',
        'new-meeting': '실제 도입 시 참석 대상·안건·정관에 맞는 서명자를 지정해 회의를 등록합니다.',
        'new-rule': '실제 도입 시 문서 종류·의결 근거·시행일을 적고 이전 버전을 보존합니다.',
        'new-revenue-plan': '실제 도입 시 판매수입에서 운영비·세금·대출·적립금을 먼저 반영한 뒤 활용계획을 작성합니다.',
        'new-contract': '실제 도입 시 계약 기간·초기 설정비·월 이용료·별도 실비와 청구일을 등록하고 변경 이력을 보존합니다.'
      };
      showToast(messages[demoAction.dataset.demoAction] || '시연용 기능입니다. 실제 도입 범위는 운영협동조합과 협의해 정합니다.');
    });
    window.addEventListener('hashchange', () => setView(location.hash.slice(1), { skipHistory: true, instant: true }));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (document.documentElement.dataset.themeMode === 'auto') applyTheme('auto');
    });
  }

  function init() {
    let savedTheme = 'auto';
    try { savedTheme = localStorage.getItem('sun-village-lite-theme') || 'auto'; } catch (_) {}
    applyTheme(savedTheme);
    bindEvents();
    setVillage('all', false);
    const initial = location.hash.slice(1);
    setView(views.has(initial) ? initial : 'dashboard', { skipHistory: true, instant: true });
  }

  init();
})();
