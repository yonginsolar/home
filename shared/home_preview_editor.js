/* Visual editing is confined to a same-cooperative parent iframe. No persistence. */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).get('home_preview')!=='1'||window.parent===window) return;
  const areas=['hero','about','impact','progress','portfolio','status','activities','partners','history','faq','contact','documents','calculator','ops-system','game-hall'];
  let parentOrigin='',draft={};
  function imageUrl(value){
    const url=String(value||'');
    if(!url.trim())return '';
    if(/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url))return url;
    try{const parsed=new URL(url,location.href);return ['https:','http:'].includes(parsed.protocol)?parsed.href:'';}catch(_){return '';}
  }
  function refresh(){
    if(window.CoopSiteInline?.isEditing('about')||window.CoopSiteInline?.isEditing('activities'))return;
    if(Array.isArray(draft.sections)){
      applyPublicSectionOrder(draft.sections);
      for(const row of draft.sections){
        if(!areas.includes(row?.id)||typeof row.is_visible!=='boolean')continue;
        const section=document.getElementById(row.id);
        if(section){if(row.is_visible)section.style.removeProperty('display');else section.style.setProperty('display','none','important');}
        if(typeof publicHiddenSectionIds!=='undefined'){
          if(row.is_visible)publicHiddenSectionIds.delete(row.id);else publicHiddenSectionIds.add(row.id);
        }
      }
      window.syncPublicSectionLinks?.();
    }
    if(draft.about && typeof renderPublicAbout==='function')renderPublicAbout({...draft.about,image_url:imageUrl(draft.about.image_url)});
    if(Array.isArray(draft.certifications) && typeof renderPublicCertifications==='function')renderPublicCertifications(draft.certifications.map(row=>({...row,image_url:imageUrl(row.image_url)})));
    const container=document.getElementById('activities-container');
    if(container && (draft.activity || document.getElementById('home-preview-activity-article')) && typeof renderActivityCards==='function')renderActivityCards(g_activity_list);
    window.AOS?.refreshHard?.();
  }
  function finishActivities(container){
    if(container){
      const previousId=document.getElementById('home-preview-activity-article')?.dataset.activityId;
      document.getElementById('home-preview-activity-article')?.remove();
      if(draft.activity){
        const article=document.createElement('article');article.id='home-preview-activity-article';article.className='activity-detail-content home-preview-article';
        article.dataset.activityId=draft.activity.id;
        const title=document.createElement('h3');title.textContent=String(draft.activity.title||'');
        const date=document.createElement('p');date.textContent=[draft.activity.event_date,draft.activity.is_current?'':'비공개'].filter(Boolean).join(' · ');
        const content=document.createElement('div');content.id='home-preview-activity-body';content.innerHTML=sanitizeHtml(String(draft.activity.content||''));
        article.append(title,date);
        const url=imageUrl(draft.activity.file_url);
        if(url){const img=document.createElement('img');img.src=url;img.alt='';img.style.cssText='max-width:100%;max-height:320px;object-fit:contain;margin-bottom:20px';article.append(img);}
        article.append(content);container.after(article);
        if(previousId!==draft.activity.id)article.scrollIntoView?.({block:'start'});
      }
    }
  }
  function navigate(area){
    const target=area==='certifications'?'public-site-certifications':area==='design'||area==='fonts'?'hero':area==='external-news'?'activities':area;
    if(!areas.includes(target)&&target!=='public-site-certifications')return;
    document.getElementById(target)?.scrollIntoView({block:'start'});
  }
  window.CoopSitePreview=Object.freeze({
    get:key=>draft[key],apply(value){draft=value&&typeof value==='object'?value:{};refresh();},refresh,finishActivities,
    activityRows(rows){
      if(!draft.activity)return rows;
      const filtered=(Array.isArray(rows)?rows:[]).filter(row=>String(row.id)!==draft.activity.id);
      return draft.activity.is_current? [{...draft.activity,file_url:imageUrl(draft.activity.file_url)},...filtered]:filtered;
    }
  });
  window.addEventListener('message',event=>{
    if(event.source!==window.parent) return;
    let url;try{url=new URL(event.origin);}catch(_){return;}
    if(url.protocol!==location.protocol||url.port!==location.port||url.hostname.replace(/^(www|erp)\./,'')!==location.hostname.replace(/^(www|erp)\./,''))return;
    if(event.data?.type==='coop-home-preview-settings'){
      parentOrigin=event.origin;document.documentElement.dataset.homeVisualEdit='true';
    }
    if(parentOrigin===event.origin&&['coop-home-preview-select','coop-home-preview-navigate'].includes(event.data?.type))navigate(event.data.area);
  });
  document.addEventListener('click',event=>{
    if(!parentOrigin)return;
    const legal=event.target.closest('a[href*="privacy"],a[href*="terms"],a[href*="signup"]');
    const certification=event.target.closest('#public-site-certifications,#public-hero-certifications');
    const section=event.target.closest(areas.map(id=>`#${id}`).join(','));
    const area=legal?'legal':certification?'certifications':section?.id;
    if(!area)return;
    event.preventDefault();event.stopImmediatePropagation();
    const message={type:'coop-home-preview-area',area};
    const card=event.target.closest('.activity-card[data-activity-id]');
    if(card){try{message.itemId=decodeURIComponent(card.dataset.activityId);}catch(_){}}
    if(legal)message.legalKind=legal.getAttribute('href').includes('privacy')?'privacy':legal.getAttribute('href').includes('terms')?'terms':'signup_purpose';
    window.parent.postMessage(message,parentOrigin);
  },true);
  const style=document.createElement('style');
  style.textContent=`html[data-home-visual-edit] :is(${areas.map(id=>'#'+id).join(',')}){cursor:pointer} html[data-home-visual-edit] :is(${areas.map(id=>'#'+id).join(',')}):hover{outline:3px solid #2baf84;outline-offset:-3px} html[data-home-preview] [data-aos]{opacity:1!important;transform:none!important} .home-preview-article{flex:0 0 100%;padding:24px;border:1px solid #dbe3e9;border-radius:12px;background:var(--surface-color,#fff);word-break:keep-all;overflow-wrap:break-word}`;
  document.head.append(style);
})();
