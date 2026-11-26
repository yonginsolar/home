(() => {
  'use strict';
  const keys=['minutes.manage','member.admin','site.admin'];
  const guideRevision='2026-11-19.2';
  const assemblyRevision='2026-11-26.1';
  const legacyLabels=['이사회 준비','총회 준비','결재·게시','의사록·서명'];
  const destinations=Object.freeze({
    prepare:['회의 꾸러미 열기','/minutes/meeting_workspace.html'],
    home:['내 업무 모아보기 열기','/erp/'],
    minutes:['의사록 열기','/minutes/admin_minutes.html?scope=minutes'],
    registry:['등기 진행관리 열기','/erp/registry_hub.html#cases'],
    refunds:['출자금 환급 관리 열기','/erp/admin_member.html?scope=member_admin&tab=funds-manage']
  });
  const screenKeys=new Set([
    'package','basics','agendas','materials','assembly','assembly-review','assembly-materials',
    'proposal','notice','submit','notice-preview','publish-notice','minutes-fields','minutes-write',
    'minutes-preview','open-sign','sign-progress','publish-minutes'
  ]);
  function imageSource(screens,key) {
    if(!screenKeys.has(key)||!screens||!Object.hasOwn(screens,key))return '';
    return jpeg(screens[key]);
  }
  function jpeg(value) {
    if(typeof value!=='string'||value.length>170000||value.length%4
      ||!/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value))return '';
    return 'data:image/jpeg;base64,'+value;
  }
  const allowed=r=>r?.is_active===true && r.modules?.minutes===true && !!r.coop_id
    && Array.isArray(r.base_effective_permissions)&&Array.isArray(r.effective_permissions)
    && keys.some(k=>r.base_effective_permissions.includes(k)&&r.effective_permissions.includes(k));
  const make=(name,text,css)=>{
    const node=document.createElement(name);if(text)node.textContent=text;if(css)node.className=css;return node;
  };
  function mount({button,client,runtime,active=()=>true}) {
    if(!button||!allowed(runtime)||button.dataset.meetingManualBound||typeof client?.rpc!=='function')return;
    button.dataset.meetingManualBound='true';button.hidden=false;
    const dialog=make('dialog',null,'meeting-manual meeting-manual-v12');dialog.setAttribute('aria-labelledby','meetingManualTitle');
    const heading=make('h2','회의 업무 가이드');heading.id='meetingManualTitle';
    const close=make('button','닫기');close.type='button';
    const head=make('header',null,'meeting-manual-head');head.append(heading,close);
    const content=make('div',null,'meeting-manual-scroll');
    const nav=make('div',null,'meeting-manual-tabs');
    nav.setAttribute('role','group');nav.setAttribute('aria-label','회의 업무 단계');
    const view=make('div',null,'meeting-manual-steps');
    const status=make('p',null,'meeting-manual-status');status.setAttribute('role','status');
    content.append(nav,view);dialog.append(head,content);document.body.append(dialog);
    let pending, identity=null, invalid=false, revision=0, group=0, selected=0, index=[], legacy=null;
    const cache=new Map();
    const tabs=['총회 실무 순서',...legacyLabels].map((label,i)=>{
      const b=make('button',label);b.type='button';b.onclick=()=>{group=i;void load();};nav.append(b);return b;
    });
    const onScreen=()=>!invalid&&button.isConnected&&active()&&!window.frameElement?.hidden&&!document.hidden;
    const cancel=()=>{
      revision++;const old=pending;pending=null;if(old){old.controller.abort();old.stop();}
    };
    const clear=()=>{cancel();view.replaceChildren();cache.clear();index=[];legacy=null;selected=0;group=0;};
    const stop=(restoreFocus=false)=>{
      const restore=restoreFocus&&dialog.open&&dialog.contains(document.activeElement)&&onScreen();
      clear();if(dialog.open)dialog.close();
      if(restore)button.focus({preventScroll:true});
    };
    close.addEventListener('click',()=>stop(true));
    dialog.addEventListener('cancel',e=>{e.preventDefault();stop(true);});
    dialog.addEventListener('close',()=>{if(!dialog.open)clear();});
    const offscreen=()=>{if(!onScreen())stop();};
    document.addEventListener('visibilitychange',offscreen);
    window.addEventListener('pagehide',()=>stop());
    if(window.frameElement)new MutationObserver(offscreen).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
    client.auth?.onAuthStateChange?.((event,session)=>{
      const actor=session?.user?.id||null;
      if(event==='SIGNED_OUT'||(actor&&identity&&actor!==identity)){invalid=true;button.hidden=true;stop();}
      identity=actor||identity;
    });

    function drawLegacy(guide, sectionIndex) {
        view.replaceChildren();
        guide.sections[sectionIndex].steps.forEach((step,order)=>{
          const article=make('article');article.append(make('h3',`${order+1}. ${step.title}`),make('p',step.path,'meeting-manual-path'));
          const directions=make('ol',null,'meeting-manual-directions');
          for(const line of step.lines)directions.append(make('li',line));
          article.append(directions);
          const src=imageSource(guide.screens,step.screen);
          if(src){
            const figure=make('figure');const img=make('img');img.alt=`가상 회의 ${step.title} 화면`;img.loading='lazy';
            img.decoding='async';
            const toggle=make('button','화면 확대');toggle.type='button';toggle.setAttribute('aria-pressed','false');
            const scroll=make('div',null,'meeting-manual-figure');scroll.tabIndex=0;scroll.setAttribute('aria-label',img.alt);scroll.append(img);
            toggle.onclick=()=>{const zoom=toggle.getAttribute('aria-pressed')!=='true';toggle.setAttribute('aria-pressed',String(zoom));toggle.textContent=zoom?'창에 맞추기':'화면 확대';scroll.classList.toggle('actual',zoom);if(!zoom){scroll.scrollLeft=0;scroll.scrollTop=0;}};
            img.addEventListener('error',()=>figure.replaceWith(make('small','예시 화면을 표시하지 못했습니다.')),{once:true});
            img.src=src;figure.append(scroll,make('figcaption','가상 자료로 찍은 ERP 화면'),toggle);article.append(figure);
          } else if(step.screen||step.pending)article.append(make('small',step.pending?`예시 화면 준비 중: ${step.pending}`:'예시 화면 준비 중'));
          view.append(article);
        });
        content.scrollTop=0;
    }

    function stepPicker(focus=false) {
      if(!index.length)return null;
      const row=make('div',null,'meeting-manual-stepper');
      const prev=make('button','← 이전');prev.type='button';prev.disabled=selected===0;
      const next=make('button','다음 →');next.type='button';next.disabled=selected===index.length-1;
      const chooser=make('select');chooser.setAttribute('aria-label','총회 실무 단계');
      index.forEach((item,i)=>chooser.append(new Option(`${i+1}. ${item.title}`,String(i),false,i===selected)));
      const go=value=>{selected=value;void load(true);};
      prev.onclick=()=>go(selected-1);next.onclick=()=>go(selected+1);
      chooser.onchange=()=>go(Number(chooser.value));
      row.append(prev,chooser,next);if(focus)requestAnimationFrame(()=>{if(row.isConnected)chooser.focus({preventScroll:true});});
      return row;
    }
    function drawAssembly(step, focus=false) {
      const article=make('article',null,'meeting-manual-assembly');
      const title=make('h3',`${selected+1}. ${step.title}`);
      const note=make('div',null,'meeting-manual-instructions');
      const directions=make('ol',null,'meeting-manual-directions');
      step.lines.forEach(line=>directions.append(make('li',line)));note.append(directions);
      if(step.tip)note.append(make('p',step.tip,'meeting-manual-tip'));
      const links=make('div',null,'meeting-manual-links');
      for(const key of step.links){
        const a=make('a',destinations[key][0]);a.href=destinations[key][1];a.target='_blank';a.rel='noopener';links.append(a);
      }
      if(links.childElementCount){links.setAttribute('aria-label','업무 바로가기 · 새 탭');note.append(links);}
      const figure=make('figure',null,'meeting-manual-capture');
      const caption=make('figcaption','가상 자료로 찍은 ERP 화면');
      const scroll=make('div',null,'meeting-manual-figure');scroll.tabIndex=0;scroll.setAttribute('aria-label',`${step.title} 화면, 확대 시 좌우로 이동`);
      const layer=make('div',null,'meeting-manual-capture-map');layer.style.setProperty('--capture-width',step.width+'px');
      const img=make('img');img.alt=step.alt;img.width=step.width;img.height=step.height;img.decoding='async';
      img.addEventListener('error',()=>{scroll.replaceChildren(make('p','예시 화면을 표시하지 못했습니다.'));toggle.hidden=true;},{once:true});
      layer.append(img);
      for(const m of step.marks){
        const rect=make('span',null,'meeting-manual-mark');rect.setAttribute('aria-hidden','true');
        for(const [key,value] of Object.entries({left:m.x,top:m.y,width:m.w,height:m.h}))rect.style[key]=value+'%';
        rect.append(make('b',String(m.n)));layer.append(rect);
      }
      const toggle=make('button','화면 확대');toggle.type='button';toggle.setAttribute('aria-pressed','false');
      toggle.onclick=()=>{
        const zoom=toggle.getAttribute('aria-pressed')!=='true';
        toggle.setAttribute('aria-pressed',String(zoom));toggle.textContent=zoom?'창에 맞추기':'화면 확대';
        scroll.classList.toggle('actual',zoom);if(!zoom){scroll.scrollLeft=0;scroll.scrollTop=0;}
      };
      img.src=jpeg(step.screen);scroll.append(layer);figure.append(caption,scroll,toggle);
      const grid=make('div',null,'meeting-manual-assembly-grid');grid.append(figure,note);
      article.append(title,make('p',step.path,'meeting-manual-path'),grid);
      view.replaceChildren(stepPicker(focus),article);content.scrollTop=0;
    }
    const safeIndex=items=>Array.isArray(items)&&items.length>0&&items.length<=15
      &&new Set(items.map(x=>x?.id)).size===items.length
      &&items.every(x=>/^[a-z-]{2,35}$/.test(x?.id)&&typeof x.title==='string'&&x.title.length>0);
    function safeStep(step,id) {
      return step?.id===id&&typeof step.title==='string'&&typeof step.path==='string'&&typeof step.alt==='string'
        &&Array.isArray(step.lines)&&step.lines.length>0&&step.lines.length<=5&&step.lines.every(line=>typeof line==='string')
        &&Array.isArray(step.links)&&step.links.every(k=>Object.hasOwn(destinations,k))
        &&Number.isInteger(step.width)&&step.width>=350&&step.width<=1400&&Number.isInteger(step.height)&&step.height>=140&&step.height<=1300
        &&typeof step.tip==='string'&&jpeg(step.screen)&&Array.isArray(step.marks)&&step.marks.length>0&&step.marks.length<=5
        &&step.marks.every(m=>['x','y','w','h'].every(k=>Number.isFinite(m?.[k])&&m[k]>=0&&m[k]<=100)
          &&Number.isInteger(m.n)&&m.n>0&&m.n<=step.lines.length&&m.w>0&&m.h>0&&m.x+m.w<=100.01&&m.y+m.h<=100.01);
    }
    async function load(focus=false) {
      if(!onScreen()||!dialog.open)return;
      cancel();
      tabs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===group)));
      if(group&&legacy){drawLegacy(legacy,group-1);return;}
      const stepId=group?null:index[selected]?.id;
      if(!group&&stepId&&cache.has(stepId)){drawAssembly(cache.get(stepId),focus);return;}
      const controller=new AbortController(), ticket=++revision;
      const job={controller,stop:()=>{}};pending=job;
      status.textContent='회의 업무 가이드를 불러오는 중…';
      const picker=group?null:stepPicker(focus);
      view.replaceChildren(...(picker?[picker,status]:[status]));
      let timer;
      const current=()=>revision===ticket&&dialog.open&&onScreen();
      const limit=new Promise((_,reject)=>{
        job.stop=()=>reject(Error('CANCELLED'));
        timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},12000);
      });
      try {
        const query=group ? client.rpc('erp_get_meeting_workflow_manual',{p_revision:guideRevision})
          : client.rpc('erp_get_assembly_workflow_guide',{p_step:stepId||'start'});
        const {data,error}=await Promise.race([query.abortSignal?.(controller.signal)||query,limit]);
        if(!current())return;
        if(error)throw error;
        if(!group){
          if(data?.scope!==runtime.coop_id||data?.version!==assemblyRevision)throw Error('DATA');
          if(!stepId){if(!safeIndex(data.index))throw Error('DATA');index=data.index;}
          const id=stepId||index[0].id;
          if(!safeStep(data.step,id)||data.step.title!==index[selected]?.title)throw Error('DATA');
          cache.set(id,data.step);drawAssembly(data.step,focus);return;
        }
        const guide=data?.guide;
        if(data?.scope!==runtime.coop_id||guide?.version!==guideRevision||!Array.isArray(guide?.sections)||guide.sections.length!==4
          ||guide.sections.some(section=>typeof section?.label!=='string'||!Array.isArray(section.steps)||section.steps.length<1||section.steps.length>8
            ||section.steps.some(step=>typeof step?.title!=='string'||typeof step.path!=='string'||!Array.isArray(step.lines)
              ||step.lines.length<1||step.lines.length>6||step.lines.some(line=>typeof line!=='string'))))throw Error('DATA');
        legacy=guide;drawLegacy(guide,group-1);
      } catch(e) {
        if(!current())return;
        const denied=e?.code==='42501';
        status.textContent=denied?'현재 권한으로 회의 업무 가이드를 열 수 없습니다.':'가이드를 불러오지 못했습니다.';
        const retry=make('button','다시 확인');retry.type='button';retry.onclick=load;
        view.replaceChildren(...(picker?[picker]:[]),status,...(denied?[]:[retry]));
      } finally {
        clearTimeout(timer);if(pending===job)pending=null;
      }
    }
    button.onclick=()=>{
      if(!onScreen()||dialog.open)return;
      dialog.showModal();close.focus({preventScroll:true});void load();
    };
  }
  window.ErpMeetingManual=Object.freeze({mount});
})();
