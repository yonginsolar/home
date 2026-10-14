/* Bounded visual presentation only. No Auth, HTTP requests, persistence or HTML parsing. */
(function(root){
 'use strict';
 const targets={heroTitle:'#public-hero-title',heroSubtitle:'#public-hero-subtitle',heroButton:'#public-hero-cta',impactTitle:'#public-impact-title',impactDescription:'#public-impact-description',impactKicker:'#public-impact-kicker span',impactButton:'#public-impact-cta',aboutTitle:'#about-title',aboutSubtitle:'#about-subtitle',aboutContent:'#about-content',aboutList:'#about-list',contactPhone:'#public-contact-phone',contactEmail:'#public-contact-email',contactAddress:'#public-contact-address',activityTitle:'#home-preview-activity-article h3',activityContent:'#home-preview-activity-body'};
 let settings=null,index=0;
 function text(key,config){const n=document.querySelector(targets[key]);if(!n)return;n.style.removeProperty('font-size');n.style.removeProperty('text-align');
  if(['left','center','right'].includes(config?.align)){n.style.textAlign=config.align;if(key==='heroButton'){const p=n.parentElement;p.style.justifyContent={left:'flex-start',center:'center',right:'flex-end'}[config.align];}}
  if(['small','large'].includes(config?.size)){const base=parseFloat(root.getComputedStyle(n).fontSize)||16,phone=document.documentElement.clientWidth<768,cap=/Title$/.test(key)?(phone?52:76):(phone?26:40);n.style.fontSize=Math.max(14,Math.min(cap,base*(config.size==='small'?.85:1.2)))+'px';}
 }
 function apply(value,slideIndex=0){settings=value;index=slideIndex;if(!value)return;const o=value.home_display_options||{};for(const key of Object.keys(targets))text(key,o.text?.[key]);
  const slide=value.hero_slides_enabled===true?value.hero_slides?.[slideIndex]:null,p=slide?o.slides?.[slideIndex]||{}:o.hero||{};
  if(slide)for(const key of ['heroTitle','heroSubtitle','heroButton']){text(key,p.text?.[key]);const field={heroTitle:'title',heroSubtitle:'subtitle',heroButton:'button_label'}[key],n=document.querySelector(targets[key]);if(p.text_styles?.[key]&&!n?.classList.contains('home-inline-active'))root.CoopTextStyles?.paint(n,slide[field]||'',p.text_styles[key]);}
  for(const [key,name]of [['heroTitle','title'],['heroSubtitle','subtitle'],['heroButton','button']]){const n=document.querySelector(targets[key]);if(!n)continue;const content=value.hero_content_visible!==false;const v=slide?slide[{title:'title',subtitle:'subtitle',button:'button_label'}[name]]:value[{title:'hero_title',subtitle:'hero_subtitle',button:'hero_cta_label'}[name]];n.hidden=!content||p[name+'_visible']===false||!String(v||'').trim()||(name==='button'&&!(slide?.button_url||value.hero_cta_url));}
  const hero=document.getElementById('hero');if(hero){if(Number.isFinite(p.image_x)&&Number.isFinite(p.image_y))hero.style.setProperty('--hero-background-position',p.image_x+'% '+p.image_y+'%');hero.style.setProperty('--hero-mobile-fit',p.mobile_fit==='cover'?'cover':'contain');hero.style.setProperty('--hero-mobile-position',{center:'center',top:'center top',bottom:'center bottom',left:'left center',right:'right center'}[p.mobile_position]||'center');}
 }
 root.CoopHomeDisplay=Object.freeze({apply,targets});root.addEventListener('resize',()=>{if(settings)apply(settings,index);});
})(window);
