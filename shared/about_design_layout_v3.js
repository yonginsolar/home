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
        matches.get(node).push([Math.max(range.start-start,0),Math.min(range.end-start,value.length),range.style]);
      }
    }
    for (const [node,parts] of matches) {
      const fragment = doc.createDocumentFragment();
      let offset=0;
      for (const [start,end,style] of parts.sort((a,b)=>a[0]-b[0])) {
        if (offset<start) fragment.append(node.data.slice(offset,start));
        const span=doc.createElement('span');
        span.setAttribute('data-about-design-mark','');
        if (style) paintProperties(span,{'background-color':'#ffe26b',...style});
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
  const flexMarker=/^<!--coop-about-design-v3:([A-Za-z0-9+/=]{1,16000})-->/;
  const slotTags={title:/^H[234]$/,subtitle:/^P$/,body:/^(DIV|SECTION|ARTICLE)$/,
    highlights:/^(UL|OL)$/,photo:/^FIGURE$/};
  const groupTag=/^(SECTION|ARTICLE|DIV)$/;
  const flexExample=[
    '<section data-layout="stack" style="padding:16px; gap:18px">',
    '  <header data-layout="stack" style="text-align:center">',
    '    <h3 data-slot="title"></h3><p data-slot="subtitle"></p>',
    '  </header>',
    '  <div data-layout="columns" style="gap:16px">',
    '    <figure data-slot="photo" style="width:38%; border-radius:12px"></figure>',
    '    <article class="card" style="background:#edf5ef; padding:16px">',
    '      <div data-slot="body"><mark style="background-color:#ffe26b">기존 본문의 정확한 문구</mark></div>',
    '      <ul data-slot="highlights" class="cards"></ul>',
    '    </article>',
    '  </div>',
    '</section>'
  ].join('\n');
  const palette={yellow:'#ffe26b',amber:'#f6c557',white:'#ffffff',navy:'#183451',blue:'#c7e0fb',
    green:'#cde9d2',leaf:'#cde9d2',rose:'#f9dbe1',violet:'#e9ddf9',slate:'#e1e9ef',black:'#17212b'};
  function normalizeProperty(key,value,kind) {
    if(typeof value!=='string' || value.length>45) return null;
    const clean=value.trim().toLowerCase();
    if (key==='background-color'||key==='color') {
      if (Object.hasOwn(palette,clean)) return palette[clean];
      return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(clean)?clean:null;
    }
    if (key==='text-align' && kind!=='mark') return /^(left|center|right|start|end)$/.test(clean)?clean:null;
    if (key==='font-weight' && ['title','subtitle','mark'].includes(kind)) return /^(400|500|600|700|bold|normal)$/.test(clean)?clean:null;
    if (['gap','padding','border-radius'].includes(key) && kind!=='mark') {
      if (key==='gap' && kind!=='group' || kind==='photo' && key==='padding') return null;
      const m=clean.match(/^(0|[0-9]{1,2}px)$/);
      return m && Number.parseInt(clean,10)<=48 ? (clean==='0'?'0px':clean) : null;
    }
    if (key==='width' && kind==='photo') {
      const m=clean.match(/^([0-9]{2,3})%$/);
      if(m&&+m[1]>=25&&+m[1]<=100)return clean;
      const px=clean.match(/^([0-9]{3,4})px$/);
      return px&&+px[1]>=120&&+px[1]<=1600?clean:null;
    }
    if (key==='max-width' && kind==='photo') {
      const m=clean.match(/^([0-9]{3,4})px$/);
      return m&&+m[1]>=120&&+m[1]<=1600?clean:null;
    }
    return null;
  }
  function propertiesOf(el,kind) {
    const result={};
    for (const entry of (el.getAttribute('style')||'').split(';')) {
      if (!entry.trim()) continue;
      const [raw,value,...rest]=entry.split(':');
      const key=raw.trim().toLowerCase()==='background'?'background-color':raw.trim().toLowerCase();
      const normalized=rest.length?null:normalizeProperty(key,value,kind);
      if (normalized===null||Object.hasOwn(result,key)) throw Error('안전한 색·정렬·간격·사진 폭만 사용할 수 있어요. 외부 주소나 다른 CSS는 빼 주세요.');
      result[key]=normalized;
    }
    return result;
  }
  function validProperties(style,kind) {
    return style && Object.getPrototypeOf(style)===Object.prototype
      && Object.keys(style).length<=10 && Object.entries(style).every(([key,value])=>normalizeProperty(key,value,kind)===value);
  }
  function validTree(node,seen,depth=0) {
    if (!node || typeof node!=='object'||depth>5||!Object.hasOwn(node,'kind')||!validProperties(node.style,node.kind)) return false;
    if (node.kind==='group') return Array.isArray(node.children) && node.children.length>0
      && (node.columns ? node.children.length===2 && node.children.every(n=>n?.kind!=='photo'||!n.style?.width?.endsWith('%')
         ||parseInt(n.style.width,10)<=75) : node.children.length<=5)
      && typeof node.columns==='boolean' && typeof node.card==='boolean'
      && node.children.every(child=>validTree(child,seen,depth+1));
    if (!Object.hasOwn(slotTags,node.kind)||seen.has(node.kind)||typeof node.card!=='boolean') return false;
    seen.add(node.kind);
    return true;
  }
  function readFlexToken(value,allowPrevious=true) {
    if (!/^v3:[A-Za-z0-9+/=]{1,16000}$/.test(String(value||''))) return null;
    try {
      const v=JSON.parse(root.atob(value.slice(3))), seen=new Set();
      if (v.tree?.kind!=='group'||!validTree(v.tree,seen)||seen.size!==5||
        !Array.isArray(v.callouts)||v.callouts.length>8||!Array.isArray(v.ranges)||v.ranges.length>12) return null;
      const base=r=>r&&Number.isInteger(r.index)&&r.index>0&&r.index<=maxBlocks&&/^[a-f0-9]{16}$/.test(r.sig);
      if (!v.callouts.every(base)||new Set(v.callouts.map(r=>r.index)).size!==v.callouts.length||
        !v.ranges.every(r=>base(r)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=maxText
           &&r.end>r.start&&r.end-r.start<=maxPhrase&&validProperties(r.style,'mark'))||
        v.ranges.some((a,i)=>v.ranges.slice(i+1).some(b=>a.index===b.index&&a.start<b.end&&b.start<a.end))) return null;
      if(Object.hasOwn(v,'previous') && (!allowPrevious||typeof v.previous!=='string'||
         (v.previous!==''&&!decode(v.previous)&&!readFlexToken(v.previous,false))))return null;
      return v;
    } catch (_) { return null; }
  }
  function validateAttributes(el,allowed) {
    if (el.namespaceURI!=='http://www.w3.org/1999/xhtml'||Array.from(el.attributes).some(x=>!allowed.includes(x.name)))
      throw Error('꾸밈에 쓰는 태그와 옵션만 넣어 주세요. 사진 주소·링크·실행 코드는 넣을 수 없어요.');
  }
  function readFlexHtml(raw,content) {
    const template=doc.createElement('template');
    template.innerHTML=raw;
    const nodes=sections(template.content), section=nodes[0];
    if (!section||nodes.length!==1||section.tagName!=='SECTION') throw Error('전체 시안을 section 하나로 감싸 주세요.');
    const original=doc.createElement('template');
    original.innerHTML=String(content||'').slice(0,maxText);
    const paragraphs=blocks(original.content), callouts=[],ranges=[];
    const seen=new Set();
    function walk(el,depth) {
      const slot=el.getAttribute('data-slot'), layout=el.getAttribute('data-layout'), css=el.getAttribute('class');
      if (depth>5) throw Error('구획을 너무 많이 겹치지 말아 주세요.');
      if (!slot && (groupTag.test(el.tagName)||el.tagName==='HEADER')) {
        validateAttributes(el,['class','style','data-layout']);
        if (layout&&!['columns','stack'].includes(layout)||css&&css!=='card') throw Error('구획은 세로(stack), 좌우(columns), 카드(card)로 꾸밀 수 있어요.');
        return {kind:'group',style:propertiesOf(el,'group'),card:css==='card',columns:layout==='columns',
          children:sections(el).map(child=>walk(child,depth+1))};
      }
      if (!Object.hasOwn(slotTags,slot)||!slotTags[slot].test(el.tagName)||seen.has(slot)) throw Error('제목·부제·본문·목록·사진은 각각 한 번만 넣어 주세요.');
      validateAttributes(el,['data-slot','style','class']);
      if (css&&!(slot==='highlights'&&['cards','plain'].includes(css))) throw Error('목록의 class는 cards 또는 plain만 사용할 수 있어요.');
      seen.add(slot);
      const options=sections(el);
      if (slot!=='body' && options.length) throw Error('본문 강조 외의 칸은 비워 주세요. 저장된 글과 사진이 들어가요.');
      for (const option of options) {
        if (option.tagName==='MARK'||option.tagName==='SPAN') {
          validateAttributes(option,['style']);
          const phrase=option.textContent.trim();
          if (!phrase||phrase.length>maxPhrase||ranges.length>=12||Array.from(option.childNodes).some(n=>n.nodeType!==3))
            throw Error('강조에는 기존 문구를 짧게 넣어 주세요.');
          const matches=[];
          paragraphs.forEach((p,i)=>{
            let at=p.text.indexOf(phrase);
            if(at>=0) {
              matches.push({index:i+1,sig:fingerprint(p.text),start:at,end:at+phrase.length,style:propertiesOf(option,'mark')});
              if(p.text.indexOf(phrase,at+1)>=0)matches.push(null);
            }
          });
          if(matches.length!==1||ranges.some(r=>r.index===matches[0].index&&r.start<matches[0].end&&matches[0].start<r.end))
            throw Error('본문에 한 번 나오는 문구만 그대로 쓰고, 강조 범위는 겹치지 않게 해 주세요.');
          ranges.push(matches[0]);
        } else if (option.tagName==='P'&&option.getAttribute('class')==='callout') {
          validateAttributes(option,['class','data-paragraph']);
          const index=Number(option.getAttribute('data-paragraph')), p=paragraphs[index-1];
          if (!p||!Number.isInteger(index)||index<1||option.childNodes.length||callouts.length>=8||
            callouts.some(r=>r.index===index)||paragraphs.some(other=>other!==p&&p.owner.contains(other.owner)))
            throw Error('강조할 문단의 번호를 확인해 주세요.');
          callouts.push({index,sig:fingerprint(p.text)});
        } else throw Error('본문 칸에는 기존 문구 강조(mark)나 빈 문단 강조(callout)만 넣어 주세요.');
      }
      return {kind:slot,style:propertiesOf(el,slot),card:css==='cards'};
    }
    function legacyWithStyles() {
      validateAttributes(section,['class','style']);
      const classes=section.className.trim().split(/\s+/);
      const groups=['photo','tone','space'].map(key=>classes.filter(t=>choices[key].some(v=>t===key+'-'+v)));
      const extras=classes.filter(x=>!groups.flat().includes(x));
      if(new Set(classes).size!==classes.length||groups.some(items=>items.length!==1)||
        extras.some(x=>!['heading-wide','photo-narrow','photo-wide'].includes(x))||
        extras.includes('photo-narrow')&&extras.includes('photo-wide')) throw Error('기존 시안의 사진·색·여백 옵션을 확인해 주세요.');
      const stack=(children,style={},columns=false)=>({kind:'group',children,style,card:false,columns});
      const original=sections(section).map(el=>walk(el,1));
      const heading=stack(original.filter(n=>['title','subtitle'].includes(n.kind)));
      const rest=original.filter(n=>['body','highlights'].includes(n.kind));
      const photo=original.find(n=>n.kind==='photo');
      if(!photo||heading.children.length!==2||rest.length!==2)throw Error('제목·부제·본문·목록·사진 칸을 모두 넣어 주세요.');
      if(!photo.style.width&&extras.some(x=>x.startsWith('photo-')))photo.style.width=extras.includes('photo-narrow')?'34%':'66%';
      const [placement]=groups[0], wide=extras.includes('heading-wide');
      const detail=stack(wide?rest:[heading,...rest]);
      const arrangement=placement==='photo-top'?[photo,detail]:
        [stack(placement==='photo-left'?[photo,detail]:[detail,photo],{},true)];
      const style={padding:groups[2][0]==='space-roomy'?'24px':'12px'};
      if(groups[1][0]!=='tone-plain')style['background-color']=groups[1][0]==='tone-sun'?'#fff5db':'#edf5ef';
      return stack(wide?[heading,...arrangement]:arrangement,{...style,...propertiesOf(section,'group')});
    }
    const tree=/\bphoto-(?:left|right|top)\b/.test(section.className)?legacyWithStyles():walk(section,0);
    const token='v3:'+root.btoa(JSON.stringify({tree,callouts,ranges}));
    if (!readFlexToken(token)) throw Error('제목·부제·본문·목록·사진 칸을 모두 넣고 좌우 구획에는 두 칸을 넣어 주세요.');
    return token;
  }
  function paintProperties(node,style) {
    for(const [key,value] of Object.entries(style)) if (key!=='width'&&key!=='max-width') node.style.setProperty(key,value);
    if (style['background-color']) {
      const luminance=value=>{
      let hex=value.slice(1);
      if(hex.length===3) hex=hex.split('').map(s=>s+s).join('');
      const rgb=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      };
      const bg=luminance(style['background-color']), ink=style.color?luminance(style.color):null;
      if (ink===null||(Math.max(bg,ink)+.05)/(Math.min(bg,ink)+.05)<4.5) node.style.color=bg>.179?'#000':'#fff';
    }
  }
  function restoreFlex(columns,content,list) {
    const tree=columns?.querySelector(':scope > [data-about-flex-tree]');
    if (!tree) return;
    const text=columns.querySelector(':scope > [data-about-text]'), heading=text?.querySelector('[data-about-heading]');
    const title=tree.querySelector('[data-about-flex-original="title"]'), subtitle=tree.querySelector('[data-about-flex-original="subtitle"]');
    if(heading) {if(title)heading.append(title);if(subtitle)heading.append(subtitle);}
    if(text) {if(list)text.append(list);if(content)text.append(content);}
    const photo=tree.querySelector('[data-about-photo]');
    if(photo)columns.append(photo);
    if(title)title.removeAttribute('data-about-flex-original');
    if(subtitle)subtitle.removeAttribute('data-about-flex-original');
    paintAccents(content,null);
    columns.removeAttribute('data-about-flex');
    tree.remove();
  }
  function paintFlex(columns,content,list,saved,hasPhoto,defaultPhoto) {
    restoreFlex(columns,content,list);
    if (!saved) return;
    paint(columns,content,list,'',hasPhoto,defaultPhoto);
    const text=columns.querySelector(':scope > [data-about-text]');
    const heading=text?.querySelector('[data-about-heading]');
    const photo=columns.querySelector(':scope > [data-about-photo]');
    if (!heading||!photo||!content||!list||heading.children.length<2) return;
    const originals={title:heading.children[0],subtitle:heading.children[1],body:content,highlights:list,photo};
    function exists(n) {
      if(n.kind==='photo')return hasPhoto;
      return n.kind!=='group'||n.children.some(exists);
    }
    function build(n,photoTrack=false,inherited={}) {
      const box=doc.createElement('div');
      box.setAttribute('data-about-flex-kind',n.kind);
      paintProperties(box,n.style);
      const applied={align:inherited.align||!!n.style['text-align'],color:inherited.color||!!(n.style.color||n.style['background-color'])};
      if(n.card)box.setAttribute('data-about-flex-card','');
      if(n.kind==='group') {
        const children=n.children.filter(exists);
        const asColumns=n.columns&&children.length===2;
        if(asColumns) {
          box.setAttribute('data-about-flex-columns','');
          const index=children.findIndex(x=>x.kind==='photo');
          if(index>=0) {
            const width=children[index].style.width?.endsWith('%')?Number.parseInt(children[index].style.width,10):50;
            box.style.setProperty('--about-flex-first',(index===0?width:100-width)+'fr');
            box.style.setProperty('--about-flex-second',(index===1?width:100-width)+'fr');
          }
        }
        children.forEach(child=>box.append(build(child,asColumns&&child.kind==='photo',applied)));
      } else if(n.kind==='photo') {
        const width=n.style.width;
        if(width)box.style.setProperty('--about-flex-photo-width',width);
        const caps=[n.style['max-width'],width?.endsWith('px')?width:null].filter(Boolean);
        if(caps.length)box.style.setProperty('--about-flex-photo-max',Math.min(...caps.map(x=>parseInt(x,10)))+'px');
        if(photoTrack)box.setAttribute('data-about-flex-photo-track','');
        box.append(photo);
      } else {
        const node=originals[n.kind];
        if(n.kind==='title'||n.kind==='subtitle')node.setAttribute('data-about-flex-original',n.kind);
        if(applied.align)box.setAttribute('data-about-flex-align','');
        if(applied.color)box.setAttribute('data-about-flex-ink','');
        if(n.style['font-weight'])box.setAttribute('data-about-flex-weight','');
        box.append(node);
      }
      return box;
    }
    const tree=build(saved.tree);
    tree.setAttribute('data-about-flex-tree','');
    columns.setAttribute('data-about-flex','');
    columns.append(tree);
    paintAccents(content,saved);
  }
  function readAboutHtml(raw,content) {
    const trimmed=String(raw||'').trim();
    if(trimmed.length>12000) throw Error('시안이 너무 길어요. 꾸밈에 필요한 HTML만 넣어 주세요.');
    const text=trimmed.replace(/^\x60\x60\x60(?:html)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60$/i,'$1').trim();
    return /\b(?:data-layout|style)\s*=/i.test(text) ? readFlexHtml(text,content) : readHtml(raw,content);
  }
  function unpackAbout(value) {
    const body=String(value||''), m=body.match(flexMarker);
    return m ? {content:body.slice(m[0].length),design:readFlexToken('v3:'+m[1])?'v3:'+m[1]:''} : unpack(body);
  }
  function packAbout(body,design) {
    const content=unpackAbout(body).content;
    return readFlexToken(design)?'<!--coop-about-design-v3:'+design.slice(3)+'-->'+content:pack(content,design);
  }
  function withPrevious(value,prior) {
    const saved=readFlexToken(value);
    if(!saved)return value;
    const earlier=readFlexToken(prior);
    if(earlier)delete earlier.previous;
    const previous=earlier?'v3:'+root.btoa(JSON.stringify(earlier)):decode(prior)?prior:'';
    if(previous===value)return prior;
    const candidate='v3:'+root.btoa(JSON.stringify({...saved,previous}));
    if(!readFlexToken(candidate))throw Error('시안과 이전 디자인을 함께 보관하기에 너무 길어요. 구획이나 강조를 조금 줄여 주세요.');
    return candidate;
  }
  function paintAbout(columns,content,list,value,hasPhoto,defaultPhoto) {
    if(!columns)return;
    const saved=readFlexToken(value);
    if(saved)paintFlex(columns,content,list,saved,hasPhoto,defaultPhoto);
    else {restoreFlex(columns,content,list);paint(columns,content,list,value,hasPhoto,defaultPhoto);}
  }
  function flexPrompt(source) {
    const legacy=makePrompt(source);
    return [
      '기존 조합 소개 글·제목·사진을 바꾸지 말고 아래 문법으로 안전한 꾸밈용 HTML만 만들어 줘.',
      '전체는 section 하나, section/div/article/header 구획에 data-layout="stack"(세로) 또는 "columns"(두 칸 좌우)를 쓸 수 있어. 카드로 꾸밀 구획에는 class="card". 작은 화면에서는 세로로 쌓여.',
      'data-slot title, subtitle, body, highlights, photo는 하나씩. 본문 외의 칸은 빈 칸으로 둬. 사진 위에 제목을 두려면 제목 구획 다음에 사진을 배치해. 사진 폭 예: style="width:60%"(상단 25~100%, 좌우 25~75%) 또는 width:520px. 선택 max-width:720px. 좌우에서는 % 폭이 열 비율이고 모바일에서는 사진 폭 자체로 반영돼.',
      'style은 background-color(또는 background), color에 단색 HEX/예시 색 이름, text-align, gap/padding/border-radius 0~48px, 제목·부제·강조의 font-weight만. 목록은 class="cards" 또는 "plain". URL, 외부 리소스, 새 글, 링크/버튼, 스크립트, 별도 CSS는 넣지 마.',
      '본문의 노란 인라인 강조는 <mark style="background-color:#ffe26b">본문에 한번만 등장하는 정확한 기존 문구</mark>. 짧은 문구 최대 12개, 별도로 <p data-paragraph="2" class="callout"></p>로 문단 강조 최대 8개. 예시 문구와 숫자는 아래 내용과 대조해서 사용하고 필요 없으면 빼.',
      flexExample,legacy.slice(legacy.indexOf('현재 조합 소개 (디자인 참고용):'))
    ].join('\n\n');
  }
  root.CoopAboutDesign = Object.freeze({version:'3.0.0', example:flexExample, readHtml:readAboutHtml,
    unpack:unpackAbout, pack:packAbout, paint:paintAbout, makePrompt:flexPrompt, withPrevious,
    previous:value=>readFlexToken(value)?.previous,
    isDesign:value=>!!(readFlexToken(value)||decode(value))});
})(window);
