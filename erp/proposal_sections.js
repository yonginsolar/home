/* Version: v1.4.3 | Preserve proposal copy while refreshing registered director contacts. */
(() => {
  'use strict';
  function renderContacts(doc, m) {
    const contact = doc.querySelectorAll('.slide')[17]?.querySelector('.contact');
    if (!contact) throw new Error('CONTACT_PREVIEW_NOT_READY');
    const orgName = contact.children[0].textContent, address = contact.children[1].textContent;
    const people = [['이사장', '김민정', m.chairPhone], ...(m.visitDirector ? [['이사', m.visitDirector, m.visitDirectorPhone]] : []), ['사무국장', '김민호', m.officePhone]];
    const org = doc.createElement('b'); org.textContent = orgName;
    const location = doc.createElement('span'); location.textContent = address;
    contact.replaceChildren(org, location, ...people.flatMap(([role, name, phone]) => {
      const label = doc.createElement('b'); label.className = 'contact-person-label';
      const roleText = doc.createElement('span'); roleText.className = 'contact-person-role'; roleText.textContent = role + ' ';
      const nameText = doc.createElement('span'); nameText.className = 'contact-person-name'; nameText.textContent = name;
      label.append(roleText, nameText);
      const value = doc.createElement('span'); value.className = 'contact-person-phone'; value.textContent = phone;
      return [label, value];
    }));
    Object.assign(contact.style, { fontSize: '12pt', padding: '14px 22px', marginTop: '16px', gap: '7px 22px' });
  }
  function renderStats(doc, m) {
    const slide = doc.querySelectorAll('.slide')[8];
    if (!slide) throw new Error('STATS_PREVIEW_NOT_READY');
    const put = (selector, text) => {
      const node = slide.querySelector(selector);
      if (!node) throw new Error('STATS_TEMPLATE_MISMATCH');
      node.textContent = text;
      if ('copyBase' in node.dataset) node.dataset.copyBase = text;
    };
    put('.org-band .card:first-child .stat', `${m.memberTotal.toLocaleString('ko-KR')}명`);
    put('.org-band .card:nth-child(2) .stat', `${m.shareCapitalManwon.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}만원`);
    put('.org-band .card:nth-child(3) .stat', `${m.individualMembers.toLocaleString('ko-KR')} + ${m.organizationMembers.toLocaleString('ko-KR')}`);
    put('.org-band .card:nth-child(3) p', `개인 ${m.individualMembers.toLocaleString('ko-KR')}명과 단체 조합원 ${m.organizationMembers.toLocaleString('ko-KR')}곳이 함께합니다.`);
    const source = slide.querySelector('.source');
    const index = source.textContent.indexOf('협의회 참여');
    const context = index >= 0 ? source.textContent.slice(index) : '';
    put('.source', (m.statsAsOf ? `조직 현황 기준일: ${m.statsAsOf} · 홈페이지 공개 집계값 반영. ` : '조직 현황: 제안서 입력값 기준. ') + context);
  }
  function render(doc, m, helpers) {
    const { slideAt, trimNumber, calculateFinance, formatProjectCost, formatApproxManwon } = helpers;
    const page = n => slideAt(doc, n);
    const put = (n, selector, text) => { const node = page(n)?.querySelector(selector); if (node) node.textContent = text; };
    const kw = n => n === null ? '용량 입력 후 산정' : `${trimNumber(n)}kW`;
    const proposed = m.expandedKw;
    const base = m.remainingKw;
    const rangeStart = proposed === null ? null : Math.max(m.expandedMinKw ?? proposed, base ?? 0);
    const range = proposed === null ? '설치 범위 검토 중' : rangeStart === proposed ? kw(proposed) : `${trimNumber(rangeStart)}~${kw(proposed)}`;
    const baseLabel = m.noMandatory ? '기준 설치안' : m.hasExistingInstallation ? '남은 의무용량' : '의무 설치 기준';
    const basis = m.noMandatory ? '의무 설치 없는 자발적 사업입니다.'
      : m.mandatoryKw === null ? '전체 의무용량은 아직 확인 전입니다.'
      : m.hasExistingInstallation ? `전체 의무 ${kw(m.mandatoryKw)} 중 ${kw(m.existingKw)}가 설치되어 남은 의무량은 ${kw(base)}입니다.`
      : m.existingKnown ? `전체 의무용량은 ${kw(m.mandatoryKw)}입니다.`
      : `전체 의무용량은 ${kw(m.mandatoryKw)}이며, 기설치 현황은 조사 중입니다.`;
    const proposal = proposed === null ? '현장 여건에 맞춰 신규 설치 범위를 검토할 것을 제안합니다.'
      : `${range}의 신규 설치를 검토해 이용자 편익과 재생에너지 생산을 함께 높일 것을 제안합니다.`;

    page(4).classList.add('proposal-capacity-summary');
    const styles = doc.createElement('style');
    styles.textContent = `.proposal-capacity-summary h2 { font-size:26pt; margin-bottom:12px; padding-bottom:10px; }
      .proposal-capacity-summary .law-box { min-height:96px; padding:12px; }
      .proposal-capacity-summary .grid-2 .card { padding:14px 18px; }
      .proposal-capacity-summary .grid-2 p { font-size:13pt; line-height:1.4; }
      .proposal-capacity-summary .grid-2 .lead { font-size:15pt !important; line-height:1.4; }
      .proposal-capacity-summary .banner { font-size:14pt; padding:12px 18px; margin-top:12px !important; }
      .proposal-capacity-summary .source { font-size:11.25pt; margin-bottom:0; }
      .proposal-capacity-summary.capacity-two-column .capacity-figures { align-items:stretch !important; }
      .proposal-capacity-summary.capacity-two-column .law-box { min-height:116px; padding:16px 20px; display:flex; flex-direction:column; justify-content:center; gap:6px; }
      .proposal-capacity-summary.capacity-two-column .law-box:last-child { background:var(--sun-soft); border-color:#efcd71; }
      .proposal-capacity-summary.capacity-two-column .big-inline { font-size:32pt; line-height:1.2; }
      .proposal-capacity-summary.capacity-two-column .big-inline.capacity-value-long { font-size:24pt; }
      .proposal-capacity-summary.capacity-two-column .grid-2 { flex:1 0 auto; align-items:stretch; }
      .proposal-capacity-summary.capacity-two-column .grid-2 .card { display:flex; flex-direction:column; justify-content:center; padding:18px 22px; }
      .proposal-capacity-summary.capacity-two-column .grid-2 p { font-size:14pt; line-height:1.45; }
      .proposal-capacity-summary.capacity-two-column .grid-2 .lead { font-size:16pt !important; line-height:1.4; }
      .proposal-capacity-summary.capacity-two-column .source { margin-top:14px; }
      .closing .contact { align-items:baseline; max-width:100%; }
      .closing .contact-person-label { display:grid; grid-template-columns:4em minmax(0,1fr); column-gap:12pt; align-items:baseline; }
      .closing .contact-person-role, .closing .contact-person-name { white-space:nowrap; }
      .closing .contact-person-phone { overflow-wrap:anywhere; }`;
    doc.head.append(styles);

    put(4, 'h2', m.noMandatory ? '시설 여건에 맞는 자발적 설치를 제안합니다'
      : m.mandatoryKw === null ? '필요한 설치 기준과 제안 규모를 함께 검토합니다'
      : proposed === null ? `의무 ${kw(m.mandatoryKw)}를 기준으로, 설치 범위를 검토합니다`
      : `의무 ${kw(m.mandatoryKw)}를 바탕으로, 신규 ${range} 설치를 제안합니다`);
    const formula = page(4).querySelector('.law-box').parentElement;
    formula.classList.add('capacity-figures');
    formula.style.margin = '12px 0 16px';
    const cards = m.noMandatory ? [[baseLabel, kw(base)], ['제안 신규 설치용량', range]]
      : [['전체 의무용량', kw(m.mandatoryKw)],
        ...(m.hasExistingInstallation ? [['기설치 용량', kw(m.existingKw)], ['남은 의무용량', kw(base)]]
          : !m.existingKnown ? [['기설치 현황', '조사 중']] : []),
        ['제안 신규 설치용량', range]];
    page(4).classList.toggle('capacity-two-column', cards.length === 2);
    formula.style.gridTemplateColumns = `repeat(${cards.length}, minmax(0,1fr))`;
    formula.replaceChildren(...cards.map(([label, value]) => {
      const box = doc.createElement('div'); box.className = 'law-box';
      const small = doc.createElement('div'); small.className = 'small'; small.textContent = label;
      const big = doc.createElement('div'); big.className = 'big-inline'; big.textContent = value;
      if (cards.length !== 2) big.style.fontSize = '22pt';
      if (value.length > 14) big.classList.add('capacity-value-long');
      box.append(small, big); return box;
    }));
    put(4, '.grid-2 .card:first-child h3', m.noMandatory ? '시설 이용 목적에 맞는 설치' : '설치 기준');
    put(4, '.grid-2 .card:first-child .lead', basis);
    put(4, '.grid-2 .card:first-child p:last-child', m.noMandatory ? '이용자의 그늘·비가림과 재생에너지 생산을 함께 고려합니다.'
      : m.hasExistingInstallation ? '기존 설비는 유지하고 신규 설치 부분의 범위와 사업비를 검토합니다.' : '의무 이행과 이용자 편익을 함께 고려해 신규 설치 범위를 정합니다.');
    put(4, '.grid-2 .card:nth-child(2) h3', '조합의 설치 제안');
    put(4, '.grid-2 .card:nth-child(2) p', proposal);
    put(4, '.banner', proposed === null ? '실측·배치 검토를 바탕으로 그늘과 발전량을 함께 확보하는 설치안을 제안하겠습니다.' : `신규 ${range} 설치로 더 넓은 그늘과 재생에너지를 제공하는 방안을 제안합니다.`);
    put(4, '.source', '입력한 현황과 검토용량 기준입니다. 최종 용량은 실측·구조·계통 검토와 관계 기관 협의를 거쳐 확정합니다.');
    if (!m.siteProposalNote) put(5, 'h2', proposed === null ? '이용자 편익을 높이는 차양형 설치를 제안합니다' : `신규 ${range} 설치로 그늘과 발전량을 함께 확보하고자 합니다`);
    put(6, '.table th:nth-child(2)', `${baseLabel} · ${kw(base)}`);
    put(6, '.table th:nth-child(3)', `제안 신규 설치안 · ${range}`);
    put(6, '.table tbody tr:first-child td:nth-child(2)', m.noMandatory ? '시설 여건에 맞는 기준 규모' : base === null ? '의무용량과 기설치 현황 조사 후 산정' : base === 0 ? '기존 설비로 의무량 충족' : '의무 이행에 필요한 신규 설비');
    put(6, '.grid-2 .card:first-child p', '기준 규모와 제안 신규 설치안의 이용자 편익·사업비·계통 여건을 함께 검토합니다.');

    const scale = page(13).querySelectorAll('.grid-3 > .card');
    const scaleBasis = m.noMandatory ? '자발적 설치의 기준 규모' : m.hasExistingInstallation ? `의무 ${kw(m.mandatoryKw)} − 기설치 ${kw(m.existingKw)}` : m.existingKnown ? '의무 이행에 필요한 신규 설치 규모' : '의무용량과 기설치 현황 조사 후 산정';
    [[baseLabel, kw(base), scaleBasis], ['제안 신규 설치용량', range, '이번 제안으로 새로 설치할 설비 규모'],
      ['제안 설비 연간 발전량', proposed === null ? '용량 입력 후 산정' : `${trimNumber(proposed * m.sunHours * 365 / 10000)}만kWh`,
        proposed === null ? '제안 신규 용량을 입력하면 계산합니다.' : `${kw(proposed)} × 일평균 ${trimNumber(m.sunHours)}시간 × 365일`]
    ].forEach(([label, value, detail], i) => {
      scale[i].querySelector('.stat-label').textContent = label;
      scale[i].querySelector('.stat').textContent = value;
      scale[i].querySelector('.stat').style.fontSize = value.length > 12 ? '22pt' : '30pt';
      scale[i].querySelector('p').textContent = detail;
    });
    put(13, 'tbody tr:first-child td:first-child', '설치 검토 구역 실측');
    put(13, 'tbody tr:last-child td:last-child', '제안 신규 설비의 총비용·편익 확인');

    // Compute every cell from the same capacities. Never use null as a numeric zero.
    const finance = page(14).querySelector('.financial-compare');
    const financeCards = [...finance.children];
    const single = (base === 0 || (base !== null && proposed === base));
    const scenarios = single ? [[proposed, '제안 신규 설치안']] : [[base, baseLabel], [proposed, '제안 신규 설치안']];
    if (single) { financeCards[1].remove(); finance.style.gridTemplateColumns = '1fr'; finance.style.maxWidth = '820px'; finance.style.margin = '0 auto'; }
    put(14, 'h2', single ? '제안 신규 설치안의 예상 수지를 검토했습니다' : '기준 규모와 제안 신규 설치안의 예상 수지를 비교합니다');
    scenarios.forEach(([capacity, label], i) => {
      const card = financeCards[i]; card.querySelector('h3').textContent = `${label} · ${kw(capacity)}`;
      let values;
      if (capacity === null) values = Array(8).fill('용량 입력 후 산정');
      else {
        const f = calculateFinance(capacity, m);
        values = [formatProjectCost(f.projectCost), `${Math.round(f.annualGeneration).toLocaleString('ko-KR')}kWh`, formatApproxManwon(f.annualRevenue), formatApproxManwon(f.localReturn, '/년'), formatApproxManwon(f.operationReserve, '/년'), formatApproxManwon(f.annualCash), f.payback > 0 ? `약 ${f.payback.toFixed(1)}년` : '산정 불가', `약 ${(f.twentyYearResidual / 100000000).toFixed(2)}억원`];
      }
      card.querySelectorAll('td:nth-child(2)').forEach((cell, row) => { cell.textContent = values[row]; });
    });

    // Change profile positions, not font sizes. Careers were supplied by the
    // cooperative on 2026-09-07; never carry a former person's biography over.
    const profileReplacements = new Map([
      ['신소영 이사', { name: '이수재 이사', careers: ['라현한방병원 총괄본부장', '사회적협동조합 에버그린 이사'] }],
      ['정진화 이사', { name: '이재범 이사', careers: ['사회적협동조합 에버그린 이사'] }]
    ]);
    page(10).querySelectorAll('h3').forEach(node => {
      const profile = profileReplacements.get(node.textContent.trim());
      if (!profile) return;
      node.textContent = profile.name;
      const career = node.closest('.card').querySelector('p');
      career.replaceChildren(...profile.careers.flatMap((text, index) => {
        const line = doc.createElement('span'); line.className = 'career-org'; line.textContent = text;
        return index ? [doc.createElement('br'), line] : [line];
      }));
    });
    const boardNote = [...page(10).querySelectorAll('.note')].find(node => node.textContent.includes('함께하는 이사'));
    if (boardNote) {
      const walker = doc.createTreeWalker(boardNote, 4); const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        node.nodeValue = node.nodeValue.replace(/이수재/g, '신소영').replace(/이재범/g, '정진화');
      });
    }
    const boardSource = page(10).querySelector('.source');
    const sourceWalker = doc.createTreeWalker(boardSource, 4);
    while (sourceWalker.nextNode()) {
      const node = sourceWalker.currentNode;
      node.nodeValue = node.nodeValue.replace('이사 명단과 그 밖의 경력은 2026.09.03 조합 임원 원장 및 보유자료 기준입니다.', '이사 명단과 그 밖의 경력은 조합 임원 원장 및 제공자료 기준입니다(2026.09.07 소개 이력 보완).');
    }
    renderContacts(doc, m);
    renderStats(doc, m);
  }
  window.ProposalSections = Object.freeze({ render, renderStats, renderContacts });
})();
