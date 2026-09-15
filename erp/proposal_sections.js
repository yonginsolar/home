/* Version: v1.6.1 | School constituent wording, wider space review and role-first director names. */
(() => {
  'use strict';
  function renderContacts(doc, m) {
    const contact = doc.querySelector('.slide.closing .contact');
    if (!contact) throw new Error('CONTACT_PREVIEW_NOT_READY');
    const orgName = contact.children[0].textContent, address = contact.children[1].textContent;
    const companions = Array.isArray(m.visitCompanions)
      ? m.visitCompanions.filter((entry) => entry && typeof entry === 'object' && String(entry.name || '').trim()).slice(0, 24)
      : (m.visitDirector ? [{ kind: 'director', name: m.visitDirector, phone: m.visitDirectorPhone }] : []);
    const people = [
      ['이사장', '김민정', m.chairPhone],
      ...companions.map((entry) => [entry.kind === 'director' ? '이사' : '동행', String(entry.name || '').trim(), String(entry.phone || '').trim()]),
      ['사무국장', '김민호', m.officePhone]
    ];
    const org = doc.createElement('b'); org.className = 'contact-org'; org.textContent = orgName;
    const location = doc.createElement('span'); location.className = 'contact-address'; location.textContent = address;
    contact.replaceChildren(org, location, ...people.flatMap(([role, name, phone]) => {
      const label = doc.createElement('b'); label.className = 'contact-person-label';
      const roleText = doc.createElement('span'); roleText.className = 'contact-person-role'; roleText.textContent = role + ' ';
      const nameText = doc.createElement('span'); nameText.className = 'contact-person-name'; nameText.textContent = name;
      label.append(roleText, nameText);
      const value = doc.createElement('span'); value.className = 'contact-person-phone'; value.textContent = phone;
      return [label, value];
    }));
    contact.classList.toggle('contact-many', people.length > 4);
    contact.classList.toggle('contact-crowded', people.length > 8);
    Object.assign(contact.style, {
      fontSize: people.length > 8 ? '11.1pt' : '12pt',
      padding: people.length > 8 ? '9px 14px' : '14px 22px',
      marginTop: people.length > 8 ? '10px' : '16px',
      gap: people.length > 8 ? '4px 14px' : '7px 22px'
    });
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
  function setEmphasis(doc, node, before, emphasis, after = '', { lineBreak = false } = {}) {
    if (!node) return;
    const strong = doc.createElement('strong'); strong.textContent = emphasis;
    const parts = [doc.createTextNode(before)];
    if (lineBreak) parts.push(doc.createElement('br'));
    parts.push(strong);
    if (after) parts.push(doc.createTextNode(after));
    node.replaceChildren(...parts);
  }
  function setList(doc, root, lines) {
    const list = root?.querySelector('ul');
    if (!list) return;
    list.replaceChildren(...lines.map((text) => { const li = doc.createElement('li'); li.textContent = text; return li; }));
  }
  function replaceTable(doc, table, headers, rows) {
    if (!table) return;
    const head = doc.createElement('tr');
    headers.forEach((text) => { const th = doc.createElement('th'); th.textContent = text; head.append(th); });
    table.querySelector('thead').replaceChildren(head);
    table.querySelector('tbody').replaceChildren(...rows.map((values) => {
      const tr = doc.createElement('tr');
      values.forEach((text, index) => {
        const td = doc.createElement('td');
        if (index === 0) { const b = doc.createElement('b'); b.textContent = text; td.append(b); }
        else td.textContent = text;
        tr.append(td);
      });
      return tr;
    }));
  }
  function renderSchoolProposal(doc, m, helpers) {
    const { slideAt, trimNumber, calculateFinance, formatProjectCost, formatApproxManwon } = helpers;
    const page = (n) => slideAt(doc, n);
    const put = (n, selector, text) => { const node = page(n)?.querySelector(selector); if (node) node.textContent = text; };
    const kw = (value) => value === null ? '용량 확인 중' : `${trimNumber(value)}kW`;
    const areaKeys = m.schoolInstallArea === 'both' ? ['roof', 'parking'] : String(m.schoolInstallArea || 'both').split(',');
    const areaLabels = { roof: '옥상', parking: '주차장', stands: '스탠드·관람석', other: m.schoolOtherArea || '기타 유휴공간' };
    const area = [...new Set(areaKeys)].filter((key) => Object.hasOwn(areaLabels, key)).map((key) => areaLabels[key]).join('·') || '학교 유휴공간';
    const publicSchool = m.schoolOwnership === 'public';
    const privateSchool = m.schoolOwnership === 'private';
    const statusKnown = m.schoolPublicProgramStatus !== 'checking';
    const hasSunlinkSchool = m.schoolPublicProgramStatus === 'completed' || m.schoolPublicProgramStatus === 'planned';
    const sunlinkStateText = m.schoolPublicProgramStatus === 'completed' ? '설치된' : '계획된';
    const sunlinkKw = hasSunlinkSchool ? 50 : 0;
    const totalProposed = m.expandedKw;
    const totalRangeStart = totalProposed === null ? null : Math.max(m.expandedMinKw ?? totalProposed, m.remainingKw ?? 0);
    const totalRange = totalProposed === null ? '현장조사 후 산정' : totalRangeStart === totalProposed ? kw(totalProposed) : `${trimNumber(totalRangeStart)}~${kw(totalProposed)}`;
    const proposed = totalProposed === null || !statusKnown ? null : Math.max(totalProposed - sunlinkKw, 0);
    const rangeStart = proposed === null ? null : Math.max((totalRangeStart ?? totalProposed) - sunlinkKw, 0);
    const range = !statusKnown ? '현장자료 확인 후 산정'
      : proposed === null ? '현장조사 후 산정'
      : proposed === 0 ? '추가 가능용량 없음'
      : rangeStart === proposed ? kw(proposed) : `${trimNumber(rangeStart)}~${kw(proposed)}`;

    doc.body.classList.add('school-proposal');
    const style = doc.createElement('style');
    style.textContent = `.school-proposal .school-capacity-figures { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:14px 0 18px; }
      .school-proposal .school-capacity-figures .law-box { min-height:118px; padding:15px 16px; display:flex; flex-direction:column; justify-content:center; }
      .school-proposal .school-capacity-figures .big-inline { font-size:22pt; line-height:1.2; }
      .school-proposal .school-capacity-figures .small:last-child { margin-top:6px; line-height:1.35; }
      .school-proposal .financial-compare { grid-template-columns:1fr; width:100%; max-width:820px; margin:0 auto; }
      .school-proposal .school-source { font-size:11.25pt; line-height:1.45; }
      .school-model .thermo { flex-shrink:0; margin-bottom:12px; }
      .school-model .thermo > div { padding:16px 22px; min-height:0; }
      .school-model .thermo .icon { display:none; }
      .school-model .thermo li { font-size:13.5pt; line-height:1.45; }
      .school-model .grid-4 .card { padding:16px; }
      .school-model .grid-4 p { margin-bottom:0; }
      .school-model .banner { font-size:14pt; line-height:1.4; padding:14px 20px; }
      .school-proposal .school-capacity-figures .big-inline { overflow-wrap:anywhere; }
      .school-site .photo-grid .card { padding:12px 16px; }
      .school-site .photo-grid h3 { font-size:15pt; margin-bottom:7px; }
      .school-site .photo-grid li, .school-site .photo-grid p { font-size:12.5pt; line-height:1.4; }
      .school-partners h2 { font-size:26pt; }
      .school-partnership { position:relative; display:grid; grid-template-columns:minmax(0,1fr) 240px minmax(0,1fr); grid-template-rows:1fr 1fr; gap:14px 28px; margin:4px 0 16px; }
      .school-partnership .partner { position:relative; background:#f1f8f5; border:1px solid #bedbcd; border-radius:14px; padding:13px 17px; }
      .school-partnership .partner-1 { grid-area:1 / 1; } .school-partnership .partner-2 { grid-area:1 / 3; }
      .school-partnership .partner-3 { grid-area:2 / 1; } .school-partnership .partner-4 { grid-area:2 / 3; }
      .school-partnership h3 { font-size:16pt; margin:0 0 5px; }
      .school-partnership p { font-size:12pt; line-height:1.4; margin:0; }
      .school-partnership .partnership-hub { position:relative; grid-area:1 / 2 / 3 / 3; align-self:center; text-align:center; background:var(--green-dark); color:white; border-radius:18px; padding:22px 10px; }
      .school-partnership .partnership-hub h3 { color:white; font-size:16pt; }
      .school-partnership .partnership-hub p { color:#e2f8ec; }
      .school-partnership .partnership-lines { position:absolute; inset:0; width:100%; height:100%; }
      .school-partners .participation-support { margin-top:0; gap:14px; }
      .school-partners .participation-support .card { padding:14px 18px; }
      .school-partners .participation-support h3 { font-size:16pt; }
      .school-partners .participation-support p { font-size:12pt; line-height:1.5; margin:0; }
      .school-partners .note { font-size:11.25pt; line-height:1.45; padding:11px 16px; }
      .school-proposal .benefit-note { font-size:11.25pt; line-height:1.45; }
      .school-proposal .benefit-examples { margin-top:4px; margin-bottom:10px; }
      .school-proposal .benefit-banner { font-size:14pt; }
      .school-finance h2 { font-size:26pt; margin-bottom:10px; }
      .school-finance .frame { padding-top:36px; }
      .school-finance .finance-formula { margin-bottom:10px; }
      .school-finance-benefits { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:12px; }
      .school-finance-benefits > div { padding:10px 16px; border-radius:10px; background:var(--green-soft); }
      .school-finance-benefits h3 { font-size:13pt; margin:0 0 3px; }
      .school-finance-benefits p { font-size:12pt; margin:0; }
      .school-finance .financial-compare .card { padding:10px 18px; }
      .school-finance .financial-compare td { padding:5px 9px; font-size:11.25pt; }
      .school-contract h2 { font-size:25pt; margin-bottom:14px; }
      .school-contract .grid-2 { gap:14px; }
      .school-contract .grid-2 .card { padding:14px 18px; }
      .school-contract h3 { font-size:16pt; }
      .school-contract p { font-size:12pt; line-height:1.45; margin-bottom:0; }
      .school-policy { margin-top:18px; }
      .school-policy .contract-callout { margin:0; padding:24px; }
      .school-policy .contract-callout p { font-size:14pt; line-height:1.6; }
      .school-contract .grid-2 { flex:1; align-items:stretch; }
      .school-contract .grid-2 .card { display:flex; flex-direction:column; justify-content:center; }
      .school-policy-source .frame { align-items:center; padding:30px 48px 36px; }
      .school-policy-source .eyebrow { width:980px; max-width:100%; margin-bottom:8px; }
      .school-policy-source .policy-evidence { width:980px; max-width:100%; margin:0; }
      .school-policy-source img { display:block; width:100%; height:auto; }
      .school-policy-source .policy-body { margin-top:12px; }
      .school-policy-source figcaption { font-size:11.25pt; line-height:1.4; color:var(--muted); margin-top:12px; }
      .school-contract .note { font-size:11.25pt; line-height:1.45; padding:11px 16px; margin-top:14px !important; }
      .school-contract .source { font-size:11.25pt; margin-top:10px; }
      .school-closing .frame { justify-content:center; }
      .school-closing .logo-coop { height:42px; margin-bottom:12px !important; }
      .school-closing h2 { font-size:25pt; margin-bottom:10px; }
      .school-closing .lead { font-size:14pt; line-height:1.4; max-width:none !important; margin-bottom:12px !important; }
      .school-closing-grid { width:100%; display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px; text-align:left; }
      .school-closing-grid .card { padding:13px 18px; background:var(--green-soft); }
      .school-closing-grid .card:last-child { background:var(--sun-soft); }
      .school-closing-grid h3 { font-size:16pt; margin-bottom:6px; }
      .school-closing-grid ul { padding-left:20px; margin:0; }
      .school-closing-grid li { font-size:12pt; line-height:1.4; margin:4px 0; }
      .school-closing .frame > a.card { width:100% !important; padding:8px 16px !important; }
      .school-closing .frame > a.card b { font-size:13pt !important; }
      .school-closing .frame > a.card span { font-size:11.25pt !important; }
      .school-closing .contact { width:100%; margin-top:12px !important; }
      .school-closing .contact.contact-crowded { grid-template-columns:repeat(3,minmax(0,1.2fr) minmax(0,1fr)); }
      .school-closing:has(.contact-crowded) .logo-coop { display:none; }
      .school-closing:has(.contact-crowded) h2 { font-size:22pt; }
      .school-closing:has(.contact-crowded) .school-closing-grid { margin-bottom:8px; }
      .school-closing:has(.contact-crowded) .contact { padding:8px 12px !important; gap:4px 10px !important; }
      .school-proposal .source, .school-proposal .note, .school-proposal .version { font-size:11.25pt; }
      @media print { .school-proposal .frame { padding:32px 48px 36px; } }
      `;
    doc.head.append(style);

    put(1, '.cover-kicker', '학교 설치비 부담 없이 · 학교 환원 · 에너지교육');
    const coverTitle = page(1).querySelector('h1');
    coverTitle.replaceChildren(doc.createTextNode('학교의 햇빛을'), doc.createElement('br'));
    const coverSpan = doc.createElement('span'); coverSpan.textContent = '학생을 위한 자원으로'; coverTitle.append(coverSpan);
    put(1, '.subtitle', `${m.facilityName} 태양광 발전사업 제안서`);

    put(2, '.eyebrow', 'BENEFITS FOR THE SCHOOL');
    setEmphasis(doc, page(2).querySelector('h2'), '설치비 부담 없이, ', '학교에 돌아오는 혜택을 제안합니다', '', { lineBreak: true });
    put(2, '.lead', `${m.facilityName}의 ${area} 등 유휴공간을 활용하고, 발전수익 일부를 학생과 학교를 위해 사용하는 태양광 발전사업을 제안합니다.`);
    const p2cards = [...page(2).querySelectorAll('.grid-3 .card')];
    [['학교 설치비 부담 없음', '조합이 사업비를 조달하고 설계·공사를 추진합니다. 학교에 발전소 설치 공사비를 요청하지 않는 방식입니다.'],
      ['학생과 학교를 위한 환원', '발전수익 일부를 학교에 환원해 교육·학생 활동 등 학교 구성원들이 필요로 하는 분야를 지원하는 방안을 협의합니다.'],
      ['수업으로 이어지는 발전소', '발전자료와 태양광 원리를 교과·동아리·체험활동에 활용하도록 조합과 지역 활동가가 교육을 함께 기획합니다.']
    ].forEach(([title, body], index) => { p2cards[index].querySelector('h3').textContent = title; p2cards[index].querySelector('p').textContent = body; });
    put(2, '.banner', '학교는 공간 활용을 협의하고, 조합은 사업비 조달과 운영을 맡아 발전의 성과를 학교와 나누는 방식입니다.');
    put(2, '.source', '제안 용량과 배치는 구조·방수·안전·교육활동·계통 조건을 확인한 뒤 학교와 함께 확정합니다.');

    page(3).classList.add('school-site');
    setEmphasis(doc, page(3).querySelector('h2'), '대상지와 ', '설치 후보 공간');

    put(4, '.eyebrow', 'SCHOOL SOLAR PLAN');
    setEmphasis(doc, page(4).querySelector('h2'), '교육활동을 지키면서 ', '학교 공간의 발전 가능성을 살핍니다');
    const figures = page(4).querySelector('.capacity-figures');
    figures.className = 'school-capacity-figures';
    figures.style.gridTemplateColumns = 'repeat(3, minmax(0,1fr))';
    const boxes = [
      ['설치 검토 공간', '옥상·주차장·스탠드 등', '안전·교육활동·시설계획을 고려해 다양한 공간 검토'],
      ['학교 전체 활용 가능용량', totalRange, `${area} 실측·배치 기준`],
      ['시민참여형 신규 발전', range, hasSunlinkSchool ? '확인된 기존·계획 설비를 반영한 신규 규모' : m.schoolPublicProgramStatus === 'none' ? '전체 활용 가능용량을 반영한 규모' : '현장자료 확인 뒤 확정']
    ];
    figures.replaceChildren(...boxes.map(([label, value, detail], index) => {
      const box = doc.createElement('div'); box.className = `law-box${index === 2 ? ' sunny' : ''}`;
      const small = doc.createElement('div'); small.className = 'small'; small.textContent = label;
      const big = doc.createElement('div'); big.className = 'big-inline'; big.textContent = value;
      if (index === 0) big.style.fontSize = value.length > 22 ? '14pt' : '18pt';
      const note = doc.createElement('div'); note.className = 'small'; note.textContent = detail;
      box.append(small, big, note); return box;
    }));
    put(4, '.grid-2 .card:first-child h3', '배치의 우선순위');
    put(4, '.grid-2 .card:first-child .lead', '교육활동과 학생 안전에 필요한 공간을 먼저 보호합니다.');
    put(4, '.grid-2 .card:first-child p:last-child', '통학·소방·유지관리 동선과 기존·계획 설비를 반영하고, 실제 발전에 쓸 수 있는 공간을 후보지로 조사합니다.');
    put(4, '.grid-2 .card:nth-child(2) h3', '용량을 정하는 방법');
    put(4, '.grid-2 .card:nth-child(2) p', hasSunlinkSchool ? `학교 전체 활용 가능용량에서 확인된 기존·계획 설비를 제외하고, ${area}의 실제 배치로 시민발전 용량을 산정합니다.` : m.schoolPublicProgramStatus === 'none' ? `${area}에서 통학·소방·유지관리 공간을 제외한 전체 활용 가능용량을 시민발전 규모로 산정합니다.` : `${area}의 기존·계획 설비와 실제 배치를 확인한 뒤 시민발전 용량을 산정합니다.`);
    put(4, '.banner', hasSunlinkSchool ? `확인된 설비계획과 겹치지 않는 ${range}를 시민발전 규모로 제안합니다.` : m.schoolPublicProgramStatus === 'none' ? `활용 가능한 ${area} 전체를 조사해 ${totalRange} 규모의 시민발전을 제안합니다.` : '활용 가능한 공간을 빠짐없이 조사해 학교에 맞는 시민발전 규모를 제안합니다.');
    put(4, '.source', '입력한 용량은 제안 준비용입니다. 학교 전력·시설자료, 구조·방수·안전·계통 검토 후 최종 확정합니다.');

    page(5).classList.add('school-model');
    put(5, '.eyebrow', 'SPACE & OPERATION');
    setEmphasis(doc, page(5).querySelector('h2'), '공간은 더 유용하게, ', '운영 부담은 더 적게');
    const halves = [...page(5).querySelectorAll('.thermo > div')];
    halves[0].querySelector('h3').textContent = '학교 공간을 충분히 활용하면';
    setList(doc, halves[0], [`${area}의 실제 활용 가능 공간을 함께 살핍니다.`, '구조·안전 여건이 허용하는 범위에서 학교 전체의 발전 가능성을 검토합니다.', '주차장·스탠드 상부에 설치하면 그늘·비가림 효과도 함께 기대할 수 있습니다.']);
    halves[1].querySelector('h3').textContent = '조합이 운영을 맡으면';
    setList(doc, halves[1], ['조합이 사업비를 조달하고 전문업체와 공사·점검·보수를 관리합니다.', '전력을 별도로 계량·판매해 학사일정과 관계없이 발전사업을 운영합니다.', '발전자료는 교육에, 수익 일부는 학교와 협의한 환원사업에 연결합니다.']);
    const p5cards = [...page(5).querySelectorAll('.grid-4 .card')];
    [['공간 활용', '학생 활동과 기존 설비를 존중해 설치 후보 구역을 정합니다.'], ['공사비 조달', '학교 설치비 부담 없이 조합이 재원을 마련합니다.'], ['전문 유지관리', '점검·보수·사고 대응의 담당과 책임을 정합니다.'], ['학교 환원·교육', '학교에 필요한 지원과 교육 내용을 함께 정합니다.']]
      .forEach(([title, body], index) => { p5cards[index].querySelector('h3').textContent = title; p5cards[index].querySelector('p').textContent = body; });
    put(5, '.banner', m.siteProposalNote || '학교의 유휴공간을 활용하되, 교육활동과 안전을 지키고 학교에 도움이 되는 운영을 제안합니다.');

    put(6, '.eyebrow', 'ENERGY EDUCATION');
    setEmphasis(doc, page(6).querySelector('h2'), '설치로 끝나지 않고 ', '학생이 보고 배우는 발전소로 운영합니다');
    replaceTable(doc, page(6).querySelector('.table'), ['교육 영역', '학교에서 활용하는 방법', '조합이 지원하는 내용'], [
      ['발전자료', '일·월별 발전량과 날씨를 비교하고 그래프로 표현', '이해하기 쉬운 발전자료와 설명 제공'],
      ['교과 연계', '과학·수학·환경·사회 수업의 실제 사례로 활용', '태양광 원리와 지역 에너지전환 자료 지원'],
      ['체험 교육', '학생 눈높이에 맞춘 기후·에너지 체험활동', '학교와 협의한 강의·활동 진행'],
      ['동아리 활동', '학교 에너지 사용과 탄소감축 효과 조사', '조사 방법과 결과 공유 지원'],
      ['협동조합 연계', '학교·지역 협동조합과 공동 교육 기획', '학교협동조합의 교육서비스 제공·공동 운영 협의']
    ]);
    put(6, '.grid-2 .card:first-child h3', '운영 제안');
    put(6, '.grid-2 .card:first-child p', '연 1~2회 교육을 기본 예시로 제안하되 대상 학년·횟수·시간은 학교 교육과정과 일정에 맞춰 협의합니다.');
    put(6, '.grid-2 .card:nth-child(2) h3', '학생 안전 원칙');
    put(6, '.grid-2 .card:nth-child(2) p', '발전자료와 안전한 체험도구를 활용하며, 학생이 전기설비나 통제구역에 직접 접근하지 않도록 합니다.');

    page(7).classList.add('school-partners');
    put(7, '.eyebrow', 'SCHOOL PARTNERSHIP');
    put(7, 'h2', '네 주체가 각자의 역할로 학교 발전소를 함께 운영합니다');
    const partnership = page(7).querySelector('.flow');
    partnership.className = 'school-partnership';
    const hub = doc.createElement('div'); hub.className = 'partnership-hub';
    const hubTitle = doc.createElement('h3'); hubTitle.textContent = '학교 태양광 발전사업';
    const hubText = doc.createElement('p'); hubText.textContent = '학교 혜택 · 안전 · 교육';
    hub.append(hubTitle, hubText);
    const partners = [['학교', '공간 활용과 교육 연계, 학생 안전·학교 일정 협의'], ['용인모두의햇빛협동조합', '사업비 조달, 사업 추진, 운영·환원 관리'], ['전문 시공·운영 업체', '설계·시공·검사, 보험·점검·보수'], ['학교·지역 공동체', '학생·학부모·주민 의견 수렴, 교육 협력과 희망자 참여']];
    const lines = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('viewBox', '0 0 1000 200'); lines.setAttribute('preserveAspectRatio', 'none');
    lines.setAttribute('class', 'partnership-lines'); lines.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 270 40 L 500 100 L 730 40 M 270 160 L 500 100 L 730 160');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#93bfa8'); path.setAttribute('stroke-width', '3');
    lines.append(path);
    partnership.replaceChildren(lines, hub, ...partners.map(([title, body], index) => {
      const card = doc.createElement('div'); card.className = `partner partner-${index + 1}`;
      const h3 = doc.createElement('h3'); h3.textContent = title;
      const p = doc.createElement('p'); p.textContent = body; card.append(h3, p); return card;
    }));
    put(7, '.participation-support .card:first-child h3', '학교협동조합의 참여도 협의할 수 있습니다');
    put(7, '.participation-support .card:first-child p', '학교협동조합이 있는 경우 발전사업 참여 또는 에너지교육 제공·공동 운영 등 역할을 학교 및 해당 조합과 협의할 수 있습니다. 별도 조합 설립을 전제로 하지 않습니다.');
    put(7, '.participation-support .card:nth-child(2) h3', '학생과 학부모도 조합원으로 함께합니다');
    put(7, '.participation-support .card:nth-child(2) p', '학생과 학부모도 조합원으로 참여할 수 있습니다. 미성년자는 법정대리인의 동의 등 필요한 절차를 거쳐 가입·출자하고, 조합의 정관과 배당 의결에 따라 사업의 성과를 함께 나눌 수 있습니다. 교육 참여는 가입·출자 여부와 관계없이 열려 있습니다.');
    put(7, '.note.warning', '설명회가 필요하면 조합이 사업 구조·안전·학교 환원을 설명하고 질문에 답하겠습니다. 학교의 공식 의사결정과 학생·학부모·지역의 의견수렴을 존중합니다.');

    put(8, '.eyebrow', 'RETURNS FOR STUDENTS & SCHOOL');
    put(8, 'h2', '발전수익 일부를 학생과 학교를 위해 활용합니다');
    put(8, '.lead', '학교에 대한 환원을 우선으로, 교육·동아리 등 학생 활동과 학교가 필요로 하는 지원에 발전의 성과를 연결하는 방안을 제안합니다.');
    const benefitSteps = [...page(8).querySelectorAll('.flow .step')];
    [['학교 필요 확인', '학생·학교에 도움이 되는 지원 분야를 함께 정합니다.'], ['재원·방식 합의', '환원 비율·배분·사용 방식과 시기를 협약에 담습니다.'], ['학교 지원 실행', '합의한 방식으로 학교 환원 또는 교육사업을 지원합니다.'], ['결과 공유', '사용액과 성과를 학교와 투명하게 공유합니다.']]
      .forEach(([title, body], index) => { benefitSteps[index].querySelector('h3').textContent = title; benefitSteps[index].querySelector('p').textContent = body; });
    const examples = [...page(8).querySelectorAll('.benefit-examples .card')];
    [['학교에 필요한 지원', '학교와 협의한 교육환경·학생 활동 지원에 활용합니다.'], ['학생의 배움과 실천', '에너지·기후교육, 환경동아리와 탐구 활동을 지원합니다.'], ['학교와 함께 결정', '학교의 우선순위를 듣고 환원 분야와 결과 공유 방식을 정합니다.']]
      .forEach(([title, body], index) => { examples[index].querySelector('h3').textContent = title; examples[index].querySelector('p').textContent = body; });
    page(8).querySelector('.lead').after(page(8).querySelector('.benefit-examples'));
    put(8, '.benefit-banner', '학교의 공간에서 얻은 발전의 성과가 학생과 학교에 돌아오도록 제안합니다.');
    put(8, '.benefit-note', `환원 재원은 매출의 ${trimNumber(m.returnPct)}%로 가정합니다. 이 재원 안에서 학교 우선 배분과 지역사업 몫을 협의합니다. 부지 사용료와는 구분하며, 학교회계 수입 또는 교육사업 지원 등 집행 방식은 적용 규정·협약으로 정합니다.`);

    put(11, 'h2', '발전자료와 운영정보를 교육과 신뢰의 기반으로 공개합니다');
    put(11, '.screen-head', `${m.facilityName} 시민햇빛발전소 · 운영 공개 화면 예시`);
    put(11, '.card.sunny h3', '교육과 공공성');
    setList(doc, page(11).querySelector('.card.sunny'), ['수입·비용·적립·환원 구분', '학생이 이해할 수 있는 발전·탄소감축 자료', '학교·지역사회에 점검과 운영 결과 공유']);
    put(11, '.note', '화면 수치는 디자인 예시이며 실제 발전량이 아닙니다. 공개 범위와 교육자료 제공 방식은 학교와 협의합니다.');

    put(12, 'h2', '학교 수업과 시설을 지키는 안전·유지관리 기준');
    const safety = [...page(12).querySelectorAll('.safety-grid .card')];
    [['구조·방수·관람석', '옥상·차양 하중과 방수, 스탠드 이용자의 머리 위 안전을 검토하고 누수·보수 책임을 정합니다.'], ['통학·공사 동선', '학생 이동, 소방 진입, 공사차량과 자재 적치 구역을 분리합니다.'], ['학교 일정', '시험·행사·수업을 피해 방학 등 학교와 합의한 기간에 공사합니다.'], ['전기 안전', '접지·차단·케이블 보호·표지와 사용전검사를 거쳐 접근을 통제합니다.'], ['보험·사고 대응', '공사·운영 보험, 비상연락망과 사고 발생 시 책임·조치 절차를 정합니다.'], ['시설 보수·원상복구', '학교 시설공사 때 설비 이동·재설치와 계약 종료 후 철거·복구 책임을 정합니다.']]
      .forEach(([title, body], index) => { safety[index].querySelector('h3').textContent = title; safety[index].querySelector('p').textContent = body; });
    let safetyNote = page(12).querySelector('.note.warning');
    if (!safetyNote) {
      safetyNote = doc.createElement('div'); safetyNote.className = 'note warning'; safetyNote.style.marginTop = '16px';
      page(12).querySelector('.safety-grid').after(safetyNote);
    }
    safetyNote.textContent = '기존·계획 설비가 있다면 시민발전 설비와 구역·계량점·소유·운영 책임을 구분하고, 안전·유지관리 계획을 도면과 협약으로 정합니다.';

    put(13, 'h2', '학교 공간의 설치 규모와 예상 발전량을 확인합니다');
    const scale = [...page(13).querySelectorAll('.grid-3 > .card')];
    [['학교 전체 활용 가능용량', totalRange, `${area} 현장조사와 배치 검토 기준`], ['시민발전 신규 제안', range, hasSunlinkSchool ? '기존·계획 설비와 겹치지 않는 신규 규모' : m.schoolPublicProgramStatus === 'none' ? `${area} 전체 활용 가능용량` : '기존·계획 설비 확인 뒤 계산'], ['시민발전 연간 발전량', proposed === null ? '용량 확인 후 산정' : proposed === 0 ? '추가 발전 없음' : `${trimNumber(proposed * m.sunHours * 365 / 10000)}만kWh`, proposed === null ? '현장자료와 전체 가능용량을 확인하면 계산합니다.' : proposed === 0 ? '확인된 설비를 반영하면 추가 가능용량이 없습니다.' : `${kw(proposed)} × 일평균 ${trimNumber(m.sunHours)}시간 × 365일`]]
      .forEach(([label, value, detail], index) => { scale[index].querySelector('.stat-label').textContent = label; scale[index].querySelector('.stat').textContent = value; scale[index].querySelector('.stat').style.fontSize = value.length > 14 ? '20pt' : '28pt'; scale[index].querySelector('p').textContent = detail; });
    replaceTable(doc, page(13).querySelector('.table'), ['확정 전 확인', '확인 이유', '결과에 따른 조정'], [
      [`${area} 실측`, '교육활동·통학·소방·유지관리 공간을 제외해야 함', '시민발전 배치와 신규 용량 확정'],
      ['기존·계획 설비 자료', '이미 사용하거나 계획된 구역과 용량 확인', '겹치지 않는 시민발전 공간 확정'],
      ['구조·방수·시설계획', '하중·누수·관람석 안전과 예정된 시설공사 확인', '공법·공사 시기·이동 책임 조정'],
      ['한전 계통·실견적', '접속 가능 용량과 공사비가 수지에 영향', '용량·재원·일정 최종 조정']
    ]);
    put(13, '.note.warning', '학교 설치 공사비 부담 없음: 조합이 사업비를 조달하고 금융조건·사업성을 검토합니다. 학교는 공간 활용과 필요한 절차를 협의하며, 공사·운영·철거 등 사업 책임은 계약으로 정합니다.');

    page(14).classList.add('school-finance');
    put(14, 'h2', '조합이 투자하고, 학교와 발전의 성과를 나눕니다');
    const finance = page(14).querySelector('.financial-compare');
    const financeCards = [...finance.children];
    financeCards.slice(1).forEach((card) => card.remove());
    finance.style.gridTemplateColumns = '1fr'; finance.style.maxWidth = '820px'; finance.style.margin = '0 auto';
    const financeCard = financeCards[0]; financeCard.querySelector('h3').textContent = proposed !== null && proposed > 0 ? `시민발전 신규 설치안 · ${kw(proposed)} 기준` : `시민발전 신규 설치안 · ${range}`;
    let values = Array(8).fill(statusKnown ? '용량 입력 후 산정' : '현장자료 확인 후 산정');
    if (proposed !== null && proposed > 0) {
      const result = calculateFinance(proposed, m);
      values = [formatProjectCost(result.projectCost), `${Math.round(result.annualGeneration).toLocaleString('ko-KR')}kWh`, formatApproxManwon(result.annualRevenue), formatApproxManwon(result.localReturn, '/년'), formatApproxManwon(result.operationReserve, '/년'), formatApproxManwon(result.annualCash), result.payback > 0 ? `약 ${result.payback.toFixed(1)}년` : '산정 불가', `약 ${(result.twentyYearResidual / 100000000).toFixed(2)}억원`];
    }
    financeCard.querySelectorAll('td:nth-child(2)').forEach((cell, index) => { cell.textContent = values[index]; });
    const financeBand = doc.createElement('div'); financeBand.className = 'school-finance-benefits';
    [['학교 설치 공사비', '부담 없음 · 조합 조달'], ['학교 환원·교육', '배분·사용 방식 협의'], ['부지 사용료', '환원과 별도로 협의']].forEach(([title, body]) => {
      const card = doc.createElement('div'); const h3 = doc.createElement('h3'); h3.textContent = title;
      const p = doc.createElement('p'); p.textContent = body; card.append(h3, p); financeBand.append(card);
    });
    finance.before(financeBand);
    financeCard.querySelector('tbody tr:nth-child(4) td:first-child').textContent = `환원 재원 · 매출 ${trimNumber(m.returnPct)}%`;
    put(14, '.note.warning', `조합 사업수지 예시입니다. 사업비 ${trimNumber(m.unitCostManwon)}만원/kW를 가정하며 금융비용·세금·부지사용료·계통보강비·부가세 전입니다. 구조·공법·실견적으로 다시 검토합니다. 환원 재원 안에서 학교 배분을 정하며, 전력 판매형이므로 학교 전기요금 절감액으로 계산하지 않습니다.`);
    put(14, '.source', '계산 기준: 입력한 발전시간·판매단가와 운영·환원 비율을 사용합니다. 20년 수지에는 연 0.5%의 발전량 저하를 반영했습니다.');

    page(15).classList.add('school-contract');
    put(15, '.eyebrow', 'SCHOOL AGREEMENT & POLICY');
    setEmphasis(doc, page(15).querySelector('h2'), publicSchool ? '공립학교의 절차에 맞춰 ' : privateSchool ? '사립학교의 절차에 맞춰 ' : '학교 여건과 절차에 맞춰 ', '함께 추진할 조건을 정합니다');
    put(15, '.grid-2 .card:first-child h3', publicSchool ? '공립학교 시설 사용 협의' : privateSchool ? '학교·학교법인의 권한 확인' : '시설의 소유·관리 권한 확인');
    put(15, '.grid-2 .card:first-child p', publicSchool
      ? `${m.facilityName}는 공립학교입니다. 먼저 학교와 활용 공간·교육·안전을 협의하고, 공유재산 사용의 허가·계약 권한과 위임 범위를 확인해 필요한 절차를 진행합니다.`
      : privateSchool ? '먼저 학교와 활용 공간·교육·안전을 협의합니다. 학교와 학교법인의 재산 관리·계약 권한을 확인하고 필요한 절차에 따라 추진합니다.'
      : '먼저 학교와 활용 공간·교육·안전을 협의합니다. 학교의 설립 구분과 시설 소유·관리 및 계약 권한을 확인해 적용 절차를 정합니다.');
    put(15, '.grid-2 .card:nth-child(2) h3', '협약으로 분명히 할 내용');
    put(15, '.grid-2 .card:nth-child(2) p', '사용기간·사용료, 학교 환원, 교육 협력, 공사 일정과 출입, 보험·점검·보수, 시설공사 때 이동·재설치, 계약 종료 후 철거·원상복구 책임을 정합니다.');
    const policyUrl = 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105428&lev=0&m=020402&opType=N&s=moe&statusYN=W';
    const policy = doc.createElement('div'); policy.className = 'school-policy';
    const evidence = doc.createElement('figure'); evidence.className = 'policy-evidence';
    const link = doc.createElement('a'); link.href = policyUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const image = doc.createElement('img'); image.src = 'proposal_assets/moe-school-solar-20260226-heading.png';
    image.alt = '교육부 보도자료 제목: 학교 태양광, 탄소중립과 생태전환교육을 잇다'; link.append(image);
    const bodyImage = doc.createElement('img'); bodyImage.className = 'policy-body';
    bodyImage.src = 'proposal_assets/moe-school-solar-20260226-body.png';
    bodyImage.alt = '교육부 실제 보도자료 본문 발췌: 학교 태양광 확대와 생태전환교육 연계, 2026년 시범사업의 자가소비 설비 계획';
    const caption = doc.createElement('figcaption'); caption.textContent = '출처: 교육부(www.moe.go.kr), 2026.02.26 보도자료 · 제목과 본문 일부 발췌 · 공공누리 제1유형';
    evidence.append(link, bodyImage, caption);
    const comparison = page(15).querySelector('.contract-callout');
    comparison.querySelector('h3').textContent = '공공예산 사업과 조합 제안의 차이';
    comparison.querySelector('p').textContent = hasSunlinkSchool
      ? `햇빛이음학교로 ${sunlinkStateText} 약 50kW는 반영합니다. 그 밖의 공간은 조합 재원으로 검토하고, 전력을 별도로 판매해 학교 환원·교육에 연결하는 제안입니다.`
      : '햇빛이음학교는 공공예산 절차를 거쳐 2026년 시범 기준 학교당 약 50kW의 자가소비 설비와 교육 연계를 지원합니다. 우리 제안은 조합 재원으로 공간을 더 넓게 검토하고, 전력을 판매해 학교 환원·교육에 연결하는 방식입니다.';
    policy.append(comparison);
    page(15).querySelector('.grid-2').after(policy);
    put(15, '.note.warning', '자가소비 설비는 방학·주말의 전력수요에 따라 활용 효과가 달라집니다. 판매형 설비는 별도 계량·계통 조건을 확인해 운영합니다. 공식 자료는 정책 배경이며, 본 사업의 승인이나 특정 계약 방식의 보장을 뜻하지 않습니다.');
    const policySource = page(15).querySelector('.source');
    const sourceLink = doc.createElement('a'); sourceLink.href = policyUrl; sourceLink.textContent = '출처: 교육부 「햇빛이음학교 사업 추진계획」(2026.02.26)';
    policySource.replaceChildren(sourceLink);

    put(16, 'h2', `학교 일정에 맞춰 ${m.constructionMonth}개월 차 착공, ${m.completionMinMonth}~${m.completionMaxMonth}개월 내 완공을 목표로 합니다`);
    put(16, '.lead', '계약에 앞서 기존·계획 설비와 전체 활용 가능 공간을 확인하고, 수업·시험·행사에 지장이 적은 공사 시기를 학교와 함께 정합니다.');
    const schedule = [...page(16).querySelectorAll('.schedule-flow .step')];
    [[`협의 후 0~4주`, '기존·계획 설비, 소유·관리, 교육일정과 후보 공간 확인'], [`협의 후 2~3개월`, '구조·방수·관람석 안전, 전기부하·계량과 계통·설계'], [`약 ${m.constructionMonth}개월 차`, '필요한 재산 절차와 계통 조건 확정 후 자재 발주·착공'], ['착공 후 6~8주', '학생 동선을 분리하고 학교와 합의한 시간·기간에 시공'], [`약 ${m.completionMinMonth}~${m.completionMaxMonth}개월`, '사용전검사, 계통연계, 시운전과 운영·교육자료 인계']]
      .forEach(([title, body], index) => { schedule[index].querySelector('h3').textContent = title; schedule[index].querySelector('p').textContent = body; });
    put(16, '.banner', `목표 일정 · 사전협의 → 약 ${m.constructionMonth}개월 차 착공 → 착공 후 6~8주 공사 → 약 ${m.completionMinMonth}~${m.completionMaxMonth}개월 내 완공`);
    put(16, '.grid-2 .card:first-child h3', '학교 일정 우선');
    put(16, '.grid-2 .card:first-child p', '방학 공사를 우선 검토하되 학교의 시험·행사·시설공사 일정에 맞춰 소음·출입·주차 제한을 사전에 안내합니다.');
    put(16, '.grid-2 .card:nth-child(2) h3', '일정 변동 요인');
    put(16, '.grid-2 .card:nth-child(2) p', '재산 사용 절차, 기존 시설계획 변경, 지붕 보강이나 한전 계통보강이 필요하면 변경 사유와 새 일정을 학교에 즉시 공유합니다.');

    put(17, 'h2', '학교의 부담은 줄이고, 설치 뒤에도 책임 있게 운영합니다');
    const trust = [...page(17).querySelectorAll('.trust-grid .card')];
    trust[0].querySelector('h3').textContent = '수업과 학생 안전을 먼저 지킵니다';
    setList(doc, trust[0], ['학교와 합의한 공사기간·출입구역·학생 동선 준수', '구조·방수·배수·전기·화재 안전과 사용전검사', '소음·먼지·주차 제한과 대체 동선을 사전 안내', '공사보험·품질보증과 사고 대응 연락체계 마련']);
    trust[1].querySelector('h3').textContent = '운영과 시설변경까지 조합이 관리합니다';
    setList(doc, trust[1], ['발전량·고장·점검·보수 이력 지속 관리', '학교 시설공사 때 이동·재설치 책임 사전 협의', '회계·지역환원·운영 결과를 이해하기 쉽게 공개', '학교 담당자의 반복적인 관리 업무를 최소화']);
    put(17, '.frame > .card.sunny h3', '교육 연계 운영 예시');
    put(17, '.frame > .card.sunny p', '발전량과 날씨를 비교하는 수업, 태양광 원리 체험, 환경동아리 조사를 학교와 함께 기획합니다. 대상과 횟수는 교육과정에 맞춰 협의합니다.');
    put(17, '.banner', '공사는 끝나도 학교생활과 발전소 운영은 계속됩니다. 학교가 안심할 수 있도록 조합과 전문업체가 책임 범위를 분명히 하겠습니다.');

    page(18).classList.add('school-closing');
    setEmphasis(doc, page(18).querySelector('h2'), `${m.facilityName}의 햇빛을, `, '학생과 학교를 위한 자원으로');
    put(18, '.lead', '학교 설치 공사비는 조합이 조달합니다. 먼저 공간 활용과 학교에 돌아갈 혜택을 함께 검토해 주시길 제안합니다.');
    const closingGrid = doc.createElement('div'); closingGrid.className = 'school-closing-grid';
    [['학교에 요청드리는 사항', ['설치 후보 공간의 현장 검토 협조', '보유 도면 등 시설자료 공유·담당자 지정', '공간 사용·학교 환원·교육 협력 논의']],
      ['학교가 얻는 기대효과', ['학교의 설치 공사비 부담 없음', '발전수익 일부 환원·학생 교육 지원', areaKeys.includes('parking') || areaKeys.includes('stands') ? '주차장·스탠드의 그늘·비가림, 전문 유지관리' : '전문 유지관리로 학교의 운영 부담 완화']]].forEach(([title, lines]) => {
      const card = doc.createElement('div'); card.className = 'card';
      const h3 = doc.createElement('h3'); h3.textContent = title;
      card.append(h3, doc.createElement('ul')); setList(doc, card, lines); closingGrid.append(card);
    });
    page(18).querySelector('.lead').after(closingGrid);
    // Insert only after all base-page edits. Keep the closing/contact page last.
    const sourcePage = doc.createElement('section'); sourcePage.className = 'slide school-policy-source';
    const sourceTop = doc.createElement('div'); sourceTop.className = 'topline';
    const sourceFrame = doc.createElement('div'); sourceFrame.className = 'frame';
    const sourceHeading = doc.createElement('div'); sourceHeading.className = 'eyebrow'; sourceHeading.textContent = '정책 참고 · 교육부 보도자료';
    const sourceNumber = doc.createElement('div'); sourceNumber.className = 'page';
    sourceFrame.append(sourceHeading, evidence); sourcePage.append(sourceTop, sourceFrame, sourceNumber);
    page(15).after(sourcePage);
    doc.querySelectorAll('.slide').forEach((slide, index) => { slide.querySelector('.page').textContent = String(index + 1); });
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
      .closing .contact-person-label { display:grid; min-width:0; grid-template-columns:4em minmax(0,1fr); column-gap:12pt; align-items:baseline; }
      .closing .contact-person-role { white-space:nowrap; }
      .closing .contact-person-name { min-width:0; overflow-wrap:anywhere; }
      .closing .contact-person-phone { min-width:0; overflow-wrap:anywhere; }
      .closing .contact.contact-many { grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr); }
      .closing .contact.contact-many .contact-org { grid-column:1 / 2; }
      .closing .contact.contact-many .contact-address { grid-column:2 / -1; }
      .closing .contact.contact-crowded .contact-person-label { column-gap:7pt; }
      .closing .contact.contact-crowded .contact-person-phone { line-height:1.25; }`;
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
    page(10).querySelectorAll('h3').forEach(node => {
      node.textContent = node.textContent.trim().replace(/^(.+) 이사$/, '이사 $1');
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
    if (m.facilityType === 'school') renderSchoolProposal(doc, m, helpers);
  }
  window.ProposalSections = Object.freeze({ render, renderStats, renderContacts });
})();
