/* Version: v1.1.0 | Change: 2026-11-24 - Modern Navy payslip A4 layout with grayscale clarity & dynamic fit. */
const PrintService = {
    version: '1.1.0',
    // 1. 공통 CSS 스타일 (유지보수를 위해 이곳에서 통합 관리)
    styles: {
        common: `
            * { box-sizing: border-box; }
            body { font-family: "Malgun Gothic", serif; margin: 0; padding: 0; background: #555; }
            .print-fab { position: fixed; bottom: 30px; right: 30px; background: #fff; padding: 10px 15px; border-radius: 30px; z-index: 9999; display: flex; gap: 10px; border:1px solid #ccc; }
            @media print { .no-print { display: none !important; } html, body { margin: 0; background: #fff; } }
        `,
        portrait: `
            @page { size: A4 portrait; margin: 0; }
            .page-wrap { width: 210mm; height: 297mm; margin: 0 auto; padding: 15mm; background: white; overflow: hidden !important; }
            table { width: 100%; border-collapse: collapse; font-size: 14px; }
            th, td { border: 1px solid #000 !important; }
            img { max-width: 100%; height: auto; }
            .print-salary .print-content { zoom: 0.86; width: 100%; }
            .print-cert .print-content { zoom: 0.98; width: 100%; position: relative; }
            .text-end { text-align: right; } .fw-bold { font-weight: bold; }
        `,
        salary: `
            @page { size: A4 portrait; margin: 0; }
            body { font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; background: #525659; margin: 0; }
            @media print { html, body { background: #fff; } }
            .salary-page { width: 210mm; height: 297mm; margin: 0 auto; padding: 10mm; background: #ffffff; overflow: hidden; }
            .salary-paper {
                --ink: #19355c;
                --accent: #3b6ea5;
                --deduct: #8a3b42;
                --tint: #f3f6fb;
                --deduct-tint: #fbf5f6;
                --net-tint: #eef3fa;
                --line: #7a8ba3;
                --muted: #47586e;
                --text: #152235;
                height: 100%;
                border: 0.45mm solid var(--ink);
                padding: 9mm 10.5mm 8.5mm;
                color: var(--text);
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                font-size: 10.2pt;
                line-height: 1.38;
            }
            .salary-meta { display: flex; align-items: center; justify-content: space-between; gap: 4mm; font-size: 9pt; color: var(--muted); }
            .salary-meta strong { color: var(--text); font-weight: 700; }
            .salary-meta-en { font-size: 8.5pt; font-weight: 650; letter-spacing: 0.12em; }
            .salary-heading { text-align: center; margin: 3.5mm 0 5.5mm; }
            .salary-heading h1 { margin: 0; color: var(--ink); font-size: 22pt; font-weight: 750; letter-spacing: 0.04em; line-height: 1.22; word-break: keep-all; overflow-wrap: break-word; }
            .salary-heading::after { content: ""; display: block; width: 32mm; border-bottom: 0.42mm solid var(--accent); margin: 2.4mm auto 0; }
            .salary-info-table { width: 100%; border-collapse: collapse; table-layout: fixed; border-top: 0.45mm solid var(--ink); border-bottom: 0.45mm solid var(--ink); margin-bottom: 5.5mm; }
            .salary-info-table tr + tr { border-top: 0.24mm solid var(--line); }
            .salary-info-table th, .salary-info-table td { padding: 2.1mm 2.8mm; vertical-align: middle; font-size: 9.8pt; line-height: 1.3; word-break: keep-all; overflow-wrap: break-word; border: none; }
            .salary-info-table th { background: var(--tint); color: var(--ink); font-weight: 700; text-align: left; border-right: 0.24mm solid var(--line); }
            .salary-info-table td.has-divider { border-right: 0.24mm solid var(--line); }
            .salary-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 5.5mm; align-items: start; }
            .salary-col-head { display: flex; align-items: baseline; justify-content: space-between; padding: 2mm 2.6mm; font-weight: 750; font-size: 10.4pt; }
            .salary-col-head--pay { background: var(--tint); color: var(--ink); border-top: 0.45mm solid var(--ink); border-bottom: 0.32mm solid var(--ink); }
            .salary-col-head--ded { background: var(--deduct-tint); color: var(--deduct); border-top: 0.45mm solid var(--deduct); border-bottom: 0.32mm solid var(--deduct); }
            .salary-col-unit { font-size: 8.4pt; font-weight: 500; color: var(--muted); }
            .salary-detail-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .salary-detail-table tr { border-bottom: 0.22mm solid var(--line); }
            .salary-detail-table td { padding: 1.85mm 2.4mm; font-size: 9.7pt; line-height: 1.26; vertical-align: middle; border: none; }
            .salary-detail-label { word-break: keep-all; overflow-wrap: break-word; color: #1f2d3d; font-weight: 500; }
            .salary-detail-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; color: var(--text); }
            .salary-detail-amt.is-zero { color: #64748b; font-weight: 400; }
            .salary-summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 0.45mm solid var(--ink); margin-top: 6mm; }
            .salary-summary-cell { padding: 2.8mm 2.4mm; text-align: center; }
            .salary-summary-cell + .salary-summary-cell { border-left: 0.24mm solid var(--line); }
            .salary-summary-cell--net { background: var(--net-tint); border-left: 0.35mm solid var(--ink) !important; }
            .salary-summary-label { font-size: 8.8pt; font-weight: 700; color: var(--muted); }
            .salary-summary-cell--net .salary-summary-label { color: var(--ink); }
            .salary-summary-val { margin-top: 0.8mm; font-size: 12pt; font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text); }
            .salary-summary-cell--net .salary-summary-val { font-size: 13pt; font-weight: 800; color: var(--ink); }
            .salary-thanks { text-align: center; margin-top: 5.5mm; font-size: 10.4pt; color: #334155; font-weight: 500; }
            .salary-sig { text-align: center; margin-top: 3mm; padding-bottom: 0.5mm; }
            .salary-sig-company { font-size: 13.5pt; font-weight: 750; color: var(--text); line-height: 1.26; word-break: keep-all; overflow-wrap: break-word; max-width: 156mm; margin: 0 auto; }
            .salary-sig-row { display: inline-flex; align-items: center; justify-content: center; gap: 3.8mm; margin-top: 2mm; max-width: 164mm; }
            .salary-sig-chair { font-size: 15pt; font-weight: 750; letter-spacing: 0.05em; color: var(--text); line-height: 1.24; word-break: keep-all; overflow-wrap: break-word; }
            .salary-sig-seal { width: 22mm; height: 22mm; object-fit: contain; flex: 0 0 22mm; opacity: 0.88; }
            /* Compact fallback for 9-row deductions + multiline attribution + 3-line coop name */
            .salary-paper.salary-paper--compact { padding: 7mm 9mm 6.5mm; font-size: 9.6pt; }
            .salary-paper.salary-paper--compact .salary-heading { margin: 2.2mm 0 3.8mm; }
            .salary-paper.salary-paper--compact .salary-heading h1 { font-size: 19.5pt; }
            .salary-paper.salary-paper--compact .salary-info-table { margin-bottom: 3.8mm; }
            .salary-paper.salary-paper--compact .salary-info-table th, .salary-paper.salary-paper--compact .salary-info-table td { padding: 1.5mm 2.2mm; font-size: 9.2pt; }
            .salary-paper.salary-paper--compact .salary-col-head { padding: 1.5mm 2.2mm; font-size: 9.8pt; }
            .salary-paper.salary-paper--compact .salary-detail-table td { padding: 1.35mm 2mm; font-size: 9.1pt; }
            .salary-paper.salary-paper--compact .salary-summary-strip { margin-top: 4mm; }
            .salary-paper.salary-paper--compact .salary-summary-cell { padding: 2.1mm 2mm; }
            .salary-paper.salary-paper--compact .salary-summary-val { font-size: 11pt; }
            .salary-paper.salary-paper--compact .salary-summary-cell--net .salary-summary-val { font-size: 11.8pt; }
            .salary-paper.salary-paper--compact .salary-thanks { margin-top: 3.2mm; font-size: 9.6pt; }
            .salary-paper.salary-paper--compact .salary-sig-company { font-size: 12pt; }
            .salary-paper.salary-paper--compact .salary-sig-chair { font-size: 13.5pt; }
            .salary-paper.salary-paper--compact .salary-sig-seal { width: 19.5mm; height: 19.5mm; flex-basis: 19.5mm; }
            .salary-paper.salary-paper--tight { padding: 5.5mm 8mm 5.5mm; }
            .salary-paper.salary-paper--tight .salary-detail-table td { padding: 1.05mm 1.8mm; font-size: 8.7pt; }
            .salary-paper.salary-paper--tight .salary-info-table th, .salary-paper.salary-paper--tight .salary-info-table td { padding: 1.2mm 1.8mm; font-size: 8.8pt; }
            .salary-paper.salary-paper--tight .salary-sig-company { font-size: 11pt; }
            .salary-paper.salary-paper--tight .salary-sig-chair { font-size: 12.5pt; }
        `,
        landscape: `
            @page { size: A4 landscape; margin: 10mm; }
            .page-wrap { width: 297mm; min-height: 210mm; padding: 15mm; background: white; margin: 20px auto; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 4px 6px; }
            th { background-color: #f5f5f5; text-align: center; font-weight: bold; white-space: nowrap; }
            .text-center { text-align: center; } .text-end { text-align: right; } .fw-bold { font-weight: bold; } .bg-light { background-color: #f9f9f9; }
        `
    },

    escapeHtml: function(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    safeUrl: function(url, allowDataImage = false) {
        try {
            const raw = String(url || '').trim();
            if (!raw) return '';
            if (allowDataImage && /^data:image\//i.test(raw)) return raw;
            const parsed = new URL(raw, window.location.origin);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        } catch (e) {}
        return '';
    },

    formatMultilineHtml: function(value) {
        return String(value ?? '')
            .split(/<br\s*\/?>|\r?\n/gi)
            .map((part) => this.escapeHtml(part))
            .join('<br>');
    },

    fitSignatureText: function(text, options) {
        const value = String(text || '').trim();
        const cfg = options || {};
        const initialFontSize = Number(cfg.initialFontSize || 18);
        const minFontSize = Number(cfg.minFontSize || 12);
        const maxWidthPx = Number(cfg.maxWidthPx || 520);
        const fontWeight = Number(cfg.fontWeight || 700);
        const fontFamily = String(cfg.fontFamily || 'Malgun Gothic');
        let fontSize = initialFontSize;

        if (!value || !document?.createElement) {
            return { fontSize, wrap: false };
        }

        const canvas = this._signatureMeasureCanvas || document.createElement('canvas');
        this._signatureMeasureCanvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return { fontSize, wrap: false };
        }

        const measureWidth = (size) => {
            ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
            return ctx.measureText(value).width;
        };

        while (fontSize > minFontSize && measureWidth(fontSize) > maxWidthPx) {
            fontSize -= 1;
        }

        return {
            fontSize,
            wrap: measureWidth(fontSize) > maxWidthPx
        };
    },

    buildSignatureBlock: function(data, options) {
        const cfg = options || {};
        const companyName = String(data?.compName || '').trim();
        const chairmanName = String(data?.chairman || '').trim();
        const safeCompanyName = this.escapeHtml(companyName);
        const safeChairmanName = this.escapeHtml(chairmanName);
        const safeSealUrl = this.safeUrl(data?.seal, true);
        const hasSeal = safeSealUrl || cfg.preparedSeal;
        const sealWidth = Number(cfg.sealWidth || 60);
        const sealCenterOffset = Number(cfg.sealCenterOffset || 0);
        const maxWidthCss = String(cfg.maxWidth || '560px').replace(/"/g, '');
        const chairmanRightReservePx = hasSeal ? Math.max(0, Math.round((sealWidth / 2) - sealCenterOffset)) : 0;
        const chairmanMaxWidthCss = hasSeal ? `calc(${maxWidthCss} - ${chairmanRightReservePx}px)` : maxWidthCss;
        const maxWidthPx = Number(cfg.maxWidthPx || 520);
        const companyFit = this.fitSignatureText(companyName, {
            initialFontSize: Number(cfg.companyFontSize || 18),
            minFontSize: Number(cfg.companyMinFontSize || 13),
            maxWidthPx,
            fontWeight: 700
        });
        const chairmanFit = this.fitSignatureText(`이사장 ${chairmanName}`, {
            initialFontSize: Number(cfg.chairmanFontSize || 22),
            minFontSize: Number(cfg.chairmanMinFontSize || 15),
            maxWidthPx: Math.max(180, maxWidthPx - chairmanRightReservePx),
            fontWeight: Number(cfg.fontWeight || 700)
        });
        const companyLine = companyName
            ? `<div style="display:inline-block; max-width:${maxWidthCss}; text-align:center; font-size:${companyFit.fontSize}px; font-weight:700; line-height:1.3; white-space:${companyFit.wrap ? 'normal' : 'nowrap'}; word-break:${companyFit.wrap ? 'keep-all' : 'normal'}; overflow-wrap:${companyFit.wrap ? 'anywhere' : 'normal'};">${safeCompanyName}</div>`
            : '';

        return `
            <div style="text-align:center; margin-top:${Number(cfg.marginTop || 40)}px;">
                <div style="display:inline-flex; flex-direction:column; align-items:center; max-width:${maxWidthCss};">
                    ${companyLine}
                    <div style="display:inline-block; position:relative; margin-top:${companyLine ? '6px' : '0'};">
                        <div style="display:inline-block; max-width:${chairmanMaxWidthCss}; text-align:center; font-size:${chairmanFit.fontSize}px; font-weight:${cfg.fontWeight || 700}; line-height:1.3; white-space:${chairmanFit.wrap ? 'normal' : 'nowrap'}; word-break:${chairmanFit.wrap ? 'keep-all' : 'normal'}; overflow-wrap:${chairmanFit.wrap ? 'anywhere' : 'normal'};">이사장 ${safeChairmanName}</div>
                        ${hasSeal ? `<img ${cfg.preparedSeal ? 'data-employee-certificate-seal' : `src="${safeSealUrl}"`} style="position:absolute; left:calc(100% - ${sealWidth / 2}px + ${sealCenterOffset}px); bottom:${cfg.sealBottom || '-6px'}; width:${sealWidth}px; opacity:${cfg.sealOpacity || 0.8};">` : ''}
                    </div>
                </div>
            </div>`;
    },

    // 2. 팝업창 열기 및 렌더링 (Core Function)
    openWindow: function(type, htmlContent, reservedWindow) {
        const win = reservedWindow || window.open('', '', 'width=900,height=1100');
        if (!win) return;
        if (type === 'salary') {
            const fullSalaryHtml = this.buildSalaryWindowHtml(htmlContent);
            win.document.open();
            win.document.write(fullSalaryHtml);
            win.document.close();
            return;
        }
        const finalCss = type === 'ledger' ? this.styles.landscape : this.styles.portrait;
        const pageClass = type === 'ledger' ? 'print-ledger' : (type === 'salary' ? 'print-salary' : 'print-cert');

        const fullHtml = `
        <html>
            <head>
                <title>인쇄 미리보기</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>${this.styles.common} ${finalCss}</style>
            </head>
            <body>
                <div class="print-fab no-print">
                    <span class="small fw-bold">인쇄 미리보기</span>
                    <button class="btn btn-primary btn-sm rounded-pill" onclick="window.print()">🖨️ 인쇄하기</button>
                    <button class="btn btn-secondary btn-sm rounded-pill" onclick="window.close()">닫기</button>
                </div>
                <div class="page-wrap ${pageClass}">
                    <div class="print-content">${htmlContent}</div>
                </div>
            </body>
        </html>`;

        win.document.write(fullHtml);
        win.document.close();
    },

    buildSalaryWindowHtml: function(salaryArticleHtml) {
        return `<!DOCTYPE html>
        <html lang="ko">
            <head>
                <meta charset="utf-8">
                <title>급여명세서 인쇄 미리보기</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>${this.styles.common} ${this.styles.salary}</style>
            </head>
            <body>
                <div class="print-fab no-print">
                    <span class="small fw-bold">인쇄 미리보기</span>
                    <button class="btn btn-primary btn-sm rounded-pill" onclick="window.__fitSalaryPaper&&window.__fitSalaryPaper();window.print()">🖨️ 인쇄하기</button>
                    <button class="btn btn-secondary btn-sm rounded-pill" onclick="window.close()">닫기</button>
                </div>
                <div class="salary-page">${salaryArticleHtml}</div>
                <script>
                    (function(){
                        function fit(){
                            var p = document.querySelector('.salary-paper');
                            if (!p || !p.clientHeight) return;
                            p.classList.remove('salary-paper--compact', 'salary-paper--tight');
                            if (p.scrollHeight > p.clientHeight + 1) p.classList.add('salary-paper--compact');
                            if (p.scrollHeight > p.clientHeight + 1) p.classList.add('salary-paper--tight');
                        }
                        window.__fitSalaryPaper = fit;
                        window.addEventListener('load', fit);
                        window.addEventListener('beforeprint', fit);
                        var imgs = document.querySelectorAll('img');
                        for (var i = 0; i < imgs.length; i++) imgs[i].addEventListener('load', fit);
                        fit();
                    })();
                <\/script>
            </body>
        </html>`;
    },

    buildSalaryArticleHtml: function(data) {
        const safeData = {
            titleDate: this.escapeHtml(data?.titleDate),
            attrDate: this.formatMultilineHtml(data?.attrDate),
            payDate: this.escapeHtml(data?.payDate),
            empInfo: this.escapeHtml(data?.empInfo),
            dept: this.escapeHtml(data?.dept),
            pos: this.escapeHtml(data?.pos),
            p_basic: this.escapeHtml(data?.p_basic),
            p_meal: this.escapeHtml(data?.p_meal),
            p_car: this.escapeHtml(data?.p_car),
            p_pos: this.escapeHtml(data?.p_pos),
            p_svc: this.escapeHtml(data?.p_svc),
            p_ot: this.escapeHtml(data?.p_ot),
            p_child: this.escapeHtml(data?.p_child),
            p_bonus: this.escapeHtml(data?.p_bonus),
            p_total: this.escapeHtml(data?.p_total),
            d_pen: this.escapeHtml(data?.d_pen),
            d_hlt: this.escapeHtml(data?.d_hlt),
            d_care: this.escapeHtml(data?.d_care),
            d_emp: this.escapeHtml(data?.d_emp),
            d_inc: this.escapeHtml(data?.d_inc),
            d_loc: this.escapeHtml(data?.d_loc),
            d_tax_adj: this.escapeHtml(data?.d_tax_adj),
            d_tax_adj_label: this.escapeHtml(data?.d_tax_adj_label || '원천세 과공제 정산'),
            d_adv: this.escapeHtml(data?.d_adv),
            d_adv_label: this.escapeHtml(data?.d_adv_label || '기타조정'),
            d_cap: this.escapeHtml(data?.d_cap),
            d_total: this.escapeHtml(data?.d_total),
            net: this.escapeHtml(data?.net),
            logo: this.safeUrl(data?.logo, true),
            seal: this.safeUrl(data?.seal, true),
            chairman: this.escapeHtml(String(data?.chairman ?? '').trim()),
            compName: this.escapeHtml(String(data?.compName ?? '').trim())
        };
        const isZero = val => {
            const t = String(val ?? '').trim();
            return !t || t === '0' || t === '0원';
        };
        const withWon = val => {
            const t = String(val ?? '').trim();
            if (!t) return '0원';
            return t.endsWith('원') ? t : `${t}원`;
        };
        const rowHtml = (label, val) =>
            `<tr><td class="salary-detail-label">${label}</td><td class="salary-detail-amt${isZero(val) ? ' is-zero' : ''}">${val}</td></tr>`;

        const payRows = [
            ['기본급', safeData.p_basic],
            ['식대', safeData.p_meal],
            ['차량유지비', safeData.p_car],
            ['직책수당', safeData.p_pos],
            ['근속수당', safeData.p_svc],
            ['연장수당', safeData.p_ot],
            ['육아수당', safeData.p_child],
            ['상여금', safeData.p_bonus]
        ].map(([k, v]) => rowHtml(k, v)).join('');

        const taxAdjustmentRaw = String(data?.d_tax_adj ?? '').trim();
        const dedItems = [
            ['국민연금', safeData.d_pen],
            ['건강보험', safeData.d_hlt],
            ['장기요양', safeData.d_care],
            ['고용보험', safeData.d_emp],
            ['소득세', safeData.d_inc],
            ['지방소득세', safeData.d_loc]
        ];
        if (taxAdjustmentRaw && taxAdjustmentRaw !== '0') {
            dedItems.push([safeData.d_tax_adj_label, safeData.d_tax_adj]);
        }
        dedItems.push([safeData.d_adv_label, safeData.d_adv]);
        dedItems.push(['출자금', safeData.d_cap]);
        const dedRows = dedItems.map(([k, v]) => rowHtml(k, v)).join('');

        const deptRaw = String(data?.dept ?? '').trim();
        const posRaw = String(data?.pos ?? '').trim();
        const deptPosHtml = deptRaw && posRaw
            ? `${safeData.dept} / ${safeData.pos}`
            : (safeData.dept || safeData.pos || '-');

        const isCompactDefault = dedItems.length > 8 || String(data?.attrDate ?? '').includes('\n') || String(data?.attrDate ?? '').includes('<br') || String(data?.compName ?? '').length > 18;

        return `<article class="salary-paper${isCompactDefault ? ' salary-paper--compact' : ''}">
            <div>
                <div class="salary-meta">
                    <span>지급일자 : <strong>${safeData.payDate}</strong></span>
                    <span class="salary-meta-en">PAYSLIP</span>
                </div>
                <header class="salary-heading">
                    <h1>${safeData.titleDate} 급여명세서</h1>
                </header>
                <table class="salary-info-table">
                    <colgroup><col style="width:17%"><col style="width:33%"><col style="width:18%"><col style="width:32%"></colgroup>
                    <tbody>
                        <tr>
                            <th scope="row">귀속연월</th>
                            <td class="has-divider">${safeData.attrDate}</td>
                            <th scope="row">사원번호/명</th>
                            <td>${safeData.empInfo}</td>
                        </tr>
                        <tr>
                            <th scope="row">지급일자</th>
                            <td class="has-divider">${safeData.payDate}</td>
                            <th scope="row">소속/직급</th>
                            <td>${deptPosHtml}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="salary-columns">
                    <div>
                        <div class="salary-col-head salary-col-head--pay">
                            <span>지급내역</span>
                            <span class="salary-col-unit">(단위: 원)</span>
                        </div>
                        <table class="salary-detail-table">
                            <colgroup><col style="width:60%"><col style="width:40%"></colgroup>
                            <tbody>${payRows}</tbody>
                        </table>
                    </div>
                    <div>
                        <div class="salary-col-head salary-col-head--ded">
                            <span>공제내역</span>
                            <span class="salary-col-unit">(단위: 원)</span>
                        </div>
                        <table class="salary-detail-table">
                            <colgroup><col style="width:62%"><col style="width:38%"></colgroup>
                            <tbody>${dedRows}</tbody>
                        </table>
                    </div>
                </div>
                <div class="salary-summary-strip">
                    <div class="salary-summary-cell">
                        <div class="salary-summary-label">지급합계</div>
                        <div class="salary-summary-val">${withWon(safeData.p_total)}</div>
                    </div>
                    <div class="salary-summary-cell">
                        <div class="salary-summary-label">공제합계</div>
                        <div class="salary-summary-val">${withWon(safeData.d_total)}</div>
                    </div>
                    <div class="salary-summary-cell salary-summary-cell--net">
                        <div class="salary-summary-label">실지급액</div>
                        <div class="salary-summary-val">${withWon(safeData.net)}</div>
                    </div>
                </div>
                <div class="salary-thanks">노고에 감사드립니다.</div>
            </div>
            <footer class="salary-sig">
                ${safeData.compName ? `<div class="salary-sig-company">${safeData.compName}</div>` : ''}
                <div class="salary-sig-row">
                    <span class="salary-sig-chair">이사장 ${safeData.chairman}</span>
                    ${safeData.seal ? `<img class="salary-sig-seal" src="${safeData.seal}" alt="조합 직인">` : ''}
                </div>
            </footer>
        </article>`;
    },

    // 3. [기능] 급여명세서 출력
    printSalary: function(data, reservedWindow) {
        const content = this.buildSalaryArticleHtml(data);
        this.openWindow('salary', content, reservedWindow);
    },

    // 4. [기능] 재직/경력증명서 출력
    printCert: function(data, preparedPreview) {
        const simulationNotice=data?.simulation===true?'<style>.print-cert td,.print-cert th{font-size:11pt!important}.print-cert{font-size:11pt}</style><div style="text-align:center;font-weight:700;color:#8a4300;font-size:11pt">DEMO · 박람회 체험용 / 실제 증명서로 사용할 수 없어요</div>':'';
        const safeLogoUrl = this.safeUrl(data?.logo, true);
        const safeSiteUrl = this.escapeHtml(String(data?.siteUrl || '').trim());
        const safeDocNum = this.escapeHtml(data?.docNum);
        const safeName = this.escapeHtml(data?.name);
        const safeBirth = this.escapeHtml(data?.birth);
        const safeDept = this.escapeHtml(data?.dept);
        const safePos = this.escapeHtml(data?.pos);
        const safeAddress = this.formatMultilineHtml(data?.address);
        const safeTenure = this.escapeHtml(data?.tenure);
        const safePurpose = this.formatMultilineHtml(data?.purpose);
        const safeToday = this.escapeHtml(data?.today);
        const safeCertTitle = this.escapeHtml(String(data?.certTitle || '재직증명서'));
        const safeEmploymentStatement = this.formatMultilineHtml(data?.employmentStatement || '위와 같이 재직하고 있음을 증명합니다.');
        const footerLines = [];
        const addressBits = [String(data?.compAddr || '').trim(), String(data?.compName || '').trim()].filter(Boolean);
        if (addressBits.length > 0) footerLines.push(this.escapeHtml(addressBits.join(' ')));
        if (String(data?.contact || '').trim()) footerLines.push(`문의: ${this.escapeHtml(String(data.contact).trim())}`);
        const signatureBlock = this.buildSignatureBlock(data, {
            marginTop: 60,
            maxWidth: '560px',
            maxWidthPx: 560,
            companyFontSize: 20,
            companyMinFontSize: 14,
            chairmanFontSize: 24,
            chairmanMinFontSize: 16,
            sealWidth: 80,
            sealCenterOffset: 0,
            sealBottom: '-10px',
            sealPadding: 22,
            preparedSeal: preparedPreview?.hasSeal(),
            fontWeight: 'bold'
        });
        const content = `
        <div class="print-cert" style="padding: 20px; height: 100%; box-sizing: border-box; position: relative;">
            ${simulationNotice}
            ${safeLogoUrl ? `<img src="${safeLogoUrl}" style="position:absolute; left:20px; top:20px; height:45px;">` : ''}
            ${safeSiteUrl ? `<div style="text-align:right; font-size:12px; margin-top:20px; margin-bottom:5px;">${safeSiteUrl}</div>` : ''}
            <h2 style="text-align:center; font-size: 32px; text-decoration: underline; margin: 50px 0 40px 0; font-weight: bold;">${safeCertTitle.replace(/\s+/g, '').split('').join(' ')}</h2>
            <div style="text-align:right; font-size: 13px; margin-bottom: 20px;">문서번호: ${safeDocNum}</div>

            <div style="text-align:left; font-weight: bold; font-size: 16px; margin-top: 10px; margin-bottom: 5px;">1. 인적사항</div>
            <table style="width:100%;">
                <tr><th style="background:#f9f9f9; width:100px; padding:6px 10px;">성 명</th><td style="padding:6px 10px;">${safeName}</td><th style="background:#f9f9f9; width:100px; padding:6px 10px;">생년월일</th><td style="padding:6px 10px;">${safeBirth}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">소 속</th><td style="padding:6px 10px;">${safeDept}</td><th style="background:#f9f9f9; padding:6px 10px;">직 위</th><td style="padding:6px 10px;">${safePos}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">주 소</th><td colspan="3" style="padding:6px 10px;">${safeAddress}</td></tr>
            </table>

            <div style="text-align:left; font-weight: bold; font-size: 16px; margin-top: 20px; margin-bottom: 5px;">2. 재직사항</div>
            <table style="width:100%;">
                <tr><th style="background:#f9f9f9; width:100px; padding:6px 10px;">재직기간</th><td colspan="3" style="padding:6px 10px;">${safeTenure}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">용 도</th><td colspan="3" style="padding:6px 10px;">${safePurpose}</td></tr>
            </table>

            <div style="text-align:center; margin-top: 60px; font-size: 18px;">${safeEmploymentStatement}</div>
            <div style="text-align:center; margin-top: 30px; font-size: 18px;">${safeToday}</div>

            ${signatureBlock}
            ${footerLines.length > 0 ? `<div style="text-align:center; margin-top: 70px; font-size: 12px; color: #555;">${footerLines.join('<br>')}</div>` : ''}
        </div>`;
        if (preparedPreview) return preparedPreview.present(content, this.styles.common + this.styles.portrait);
        this.openWindow('cert', content);
    },

    // 5. [기능] 급여대장 출력
    printLedger: function(data) {
        const safeTitle = this.escapeHtml(data?.title);
        const safeLogoUrl = this.safeUrl(data?.logo, true);
        const defaultDeductionHeaders = ['국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '기타공제'];
        const deductionHeaders = Array.isArray(data?.deductionHeaders) && data.deductionHeaders.length > 0
            ? data.deductionHeaders.map((label) => this.escapeHtml(label || ''))
            : defaultDeductionHeaders.map((label) => this.escapeHtml(label));
        const deductionColspan = Math.max(1, deductionHeaders.length);
        const deductionHeaderHtml = deductionHeaders.map((label) => `<th>${label}</th>`).join('');
        const content = `
        <div style="padding: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 20px;">
                ${safeLogoUrl ? `<img src="${safeLogoUrl}" style="height:40px;">` : '<div></div>'}
                <div style="text-align:center;">
                    <h1 style="margin:0; font-size: 24px; text-decoration: underline;">${safeTitle}</h1>
                </div>
                <table style="width: 200px; border-collapse: collapse; text-align: center; float: right; margin-bottom: 10px;">
                    <tr><td style="border: 1px solid #000; background: #f0f0f0; font-size: 11px; padding: 2px; width:33%;">담당</td><td style="border: 1px solid #000; background: #f0f0f0; font-size: 11px; padding: 2px; width:33%;">사무국장</td><td style="border: 1px solid #000; background: #f0f0f0; font-size: 11px; padding: 2px; width:33%;">이사장</td></tr>
                    <tr><td style="border: 1px solid #000; height: 50px;"></td><td style="border: 1px solid #000; height: 50px;"></td><td style="border: 1px solid #000; height: 50px;"></td></tr>
                </table>
            </div>
            <div style="clear:both;"></div>
            <table>
                <thead>
                    <tr style="background:#e0e0e0;">
                        <th rowspan="2" style="width:30px;">No</th><th rowspan="2" style="width:70px;">성명</th>
                        <th colspan="6">지 급 내 역</th>
                        <th colspan="${deductionColspan}">공 제 내 역</th>
                        <th rowspan="2">공제계</th><th rowspan="2">차인지급액</th>
                    </tr>
                    <tr style="background:#f0f0f0;">
                        <th>기본급</th><th>식대</th><th>차량</th><th>기타수당</th><th>상여</th><th style="background:#fff3e0;">지급계</th>
                        ${deductionHeaderHtml}
                    </tr>
                </thead>
                <tbody>${data.tableBody}</tbody>
            </table>
        </div>`;
        this.openWindow('ledger', content);
    }
};
if (typeof window !== 'undefined') window.PrintService = PrintService;
