/* Version: v1.0.0 — One issued PDF, an in-memory preview, print and save. */
(function () {
  'use strict';
  let active = null;
  let rendererPromise = null;

  function clear() {
    const state = active;
    active = null;
    if (!state) return;
    state.doc = null;
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = '';
    state.frame?.remove();
    state.image?.removeAttribute('src');
    state.dialog.close();
    state.dialog.remove();
    document.documentElement.style.overflow = state.previousOverflow;
    if (state.focus?.isConnected) state.focus.focus({ preventScroll: true });
  }

  function start({ isCurrent, authorize } = {}) {
    clear();
    const dialog = document.createElement('dialog');
    dialog.className = 'contribution-cert-preview';
    dialog.setAttribute('aria-labelledby', 'contribution-cert-preview-title');
    dialog.innerHTML = `<style>
      .contribution-cert-preview{padding:0;border:1px solid #dbe2e8;border-radius:14px;width:min(920px,calc(100vw - 24px));max-width:calc(100vw - 24px);height:min(94dvh,1100px);max-height:94dvh;color:#17212b;background:#fff;word-break:keep-all;box-shadow:0 16px 70px #0004}
      .contribution-cert-preview::backdrop{background:#0008}
      .contribution-cert-preview .cert-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #dbe2e8;background:#fff}
      .contribution-cert-preview h2{font-size:18px;line-height:1.5;margin:0 auto 0 0;color:#17212b}
      .contribution-cert-preview button{font:inherit;font-size:14px;padding:8px 13px;border:1px solid #cbd5df;border-radius:7px;color:#17212b;background:#fff;cursor:pointer}
      .contribution-cert-preview button[data-action="save"]{background:#18734b;border-color:#18734b;color:#fff}
      .contribution-cert-preview button:disabled{opacity:.5;cursor:wait}
      .contribution-cert-preview button:focus-visible{outline:3px solid #4285f4;outline-offset:2px}
      .contribution-cert-preview .cert-scroll{height:calc(100% - 70px);overflow:auto;background:#e9edf1;padding:16px;text-align:center}
      .contribution-cert-preview .cert-status{color:#17212b;padding:40px 12px;white-space:pre-line}
      .contribution-cert-preview img{display:block;width:100%;max-width:794px;height:auto;margin:auto;background:#fff;box-shadow:0 2px 10px #0002;filter:none!important}
      @media(max-width:480px){.contribution-cert-preview .cert-toolbar{gap:6px;padding:10px}.contribution-cert-preview h2{font-size:16px;width:100%}.contribution-cert-preview .cert-scroll{height:calc(100% - 103px);padding:8px}.contribution-cert-preview button{flex:1}}
    </style><div class="cert-toolbar"><h2 id="contribution-cert-preview-title">출자증명서</h2><button type="button" data-action="print" disabled>인쇄</button><button type="button" data-action="save" disabled>PDF 저장</button><button type="button" data-action="close">닫기</button></div><div class="cert-scroll"><div class="cert-status" role="status">증명서를 준비하고 있습니다.</div></div>`;
    const state = { dialog, isCurrent, authorize, doc: null, frame: null, url: '', image: null,
      focus: document.activeElement, previousOverflow: document.documentElement.style.overflow, busy: false };
    active = state;
    document.body.appendChild(dialog);
    document.documentElement.style.overflow = 'hidden';
    const valid = () => active === state && (!isCurrent || isCurrent());
    const buttons = [...dialog.querySelectorAll('[data-action="print"], [data-action="save"]')];
    const status = dialog.querySelector('.cert-status');
    const fail = message => {
      if (!valid()) return;
      status.hidden = false;
      status.textContent = message;
    };
    dialog.querySelector('[data-action="close"]').onclick = clear;
    dialog.addEventListener('cancel', event => { event.preventDefault(); clear(); });
    dialog.showModal();
    dialog.querySelector('[data-action="close"]').focus();

    async function action(kind) {
      if (!valid() || !state.doc || state.busy) return;
      state.busy = true;
      buttons.forEach(button => { button.disabled = true; });
      try {
        if (authorize) await authorize();
        if (!valid()) return;
        if (kind === 'save') state.doc.save(state.fileName);
        else { state.frame.contentWindow.focus(); state.frame.contentWindow.print(); }
      } catch (_) {
        if (!valid()) clear();
        else fail('로그인 상태 또는 출력 준비를 확인하지 못했습니다. 다시 시도해 주세요.');
      } finally {
        state.busy = false;
        if (valid() && state.doc) buttons.forEach(button => { button.disabled = false; });
      }
    }
    buttons.forEach(button => { button.onclick = () => action(button.dataset.action); });

    return {
      isCurrent: valid,
      fail,
      async present({ doc, fileName }) {
        if (!valid()) return;
        state.doc = doc;
        state.fileName = fileName;
        state.url = URL.createObjectURL(doc.output('blob'));
        let pages;
        try {
          if (!rendererPromise) rendererPromise = import('/shared/pdf-page-renderer.js?v=20260919-1').catch(error => { rendererPromise = null; throw error; });
          const renderer = await rendererPromise;
          if (!valid()) return;
          pages = await renderer.renderPdfUrlToImages(state.url, { targetWidth: 2480, quality: 1 });
        } finally {
          if (state.url) URL.revokeObjectURL(state.url);
          state.url = '';
        }
        if (!valid()) return;
        if (pages.length !== 1) throw new Error('출자증명서 쪽수를 확인하지 못했습니다.');
        const image = document.createElement('img');
        image.alt = '출자증명서 미리보기';
        image.src = pages[0].dataUrl;
        state.image = image;
        await image.decode();
        if (!valid()) return;
        dialog.querySelector('.cert-scroll').appendChild(image);
        const frame = document.createElement('iframe');
        frame.title = '출자증명서 인쇄';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
        document.body.appendChild(frame);
        state.frame = frame;
        const printDoc = frame.contentDocument;
        const style = printDoc.createElement('style');
        style.textContent = '@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}';
        printDoc.title = fileName.replace(/\.pdf$/i, '');
        printDoc.head.appendChild(style);
        const printImage = printDoc.createElement('img');
        printImage.alt = '출자증명서';
        printImage.src = pages[0].dataUrl;
        printDoc.body.appendChild(printImage);
        await printImage.decode();
        if (!valid()) return;
        status.hidden = true;
        buttons.forEach(button => { button.disabled = false; });
      }
    };
  }
  window.ContributionCertPreview = { start, clear };
  window.addEventListener('pagehide', clear);
})();
