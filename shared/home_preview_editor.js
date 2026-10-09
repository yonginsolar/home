(function(){
  'use strict';
  if(new URLSearchParams(location.search).get('home_preview')!=='1'||window.parent===window) return;
  let parentOrigin='';
  window.addEventListener('message',event=>{
    if(event.source!==window.parent) return;
    let url;try{url=new URL(event.origin);}catch(_){return;}
    if(url.protocol!==location.protocol || url.hostname.replace(/^(www|erp)\./,'')!==location.hostname.replace(/^(www|erp)\./,''))return;
    if(event.data?.type==='coop-home-preview-settings') {parentOrigin=event.origin;document.documentElement.dataset.homeVisualEdit='true';}
    if(event.data?.type==='coop-home-preview-select' && parentOrigin===event.origin && ['hero','impact','contact'].includes(event.data.area)) document.getElementById(event.data.area)?.scrollIntoView({block:'start'});
  });
  document.addEventListener('click',event=>{
    if(!parentOrigin)return;
    const section=event.target.closest('#hero,#impact,#contact');if(!section)return;
    event.preventDefault();
    window.parent.postMessage({type:'coop-home-preview-area',area:section.id},parentOrigin);
  },true);
  const style=document.createElement('style');
  style.textContent='html[data-home-visual-edit] :is(#hero,#impact,#contact){cursor:pointer} html[data-home-visual-edit] :is(#hero,#impact,#contact):hover{outline:3px solid #2baf84;outline-offset:-3px} html[data-home-preview] [data-aos]{opacity:1!important;transform:none!important}';
  document.head.append(style);
})();
