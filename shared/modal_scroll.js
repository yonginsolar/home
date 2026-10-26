/* Modal scroll v1.0.0. Geometry only: no focus, input, Auth, network or persistence changes. */
(function(root){'use strict';
 if(root.CoopModalScroll)return;
 const doc=root.document,selector='.modal.show,dialog[open],[role="dialog"],.modal-overlay,.custom-modal-overlay,.center-modal,.modal-backdrop';
 const repaired=new Map(),fileRooms=new Set();let queued=false,reset=false;
 const sheet=doc.createElement('style');sheet.textContent=`
 .coop-scroll-repaired{overflow-y:auto!important}
 .coop-scroll-repaired .modal-content,.coop-scroll-repaired .coop-scroll-card,dialog.coop-scroll-repaired{
  box-sizing:border-box;max-height:calc(100vh - 16px)!important;max-height:calc(100dvh - 16px)!important;overflow-y:auto!important;display:block!important}
 .coop-scroll-repaired .modal-content>form,.coop-scroll-repaired .coop-scroll-card>form{display:block!important;min-height:0!important;overflow:visible!important}
 .coop-scroll-repaired .modal-body{height:auto!important;max-height:none!important;overflow-y:visible!important;flex:none!important}
 .coop-scroll-repaired .modal-body>.sticky-top{position:static!important}
 .coop-file-room[type="file"]{height:auto!important;min-height:calc(1.5em + .75rem + 2px)!important}
 `;doc.head.append(sheet);
 function visible(e){const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&s.display!=='none'&&s.visibility!=='hidden'&&e.getAttribute('aria-hidden')!=='true';}
 function clear(e){const card=repaired.get(e);e.classList.remove('coop-scroll-repaired');card?.classList.remove('coop-scroll-card');repaired.delete(e);}
 function scan(){queued=false;
  for(const e of repaired.keys())if(reset||!e.isConnected||!visible(e))clear(e);
  for(const e of fileRooms)if(reset||!e.isConnected||!e.getBoundingClientRect().height){e.classList.remove('coop-file-room');fileRooms.delete(e);}reset=false;
  for(const e of doc.querySelectorAll(selector)){
   if(!visible(e)||e.closest('.participation-image-lightbox')||e.matches('.modal-backdrop')&&!e.children.length)continue;
   for(const input of e.querySelectorAll('input[type="file"]'))if(input.clientHeight>0&&input.scrollHeight>input.clientHeight+4){input.classList.add('coop-file-room');fileRooms.add(input);}
   if(repaired.has(e))continue;
   if(e.closest('.coop-scroll-repaired'))continue;
   const card=e.querySelector('.modal-content')||e.firstElementChild||e;
   const nodes=[e,card,...e.querySelectorAll('.modal-body,.modal-content>form')];
   const clipped=nodes.some(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+4&&/^(hidden|clip)$/.test(getComputedStyle(n).overflowY))||
    [...e.querySelectorAll('.modal-body')].some(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+4&&[...n.children].some(c=>getComputedStyle(c).position==='sticky'&&c.getBoundingClientRect().height>=n.clientHeight-4));
   if(clipped){if(card!==e)card.classList.add('coop-scroll-card');repaired.set(e,card===e?null:card);e.classList.add('coop-scroll-repaired');}
  }
 }
 function schedule(){if(queued)return;queued=true;root.requestAnimationFrame(scan);}
 function start(){
  new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.oldValue!==r.target.getAttribute(r.attributeName)))schedule();})
   .observe(doc.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
  for(const event of ['shown.bs.modal','hidden.bs.modal','close'])doc.addEventListener(event,schedule,true);
  root.addEventListener('resize',()=>{reset=true;schedule();});schedule();
 }
 root.CoopModalScroll=Object.freeze({version:'1.0.0',refresh:schedule});
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
