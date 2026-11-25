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
    '<section class="photo-right tone-sun space-roomy heading-wide photo-narrow">',
    '  <h3 data-slot="title"></h3>',
    '  <p data-slot="subtitle"></p>',
    '  <div data-slot="body">',
    '    <p data-paragraph="2" class="callout"></p>',
    '    <mark>여기에 기존 본문의 정확한 문구</mark>',
    '  </div>',
    '  <ul data-slot="highlights" class="cards"></ul>',
    '  <figure data-slot="photo"></figure>',
    '</section>'
  ].join('\n');
  function decodeBase(value) {
    const parts = String(value || '').split('/');
    return parts.length === properties.length && parts.every((part, i) => choices[properties[i]].includes(part))
      ? Object.fromEntries(properties.map((key, i) => [key, parts[i]])) : null;
  }
  const blockTag = /^(P|DIV|LI|BLOCKQUOTE|H[1-6])$/;
  const skippedTag = /^(SCRIPT|STYLE|IFRAME|TEMPLATE|NOSCRIPT|OBJECT|EMBED)$/;
  const maxBlocks = 4096, maxText = 120000, maxPhrase = 180;
  function blocks(container) {
    const entries = [];
    let block;
    const walker = doc.createTreeWalker(container, 5, {acceptNode: node =>
      node.nodeType === 3 || node.tagName === 'BR' ? 1 : skippedTag.test(node.tagName) ? 2 : 3});
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeType === 3 ? node.data : '\n';
      let owner = node.parentNode;
      while (owner !== container && !blockTag.test(owner.tagName)) owner = owner.parentNode;
      if (block?.owner !== owner) {
        block = {owner, text:'', parts:[]};
        entries.push(block);
      }
      block.parts.push({node, start:block.text.length, value});
      block.text += value;
    }
    return entries.filter(block=>block.text.trim());
  }
  // Fingerprints make a decoration fail closed if the original paragraph has changed.
  // No selected words or pasted nodes are stored in the layout metadata.
  function fingerprint(text) {
    let a = 2166136261, b = 0x85ebca77;
    for (let i=0;i<text.length;i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b ^ text.charCodeAt(i), 0x5bd1e995);
    }
    return [a,b].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
  }
  function parseExtras(base, token) {
    const parts = token.split(';');
    const [tag, heading, width, cards, marks] = parts;
    if (parts.length!==5 || tag!==fingerprint(base) || !/^[01]$/.test(heading) || !/^[enw]$/.test(width)) return null;
    function records(value, isMark) {
      if (!value) return [];
      const rows = value.split(',');
      if (rows.length>(isMark?3:2) || new Set(rows).size!==rows.length) return null;
      const valid = rows.every(row=>{
        const [i,sig,start,end,...rest] = row.split('.');
        return /^[1-9]\d{0,3}$/.test(i) && +i<=maxBlocks && /^[a-f0-9]{16}$/.test(sig) &&
          (isMark ? !rest.length && /^(0|[1-9]\d{0,5})$/.test(start) && /^[1-9]\d{0,5}$/.test(end)
            && +end<=maxText && +end>+start && +end-+start<=maxPhrase : start===undefined);
      });
      return valid ? rows.map(row=>{
        const [index,sig,start,end] = row.split('.');
        return {index:+index,sig,start:+start,end:+end};
      }) : null;
    }
    const callouts = records(cards,false), ranges = records(marks,true);
    if (!callouts || !ranges || new Set(callouts.map(card=>card.index)).size!==callouts.length ||
      ranges.some((a,i)=>ranges.slice(i+1).some(b=>a.index===b.index && a.start<b.end && b.start<a.end))) return null;
    return {heading:heading==='1',width,callouts,ranges};
  }
  function decode(value) {
    const [base,token,...rest] = String(value || '').split('~');
    const current = decodeBase(base);
    if (!current || rest.length) return null;
    if (token===undefined) return {current,base};
    const extras = token.length<=280 && parseExtras(base,token);
    return extras ? {current,base,token,extras} : null;
  }
  function sections(node) {
    const children = Array.from(node.childNodes).filter(child => child.nodeType !== 3 || child.textContent.trim());
    if (children.some(child => child.nodeType !== 1)) throw Error('예시에 있는 구조만 사용할 수 있어요.');
    return children;
  }
  function readHtml(raw, content = '') {
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
    const classes = section.className.trim().split(/\s+/);
    const picked = ['photo', 'tone', 'space'].map(key => classes.filter(item => choices[key].some(choice => item === key + '-' + choice)));
    const options = classes.filter(item=>!picked.flat().includes(item));
    const widths = options.filter(item=>item==='photo-narrow'||item==='photo-wide');
    if (new Set(classes).size!==classes.length || picked.some(items=>items.length!==1) || widths.length>1 ||
      options.some(item=>item!=='heading-wide' && !widths.includes(item))) throw Error('안내에 있는 배치·색·여백만 사용할 수 있어요.');
    const slots = [];
    let bodyOptions = [];
    const nodes = sections(section);
    for (const child of nodes) {
      const slot = child.getAttribute('data-slot');
      if (!Object.hasOwn(tags, slot) || child.tagName !== tags[slot] || child.namespaceURI !== section.namespaceURI
        || child.attributes.length !== (slot === 'highlights' ? 2 : 1) || slots.includes(slot))
        throw Error('제목·부제·본문·목록·사진 칸은 안내의 구조대로 넣어 주세요.');
      if (slot === 'body') bodyOptions = sections(child);
      else if (sections(child).length) throw Error('본문의 강조 설정 외에는 칸을 비워 주세요. 기존 소개가 그대로 들어가요.');
      slots.push(slot);
    }
    const list = nodes[slots.indexOf('highlights')]?.getAttribute('class');
    if (slots.length !== 5 || slots[0] !== 'title' || slots[1] !== 'subtitle' || !choices.list.includes(list))
      throw Error('제목·부제·본문·목록·사진 칸이 필요해요. 목록은 cards 또는 plain으로 지정해 주세요.');
    const base = [...picked.map((items, i) => items[0].slice(properties[i].length + 1)), list,
      slots.indexOf('body') < slots.indexOf('highlights') ? 'body-first' : 'list-first'].join('/');
    const heading = options.includes('heading-wide');
    const width = widths[0]==='photo-narrow'?'n':widths.length?'w':'e';
    if (!bodyOptions.length && !heading && width==='e') return base;
    let groups = [];
    if (bodyOptions.length) {
      const body = doc.createElement('template');
      body.innerHTML = String(content || '').slice(0,maxText);
      groups = blocks(body.content);
    }
    const callouts = [], ranges = [];
    for (const option of bodyOptions) {
      const isCallout = option.tagName==='P' && option.getAttribute('class')==='callout' &&
        option.attributes.length===2 && option.hasAttribute('data-paragraph') && !option.childNodes.length;
      const isMark = option.tagName==='MARK' && option.attributes.length===0 &&
        Array.from(option.childNodes).every(node=>node.nodeType===3) && option.textContent.trim().length>0;
      if (option.namespaceURI!==section.namespaceURI || (!isCallout && !isMark))
        throw Error('본문은 문단 번호(callout)나 원문 문구(mark)만 지정할 수 있어요.');
      if (isCallout) {
        const number=option.getAttribute('data-paragraph'), paragraph=+number;
        const group=groups[paragraph-1];
        if (!/^[1-9]\d{0,3}$/.test(number) || paragraph>maxBlocks || !group ||
          groups.some(other=>group!==other && group.owner.contains(other.owner)))
          throw Error('복사할 내용에 나온 문단 번호를 확인해 주세요.');
        if (callouts.some(card=>card[0]===paragraph) || callouts.length>=2) throw Error('서로 다른 문단 두 개까지만 강조할 수 있어요.');
        callouts.push([paragraph,fingerprint(group.text)]);
      } else {
        const phrase=option.textContent.trim(), matches=[];
        if (ranges.length>=3 || phrase.length>maxPhrase) throw Error('짧은 문구 세 개까지만 강조할 수 있어요.');
        groups.forEach((group,i)=>{
          const start=group.text.indexOf(phrase);
          if (start>=0) {
            matches.push([i+1,fingerprint(group.text),start,start+phrase.length]);
            if (group.text.indexOf(phrase,start+1)>=0) matches.push(null);
          }
        });
        const [match]=matches;
        if (matches.length!==1 || !match || match[0]>maxBlocks) throw Error('강조할 문구는 기존 본문에 한 번만 나오는 그대로의 문구를 써 주세요.');
        if (ranges.some(r=>r[0]===match[0] && r[2]<match[3] && match[2]<r[3])) throw Error('겹치는 문구는 하나로 합쳐 주세요.');
        ranges.push(match);
      }
    }
    const serialize = rows=>rows.map(row=>row.join('.')).join(',');
    return base+'~'+[fingerprint(base),heading?'1':'0',width,serialize(callouts),serialize(ranges)].join(';');
  }
  const marker = /^<!--coop-about-design-v1:([a-z/-]{1,70})-->/;
  const extraMarker = /^<!--coop-about-design-v2:([a-z0-9.;,]{1,280})-->/;
  function unpack(value) {
    const content = String(value || '');
    const found = content.match(marker);
    const base = found && decodeBase(found[1]) ? found[1] : '';
    const body = base ? content.slice(found[0].length) : content;
    const extra = body.match(extraMarker);
    const design = base && extra && parseExtras(base,extra[1]) ? base+'~'+extra[1] : base;
    return {design,content:extra ? body.slice(extra[0].length) : body};
  }
  function pack(content, design) {
    const body = unpack(content).content;
    const saved = decode(design);
    return saved ? '<!--coop-about-design-v1:'+saved.base+'-->' +
      (saved.token ? '<!--coop-about-design-v2:'+saved.token+'-->' : '') + body : body;
  }
  function position(first, second) {
    if (first?.parentNode && first.parentNode === second?.parentNode
      && !(first.compareDocumentPosition(second) & 4)) second.before(first);
  }
  function paintAccents(content, extras) {
    if (!content) return;
    const parents = new Set();
    for (const span of content.querySelectorAll('[data-about-design-mark]')) {
      parents.add(span.parentNode);
      span.replaceWith(...span.childNodes);
    }
    parents.forEach(parent=>parent.normalize());
    if (content.hasAttribute('data-about-design-callout')) content.removeAttribute('data-about-design-callout');
    content.querySelectorAll('[data-about-design-callout]').forEach(el=>el.removeAttribute('data-about-design-callout'));
    if (!extras || (!extras.callouts.length && !extras.ranges.length)) return;
    const groups = blocks(content);
    for (const card of extras.callouts) {
      const group = groups[card.index-1];
      if (group && fingerprint(group.text)===card.sig && !groups.some(other=>group!==other && group.owner.contains(other.owner)))
        group.owner.setAttribute('data-about-design-callout','');
    }
    const matches = new Map();
    for (const range of extras.ranges) {
      const group = groups[range.index-1];
      if (!group || fingerprint(group.text)!==range.sig || range.end>group.text.length) continue;
      for (const {node,start,value} of group.parts) {
        if (node.nodeType!==3 || range.end<=start || range.start>=start+value.length) continue;
        if (!matches.has(node)) matches.set(node,[]);
        matches.get(node).push([Math.max(range.start-start,0),Math.min(range.end-start,value.length)]);
      }
    }
    for (const [node,parts] of matches) {
      const fragment = doc.createDocumentFragment();
      let offset=0;
      for (const [start,end] of parts.sort((a,b)=>a[0]-b[0])) {
        if (offset<start) fragment.append(node.data.slice(offset,start));
        const span=doc.createElement('span');
        span.setAttribute('data-about-design-mark','');
        span.textContent=node.data.slice(start,end);
        fragment.append(span);
        offset=end;
      }
      if (offset<node.length) fragment.append(node.data.slice(offset));
      node.replaceWith(fragment);
    }
  }
  function paint(columns, content, list, value, hasPhoto, defaultPhoto = 'right') {
    if (!columns) return;
    const saved = decode(value), design=saved?.current, extras=saved?.extras;
    const text = columns.querySelector('[data-about-text]');
    const photo = columns.querySelector('[data-about-photo]');
    const heading = columns.querySelector('[data-about-heading]');
    const managed = columns.hasAttribute('data-about-design');
    if (!design && !managed) return;
    if (extras?.heading && hasPhoto && heading) {
      columns.prepend(heading);
      columns.setAttribute('data-design-heading','wide');
    } else {
      if (heading && text && heading.parentNode!==text) text.prepend(heading);
      columns.removeAttribute('data-design-heading');
    }
    if (extras?.width==='n' || extras?.width==='w') columns.dataset.designWidth = extras.width;
    else delete columns.dataset.designWidth;
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
    if (extras || columns.hasAttribute('data-design-accents')) {
      paintAccents(content,extras);
      columns.toggleAttribute('data-design-accents',!!(extras?.callouts.length || extras?.ranges.length));
    }
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
    const body = doc.createElement('template');
    body.innerHTML = String(source.content || '').slice(0,maxText);
    const paragraphs = blocks(body.content).map((group,i)=>({번호:i+1,내용:group.text.trim()}));
    const text = [
      '아래 조합 소개에 어울리는 홈페이지 디자인을 만들어 줘. 글은 고치지 마.',
      '설명 없이 안내 규격의 HTML 한 덩어리만 반환해 줘. 제목·부제·목록·사진 칸은 비워 둬. 기존 글과 사진은 ERP가 채워 넣어.',
      'section 클래스는 사진 photo-left/right/top, 색 tone-sun/leaf/plain, 여백 space-compact/roomy 중 하나씩 골라 정확한 이름으로 써 줘.',
      '제목과 부제를 사진 위에 전체 폭으로 올리려면 heading-wide를 추가해. 사진을 제목 바로 아래에 두려면 heading-wide와 photo-top을 함께 써. 좌우 배치의 사진 비율은 photo-narrow(1/3) 또는 photo-wide(2/3)로 바꿀 수 있어.',
      '본문 칸에는 선택적으로 아래 예시 같은 빈 p로 강조할 문단 번호를 지정하거나, mark에 본문에 한 번만 나오는 문구를 그대로 넣어. 문단 두 개·문구 세 개까지만. 예시 번호와 문구는 실제 값으로 바꾸고 적합한 내용이 없으면 해당 줄을 빼 줘. 본문을 새로 쓰지 마.',
      '목록 class는 cards 또는 plain. 제목·부제 다음의 body와 highlights 순서를 바꿀 수 있어. 5개 칸은 반드시 넣고, 별도 CSS·링크·스크립트는 쓰지 마.',
      example, '현재 조합 소개 (디자인 참고용):',
      JSON.stringify({ 제목:source.title, 부제:source.subtitle, 본문:paragraphs,
        목록:asText(source.list), 사진:source.hasPhoto ? '있음' : '없음' }, null, 2)
    ];
    return text.join('\n\n');
  }
  root.CoopAboutDesign = Object.freeze({version:'2.0.0', example, readHtml, unpack, pack, paint, makePrompt, isDesign:value=>!!decode(value)});
})(window);
