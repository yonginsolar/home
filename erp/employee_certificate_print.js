/* 재직증명서 전용 인쇄 준비. 저장된 주소는 객체 경로를 식별할 때만 사용한다. */
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

    function open() {
        const win = root.open('', '', 'width=900,height=1100');
        if (!win || win.closed) return null;
        const doc = win.document, controller = new AbortController();
        let seal = null, loaded = false, ready = false;
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
            if (!isOpen() || !loaded || ready || !sealReady()) return false;
            const style = doc.createElement('style');
            style.textContent = css;
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css';
            doc.head.append(link, style);
            // 이 자리에서만 기존 인쇄 서식에, 이미 읽어 온 동일한 이미지 노드를 끼운다.
            const body = doc.createElement('div');
            body.innerHTML = `<div class="print-fab no-print"><span class="small fw-bold">인쇄 미리보기</span>
                <button type="button" class="btn btn-primary btn-sm rounded-pill">🖨️ 인쇄하기</button>
                <button type="button" class="btn btn-secondary btn-sm rounded-pill">닫기</button></div>
                <div class="page-wrap print-cert"><div class="print-content">${content}</div></div>`;
            const slot = body.querySelector('[data-employee-certificate-seal]');
            if (seal) {
                if (!slot) return false;
                seal.style.cssText = slot.style.cssText;
                seal.hidden = false;
                slot.replaceWith(seal);
            }
            const [printButton, closeButton] = body.querySelectorAll('.print-fab button');
            printButton.addEventListener('click', () => { if (isOpen() && ready && sealReady()) win.print(); });
            closeButton.addEventListener('click', close);
            doc.body.replaceChildren(...body.childNodes);
            doc.getElementById('pending-print').remove();
            ready = true;
            return true;
        }
        return {isOpen, loadSeal, present, hasSeal:()=>!!seal, discard:()=>{if (!ready) close();}};
    }
    root.EmployeeCertificatePrint = Object.freeze({open});
})(window);
