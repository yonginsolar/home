/* Scroll boundary v1.0.0. No Auth, network, persistence, input edits or page reloads. */
(function(root){
 'use strict';
 if(root.CoopScrollBoundary)return;
 const doc=root.document,style=doc.createElement('style');
 style.id='coop-scroll-boundary';
 style.textContent='html,body{overscroll-behavior-y:none}';
 doc.head.append(style);
 let gesture=null;
 function editable(node){return !!node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[data-scroll-boundary-native]');}
 function clear(){gesture=null;}
 doc.addEventListener('touchstart',event=>{
  gesture=null;
  if(event.touches.length!==1||editable(event.target)||!root.getSelection?.()?.isCollapsed)return;
  const t=event.touches[0];gesture={id:t.identifier,x:t.clientX,y:t.clientY,target:event.target};
 },{passive:true,capture:true});
 doc.addEventListener('touchmove',event=>{
  const g=gesture;
  if(!g||event.touches.length!==1){gesture=null;return;}
  const t=event.touches[0];
  if(t.identifier!==g.id||editable(event.target)||!root.getSelection?.()?.isCollapsed)return;
  const dx=t.clientX-g.x,dy=t.clientY-g.y;
  // Only the downward vertical boundary gesture is cancelled. Upward scrolling,
  // horizontal photo swipes, pinch zoom, text selection and native inputs stay native.
  if(dy<=0||dy<=Math.abs(dx)*1.2||!event.cancelable)return;
  const scrolling=doc.scrollingElement||doc.documentElement;
  if(Math.max(scrolling.scrollTop,root.scrollY||0)>1)return;
  let node=g.target?.nodeType===1?g.target:g.target?.parentElement;
  while(node&&node!==scrolling&&node!==doc.body&&node!==doc.documentElement){
   if(node.scrollTop>1&&node.scrollHeight>node.clientHeight+1&&/^(auto|scroll|overlay)$/.test(root.getComputedStyle(node).overflowY))return;
   node=node.parentElement;
  }
  event.preventDefault();
 },{passive:false,capture:true});
 doc.addEventListener('touchend',clear,{passive:true,capture:true});
 doc.addEventListener('touchcancel',clear,{passive:true,capture:true});
 root.addEventListener('pagehide',clear);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clear();});
 root.CoopScrollBoundary=Object.freeze({version:'1.0.0'});
})(window);
