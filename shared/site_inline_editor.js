/* Only an authenticated editor parent activates inline editing. No network or persistence. */
(function(root){
 'use strict';
 if(new URLSearchParams(location.search).get('home_preview')!=='1'||root.parent===root)return;
 const targets={heroTitle:'#public-hero-title',heroSubtitle:'#public-hero-subtitle',heroButton:'#public-hero-cta',impactTitle:'#public-impact-title',impactDescription:'#public-impact-description',impactKicker:'#public-impact-kicker span',impactButton:'#public-impact-cta',aboutTitle:'#about-title',aboutSubtitle:'#about-subtitle',aboutContent:'#about-content',aboutList:'#about-list',contactPhone:'#public-contact-phone',contactEmail:'#public-contact-email',contactAddress:'#public-contact-address',activityTitle:'#home-preview-activity-article h3',activityContent:'#home-preview-activity-body'};
 let origin='',fields={},sections=[],active=null,pending=null,selectionRange=null,toolbar,sectionMenu,status,requested='';
 function send(message){if(origin)root.parent.postMessage(message,origin);}
 function trusted(event){if(event.source!==root.parent)return false;try{const u=new URL(event.origin);return u.protocol===location.protocol&&u.port===location.port&&u.hostname.replace(/^(www|erp)\./,'')===location.hostname.replace(/^(www|erp)\./,'');}catch(_){return false;}}
 function fieldValue(){return active?.kind==='rich'?active.node.innerHTML:(active?.node.innerText??active?.node.textContent??'');}
 function announce(text){status.textContent=text;status.hidden=!text;}
 function transmit(){if(!active)return true;const value=fieldValue();if(value.length>active.maxLength){announce('입력할 수 있는 길이를 초과했습니다.');return false;}send({type:'coop-home-inline-edit',field:active.key,value});active.last=value;return true;}
 function finish(cancel=false){
  if(!active)return true;const item=active;
  if(cancel){if(item.kind==='rich')item.node.innerHTML=item.initial;else item.node.textContent=item.initial;}
  if(!transmit())return false;
  if(fields[item.key])fields[item.key].value=item.last;
  item.node.removeAttribute('contenteditable');item.node.classList.remove('home-inline-active');active=null;selectionRange=null;toolbar.hidden=true;announce('');
  // An echoed preview may predate the last keystroke. Request a fresh snapshot
  // after the final field message instead of applying that stale echo on blur.
  pending=null;send({type:'coop-home-preview-ready'});return true;
 }
 function begin(key,node){
  const config=fields[key];if(!config||!node)return false;if(active?.node===node)return true;if(!finish())return false;
  active={...config,key,node,initial:config.value,last:config.value,undo:[],redo:[]};
  if(config.kind==='rich')node.innerHTML=root.sanitizeHtml(String(config.value||''));else node.textContent=config.value;
  node.hidden=false;node.removeAttribute('hidden');node.classList.add('home-inline-active');node.setAttribute('contenteditable',config.kind==='rich'?'true':'plaintext-only');node.focus();
  const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const sel=root.getSelection();sel.removeAllRanges();sel.addRange(range);showToolbar();return true;
 }
 function pointToolbar(rect){toolbar.style.left=Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,rect.left))+'px';toolbar.style.top=Math.max(8,rect.top-toolbar.offsetHeight-10)+'px';}
 function showToolbar(){
  if(!active)return;toolbar.hidden=false;const rich=active.kind==='rich',hero=active.key==='heroTitle';
  for(const button of toolbar.querySelectorAll('[data-command]'))button.hidden=!['done','undo','redo'].includes(button.dataset.command)&&!(rich&&button.dataset.command!=='clearHighlight'||hero&&['highlight','clearHighlight'].includes(button.dataset.command));
  toolbar.querySelector('select').hidden=!rich;
  const sel=root.getSelection();if(sel.rangeCount&&active.node.contains(sel.anchorNode)&&active.node.contains(sel.focusNode)&&!sel.isCollapsed){selectionRange=sel.getRangeAt(0).cloneRange();pointToolbar(selectionRange.getBoundingClientRect?.()||active.node.getBoundingClientRect());}else pointToolbar(active.node.getBoundingClientRect());
 }
 function remember(){if(!active)return;active.undo.push(active.last);if(active.undo.length>100)active.undo.shift();active.redo=[];}
 function restore(value){if(active.kind==='rich')active.node.innerHTML=root.sanitizeHtml(value);else active.node.textContent=value;selectionRange=null;transmit();showToolbar();}
 function command(name,color='#166534'){
  if(!active)return;if(name==='done'){finish();return;}
  if(name==='undo'||name==='redo'){const from=name==='undo'?active.undo:active.redo,to=name==='undo'?active.redo:active.undo;if(from.length){to.push(fieldValue());restore(from.pop());}return;}
  if(name==='clearHighlight'&&active.key==='heroTitle'){send({type:'coop-home-inline-edit',field:'heroHighlight',value:''});return;}
  if(!selectionRange||selectionRange.collapsed||!active.node.contains(selectionRange.commonAncestorContainer)){announce('서식을 적용할 글자를 선택해 주세요.');return;}
  if(active.key==='heroTitle'){
   const text=selectionRange.toString();if(text.length>60){announce('강조할 문구는 60자 이내로 선택해 주세요.');return;}
   transmit();send({type:'coop-home-inline-edit',field:'heroHighlight',value:text});const wrapper=document.createElement('span');wrapper.append(selectionRange.extractContents());selectionRange.insertNode(wrapper);selectionRange=null;return;
  }
  if(active.kind!=='rich')return;
  let tag={bold:'strong',italic:'em',underline:'u',highlight:'span',color:'span',link:'a'}[name];if(!tag)return;
  const wrapper=document.createElement(tag);
  if(name==='highlight')wrapper.style.backgroundColor='#fef08a';
  if(name==='color'&&/^#[a-f0-9]{6}$/i.test(color))wrapper.style.color=color;
  if(name==='link'){
   const url=root.prompt('연결할 주소','https://');if(url===null)return;
   if(!/^(https?:\/\/|mailto:|tel:|\/[^/]|#[^\s])/i.test(url.trim())){announce('https://, /, #, mailto: 또는 tel:로 시작하는 주소를 입력해 주세요.');return;}
   wrapper.setAttribute('href',url.trim());wrapper.setAttribute('rel','noopener noreferrer');
  }
  remember();wrapper.append(selectionRange.extractContents());selectionRange.insertNode(wrapper);const range=document.createRange();range.selectNodeContents(wrapper);const sel=root.getSelection();sel.removeAllRanges();sel.addRange(range);selectionRange=range;transmit();showToolbar();
 }
 function ui(){
  if(toolbar)return;toolbar=document.createElement('div');toolbar.className='home-inline-toolbar';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','글자 편집');
  for(const [name,label] of [['bold','굵게'],['italic','기울임'],['underline','밑줄'],['highlight','강조'],['clearHighlight','강조 해제'],['color','글자색'],['link','링크'],['undo','되돌리기'],['redo','다시 실행'],['done','완료']]){const button=document.createElement('button');button.type='button';button.dataset.command=name;button.textContent=label;button.onmousedown=e=>e.preventDefault();button.onclick=()=>command(name);toolbar.append(button);}
  const colors=document.createElement('select');colors.setAttribute('aria-label','글자색 선택');for(const [value,label] of [['#166534','초록'],['#1d4ed8','파랑'],['#b91c1c','빨강'],['#7e22ce','보라'],['#111827','검정'],['#ffffff','흰색']]){const option=document.createElement('option');option.value=value;option.textContent=label;colors.append(option);}colors.onchange=()=>command('color',colors.value);toolbar.append(colors);
  status=document.createElement('div');status.className='home-inline-status';status.setAttribute('role','status');status.hidden=true;
  sectionMenu=document.createElement('div');sectionMenu.className='home-inline-section-menu';sectionMenu.hidden=true;root.document.body.append(toolbar,sectionMenu,status);
 }
 function refresh(config,rows){
  ui();fields=config&&typeof config==='object'?config:{};sections=Array.isArray(rows)?rows:[];
  for(const [key,selector] of Object.entries(targets)){const node=document.querySelector(selector);if(!node)continue;node.classList.toggle('home-inline-editable',Object.hasOwn(fields,key));if(Object.hasOwn(fields,key)){node.dataset.inlineField=key;node.setAttribute('tabindex','0');node.setAttribute('aria-label',key==='heroTitle'?'메인 제목 수정':key==='aboutContent'?'조합 소개 본문 수정':'내용 수정');}else{delete node.dataset.inlineField;node.removeAttribute('contenteditable');}}
  for(const area of new Set(['hero','about','impact','contact','activities',...sections.map(row=>row.id)])){
   const section=document.getElementById(area);if(!section)continue;
   let actions=section.querySelector(':scope > .home-inline-section-actions');if(!actions){actions=document.createElement('div');actions.className='home-inline-section-actions';section.append(actions);}actions.replaceChildren();
   for(const [kind,label] of [...(['hero','about','impact'].includes(area)?[['image','사진']]:[]),...(['hero','impact'].includes(area)?[['button','버튼']]:[]),['section','영역']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.inlineControl=kind;b.dataset.inlineArea=area;actions.append(b);}
  }
  if(requested&&fields[requested]){const key=requested;requested='';begin(key,document.querySelector(targets[key]));}
 }
 function sectionControls(area){
  finish();sectionMenu.replaceChildren();const row=sections.find(x=>x.id===area);if(!row)return;
  const sorted=[...sections].sort((a,b)=>a.display_order-b.display_order),i=sorted.findIndex(x=>x.id===area);
  for(const [action,label,disabled] of [['up','위로',i<=0],['down','아래로',i===sorted.length-1],['hide','숨기기',false]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.onclick=()=>{send({type:'coop-home-inline-section',area,action});sectionMenu.hidden=true;};sectionMenu.append(b);}
  sectionMenu.hidden=false;const rect=document.getElementById(area).getBoundingClientRect();sectionMenu.style.top=Math.max(8,Math.min(innerHeight-60,rect.top+16))+'px';sectionMenu.style.right='16px';
 }
 root.addEventListener('message',event=>{
  if(!trusted(event))return;const data=event.data;
  if(data?.type==='coop-home-preview-settings'){origin=event.origin;const config=data.settings?.inline_fields||{};if(active&&!Object.hasOwn(config,active.key)){active.node.removeAttribute('contenteditable');active=null;pending=null;toolbar&&(toolbar.hidden=true);root.applyHomePreviewDraft?.(data.settings);}if(!active)refresh(config,data.settings?.site_preview?.sections);}
  if(event.origin!==origin)return;
  if(data?.type==='coop-home-preview-select'||data?.type==='coop-home-preview-navigate')finish();
  if(data?.type==='coop-home-inline-flush'){send({type:'coop-home-inline-flushed',ok:finish()});}
  if(data?.type==='coop-home-inline-result'&&data.accepted===false){announce('이 내용은 지금 수정할 수 없습니다. 설정과 입력 길이를 확인해 주세요.');}
 });
 document.addEventListener('click',event=>{
  if(!origin)return;
  const control=event.target.closest('[data-inline-control]');if(control){event.preventDefault();event.stopImmediatePropagation();const area=control.dataset.inlineArea;if(control.dataset.inlineControl==='section')sectionControls(area);else{finish();send({type:'coop-home-inline-control',area,kind:control.dataset.inlineControl});}return;}
  // Let each toolbar button receive its own click before stopping bubbling.
  if(event.target.closest('.home-inline-toolbar,.home-inline-section-menu'))return;
  let node=event.target.closest('[data-inline-field]');
  if(!node){const found=Object.entries(targets).find(([,selector])=>event.target.closest(selector));if(found){requested=found[0];send({type:'coop-home-preview-area',area:requested.startsWith('about')?'about':requested.startsWith('activity')?'activities':requested.startsWith('impact')?'impact':requested.startsWith('contact')?'contact':'hero'});}finish();return;}
  if(active?.node!==node)event.preventDefault();event.stopImmediatePropagation();begin(node.dataset.inlineField,node);
 },true);
 document.addEventListener('input',event=>{if(active?.node.contains(event.target)){remember();transmit();}},true);
 document.addEventListener('compositionend',()=>{if(active)transmit();});
 document.addEventListener('selectionchange',()=>{if(active)showToolbar();});
 document.addEventListener('scroll',()=>{if(active)showToolbar();},true);
 document.addEventListener('contextmenu',event=>{if(active?.node.contains(event.target)){event.preventDefault();showToolbar();}});
 document.addEventListener('keydown',event=>{
  if(!origin)return;if(event.key==='Escape'){if(active){event.preventDefault();finish(true);}sectionMenu.hidden=true;}
  if(event.key==='Enter'&&!active&&event.target.dataset.inlineField){event.preventDefault();begin(event.target.dataset.inlineField,event.target);}
  if(active&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();command(event.shiftKey?'redo':'undo');}
 });
 document.addEventListener('paste',event=>{if(!active?.node.contains(event.target))return;event.preventDefault();const text=event.clipboardData?.getData('text/plain')||'',sel=root.getSelection();if(!sel.rangeCount)return;const range=sel.getRangeAt(0);if(!active.node.contains(range.commonAncestorContainer))return;remember();range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);transmit();});
 document.addEventListener('drop',event=>{if(active?.node.contains(event.target))event.preventDefault();});
 root.CoopSiteInline=Object.freeze({defer(settings){if(!active)return false;pending=settings;return true;},refresh,finish,isEditing(area){return !!active&&active.key.toLowerCase().startsWith(area==='activities'?'activity':area);}});
 const style=document.createElement('style');style.textContent='.home-inline-editable{cursor:text!important}.home-inline-editable:hover{outline:2px dashed #22c55e;outline-offset:5px}.home-inline-active{outline:2px solid #22c55e!important;min-height:1.5em;white-space:pre-wrap}.home-inline-toolbar,.home-inline-section-menu{position:fixed;z-index:100000;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 16px);padding:8px;background:#fff;color:#18322b;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 30px #0003;font:14px/1.5 Pretendard,sans-serif;word-break:keep-all}.home-inline-toolbar button,.home-inline-section-menu button,.home-inline-section-actions button{background:#fff;color:#18322b;border:1px solid #d3ded9;border-radius:6px;padding:6px 10px;font:inherit}.home-inline-section-actions{position:absolute;right:16px;top:16px;z-index:1000;display:flex;gap:5px;font:14px/1.5 Pretendard,sans-serif}section:has(>.home-inline-section-actions){position:relative}.home-inline-status{position:fixed;bottom:12px;left:12px;z-index:100001;background:#fff;color:#9f1239;padding:12px;border:1px solid #fda4af;border-radius:8px}.home-inline-toolbar[hidden],.home-inline-section-menu[hidden],.home-inline-status[hidden]{display:none!important}';document.head.append(style);
})(window);
