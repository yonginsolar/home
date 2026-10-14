/* Optional banners: selected display image only, no Auth/DB writes or original fetch. */
(function(root){
 'use strict';
 let settings=null,slides=[],current=0,timer=null,signature='',hero,controls,link,manualPause=false,hover=false,transition,painted='',imageTicket=0;
 const preview=new URLSearchParams(location.search).get('home_preview')==='1';
 const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 function safeLink(value){const v=String(value||'').trim();if(!v||/[\x00-\x20<>"'\\]/.test(v)||/^\/\//.test(v))return '';if(/^#[A-Za-z0-9_-]+$/.test(v)||/^\/[^/]/.test(v))return v;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?v:'';}catch(_){return '';}}
 function image(value){const v=String(value||'');if(preview&&/^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(v))return v;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?(root.CoopDisplayImages?.display(v)||v):'';}catch(_){return '';}}
 function stop(){if(timer)clearTimeout(timer);timer=null;}
 function start(){stop();if(slides.length>1&&settings.hero_autoplay!==false&&!manualPause&&!hover&&!document.hidden&&!hero.contains(document.activeElement)&&!preview)timer=setTimeout(()=>choose((current+1)%slides.length),8000);}
 function linked(value,title){const href=safeLink(value);link.hidden=preview||!href;hero.classList.toggle('is-hero-linked',!link.hidden);if(href){link.href=href;link.setAttribute('aria-label',title?title+' · 자세히 보기':'배너 안내 페이지로 이동');}else link.removeAttribute('href');}
 function caption(node,value){if(!node)return;node.textContent=String(value||'');node.hidden=!node.textContent.trim();}
 function choose(index){
  if(!hero||!slides.length)return;current=Math.max(0,Math.min(slides.length-1,index));const s=slides[current],url=image(s.image_url);
  const ticket=++imageTicket,old=painted;stop();
  const paint=()=>{if(ticket!==imageTicket||slides[current]!==s)return;
  if(url){if(old&&old!==url&&!reduced?.matches){transition.style.backgroundImage=`url(${JSON.stringify(old)})`;transition.style.opacity='1';transition.style.backgroundPosition=hero.style.getPropertyValue('--hero-background-position')||'center';requestAnimationFrame(()=>requestAnimationFrame(()=>{if(ticket===imageTicket)transition.style.opacity='0';}));}hero.style.setProperty('--hero-background-image',`url(${JSON.stringify(url)})`);painted=url;}
  hero.style.setProperty('--hero-background-position',s.image_position||'center');hero.style.setProperty('--hero-overlay-opacity',String(Number(s.overlay??35)/100));hero.style.setProperty('--hero-text-align',s.text_align||'center');hero.style.setProperty('--hero-content-align',{top:'flex-start',center:'center',bottom:'flex-end'}[s.text_position]||'center');
  caption(document.getElementById('public-hero-title'),s.title);caption(document.getElementById('public-hero-subtitle'),s.subtitle);
  const button=document.getElementById('public-hero-cta'),buttonHref=safeLink(s.button_url);caption(button,s.button_label);if(buttonHref)button.href=buttonHref;else button.removeAttribute('href');button.hidden=!String(s.button_label||'').trim()||!buttonHref;
  const content=hero.querySelector(':scope > .container');if(content)content.hidden=settings.hero_content_visible===false||![s.title,s.subtitle,s.button_label&&buttonHref].some(v=>String(v||'').trim());
  linked(s.link_url,s.title||settings.coop_name);for(const b of controls.querySelectorAll('[data-banner-index]')){const active=Number(b.dataset.bannerIndex)===current;b.setAttribute('aria-current',String(active));b.classList.toggle('active',active);}
  const status=controls.querySelector('[data-banner-count]');status.textContent=(current+1)+' / '+slides.length;
  const play=controls.querySelector('[data-banner-play]');play.textContent=manualPause||settings.hero_autoplay===false?'재생':'정지';play.setAttribute('aria-label',manualPause||settings.hero_autoplay===false?'배너 자동 재생':'배너 자동 재생 정지');start();};
  if(url&&url!==painted){const img=new Image();img.onload=paint;img.onerror=()=>{if(ticket!==imageTicket)return;controls.querySelector('[data-banner-count]').textContent='사진을 불러오지 못했습니다.';start();};img.src=url;}else paint();
 }
 function mount(){
  hero=document.getElementById('hero');if(!hero||controls)return;
  transition=document.createElement('div');transition.className='hero-banner-transition';transition.setAttribute('aria-hidden','true');hero.append(transition);
  link=document.createElement('a');link.className='hero-banner-link';link.hidden=true;link.id='hero-banner-link';hero.append(link);
  controls=document.createElement('div');controls.className='hero-banner-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','메인 배너 사진');controls.hidden=true;hero.append(controls);
  for(const [name,text,action] of [['previous','이전 사진',()=>choose((current+slides.length-1)%slides.length)],['next','다음 사진',()=>choose((current+1)%slides.length)],['play','정지',()=>{manualPause=!manualPause;if(settings.hero_autoplay===false){settings={...settings,hero_autoplay:true};manualPause=false;}choose(current);}]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset['banner'+name[0].toUpperCase()+name.slice(1)]='';b.onclick=action;controls.append(b);}
  const count=document.createElement('span');count.dataset.bannerCount='';count.setAttribute('aria-live','off');controls.append(count);
  hero.addEventListener('pointerenter',()=>{hover=true;stop();});hero.addEventListener('pointerleave',()=>{hover=false;start();});hero.addEventListener('focusin',stop);hero.addEventListener('focusout',()=>{if(!hero.contains(document.activeElement))start();});document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  reduced?.addEventListener?.('change',event=>{if(event.matches){manualPause=true;stop();if(slides.length)choose(current);}});
 }
 function apply(value){
  mount();if(!hero||!value||typeof value!=='object')return;
  const next=JSON.stringify([value.hero_slides_enabled,value.hero_slides,value.hero_autoplay,value.hero_content_visible,value.hero_banner_link,value.coop_name]);
  settings=value;if(next===signature){if(slides.length)choose(current);else linked(value.hero_banner_link,value.hero_title||value.coop_name);return;}signature=next;stop();
  slides=value.hero_slides_enabled===true&&Array.isArray(value.hero_slides)?value.hero_slides.filter(s=>s&&image(s.image_url)).slice(0,4):[];hero.classList.toggle('is-slider-banner',slides.length>0);controls.hidden=slides.length<2;
  controls.querySelectorAll('[data-banner-index]').forEach(n=>n.remove());
  slides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.dataset.bannerIndex=String(i);b.textContent=String(i+1);b.setAttribute('aria-label',(i+1)+'번째 배너 사진');b.onclick=()=>choose(i);controls.append(b);});
  manualPause=reduced?.matches===true;current=Math.min(current,Math.max(0,slides.length-1));
  if(slides.length)choose(current);else{imageTicket++;painted='';transition.style.opacity='0';hero.style.removeProperty('--hero-content-align');linked(value.hero_banner_link,value.hero_title||value.coop_name);}
 }
 root.CoopHeroBanner=Object.freeze({apply,version:'1.0.0'});
 if(root.__COOP_HERO_PENDING__){const pending=root.__COOP_HERO_PENDING__;delete root.__COOP_HERO_PENDING__;apply(pending);}
})(window);
