(function initSalaryLedgerModule(global) {
  'use strict';

  const MODULE_VERSION = 'v1.0.7';

  const NUMERIC_FIELDS = [
    'pay_basic', 'pay_meal', 'pay_car', 'pay_child', 'pay_position', 'pay_service', 'pay_overtime', 'pay_bonus', 'pay_total',
    'ded_pension', 'ded_health', 'ded_care', 'ded_employ', 'ded_income', 'ded_local', 'ded_advance', 'ded_advance_raw', 'ded_capital', 'ded_total', 'net_pay',
    'durunuri_emp_support', 'work_days', 'work_hours'
  ];

  function toInt(value) {
    return Math.round(Number(value || 0));
  }

  function formatMoney(value) {
    return toInt(value).toLocaleString();
  }

  function roundMetric(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 2) / 2;
  }

  function formatMetric(value) {
    var rounded = roundMetric(value);
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value, allowDataImage) {
    try {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (allowDataImage && /^data:image\//i.test(raw)) return raw;
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (_) {}
    return '';
  }

  function allowance(row) {
    return toInt(row.pay_child) + toInt(row.pay_position) + toInt(row.pay_service) + toInt(row.pay_overtime);
  }

  function formatYearMonthLabel(ym) {
    const value = String(ym || '');
    const m = value.match(/^(\d{4})-(\d{2})$/);
    if (!m) return value || '-';
    return m[1] + '년 ' + Number(m[2]) + '월';
  }

  function makeFileName(ym) {
    const value = String(ym || '');
    const m = value.match(/^(\d{4})-(\d{2})$/);
    if (m) return m[1] + '년 ' + m[2] + '월 급여대장.pdf';
    const now = new Date();
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return y + '년 ' + mm + '월 급여대장.pdf';
  }

  function normalizeRow(row, fallbackYm) {
    const src = row || {};
    const normalized = {
      year_month: src.year_month || fallbackYm || '',
      emp_id: src.emp_id || '',
      emp_name: src.emp_name || '',
      work_description: src.work_description || ''
    };
    NUMERIC_FIELDS.forEach(function eachNumeric(key) {
      normalized[key] = toInt(src[key]);
    });
    return normalized;
  }

  function resolveEtcDeductionLabel(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const hasOnlyDurunuri = list.length > 0 && list.every(function eachRow(row) {
      const supportEmp = toInt(row.durunuri_emp_support);
      const rawAdvance = toInt(row.ded_advance_raw);
      const capital = toInt(row.ded_capital);
      const hasEtcValue = toInt(row.ded_advance) !== 0 || capital !== 0 || supportEmp !== 0 || rawAdvance !== 0;
      if (!hasEtcValue) return true;
      return supportEmp !== 0 && rawAdvance === 0 && capital === 0;
    });
    return hasOnlyDurunuri ? '두루누리' : '기타공제';
  }

  function createStateFromRows(rows, yearMonth) {
    const list = Array.isArray(rows) ? rows : [];
    const normalizedRows = list.map(function mapRow(row) {
      return normalizeRow(row, yearMonth);
    });
    const ym = yearMonth || (normalizedRows[0] ? normalizedRows[0].year_month : '');
    const totals = normalizedRows.reduce(function reduceTotals(acc, row) {
      acc.pay_basic += toInt(row.pay_basic);
      acc.work_days += roundMetric(row.work_days);
      acc.work_hours += roundMetric(row.work_hours);
      acc.pay_meal += toInt(row.pay_meal);
      acc.pay_car += toInt(row.pay_car);
      acc.pay_allow += allowance(row);
      acc.pay_bonus += toInt(row.pay_bonus);
      acc.pay_total += toInt(row.pay_total);
      acc.ded_pension += toInt(row.ded_pension);
      acc.ded_health += toInt(row.ded_health);
      acc.ded_care += toInt(row.ded_care);
      acc.ded_employ += toInt(row.ded_employ);
      acc.ded_income += toInt(row.ded_income);
      acc.ded_local += toInt(row.ded_local);
      acc.ded_etc += toInt(row.ded_advance) + toInt(row.ded_capital);
      acc.ded_total += toInt(row.ded_total);
      acc.net_pay += toInt(row.net_pay);
      return acc;
    }, {
      work_days: 0, work_hours: 0,
      pay_basic: 0, pay_meal: 0, pay_car: 0, pay_allow: 0, pay_bonus: 0, pay_total: 0,
      ded_pension: 0, ded_health: 0, ded_care: 0, ded_employ: 0, ded_income: 0, ded_local: 0, ded_etc: 0, ded_total: 0, net_pay: 0
    });

    return {
      yearMonth: ym,
      rows: normalizedRows,
      empCount: normalizedRows.length,
      payTotal: totals.pay_total,
      dedTotal: totals.ded_total,
      netTotal: totals.net_pay,
      dedEtcLabel: resolveEtcDeductionLabel(normalizedRows),
      totals: totals
    };
  }

  function buildSummaryItemsHtml(items, options) {
    var opts = options || {};
    var className = String(opts.className || '').trim();
    return '<div class="ledger-summary-grid' + (className ? (' ' + className) : '') + '">' +
      items.map(function itemHtml(item) {
        return '' +
          '<div class="ledger-summary-item' + (item.highlight ? ' is-highlight' : '') + '">' +
          '<span class="ledger-summary-label">' + escapeHtml(item.label || '') + '</span>' +
          '<span class="ledger-summary-value">' + escapeHtml(formatMoney(item.value || 0)) + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function buildPaySummaryCellHtml(row) {
    return buildSummaryItemsHtml([
      { label: '기본급', value: row.pay_basic },
      { label: '식대', value: row.pay_meal },
      { label: '차량', value: row.pay_car },
      { label: '기타수당', value: allowance(row) },
      { label: '상여', value: row.pay_bonus },
      { label: '지급계', value: row.pay_total, highlight: true }
    ], { className: 'ledger-pay-grid' });
  }

  function buildDeductionSummaryCellHtml(row, etcLabel) {
    return buildSummaryItemsHtml([
      { label: '국민연금', value: row.ded_pension },
      { label: '건강보험', value: row.ded_health },
      { label: '장기요양', value: row.ded_care },
      { label: '고용보험', value: row.ded_employ },
      { label: '소득세', value: row.ded_income },
      { label: '지방세', value: row.ded_local },
      { label: etcLabel || '기타공제', value: toInt(row.ded_advance) + toInt(row.ded_capital) },
      { label: '공제계', value: row.ded_total, highlight: true }
    ], { className: 'ledger-deduction-grid' });
  }

  function buildRowsHtml(rows, dedEtcLabel) {
    return rows.map(function rowHtml(row, idx) {
      return '' +
        '<tr>' +
        '<td class="text-center">' + (idx + 1) + '</td>' +
        '<td class="text-center">' + escapeHtml(row.emp_name || '') + '</td>' +
        '<td class="ledger-work-desc">' + escapeHtml(row.work_description || '') + '</td>' +
        '<td class="text-end">' + formatMetric(row.work_days) + '</td>' +
        '<td class="text-end">' + formatMetric(row.work_hours) + '</td>' +
        '<td class="ledger-summary-cell">' + buildPaySummaryCellHtml(row) + '</td>' +
        '<td class="ledger-summary-cell">' + buildDeductionSummaryCellHtml(row, dedEtcLabel) + '</td>' +
        '<td class="text-end fw-bold ledger-net-pay">' + formatMoney(row.net_pay) + '</td>' +
        '</tr>';
    }).join('');
  }

  function buildApprovalBoxCellHtml(entry) {
    var row = entry && typeof entry === 'object' ? entry : {};
    var safeName = escapeHtml(row.name || '');
    var safeStampLabel = escapeHtml(row.stampLabel || '');
    var safeStampDate = escapeHtml(row.stampDate || '');
    var safeNote = escapeHtml(row.note || '');
    return '' +
      '<td>' +
      (safeName ? '<div class="approval-entry-name">' + safeName + '</div>' : '') +
      (safeStampLabel ? '<div class="approval-entry-stamp">' + safeStampLabel + '</div>' : '') +
      (safeStampDate ? '<div class="approval-entry-date">' + safeStampDate + '</div>' : '') +
      (safeNote ? '<div class="approval-entry-note">' + safeNote + '</div>' : '') +
      '</td>';
  }

  function buildApprovalBoxHtml(options) {
    if (!options || !options.showApprovalBox) return '';
    const chairmanLabel = '이사장';
    const entries = Array.isArray(options.approvalBoxEntries) ? options.approvalBoxEntries : [];
    const normalizedEntries = [
      { title: '담당', ...(entries[0] || {}) },
      { title: '사무국장', ...(entries[1] || {}) },
      { title: chairmanLabel, ...(entries[2] || { name: options.chairmanName || '' }) }
    ];
    return '' +
      '<table class="approval-box">' +
      '<thead>' +
      '<tr>' + normalizedEntries.map(function eachHeader(entry) {
        return '<th>' + escapeHtml(entry.title || '') + '</th>';
      }).join('') + '</tr>' +
      '</thead>' +
      '<tbody><tr>' + normalizedEntries.map(function eachCell(entry) {
        return buildApprovalBoxCellHtml(entry);
      }).join('') + '</tr></tbody>' +
      '</table>';
  }

  function buildHtml(inputState, options) {
    const opts = options || {};
    const state = createStateFromRows((inputState && inputState.rows) || [], inputState && inputState.yearMonth);
    const rows = state.rows;
    const totals = state.totals;
    const ymLabel = formatYearMonthLabel(state.yearMonth);
    const title = opts.title || (ymLabel ? ymLabel + ' 급여대장' : '급여대장');
    const subtitle = opts.subtitle || '';
    const logoUrl = safeUrl(opts.logoUrl || '', true);
    const footerText = opts.footerText || '';
    const showPrintDate = opts.showPrintDate !== false;
    const printDate = new Date().toLocaleDateString('ko-KR');

    return '' +
      '<div class="salary-ledger-root">' +
      '<style>' +
      '.salary-ledger-root { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color:#111; background:#fff; }' +
      '.ledger-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:10px; }' +
      '.ledger-title-wrap { flex:1; }' +
      '.ledger-title { margin:0; font-size:23px; font-weight:800; text-decoration:underline; letter-spacing:0.01em; }' +
      '.ledger-subtitle { margin-top:2px; font-size:12px; color:#4b5563; }' +
      '.ledger-logo img { height:40px; max-width:240px; object-fit:contain; }' +
      '.approval-box { width:250px; border-collapse:collapse; table-layout:fixed; font-size:11px; }' +
      '.approval-box th, .approval-box td { border:1px solid #111; text-align:center; }' +
      '.approval-box th { height:22px; background:#f3f4f6; font-weight:700; }' +
      '.approval-box td { height:60px; padding:4px; vertical-align:top; }' +
      '.approval-entry-name { font-size:11px; font-weight:700; color:#111; }' +
      '.approval-entry-stamp { margin-top:6px; display:inline-block; padding:2px 6px; border:1px solid #2563eb; border-radius:999px; color:#2563eb; font-size:10px; font-weight:700; }' +
      '.approval-entry-date { margin-top:4px; font-size:10px; color:#374151; }' +
      '.approval-entry-note { margin-top:4px; font-size:9px; color:#6b7280; }' +
      '.ledger-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px; }' +
      '.ledger-table th, .ledger-table td { border:1px solid #111; padding:3px 4px; vertical-align:middle; }' +
      '.ledger-table thead th { background:#f3f4f6; text-align:center; font-weight:700; white-space:nowrap; }' +
      '.ledger-table tfoot th { background:#e5e7eb; }' +
      '.text-center { text-align:center; } .text-end { text-align:right; } .fw-bold { font-weight:700; }' +
      '.ledger-work-desc { white-space:normal; word-break:keep-all; overflow-wrap:anywhere; line-height:1.45; }' +
      '.ledger-summary-cell { padding:6px !important; }' +
      '.ledger-summary-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px 6px; }' +
      '.ledger-summary-item { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; min-width:0; border:1px solid #d1d5db; border-radius:4px; background:#fff; padding:4px 6px; }' +
      '.ledger-summary-item.is-highlight { background:#eef2ff; border-color:#94a3b8; }' +
      '.ledger-summary-label { font-size:10px; color:#4b5563; white-space:nowrap; }' +
      '.ledger-summary-value { font-size:10.5px; font-weight:700; color:#111; text-align:right; word-break:break-all; }' +
      '.ledger-net-pay { white-space:nowrap; font-size:11px; }' +
      '.ledger-footer { margin-top:6px; display:flex; justify-content:space-between; gap:8px; font-size:11px; color:#6b7280; }' +
      '</style>' +

      '<div class="ledger-header">' +
      '<div class="ledger-logo">' + (logoUrl ? '<img src="' + logoUrl + '" alt="logo">' : '') + '</div>' +
      '<div class="ledger-title-wrap">' +
      '<h1 class="ledger-title">' + escapeHtml(title) + '</h1>' +
      (subtitle ? '<div class="ledger-subtitle">' + escapeHtml(subtitle) + '</div>' : '') +
      '</div>' +
      buildApprovalBoxHtml(opts) +
      '</div>' +

      '<table class="ledger-table">' +
      '<thead>' +
      '<tr>' +
      '<th style="width:40px;">No</th>' +
      '<th style="width:72px;">성명</th>' +
      '<th style="width:136px;">종사업무</th>' +
      '<th style="width:62px;">근로일수</th>' +
      '<th style="width:70px;">근로시간</th>' +
      '<th style="width:290px;">지급내역</th>' +
      '<th style="width:340px;">공제내역</th>' +
      '<th style="width:98px;">차인지급액</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' + buildRowsHtml(rows, state.dedEtcLabel) + '</tbody>' +
      '<tfoot>' +
      '<tr>' +
      '<th colspan="3">합계 (' + rows.length + '명)</th>' +
      '<th class="text-end">' + formatMetric(totals.work_days) + '</th>' +
      '<th class="text-end">' + formatMetric(totals.work_hours) + '</th>' +
      '<th class="ledger-summary-cell">' + buildSummaryItemsHtml([
        { label: '기본급', value: totals.pay_basic },
        { label: '식대', value: totals.pay_meal },
        { label: '차량', value: totals.pay_car },
        { label: '기타수당', value: totals.pay_allow },
        { label: '상여', value: totals.pay_bonus },
        { label: '지급계', value: totals.pay_total, highlight: true }
      ], { className: 'ledger-pay-grid' }) + '</th>' +
      '<th class="ledger-summary-cell">' + buildSummaryItemsHtml([
        { label: '국민연금', value: totals.ded_pension },
        { label: '건강보험', value: totals.ded_health },
        { label: '장기요양', value: totals.ded_care },
        { label: '고용보험', value: totals.ded_employ },
        { label: '소득세', value: totals.ded_income },
        { label: '지방세', value: totals.ded_local },
        { label: state.dedEtcLabel || '기타공제', value: totals.ded_etc },
        { label: '공제계', value: totals.ded_total, highlight: true }
      ], { className: 'ledger-deduction-grid' }) + '</th>' +
      '<th class="text-end fw-bold ledger-net-pay">' + formatMoney(totals.net_pay) + '</th>' +
      '</tr>' +
      '</tfoot>' +
      '</table>' +

      '<div class="ledger-footer">' +
      '<span>' + (showPrintDate ? ('출력일: ' + escapeHtml(printDate)) : '') + '</span>' +
      '<span>' + escapeHtml(footerText) + '</span>' +
      '</div>' +
      '</div>';
  }

  async function generatePdfBlob(inputState, options) {
    if (!global.html2pdf) throw new Error('PDF 생성 라이브러리를 불러오지 못했습니다.');
    const opts = options || {};
    const state = createStateFromRows((inputState && inputState.rows) || [], inputState && inputState.yearMonth);
    if (!state.rows.length) throw new Error('급여대장 데이터가 없습니다.');

    const marginMm = Number.isFinite(Number(opts.marginMm)) ? Number(opts.marginMm) : 8;
    const printableWidthMm = 297 - (marginMm * 2);
    const printableWidthPx = Math.max(960, Math.floor((printableWidthMm * 96) / 25.4));
    const captureWidthPx = Number.isFinite(Number(opts.captureWidthPx)) ? Number(opts.captureWidthPx) : printableWidthPx;

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = String(captureWidthPx) + 'px';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '-1';
    host.style.background = '#fff';
    host.innerHTML = buildHtml(state, opts);
    document.body.appendChild(host);

    try {
      const target = host.querySelector('.salary-ledger-root') || host;
      await new Promise(function onFrame(resolve) {
        requestAnimationFrame(function raf1() {
          requestAnimationFrame(resolve);
        });
      });
      const measuredWidthPx = Math.max(
        captureWidthPx,
        Math.ceil(Number(target.scrollWidth) || 0),
        Math.ceil(Number(target.getBoundingClientRect().width) || 0),
        Math.ceil(Number(host.scrollWidth) || 0)
      );
      if (measuredWidthPx > captureWidthPx) {
        host.style.width = String(measuredWidthPx) + 'px';
        await new Promise(function onResize(resolve) {
          requestAnimationFrame(function raf2() {
            requestAnimationFrame(resolve);
          });
        });
      }
      const filename = opts.fileName || makeFileName(state.yearMonth);
      const worker = global.html2pdf()
        .set({
          margin: [marginMm, marginMm, marginMm, marginMm],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: measuredWidthPx
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: ['css', 'legacy'] }
        })
        .from(target)
        .toPdf();
      return await worker.outputPdf('blob');
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  }

  function openPrintWindow(inputState, options) {
    const opts = options || {};
    const state = createStateFromRows((inputState && inputState.rows) || [], inputState && inputState.yearMonth);
    if (!state.rows.length) throw new Error('급여대장 데이터가 없습니다.');

    const htmlContent = buildHtml(state, opts);
    const win = window.open('', '_blank', 'width=1300,height=900');
    if (!win) throw new Error('인쇄 창을 열 수 없습니다.');
    const title = escapeHtml(opts.windowTitle || '급여대장 출력');
    win.document.write(
      '<html><head>' +
      '<title>' + title + '</title>' +
      '<meta charset="UTF-8">' +
      '<style>' +
      '@page { size: A4 landscape; margin: 10mm; }' +
      'html,body{margin:0;padding:0;background:#fff;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;}' +
      '.print-wrap{max-width:1300px;margin:0 auto;padding:12px;}' +
      '.print-actions{position:fixed;right:16px;bottom:16px;display:flex;gap:8px;z-index:9999;}' +
      '.print-actions button{border:1px solid #cbd5e1;background:#fff;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;}' +
      '.print-actions button.primary{background:#111;color:#fff;border-color:#111;}' +
      '@media print { .print-actions{display:none;} .print-wrap{padding:0;} }' +
      '</style></head><body>' +
      '<div class="print-wrap">' + htmlContent + '</div>' +
      '<div class="print-actions">' +
      '<button class="primary" onclick="window.print()">인쇄</button>' +
      '<button onclick="window.close()">닫기</button>' +
      '</div>' +
      '</body></html>'
    );
    win.document.close();
    return win;
  }

  global.SalaryLedgerModule = {
    VERSION: MODULE_VERSION,
    NUMERIC_FIELDS: NUMERIC_FIELDS.slice(),
    formatYearMonthLabel: formatYearMonthLabel,
    makeFileName: makeFileName,
    createStateFromRows: createStateFromRows,
    buildHtml: buildHtml,
    generatePdfBlob: generatePdfBlob,
    openPrintWindow: openPrintWindow
  };
})(window);
