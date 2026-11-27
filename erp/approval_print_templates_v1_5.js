/* v1.3.1 — 승인 본문과 첨부별 출력 페이지. 출력 요청 시에만 로드한다. */
(function(root){
    'use strict';
function buildApprovalInsurancePrintSectionHtml(doc) {
    const model = buildApprovalInsuranceTableModel(doc);
    if (!model) return '';
    const monthLabel = model.billingMonth ? formatYearMonthLabel(model.billingMonth) : '귀속월 미입력';
    const bodyRows = model.rows.map((row) => `
        <tr>
          <th scope="row">${escapeHtml(row.label)}</th>
          <td>${row.count == null ? '—' : escapeHtml(`${row.count}명`)}</td>
          <td>${escapeHtml(`${formatMoney(row.gross)}원`)}</td>
          <td class="support-cell">${row.support > 0 ? escapeHtml(`${formatMoney(row.support)}원`) : '—'}</td>
          <td>${escapeHtml(`${formatMoney(row.net)}원`)}</td>
        </tr>
    `).join('');
    return `
        <div class="section-title">4대보험 납부 요약</div>
        <div class="insurance-print-meta">${escapeHtml(monthLabel)} · ${escapeHtml(model.paymentLabel)}</div>
        <table class="insurance-print-table" aria-label="4대보험 납부 요약">
          <thead><tr><th>보험 항목</th><th>고지인원</th><th>고지 금액</th><th>지원·충당 차감</th><th>결재 금액</th></tr></thead>
          <tbody>${bodyRows}</tbody>
          <tfoot><tr><th scope="row">합계</th><td>—</td><td>${escapeHtml(`${formatMoney(model.grossTotal)}원`)}</td><td>${escapeHtml(`${formatMoney(model.supportTotal)}원`)}</td><td>${escapeHtml(`${formatMoney(model.netTotal)}원`)}</td></tr></tfoot>
        </table>
    `;
}

function buildApprovalWithholdingPrintSectionHtml(doc) {
    const value = getApprovalWithholdingSnapshot(doc);
    if (!value) return '';
    return `
      <div class="section-title">급여 원천세 신고·납부 요약</div>
      <table class="insurance-print-table" aria-label="급여 원천세 신고·납부 요약">
        <thead><tr><th>구분</th><th>급여 계산액</th><th>정산 반영</th><th>실제 신고·납부액</th></tr></thead>
        <tbody>
          <tr><th>국세 · 근로소득세</th><td>${escapeHtml(`${formatMoney(value.calculated_income_tax)}원`)}</td><td>${escapeHtml(`${formatMoney(value.adjustment_income)}원`)}</td><td>${escapeHtml(`${formatMoney(value.actual_national_tax)}원`)}</td></tr>
          <tr><th>지방세 · 지방소득세</th><td>${escapeHtml(`${formatMoney(value.calculated_local_tax)}원`)}</td><td>${escapeHtml(`${formatMoney(value.adjustment_local)}원`)}</td><td>${escapeHtml(`${formatMoney(value.actual_local_tax)}원`)}</td></tr>
        </tbody>
        <tfoot><tr><th colspan="3">${escapeHtml(`${formatYearMonthLabel(value.payment_month)} 지급분 · 납부 예정일 ${value.due_date || '-'}`)}</th><td>${escapeHtml(`${formatMoney(value.total_amount)}원`)}</td></tr></tfoot>
      </table>
      ${value.adjustment_reason ? `<div class="content-box" style="min-height:0;"><strong>신고액 조정 사유:</strong> ${escapeHtml(value.adjustment_reason)}</div>` : ''}
    `;
}

function buildPhysicalPrintHtml(doc) {
    const rawType = String(doc.doc_type || '');
    const rawDrafter = String(doc.drafter_name || '');
    const isExpenseDoc = rawType.startsWith('지출결의');
    const isProposalDoc = rawType.startsWith('일반품의');
    const isNoticeDoc = rawType.startsWith('공문');
    const docHeading = isExpenseDoc ? '지출결의서' : (isProposalDoc ? '품의서' : '결재 문서');
    const sectionHeading = isExpenseDoc ? '결재 사유 / 집행 근거' : (isProposalDoc ? '품의 사유 / 추진 근거' : '결재 사유 / 본문');
    const safeType = escapeHtml(formatApprovalDocTypeLabel(doc || rawType));
    const safeDrafter = escapeHtml(rawDrafter);
    const safeDocHeading = escapeHtml(docHeading);
    const safeSectionHeading = escapeHtml(sectionHeading);
    const safeDate = escapeHtml(formatApprovalKstDateISO(doc.created_at, ''));
    const relId = toPositiveDocId(doc.related_doc_id);
    const safeRelDocId = relId ? String(relId) : '';
    const relatedDoc = doc?._related_doc && typeof doc._related_doc === 'object'
        ? doc._related_doc
        : null;
    const amountDisplay = getApprovalAmountDisplayPayload(doc);
    const safeAmountMain = escapeHtml(amountDisplay.mainText || '');
    const safeAmountSub = amountDisplay.subText ? escapeHtml(amountDisplay.subText) : '';
    const safeAmountLabel = escapeHtml(amountDisplay.labelText || '금액');
    const noticeParts = isNoticeDoc
        ? splitNoticeApprovalContent(doc.content || '')
        : { approvalMemo: '', publicBody: String(doc.content || '') };
    const noticePublicBody = isNoticeDoc ? noticeParts.publicBody : String(doc.content || '');
    const noticeApprovalMemo = isNoticeDoc ? noticeParts.approvalMemo : '';
    const renderedBodySource = stripApprovalWithholdingTextAppendix(stripApprovalInsuranceTextAppendix(
        isNoticeDoc ? (noticePublicBody || '') : (doc.content || ''),
        doc
    ), doc);
    const allowHtmlPrintContent = isApprovalHtmlEditorType(rawType) || isNoticeDoc;
    const renderedContent = allowHtmlPrintContent
        ? renderApprovalContent(renderedBodySource, true)
        : escapeHtml(renderedBodySource || '').replace(/\n/g, '<br>');
    const renderedNoticeMemo = isNoticeDoc && noticeApprovalMemo
        ? escapeHtml(noticeApprovalMemo).replace(/\n/g, '<br>')
        : '';
    const noticeMemoSectionHtml = renderedNoticeMemo
        ? `<div class="section-title">결재 요청 메모 (내부)</div><div class="content-box" style="min-height: 0;">${renderedNoticeMemo}</div>`
        : '';
    const safeDocNo = escapeHtml(doc.doc_no || '');
    const safeReceiver = escapeHtml(doc.receiver || '');
    const safeVia = escapeHtml(doc.via || '');
    const auxInfoLabel = isNoticeDoc ? '수신/경유' : '지급정보';
    const safeAuxInfoLabel = escapeHtml(auxInfoLabel);
    const shouldShowAmount = isExpenseDoc || !!amountDisplay.showAmount;
    const files=Array.isArray(doc._printAttachments)?doc._printAttachments:[];
    const attachmentItemsHtml=files.map(item=>`<li><strong>${escapeHtml(item.name)}</strong>${item.receipt?' · 실제 집행 영수증':''}
        <div class="${item.error?'attachment-error':''}">${item.error?escapeHtml(item.error):`포함 · ${item.pages.length}쪽`}</div></li>`).join('');
    const attachmentSheets=files.flatMap((item,i)=>item.pages.map((page,j)=>`
        <section class="attachment-sheet" data-file="${i+1}" data-page="${j+1}">
          <header>첨부 ${i+1} · ${escapeHtml(item.name.length>150?item.name.slice(0,149)+'…':item.name)}${item.receipt?' · 실제 집행 영수증':''} · ${j+1}/${item.pages.length}쪽</header>
          <img src="${escapeHtml(page.src)}" alt="첨부 ${i+1}, ${j+1}쪽">
        </section>`)).join('');
    const execution=doc._printExecution;
    const executionSectionHtml=execution?`
        <section class="execution-print" aria-label="실제 집행">
          <div class="section-title">실제 집행</div>
          <div class="attach-box">
            ${execution.error?`<div class="attachment-error">${escapeHtml(execution.error)}</div>`:`
            <div><strong>결제금액:</strong> ${escapeHtml(execution.amount)}</div>
            <div><strong>결제수단:</strong> ${escapeHtml(execution.method)}</div>
            ${execution.reason?`<div><strong>차액 사유:</strong> ${escapeHtml(execution.reason)}</div>`:''}
            `}
          </div>
        </section>`:'';
    const incomplete=files.some(item=>item.error)||Boolean(execution?.error);

    const attachmentSectionHtml = attachmentItemsHtml
        ? `
            <div class="section-title">첨부파일</div>
            <div class="attach-box">
              <ul class="attach-list">${attachmentItemsHtml}</ul>
            </div>
          `
        : '';
    const insuranceSectionHtml = buildApprovalInsurancePrintSectionHtml(doc);
    const withholdingSectionHtml = buildApprovalWithholdingPrintSectionHtml(doc);

    let rawTitle = String(doc.title || '');
    if (rawDrafter) {
        const suffix = `- ${rawDrafter}`;
        if (rawTitle.includes(suffix)) {
            rawTitle = rawTitle.replace(suffix, '').trim();
        }
    }
    const safeTitle = escapeHtml(rawTitle);

    const emptyText = '<span class="text-muted-light">-</span>';
    const approvalLine = Array.isArray(doc.approval_line) ? doc.approval_line.filter(step => step && typeof step === 'object' && !Array.isArray(step)) : [];
    const processingTime = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const savedTime = value => {
        if (!value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : escapeHtml(processingTime.format(date));
    };
    const approvalEntries = [{position:'기안', name:rawDrafter, label:'기안', style:'drafted', date:savedTime(doc.created_at)}];
    const separate = approvalLine[0]?.secretary_decision;
    approvalLine.forEach(step => {
        const physical = doc.status === '실물결재완료' && step.status === '승인'
            && step.comment === '실물결재 확인' && !!doc.physical_approved_at
            && Date.parse(step.processed_at) === Date.parse(doc.physical_approved_at);
        const isSeparate = separate?.kind === 'separate_chair_approval' && step === approvalLine.at(-1)
            && step.status === '전결참고';
        const label = isSeparate ? '별도 승인' : physical ? '실물결재 확인' : step.status === '승인' ? (step.stage === 'review' ? '검토' : '승인')
            : step.status === '반려' ? '반려' : step.status === '대기' ? '대기' : '';
        const style = isSeparate || step.status === '승인' ? 'approved' : step.status === '반려' ? 'rejected' : 'pending';
        approvalEntries.push({
            position: String(step.position || '').trim() || '결재',
            name: String(step.name || '').trim(),
            label, style,
            date: isSeparate ? escapeHtml([separate.approved_on, separate.recorded_by && separate.recorded_by+' 기록'].filter(Boolean).join(' · ')) : step.status === '승인' || step.status === '반려' ? savedTime(step.processed_at) : '',
            automaticRule: step.jeongyeol_applied === true && step.jeongyeol_mode === 'AUTO'
        });
    });
    const renderApprovalTable = entries => `<table class="approval-table" aria-label="결재 기록">
            <thead><tr>${entries.map(entry=>`<th>${escapeHtml(entry.position)}</th>`).join('')}</tr></thead>
            <tbody><tr>${entries.map(entry=>`<td class="approval-cell">
                <div class="approval-name">${escapeHtml(entry.name) || emptyText}</div>
                <div class="stamp-wrap">${entry.label ? `<div class="stamp ${entry.style}">${entry.label}</div>` : ''}
                ${entry.date ? `<div class="stamp-date">${entry.date}</div>` : ''}
                ${entry.automaticRule ? '<div class="stamp-date">전결 자동 적용</div>' : ''}</div></td>`).join('')}</tr></tbody>
        </table>`;
    const approvalTables = [];
    const stepsPerRow = approvalEntries.length > 5
        ? Math.ceil(approvalEntries.length / 2)
        : 5;
    for (let i=0; i<approvalEntries.length; i+=stepsPerRow) {
        approvalTables.push(renderApprovalTable(approvalEntries.slice(i, i + stepsPerRow)));
    }
    const safePrintedAt = escapeHtml(formatApprovalKstDateISO(new Date().toISOString(), ''));
    const pageRule = 'A4 portrait';
    const relatedDocType = String(relatedDoc?.doc_type || '');
    const relatedDocIsNotice = relatedDocType.startsWith('공문');
    const relatedDocAllowHtml = isApprovalHtmlEditorType(relatedDocType) || relatedDocIsNotice;
    const relatedDocSectionTitle = getApprovalRelatedDocSectionTitle(doc);
    const safeRelatedDocSectionTitle = escapeHtml(relatedDocSectionTitle);
    const relatedDocNoticeParts = relatedDocIsNotice
        ? splitNoticeApprovalContent(relatedDoc?.content || '')
        : null;
    const relatedDocContentSource = relatedDocIsNotice
        ? String(relatedDocNoticeParts?.publicBody || '')
        : String(relatedDoc?.content || '');
    const relatedDocRenderedContent = relatedDoc
        ? (relatedDocAllowHtml
            ? renderApprovalContent(relatedDocContentSource, true)
            : escapeHtml(relatedDocContentSource).replace(/\n/g, '<br>'))
        : '';
    const relatedDocAmountDisplay = relatedDoc ? getApprovalAmountDisplayPayload(relatedDoc) : null;
    const safeRelatedDocTitle = escapeHtml(String(relatedDoc?.title || '연동 품의서'));
    const relatedMetaItems = [];
    if (relatedDoc?.doc_no) relatedMetaItems.push(`문서번호 ${escapeHtml(String(relatedDoc.doc_no))}`);
    if (relatedDocType) relatedMetaItems.push(`유형 ${escapeHtml(relatedDocType)}`);
    if (relatedDoc?.drafter_name) relatedMetaItems.push(`작성자 ${escapeHtml(String(relatedDoc.drafter_name))}`);
    if (relatedDoc?.created_at) relatedMetaItems.push(`기안일 ${escapeHtml(formatApprovalKstDateISO(relatedDoc.created_at, ''))}`);
    const relatedMetaHtml = relatedMetaItems.length > 0
        ? `<div class="small text-muted mb-2">${relatedMetaItems.join(' | ')}</div>`
        : '';
    const relatedAmountHtml = relatedDocAmountDisplay
        ? `<div class="small text-end fw-bold mt-2">${escapeHtml(relatedDocAmountDisplay.labelText || '금액')}: ${escapeHtml(relatedDocAmountDisplay.mainText || '-')}</div>`
        : '';
    const relatedDocSectionHtml = relatedDoc
        ? `
            <div class="section-title">${safeRelatedDocSectionTitle}</div>
            <div class="content-box" style="min-height: 0;">
              <div class="fw-bold mb-1">${safeRelatedDocTitle}</div>
              ${relatedMetaHtml}
              <div>${relatedDocRenderedContent || emptyText}</div>
              ${relatedAmountHtml}
            </div>
          `
        : (safeRelDocId
            ? `
                <div class="section-title">${safeRelatedDocSectionTitle}</div>
                <div class="content-box" style="min-height: 0;">연동된 문서(ID: ${escapeHtml(safeRelDocId)})를 불러오지 못했습니다.</div>
              `
            : '');

    const expenseHeaderHtml = isExpenseDoc ? `
        <header class="approval-head expense-print-head">
          <div class="expense-doc-identity">
            <div class="expense-approval-kicker" lang="en">EXPENSE APPROVAL</div>
            <div class="doc-title">${safeDocHeading}</div>
            <div class="doc-subtitle">문서번호 <span class="approval-print-doc-number">${safeDocNo || emptyText}</span></div>
            <div class="doc-subtitle">작성일 ${safeDate || emptyText}</div>
          </div>
          <div class="expense-approval-board">
            <div class="expense-approval-label" aria-hidden="true">결<br>재</div>
            <div class="approval-steps">${approvalTables.join('')}${approvalLine.length ? '' : '<p class="expense-no-approval-line">저장된 결재선이 없습니다.</p>'}</div>
          </div>
        </header>` : '';
    const hasSavedExpenseAmount = (typeof doc.amount === 'number' || (typeof doc.amount === 'string' && doc.amount.trim())) &&
        Number.isFinite(Number(doc.amount));
    const expenseInfoHtml = isExpenseDoc ? `
        <table class="info-table expense-print-info" aria-label="지출결의 문서정보">
          <colgroup><col class="expense-info-label"><col class="expense-info-value"><col class="expense-info-label"><col class="expense-info-value"></colgroup>
          <tbody>
            <tr><th scope="row">문서유형</th><td>${safeType || emptyText}</td><th scope="row">작성자</th><td>${safeDrafter || emptyText}</td></tr>
            <tr><th scope="row">제목</th><td colspan="3">${safeTitle || emptyText}</td></tr>
            <tr><th scope="row">${execution?.amount || !safeAmountLabel || safeAmountLabel === '금액' ? '승인금액' : safeAmountLabel}</th>
              <td><div class="amount-main">${hasSavedExpenseAmount ? safeAmountMain || emptyText : emptyText}</div>${hasSavedExpenseAmount && safeAmountSub ? `<div class="amount-sub">${safeAmountSub}</div>` : ''}</td>
              <th scope="row">승인 수단</th><td>${escapeHtml(doc._printApprovedMethod || (typeof doc.expense_snapshot?.payment_method_label === 'string' ? doc.expense_snapshot.payment_method_label : '')) || emptyText}</td>
            </tr>
            <tr><th scope="row">지급정보</th><td colspan="3">${[safeReceiver, safeVia].filter(Boolean).join(' / ') || emptyText}</td></tr>
          </tbody>
        </table>` : '';

    return `
      <html>
        <head>
          <meta charset="UTF-8">
          <title>결재 문서 출력</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
          <style>
            @page { size: ${pageRule}; margin: 10mm; }
            html, body { margin: 0; padding: 0; background: #fff !important; color: #111 !important; }
            body {
              font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
              padding: 10mm;
            }
            .print-area {
              max-width: 1000px;
              margin: 0 auto;
              border: 2px solid #111;
              padding: 18px;
              padding-bottom: 14px;
              background: #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.06);
            }
            .doc-title { font-size: 19pt; font-weight: 800; margin: 0 0 3px; color: #19355c; }
            .doc-subtitle { color: #334155; font-size: 11pt; margin: 4px 0 0; }
            .approval-print-doc-number { display:inline-block; max-width:100%; overflow-wrap:anywhere; }
            .approval-head { margin-bottom: 12px; padding-bottom: 11px; border-bottom: 1.1pt solid #19355c; display: grid; gap: 12px; word-break: keep-all; overflow-wrap: anywhere; }
            .header-grid { grid-template-columns: minmax(0, .37fr) minmax(0, 1fr); align-items: start; }
            .header-grid > * { min-width: 0; }
            .approval-doc-subject { font-size: 11pt; font-weight: 700; }
            .approval-steps { min-width: 0; }
            .approval-steps .approval-table + .approval-table { margin-top: 6px; }
            .info-table, .approval-table { width: 100%; min-width: 0; border-collapse: collapse; table-layout: fixed; }
            .info-table th, .info-table td, .approval-table th, .approval-table td { word-break: keep-all; overflow-wrap: break-word; }
            .info-table th, .info-table td, .approval-table th, .approval-table td { border: 1px solid #111; padding: 8px 9px; vertical-align: middle; }
            .info-table th { width: 95px; text-align: center; background: #f3f4f6; font-size: 11pt; font-weight: 700; color: #111; }
            .info-table td { font-size: 11pt; color: #111; }
            .amount-main { font-size: 1.16rem; line-height: 1.3; font-weight: 800; letter-spacing: 0.01em; }
            .amount-sub { font-size: 11pt; color: #4b5563; margin-top: 2px; }
            .approval-table th, .approval-table td { padding: 4px 3px; border-color: #6b7c73; }
            .approval-table th { text-align: center; background: #edf1f7; font-size: 11pt; font-weight: 700; color: #19355c; overflow-wrap:anywhere; }
            .approval-table .approval-cell { height: 43pt; text-align: center; vertical-align: top; overflow-wrap: anywhere; }
            .approval-name { font-size: 11pt; font-weight: 700; color: #121923; }
            .stamp-wrap { margin-top: 2px; }
            .stamp { display: inline-block; padding: 1px 3px; border: 1px solid currentColor; border-radius: 3px; color: #1b4d3e; font-size: 11pt; font-weight: 700; max-width:100%; }
            .stamp.rejected { color: #831843; }
            .stamp.pending { color: #475569; }
            .stamp.drafted { color: #19355c; }
            .stamp-date { font-size: 11pt; color: #334155; margin-top: 2px; }
            .text-muted-light { color: #9ca3af; }
            .section-title { margin-top: 14px; border: 1px solid #111; border-bottom: none; background: #f3f4f6; padding: 7px 10px; font-size: 11pt; font-weight: 700; color: #111; break-inside: avoid; page-break-inside: avoid; }
            .content-box { border: 1px solid #111; padding: 14px; min-height: 255px; font-size: 0.95rem; line-height: 1.7; color: #111; overflow-wrap: anywhere; word-break: break-word; }
            .content-box table { width: 100% !important; border-collapse: collapse !important; table-layout: auto; margin: 8px 0; }
            .content-box table th, .content-box table td { border: 1px solid #111 !important; padding: 6px 8px !important; vertical-align: top; }
            .content-box tr { break-inside: avoid; page-break-inside: avoid; }
            .content-box img { max-width: 100% !important; height: auto !important; }
            .insurance-print-meta { border: 1px solid #111; border-bottom: none; padding: 7px 10px; font-size: 11pt; color: #334155; }
            .insurance-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11pt; }
            .insurance-print-table th, .insurance-print-table td { border: 1px solid #111; padding: 7px 8px; vertical-align: middle; }
            .insurance-print-table thead th { background: #f1f5f9; text-align: center; }
            .insurance-print-table tbody th, .insurance-print-table tfoot th { text-align: left; }
            .insurance-print-table tbody td, .insurance-print-table tfoot td { text-align: right; white-space: nowrap; }
            .insurance-print-table .support-cell { color: #166534; }
            .insurance-print-table tfoot th, .insurance-print-table tfoot td { background: #ecfdf5; font-weight: 800; }
            .attach-box { border: 1px solid #111; padding: 10px 14px; font-size: 11pt; color: #111; }
            .attach-list { margin: 0; padding-left: 20px; }
            .attach-list li { margin: 2px 0; }
            .attach-box, .attachment-sheet header { overflow-wrap: anywhere; }
            .attachment-error { color: #9f1239; }
            .execution-print { break-inside: avoid; }
            .attachment-sheet { max-width:190mm; margin:12mm auto 0; padding:0; background:#fff; }
            .attachment-sheet header { font-size:10pt; line-height:1.3; margin-bottom:3mm; }
            .attachment-sheet img { display:block; margin:0 auto; width:auto; height:auto; max-width:100%; max-height:247mm; object-fit:contain; }
            .text-end { text-align: right; }
            .text-center { text-align: center; }
            .fw-bold { font-weight: 700; }
            .small { font-size: 11pt !important; }
            .footer-row { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #9ca3af; display: flex; justify-content: space-between; gap: 8px; font-size: 11pt; color: #6b7280; }
            .print-actions { position: sticky; bottom: 0; display:flex; gap:.5rem; flex-wrap:wrap; justify-content:flex-end; padding:.5rem; background:#fff; }
            @media screen and (max-width:620px) {
              body { padding: 12px; }
              .print-area { padding: 12px; }
              .header-grid { grid-template-columns: minmax(0, 1fr); }
              .footer-row { flex-wrap:wrap; }
            }
            @media print {
              body {
                padding: 0;
                background: #fff !important;
                color: #000 !important;
              }
              .print-area {
                border: none;
                padding: 0;
                box-shadow: none;
              }
              .approval-head > div:first-child { break-after: avoid; }
              .approval-head, .approval-table { break-inside: avoid; }
              .amount-main { white-space: nowrap; }
              .content-box { min-height: 0; }
              .section-title { break-after: avoid; }
              .attach-list li { break-inside: avoid; }
              .attachment-sheet { break-before: page; page-break-before: always; break-inside: avoid; margin:0; }
              .footer-row { break-inside: avoid; page-break-inside: avoid; }
              .print-actions { display: none; }
            }
            ${isExpenseDoc ? `
            .expense-print-head {
              grid-template-columns: minmax(0, .33fr) minmax(0, 1fr);
              align-items: start;
              gap: 4mm;
              margin-bottom: 3.5mm;
              padding-bottom: 3.5mm;
              border-bottom: 1.4pt solid #19355c;
            }
            .expense-approval-kicker { color:#19355c; font-size:11pt; font-weight:700; letter-spacing:.06em; }
            .expense-doc-identity .doc-title { font-size:22pt; margin:0 0 1mm; }
            .expense-doc-identity .doc-subtitle { font-size:11pt; font-variant-numeric:tabular-nums; }
            .expense-approval-board {
              display:grid; grid-template-columns: 8mm minmax(0, 1fr); min-width:0;
              border:1px solid #66758a; color:#19355c;
            }
            .expense-approval-label {
              display:grid; place-content:center; text-align:center; border-right:1px solid #66758a;
              background:#f2f5fa; font-size:11pt; font-weight:800; line-height:1.35;
            }
            .expense-approval-board .approval-table { margin:0; line-height:1.2; }
            .expense-approval-board .approval-table + .approval-table { margin:0; border-top:1px solid #66758a; }
            .expense-approval-board .approval-table :is(th,td) {
              padding:3px 4px; height:auto; font-size:11pt; border-color:#66758a;
              word-break:keep-all; overflow-wrap:anywhere;
            }
            .expense-approval-board .approval-table th { border-top:0; }
            .expense-approval-board .approval-table td { border-bottom:0; }
            .expense-approval-board .approval-table tr > :first-child { border-left:0; }
            .expense-approval-board .approval-table tr > :last-child { border-right:0; }
            .expense-approval-board :is(.approval-name,.stamp,.stamp-date) { font-size:11pt; max-width:100%; }
            .expense-approval-board .stamp { padding:1px 3px; }
            .expense-approval-board .stamp-date { font-variant-numeric:tabular-nums; }
            .expense-approval-board .expense-no-approval-line { margin:0; padding:4px 6px; font-size:11pt; text-align:center; border-top:1px solid #66758a; }
            .expense-print-info { width:100%; }
            .expense-print-info .expense-info-label { width:13%; }
            .expense-print-info .expense-info-value { width:37%; }
            .expense-print-info :is(th,td) { padding:6px 8px; border-color:#66758a; overflow-wrap:anywhere; }
            .expense-print-info th { width:auto; color:#19355c; background:#f2f5fa; }
            .expense-print-info .amount-main { white-space:normal; font-variant-numeric:tabular-nums; }
            .expense-print .text-muted-light { color:#475569; }
            .attachment-sheet header { font-size:11pt; }
            @media screen and (max-width:620px) {
              .expense-print-head { grid-template-columns:minmax(0,1fr); }
            }
            @media print {
              .expense-print { padding-inline:.4mm; }
              .expense-print-head, .expense-print-info { break-inside:avoid; }
            }
            ` : ''}
          </style>
        </head>
        <body>
          <div class="print-area${isExpenseDoc ? ' expense-print' : ''}" id="printArea">
            ${isExpenseDoc ? expenseHeaderHtml + expenseInfoHtml : `<header class="approval-head header-grid">
              <div>
                <div class="doc-title">${safeDocHeading}</div>
                <div class="approval-doc-subject">${safeTitle || emptyText}</div>
                <div class="doc-subtitle">${safeDocNo ? `문서번호 <span class="approval-print-doc-number">${safeDocNo}</span>` : ''}${safeDate ? `${safeDocNo ? ' · ' : ''}작성일 ${safeDate}` : ''}</div>
              </div>
              <div class="approval-steps">${approvalTables.join('')}${approvalLine.length ? '' : '<p>저장된 결재선이 없습니다.</p>'}</div>
            </header>
              <table class="info-table">
                <tbody>
                  <tr><th>문서유형</th><td>${safeType || emptyText}</td></tr>
                  <tr><th>문서번호</th><td>${safeDocNo || emptyText}</td></tr>
                  <tr><th>제목</th><td>${safeTitle || emptyText}</td></tr>
                  <tr><th>작성자</th><td>${safeDrafter || emptyText}</td></tr>
                  <tr><th>작성일</th><td>${safeDate || emptyText}</td></tr>
                  ${shouldShowAmount
                    ? `<tr>
                    <th>${execution?.amount?'승인금액':safeAmountLabel}</th>
                    <td>
                      <div class="amount-main">${safeAmountMain}</div>
                      ${safeAmountSub ? `<div class="amount-sub">${safeAmountSub}</div>` : ''}
                    </td>
                  </tr>`
                    : ''}
                  ${doc._printApprovedMethod?`<tr><th>승인 시<br>결제수단</th><td>${escapeHtml(doc._printApprovedMethod)}</td></tr>`:''}
                  ${(safeReceiver || safeVia)
                    ? `<tr><th>${safeAuxInfoLabel}</th><td>${safeReceiver || ''}${safeReceiver && safeVia ? ' / ' : ''}${safeVia || ''}</td></tr>`
                    : ''}
                </tbody>
              </table>`}


            ${noticeMemoSectionHtml}
            <div class="section-title">${safeSectionHeading}</div>
            <div class="content-box">${renderedContent || emptyText}</div>
            ${insuranceSectionHtml}
            ${withholdingSectionHtml}
            ${executionSectionHtml}
            ${relatedDocSectionHtml}
            ${attachmentSectionHtml}
            <div class="footer-row">
              <span>출력일시: ${safePrintedAt || emptyText}</span>
              <span>본 문서는 전자결재 시스템에서 출력되었습니다.</span>
            </div>
          </div>
          ${attachmentSheets}
          <div class="print-actions">
            ${incomplete?'<span role="status">빠진 항목은 본문의 목록에서 확인해 주세요.</span>':''}
            <button type="button" class="btn btn-primary btn-sm" id="approvalPrintNow" disabled>${incomplete?'빠진 항목 제외하고 인쇄':'인쇄'}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="approvalClosePrint">닫기</button>
          </div>
        </body>
      </html>
    `;
}
root.ApprovalPrintTemplates = Object.freeze({version:'1.5.0',buildPhysicalPrintHtml});
})(window);
