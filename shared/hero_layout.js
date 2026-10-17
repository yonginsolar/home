/* Presentation only: keep the original caption nodes, settings and editing state. */
(function(root){
 'use strict';
 let hero,resize,mutation,observed=new Set(),queued=false,headerHeight=null,cache=null,fontEpoch=0,editReserve=0;
 const belowClass='is-caption-overflow';
 function queue(){if(queued)return;queued=true;(root.requestAnimationFrame||((fn)=>root.setTimeout(fn,16)))(measure);}
 function watch(nodes){
  if(!resize)return;const next=new Set(nodes.filter(Boolean));
  for(const node of observed)if(!next.has(node))resize.unobserve(node);
  for(const node of next)if(!observed.has(node))resize.observe(node,{box:'border-box'});
  observed=next;
 }
 // Inert text-only copies, never the original editor nodes or resource URLs.
 function copyCaption(source,fields){
  if(source.nodeType===3)return source.cloneNode(false);
  if(source.nodeType!==1||/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|VIDEO|AUDIO|SOURCE|LINK)$/.test(source.tagName))return null;
  if(source.tagName==='IMG'){const box=document.createElement('span'),r=source.getBoundingClientRect();box.style.cssText='display:inline-block;width:'+r.width+'px;height:'+r.height+'px';return box;}
  const n=source.cloneNode(false),key={'public-hero-title':'heroTitle','public-hero-subtitle':'heroSubtitle','public-hero-cta':'heroButton'}[source.id];if(key)fields[key]=n;
  for(const a of [...n.attributes])if(/^(id|for|href|src|srcset|poster|contenteditable|tabindex|autofocus|on.*|data-inline-.*)$/.test(a.name))n.removeAttribute(a.name);
  n.classList.remove('home-inline-active');n.style.removeProperty('background-image');
  if(n.hidden&&!key)n.style.setProperty('display','none','important');
  for(const child of source.childNodes){const c=copyCaption(child,fields);if(c)n.append(c);}
  return n;
 }
 function reserveFor(items,caption,frame,width){
  const cert=caption.querySelector('#public-hero-certifications'),heading=caption.querySelector('#public-hero-title');
  const key=JSON.stringify([items,width,frame.getBoundingClientRect().height,document.body.className,root.getComputedStyle(heading||caption).fontFamily,cert?.outerHTML,fontEpoch]);
  if(cache?.key===key)return cache.extra;
  const probe=document.createElement('div');probe.className='hero-layout-probe';probe.setAttribute('aria-hidden','true');probe.inert=true;
  let extra=0;
  try{
   hero.append(probe);
   for(const item of items){
    if(!item.visible||![item.title,item.subtitle,item.button_label&&item.button_url].some(v=>v.trim()))continue;
    const fields={},copy=copyCaption(caption,fields),p=item.display||{},overlay=width>=768||p.mobile_fit==='cover',padding=!overlay?'28px 20px':width<768?'10px 20px':'20px';
    copy.hidden=false;copy.removeAttribute('hidden');copy.style.cssText='position:relative;inset:auto;display:'+(!overlay?'block':'flex')+';align-items:center;justify-content:center;height:auto;min-height:0;max-height:none;margin:0 auto;overflow:visible;padding:'+padding+'!important';
    const row=copy.firstElementChild;if(row){row.style.maxHeight='none';if(overlay){row.style.flex='1 1 0';row.style.minWidth='0';}}
    for(const [k,field,visible]of [['heroTitle','title','title_visible'],['heroSubtitle','subtitle','subtitle_visible'],['heroButton','button_label','button_visible']]){
     const n=fields[k];if(!n)continue;n.hidden=p[visible]===false||!item[field].trim()||(k==='heroButton'&&!item.button_url);
     if(n.hidden)n.style.setProperty('display','none','important');else n.style.removeProperty('display');
     root.CoopTextStyles?.paint(n,item[field],p.text_styles?.[k]);if(!root.CoopTextStyles)n.textContent=item[field];n.style.whiteSpace='pre-wrap';
    }
    if(['heroTitle','heroSubtitle','heroButton'].every(k=>!fields[k]||fields[k].hidden)&&(!cert||cert.hidden||root.getComputedStyle(cert).display==='none'))continue;
    probe.append(copy);
    for(const k of ['heroTitle','heroSubtitle','heroButton'])if(fields[k])root.CoopHomeDisplay?.styleText(k,p.text?.[k],fields[k]);
    const needed=copy.getBoundingClientRect().height;
    if(!overlay||needed>frame.getBoundingClientRect().height+1)extra=Math.max(extra,needed);
    copy.remove();
   }
  }finally{probe.remove();}
  cache={key,extra};return extra;
 }
 function ownProbeRecord(r){return r.target.closest?.('.hero-layout-probe')||r.type==='childList'&&[...r.addedNodes,...r.removedNodes].length>0&&[...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&n.classList.contains('hero-layout-probe'));}
 function measure(){
  queued=false;if(!hero?.isConnected)return;
  const header=document.getElementById('header'),frame=hero.querySelector(':scope>.hero-device-frame'),caption=hero.querySelector(':scope>.container'),row=caption?.firstElementChild;
  watch([header,frame,caption,row]);
  const fixed=header&&['fixed','absolute'].includes(root.getComputedStyle(header).position);
  const height=fixed?Math.max(0,header.getBoundingClientRect().height):0;
  if(headerHeight===null||Math.abs(height-headerHeight)>.01){headerHeight=height;hero.style.setProperty('--hero-header-height',height+'px');}
  let below=false,currentExtra=0;const width=document.documentElement.clientWidth,editing=!!caption?.querySelector('.home-inline-active');
  if(frame&&caption&&row&&hero.classList.contains('has-mobile-image')&&!frame.hidden&&!caption.hidden&&root.getComputedStyle(caption).display!=='none'){
   const overlay=width>=768||hero.classList.contains('is-mobile-cover'),available=frame.getBoundingClientRect().height;
   if(overlay&&available>0){
    const style=root.getComputedStyle(caption),padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    // A constrained mobile row may have a larger natural scroll height.
    const needed=Math.max(row.scrollHeight,row.getBoundingClientRect().height)+padding;
    below=needed>available+(hero.classList.contains(belowClass)?-2:1)||editing&&hero.classList.contains(belowClass);
    if(below)currentExtra=needed;
   }else if(available>0){currentExtra=caption.getBoundingClientRect().height;
   }
  }
  if(hero.classList.contains(belowClass)!==below)hero.classList.toggle(belowClass,below);
  const items=root.CoopHeroBanner?.captionLayouts?.()||[],available=frame?.getBoundingClientRect().height||0;
  const stable=items.length>1&&available>0&&!frame.hidden&&hero.classList.contains('has-mobile-image');
  if(stable){
   const measured=reserveFor(items,caption,frame,width),extra=Math.max(measured>0?Math.ceil(measured)+2:0,currentExtra);editReserve=editing?Math.max(editReserve,extra):extra;
   const total=Math.ceil(height+available+(parseFloat(root.getComputedStyle(frame).marginBottom)||0)+editReserve);
   if(hero.style.getPropertyValue('--hero-photo-height')!==available+'px')hero.style.setProperty('--hero-photo-height',available+'px');
   if(hero.style.getPropertyValue('--hero-slide-min-height')!==total+'px')hero.style.setProperty('--hero-slide-min-height',total+'px');
  }else{editReserve=0;cache=null;hero.style.removeProperty('--hero-photo-height');hero.style.removeProperty('--hero-slide-min-height');}
  if(hero.classList.contains('has-stable-caption')!==stable)hero.classList.toggle('has-stable-caption',stable);
 }
 function mount(){
  hero=document.getElementById('hero');if(!hero)return;
  if(root.ResizeObserver)resize=new root.ResizeObserver(queue);
  if(root.MutationObserver){mutation=new root.MutationObserver(records=>{if(records.some(r=>!ownProbeRecord(r)))queue();});mutation.observe(hero,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});}
  root.addEventListener('resize',queue);root.addEventListener('pageshow',queue);
  const fontsChanged=()=>{fontEpoch++;cache=null;queue();};document.fonts?.ready?.then(fontsChanged);document.fonts?.addEventListener?.('loadingdone',fontsChanged);
  queue();
 }
 root.CoopHeroLayout=Object.freeze({refresh:queue,version:'1.1.1'});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
