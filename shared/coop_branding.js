/* v1.0.0 — Public-only branding; never loads a staff record or an original. */
(function(root){
 'use strict';
 let data=null,request=null;
 const style=document.createElement('style');style.textContent='.coop-brand-logo-host{display:inline-flex!important;align-items:center;gap:10px;max-width:100%;min-width:0}.coop-brand-logo-host>img[data-coop-logo]{flex:0 0 auto}.coop-brand-logo-label{min-width:0;word-break:keep-all;overflow-wrap:break-word}@media(max-width:640px){.coop-brand-logo-host>img[data-coop-logo]{max-width:64px!important;height:28px!important}}';document.head.appendChild(style);
 function safe(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='ifdqlwxgqgsvnawmhlfc.supabase.co'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith('/storage/v1/object/public/assets/')?u.href:'';}catch(_){return '';}}
 function apply(value){data=value;const logo=safe(value?.display_url),icon=safe(value?.icon_url);for(const id of ['siteBrandName','erpBrandTitle','footer-coop-name']){const node=document.getElementById(id);if(!node)continue;let image=node.querySelector('[data-coop-logo]');if(!logo){image?.remove();node.classList.remove('coop-brand-logo-host');continue;}if(!image){const label=document.createElement('span');label.className='coop-brand-logo-label';while(node.firstChild)label.append(node.firstChild);image=document.createElement('img');image.dataset.coopLogo='true';image.alt='';image.setAttribute('aria-hidden','true');image.style.cssText='display:inline-block;width:auto;max-width:140px;height:38px;object-fit:contain;vertical-align:middle';node.append(image,label);}node.classList.add('coop-brand-logo-host');image.src=logo;}
  if(icon){let link=document.querySelector('link[data-coop-logo-icon]');if(!link){link=document.createElement('link');link.rel='icon';link.type='image/png';link.sizes='512x512';link.dataset.coopLogoIcon='true';document.head.appendChild(link);}link.href=icon;}
 }
 async function load(){if(request)return request;request=(async()=>{try{const r=await fetch('/coop-branding.json',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(6000)});if(r.ok){const value=await r.json();apply(value);return value;}}catch(_){}return null;})();return request;}
 function ready(){load();const observer=new MutationObserver(changes=>{if(data&&changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===3||n.id==='erpBrandTitle'||n.id==='siteBrandName'||n.id==='footer-coop-name')))apply(data);});observer.observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 root.CoopBranding=Object.freeze({apply,load,safe,version:'1.0.0'});
})(window);
