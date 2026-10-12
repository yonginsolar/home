/* Version 1.0.1 — Private copies use the event folder and caller's checked uploads. */
(function(root){
 'use strict';
 const suffixes={small:'.thumb.webp',large:'.screen.webp'},pending=new WeakMap();
 function path(original,size='large'){
  const p=String(original||'');
  if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/photo\/.+$/i.test(p)||p.split('/').some(n=>n==='..'||n==='.')||/[\u0000-\u001f?#\\]/.test(p))throw Error('PHOTO_PATH_INVALID');
  return p+suffixes[size==='small'?'small':'large'];
 }
 function paths(original){return [path(original,'small'),path(original,'large')];}
 async function linkedPath(coopId,eventId,value){
  const u=new URL(String(value||''));
  if(u.protocol!=='https:'||u.hostname!=='wmynvcuedusjnufmhdqv.supabase.co'||u.username||u.password||u.search||u.hash||!/^\/storage\/v1\/object\/public\/archive-media\/[0-9a-f-]{36}\/[^/]+\.(?:jpe?g|png|webp)$/i.test(u.pathname))throw Error('PHOTO_LINKED_SOURCE_INVALID');
  const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(u.href));
  const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const original=String(coopId||'')+'/'+String(eventId||'')+'/photo/linked-'+id+'.jpg';path(original);return original;
 }
 function external(value,size='large'){
  const raw=String(value||'');if(!raw)return '';
  const display=root.CoopDisplayImages?.display(raw,size)||raw;
  // Only registered public display copies may load automatically; other originals require a click.
  if(display!==raw||/\.screen\.webp(?:\?|$)/.test(display)||/\/assets\/image-display\/[a-f0-9]{24}-(640|1600)\.webp$/.test(display))return display;
  return '';
 }
 async function make(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type||'')||file.size>20971520)throw Error('PHOTO_FORMAT_INVALID');
  let image,objectUrl;
  try{
   if(root.createImageBitmap)image=await root.createImageBitmap(file,{imageOrientation:'from-image'});
   else{objectUrl=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('PHOTO_DECODE_FAILED'));i.src=objectUrl;});}
   const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
   if(!width||!height||width*height>50000000)throw Error('PHOTO_DIMENSION_LIMIT');
   const copies={};
   for(const [size,limit] of [['small',640],['large',1600]]){
    const ratio=Math.min(1,limit/Math.max(width,height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    const context=canvas.getContext('2d');if(!context)throw Error('PHOTO_CANVAS_UNAVAILABLE');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',size==='small'?0.80:0.86));
    if(!blob||blob.type!=='image/webp'||blob.size>20971520)throw Error('PHOTO_DISPLAY_FAILED');
    copies[size]=new File([blob],'photo-display.webp',{type:'image/webp'});
   }
   return copies;
  }finally{image?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
 }
 async function uploadCopies(client,original,file,canContinue=()=>true,needed=['small','large']){
  const copies=await make(file),bucket=client.storage.from('participation-files');
  for(const size of needed){
   if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
   const result=await bucket.upload(path(original,size),copies[size],{upsert:false,contentType:'image/webp',cacheControl:'3600'});
   if(result.error){
    // A concurrent creator may have completed the same immutable display copy.
    const verify=await bucket.createSignedUrl(path(original,size),600);
    if(verify.error||!verify.data?.signedUrl)throw Error('PHOTO_DISPLAY_UPLOAD_FAILED');
   }
  }
  return {ready:true};
 }
 function missing(error){return /object not found|not_found/i.test(String(error?.message||error?.code||''));}
 async function ensure(client,original,canContinue=()=>true){
  path(original);let cache=pending.get(client);if(!cache){cache=new Map();pending.set(client,cache);}
  if(cache.has(original))return cache.get(original);
  const request=(async()=>{
   const bucket=client.storage.from('participation-files'),needed=[];
   for(const size of ['small','large']){
    if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
    const result=await bucket.createSignedUrl(path(original,size),600);
    if(result.error||!result.data?.signedUrl){if(!missing(result.error))throw Error('PHOTO_DISPLAY_LOOKUP_FAILED');needed.push(size);}
   }
   if(!needed.length)return {ready:true,reused:true};
   if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
   const result=await bucket.download(original);
   if(result.error||!result.data)throw Error('PHOTO_ORIGINAL_ACCESS_FAILED');
   if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
   return uploadCopies(client,original,result.data,canContinue,needed);
  })();
  cache.set(original,request);try{return await request;}finally{if(cache.get(original)===request)cache.delete(original);}
 }
 async function ensureLinked(client,coopId,eventId,url,canContinue=()=>true){
  const original=await linkedPath(coopId,eventId,url);let cache=pending.get(client);if(!cache){cache=new Map();pending.set(client,cache);}
  if(cache.has(original))return cache.get(original);
  const request=(async()=>{
   const bucket=client.storage.from('participation-files'),needed=[];
   for(const size of ['small','large']){
    if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
    const result=await bucket.createSignedUrl(path(original,size),600);
    if(result.error||!result.data?.signedUrl){if(!missing(result.error))throw Error('PHOTO_DISPLAY_LOOKUP_FAILED');needed.push(size);}
   }
   if(!needed.length)return {ready:true,reused:true,original};
   if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');
   const response=await root.fetch(url,{credentials:'omit',redirect:'error'});
   if(!response.ok||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('PHOTO_LINKED_SOURCE_FAILED');
   if(Number(response.headers.get('Content-Length'))>20971520)throw Error('PHOTO_FORMAT_INVALID');
   const reader=response.body.getReader(),chunks=[];let bytes=0;
   try{for(;;){if(!canContinue())throw Error('PHOTO_REQUEST_CANCELLED');const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>20971520)throw Error('PHOTO_FORMAT_INVALID');chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   const file=new Blob(chunks,{type:response.headers.get('Content-Type').split(';')[0].toLowerCase()});
   await uploadCopies(client,original,file,canContinue,needed);return {ready:true,original};
  })();
  cache.set(original,request);try{return await request;}finally{if(cache.get(original)===request)cache.delete(original);}
 }
 async function mapLimit(items,worker,limit=2){
  const out=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await worker(items[i],i);}}));
  return out;
 }
 root.CoopParticipationImages=Object.freeze({path,paths,linkedPath,external,make,uploadCopies,ensure,ensureLinked,mapLimit,version:'1.0.1'});
})(window);
