/* Plain text stays plain: optional, validated text runs carry visual formatting only. */
(function(root){
 'use strict';
 const keys=['bold','italic','underline','color','highlight'];
 const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 // Night colors are presentation-only. Inline day colors remain the source of truth.
 const nightAttrs=['data-coop-night-color','data-coop-night-highlight'];
 const nightProps=['--coop-night-color','--coop-night-highlight'];
 const publicScopes='#public-hero-title,#public-hero-subtitle,#public-hero-cta,#public-impact-title,#public-impact-description,#public-impact-kicker,#public-impact-cta,#about-title,#about-subtitle,#about-content,#about-list,#public-contact-phone,#public-contact-email,#public-contact-address,.activity-card-title,#activityDetailTitle,#activityDetailContent,#home-preview-activity-article';
 function rgb(value){
  if(color(value))return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)).concat(1);
  const m=String(value||'').match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  return m?m.slice(1,4).map(v=>Math.max(0,Math.min(255,Number(v)))).concat(m[4]===undefined?1:Math.max(0,Math.min(1,Number(m[4])))):null;
 }
 function hex(c){return '#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');}
 function luminance(c){const v=c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});return v[0]*.2126+v[1]*.7152+v[2]*.0722;}
 function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 function hsl(c){
  const [r,g,b]=c.slice(0,3).map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(!d)return [0,0,l];const s=d/(1-Math.abs(2*l-1));let h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;return [h/6,s,l];
 }
 function fromHsl(h,s,l){
  const hue=(p,q,t)=>{if(t<0)t++;if(t>1)t--;return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;return (s?[hue(p,q,h+1/3),hue(p,q,h),hue(p,q,h-1/3)]:[l,l,l]).map(v=>Math.round(v*255)).concat(1);
 }
 function readable(fg,bg){
  if(contrast(fg,bg)>=4.55)return fg;
  const [h,s,l]=hsl(fg),candidates=[];
  if(luminance(fg)<.03&&s<=.5&&l<.2&&luminance(bg)<.15){const neutral=rgb('#e8edf5');if(contrast(neutral,bg)>=4.55)return neutral;}
  // Find the nearest same-hue lightness that meets the contrast target.
  for(const edge of [0,1]){let fail=l,pass=edge,c=fromHsl(h,s,edge);if(contrast(c,bg)<4.55)continue;for(let i=0;i<18;i++){const mid=(fail+pass)/2,next=fromHsl(h,s,mid);if(contrast(next,bg)>=4.55){pass=mid;c=next;}else fail=mid;}candidates.push({c,d:Math.abs(pass-l)});}
  candidates.sort((a,b)=>a.d-b.d);return candidates[0]?.c||fg;
 }
 function nightStyle(foreground,background){
  const bg=rgb(background)||rgb('#111b2e'),fg=rgb(foreground)||rgb('#e8edf5');return {color:hex(readable(fg,bg))};
 }
 function stripNight(node){
  for(const n of [node,...node.querySelectorAll('*')]){for(const a of nightAttrs)n.removeAttribute(a);for(const p of nightProps)n.style.removeProperty(p);if(n.getAttribute('style')==='')n.removeAttribute('style');}
 }
 function sourceHtml(node){const clone=node.cloneNode(true);stripNight(clone);return clone.innerHTML;}
 function backdrop(node){
  const layers=[];for(let n=node;n&&n.nodeType===1;n=n.parentElement){const c=rgb(root.getComputedStyle(n).backgroundColor);if(c&&c[3]>0){layers.push(c);if(c[3]===1)break;}}
  let base=rgb('#0b1220');for(const c of layers.reverse())base=c.slice(0,3).map((v,i)=>v*c[3]+base[i]*(1-c[3])).concat(1);return base;
 }
 function adapt(scope){
  if(!scope?.isConnected)return;
  const nodes=[scope,...scope.querySelectorAll('[style],[data-coop-night-color],[data-coop-night-highlight]')];
  for(const n of nodes){for(const a of nightAttrs)n.removeAttribute(a);for(const p of nightProps)n.style.removeProperty(p);}
  if(document.documentElement.dataset.theme!=='dark')return;
  if(!document.getElementById('coop-night-text-styles')){
   const css=document.createElement('style');css.id='coop-night-text-styles';
   const areas=':is(#hero,#main,#activityDetailModal,#home-preview-activity-article)';
   css.textContent=nightAttrs.map((a,i)=>`html[data-theme="dark"] body ${areas}[${a}],html[data-theme="dark"] body ${areas} [${a}]{${i?'background-color':'color'}:var(${nightProps[i]})!important}`).join('');document.head.append(css);
  }
  // Backgrounds first, so nested text is checked against its displayed highlight.
  for(const n of nodes){const c=rgb(n.style.backgroundColor);if(!c||c[3]===0)continue;const [h,s,l]=hsl(c);n.style.setProperty(nightProps[1],hex(fromHsl(h,s*.75,Math.min(l,.2))));n.setAttribute(nightAttrs[1],'');}
  for(const n of nodes){const fg=rgb(n.style.color);if(!fg&&!n.hasAttribute(nightAttrs[1]))continue;const actual=fg||rgb(root.getComputedStyle(n).color)||rgb('#e8edf5');n.style.setProperty(nightProps[0],hex(readable(actual,backdrop(n))));n.setAttribute(nightAttrs[0],'');}
 }
 function adaptPublic(){for(const n of document.querySelectorAll(publicScopes))adapt(n);}
 function normalize(value,runs){
  if(!Array.isArray(runs)||runs.length>256||runs.some(r=>!r||typeof r.text!=='string'||Object.keys(r).some(k=>k!=='text'&&!keys.includes(k))))return [];
  if(runs.map(r=>r.text).join('')!==String(value??''))return [];
  const clean=[];
  for(const r of runs){const row={text:r.text};for(const k of keys){if(['color','highlight'].includes(k)){if(r[k]!==undefined&&!color(r[k]))return [];if(r[k])row[k]=r[k].toLowerCase();}else{if(r[k]!==undefined&&typeof r[k]!=='boolean')return [];if(r[k])row[k]=true;}}if(row.text)clean.push(row);}
  return clean.some(r=>Object.keys(r).length>1)?clean:[];
 }
 function paint(node,value,runs){
  if(!node)return;const clean=normalize(value,runs);node.replaceChildren();
  for(const r of clean.length?clean:[{text:String(value??'')}]){
   const span=document.createElement('span');span.textContent=r.text;
   if(r.bold)span.style.fontWeight='700';if(r.italic)span.style.fontStyle='italic';if(r.underline)span.style.textDecoration='underline';
   span.style.color=r.color||'inherit';if(r.highlight)span.style.backgroundColor=r.highlight;
   span.style.whiteSpace='pre-wrap';if(Object.keys(r).length===1)node.append(document.createTextNode(r.text));else node.append(span);
  }
  adapt(node);
 }
 function read(node){
  const rows=[];function walk(n,attrs){
   if(n.nodeType===3){if(n.data)rows.push({text:n.data,...attrs});return;}
   if(n.nodeType!==1)return;if(n.tagName==='BR'){rows.push({text:'\n',...attrs});return;}
   const a={...attrs},s=n.style;
   if(['STRONG','B'].includes(n.tagName)||s.fontWeight==='700'||s.fontWeight==='bold')a.bold=true;
   if(['EM','I'].includes(n.tagName)||s.fontStyle==='italic')a.italic=true;
   if(n.tagName==='U'||s.textDecoration.includes('underline'))a.underline=true;
   for(const [k,p] of [['color','color'],['highlight','backgroundColor']]){const v=s[p];if(v){const rgb=v.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);const hex=rgb?'#'+rgb.slice(1).map(x=>Number(x).toString(16).padStart(2,'0')).join(''):v;if(color(hex))a[k]=hex.toLowerCase();}}
   for(const child of n.childNodes)walk(child,a);
  }for(const child of node.childNodes)walk(child,{});
  const merged=[];for(const r of rows){const last=merged.at(-1);if(last&&keys.every(k=>last[k]===r[k]))last.text+=r.text;else merged.push(r);}
  const value=merged.map(r=>r.text).join('');return {value,runs:normalize(value,merged)};
 }
 function format(value,runs,start,end,kind,v){
  const source=normalize(value,runs),out=[];let offset=0;
  for(const r of source.length?source:[{text:value}]){
   const a=offset,b=offset+r.text.length;for(const [lo,hi] of [[a,Math.min(b,start)],[Math.max(a,start),Math.min(b,end)],[Math.max(a,end),b]]){
    if(hi<=lo)continue;const next={...r,text:r.text.slice(lo-a,hi-a)};
    if(lo>=start&&hi<=end){if(kind==='clear')for(const k of keys)delete next[k];else if(v===false)delete next[kind];else next[kind]=v;}out.push(next);
   }offset=b;
  }return normalize(value,out);
 }
 function trim(value,runs){const text=String(value??''),start=text.length-text.trimStart().length,end=text.trimEnd().length;let at=0;const result=[];for(const r of normalize(text,runs)){const lo=Math.max(start,at),hi=Math.min(end,at+r.text.length);if(hi>lo)result.push({...r,text:r.text.slice(lo-at,hi-at)});at+=r.text.length;}return normalize(text.trim(),result);}
 // Legacy lists stay unchanged in the original field until an actual edit/save.
 // An inert template extracts visible text and supported formatting, not markup.
 function editableList(value,runs){
  const raw=String(value??'');if(!/<li[\s>]/i.test(raw))return {value:raw,runs:normalize(raw,runs)};
  const template=document.createElement('template');template.innerHTML=raw;
  template.content.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach(n=>n.remove());
  const lines=[];for(const li of template.content.querySelectorAll('li')){
   const part=read(li),text=part.value.trim();if(!text)continue;
   if(lines.length)lines.push({text:'\n'});lines.push(...(trim(part.value,part.runs).length?trim(part.value,part.runs):[{text}]));
  }
  const text=lines.map(r=>r.text).join('');return {value:text,runs:normalize(text,runs).length?normalize(text,runs):normalize(text,lines)};
 }
 function html(value,runs){const n=document.createElement('span');paint(n,value,runs);return n.innerHTML;}
 root.CoopTextStyles=Object.freeze({normalize,paint,read,format,trim,editableList,html,adapt,adaptPublic,sourceHtml,nightStyle});
 root.addEventListener('coop-theme-change',adaptPublic);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',adaptPublic,{once:true});else adaptPublic();
})(window);
