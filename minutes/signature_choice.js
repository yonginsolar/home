// Signature data/drafts live only in this page's memory, scoped to its authenticated signer.
export function signatureSnapshot(doc) {
    return Object.fromEntries(['id', 'title', 'content', 'status', 'doc_type', 'requires_sign', 'signer_ids']
        .map(key => [key, doc[key] ?? null]));
}

export function createSignatureChoice(api) {
    const drafts = new Map();
    let owner = null, view = null, generation = 0, restoreFocus = null, previewUrl = '';
    const dialog = document.createElement('dialog');
    dialog.className = 'signature-choice';
    dialog.setAttribute('aria-labelledby', 'signature-choice-title');
    dialog.innerHTML = `<h2 id="signature-choice-title">서명 확인</h2>
      <p data-title></p><p data-status role="status" aria-live="polite"></p><button type="button" data-retry hidden>다시 확인</button>
      <div class="signature-choice-tools">
        <button type="button" data-previous>지난 서명 불러오기</button>
        <button type="button" data-registered hidden>등록된 서명</button>
        <button type="button" data-draw>새로 서명하기</button>
      </div>
      <figure hidden><img alt="선택한 본인 서명 미리보기"><figcaption></figcaption></figure>
      <div data-pad hidden><canvas width="480" height="180" aria-label="서명 입력 영역"></canvas>
        <button type="button" data-clear>다시 그리기</button></div>
      <div class="signature-choice-actions"><button type="button" data-close>닫기</button>
        <button type="button" class="signature-choice-complete" data-complete disabled>이 서명으로 완료</button></div>`;
    const css = document.createElement('style');
    css.textContent = `.signature-choice{box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #94a3b8;border-radius:16px;padding:24px;background:#fff;color:#0f172a;font:inherit;box-shadow:0 20px 70px #0005}
      .signature-choice::backdrop{background:#0f172a88}.signature-choice h2{margin:0 0 12px;font-size:1.3rem}
      .signature-choice p{overflow-wrap:anywhere;line-height:1.6}.signature-choice [data-status]{min-height:1.6em}
      .signature-choice-tools,.signature-choice-actions{display:flex;flex-wrap:wrap;gap:8px}.signature-choice-actions{justify-content:flex-end;margin-top:20px}
      .signature-choice button{font:inherit;padding:10px 14px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#0f172a;cursor:pointer;min-height:44px}
      .signature-choice button:focus-visible{outline:3px solid #2563eb;outline-offset:3px}.signature-choice button:disabled{opacity:.55;cursor:default}
      .signature-choice .signature-choice-complete{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
      .signature-choice figure{margin:16px 0}.signature-choice img,.signature-choice canvas{display:block;box-sizing:border-box;width:100%;height:180px;object-fit:contain;background:#fff;border:1px solid #cbd5e1;border-radius:8px}
      .signature-choice canvas{touch-action:none}.signature-choice figcaption{margin-top:8px}.signature-choice [data-clear]{margin-top:8px}
      [data-theme="dark"] .signature-choice{background:#111827;color:#f1f5f9}`;
    document.head.append(css);
    document.body.append(dialog);
    const el = selector => dialog.querySelector(selector);
    const canvas = el('canvas'), ctx = canvas.getContext('2d');
    const keyOf = context => `${context.authId}|${context.coopId}|${context.minuteId}|${context.officialId}`;
    const same = (context, token) => dialog.open && token === generation && view?.context === context
        && api.isCurrent(context);
    function message(text) { el('[data-status]').textContent = text; }
    function releaseUrl() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; el('img').removeAttribute('src'); }
    function sync() {
        if (!view) return;
        const { draft, ready } = view;
        const busy = view.busy || draft.running;
        const pending = !!draft.pending;
        for (const button of dialog.querySelectorAll('button:not([data-close])')) button.disabled = busy || pending;
        el('[data-complete]').disabled = busy || (!pending && (!ready || (draft.mode === 'draw' ? !draft.strokes.length : !draft.blob)));
        el('[data-complete]').textContent = pending ? '처리 결과 확인' : '이 서명으로 완료';
        // Kept separate from the selected image: an uncertain request can only be checked, never replaced.
        el('[data-registered]').hidden = !view.seal;
        el('[data-retry]').hidden = view.ready || busy || pending;
        el('[data-pad]').hidden = draft.mode !== 'draw';
        el('figure').hidden = draft.mode === 'draw' || !draft.blob;
    }
    function renderStrokes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
        for (const stroke of view?.draft.strokes || []) {
            if (!stroke.length) continue;
            ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
            if (stroke.length === 1) ctx.lineTo(stroke[0].x + .1, stroke[0].y + .1);
            else for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
            ctx.stroke();
        }
    }
    function showBlob(blob, caption) {
        releaseUrl(); previewUrl = URL.createObjectURL(blob); el('img').src = previewUrl;
        el('figcaption').textContent = caption;
    }
    async function prepare(context, previous = false) {
        const result = await readWithTimeout(api.prepare(context, previous));
        if (result.error) throw result.error;
        if (!result.data?.revision) throw new Error('SIGNATURE_PREPARE_FAILED');
        return result.data;
    }
    async function readWithTimeout(promise, milliseconds=15000) {
        let timer;
        try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SIGNATURE_RESPONSE_TIMEOUT')),milliseconds);})]); }
        finally { clearTimeout(timer); }
    }
    function errorText(error) {
        const value = String(error?.message || '');
        if (value.includes('SIGNATURE_DOCUMENT_CHANGED')) return '문서가 변경되었습니다. 문서를 다시 열어 확인해 주세요.';
        if (value.includes('SIGNATURE_ALREADY_SIGNED')) return '이미 서명한 문서입니다. 문서를 다시 열어 확인해 주세요.';
        if (value.includes('SIGNATURE_NOT_OPEN')) return '서명이 마감되었습니다. 문서를 다시 열어 확인해 주세요.';
        if (value.includes('AUDIT_OVERALL_OPINION_REQUIRED')) return '서명 전에 감사보고서의 종합 의견을 작성해 주세요.';
        if (value.includes('SIGNATURE_IMAGE_INVALID')) return '서명 이미지를 확인하지 못했습니다. 다시 불러오거나 새로 서명해 주세요.';
        if (error?.code === '42501') return '현재 서명 권한을 확인하지 못했습니다. 문서를 다시 열어 확인해 주세요.';
        return '서명을 불러오지 못했습니다. 다시 시도해 주세요.';
    }
    async function selectImage(kind) {
        if (!view || view.busy || view.draft.pending) return;
        const current = view, { context, draft } = current, token = ++generation;
        current.busy = true; message('서명을 불러오는 중입니다.'); sync();
        try {
            const data = await prepare(context, kind === 'previous');
            if (!same(context, token)) return;
            current.revision = data.revision; current.seal = data.seal_url; current.ready = true;
            const path = kind === 'previous' ? data.previous?.path : data.seal_url;
            if (!path) { message(kind === 'previous' ? '불러올 지난 서명이 없습니다. 새로 서명해 주세요.' : '등록된 서명이 없습니다.'); return; }
            const blob = await readWithTimeout(api.loadImage(path));
            if (!same(context, token)) return;
            if (!blob?.size || blob.size > 5 * 1024 * 1024 || !/^image\//.test(blob.type)) throw new Error('SIGNATURE_IMAGE_INVALID');
            draft.mode = kind; draft.blob = blob; draft.path = path;
            const signedAt = new Date(data.previous?.signed_at || '');
            draft.caption = kind === 'previous' ? (Number.isFinite(signedAt.getTime()) ? `지난 서명 · ${new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', dateStyle:'medium' }).format(signedAt)}` : '지난 본인 서명') : '등록된 본인 서명';
            showBlob(blob, draft.caption); message('미리보기를 확인한 뒤 완료해 주세요.');
        } catch (error) { if (same(context, token)) message(errorText(error)); }
        finally { if (same(context, token)) { current.busy = false; sync(); } }
    }
    async function open(context) {
        close();
        if (owner !== context.authId) { drafts.clear(); owner = context.authId; }
        const key = keyOf(context);
        let draft = drafts.get(key);
        if (!draft) { draft = { mode:'draw', strokes:[], blob:null, path:null, pending:null }; drafts.set(key, draft); }
        view = { context, draft, ready:false, busy:false, seal:null, revision:null };
        restoreFocus = document.activeElement;
        el('[data-title]').textContent = context.title;
        dialog.showModal(); renderStrokes(); if (draft.blob) showBlob(draft.blob, draft.caption || '작성 중인 서명');
        const current = view, token = ++generation;
        if (draft.pending) { message('이전 요청의 처리 결과를 확인해 주세요.'); sync(); return; }
        current.busy = true; message('서명 대상을 확인하고 있습니다.'); sync();
        try {
            const data = await prepare(context);
            if (!same(context, token)) return;
            current.revision = data.revision; current.seal = data.seal_url; current.ready = true;
            message('지난 서명을 불러오거나 새로 서명해 주세요.');
        } catch (error) { if (same(context, token)) message(errorText(error)); }
        finally { if (same(context, token)) { current.busy = false; sync(); } }
    }
    function close() {
        generation++;
        stroke = null;
        if (dialog.open) dialog.close();
        releaseUrl(); view = null;
        if (restoreFocus?.isConnected && !restoreFocus.disabled) restoreFocus.focus({preventScroll:true});
        restoreFocus = null;
    }
    function clear() { close(); drafts.clear(); owner = null; }
    let stroke = null;
    const point = event => { const rect = canvas.getBoundingClientRect(); return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:(event.clientY-rect.top)*canvas.height/rect.height }; };
    canvas.addEventListener('pointerdown', event => {
        if (!view || view.busy || view.draft.pending) return;
        event.preventDefault(); canvas.setPointerCapture(event.pointerId);
        stroke = [point(event)]; view.draft.strokes.push(stroke); renderStrokes(); sync();
    });
    canvas.addEventListener('pointermove', event => { if (stroke && view && !view.busy) { stroke.push(point(event)); renderStrokes(); } });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, () => { stroke = null; });
    el('[data-previous]').onclick = () => selectImage('previous');
    el('[data-retry]').onclick = () => { if (view && !view.busy && !view.draft.pending) open(view.context); };
    el('[data-registered]').onclick = () => selectImage('registered');
    el('[data-draw]').onclick = () => { if (!view || view.busy || view.draft.pending) return; view.draft.mode='draw'; renderStrokes(); message('아래에 새로 서명해 주세요.'); sync(); };
    el('[data-clear]').onclick = () => { if (!view || view.busy || view.draft.pending) return; view.draft.strokes=[]; renderStrokes(); sync(); };
    el('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const buttons = [...dialog.querySelectorAll('button')].filter(button => !button.disabled && !button.hidden && button.getClientRects().length);
        if (!buttons.length) return;
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    });
    el('[data-complete]').onclick = async () => {
        if (!view || view.busy || view.draft.running || el('[data-complete]').disabled) return;
        const current=view, {context,draft}=current, token=++generation;
        current.busy=true; draft.running=true; message(draft.pending ? '처리 결과를 확인하고 있습니다.' : '서명을 기록하고 있습니다.'); sync();
        try {
            if (!draft.pending) {
                const data = await prepare(context);
                if (!same(context,token)) return;
                if (data.revision !== current.revision) throw new Error('SIGNATURE_DOCUMENT_CHANGED');
                const blob = draft.mode==='draw' ? await new Promise(resolve=>canvas.toBlob(resolve,'image/png')) : draft.blob;
                if (!same(context,token)) return;
                if (!blob?.size) throw new Error('SIGNATURE_IMAGE_INVALID');
                const id=crypto.randomUUID();
                draft.pending={ id, revision:current.revision, blob, rawUploaded:false, previewUploaded:false,
                    path:draft.mode==='registered' ? draft.path : `signatures/${context.minuteId}/${context.officialId}_${Date.now()}.png`, registered:draft.mode==='registered' };
            }
            const pending=draft.pending;
            // Once started, retain this exact intent through uncertain replies. Never auto-repeat a write.
            if (!pending.registered && !pending.rawUploaded) {
                await readWithTimeout(api.uploadRaw(pending.path,pending.blob),25000); pending.rawUploaded=true;
            }
            if (!same(context,token)) return;
            if (!pending.previewUploaded) {
                await readWithTimeout(api.uploadPreview(context,pending),25000); pending.previewUploaded=true;
            }
            if (!same(context,token)) return;
            pending.sent=true;
            const result=await readWithTimeout(api.complete(context,pending),25000);
            if (result.error) throw result.error;
            if (!result.data?.verified || result.data.id!==pending.id) throw new Error('SIGNATURE_RESULT_UNKNOWN');
            drafts.delete(keyOf(context));
            if (same(context,token)) close();
            await api.onComplete(context);
        } catch (error) {
            const known = ['P0001','42501','22023','23505'].includes(error?.code);
            if (known && !draft.pending?.uncertain) draft.pending=null;
            else if (draft.pending?.sent) draft.pending.uncertain=true;
            if (same(context,token)) message(draft.pending ? '처리 결과를 확인하지 못했습니다. ‘처리 결과 확인’을 눌러 다시 확인해 주세요.' : errorText(error));
        } finally {
            draft.running=false;
            if (view?.draft===draft) { view.busy=false; sync(); }
        }
    };
    window.addEventListener('beforeunload', event => {
        if ([...drafts.values()].some(draft=>draft.strokes.length || draft.pending)) { event.preventDefault(); event.returnValue=''; }
    });
    return { open, close, clear };
}
