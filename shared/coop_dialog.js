/* Cooperative dialogs v1.0.0 | 2026-10-13
 * Text-only, async choices. No Auth, network, storage or native-alert fallback. */
(function (root) {
  'use strict';
  if (root.CoopDialog) return;
  const queue = [];
  let active = null, sequence = 0;
  const cancelled = kind => kind === 'prompt' ? null : kind === 'confirm' ? false : undefined;
  function visible(owner) {
    try {
      let current=owner;
      while (current) {
        if (current.closed) return false;
        const frame=current.frameElement;
        if (!frame) return true;
        if (!frame.isConnected || frame.hidden || frame.closest('[hidden]')) return false;
        current=current.parent;
      }
      return false;
    }
    catch (_) { return false; }
  }
  function host() {
    try { return root.parent !== root && root.parent.location.origin === root.location.origin && root.parent.CoopDialog; }
    catch (_) { return null; }
  }
  function style() {
    if (root.document.getElementById('coop-dialog-style')) return;
    const node = root.document.createElement('style'); node.id = 'coop-dialog-style';
    node.textContent = `
      dialog.coop-dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#172033;box-shadow:0 24px 70px #0f172a40;font:16px/1.65 Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;word-break:keep-all;overflow:auto;color-scheme:light}
      dialog.coop-dialog:not([open]){display:none}dialog.coop-dialog::backdrop{background:#0f172a75}
      .coop-dialog-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;border-bottom:1px solid #e2e8f0}.coop-dialog-heading h2{margin:0;font-family:inherit;font-weight:700;font-size:19px;line-height:1.5}.coop-dialog-close{border:0;background:none;color:inherit;padding:4px 8px;font-family:inherit;font-size:24px;line-height:1;cursor:pointer}
      .coop-dialog-message{margin:0;padding:22px 24px;white-space:pre-wrap;overflow-wrap:break-word}.coop-dialog-input{box-sizing:border-box;display:block;width:calc(100% - 48px);margin:0 24px 20px;padding:11px 12px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#172033;font:inherit}
      .coop-dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;border-top:1px solid #e2e8f0}.coop-dialog-button{border:1px solid #94a3b8;background:#fff;color:#172033;border-radius:8px;padding:9px 20px;font-family:inherit;font-weight:600;font-size:16px;line-height:1.5;cursor:pointer}.coop-dialog-button[data-choice="yes"]{background:#166534;border-color:#166534;color:#fff}.coop-dialog-button:hover{filter:brightness(.95)}.coop-dialog-button:focus-visible,.coop-dialog-close:focus-visible,.coop-dialog-input:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
      dialog.coop-dialog[data-theme="dark"]{background:#172033;color:#f1f5f9;border-color:#475569;color-scheme:dark}dialog.coop-dialog[data-theme="dark"] .coop-dialog-heading,dialog.coop-dialog[data-theme="dark"] .coop-dialog-actions{border-color:#475569}dialog.coop-dialog[data-theme="dark"] .coop-dialog-input,dialog.coop-dialog[data-theme="dark"] .coop-dialog-button{background:#253149;color:#f1f5f9;border-color:#64748b}dialog.coop-dialog[data-theme="dark"] .coop-dialog-button[data-choice="yes"]{background:#166534;color:#fff}
      @media(max-width:480px){.coop-dialog-heading,.coop-dialog-actions{padding:14px 18px}.coop-dialog-message{padding:18px}.coop-dialog-input{width:calc(100% - 36px);margin-left:18px;margin-right:18px}}@media print{dialog.coop-dialog,dialog.coop-dialog::backdrop{display:none!important}}
    `;
    root.document.head.append(node);
  }
  function finish(item, value) {
    if (active !== item || item.done) return;
    if (!visible(item.owner)) value=cancelled(item.kind);
    item.done = true; active = null;
    if (item.dialog?.open) item.dialog.close();
    item.dialog?.remove();
    if (visible(item.owner) && item.focus?.isConnected && !item.focus.disabled) {
      try {
        item.focus.focus({preventScroll:true});
        if (item.range && item.range.startContainer.isConnected && item.range.endContainer.isConnected) {
          const selection = item.owner.getSelection(); selection.removeAllRanges(); selection.addRange(item.range);
        }
      } catch (_) {}
    }
    item.resolve(value);
    root.queueMicrotask(showNext);
  }
  function showNext() {
    if (active || !queue.length) return;
    const item = queue.shift();
    if (!visible(item.owner) || !root.document.body) { item.resolve(cancelled(item.kind)); root.queueMicrotask(showNext); return; }
    active = item;
    try {
      style();
      const doc = root.document, dialog = doc.createElement('dialog'); item.dialog = dialog;
      dialog.className = 'coop-dialog'; dialog.dataset.coopDialog = 'true'; dialog.setAttribute('role','alertdialog');
      const id = 'coop-dialog-' + (++sequence);
      dialog.setAttribute('aria-labelledby',id+'-title');dialog.setAttribute('aria-describedby',id+'-message');
      const erp = root.__COOP_ROUTE_APP__ === 'erp' || !!root.ErpRuntimeGuard || /^\/erp(?:\/|$)/.test(root.location.pathname);
      if (!erp && (doc.documentElement.dataset.theme === 'dark' || doc.body.dataset.theme === 'dark')) dialog.dataset.theme='dark';
      const heading = doc.createElement('div');heading.className='coop-dialog-heading';
      const title = doc.createElement('h2');title.id=id+'-title';title.textContent=item.options.title || (item.kind==='alert'?'안내':item.kind==='prompt'?'입력':'확인');
      const close = doc.createElement('button');close.type='button';close.className='coop-dialog-close';close.setAttribute('aria-label','닫기');close.textContent='×';close.onclick=()=>finish(item,cancelled(item.kind));
      heading.append(title,close);
      const message = doc.createElement('p');message.className='coop-dialog-message';message.id=id+'-message';message.textContent=item.message;
      const actions = doc.createElement('div');actions.className='coop-dialog-actions';
      dialog.append(heading,message);
      let input;
      if (item.kind==='prompt') {
        input=doc.createElement('input');input.type='text';input.className='coop-dialog-input';input.value=item.value;
        input.setAttribute('aria-label',item.options.inputLabel || item.message);input.dataset.erpQueryControl='';
        input.autocomplete='off';input.maxLength=item.options.maxLength || 2000;dialog.append(input);
      }
      const add = (choice,label) => {const button=doc.createElement('button');button.type='button';button.className='coop-dialog-button';button.dataset.choice=choice;button.textContent=label;button.onclick=()=>finish(item,choice==='yes'?(item.kind==='prompt'?input.value:true):cancelled(item.kind));actions.append(button);return button;};
      const cancel = item.kind!=='alert' ? add('no',item.options.cancelText||'취소') : null;
      const accept = add('yes',item.options.confirmText||'확인');dialog.append(actions);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(item,cancelled(item.kind));});
      dialog.addEventListener('close',()=>{if(!item.done)finish(item,cancelled(item.kind));});
      dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&item.kind==='prompt'&&!event.isComposing){event.preventDefault();accept.click();}});
      // A standalone Bootstrap editor's focus trap accepts descendants of its own modal.
      (doc.querySelector('.modal.show')||doc.body).append(dialog);
      dialog.showModal();(input||cancel||accept).focus({preventScroll:true});if(input)input.select();
    } catch (_) { finish(item,cancelled(item.kind)); }
  }
  function localRequest(kind,message,value,options={},owner=root) {
    if (!visible(owner)) return Promise.resolve(cancelled(kind));
    const text=String(message??'');
    if (kind==='alert') {
      const existing=[active,...queue].find(item=>item?.kind===kind&&item.owner===owner&&item.message===text);
      if(existing)return existing.promise;
    }
    if (queue.length>=10) return Promise.resolve(cancelled(kind));
    const item={kind,message:text,value:String(value??''),options:options&&typeof options==='object'?options:{},owner,done:false};
    try {item.focus=owner.document.activeElement;const selection=owner.getSelection();if(selection?.rangeCount)item.range=selection.getRangeAt(0).cloneRange();}catch(_){}
    item.promise=new Promise(resolve=>{item.resolve=resolve;});queue.push(item);showNext();return item.promise;
  }
  function request(kind,message,value,options) {
    const parent=host();return parent?parent.forOwner(root,kind,message,value,options):localRequest(kind,message,value,options);
  }
  function cancelAll(owner) {
    const parent=host();if(parent)return parent.cancelAll(owner||root);
    for(let i=queue.length-1;i>=0;i--)if(!owner||queue[i].owner===owner){const item=queue.splice(i,1)[0];item.resolve(cancelled(item.kind));}
    if(active&&(!owner||active.owner===owner))finish(active,cancelled(active.kind));
  }
  root.CoopDialog=Object.freeze({
    alert:(message,options)=>request('alert',message,'',options),
    confirm:(message,options)=>request('confirm',message,'',options),
    prompt:(message,value='',options)=>request('prompt',message,value,options),
    forOwner:(owner,kind,message,value,options)=>{const up=host();return up?up.forOwner(owner,kind,message,value,options):localRequest(kind,message,value,options,owner);},cancelAll,
    hasPending:()=>!!active||queue.length>0,version:'1.0.0'
  });
  root.addEventListener('pagehide',()=>cancelAll(root));
})(window);
