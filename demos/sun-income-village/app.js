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
  const views = new Set(['dashboard', 'members', 'accounting', 'approvals', 'governance']);
  let selectedVillage = 'all';
  let memberFilter = 'all';
  let activeMeetingId = null;
  let toastTimer = null;

  const villages = {
    gaon: { name: '가온리 햇빛소득마을', short: '가온리', status: '운영 중', capacity: 200, members: 82, fullMembers: 76, payees: 72, review: 6, balance: 76450000, revenue: 7850000, expense: 1280000, generation: 21400 },
    deulkkot: { name: '들꽃리 햇빛소득마을', short: '들꽃리', status: '운영 중', capacity: 150, members: 67, fullMembers: 61, payees: 58, review: 6, balance: 48900000, revenue: 6120000, expense: 660000, generation: 16800 },
    solsaem: { name: '솔샘리 햇빛소득마을', short: '솔샘리', status: '준비 중', capacity: 100, members: 49, fullMembers: 41, payees: 39, review: 8, balance: 26350000, revenue: 0, expense: 4200000, generation: 0 }
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
    { id: 'M-gaon-1', village: 'gaon', type: '이사회', date: '2026-09-08', day: '8', month: '9월', title: '3분기 운영실적과 유지보수비 의결', place: '가온리 마을회관', target: '이사 5명 · 감사 1명', agenda: '발전량·전력판매 수입 보고, 정기점검비 의결', signed: 0, signers: 5, state: '소집 완료' },
    { id: 'M-gaon-2', village: 'gaon', type: '총회', date: '2026-08-22', day: '22', month: '8월', title: '상반기 결산 및 운영보고', place: '가온리 마을회관', target: '정조합원 76명', agenda: '상반기 결산 승인과 운영현황 보고', signed: 4, signers: 4, state: '서명 완료' },
    { id: 'M-deul-1', village: 'deulkkot', type: '이사회', date: '2026-09-12', day: '12', month: '9월', title: '제초관리 계약과 보험료 보고', place: '들꽃리 경로당', target: '이사 4명 · 감사 1명', agenda: '연간 제초계약 업체 선정과 보험 가입 보고', signed: 0, signers: 4, state: '안건 준비' },
    { id: 'M-sol-1', village: 'solsaem', type: '총회', date: '2026-09-20', day: '20', month: '9월', title: '부지 사용협약과 사업계획 의결', place: '솔샘리 마을회관', target: '정조합원 41명', agenda: '부지 사용협약, 사업비와 차입 한도 의결', signed: 0, signers: 4, state: '소집 준비' }
  ];

  const documents = [
    { village: 'gaon', title: '상반기 결산 및 운영보고 총회 의사록', date: '2026.08.22', signature: '4/4', status: '완료' },
    { village: 'deulkkot', title: '제7차 이사회 의사록', date: '2026.08.19', signature: '4/4', status: '완료' },
    { village: 'solsaem', title: '설립준비위원회 회의록', date: '2026.08.15', signature: '3/4', status: '서명 중' }
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

  function statusBadge(status) {
    const type = status === '승인 완료' || status === '완료' || status === '운영 중' || status === '서명 완료'
      ? 'status-done'
      : status === '검토 중' || status === '서명 중'
        ? 'status-review'
        : status === '대기' || status === '준비 중'
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
    ['members', 'accounting', 'approvals', 'governance'].forEach((view) => {
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
    $('#reconcileState').textContent = '완료';
    $('#reconcileNote').textContent = '차이 0원';
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
      <dl class="detail-list"><div><dt>회의 구분</dt><dd>${meeting.type}</dd></div><div><dt>일시·장소</dt><dd>${meeting.date} · ${meeting.place}</dd></div><div><dt>참석 대상</dt><dd>${meeting.target}</dd></div><div><dt>주요 안건</dt><dd>${meeting.agenda}</dd></div></dl>
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

  function renderAll() {
    renderScopeGuards();
    renderDashboard();
    renderMembers();
    renderAccounting();
    renderApprovals();
    renderGovernance();
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
      const demoAction = event.target.closest('[data-demo-action]');
      if (!demoAction) return;
      const messages = {
        'new-member': '실제 도입 시 가입 신청·출자금 확인·승인 순서로 구성원을 등록합니다.',
        'new-journal': '실제 도입 시 통장 거래를 불러오거나 차변·대변 전표를 직접 입력합니다.',
        'new-approval': '실제 도입 시 지출결의·계약·일반결재 양식 중 하나를 선택합니다.',
        'new-meeting': '실제 도입 시 참석 대상·안건·서명자를 지정해 회의를 등록합니다.'
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
