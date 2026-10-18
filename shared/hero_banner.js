/* Optional banners: selected display image only, no Auth/DB writes or original fetch. */
(function(root){
 'use strict';
 let settings=null,slides=[],current=0,timer=null,signature='',hero,controls,link,mobileImage,photoFrame,manualPause=false,hover=false,transition,imageTicket=0;
 let photoStatus,photoText,photoRetry,photoTimer=null,photoURL='',photoState='idle',linkURL='',linkTitle='';
 let gesture=null,suppressClickUntil=0;
 const preview=new URLSearchParams(location.search).get('home_preview')==='1';
 const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 const phone=root.matchMedia?.('(max-width:767.98px)');
 function safeLink(value){const v=String(value||'').trim();if(!v||/[\x00-\x20<>"'\\]/.test(v)||/^\/\//.test(v))return '';if(/^#[A-Za-z0-9_-]+$/.test(v)||/^\/[^/]/.test(v))return v;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?v:'';}catch(_){return '';}}
 function image(value){const v=String(value||'');if(preview&&/^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(v))return v;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?(root.CoopDisplayImages?.display(v)||v):'';}catch(_){return '';}}
 function stop(){if(timer)clearTimeout(timer);timer=null;}
 function start(){stop();if(slides.length>1&&photoState!=='loading'&&settings.hero_autoplay!==false&&!manualPause&&!hover&&!document.hidden&&!hero.contains(document.activeElement)&&!preview)timer=setTimeout(()=>choose((current+1)%slides.length),8000);}
 function linked(value,title){const href=safeLink(value);linkURL=href;linkTitle=String(title||'');link.hidden=preview||!href||['loading','error'].includes(photoState);hero.classList.toggle('is-hero-linked',!link.hidden);if(href){link.href=href;link.setAttribute('aria-label',title?title+' · 자세히 보기':'배너 안내 페이지로 이동');}else link.removeAttribute('href');}
 function caption(node,value){if(!node)return;node.textContent=String(value||'');node.hidden=!node.textContent.trim();}
 function selectedImage(s){const p=slides.length?settings?.home_display_options?.slides?.[current]:settings?.home_display_options?.hero;return image(phone?.matches&&p?.mobile_image_source!=='desktop'&&s?.mobile_image_url?s.mobile_image_url:s?.image_url);}
 function showPhoto(url,force=false){
  if(!force&&photoURL===url)return;
  if(photoTimer)clearTimeout(photoTimer);photoTimer=null;const ticket=++imageTicket;photoURL=url;photoState=url?'loading':'idle';
  hero.classList.toggle('has-mobile-image',!!url);photoFrame.hidden=!url;mobileImage.hidden=true;mobileImage.removeAttribute('src');photoStatus.hidden=!url;photoRetry.hidden=true;photoText.textContent=url?'사진을 불러오는 중입니다…':'';linked(linkURL,linkTitle);
  if(!url)return;
  const finish=ok=>{if(ticket!==imageTicket||photoState!=='loading')return;if(photoTimer)clearTimeout(photoTimer);photoTimer=null;photoState=ok?'ready':'error';photoStatus.hidden=ok;photoRetry.hidden=ok;photoText.textContent=ok?'':'사진을 불러오지 못했습니다.';if(ok){mobileImage.src=url;mobileImage.hidden=false;}linked(linkURL,linkTitle);root.AOS?.refresh?.();start();};
  photoTimer=setTimeout(()=>finish(false),15000);const probe=new Image();probe.onload=()=>finish(true);probe.onerror=()=>finish(false);probe.src=url;
 }
 function choose(index){
  if(!hero||!slides.length)return;current=Math.max(0,Math.min(slides.length-1,index));const s=slides[current],url=selectedImage(s);
  stop();transition.style.opacity='0';if(url)hero.style.setProperty('--hero-background-image',`url(${JSON.stringify(url)})`);else if(preview)hero.style.setProperty('--hero-background-image','none');
  hero.style.setProperty('--hero-background-position',s.image_position||'center');hero.style.setProperty('--hero-overlay-opacity',String(Number(s.overlay??35)/100));hero.style.setProperty('--hero-text-align',s.text_align||'center');hero.style.setProperty('--hero-content-align',{top:'flex-start',center:'center',bottom:'flex-end'}[s.text_position]||'center');
  caption(document.getElementById('public-hero-title'),s.title);caption(document.getElementById('public-hero-subtitle'),s.subtitle);
  const button=document.getElementById('public-hero-cta'),buttonHref=safeLink(s.button_url);caption(button,s.button_label);if(buttonHref)button.href=buttonHref;else button.removeAttribute('href');button.hidden=!String(s.button_label||'').trim()||!buttonHref;
  const content=hero.querySelector(':scope > .container');if(content)content.hidden=settings.hero_content_visible===false||![s.title,s.subtitle,s.button_label&&buttonHref].some(v=>String(v||'').trim());
  showPhoto(url);root.CoopHomeDisplay?.apply(settings,current);linked(s.link_url,s.title||settings.coop_name);for(const b of controls.querySelectorAll('[data-banner-index]')){const active=Number(b.dataset.bannerIndex)===current;b.setAttribute('aria-current',String(active));b.classList.toggle('active',active);}
  const status=controls.querySelector('[data-banner-count]');status.textContent=(current+1)+' / '+slides.length;
  const play=controls.querySelector('[data-banner-play]'),paused=manualPause||settings.hero_autoplay===false;play.innerHTML=icon(paused?'play':'pause');play.setAttribute('aria-label',paused?'배너 자동 재생':'배너 자동 재생 정지');play.title=play.getAttribute('aria-label');start();
 }
 function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+({previous:'M14.5 5 7.5 12l7 7',next:'m9.5 5 7 7-7 7',pause:'M8 5v14M16 5v14',play:'m9 5 10 7-10 7Z'}[name])+'" fill="'+(name==='play'?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
 function mount(){
  hero=document.getElementById('hero');if(!hero||controls)return;
  photoFrame=document.createElement('div');photoFrame.className='hero-device-frame';photoFrame.hidden=true;mobileImage=document.createElement('img');mobileImage.className='hero-mobile-image';mobileImage.alt='';mobileImage.setAttribute('aria-hidden','true');mobileImage.decoding='async';mobileImage.onload=()=>root.AOS?.refresh?.();photoFrame.append(mobileImage);hero.prepend(photoFrame);
  photoStatus=document.createElement('div');photoStatus.className='hero-photo-status';photoStatus.hidden=true;photoText=document.createElement('span');photoText.setAttribute('role','status');photoText.setAttribute('aria-live','polite');photoRetry=document.createElement('button');photoRetry.type='button';photoRetry.textContent='다시 불러오기';photoRetry.hidden=true;photoRetry.onclick=event=>{event.preventDefault();event.stopPropagation();const url=slides.length?selectedImage(slides[current]):selectedImage({image_url:settings?.hero_image_url,mobile_image_url:settings?.hero_mobile_image_url});if(photoState==='error'&&url===photoURL){stop();showPhoto(url,true);}};photoStatus.append(photoText,photoRetry);photoFrame.append(photoStatus);
  transition=document.createElement('div');transition.className='hero-banner-transition';transition.setAttribute('aria-hidden','true');hero.append(transition);
  link=document.createElement('a');link.className='hero-banner-link';link.hidden=true;link.id='hero-banner-link';hero.append(link);
  controls=document.createElement('div');controls.className='hero-banner-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','메인 배너 사진');controls.hidden=true;photoFrame.append(controls);
  const pagination=document.createElement('div');pagination.className='hero-banner-pagination';const dots=document.createElement('div');dots.className='hero-banner-dots';pagination.append(dots);
  for(const [name,text,action] of [['previous','이전 사진',()=>choose((current+slides.length-1)%slides.length)],['next','다음 사진',()=>choose((current+1)%slides.length)],['play','배너 자동 재생 정지',()=>{manualPause=!manualPause;if(settings.hero_autoplay===false){settings={...settings,hero_autoplay:true};manualPause=false;}choose(current);}]]){const b=document.createElement('button');b.type='button';b.innerHTML=icon(name==='play'?'pause':name);b.setAttribute('aria-label',text);b.title=text;b.dataset['banner'+name[0].toUpperCase()+name.slice(1)]='';b.onclick=action;(name==='play'?pagination:controls).append(b);}
  const count=document.createElement('span');count.className='hero-banner-sr';count.dataset.bannerCount='';count.setAttribute('aria-live','off');pagination.append(count);controls.append(pagination);
  hero.addEventListener('pointerdown',event=>{
   gesture=null;suppressClickUntil=0;
   if(preview||slides.length<2||event.pointerType!=='touch'||event.isPrimary===false||event.target.closest('button,input,select,textarea,[contenteditable],a:not(.hero-banner-link)'))return;
   const rect=photoFrame.getBoundingClientRect();if(event.clientY<rect.top||event.clientY>rect.bottom)return;
   gesture={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};stop();
  },{passive:true});
  hero.addEventListener('pointerup',event=>{
   const from=gesture;gesture=null;if(!from||from.id!==event.pointerId)return;
   const dx=event.clientX-from.x,dy=event.clientY-from.y;
   if(!preview&&slides.length>1&&performance.now()-from.time<1000&&Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil=performance.now()+400;choose((current+(dx<0?1:slides.length-1))%slides.length);}else start();
  },{passive:true});
  hero.addEventListener('pointercancel',()=>{gesture=null;start();},{passive:true});
  hero.addEventListener('click',event=>{if(event.detail>0&&performance.now()<suppressClickUntil){suppressClickUntil=0;event.preventDefault();event.stopPropagation();}},{capture:true});
  hero.addEventListener('pointerenter',()=>{hover=true;stop();});hero.addEventListener('pointerleave',()=>{hover=false;start();});hero.addEventListener('focusin',stop);hero.addEventListener('focusout',()=>{if(!hero.contains(document.activeElement))start();});document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  reduced?.addEventListener?.('change',event=>{if(event.matches){manualPause=true;stop();if(slides.length)choose(current);}});
  phone?.addEventListener?.('change',()=>{if(!settings)return;if(slides.length)choose(current);else showPhoto(selectedImage({image_url:settings.hero_image_url,mobile_image_url:settings.hero_mobile_image_url}));root.AOS?.refresh?.();});
 }
 function apply(value){
  mount();if(!hero||!value||typeof value!=='object')return;
  const next=JSON.stringify([value.hero_slides_enabled,value.hero_slides,value.hero_autoplay,value.hero_content_visible,value.hero_banner_link,value.coop_name,value.hero_text_position,preview?value.mobile_editor?.slideIndex:null,value.home_display_options]);
  settings=value;if(next===signature){if(slides.length)choose(current);else{showPhoto(selectedImage({image_url:value.hero_image_url,mobile_image_url:value.hero_mobile_image_url}));linked(value.hero_banner_link,value.hero_title||value.coop_name);}return;}signature=next;gesture=null;suppressClickUntil=0;stop();
  slides=value.hero_slides_enabled===true&&Array.isArray(value.hero_slides)?value.hero_slides.filter(s=>s&&(preview||image(s.image_url))).slice(0,4):[];hero.classList.toggle('is-slider-banner',slides.length>0);controls.hidden=preview||slides.length<2;
  controls.querySelectorAll('[data-banner-index]').forEach(n=>n.remove());
  slides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.dataset.bannerIndex=String(i);b.setAttribute('aria-label',(i+1)+'번째 배너 사진');b.title=b.getAttribute('aria-label');b.onclick=()=>choose(i);controls.querySelector('.hero-banner-dots').append(b);});
  manualPause=reduced?.matches===true;current=Math.min(preview?Number(value.mobile_editor?.slideIndex)||0:current,Math.max(0,slides.length-1));
  hero.classList.toggle('is-caption-positioned',!slides.length&&['top','bottom'].includes(value.hero_text_position));
  if(slides.length)choose(current);else{transition.style.opacity='0';showPhoto(selectedImage({image_url:value.hero_image_url,mobile_image_url:value.hero_mobile_image_url}));hero.style.setProperty('--hero-content-align',{top:'flex-start',center:'center',bottom:'flex-end'}[value.hero_text_position]||'center');linked(value.hero_banner_link,value.hero_title||value.coop_name);}
 }
 // Text-only descriptors: measuring a slide must never load its picture.
 function captionLayouts(){return slides.length>1?slides.map((s,i)=>({title:String(s.title||''),subtitle:String(s.subtitle||''),button_label:String(s.button_label||''),button_url:safeLink(s.button_url),visible:settings.hero_content_visible!==false,display:settings.home_display_options?.slides?.[i]||{}})):[];}
 root.CoopHeroBanner=Object.freeze({apply,captionLayouts,version:'1.5.0'});
 if(root.__COOP_HERO_PENDING__){const pending=root.__COOP_HERO_PENDING__;delete root.__COOP_HERO_PENDING__;apply(pending);}
})(window);
