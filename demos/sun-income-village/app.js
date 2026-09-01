(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const views = new Set(['dashboard', 'residents', 'plant', 'finance', 'governance', 'disclosure']);
  let activeView = 'dashboard';
  let toastTimer = null;
  let consentFilter = 'all';

  const residents = [
    { name: '김햇빛', household: '가온 1세대', resident: '충족 · 12년', consent: '동의', member: '정조합원', payee: '포함', note: '확인 완료' },
    { name: '이마을', household: '가온 2세대', resident: '충족 · 8년', consent: '동의', member: '가입 신청', payee: '검토', note: '출자금 확인' },
    { name: '박에너지', household: '가온 3세대', resident: '충족 · 4년', consent: '미확인', member: '비조합원', payee: '검토', note: '전화 연결 안 됨' },
    { name: '최공동', household: '가온 4세대', resident: '충족 · 18년', consent: '동의', member: '정조합원', payee: '포함', note: '세대 대표' },
    { name: '정투명', household: '가온 5세대', resident: '보완 · 10개월', consent: '보류', member: '비조합원', payee: '제외', note: '거주기간 확인' },
    { name: '윤새봄', household: '가온 6세대', resident: '충족 · 2년', consent: '동의', member: '정조합원', payee: '포함', note: '전자 동의' },
    { name: '한그루', household: '가온 7세대', resident: '충족 · 15년', consent: '미확인', member: '비조합원', payee: '검토', note: '방문 예정' },
    { name: '오누리', household: '가온 8세대', resident: '충족 · 6년', consent: '동의', member: '정조합원', payee: '포함', note: '확인 완료' },
    { name: '강바람', household: '가온 9세대', resident: '충족 · 3년', consent: '동의', member: '비조합원', payee: '포함', note: '주민 혜택 대상' },
    { name: '서들녘', household: '가온 10세대', resident: '충족 · 21년', consent: '보류', member: '정조합원', payee: '검토', note: '배분안 설명 요청' }
  ];

  const meetingDetails = {
    briefing: {
      title: '수익 활용 원칙 설명과 의견수렴', status: '자료 준비 중', type: '주민 설명회', date: '2026.09.12 19:00 · 마을회관', target: '기준 주민 175명', agenda: '개인배분·공동복지·적립금 비율 의견수렴'
    },
    board: {
      title: '금융 조건·시공 범위 검토', status: '안건 정리 중', type: '이사회', date: '2026.09.19 18:30 · 조합 사무실', target: '이사 5명 · 감사 열람', agenda: '금융기관 조건과 시공 범위 비교·검토'
    },
    general: {
      title: '사업계획과 차입 한도 의결', status: '소집 준비', type: '임시총회', date: '2026.10.10 14:00 · 마을회관', target: '의결권 있는 조합원', agenda: '사업계획, 예산과 차입금 한도 의결'
    }
  };

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function setView(nextView, options = {}) {
    if (!views.has(nextView)) nextView = 'dashboard';
    activeView = nextView;
    $$('[data-view-panel]').forEach((panel) => {
      const active = panel.dataset.viewPanel === nextView;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === nextView;
      button.classList.toggle('active', active);
      if (button.classList.contains('nav-item')) {
        active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
      }
    });
    if (!options.skipHistory) history.replaceState(null, '', `#${nextView}`);
    window.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  }

  function currentSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    const safeMode = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
    const resolved = safeMode === 'auto' ? currentSystemTheme() : safeMode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = safeMode;
    $$('[data-theme-mode]').forEach((button) => button.classList.toggle('active', button.dataset.themeMode === safeMode));
    try { localStorage.setItem('sun-village-demo-theme', safeMode); } catch (_) {}
  }

  function statusBadge(value, type) {
    return `<span class="small-badge ${type}">${value}</span>`;
  }

  function renderResidents() {
    const query = ($('#residentSearch')?.value || '').trim().toLowerCase();
    const filtered = residents.filter((resident) => {
      const matchesFilter = consentFilter === 'all' || resident.consent === consentFilter;
      const haystack = Object.values(resident).join(' ').toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
    const body = $('#residentRows');
    if (!body) return;
    body.innerHTML = filtered.length ? filtered.map((resident) => {
      const consentType = resident.consent === '동의' ? 'yes' : resident.consent === '미확인' ? 'pending' : 'hold';
      const memberType = resident.member === '정조합원' ? 'yes' : resident.member === '가입 신청' ? 'pending' : 'no';
      const payeeType = resident.payee === '포함' ? 'yes' : resident.payee === '검토' ? 'pending' : 'no';
      return `<tr>
        <td><div class="person-cell"><span class="avatar">${resident.name.slice(0, 1)}</span><strong>${resident.name}</strong></div></td>
        <td>${resident.household}</td><td>${resident.resident}</td>
        <td>${statusBadge(resident.consent, consentType)}</td><td>${statusBadge(resident.member, memberType)}</td>
        <td>${statusBadge(resident.payee, payeeType)}</td><td>${resident.note}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7">조건에 맞는 가상 주민이 없습니다.</td></tr>';
    $('#residentCount').textContent = `${filtered.length}명 표시`;
  }

  function wonLabel(value) {
    return `${Math.round(value / 10000).toLocaleString('ko-KR')}만원`;
  }

  function updateRatios() {
    const fields = $$('[data-ratio]');
    const values = Object.fromEntries(fields.map((field) => [field.dataset.ratio, Math.max(0, Math.min(100, Number(field.value) || 0))]));
    fields.forEach((field) => { field.value = values[field.dataset.ratio]; });
    const total = values.personal + values.welfare + values.reserve;
    const totalBadge = $('#ratioTotal');
    const message = $('#ratioMessage');
    totalBadge.textContent = `합계 ${total}%`;
    const valid = total === 100;
    totalBadge.style.background = valid ? 'var(--green-soft)' : 'var(--orange-soft)';
    totalBadge.style.color = valid ? 'var(--green)' : 'var(--red)';
    message.textContent = valid ? '합계가 100%입니다. 세 방식의 장단점을 비교해 보세요.' : `합계를 100%로 맞춰 주세요. 현재 ${total}%입니다.`;
    message.classList.toggle('valid', valid);
    const amount = 36000000;
    $('#personalAmount').textContent = wonLabel(amount * values.personal / 100);
    $('#welfareAmount').textContent = wonLabel(amount * values.welfare / 100);
    $('#reserveAmount').textContent = wonLabel(amount * values.reserve / 100);
    $('#ratioBar').innerHTML = [
      ['personal', '개인', values.personal], ['welfare', '복지', values.welfare], ['reserve', '적립', values.reserve]
    ].filter(([, , value]) => value > 0).map(([key, label, value]) => `<span class="bar ${key}" style="width:${value}%">${label} ${value}%</span>`).join('');
    $('#ratioBar').setAttribute('aria-label', `개인 ${values.personal}%, 공동복지 ${values.welfare}%, 적립 ${values.reserve}%`);
  }

  function renderMeeting(key) {
    const detail = meetingDetails[key];
    if (!detail) return;
    $$('.meeting-item').forEach((button) => button.classList.toggle('active', button.dataset.meeting === key));
    const panel = $('#meetingDetail');
    panel.innerHTML = `
      <div class="panel-heading"><div><span class="panel-kicker">선택한 회의</span><h2>${detail.title}</h2></div><span class="status-badge status-ready">${detail.status}</span></div>
      <dl class="detail-list"><div><dt>회의 구분</dt><dd>${detail.type}</dd></div><div><dt>일시·장소</dt><dd>${detail.date}</dd></div><div><dt>참석 대상</dt><dd>${detail.target}</dd></div><div><dt>주요 안건</dt><dd>${detail.agenda}</dd></div></dl>
      <div class="document-links"><button type="button" data-demo-action="document">📄 사전 설명자료 <span>작성 중</span></button><button type="button" data-demo-action="document">🗒️ 참석부 <span>자동 생성</span></button><button type="button" data-demo-action="document">✍️ 회의 결과 확인 <span>회의 후</span></button></div>`;
  }

  function updateQuestionProgress() {
    const checks = $$('.question-list input[type="checkbox"]');
    const count = checks.filter((check) => check.checked).length;
    $('#questionProgressBar').style.width = `${(count / checks.length) * 100}%`;
    $('#questionProgressText').textContent = `${count} / ${checks.length} 확인`;
    try { localStorage.setItem('sun-village-demo-questions', JSON.stringify(checks.map((check) => check.checked))); } catch (_) {}
  }

  function restoreQuestions() {
    try {
      const saved = JSON.parse(localStorage.getItem('sun-village-demo-questions') || '[]');
      $$('.question-list input[type="checkbox"]').forEach((check, index) => { check.checked = Boolean(saved[index]); });
    } catch (_) {}
    updateQuestionProgress();
  }

  function openQuestions() {
    const dialog = $('#questionsDialog');
    if (dialog?.showModal) dialog.showModal();
  }

  function bindEvents() {
    $$('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    $$('[data-view-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); setView(link.dataset.viewLink); }));
    $$('[data-theme-mode]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.themeMode)));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (document.documentElement.dataset.themeMode === 'auto') applyTheme('auto');
    });
    $('#openQuestions')?.addEventListener('click', openQuestions);
    $('#openQuestionsSecondary')?.addEventListener('click', openQuestions);
    $$('.question-list input[type="checkbox"]').forEach((check) => check.addEventListener('change', updateQuestionProgress));
    $('#residentSearch')?.addEventListener('input', renderResidents);
    $$('[data-consent-filter]').forEach((button) => button.addEventListener('click', () => {
      consentFilter = button.dataset.consentFilter;
      $$('[data-consent-filter]').forEach((chip) => chip.classList.toggle('active', chip === button));
      renderResidents();
    }));
    $$('[data-ratio]').forEach((field) => field.addEventListener('input', updateRatios));
    $$('[data-ratio-preset]').forEach((button) => button.addEventListener('click', () => {
      const [personal, welfare, reserve] = button.dataset.ratioPreset.split(',');
      $('[data-ratio="personal"]').value = personal;
      $('[data-ratio="welfare"]').value = welfare;
      $('[data-ratio="reserve"]').value = reserve;
      updateRatios();
    }));
    $$('.meeting-item').forEach((button) => button.addEventListener('click', () => renderMeeting(button.dataset.meeting)));
    document.addEventListener('click', (event) => {
      const demoAction = event.target.closest('[data-demo-action]');
      if (!demoAction) return;
      const messages = {
        'add-resident': '실제 구축 시 주민 등록·엑셀 불러오기·중복 확인 흐름을 연결합니다.',
        'add-site': '실제 구축 시 부지 계약·도면·인허가 문서를 함께 등록합니다.',
        'new-meeting': '실제 구축 시 참석 대상과 정족수, 자료·전자서명을 함께 설정합니다.',
        'document': '회의 자리에서 필요한 문서 형식과 공개 범위를 확인할 예정입니다.',
        'documents': '문서함 전체 화면은 기존 조합 모듈을 바탕으로 연결할 수 있습니다.',
        'public-doc': '주민에게 공개할 자료와 조합 내부 원본을 분리하는 예시입니다.',
        'public-question': '문의·이의신청 접수 방식은 현장에서 실제 운영 흐름을 확인합니다.'
      };
      showToast(messages[demoAction.dataset.demoAction] || '시연용 버튼입니다. 현장 의견을 반영해 실제 기능 범위를 정합니다.');
    });
    window.addEventListener('hashchange', () => setView(location.hash.slice(1), { skipHistory: true, instant: true }));
  }

  function init() {
    let savedTheme = 'auto';
    try { savedTheme = localStorage.getItem('sun-village-demo-theme') || 'auto'; } catch (_) {}
    applyTheme(savedTheme);
    renderResidents();
    updateRatios();
    restoreQuestions();
    bindEvents();
    const initial = location.hash.slice(1);
    setView(views.has(initial) ? initial : 'dashboard', { skipHistory: true, instant: true });
  }

  init();
})();
