(function(root){
  'use strict';
  const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
  // A host is added only after its authenticated server is deployed and verified.
  const activatedOrigins=new Set([]);
  const canProbe=()=>activatedOrigins.has(root.location.origin);
  function availability({key,probe,changed,mayProbe=canProbe}){
    let value='',ready=false,job=null;
    const hide=()=>{
      job?.abort();job=null;value='';ready=false;changed(false);
    };
    const sync=()=>{
      const k=mayProbe()?key():'';
      if(!k){if(job||value||ready)hide();return;}
      if(k===value)return;
      hide();value=k;
      const current=new AbortController();job=current;
      const timer=root.setTimeout(()=>current.abort(),8000);
      Promise.resolve().then(()=>probe(current.signal)).then(result=>{
        if(job!==current||current.signal.aborted||key()!==k||!mayProbe())return;
        ready=result?.ready===true;changed(ready);
      }).catch(()=>{}).finally(()=>{
        root.clearTimeout(timer);
        if(job===current)job=null;
      });
    };
    return {sync,hide,ready:()=>ready&&mayProbe()&&value===key()};
  }
  function mount({doc=root.document,context,unchanged,send,preview,apply}){
    if (![context,unchanged,send,preview,apply].every(f=>typeof f==='function'))return null;
    const make=(tag,text='')=>{const el=doc.createElement(tag);el.textContent=text;return el;};
    const button=(text,type='button')=>Object.assign(make('button',text),{type,className:'btn btn-sm btn-outline-primary'});
    const dialog=make('dialog');dialog.className='border rounded-3 shadow bg-body text-body p-3';
    dialog.style.cssText='box-sizing:border-box;width:min(62rem,calc(100vw - 1.5rem));height:min(43rem,calc(100dvh - 1.5rem));max-height:none;overflow:auto;background:Canvas;color:CanvasText;padding:1rem;border:1px solid #808080;border-radius:.75rem';
    dialog.setAttribute('aria-label','AI 편집 시안');
    const form=make('form'),heading=make('h2','AI 편집 시안'),detail=make('p'),label=make('label','어떻게 바꿀까요?');
    heading.className='h5 fw-bold';
    const input=make('textarea');input.rows=2;input.maxLength=750;input.required=true;input.className='form-control';
    input.style.cssText='display:block;width:100%;margin-block:.35em .85em;font:inherit';
    label.className='d-block mb-2';label.append(input);
    const choice=make('label','작업 범위');choice.className='d-block mb-2';
    const mode=make('select');mode.className='form-select';
    for(const [key,text] of [['layout','문구 그대로 · 글자와 사진 배치'],['copy','선택한 문구 다듬기']]){
      const opt=make('option',text);opt.value=key;mode.append(opt);
    }
    choice.append(mode);
    const outgoing=make('details');outgoing.className='mb-2';
    const source=make('pre');source.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:8rem;overflow:auto';
    outgoing.append(make('summary','AI에 보낼 내용 확인'),source);
    const manualLabel=make('label','AI에 보낼 회의 내용');
    const manual=make('textarea');manual.className='form-control';manual.rows=4;manual.maxLength=4000;
    manual.style.cssText=input.style.cssText;
    manualLabel.className='d-block mb-2';manualLabel.append(manual);
    const toolbar=make('div'),submit=button('이 내용 보내고 시안 만들기','submit'),close=button('닫기');
    const status=make('p');status.className='my-2';status.setAttribute('role','status');
    const results=make('div');results.className='row row-cols-1 row-cols-lg-2 gx-3 gy-3';
    results.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:.75rem;margin:0';
    toolbar.className='d-flex flex-wrap gap-2';toolbar.append(submit,close);
    form.append(heading,detail,choice,label,outgoing,manualLabel,toolbar,status,results);
    dialog.append(form);doc.body.append(dialog);
    let active=null,attempt=null,applying=false,version=0,opener=null;
    function valid(s){return active===s&&dialog.open&&unchanged(s);}
    function clearAttempt(){attempt?.abort();attempt=null;applying=false;}
    function hide(restore=false){
      const old=opener,owned=dialog.contains(doc.activeElement);
      active=null;opener=null;clearAttempt();results.replaceChildren();source.textContent='';input.value='';manual.value='';status.textContent='';
      if(dialog.open)dialog.close();
      if(restore&&owned&&old?.isConnected&&!old.disabled)old.focus({preventScroll:true});
    }
    function requestFields(s){
      const fields={title:'',subtitle:'',body:'',list:''};
      if(s.manualSource){fields.body=manual.value;return fields;}
      if(s.target==='all')return {...fields,...s.source};
      fields[s.target]=s.source[s.target]||'';
      return fields;
    }
    function describe(){
      if(!active)return;
      const fields=requestFields(active);
      source.textContent=Object.entries(fields).filter(([,v])=>v).map(([k,v])=>
        ({title:'제목',subtitle:'부제목',body:'본문',list:'목록'})[k]+'\n'+v).join('\n\n') || '현재 내용이 없습니다. 요청 문구만 보냅니다.';
    }
    function open(target,trigger){
      const s=context(target);
      if(!s||dialog.open)return false;
      active=s;opener=trigger||null;version++;
      mode.value=target==='all'?'layout':'copy';choice.hidden=target!=='all';
      input.value=target==='all'?'읽기 편하고 조합의 분위기가 살아나게 바꿔줘.':'현재 뜻을 유지하면서 자연스럽고 읽기 쉽게 다듬어 줘.';
      manual.value='';manualLabel.hidden=!s.manualSource;manual.required=!!s.manualSource;manual.disabled=!s.manualSource;outgoing.hidden=!!s.manualSource;
      detail.textContent=s.manualSource?'확인된 내용 중 보낼 부분만 입력해 주세요. 첨부·서명과 기존 본문은 자동으로 보내지 않습니다.'
        :s.label+'와 아래 요청만 AI에 보냅니다. 사진 파일은 보내지 않습니다.';
      if(s.manualSource)input.value=s.scope==='meeting_minutes'?'확인된 내용은 그대로 두고 문단을 읽기 좋게 나눠 줘.':'이 내용을 회의자료 문장으로 간결하게 정리해 줘.';
      status.textContent='';source.textContent='';outgoing.open=false;submit.disabled=false;results.replaceChildren();
      describe();
      dialog.showModal();
      input.focus({preventScroll:true});
      return true;
    }
    const clearProposals=()=>{
      version++;clearAttempt();results.replaceChildren();
      if(active){submit.disabled=false;status.textContent='';describe();}
    };
    input.addEventListener('input',clearProposals);manual.addEventListener('input',clearProposals);mode.addEventListener('change',clearProposals);
    close.onclick=()=>hide(true);
    dialog.addEventListener('cancel',event=>{event.preventDefault();hide(true);});
    dialog.addEventListener('close',()=>{if(!dialog.open&&active)hide();});
    dialog.addEventListener('keydown',event=>{if(event.repeat&&(event.key==='Enter'||event.key===' ')){
      if(event.target.matches('button,select'))event.preventDefault();
    }});
    form.onsubmit=async event=>{
      event.preventDefault();
      const s=active,m=mode.value,stamp=version, prompt=input.value.trim();
      if(!s||!valid(s)||attempt||applying||!prompt)return;
      const token=new AbortController(),request_id=root.crypto?.randomUUID?.();
      if(!request_id){status.textContent='보안 연결에서 다시 열어 주세요.';return;}
      attempt=token;submit.disabled=true;status.textContent='시안을 만들고 있어요.';results.replaceChildren();
      try{
        const destination={scope:s.scope||'homepage_about',reference:s.reference??null};
        const sent=requestFields(s);
        const got=await send({request_id,target:s.target,mode:m,prompt,source:sent,has_photo:s.hasPhoto,consent:true,...destination},token.signal);
        if(attempt!==token||stamp!==version)return;
        if(!valid(s)){hide();return;}
        if(!Array.isArray(got?.variants)||got.variants.length!==2)throw Error(got?.error||'proposal');
        const cards=doc.createDocumentFragment();
        for(const option of got.variants){
          if(!isObject(option)||typeof option.label!=='string')throw Error('proposal');
          const visual=preview(option,s,m);
          if(!visual)throw Error('proposal');
          const column=make('div'),card=make('section'),title=make('h3',option.label),use=button('이 시안을 초안에 적용');
          column.className='col';card.className='border rounded p-3 h-100';title.className='h6';
          column.style.cssText='width:auto;min-width:0;padding:0';card.style.cssText='border:1px solid #919191;border-radius:.5rem;padding:.75rem;height:100%';
          use.classList.add('mt-2');card.append(title,visual,use);column.append(card);cards.append(column);
          use.onclick=async()=>{
            if(!valid(s)||stamp!==version||applying)return;
            applying=true;const confirmation=new AbortController();attempt=confirmation;
            const buttons=[...results.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
            submit.disabled=true;status.textContent='적용할 수 있는지 확인하고 있어요.';
            try{
              const access=await send({status:true,...destination},confirmation.signal);
              if(attempt!==confirmation||stamp!==version)return;
              if(!valid(s)){hide();return;}
              if(access?.ready!==true){status.textContent='지금은 적용할 수 없어요. 권한을 다시 확인해 주세요.';return;}
              if(apply(option,s,m)!==true){status.textContent='기존 서식이나 링크를 유지하려면 이 문구 변경은 적용할 수 없어요.';return;}
              hide(true);
            }catch{if(valid(s)&&attempt===confirmation)status.textContent='적용 권한을 확인하지 못했어요. 다시 눌러 주세요.';}
            finally{if(attempt===confirmation){attempt=null;applying=false;submit.disabled=false;buttons.forEach(b=>b.disabled=false);}}
          };
        }
        results.append(cards);status.textContent='마음에 드는 시안을 골라 주세요.';
      }catch(error){
        if(attempt!==token||stamp!==version)return;
        if(!valid(s)){hide();return;}
        status.textContent=({invalid:'링크나 연락처가 포함되었거나 보낼 글이 너무 길어요. 보낼 내용을 확인해 주세요.',
          too_large:'보낼 글이 너무 길어요.',limited:'AI 요청 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.',
          denied:'AI 편집을 사용할 권한이 없어요.',unavailable:'아직 AI를 이용할 수 없어요. 기존 편집은 계속할 수 있습니다.',
          duplicate:'같은 요청은 다시 보낼 수 없어요.',proposal_unavailable:'받은 시안을 표시할 수 없어요. 요청을 바꿔 다시 시도해 주세요.'})[error?.message]
          ||'시안을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      }finally{if(attempt===token){attempt=null;submit.disabled=false;}}
    };
    return {open,close:hide,isOpen:()=>dialog.open};
  }
  root.CoopAiEditPanel=Object.freeze({version:'1.0.1',mount,canProbe,availability});
})(window);
