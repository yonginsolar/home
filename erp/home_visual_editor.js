/* Actual homepage preview + the existing inputs, draft controller and secure save path. */
(function(root){
  'use strict';
  let mounted=false, selected='hero', lastHomeArea='hero', selectionRevision=0, sectionRows=[], previewOrder=[];
  const labels={hero:'메인 배너',impact:'참여 안내',about:'조합 소개',certifications:'공식 인증·지정',activities:'우리 소식',sections:'표시 영역·순서',legal:'가입 안내·약관',contact:'연락처',design:'구성',fonts:'글꼴',progress:'발전소 현황',status:'발전량 현황',partners:'함께하는 단체',history:'연혁',faq:'자주 묻는 질문','external-news':'외부 소식',documents:'문서 관리'};
  const panes={sections:'sub-sections',about:'sub-about',certifications:'sub-certifications',activities:'sub-activities',legal:'sub-legal',progress:'sub-plants',status:'sub-generation',partners:'sub-partners',history:'sub-history',faq:'sub-faqs','external-news':'sub-external-news',documents:'sub-docs'};
  const homeAreas=new Set(['hero','impact','contact','design','fonts']);
  const utilities=['sections','legal','design','fonts','documents'];
  const materialAreas=['activities','progress','status','certifications','history','partners','faq','external-news','documents'];
  const tasks=[['edit','hero','홈페이지 꾸미기'],['materials','activities','홈페이지에 보여줄 자료'],['legal','legal','가입 안내·약관']];
  const taskFor=area=>area==='legal'?'legal':materialAreas.includes(area)?'materials':'edit';
  const lastAreas={edit:'hero',materials:'activities',legal:'legal'};
  const quickTasks=[['hero','첫 화면 사진·문구'],['about','조합 소개'],['design','전체 디자인'],['sections','표시 영역·순서']];
  // Describe the actual owner and publication contract. These are navigation
  // labels, not new data sources, publication flags or cached authority.
  const context={
    hero:['첫 화면 사진·문구','사진·글자·버튼을 눌러 편집합니다.','저장하면 홈페이지에 반영됩니다.'],
    about:['조합 소개','홈페이지용 소개 글과 사진을 편집합니다.','저장하면 홈페이지에 반영됩니다.'],
    design:['전체 디자인','기존 구성 중에서 홈페이지 모양을 고릅니다.','저장하면 홈페이지에 반영됩니다.'],
    fonts:['글꼴','홈페이지의 제목·본문 글꼴을 고릅니다.','저장하면 홈페이지에 반영됩니다.'],
    sections:['표시 영역·순서','홈페이지에서 보여줄 영역과 순서를 정합니다.','저장하면 홈페이지에 반영됩니다.'],
    impact:['참여 안내','홈페이지 참여 안내 문구와 버튼을 편집합니다.','저장하면 홈페이지에 반영됩니다.'],
    contact:['홈페이지 연락처','홈페이지에 공개할 문의처를 입력합니다.','저장하면 홈페이지에 반영됩니다.'],
    activities:['우리 소식','여기에서 홈페이지용 소식을 작성합니다. 회의·교육의 사진은 선택해 가져올 수 있습니다.','글마다 선택한 공개 여부로 저장됩니다.'],
    progress:['발전소 현황','여기에서 홈페이지용 발전소 소개와 연결을 관리합니다.','저장한 정보는 기존 공개 기준에 따라 표시됩니다.'],
    status:['발전량 현황','여기에서 발전량 기록과 기존 수집 연결을 관리합니다.','저장한 기록은 홈페이지 발전 현황에 반영됩니다.'],
    certifications:['공식 인증·지정','여기에서 인증 내용과 사진을 관리합니다.','공개로 설정한 항목만 홈페이지에 표시됩니다.'],
    history:['연혁','여기에서 연혁을 관리합니다. 연혁으로 선택한 우리 소식도 함께 표시됩니다.','저장한 연혁은 홈페이지에 반영됩니다.'],
    partners:['함께하는 단체','여기에서 홈페이지에 소개할 단체와 사진을 관리합니다.','저장한 정보는 기존 공개 기준에 따라 표시됩니다.'],
    faq:['자주 묻는 질문','여기에서 질문과 답변을 관리합니다.','공개로 설정한 질문만 홈페이지에 표시됩니다.'],
    'external-news':['외부 소식','여기에서 외부 소식의 수집 연결과 표시할 글을 관리합니다.','기존 공개 설정에 따라 홈페이지에 표시됩니다.'],
    documents:['규정·정관 관리','기존 문서 원본과 개정 이력을 관리합니다.','현재 버전과 공개 범위는 별도로 적용됩니다.'],
    legal:['가입 안내·약관','가입 화면과 홈페이지에서 사용할 문서를 선택합니다.','초안 저장은 준비용이며, 등록·적용해야 반영됩니다.']
  };
  const help={
    hero:'사진을 누르면 사진 설정, 글자를 누르면 문구 편집, 가입 버튼을 누르면 연결 설정이 열립니다.\nPC·모바일 미리보기로 확인한 뒤 ‘변경사항 저장’을 누르세요.\n자르기·기기별 사진은 사진 설정에서, 슬라이드 구성은 배너 도구에서 정합니다.',
    about:'미리보기의 글이나 사진을 눌러 수정하세요.\n세부 설정에서도 같은 내용을 이어서 편집할 수 있습니다.\n‘변경사항 저장’을 누르면 홈페이지에 반영됩니다.',
    activities:'목록에서 소식을 선택하거나 ‘우리 소식 등록’을 누르세요.\n직접 작성하거나 회의·교육의 제목과 사진을 선택해 가져오세요.\n사진·내용과 공개 여부를 확인한 뒤 저장하세요.',
    legal:'위의 네 탭에서 편집할 문서를 선택하세요.\n‘초안 저장’으로 준비한 내용을 보관하세요.\n‘등록·적용’을 누르면 해당 가입 화면이나 홈페이지에 반영됩니다.',
    sections:'표시할 영역을 켜거나 끄고 순서를 정하세요.\n‘표시 영역·순서 저장’을 눌러 반영하세요.',
    design:'원하는 구성을 고르고 미리보기로 확인하세요.\n글꼴은 ‘다른 꾸미기’에서 선택하세요.\n‘변경사항 저장’을 눌러 반영하세요.',
    fonts:'제목과 본문 글꼴을 고르세요.\n외부 글꼴은 사용 권한과 연결을 확인하세요.\n미리보기 확인 후 ‘변경사항 저장’을 누르세요.'
  };
  function syncContext(){
    const info=context[selected],title=document.getElementById('site-home-task-title'),source=document.getElementById('site-home-task-source'),publication=document.getElementById('site-home-task-publication'),guide=document.getElementById('site-home-task-help');
    if(title)title.textContent=info[0];if(source)source.textContent=info[1];if(publication)publication.textContent=info[2];
    if(guide){guide.disabled=!available(selected)||typeof canAccessAdminMemberTab!=='function'||!canAccessAdminMemberTab('site');guide.setAttribute('aria-label',info[0]+' 도움말');}
    const state=document.getElementById('site-home-section-state');
    const id=selected==='progress'?(sectionRows.some(r=>r.id==='progress')?'progress':'portfolio'):selected;
    const row=sectionRows.find(r=>r.id===id);
    if(state){state.hidden=!row||taskFor(selected)!=='materials';state.textContent=row?'편집 중 영역 설정: '+(row.is_visible?'표시':'숨김'):'';}
    const location=document.getElementById('site-home-show-sections');if(location){location.hidden=taskFor(selected)!=='materials'||!available('sections');location.disabled=guide?.disabled!==false;}
  }
  function syncTasks(){
    const areaTask=taskFor(selected),allowed=typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site');
    for(const [mode]of tasks){const button=document.getElementById('site-home-mode-'+mode);if(!button)continue;button.hidden=!Object.keys(labels).some(a=>taskFor(a)===mode&&available(a));button.disabled=!allowed;const active=mode===areaTask;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
    const choices=document.getElementById('site-home-task-choices');if(choices)choices.hidden=areaTask!=='edit';
    for(const button of document.querySelectorAll('[data-home-quick-area]')){button.hidden=!available(button.dataset.homeQuickArea);button.disabled=!allowed;button.setAttribute('aria-pressed',String(button.dataset.homeQuickArea===selected));}
    const picker=document.getElementById('site-home-area-picker');if(picker){picker.hidden=areaTask!=='materials';picker.disabled=!allowed;for(const option of picker.options)option.hidden=taskFor(option.value)!=='materials'||!available(option.value);}
    const label=document.querySelector('.home-visual-area-label');if(label)label.hidden=areaTask!=='materials';
    const extra=document.getElementById('site-home-extra-picker');if(extra){for(const option of extra.options)if(option.value)option.hidden=!available(option.value);extra.disabled=!allowed;extra.value=['fonts','impact','contact'].includes(selected)?selected:'';}
    const docs=document.getElementById('site-home-linked-documents');if(docs)docs.hidden=areaTask!=='materials';
    syncContext();
  }
  function mountZoom(stage,shell){
    const controls=document.createElement('div');controls.className='home-preview-zoom';controls.setAttribute('role','group');controls.setAttribute('aria-label','미리보기 확대·축소');
    const viewport=document.createElement('div');viewport.className='home-preview-viewport';const canvas=document.createElement('div');canvas.className='home-preview-canvas';viewport.append(canvas);canvas.append(shell);
    let fit=true,scale=1;
    const output=document.createElement('output');output.setAttribute('aria-label','미리보기 배율');
    const layout=()=>{const width=viewport.clientWidth,height=viewport.clientHeight;if(!width||!height)return;const base=shell.classList.contains('is-mobile')?390:1200;if(fit)scale=Math.min(1,width/base);shell.style.width=base+'px';shell.style.height=(height/scale)+'px';shell.style.transform='scale('+scale+')';canvas.style.width=(base*scale)+'px';canvas.style.height=height+'px';output.textContent=Math.round(scale*100)+'%';};
    for(const [name,label,action]of [['out','−',()=>{fit=false;scale=Math.max(.1,scale-.1);}],['in','+',()=>{fit=false;scale=Math.min(1.5,scale+.1);}],['fit','맞춤',()=>{fit=true;}],['actual','100%',()=>{fit=false;scale=1;}]]){const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary';button.dataset.previewZoom=name;button.textContent=label;button.setAttribute('aria-label',name==='out'?'미리보기 축소':name==='in'?'미리보기 확대':name==='fit'?'미리보기 화면에 맞춤':'미리보기 실제 크기');button.onclick=()=>{action();layout();};controls.append(button);if(name==='out')controls.append(output);}
    stage.append(controls,viewport);if(typeof ResizeObserver==='function')new ResizeObserver(layout).observe(viewport);else root.addEventListener('resize',layout);new MutationObserver(layout).observe(shell,{attributes:true,attributeFilter:['class']});queueMicrotask(layout);
  }
  function syncOrder(rows, renderedIds){
    if(Array.isArray(rows))sectionRows=rows;
    if(Array.isArray(renderedIds))previewOrder=renderedIds.filter(id=>typeof id==='string'&&/^[a-z-]{1,40}$/.test(id)).slice(0,40);
    const order=new Map(sectionRows.map(row=>[row.id,Number(row.display_order)||999]));
    previewOrder.forEach((id,i)=>order.set(id,i));
    const fallback=['hero','about','certifications','impact','progress','status','activities','external-news','partners','history','faq','contact'];
    const anchor=area=>area==='certifications'?'about':area==='external-news'?'activities':area==='progress'?(order.has('progress')?'progress':'portfolio'):area;
    const areas=[...fallback].sort((a,b)=>(a===b?0:a==='hero'?-1:b==='hero'?1:(order.get(anchor(a))??100)-(order.get(anchor(b))??100))||fallback.indexOf(a)-fallback.indexOf(b)).concat(utilities);
    const picker=document.getElementById('site-home-area-picker'),strip=document.getElementById('site-home-area-strip');
    for(const area of areas){
      const option=picker?.querySelector(`option[value="${area}"]`),button=strip?.querySelector(`[data-home-select-area="${area}"]`);
      if(option){option.hidden=taskFor(area)!=='materials'||!available(area);picker.append(option);}
      if(button){button.hidden=!available(area);strip.append(button);}
    }
    if(picker)picker.value=selected;
    syncTasks();
  }
  function available(area){
    const link=document.querySelector(`#site-content-tabs a[href="#${panes[area]||'sub-home-settings'}"]`);
    // Scope rules hide individual nav items. The whole ERP is hidden during Auth
    // boot, which must not erase the menu choices before initialization finishes.
    return !!link && !link.classList.contains('hidden') && !link.parentElement.classList.contains('hidden') && !link.hidden && !link.parentElement.hidden && !link.disabled && !link.classList.contains('disabled') && link.getAttribute('aria-disabled')!=='true';
  }
  function select(area, navigate=true){
    if(area==='portfolio') area='progress';
    if(!Object.hasOwn(labels,area)||!available(area)) return false;
    if(typeof canAccessAdminMemberTab==='function'&&!canAccessAdminMemberTab('site'))return false;
    selected=area;lastAreas[taskFor(area)]=area;selectionRevision++;
    const bannerTools=document.querySelector('.mobile-banner-tools');if(bannerTools)bannerTools.hidden=area!=='hero';
    if(area!=='legal')lastHomeArea=area;
    document.querySelectorAll('[data-home-inspector-area]').forEach(node=>node.hidden=node.dataset.homeInspectorArea!==(homeAreas.has(area)?area:'hero'));
    document.querySelectorAll('[data-home-select-area]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.homeSelectArea===area)));
    const picker=document.getElementById('site-home-area-picker');if(picker)picker.value=area;
    const link=document.querySelector(`#site-content-tabs a[href="#${panes[area]||'sub-home-settings'}"]`);
    if(!link.classList.contains('active'))link.click();
    document.getElementById('site-home-visual-workspace')?.classList.toggle('is-content-edit',!homeAreas.has(area));
    const legal=area==='legal';
    document.querySelector('.home-visual-toolbar').hidden=legal;
    document.getElementById('site-home-visual-workspace').classList.toggle('is-legal-edit',legal);
    syncTasks();
    const legalTabs=document.getElementById('site-legal-document-tabs');if(legalTabs)legalTabs.hidden=!legal;
    document.getElementById('site-home-preview-shell').hidden=legal;
    document.getElementById('site-home-legal-preview').hidden=!legal;
    if(legal)window.CoopSiteLegalEditor?.refreshPreview();
    if(navigate && !legal) {
      const frame=document.getElementById('site-home-preview-frame');
      if(frame?.src) frame.contentWindow?.postMessage({type:'coop-home-preview-select',area},new URL(frame.src).origin);
    }
    // Existing tab handlers own loading and saving. Preview only reads their drafts.
    if(navigate && typeof queueHomePreviewUpdate==='function')queueHomePreviewUpdate();
    return true;
  }
  function mount(){
    if(mounted) return;
    const pane=document.getElementById('sub-home-settings');
    if(!pane) return;
    if(new URLSearchParams(location.search).get('scope')==='documents_admin')return;
    const basic=document.getElementById('site-home-basic-panel'), advanced=document.getElementById('site-home-advanced-panel');
    const areas={hero:[],impact:[],contact:[],design:[],fonts:[]};
    for(const container of [basic,advanced]) for(const card of [...container.children]) {
      const area=card.querySelector('[id^="site-home-hero-"]')?'hero':card.querySelector('[id^="site-home-impact-"]')?'impact':card.querySelector('[id^="site-home-contact-"]')?'contact':card.id==='site-home-font-settings'||card.querySelector('#site-home-title-font')?'fonts':'design';
      areas[area].push(card);
    }
    const toolbar=document.createElement('div'); toolbar.className='home-visual-toolbar';
    const pickerLabel=document.createElement('label');pickerLabel.className='home-visual-area-label';pickerLabel.htmlFor='site-home-area-picker';pickerLabel.textContent='관리할 자료';
    const picker=document.createElement('select');picker.id='site-home-area-picker';picker.className='form-select home-visual-area-picker';picker.onchange=()=>select(picker.value);
    for(const [area,label] of Object.entries(labels)) {const option=document.createElement('option');option.value=area;option.textContent=label;picker.append(option);}
    toolbar.append(pickerLabel,picker);
    // Retain the original ordering/selection nodes for existing adapters, but
    // expose only the labelled picker as the user's area navigation.
    const strip=document.createElement('div');strip.id='site-home-area-strip';strip.className='home-visual-area-strip';strip.hidden=true;strip.setAttribute('aria-hidden','true');toolbar.append(strip);
    for(const area of Object.keys(labels)) {
      const button=document.createElement('button'); button.type='button'; button.className='btn btn-sm btn-outline-secondary';
      button.textContent=labels[area]; button.dataset.homeSelectArea=area; button.onclick=()=>select(area); strip.append(button);
    }
    const devices=document.querySelector('.home-preview-device-group'); if(devices) { devices.classList.add('ms-auto'); toolbar.append(devices); }
    const taskContext=document.createElement('section');taskContext.className='home-task-context';taskContext.setAttribute('aria-labelledby','site-home-task-title');
    const taskHeading=document.createElement('div');taskHeading.className='home-task-heading';const title=document.createElement('h4');title.id='site-home-task-title';taskHeading.append(title);
    const guide=document.createElement('button');guide.type='button';guide.className='btn btn-sm btn-outline-secondary';guide.id='site-home-task-help';guide.textContent='?';guide.onclick=()=>{if(!available(selected)||typeof canAccessAdminMemberTab!=='function'||!canAccessAdminMemberTab('site'))return;guide.focus({preventScroll:true});void root.CoopDialog.alert(help[selected]||context[selected][1]+'\n'+context[selected][2],{title:context[selected][0]+' 도움말'});};taskHeading.append(guide);taskContext.append(taskHeading);
    for(const id of ['source','publication']){const text=document.createElement('p');text.id='site-home-task-'+id;taskContext.append(text);}
    const state=document.createElement('span');state.id='site-home-section-state';state.hidden=true;taskContext.append(state);
    const showSections=document.createElement('button');showSections.type='button';showSections.className='btn btn-sm btn-outline-secondary';showSections.id='site-home-show-sections';showSections.textContent='표시 영역·순서 확인';showSections.onclick=()=>select('sections');taskContext.append(showSections);
    const pending=document.createElement('button');pending.type='button';pending.className='btn btn-sm btn-primary';pending.id='site-home-pending-save';pending.hidden=true;pending.textContent='메인 화면 변경 저장';pending.onclick=async()=>{if(await (window.CoopSiteInlineHost?.flush()??Promise.resolve(true)))saveHomeSettings();else myAlert('편집 내용을 확인하지 못했습니다. 다시 저장해 주세요.','warning');};toolbar.append(pending);
    const workspace=document.createElement('div'); workspace.id='site-home-visual-workspace';workspace.className='home-visual-workspace';
    const stage=document.createElement('div'); stage.className='home-visual-stage';
    const previewShell=document.getElementById('site-home-preview-shell');mountZoom(stage,previewShell);
    // Device choice is presentation only; it must not mark the home draft dirty.
    stage.querySelector('#site-home-preview-shell')?.classList.add('is-mobile');
    toolbar.querySelector('#site-home-preview-mobile')?.classList.add('active');
    toolbar.querySelector('#site-home-preview-desktop')?.classList.remove('active');
    const legalPreview=document.createElement('div');legalPreview.id='site-home-legal-preview';legalPreview.className='home-visual-legal-preview';legalPreview.hidden=true;stage.append(legalPreview);
    const inspector=document.createElement('div'); inspector.className='home-visual-inspector';
    const homeFields=document.createElement('div');homeFields.className='home-visual-home-fields';
    for(const [area,cards] of Object.entries(areas)) {
      const group=document.createElement('div'); group.dataset.homeInspectorArea=area;
      for(const card of cards) { if(card.tagName==='DETAILS') card.open=card.id==='site-home-template-settings'; group.append(card); }
      homeFields.append(group);
    }
    pane.append(homeFields);
    const tabs=document.getElementById('site-content-tabs');
    const tabContent=pane.parentElement;
    const modes=document.createElement('div');modes.id='site-home-mode-tabs';modes.className='site-home-mode-tabs';modes.setAttribute('role','tablist');modes.setAttribute('aria-label','홈페이지 관리 업무');
    for(const [mode,area,label] of tasks){
      const button=document.createElement('button');button.type='button';button.id=`site-home-mode-${mode}`;button.dataset.homeMode=mode;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','site-home-visual-workspace');button.onclick=()=>{const target=available(lastAreas[mode])?lastAreas[mode]:Object.keys(labels).find(a=>taskFor(a)===mode&&available(a));if(target)select(target);};
      button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...modes.children].filter(x=>!x.hidden&&!x.disabled);if(!list.length)return;const next=event.key==='Home'?0:event.key==='End'?list.length-1:(list.indexOf(button)+(event.key==='ArrowLeft'?-1:1)+list.length)%list.length;list[next]?.click();list[next]?.focus({preventScroll:true});};modes.append(button);
    }
    const choices=document.createElement('div');choices.id='site-home-task-choices';choices.className='home-task-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','홈페이지 꾸미기 작업');
    for(const [area,label]of quickTasks){const button=document.createElement('button');button.type='button';button.className='btn btn-outline-secondary';button.dataset.homeQuickArea=area;button.textContent=label;button.onclick=()=>select(area);choices.append(button);}
    const extraLabel=document.createElement('label');extraLabel.htmlFor='site-home-extra-picker';extraLabel.className='visually-hidden';extraLabel.textContent='다른 꾸미기';const extra=document.createElement('select');extra.id=extraLabel.htmlFor;extra.className='form-select';
    for(const [value,label]of [['','다른 꾸미기'],['fonts','글꼴'],['impact','참여 안내'],['contact','홈페이지 연락처']]){const option=document.createElement('option');option.value=value;option.textContent=label;extra.append(option);}extra.onchange=()=>{if(extra.value)select(extra.value);};choices.append(extraLabel,extra);
    const linkedDocuments=document.createElement('div');linkedDocuments.id='site-home-linked-documents';const movedNote=document.getElementById('site-documents-moved-note');if(movedNote)linkedDocuments.append(movedNote);
    tabContent.before(modes,choices,taskContext,toolbar,linkedDocuments,workspace);inspector.append(tabContent);workspace.append(stage,inspector);
    // Keep the original tab nodes and Bootstrap handlers as the single navigation path.
    tabs.classList.add('home-visual-original-tabs');
    const activityModal=document.getElementById('activityModal');
    if(activityModal){
      activityModal.dataset.bsBackdrop='false';activityModal.dataset.bsFocus='false';
      document.getElementById('sub-activities').append(activityModal);
      for(const event of ['shown.bs.modal','hidden.bs.modal'])activityModal.addEventListener(event,()=>{inspector.scrollTop=0;queueHomePreviewUpdate();});
    }
    tabs.addEventListener('shown.bs.tab',event=>{
      const id=event.target.getAttribute('href')?.slice(1);
      const area=Object.keys(panes).find(key=>panes[key]===id)||(id==='sub-home-settings'?(homeAreas.has(selected)?selected:'hero'):'');
      if(area&&area!==selected)select(area);
    });
    const syncChoices=()=>{
      syncOrder();
      const documentsOnly=new URLSearchParams(location.search).get('scope')==='documents_admin';
      modes.hidden=documentsOnly;toolbar.hidden=documentsOnly||selected==='legal';workspace.classList.toggle('is-documents-only',documentsOnly);
    };
    new MutationObserver(syncChoices).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class','hidden']});syncChoices();
    basic.hidden=true; advanced.hidden=true;
    document.getElementById('site-home-preview-modal')?.remove();
    document.getElementById('site-home-font-sample-advanced')?.remove();
    const fontCard=document.getElementById('site-home-title-font').closest('.card-body');
    for(const kind of ['title','body']) {
      const box=document.createElement('div'); box.className='home-external-font'; box.id=`site-home-${kind}-external`;
      const heading=document.createElement('strong'); heading.textContent=`${kind==='title'?'제목':'본문'} 외부 글꼴`;
      box.append(heading);
      for(const [field,label,type,max] of [['label','글꼴 이름','text',80],['url','웹폰트 파일 주소','url',800]]) {
        const lab=document.createElement('label'); lab.className='form-label mt-2'; lab.htmlFor=`site-home-${kind}-external-${field}`; lab.textContent=label;
        const input=document.createElement('input'); input.id=lab.htmlFor; input.className='form-control'; input.type=type; input.maxLength=max;
        if(field==='url') input.placeholder='https://cdn.jsdelivr.net/…/font.woff2';
        input.addEventListener('input',()=>{document.getElementById('site-home-external-rights-confirmed').checked=false;});
        box.append(lab,input);
      }
      const check=document.createElement('button'); check.type='button'; check.className='btn btn-sm btn-outline-primary'; check.textContent='글꼴 연결 확인';
      const status=document.createElement('div'); status.className='form-text'; status.id=`site-home-${kind}-external-status`; status.setAttribute('role','status');
      check.onclick=async()=>{
        check.disabled=true;status.textContent='연결 확인 중…';
        try { await CoopHomeDesign.loadExternalFont(readExternal(false)[kind]);status.textContent='연결되었습니다.'; updateHomeFontSelection(); }
        catch(error){status.textContent=error.message || '글꼴을 불러오지 못했습니다. 주소와 외부 연결 허용 설정을 확인해 주세요.';}
        finally{check.disabled=false;}
      };
      box.append(check,status); fontCard.append(box);
    }
    const notice=document.createElement('div'); notice.id='site-home-external-rights'; notice.className='form-text mt-3';
    notice.innerHTML='<p>외부 글꼴은 등록하는 조합이 웹사이트 사용·임베딩 허용 여부를 확인하고 필요한 이용 권한을 확보해야 합니다. 방문자의 브라우저가 해당 글꼴 제공처에 접속합니다.</p><label class="form-check-label"><input type="checkbox" class="form-check-input me-2" id="site-home-external-rights-confirmed">이 글꼴의 웹사이트 사용 권한과 이용 조건을 확인했습니다.</label><p class="mt-2 mb-0">지원 주소: Google Fonts 파일 CDN, jsDelivr, cdnjs의 .woff2·.woff 파일</p>';
    fontCard.append(notice);
    mounted=true;updateExternalUi();
    window.CoopHeroSlides?.mount();
    window.CoopHeroVisual?.mount();
    window.CoopSiteLegalEditor?.mount(); // Legal definitions can arrive before this lazy workspace mounts.
    window.CoopSiteInlineHost?.mount();
    // Do not change the active tab or run a data read while taking initial baselines.
    document.querySelectorAll('[data-home-inspector-area]').forEach(node=>node.hidden=node.dataset.homeInspectorArea!=='hero');
    const initialRevision=selectionRevision;
    const syncInitialSelection=()=>{
      if(selectionRevision!==initialRevision)return; // A deliberate selection beats delayed initialization.
      const active=tabs.querySelector('a.active');
      const area=Object.keys(panes).find(key=>`#${panes[key]}`===active?.getAttribute('href'))||'hero';
      const deepLink=new URLSearchParams(location.search).get('sub');
      // Existing deep-link owners select and load their own pane after lazy boot.
      // Do not issue a banner (or duplicate target) read before that handoff.
      if(['activities','legal','plants'].includes(deepLink)&&area==='sections')return;
      select(area==='sections'?'hero':area,false);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncInitialSelection,{once:true});
    else queueMicrotask(syncInitialSelection); // Let the host take draft baselines before late initialization.
  }
  function updateExternalUi(){
    let external=false;
    for(const kind of ['title','body']) {
      const active=document.getElementById(`site-home-${kind}-font`)?.value==='external'; external ||=active;
      const box=document.getElementById(`site-home-${kind}-external`);if(box) box.hidden=!active;
    }
    const notice=document.getElementById('site-home-external-rights');if(notice)notice.hidden=!external;
  }
  function readExternal(validate=true){
    const fonts={};
    for(const kind of ['title','body']) if(document.getElementById(`site-home-${kind}-font`)?.value==='external') {
      const config={label:document.getElementById(`site-home-${kind}-external-label`)?.value.trim()||'',url:document.getElementById(`site-home-${kind}-external-url`)?.value.trim()||''};
      fonts[kind]=validate?CoopHomeDesign.validateExternalFont(config):config;
    }
    return fonts;
  }
  function setExternal(settings){
    for(const kind of ['title','body']) for(const field of ['label','url']) {
      const input=document.getElementById(`site-home-${kind}-external-${field}`);if(input)input.value=settings?.home_external_fonts?.[kind]?.[field]||'';
    }
    const rights=document.getElementById('site-home-external-rights-confirmed'); if(rights)rights.checked=settings?.external_font_rights_confirmed===true;
    updateExternalUi();
  }
  window.addEventListener('message',event=>{
    const frame=document.getElementById('site-home-preview-frame');
    if(!frame?.src || event.source!==frame.contentWindow || event.origin!==new URL(frame.src).origin) return;
    if(event.data?.type==='coop-home-preview-order')syncOrder(null,event.data.ids);
    if(event.data?.type==='coop-home-preview-area') {
      if(!select(event.data.area,false))return;
      if(event.data.area==='activities' && typeof event.data.itemId==='string' && typeof openActivityModal==='function')void openActivityModal(event.data.itemId);
      if(event.data.area==='legal')window.CoopSiteLegalEditor?.select(event.data.legalKind);
    }
  });
  root.CoopHomeVisualEditor=Object.freeze({version:'20261019-roles-1',mount,select,syncOrder,current:()=>selected,readExternal,setExternal,updateExternalUi});
})(window);
