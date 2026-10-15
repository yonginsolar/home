/* Presentation only: keep the original caption nodes, settings and editing state. */
(function(root){
 'use strict';
 let hero,resize,mutation,observed=new Set(),queued=false,headerHeight=null;
 const belowClass='is-caption-overflow';
 function queue(){if(queued)return;queued=true;(root.requestAnimationFrame||((fn)=>root.setTimeout(fn,16)))(measure);}
 function watch(nodes){
  if(!resize)return;const next=new Set(nodes.filter(Boolean));
  for(const node of observed)if(!next.has(node))resize.unobserve(node);
  for(const node of next)if(!observed.has(node))resize.observe(node,{box:'border-box'});
  observed=next;
 }
 function measure(){
  queued=false;if(!hero?.isConnected)return;
  const header=document.getElementById('header'),frame=hero.querySelector(':scope>.hero-device-frame'),caption=hero.querySelector(':scope>.container'),row=caption?.firstElementChild;
  watch([header,frame,caption,row]);
  const fixed=header&&['fixed','absolute'].includes(root.getComputedStyle(header).position);
  const height=fixed?Math.max(0,header.getBoundingClientRect().height):0;
  if(headerHeight===null||Math.abs(height-headerHeight)>.01){headerHeight=height;hero.style.setProperty('--hero-header-height',height+'px');}
  let below=false;
  if(frame&&caption&&row&&hero.classList.contains('has-mobile-image')&&!frame.hidden&&!caption.hidden&&root.getComputedStyle(caption).display!=='none'){
   const width=document.documentElement.clientWidth,overlay=width>=768||hero.classList.contains('is-mobile-cover'),available=frame.getBoundingClientRect().height;
   if(overlay&&available>0){
    const style=root.getComputedStyle(caption),padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    // A constrained mobile row may have a larger natural scroll height.
    const needed=Math.max(row.scrollHeight,row.getBoundingClientRect().height)+padding;
    below=needed>available+(hero.classList.contains(belowClass)?-2:1);
   }
  }
  if(hero.classList.contains(belowClass)!==below)hero.classList.toggle(belowClass,below);
 }
 function mount(){
  hero=document.getElementById('hero');if(!hero)return;
  if(root.ResizeObserver)resize=new root.ResizeObserver(queue);
  if(root.MutationObserver){mutation=new root.MutationObserver(queue);mutation.observe(hero,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});}
  root.addEventListener('resize',queue);root.addEventListener('pageshow',queue);
  document.fonts?.ready?.then(queue);document.fonts?.addEventListener?.('loadingdone',queue);
  queue();
 }
 root.CoopHeroLayout=Object.freeze({refresh:queue,version:'1.0.0'});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
