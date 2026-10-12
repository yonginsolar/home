/* Version 1.0.1 — Public display copies; original requests are user initiated. */
(function(global){
 'use strict';
 const prefix='/storage/v1/object/public/assets/',host='ifdqlwxgqgsvnawmhlfc.supabase.co',suffix='.screen.webp';
 function storageUrl(value){try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname===host&&!u.username&&!u.password&&!u.search&&u.pathname.startsWith(prefix)?u:null;}catch(_){return null;}}
 function original(value){const u=storageUrl(value);if(!u)return String(value||'');if(u.pathname.endsWith(suffix))u.pathname=u.pathname.slice(0,-suffix.length);return u.href;}
 function display(value,size='large'){
  const u=storageUrl(value);if(!u)return String(value||'');
  if(u.pathname.endsWith(suffix))return u.href;
  let name;try{name=decodeURIComponent(u.pathname.slice(prefix.length));}catch(_){return u.href;}
  return global.CoopPublicImageIndex?.[name]?.[size==='small'?'small':'large']||u.href;
 }
 async function prepare(file){
  if(!file||file.size<64000||!/^image\/(png|jpeg|webp)$/.test(file.type||''))return null;
  let bitmap,objectUrl;
  try{
   if(global.createImageBitmap)bitmap=await global.createImageBitmap(file,{imageOrientation:'from-image'});
   else {objectUrl=URL.createObjectURL(file);bitmap=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('IMAGE_DECODE_FAILED'));im.src=objectUrl;});}
   const w=bitmap.width||bitmap.naturalWidth,h=bitmap.height||bitmap.naturalHeight;
   if(!w||!h||w*h>50000000)throw Error('IMAGE_DIMENSION_LIMIT');
   const ratio=Math.min(1,1600/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('IMAGE_CANVAS_UNAVAILABLE');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.86));
   if(!blob||blob.type!=='image/webp'||blob.size>=file.size)return null;
   return new File([blob],String(file.name||'image')+suffix,{type:'image/webp'});
  }finally{bitmap?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
 }
 async function upload(client,file,path){
  // Both files go through checked-upload using the same caller and Storage RLS.
  let variant;try{variant=await prepare(file);}catch(_){variant=null;}
  const bucket=client.storage.from('assets');
  const first=await bucket.upload(path,file,{upsert:false});if(first.error)throw first.error;
  if(variant){try{const second=await bucket.upload(path+suffix,variant,{upsert:false,cacheControl:'31536000'});if(!second.error)return bucket.getPublicUrl(path+suffix).data.publicUrl;}catch(_){/* Original was saved; a display-copy failure must not discard it. */}}
  return bucket.getPublicUrl(path).data.publicUrl;
 }
 function view(value,alt='사진'){
  const source=original(value);if(!storageUrl(source)||new URLSearchParams(global.location?.search||'').get('home_preview')==='1')return;
  const dialog=document.createElement('dialog');dialog.className='coop-image-viewer';dialog.setAttribute('aria-label','사진 크게 보기');
  const header=document.createElement('div'),close=document.createElement('button'),image=document.createElement('img'),link=document.createElement('a');
  close.type='button';close.textContent='닫기';link.textContent='원본 보기';link.href=source;link.target='_blank';link.rel='noopener noreferrer';
  header.append(link,close);image.alt=String(alt||'사진');image.src=display(value,'large');image.decoding='async';dialog.append(header,image);
  document.body.appendChild(dialog);close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{image.removeAttribute('src');dialog.remove();});dialog.showModal();
 }
 function enableImage(image){
  if(!canViewImage(image))return;
  image.dataset.imageViewer='true';image.setAttribute('tabindex','0');image.setAttribute('role','button');image.setAttribute('aria-label',(image.alt||'사진')+' 크게 보기');
 }
 function canViewImage(image){
  if(!storageUrl(image.dataset.originalSrc||'')||image.closest('a,button,[onclick],.partner-logo-renderer')||new URLSearchParams(global.location?.search||'').get('home_preview')==='1'||global.location?.pathname?.startsWith('/erp/'))return false;
  for(let n=image;n&&n!==document.body;n=n.parentElement){if(typeof n.onclick==='function'||(n!==image&&n.getAttribute('role')==='button'))return false;}
  return true;
 }
 if(global.document&&!/^erp\./.test(global.location?.hostname||'')&&!global.location?.pathname?.startsWith('/erp/')&&!global.location?.pathname?.startsWith('/membermanage')&&new URLSearchParams(global.location?.search||'').get('home_preview')!=='1'){
  const style=document.createElement('style');style.textContent='.coop-image-viewer{width:min(94vw,1100px);max-height:94vh;padding:16px;border:0;border-radius:12px;background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#20252a);word-break:keep-all}html[data-theme=dark] .coop-image-viewer{background:#1f2723;color:#f1f5f2}.coop-image-viewer::backdrop{background:#0009}.coop-image-viewer>div{display:flex;justify-content:flex-end;align-items:center;gap:20px;margin-bottom:12px}.coop-image-viewer button{background:#186841;color:#fff;border:0;border-radius:6px;padding:8px 18px}.coop-image-viewer a{color:inherit;text-decoration:underline}.coop-image-viewer img{max-width:100%;max-height:78vh;display:block;margin:auto;object-fit:contain}img[data-image-viewer=true]{cursor:zoom-in}';document.head.appendChild(style);
  document.addEventListener('click',event=>{const im=event.target.closest?.('img[data-image-viewer=true]');if(im&&canViewImage(im)){event.preventDefault();view(im.dataset.originalSrc,im.alt);}});
  document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches?.('img[data-image-viewer=true]')&&canViewImage(event.target)){event.preventDefault();view(event.target.dataset.originalSrc,event.target.alt);}});
  const scan=root=>{if(root.matches?.('img[data-original-src]'))enableImage(root);root.querySelectorAll?.('img[data-original-src]').forEach(enableImage);};
  document.addEventListener('DOMContentLoaded',()=>{scan(document.body);new MutationObserver(changes=>{for(const change of changes){if(change.type==='attributes')enableImage(change.target);else change.addedNodes.forEach(node=>scan(node));}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-original-src']});});
 }
 global.CoopDisplayImages=Object.freeze({display,original,prepare,upload,view,version:'1.0.1'});
})(window);
