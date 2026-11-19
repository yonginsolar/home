(() => {
  'use strict';
  const keys=['minutes.manage','member.admin','site.admin'];
  const allowed=r=>r?.is_active===true && r.modules?.minutes===true && !!r.coop_id
    && Array.isArray(r.base_effective_permissions)&&Array.isArray(r.effective_permissions)
    && keys.some(k=>r.base_effective_permissions.includes(k)&&r.effective_permissions.includes(k));
  const make=(name,text,css)=>{
    const node=document.createElement(name);if(text)node.textContent=text;if(css)node.className=css;return node;
  };
  function mount({button,client,runtime,active=()=>true}) {
    if(!button||!allowed(runtime)||button.dataset.meetingManualBound||typeof client?.rpc!=='function')return;
    button.dataset.meetingManualBound='true';button.hidden=false;
    const dialog=make('dialog',null,'meeting-manual');dialog.setAttribute('aria-labelledby','meetingManualTitle');
    const heading=make('h2','회의 업무 가이드');heading.id='meetingManualTitle';
    const close=make('button','닫기');close.type='button';
    const head=make('header',null,'meeting-manual-head');head.append(heading,close);
    const content=make('div',null,'meeting-manual-scroll');
    const status=make('p',null,'meeting-manual-status');status.setAttribute('role','status');
    dialog.append(head,content);document.body.append(dialog);
    let pending, identity=null, invalid=false, revision=0;
    const onScreen=()=>!invalid&&button.isConnected&&active()&&!window.frameElement?.hidden&&!document.hidden;
    const clear=()=>{
      revision++;const old=pending;pending=null;if(old){old.controller.abort();old.stop();}
      content.replaceChildren();
    };
    const stop=()=>{clear();if(dialog.open)dialog.close();};
    close.addEventListener('click',stop);
    dialog.addEventListener('cancel',e=>{e.preventDefault();stop();});
    dialog.addEventListener('close',()=>{if(!dialog.open)clear();});
    const offscreen=()=>{if(!onScreen())stop();};
    document.addEventListener('visibilitychange',offscreen);
    window.addEventListener('pagehide',stop);
    if(window.frameElement)new MutationObserver(offscreen).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
    client.auth?.onAuthStateChange?.((event,session)=>{
      const actor=session?.user?.id||null;
      if(event==='SIGNED_OUT'||(actor&&identity&&actor!==identity)){invalid=true;button.hidden=true;stop();}
      identity=actor||identity;
    });

    function draw(guide) {
      const nav=make('div',null,'meeting-manual-tabs');nav.setAttribute('role','group');nav.setAttribute('aria-label','회의 업무 단계');
      const view=make('div',null,'meeting-manual-steps');
      const items=guide.sections.map(x=>{const b=make('button',x.label);b.type='button';nav.append(b);return b;});
      function show(index) {
        items.forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));
        view.replaceChildren();
        guide.sections[index].steps.forEach((step,order)=>{
          const article=make('article');article.append(make('h3',`${order+1}. ${step.title}`),make('p',step.path,'meeting-manual-path'));
          for(const line of step.lines)article.append(make('p',line));
          const jpeg=['basics','agendas'].includes(step.screen)?guide.screens?.[step.screen]:null;
          if(typeof jpeg==='string'&&jpeg.length<180000&&/^\/9j\/[A-Za-z0-9+/=]+$/.test(jpeg)){
            const figure=make('figure');const img=make('img');img.alt=`가상 회의 ${step.title} 화면`;img.loading='lazy';
            const toggle=make('button','원래 크기');toggle.type='button';toggle.setAttribute('aria-pressed','false');
            const scroll=make('div',null,'meeting-manual-figure');scroll.tabIndex=0;scroll.setAttribute('aria-label',img.alt);scroll.append(img);
            toggle.onclick=()=>{const zoom=toggle.getAttribute('aria-pressed')!=='true';toggle.setAttribute('aria-pressed',String(zoom));toggle.textContent=zoom?'창에 맞추기':'원래 크기';scroll.classList.toggle('actual',zoom);scroll.scrollLeft=0;};
            img.src='data:image/jpeg;base64,'+jpeg;figure.append(scroll,make('figcaption','점검용 가상 회의 · 실제 ERP 화면'),toggle);article.append(figure);
          } else if(step.pending)article.append(make('small',`화면 준비 중: ${step.pending}`));
          view.append(article);
        });
        content.scrollTop=0;
      }
      items.forEach((b,i)=>b.onclick=()=>show(i));
      content.replaceChildren(nav,view);show(0);
    }
    async function load() {
      if(!onScreen()||!dialog.open||pending)return;
      const controller=new AbortController(), ticket=++revision;
      const job={controller,stop:()=>{}};pending=job;
      status.textContent='회의 업무 가이드를 불러오는 중…';content.replaceChildren(status);
      let timer;
      const current=()=>revision===ticket&&dialog.open&&onScreen();
      const limit=new Promise((_,reject)=>{
        job.stop=()=>reject(Error('CANCELLED'));
        timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},12000);
      });
      try {
        const query=client.rpc('erp_get_meeting_workflow_manual');
        const {data,error}=await Promise.race([query.abortSignal?.(controller.signal)||query,limit]);
        if(!current())return;
        if(error)throw error;
        const guide=data?.guide;
        if(data?.scope!==runtime.coop_id||guide?.version!=='2026-11-19.1'||!Array.isArray(guide?.sections)||guide.sections.length!==4)throw Error('DATA');
        draw(guide);
      } catch(e) {
        if(!current())return;
        const denied=e?.code==='42501';
        status.textContent=denied?'현재 권한으로 회의 업무 가이드를 열 수 없습니다.':'가이드를 불러오지 못했습니다.';
        const retry=make('button','다시 확인');retry.type='button';retry.onclick=load;
        content.replaceChildren(status,...(denied?[]:[retry]));
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
