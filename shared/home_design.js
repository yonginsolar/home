/* v1.0.0 — public homepage design catalog; no ERP typography or authorization changes. */
(function (root) {
  'use strict';
  const scriptUrl = document.currentScript?.src || new URL('/shared/home_design.js', location.href).href;
  const assetBase = new URL('../assets/home-fonts/', scriptUrl);
  const fonts = Object.freeze([
    { id:'pretendard', label:'Pretendard', family:'Pretendard', kind:'고딕' },
    { id:'noto-sans-kr', label:'Noto Sans KR', family:'Noto Sans KR', kind:'고딕' },
    { id:'nanum-gothic', label:'나눔고딕', family:'Nanum Gothic', kind:'고딕' },
    { id:'ibm-plex-sans-kr', label:'IBM Plex Sans KR', family:'IBM Plex Sans KR', kind:'고딕' },
    { id:'gowun-dodum', label:'고운돋움', family:'Gowun Dodum', kind:'고딕' },
    { id:'gmarket-sans', label:'Gmarket Sans', family:'GmarketSans', kind:'강조형' },
    { id:'do-hyeon', label:'배달의민족 도현', family:'Do Hyeon', kind:'강조형' },
    { id:'noto-serif-kr', label:'Noto Serif KR', family:'Noto Serif KR', kind:'명조' },
    { id:'nanum-myeongjo', label:'나눔명조', family:'Nanum Myeongjo', kind:'명조' },
    { id:'gowun-batang', label:'고운바탕', family:'Gowun Batang', kind:'명조' }
  ].map(Object.freeze));
  const pairs = Object.freeze({
    clean: { label:'깔끔한 기본형', title:'pretendard', body:'pretendard' },
    trust: { label:'단정한 신뢰형', title:'noto-sans-kr', body:'noto-sans-kr' },
    warm: { label:'따뜻한 소식형', title:'gowun-batang', body:'pretendard' },
    editorial: { label:'차분한 잡지형', title:'noto-serif-kr', body:'noto-sans-kr' },
    participation: { label:'힘 있는 참여형', title:'gmarket-sans', body:'pretendard' },
    campaign: { label:'또렷한 캠페인형', title:'do-hyeon', body:'nanum-gothic' }
  });
  const orders = Object.freeze({
    community:['impact','progress','status','activities','about','portfolio','partners','documents','history','calculator','ops-system','game-hall','faq','contact'],
    simple:['about','impact','activities','progress','status','portfolio','partners','documents','history','calculator','ops-system','game-hall','faq','contact'],
    brand:['about','partners','progress','portfolio','status','impact','documents','history','activities','calculator','ops-system','game-hall','faq','contact'],
    editorial:['activities','about','progress','status','portfolio','impact','history','partners','documents','calculator','ops-system','game-hall','faq','contact'],
    campaign:['impact','activities','progress','status','about','partners','portfolio','documents','history','calculator','ops-system','game-hall','faq','contact']
  });
  const byId = new Map(fonts.map(font => [font.id, font]));
  function normalizeFont(value) { return byId.has(value) ? value : 'legacy'; }
  function normalizeLayout(value) { return value === 'designed' ? 'designed' : 'existing'; }
  function family(value, title = false) {
    const font = byId.get(value);
    if (!font) return title ? '"GmarketSans", sans-serif' : '"Pretendard", -apple-system, sans-serif';
    return `"${font.family}", ${font.kind === '명조' ? 'serif' : 'sans-serif'}`;
  }
  function ensureFonts(values) {
    const active = new Set(values.map(normalizeFont).filter(value => value !== 'legacy'));
    for (const id of active) {
      if (document.querySelector(`link[data-home-font="${id}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.homeFont = id;
      link.href = new URL(`${id}/font.css`, assetBase).href;
      document.head.appendChild(link);
    }
    // Only fonts used by the current selection remain active. Previously loaded
    // faces may stay in the browser cache, but are not requested on a fresh visit.
    document.querySelectorAll('link[data-home-font]').forEach(link => {
      if (!active.has(link.dataset.homeFont)) link.remove();
    });
  }
  function applyFonts(target, titleValue, bodyValue) {
    const title = normalizeFont(titleValue), body = normalizeFont(bodyValue);
    ensureFonts([title, body]);
    target.classList.toggle('home-title-font-custom', title !== 'legacy');
    target.classList.toggle('home-body-font-custom', body !== 'legacy');
    target.style.setProperty('--home-title-font', family(title, true));
    target.style.setProperty('--home-body-font', family(body));
    target.dataset.homeTitleFont = title;
    target.dataset.homeBodyFont = body;
  }
  root.CoopHomeDesign = Object.freeze({ fonts, pairs, orders, normalizeFont, normalizeLayout, family, applyFonts });
})(window);
