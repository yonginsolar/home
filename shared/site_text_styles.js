/* Plain text stays plain: optional, validated text runs carry visual formatting only. */
(function(root){
 'use strict';
 const keys=['bold','italic','underline','color','highlight'];
 const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
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
 function html(value,runs){const n=document.createElement('span');paint(n,value,runs);return n.innerHTML;}
 root.CoopTextStyles=Object.freeze({normalize,paint,read,format,trim,html});
})(window);
