/* Version: v1.5.0 | A distinct school proposal story complements public self-consumption with citizen generation. */
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
    const area = ({ roof: '옥상', parking: '주차장', both: '옥상·주차장' })[m.schoolInstallArea] || '옥상·주차장';
    const proposed = m.expandedKw;
    const rangeStart = proposed === null ? null : Math.max(m.expandedMinKw ?? proposed, m.remainingKw ?? 0);
    const range = proposed === null ? '현장조사 후 산정' : rangeStart === proposed ? kw(proposed) : `${trimNumber(rangeStart)}~${kw(proposed)}`;
    const existing = !m.existingKnown ? '현황 확인 중' : m.hasExistingInstallation ? kw(m.existingKw) : '기설치 없음';
    const publicProgram = m.schoolPublicProgramStatus === 'none' ? '별도 계획 없음'
      : m.schoolPublicProgramStatus === 'completed' ? (m.schoolPublicProgramKw === null ? '설치 완료 · 용량 확인' : `${kw(m.schoolPublicProgramKw)} 설치 완료`)
      : m.schoolPublicProgramStatus === 'planned' ? (m.schoolPublicProgramKw === null ? '선정·설계 중 · 용량 협의' : `${kw(m.schoolPublicProgramKw)} 계획`)
      : '선정·설계 여부 확인 중';

    doc.body.classList.add('school-proposal');
    const style = doc.createElement('style');
    style.textContent = `.school-proposal .school-capacity-figures { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:14px 0 18px; }
      .school-proposal .school-capacity-figures .law-box { min-height:118px; padding:15px 16px; display:flex; flex-direction:column; justify-content:center; }
      .school-proposal .school-capacity-figures .big-inline { font-size:22pt; line-height:1.2; }
      .school-proposal .school-capacity-figures .small:last-child { margin-top:6px; line-height:1.35; }
      .school-proposal .financial-compare { grid-template-columns:1fr; max-width:820px; margin:0 auto; }
      .school-proposal .school-source { font-size:11.25pt; line-height:1.45; }`;
    doc.head.append(style);

    put(1, '.cover-kicker', '학교 에너지전환 · 시민참여 · 교육 연계 제안');
    const coverTitle = page(1).querySelector('h1');
    coverTitle.replaceChildren(doc.createTextNode('학교에서 시작한 에너지전환을'), doc.createElement('br'));
    const coverSpan = doc.createElement('span'); coverSpan.textContent = '지역사회와 함께 넓힙니다.'; coverTitle.append(coverSpan);
    put(1, '.subtitle', `${m.facilityName} 시민참여형 햇빛발전소 조성 제안서`);

    put(2, '.eyebrow', 'WHY SCHOOL, WHY TOGETHER');
    setEmphasis(doc, page(2).querySelector('h2'), '학교의 에너지전환을 ', '교육과 지역 참여로 넓힐 수 있습니다', '', { lineBreak: true });
    put(2, '.lead', `${m.facilityName}의 기존 설비와 교육부·교육청의 자가소비형 계획을 우선 반영하고, 추가로 활용할 수 있는 ${area}에는 별도 시민발전소를 조성하는 방안을 제안합니다.`);
    const p2cards = [...page(2).querySelectorAll('.grid-3 .card')];
    [['학교가 직접 쓰는 전기', '자가소비형 태양광은 학교의 전기구매를 줄이고 학생들이 가까이에서 에너지전환을 접하게 합니다.'],
      ['남는 공간의 발전 기회', '기존·계획 설비 구역을 제외한 추가 공간은 별도 시민발전사업으로 검토해 재생에너지 생산을 더 넓힐 수 있습니다.'],
      ['수업으로 이어지는 발전소', '발전량 자료와 태양광 원리를 교과·동아리·체험활동에 활용하도록 조합이 교육을 함께 기획합니다.']
    ].forEach(([title, body], index) => { p2cards[index].querySelector('h3').textContent = title; p2cards[index].querySelector('p').textContent = body; });
    put(2, '.banner', '공공 자가소비형 사업과 시민참여형 발전사업이 각자의 역할을 나누어 학교의 에너지전환 효과를 넓히는 구성을 제안합니다.');
    const p2source = page(2).querySelector('.source');
    p2source.replaceChildren(doc.createTextNode('정책 참고: '));
    const moe = doc.createElement('a'); moe.href = 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105428&lev=0&m=020402&opType=N&s=moe&statusYN=W'; moe.textContent = '교육부 2026년 햇빛이음학교 시범사업 발표';
    p2source.append(moe, doc.createTextNode(' · 학교별 50kW 내외는 2026년 시범사업 기준이며, 대상 학교의 실제 계획과 용량은 별도로 확인합니다.'));

    setEmphasis(doc, page(3).querySelector('h2'), '대상지와 ', `${area}의 추가 활용 가능 공간`);

    put(4, '.eyebrow', 'SCHOOL SOLAR PLAN');
    setEmphasis(doc, page(4).querySelector('h2'), '기존·공공사업을 먼저 반영하고, ', '추가 공간을 시민발전으로 연결합니다');
    const figures = page(4).querySelector('.capacity-figures');
    figures.className = 'school-capacity-figures';
    const boxes = [
      ['기존 태양광', existing, '설비 위치·소유·계량 방식 확인'],
      ['교육부·교육청 자가소비형', publicProgram, '선정·설계 구역을 먼저 확보'],
      ['시민참여형 신규 발전', range, `${area}의 추가 활용 공간 조사`]
    ];
    figures.replaceChildren(...boxes.map(([label, value, detail], index) => {
      const box = doc.createElement('div'); box.className = `law-box${index === 2 ? ' sunny' : ''}`;
      const small = doc.createElement('div'); small.className = 'small'; small.textContent = label;
      const big = doc.createElement('div'); big.className = 'big-inline'; big.textContent = value;
      const note = doc.createElement('div'); note.className = 'small'; note.textContent = detail;
      box.append(small, big, note); return box;
    }));
    put(4, '.grid-2 .card:first-child h3', '배치의 우선순위');
    put(4, '.grid-2 .card:first-child .lead', '기존 설비와 확정된 공공사업 구역, 교육활동에 필요한 공간을 먼저 보호합니다.');
    put(4, '.grid-2 .card:first-child p:last-child', '겹치지 않는 추가 공간만 시민발전 후보지로 조사합니다.');
    put(4, '.grid-2 .card:nth-child(2) h3', '용량을 정하는 방법');
    put(4, '.grid-2 .card:nth-child(2) p', `전체 가능 면적에서 기존·계획 구역과 통학·소방·유지관리 공간을 제외한 뒤 ${area}의 실제 배치로 신규 용량을 산정합니다.`);
    put(4, '.banner', '50kW를 일괄 차감하지 않고, 학교별 확정 설계와 현장조사를 기준으로 시민발전 규모를 정합니다.');
    put(4, '.source', '입력한 학교 현황은 제안 준비용입니다. 공공사업 선정·설계 자료, 학교 전력부하, 구조·방수·계통 검토 후 최종 확정합니다.');

    put(5, '.eyebrow', 'COMPLEMENTARY MODEL');
    setEmphasis(doc, page(5).querySelector('h2'), '자가소비만으로 놓칠 수 있는 ', '공간과 발전 기회를 보완합니다');
    const halves = [...page(5).querySelectorAll('.thermo > div')];
    halves[0].querySelector('h3').textContent = '공공 자가소비형의 역할과 한계';
    setList(doc, halves[0], ['학교가 쓰는 전기를 현장에서 생산해 전기구매를 줄입니다.', '방학·주말처럼 전력수요가 낮은 때에는 발전량을 충분히 활용하지 못할 수 있습니다.', '자가소비 수요에 맞춘 용량만 계획하면 설치 가능한 공간이 남을 수 있습니다.']);
    halves[1].querySelector('h3').textContent = '시민참여형 발전이 보완하는 부분';
    setList(doc, halves[1], ['공공사업 구역 밖의 추가 공간에 별도 발전소를 조성합니다.', '자체 생산 전력을 별도로 계량·판매해 재생에너지 생산을 확대합니다.', '주민 출자와 지역환원으로 학교와 마을이 성과를 함께 나눕니다.']);
    const p5cards = [...page(5).querySelectorAll('.grid-4 .card')];
    [['공공사업 우선', '확정된 자가소비형 계획과 필요한 공간을 먼저 반영합니다.'], ['별도 설비·계량', '정부 설비의 잉여전력을 재판매하지 않고 별도 발전소로 운영합니다.'], ['공간 활용 확대', '남은 옥상·주차장의 발전 가능성을 현장조사로 확인합니다.'], ['교육·지역환원', '발전자료는 교육에, 수익 일부는 합의한 지역사업에 연결합니다.']]
      .forEach(([title, body], index) => { p5cards[index].querySelector('h3').textContent = title; p5cards[index].querySelector('p').textContent = body; });
    put(5, '.banner', m.siteProposalNote || '학교가 직접 쓰는 전기는 공공사업으로, 추가 공간의 햇빛은 별도 시민발전사업으로 활용하는 구성을 제안합니다.');

    put(6, '.eyebrow', 'ENERGY EDUCATION');
    setEmphasis(doc, page(6).querySelector('h2'), '설치로 끝나지 않고 ', '학생이 보고 배우는 발전소로 운영합니다');
    replaceTable(doc, page(6).querySelector('.table'), ['교육 영역', '학교에서 활용하는 방법', '조합이 지원하는 내용'], [
      ['발전자료', '일·월별 발전량과 날씨를 비교하고 그래프로 표현', '이해하기 쉬운 발전자료와 설명 제공'],
      ['교과 연계', '과학·수학·환경·사회 수업의 실제 사례로 활용', '태양광 원리와 지역 에너지전환 자료 지원'],
      ['체험 교육', '학생 눈높이에 맞춘 기후·에너지 체험활동', '학교와 협의한 강의·활동 진행'],
      ['동아리 활동', '학교 에너지 사용과 탄소감축 효과 조사', '조사 방법과 결과 공유 지원'],
      ['지역 연계', '주민 협동조합과 지역경제의 관계 이해', '조합원·현장 활동가와의 대화 연계']
    ]);
    put(6, '.grid-2 .card:first-child h3', '운영 제안');
    put(6, '.grid-2 .card:first-child p', '연 1~2회 교육을 기본 예시로 제안하되 대상 학년·횟수·시간은 학교 교육과정과 일정에 맞춰 협의합니다.');
    put(6, '.grid-2 .card:nth-child(2) h3', '학생 안전 원칙');
    put(6, '.grid-2 .card:nth-child(2) p', '발전자료와 안전한 체험도구를 활용하며, 학생이 전기설비나 통제구역에 직접 접근하지 않도록 합니다.');

    put(7, 'h2', '학교의 햇빛을 지역이 함께 만들고 책임집니다');
    const steps = [...page(7).querySelectorAll('.flow .step')];
    [['학교·교육청', '부지 사용, 교육활동, 안전 기준과 행정 절차 협의'], ['지역 협동조합', '사업비 조달, 시민 참여, 운영과 정보 공개'], ['전문 파트너', '설계·시공·검사·보험·유지관리 품질 확보'], ['용인 주민·단체', '설명회, 의견 제시, 조합원 가입과 출자로 참여']]
      .forEach(([title, body], index) => { steps[index].querySelector('h3').textContent = title; steps[index].querySelector('p').textContent = body; });
    put(7, '.participation-support .card:first-child h3', '지역 주민이 함께해 수용성을 높입니다');
    put(7, '.participation-support .card:first-child p', '용인 주민과 시민사회가 이미 조합원으로 참여하고 있습니다. 학교·학부모·주민의 질문을 가까이에서 듣고 설명하며, 사업 과정의 의견을 설계와 운영에 반영하겠습니다.');
    put(7, '.participation-support .card:nth-child(2) h3', '참여와 교육의 대상을 구분합니다');
    put(7, '.participation-support .card:nth-child(2) p', '지역 주민과 단체에는 조합원 가입·출자 참여 기회를 열고, 학생에게는 투자 권유가 아닌 에너지·기후 교육과 발전자료 학습 기회를 제공합니다.');
    put(7, '.note.warning', '주민 설명회가 필요하면 조합원과 실무자가 참여해 사업 구조·안전·운영·지역환원을 설명하고 질문에 답하겠습니다. 학교의 공식 의사결정과 학부모·지역 의견수렴 절차를 존중합니다.');

    put(8, 'h2', '발전소 수익 일부를 학교와 지역의 에너지전환에 연결합니다');
    put(8, '.lead', `지역환원은 예비 수지에서 매출의 ${trimNumber(m.returnPct)}%를 가정하되, 실제 비율과 사용처는 학교·교육청·지역사회와의 협약 및 조합 의결을 거쳐 확정합니다.`);
    const benefitSteps = [...page(8).querySelectorAll('.flow .step')];
    [['매출 확인', '시민발전소의 연간 매출과 운영비를 별도로 결산합니다.'], ['환원 재원 구분', '협약에서 정한 기준에 따라 환원 재원을 구분합니다.'], ['사용처 협의', '학교·지역사회와 교육·복지 등 필요한 사업을 논의합니다.'], ['집행·공개', '선정 이유, 사용액과 결과를 이해하기 쉽게 공개합니다.']]
      .forEach(([title, body], index) => { benefitSteps[index].querySelector('h3').textContent = title; benefitSteps[index].querySelector('p').textContent = body; });
    const examples = [...page(8).querySelectorAll('.benefit-examples .card')];
    [['활용 예시', '에너지·기후교육, 환경동아리, 취약계층 에너지복지'], ['비율은 협약으로 확정', `매출 ${trimNumber(m.returnPct)}%는 비교를 위한 예시이며 사업수지와 협의 결과를 반영합니다.`], ['운영은 공개', '회의 결과와 집행액, 잔액과 성과를 학교·지역사회가 확인할 수 있게 합니다.']]
      .forEach(([title, body], index) => { examples[index].querySelector('h3').textContent = title; examples[index].querySelector('p').textContent = body; });
    put(8, '.benefit-banner', '학교에서 생산한 시민의 햇빛이 교육과 지역사회를 다시 밝히는 구조입니다.');
    put(8, '.benefit-note', '환원은 아직 확정된 약속이 아니라 협의안입니다. 학교회계로 직접 귀속되는지, 별도 교육·지역사업으로 집행하는지는 적용 규정과 협약을 확인해 정합니다.');

    put(11, 'h2', '발전자료와 운영정보를 교육과 신뢰의 기반으로 공개합니다');
    put(11, '.screen-head', `${m.facilityName} 시민햇빛발전소 · 운영 공개 화면 예시`);
    put(11, '.card.sunny h3', '교육과 공공성');
    setList(doc, page(11).querySelector('.card.sunny'), ['수입·비용·적립·환원 구분', '학생이 이해할 수 있는 발전·탄소감축 자료', '학교·지역사회에 점검과 운영 결과 공유']);
    put(11, '.note', '화면 수치는 디자인 예시이며 실제 발전량이 아닙니다. 공개 범위와 교육자료 제공 방식은 학교·교육청과 협의합니다.');

    put(12, 'h2', '학교 수업과 시설을 지키는 안전·유지관리 기준');
    const safety = [...page(12).querySelectorAll('.safety-grid .card')];
    [['구조·방수', '옥상 하중과 기존 방수 상태를 확인하고 누수 예방·보수 책임을 계약에 명확히 합니다.'], ['통학·공사 동선', '학생 이동, 소방 진입, 공사차량과 자재 적치 구역을 분리합니다.'], ['학교 일정', '시험·행사·수업을 피해 방학 등 학교와 합의한 기간에 공사합니다.'], ['전기 안전', '접지·차단·케이블 보호·표지와 사용전검사를 거쳐 접근을 통제합니다.'], ['보험·사고 대응', '공사·운영 보험, 비상연락망과 사고 발생 시 책임·조치 절차를 정합니다.'], ['지붕 보수·원상복구', '학교 시설공사 때 설비 이동·재설치와 계약 종료 후 철거·복구 책임을 정합니다.']]
      .forEach(([title, body], index) => { safety[index].querySelector('h3').textContent = title; safety[index].querySelector('p').textContent = body; });
    let safetyNote = page(12).querySelector('.note.warning');
    if (!safetyNote) {
      safetyNote = doc.createElement('div'); safetyNote.className = 'note warning'; safetyNote.style.marginTop = '16px';
      page(12).querySelector('.safety-grid').after(safetyNote);
    }
    safetyNote.textContent = '기존 설비, 공공 자가소비형 설비와 시민발전 설비의 구역·계량점·소유·운영 책임을 도면과 협약으로 구분해 고장·정산·시설공사 때 혼선을 막습니다.';

    put(13, 'h2', '공공계획과 학교 여건을 확인한 뒤 시민발전 규모를 확정합니다');
    const scale = [...page(13).querySelectorAll('.grid-3 > .card')];
    [['공공 자가소비형 현황', publicProgram, '선정·설계·설치 자료로 실제 구역 확인'], ['시민발전 신규 제안', range, `${area}의 추가 활용 공간 기준`], ['시민발전 연간 발전량', proposed === null ? '용량 입력 후 산정' : `${trimNumber(proposed * m.sunHours * 365 / 10000)}만kWh`, proposed === null ? '신규 용량을 입력하면 계산합니다.' : `${kw(proposed)} × 일평균 ${trimNumber(m.sunHours)}시간 × 365일`]]
      .forEach(([label, value, detail], index) => { scale[index].querySelector('.stat-label').textContent = label; scale[index].querySelector('.stat').textContent = value; scale[index].querySelector('.stat').style.fontSize = value.length > 14 ? '20pt' : '28pt'; scale[index].querySelector('p').textContent = detail; });
    replaceTable(doc, page(13).querySelector('.table'), ['확정 전 확인', '확인 이유', '결과에 따른 조정'], [
      [`${area} 실측`, '교육활동·통학·소방·유지관리 공간을 제외해야 함', '시민발전 배치와 신규 용량 확정'],
      ['기존·공공사업 자료', '설치·계획 구역과 계량·소유 관계 확인', '세 설비의 공간과 책임 분리'],
      ['구조·방수·시설계획', '하중·누수와 예정된 지붕 보수공사 확인', '공법·공사 시기·이동 책임 조정'],
      ['한전 계통·실견적', '접속 가능 용량과 공사비가 수지에 영향', '용량·재원·일정 최종 조정']
    ]);
    put(13, '.note.warning', '사업비·금융조건·수익성은 조합이 검토하고 조달합니다. 학교의 사업비 부담을 전제하지 않으며, 기본설계와 계약조건 확인 뒤 시민발전소의 재원조달안을 별도로 제시합니다.');

    put(14, 'h2', '시민참여형 신규 발전소의 예상 수지를 따로 확인합니다');
    const finance = page(14).querySelector('.financial-compare');
    const financeCards = [...finance.children];
    financeCards.slice(1).forEach((card) => card.remove());
    finance.style.gridTemplateColumns = '1fr'; finance.style.maxWidth = '820px'; finance.style.margin = '0 auto';
    const financeCard = financeCards[0]; financeCard.querySelector('h3').textContent = `시민발전 신규 설치안 · ${kw(proposed)}`;
    let values = Array(8).fill('용량 입력 후 산정');
    if (proposed !== null) {
      const result = calculateFinance(proposed, m);
      values = [formatProjectCost(result.projectCost), `${Math.round(result.annualGeneration).toLocaleString('ko-KR')}kWh`, formatApproxManwon(result.annualRevenue), formatApproxManwon(result.localReturn, '/년'), formatApproxManwon(result.operationReserve, '/년'), formatApproxManwon(result.annualCash), result.payback > 0 ? `약 ${result.payback.toFixed(1)}년` : '산정 불가', `약 ${(result.twentyYearResidual / 100000000).toFixed(2)}억원`];
    }
    financeCard.querySelectorAll('td:nth-child(2)').forEach((cell, index) => { cell.textContent = values[index]; });
    put(14, '.note.warning', `이 표는 별도 시민발전소의 예비 수지입니다. 공공 자가소비형 설비의 전기요금 절감액은 섞지 않았습니다. 사업비는 ${trimNumber(m.unitCostManwon)}만원/kW 가정이며 옥상형·주차장형 공법, 금융비용·세금·부지사용료·계통보강비·부가세를 반영해 다시 계산합니다.`);

    put(15, '.eyebrow', 'SCHOOL FACILITY & CONTRACT');
    setEmphasis(doc, page(15).querySelector('h2'), '법적 검토 근거 위에서 ', '학교·교육청 절차를 먼저 확인합니다');
    put(15, '.contract-callout h3', '학교의 교육활동과 재산관리 원칙에 맞는 사용·계약 방식을 협의합니다.');
    put(15, '.contract-callout p', '신재생에너지법 제26조는 국가·지방자치단체의 재산을 신재생에너지 사업에 사용하는 근거를 두고 있습니다. 다만 학교별 소유·관리 주체와 교육청 규정에 따라 허가·대부·계약 절차를 검토합니다.');
    put(15, '.grid-2 .card:first-child h3', '사업 병행 가능성 확인');
    put(15, '.grid-2 .card:first-child p', '공공 자가소비형 사업과 별도 시민발전사업이 같은 학교 안에서 병행 가능한지 학교·교육청의 계획과 재산관리 기준으로 확인합니다.');
    put(15, '.grid-2 .card:nth-child(2) h3', '장기 운영과 시설공사 보호');
    put(15, '.grid-2 .card:nth-child(2) p', '사용기간·사용료, 보험, 유지관리 출입, 지붕 보수 때 이동·재설치, 계약 종료 시 철거·원상복구 책임을 문서로 정합니다.');
    put(15, '.note.warning', '수의계약이나 장기 사용기간이 자동으로 보장된다는 뜻은 아닙니다. 학교시설의 권한과 적용 규정, 공공사업과의 관계를 확인한 뒤 계약 구조를 확정합니다.');
    put(15, '.source', '검토 근거: 신재생에너지법 제26조 · 학교시설 소유·관리 현황 · 교육청 재산 사용 기준 · 학교별 설치계획과 안전·유지관리 방안.');

    put(16, 'h2', `학교 일정에 맞춰 ${m.constructionMonth}개월 차 착공, ${m.completionMinMonth}~${m.completionMaxMonth}개월 내 완공을 목표로 합니다`);
    put(16, '.lead', '계약에 앞서 기존 설비와 공공사업 계획을 확인하고, 수업·시험·행사에 지장이 적은 공사 시기를 학교와 함께 정합니다.');
    const schedule = [...page(16).querySelectorAll('.schedule-flow .step')];
    [[`협의 후 0~4주`, '기존·공공사업 자료, 소유·관리, 교육일정과 후보 공간 확인'], [`협의 후 2~3개월`, '옥상 구조·방수, 전기부하·계량, 한전 계통과 실시설계'], [`약 ${m.constructionMonth}개월 차`, '학교·교육청 절차와 계통 조건 확정 후 자재 발주·착공'], ['착공 후 6~8주', '학생 동선을 분리하고 학교와 합의한 시간·기간에 시공'], [`약 ${m.completionMinMonth}~${m.completionMaxMonth}개월`, '사용전검사, 계통연계, 시운전과 운영·교육자료 인계']]
      .forEach(([title, body], index) => { schedule[index].querySelector('h3').textContent = title; schedule[index].querySelector('p').textContent = body; });
    put(16, '.banner', `목표 일정 · 사전협의 → 약 ${m.constructionMonth}개월 차 착공 → 착공 후 6~8주 공사 → 약 ${m.completionMinMonth}~${m.completionMaxMonth}개월 내 완공`);
    put(16, '.grid-2 .card:first-child h3', '학교 일정 우선');
    put(16, '.grid-2 .card:first-child p', '방학 공사를 우선 검토하되 학교의 시험·행사·시설공사 일정에 맞춰 소음·출입·주차 제한을 사전에 안내합니다.');
    put(16, '.grid-2 .card:nth-child(2) h3', '일정 변동 요인');
    put(16, '.grid-2 .card:nth-child(2) p', '교육청 재산 절차, 공공사업 설계 변경, 지붕 보강이나 한전 계통보강이 필요하면 변경 사유와 새 일정을 학교에 즉시 공유합니다.');

    put(17, 'h2', '학교의 부담은 줄이고, 설치 뒤에도 책임 있게 운영합니다');
    const trust = [...page(17).querySelectorAll('.trust-grid .card')];
    trust[0].querySelector('h3').textContent = '수업과 학생 안전을 먼저 지킵니다';
    setList(doc, trust[0], ['학교와 합의한 공사기간·출입구역·학생 동선 준수', '구조·방수·배수·전기·화재 안전과 사용전검사', '소음·먼지·주차 제한과 대체 동선을 사전 안내', '공사보험·품질보증과 사고 대응 연락체계 마련']);
    trust[1].querySelector('h3').textContent = '운영과 시설변경까지 조합이 관리합니다';
    setList(doc, trust[1], ['발전량·고장·점검·보수 이력 지속 관리', '학교 시설공사 때 이동·재설치 책임 사전 협의', '회계·지역환원·운영 결과를 이해하기 쉽게 공개', '학교 담당자의 반복적인 관리 업무를 최소화']);
    put(17, '.frame > .card.sunny h3', '교육 연계 운영 예시');
    put(17, '.frame > .card.sunny p', '발전량과 날씨를 비교하는 수업, 태양광 원리 체험, 환경동아리 조사를 학교와 함께 기획합니다. 대상과 횟수는 교육과정에 맞춰 협의합니다.');
    put(17, '.banner', '공사는 끝나도 학교생활과 발전소 운영은 계속됩니다. 학교가 안심할 수 있도록 조합과 전문업체가 책임 범위를 분명히 하겠습니다.');

    setEmphasis(doc, page(18).querySelector('h2'), `${m.facilityName}에서 시작한 에너지전환을`, '학교와 마을이 함께 키우는 사업으로 제안합니다.', '', { lineBreak: true });
    put(18, '.lead', '학교의 공공 태양광 계획을 존중하고, 추가 공간은 시민의 참여·에너지교육·지역사회 환원으로 연결하겠습니다.');
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
    if (m.facilityType === 'school') renderSchoolProposal(doc, m, helpers);
  }
  window.ProposalSections = Object.freeze({ render, renderStats, renderContacts });
})();
