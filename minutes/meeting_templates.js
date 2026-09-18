/*
Version: v1.0.0
Change: 2026-09-18 - Rebuild pre-meeting board papers and general assembly booklet from retained source documents.
*/

const safe = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const blocks = (value, fallback = '') => {
  const text = String(value || fallback || '').trim();
  return safe(text).replace(/\n/g, '<br>');
};

const dateText = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : (safe(value) || '미정');
};

const timeText = (row) => {
  const start = String(row.start_time || '').slice(0, 5);
  const end = String(row.end_time || '').slice(0, 5);
  if (!start) return '시간 미정';
  return end ? `${safe(start)} ~ ${safe(end)}` : safe(start);
};

const chapter = (id, title, body, kind = 'body') => `
  <section class="meeting-chapter chapter-${safe(kind)}" data-chapter-id="${safe(id)}" data-chapter-title="${safe(title)}">
    ${body}
  </section>`;

const typeGroups = (agendas) => {
  const groups = { REPORT: [], DECISION: [], DISCUSSION: [], OTHER: [] };
  (agendas || []).forEach((agenda) => (groups[agenda.agenda_kind] || groups.OTHER).push(agenda));
  return groups;
};

const numberedAgenda = (agenda, label, index) => `
  <div class="source-agenda-row">
    <strong>${safe(label)} 제${index + 1}호</strong>
    <span>${safe(agenda?.title || '안건 제목을 입력하세요')}</span>
    ${agenda?.summary ? `<small>${blocks(agenda.summary)}</small>` : ''}
  </div>`;

function boardMeta(row) {
  return `<table class="meeting-meta"><tbody>
    <tr><th>일시</th><td>${dateText(row.meeting_date)} ${timeText(row)}</td></tr>
    <tr><th>장소</th><td>${safe(row.location || '미정')}</td></tr>
  </tbody></table>`;
}

export function buildBoardMaterials({ row, agendas, coopName }) {
  const groups = typeGroups(agendas);
  const groupBlock = (title, label, rows) => `
    <h2>${safe(title)}</h2>
    ${rows.length ? rows.map((agenda, index) => numberedAgenda(agenda, label, index)).join('') : '<p class="empty-line">등록된 안건이 없습니다.</p>'}`;
  return `<article class="board-one-paper">
    <h1>${safe(coopName)} ${safe(row.title)} 회의자료</h1>
    ${boardMeta(row)}
    ${groupBlock('1. 보고 안건', '보고', groups.REPORT)}
    ${groupBlock('2. 의결 안건', '의결', groups.DECISION)}
    ${groupBlock('3. 토의 안건', '토의', groups.DISCUSSION)}
    ${groupBlock('4. 기타 안건', '기타', groups.OTHER)}
    <h2>[메모]</h2>
    <p>${blocks(row.document_notes, ' ')}</p>
  </article>`;
}

function boardScenarioAgenda(agenda, index, facilitator) {
  const number = index + 1;
  const title = safe(agenda.title || '안건 제목을 입력하세요');
  const report = blocks(agenda.office_report || agenda.proposal_text || agenda.summary, '자료에 따라 설명드리겠습니다.');
  const note = agenda.scenario_notes ? `<p class="action"><strong>진행 참고</strong> ${blocks(agenda.scenario_notes)}</p>` : '';
  const memo = agenda.document_notes ? `<p><strong>안건 메모</strong><br>${blocks(agenda.document_notes)}</p>` : '';
  if (agenda.agenda_kind === 'REPORT') {
    return `<h2>[보고 제${number}호: ${title}]</h2>
      <p class="speaker"><strong>의장</strong> 보고 제${number}호, 「${title}」에 대한 보고를 진행하겠습니다. ${safe(facilitator)}께서 설명해 주시기 바랍니다.</p>
      <p class="speaker"><strong>${safe(facilitator)}</strong> ${report}</p>
      <p class="speaker"><strong>의장</strong> 보고 내용에 대해 질문이나 의견 있으십니까?</p>${note}${memo}`;
  }
  const kind = agenda.agenda_kind === 'DISCUSSION' ? '토의' : agenda.agenda_kind === 'OTHER' ? '기타' : '의결';
  const decision = blocks(agenda.decision_draft, kind === '토의' ? '의견을 나누고 향후 추진 방향을 정리하겠습니다.' : '원안대로 승인하는 데 이의 없으십니까?');
  return `<h2>[${kind} 제${number}호: ${title}]</h2>
    <p class="speaker"><strong>의장</strong> ${kind} 제${number}호, 「${title}」을 상정합니다.</p>
    <p class="speaker"><strong>${safe(facilitator)}</strong> ${report}</p>
    <p class="speaker"><strong>의장</strong> 설명 잘 들었습니다. 질문이나 의견 있으십니까?</p>
    <p class="speaker"><strong>의장</strong> ${decision}</p>${note}${memo}`;
}

export function buildBoardScenario({ row, agendas, chairName }) {
  const facilitator = row.facilitator_name || '사무국장';
  const body = (agendas || []).map((agenda, index) => boardScenarioAgenda(agenda, index, facilitator)).join('<hr>');
  return `<article class="board-scenario">
    <h1>${safe(row.title)} 진행 시나리오</h1>
    <p class="scenario-meta"><strong>일시</strong> ${dateText(row.meeting_date)} ${timeText(row)}　<strong>장소</strong> ${safe(row.location || '미정')}　<strong>진행</strong> ${safe(chairName || '의장')}</p>
    ${row.document_notes ? `<p><strong>준비 메모</strong><br>${blocks(row.document_notes)}</p>` : ''}
    <h2>개회 선언</h2>
    <p class="speaker"><strong>의장</strong> ${blocks(row.opening_message, `바쁘신 일정 중에도 참석해 주신 임원 여러분께 감사드립니다. 현재 재적 이사 ${Number(row.eligible_count || 0)}명 중 ____명이 참석하여 이사회 성원이 충족되었습니다.`)}</p>
    <p class="speaker"><strong>의장</strong> 지금부터 ${safe(row.title)}를 개회하겠습니다.</p>
    <p class="action">회의 기록을 정확히 남기기 위해 회의 내용을 녹음합니다. 녹음 파일은 사무국 내부 업무용으로만 활용합니다.</p>
    ${body || '<p>등록된 안건이 없습니다.</p>'}
    <h2>폐회 선언</h2>
    <p class="speaker"><strong>의장</strong> ${blocks(row.closing_message, '이상으로 모든 안건 처리를 마쳤습니다. 참석해 주신 여러분께 감사드리며 폐회를 선언합니다.')}</p>
  </article>`;
}

function assemblyOrder(row, agendas) {
  const agendaItems = (agendas || []).map((agenda, index) => `<li><strong>제${index + 1}호</strong> ${safe(agenda.title || '안건 제목을 입력하세요')}</li>`).join('');
  return `<h1>${safe(row.title)} 순서</h1>
    <p class="chapter-subtitle">${dateText(row.meeting_date)} · ${timeText(row)} · ${safe(row.location || '장소 미정')}</p>
    <h2>[제1부] 개회식</h2>
    <ol><li>개회 선언</li><li>국민의례</li><li>이사장 인사</li><li>기념 촬영</li></ol>
    <h2>[제2부] 본회의</h2>
    <ol><li>성원 보고 및 개회 선언</li><li>서기 및 기명날인인 선임</li><li>의사일정 확정</li><li>전차 회의록 보고</li><li>감사 보고</li><li>부의 안건 심의</li></ol>
    <ol class="bill-list">${agendaItems || '<li>안건을 입력하면 이곳에 순서대로 표시됩니다.</li>'}</ol>
    <p>마지막 순서　폐회 선언</p>
    ${row.document_notes ? `<h2>참고사항</h2><p>${blocks(row.document_notes)}</p>` : ''}`;
}

function assemblyBill(agenda, index) {
  const number = index + 1;
  const title = agenda?.title || `제${number}호 의안 제목을 입력하세요`;
  return `<h1>제${number}호 의안</h1>
    <h2>${safe(title)}</h2>
    <h3>1. 제안사유</h3><p>${blocks(agenda?.background, '제안사유를 입력하세요.')}</p>
    <h3>2. 주요내용</h3><p>${blocks(agenda?.proposal_text || agenda?.summary, '주요 내용을 입력하세요.')}</p>
    ${agenda?.decision_draft ? `<h3>3. 의결 주문</h3><p>${blocks(agenda.decision_draft)}</p>` : ''}
    ${agenda?.document_notes ? `<h3>자료 메모</h3><p>${blocks(agenda.document_notes)}</p>` : ''}`;
}

function sourceAttachment(title, intro, rows = []) {
  return `<h1>${safe(title)}</h1><p>${safe(intro)}</p>${rows.length ? `<table><thead><tr><th>구분</th><th>내용</th></tr></thead><tbody>${rows.map(([key, value]) => `<tr><th>${safe(key)}</th><td>${safe(value)}</td></tr>`).join('')}</tbody></table>` : '<p>이 챕터를 선택해 기존 자료나 최신 수치를 입력하세요.</p>'}`;
}

export function buildAssemblyMaterials({ row, agendas, coopName, company }) {
  const items = Array.from({ length: Math.max(6, agendas.length) }, (_, index) => agendas[index] || null);
  const chapters = [
    chapter('cover', '표지', `<div class="assembly-cover"><p class="org-name">${safe(coopName)}</p><p>${safe(String(row.meeting_date || '').slice(0, 4) || new Date().getFullYear())}년도</p><h1>${safe(row.title)}</h1><dl><dt>일시</dt><dd>${dateText(row.meeting_date)} ${timeText(row)}</dd><dt>장소</dt><dd>${safe(row.location || '미정')}</dd></dl></div>`, 'cover'),
    chapter('order', '총회 순서', assemblyOrder(row, agendas), 'order'),
    chapter('bill-1', `제1호 의안 ${items[0]?.title || ''}`.trim(), assemblyBill(items[0], 0), 'bill'),
    chapter('articles-comparison', '제1호 의안 붙임 신구조문 대비표', sourceAttachment('신구조문 대비표', '변경 전·후 조문과 변경 이유를 정리합니다.', [['현행', '기존 조문을 입력하세요.'], ['개정안', '변경할 조문을 입력하세요.'], ['변경 이유', '개정 이유를 입력하세요.']])),
    chapter('bill-2', `제2호 의안 ${items[1]?.title || ''}`.trim(), assemblyBill(items[1], 1), 'bill'),
    chapter('audit-report', '감사보고서', sourceAttachment('감사보고서', '업무 감사와 회계 감사 결과를 기존 감사보고서 형식에 맞춰 입력합니다.', [['감사 대상', coopName], ['감사 기간', '기간을 입력하세요.'], ['감사 범위', '회계 및 업무 집행 전반']])),
    chapter('bill-3', `제3호 의안 ${items[2]?.title || ''}`.trim(), assemblyBill(items[2], 2), 'bill'),
    chapter('business-report', '사업보고', sourceAttachment('주요 사업 추진 실적', '연간 사업·조직·대외협력 실적을 시기 순서대로 정리합니다.')),
    chapter('balance-sheet', '표준재무상태표', sourceAttachment('표준재무상태표', '확정된 결산 자료를 붙이거나 표를 입력하세요.')),
    chapter('income-statement', '표준손익계산서', sourceAttachment('표준손익계산서', '확정된 결산 자료를 붙이거나 표를 입력하세요.')),
    chapter('retained-earnings', '이익잉여금처분계산서', sourceAttachment('이익잉여금처분계산서', '총회에 상정할 처분안을 입력하세요.')),
    chapter('bill-4', `제4호 의안 ${items[3]?.title || ''}`.trim(), assemblyBill(items[3], 3), 'bill'),
    chapter('business-plan', '사업계획 및 예산안', sourceAttachment('사업계획 및 예산안', '사업 목표, 주요 사업계획, 수입·지출 예산을 기존 자료집 순서대로 입력합니다.', [['사업 목표', '올해의 사업 목표를 입력하세요.'], ['주요 사업', '발전소 건립·조합원 활동 등 계획을 입력하세요.'], ['수지 예산', '확정할 수입·지출 예산을 입력하세요.']])),
    chapter('bill-5', `제5호 의안 ${items[4]?.title || ''}`.trim(), assemblyBill(items[4], 4), 'bill'),
    chapter('bill-6', `제6호 의안 ${items[5]?.title || ''}`.trim(), assemblyBill(items[5], 5), 'bill'),
    ...items.slice(6).map((agenda, extraIndex) => chapter(`bill-${extraIndex + 7}`, `제${extraIndex + 7}호 의안 ${agenda?.title || ''}`.trim(), assemblyBill(agenda, extraIndex + 6), 'bill')),
    chapter('back-cover', '뒷표지', `<div class="assembly-back"><h1>햇빛으로 만드는<br>우리의 내일</h1><p>함께해주신 조합원 여러분 감사합니다.</p><hr><h2>${safe(coopName)}</h2><p>${safe(company?.homepage || 'https://www.yonginsolar.kr')}</p><p>${safe(company?.address || '')}</p><p>${safe(company?.phone || '')}　${safe(company?.email || '')}</p></div>`, 'back')
  ];
  return chapters.join('');
}

export function buildAssemblyScenario({ row, agendas, chairName }) {
  const facilitator = row.facilitator_name || '사무국장';
  const agendaScripts = (agendas || []).map((agenda, index) => `
    <h3>제${index + 1}호 의안 ${safe(agenda.title || '')}</h3>
    <p class="speaker"><strong>의장</strong> 제${index + 1}호 의안, 「${safe(agenda.title || '안건 제목')}」을 상정합니다. ${safe(facilitator)} 제안 설명해 주십시오.</p>
    <p class="speaker"><strong>${safe(facilitator)}</strong> ${blocks(agenda.office_report || agenda.proposal_text || agenda.summary, '자료집 내용에 따라 설명드리겠습니다.')}</p>
    <p class="speaker"><strong>의장</strong> 질문이나 의견 있으십니까?</p>
    <p class="speaker"><strong>의장</strong> ${blocks(agenda.decision_draft, '원안대로 승인하는 데 이의 없으십니까?')}</p>
    ${agenda.scenario_notes ? `<p class="action"><strong>진행 참고</strong> ${blocks(agenda.scenario_notes)}</p>` : ''}`).join('');
  return `<article class="assembly-scenario">
    <h1>${safe(row.title)} 시나리오</h1>
    <p class="scenario-meta"><strong>일시</strong> ${dateText(row.meeting_date)} ${timeText(row)}　<strong>사회</strong> ${safe(facilitator)}</p>
    ${row.document_notes ? `<p><strong>준비 메모</strong><br>${blocks(row.document_notes)}</p>` : ''}
    <h2>[제1부] 개회식 진행 ${safe(facilitator)}</h2>
    <p class="speaker"><strong>사회자</strong> 시작 5분 전 안내 말씀 드립니다. 잠시 후 ${safe(coopNameFor(row, '협동조합'))} ${safe(row.title)}를 시작하겠습니다.</p>
    <h3>1. 개회 선언</h3><p class="speaker"><strong>사회자</strong> 지금부터 ${safe(row.title)} 제1부 개회식을 시작하겠습니다.</p>
    <h3>2. 국민의례</h3><p class="speaker"><strong>사회자</strong> 모두 자리에서 일어나 앞에 있는 국기를 향해 주십시오.</p>
    <h3>3. 이사장 인사</h3><p class="speaker"><strong>사회자</strong> ${safe(chairName || '이사장')}님의 인사 말씀을 듣겠습니다.</p>
    <h3>4. 기념 촬영</h3><p class="speaker"><strong>사회자</strong> 본격적인 회의에 앞서 기념 촬영을 진행하겠습니다.</p>
    <h2>[제2부] 본회의 진행 의장</h2>
    <h3>1. 성원 보고 및 개회 선언</h3><p class="speaker"><strong>${safe(facilitator)}</strong> 총 재적 대의원 ${Number(row.eligible_count || 0)}명 중 현재 참석 ____명으로 성원 여부를 보고드립니다.</p>
    <p class="speaker"><strong>의장</strong> 성원이 되었으므로 ${safe(row.title)} 본회의 개회를 선언합니다.</p>
    <h3>2. 서기 및 기명날인인 선임</h3><p class="speaker"><strong>의장</strong> 서기와 의사록 기명날인인은 회의에서 추천받아 선임하겠습니다.</p>
    <h3>3. 의사일정 확정</h3><p class="speaker"><strong>의장</strong> 오늘 회의는 배포한 자료집의 순서에 따라 진행하고자 합니다. 이의 없으십니까?</p>
    <h3>4. 전차 회의록 및 감사 보고</h3><p class="speaker"><strong>의장</strong> 전차 회의록을 보고하고 감사 보고를 듣겠습니다.</p>
    <h3>5. 안건 심의</h3>${agendaScripts || '<p>안건을 입력하면 의안별 진행 문구가 표시됩니다.</p>'}
    <h3>6. 폐회 선언</h3><p class="speaker"><strong>의장</strong> ${blocks(row.closing_message, `이상으로 ${row.title} 폐회를 선언합니다.`)}</p>
  </article>`;
}

function coopNameFor(row, fallback) {
  return row.coop_name || fallback;
}

export function buildPreMeetingDocuments(context) {
  const row = { ...context.row, coop_name: context.coopName };
  if (row.meeting_type === 'GENERAL_ASSEMBLY') {
    return [
      { type: 'MATERIALS', title: `${row.title} 자료집`, content: buildAssemblyMaterials({ ...context, row }) },
      { type: 'SCENARIO', title: `${row.title} 진행 시나리오`, content: buildAssemblyScenario({ ...context, row }) }
    ];
  }
  return [
    { type: 'MATERIALS', title: `${row.title} 회의자료`, content: buildBoardMaterials({ ...context, row }) },
    { type: 'SCENARIO', title: `${row.title} 진행 시나리오`, content: buildBoardScenario({ ...context, row }) }
  ];
}

export function usesChapterEditor(meetingType, documentType) {
  return meetingType === 'GENERAL_ASSEMBLY' && documentType === 'MATERIALS';
}
