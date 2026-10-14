/* Mobile-first bridge: the actual homepage iframe is the only canvas.
 * Original fields, Files, draft, checked-upload and secure save remain authoritative. */
(function(root){
 'use strict';
 let mounted=false,source,strip,selected='',dragId='',last='';
 const textFields={heroTitle:'title',heroSubtitle:'subtitle',heroButton:'button_label'},thumbs=new Map();
 const clone=v=>JSON.parse(JSON.stringify(v||{}));
 function allowed(){return root.CoopHeroSlides?.view().editable===true;}
 async function flush(){const ok=await(root.CoopSiteInlineHost?.flush()??Promise.resolve(true));if(!ok){refresh();root.myAlert?.('미리보기의 편집 상태를 확인하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 선택해 주세요.','warning');}return ok&&allowed();}
 function options(){try{return JSON.parse(source.value)||{};}catch(_){return {};}}
 function current(){const s=root.CoopHeroSlides.view(),row=s.enabled?(s.items.find(x=>x.id===selected)||s.items[0]):null;if(row)selected=row.id;return row;}
 function notify(){source.dispatchEvent(new Event('input',{bubbles:true}));root.queueHomePreviewUpdate?.();refresh();}
 function write(v){source.value=JSON.stringify(v);notify();}
 function set(settings){if(!mounted)mount();const v=clone(settings?.home_display_options);delete v.slides;source.value=JSON.stringify(v);selected='';last='';refresh();}
 function payload(){return {...options(),slides:root.CoopHeroSlides.view().items.map(x=>x.presentation||{})};}
 async function select(id){if(!allowed())return false;const before=selected;if(!(await flush())||selected!==before)return false;const s=root.CoopHeroSlides.view();if(!s.items.some(x=>x.id===id))return false;selected=id;refresh();root.queueHomePreviewUpdate?.();return true;}
 function fields(){const row=current();if(!row||!allowed())return null;return Object.fromEntries(Object.entries(textFields).map(([key,name])=>[key,{value:row.value[name]||'',kind:'plain',maxLength:key==='heroTitle'?120:key==='heroSubtitle'?240:40,styles:row.presentation.text_styles?.[key]||[]}]));}
 function edit(key,value,styles){const row=current();if(!row||!allowed()||!Object.hasOwn(textFields,key))return false;const max=key==='heroTitle'?120:key==='heroSubtitle'?240:40;if(typeof value!=='string'||value.length>max)return false;
  if(styles!==undefined&&(!Array.isArray(styles)||JSON.stringify(styles)!==JSON.stringify(root.CoopTextStyles?.normalize(value,styles))))return false;
  if(!root.CoopHeroSlides.edit(row.id,textFields[key],value))return false;const p=clone(row.presentation);p.text_styles={...(p.text_styles||{}),[key]:styles||[]};return root.CoopHeroSlides.present(row.id,p);
 }
 function config(field,property,value){if(!allowed())return false;const keys=root.CoopSiteInlineHost?.fieldKeys||[];if(field!=='hero'&&!keys.includes(field))return false;
  const row=Object.hasOwn(textFields,field)||field==='hero'?current():null,o=row?clone(row.presentation):options();
  if(property==='format'){
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['align','size'].includes(k))||value.align!==undefined&&!['left','center','right'].includes(value.align)||value.size!==undefined&&!['small','normal','large'].includes(value.size))return false;
   o.text={...(o.text||{})};if(Object.keys(value).length)o.text[field]=clone(value);else delete o.text[field];if(!Object.keys(o.text).length)delete o.text;
  }else if(['align','size'].includes(property)){
   if(!(property==='align'?['left','center','right']:['small','normal','large']).includes(value))return false;
   o.text={...(o.text||{}),[field]:{...(o.text?.[field]||{}),[property]:value}};
  }else if(property==='crop'&&field==='hero'){
   if(!value||!['x','y'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=100))return false;
   const target=row?o:(o.hero||= {});target.image_x=value.x;target.image_y=value.y;
  }else if(field==='hero'&&['mobileFit','mobilePosition'].includes(property)){
   if(!(property==='mobileFit'?['contain','cover']:['center','top','bottom','left','right']).includes(value))return false;
   const target=row?o:(o.hero||= {}),key=property==='mobileFit'?'mobile_fit':'mobile_position',fallback=property==='mobileFit'?'contain':'center';if(value===fallback)delete target[key];else target[key]=value;if(!row&&!Object.keys(target).length)delete o.hero;
  }else if(property==='visible'&&Object.hasOwn(textFields,field)&&typeof value==='boolean'){
   const target=row?o:(o.hero||= {});target[textFields[field]==='button_label'?'button_visible':textFields[field]+'_visible']=value;
  }else return false;
  if(row)return root.CoopHeroSlides.present(row.id,o);write(o);return true;
 }
 function action(kind){if(!allowed())return false;const row=current();if(kind==='photo'){root.CoopSiteInlineHost?.bannerPhoto(row?.id);return true;}if(kind==='links'){root.CoopSiteInlineHost?.bannerLinks(row?.id);return true;}return false;}
 function editor(){const s=root.CoopHeroSlides.view(),row=current();return {editable:allowed(),slideId:row?.id||'',slideIndex:row?s.items.findIndex(x=>x.id===row.id):0,display:row?row.presentation:options(),heroVisible:document.getElementById('site-home-hero-content-visible')?.checked!==false};}
 async function toggle(id,value){const n=document.getElementById(id);if(!allowed()||!n||n.disabled)return;if(id==='site-home-slide-mode'&&!(await flush()))return;if(!allowed()||n.disabled)return;n.type==='checkbox'?n.checked=value:n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));}
 function refresh(){if(!mounted)return;const s=root.CoopHeroSlides.view();current();strip.querySelectorAll('button,select,input').forEach(n=>n.disabled=!allowed());
  const add=strip.querySelector('[data-mobile-add]');add.hidden=!s.enabled;add.disabled=!allowed()||s.items.length>=4;
  strip.querySelector('[data-mobile-mode]').value=s.enabled?'slides':'single';
  const play=strip.querySelector('[data-mobile-play]');play.closest('label').hidden=!s.enabled;play.checked=document.getElementById('site-home-slide-autoplay')?.checked!==false;
  const off=strip.querySelector('[data-mobile-image-only]');off.checked=document.getElementById('site-home-hero-content-visible')?.checked===false;
  for(const [id,n]of thumbs)if(!s.items.some(x=>x.id===id)){n.remove();thumbs.delete(id);}
  const gallery=strip.querySelector('.mobile-banner-photos');gallery.hidden=!s.enabled;
  for(const [i,item]of s.items.entries()){let b=thumbs.get(item.id);if(!b){b=document.createElement('button');b.type='button';b.draggable=true;b.dataset.mobilePhoto=item.id;b.append(document.createElement('img'),document.createElement('span'));b.onclick=()=>select(item.id);
   b.ondragstart=e=>{if(!allowed()){e.preventDefault();return;}dragId=item.id;e.dataTransfer?.setData('text/plain','banner-photo');};b.ondragover=e=>{if(dragId&&allowed())e.preventDefault();};b.ondrop=e=>{e.preventDefault();if(dragId&&allowed())root.CoopHeroSlides.move(dragId,item.id);dragId='';};b.ondragend=()=>dragId='';thumbs.set(item.id,b);}
   b.disabled=!allowed();b.setAttribute('aria-pressed',String(item.id===selected));b.setAttribute('aria-label','사진 '+(i+1)+' 선택');b.querySelector('span').textContent='사진 '+(i+1);const im=b.querySelector('img');im.alt='';if(item.thumb){if(im.getAttribute('src')!==item.thumb)im.src=item.thumb;im.hidden=false;}else{im.removeAttribute('src');im.hidden=true;}gallery.append(b);
  }
  const signature=JSON.stringify([s.enabled,s.editable,selected,s.items.map(x=>[x.id,x.value,x.presentation,x.image]),source.value,off.checked]);if(last!==signature){last=signature;root.queueHomePreviewUpdate?.();}
 }
 function mount(){if(mounted)return;const form=document.getElementById('sub-home-settings'),stage=document.querySelector('.home-visual-stage');if(!form||!stage)return;
  source=document.createElement('input');source.type='hidden';source.id='site-home-display-options';source.value='{}';form.append(source);
  strip=document.createElement('div');strip.className='mobile-banner-tools';strip.setAttribute('aria-label','배너 사진 구성');
  const mode=document.createElement('select');mode.dataset.mobileMode='';mode.setAttribute('aria-label','배너 사진 구성');for(const [value,text]of[['single','한 장 배너'],['slides','슬라이드 배너']]){const n=document.createElement('option');n.value=value;n.textContent=text;mode.append(n);}mode.onchange=()=>toggle('site-home-slide-mode',mode.value);strip.append(mode);
  for(const [key,text,id]of[['imageOnly','이미지만 표시','site-home-hero-content-visible'],['play','자동 전환','site-home-slide-autoplay']]){const label=document.createElement('label'),n=document.createElement('input');n.type='checkbox';n.dataset['mobile'+key[0].toUpperCase()+key.slice(1)]='';n.onchange=()=>toggle(id,key==='imageOnly'?!n.checked:n.checked);label.append(n,document.createTextNode(text));strip.append(label);}
  const gallery=document.createElement('div');gallery.className='mobile-banner-photos';strip.append(gallery);
  const add=document.createElement('button');add.type='button';add.dataset.mobileAdd='';add.textContent='＋ 사진 추가';add.onclick=async()=>{if(!allowed()||!(await flush()))return;document.querySelector('[data-slide-add]')?.click();selected=root.CoopHeroSlides.view().items.at(-1)?.id||selected;refresh();};strip.append(add);
  const actions=document.createElement('details');actions.className='mobile-banner-more';const summary=document.createElement('summary');summary.textContent='사진 순서·삭제';actions.append(summary);
  for(const [kind,text]of[['up','앞으로'],['down','뒤로'],['remove','선택 사진 삭제']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{const row=current();if(!row||!allowed())return;if(!(await flush())||current()?.id!==row.id)return;root.CoopHeroSlides.action(row.id,kind);};actions.append(b);}strip.append(actions);
  stage.after(strip);mounted=true;document.getElementById('site-home-slide-config')?.addEventListener('coop-banner-change',refresh);for(const type of['input','change'])form.addEventListener(type,e=>{if(e.target!==source)refresh();});refresh();
 }
 root.CoopHeroVisual=Object.freeze({mount,set,payload,fields,edit,config,action,editor,select,refresh,version:'2.1.0'});
})(window);
