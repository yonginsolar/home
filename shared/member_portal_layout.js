/* v1.3.5 — Align purpose panes and give application cards two desktop columns. */
(function(root){
 'use strict';
 function create(options){
  const doc=root.document,dashboard=doc.getElementById('dashboardSection');
  if(!dashboard||dashboard.dataset.purposeMounted)return null;
  const ids=['portalProfileGroup','assetSummaryRow','quickLinksRow','portalApplicationColumn','portalTimelineColumn','portalApplicationsAndHistory','memberBadgeCollectionCard','hallOfFameCard','memberFreeBoardCard','memberFamilyAccountCard'];
  const nodes=Object.fromEntries(ids.map(id=>[id,doc.getElementById(id)]));if(ids.some(id=>!nodes[id]))return null;
  let verified='',selected='summary';const choices=new Map(),expanded=new Map(),panels={},buttons={},dialogs=[];
  const names={summary:'요약',funds:'출자·신청',activity:'활동·내역',profile:'내 정보'},icons={summary:'grid',funds:'wallet2',activity:'journal-text',profile:'person'};
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
  @media(min-width:576px){#dashboardSection.portal-purpose-layout .portal-purpose-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch}#dashboardSection.portal-purpose-layout .portal-purpose-nav button{box-sizing:border-box;width:100%;min-width:0;height:100%;flex-direction:column;justify-content:flex-start}}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button:focus-visible{outline:3px solid #508c58;outline-offset:3px}
  #dashboardSection.portal-purpose-layout .portal-purpose-nav button:disabled{opacity:.55}
  #dashboardSection.portal-purpose-layout [data-purpose-panel][hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout #portalApplicationsAndHistory[hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-purpose-panel{min-width:0;padding:0;overflow:visible}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn,#dashboardSection.portal-purpose-layout #portalTimelineColumn{width:100%;padding:0}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn{max-width:760px;margin:0 auto}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:24px}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;min-height:170px;padding:22px;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;text-align:left;border-radius:18px;background:var(--theme-surface,#fff);color:var(--theme-text,#203b27);border:1px solid var(--theme-border,#d4e1d7);box-shadow:0 4px 16px #17203308;font:inherit}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button:hover{border-color:#4a8b68;box-shadow:0 7px 22px #17203312}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button[hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button:focus-visible,.portal-documents-surface button:focus-visible{outline:3px solid #508c58;outline-offset:3px}
  #dashboardSection.portal-purpose-layout .portal-shortcut-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:#e4f4e9;color:#256a42;font-size:24px;flex:none}
  #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone=blue]{background:#e9f0ff;color:#365ca7}
  #dashboardSection.portal-purpose-layout .portal-shortcut-icon[data-tone=gold]{background:#fff1d7;color:#866008}
  #dashboardSection.portal-purpose-layout .portal-purpose-shortcuts strong{font-size:1.1rem}.portal-purpose-shortcuts small{color:var(--theme-muted,#586a5d)}
  #dashboardSection.portal-purpose-layout .portal-shortcut-link{margin-top:auto;font-size:.85rem;color:var(--theme-muted,#586a5d)}
  #dashboardSection.portal-purpose-layout .portal-purpose-overview{max-width:900px;margin:0 auto}
  #dashboardSection.portal-purpose-layout :is(.portal-purpose-top,.portal-purpose-nav,.portal-purpose-panel){box-sizing:border-box;max-width:900px;width:100%;margin-left:auto;margin-right:auto}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading h3{font-size:1.1rem;font-weight:700;margin:0}
  #dashboardSection.portal-purpose-layout .portal-purpose-heading button{min-height:44px;white-space:normal}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent{list-style:none;padding:0;margin:0}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent li{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:start;padding:14px 0;border-top:1px solid var(--theme-border,#dce6df)}
  #dashboardSection.portal-purpose-layout .portal-purpose-recent time{font-size:.85rem;min-width:0;max-width:100%;overflow-wrap:anywhere;color:var(--theme-muted,#586a5d)}
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
  #dashboardSection.portal-purpose-layout #portalProfileGroup .d-flex{min-width:0;max-width:100%}
  #dashboardSection.portal-purpose-layout #portalProfileGroup .d-flex.align-items-center.mb-2{flex-wrap:wrap;gap:8px}
  #dashboardSection.portal-purpose-layout #portalProfileGroup h5.text-nowrap{white-space:normal!important;max-width:100%;overflow-wrap:anywhere;word-break:keep-all}
  #dashboardSection.portal-purpose-layout #portalProfileGroup .member-number-badge{max-width:100%;white-space:normal;overflow-wrap:anywhere}
  #dashboardSection.portal-purpose-layout #assetSummaryRow .count-val{max-width:100%;overflow-wrap:anywhere;word-break:normal}
  #dashboardSection.portal-purpose-layout #portalApplicationColumn{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-direct-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:18px;align-items:stretch}
  #dashboardSection.portal-purpose-layout .portal-direct-grid>.portal-direct-card{display:flex;flex-direction:column}
  #dashboardSection.portal-purpose-layout .portal-direct-grid>.portal-direct-card>[data-direct-section]{display:flex!important;flex:1;min-width:0;flex-direction:column}
  #dashboardSection.portal-purpose-layout .portal-direct-grid [data-direct-section]>button:last-child{margin-top:auto}
  @media(min-width:992px){#dashboardSection.portal-purpose-layout .portal-direct-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  #dashboardSection.portal-purpose-layout .portal-direct-card{min-width:0;height:auto;overflow:visible;margin:0 0 18px}
  #dashboardSection.portal-purpose-layout .portal-direct-card>[data-direct-section]{display:block!important}
  #dashboardSection.portal-purpose-layout .portal-direct-card[hidden]{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-direct-history-list{max-height:30rem;overflow:auto;word-break:keep-all;overflow-wrap:anywhere}
  #dashboardSection.portal-purpose-layout #tabCert>:is(#memberContributionCertificateTitle,#memberContributionCertificateView,hr),#dashboardSection.portal-purpose-layout #memberContributionCertificateTitle+p{display:none!important}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion{margin-bottom:24px;border:1px solid var(--theme-border,#dae5dd);border-radius:16px;background:var(--theme-surface,#fff);color:var(--theme-text,#233b2a);overflow:hidden}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;list-style:none;min-height:64px;padding:18px 22px}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>summary::-webkit-details-marker{display:none}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>summary::after{content:'⌄';flex:none;transition:transform .15s}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion[open]>summary::after{transform:rotate(180deg)}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>summary h5{margin:0!important;padding:0!important;border:0!important;font-size:1.05rem;word-break:keep-all}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>summary:focus-visible{outline:3px solid #508c58;outline-offset:-4px}
  #dashboardSection.portal-purpose-layout .portal-activity-accordion>#timelineList{padding:0 22px 20px}
  .portal-documents-surface{min-width:0;height:auto;overflow:visible}
  .portal-documents-surface .portal-purpose-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  .portal-documents-surface .portal-purpose-heading h3{font-size:1.1rem;margin:0}
  .portal-documents-surface .portal-document-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}
  .portal-documents-surface .portal-document-field{display:flex;flex-direction:column;gap:6px;min-width:0}
  .portal-documents-surface .portal-document-field label{font-size:.9rem;color:var(--theme-muted,#586a5d);word-break:keep-all}
  .portal-documents-surface .portal-document-controls :is(input,select){box-sizing:border-box;width:100%;font:inherit;max-width:100%;min-width:0;min-height:46px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033);border:1px solid var(--theme-border,#d4e1d7);border-radius:10px;padding:10px}
  .portal-documents-surface .portal-document-row{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;min-width:0;min-height:78px;text-align:left;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;padding:16px;border:1px solid var(--theme-border,#d4e1d7);border-radius:12px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033);font:inherit}
  .portal-documents-surface .portal-document-row:hover{border-color:#609a77}.portal-documents-surface .portal-document-row:disabled{opacity:.6}
  .portal-documents-surface .portal-document-row>i{font-size:1.4rem;color:var(--theme-muted,#586a5d);flex:none}
  .portal-documents-surface .portal-document-row>span{display:flex;flex-direction:column;gap:5px;min-width:0}.portal-documents-surface .portal-document-row small{color:var(--theme-muted,#68766c)}
  .portal-documents-surface .portal-document-list{display:grid;gap:10px;margin-bottom:18px}
  #dashboardSection.portal-purpose-layout[data-inline-documents] #quickMinutesViewCard{display:none!important}
  #dashboardSection.portal-purpose-layout[data-inline-documents] #quickLinksRow>.quick-col:has(>#quickMinutesViewCard){display:none!important}
  #dashboardSection.portal-purpose-layout #portalModifyDraftList{margin-bottom:18px}
  .portal-document-reader,.portal-purpose-dialog{max-width:none;max-height:calc(100dvh - 24px);box-sizing:border-box;border:1px solid var(--theme-border,#d4e1d7);border-radius:16px;background:var(--theme-surface,#fff);color:var(--theme-text,#172033)}
  .portal-document-reader{width:min(1100px,calc(100vw - 24px));height:calc(100dvh - 24px);padding:14px}
  .portal-document-reader[open]{display:flex;flex-direction:column;gap:12px}.portal-document-reader::backdrop{background:#0f172a80}
  .portal-document-reader .portal-dialog-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px}.portal-document-reader h3{font-size:1.1rem;margin:0}.portal-document-reader button{font:inherit;min-height:44px;white-space:normal}.portal-document-reader iframe{width:100%;min-height:0;flex:1;border:0;background:var(--theme-surface,#fff)}
  .portal-purpose-dialog{width:min(920px,calc(100vw - 24px));height:min(780px,calc(100dvh - 24px));padding:0;overflow:hidden;margin:auto}.portal-purpose-dialog[open]{display:flex;flex-direction:column}.portal-purpose-dialog::backdrop{background:#0f172a80}
  .portal-purpose-dialog>.portal-dialog-heading{display:flex;flex:none;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 20px;border-bottom:1px solid var(--theme-border,#d4e1d7)}
  .portal-purpose-dialog h2{font-size:1.2rem;margin:0;word-break:keep-all}.portal-purpose-dialog button{min-height:44px;white-space:normal;font:inherit}
  .portal-purpose-dialog>.portal-dialog-body{padding:20px;min-height:0;flex:1;overflow:auto;word-break:keep-all;overflow-wrap:anywhere}.portal-purpose-dialog .portal-documents-surface{border:0;box-shadow:none;padding:0;margin:0!important;background:transparent}
  body:has(#dashboardSection.portal-purpose-layout) :is(#memberInformationDialog,.member-login-methods,.member-identity-claim){height:min(760px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box}
  body:has(#dashboardSection.portal-purpose-layout) .custom-modal-overlay .custom-modal-box{height:min(720px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box}
  body:has(#dashboardSection.portal-purpose-layout) :is(#customModalOverlay,#findEmailModalOverlay,#modifyAppModal,#socialEmailVerifyModal) .custom-modal-box{height:min(440px,calc(100dvh - 32px))}
  body:has(#dashboardSection.portal-purpose-layout) dialog.coop-dialog{height:min(400px,calc(100dvh - 40px));overflow:auto}
  body:has(#dashboardSection.portal-purpose-layout) .portal-login-tool-recovery{height:min(400px,calc(100dvh - 24px))}
  .portal-purpose-dialog .portal-documents-surface .portal-purpose-heading h3{display:none}
  .portal-purpose-dialog .portal-dividend-content{min-width:0}.portal-dividend-content .row{--bs-gutter-x:.75rem}
  @media(max-width:575px){.portal-documents-surface .portal-document-controls{grid-template-columns:1fr}.portal-purpose-dialog>.portal-dialog-body{padding:14px}#dashboardSection.portal-purpose-layout .portal-purpose-shortcuts{grid-template-columns:1fr}#dashboardSection.portal-purpose-layout .portal-purpose-shortcuts button{min-height:132px}.portal-dividend-content .col-6{width:100%}}
  @media(max-width:575px){#dashboardSection.portal-purpose-layout #assetSummaryRow{--bs-gutter-x:18px}#dashboardSection.portal-purpose-layout #portalProfileGroup .input-group{flex-wrap:wrap;min-width:0}#dashboardSection.portal-purpose-layout #portalProfileGroup .input-group>button{white-space:normal;overflow-wrap:anywhere;min-width:0;max-width:100%;flex:0 1 auto}#dashboardSection.portal-purpose-layout #portalProfileGroup .input-group>.form-control{min-width:0;width:100%;flex:1 1 100%}}
  @media(max-width:575px){#dashboardSection.portal-purpose-layout #editAddressBox>.d-flex{flex-wrap:wrap}#dashboardSection.portal-purpose-layout #editAddressBox button{white-space:normal!important;overflow-wrap:anywhere;max-width:100%;min-width:0;flex:0 1 auto}body:has(#dashboardSection.portal-purpose-layout) #header>.container{gap:8px}body:has(#dashboardSection.portal-purpose-layout) #header .logo{min-width:0;flex:1}body:has(#dashboardSection.portal-purpose-layout) #header .logo h1{margin:0;line-height:1.2}body:has(#dashboardSection.portal-purpose-layout) #headerCoopLink{display:block;word-break:keep-all;overflow-wrap:anywhere}body:has(#dashboardSection.portal-purpose-layout) #header>.container>.d-flex{flex:none}body:has(#dashboardSection.portal-purpose-layout) #header .header-link{display:inline-grid;place-items:center;min-width:44px;min-height:44px;margin-left:4px;font-size:24px}}
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
  const overview=element('div','portal-purpose-overview'),summaryAssets=element('div'),fundAssets=element('div','portal-purpose-overview');
  panels.summary.append(overview);overview.append(summaryAssets);
  panels.funds.append(fundAssets,nodes.portalApplicationColumn);
  panels.activity.append(nodes.quickLinksRow,nodes.portalTimelineColumn,nodes.memberFreeBoardCard,nodes.memberBadgeCollectionCard,nodes.hallOfFameCard);
  panels.profile.append(nodes.portalProfileGroup,nodes.memberFamilyAccountCard);
  const timelineCard=nodes.portalTimelineColumn.querySelector('.dashboard-card'),activityHeading=timelineCard.querySelector('h5'),activityDetails=element('details','portal-activity-accordion'),activitySummary=element('summary');activityDetails.id='portalActivityAccordion';activitySummary.append(activityHeading);activityDetails.append(activitySummary,doc.getElementById('timelineList'));timelineCard.replaceWith(activityDetails);
  function retainExpansion(){if(verified)expanded.set(verified,activityDetails.open);}
  const directGrid=element('div','portal-direct-grid'),sectionCards=new Map();panels.funds.append(directGrid);
  function directSection(type,parent){const node=doc.getElementById('tab'+type[0].toUpperCase()+type.slice(1)),card=element('section','portal-direct-card dashboard-card');node.dataset.directSection=type;node.classList.remove('py-3');card.append(node);parent.append(card);sectionCards.set(type,card);return card;}
  directSection('extra',directGrid);
  const reductionCard=directSection('reduction',directGrid),redRetry=action('다시 확인',()=>options.openApplication?.('reduction'),'btn btn-sm btn-outline-secondary');redRetry.id='portalDirectRedRetry';redRetry.hidden=true;reductionCard.append(redRetry);
  const modify=doc.getElementById('portalModifyDraftList');if(modify)panels.funds.append(modify);
  directSection('partner',panels.profile);directSection('withdraw',directGrid);directSection('cert',directGrid);
  const docHost=element('section','dashboard-card mb-4');docHost.id='portalInlineDocuments';
  const docDialog=makeDialog('문서함','portalDocumentsDialog',()=>{documents?.close(false);syncDirectSections();});docDialog.body.append(docHost);
  const documents=root.MemberPortalDocuments&&options.documents?root.MemberPortalDocuments.create({...options.documents,container:docHost,isActive:()=>current()&&docDialog.node.open}):null;
  const dividendDialog=makeDialog('배당 내역','portalDividendDialog',()=>{dividendModalSummary.replaceChildren();dividendModalList.replaceChildren();}),dividendModalTitle=element('h3'),dividendModalSummary=element('div','mb-3 small'),dividendModalList=element('div','portal-dividend-content');dividendModalTitle.hidden=true;dividendDialog.body.append(dividendModalTitle,dividendModalSummary,dividendModalList);
  if(documents)dashboard.dataset.inlineDocuments='true';else docHost.hidden=true;
  nodes.portalApplicationsAndHistory.hidden=true;
  const birthday=doc.getElementById('birthdayBanner');if(birthday)overview.prepend(birthday);
  const todos=element('div','portal-purpose-todos');todos.setAttribute('aria-label','확인할 일');overview.append(todos);
  const shortcuts=element('div','portal-purpose-shortcuts');shortcuts.setAttribute('aria-label','바로가기');
  function shortcut(label,icon,description,tone,handler){const b=action('',handler,'');b.setAttribute('aria-label',label);const mark=element('span','portal-shortcut-icon');mark.dataset.tone=tone;const i=element('i','bi bi-'+icon);i.setAttribute('aria-hidden','true');mark.append(i);b.append(mark,element('strong','',label),element('small','',description),element('span','portal-shortcut-link','확인하기 →'));return b;}
  const cert=shortcut('출자증서','file-earmark-text','납입 출자금 확인·발급','green',()=>invokeCertificate('memberContributionCertificateView'));
  const documentShortcut=shortcut('문서함','folder2-open','공지·규정·의사록','blue',event=>openDocuments(event.currentTarget));
  const dividendShortcut=shortcut('배당내역','graph-up-arrow','지급 내역·세전/세후 상세','gold',event=>openDividends(event.currentTarget));shortcuts.append(cert,documentShortcut,dividendShortcut);overview.append(shortcuts);
  const recent=element('section','dashboard-card mb-4 portal-direct-card'),heading=element('div','portal-purpose-heading'),recentTitle=element('h3','','최근 내역'),all=action('전체 내역',()=>{if(show('activity',{focus:false})){activityDetails.open=true;expanded.set(verified,true);focusNode(activitySummary);}},'btn btn-sm btn-outline-secondary');
  heading.append(recentTitle,all);const recentList=element('ol','portal-purpose-recent'),status=element('p','text-muted mb-0');recent.append(heading,recentList,status);overview.append(recent);
  function focusNode(node){if(!node?.isConnected||!current())return;if(!node.matches('button,a,input,select,textarea'))node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView?.({block:'nearest'});}
  function makeDialog(label,id,onClose){const node=element('dialog','portal-purpose-dialog'),head=element('div','portal-dialog-heading'),h=element('h2','',label),closeButton=action('닫기',()=>close(),'btn btn-outline-secondary'),body=element('div','portal-dialog-body');node.id=id;h.id=id+'Title';node.setAttribute('aria-labelledby',h.id);head.append(h,closeButton);node.append(head,body);doc.body.append(node);let trigger=null;
   function close(restore=true){if(!node.open)return;const owned=node.contains(doc.activeElement)||doc.activeElement===doc.body;node.close();onClose?.();const target=trigger;trigger=null;if(restore&&owned&&target?.isConnected&&current())target.focus({preventScroll:true});}
   node.addEventListener('cancel',event=>{event.preventDefault();close();});node.addEventListener('keydown',event=>{if(event.key!=='Tab'||!node.open||doc.querySelector('.portal-document-reader[open]'))return;const focusable=[...node.querySelectorAll('button,input,select,a[href],summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(first&&((event.shiftKey&&doc.activeElement===first)||(!event.shiftKey&&doc.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}});
   const api={node,body,close,open(from){if(!current()||node.open)return;trigger=from;node.showModal();closeButton.focus({preventScroll:true});}};dialogs.push(api);return api;
  }
  function canDividends(){return current()&&options.canViewDividends?.()!==false;}
  function openDividends(trigger){if(!canDividends())return;options.renderHistory?.('dividend_net',dividendModalTitle,dividendModalSummary,dividendModalList);dividendDialog.open(trigger);}
  function openDocuments(trigger){if(!current()||!allowed(doc.getElementById('quickMinutesViewCard')))return;if(!documents){options.documents?.openFull?.();return;}docDialog.body.append(docHost);docHost.hidden=false;docDialog.open(trigger);documents.activate(true);}
  function invokeCertificate(id){const button=doc.getElementById(id);if(!current()||!allowed(doc.querySelector('.menu-btn[onclick*="cert"]'))||button?.disabled)return;button.click();}
  function syncDirectSections(){for(const [type,card]of sectionCards){const menu=doc.querySelector('.menu-btn[onclick*="'+type+'"]');card.hidden=!current()||!allowed(menu);}const docCard=doc.getElementById('quickMinutesViewCard'),canRead=!!documents&&current()&&allowed(docCard);if(!canRead)docDialog.close(false);docHost.hidden=!canRead;if(documents)documents.activate(canRead&&docDialog.node.open);}
  function updateOverview(){
   cert.hidden=!allowed(doc.querySelector('.menu-btn[onclick*="cert"]'));documentShortcut.hidden=!allowed(doc.getElementById('quickMinutesViewCard'));dividendShortcut.hidden=!canDividends();syncDirectSections();
   if(!current()){recentList.replaceChildren();status.textContent='내역을 다시 확인해 주세요.';todos.replaceChildren();return;}
   const items=[...doc.querySelectorAll('#timelineList .timeline-item')].slice(0,3);recentList.replaceChildren();
   for(const item of items){const li=element('li'),date=element('time','',item.querySelector('.timeline-date')?.textContent.trim()||''),body=element('div');
    const label=item.querySelector('.timeline-content h6,.timeline-content h5,.timeline-content .fw-bold')?.cloneNode(true);label?.querySelectorAll('button').forEach(n=>n.remove());body.append(element('strong','',label?.textContent.trim()||'활동 내역'));
    const badge=item.querySelector('.badge');if(badge)body.append(element('small','',badge.textContent.trim()));li.append(date,body);recentList.append(li);}
   status.hidden=items.length>0;status.textContent=doc.getElementById('timelineList').textContent.includes('활동 내역이 없습니다.')?'아직 활동 내역이 없습니다.':'내역을 불러오고 있어요.';
   todos.replaceChildren();
   for(const [badgeId,cardId,label]of [['voteTodoBadge','quickVoteCard','선거·투표 확인'],['signTodoBadge','quickMinutesSignCard','서명 요청 확인'],['docTodoBadge','quickMinutesViewCard','문서함 확인']]){
    const badge=doc.getElementById(badgeId),card=doc.getElementById(cardId);if(!allowed(badge)||!allowed(card))continue;
    const button=action(label,event=>{if(!current()||!allowed(badge)||!allowed(card))return;if(cardId==='quickMinutesViewCard')openDocuments(event.currentTarget);else card.querySelector('button,a')?.click();},'btn btn-outline-success');todos.append(button);
   }
  }
  function enhanceAssets(){for(const card of nodes.assetSummaryRow.querySelectorAll('.dashboard-card[onclick]')){
   if(card.querySelector('.portal-purpose-asset-detail'))continue;const old=card.querySelector('.x-small');if(old)old.hidden=true;
   const button=action('상세내역',event=>{event.stopPropagation();if(current()&&['summary','funds'].includes(selected)&&allowed(card))card.click();},'btn btn-sm btn-outline-success portal-purpose-asset-detail');card.append(button);
  }}
  function paint(){
   for(const key of Object.keys(names)){panels[key].hidden=key!==selected;buttons[key].setAttribute('aria-selected',String(key===selected));buttons[key].tabIndex=key===selected?0:-1;buttons[key].disabled=!current();}
   (selected==='funds'?fundAssets:summaryAssets).append(nodes.assetSummaryRow);
   nav.setAttribute('aria-busy',String(!current()));
  }
  function show(key,settings={}){
   if(!Object.hasOwn(names,key)||!current()||doc.hidden||root.frameElement?.hidden||dashboard.classList.contains('hidden'))return false;
   if(key===selected){if(settings.focus)buttons[key].focus({preventScroll:true});return true;}
   if(options.beforeChange?.(selected,key)===false)return false;
   retainExpansion();
   for(const dialog of dialogs)dialog.close(false);
   selected=key;choices.set(verified,key);paint();updateOverview();
   if(settings.focus)buttons[key].focus({preventScroll:true});options.onEnter?.(key,settings);return true;
  }
  function refresh(){const key=context();if(!key){suspend();return;}if(verified!==key){retainExpansion();for(const dialog of dialogs)dialog.close(false);verified=key;selected=choices.get(key)||'summary';activityDetails.open=expanded.get(key)||false;}paint();updateOverview();options.onEnter?.(selected,{reason:'refresh'});}
  function suspend(){retainExpansion();verified='';documents?.suspend();for(const dialog of dialogs)dialog.close(false);for(const b of Object.values(buttons))b.disabled=true;nav.setAttribute('aria-busy','true');updateOverview();}
  nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!current())return;const keys=Object.keys(names),at=keys.indexOf(event.target.dataset.purposeTab);if(at<0)return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;show(keys[next],{focus:true});});
  const observer=new MutationObserver(updateOverview);observer.observe(doc.getElementById('timelineList'),{childList:true,subtree:true,characterData:true});observer.observe(nodes.quickLinksRow,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style'],characterData:true});observer.observe(nodes.portalApplicationColumn,{attributes:true,subtree:true,attributeFilter:['class','hidden']});
  const assetsObserver=new MutationObserver(enhanceAssets);assetsObserver.observe(nodes.assetSummaryRow,{childList:true,subtree:true});enhanceAssets();
  dashboard.classList.add('portal-purpose-layout');dashboard.dataset.purposeMounted='true';refresh();
  return Object.freeze({isDirect:true,show,refresh,suspend,getSelected:()=>selected});
 }
 root.MemberPortalLayout=Object.freeze({version:'1.3.5',create});
})(window);
