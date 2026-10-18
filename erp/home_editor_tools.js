/* Field help and reversible, page-memory edits. No storage, requests or authority cache. */
(function(root){
 'use strict';
 let mounted=false,restoring=false,inspecting=false,queued=false,reason='',sequence=0;
 const journals=new Map(),states=new Map(),fileIds=new WeakMap(),labelsDone=new WeakSet(),controlsDone=new WeakSet(),ctaDone=new WeakSet();let fileSequence=0;
 const groups={home:'sub-home-settings',about:'sub-about',sections:'sub-sections'};
 const copy=v=>JSON.parse(JSON.stringify(v));
 const permitted=()=>typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site');
 const owner=()=>{const r=typeof g_adminMemberRuntime==='object'?g_adminMemberRuntime:null;return JSON.stringify([typeof adminCertificateAuthId==='string'?adminCertificateAuthId:'',r?.coop_id,r?.effective_permissions,r?.modules,r?.module_access]);};
 const kindFor=area=>['hero','impact','contact','design','fonts'].includes(area)?'home':area==='about'?'about':area==='sections'?'sections':'';
 function status(kind){inspecting=true;try{const state=kind==='sections'?{loaded:typeof g_siteInitialSectionsRequested!=='undefined'&&g_siteInitialSectionsRequested,busy:typeof g_sectionSaving!=='undefined'&&g_sectionSaving}:typeof getSiteEditorDraft==='function'?getSiteEditorDraft(kind).refresh():{loaded:false};states.set(kind,state);return state;}finally{inspecting=false;}}
 function nodes(kind){const host=document.getElementById(groups[kind]),borrowed=[...document.querySelectorAll(`[data-inline-original-root="${groups[kind]}"]`)];return [...new Set([...(host?.querySelectorAll('input,textarea,select')||[]),...borrowed.flatMap(n=>n.matches('input,textarea,select')?[n]:[...n.querySelectorAll('input,textarea,select')])])].filter(n=>!n.closest('.about-editor-toolbar')&&!n.closest('[data-slide-card]'));}
 function capture(kind){
  const fields=nodes(kind).map(n=>({node:n,value:n.value,checked:n.checked,files:n.type==='file'?[...n.files]:null,list:n.type==='file'?n.files:null}));
  const slides=kind==='home'?root.CoopHeroSlides?.checkpoint():null;
  const sections=kind==='sections'&&typeof g_sectionDrafts!=='undefined'?copy(g_sectionDrafts):null;
  const rows=kind==='home'?[...document.querySelectorAll('#site-home-impact-region-list .home-region-row')]:null;
  const keyFile=f=>{if(!fileIds.has(f))fileIds.set(f,++fileSequence);return fileIds.get(f);};
  return {fields,slides,sections,rows,signature:JSON.stringify([fields.map(f=>[f.node.id||f.node.name,f.files?f.files.map(keyFile):f.node.type==='checkbox'||f.node.type==='radio'?f.checked:f.value]),slides?.rows.map(r=>[r.item.id,r.value,r.presentation,r.file&&keyFile(r.file),r.mobileFile&&keyFile(r.mobileFile)]),sections])};
 }
 function emit(){document.dispatchEvent(new Event('coop-home-undo-change'));}
 function journal(kind){let j=journals.get(kind);const key=owner();if(!j||j.owner!==key){j={owner:key,last:null,stack:[],mark:null};journals.set(kind,j);}return j;}
 function record(kind,key=''){
  if(restoring)return;const state=status(kind),j=journal(kind);if(!state.loaded)return;
  const next=capture(kind);if(!j.last){j.last=next;return;}if(j.last.signature===next.signature)return;
  const time=Date.now(),prior=j.stack.at(-1),merge=key&&prior?.key===key&&time-prior.time<700&&!j.mark;
  if(merge){prior.after=next;prior.time=time;}else j.stack.push({before:j.last,after:next,key,time,seq:++sequence});j.last=next;emit();
 }
 function observe(kind,state){if(state){if(states.get(kind)?.busy&&!state.busy&&journals.get(kind)?.mark)journals.get(kind).mark=null;states.set(kind,state);}if(!groups[kind]||restoring||inspecting)return;if(queued)return;queued=true;queueMicrotask(()=>{queued=false;const key=reason.startsWith('!')?'':reason;reason='';for(const k of Object.keys(groups))record(k,key);});}
 function accepted(kind,savedSnapshot){
  if(!mounted||restoring)return;const j=journal(kind),state=status(kind);
  if(state.dirty&&j.mark){record(kind);const kept=j.stack.filter(e=>e.seq>j.mark.sequence);let canonical=[];try{canonical=JSON.parse(savedSnapshot||'[]');}catch(_){}
   // About's confirmed save may clear only the submitted File. Rebase old
   // mementos to the confirmed snapshot, never the later user's photo/text.
   const rebased=snap=>{for(const f of snap.fields){const at=j.mark.snapshot.fields.find(x=>x.node===f.node),saved=canonical.find(x=>x[0]===(f.node.id||f.node.name));if(!at||!saved)continue;if(f.files&&f.files.length===at.files?.length&&f.files.every((v,i)=>v===at.files[i])&&saved[2]?.length===0){f.files=[];f.list=null;}else if(!f.files&&f.value===at.value&&typeof saved[2]==='string')f.value=saved[2];}};
   kept.forEach(e=>{rebased(e.before);rebased(e.after);});j.stack=kept;
  }else j.stack=[];
  j.mark=null;j.last=capture(kind);emit();
 }
 function submitted(kind){record(kind);const j=journal(kind);j.last=capture(kind);j.mark={sequence,snapshot:j.last};}
 function restoreFiles(input,files,list){
  if(files.length===input.files.length&&files.every((f,i)=>input.files[i]===f))return;
  if(!files.length){input.value='';root.CoopHeroSlides?.resetPhotoSelection(input);return;}
  let assigned=false;try{if(typeof DataTransfer==='function'){const transfer=new DataTransfer();files.forEach(f=>transfer.items.add(f));input.files=transfer.files;assigned=true;}}catch(_){}
  if(!assigned&&list)input.files=list;
  else if(!assigned)throw Error('FILE_RESTORE_UNAVAILABLE');
  if(!files.every((f,i)=>input.files[i]===f))throw Error('FILE_RESTORE_UNAVAILABLE');
  root.CoopHeroSlides?.resetPhotoSelection(input);root.CoopHeroSlides?.acceptPhotoFile(input);
 }
 function undoState(area=root.CoopHomeVisualEditor?.current()){
  const kind=kindFor(area);if(!kind)return {supported:false,enabled:false};const state=states.get(kind)||{loaded:false},j=journal(kind);return {supported:true,enabled:permitted()&&state.loaded&&!state.loading&&!state.busy&&j.stack.length>0&&!restoring};
 }
 async function undo(){
  const kind=kindFor(root.CoopHomeVisualEditor?.current());if(!kind||!undoState().enabled)return false;
  const j=journal(kind),key=j.owner;if(!await(root.CoopSiteInlineHost?.flush()??Promise.resolve(true)))return false;
  record(kind);if(key!==owner()||!undoState().enabled)return false;const entry=j.stack.at(-1),saved=entry.before;
  root.CoopSiteInlineHost?.closeDialog();const prior=capture(kind);restoring=true;
  try{
   for(const f of saved.fields)if(f.files)restoreFiles(f.node,f.files,f.list);
   if(saved.rows){const list=document.getElementById('site-home-impact-region-list');list.replaceChildren(...saved.rows);}
   for(const f of saved.fields)if(!f.files){f.node.value=f.value;if(['checkbox','radio'].includes(f.node.type))f.node.checked=f.checked;}
   if(saved.slides&&!root.CoopHeroSlides.restoreCheckpoint(saved.slides))throw Error('BANNER_RESTORE_BLOCKED');
   if(saved.sections){g_sectionDrafts=copy(saved.sections);g_sectionReadRevision++;renderSectionRows();}
   if(kind==='home'){for(const k of ['hero','hero-mobile','impact']){const input=document.getElementById(`site-home-${k}-image-file`);if(input?.files.length)previewHomeImage(k);else setHomeImagePreview(k,document.getElementById(`site-home-${k}-image-url`)?.value||'');}updateHomeOverlayLabel();updateHomeImpactModeUi();updateHomeFontSelection();}
   if(kind==='about'){const input=document.getElementById('admin-about-img-file');if(input?.files.length)previewAboutImageFile();else{revokeAboutPreviewObjectUrl();setAboutImageStatus(document.getElementById('admin-about-img')?.value?'현재 연결된 사진입니다.':'선택한 사진이 없습니다.');updateTotalPreview();}}
   if(kind!=='sections')getSiteEditorDraft(kind).refresh();j.stack.pop();j.last=capture(kind);root.queueHomePreviewUpdate?.();return true;
  }catch(_){try{if(prior.rows)document.getElementById('site-home-impact-region-list').replaceChildren(...prior.rows);}catch(_){}for(const f of prior.fields){try{if(f.files)restoreFiles(f.node,f.files,f.list);else{f.node.value=f.value;if(['checkbox','radio'].includes(f.node.type))f.node.checked=f.checked;}}catch(_){}}try{if(prior.slides)root.CoopHeroSlides.restoreCheckpoint(prior.slides);if(prior.sections){g_sectionDrafts=copy(prior.sections);g_sectionReadRevision++;renderSectionRows();}}catch(_){}void root.CoopDialog.alert('되돌리지 못했습니다. 현재 입력을 확인해 주세요.');return false;}
  finally{restoring=false;reason='';emit();}
 }
 const helpText={
  'site-home-hero-content-visible':'끄면 배경사진만 표시하며 입력한 문구는 그대로 보관합니다.',
  'site-home-hero-title':'홈페이지 첫 화면의 제목입니다. 입력한 줄바꿈도 그대로 표시됩니다.',
  'site-home-hero-subtitle':'첫 화면에서 제목 아래에 보일 설명입니다.',
  'site-home-slide-mode':'한 장 배너 또는 최대 네 장의 슬라이드 배너를 선택합니다.',
  'site-home-slide-autoplay':'슬라이드 배너에서만 8초마다 다음 사진으로 전환합니다.',
  'site-home-layout-mode':'현재 영역 배치를 유지하거나 선택한 디자인의 권장 배치를 적용합니다.',
  'site-home-title-font':'홈페이지 제목에 사용할 글꼴입니다.',
  'site-home-body-font':'홈페이지 본문에 사용할 글꼴입니다.'
 };
 function hint(input,label){const id=input.id||'',text=label.textContent.trim();return helpText[id]||(/(?:cta-target|button-url)$/.test(id)?'이 버튼을 눌렀을 때 이동할 곳을 선택합니다. 선택하면 기본 버튼 문구가 채워지며 아래에서 더 수정할 수 있습니다.':/(?:cta-label|button_label)$/.test(id)?'바로가기를 먼저 선택한 뒤 버튼에 보일 문구를 덧붙이거나 수정하세요.':/custom$/.test(id)?'이동할 페이지 주소를 입력하세요. 외부 페이지는 https://로, 이 홈페이지 안의 페이지는 /로 시작합니다.':/(?:link-url|banner-click)$/.test(id)?'사진을 눌렀을 때 이동할 곳입니다. 버튼과는 별도로 설정할 수 있습니다.':input.type==='file'?'사진을 선택해 미리보기로 확인하세요. 사진 한 장당 최대 10MB이며 저장해야 반영됩니다.':/image-source$/.test(id)?'PC·모바일에 같은 사진을 쓰거나 기기별 사진을 따로 등록합니다.':/fit$/.test(id)?'전체 보기는 사진 전체를 보여주고, 화면 채우기는 틀에 맞춰 일부를 자릅니다.':/position$/.test(id)?'사진을 자를 때 남길 부분의 기준 위치입니다.':/overlay/.test(id)?'사진 위의 문구를 읽기 쉽도록 배경사진을 어둡게 합니다.':input.type==='checkbox'?text+' 여부를 선택합니다. 저장 또는 등록·적용해야 반영됩니다.':input.type==='radio'?'이 표시 방식을 선택한 뒤 미리보기로 확인하세요. 저장해야 반영됩니다.':input.tagName==='SELECT'?text+'을 선택하고 미리보기로 확인하세요.':text+'에 표시할 내용을 입력하세요.');}
 function helpButton(label,message){const b=document.createElement('button');b.type='button';b.className='home-field-help';b.textContent='?';b.setAttribute('aria-label',label+' 도움말');b.onclick=e=>{e.preventDefault();e.stopPropagation();b.focus({preventScroll:true});void root.CoopDialog.alert(message,{title:label+' 도움말'});};return b;}
 function cta(input){
  if(ctaDone.has(input))return;const id=input.id||'',isSingle=/^site-home-(hero|impact)-cta-target$/.test(id),isSlide=/-button-url$/.test(id);if(!isSingle&&!isSlide)return;ctaDone.add(input);
  const labelId=isSingle?id.replace('-target','-label'):id.replace('-button-url','-button_label'),labelInput=document.getElementById(labelId);if(!labelInput)return;
  for(const l of document.querySelectorAll('label'))if(l.htmlFor===id)l.textContent='바로가기 설정';
  if(isSingle){const destination=input.closest('.col-md-6'),wording=labelInput.closest('.col-md-6');if(destination?.parentElement===wording?.parentElement)wording.before(destination);}
  else{const lab=document.querySelector(`label[for="${labelId}"]`),targetLabel=document.querySelector(`label[for="${id}"]`),custom=document.getElementById(id+'-custom');if(lab&&targetLabel&&targetLabel.parentElement===lab.parentElement){lab.before(targetLabel,input);if(custom){const cl=custom.previousElementSibling;if(cl?.tagName==='LABEL')lab.before(cl);lab.before(custom);}}}
  input.addEventListener('change',()=>{if(!permitted()||input.disabled||labelInput.disabled||['','__custom__'].includes(input.value))return;const state=status('home');if(!state.loaded||state.busy||state.loading)return;labelInput.value=input.selectedOptions[0].textContent.trim();labelInput.dispatchEvent(new Event('input',{bubbles:true}));});
 }
 function decorate(container){
  const controls=[...container.querySelectorAll('input,textarea,select')].filter(n=>n.type!=='hidden'&&!n.closest('.about-editor-toolbar'));
  controls.forEach(cta);
   for(const input of controls){const labels=[...container.querySelectorAll('label')].filter(l=>l.contains(input)||input.id&&l.htmlFor===input.id);if(!labels.length&&input.id&&input.previousElementSibling?.tagName==='LABEL'&&!input.previousElementSibling.htmlFor){input.previousElementSibling.htmlFor=input.id;labels.push(input.previousElementSibling);}for(const label of labels){if(labelsDone.has(label))continue;const text=label.textContent.trim();if(!text)continue;labelsDone.add(label);const button=helpButton(text,hint(input,label));
    if(label.parentElement.matches('.home-template-grid,.home-impact-mode-grid')){const wrap=document.createElement('div');wrap.className='home-help-choice';label.before(wrap);wrap.append(label,button);}
    else if(label.contains(input)&&label.classList.contains('form-check')){const wrap=document.createElement('div');wrap.className='home-label-with-help mb-3';label.before(wrap);wrap.append(label,button);}
    else label.after(button);
   }if(!labels.length&&input.getAttribute('aria-label')&&!controlsDone.has(input)){controlsDone.add(input);const text=input.getAttribute('aria-label');input.after(helpButton(text,hint(input,{textContent:text})));}}
  for(const node of container.querySelectorAll('.form-text:not([id])'))if(/^(끄면 배경사진|줄을 바꾸면 공개|기본 제공 글꼴|권장 배치는)/.test(node.textContent.trim()))node.hidden=true;
 }
 function mount(){
  if(mounted)return;mounted=true;const host=document.getElementById('tab-site');if(!host)return;
  decorate(host);const observer=new MutationObserver(()=>decorate(host));observer.observe(host,{childList:true,subtree:true});
  for(const name of ['input','change','click'])document.addEventListener(name,event=>{if(event.target.closest('.home-field-help,#home-inline-undo'))return;if(event.target.closest('#tab-site,[data-inline-original-root],.home-element-dialog')){if(name!=='input')reason='!'+name;else if(event.target.type==='hidden'){if(!reason)reason='!model';}else if(!reason.startsWith('!'))reason=event.target.matches('input:not([type=file]):not([type=checkbox]):not([type=radio]),textarea')?event.target.id:'';observe('home');}},true);
  for(const kind of Object.keys(groups))observe(kind);
 }
 root.CoopHomeEditorTools=Object.freeze({mount,decorate,observe,accepted,submitted,undo,undoState,restoreFiles,version:'1.0.0'});
})(window);
