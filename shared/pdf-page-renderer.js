/*
Version: v1.0.1
Change: 2026-09-19 - Render private PDF attachments as print-ready A4 page images and close PDF.js 6 loading tasks safely.
Dependency: Mozilla PDF.js 6.3.289 (vendored, Apache-2.0).
*/
import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';

const BASE_URL = new URL('./vendor/pdfjs/', import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', BASE_URL).href;

const documentOptions = (data) => ({
  data,
  cMapUrl: new URL('cmaps/', BASE_URL).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('standard_fonts/', BASE_URL).href,
  wasmUrl: new URL('wasm/', BASE_URL).href,
  isEvalSupported: false
});

async function openPdf(data) {
  const loadingTask = pdfjsLib.getDocument(documentOptions(data));
  try {
    return {
      loadingTask,
      document: await loadingTask.promise
    };
  } catch (error) {
    await loadingTask.destroy().catch(() => {});
    if (error?.name === 'PasswordException') {
      throw new Error('암호가 설정되지 않은 PDF만 첨부할 수 있습니다.');
    }
    throw new Error(`PDF를 읽지 못했습니다: ${error?.message || '파일을 확인해 주세요.'}`);
  }
}

export async function inspectPdfFile(file) {
  if (!(file instanceof File) || (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || ''))) {
    throw new Error('PDF 파일만 첨부할 수 있습니다.');
  }
  const { loadingTask, document: pdf } = await openPdf(new Uint8Array(await file.arrayBuffer()));
  try {
    if (pdf.numPages < 1 || pdf.numPages > 100) {
      throw new Error('PDF는 1쪽 이상 100쪽 이하만 첨부할 수 있습니다.');
    }
    return { pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderPdfUrlToImages(url, { targetWidth = 1600, quality = 0.92, onProgress } = {}) {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`첨부 PDF를 불러오지 못했습니다. (${response.status})`);
  const { loadingTask, document: pdf } = await openPdf(new Uint8Array(await response.arrayBuffer()));
  const images = [];
  try {
    if (pdf.numPages < 1 || pdf.numPages > 100) throw new Error('PDF 쪽수는 1쪽 이상 100쪽 이하여야 합니다.');
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.max(1, targetWidth / baseViewport.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, background: '#fff' }).promise;
      images.push({
        pageNumber,
        width: canvas.width,
        height: canvas.height,
        dataUrl: canvas.toDataURL('image/jpeg', quality)
      });
      page.cleanup();
      if (typeof onProgress === 'function') onProgress(pageNumber, pdf.numPages);
    }
    return images;
  } finally {
    await loadingTask.destroy();
  }
}
