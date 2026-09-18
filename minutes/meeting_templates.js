/*
Version: v1.1.1
Change: 2026-09-18 - Render every assigned auditor on a separate electronic-signature line.
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

const money = (value) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;

const sumAmounts = (rows) => (Array.isArray(rows) ? rows : [])
  .reduce((total, item) => total + Number(item?.amount || 0), 0);

function sourceRowsTable(rows, totalLabel = '') {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.length
    ? list.map((item) => `<tr><td>${safe(item?.name || '-')}</td><td class="amount">${money(item?.amount)}</td></tr>`).join('')
    : '<tr><td colspan="2">해당 내역이 없습니다.</td></tr>';
  const total = totalLabel
    ? `<tfoot><tr><th>${safe(totalLabel)}</th><th class="amount">${money(sumAmounts(list))}</th></tr></tfoot>`
    : '';
  return `<table><thead><tr><th>계정과목</th><th>금액</th></tr></thead><tbody>${body}</tbody>${total}</table>`;
}

function previousMinuteBill(source) {
  const prior = source?.previous_minute;
  return {
    key: 'previous-minute',
    title: '전차 총회 의사록 확인의 건',
    background: '전차 총회에서 심의·의결한 내용을 확인하고 기록의 정확성을 점검하기 위함입니다.',
    proposal: prior
      ? `문서함의 「${prior.title || '전차 총회 의사록'}」을 전차 회의록으로 확인합니다.`
      : '문서함에서 앞선 총회 의사록을 찾지 못했습니다. 총회 전에 전차 의사록을 확인해 연결해 주세요.',
    decision: '전차 총회 의사록을 원안대로 확인하여 승인하고자 합니다.',
    attachments: [chapter(
      'previous-minute-source',
      prior ? `전차 회의록 · ${prior.title}` : '전차 회의록 확인',
      prior
        ? `<h1>전차 총회 의사록</h1><p class="source-caption">문서함에서 불러온 문서 · ${safe(prior.title || '')}${prior.doc_no ? ` · ${safe(prior.doc_no)}` : ''}</p><div class="linked-minute">${prior.content || '<p>본문이 없습니다.</p>'}</div>`
        : sourceAttachment('전차 총회 의사록', '문서함에 총회 의사록이 등록되면 가장 최근 문서를 자동으로 불러옵니다.'),
      'minutes'
    )]
  };
}

export function buildAuditReportDraft({ row, coopName, officials, sourceContext }) {
  const closing = sourceContext?.closing || {};
  const fiscalYear = Number(sourceContext?.fiscal_year || row?.fiscal_year || new Date().getFullYear() - 1);
  const auditors = (officials || []).filter((official) => String(official?.role || official?.position || '').trim() === '감사');
  const auditorRows = auditors.length
    ? auditors.map((official) => `<p>감사　${safe(official.name || '(성명)')}　(전자서명)</p>`).join('')
    : '<p>감사　(성명)　(전자서명)</p>';
  const stateLabel = closing.is_closed ? '확정 결산자료' : '가결산 자료';
  const netIncome = Number(closing.net_income || 0);
  return `<article class="audit-report-document">
    <h1>감 사 보 고 서</h1>
    <table><tbody>
      <tr><th>감사 대상</th><td>${safe(coopName)}</td></tr>
      <tr><th>감사 기간</th><td>${fiscalYear}년 1월 1일 ~ ${fiscalYear}년 12월 31일</td></tr>
      <tr><th>감사 범위</th><td>${fiscalYear}년도 회계 및 업무 집행 전반</td></tr>
      <tr><th>검토 자료</th><td>ERP 회계관리의 ${stateLabel}, 사업 집행 자료와 관련 증빙</td></tr>
    </tbody></table>
    <p>본 감사는 협동조합기본법 및 조합 정관에 따라 위 기간의 회계 처리와 업무 집행 상황을 감사하고 그 결과를 보고하기 위해 작성합니다.</p>
    <h2>Ⅰ. 감사 결과</h2>
    <h3>1. 업무 감사</h3>
    <ul>
      <li>총회 및 이사회 의결사항과 사업계획에 따른 업무 집행 내역을 확인하였습니다.</li>
      <li>조합원 명부, 출자금 관리와 주요 계약·행정 절차의 처리 내역을 확인하였습니다.</li>
      <li>감사 확인 결과와 보완 의견을 이 문단에 직접 수정해 작성합니다.</li>
    </ul>
    <h3>2. 회계 감사</h3>
    <ul>
      <li>${fiscalYear}년도 ${stateLabel}의 자산총계는 ${money(closing.total_assets)}, 부채총계는 ${money(closing.total_liabilities)}, 자본총계는 ${money(closing.total_equity)}입니다.</li>
      <li>매출 및 영업외수익은 ${money(Number(closing.total_revenue || 0) + Number(closing.total_other_revenue || 0))}, 비용은 ${money(closing.total_expenses)}, 당기순손익은 ${money(netIncome)}으로 확인됩니다.</li>
      <li>통장, 전표 및 증빙과 결산자료의 일치 여부를 확인한 뒤 감사 의견을 이 문단에 직접 수정해 작성합니다.</li>
    </ul>
    <h2>Ⅱ. 검토한 결산자료</h2>
    <p>${fiscalYear}년도 결산보고서의 세부 내역입니다. 감사는 아래 재무상태표와 손익계산서를 확인한 뒤 감사보고서 본문을 수정하고 전자서명합니다.</p>
    <h3>1. 재무상태표</h3>
    <h4>자산</h4>${sourceRowsTable(closing.assets, '자산총계')}
    <h4>부채</h4>${sourceRowsTable(closing.liabilities, '부채총계')}
    <h4>자본</h4>${sourceRowsTable(closing.equity, '자본총계')}
    <h3>2. 손익계산서</h3>
    <h4>매출</h4>${sourceRowsTable(closing.revenue, '매출 합계')}
    <h4>영업외수익</h4>${sourceRowsTable(closing.other_revenue, '영업외수익 합계')}
    <h4>비용</h4>${sourceRowsTable(closing.expenses, '비용 합계')}
    <table><tbody><tr><th>당기순이익(손실)</th><td class="amount"><strong>${money(netIncome)}</strong></td></tr></tbody></table>
    <h2>Ⅲ. 종합 의견</h2>
    <p>업무 집행 및 회계 처리가 관련 법령과 정관, 총회·이사회 의결에 따라 적정하게 이루어졌는지 검토한 결과와 개선 권고사항을 감사가 직접 작성합니다.</p>
    <p class="audit-signature-date">${dateText(row?.meeting_date || '')}</p>
    <div class="audit-signers"><strong>${safe(coopName)}</strong>${auditorRows}</div>
  </article>`;
}

function closingReportChapters(sourceContext) {
  const closing = sourceContext?.closing || {};
  const fiscalYear = Number(sourceContext?.fiscal_year || closing.fiscal_year || new Date().getFullYear() - 1);
  const status = closing.is_closed ? '결산 완료' : '가결산 · 결산 실행 전';
  const netIncome = Number(closing.net_income || 0);
  return [
    chapter('closing-balance-sheet', `${fiscalYear}년 재무상태표`, `<h1>${fiscalYear}년 재무상태표</h1>
      <p class="source-caption">ERP 회계관리에서 불러온 ${safe(status)} 자료 · 단위: 원</p>
      <h2>자산</h2>${sourceRowsTable(closing.assets, '자산총계')}
      <h2>부채</h2>${sourceRowsTable(closing.liabilities, '부채총계')}
      <h2>자본</h2>${sourceRowsTable(closing.equity, '자본총계')}`, 'financial'),
    chapter('closing-income-statement', `${fiscalYear}년 손익계산서`, `<h1>${fiscalYear}년 손익계산서</h1>
      <p class="source-caption">ERP 회계관리에서 불러온 ${safe(status)} 자료 · 단위: 원</p>
      <h2>매출</h2>${sourceRowsTable(closing.revenue, '매출 합계')}
      <h2>영업외수익</h2>${sourceRowsTable(closing.other_revenue, '영업외수익 합계')}
      <h2>비용</h2>${sourceRowsTable(closing.expenses, '비용 합계')}
      <table><tbody><tr><th>당기순이익(손실)</th><td class="amount"><strong>${money(netIncome)}</strong></td></tr></tbody></table>`, 'financial')
  ];
}

function auditBill({ row, coopName, officials, sourceContext }) {
  const audit = sourceContext?.audit_report;
  const auditContent = audit?.content || buildAuditReportDraft({ row, coopName, officials, sourceContext });
  const statusText = audit
    ? `${audit.status === 'CLOSED' ? '감사 전자서명 완료' : '감사 전자검토·서명 진행 중'} · ${Number(audit.signature_count || 0)}/${Array.isArray(audit.signer_ids) ? audit.signer_ids.length : 0}명`
    : 'ERP에서 감사에게 전자검토를 요청하기 전 초안';
  return {
    key: 'audit-report',
    title: '감사보고서 승인의 건',
    background: '결산자료와 업무 집행에 대한 감사의 검토 결과를 보고받고 승인하기 위함입니다.',
    proposal: `${statusText}입니다. 감사가 수정하고 전자서명한 최종 보고서를 기준으로 심의합니다.`,
    decision: '감사보고서를 원안대로 승인하고자 합니다.',
    attachments: [chapter('audit-report', '감사보고서', `<p class="source-caption">${safe(statusText)}</p>${auditContent}`, 'audit')]
  };
}

function closingBill(sourceContext) {
  const closing = sourceContext?.closing || {};
  const year = Number(sourceContext?.fiscal_year || closing.fiscal_year || new Date().getFullYear() - 1);
  return {
    key: 'closing-report',
    title: `${year}년도 결산보고서 승인의 건`,
    background: `${year}년도 조합의 재무상태와 운영성과를 확정하고 총회의 승인을 받기 위함입니다.`,
    proposal: closing.is_closed
      ? `ERP 회계관리에서 결산 완료된 재무상태표와 손익계산서를 불러왔습니다. 당기순손익은 ${money(closing.net_income)}입니다.`
      : `현재 자료는 결산 실행 전 가결산입니다. 감사 요청과 총회 자료 확정 전에 회계관리에서 ${year}년도 결산을 완료해야 합니다.`,
    decision: `${year}년도 결산보고서를 원안대로 승인하고자 합니다.`,
    attachments: closingReportChapters(sourceContext)
  };
}

function dividendBill(sourceContext) {
  const rows = Array.isArray(sourceContext?.dividend_batches) ? sourceContext.dividend_batches : [];
  if (!rows.length) return null;
  const year = Number(sourceContext?.fiscal_year || new Date().getFullYear() - 1);
  const total = rows.reduce((sum, row) => sum + Number(row?.total_gross_amount || 0), 0);
  const table = `<table><thead><tr><th>배당 회차</th><th>상태</th><th>출자배당</th><th>이용고배당</th><th>합계</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${safe(row.title || `${year}년 배당`)}</td><td>${safe(row.status || '-')}</td><td class="amount">${money(row.capital_dividend_pool)}</td><td class="amount">${money(row.usage_dividend_pool)}</td><td class="amount">${money(row.total_gross_amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">총 배당 예정액</th><th class="amount">${money(total)}</th></tr></tfoot></table>`;
  return {
    key: 'surplus-appropriation',
    title: `${year}년도 이익잉여금 처분 및 배당 승인의 건`,
    background: '결산 후 이익잉여금의 적립·이월·배당 방안을 확정하기 위함입니다.',
    proposal: `배당 관리에 등록된 ${rows.length}개 회차, 총 ${money(total)}의 안을 총회에서 심의합니다.`,
    decision: '이익잉여금 처분 및 배당안을 원안대로 승인하고자 합니다.',
    attachments: [chapter('surplus-appropriation', '이익잉여금 처분 및 배당안', `<h1>${year}년도 이익잉여금 처분 및 배당안</h1>${table}`, 'financial')]
  };
}

function capitalReturnBill(sourceContext) {
  const rows = Array.isArray(sourceContext?.capital_returns) ? sourceContext.capital_returns : [];
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const table = `<table><thead><tr><th>구분</th><th>대상</th><th>반환 심의액</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${safe(row.kind || '-')}</td><td>${safe(row.member_name || '-')}</td><td class="amount">${money(row.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">합계</th><th class="amount">${money(total)}</th></tr></tfoot></table>`;
  return {
    key: 'capital-return',
    title: '감자·탈퇴 조합원 출자금 반환 승인의 건',
    background: '감자 또는 탈퇴로 출자금 반환을 청구한 조합원의 반환 여부와 금액을 총회에서 확정하기 위함입니다.',
    proposal: `ERP 감자·탈퇴 관리에 총회 의결 대기로 등록된 ${rows.length}명, 총 ${money(total)}의 반환안을 심의합니다.`,
    decision: '대상자별 반환 여부와 금액을 심의하여 확정하고자 합니다.',
    attachments: [chapter('capital-return-list', '감자·탈퇴 출자금 반환 대상', `<h1>감자·탈퇴 출자금 반환 심의표</h1>${table}<p>총회 의결 후 실제 확정 결과는 감자·탈퇴 관리에서 대상자별로 기록하고, 완성된 총회 의사록을 근거 문서로 연결합니다.</p>`, 'financial')]
  };
}

function businessPlanDraft(row, sourceContext) {
  const year = Number(String(row?.meeting_date || row?.title || '').match(/(?:19|20)\d{2}/)?.[0] || new Date().getFullYear());
  return `<h1>${year}년 사업계획 및 예산(안)</h1>
    <p class="chapter-subtitle">${safe(row?.title || '정기 대의원총회')}</p>
    <h2>Ⅰ. 사업 목표</h2>
    <blockquote><strong>“시민과 함께 만드는 용인의 햇빛, 에너지 자립의 첫걸음”</strong></blockquote>
    <ul>
      <li><strong>발전소 부지 확보:</strong> 공공부지 및 공영주차장 태양광 설치 추진 (200kW 규모)</li>
      <li><strong>조직 기반 강화:</strong> 신규 조합원 250명 모집, 조합원 교육과 참여 확대</li>
      <li><strong>운영 내실화:</strong> 조합원 운영 시스템 고도화와 예비사회적기업 지정 추진</li>
    </ul>
    <h2>Ⅱ. 주요 사업 계획</h2>
    <h3>1. 햇빛발전소 건립 사업</h3>
    <table><thead><tr><th>구분</th><th>주요 내용</th></tr></thead><tbody>
      <tr><td>후보지 발굴</td><td>용인시 공영주차장, 공공건물, 유휴부지 등 조사</td></tr>
      <tr><td>인허가 추진</td><td>발전사업 허가 및 개발 관련 인허가 진행</td></tr>
      <tr><td>자금 조달</td><td>시민 출자와 정책자금 활용 방안 수립</td></tr>
    </tbody></table>
    <h3>2. 조합원 및 지역사회 협력 사업</h3>
    <ul><li><strong>조합원 교육:</strong> 기후위기 대응 및 에너지전환 교육 운영</li><li><strong>태양광 부지 공모:</strong> 우리 동네 태양광발전소 부지 공모 추진</li></ul>
    <h3>3. 조직 역량 강화 및 대외 협력</h3>
    <ul><li><strong>사회적 가치 확대:</strong> 예비사회적기업 등 조합의 공익성과 지속가능성을 높이는 인증·협력 추진</li><li><strong>지역 협력:</strong> 시민사회와 지역기관, 협동조합 간 공동사업과 교육 기회 발굴</li></ul>
    <h2>Ⅲ. ${year}년도 수지 예산(안)</h2>
    <h3>1. 수입 예산</h3>
    <table><thead><tr><th>항목</th><th>산출 근거</th><th>금액</th></tr></thead><tbody>
      <tr><td>금융차입금</td><td>시설자금 대출</td><td class="amount">280,000,000</td></tr>
      <tr><td>증좌·차입</td><td>부족 사업비 조달</td><td class="amount">65,800,000</td></tr>
      <tr><td>출자금</td><td>신규 조합원 출자</td><td class="amount">25,000,000</td></tr>
      <tr><td>후원금수익</td><td>협력 사업 재원</td><td class="amount">30,000,000</td></tr>
      <tr><td>회비수익</td><td>임원 운영 지원금</td><td class="amount">18,000,000</td></tr>
      <tr><td>사업수익</td><td>발전 및 사업 수익</td><td class="amount">7,200,000</td></tr>
      <tr><th>수입 합계</th><td></td><th class="amount">426,000,000</th></tr>
    </tbody></table>
    <h3>2. 지출 예산</h3>
    <table><thead><tr><th>항목</th><th>산출 근거</th><th>금액</th></tr></thead><tbody>
      <tr><td>시설구축비</td><td>태양광발전소 건립</td><td class="amount">350,000,000</td></tr>
      <tr><td>일반사업비</td><td>인허가, 설계, 감리비</td><td class="amount">15,000,000</td></tr>
      <tr><td>인건비</td><td>사무국 인건비 및 4대보험</td><td class="amount">36,000,000</td></tr>
      <tr><td>운영비</td><td>이자, 통신, 회의, 사무용품</td><td class="amount">9,500,000</td></tr>
      <tr><td>조합원 교육비</td><td>기후위기 및 에너지 교육</td><td class="amount">5,000,000</td></tr>
      <tr><td>예비비</td><td>공사비·물가 변동 대응</td><td class="amount">10,500,000</td></tr>
      <tr><th>지출 합계</th><td></td><th class="amount">426,000,000</th></tr>
    </tbody></table>
    <p>사업 규모나 재원이 크게 달라질 경우 추가경정예산안을 별도로 마련해 승인받습니다.</p>`;
}

function businessPlanBill(row, sourceContext) {
  const year = Number(String(row?.meeting_date || row?.title || '').match(/(?:19|20)\d{2}/)?.[0] || new Date().getFullYear());
  return {
    key: 'business-plan',
    title: `${year}년도 사업계획 및 예산안 승인의 건`,
    background: `${year}년도 사업 목표, 주요 사업과 수지예산을 정하고 총회의 승인을 받기 위함입니다.`,
    proposal: '기존 총회 자료집의 사업계획·예산 초안을 불러왔습니다. 목표, 사업내용, 산출근거와 금액을 현재 계획에 맞게 수정해 심의합니다.',
    decision: `${year}년도 사업계획 및 예산안을 원안대로 승인하고자 합니다.`,
    attachments: [chapter('business-plan', `${year}년 사업계획 및 예산안`, businessPlanDraft(row, sourceContext), 'business-plan')]
  };
}

function additionalAgendaBill(agenda, index) {
  return {
    key: `additional-${agenda?.id || index + 1}`,
    title: agenda?.title || '추가 의안 제목을 입력하세요',
    background: agenda?.background || '제안사유를 입력하세요.',
    proposal: agenda?.proposal_text || agenda?.summary || '주요 내용을 입력하세요.',
    decision: agenda?.decision_draft || '심의 결과에 따라 의결하고자 합니다.',
    sourceAgenda: agenda,
    attachments: agenda?.requires_article_comparison ? [chapter(
      `articles-comparison-${agenda?.id || 'new'}`,
      `${agenda?.title || '규정 변경'} · 신구조문 대비표`,
      sourceAttachment('신구조문 대비표', '정관·규약·규정의 변경 전·후 조문과 변경 이유를 정리합니다.', [['현행', '기존 조문을 입력하세요.'], ['개정안', '변경할 조문을 입력하세요.'], ['변경 이유', '개정 이유를 입력하세요.']]),
      'comparison'
    )] : []
  };
}

export function buildAssemblyAgendaPlan({ row, agendas, coopName, officials, sourceContext }) {
  return [
    previousMinuteBill(sourceContext),
    auditBill({ row, coopName, officials, sourceContext }),
    closingBill(sourceContext),
    dividendBill(sourceContext),
    capitalReturnBill(sourceContext),
    businessPlanBill(row, sourceContext),
    ...(agendas || []).map(additionalAgendaBill)
  ].filter(Boolean).map((item, index) => ({ ...item, number: index + 1 }));
}

function assemblyOrder(row, plan) {
  const agendaItems = (plan || []).map((agenda) => `<li><strong>제${agenda.number}호</strong> ${safe(agenda.title)}</li>`).join('');
  return `<h1>${safe(row.title)} 순서</h1>
    <p class="chapter-subtitle">${dateText(row.meeting_date)} · ${timeText(row)} · ${safe(row.location || '장소 미정')}</p>
    <h2>[제1부] 개회식</h2>
    <ol><li>개회 선언</li><li>국민의례</li><li>이사장 인사</li><li>기념 촬영</li></ol>
    <h2>[제2부] 본회의</h2>
    <ol><li>성원 보고 및 개회 선언</li><li>서기 및 기명날인인 선임</li><li>의사일정 확정</li><li>부의 안건 심의</li></ol>
    <ol class="bill-list">${agendaItems || '<li>안건을 입력하면 이곳에 순서대로 표시됩니다.</li>'}</ol>
    <p>마지막 순서　폐회 선언</p>
    ${row.document_notes ? `<h2>참고사항</h2><p>${blocks(row.document_notes)}</p>` : ''}`;
}

function assemblyBill(item) {
  return `<h1>제${item.number}호 의안</h1>
    <h2>${safe(item.title)}</h2>
    <h3>1. 제안사유</h3><p>${blocks(item.background)}</p>
    <h3>2. 주요내용</h3><p>${blocks(item.proposal)}</p>
    <h3>3. 의결 주문</h3><p>${blocks(item.decision)}</p>
    ${item.sourceAgenda?.document_notes ? `<h3>자료 메모</h3><p>${blocks(item.sourceAgenda.document_notes)}</p>` : ''}`;
}

function sourceAttachment(title, intro, rows = []) {
  return `<h1>${safe(title)}</h1><p>${safe(intro)}</p>${rows.length ? `<table><thead><tr><th>구분</th><th>내용</th></tr></thead><tbody>${rows.map(([key, value]) => `<tr><th>${safe(key)}</th><td>${safe(value)}</td></tr>`).join('')}</tbody></table>` : '<p>이 챕터를 선택해 기존 자료나 최신 수치를 입력하세요.</p>'}`;
}

export function buildAssemblyMaterials({ row, agendas, coopName, company, officials, sourceContext }) {
  const plan = buildAssemblyAgendaPlan({ row, agendas, coopName, officials, sourceContext });
  const chapters = [
    chapter('cover', '표지', `<div class="assembly-cover"><p class="org-name">${safe(coopName)}</p><p>${safe(String(row.meeting_date || '').slice(0, 4) || new Date().getFullYear())}년도</p><h1>${safe(row.title)}</h1><dl><dt>일시</dt><dd>${dateText(row.meeting_date)} ${timeText(row)}</dd><dt>장소</dt><dd>${safe(row.location || '미정')}</dd></dl></div>`, 'cover'),
    chapter('order', '총회 순서', assemblyOrder(row, plan), 'order'),
    ...plan.flatMap((item) => [
      chapter(`bill-${item.number}-${item.key}`, `제${item.number}호 의안 ${item.title}`, assemblyBill(item), 'bill'),
      ...(item.attachments || [])
    ]),
    chapter('back-cover', '뒷표지', `<div class="assembly-back"><h1>햇빛으로 만드는<br>우리의 내일</h1><p>함께해주신 조합원 여러분 감사합니다.</p><hr><h2>${safe(coopName)}</h2><p>${safe(company?.homepage || 'https://www.yonginsolar.kr')}</p><p>${safe(company?.address || '')}</p><p>${safe(company?.phone || '')}　${safe(company?.email || '')}</p></div>`, 'back')
  ];
  return chapters.join('');
}

export function buildAssemblyScenario({ row, agendas, chairName, coopName, officials, sourceContext }) {
  const facilitator = row.facilitator_name || '사무국장';
  const plan = buildAssemblyAgendaPlan({ row, agendas, coopName, officials, sourceContext });
  const agendaScripts = plan.map((item) => `
    <h3>제${item.number}호 의안 ${safe(item.title)}</h3>
    <p class="speaker"><strong>의장</strong> 제${item.number}호 의안, 「${safe(item.title)}」을 상정합니다. ${safe(facilitator)} 제안 설명해 주십시오.</p>
    <p class="speaker"><strong>${safe(facilitator)}</strong> ${blocks(item.sourceAgenda?.office_report || item.proposal, '자료집 내용에 따라 설명드리겠습니다.')}</p>
    <p class="speaker"><strong>의장</strong> 질문이나 의견 있으십니까?</p>
    <p class="speaker"><strong>의장</strong> ${blocks(item.decision, '원안대로 승인하는 데 이의 없으십니까?')}</p>
    ${item.sourceAgenda?.scenario_notes ? `<p class="action"><strong>진행 참고</strong> ${blocks(item.sourceAgenda.scenario_notes)}</p>` : ''}`).join('');
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
    <h3>4. 안건 심의</h3>${agendaScripts || '<p>안건을 입력하면 의안별 진행 문구가 표시됩니다.</p>'}
    <h3>5. 폐회 선언</h3><p class="speaker"><strong>의장</strong> ${blocks(row.closing_message, `이상으로 ${row.title} 폐회를 선언합니다.`)}</p>
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
