(function (root) {
  'use strict';
  const doc = root.document;
  const choices = Object.freeze({
    photo: ['left', 'right', 'top'], tone: ['sun', 'leaf', 'plain'],
    space: ['compact', 'roomy'], list: ['cards', 'plain'], order: ['body-first', 'list-first']
  });
  const properties = Object.keys(choices);
  const tags = {title:'H3', subtitle:'P', body:'DIV', highlights:'UL', photo:'FIGURE'};
  const example = [
    '<section class="photo-right tone-sun space-roomy">',
    '  <h3 data-slot="title"></h3>',
    '  <p data-slot="subtitle"></p>',
    '  <div data-slot="body"></div>',
    '  <ul data-slot="highlights" class="cards"></ul>',
    '  <figure data-slot="photo"></figure>',
    '</section>'
  ].join('\n');
  function decode(value) {
    const parts = String(value || '').split('/');
    return parts.length === properties.length && parts.every((part, i) => choices[properties[i]].includes(part))
      ? Object.fromEntries(properties.map((key, i) => [key, parts[i]])) : null;
  }
  function sections(node) {
    const children = Array.from(node.childNodes).filter(child => child.nodeType !== 3 || child.textContent.trim());
    if (children.some(child => child.nodeType !== 1)) throw Error('예시에 있는 구조만 사용할 수 있어요.');
    return children;
  }
  function readHtml(raw) {
    let value = String(raw || '').trim();
    if (value.length > 4000) throw Error('HTML 시안이 너무 길어요. 예시처럼 짧은 구조만 붙여넣어 주세요.');
    const fence = value.match(/^```(?:html)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
    if (fence) value = fence[1].trim();
    if (!value) throw Error('받은 HTML 시안을 붙여넣어 주세요.');
    const fragment = doc.createElement('template');
    fragment.innerHTML = value; // Inert; never attach parsed nodes.
    const [section, extra] = sections(fragment.content);
    if (!section || extra || section.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || section.tagName !== 'SECTION' || section.attributes.length !== 1 || !section.hasAttribute('class'))
      throw Error('시안은 예시에 있는 section 하나로 만들어 주세요.');
    const classes = [...section.classList];
    const picked = ['photo', 'tone', 'space'].map(key => classes.filter(item => choices[key].some(choice => item === key + '-' + choice)));
    if (classes.length !== 3 || picked.some(items => items.length !== 1)) throw Error('예시에 있는 사진 위치·색·여백만 사용할 수 있어요.');
    const slots = [];
    const nodes = sections(section);
    for (const child of nodes) {
      const slot = child.getAttribute('data-slot');
      if (!Object.hasOwn(tags, slot) || child.tagName !== tags[slot] || child.namespaceURI !== section.namespaceURI
        || child.children.length || child.textContent.trim() || Array.from(child.childNodes).some(node => node.nodeType !== 3)
        || child.attributes.length !== (slot === 'highlights' ? 2 : 1) || slots.includes(slot))
        throw Error('원래 글과 사진을 유지하도록 예시의 빈 칸만 사용해 주세요.');
      slots.push(slot);
    }
    const list = nodes[slots.indexOf('highlights')]?.getAttribute('class');
    if (slots.length !== 5 || slots[0] !== 'title' || slots[1] !== 'subtitle' || !choices.list.includes(list))
      throw Error('제목·부제·본문·목록·사진 칸이 필요해요. 목록은 cards 또는 plain으로 지정해 주세요.');
    return [...picked.map((items, i) => items[0].slice(properties[i].length + 1)), list,
      slots.indexOf('body') < slots.indexOf('highlights') ? 'body-first' : 'list-first'].join('/');
  }
  const marker = /^<!--coop-about-design-v1:([a-z/-]{1,70})-->/;
  function unpack(value) {
    const content = String(value || '');
    const found = content.match(marker);
    return found && decode(found[1]) ? { design:found[1], content:content.slice(found[0].length) } : { design:'', content };
  }
  function pack(content, design) {
    const body = unpack(content).content;
    return decode(design) ? '<!--coop-about-design-v1:' + design + '-->' + body : body;
  }
  function position(first, second) {
    if (first?.parentNode && first.parentNode === second?.parentNode
      && !(first.compareDocumentPosition(second) & 4)) second.before(first);
  }
  function paint(columns, content, list, value, hasPhoto, defaultPhoto = 'right') {
    if (!columns) return;
    const design = decode(value);
    const text = columns.querySelector('[data-about-text]');
    const photo = columns.querySelector('[data-about-photo]');
    const managed = columns.hasAttribute('data-about-design');
    if (!design && !managed) return;
    if (design) {
      columns.setAttribute('data-about-design', '');
      columns.dataset.designPhoto = hasPhoto ? design.photo : 'none';
      columns.dataset.designTone = design.tone;
      columns.dataset.designSpace = design.space;
      columns.dataset.designList = design.list;
    } else {
      columns.removeAttribute('data-about-design');
      for (const attr of ['Photo','Tone','Space','List']) delete columns.dataset['design' + attr];
    }
    const placement = design?.photo || defaultPhoto;
    if (['left','top'].includes(placement)) position(photo, text);
    else position(text, photo);
    if (design?.order === 'body-first') position(content, list);
    else position(list, content);
  }
  function asText(value) {
    const tpl = doc.createElement('template');
    tpl.innerHTML = String(value || '').slice(0,120000);
    tpl.content.querySelectorAll('script,style,iframe,template,noscript').forEach(el => el.remove());
    tpl.content.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    tpl.content.querySelectorAll('p,div,li,h2,h3,blockquote').forEach(el => el.append('\n'));
    return tpl.content.textContent.trim();
  }
  function makePrompt(source) {
    const text = [
      '아래 조합 소개에 어울리는 홈페이지 디자인을 만들어 줘. 글은 고치지 마.',
      '반드시 설명 없이 아래 규격의 HTML 한 덩어리만 반환해 줘. 칸은 모두 비워 둬. 아래 글과 기존 사진은 ERP가 채워 넣어.',
      'section 클래스는 사진 photo-left/right/top, 색 tone-sun/leaf/plain, 여백 space-compact/roomy 중 하나씩 골라 정확한 이름으로 써 줘.',
      '목록 class는 cards 또는 plain. 제목·부제 다음의 body와 highlights 순서를 바꿀 수 있어. 5개 칸은 반드시 넣고, 별도 CSS·링크·스크립트는 쓰지 마.',
      example, '현재 조합 소개 (디자인 참고용):',
      JSON.stringify({ 제목:source.title, 부제:source.subtitle, 본문:asText(source.content),
        목록:asText(source.list), 사진:source.hasPhoto ? '있음' : '없음' }, null, 2)
    ];
    return text.join('\n\n');
  }
  root.CoopAboutDesign = Object.freeze({version:'1.0.0', example, readHtml, unpack, pack, paint, makePrompt, isDesign:value=>!!decode(value)});
})(window);
