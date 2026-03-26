/* Version: v1.0.5 | Change: 2026-03-25 - Prefer shrinking long company names before wrapping in print signature blocks. */
const PrintService = {
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
        landscape: `
            @page { size: A4 landscape; margin: 10mm; } 
            .page-wrap { width: 297mm; min-height: 210mm; padding: 15mm; background: white; margin: 20px auto; } 
            table { width: 100%; border-collapse: collapse; font-size: 11px; } 
            th, td { border: 1px solid #999; padding: 4px 6px; } 
            th { background-color: #f5f5f5; text-align: center; font-weight: bold; white-space: nowrap; } 
            .text-center { text-align: center; } .text-end { text-align: right; } .fw-bold { font-weight: bold; } .bg-light { background-color: #f9f9f9; }
        `
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
        const sealWidth = Number(cfg.sealWidth || 60);
        const sealPadding = Number(cfg.sealPadding || 16);
        const paddingRight = data?.seal ? `${sealWidth + sealPadding}px` : '0';
        const maxWidthPx = Number(cfg.maxWidthPx || 520);
        const availableWidthPx = Math.max(180, maxWidthPx - (data?.seal ? (sealWidth + sealPadding) : 0));
        const companyFit = this.fitSignatureText(companyName, {
            initialFontSize: Number(cfg.companyFontSize || 18),
            minFontSize: Number(cfg.companyMinFontSize || 13),
            maxWidthPx: availableWidthPx,
            fontWeight: 700
        });
        const chairmanFit = this.fitSignatureText(`이사장 ${chairmanName}`, {
            initialFontSize: Number(cfg.chairmanFontSize || 22),
            minFontSize: Number(cfg.chairmanMinFontSize || 15),
            maxWidthPx: availableWidthPx,
            fontWeight: Number(cfg.fontWeight || 700)
        });
        const companyLine = companyName
            ? `<div style="font-size:${companyFit.fontSize}px; font-weight:700; line-height:1.3; white-space:${companyFit.wrap ? 'normal' : 'nowrap'}; word-break:${companyFit.wrap ? 'keep-all' : 'normal'}; overflow-wrap:${companyFit.wrap ? 'anywhere' : 'normal'};">${companyName}</div>`
            : '';

        return `
            <div style="text-align:center; margin-top:${Number(cfg.marginTop || 40)}px;">
                <div style="display:inline-block; position:relative; max-width:${cfg.maxWidth || '560px'}; padding-right:${paddingRight};">
                    ${companyLine}
                    <div style="font-size:${chairmanFit.fontSize}px; font-weight:${cfg.fontWeight || 700}; line-height:1.3; margin-top:${companyLine ? '6px' : '0'}; white-space:${chairmanFit.wrap ? 'normal' : 'nowrap'}; word-break:${chairmanFit.wrap ? 'keep-all' : 'normal'}; overflow-wrap:${chairmanFit.wrap ? 'anywhere' : 'normal'};">이사장 ${chairmanName}</div>
                    ${data?.seal ? `<img src="${data.seal}" style="position:absolute; right:0; bottom:${cfg.sealBottom || '-6px'}; width:${sealWidth}px; opacity:${cfg.sealOpacity || 0.8};">` : ''}
                </div>
            </div>`;
    },

    // 2. 팝업창 열기 및 렌더링 (Core Function)
    openWindow: function(type, htmlContent) {
        const win = window.open('', '', 'width=900,height=1100');
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

    // 3. [기능] 급여명세서 출력
    printSalary: function(data) {
        const signatureBlock = this.buildSignatureBlock(data, {
            marginTop: 40,
            maxWidth: '520px',
            maxWidthPx: 520,
            companyFontSize: 17,
            companyMinFontSize: 13,
            chairmanFontSize: 20,
            chairmanMinFontSize: 15,
            sealWidth: 60,
            sealBottom: '-8px',
            fontWeight: 600
        });
        const content = `
        <div class="print-salary" style="padding: 10px; height: 100%;">
            <h1 style="text-align:center; margin-bottom: 30px; font-size: 28px; margin-top: 50px;">${data.titleDate} 급여명세서</h1>
            <table style="width:100%; margin-bottom:20px;">
                <tr><th style="background:#f5f5f5; padding:8px; width:18%;">귀속연월</th><td style="padding:8px; width:32%;">${data.attrDate}</td><th style="background:#f5f5f5; padding:8px; width:18%;">사원번호/명</th><td style="padding:8px;">${data.empInfo}</td></tr>
                <tr><th style="background:#f5f5f5; padding:8px;">지급일자</th><td style="padding:8px;">${data.payDate}</td><th style="background:#f5f5f5; padding:8px;">소속/직급</th><td style="padding:8px;">${data.dept} / ${data.pos}</td></tr>
            </table>
            <div style="display:flex; gap:20px; border-top:2px solid #888; padding-top:10px;">
                <div style="flex:1;">
                    <div style="text-align:center; font-weight:bold; padding:5px; border-bottom:2px solid #0d47a1; color:#0d47a1; margin-bottom:5px;">지급내역</div>
                    <table style="width:100%;">
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">기본급</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_basic}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">식 대</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_meal}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">차량유지비</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_car}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">직책수당</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_pos}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">근속수당</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_svc}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">연장수당</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_ot}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">육아수당</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_child}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">상여금</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.p_bonus}</td></tr>
                    </table>
                </div>
                <div style="flex:1;">
                    <div style="text-align:center; font-weight:bold; padding:5px; border-bottom:2px solid #b71c1c; color:#b71c1c; margin-bottom:5px;">공제내역</div>
                    <table style="width:100%;">
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">국민연금</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_pen}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">건강보험</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_hlt}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">장기요양</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_care}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">고용보험</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_emp}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">소득세</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_inc}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">지방소득세</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_loc}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_adv_label || '기타조정'}</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_adv}</td></tr>
                        <tr><td style="padding:5px; border:none; border-bottom:1px solid #eee;">출자금</td><td class="text-end" style="padding:5px; border:none; border-bottom:1px solid #eee;">${data.d_cap}</td></tr>
                    </table>
                </div>
            </div>
            <div style="border-top:1px solid #999; margin-bottom:20px;"></div>
            <div style="height:120px; position:relative;">
                <div style="position:absolute; top:30px; left:20px; color:#666;">노고에 감사드립니다.</div>
                <table style="position:absolute; right:0; top:0; width:350px; background:#fff;">
                    <tr><td style="background:#f5f5f5;">지급합계</td><td class="text-end">${data.p_total}</td></tr>
                    <tr><td style="background:#f5f5f5;">공제합계</td><td class="text-end">${data.d_total}</td></tr>
                    <tr><td style="background:#f5f5f5;">실지급액</td><td class="text-end" style="font-weight:bold;">${data.net}</td></tr>
                </table>
            </div>
            ${signatureBlock}
        </div>`;
        this.openWindow('salary', content);
    },

    // 4. [기능] 재직/경력증명서 출력
    printCert: function(data) {
        const siteUrl = String(data?.siteUrl || '').trim();
        const footerLines = [];
        const addressBits = [String(data?.compAddr || '').trim(), String(data?.compName || '').trim()].filter(Boolean);
        if (addressBits.length > 0) footerLines.push(addressBits.join(' '));
        if (String(data?.contact || '').trim()) footerLines.push(`문의: ${String(data.contact).trim()}`);
        const signatureBlock = this.buildSignatureBlock(data, {
            marginTop: 60,
            maxWidth: '560px',
            maxWidthPx: 560,
            companyFontSize: 20,
            companyMinFontSize: 14,
            chairmanFontSize: 24,
            chairmanMinFontSize: 16,
            sealWidth: 80,
            sealBottom: '-10px',
            sealPadding: 22,
            fontWeight: 'bold'
        });
        const content = `
        <div class="print-cert" style="padding: 20px; height: 100%; box-sizing: border-box; position: relative;">
            ${data.logo ? `<img src="${data.logo}" style="position:absolute; left:20px; top:20px; height:45px;">` : ''}
            ${siteUrl ? `<div style="text-align:right; font-size:12px; margin-top:20px; margin-bottom:5px;">${siteUrl}</div>` : ''}
            <h2 style="text-align:center; font-size: 32px; text-decoration: underline; margin: 50px 0 40px 0; font-weight: bold;">${String(data.certTitle || '재직증명서').replace(/\s+/g, '').split('').join(' ')}</h2>
            <div style="text-align:right; font-size: 13px; margin-bottom: 20px;">문서번호: ${data.docNum}</div>
            
            <div style="text-align:left; font-weight: bold; font-size: 16px; margin-top: 10px; margin-bottom: 5px;">1. 인적사항</div>
            <table style="width:100%;">
                <tr><th style="background:#f9f9f9; width:100px; padding:6px 10px;">성 명</th><td style="padding:6px 10px;">${data.name}</td><th style="background:#f9f9f9; width:100px; padding:6px 10px;">생년월일</th><td style="padding:6px 10px;">${data.birth}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">소 속</th><td style="padding:6px 10px;">${data.dept}</td><th style="background:#f9f9f9; padding:6px 10px;">직 위</th><td style="padding:6px 10px;">${data.pos}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">주 소</th><td colspan="3" style="padding:6px 10px;">${data.address}</td></tr>
            </table>

            <div style="text-align:left; font-weight: bold; font-size: 16px; margin-top: 20px; margin-bottom: 5px;">2. 재직사항</div>
            <table style="width:100%;">
                <tr><th style="background:#f9f9f9; width:100px; padding:6px 10px;">재직기간</th><td colspan="3" style="padding:6px 10px;">${data.tenure}</td></tr>
                <tr><th style="background:#f9f9f9; padding:6px 10px;">용 도</th><td colspan="3" style="padding:6px 10px;">${data.purpose}</td></tr>
            </table>

            <div style="text-align:center; margin-top: 60px; font-size: 18px;">${data.employmentStatement || '위와 같이 재직하고 있음을 증명합니다.'}</div>
            <div style="text-align:center; margin-top: 30px; font-size: 18px;">${data.today}</div>
            
            ${signatureBlock}
            ${footerLines.length > 0 ? `<div style="text-align:center; margin-top: 70px; font-size: 12px; color: #555;">${footerLines.join('<br>')}</div>` : ''}
        </div>`;
        this.openWindow('cert', content);
    },

    // 5. [기능] 급여대장 출력
    printLedger: function(data) {
        const content = `
        <div style="padding: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 20px;">
                ${data.logo ? `<img src="${data.logo}" style="height:40px;">` : '<div></div>'}
                <div style="text-align:center;">
                    <h1 style="margin:0; font-size: 24px; text-decoration: underline;">${data.title}</h1>
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
                        <th colspan="7">공 제 내 역</th>
                        <th rowspan="2">공제계</th><th rowspan="2">차인지급액</th>
                    </tr>
                    <tr style="background:#f0f0f0;">
                        <th>기본급</th><th>식대</th><th>차량</th><th>기타수당</th><th>상여</th><th style="background:#fff3e0;">지급계</th>
                        <th>국민연금</th><th>건강보험</th><th>장기요양</th><th>고용보험</th><th>소득세</th><th>지방세</th><th>기타공제</th>
                    </tr>
                </thead>
                <tbody>${data.tableBody}</tbody>
            </table>
        </div>`;
        this.openWindow('ledger', content);
    }
};
