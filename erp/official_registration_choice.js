/* 임원·위원회 등록 방법 선택 1.0.0. 기존 등록 화면을 여는 역할만 담당한다. */
((root) => {
  'use strict';
  function create({dialog,getContext,openWorkbook}) {
    const doc=dialog.ownerDocument;
    const individual=dialog.querySelector('[data-choice="individual"]');
    const excel=dialog.querySelector('[data-choice="excel"]');
    const dismiss=dialog.querySelector('[data-choice="close"]');
    let intent=null;
    const visible=node=>!!node?.isConnected&&!node.disabled&&!node.closest('[hidden],[inert],.d-none')&&node.getClientRects().length>0;
    const available=()=>!root.frameElement?.hidden;
    function current(action){
      const ctx=action&&getContext(action.area);
      return available()&&!!ctx&&ctx.key===action.key&&visible(action.trigger)?ctx:null;
    }
    function close(restore=false){
      const action=intent, wasInside=dialog.contains(doc.activeElement);
      intent=null;
      if(dialog.open)dialog.close();
      if(restore&&wasInside&&current(action)){
        const active=doc.activeElement;
        if(active===doc.body||active===action.trigger||dialog.contains(active))action.trigger.focus({preventScroll:true});
      }
    }
    function choose(useExcel){
      const action=intent, context=current(action);
      if(!dialog.open||!context||useExcel&&!context.excel){close(false);return;}
      close(true);
      if(useExcel)openWorkbook(action.trigger);else action.openIndividual();
    }
    individual.addEventListener('click',()=>choose(false));
    excel.addEventListener('click',()=>choose(true));
    dismiss.addEventListener('click',()=>close(true));
    dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
    dialog.addEventListener('keydown',event=>{
      if(!dialog.open||event.defaultPrevented||event.isComposing||event.keyCode===229)return;
      if(event.repeat&&(event.key==='Enter'||event.key===' ')){event.preventDefault();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
      if(event.key!=='Tab'||event.ctrlKey||event.metaKey||event.altKey)return;
      event.preventDefault();event.stopPropagation();
      const options=[dismiss,individual,excel].filter(node=>!node.hidden&&!node.disabled);
      const i=options.indexOf(doc.activeElement);
      options[i<0?event.shiftKey?options.length-1:0:(i+(event.shiftKey?-1:1)+options.length)%options.length]?.focus();
    });
    root.addEventListener('pagehide',()=>close(false));
    root.addEventListener('popstate',()=>close(false));
    if(root.frameElement){
      new root.MutationObserver(()=>{if(!available())close(false);}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
    }
    return {pause:()=>close(false),open(trigger,area,openIndividual){
      if(!available()||!visible(trigger)||dialog.open||doc.querySelector('dialog[open],.modal.show,.overlay-backdrop:not(.d-none),.committee-overlay:not([hidden])'))return false;
      const ctx=getContext(area);
      if(!ctx)return false;
      if(typeof dialog.showModal!=='function'){openIndividual();return true;}
      intent={key:ctx.key,trigger,area,openIndividual};
      excel.hidden=!ctx.excel;
      // Record the visible origin even for browsers that don't focus a clicked button.
      trigger.focus({preventScroll:true});
      dialog.showModal();
      individual.focus({preventScroll:true});
      return true;
    }};
  }
  root.OfficialRegistrationChoice=Object.freeze({create});
})(window);
