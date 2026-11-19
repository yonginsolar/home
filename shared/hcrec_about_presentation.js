/* Bounded presentation and paste for the Hwaseong introduction; no storage or requests. */
(function(root){
 'use strict';
 const hcrec='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028';
 const choices={title_size:['small','normal','large'],title_align:['left','center','right'],body_size:['small','normal','large'],body_align:['left','center','right'],photo:['left','right','top']};
 const keys=[...Object.keys(choices),'alt'];
 const isCoop=id=>String(id||'')===hcrec;
 const matches=(id,where=root.location)=>isCoop(id)&&where.protocol==='https:'&&!where.port&&['hcrec.kr','www.hcrec.kr','erp.hcrec.kr'].includes(where.hostname.toLowerCase().replace(/\.$/,''));
 function sanitize(value){
  const clean={};
  for(const [key,values]of Object.entries(choices))if(values.includes(value?.[key]))clean[key]=value[key];
  if(typeof value?.alt==='string'){
   const alt=value.alt.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
   if(alt)clean.alt=Array.from(alt).slice(0,180).join('');
  }
  return clean;
 }
 function imageUrl(value,preview=false){
  const raw=String(value||'').trim();
  if(preview&&/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(raw))return raw;
  if(preview&&raw.startsWith('blob:')){try{const u=new URL(raw);return u.origin===root.location.origin?raw:'';}catch(_){return '';}}
  const local=/^\/(?![\/\\])/.test(raw);
  if(!raw||/[\x00-\x20\x7f<>"'\\]/.test(raw)||(!local&&!/^https:\/\//i.test(raw)))return '';
  try{const u=new URL(raw,root.location.origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}
 }
 function aboutHref(rawValue){
  const raw=String(rawValue||'').trim();
  if(!raw||/[\x00-\x20\x7f<>"'\\]/.test(raw))return '';
  if(/^#[A-Za-z0-9_-]+$/.test(raw)||/^tel:\+?[0-9-]{3,22}$/i.test(raw)||/^mailto:[^@?:]+@[^@?:]+$/i.test(raw))return raw;
  if(!/^(https?:\/\/|\/(?!\/))/i.test(raw))return '';
  try{const u=new URL(raw,root.location.origin);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?raw:'';}catch(_){return '';}
 }
 const pasteTags=new Set(['P','BR','STRONG','B','EM','I','U','SPAN','H2','H3','UL','OL','LI','BLOCKQUOTE','A','DIV','H1','H4','H5','H6']);
 const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','LINK','META','IMG','TEMPLATE','INPUT','BUTTON','TEXTAREA','SELECT','FORM']);
 function pasteFragment(html,text=''){
  const out=document.createDocumentFragment();
  if(typeof html==='string'&&html&&html.length<=200000){
   const source=document.createElement('template');source.innerHTML=html;
   function copy(node,parent,depth){
    if(depth>60)return;
    if(node.nodeType===3){parent.append(document.createTextNode(node.data));return;}
    if(node.nodeType!==1||blocked.has(node.tagName))return;
    const tag=node.tagName;
    let dest=parent,visible;
    if(pasteTags.has(tag)&&tag!=='SPAN'){
     const actual=tag==='DIV'?'p':/^H[1456]$/.test(tag)?'h3':tag.toLowerCase();
     // Only the optional validated href survives. No event, style or media attributes are copied.
     const href=tag==='A'?aboutHref(node.getAttribute('href')):'';
     if(tag!=='A'||href){visible=document.createElement(actual);if(href)visible.setAttribute('href',href);parent.append(visible);dest=visible;}
    }
    const style=node.style;
    for(const [enabled,kind]of [[style && /^(?:bold|[6-9]00)$/.test(style.fontWeight),'strong'],[style?.fontStyle==='italic','em'],[style?.textDecorationLine==='underline'||style?.textDecoration==='underline','u']]){
     if(enabled){const n=document.createElement(kind);dest.append(n);dest=n;}
    }
    for(const child of node.childNodes)copy(child,dest,depth+1);
   }
   for(const node of source.content.childNodes)copy(node,out,0);
   if(out.textContent.trim()||out.querySelector('br'))return out;
   out.replaceChildren();
  }
  for(const [i,line]of String(text||'').slice(0,100000).replace(/\r\n?/g,'\n').split('\n').entries()){
   if(i)out.append(document.createElement('br'));
   if(line)out.append(document.createTextNode(line));
  }
  return out;
 }
 function decorate(container,textCol,photoCol,image,options,url){
  if(!container||!textCol||!photoCol||!image)return;
  const p=sanitize(options),photo=!!url;
  container.dataset.hcrecAbout='';container.dataset.hasPhoto=String(photo);
  for(const key of Object.keys(choices)){
   const attr='data-'+key.replaceAll('_','-');
   if(p[key])container.setAttribute(attr,p[key]);else container.removeAttribute(attr);
  }
  photoCol.hidden=!photo;image.hidden=!photo;
  // Put a reading-relevant first photo first in DOM order as well as visually.
  const first=photo&&['left','top'].includes(p.photo)?photoCol:textCol;
  if(container.firstElementChild!==first)container.insertBefore(first,container.firstElementChild);
  if(photo){image.alt=p.alt||'협동조합 소개 사진';if(image.getAttribute('src')!==url)image.src=url;}
  else{image.removeAttribute('src');image.alt='';}
 }
 root.CoopHcrecAbout=Object.freeze({matches,sanitize,keys,imageUrl,aboutHref,pasteFragment,decorate});
})(window);
