/* Homepage inline adapter: original fields, page-memory drafts, original save paths. */
(function(root){
 'use strict';
 const fields=Object.freeze({
  heroTitle:['hero','site-home-hero-title','plain',120],heroSubtitle:['hero','site-home-hero-subtitle','plain',300],
  heroHighlight:['hero','site-home-hero-highlight','plain',60],heroButton:['hero','site-home-hero-cta-label','plain',40],
  impactTitle:['impact','site-home-impact-title','plain',120],impactDescription:['impact','site-home-impact-description','plain',500],impactKicker:['impact','site-home-impact-kicker','plain',80],impactButton:['impact','site-home-impact-cta-label','plain',40],
  aboutTitle:['about','admin-about-title','plain',200],aboutSubtitle:['about','admin-about-subtitle','plain',500],aboutContent:['about','admin-about-content','rich',100000],aboutList:['about','admin-about-list','plain',20000],
  contactPhone:['contact','site-home-contact-phone','plain',40],contactEmail:['contact','site-home-contact-email','plain',160],contactAddress:['contact','site-home-contact-address','plain',240],
  activityTitle:['activities','activity-title','plain',300],activityContent:['activities','activity-content','rich',100000]
 });
 let dialog,moved=[],flushWait=null,lastRejected=false;
 const historyValues=new Map();
 function styleInput(group){
  const id=`site-text-styles-${group}`;let input=document.getElementById(id);
  if(!input){input=document.createElement('input');input.type='hidden';input.id=id;input.value='{}';document.getElementById(group==='about'?'sub-about':group==='activities'?'activityModal':'sub-home-settings')?.append(input);}return input;
 }
 function styleGroup(key){return fields[key][0]==='about'?'about':fields[key][0]==='activities'?'activities':'home';}
 function storedStyles(group){try{return JSON.parse(styleInput(group).value)||{};}catch(_){return {};}}
 function setStyles(group,styles){styleInput(group).value=JSON.stringify(styles&&typeof styles==='object'?styles:{});}
 function fieldState(key){const slide=root.CoopHeroVisual?.fields()?.[key];if(slide)return {value:slide.value,runs:slide.styles||[]};const value=document.getElementById(fields[key][1])?.value||'',styles=storedStyles(styleGroup(key))[key];return key==='aboutList'&&root.CoopTextStyles?.editableList?root.CoopTextStyles.editableList(value,styles):{value,runs:root.CoopTextStyles?.normalize(value,styles)||[]};}
 function readStyles(group,trim=false){const out={};for(const [key,cfg] of Object.entries(fields)){if(styleGroup(key)!==group||cfg[2]!=='plain'||key==='heroHighlight')continue;const state=cfg[0]==='hero'?{value:document.getElementById(cfg[1])?.value||'',runs:root.CoopTextStyles?.normalize(document.getElementById(cfg[1])?.value||'',storedStyles(group)[key])||[]}:fieldState(key),rows=trim&&key!=='aboutList'?root.CoopTextStyles?.trim(state.value,state.runs):state.runs;if(rows?.length)out[key]=rows;}return out;}
 function permitted(){return typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site');}
 function ready(key){
  const cfg=fields[key],input=cfg&&document.getElementById(cfg[1]);if(!input||input.disabled||!permitted())return false;
  if(['hero','impact','contact'].includes(cfg[0])){const state=getSiteEditorDraft('home').refresh();return state.loaded&&!state.loading&&!state.busy;}
  if(cfg[0]==='about'){const state=getSiteEditorDraft('about').refresh();return state.loaded&&!state.loading&&!state.busy;}
  return document.getElementById('activityModal')?.classList.contains('show')&&!isSavingActivity&&!g_activityModalOpening;
 }
 function collect(){
  const result={};for(const [key,cfg] of Object.entries(fields))if(ready(key)&&!(cfg[0]==='hero'&&root.CoopHeroSlides?.enabled())){const state=fieldState(key);result[key]={value:state.value,kind:cfg[2],maxLength:cfg[3],styles:state.runs};}const slide=root.CoopHeroVisual?.fields();if(slide)for(const [key,value]of Object.entries(slide))result[key]={...value,scope:root.CoopHeroVisual.editor().slideId};return result;
 }
 function update(key,value,restore=false,styles,scope=''){
  if(!Object.hasOwn(fields,key)||!ready(key)||typeof value!=='string')return false;
  const slide=root.CoopHeroVisual?.fields()?.[key];if(slide){if(scope!==root.CoopHeroVisual.editor().slideId)return false;return root.CoopHeroVisual.edit(key,value,styles);}if(scope)return false;
  const cfg=fields[key],input=document.getElementById(cfg[1]);
  const limit=input.maxLength>0?Math.min(input.maxLength,cfg[3]):cfg[3];if(value.length>limit)return false;
  let history=historyValues.get(key);
  const group=styleGroup(key),current=fieldState(key),saved=current.runs,signature=v=>JSON.stringify([v,styles===undefined?saved:styles]);
  if(!history||history.input!==input||history.last!==input.value){history={input,last:input.value,values:new Map([[JSON.stringify([current.value,saved]),input.value]])};historyValues.set(key,history);}
  // Restore only a value previously present in this exact field. Arbitrary
  // incoming HTML still follows normal sanitization, then secure save validation.
  if(styles!==undefined&&(cfg[2]!=='plain'||!Array.isArray(styles)||JSON.stringify(styles)!==JSON.stringify(root.CoopTextStyles?.normalize(value,styles))))return false;
  if(restore&&!history.values.has(signature(value)))return false;
  input.value=restore?history.values.get(signature(value)):cfg[2]==='rich'?sanitizeAboutHtml(value):value;
  if(styles!==undefined){const map=storedStyles(group);if(styles.length)map[key]=styles;else delete map[key];setStyles(group,map);}
  history.last=input.value;history.values.set(signature(value),input.value);history.values.set(signature(input.value),input.value);while(history.values.size>203)history.values.delete([...history.values.keys()][1]);
  if(key==='activityContent')g_activityEditorBridge?.syncFromSource();
  input.dispatchEvent(new Event('input',{bubbles:true}));
  if(cfg[0]==='about')getSiteEditorDraft('about').refresh();
  queueHomePreviewUpdate();return true;
 }
 function frame(){return document.getElementById('site-home-preview-frame');}
 function send(message){const f=frame();if(f?.src)f.contentWindow?.postMessage(message,new URL(f.src).origin);}
 function flush(){
  if(document.getElementById('site-home-preview-shell')?.hidden)return Promise.resolve(true);
  if(flushWait)return flushWait.promise;
  let resolve;const promise=new Promise(r=>resolve=r),timer=setTimeout(()=>{flushWait=null;resolve(false);},2000);
  flushWait={resolve,promise,timer};send({type:'coop-home-inline-flush'});return promise;
 }
 function closeDialog(){for(const [input,marker] of moved){delete input.dataset.inlineOriginalRoot;marker.replaceWith(input);}moved=[];if(dialog?.open)dialog.close();}
 function controls(title,ids){
  if(!permitted())return;closeDialog();
  const first=ids.map(([id])=>document.getElementById(id)).find(input=>input&&!input.disabled);
  const form=first?.closest('#sub-home-settings,#sub-about');if(!form)return;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='home-element-dialog';dialog.setAttribute('aria-labelledby','home-element-dialog-title');dialog.addEventListener('close',closeDialog);dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
   for(const type of ['input','change'])dialog.addEventListener(type,event=>{const rootId=event.target.closest('[data-inline-original-root]')?.dataset.inlineOriginalRoot;if(rootId)getSiteEditorDraft(rootId==='sub-about'?'about':'home').refresh();queueHomePreviewUpdate();});
  }
  // Native dialogs still disappear inside a display:none inspector. Retain each
  // field's logical draft scope while presenting it outside that hidden ancestor.
  document.body.append(dialog);
  dialog.replaceChildren();const heading=document.createElement('h2');heading.id='home-element-dialog-title';heading.textContent=title;dialog.append(heading);
  dialog.classList.toggle('home-banner-gui',ids.some(([id])=>id==='site-home-slide-config'));
  for(const [id,label] of ids){const input=document.getElementById(id);if(!input||input.disabled)continue;const marker=document.createComment('inline field return');input.before(marker);input.dataset.inlineOriginalRoot=form.id;moved.push([input,marker]);if(label){const lab=document.createElement('label');lab.htmlFor=id;lab.className='form-label';lab.textContent=label;dialog.append(lab);}dialog.append(input);}
  if(!moved.length)return;const done=document.createElement('button');done.type='button';done.className='btn btn-primary mt-3';done.textContent='확인';done.onclick=closeDialog;dialog.append(done);root.CoopHomeEditorTools?.decorate(dialog);dialog.showModal();
 }
 function elementControls(area,kind){
  if(!CoopHomeVisualEditor.select(area,false))return;
  const key=area==='about'?'aboutTitle':area==='impact'?'impactTitle':'heroTitle';if(!ready(key))return;
  if(kind==='button'&&['hero','impact'].includes(area)){const id=area==='hero'?root.CoopHeroVisual?.editor().slideId:'';controls('버튼 바로가기',id?[[id+'-button-url','바로가기 설정'],[id+'-button-url-custom','직접 입력 주소'],[id+'-button_label','버튼 문구']]:[[`site-home-${area}-cta-target`,'바로가기 설정'],[`site-home-${area}-cta-custom`,'직접 입력 주소'],[`site-home-${area}-cta-label`,'버튼 문구']]);}
  else if(kind==='image'){
   if(area==='about')controls('조합 소개 사진',[['admin-about-img-file','사진 교체']]);
   else if(area==='hero'&&root.CoopHeroVisual)bannerPhoto(root.CoopHeroVisual.editor().slideId);
   else if(['hero','impact'].includes(area))controls('사진 설정',[[`site-home-${area}-image-file`,'사진 교체'],[`site-home-${area}-image-position`,'사진 위치'],...(area==='hero'?[['site-home-hero-content-visible','제목·설명·버튼 표시'],['site-home-hero-overlay','사진 어둡게'],['site-home-hero-text-align','글자 정렬'],['site-home-slide-config','슬라이드 배너·클릭 연결']]:[])]);
  }
 }
 function bannerPhoto(id){if(!ready('heroTitle')||(id||'')!==(root.CoopHeroVisual?.editor().slideId||''))return;controls('PC·모바일 배너 사진',id?[[id+'-device-images',''],[id+'-image','PC용 · 권장 1920 × 720px · 최대 10MB'],[id+'-pc-preview',''],[id+'-desktop-display',''],[id+'-mobile-files',''],[id+'-mobile-display','']]:[['site-home-single-device-images',''],['site-home-hero-image-file','PC용 · 권장 1920 × 720px · 최대 10MB'],['site-home-hero-image-preview',''],['site-home-single-mobile-files',''],['site-home-single-display','']]);}
 function bannerLinks(id){if(!permitted())return;const prefix=id?id+'-':'';controls('배너 바로가기',id?[[prefix+'button-url','바로가기 설정'],[prefix+'button-url-custom','직접 입력 주소'],[prefix+'button_label','버튼 문구'],[prefix+'link-url','배너 클릭 바로가기'],[prefix+'link-url-custom','직접 입력 주소']]:[['site-home-hero-cta-target','바로가기 설정'],['site-home-hero-cta-custom','직접 입력 주소'],['site-home-hero-cta-label','버튼 문구'],['site-home-banner-click','배너 클릭 바로가기'],['site-home-banner-click-custom','직접 입력 주소']]);}
 function sectionAction(id,action){
  if(!permitted()||typeof g_sectionSaving==='undefined'||g_sectionSaving)return false;
  const row=g_sectionDrafts.find(x=>x.id===id);if(!row)return false;
  if(action==='hide')toggleSection(id,false);else if(action==='show')toggleSection(id,true);else if(action==='up'||action==='down')void moveSectionOrder(id,action==='up'?-1:1);else return false;return true;
 }
 function saveButtons(area){
  const selectors={hero:'#btn-save-home-settings',impact:'#btn-save-home-settings',contact:'#btn-save-home-settings',design:'#btn-save-home-settings',fonts:'#btn-save-home-settings',about:'#btn-save-about-settings',sections:'#btnSaveSectionChanges',certifications:'#site-certification-save',activities:'#btn-save-site-activity'};
  const buttons=area==='activities'&&!document.getElementById('activityModal')?.classList.contains('show')?[]:area==='legal'?[...document.querySelectorAll('#sub-legal .row > :not([hidden]) [data-legal-action="draft"],#sub-legal .row > :not([hidden]) [data-legal-action="publish"]')]:[...document.querySelectorAll(selectors[area]||'#nonexistent-inline-save')];
  // A home draft may remain pending after switching to About or another area.
  // Keep its original save available in this same action zone, not a second bar.
  const pending=document.getElementById('site-home-pending-save'),homeSave=document.getElementById('btn-save-home-settings');
  if(pending&&!pending.hidden&&homeSave&&!buttons.includes(homeSave))buttons.push(homeSave);
  if(area!=='sections'&&typeof hasPendingSectionChanges==='function'&&hasPendingSectionChanges()){
   const sectionSave=document.getElementById('btnSaveSectionChanges');if(sectionSave)buttons.push(sectionSave);
  }
  return buttons;
 }
 function mount(){
  for(const group of ['home','about','activities'])styleInput(group);
  const workspace=document.getElementById('site-home-visual-workspace'),toolbar=document.querySelector('.home-visual-toolbar');if(!workspace||!toolbar||document.getElementById('home-inline-settings-toggle'))return;
  let explicitSettings=false;
  const toggle=document.createElement('button');toggle.id='home-inline-settings-toggle';toggle.type='button';toggle.className='btn btn-sm btn-outline-secondary';toggle.textContent='세부 설정';toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const open=workspace.classList.toggle('show-settings');explicitSettings=open;toggle.setAttribute('aria-expanded',String(open));};toolbar.append(toggle);
  const actions=document.createElement('div');actions.className='home-inline-save-actions';toolbar.append(actions);
  const zone=document.createElement('div');zone.className='home-inline-save-zone';toolbar.append(zone);
  const status=document.createElement('span');status.id='home-inline-save-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');zone.append(status,actions);
  const undo=document.createElement('button');undo.type='button';undo.id='home-inline-undo';undo.className='btn btn-sm btn-outline-secondary home-undo-button';undo.textContent='↶';undo.title='마지막 수정 되돌리기';undo.setAttribute('aria-label',undo.title);undo.disabled=true;undo.onclick=()=>{if(permitted())void root.CoopHomeEditorTools?.undo();};zone.insertBefore(undo,actions);
  const publicLink=document.createElement('a');publicLink.className='btn btn-sm btn-outline-secondary';publicLink.id='home-inline-public-link';publicLink.textContent='홈페이지 보기 ↗';publicLink.target='_blank';publicLink.rel='noopener noreferrer';publicLink.hidden=true;toolbar.insertBefore(publicLink,zone);
  workspace.classList.add('has-unified-save');
  let signature='',flushing=false,retryFocus=null;const phases=new Map();
  const retryOwner=()=>{const runtime=typeof g_adminMemberRuntime==='object'?g_adminMemberRuntime:null;return JSON.stringify([typeof adminCertificateAuthId==='string'?adminCertificateAuthId:'',runtime?.coop_id,runtime?.effective_permissions,runtime?.modules,runtime?.module_access]);};
  const cancelRetryFocus=()=>{if(retryFocus?.timer)root.clearTimeout(retryFocus.timer);retryFocus=null;};
  function retryFocusCurrent(ticket){
   return ticket===retryFocus&&ticket.owner===retryOwner()&&ticket.runtime===g_adminMemberRuntime&&permitted()
    &&CoopHomeVisualEditor.current()==='about'&&!root.frameElement?.hidden&&document.visibilityState!=='hidden'
    &&document.getElementById('tab-site')?.classList.contains('active');
  }
  function restoreRetryFocus(button,state){
   const ticket=retryFocus;if(!ticket)return;
   if(!retryFocusCurrent(ticket)){cancelRetryFocus();return;}
   if(state.phase==='loading')ticket.started=true;
   if(!ticket.started||state.phase==='loading')return;
   if(state.phase!=='error'){cancelRetryFocus();return;}
   if(ticket.timer||!button)return;
   // Reader catch/finally can update the same error twice. Wait until that turn
   // settles, then find the current button rather than focusing a replaced one.
   ticket.timer=root.setTimeout(()=>{
    ticket.timer=0;if(!retryFocusCurrent(ticket))return;
    const current=actions.querySelector('[data-about-retry]'),active=document.activeElement;
    const failed=document.getElementById('site-about-save-status')?.dataset.siteEditorPhase==='error';
    const bounds=current?.getBoundingClientRect(),view=root.visualViewport;
    const left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||document.documentElement.clientWidth||root.innerWidth,height=view?.height||document.documentElement.clientHeight||root.innerHeight;
    const visible=bounds?.width>0&&bounds.height>0&&bounds.left>=left&&bounds.top>=top&&bounds.right<=left+width&&bounds.bottom<=top+height;
    cancelRetryFocus();
    if(failed&&visible&&current?.isConnected&&!current.disabled&&!current.closest('[hidden],.hidden')
     &&(!active||active===document.body||active===document.documentElement||active===ticket.button)
     &&!document.querySelector('dialog[open],.modal.show,[role="dialog"][aria-modal="true"]'))current.focus({preventScroll:true});
   },0);
  }
  // Only the current retry may reclaim abandoned focus. Any deliberate move
  // away, including an iframe/menu round trip, permanently cancels that intent.
  for(const event of ['focusin','pointerdown','keydown','input','change','hide.bs.tab','hidden.bs.tab'])document.addEventListener(event,cancelRetryFocus,true);
  document.addEventListener('shown.bs.tab',()=>{if(retryFocus&&CoopHomeVisualEditor.current()!=='about')cancelRetryFocus();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancelRetryFocus();});
  root.addEventListener('blur',cancelRetryFocus);root.addEventListener('pagehide',cancelRetryFocus);
  if(root.frameElement)new MutationObserver(cancelRetryFocus).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
  function saveStatus(area){
   const kind=['hero','impact','contact','design','fonts'].includes(area)?'home':area==='about'?'about':'';
   if(kind){
    const source=document.getElementById(`site-${kind}-save-status`),text=source?.textContent||'';
    const actual=kind==='about'?source?.dataset.siteEditorPhase:'';
    const phase=['busy','loading','error','dirty','idle'].includes(actual)?actual:/저장 중/.test(text)?'busy':/불러오지 못/.test(text)?'error':/불러오는 중|불러와 주세요/.test(text)||!text?'loading':/저장하지 않은/.test(text)?'dirty':'idle';
    const prior=phases.get(kind);const saved=phase==='idle'&&(prior?.phase==='busy'||prior?.saved===true);phases.set(kind,{phase,saved});
    return {phase,text:phase==='idle'?(saved?'홈페이지에 반영되었습니다.':'변경사항 없음'):phase==='dirty'?'저장하지 않은 변경사항':text||'설정을 불러오는 중입니다…'};
   }
   if(area==='legal'){const card=[...document.querySelectorAll('#sub-legal [id$="-card"]')].find(n=>!n.parentElement.hidden);return {phase:'legal',text:card?.querySelector('[role="status"]')?.textContent||'문서를 불러오는 중입니다…'};}
   if(area==='sections')return {phase:typeof g_sectionSaving!=='undefined'&&g_sectionSaving?'busy':typeof hasPendingSectionChanges==='function'&&hasPendingSectionChanges()?'dirty':'idle',text:typeof g_sectionSaving!=='undefined'&&g_sectionSaving?'저장 중입니다…':typeof hasPendingSectionChanges==='function'&&hasPendingSectionChanges()?'저장하지 않은 변경사항':'변경사항 없음'};
   return {phase:'other',text:''};
  }
  function sync(){
   const area=CoopHomeVisualEditor.current(),sources=saveButtons(area),state=saveStatus(area),allowed=permitted();
   if(retryFocus&&!retryFocusCurrent(retryFocus))cancelRetryFocus();
   const undoState=root.CoopHomeEditorTools?.undoState(area)||{supported:false,enabled:false};if(undo.hidden===undoState.supported)undo.hidden=!undoState.supported;const undoDisabled=!allowed||flushing||!undoState.enabled;if(undo.disabled!==undoDisabled)undo.disabled=undoDisabled;
   const next=JSON.stringify([area,allowed,flushing,state,sources.map(x=>[x.id,x.disabled,x.hidden,x.textContent]),document.getElementById(`btn-retry-${area==='about'?'about':'home'}-settings`)?.hidden]);
   if(next===signature)return;signature=next;actions.replaceChildren();
   status.textContent=!allowed?'편집 권한이 없습니다.':flushing?'편집 내용을 확인하는 중입니다…':state.text;status.dataset.phase=state.phase;status.hidden=!status.textContent;
   for(const source of sources){
    source.classList.add('home-inline-source-save');
    const button=document.createElement('button');button.type='button';button.className='btn btn-sm '+(source.dataset.legalAction==='draft'?'btn-outline-primary':'btn-primary');
    button.textContent=source.id==='btn-save-home-settings'?(['hero','impact','contact','design','fonts'].includes(area)?'변경사항 저장':'메인 화면 변경 저장'):source.id==='btnSaveSectionChanges'?'표시 영역·순서 저장':source.textContent.trim();button.disabled=source.disabled||!allowed||flushing;
    button.onclick=async()=>{
     if(flushing||!permitted()||source.disabled)return;
     const current=source.id==='btn-save-site-activity'?root.AdminMemberSite?.captureActivitySaveIntent?.():()=>true;
     if(!current?.())return;
     flushing=true;sync();
     try{
      const accepted=await flush();
      if(!current())return;
      if(!accepted){myAlert('편집 내용을 확인하지 못했습니다. 다시 저장해 주세요.','warning');return;}
      if(permitted()&&!source.disabled)source.click();
     }finally{flushing=false;signature='';sync();}
    };actions.append(button);
   }
   const retry=document.getElementById(`btn-retry-${area==='about'?'about':'home'}-settings`);
   let retryButton=null;
   if(['hero','impact','contact','design','fonts','about'].includes(area)&&retry&&!retry.hidden){const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary';button.textContent='다시 불러오기';button.disabled=retry.disabled||!allowed;if(area==='about')button.dataset.aboutRetry='true';button.onclick=()=>{if(!permitted()||retry.disabled)return;cancelRetryFocus();const ticket=area==='about'&&document.activeElement===button?{owner:retryOwner(),runtime:g_adminMemberRuntime,button,started:false,timer:0}:null;retryFocus=ticket;retry.click();if(ticket&&retryFocus===ticket){ticket.started=document.getElementById('site-about-save-status')?.dataset.siteEditorPhase==='loading';if(!ticket.started)cancelRetryFocus();}};actions.append(button);retryButton=button;}
   publicLink.hidden=true;publicLink.removeAttribute('href');
   try{const url=typeof getHomePreviewUrl==='function'?getHomePreviewUrl():null;if(url&&url.protocol==='https:'&&!url.username&&!url.password){url.search='';url.hash='';publicLink.href=url.href;publicLink.hidden=false;}}catch(_){}
   if(!['hero','impact','about','contact','legal'].includes(area))workspace.classList.add('show-settings');else if(!explicitSettings)workspace.classList.remove('show-settings');toggle.setAttribute('aria-expanded',String(workspace.classList.contains('show-settings')));
   restoreRetryFocus(retryButton,state);
  }
  document.addEventListener('coop-home-undo-change',sync);new MutationObserver(sync).observe(workspace,{subtree:true,attributes:true,childList:true,characterData:true,attributeFilter:['disabled','hidden','class','src','data-site-editor-phase']});document.getElementById('site-home-area-picker').addEventListener('change',sync);toolbar.addEventListener('click',event=>{if(event.target.closest('[data-home-select-area]')){signature='';sync();}});sync();
 }
 root.addEventListener('message',event=>{
  const f=frame();if(!f?.src||event.source!==f.contentWindow||event.origin!==new URL(f.src).origin)return;
  const data=event.data;if(!data||!permitted())return;
  if(data.type==='coop-home-inline-edit'){
   const accepted=update(data.field,data.value,data.restore===true,data.styles,data.scope||'');lastRejected=!accepted;send({type:'coop-home-inline-result',field:data.field,accepted,requestId:data.requestId,value:accepted?fieldState(data.field).value:undefined,styles:accepted?fieldState(data.field).runs:undefined});
  }else if(data.type==='coop-home-inline-control'){if(data.area==='hero'&&(data.scope||'')!==(root.CoopHeroVisual?.editor().slideId||''))return;elementControls(data.area,data.kind);}
  else if(data.type==='coop-home-mobile-control'){
   const scope=root.CoopHeroVisual.editor().slideId;if((data.scope||'')!==scope&&['hero','heroTitle','heroSubtitle','heroButton'].includes(data.field))return;
   const key=data.field==='hero'?'heroTitle':data.field;if(!Object.hasOwn(fields,key)||!ready(key))return;
   if(data.property==='photo'||data.property==='links')root.CoopHeroVisual.action(data.property);
   else if(data.property==='fonts')controls('홈페이지 글꼴',[['site-home-title-font','제목 글꼴'],['site-home-body-font','본문 글꼴']]);
   else root.CoopHeroVisual.config(data.field,data.property,data.value);
  }
  else if(data.type==='coop-home-inline-section')sectionAction(data.area,data.action);
  else if(data.type==='coop-home-inline-flushed'&&flushWait){clearTimeout(flushWait.timer);flushWait.resolve(data.ok===true&&!lastRejected);flushWait=null;}
 });
 root.CoopSiteInlineHost=Object.freeze({collect,update,mount,closeDialog,flush,setStyles,readStyles,bannerLinks,bannerPhoto,fieldKeys:Object.keys(fields)});
})(window);
