/* Field help and reversible, page-memory edits. No storage, requests or authority cache. */
(function(root){
 'use strict';
 let mounted=false,restoring=false,inspecting=false,queued=false,reason='',sequence=0;
 const journals=new Map(),states=new Map(),fileIds=new WeakMap(),nodeIds=new WeakMap(),labelsDone=new WeakSet(),controlsDone=new WeakSet(),ctaDone=new WeakSet();let fileSequence=0,nodeSequence=0;
 const groups={home:'sub-home-settings',about:'sub-about',sections:'sub-sections'};
 const copy=v=>JSON.parse(JSON.stringify(v));
 const permitted=()=>typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site');
 const owner=()=>{const r=typeof g_adminMemberRuntime==='object'?g_adminMemberRuntime:null;return JSON.stringify([typeof adminCertificateAuthId==='string'?adminCertificateAuthId:'',r?.coop_id,r?.effective_permissions,r?.modules,r?.module_access]);};
 const kindFor=area=>['hero','impact','contact','design','fonts'].includes(area)?'home':area==='about'?'about':area==='sections'?'sections':'';
 function status(kind){inspecting=true;try{const state=kind==='sections'?{loaded:typeof g_siteInitialSectionsRequested!=='undefined'&&g_siteInitialSectionsRequested,busy:typeof g_sectionSaving!=='undefined'&&g_sectionSaving}:typeof getSiteEditorDraft==='function'?getSiteEditorDraft(kind).refresh():{loaded:false};states.set(kind,state);return state;}finally{inspecting=false;}}
 function nodes(kind){const host=document.getElementById(groups[kind]),borrowed=[...document.querySelectorAll(`[data-inline-original-root="${groups[kind]}"]`)];return [...new Set([...(host?.querySelectorAll('input,textarea,select')||[]),...borrowed.flatMap(n=>n.matches('input,textarea,select')?[n]:[...n.querySelectorAll('input,textarea,select')])])].filter(n=>!n.closest('.about-editor-toolbar')&&!n.closest('[data-slide-card]'));}
 function capture(kind){
  const keyNode=n=>{if(!nodeIds.has(n))nodeIds.set(n,++nodeSequence);return nodeIds.get(n);};
  // Borrowing original controls into a dialog is navigation, not an edit.
  const fieldKey=n=>n.id||n.name||String(keyNode(n));
  const fields=nodes(kind).map(n=>({node:n,value:n.value,checked:n.checked,files:n.type==='file'?[...n.files]:null,list:n.type==='file'?n.files:null})).sort((a,b)=>fieldKey(a.node).localeCompare(fieldKey(b.node)));
  const slides=kind==='home'?root.CoopHeroSlides?.checkpoint():null;
  const sections=kind==='sections'&&typeof g_sectionDrafts!=='undefined'?copy(g_sectionDrafts):null;
  const rows=kind==='home'?[...document.querySelectorAll('#site-home-impact-region-list .home-region-row')]:null;
  const keyFile=f=>{if(!fileIds.has(f))fileIds.set(f,++fileSequence);return fileIds.get(f);};
  return {fields,slides,sections,rows,signature:JSON.stringify([fields.filter(f=>!f.node.closest('.home-region-row')).map(f=>[fieldKey(f.node),f.files?f.files.map(keyFile):f.node.type==='checkbox'||f.node.type==='radio'?f.checked:f.value]),slides?.rows.map(r=>[r.value,r.presentation,r.file&&keyFile(r.file),r.mobileFile&&keyFile(r.mobileFile)]),sections,rows?.map(n=>[...n.querySelectorAll('input')].map(n=>n.value))])};
 }
 function emit(){document.dispatchEvent(new Event('coop-home-undo-change'));}
 function journal(kind){let j=journals.get(kind);const key=owner();if(!j||j.owner!==key){j={owner:key,last:null,stack:[],mark:null};journals.set(kind,j);}return j;}
 function record(kind,key=''){
  if(restoring)return;const state=status(kind),j=journal(kind);if(!state.loaded)return;
  const next=capture(kind);if(!j.last){j.last=next;return;}if(j.last.signature===next.signature){j.last=next;return;}
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
  'site-home-hero-content-visible':'사진 위·아래에 제목·설명·버튼을 함께 보여 줄지 정합니다. 사진에 이미 글자가 들어 있다면 끄고 이미지 전용으로 쓰면 문구가 겹치는 일을 줄일 수 있습니다. 꺼도 작성한 문구는 보관되며, 다시 켠 뒤 PC·모바일 미리보기로 배치를 확인하세요.',
  'site-home-hero-title':'방문자가 첫 화면에서 읽을 배너 제목입니다. 입력한 줄바꿈은 실제 홈페이지에도 반영되므로 핵심 문구가 한눈에 들어오도록 정리하세요. PC·모바일의 가로 폭이 다르니 두 미리보기에서 줄 수와 사진 가림을 확인하는 것을 권합니다.',
  'site-home-slide-mode':'한 장 배너는 대표 사진 하나를, 슬라이드 배너는 최대 네 장을 차례로 보여 줍니다. 안내할 내용이 여러 개일 때는 사진별 문구·버튼·클릭 목적지를 따로 정할 수 있습니다. 슬라이드를 선택한 경우에만 자동 전환 설정을 사용합니다.',
  'site-home-slide-autoplay':'슬라이드 배너를 8초마다 다음 사진으로 넘길지 정합니다. 여러 소식을 자연스럽게 보여 주려면 켜고, 방문자가 직접 넘기게 하려면 꺼 두세요. 긴 안내를 넣었다면 모바일에서도 읽을 시간이 충분한지 확인하는 것이 좋습니다.',
  'site-home-layout-mode':'디자인을 바꿀 때 현재 영역 배치를 유지할지, 선택한 디자인의 권장 배치를 적용할지 정합니다. 기존 공개 구성을 이어가려면 현재 배치를 유지하세요. 권장 배치를 쓰는 경우 표시 영역·순서와 미리보기를 함께 확인한 뒤 저장합니다.',
  'site-home-title-font':'배너·영역 제목의 인상을 정하는 글꼴입니다. 기본 제공 글꼴은 상업용 홈페이지에 무료로 사용할 수 있습니다. 외부 글꼴은 허용된 글꼴 파일 주소와 해당 조합 웹사이트에서의 사용 권한을 확인해야 하며, 긴 제목의 줄바꿈도 PC·모바일에서 살펴보세요.',
  'site-home-body-font':'소개·소식 등 본문의 읽기 편한 정도를 결정하는 글꼴입니다. 장식성보다는 긴 문장을 읽기 쉬운 글꼴을 권합니다. 기본 제공 글꼴은 상업용 홈페이지에 무료로 사용할 수 있고, 외부 글꼴은 파일 주소·사용 권한을 확인한 뒤 선택하세요.'
 };
 function hint(input){
  const id=input.id||'';
  if(helpText[id])return helpText[id];
  if(input.matches('[data-mobile-mode]'))return helpText['site-home-slide-mode'];
  if(input.matches('[data-mobile-image-only]'))return '메인 배너 전체에 공통으로 적용하는 설정입니다. 켜면 한 장 배너와 모든 슬라이드의 제목·설명·버튼을 숨기고 사진만 보여 줍니다. 끄면 작성해 둔 문구를 각 표시 설정에 따라 다시 보여 줍니다.\n\n사진 자체에 안내 문구가 들어 있을 때 사용하면 문구 겹침을 줄일 수 있습니다. 사진과 작성한 문구는 유지되며, 변경 결과는 미리보기로 확인한 뒤 저장해 주세요.';
  if(input.matches('[data-mobile-play]'))return helpText['site-home-slide-autoplay'];
  if(/(?:cta-target|button-url)$/.test(id))return '방문자가 이 버튼을 누르면 이동할 곳을 먼저 정합니다. 조합원 가입·조합 소개 등을 선택하면 해당 기본 문구가 채워지며 아래에서 표현을 수정할 수 있습니다. 버튼 문구만 바꿔서는 목적지가 바뀌지 않으니 연결할 곳과 문구를 함께 확인하세요.';
  if(/(?:cta-label|button_label)$/.test(id))return '버튼 안에 표시할 문구입니다. 바로가기를 먼저 고르면 목적지에 맞는 기본 문구가 들어오며, 필요한 말을 덧붙이거나 바꿀 수 있습니다. 눌렀을 때 무엇을 할 수 있는지 알아볼 수 있게 쓰고 모바일에서 길이가 적당한지 확인하세요.';
  if(/custom$/.test(id))return '기본 목록에 없는 페이지로 연결할 때 주소를 직접 입력합니다. 외부 페이지는 https://, 이 홈페이지 안의 경로는 /로 시작하세요. 관리자 전용 주소나 로그인 토큰이 포함된 주소가 아니라 방문자가 실제로 열 수 있는 공개 목적지인지 확인합니다.';
  if(/(?:link-url|banner-click)$/.test(id))return '버튼이 아니라 배너 사진 자체를 눌렀을 때 이동할 곳입니다. 이미지 전용 배너로 가입·소식을 안내할 때 유용합니다. 버튼의 바로가기와는 별도이므로 사진 속 안내와 실제 목적지가 같은지 확인하세요.';
  if(input.type==='file'&&(/^site-home-(?:hero(?:-mobile)?|impact)-image-file$|^admin-about-img-file$|^site-certification-image-file$/.test(id)||input.closest('[data-slide-card]')))return '현재 영역에 쓸 사진을 선택하는 항목입니다. 사진 한 장당 최대 10MB이며 화면의 권장 크기와 미리보기를 확인하세요. 파일을 고르는 것은 편집 단계이고, 해당 저장을 완료해야 홈페이지에 반영됩니다.';
  if(/image-source$/.test(id))return 'PC·모바일에 같은 사진을 쓸지 기기별 사진을 따로 넣을지 정합니다. 글자나 여러 요소가 있는 배너는 모바일 전용 사진을 준비하면 작은 화면에 맞추기 쉽습니다. 모바일용이 없으면 PC용 사진을 사용하므로 전체 보기·화면 채우기 설정을 함께 확인하세요.';
  if(/(?:desktop|mobile)-display-fit$/.test(id))return '전체 보기는 사진 전체를 보여 주므로 글자가 들어간 이미지에 적합합니다. 화면 채우기는 일정한 틀을 채우면서 일부가 잘릴 수 있어 여백 없이 사진을 강조할 때 쓰기 좋습니다. 모바일 전체 보기의 문구는 사진 아래, 화면 채우기의 문구는 사진 위에 나오므로 자르기 기준 위치와 함께 확인하세요.';
  if(/image[-_]position$|(?:desktop|mobile)-display-position$/.test(id))return '화면 채우기에서 사진의 어느 부분을 중심으로 남길지 정합니다. 인물·로고·사진 속 글자가 가장자리에 있다면 해당 부분이 잘리지 않도록 위치를 골라 보세요. 원본 사진은 바뀌지 않으며 PC·모바일 각각의 미리보기에서 결과를 확인합니다.';
  if(/-overlay$/.test(id))return '사진 위 문구를 읽기 쉽도록 배경사진을 어둡게 하는 정도입니다. 밝거나 복잡한 사진에서는 어둡게 하면 글자가 또렷해질 수 있습니다. 사진 자체의 분위기도 달라 보이므로 미리보기에서 조절하고 이미지 전용 표시와 구분해 사용하세요.';
  return ''; // A field name repeated as an instruction is not help.
 }
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
   for(const input of controls){const labels=[...container.querySelectorAll('label')].filter(l=>l.contains(input)||input.id&&l.htmlFor===input.id);if(!labels.length&&input.id&&input.previousElementSibling?.tagName==='LABEL'&&!input.previousElementSibling.htmlFor){input.previousElementSibling.htmlFor=input.id;labels.push(input.previousElementSibling);}for(const label of labels){if(labelsDone.has(label))continue;const text=label.textContent.trim();if(!text)continue;labelsDone.add(label);const message=hint(input);if(!message)continue;const button=helpButton(text,message);
    if(label.parentElement.matches('.home-template-grid,.home-impact-mode-grid')){const wrap=document.createElement('div');wrap.className='home-help-choice';label.before(wrap);wrap.append(label,button);}
    else if(label.contains(input)&&label.classList.contains('form-check')){const wrap=document.createElement('div');wrap.className='home-label-with-help mb-3';label.before(wrap);wrap.append(label,button);}
    else label.after(button);
   }if(!labels.length&&input.getAttribute('aria-label')&&!controlsDone.has(input)){controlsDone.add(input);const message=hint(input);if(message)input.after(helpButton(input.getAttribute('aria-label'),message));}}
  for(const node of container.querySelectorAll('.form-text:not([id])'))if(/^(끄면 배경사진|줄을 바꾸면 공개|기본 제공 글꼴|권장 배치는)/.test(node.textContent.trim()))node.hidden=true;
 }
 function mount(){
  if(mounted)return;mounted=true;const host=document.getElementById('tab-site');if(!host)return;
  decorate(host);const observer=new MutationObserver(()=>decorate(host));observer.observe(host,{childList:true,subtree:true});
  for(const name of ['input','change','click'])document.addEventListener(name,event=>{if(event.target.closest('.home-field-help,#home-inline-undo'))return;if(event.target.closest('#tab-site,[data-inline-original-root],.home-element-dialog')){if(name!=='input')reason='!'+name;else if(event.target.type==='hidden'){if(!reason)reason='!model';}else if(!reason.startsWith('!'))reason=event.target.matches('input:not([type=file]):not([type=checkbox]):not([type=radio]),textarea')?event.target.id:'';observe('home');}},true);
  for(const kind of Object.keys(groups))observe(kind);
 }
 root.CoopHomeEditorTools=Object.freeze({mount,decorate,observe,accepted,submitted,undo,undoState,restoreFiles,version:'1.0.3'});
})(window);
