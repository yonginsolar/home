/* Public, opt-in presentation only. No new data or image requests on startup. */
(function(root){
 'use strict';
 const doc=root.document, effects=['highlight','sun-glint'];
 let preferences={}, activeZoom=null;
 function el(tag,text){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 function button(text){const n=el('button',text);n.type='button';n.className='btn btn-sm btn-outline-secondary';return n;}
 function apply(settings){
   const next=settings?.home_display_options?.enhancements||{};
   if(next.activity_zoom!==true)closeZoom(false);
   if(JSON.stringify(next.comparison)!==JSON.stringify(preferences.comparison)){
     const host=doc.getElementById('plant-modal-compare');if(host){host.replaceChildren();host.hidden=true;}
   }
   preferences=next;
   if(effects.includes(next.card_effect))doc.body.dataset.homeCardEffect=next.card_effect;
   else delete doc.body.dataset.homeCardEffect;
   const trigger=doc.getElementById('activity-photo-zoom');
   if(trigger)trigger.hidden=next.activity_zoom!==true||!trigger.onclick;
 }
 function closeZoom(restore=true){
   if(!activeZoom)return;const state=activeZoom;activeZoom=null;
   clearTimeout(state.timer);
   state.observer?.disconnect();
   root.removeEventListener('resize',state.resize);
   state.image.removeAttribute('src');state.dialog.close();state.dialog.remove();
   if(restore&&state.trigger.isConnected&&!state.trigger.hidden)state.trigger.focus({preventScroll:true});
 }
 function openZoom(modal,trigger,src,alt){
   if(!src||!modal?.classList.contains('show'))return;
   closeZoom(false);
   const dialog=el('dialog'), bar=el('div'), viewport=el('div'), image=el('img'), status=el('p','사진을 불러오는 중입니다.');
   dialog.className='home-photo-zoom';dialog.setAttribute('aria-label','활동 사진 크게 보기');
   bar.className='home-photo-controls';viewport.className='home-photo-viewport';status.setAttribute('role','status');
   image.alt=alt||'활동 사진';image.hidden=true;
   const minus=button('축소'), plus=button('확대'), exit=button('닫기');let scale=1;
   function fitImage(){
     if(image.hidden||!image.naturalWidth||!image.naturalHeight)return;
     const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;
     const fit=Math.min(width/image.naturalWidth,height/image.naturalHeight,1),
       w=Math.floor(image.naturalWidth*fit*scale),h=Math.floor(image.naturalHeight*fit*scale);
     image.style.width=Math.max(1,w)+'px';image.style.height=Math.max(1,h)+'px';
     image.style.marginBlockStart=Math.max(0,Math.floor((height-h)/2))+'px';
   }
   function zoom(next){scale=Math.max(1,Math.min(3,next));image.style.setProperty('--photo-scale',scale);fitImage();minus.disabled=image.hidden||scale<=1;plus.disabled=image.hidden||scale>=3;}
   minus.onclick=()=>zoom(scale-.5);plus.onclick=()=>zoom(scale+.5);exit.onclick=()=>closeZoom();
   const failed=()=>{if(activeZoom?.dialog!==dialog)return;clearTimeout(activeZoom.timer);image.removeAttribute('src');status.textContent='사진을 불러오지 못했습니다. 닫고 다시 열어 주세요.';};
   image.onload=()=>{if(activeZoom?.dialog!==dialog)return;clearTimeout(activeZoom.timer);image.hidden=false;status.hidden=true;zoom(1);};
   image.onerror=failed;
   dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeZoom();}});
   dialog.addEventListener('cancel',event=>{event.preventDefault();closeZoom();});
   bar.append(minus,plus,exit);viewport.append(image,status);dialog.append(bar,viewport);modal.append(dialog);
   const resize=()=>{if(activeZoom?.dialog===dialog)fitImage();};
   const observer=root.ResizeObserver?new root.ResizeObserver(resize):null;
   activeZoom={dialog,image,trigger,resize,observer,timer:setTimeout(failed,12000)};dialog.showModal();exit.focus();zoom(1);
   observer?.observe(viewport);root.addEventListener('resize',resize);image.src=src;
 }
 function bindActivity(modal,urls,toDisplay){
   closeZoom(false);
   const trigger=doc.getElementById('activity-photo-zoom');if(!trigger||!modal)return;
   if(!modal.dataset.photoZoomBound){modal.addEventListener('hide.bs.modal',()=>closeZoom(false));modal.dataset.photoZoomBound='1';}
   trigger.onclick=urls.length?()=>{
     if(preferences.activity_zoom!==true)return;
     const slides=[...modal.querySelectorAll('#activityDetailCarousel .carousel-item')];
     const incoming=slides.findIndex(n=>n.matches('.carousel-item-next,.carousel-item-prev'));
     const i=incoming>=0?incoming:Math.max(0,slides.findIndex(n=>n.classList.contains('active')));
     const alt=(slides[i]?.querySelector('img')||modal.querySelector('#activityDetailCover'))?.alt;
     openZoom(modal,trigger,toDisplay(urls[i]),alt);
   }:null;
   trigger.hidden=!trigger.onclick||preferences.activity_zoom!==true;
 }
 const publicAssetPrefix='https://ifdqlwxgqgsvnawmhlfc.supabase.co/storage/v1/object/public/assets/site-home/';
 function compareImage(value,coop){
   if(typeof value!=='string')return '';
   if(root.parent!==root&&doc.documentElement.hasAttribute('data-home-preview')&&/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(value))return value;
   const prefix=publicAssetPrefix+coop+'/';
   return /^[0-9a-f-]{36}$/.test(coop)&&value.startsWith(prefix)&&/^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif|avif)(?:\.screen\.webp)?$/i.test(value.slice(prefix.length))?value:'';
 }
 function bindPlant(plant,toDisplay){
   const host=doc.getElementById('plant-modal-compare');if(!host)return;
   const modal=host.closest('.modal');if(modal&&!modal.dataset.comparisonBound){modal.addEventListener('hide.bs.modal',()=>{host.replaceChildren();host.hidden=true;});modal.dataset.comparisonBound='1';}
   host.replaceChildren();host.hidden=true;
   const pair=preferences.comparison?.[0];
   if(plant?.status!=='운영중'||pair?.plant_id!==plant.id)return;
   const before=compareImage(pair.before_url,plant.coop_id), after=compareImage(pair.after_url,plant.coop_id);
   if(!before||!after||before===after)return;
   const opener=button('설치 전·후 사진 비교');host.hidden=false;host.append(opener);
   opener.onclick=()=>{
     if(opener.getAttribute('aria-busy')==='true')return;
     const frame=el('div'), tools=el('div'), slider=el('input'), note=el('p','비교 사진을 불러오는 중입니다.'), first=el('img'),second=el('img'),label=el('label','사진 경계 조절 · 왼쪽 설치 전 / 오른쪽 설치 후');
     frame.className='home-compare-frame';frame.hidden=true;tools.hidden=true;note.setAttribute('role','status');
     slider.id='plant-comparison-position';slider.type='range';slider.min='0';slider.max='100';slider.value='50';label.htmlFor=slider.id;
     slider.addEventListener('input',()=>frame.style.setProperty('--photo-split',slider.value+'%'));
     first.alt='설치 전';second.alt='설치 후';frame.append(second,first);tools.append(label,slider);
     let ready=0,failed=false,timer;
     const failure=()=>{clearTimeout(timer);if(!host.contains(frame)||failed)return;failed=true;first.removeAttribute('src');second.removeAttribute('src');note.textContent='비교 사진을 불러오지 못했습니다. 다시 눌러 확인해 주세요.';opener.removeAttribute('aria-busy');};
     for(const [image,url] of [[first,before],[second,after]]){
       image.onload=()=>{if(!host.contains(frame)||failed)return;if(++ready===2){clearTimeout(timer);frame.hidden=false;tools.hidden=false;note.hidden=true;if(doc.activeElement===opener)slider.focus({preventScroll:true});opener.hidden=true;opener.removeAttribute('aria-busy');}};
       image.onerror=failure;
     }
     opener.setAttribute('aria-busy','true');while(opener.nextSibling)opener.nextSibling.remove();host.append(note,frame,tools);
     timer=setTimeout(failure,12000);
     first.src=before.startsWith('data:')?before:toDisplay(before);second.src=after.startsWith('data:')?after:toDisplay(after);
   };
 }
 root.addEventListener('pagehide',()=>closeZoom(false));
 root.CoopHomeEnhancements=Object.freeze({apply,bindActivity,bindPlant,closeZoom});
 if(root.__COOP_HOME_ENHANCEMENTS_PENDING__){apply({home_display_options:{enhancements:root.__COOP_HOME_ENHANCEMENTS_PENDING__}});delete root.__COOP_HOME_ENHANCEMENTS_PENDING__;}
})(window);
