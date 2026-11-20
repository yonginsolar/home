(function(root){
  'use strict';
  const ids={title:'admin-about-title',subtitle:'admin-about-subtitle',body:'admin-about-content',list:'admin-about-list'};
  const labels={all:'현재 조합 소개',title:'조합 소개 제목',subtitle:'조합 소개 부제목',body:'조합 소개 본문',list:'조합 소개 목록'};
  const choices={title_size:['small','normal','large'],title_align:['left','center','right'],body_size:['small','normal','large'],
    body_align:['left','center','right'],photo:['left','right','top']};
  const fields=Object.keys(ids);
  function mount({capture,current,send,sanitize,loadPresentation,refresh,readStyles,writeStyles,mayProbe}){
    const doc=root.document,get=id=>doc.getElementById(id);
    const form=get('sub-about'), controls=get('hcrec-about-settings'), actual=get('about-settings-preview');
    if(!form||!controls||!actual)return null;
    const triggerGroup=form.querySelector('[data-about-ai-buttons]');
    const details=form.querySelector('[data-about-ai-details]');
    if(!triggerGroup||!details||!root.CoopAiEditPanel)return null;
    const availability=root.CoopAiEditPanel.availability({
      key:()=>capture()?.ownerKey||'',
      probe:signal=>send({status:true,scope:'homepage_about',reference:null},signal),
      mayProbe,
      changed(ready){
        details.hidden=!ready;triggerGroup.hidden=!ready;
        if(!ready){details.open=false;panel?.close();}
      }
    });
    const makePlainContent=(value)=>{
      const out=doc.createElement('div');
      for(const part of value.split(/\n\s*\n/)){
        const p=doc.createElement('p');
        for(const [i,line] of part.split('\n').entries()){
          if(i)p.append(doc.createElement('br'));
          p.append(doc.createTextNode(line));
        }
        out.append(p);
      }
      return out.innerHTML;
    };
    const textOfBody=html=>{
      const node=doc.createElement('template');node.innerHTML=sanitize(html);
      for(const b of node.content.querySelectorAll('br'))b.replaceWith(doc.createTextNode('\n'));
      for(const item of node.content.querySelectorAll('p,li,h2,h3'))item.append(doc.createTextNode('\n'));
      return node.content.textContent.trim();
    };
    function snapshot(target){
      const key=capture();
      if(!availability.ready()||!key||!Object.hasOwn(labels,target)||!Object.values(ids).every(id=>get(id)))return null;
      const stored=Object.fromEntries(fields.map(k=>[k,get(ids[k]).value]));
      return {key,target,label:labels[target],stored,hasPhoto:!!get('admin-about-img-file')?.files?.length||!!get('admin-about-img')?.value,
        source:{...stored,body:textOfBody(stored.body)}};
    }
    const unchanged=s=>availability.ready()&&current(s.key)&&fields.every(k=>get(ids[k])?.value===s.stored[k]);
    function selected(v,s,mode){
      if(mode==='layout'){
        if(s.target!=='all'||!v.layout||Object.keys(v.layout).length!==Object.keys(choices).length)return null;
        const layout=Object.fromEntries(Object.entries(choices).map(([k,values])=>[k,values.includes(v.layout[k])?v.layout[k]:null]));
        if(Object.values(layout).includes(null))return null;
        if(!s.hasPhoto)delete layout.photo;
        return {layout};
      }
      const edit=Object.fromEntries(fields.filter(k=>(s.target==='all'||k===s.target)&&typeof v.text?.[k]==='string'&&v.text[k].trim()&&v.text[k]!==s.source[k])
        .map(k=>[k,v.text[k]]));
      if(!Object.keys(edit).length)return null;
      return {edit};
    }
    function render(v,s,mode){
      const pick=selected(v,s,mode);
      if(!pick)return null;
      const card=actual.cloneNode(true), title=card.querySelector('#prev-title'),subtitle=card.querySelector('#prev-subtitle'),
        content=card.querySelector('#prev-content'),list=card.querySelector('#prev-list'),image=card.querySelector('[data-about-photo] img');
      if(!title||!subtitle||!content||!list||!image)return null;
      card.removeAttribute('id');card.dataset.aiAboutPreview='';
      title.dataset.aiAboutTitle='';content.dataset.aiAboutBody='';
      for(const el of card.querySelectorAll('[id]'))el.removeAttribute('id');
      card.inert=true;
      if(pick.layout){
        const old=Object.fromEntries(root.CoopHcrecAbout.keys.map(key=>[key,get('hcrec-about-'+key)?.value||'']));
        root.CoopHcrecAbout.decorate(card,card.querySelector('[data-about-text]'),card.querySelector('[data-about-photo]'),image,
          {...old,...pick.layout},image.getAttribute('src')||'');
      }
      const t=pick.edit;
      if(t?.title)title.textContent=t.title;
      if(t?.subtitle)subtitle.textContent=t.subtitle;
      if(t?.body)content.innerHTML=makePlainContent(t.body);
      if(t?.list){
        list.replaceChildren();
        for(const line of t.list.split('\n').filter(v=>v.trim())){
          const li=doc.createElement('li');li.textContent=line;list.append(li);
        }
        list.style.display='block';
      }
      return card;
    }
    function apply(v,s,mode){
      if(!unchanged(s))return false;
      const chosen=selected(v,s,mode);
      if(!chosen)return false;
      if(chosen.layout){
        loadPresentation(chosen.layout);refresh();return true;
      }
      const edit=chosen.edit,safe=doc.createElement('template');safe.innerHTML=sanitize(s.stored.body);
      // A text-only model cannot preserve exact link targets or list/heading semantics.
      // Keep that authored structure rather than silently swapping it for plain text.
      if(edit.body&&safe.content.querySelector('a,ul,ol,blockquote,img,figure,table,h1,h2,h3,h4,h5,h6'))return false;
      const styles={...readStyles()};
      for(const k of Object.keys(edit)){
        if(!get(ids[k]))return false;
        delete styles['about'+({title:'Title',subtitle:'Subtitle',body:'Content',list:'List'})[k]];
      }
      for(const k of Object.keys(edit))get(ids[k]).value=k==='body'?makePlainContent(edit[k]):edit[k];
      writeStyles(styles);refresh();return true;
    }
    const panel=root.CoopAiEditPanel?.mount({context:snapshot,unchanged,send,preview:render,apply});
    if(!panel)return null;
    for(const button of triggerGroup.querySelectorAll('[data-about-ai]'))button.addEventListener('click',()=>{
      if(!panel.open(button.dataset.aboutAi,button)){
        const status=get('hcrec-about-edit-status');
        if(status){status.hidden=false;status.textContent='조합 소개를 먼저 불러와 주세요.';}
      }
    });
    const sync=()=>availability.sync();
    for(const event of ['hide.bs.tab','shown.bs.tab'])doc.addEventListener(event,()=>{availability.hide();sync();});
    root.addEventListener('pagehide',()=>availability.hide());
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)availability.hide();else sync();});
    const phase=get('site-about-save-status');
    const observer=new MutationObserver(sync);
    if(phase)observer.observe(phase,{attributes:true,attributeFilter:['data-site-editor-phase']});
    observer.observe(controls,{attributes:true,attributeFilter:['hidden']});
    observer.observe(form,{attributes:true,attributeFilter:['class','hidden']});
    if(root.frameElement)observer.observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
    sync();
    return {sync};
  }
  root.CoopAboutAiEditor=Object.freeze({version:'1.0.1',mount});
})(window);
