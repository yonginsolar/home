/* Optional banner settings. Existing home draft, Auth, checked-upload and save RPC only. */
(function(root){
 'use strict';
 let mounted=false,loaded=false,saving=false,items=[],panel,list,source,mode,play,link;
 const cards=new Map(),targets=[['','연결 안 함'],['/signup.html','조합원 가입'],['#about','조합 소개'],['#activities','조합 소식'],['#contact','문의하기'],['#status','발전량 현황'],['__custom__','직접 입력']];
 const defaults=()=>({image_url:'',title:'',subtitle:'',button_label:'',button_url:'',link_url:'',image_position:'center',text_align:'center',text_position:'center',overlay:35});
 const key=()=>root.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
 function allowed(){return loaded&&!saving&&typeof canAccessAdminMemberTab==='function'&&canAccessAdminMemberTab('site')&&getSiteEditorDraft('home').refresh().loaded&&!getSiteEditorDraft('home').refresh().busy;}
 function raw(){return {enabled:mode?.value==='slides',autoplay:play?.checked!==false,banner_link:link?.read()||'',slides:items.map(x=>({...x.value})),files:items.map(x=>x.file?[x.id,x.file.name,x.file.size,x.file.lastModified,x.file.type]:null)};}
 function changed(){source.value=JSON.stringify(raw());source.dispatchEvent(new Event('input',{bubbles:true}));queueHomePreviewUpdate();}
 function error(message){root.myAlert(message,'warning');}
 function label(container,text,id){const n=document.createElement('label');n.className='form-label mt-2';n.htmlFor=id;n.textContent=text;container.append(n);return n;}
 function input(container,text,id,type='text',max=240){label(container,text,id);const n=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.id=id;n.className='form-control';n.maxLength=max;if(type==='textarea')n.rows=2;container.append(n);return n;}
 function select(container,text,id,values){label(container,text,id);const n=document.createElement('select');n.id=id;n.className='form-select';for(const [value,text] of values){const o=document.createElement('option');o.value=value;o.textContent=text;n.append(o);}container.append(n);return n;}
 function linkField(container,text,id,onChange){
  const choice=select(container,text,id,targets),custom=input(container,'이동할 주소',id+'-custom','url',500);custom.placeholder='https:// 또는 /로 시작하는 주소';
  const read=()=>choice.value==='__custom__'?custom.value.trim():choice.value;
  const show=()=>custom.hidden=choice.value!=='__custom__';
  choice.addEventListener('change',()=>{show();onChange?.(read());});custom.addEventListener('input',()=>onChange?.(read()));
  return {read,set(value){const v=String(value||'');choice.value=targets.some(x=>x[0]===v)&&v!=='__custom__'?v:'__custom__';custom.value=choice.value==='__custom__'?v:'';show();}};
 }
 function lock(){panel?.querySelectorAll('input,textarea,select,button').forEach(n=>{const item=items.find(x=>x.id===n.closest('[data-slide-card]')?.dataset.slideCard),i=items.indexOf(item);n.disabled=!loaded||saving||(n.dataset.slideAction==='up'&&i===0)||(n.dataset.slideAction==='down'&&i===items.length-1);});if(list)list.hidden=mode.value!=='slides';const add=panel?.querySelector('[data-slide-add]');if(add)add.hidden=mode.value!=='slides';}
 function row(item){
  if(cards.has(item.id))return cards.get(item.id);
  const card=document.createElement('article');card.dataset.slideCard=item.id;card.className='border rounded-3 p-3 mt-3';const heading=document.createElement('h6');heading.className='fw-bold';card.append(heading);
  const photo=input(card,'사진',item.id+'-image','file');photo.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';photo.removeAttribute('maxlength');
  const preview=document.createElement('img');preview.alt='배너 사진 미리보기';preview.style.cssText='display:block;max-width:100%;height:150px;object-fit:contain;margin-top:8px';preview.hidden=true;card.append(preview);
  const name=document.createElement('div');name.className='form-text';card.append(name);
  photo.addEventListener('change',()=>{if(!allowed())return;const file=photo.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)||file.size>10*1024*1024){photo.value='';error('PNG·JPG·WebP·GIF·AVIF 사진을 10MB 이하로 선택해 주세요.');return;}if(item.objectUrl)URL.revokeObjectURL(item.objectUrl);item.file=file;item.objectUrl=URL.createObjectURL(file);preview.src=item.objectUrl;preview.hidden=false;name.textContent=file.name;changed();});
  const controls={};
  for(const [field,text,type,max] of [['title','제목','text',120],['subtitle','설명','textarea',240],['button_label','버튼 문구','text',40]]){const n=input(card,text,item.id+'-'+field,type,max);controls[field]=n;n.addEventListener('input',()=>{if(!allowed())return;n.value=n.value.slice(0,max);item.value[field]=n.value;changed();});}
  const button=linkField(card,'버튼 연결 위치',item.id+'-button-url',v=>{if(allowed()){item.value.button_url=v;changed();}}),click=linkField(card,'사진 클릭 시 이동',item.id+'-link-url',v=>{if(allowed()){item.value.link_url=v;changed();}});
  for(const [field,text,values] of [['image_position','사진 기준 위치',[['center','가운데'],['top','위'],['bottom','아래'],['left','왼쪽'],['right','오른쪽']]],['text_align','글자 정렬',[['center','가운데'],['left','왼쪽'],['right','오른쪽']]],['text_position','글자 높이',[['center','가운데'],['top','위'],['bottom','아래']]]]){const n=select(card,text,item.id+'-'+field,values);controls[field]=n;n.addEventListener('change',()=>{if(allowed()){item.value[field]=n.value;changed();}});}
  const overlay=input(card,'사진 어둡게 (%)',item.id+'-overlay','number');overlay.min='0';overlay.max='80';controls.overlay=overlay;overlay.addEventListener('input',()=>{if(allowed()){item.value.overlay=Number(overlay.value);changed();}});
  const actions=document.createElement('div');actions.className='d-flex gap-2 mt-3';card.append(actions);
  for(const [action,text] of [['up','위로'],['down','아래로'],['remove','사진 삭제']]){const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-secondary';b.textContent=text;b.dataset.slideAction=action;b.onclick=async()=>{if(!allowed())return;const i=items.indexOf(item);if(i<0)return;if(action==='remove'){if(!await root.CoopDialog.confirm('이 사진의 배너 설정을 삭제할까요?'))return;if(!allowed()||!items.includes(item))return;items=items.filter(x=>x!==item);if(item.objectUrl)URL.revokeObjectURL(item.objectUrl);card.remove();cards.delete(item.id);}else{const next=i+(action==='up'?-1:1);if(next<0||next>=items.length)return;[items[i],items[next]]=[items[next],items[i]];}render();changed();};actions.append(b);}
  const record={card,heading,photo,preview,name,controls,button,click};cards.set(item.id,record);return record;
 }
 function render(){
  items.forEach((item,i)=>{const r=row(item);r.heading.textContent='사진 '+(i+1);list.append(r.card);for(const [field,n] of Object.entries(r.controls))if(n.value!==String(item.value[field]??''))n.value=String(item.value[field]??'');r.button.set(item.value.button_url);r.click.set(item.value.link_url);
   if(!item.file){r.name.textContent='';if(item.value.image_url){r.preview.src=root.CoopDisplayImages?.display(item.value.image_url)||item.value.image_url;r.preview.hidden=false;}else{r.preview.removeAttribute('src');r.preview.hidden=true;}}
   r.card.querySelector('[data-slide-action="up"]').disabled=i===0;r.card.querySelector('[data-slide-action="down"]').disabled=i===items.length-1;
  });lock();
 }
 function mount(){
  if(mounted)return;const file=document.getElementById('site-home-hero-image-file');const parent=file?.closest('.card-body');if(!parent)return;
  source=document.createElement('input');source.type='hidden';source.id='site-home-slide-draft';source.value='{}';parent.append(source);
  panel=document.createElement('div');panel.id='site-home-slide-config';panel.className='border-top pt-3 mt-3';parent.append(panel);
  mode=select(panel,'배너 사진 구성','site-home-slide-mode',[['single','한 장 배너'],['slides','슬라이드 배너 (최대 4장)']]);mode.addEventListener('change',()=>{if(!allowed())return;lock();changed();});
  link=linkField(panel,'한 장 배너 클릭 시 이동','site-home-banner-click',()=>{if(allowed())changed();});
  const playLabel=document.createElement('label');playLabel.className='form-check mt-3';playLabel.htmlFor='site-home-slide-autoplay';play=document.createElement('input');play.type='checkbox';play.className='form-check-input';play.id=playLabel.htmlFor;play.checked=true;playLabel.append(play,document.createTextNode('8초마다 자동 전환'));panel.append(playLabel);play.addEventListener('change',()=>{if(allowed())changed();});
  const help=document.createElement('p');help.className='form-text';help.textContent='사진별 제목·설명·버튼을 비우면 사진만 표시합니다. 사진은 화면 크기에 따라 일부가 잘릴 수 있습니다.';panel.append(help);
  list=document.createElement('div');list.id='site-home-slide-list';panel.append(list);
  const add=document.createElement('button');add.type='button';add.dataset.slideAdd='';add.className='btn btn-outline-primary btn-sm mt-3';add.textContent='사진 추가';add.onclick=()=>{if(!allowed())return;if(items.length>=4)return error('배너 사진은 최대 4장까지 등록할 수 있습니다.');items.push({id:key(),value:defaults(),file:null});render();changed();};panel.append(add);
  mounted=true;source.value=JSON.stringify(raw());lock();
 }
 function set(settings){
  mount();if(!mounted)return;items.forEach(x=>{if(x.objectUrl)URL.revokeObjectURL(x.objectUrl);});cards.clear();list.replaceChildren();
  items=(Array.isArray(settings?.hero_slides)?settings.hero_slides:[]).slice(0,4).map(value=>({id:key(),value:{...defaults(),...value},file:null}));
  mode.value=settings?.hero_slides_enabled===true?'slides':'single';play.checked=settings?.hero_autoplay!==false;link.set(settings?.hero_banner_link||'');loaded=true;render();source.value=JSON.stringify(raw());
 }
 function validateLink(value){const v=String(value||'').trim();if(!v)return '';if(/[\x00-\x20<>"'\\]/.test(v)||/^\/\//.test(v))throw Error('연결 주소를 확인해 주세요.');if(/^#[A-Za-z0-9_-]+$/.test(v)||/^\/[^/]/.test(v))return v;try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch(_){}throw Error('연결 주소는 https://, / 또는 #으로 시작해야 합니다.');}
 function payload(){mount();const state=raw();if(state.enabled&&items.length<1)throw Error('슬라이드 배너 사진을 한 장 이상 추가해 주세요.');const rows=state.slides.map(x=>({...x,button_url:validateLink(x.button_url),link_url:validateLink(x.link_url)}));return {p_hero_slides_enabled:state.enabled,p_hero_slides:rows,p_hero_autoplay:state.autoplay,p_hero_banner_link:validateLink(state.banner_link)};}
 async function uploadPending(coopId,upload){
  if(!loaded)throw Error('배너 설정을 먼저 불러와 주세요.');const owner=String(coopId||'');if(!owner)throw Error('조합 정보를 확인할 수 없습니다.');
  for(const item of items){const file=item.file;if(!file||item.uploadedFile===file)continue;item.value.image_url=await upload(file,`site-home/${owner}`);item.uploadedFile=file;}
  source.value=JSON.stringify(raw());return payload();
 }
 async function preview(readFile){const p=payload();const slides=[];for(const item of items)slides.push({...item.value,image_url:item.file?await readFile(item.file):item.value.image_url});return {hero_slides_enabled:p.p_hero_slides_enabled,hero_slides:slides,hero_autoplay:p.p_hero_autoplay,hero_banner_link:p.p_hero_banner_link};}
 root.CoopHeroSlides=Object.freeze({mount,set,payload,uploadPending,preview,enabled:()=>mode?.value==='slides',setSaving(value){saving=!!value;lock();}});
})(window);
