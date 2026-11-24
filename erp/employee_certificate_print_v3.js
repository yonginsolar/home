/* v3.0.0 — 재직·경력증명서 전용 A4 인쇄 (모던 네이비 3블록 · 열린 가로선 · 이사장 정중앙/직인 우측 정렬). 보호된 직인 준비와 출력 레이아웃은 별개다. */
(function (root) {
    'use strict';
    const bucket = 'attachments';
    const sealError = '등록된 직인을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';

    function storageAddress(value, storageBase, signedOnly = false) {
        const literal = /^https:\/\/[^/?#]+(\/[^?#]*)(?:[?#]|$)/i.exec(value);
        const url = new URL(value), base = new URL(storageBase);
        const path = literal?.[1]?.match(/^\/storage\/v1\/object\/(?:(public|sign|authenticated)\/)?attachments\/(.+)$/);
        if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || !path
            || (signedOnly && (path[1] !== 'sign' || !url.searchParams.get('token')))) throw Error(sealError);
        const segments = path[2].split('/').map(decodeURIComponent);
        if (segments.some(part => /[\/\\]/.test(part))) throw Error(sealError);
        return {url, segments};
    }

    function sealKey(value, storageBase, coopId) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        const segments = /^https:\/\//i.test(raw)
            ? storageAddress(raw, storageBase).segments : raw.replace(/^\/(?!\/)/, '').split('/');
        if (!coopId || segments.length < 3 || segments[0] !== 'company-seals' || segments[1] !== coopId
            || segments.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f\x7f?#]/.test(part))) throw Error(sealError);
        return segments.join('/');
    }

    function open({legacyReady = false} = {}) {
        const win = root.open('', '', 'width=900,height=1100');
        if (!win || win.closed) return null;
        const doc = win.document, controller = new AbortController();
        let seal = null, loaded = legacyReady, ready = false, presented = false, permanentlyOversized = false;
        let ensurePrintable = () => false;
        const isOpen = () => !controller.signal.aborted && !win.closed;
        const sealReady = () => !seal || (seal.complete && seal.naturalWidth > 0);
        function close() {
            controller.abort();
            if (!win.closed) win.close();
        }
        doc.open();
        doc.write('<html lang="ko"><head><meta charset="utf-8"><title>인쇄 미리보기</title><style id="pending-print">@media print{body{display:none}}</style></head><body><button type="button">닫기</button> <span role="status">재직증명서 준비 중…</span></body></html>');
        doc.close();
        doc.querySelector('button').addEventListener('click', close);
        win.addEventListener('pagehide', () => controller.abort(), {once:true});
        win.addEventListener('keydown', event => {
            if (!ready && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') event.preventDefault();
        }, true);
        win.addEventListener('beforeprint', () => { ensurePrintable(); });

        async function loadSeal({client, storageBase, coopId, previouslyRegistered, isCurrent}) {
            const cancelled = () => !isOpen() || !isCurrent();
            const check = () => { if (cancelled()) throw Error(sealError); };
            let timer, abort, done = false, stopImage = () => {};
            const cancel = new Promise((_, reject) => {
                abort = () => reject(Error(sealError));
                timer = root.setTimeout(abort, 12000);
                controller.signal.addEventListener('abort', abort, {once:true});
            });
            const checkStage = () => { if (done) throw Error(sealError); check(); };
            try {
                await Promise.race([cancel, (async () => {
                    checkStage();
                    const {data: setting, error: readError} = await client.from('ref_company_info')
                        .select('value').eq('coop_id',coopId).eq('key','seal_url').maybeSingle();
                    checkStage();
                    if (readError || (!setting && previouslyRegistered)) throw Error(sealError);
                    const key = sealKey(setting?.value, storageBase, coopId);
                    if (!key) return;
                    const {data, error} = await client.storage.from(bucket).createSignedUrl(key, 120);
                    checkStage();
                    if (error || !data?.signedUrl) throw Error(sealError);
                    const address = storageAddress(data.signedUrl, storageBase, true);
                    if (address.segments.join('/') !== key) throw Error(sealError);
                    const image = doc.createElement('img');
                    image.referrerPolicy = 'no-referrer';
                    image.alt = '조합 직인';
                    image.hidden = true;
                    doc.body.append(image);
                    stopImage = () => {image.onload = image.onerror = null; image.removeAttribute('src'); image.remove();};
                    await new Promise((resolve, reject) => {
                        image.onload = resolve;
                        image.onerror = () => reject(Error(sealError));
                        image.src = address.url.href;
                        if (image.complete && image.naturalWidth > 0) resolve();
                    });
                    if (image.decode) await image.decode();
                    checkStage();
                    if (!image.complete || !(image.naturalWidth > 0)) throw Error(sealError);
                    image.onload = image.onerror = null;
                    seal = image;
                    stopImage = () => {};
                })()]);
                loaded = true;
            } catch (_) {
                throw Error(sealError);
            } finally {
                done = true;
                root.clearTimeout(timer);
                controller.signal.removeEventListener('abort',abort);
                stopImage();
            }
        }

        function present(content, css) {
            if (!isOpen() || !loaded || presented || !sealReady()) return false;
            const style = doc.createElement('style');
            style.textContent = css;
            doc.head.append(style);
            // 이 자리에서만 기존 인쇄 서식에, 이미 읽어 온 동일한 이미지 노드를 끼운다.
            const body = doc.createElement('div');
            body.innerHTML = `<div class="print-fab no-print employee-print-actions"><span role="status">인쇄 미리보기</span>
                <button type="button" disabled>인쇄하기</button>
                <button type="button">닫기</button></div>
                <div class="employee-page print-cert">${content}</div>`;
            const slot = body.querySelector('[data-employee-certificate-seal]');
            if (seal) {
                if (!slot) return false;
                seal.style.cssText = slot.style.cssText;
                seal.className = slot.className;
                seal.hidden = false;
                slot.replaceWith(seal);
            }
            const [printButton, closeButton] = body.querySelectorAll('.print-fab button');
            const status = body.querySelector('[role=status]');
            const paper = body.querySelector('.employee-paper');
            const blocking = doc.getElementById('pending-print');
            const stampedImage = seal || body.querySelector('img[data-employee-certificate-seal]');
            const logoImage = body.querySelector('.employee-document-logo');
            printButton.addEventListener('click', () => { if (ensurePrintable()) win.print(); });
            closeButton.addEventListener('click', close);
            doc.body.replaceChildren(...body.childNodes);
            presented = true;
            function printable() {
                if (!isOpen()) return false;
                const fits = !permanentlyOversized && fitPaper(paper);
                const stampOk = !stampedImage || (stampedImage.complete && stampedImage.naturalWidth > 0);
                const logoOk = !logoImage || logoImage.complete;
                ready = fits && stampOk && logoOk;
                blocking.disabled = ready;
                // Keeping the same style node also blocks the browser's own print command.
                blocking.textContent = ready ? '' : '@media print{body{display:none!important}}';
                printButton.disabled = !ready;
                status.textContent = !fits ? '내용이 A4 한 장을 넘습니다. 인쇄할 수 없습니다.'
                    : !stampOk && stampedImage.complete ? '직인을 표시하지 못했습니다. 다시 열어 주세요.'
                    : ready ? '인쇄 미리보기' : '증명서 이미지 준비 중…';
                return ready;
            }
            permanentlyOversized = !fitPaper(paper);
            ensurePrintable = printable;
            for (const image of [stampedImage, logoImage].filter(Boolean)) {
                image.addEventListener('load', printable, {once:true});
                image.addEventListener('error', printable, {once:true});
            }
            printable();
            return !permanentlyOversized;
        }
        return {isOpen, loadSeal, present, hasSeal:()=>!!seal, discard:()=>{if (!presented || permanentlyOversized) close();}};
    }

    const certificateCss = `
        @page { size: A4 portrait; margin: 0; }
        body { font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; background: #525659; margin: 0; }
        @media print { html, body { margin: 0; background: #fff; } }
        .employee-page { width: 210mm; height: 297mm; margin: 0 auto; padding: 10mm; background: #ffffff; overflow: hidden; box-sizing: border-box; }
        .employee-paper {
            --ink: #19355c;
            --accent: #3b6ea5;
            --tint: #f3f6fb;
            --rule: #7e90a6;
            --rule-soft: #b8c6d8;
            --muted: #47586e;
            --text: #152235;
            height: 100%;
            border: .45mm solid var(--ink);
            padding: 9.5mm 11mm 8.5mm;
            color: var(--text);
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            font: 10.5pt/1.46 Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        }
        .employee-document-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4mm;
            min-height: 10mm;
            padding-bottom: 3.2mm;
            border-bottom: .28mm solid var(--rule-soft);
            margin-bottom: 5.5mm;
            font-size: 9pt;
            color: var(--muted);
        }
        .employee-document-logo { max-width: 48mm; max-height: 11mm; object-fit: contain; object-position: left center; display: block; }
        .employee-document-meta-right { text-align: right; line-height: 1.42; min-width: 0; }
        .employee-document-meta-right strong { color: var(--ink); font-weight: 700; }
        .employee-document-heading { text-align: center; margin: 0 0 6.5mm; }
        .employee-document-heading h1 {
            margin: 0;
            color: var(--ink);
            font-size: 24pt;
            line-height: 1.24;
            font-weight: 800;
            letter-spacing: .2em;
            text-indent: .2em;
        }
        .employee-document-heading p {
            margin: 1.6mm 0 2.6mm;
            font-weight: 700;
            font-size: 8.8pt;
            color: var(--muted);
            letter-spacing: .15em;
        }
        .employee-document-heading::after {
            display: block;
            content: "";
            width: 16mm;
            border-bottom: .55mm solid var(--accent);
            margin: 0 auto;
        }
        .employee-section { margin: 0 0 5.5mm; }
        .employee-section-head {
            display: flex;
            align-items: center;
            gap: 2.2mm;
            margin: 0 0 1.8mm;
        }
        .employee-section-num {
            display: inline-block;
            font-size: 8.8pt;
            font-weight: 800;
            color: var(--accent);
            letter-spacing: .04em;
            padding-right: 2mm;
            border-right: .45mm solid var(--accent);
            line-height: 1;
        }
        .employee-section h2 {
            margin: 0;
            color: var(--ink);
            font-weight: 800;
            font-size: 11pt;
            letter-spacing: -.01em;
        }
        .employee-section table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border-top: .5mm solid var(--ink);
            border-bottom: .42mm solid var(--ink);
            font: inherit;
        }
        .employee-section .employee-label { width: 28mm; }
        .employee-section th, .employee-section td {
            border: none;
            border-bottom: .24mm solid var(--rule);
            padding: 2.5mm 3mm;
            vertical-align: middle;
        }
        .employee-section tr:last-child th,
        .employee-section tr:last-child td { border-bottom: none; }
        .employee-section th {
            background: var(--tint);
            color: var(--ink);
            text-align: left;
            font-weight: 750;
            border-right: .24mm solid var(--rule-soft);
            word-break: keep-all;
        }
        .employee-section td + th { border-left: .24mm solid var(--rule-soft); }
        .employee-val-strong { color: var(--ink); font-weight: 700; }
        .employee-document-purpose { color: var(--ink); font-weight: 700; }
        .employee-paper [data-cert-flow] { display: block; min-width: 0; white-space: normal; word-break: keep-all; overflow-wrap: normal; }
        .employee-doc-token { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
        .employee-paper [data-cert-flow].cert-value-small { font-size: .92em; }
        .employee-paper [data-cert-flow].cert-value-break { overflow-wrap: break-word; }
        .employee-cert-bottom {
            margin-top: auto;
            padding-top: 5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .employee-cert-statement {
            text-align: center;
            margin: 0 0 3.2mm;
            font-size: 11.5pt;
            font-weight: 600;
            color: var(--text);
        }
        .employee-cert-date {
            text-align: center;
            margin: 0 0 5.5mm;
            font-size: 10.8pt;
            font-weight: 600;
            color: var(--muted);
            letter-spacing: .04em;
        }
        .employee-cert-signature {
            width: 100%;
            text-align: center;
            margin-bottom: 4.5mm;
        }
        .employee-cert-company {
            font-weight: 800;
            font-size: 14.5pt;
            color: var(--ink);
            letter-spacing: .04em;
            line-height: 1.28;
            margin-bottom: 1.5mm;
        }
        .employee-cert-chair-row {
            width: 100%;
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
            align-items: center;
            min-height: 11mm;
        }
        .employee-cert-chair-row.has-seal {
            grid-template-columns: minmax(27mm, 1fr) minmax(0, auto) minmax(27mm, 1fr);
            min-height: 24mm;
        }
        .employee-cert-chair {
            display: inline-flex;
            align-items: baseline;
            justify-content: center;
            gap: 2.2mm;
            min-width: 0;
            text-align: center;
            line-height: 1.28;
        }
        .employee-cert-chair-role {
            font-size: 11.5pt;
            font-weight: 650;
            color: var(--muted);
            letter-spacing: .12em;
            white-space: nowrap;
        }
        .employee-cert-chair-name {
            font-size: 15.5pt;
            font-weight: 800;
            color: var(--text);
            letter-spacing: .12em;
            text-indent: .12em;
        }
        .employee-cert-seal-slot {
            display: flex;
            justify-content: flex-start;
            align-items: center;
            padding-left: 3mm;
        }
        .employee-cert-seal {
            width: 24mm;
            height: 24mm;
            object-fit: contain;
            display: block;
            flex: 0 0 24mm;
        }
        .employee-cert-footer {
            width: 100%;
            text-align: center;
            border-top: .25mm solid var(--rule-soft);
            padding-top: 2.4mm;
            font-size: 8.6pt;
            color: var(--muted);
            line-height: 1.42;
        }
        .employee-cert-demo {
            text-align: center;
            font: bold 10.5pt/1.45 sans-serif;
            color: #8a4300;
            margin-bottom: 2.5mm;
        }
        /* Compact fallback for long addresses/purposes/organization names */
        .employee-paper.cert-paper-compact { padding: 7.5mm 9mm 7mm; font-size: 10pt; line-height: 1.4; }
        .employee-paper.cert-paper-compact .employee-document-meta { padding-bottom: 2.4mm; margin-bottom: 4mm; }
        .employee-paper.cert-paper-compact .employee-document-heading { margin-bottom: 4.5mm; }
        .employee-paper.cert-paper-compact .employee-document-heading h1 { font-size: 21.5pt; }
        .employee-paper.cert-paper-compact .employee-section { margin-bottom: 3.8mm; }
        .employee-paper.cert-paper-compact .employee-section .employee-label { width: 24mm; }
        .employee-paper.cert-paper-compact .employee-section th,
        .employee-paper.cert-paper-compact .employee-section td { padding: 1.75mm 2.3mm; }
        .employee-paper.cert-paper-compact .employee-cert-bottom { padding-top: 3mm; }
        .employee-paper.cert-paper-compact .employee-cert-statement { margin-bottom: 2.2mm; font-size: 10.8pt; }
        .employee-paper.cert-paper-compact .employee-cert-date { margin-bottom: 3.8mm; font-size: 10.2pt; }
        .employee-paper.cert-paper-compact .employee-cert-signature { margin-bottom: 3mm; }
        .employee-paper.cert-paper-compact .employee-cert-company { font-size: 13.5pt; }
        .employee-paper.cert-paper-compact .employee-cert-chair-name { font-size: 14.5pt; }
        /* Extra-tight fallback before triggering A4 overflow block */
        .employee-paper.cert-paper-tight { padding: 6mm 7.5mm 5.5mm; font-size: 9.4pt; line-height: 1.34; }
        .employee-paper.cert-paper-tight .employee-document-meta { min-height: 8mm; padding-bottom: 1.8mm; margin-bottom: 3mm; font-size: 8.5pt; }
        .employee-paper.cert-paper-tight .employee-document-heading { margin-bottom: 3.2mm; }
        .employee-paper.cert-paper-tight .employee-document-heading h1 { font-size: 19pt; }
        .employee-paper.cert-paper-tight .employee-document-heading p { margin: 1mm 0 1.8mm; font-size: 8pt; }
        .employee-paper.cert-paper-tight .employee-section { margin-bottom: 2.8mm; }
        .employee-paper.cert-paper-tight .employee-section-head { margin-bottom: 1.2mm; }
        .employee-paper.cert-paper-tight .employee-section h2 { font-size: 10pt; }
        .employee-paper.cert-paper-tight .employee-section .employee-label { width: 21.5mm; }
        .employee-paper.cert-paper-tight .employee-section th,
        .employee-paper.cert-paper-tight .employee-section td { padding: 1.25mm 1.9mm; }
        .employee-paper.cert-paper-tight .employee-cert-bottom { padding-top: 2mm; }
        .employee-paper.cert-paper-tight .employee-cert-statement { margin-bottom: 1.5mm; font-size: 10pt; }
        .employee-paper.cert-paper-tight .employee-cert-date { margin-bottom: 2.6mm; font-size: 9.6pt; }
        .employee-paper.cert-paper-tight .employee-cert-signature { margin-bottom: 2.2mm; }
        .employee-paper.cert-paper-tight .employee-cert-company { font-size: 12.5pt; margin-bottom: 1mm; }
        .employee-paper.cert-paper-tight .employee-cert-chair-role { font-size: 10.5pt; }
        .employee-paper.cert-paper-tight .employee-cert-chair-name { font-size: 13.5pt; }
        .employee-paper.cert-paper-tight .employee-cert-footer { padding-top: 1.6mm; font-size: 8pt; }
        .employee-print-actions { align-items: center; line-height: 1.3; font: 14px/1.3 sans-serif; }
        .employee-print-actions button { border: 1px solid #66768a; padding: 6px 12px; border-radius: 10px; background: white; color: #19355c; cursor: pointer; }
        .employee-print-actions button:disabled { opacity: .45; cursor: default; }
    `;

    function fitPaper(paper) {
        if (!paper || !paper.clientWidth) return false;
        const values = Array.from(paper.querySelectorAll('[data-cert-flow]'));
        const overflow = element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
        const tooTall = () => paper.scrollHeight > paper.clientHeight + 1;
        paper.classList.remove('cert-paper-compact', 'cert-paper-tight');
        values.forEach(node => node.classList.remove('cert-value-small', 'cert-value-break'));
        if (values.some(overflow) || tooTall()) paper.classList.add('cert-paper-compact');
        values.filter(overflow).forEach(node => node.classList.add('cert-value-small'));
        values.filter(overflow).filter(node => !node.hasAttribute('data-cert-atomic')).forEach(node => node.classList.add('cert-value-break'));
        if (tooTall()) {
            paper.classList.add('cert-paper-tight');
            values.filter(overflow).forEach(node => node.classList.add('cert-value-small'));
            values.filter(overflow).filter(node => !node.hasAttribute('data-cert-atomic')).forEach(node => node.classList.add('cert-value-break'));
        }
        return !values.some(overflow) && !overflow(paper) && !tooTall();
    }

    function print(service, data, preview) {
        const e = value => service.escapeHtml(value);
        const atomic = word => /^(?:\(₩[\d,]+\)|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+|[\d,]+(?:\.\d+)?(?:원|좌)?)$/.test(word);
        const valueHtml = value => String(value ?? '').split(/<br\s*\/?>|\r?\n/i).map(line =>
            line.split(/(\s+)/).map(word => atomic(word)
                ? `<span class="employee-doc-token">${e(word)}</span>` : e(word)).join('')).join('<br>');
        const flow = (value, cls = '', isAtomic = false) =>
            `<div class="${cls}" data-cert-flow${isAtomic ? ' data-cert-atomic' : ''}>${valueHtml(value)}</div>`;
        const simulation = data?.simulation === true;
        const certTitle = String(data?.certTitle || '재직증명서');
        const career = certTitle.includes('경력증명서');
        const sec2Title = career ? '경력사항' : '재직사항';
        const tenureLabel = career ? '근무기간' : '재직기간';
        const logo = service.safeUrl(data?.logo, true);
        const seal = service.safeUrl(data?.seal, true);
        const preparedSeal = preview?.hasSeal();
        const hasSealSlot = Boolean(preparedSeal || seal);
        const compName = String(data?.compName ?? '').trim();
        const bizNum = String(data?.bizNum ?? '').trim();
        const compAddr = String(data?.compAddr ?? '').trim();
        const contact = String(data?.contact ?? '').trim();
        const siteUrl = String(data?.siteUrl ?? '').trim();
        const today = String(data?.today ?? '').trim();
        const docNum = String(data?.docNum ?? '').trim();

        const orgRows = [];
        if (bizNum) {
            orgRows.push(`<tr><th scope="row">기 관 명</th><td class="employee-val-strong">${flow(compName)}</td><th scope="row">사업자번호</th><td>${flow(bizNum, '', true)}</td></tr>`);
        } else if (compName) {
            orgRows.push(`<tr><th scope="row">기 관 명</th><td colspan="3" class="employee-val-strong">${flow(compName)}</td></tr>`);
        }
        if (compAddr) {
            orgRows.push(`<tr><th scope="row">소 재 지</th><td colspan="3">${flow(compAddr)}</td></tr>`);
        }
        if (contact) {
            orgRows.push(`<tr><th scope="row">연 락 처</th><td colspan="3">${flow(contact)}</td></tr>`);
        }
        const orgSection = orgRows.length > 0 ? `
            <section class="employee-section">
                <div class="employee-section-head"><span class="employee-section-num">03</span><h2>발급기관 정보</h2></div>
                <table>
                    <colgroup><col class="employee-label"><col><col class="employee-label"><col></colgroup>
                    ${orgRows.join('')}
                </table>
            </section>` : '';

        const footerText = simulation
            ? ''
            : compName
                ? `본 증명서는 ${compName}에서 공식 발급한 문서입니다.${contact ? ` (문의: ${contact})` : ''}`
                : (contact ? `문의: ${contact}` : '');

        const content = `<article class="employee-paper">
            ${simulation ? '<div class="employee-cert-demo">DEMO · 박람회 체험용 / 실제 증명서로 사용할 수 없어요</div>' : ''}
            <div class="employee-document-meta">
                ${logo ? `<img class="employee-document-logo" src="${e(logo)}" alt="">` : '<div></div>'}
                <div class="employee-document-meta-right">
                    <div data-cert-flow data-cert-atomic>문서번호 <strong><span class="employee-doc-token">${e(docNum)}</span></strong></div>
                    ${today ? `<div data-cert-flow>발급일자 ${e(today)}</div>` : ''}
                    ${siteUrl ? flow(siteUrl) : ''}
                </div>
            </div>
            <header class="employee-document-heading">
                <h1>${e(certTitle)}</h1>
                <p>${career ? 'CERTIFICATE OF CAREER' : 'CERTIFICATE OF EMPLOYMENT'}</p>
            </header>
            <section class="employee-section">
                <div class="employee-section-head"><span class="employee-section-num">01</span><h2>인적사항</h2></div>
                <table>
                    <colgroup><col class="employee-label"><col><col class="employee-label"><col></colgroup>
                    <tr><th scope="row">성 명</th><td class="employee-val-strong">${flow(data?.name)}</td><th scope="row">생년월일</th><td>${flow(data?.birth)}</td></tr>
                    <tr><th scope="row">주 소</th><td colspan="3">${flow(data?.address)}</td></tr>
                </table>
            </section>
            <section class="employee-section">
                <div class="employee-section-head"><span class="employee-section-num">02</span><h2>${sec2Title}</h2></div>
                <table>
                    <colgroup><col class="employee-label"><col><col class="employee-label"><col></colgroup>
                    <tr><th scope="row">소 속</th><td>${flow(data?.dept)}</td><th scope="row">직 위</th><td>${flow(data?.pos)}</td></tr>
                    <tr><th scope="row">${tenureLabel}</th><td colspan="3" class="employee-val-strong">${flow(data?.tenure)}</td></tr>
                    <tr><th scope="row">발급용도</th><td colspan="3">${flow(data?.purpose, 'employee-document-purpose')}</td></tr>
                </table>
            </section>
            ${orgSection}
            <div class="employee-cert-bottom">
                ${flow(data?.employmentStatement || '위와 같이 재직하고 있음을 증명합니다.', 'employee-cert-statement')}
                ${flow(today, 'employee-cert-date')}
                <div class="employee-cert-signature">
                    ${flow(compName, 'employee-cert-company')}
                    <div class="employee-cert-chair-row${hasSealSlot ? ' has-seal' : ''}">
                        <div aria-hidden="true"></div>
                        <div class="employee-cert-chair">
                            <span class="employee-cert-chair-role">이사장</span>
                            <span class="employee-cert-chair-name" data-cert-flow>${valueHtml(data?.chairman ?? '')}</span>
                        </div>
                        <div class="employee-cert-seal-slot">
                            ${preparedSeal ? '<span class="employee-cert-seal" data-employee-certificate-seal></span>'
                                : seal ? `<img class="employee-cert-seal" data-employee-certificate-seal alt="조합 직인" src="${e(seal)}">` : ''}
                        </div>
                    </div>
                </div>
                ${footerText ? `<div class="employee-cert-footer">${flow(footerText)}</div>` : ''}
            </div>
        </article>`;
        const target = preview || open({legacyReady:true});
        return target?.present(content, service.styles.common + certificateCss) ?? false;
    }
    root.EmployeeCertificatePrint = Object.freeze({version:'3.0.0',open,print});
})(window);
