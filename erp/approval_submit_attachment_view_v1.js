/* Read-only submission attachment viewer. Raw documents stay in this preview's memory. */
(function (root) {
    'use strict';
    const pdfBase = new URL('../shared/vendor/pdfjs/', document.currentScript.src);
    const node = (tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    };

    function mount(stage, {file, name, type, kind, scroll, current, signal, passwordFor, fallback}) {
        const live = () => !signal.aborted && current();
        if (!live()) return;
        if (type === 'image') {
            const image = node('img', 'approval-submit-attachment-image');
            const url = URL.createObjectURL(file);
            signal.addEventListener('abort', () => { image.remove(); URL.revokeObjectURL(url); }, {once:true});
            image.alt = name;
            image.src = url;
            image.addEventListener('error', () => {
                if (live()) stage.textContent = '이미지를 표시하지 못했습니다.';
            }, {once:true});
            stage.replaceChildren(image);
            return;
        }

        const content = node('div','approval-submit-pdf');
        if (kind === 'summary') content.append(node('p','small mb-2','합산표 한 쪽만 남아 있어 전체 원본을 볼 수 없습니다.'));
        const status = node('p','small text-muted mb-2');status.setAttribute('role','status');
        const controls = node('div','d-flex flex-wrap gap-2 mb-2');
        const password = node('input','form-control form-control-sm w-auto');
        password.type = 'password';password.autocomplete = 'off';password.maxLength = 128;
        password.dataset.erpQueryControl = '';password.setAttribute('aria-label','PDF 암호');
        const retry = node('button','btn btn-outline-primary btn-sm','다시 열기');retry.type = 'button';
        controls.append(password,retry);
        const pages = node('div','approval-submit-pdf-pages');
        content.append(status,controls,pages);stage.replaceChildren(content);

        let task, observer, rendering, running = false, near = new Set(), version = 0;
        function reset() {
            version++;
            observer?.disconnect();observer = null;near.clear();
            rendering?.job.cancel();rendering = null;
            const previous = task;task = null;
            if (previous) void previous.destroy().catch(() => {});
            for (const canvas of pages.querySelectorAll('canvas')) canvas.width = canvas.height = 1;
            pages.replaceChildren();
        }
        signal.addEventListener('abort', () => {
            reset();password.value = '';content.remove();
        }, {once:true});

        function initializePages(pdf, rev, first) {
            const aspect = first.width + ' / ' + first.height;
            const slots = Array.from({length:pdf.numPages}, (_, i) => {
                const n = i+1;
                const section = node('section','approval-submit-pdf-page');
                section.dataset.pdfPage = n;
                const label = node('div','small text-muted',n+' / '+pdf.numPages+'쪽');
                const surface = node('div','approval-submit-pdf-paper');
                surface.style.aspectRatio = aspect;
                section.append(label,surface);
                return {n,section,surface,state:'waiting'};
            });
            pages.append(...slots.map(slot => slot.section));
            const byNode = new Map(slots.map(slot => [slot.section,slot]));
            let draining = false;
            const fresh = () => rev === version && live();
            const distance = slot => Math.abs(scroll.getBoundingClientRect().top-slot.section.getBoundingClientRect().top);
            const recycle = slot => {
                const canvas = slot.surface.querySelector('canvas');
                if (canvas) {canvas.remove();canvas.width = canvas.height = 1;}
                if (slot.state === 'drawn') slot.state = 'waiting';
            };
            const paint = async slot => {
                slot.state = 'painting';
                let canvas, page;
                try {
                    page = await pdf.getPage(slot.n);
                    if (!fresh() || !near.has(slot)) return;
                    const size = page.getViewport({scale:1});
                    const ratio = size.width + ' / ' + size.height;
                    slot.surface.style.aspectRatio = ratio;
                    const width = Math.min(1040,Math.max(300,scroll.clientWidth)*Math.min(root.devicePixelRatio||1,2));
                    const scale = Math.min(1.8,width/size.width,2000/size.height);
                    const view = page.getViewport({scale});
                    canvas = node('canvas');
                    canvas.setAttribute('aria-label',name+' '+slot.n+'쪽');
                    canvas.width = Math.max(1,Math.floor(view.width));
                    canvas.height = Math.max(1,Math.floor(view.height));
                    const job = page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'#fff'});
                    rendering = {job,slot};
                    await job.promise;
                    if (!fresh() || !near.has(slot)) return;
                    slot.surface.replaceChildren(canvas);slot.state = 'drawn';
                } catch (error) {
                    if (fresh() && near.has(slot) && error?.name !== 'RenderingCancelledException') {
                        slot.surface.textContent = '이 쪽을 표시하지 못했습니다.';
                        slot.state = 'failed';
                    }
                } finally {
                    if (rendering?.slot === slot) rendering = null;
                    if (slot.state !== 'drawn' && canvas) canvas.width = canvas.height = 1;
                    if (slot.state === 'painting') slot.state = 'waiting';
                    page?.cleanup();
                }
            };
            async function drain() {
                if (draining) return;
                draining = true;
                try {
                    while (fresh()) {
                        const next = Array.from(near).filter(slot=>slot.state==='waiting')
                            .sort((a,b)=>distance(a)-distance(b))[0];
                        if (!next) break;
                        await paint(next);
                    }
                } finally {draining = false;}
            }
            observer = new IntersectionObserver(entries => {
                if (!fresh()) return;
                for (const entry of entries) {
                    const slot = byNode.get(entry.target);
                    if (entry.isIntersecting) near.add(slot);
                    else {
                        near.delete(slot);recycle(slot);
                        if (rendering?.slot === slot) rendering.job.cancel();
                    }
                }
                void drain();
            },{root:scroll,rootMargin:'240px 0px'});
            for (const slot of slots) observer.observe(slot.section);
        }
        async function load(manual = false) {
            if (running || !live()) return;
            running = true;
            let pass = manual ? password.value : passwordFor?.() || '';
            reset();
            const rev = version;
            const fresh = () => live() && rev === version;
            password.value = '';controls.classList.add('d-none');
            status.textContent = 'PDF를 불러오는 중입니다.';
            try {
                if (!file.size || file.size > 10*1024*1024) throw Error('PDF_PREVIEW_LIMIT');
                const pdfjs = await import(new URL('pdf.mjs',pdfBase).href);
                if (!fresh()) return;
                const data = new Uint8Array(await file.arrayBuffer());
                if (!fresh()) return;
                pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs',pdfBase).href;
                task = pdfjs.getDocument({
                    data,password:pass,isEvalSupported:false,enableXfa:false,
                    cMapUrl:new URL('cmaps/',pdfBase).href,cMapPacked:true,
                    standardFontDataUrl:new URL('standard_fonts/',pdfBase).href,wasmUrl:new URL('wasm/',pdfBase).href
                });
                pass = '';
                const pdf = await task.promise;
                if (!fresh()) return;
                if (pdf.numPages > 200) throw Error('PDF_PREVIEW_LIMIT');
                const first = (await pdf.getPage(1)).getViewport({scale:1});
                if (!fresh()) return;
                status.textContent = pdf.numPages+'쪽';
                initializePages(pdf,rev,first);
            } catch (error) {
                if (!fresh()) return;
                reset();
                if (error?.message === 'PDF_PREVIEW_LIMIT' && kind !== 'source' && fallback) {fallback();return;}
                const locked = error?.name === 'PasswordException';
                password.classList.toggle('d-none',!locked);controls.classList.remove('d-none');
                status.textContent = locked ? 'PDF 암호를 입력해 주세요.' : 'PDF를 표시하지 못했습니다.';
            } finally {pass = '';running = false;}
        }
        retry.onclick = () => void load(true);
        password.addEventListener('keydown',event => {
            if (event.key==='Enter'&&!event.isComposing) {event.preventDefault();void load(true);}
        });
        void load();
    }
    root.ApprovalSubmitAttachmentView = Object.freeze({mount});
})(window);
