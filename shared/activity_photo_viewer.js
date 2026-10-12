/* Activity photo viewer 1.0.0. Display-only until an explicit original request. */
(function(root){
 'use strict';let active=null,revision=0;
 function close(){revision++;if(!active)return;const current=active;active=null;current.image.removeAttribute('src');current.dialog.close();current.dialog.remove();current.trigger?.focus?.();}
 async function open(options){
  close();const version=revision,dialog=document.createElement('dialog'),image=document.createElement('img'),bar=document.createElement('div'),original=document.createElement('button'),exit=document.createElement('button');
  dialog.className='activity-photo-viewer';dialog.setAttribute('aria-label','사진 크게 보기');image.alt=options.caption||'활동 사진';original.type=exit.type='button';original.textContent='원본 보기';exit.textContent='닫기';bar.append(original,exit);dialog.append(bar,image);document.body.append(dialog);
  active={dialog,image,trigger:options.trigger};exit.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.showModal();exit.focus();
  const current=()=>revision===version&&active?.dialog===dialog&&options.isCurrent()&&(!root.frameElement||getComputedStyle(root.frameElement).display!=='none');
  original.onclick=async()=>{if(original.disabled||!current())return;const popup=root.open('about:blank','_blank');if(!popup)return;popup.opener=null;original.disabled=true;try{const url=await options.original();if(!current()){popup.close();return;}if(!url)throw Error('PHOTO_ORIGINAL_UNAVAILABLE');popup.location.replace(url);}catch(_){popup.close();if(current())options.onError?.('원본 사진을 열지 못했습니다. 로그인과 열람 권한을 확인해 주세요.');}finally{if(current())original.disabled=false;}};
  try{const url=await options.display();if(!current()){if(active?.dialog===dialog)close();return;}if(url)image.src=url;else{const message=document.createElement('p');message.textContent='미리보기를 불러오지 못했습니다. 원본 보기로 확인해 주세요.';dialog.append(message);}}catch(_){if(current()){const message=document.createElement('p');message.textContent='미리보기를 불러오지 못했습니다. 원본 보기로 확인해 주세요.';dialog.append(message);}}
 }
 const style=document.createElement('style');style.textContent='.activity-photo-viewer{width:min(94vw,1100px);max-height:94vh;padding:16px;border:0;border-radius:12px;background:#fff;color:#20252a;word-break:keep-all}.activity-photo-viewer::backdrop{background:#0009}.activity-photo-viewer>div{display:flex;justify-content:flex-end;gap:12px;margin-bottom:12px}.activity-photo-viewer button{min-height:44px;border:0;border-radius:6px;padding:8px 18px;background:#186841;color:#fff}.activity-photo-viewer img{max-width:100%;max-height:78vh;display:block;margin:auto;object-fit:contain}.activity-photo-viewer img:not([src]){display:none}.activity-photo-preview-button{padding:0;border:0;background:transparent;cursor:zoom-in}.activity-photo-preview-button:focus-visible{outline:3px solid #186841;outline-offset:3px}';document.head.append(style);
 root.addEventListener('pagehide',close);document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
 root.CoopActivityPhotoViewer=Object.freeze({open,close,version:'1.0.0'});
})(window);
