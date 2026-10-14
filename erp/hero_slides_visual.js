/* Visual adapter only: exact original fields/Files, same draft, upload and save authority. */
(function(root){
 'use strict';
 let mounted=false,panel,ui,strip,canvas,words,title,subtitle,button,selected='',details,drag=null,dragId='',singleFile=null,singleUrl='';
 const thumbs=new Map(),singleFields={title:'site-home-hero-title',subtitle:'site-home-hero-subtitle',button_label:'site-home-hero-cta-label',text_align:'site-home-hero-text-align',text_position:'site-home-hero-text-position',overlay:'site-home-hero-overlay'};
 function el(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;}
 function original(id){return document.getElementById(id);}
 function state(){return root.CoopHeroSlides.view();}
 function current(){const s=state();if(s.enabled){const row=s.items.find(x=>x.id===selected)||s.items[0];selected=row?.id||'';return row||null;}
  const value=Object.fromEntries(Object.entries(singleFields).map(([k,id])=>[k,original(id)?.value||'']));value.text_position=value.text_position||'center';value.button_url=typeof readHomeCtaValue==='function'?readHomeCtaValue('hero'):'';
  const f=original('site-home-hero-image-file')?.files?.[0];if(f!==singleFile){if(singleUrl)URL.revokeObjectURL(singleUrl);singleFile=f||null;singleUrl=f?URL.createObjectURL(f):'';}
  return {id:'single',value,image:singleUrl||root.CoopDisplayImages?.display(original('site-home-hero-image-url')?.value)||''};
 }
 function change(field,value){const s=state();if(!s.editable)return false;if(s.enabled)return root.CoopHeroSlides.edit(selected,field,value);const n=original(singleFields[field]);if(!n||n.disabled)return false;n.value=String(value);n.dispatchEvent(new Event(n.tagName==='SELECT'||n.type==='checkbox'?'change':'input',{bubbles:true}));draw();return true;}
 function toggle(id,value){const n=original(id);if(!state().editable||!n||n.disabled)return;n.type==='checkbox'?n.checked=value:n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));draw();}
 function action(kind){const s=state();if(!s.editable)return;if(s.enabled)root.CoopHeroSlides.action(selected,kind);else if(kind==='photo')original('site-home-hero-image-file')?.click();}
 function openDetails(focus){details.open=true;const s=state();panel.querySelectorAll('[data-slide-card]').forEach(n=>{n.hidden=s.enabled&&n.dataset.slideCard!==selected;});const scope=s.enabled?panel.querySelector(`[data-slide-card="${selected}"]`):panel;if(focus){const n=scope?.querySelector(focus);n?.scrollIntoView({block:'nearest'});n?.focus();}}
 function toolbar(label,handler,cls='btn btn-sm btn-outline-secondary'){const n=el('button',cls,label);n.type='button';n.onclick=handler;return n;}
 function setText(n,value){if(document.activeElement!==n)n.textContent=String(value||'');}
 function draw(){
  if(!mounted)return;const s=state(),row=current();strip.hidden=!s.enabled;canvas.hidden=s.enabled&&!row;
  ui.querySelectorAll('button').forEach(n=>n.disabled=!s.editable);
  ui.querySelectorAll('[data-banner-mode]').forEach(n=>{const active=(n.dataset.bannerMode==='slides')===s.enabled;n.classList.toggle('active',active);n.setAttribute('aria-pressed',String(active));});
  for(const [id,n]of thumbs)if(!s.items.some(x=>x.id===id)){n.remove();thumbs.delete(id);}
  for(const [i,item]of s.items.entries()){let thumb=thumbs.get(item.id);if(!thumb){thumb=toolbar('',()=>{selected=item.id;draw();});thumb.className='hero-visual-thumb';thumb.dataset.bannerThumb=item.id;thumb.draggable=true;thumb.append(el('img'),el('span'));
   thumb.addEventListener('dragstart',e=>{if(!state().editable){e.preventDefault();return;}dragId=item.id;e.dataTransfer?.setData('text/plain','banner-photo');});thumb.addEventListener('dragover',e=>{if(dragId&&state().editable)e.preventDefault();});thumb.addEventListener('drop',e=>{e.preventDefault();if(dragId)root.CoopHeroSlides.move(dragId,item.id);dragId='';});thumb.addEventListener('dragend',()=>dragId='');strip.append(thumb);thumbs.set(item.id,thumb);}
   strip.append(thumb);thumb.disabled=!s.editable;thumb.setAttribute('aria-label','사진 '+(i+1)+' 선택');thumb.setAttribute('aria-pressed',String(item.id===selected));thumb.classList.toggle('active',item.id===selected);const im=thumb.querySelector('img');im.alt='사진 '+(i+1);if(item.thumb){if(im.getAttribute('src')!==item.thumb)im.src=item.thumb;im.hidden=false;}else{im.removeAttribute('src');im.hidden=true;}thumb.querySelector('span').textContent='사진 '+(i+1);
  }
  const add=ui.querySelector('[data-visual-add]');add.hidden=!s.enabled;add.disabled=!s.editable||s.items.length>=4;
  const remove=ui.querySelector('[data-visual-remove]');remove.hidden=!s.enabled;remove.disabled=!s.editable||!row;
  const index=s.items.findIndex(x=>x.id===selected);for(const [kind,blocked]of[['up',index<=0],['down',index<0||index>=s.items.length-1]]){const n=ui.querySelector(`[data-visual-order="${kind}"]`);n.hidden=!s.enabled;n.disabled=!s.editable||blocked;}
  const edit=ui.querySelector('[data-visual-details]');edit.disabled=!s.editable||(s.enabled&&!row);
  const contentShown=original('site-home-hero-content-visible')?.checked!==false;words.hidden=!contentShown;
  const hide=ui.querySelector('[data-visual-wording]');hide.setAttribute('aria-pressed',String(!contentShown));hide.textContent=contentShown?'문구 숨기기':'문구 표시';
  const play=ui.querySelector('[data-visual-play]');play.hidden=!s.enabled;play.setAttribute('aria-pressed',String(original('site-home-slide-autoplay')?.checked!==false));
  if(row){canvas.style.backgroundImage=row.image?`url(${JSON.stringify(row.image)})`:'';canvas.classList.toggle('has-photo',!!row.image);canvas.style.setProperty('--banner-shade',String(Number(row.value.overlay??35)/100));canvas.style.backgroundPosition=row.value.image_position||'center';words.style.textAlign=row.value.text_align||'center';canvas.dataset.vertical=row.value.text_position||'center';
   setText(title,row.value.title);setText(subtitle,row.value.subtitle);setText(button,row.value.button_label);
  }else{canvas.style.backgroundImage='';setText(title,'');setText(subtitle,'');setText(button,'');}
  [title,subtitle,button].forEach(n=>{n.contentEditable=String(!!row&&s.editable);n.setAttribute('aria-disabled',String(!row||!s.editable));});
  panel.querySelectorAll('[data-slide-card]').forEach(n=>{n.hidden=s.enabled&&n.dataset.slideCard!==selected;});
 }
 function finishDrag(event,cancel=false){if(!drag)return;const pending=drag;drag=null;canvas.classList.remove('is-moving');try{pending.node.releasePointerCapture(pending.pointerId);}catch(_){}if(cancel||!state().editable)return;
  const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;change('text_align',x<.33?'left':x>.67?'right':'center');change('text_position',y<.33?'top':y>.67?'bottom':'center');draw();
 }
 function mount(){
  if(mounted)return;root.CoopHeroSlides?.mount();panel=original('site-home-slide-config');if(!panel)return;
  details=el('details','hero-visual-details');details.append(el('summary','','세부 설정'));while(panel.firstChild)details.append(panel.firstChild);panel.append(details);
  ui=el('section','hero-visual-ui');ui.setAttribute('aria-label','배너 화면 편집');panel.prepend(ui);
  const bar=el('div','hero-visual-toolbar');ui.append(bar);
  for(const [mode,label]of[['single','한 장 배너'],['slides','슬라이드 배너']]){const b=toolbar(label,()=>toggle('site-home-slide-mode',mode));b.dataset.bannerMode=mode;bar.append(b);}
  const wording=toolbar('문구 숨기기',()=>toggle('site-home-hero-content-visible',original('site-home-hero-content-visible')?.checked===false));wording.dataset.visualWording='';bar.append(wording);
  const autoplay=toolbar('자동 전환',()=>toggle('site-home-slide-autoplay',original('site-home-slide-autoplay')?.checked===false));autoplay.dataset.visualPlay='';bar.append(autoplay);
  strip=el('div','hero-visual-thumbnails');strip.setAttribute('aria-label','배너 사진 순서');ui.append(strip);
  canvas=el('div','hero-visual-canvas');canvas.setAttribute('aria-label','선택한 배너 미리보기');ui.append(canvas);
  words=el('div','hero-visual-words');canvas.append(words);
  const handle=toolbar('↕ 문구 이동',()=>{});handle.className='hero-visual-move';handle.setAttribute('aria-label','문구 위치 이동');words.append(handle);
  handle.addEventListener('pointerdown',e=>{if(!state().editable||e.button!==0)return;drag={node:handle,pointerId:e.pointerId};handle.setPointerCapture(e.pointerId);canvas.classList.add('is-moving');e.preventDefault();});handle.addEventListener('pointermove',e=>{if(!drag)return;const b=canvas.getBoundingClientRect();canvas.dataset.dropX=e.clientX<b.left+b.width/3?'left':e.clientX>b.left+b.width*2/3?'right':'center';canvas.dataset.dropY=e.clientY<b.top+b.height/3?'top':e.clientY>b.top+b.height*2/3?'bottom':'center';});handle.addEventListener('pointerup',finishDrag);handle.addEventListener('pointercancel',e=>finishDrag(e,true));handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!state().editable)return;e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight')change('text_align',e.key==='ArrowLeft'?'left':'right');else change('text_position',e.key==='ArrowUp'?'top':'bottom');draw();});
  for(const [field,tag,placeholder,max]of[['title','h3','제목을 입력하세요',120],['subtitle','p','설명을 입력하세요',240],['button_label','div','버튼 문구를 입력하세요',40]]){const n=el(tag,'hero-visual-editable');n.dataset.placeholder=placeholder;n.setAttribute('role','textbox');n.setAttribute('aria-label',field==='title'?'배너 제목':field==='subtitle'?'배너 설명':'배너 버튼 문구');n.setAttribute('aria-multiline',String(field!=='button_label'));n.addEventListener('input',()=>{const limit=field==='subtitle'&&!state().enabled?300:max,value=String(n.innerText??n.textContent).replace(/\r/g,'');if(value.length>limit)n.textContent=value.slice(0,limit);change(field,value.slice(0,limit));});n.addEventListener('paste',e=>{e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'',selection=root.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!n.contains(range.commonAncestorContainer))return;range.deleteContents();const t=document.createTextNode(text);range.insertNode(t);range.setStartAfter(t);range.collapse(true);selection.removeAllRanges();selection.addRange(range);n.dispatchEvent(new Event('input',{bubbles:true}));});words.append(n);if(field==='title')title=n;else if(field==='subtitle')subtitle=n;else button=n;}
  const actions=el('div','hero-visual-toolbar');ui.append(actions);const photo=toolbar('사진 선택·교체',()=>action('photo'));actions.append(photo);
  const add=toolbar('＋ 사진 추가',()=>{if(!state().editable)return;panel.querySelector('[data-slide-add]')?.click();selected=state().items.at(-1)?.id||selected;draw();});add.dataset.visualAdd='';actions.append(add);
  const remove=toolbar('사진 삭제',()=>action('remove'));remove.dataset.visualRemove='';actions.append(remove);
  for(const [kind,label]of[['up','← 앞으로'],['down','뒤로 →']]){const n=toolbar(label,()=>action(kind));n.dataset.visualOrder=kind;n.setAttribute('aria-label',kind==='up'?'선택한 사진을 앞으로 이동':'선택한 사진을 뒤로 이동');actions.append(n);}
  const link=toolbar('연결 설정',()=>{openDetails(state().enabled?'select[id$="-button-url"]':'#site-home-banner-click');});link.dataset.visualDetails='';actions.append(link);
  const hint=el('p','form-text mb-0','문구를 눌러 수정하고, 문구 이동 손잡이를 끌어 위치를 정하세요. 사진 순서는 썸네일을 끌어 바꿀 수 있습니다.');ui.append(hint);
  panel.classList.add('has-visual-banner');panel.addEventListener('coop-banner-change',draw);panel.addEventListener('input',e=>{if(!e.target.closest('.hero-visual-ui'))draw();});panel.addEventListener('change',e=>{if(!e.target.closest('.hero-visual-ui'))draw();});document.addEventListener('input',e=>{if(Object.values(singleFields).includes(e.target.id)||e.target.id==='site-home-hero-image-file')draw();});document.addEventListener('change',e=>{if(['site-home-hero-content-visible','site-home-hero-image-file'].includes(e.target.id))draw();});
  mounted=true;draw();
 }
 root.CoopHeroVisual=Object.freeze({mount,refresh:draw,version:'1.0.0'});
})(window);
