/* Actual homepage preview + the existing inputs, draft controller and secure save path. */
(function(root){
  'use strict';
  let mounted=false, selected='hero', sectionRows=[];
  const labels={hero:'메인 배너',impact:'참여 안내',about:'조합 소개',certifications:'공식 인증·지정',activities:'우리 소식',sections:'표시 영역·순서',legal:'가입 안내·약관',contact:'연락처',design:'구성',fonts:'글꼴',progress:'발전소 현황',status:'발전량 현황',partners:'함께하는 단체',history:'연혁',faq:'자주 묻는 질문','external-news':'외부 소식',documents:'문서 관리'};
  const panes={sections:'sub-sections',about:'sub-about',certifications:'sub-certifications',activities:'sub-activities',legal:'sub-legal',progress:'sub-plants',status:'sub-generation',partners:'sub-partners',history:'sub-history',faq:'sub-faqs','external-news':'sub-external-news',documents:'sub-docs'};
  const homeAreas=new Set(['hero','impact','contact','design','fonts']);
  const utilities=['sections','legal','design','fonts','documents'];
  function syncOrder(rows){
    if(Array.isArray(rows))sectionRows=rows;
    const order=new Map([...sectionRows].sort((a,b)=>a.display_order-b.display_order).map((row,i)=>[row.id,i]));
    const fallback=['hero','about','certifications','impact','progress','status','activities','external-news','partners','history','faq','contact'];
    const anchor=area=>area==='certifications'?'about':area==='external-news'?'activities':area==='progress'?(order.has('progress')?'progress':'portfolio'):area;
    const areas=[...fallback].sort((a,b)=>(a==='hero'?-1:b==='hero'?1:(order.get(anchor(a))??100)-(order.get(anchor(b))??100))||fallback.indexOf(a)-fallback.indexOf(b)).concat(utilities);
    const picker=document.getElementById('site-home-area-picker'),strip=document.getElementById('site-home-area-strip');
    for(const area of areas){
      const option=picker?.querySelector(`option[value="${area}"]`),button=strip?.querySelector(`[data-home-select-area="${area}"]`);
      if(option){option.hidden=!available(area);picker.append(option);}
      if(button){button.hidden=!available(area);strip.append(button);}
    }
    if(picker)picker.value=selected;
  }
  function available(area){
    const link=document.querySelector(`#site-content-tabs a[href="#${panes[area]||'sub-home-settings'}"]`);
    // Scope rules hide individual nav items. The whole ERP is hidden during Auth
    // boot, which must not erase the menu choices before initialization finishes.
    return !!link && !link.classList.contains('hidden') && !link.parentElement.classList.contains('hidden') && !link.hidden && !link.parentElement.hidden;
  }
  function select(area, navigate=true){
    if(area==='portfolio') area='progress';
    if(!Object.hasOwn(labels,area)||!available(area)) return false;
    if(typeof canAccessAdminMemberTab==='function'&&!canAccessAdminMemberTab('site'))return false;
    selected=area;
    document.querySelectorAll('[data-home-inspector-area]').forEach(node=>node.hidden=node.dataset.homeInspectorArea!==(homeAreas.has(area)?area:'hero'));
    document.querySelectorAll('[data-home-select-area]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.homeSelectArea===area)));
    const picker=document.getElementById('site-home-area-picker');if(picker)picker.value=area;
    const link=document.querySelector(`#site-content-tabs a[href="#${panes[area]||'sub-home-settings'}"]`);
    if(!link.classList.contains('active'))link.click();
    document.getElementById('site-home-visual-workspace')?.classList.toggle('is-content-edit',!homeAreas.has(area));
    const legal=area==='legal';
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
    const pickerLabel=document.createElement('label');pickerLabel.className='visually-hidden';pickerLabel.htmlFor='site-home-area-picker';pickerLabel.textContent='편집할 영역';
    const picker=document.createElement('select');picker.id='site-home-area-picker';picker.className='form-select home-visual-area-picker';picker.onchange=()=>select(picker.value);
    for(const [area,label] of Object.entries(labels)) {const option=document.createElement('option');option.value=area;option.textContent=label;picker.append(option);}
    toolbar.append(pickerLabel,picker);
    const strip=document.createElement('div');strip.id='site-home-area-strip';strip.className='home-visual-area-strip';strip.setAttribute('aria-label','홈페이지 영역');toolbar.append(strip);
    for(const area of Object.keys(labels)) {
      const button=document.createElement('button'); button.type='button'; button.className='btn btn-sm btn-outline-secondary';
      button.textContent=labels[area]; button.dataset.homeSelectArea=area; button.onclick=()=>select(area); strip.append(button);
    }
    const devices=document.querySelector('.home-preview-device-group'); if(devices) { devices.classList.add('ms-auto'); toolbar.append(devices); }
    const pending=document.createElement('button');pending.type='button';pending.className='btn btn-sm btn-primary';pending.id='site-home-pending-save';pending.hidden=true;pending.textContent='메인 화면 변경 저장';pending.onclick=async()=>{if(await (window.CoopSiteInlineHost?.flush()??Promise.resolve(true)))saveHomeSettings();else myAlert('편집 내용을 확인하지 못했습니다. 다시 저장해 주세요.','warning');};toolbar.append(pending);
    const workspace=document.createElement('div'); workspace.id='site-home-visual-workspace';workspace.className='home-visual-workspace';
    const stage=document.createElement('div'); stage.className='home-visual-stage';
    stage.append(document.getElementById('site-home-preview-shell'));
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
    tabContent.before(toolbar,workspace);inspector.append(tabContent);workspace.append(stage,inspector);
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
      toolbar.hidden=documentsOnly;workspace.classList.toggle('is-documents-only',documentsOnly);
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
    window.CoopSiteInlineHost?.mount();
    // Do not change the active tab or run a data read while taking initial baselines.
    document.querySelectorAll('[data-home-inspector-area]').forEach(node=>node.hidden=node.dataset.homeInspectorArea!=='hero');
    document.addEventListener('DOMContentLoaded',()=>{
      const active=tabs.querySelector('a.active');
      const area=Object.keys(panes).find(key=>`#${panes[key]}`===active?.getAttribute('href'))||'hero';select(area,false);
    },{once:true});
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
    if(event.data?.type==='coop-home-preview-area') {
      if(!select(event.data.area,false))return;
      if(event.data.area==='activities' && typeof event.data.itemId==='string' && typeof openActivityModal==='function')void openActivityModal(event.data.itemId);
      if(event.data.area==='legal')window.CoopSiteLegalEditor?.select(event.data.legalKind);
    }
  });
  root.CoopHomeVisualEditor=Object.freeze({mount,select,syncOrder,current:()=>selected,readExternal,setExternal,updateExternalUi});
})(window);
