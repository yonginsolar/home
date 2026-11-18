/* v1.0.0 — 정렬된 첨부를 한 출력 문서에 준비한다. */
(function (root) {
    'use strict';
    const source = new URL('../shared/vendor/pdfjs/', document.currentScript?.src || document.baseURI);
    const byteLimit = 25 * 1024 * 1024;
    const imageLimit = 48 * 1024 * 1024;
    const pageLimit = 120;
    const failure = text => Object.assign(Error(text), { publicMessage: text });
    const names = {
        format: '이 형식은 묶음 출력에서 지원하지 않습니다. 원본을 내려받아 따로 출력해 주세요.',
        source: '이 링크는 묶음 출력에서 열 수 없습니다. 원본을 따로 확인해 주세요.',
        file: '파일을 불러오지 못했습니다. 파일이 남아 있는지와 열람 권한을 확인해 주세요.',
        wait: '파일 준비 시간이 초과됐습니다. 다시 열어 주세요.',
        decode: '파일을 출력용으로 읽지 못했습니다. 원본의 형식이나 암호를 확인해 주세요.',
        limit: '파일 크기 또는 묶음 출력 한도(120쪽)를 넘었습니다. 이 파일은 따로 출력해 주세요.'
    };
    function fileKind(name, mime = '') {
        if (/\.pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
        if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(name)
            || /^image\/(png|jpeg|gif|webp|bmp|svg\+xml|avif|heic|heif)$/i.test(mime)) return 'image';
        return '';
    }
    function attachmentList(original, receipt, { keyFor, nameFor }) {
        const items = new Map();
        const add = (entry, fromExecution) => {
            if (!entry) return;
            const key = keyFor(entry.rawRef) || (entry.rawRef ? 'link:'+entry.rawRef : 'missing-execution');
            if (items.has(key)) {
                if(fromExecution)items.get(key).receipt = true;
                return;
            }
            let name;
            try { name=entry.displayName || nameFor(entry.rawRef, '첨부파일 '+(items.size+1)); }
            catch (_) { name='첨부파일 '+(items.size+1); }
            items.set(key,{rawRef:entry.rawRef,name,receipt:fromExecution,missing:!entry.rawRef});
        };
        original.forEach(item=>add(item,false));
        add(receipt,true);
        return [...items.values()];
    }
    function active(signal) {
        if (signal?.aborted) throw Error('PRINT_CLOSED');
    }
    function canvasFor(width,height) {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width<1 || height<1) throw failure(names.decode);
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));
        const context=canvas.getContext('2d',{alpha:false});
        if (!context) throw failure(names.decode);
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
        return {canvas,context};
    }
    function takeCanvas(canvas) {
        const src=canvas.toDataURL('image/jpeg',0.94);
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(src))throw failure(names.decode);
        const result={src,width:canvas.width,height:canvas.height};
        canvas.width=canvas.height=1;
        return result;
    }
    async function imagePages(blob,signal) {
        const url=URL.createObjectURL(blob), img=new Image();
        const stop=()=>{img.removeAttribute('src');};
        signal?.addEventListener('abort',stop,{once:true});
        try {
            active(signal);
            img.src=url;
            await img.decode();
            active(signal);
            const w=img.naturalWidth,h=img.naturalHeight;
            const scale=Math.min(1,1660/w,2260/h);
            const {canvas,context}=canvasFor(w*scale,h*scale);
            context.drawImage(img,0,0,canvas.width,canvas.height);
            return [takeCanvas(canvas)];
        } finally {
            signal?.removeEventListener('abort',stop);
            URL.revokeObjectURL(url);
        }
    }
    async function pdfPages(blob,signal,available,maxBytes) {
        const pdf=await import(new URL('pdf.mjs',source).href);
        active(signal);
        const bytes=new Uint8Array(await blob.arrayBuffer());
        active(signal);
        pdf.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',source).href;
        const task=pdf.getDocument({data:bytes,cMapUrl:new URL('cmaps/',source).href,
            cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',source).href,
            wasmUrl:new URL('wasm/',source).href,isEvalSupported:false,stopAtErrors:true});
        const stop=()=>{void task.destroy().catch(()=>{});};
        signal?.addEventListener('abort',stop,{once:true});
        try {
            const doc=await task.promise, pages=[];
            if (doc.numPages<1 || doc.numPages>available) throw failure(names.limit);
            let used=0;
            for (let i=1;i<=doc.numPages;i++) {
                active(signal);
                const page=await doc.getPage(i);
                const original=page.getViewport({scale:1});
                const scale=Math.min(1660/original.width,2260/original.height);
                const viewport=page.getViewport({scale});
                const {canvas,context}=canvasFor(viewport.width,viewport.height);
                const render=page.render({canvas,canvasContext:context,viewport,background:'#fff',intent:'print'});
                try { await render.promise;active(signal);pages.push(takeCanvas(canvas)); }
                finally { canvas.width=canvas.height=1;page.cleanup(); }
                used+=pages.at(-1).src.length;
                if (used>maxBytes)throw failure(names.limit);
            }
            return pages;
        } finally {
            signal?.removeEventListener('abort',stop);
            await task.destroy().catch(()=>{});
        }
    }
    async function prepare(items,{read,signal,onProgress,renderPdf=pdfPages,renderImage=imagePages}) {
        const results=[];
        let remaining=pageLimit, remainingBytes=imageLimit;
        for (const item of items) {
            active(signal);
            onProgress?.(results.length+1,items.length);
            const timerController=new AbortController();
            const stop=()=>timerController.abort();
            signal?.addEventListener('abort',stop,{once:true});
            const timer=setTimeout(stop,25000);
            let abortWait;
            try {
                const end=new Promise((_,reject)=>{
                    abortWait=()=>reject(failure(names.wait));
                    timerController.signal.addEventListener('abort',abortWait,{once:true});
                });
                const pages=await Promise.race([end,(async()=>{
                    if(item.missing)throw failure(names.file);
                    if(remaining<1)throw failure(names.limit);
                    const path=String(item.rawRef||'').split(/[?#]/)[0];
                    if(!fileKind(item.name)&&!fileKind(path))throw failure(names.format);
                    const blob=await read(item,timerController.signal);
                    active(timerController.signal);
                    if(!blob?.size)throw failure(names.file);
                    if(blob.size>byteLimit)throw failure(names.limit);
                    const kind=fileKind(item.name,blob.type)||fileKind(path,blob.type);
                    return kind==='pdf'?renderPdf(blob,timerController.signal,remaining,remainingBytes):renderImage(blob,timerController.signal);
                })()]);
                active(timerController.signal);
                if(!pages.length || pages.length>remaining)throw failure(names.limit);
                const used=pages.reduce((n,p)=>n+p.src.length,0);
                if(used>remainingBytes)throw failure(names.limit);
                remaining-=pages.length;remainingBytes-=used;
                results.push({...item,pages});
            } catch (error) {
                active(signal);
                results.push({...item,pages:[],error:timerController.signal.aborted?names.wait:
                    error?.publicMessage || (error?.message==='APPROVAL_PRINT_FILE_READ'?names.file:names.decode)});
            } finally {
                clearTimeout(timer);signal?.removeEventListener('abort',stop);
                timerController.signal.removeEventListener('abort',abortWait);
            }
        }
        return results;
    }
    root.ApprovalPrintAttachments=Object.freeze({version:'1.0.0',attachmentList,fileKind,prepare,sourceError:()=>failure(names.source)});
})(window);
