/*
Version: v1.0.0
Change: Remove uniform light backgrounds from partner logos while preserving original logo colors.
*/
(function partnerLogoThemeFactory(global) {
  'use strict';

  const variantCache = new Map();
  const MAX_CANVAS_EDGE = 720;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function median(values) {
    if (!values.length) return 0;
    values.sort(function (a, b) { return a - b; });
    return values[Math.floor(values.length / 2)];
  }

  function colorDistance(r, g, b, background) {
    const dr = r - background.r;
    const dg = g - background.g;
    const db = b - background.b;
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - (2 * t));
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('PARTNER_LOGO_LOAD_FAILED')); };
      image.src = url;
    });
  }

  function analyzeEdgeBackground(data, width, height) {
    const edgeBand = Math.max(1, Math.round(Math.min(width, height) * 0.035));
    const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 360));
    const red = [];
    const green = [];
    const blue = [];
    let edgeCount = 0;
    let transparentEdgeCount = 0;

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        if (x >= edgeBand && x < width - edgeBand && y >= edgeBand && y < height - edgeBand) continue;
        const index = ((y * width) + x) * 4;
        const alpha = data[index + 3];
        edgeCount += 1;
        if (alpha < 32) {
          transparentEdgeCount += 1;
          continue;
        }
        if (alpha < 220) continue;
        red.push(data[index]);
        green.push(data[index + 1]);
        blue.push(data[index + 2]);
      }
    }

    const background = { r: median(red), g: median(green), b: median(blue) };
    let closeCount = 0;
    for (let i = 0; i < red.length; i += 1) {
      if (colorDistance(red[i], green[i], blue[i], background) <= 46) closeCount += 1;
    }

    return {
      background,
      luminance: ((0.2126 * background.r) + (0.7152 * background.g) + (0.0722 * background.b)) / 255,
      transparentEdgeRatio: edgeCount ? transparentEdgeCount / edgeCount : 0,
      uniformEdgeRatio: red.length ? closeCount / red.length : 0,
      opaqueEdgeRatio: edgeCount ? red.length / edgeCount : 0
    };
  }

  async function createVariant(url) {
    const sourceImage = await loadImage(url);
    const sourceWidth = Number(sourceImage.naturalWidth || sourceImage.width || 0);
    const sourceHeight = Number(sourceImage.naturalHeight || sourceImage.height || 0);
    if (!sourceWidth || !sourceHeight) return { processed: false };

    const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { processed: false };
    context.drawImage(sourceImage, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const edge = analyzeEdgeBackground(pixels, width, height);

    let transparentPixelCount = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 220) transparentPixelCount += 1;
    }
    const transparentPixelRatio = transparentPixelCount / Math.max(1, width * height);
    const alreadyTransparent = transparentPixelRatio > 0.025 || edge.transparentEdgeRatio > 0.12;
    const hasRemovableLightBackground = !alreadyTransparent
      && edge.opaqueEdgeRatio > 0.45
      && edge.uniformEdgeRatio > 0.58
      && edge.luminance > 0.62;

    // 투명 로고와 어두운 배경 로고는 원본을 그대로 사용합니다.
    if (!hasRemovableLightBackground) return { processed: false };

    for (let i = 0; i < pixels.length; i += 4) {
      const distance = colorDistance(pixels[i], pixels[i + 1], pixels[i + 2], edge.background);
      const alphaFactor = smoothstep((distance - 9) / 82);
      pixels[i + 3] = Math.round(pixels[i + 3] * alphaFactor);
    }
    context.putImageData(frame, 0, 0);
    return { processed: true, cleanedUrl: sourceCanvas.toDataURL('image/png') };
  }

  function getVariant(url) {
    const normalized = String(url || '').trim();
    if (!normalized) return Promise.resolve({ processed: false });
    if (!variantCache.has(normalized)) {
      variantCache.set(normalized, createVariant(normalized).catch(function () {
        return { processed: false };
      }));
    }
    return variantCache.get(normalized);
  }

  async function enhance(wrapper, url) {
    if (!wrapper) return false;
    const normalized = String(url || '').trim();
    wrapper.dataset.partnerLogoSource = normalized;
    wrapper.classList.remove('is-background-cleaned');
    const cleanedImage = wrapper.querySelector('.partner-logo-cleaned');
    if (!normalized || !cleanedImage) return false;

    const variant = await getVariant(normalized);
    if (wrapper.dataset.partnerLogoSource !== normalized || !variant.processed) return false;
    cleanedImage.src = variant.cleanedUrl;
    wrapper.classList.add('is-background-cleaned');
    return true;
  }

  function enhanceAll(container) {
    const wrappers = Array.from((container || document).querySelectorAll('.partner-logo-renderer[data-logo-url]'));
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < wrappers.length) {
        const wrapper = wrappers[nextIndex];
        nextIndex += 1;
        await enhance(wrapper, wrapper.dataset.logoUrl || '');
      }
    }
    const start = function () {
      Promise.all([worker(), worker(), worker()]).catch(function () {});
    };
    if ('requestIdleCallback' in global) global.requestIdleCallback(start, { timeout: 1200 });
    else global.setTimeout(start, 0);
  }

  global.PartnerLogoTheme = Object.freeze({ enhance, enhanceAll });
})(window);
