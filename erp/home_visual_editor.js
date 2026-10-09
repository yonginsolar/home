/* Actual homepage preview + the existing inputs, draft controller and secure save path. */
(function(root){
  'use strict';
  let mounted=false, selected='hero';
  const labels={hero:'메인 배너',impact:'참여 안내',contact:'연락처',design:'구성',fonts:'글꼴'};
  function select(area, navigate=true){
    if(!labels[area]) return false;
    selected=area;
    document.querySelectorAll('[data-home-inspector-area]').forEach(node=>node.hidden=node.dataset.homeInspectorArea!==area);
    document.querySelectorAll('[data-home-select-area]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.homeSelectArea===area)));
    if(navigate && ['hero','impact','contact'].includes(area)) {
      const frame=document.getElementById('site-home-preview-frame');
      if(frame?.src) frame.contentWindow?.postMessage({type:'coop-home-preview-select',area},new URL(frame.src).origin);
    }
    return true;
  }
  function mount(){
    if(mounted) return;
    const pane=document.getElementById('sub-home-settings');
    if(!pane) return;
    const basic=document.getElementById('site-home-basic-panel'), advanced=document.getElementById('site-home-advanced-panel');
    const areas={hero:[],impact:[],contact:[],design:[],fonts:[]};
    for(const container of [basic,advanced]) for(const card of [...container.children]) {
      const area=card.querySelector('[id^="site-home-hero-"]')?'hero':card.querySelector('[id^="site-home-impact-"]')?'impact':card.querySelector('[id^="site-home-contact-"]')?'contact':card.id==='site-home-font-settings'||card.querySelector('#site-home-title-font')?'fonts':'design';
      areas[area].push(card);
    }
    const toolbar=document.createElement('div'); toolbar.className='home-visual-toolbar';
    for(const [area,label] of Object.entries(labels)) {
      const button=document.createElement('button'); button.type='button'; button.className='btn btn-sm btn-outline-secondary';
      button.textContent=label; button.dataset.homeSelectArea=area; button.onclick=()=>select(area); toolbar.append(button);
    }
    const devices=document.querySelector('.home-preview-device-group'); if(devices) { devices.classList.add('ms-auto'); toolbar.append(devices); }
    const workspace=document.createElement('div'); workspace.className='home-visual-workspace';
    const stage=document.createElement('div'); stage.className='home-visual-stage';
    stage.append(document.getElementById('site-home-preview-shell'));
    const inspector=document.createElement('div'); inspector.className='home-visual-inspector';
    for(const [area,cards] of Object.entries(areas)) {
      const group=document.createElement('div'); group.dataset.homeInspectorArea=area;
      for(const card of cards) { if(card.tagName==='DETAILS') card.open=card.id==='site-home-template-settings'; group.append(card); }
      inspector.append(group);
    }
    workspace.append(stage,inspector); pane.append(toolbar,workspace);
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
    mounted=true;select(selected,false); updateExternalUi();
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
    if(event.data?.type==='coop-home-preview-area') select(event.data.area,false);
  });
  root.CoopHomeVisualEditor=Object.freeze({mount,select,readExternal,setExternal,updateExternalUi});
})(window);
