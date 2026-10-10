/* Original print templates; loaded only for a print request. */
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
    const docHeading = isExpenseDoc ? '지 출 결 의 서' : (isProposalDoc ? '품 의 서' : '결 재 문 서');
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
    const sourceAttachmentLinks = Array.isArray(doc.file_links)
        ? doc.file_links.filter(link => typeof link === 'string' && link.trim())
        : [];
    const signedAttachmentLinks = Array.isArray(doc._signed_file_links) && doc._signed_file_links.length > 0
        ? doc._signed_file_links
        : [];
    const attachmentLinks = sourceAttachmentLinks.map((sourceUrl, idx) => ({
        sourceUrl,
        href: String(signedAttachmentLinks[idx] || sourceUrl || '')
    })).filter(item => item.href);
    const attachmentItemsHtml = attachmentLinks.map((item, idx) => {
        const safeUrl = escapeHtml(item.href);
        const safeName = escapeHtml(extractDisplayFileName(item.sourceUrl, `첨부파일 ${idx + 1}`));
        return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a></li>`;
    }).join('');

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

    const approvalLine = Array.isArray(doc.approval_line) ? doc.approval_line : [];
    const findByPos = (keyword) => approvalLine.find(l => (l.position || '').includes(keyword));
    let secretary = findByPos('사무국장');
    const chairman = findByPos('이사장');
    const isDrafterSecretary = !!doc._drafter_is_secretary;
    let secretaryAuto = false;
    if (!secretary && isDrafterSecretary) {
        secretary = { name: rawDrafter, status: '승인', processed_at: doc.created_at };
        secretaryAuto = true;
    }
    const safeSecretaryName = escapeHtml(secretary?.name || '');
    const safeChairmanName = escapeHtml(chairman?.name || '');

    const stampHtml = (entry, fallbackDate, autoLabel = false, options = {}) => {
        if (!entry) return `<div class="stamp-wrap"></div>`;
        if (entry.status === '승인') {
            const dt = entry.processed_at ? formatApprovalKstDateISO(entry.processed_at) : (fallbackDate || '');
            const label = autoLabel ? '자동승인' : (entry.stage === 'review' ? '검토' : '승인');
            return `<div class="stamp-wrap"><div class="stamp approved">${label}</div>${dt ? `<div class="stamp-date">${dt}</div>` : ''}</div>`;
        }
        if (entry.status === '반려') return `<div class="stamp-wrap"><div class="stamp rejected">반려</div></div>`;
        if (options.hidePending) return `<div class="stamp-wrap"></div>`;
        return `<div class="stamp-wrap"><div class="stamp pending">대기</div></div>`;
    };

    const drafterStamp = `<div class="stamp-wrap"><div class="stamp drafted">기안</div>${safeDate ? `<div class="stamp-date">${safeDate}</div>` : ''}</div>`;
    const emptyText = '<span class="text-muted-light">-</span>';
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
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
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
            .doc-title { text-align: center; font-size: 1.9rem; font-weight: 800; letter-spacing: 0.35em; text-indent: 0.35em; margin-bottom: 4px; color: #111; }
            .doc-subtitle { text-align: center; color: #4b5563; font-size: 11pt; margin-bottom: 12px; }
            .header-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 10px; align-items: stretch; }
            .header-grid > * { min-width: 0; }
            .info-table, .approval-table { width: 100%; min-width: 0; border-collapse: collapse; table-layout: fixed; }
            .info-table th, .info-table td, .approval-table th, .approval-table td { word-break: keep-all; overflow-wrap: break-word; }
            .info-table th, .info-table td, .approval-table th, .approval-table td { border: 1px solid #111; padding: 8px 9px; vertical-align: middle; }
            .info-table th { width: 95px; text-align: center; background: #f3f4f6; font-size: 11pt; font-weight: 700; color: #111; }
            .info-table td { font-size: 11pt; color: #111; }
            .amount-main { font-size: 1.16rem; line-height: 1.3; font-weight: 800; letter-spacing: 0.01em; }
            .amount-sub { font-size: 11pt; color: #4b5563; margin-top: 2px; }
            .approval-table th { text-align: center; background: #f3f4f6; font-size: 11pt; font-weight: 700; color: #111; }
            .approval-cell { height: 126px; text-align: center; vertical-align: top; }
            .approval-name { font-size: 11pt; font-weight: 700; margin-top: 2px; color: #111; }
            .stamp-wrap { min-height: 52px; margin-top: 6px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
            .stamp { display: inline-block; padding: 2px 8px; border-radius: 4px; border: 2px solid #16a34a; color: #16a34a; font-size: 11pt; font-weight: 700; background: #fff; }
            .stamp.rejected { border-color: #dc2626; color: #dc2626; }
            .stamp.pending { border-color: #94a3b8; color: #64748b; }
            .stamp.drafted { border-color: #2563eb; color: #2563eb; }
            .stamp-date { font-size: 11pt; color: #64748b; margin-top: 2px; }
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
            .attach-list a { color: #0f172a; text-decoration: none; }
            .text-end { text-align: right; }
            .text-center { text-align: center; }
            .fw-bold { font-weight: 700; }
            .small { font-size: 11pt !important; }
            .footer-row { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #9ca3af; display: flex; justify-content: space-between; gap: 8px; font-size: 11pt; color: #6b7280; }
            .print-actions { position: fixed; bottom: 20px; right: 20px; }
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
              .header-grid { padding-right: 1pt; break-inside: avoid; page-break-inside: avoid; }
              .content-box { min-height: 0; }
              .footer-row { break-inside: avoid; page-break-inside: avoid; }
              .print-actions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-area" id="printArea">
            <div class="doc-title">${safeDocHeading}</div>
            <div class="doc-subtitle">${safeType || '결재문서'}${safeDate ? ` · 작성일 ${safeDate}` : ''}</div>

            <div class="header-grid">
              <table class="info-table">
                <tbody>
                  <tr><th>문서유형</th><td>${safeType || emptyText}</td></tr>
                  <tr><th>문서번호</th><td>${safeDocNo || emptyText}</td></tr>
                  <tr><th>제목</th><td>${safeTitle || emptyText}</td></tr>
                  <tr><th>작성자</th><td>${safeDrafter || emptyText}</td></tr>
                  <tr><th>작성일</th><td>${safeDate || emptyText}</td></tr>
                  ${shouldShowAmount
                    ? `<tr>
                    <th>${safeAmountLabel}</th>
                    <td>
                      <div class="amount-main">${safeAmountMain}</div>
                      ${safeAmountSub ? `<div class="amount-sub">${safeAmountSub}</div>` : ''}
                    </td>
                  </tr>`
                    : ''}
                  ${(safeReceiver || safeVia)
                    ? `<tr><th>${safeAuxInfoLabel}</th><td>${safeReceiver || ''}${safeReceiver && safeVia ? ' / ' : ''}${safeVia || ''}</td></tr>`
                    : ''}
                </tbody>
              </table>

              <table class="approval-table">
                <thead>
                  <tr>
                    <th>담당</th>
                    <th>사무국장</th>
                    <th>이사장</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="approval-cell">
                      <div class="approval-name">${safeDrafter || emptyText}</div>
                      ${drafterStamp}
                    </td>
                    <td class="approval-cell">
                      <div class="approval-name">${safeSecretaryName || emptyText}</div>
                      ${stampHtml(secretary, safeDate, secretaryAuto)}
                    </td>
                    <td class="approval-cell">
                      <div class="approval-name">${safeChairmanName || emptyText}</div>
                      ${stampHtml(chairman, safeDate, false, { hidePending: true })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            ${noticeMemoSectionHtml}
            <div class="section-title">${safeSectionHeading}</div>
            <div class="content-box">${renderedContent || emptyText}</div>
            ${insuranceSectionHtml}
            ${withholdingSectionHtml}
            ${relatedDocSectionHtml}
            ${attachmentSectionHtml}
            <div class="footer-row">
              <span>출력일시: ${safePrintedAt || emptyText}</span>
              <span>본 문서는 전자결재 시스템에서 출력되었습니다.</span>
            </div>
          </div>
          <div class="print-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.print()">🖨️ 인쇄</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.close()">닫기</button>
          </div>
        </body>
      </html>
    `;
}
root.ApprovalPrintTemplates = Object.freeze({buildPhysicalPrintHtml});
})(window);
