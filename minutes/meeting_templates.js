/*
Version: v1.4.0
Change: 2026-09-19 - Build book-ready regular-assembly materials from editable business, budget and closing sources.
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

const dateTimeText = (value) => {
  if (!value) return '서명 시각 미기록';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
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
  const signatures = Array.isArray(prior?.signatures) ? prior.signatures : [];
  const signatureRows = signatures.length
    ? signatures.map((signature) => `<div class="book-signature-card">
        <span class="book-signature-preview" data-signature-preview-path="${safe(signature.preview_path || '')}">
          <span>전자서명 완료</span>
        </span>
        <div><strong>${safe(signature.signer_name || '서명자')}</strong>${signature.signer_role ? ` · ${safe(signature.signer_role)}` : ''}<small>${safe(dateTimeText(signature.signed_at))}</small></div>
      </div>`).join('')
    : '<p class="book-signature-empty">저장된 전자서명이 없습니다.</p>';
  return {
    key: 'previous-minute',
    title: '전차 총회 의사록 확인의 건',
    background: '전차 총회에서 심의·의결한 내용을 확인하고 기록의 정확성을 점검하기 위함입니다.',
    proposal: prior
      ? '전차 의사록을 확인합니다.'
      : '문서함에서 앞선 총회 의사록을 찾지 못했습니다. 총회 전에 전차 의사록을 확인해 연결해 주세요.',
    decision: '전차 총회 의사록을 원안대로 확인하여 승인하고자 합니다.',
    attachments: prior ? [chapter(
      'previous-minute-source',
      `전차 회의록 · ${prior.title}`,
      `<h1>전차 총회 의사록</h1><p class="source-caption">문서함에서 불러온 문서 · ${safe(prior.title || '')}${prior.doc_no ? ` · ${safe(prior.doc_no)}` : ''}</p><div class="linked-minute">${prior.content || '<p>본문이 없습니다.</p>'}</div><section class="book-signature-section"><h2>전자서명 확인</h2><p>아래 정보는 문서함에 보관된 전차 총회 의사록의 전자서명 기록입니다.</p><div class="book-signature-grid">${signatureRows}</div></section>`,
      'minutes'
    )] : []
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
  const report = sourceContext?.closing_report;
  const fiscalYear = Number(sourceContext?.fiscal_year || new Date().getFullYear() - 1);
  const sections = report?.report_payload?.sections || {};
  const generatedAt = report?.generated_at ? dateTimeText(report.generated_at) : '';
  if (!report || !sections.balance_sheet_html || !sections.income_statement_html) {
    return [];
  }
  const caption = `<p class="source-caption">회계관리에서 ${safe(generatedAt)} 생성·저장한 결산보고서</p>`;
  return [
    chapter('closing-tax-adjustment', `${fiscalYear}년 재무제표 및 조정명세서`, `<h1>${fiscalYear}년도 결산보고서</h1>${caption}<div class="closing-report-snapshot"><div class="rpt-title">재무제표 및 조정명세서</div>${sections.header_html || ''}${sections.tax_html || ''}</div>`, 'financial'),
    chapter('closing-balance-sheet', `${fiscalYear}년 재무상태표`, `<h1>${fiscalYear}년 재무상태표</h1>${caption}<div class="closing-report-snapshot">${sections.balance_sheet_html || ''}</div>`, 'financial'),
    chapter('closing-income-statement', `${fiscalYear}년 손익계산서`, `<h1>${fiscalYear}년 손익계산서</h1>${caption}<div class="closing-report-snapshot">${sections.income_statement_html || ''}</div>`, 'financial'),
    chapter('closing-surplus-statement', `${fiscalYear}년 이익잉여금처분계산서`, `<h1>${fiscalYear}년 이익잉여금처분계산서</h1>${caption}<div class="closing-report-snapshot">${sections.surplus_html || ''}</div>`, 'financial')
  ];
}

function auditBill({ row, coopName, officials, sourceContext }) {
  const audit = sourceContext?.audit_report;
  const auditContent = audit?.content || (sourceContext?.closing_report
    ? buildAuditReportDraft({ row, coopName, officials, sourceContext })
    : '');
  const statusText = audit
    ? `${audit.status === 'CLOSED' ? '감사 전자서명 완료' : '감사 전자검토·서명 진행 중'} · ${Number(audit.signature_count || 0)}/${Array.isArray(audit.signer_ids) ? audit.signer_ids.length : 0}명`
    : '';
  return {
    key: 'audit-report',
    title: '감사보고서 승인의 건',
    background: '결산자료와 업무 집행에 대한 감사의 검토 결과를 보고받고 승인하기 위함입니다.',
    proposal: statusText ? `${statusText}입니다. 감사가 수정하고 전자서명한 최종 보고서를 기준으로 심의합니다.` : '',
    decision: '감사보고서를 원안대로 승인하고자 합니다.',
    attachments: auditContent
      ? [chapter('audit-report', '감사보고서', `${statusText ? `<p class="source-caption">${safe(statusText)}</p>` : ''}${auditContent}`, 'audit')]
      : []
  };
}

function listFromLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•·]\s*/, ''))
    .filter(Boolean);
}

function businessReportChapter(row, sourceContext) {
  const data = row?.assembly_booklet_data || {};
  const year = Number(sourceContext?.fiscal_year || row?.fiscal_year || new Date().getFullYear() - 1);
  const intro = String(data.business_report_intro || '').trim();
  const highlights = listFromLines(data.business_report_highlights);
  if (!intro && !highlights.length) return [];
  return [chapter(
    'business-report',
    `${year}년도 주요 사업 추진 실적`,
    `<h1>${year}년도 주요 사업 추진 실적</h1>
      ${intro ? `<p class="chapter-lead">${blocks(intro)}</p>` : ''}
      ${highlights.length ? `<ol class="business-report-list">${highlights.map((item) => `<li>${safe(item)}</li>`).join('')}</ol>` : ''}`,
    'business-report'
  )];
}

function closingBill(row, sourceContext) {
  const closing = sourceContext?.closing || {};
  const report = sourceContext?.closing_report;
  const year = Number(sourceContext?.fiscal_year || closing.fiscal_year || new Date().getFullYear() - 1);
  const data = row?.assembly_booklet_data || {};
  const businessIntro = String(data.business_report_intro || '').trim();
  const businessHighlights = listFromLines(data.business_report_highlights);
  const hasClosingSummary = Object.keys(closing).length > 0;
  const businessText = businessIntro || businessHighlights.length
    ? `${businessIntro}${businessIntro && businessHighlights.length ? ' ' : ''}${businessHighlights.length ? `주요 추진 실적 ${businessHighlights.length}건을 보고합니다.` : ''}`
    : '사업보고 내용을 입력해 주세요.';
  const closingText = hasClosingSummary
    ? `당기순손익 ${money(closing.net_income)}, 수익 ${money(Number(closing.total_revenue || 0) + Number(closing.total_other_revenue || 0))}, 비용 ${money(closing.total_expenses)}입니다.`
    : '회계관리의 결산자료를 연결하거나 결산보고서 PDF를 첨부해 주세요.';
  const appropriationParts = hasClosingSummary
    ? [
        `법정적립금 ${money(closing.legal_reserve)}`,
        Number(closing.voluntary_reserve || 0) ? `임의적립금 ${money(closing.voluntary_reserve)}` : '',
        `차기이월 이익잉여금 ${money(closing.carried_forward)}`
      ].filter(Boolean).join(', ')
    : '결산자료가 연결되면 적립금과 차기이월액을 표시합니다.';
  return {
    key: 'closing-report',
    title: `${year}년도 사업보고 및 결산 승인의 건`,
    background: `${year}년도 사업 추진 실적과 재무 결산 내역을 보고하고 총회의 승인을 받기 위함입니다.`,
    proposalHtml: `<dl class="bill-major-content">
      <dt>사업보고</dt><dd>${safe(businessText)}</dd>
      <dt>결산개요</dt><dd>${safe(closingText)}</dd>
      <dt>잉여금 처분</dt><dd>${safe(appropriationParts)}</dd>
    </dl>`,
    proposal: `사업보고: ${businessText}\n결산개요: ${closingText}\n잉여금 처분: ${appropriationParts}`,
    decision: `${year}년도 사업보고 및 결산을 승인하고자 합니다.`,
    attachments: [...businessReportChapter(row, sourceContext), ...closingReportChapters(sourceContext)]
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

function budgetRowsTable(rows, totalLabel) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.length
    ? list.map((item) => `<tr><td>${safe(item?.name || '-')}</td><td>${safe(item?.basis || '-')}</td><td class="amount">${money(item?.amount)}</td></tr>`).join('')
    : '<tr><td colspan="3">입력된 예산 항목이 없습니다.</td></tr>';
  return `<table><thead><tr><th>항목</th><th>산출 근거</th><th>금액</th></tr></thead><tbody>${body}</tbody><tfoot><tr><th colspan="2">${safe(totalLabel)}</th><th class="amount">${money(sumAmounts(list))}</th></tr></tfoot></table>`;
}

function businessPlanDraft(row) {
  const year = Number(String(row?.meeting_date || row?.title || '').match(/(?:19|20)\d{2}/)?.[0] || new Date().getFullYear());
  const data = row?.assembly_booklet_data || {};
  const goal = String(data.business_plan_goal || '').trim();
  const details = listFromLines(data.business_plan_details);
  const income = Array.isArray(data.income_budget) ? data.income_budget : [];
  const expense = Array.isArray(data.expense_budget) ? data.expense_budget : [];
  const incomeTotal = sumAmounts(income);
  const expenseTotal = sumAmounts(expense);
  const difference = incomeTotal - expenseTotal;
  return `<h1>${year}년 사업계획 및 예산(안)</h1>
    <p class="chapter-subtitle">${safe(row?.title || '정기 대의원총회')}</p>
    <h2>Ⅰ. 사업 목표</h2>
    ${goal ? `<blockquote><strong>${blocks(goal)}</strong></blockquote>` : '<p>사업 목표를 입력해 주세요.</p>'}
    <h2>Ⅱ. 주요 사업 계획</h2>
    ${details.length ? `<ol>${details.map((item) => `<li>${safe(item)}</li>`).join('')}</ol>` : '<p>주요 사업 계획을 입력해 주세요.</p>'}
    <h2>Ⅲ. ${year}년도 수지 예산(안)</h2>
    <h3>1. 수입 예산</h3>${budgetRowsTable(income, '수입 합계')}
    <h3>2. 지출 예산</h3>${budgetRowsTable(expense, '지출 합계')}
    <p class="budget-balance ${difference === 0 ? 'is-balanced' : 'is-unbalanced'}">${difference === 0 ? '수입과 지출 합계가 일치합니다.' : `수입·지출 합계 차액 ${money(Math.abs(difference))}을 조정해야 합니다.`}</p>
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
    attachments: [chapter('business-plan', `${year}년 사업계획 및 예산안`, businessPlanDraft(row), 'business-plan')]
  };
}

function borrowingLimitBill(row) {
  const data = row?.assembly_booklet_data || {};
  const year = Number(String(row?.meeting_date || row?.title || '').match(/(?:19|20)\d{2}/)?.[0] || new Date().getFullYear());
  const limit = Number(data.borrowing_limit || 0);
  const rule = String(data.borrowing_rule || '').trim();
  const purpose = String(data.borrowing_purpose || '').trim() || '조합 사업 추진에 필요한 자금 조달';
  return {
    key: 'borrowing-limit',
    title: `${year}년도 차입금 최고한도액 결정의 건`,
    background: `${year}년도 사업계획을 수행하는 데 필요한 차입의 최고한도를 총회에서 정하기 위함입니다.`,
    proposal: `차입금 최고한도: ${limit > 0 ? money(limit) : (rule || '한도액 또는 산정 기준을 입력해 주세요.')}\n사용 목적: ${purpose}`,
    decision: `${year}년도 차입금 최고한도액을 심의하여 결정하고자 합니다.`,
    attachments: []
  };
}

function otherAgendaBill(row) {
  const data = row?.assembly_booklet_data || {};
  const detail = String(data.other_agenda_text || '').trim();
  return {
    key: 'other-agenda',
    title: '기타안건',
    background: '총회에서 추가로 공유하거나 논의할 사항을 확인하기 위함입니다.',
    proposal: detail || '총회 당일 제안되는 기타 사항을 논의합니다.',
    decision: '제안된 기타 사항을 논의하고 필요한 경우 처리 방향을 정합니다.',
    attachments: []
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
  if (row?.assembly_kind === 'EXTRAORDINARY') {
    return (agendas || []).map(additionalAgendaBill).filter(Boolean).map((item, index) => ({ ...item, number: index + 1 }));
  }
  return [
    previousMinuteBill(sourceContext),
    auditBill({ row, coopName, officials, sourceContext }),
    closingBill(row, sourceContext),
    dividendBill(sourceContext),
    capitalReturnBill(sourceContext),
    businessPlanBill(row, sourceContext),
    borrowingLimitBill(row),
    ...(agendas || []).map(additionalAgendaBill),
    otherAgendaBill(row)
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
    <h3>2. 주요내용</h3>${item.proposalHtml || `<p>${blocks(item.proposal)}</p>`}
    ${item.sourceAgenda?.document_notes ? `<h3>자료 메모</h3><p>${blocks(item.sourceAgenda.document_notes)}</p>` : ''}`;
}

function sourceAttachment(title, intro, rows = []) {
  return `<h1>${safe(title)}</h1><p>${safe(intro)}</p>${rows.length ? `<table><thead><tr><th>구분</th><th>내용</th></tr></thead><tbody>${rows.map(([key, value]) => `<tr><th>${safe(key)}</th><td>${safe(value)}</td></tr>`).join('')}</tbody></table>` : '<p>이 챕터를 선택해 기존 자료나 최신 수치를 입력하세요.</p>'}`;
}

export function buildAssemblyMaterials({ row, agendas, coopName, company, officials, sourceContext }) {
  const plan = buildAssemblyAgendaPlan({ row, agendas, coopName, officials, sourceContext });
  const chapters = [
    chapter('cover', '표지', `<div class="assembly-cover"><p class="org-name">${safe(coopName)}</p><p>${safe(String(row.meeting_date || '').slice(0, 4) || new Date().getFullYear())}년도</p><h1>${safe(row.title)}</h1><dl><dt>일시</dt><dd>${dateText(row.meeting_date)} ${timeText(row)}</dd><dt>장소</dt><dd>${safe(row.location || '미정')}</dd></dl></div>`, 'cover'),
    chapter('front-blank-1', '표지 뒤 여백 1', '<div class="assembly-book-blank" aria-label="표지 뒤 여백 1"></div>', 'book-blank front-blank'),
    chapter('front-blank-2', '표지 뒤 여백 2', '<div class="assembly-book-blank" aria-label="표지 뒤 여백 2"></div>', 'book-blank front-blank'),
    chapter('front-blank-3', '표지 뒤 여백 3', '<div class="assembly-book-blank" aria-label="표지 뒤 여백 3"></div>', 'book-blank front-blank'),
    chapter('order', '총회 순서', assemblyOrder(row, plan), 'order'),
    ...plan.flatMap((item) => [
      chapter(`bill-${item.number}-${item.key}`, `제${item.number}호 의안 ${item.title}`, assemblyBill(item), 'bill'),
      ...(item.attachments || [])
    ]),
    chapter('rear-blank-1', '뒷표지 앞 여백 1', '<div class="assembly-book-blank" aria-label="뒷표지 앞 여백 1"></div>', 'book-blank rear-blank'),
    chapter('rear-blank-2', '뒷표지 앞 여백 2', '<div class="assembly-book-blank" aria-label="뒷표지 앞 여백 2"></div>', 'book-blank rear-blank'),
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
