/* v1.1.0 — Direct purpose sections; original editors/writers, scoped read-only documents. */
(function(root){
 'use strict';
 function create(options){
  const doc=root.document,dashboard=doc.getElementById('dashboardSection');
  if(!dashboard||dashboard.dataset.purposeMounted)return null;
  const ids=['portalProfileGroup','assetSummaryRow','quickLinksRow','portalApplicationColumn','portalTimelineColumn','portalApplicationsAndHistory','memberBadgeCollectionCard','hallOfFameCard','memberFreeBoardCard','memberFamilyAccountCard'];
  const nodes=Object.fromEntries(ids.map(id=>[id,doc.getElementById(id)]));if(ids.some(id=>!nodes[id]))return null;
  let verified='',selected='summary';const choices=new Map(),panels={},buttons={};
  const names={summary:'요약',funds:'출자·신청',activity:'활동·문서',profile:'내 정보'},icons={summary:'grid',funds:'wallet2',activity:'journal-text',profile:'person'};
  const context=()=>String(options.getContext?.()||''),current=()=>!!verified&&verified===context();
  const element=(tag,className,text)=>{const n=doc.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
  const action=(text,handler,className='btn btn-outline-success')=>{const n=element('button',className,text);n.type='button';n.onclick=handler;return n;};
  const allowed=node=>{if(!node?.isConnected)return false;for(let n=node;n&&n!==dashboard;n=n.parentElement){if(n.classList.contains('portal-purpose-panel'))break;if(n.hidden||n.classList.contains('hidden')||n.style.display==='none')return false;}return true;};
  const style=element('style');style.id='portal-purpose-style';style.textContent=`
  #dashboardSection.portal-purpose-layout .portal-purpose-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:18px}
  #dashboardSection.portal-purpose-layout .portal-purpose-top h2{margin:0;font-size:1.4rem;font-weight:700;word-break:keep-all}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;padding:8px;background:var(--theme-surface,#fff);border:1px solid var(--theme-border,#dae5dd);border-radius:16px}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button{flex:1 0 calc(25% - 8px);min-height:54px;min-width:min(100%,5em);max-width:100%;padding:10px 8px;border:0;border-radius:10px;background:transparent;color:var(--theme-text,#233b2a);font:inherit;font-weight:700;word-break:keep-all;overflow-wrap:anywhere;display:flex;align-items:center;justify-content:center;gap:8px}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button[aria-selected=true]{background:var(--theme-text,#1f442b);color:var(--theme-surface,#fff)}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button:focus-visible{outline:3px solid #508c58;outline-offset:3px}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button:disabled{opacity:.55}
  #dashboardSection.portal-purpose-layout [data-purpose-panel][hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout #portalApplicationsAndHistory[hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-purpose-panel{min-width:0}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn,#dashboardSection.portal-purpose-layout #portalTimelineColumn{width:100%;padding:0}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn{max-width:760px;margin:0 auto}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10em),1fr));gap:12px;margin-bottom:24px}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button{min-height:66px;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;text-align:left;border-radius:14px;background:var(--theme-surface,#fff);color:var(--theme-text,#203b27);border:1px solid var(--theme-border,#d4e1d7);font-weight:700}
  #dashboardSection.portal-purpose-layout .portal-purpose-overview{max-width:900px;margin:0 auto}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading h3{font-size:1.1rem;font-weight:700;margin:0}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading button{min-height:44px;white-space:normal}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent{list-style:none;padding:0;margin:0}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent li{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:start;padding:14px 0;border-top:1px solid var(--theme-border,#dce6df)}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent time{font-size:.85rem;min-width:5.8em;color:var(--theme-muted,#586a5d)}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent strong{display:block;font-size:.95rem;word-break:keep-all;overflow-wrap:anywhere}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent small{color:var(--theme-muted,#586a5d)}
  #dashboardSection.portal-purpose-layout .portal-purpose-todos:empty{display:none}
  #dashboardSection.portal-purpose-layout .portal-purpose-todos{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
  #dashboardSection.portal-purpose-layout .portal-purpose-todos button{min-height:44px;white-space:normal}
  #dashboardSection.portal-purpose-layout #tabCert>button{min-height:44px;white-space:normal;word-break:keep-all}
  #dashboardSection.portal-purpose-layout .portal-purpose-asset-detail{min-height:44px;white-space:normal;margin-top:6px}
  #dashboardSection.portal-purpose-layout #profileSwitcher{margin:0!important;max-width:100%}
  #dashboardSection.portal-purpose-layout #profileSwitcher>button{min-height:44px;white-space:normal;max-width:100%;word-break:keep-all}
  #dashboardSection.portal-purpose-layout #portalProfileGroup>.d-flex{flex-wrap:wrap;gap:12px}
  #dashboardSection.portal-purpose-layout #portalProfileGroup .d-flex.align-items-center.mb-2{flex-wrap:wrap;gap:8px}
  #dashboardSection.portal-purpose-layout #portalProfileGroup .member-number-badge{max-width:100%;white-space:normal;overflow-wrap:anywhere}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-direct-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:18px;align-items:start}
  #dashboardSection.portal-purpose-layout .portal-direct-card{min-width:0;margin:0 0 18px}
  #dashboardSection.portal-purpose-layout .portal-direct-card>[data-direct-section]{display:block!important}
  #dashboardSection.portal-purpose-layout .portal-direct-card[hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-direct-history-list{max-height:24rem;overflow:auto}
  #dashboardSection.portal-purpose-layout .portal-document-controls{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;margin-bottom:12px}
  #dashboardSection.portal-purpose-layout .portal-document-controls :is(input,select){font:inherit;max-width:100%;min-width:0;min-height:44px;background:var(--theme-surface);color:var(--theme-text);border:1px solid var(--theme-border);border-radius:8px;padding:8px}
  #dashboardSection.portal-purpose-layout .portal-document-row{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;min-height:44px;text-align:left;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;padding:14px 0;border:0;border-top:1px solid var(--theme-border);background:transparent;color:var(--theme-text);font:inherit}
  #dashboardSection.portal-purpose-layout .portal-document-row small{color:var(--theme-muted,#68766c)}
  #dashboardSection.portal-purpose-layout .portal-document-list{margin-bottom:14px}
  #dashboardSection.portal-purpose-layout[data-inline-documents] #quickMinutesViewCard{display:none!important}
  #dashboardSection.portal-purpose-layout[data-inline-documents] #quickLinksRow>.quick-col:has(>#quickMinutesViewCard){display:none!important}
  #dashboardSection.portal-purpose-layout #portalModifyDraftList{margin-bottom:18px}
  .portal-document-reader{width:min(1100px,calc(100vw - 24px));height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);box-sizing:border-box;border:1px solid var(--theme-border);border-radius:16px;padding:14px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033)}
  .portal-document-reader[open]{display:flex;flex-direction:column;gap:12px}.portal-document-reader::backdrop{background:#0f172a80}
  .portal-document-reader header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px}.portal-document-reader h3{font-size:1.1rem;margin:0}.portal-document-reader button{font:inherit;min-height:44px;white-space:normal}.portal-document-reader iframe{width:100%;min-height:0;flex:1;border:0;background:var(--theme-surface,#fff)}
  @media(max-width:575px){#dashboardSection.portal-purpose-layout .portal-purpose-nav button{flex-direction:column;gap:4px;padding:9px 3px;font-size:.85rem}#dashboardSection.portal-purpose-layout .portal-purpose-nav{gap:3px;padding:5px}#dashboardSection.portal-purpose-layout .portal-purpose-top h2{font-size:1.25rem}}
  @media(max-width:340px){#dashboardSection.portal-purpose-layout .portal-purpose-nav button{flex-basis:calc(50% - 8px)}#dashboardSection.portal-purpose-layout .portal-purpose-shortcuts{grid-template-columns:1fr}}
  `;doc.head.append(style);
  const shell=element('div','portal-purpose-shell'),top=element('div','portal-purpose-top'),title=element('h2','','내 정보 보기');top.append(title);
  const switcher=doc.getElementById('profileSwitcher');if(switcher)top.append(switcher);
  const nav=element('div','portal-purpose-nav');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','조합원 메뉴');
  for(const [key,label]of Object.entries(names)){
   const button=action('',()=>show(key,{focus:true}),'');button.id='portalPurposeTab-'+key;button.dataset.purposeTab=key;button.setAttribute('role','tab');button.setAttribute('aria-controls','portalPurposePanel-'+key);
   const icon=element('i','bi bi-'+icons[key]);icon.setAttribute('aria-hidden','true');button.append(icon,doc.createTextNode(label));nav.append(button);buttons[key]=button;
   const panel=element('section','portal-purpose-panel');panel.id='portalPurposePanel-'+key;panel.dataset.purposePanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panels[key]=panel;
  }
  shell.append(top);const directory=doc.getElementById('profileDirectoryStatus');if(directory)shell.append(directory);shell.append(nav,...Object.values(panels));dashboard.append(shell);
  const overview=element('div','portal-purpose-overview'),summaryAssets=element('div'),fundAssets=element('div');
  panels.summary.append(overview);overview.append(summaryAssets);
  panels.funds.append(fundAssets,nodes.portalApplicationColumn);
  panels.activity.append(nodes.quickLinksRow,nodes.portalTimelineColumn,nodes.memberFreeBoardCard,nodes.memberBadgeCollectionCard,nodes.hallOfFameCard);
  panels.profile.append(nodes.portalProfileGroup,nodes.memberFamilyAccountCard);
  const directGrid=element('div','portal-direct-grid'),sectionCards=new Map();panels.funds.append(directGrid);
  function directSection(type,parent){const node=doc.getElementById('tab'+type[0].toUpperCase()+type.slice(1)),card=element('section','portal-direct-card dashboard-card');node.dataset.directSection=type;node.classList.remove('py-3');card.append(node);parent.append(card);sectionCards.set(type,card);return card;}
  directSection('extra',directGrid);
  const history=element('section','portal-direct-card dashboard-card'),historyTitle=element('h3','','출자금 납입 내역'),historySummary=element('div','mb-2 small'),historyList=element('div','portal-direct-history-list');history.id='portalInlineCapitalHistory';historyList.tabIndex=0;historyList.setAttribute('aria-label','출자금 납입 내역');history.append(historyTitle,historySummary,historyList);directGrid.append(history);
  directSection('cert',directGrid);const reductionCard=directSection('reduction',directGrid),redRetry=action('다시 확인',()=>options.openApplication?.('reduction'),'btn btn-sm btn-outline-secondary');redRetry.id='portalDirectRedRetry';redRetry.hidden=true;reductionCard.append(redRetry);
  const modify=doc.getElementById('portalModifyDraftList');if(modify)panels.funds.append(modify);
  directSection('partner',panels.profile);directSection('withdraw',panels.profile);
  const docHost=element('section','dashboard-card mb-4');docHost.id='portalInlineDocuments';panels.activity.prepend(docHost);
  const documents=root.MemberPortalDocuments&&options.documents?root.MemberPortalDocuments.create({...options.documents,container:docHost,isActive:()=>current()&&selected==='activity'}):null;
  if(documents)dashboard.dataset.inlineDocuments='true';else docHost.hidden=true;
  nodes.portalApplicationsAndHistory.hidden=true;
  const birthday=doc.getElementById('birthdayBanner');if(birthday)overview.prepend(birthday);
  const todos=element('div','portal-purpose-todos');todos.setAttribute('aria-label','확인할 일');overview.append(todos);
  const shortcuts=element('div','portal-purpose-shortcuts');shortcuts.setAttribute('aria-label','바로가기');
  const cert=action('출자증명서 보기',()=>invokeCertificate('memberContributionCertificateView'));
  const confirmation=action('조합원 확인서 보기',()=>invokeCertificate('memberConfirmationCertificateView'));
  const extra=action('추가 출자',()=>openApplication('extra','exAmount'));shortcuts.append(extra,cert,confirmation);overview.append(shortcuts);
  const recent=element('section','dashboard-card mb-4'),heading=element('div','portal-purpose-heading'),recentTitle=element('h3','','최근 내역'),all=action('전체 내역',()=>{if(show('activity',{focus:false}))focusNode(nodes.portalTimelineColumn.querySelector('h5'));},'btn btn-sm btn-outline-secondary');
  heading.append(recentTitle,all);const recentList=element('ol','portal-purpose-recent'),status=element('p','text-muted mb-0');recent.append(heading,recentList,status);overview.append(recent);
  function focusNode(node){if(!node?.isConnected||!current())return;if(!node.matches('button,a,input,select,textarea'))node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView?.({block:'nearest'});}
  function openApplication(type,target){if(!current()||!allowed(doc.querySelector('.menu-btn[onclick*="'+type+'"]')))return;options.openApplication?.(type);if(selected==='funds')focusNode(doc.getElementById(target));}
  function invokeCertificate(id){const button=doc.getElementById(id);if(!current()||!allowed(doc.querySelector('.menu-btn[onclick*="cert"]'))||button?.disabled)return;button.click();}
  function syncDirectSections(){for(const [type,card]of sectionCards){const menu=doc.querySelector('.menu-btn[onclick*="'+type+'"]');card.hidden=!current()||!allowed(menu);}const docCard=doc.getElementById('quickMinutesViewCard'),canRead=!!documents&&current()&&allowed(docCard);docHost.hidden=!canRead;if(documents)documents.activate(canRead&&selected==='activity');}
  function updateOverview(){
   cert.hidden=confirmation.hidden=!allowed(doc.querySelector('.menu-btn[onclick*="cert"]'));extra.hidden=!allowed(doc.querySelector('.menu-btn[onclick*="extra"]'));syncDirectSections();
   if(!current()){recentList.replaceChildren();status.textContent='내역을 다시 확인해 주세요.';todos.replaceChildren();return;}
   const items=[...doc.querySelectorAll('#timelineList .timeline-item')].slice(0,3);recentList.replaceChildren();
   for(const item of items){const li=element('li'),date=element('time','',item.querySelector('.timeline-date')?.textContent.trim()||''),body=element('div');
    const label=item.querySelector('.timeline-content h6,.timeline-content h5,.timeline-content .fw-bold')?.cloneNode(true);label?.querySelectorAll('button').forEach(n=>n.remove());body.append(element('strong','',label?.textContent.trim()||'활동 내역'));
    const badge=item.querySelector('.badge');if(badge)body.append(element('small','',badge.textContent.trim()));li.append(date,body);recentList.append(li);}
   status.hidden=items.length>0;status.textContent=doc.getElementById('timelineList').textContent.includes('활동 내역이 없습니다.')?'아직 활동 내역이 없습니다.':'내역을 불러오고 있어요.';
   todos.replaceChildren();
   for(const [badgeId,cardId,label]of [['voteTodoBadge','quickVoteCard','선거·투표 확인'],['signTodoBadge','quickMinutesSignCard','서명 요청 확인'],['docTodoBadge','quickMinutesViewCard','문서함 확인']]){
    const badge=doc.getElementById(badgeId),card=doc.getElementById(cardId);if(!allowed(badge)||!allowed(card))continue;
    const button=action(label,()=>{if(!current()||!allowed(badge)||!allowed(card))return;if(cardId==='quickMinutesViewCard'&&documents){if(show('activity',{focus:false}))focusNode(docHost.querySelector('h3'));}else card.querySelector('button,a')?.click();},'btn btn-outline-success');todos.append(button);
   }
  }
  function enhanceAssets(){for(const card of nodes.assetSummaryRow.querySelectorAll('.dashboard-card[onclick]')){
   if(card.querySelector('.portal-purpose-asset-detail'))continue;const old=card.querySelector('.x-small');if(old)old.hidden=true;
   const button=action('상세내역',event=>{event.stopPropagation();if(current()&&['summary','funds'].includes(selected)&&allowed(card))card.click();},'btn btn-sm btn-outline-success portal-purpose-asset-detail');card.append(button);
  }}
  function paint(){
   for(const key of Object.keys(names)){panels[key].hidden=key!==selected;buttons[key].setAttribute('aria-selected',String(key===selected));buttons[key].tabIndex=key===selected?0:-1;buttons[key].disabled=!current();}
   (selected==='funds'?fundAssets:summaryAssets).append(nodes.assetSummaryRow);
   if(current()&&selected==='funds')options.renderHistory?.(historyTitle,historySummary,historyList);
   nav.setAttribute('aria-busy',String(!current()));
  }
  function show(key,settings={}){
   if(!Object.hasOwn(names,key)||!current()||doc.hidden||root.frameElement?.hidden||dashboard.classList.contains('hidden'))return false;
   if(key===selected){if(settings.focus)buttons[key].focus({preventScroll:true});return true;}
   if(options.beforeChange?.(selected,key)===false)return false;
   selected=key;choices.set(verified,key);paint();updateOverview();
   if(settings.focus)buttons[key].focus({preventScroll:true});options.onEnter?.(key,settings);return true;
  }
  function refresh(){const key=context();if(!key){suspend();return;}if(verified!==key){verified=key;selected=choices.get(key)||'summary';}paint();updateOverview();options.onEnter?.(selected,{reason:'refresh'});}
  function suspend(){verified='';documents?.suspend();for(const b of Object.values(buttons))b.disabled=true;nav.setAttribute('aria-busy','true');updateOverview();}
  nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!current())return;const keys=Object.keys(names),at=keys.indexOf(event.target.dataset.purposeTab);if(at<0)return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;show(keys[next],{focus:true});});
  const observer=new MutationObserver(updateOverview);observer.observe(doc.getElementById('timelineList'),{childList:true,subtree:true,characterData:true});observer.observe(nodes.quickLinksRow,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style'],characterData:true});observer.observe(nodes.portalApplicationColumn,{attributes:true,subtree:true,attributeFilter:['class','hidden']});
  const assetsObserver=new MutationObserver(enhanceAssets);assetsObserver.observe(nodes.assetSummaryRow,{childList:true,subtree:true});enhanceAssets();
  dashboard.classList.add('portal-purpose-layout');dashboard.dataset.purposeMounted='true';refresh();
  return Object.freeze({isDirect:true,show,refresh,suspend,getSelected:()=>selected});
 }
 root.MemberPortalLayout=Object.freeze({version:'1.1.0',create});
})(window);
