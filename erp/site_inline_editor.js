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
 function permitted(){return typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site');}
 function ready(key){
  const cfg=fields[key],input=cfg&&document.getElementById(cfg[1]);if(!input||input.disabled||!permitted())return false;
  if(['hero','impact','contact'].includes(cfg[0])){const state=getSiteEditorDraft('home').refresh();return state.loaded&&!state.loading&&!state.busy;}
  if(cfg[0]==='about'){const state=getSiteEditorDraft('about').refresh();return state.loaded&&!state.loading&&!state.busy;}
  return document.getElementById('activityModal')?.classList.contains('show')&&!isSavingActivity&&!g_activityModalOpening;
 }
 function collect(){
  const result={};for(const [key,cfg] of Object.entries(fields))if(ready(key))result[key]={value:document.getElementById(cfg[1]).value,kind:cfg[2],maxLength:cfg[3]};return result;
 }
 function update(key,value,restore=false){
  if(!Object.hasOwn(fields,key)||!ready(key)||typeof value!=='string')return false;
  const cfg=fields[key],input=document.getElementById(cfg[1]);
  const limit=input.maxLength>0?Math.min(input.maxLength,cfg[3]):cfg[3];if(value.length>limit)return false;
  let history=historyValues.get(key);
  if(!history||history.input!==input||history.last!==input.value){history={input,last:input.value,values:new Set([input.value])};historyValues.set(key,history);}
  // Restore only a value previously present in this exact field. Arbitrary
  // incoming HTML still follows normal sanitization, then secure save validation.
  if(restore&&!history.values.has(value))return false;
  input.value=restore?value:cfg[2]==='rich'?sanitizeAboutHtml(value):value;
  history.last=input.value;history.values.add(input.value);if(history.values.size>102)history.values.delete([...history.values][1]);
  if(key==='aboutContent')g_aboutEditorBridge?.syncFromSource();
  if(key==='activityContent')g_activityEditorBridge?.syncFromSource();
  if(key==='aboutList')renderAboutListEditor(parseAboutListItems(input.value));
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
   for(const type of ['input','change'])dialog.addEventListener(type,event=>{const rootId=event.target.dataset.inlineOriginalRoot;if(rootId)getSiteEditorDraft(rootId==='sub-about'?'about':'home').refresh();queueHomePreviewUpdate();});
  }
  // Native dialogs still disappear inside a display:none inspector. Retain each
  // field's logical draft scope while presenting it outside that hidden ancestor.
  document.body.append(dialog);
  dialog.replaceChildren();const heading=document.createElement('h2');heading.id='home-element-dialog-title';heading.textContent=title;dialog.append(heading);
  for(const [id,label] of ids){const input=document.getElementById(id);if(!input||input.disabled)continue;const marker=document.createComment('inline field return');input.before(marker);input.dataset.inlineOriginalRoot=form.id;moved.push([input,marker]);const lab=document.createElement('label');lab.htmlFor=id;lab.className='form-label';lab.textContent=label;dialog.append(lab,input);}
  if(!moved.length)return;const done=document.createElement('button');done.type='button';done.className='btn btn-primary mt-3';done.textContent='확인';done.onclick=closeDialog;dialog.append(done);dialog.showModal();
 }
 function elementControls(area,kind){
  if(!CoopHomeVisualEditor.select(area,false))return;
  const key=area==='about'?'aboutTitle':area==='impact'?'impactTitle':'heroTitle';if(!ready(key))return;
  if(kind==='button'&&['hero','impact'].includes(area))controls('버튼 설정',[[`site-home-${area}-cta-label`,'버튼 문구'],[`site-home-${area}-cta-target`,'연결 위치'],[`site-home-${area}-cta-custom`,'직접 입력 주소']]);
  else if(kind==='image'){
   if(area==='about')controls('조합 소개 사진',[['admin-about-img-file','사진 교체']]);
   else if(['hero','impact'].includes(area))controls('사진 설정',[[`site-home-${area}-image-file`,'사진 교체'],[`site-home-${area}-image-position`,'사진 위치'],...(area==='hero'?[['site-home-hero-overlay','사진 어둡게'],['site-home-hero-text-align','글자 정렬']]:[])]);
  }
 }
 function sectionAction(id,action){
  if(!permitted()||typeof g_sectionSaving==='undefined'||g_sectionSaving)return false;
  const row=g_sectionDrafts.find(x=>x.id===id);if(!row)return false;
  if(action==='hide')toggleSection(id,false);else if(action==='show')toggleSection(id,true);else if(action==='up'||action==='down')void moveSectionOrder(id,action==='up'?-1:1);else return false;return true;
 }
 function saveButtons(area){
  const selectors={hero:'#btn-save-home-settings',impact:'#btn-save-home-settings',contact:'#btn-save-home-settings',design:'#btn-save-home-settings',fonts:'#btn-save-home-settings',about:'#btn-save-about-settings',sections:'#btnSaveSectionChanges',certifications:'#site-certification-save',activities:'#btn-save-site-activity'};
  if(area==='legal')return [...document.querySelectorAll('#sub-legal .row > :not([hidden]) [data-legal-action="draft"],#sub-legal .row > :not([hidden]) [data-legal-action="publish"]')];
  const buttons=[...document.querySelectorAll(selectors[area]||'#nonexistent-inline-save')];
  if(area!=='sections'&&typeof hasPendingSectionChanges==='function'&&hasPendingSectionChanges()){
   const sectionSave=document.getElementById('btnSaveSectionChanges');if(sectionSave)buttons.push(sectionSave);
  }
  return buttons;
 }
 function mount(){
  const workspace=document.getElementById('site-home-visual-workspace'),toolbar=document.querySelector('.home-visual-toolbar');if(!workspace||!toolbar||document.getElementById('home-inline-settings-toggle'))return;
  const toggle=document.createElement('button');toggle.id='home-inline-settings-toggle';toggle.type='button';toggle.className='btn btn-sm btn-outline-secondary';toggle.textContent='세부 설정';toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const open=workspace.classList.toggle('show-settings');toggle.setAttribute('aria-expanded',String(open));};toolbar.append(toggle);
  const actions=document.createElement('div');actions.className='home-inline-save-actions';toolbar.append(actions);
  let signature='';function sync(){
   const area=CoopHomeVisualEditor.current(),sources=saveButtons(area),next=area+'|'+sources.map(x=>[x.id,x.disabled,x.textContent]).join('|');if(next===signature)return;signature=next;actions.replaceChildren();
   for(const source of sources){const button=document.createElement('button');button.type='button';button.className='btn btn-sm '+(source.dataset.legalAction==='draft'?'btn-outline-primary':'btn-primary');button.textContent=source.textContent.trim();button.disabled=source.disabled;button.onclick=async()=>{button.disabled=true;if(!(await flush())){myAlert('편집 내용을 확인하지 못했습니다. 다시 저장해 주세요.','warning');signature='';sync();return;}if(permitted()&&!source.disabled)source.click();signature='';sync();};actions.append(button);}
   if(!['hero','impact','about','activities','contact','legal'].includes(area))workspace.classList.add('show-settings');toggle.setAttribute('aria-expanded',String(workspace.classList.contains('show-settings')));
  }
  new MutationObserver(sync).observe(workspace,{subtree:true,attributes:true,childList:true,characterData:true,attributeFilter:['disabled','hidden','class']});document.getElementById('site-home-area-picker').addEventListener('change',sync);toolbar.addEventListener('click',event=>{if(event.target.closest('[data-home-select-area]')){signature='';sync();}});sync();
 }
 root.addEventListener('message',event=>{
  const f=frame();if(!f?.src||event.source!==f.contentWindow||event.origin!==new URL(f.src).origin)return;
  const data=event.data;if(!data||!permitted())return;
  if(data.type==='coop-home-inline-edit'){
   const accepted=update(data.field,data.value,data.restore===true);lastRejected=!accepted;send({type:'coop-home-inline-result',field:data.field,accepted});
  }else if(data.type==='coop-home-inline-control')elementControls(data.area,data.kind);
  else if(data.type==='coop-home-inline-section')sectionAction(data.area,data.action);
  else if(data.type==='coop-home-inline-flushed'&&flushWait){clearTimeout(flushWait.timer);flushWait.resolve(data.ok===true&&!lastRejected);flushWait=null;}
 });
 root.CoopSiteInlineHost=Object.freeze({collect,update,mount,closeDialog,flush});
})(window);
