/* Only an authenticated editor parent activates inline editing. No network or persistence. */
(function(root){
 'use strict';
 if(new URLSearchParams(location.search).get('home_preview')!=='1'||root.parent===root)return;
 const targets={heroTitle:'#public-hero-title',heroSubtitle:'#public-hero-subtitle',heroButton:'#public-hero-cta',impactTitle:'#public-impact-title',impactDescription:'#public-impact-description',impactKicker:'#public-impact-kicker span',impactButton:'#public-impact-cta span',aboutTitle:'#about-title',aboutSubtitle:'#about-subtitle',aboutContent:'#about-content',aboutList:'#about-list',contactPhone:'#public-contact-phone',contactEmail:'#public-contact-email',contactAddress:'#public-contact-address',activityTitle:'#home-preview-activity-article h3',activityContent:'#home-preview-activity-body'};
 let origin='',fields={},sections=[],active=null,pending=null,selectionRange=null,toolbar,sectionMenu,status,requested='';
 const histories=new Map();let requestSequence=0,refreshSignature='',refreshNodes=[];
 function send(message){if(origin)root.parent.postMessage(message,origin);}
 function trusted(event){if(event.source!==root.parent)return false;try{const u=new URL(event.origin);return u.protocol===location.protocol&&u.port===location.port&&u.hostname.replace(/^(www|erp)\./,'')===location.hostname.replace(/^(www|erp)\./,'');}catch(_){return false;}}
 function readPlain(){const node=active.node.cloneNode(true);node.querySelectorAll('[data-inline-caret]').forEach(n=>n.remove());return root.CoopTextStyles.read(node);}
 function fieldValue(){return active?.kind==='rich'?(root.CoopTextStyles?.sourceHtml(active.node)??active.node.innerHTML):root.CoopTextStyles?readPlain().value:(active?.node.innerText??active?.node.textContent??'');}
 function announce(text){status.textContent=text;status.hidden=!text;}
 function transmit(value=fieldValue(),restore=false){if(!active)return true;if(value.length>active.maxLength){announce('입력할 수 있는 길이를 초과했습니다.');return false;}if(active.kind==='plain'&&root.CoopTextStyles)active.styles=readPlain().runs;root.CoopTextStyles?.adapt(active.node);active.last=value;active.renderedLast=fieldValue();active.latestRequest=++requestSequence;send({type:'coop-home-inline-edit',field:active.key,value,restore,...(active.kind==='plain'&&root.CoopTextStyles?{styles:active.styles}:{}),requestId:active.latestRequest});return true;}
 function bookmark(){
  if(!active)return null;const sel=root.getSelection();const range=sel.rangeCount&&active.node.contains(sel.anchorNode)?sel.getRangeAt(0):selectionRange;if(!range)return null;
  if(!active.node.contains(range.startContainer)||!active.node.contains(range.endContainer))return null;
  const before=document.createRange();before.selectNodeContents(active.node);before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length;before.setEnd(range.endContainer,range.endOffset);return {start,end:before.toString().length};
 }
 function reselect(mark){
  selectionRange=null;if(!active||!mark)return;
  const walker=document.createTreeWalker(active.node,root.NodeFilter.SHOW_TEXT),nodes=[];let node,total=0;
  while((node=walker.nextNode())){nodes.push({node,start:total,end:total+node.length});total+=node.length;}
  const point=offset=>{offset=Math.max(0,Math.min(total,offset));const item=nodes.find(x=>offset<=x.end);return item?[item.node,offset-item.start]:[active.node,0];};
  const start=point(mark.start),end=point(mark.end),range=document.createRange();range.setStart(...start);range.setEnd(...end);const sel=root.getSelection();sel.removeAllRanges();sel.addRange(range);selectionRange=range.cloneRange();
 }
 function snapshot(previous=false){return {value:active.last,highlight:active.highlight,styles:active.styles,selection:previous?(active.beforeSelection||bookmark()):bookmark()};}
 function paintHero(value){
  const mark=bookmark();active.node.replaceChildren();const at=active.highlight?value.indexOf(active.highlight):-1;
  if(at<0)active.node.textContent=value;else{active.node.append(document.createTextNode(value.slice(0,at)));const span=document.createElement('span');span.textContent=active.highlight;active.node.append(span,document.createTextNode(value.slice(at+active.highlight.length)));}reselect(mark);
 }
 function sendHighlight(){if(fields.heroHighlight)fields.heroHighlight.value=active.highlight;send({type:'coop-home-inline-edit',field:'heroHighlight',value:active.highlight});}
 function finish(cancel=false){
  if(!active)return true;const item=active;
  if(cancel){if(item.kind==='rich')item.node.innerHTML=root.sanitizeHtml(item.initial);else if(root.CoopTextStyles)root.CoopTextStyles.paint(item.node,item.initial,item.initialStyles);else item.node.textContent=item.initial;if(item.key==='heroTitle'){item.highlight=item.initialHighlight;if(!root.CoopTextStyles)paintHero(item.initial);sendHighlight();}}
  if(item.changed&&(cancel?!transmit(item.initial,true):fieldValue().length>item.maxLength||(fieldValue()!==item.renderedLast&&!transmit())))return false;
  if(fields[item.key]){fields[item.key].value=item.last;fields[item.key].styles=item.styles;}
  histories.set(item.key,{value:item.last,highlight:item.highlight,styles:item.styles,undo:item.undo,redo:item.redo});
  item.node.querySelectorAll('[data-inline-caret]').forEach(n=>n.remove());root.CoopTextStyles?.adapt(item.node);item.node.removeAttribute('contenteditable');item.node.classList.remove('home-inline-active');active=null;selectionRange=null;toolbar.hidden=true;announce('');
  // An echoed preview may predate the last keystroke. Request a fresh snapshot
  // after the final field message instead of applying that stale echo on blur.
  pending=null;root.resetHomePreviewField?.(item.key);send({type:'coop-home-preview-ready'});return true;
 }
 function begin(key,node){
  const config=fields[key];if(!config||!node)return false;if(active?.node===node)return true;if(!finish())return false;
  const highlight=key==='heroTitle'?String(fields.heroHighlight?.value||''):'',history=histories.get(key),styles=config.styles||[],reuse=history?.value===config.value&&history.highlight===highlight&&JSON.stringify(history.styles||[])===JSON.stringify(styles);
  active={...config,key,node,initial:config.value,last:config.value,styles,initialStyles:styles,highlight,initialHighlight:highlight,undo:reuse?history.undo:[],redo:reuse?history.redo:[],changed:false};
  if(config.kind==='rich')node.innerHTML=root.sanitizeHtml(String(config.value||''));else if(root.CoopTextStyles)root.CoopTextStyles.paint(node,config.value,styles);else node.textContent=config.value;
  if(key==='heroTitle'&&!root.CoopTextStyles)paintHero(config.value);
  root.CoopTextStyles?.adapt(node);
  node.hidden=false;node.removeAttribute('hidden');if(key.startsWith('about'))node.style.removeProperty('display');node.classList.add('home-inline-active');node.classList.toggle('home-inline-plain',config.kind==='plain');node.setAttribute('contenteditable',config.kind==='rich'?'true':'plaintext-only');node.focus({preventScroll:true});
  const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const sel=root.getSelection();sel.removeAllRanges();sel.addRange(range);showToolbar();return true;
 }
 function pointToolbar(rect){toolbar.style.left=Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,rect.left))+'px';toolbar.style.top=Math.max(8,rect.top-toolbar.offsetHeight-10)+'px';}
 function showToolbar(){
  if(!active)return;toolbar.hidden=false;const rich=active.kind==='rich',hero=active.key==='heroTitle';
  for(const button of toolbar.querySelectorAll('[data-command]'))button.hidden=!['done','undo','redo'].includes(button.dataset.command)&&!(root.CoopTextStyles&&['bold','italic','underline','highlight','color','clearHighlight'].includes(button.dataset.command)||rich&&button.dataset.command!=='clearHighlight'||hero&&['highlight','clearHighlight'].includes(button.dataset.command));
  for(const control of toolbar.querySelectorAll('select'))control.hidden=!rich&&!root.CoopTextStyles;
  toolbar.querySelector('[data-command="undo"]').disabled=!active.undo.length;toolbar.querySelector('[data-command="redo"]').disabled=!active.redo.length;
  const sel=root.getSelection();if(sel.rangeCount&&active.node.contains(sel.anchorNode)&&active.node.contains(sel.focusNode)){selectionRange=sel.getRangeAt(0).cloneRange();pointToolbar(!sel.isCollapsed?(selectionRange.getBoundingClientRect?.()||active.node.getBoundingClientRect()):active.node.getBoundingClientRect());}else pointToolbar(active.node.getBoundingClientRect());
 }
 function remember(previous=false){if(!active)return;active.changed=true;active.undo.push(snapshot(previous));if(active.undo.length>100)active.undo.shift();active.redo=[];active.beforeSelection=null;}
 function restore(state){active.changed=true;active.highlight=state.highlight;if(active.kind==='rich')active.node.innerHTML=root.sanitizeHtml(state.value);else if(root.CoopTextStyles){active.styles=state.styles||[];root.CoopTextStyles.paint(active.node,state.value,active.styles);if(active.key==='heroTitle')sendHighlight();}else if(active.key==='heroTitle'){paintHero(state.value);sendHighlight();}else active.node.textContent=state.value;active.node.focus({preventScroll:true});reselect(state.selection);transmit(state.value,true);showToolbar();}
 function clearRichHighlight(){
  const mark=bookmark();if(!mark||mark.start===mark.end)return;
  const walker=document.createTreeWalker(active.node,root.NodeFilter.SHOW_TEXT),items=[],removed=new Set();let node,at=0;
  while((node=walker.nextNode())){
   const ancestors=[];for(let p=node.parentElement;p&&p!==active.node;p=p.parentElement)if(p.style.backgroundColor)ancestors.push(p);
   const item={node,start:at,end:at+node.length,ancestors,color:ancestors[0]?.style.backgroundColor};items.push(item);at=item.end;
   if(item.end>mark.start&&item.start<mark.end)ancestors.forEach(p=>removed.add(p));
  }
  if(!removed.size)return;
  remember();for(const p of removed){p.style.removeProperty('background-color');if(!p.getAttribute('style'))p.removeAttribute('style');}
  // Lift only the removed background onto unselected text. This preserves
  // paragraphs, links and every other format without a transparent child that
  // would still show its ancestor's background.
  for(const item of items){
   if(!item.color||!item.ancestors.some(p=>removed.has(p)))continue;
   const text=item.node.data,out=document.createDocumentFragment();
   const lo=Math.max(0,Math.min(text.length,mark.start-item.start)),hi=Math.max(lo,Math.min(text.length,mark.end-item.start));
   for(const [start,end,highlight] of [[0,lo,true],[lo,hi,false],[hi,text.length,true]]){
    if(end<=start)continue;const part=document.createTextNode(text.slice(start,end));
    if(highlight){const span=document.createElement('span');span.style.backgroundColor=item.color;span.append(part);out.append(span);}else out.append(part);
   }
   item.node.replaceWith(out);
  }
  reselect(mark);transmit();showToolbar();
 }
 function command(name,color){
  if(!active)return;if(name==='done'){finish();return;}
  if(name==='undo'||name==='redo'){const from=name==='undo'?active.undo:active.redo,to=name==='undo'?active.redo:active.undo;if(from.length){to.push(snapshot());restore(from.pop());}return;}
  if(name==='clearHighlight'&&active.key==='heroTitle'&&!root.CoopTextStyles){if(active.highlight){remember();active.highlight='';paintHero(fieldValue());sendHighlight();showToolbar();}return;}
  if(!selectionRange||selectionRange.collapsed||!active.node.contains(selectionRange.commonAncestorContainer)){announce('서식을 적용할 글자를 선택해 주세요.');return;}
  if(active.kind==='plain'&&root.CoopTextStyles){
   const mark=bookmark(),value=fieldValue(),kind=name==='clearHighlight'?'highlight':name;if(!['bold','italic','underline','highlight','color'].includes(kind))return;
   remember();active.styles=root.CoopTextStyles.format(value,readPlain().runs,mark.start,mark.end,kind,name==='clearHighlight'?false:['color','highlight'].includes(kind)?color||toolbar.querySelector(`[data-color-kind="${kind}"]`).value:true);
   root.CoopTextStyles.paint(active.node,value,active.styles);reselect(mark);if(active.key==='heroTitle'&&active.highlight){active.highlight='';sendHighlight();}transmit();showToolbar();return;
  }
  if(active.key==='heroTitle'){
   const text=selectionRange.toString();if(text.length>60){announce('강조할 문구는 60자 이내로 선택해 주세요.');return;}
   if(text===active.highlight)return;remember();active.highlight=text;paintHero(fieldValue());transmit();sendHighlight();showToolbar();return;
  }
  if(active.kind!=='rich')return;
  if(name==='clearHighlight'){clearRichHighlight();return;}
  let tag={bold:'strong',italic:'em',underline:'u',highlight:'span',color:'span',link:'a'}[name];if(!tag)return;
  const wrapper=document.createElement(tag);
  if(name==='highlight')wrapper.style.backgroundColor=color||toolbar.querySelector('[data-color-kind="highlight"]').value;
  if(name==='color')wrapper.style.color=color||toolbar.querySelector('[data-color-kind="color"]').value;
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
  for(const [kind,title,palette] of [
   ['color','글자색 선택',[['#166534','초록'],['#1d4ed8','파랑'],['#b91c1c','빨강'],['#7e22ce','보라'],['#0f766e','청록'],['#c2410c','주황'],['#be185d','분홍'],['#854d0e','갈색'],['#475569','회색'],['#111827','검정'],['#ffffff','흰색']]],
   ['highlight','강조색 선택',[['#fef08a','노랑'],['#fed7aa','주황'],['#fecaca','빨강'],['#fbcfe8','분홍'],['#e9d5ff','보라'],['#c7d2fe','남보라'],['#bfdbfe','파랑'],['#bae6fd','하늘'],['#a5f3fc','청록'],['#a7f3d0','민트'],['#d9f99d','연두'],['#e2e8f0','회색']]]
  ]){const colors=document.createElement('select');colors.dataset.colorKind=kind;colors.setAttribute('aria-label',title);for(const [value,label] of palette){const option=document.createElement('option');option.value=value;option.textContent=(kind==='highlight'?'강조: ':'글자: ')+label;colors.append(option);}colors.onchange=()=>command(kind,colors.value);toolbar.append(colors);}
  status=document.createElement('div');status.className='home-inline-status';status.setAttribute('role','status');status.hidden=true;
  sectionMenu=document.createElement('div');sectionMenu.className='home-inline-section-menu';sectionMenu.hidden=true;root.document.body.append(toolbar,sectionMenu,status);
 }
 function refresh(config,rows,force=false){
  ui();fields=config&&typeof config==='object'?config:{};sections=Array.isArray(rows)?rows:[];
  const signature=JSON.stringify([fields,sections]),nodes=Object.entries(targets).map(([,selector])=>document.querySelector(selector));
  const intact=Object.entries(targets).every(([key],i)=>!nodes[i]||nodes[i].classList.contains('home-inline-editable')===Object.hasOwn(fields,key));
  if(!force&&!requested&&signature===refreshSignature&&intact&&nodes.length===refreshNodes.length&&nodes.every((node,i)=>node===refreshNodes[i]))return;
  refreshSignature=signature;refreshNodes=nodes;
  for(const [key,selector] of Object.entries(targets)){const node=document.querySelector(selector);if(!node)continue;node.classList.toggle('home-inline-editable',Object.hasOwn(fields,key));if(Object.hasOwn(fields,key)){node.dataset.inlineField=key;node.setAttribute('tabindex','0');node.setAttribute('aria-label',key==='heroTitle'?'메인 제목 수정':key==='aboutContent'?'조합 소개 본문 수정':'내용 수정');}else{delete node.dataset.inlineField;node.removeAttribute('contenteditable');}}
  for(const area of new Set(['hero','about','impact','contact','activities',...sections.map(row=>row.id)])){
   const section=document.getElementById(area);if(!section)continue;
   let actions=section.querySelector(':scope > .home-inline-section-actions');if(!actions){actions=document.createElement('div');actions.className='home-inline-section-actions';section.append(actions);}actions.replaceChildren();
   const aboutFields=area==='about'?[['aboutTitle','제목 추가'],['aboutSubtitle','부제목 추가'],['aboutContent','본문 추가']].filter(([key])=>fields[key]&&!String(key==='aboutContent'?document.querySelector(targets[key])?.textContent||'':fields[key].value||'').trim()):[];
   for(const [kind,label] of [...(['hero','about','impact'].includes(area)?[['image','사진']]:[]),...(['hero','impact'].includes(area)?[['button','버튼']]:[]),...aboutFields,...(area==='about'&&fields.aboutList&&!fields.aboutList.value.trim()?[['list','목록 추가']]:[]),['section','영역']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.inlineControl=kind;b.dataset.inlineArea=area;actions.append(b);}
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
  if(data?.type==='coop-home-inline-result'&&data.accepted===true){announce('');if(active?.key===data.field&&active.latestRequest===data.requestId&&typeof data.value==='string'){active.last=data.value;active.renderedLast=fieldValue();if(fields[data.field])fields[data.field].value=data.value;}}
 });
 document.addEventListener('click',event=>{
  if(!origin)return;
  const control=event.target.closest('[data-inline-control]');if(control){event.preventDefault();event.stopImmediatePropagation();const area=control.dataset.inlineArea,kind=control.dataset.inlineControl;if(kind==='section')sectionControls(area);else if(kind==='list'&&area==='about')begin('aboutList',document.querySelector(targets.aboutList));else if(area==='about'&&['aboutTitle','aboutSubtitle','aboutContent'].includes(kind))begin(kind,document.querySelector(targets[kind]));else{finish();send({type:'coop-home-inline-control',area,kind});}return;}
  // Let each toolbar button receive its own click before stopping bubbling.
  if(event.target.closest('.home-inline-toolbar,.home-inline-section-menu'))return;
  let node=event.target.closest('[data-inline-field]');
  if(!node){const found=Object.entries(targets).find(([,selector])=>event.target.closest(selector));if(found){requested=found[0];send({type:'coop-home-preview-area',area:requested.startsWith('about')?'about':requested.startsWith('activity')?'activities':requested.startsWith('impact')?'impact':requested.startsWith('contact')?'contact':'hero'});}finish();return;}
  if(active?.node!==node)event.preventDefault();event.stopImmediatePropagation();begin(node.dataset.inlineField,node);
 },true);
 document.addEventListener('beforeinput',event=>{if(active?.node.contains(event.target)){active.beforeSelection=bookmark();if(['historyUndo','historyRedo'].includes(event.inputType)){event.preventDefault();command(event.inputType==='historyUndo'?'undo':'redo');}}},true);
 document.addEventListener('input',event=>{if(active?.node.contains(event.target)){remember(true);transmit();showToolbar();}},true);
 document.addEventListener('compositionend',()=>{if(active)transmit();});
 document.addEventListener('selectionchange',()=>{if(active)showToolbar();});
 document.addEventListener('scroll',()=>{if(active)showToolbar();},true);
 document.addEventListener('contextmenu',event=>{if(active?.node.contains(event.target)){event.preventDefault();showToolbar();}});
 document.addEventListener('keydown',event=>{
  if(active?.kind==='plain'&&event.key==='Enter'&&root.CoopTextStyles){event.preventDefault();const sel=root.getSelection();if(sel.rangeCount&&active.node.contains(sel.anchorNode)){remember();const range=sel.getRangeAt(0);range.deleteContents();const n=document.createTextNode('\n');range.insertNode(n);active.node.querySelectorAll('[data-inline-caret]').forEach(b=>b.remove());if(fieldValue().endsWith('\n')){const caret=document.createElement('br');caret.dataset.inlineCaret='';active.node.append(caret);}range.setStart(n,n.length);range.collapse(true);sel.removeAllRanges();sel.addRange(range);transmit();}return;}
  if(!origin)return;if(event.key==='Escape'){if(active){event.preventDefault();finish(true);}sectionMenu.hidden=true;}
  if(event.key==='Enter'&&!active&&event.target.dataset.inlineField){event.preventDefault();begin(event.target.dataset.inlineField,event.target);}
  if(active&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();command(event.shiftKey?'redo':'undo');}
 });
 document.addEventListener('paste',event=>{if(!active?.node.contains(event.target))return;event.preventDefault();const text=event.clipboardData?.getData('text/plain')||'',sel=root.getSelection();if(!sel.rangeCount)return;const range=sel.getRangeAt(0);if(!active.node.contains(range.commonAncestorContainer))return;remember();range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);transmit();});
 document.addEventListener('drop',event=>{if(active?.node.contains(event.target))event.preventDefault();});
 root.CoopSiteInline=Object.freeze({defer(settings){if(!active)return false;pending=settings;return true;},refresh,finish,isEditing(area){return !!active&&active.key.toLowerCase().startsWith(area==='activities'?'activity':area);}});
 const style=document.createElement('style');style.textContent='.home-inline-editable{cursor:text!important}.home-inline-editable:hover{outline:2px dashed #22c55e;outline-offset:5px}.home-inline-active{outline:2px solid #22c55e!important;min-height:1.5em;white-space:pre-wrap}.home-inline-toolbar,.home-inline-section-menu{position:fixed;z-index:100000;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 16px);padding:8px;background:#fff;color:#18322b;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 30px #0003;font:14px/1.5 Pretendard,sans-serif;word-break:keep-all}.home-inline-toolbar button,.home-inline-section-menu button,.home-inline-section-actions button{background:#fff;color:#18322b;border:1px solid #d3ded9;border-radius:6px;padding:6px 10px;font:inherit}.home-inline-section-actions{position:absolute;right:16px;top:16px;z-index:1000;display:flex;gap:5px;font:14px/1.5 Pretendard,sans-serif}section:has(>.home-inline-section-actions){position:relative}.home-inline-status{position:fixed;bottom:12px;left:12px;z-index:100001;background:#fff;color:#9f1239;padding:12px;border:1px solid #fda4af;border-radius:8px}.home-inline-toolbar[hidden],.home-inline-section-menu[hidden],.home-inline-status[hidden]{display:none!important}';document.head.append(style);
 const compactStyle=document.createElement('style');compactStyle.textContent='.home-inline-toolbar{width:fit-content;max-width:min(680px,calc(100vw - 16px));align-items:center}.home-inline-toolbar select{display:inline-block;width:auto!important;min-width:100px!important;max-width:150px;margin:0!important;padding:5px 24px 5px 8px!important;font:inherit;height:34px}.home-inline-toolbar [hidden]{display:none!important}.home-inline-active:not(.home-inline-plain){white-space:normal}';document.head.append(compactStyle);
})(window);
