(function(root){
  'use strict';
  function mount({button,kind,capture,same,invoke,append,mayProbe}){
    if(!button||!root.CoopAiEditPanel||!['meeting_materials','meeting_minutes'].includes(kind))return null;
    const doc=button.ownerDocument;
    const key=()=>{const s=capture();return s?JSON.stringify([kind,s.reference,s.actor,s.coop,s.epoch,s.chapter,s.step]):'';};
    const availability=root.CoopAiEditPanel.availability({
      key,mayProbe,probe:signal=>invoke({status:true,scope:kind,reference:capture()?.reference},signal),
      changed(ready){button.hidden=!ready;button.disabled=!ready;if(!ready)panel?.close();}
    });
    const context=()=>{
      const captured=capture();
      return availability.ready()&&captured?{...captured,scope:kind,target:'body',label:'선택한 회의',hasPhoto:false,manualSource:true}:null;
    };
    const sync=()=>availability.sync();
    const panel=root.CoopAiEditPanel.mount({
      context,unchanged:s=>availability.ready()&&same(s),send:invoke,
      preview(option){
        const text=option?.text?.body;
        if(typeof text!=='string'||!text.trim())return null;
        const box=doc.createElement('div');box.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
        box.textContent=text;return box;
      },
      apply(option,s){
        if(!same(s))return false;
        const text=option.text?.body;
        if(typeof text!=='string'||!text.trim()||text.length>4000)return false;
        const nodes=doc.createDocumentFragment();
        for(const block of text.trim().split(/\n\s*\n/)){
          const p=doc.createElement('p');
          for(const [i,line] of block.split('\n').entries()){
            if(i)p.append(doc.createElement('br'));
            p.append(doc.createTextNode(line));
          }
          nodes.append(p);
        }
        return append(nodes,s)===true;
      }
    });
    if(!panel)return null;
    button.onclick=()=>{if(!panel.open('body',button))sync();};
    root.addEventListener('pagehide',()=>availability.hide());
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)availability.hide();else sync();});
    if(root.frameElement)new MutationObserver(()=>{availability.hide();sync();}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
    sync();
    return {sync,close:()=>availability.hide()};
  }
  function invoke(client){
    return async (body,signal)=>{
      const {data,error}=await client.functions.invoke('erp-inline-ai',{body,signal});
      if(!error)return data;
      const failure=await error.context?.json?.().catch(()=>null);
      return {error:failure?.error||'unavailable'};
    };
  }
  root.CoopMeetingAiEditor=Object.freeze({version:'1.0.1',mount,invoke});
})(window);
