/* Version: v1.3.0 — Cancellable bounded preparation; actual issuance locks stay with the caller. */
(function () {
  'use strict';
  let active = null;
  let rendererPromise = null;
  function renderer() {
    if (!rendererPromise) rendererPromise = import('/shared/pdf-page-renderer.js?v=20260919-1').catch(error => { rendererPromise = null; throw error; });
    return rendererPromise;
  }

  function clear() {
    const state = active;
    active = null;
    if (!state) return;
    for (const cancel of [...state.reads]) cancel();
    state.onClose?.();
    state.doc = null;
    state.createPdf = null;
    state.observer?.disconnect();
    window.removeEventListener('resize', state.fit);
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = '';
    state.frame?.remove();
    state.image?.removeAttribute('src');
    state.dialog.close();
    state.dialog.remove();
    document.documentElement.style.overflow = state.previousOverflow;
    if (state.focus?.isConnected) state.focus.focus({ preventScroll: true });
  }

  function start({ isCurrent, authorize, onClose, title = '출자증명서' } = {}) {
    clear();
    const dialog = document.createElement('dialog');
    dialog.className = 'contribution-cert-preview';
    dialog.setAttribute('aria-labelledby', 'contribution-cert-preview-title');
    dialog.innerHTML = `<style>
      .contribution-cert-preview{padding:0;border:1px solid #dbe2e8;border-radius:14px;width:min(920px,calc(100vw - 24px));max-width:calc(100vw - 24px);height:min(94dvh,1100px);max-height:94dvh;color:#17212b;background:#fff;word-break:keep-all;box-shadow:0 16px 70px #0004}
      .contribution-cert-preview::backdrop{background:#0008}
      .contribution-cert-preview[open]{display:flex;flex-direction:column;overflow:hidden}
      .contribution-cert-preview .cert-toolbar{display:flex;flex:none;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #dbe2e8;background:#fff;max-height:60%;overflow:auto}
      .contribution-cert-preview h2{font-size:18px;line-height:1.5;margin:0 auto 0 0;color:#17212b}
      .contribution-cert-preview button{font:inherit;font-size:14px;padding:8px 13px;border:1px solid #cbd5df;border-radius:7px;color:#17212b;background:#fff;cursor:pointer}
      .contribution-cert-preview button[data-action="save"]{background:#18734b;border-color:#18734b;color:#fff}
      .contribution-cert-preview button:disabled{opacity:.5;cursor:wait}
      .contribution-cert-preview button:focus-visible{outline:3px solid #4285f4;outline-offset:2px}
      .contribution-cert-preview .cert-scroll{flex:1;min-height:0;overflow:auto;background:#e9edf1;padding:16px;text-align:center}
      .contribution-cert-preview .cert-status{color:#17212b;padding:40px 12px;white-space:pre-line}
      .contribution-cert-preview .cert-retry{display:block;margin:0 auto 24px}
      .contribution-cert-preview .cert-retry[hidden]{display:none}
      .contribution-cert-preview img{display:block;width:100%;max-width:794px;height:auto;margin:auto;background:#fff;box-shadow:0 2px 10px #0002;filter:none!important}
      .contribution-cert-preview .cert-html-fit{position:relative;width:100%;max-width:794px;margin:auto;text-align:left}
      .contribution-cert-preview .cert-paper{position:absolute;left:0;top:0;width:210mm;height:297mm;background:#fff;color:#111;transform-origin:top left;font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-weight:600;line-height:1.45;overflow:hidden;box-shadow:0 2px 10px #0002}
      .contribution-cert-preview .cert-paper *{box-sizing:border-box;color:#111!important;filter:none!important}
      @media(max-width:480px){.contribution-cert-preview .cert-toolbar{gap:6px;padding:10px}.contribution-cert-preview h2{font-size:16px;width:100%}.contribution-cert-preview .cert-scroll{padding:8px}.contribution-cert-preview button{flex:1}}
    </style><div class="cert-toolbar"><h2 id="contribution-cert-preview-title">출자증명서</h2><button type="button" data-action="print" disabled>인쇄</button><button type="button" data-action="save" disabled>PDF 저장</button><button type="button" data-action="close">닫기</button></div><div class="cert-scroll"><div class="cert-status" role="status">증명서를 준비하고 있습니다.</div><button type="button" class="cert-retry" hidden>다시 확인</button></div>`;
    const state = { dialog, isCurrent, authorize, doc: null, frame: null, url: '', image: null,
      focus: document.activeElement, previousOverflow: document.documentElement.style.overflow, busy: false,
      onClose, reads: new Set() };
    active = state;
    dialog.querySelector('h2').textContent = title;
    document.body.appendChild(dialog);
    document.documentElement.style.overflow = 'hidden';
    const valid = () => active === state && (!isCurrent || isCurrent());
    const buttons = [...dialog.querySelectorAll('[data-action="print"], [data-action="save"]')];
    const status = dialog.querySelector('.cert-status');
    const retryButton = dialog.querySelector('.cert-retry');
    const fail = (message, { retry } = {}) => {
      if (!valid()) return;
      status.hidden = false;
      status.textContent = message;
      retryButton.hidden = typeof retry !== 'function';
      retryButton.disabled = false;
      retryButton.onclick = async () => {
        if (!valid() || retryButton.disabled || typeof retry !== 'function') return;
        retryButton.disabled = true;
        try { await retry(); }
        finally { if (valid()) retryButton.disabled = false; }
      };
    };
    // Only UI preparation reads use this deadline. Issuer/receipt promises must
    // never be passed here: closing or timing out cannot unlock a real writer.
    const read = request => new Promise((resolve, reject) => {
      let done = false, timer;
      const finish = (error, value) => {
        if (done) return;
        done = true;clearTimeout(timer);state.reads.delete(cancel);
        if (error) reject(error);else resolve(value);
      };
      const cancel = () => finish(Object.assign(new Error('CERTIFICATE_PREPARATION_CANCELED'), {code:'CERTIFICATE_PREPARATION_CANCELED'}));
      if (!valid()) return cancel();
      state.reads.add(cancel);
      timer = setTimeout(() => finish(Object.assign(new Error('CERTIFICATE_PREPARATION_TIMEOUT'), {code:'CERTIFICATE_PREPARATION_TIMEOUT'})), 15000);
      Promise.resolve().then(() => {
        if (!valid()) throw Object.assign(new Error('CERTIFICATE_PREPARATION_CANCELED'), {code:'CERTIFICATE_PREPARATION_CANCELED'});
        return typeof request === 'function' ? request() : request;
      }).then(value => valid() ? finish(null, value) : cancel(), error => finish(error));
    });
    dialog.querySelector('[data-action="close"]').onclick = clear;
    dialog.addEventListener('cancel', event => { event.preventDefault(); clear(); });
    dialog.showModal();
    dialog.querySelector('[data-action="close"]').focus();

    async function action(kind) {
      if (!valid() || !state.ready || (!state.doc && !state.createPdf) || state.busy) return;
      state.busy = true;
      buttons.forEach(button => { button.disabled = true; });
      try {
        if (authorize) await authorize();
        if (!valid()) return;
        if (!state.doc) {
          status.hidden = false;status.textContent = 'PDF를 준비하고 있어요.';
          const result = await state.createPdf();
          if (!valid()) return;
          if (!result?.doc || !result.fileName) throw new Error('PDF_NOT_READY');
          state.doc = result.doc;state.fileName = result.fileName;
          // Preparation can be slow: permission and owner must still be current.
          if (authorize) await authorize();
          if (!valid()) return;
        }
        status.hidden = true;
        if (kind === 'save') state.doc.save(state.fileName);
        else {
          if (!state.frame) await preparePrint();
          if (authorize) await authorize();
          if (!valid()) return;
          state.frame.contentWindow.focus(); state.frame.contentWindow.print();
        }
      } catch (_) {
        if (!valid()) { if (active === state) clear(); }
        else fail('로그인 상태 또는 출력 준비를 확인하지 못했습니다. 다시 시도해 주세요.');
      } finally {
        state.busy = false;
        if (valid() && state.ready) buttons.forEach(button => { button.disabled = false; });
      }
    }
    buttons.forEach(button => { button.onclick = () => action(button.dataset.action); });

    async function render(width, quality) {
      const module = await renderer();
      if (!valid()) return null;
      const url = URL.createObjectURL(state.doc.output('blob'));
      state.url = url;
      try {
        const pages = await module.renderPdfUrlToImages(url, { targetWidth: width, quality });
        if (!valid()) return null;
        if (pages.length !== 1) throw new Error('증명서 쪽수를 확인하지 못했습니다.');
        return pages[0].dataUrl;
      } finally {
        URL.revokeObjectURL(url);
        if (state.url === url) state.url = '';
      }
    }
    async function preparePrint() {
      const dataUrl = await render(2480, 1);
      if (!valid() || !dataUrl) return;
      const frame = document.createElement('iframe');
      frame.title = title + ' 인쇄'; frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
      document.body.appendChild(frame); state.frame = frame;
      const printDoc = frame.contentDocument, style = printDoc.createElement('style');
      style.textContent = '@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}';
      printDoc.title = state.fileName.replace(/\.pdf$/i, ''); printDoc.head.appendChild(style);
      const printImage = printDoc.createElement('img');printImage.alt = title;printImage.src = dataUrl;
      printDoc.body.appendChild(printImage);
      try { await printImage.decode(); }
      catch (error) {frame.remove();if(state.frame===frame)state.frame=null;throw error;}
    }

    return {
      isCurrent: valid,
      fail,
      read,
      close: () => { if (active === state) clear(); },
      async presentHtml({ element, createPdf }) {
        if (!valid()) return;
        if (!(element instanceof HTMLElement) || typeof createPdf !== 'function') throw new Error('PREVIEW_NOT_READY');
        const fit = document.createElement('div');fit.className = 'cert-html-fit';
        fit.appendChild(element);dialog.querySelector('.cert-scroll').appendChild(fit);
        state.createPdf = createPdf;
        state.fit = () => {
          if (!valid()) return;
          const scale = Math.min(1, fit.clientWidth / element.offsetWidth);
          element.style.transform = `scale(${scale})`;fit.style.height = `${element.offsetHeight * scale}px`;
        };
        if (typeof ResizeObserver === 'function') {state.observer = new ResizeObserver(state.fit);state.observer.observe(fit);}
        window.addEventListener('resize', state.fit);state.fit();
        status.hidden = true;state.ready = true;
        buttons.forEach(button => { button.disabled = false; });
      },
      async present({ doc, fileName }) {
        if (!valid()) return;
        state.doc = doc;
        state.fileName = fileName;
        const dataUrl = await render(1240, .9);
        if (!valid() || !dataUrl) return;
        const image = document.createElement('img');
        image.alt = title + ' 미리보기';
        image.src = dataUrl;
        state.image = image;
        await image.decode();
        if (!valid()) return;
        dialog.querySelector('.cert-scroll').appendChild(image);
        status.hidden = true;
        state.ready = true;
        buttons.forEach(button => { button.disabled = false; });
      }
    };
  }
  function documentPreview(spec) {
    return spec.kind==='membership'
      ? window.CoopCertificateTemplate.previewMembership(spec.record,spec.sealDataUrl)
      : window.CoopCertificateTemplate.previewContribution(spec);
  }
  window.ContributionCertPreview = { start, clear, documentPreview };
  window.addEventListener('pagehide', clear);
})();
