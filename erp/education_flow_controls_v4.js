(function(root){
  'use strict';
  const create=(tag,text,classe)=>{
    const n=document.createElement(tag);
    if(text)n.textContent=text;if(classe)n.className=classe;return n;
  };
  const makeButton=(label,fn)=>{
    const el=create('button',label,'btn btn-sm btn-outline-primary');el.type='button';el.onclick=fn;return el;
  };
  const descriptions={
    application:{label:'사전 신청',timing:'교육 시작 전까지 신청할 수 있습니다.',list:'신청 명단',action:'applications'},
    feedback:{label:'익명 피드백',timing:'교육 종료 후 제출할 수 있습니다.',list:'받은 피드백',action:'feedback'}
  };
  function mount({containers,lists,rpc,origin,getRecord,inAttendance,stillCurrent,confirm}) {
    let record=null, tickets=null, feedbackPrompt=null, fetching=null, epoch=0, applicationTimer=null;
    const panels = Object.entries(containers).map(([purpose,section])=>{
      const details=purpose==='application'?section.querySelector('details'):section;
      const ended=purpose==='application'?section.querySelector('[data-application-ended]'):null;
      const area=details.querySelector('[data-controls]'), status=create('p','','small mb-2');
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const code=create('div','','qr-code-box p-2'), preview=create('div','','mb-2'), actions=create('div','','d-flex flex-wrap gap-2 mb-2');
      code.style.width='10rem';code.style.height='10rem';preview.append(code);
      const list=create('div','','small');
      const panel={purpose,section,details,ended,status,preview,code,actions,list,offset:0,listOpen:false,busy:false,listTick:0};
      const listSection=lists[purpose];
      listSection.querySelector('[data-controls]').append(list);
      const promptArea=create('div','','row g-2 mb-3');
      let promptInputs=null;
      if(purpose==='feedback'){
        promptInputs={};
        for(const [key,label] of [['rating_label','평점 질문'],['comment_label','의견 문구']]){
          const col=create('div','','col-md-6'),caption=create('label',label,'form-label small fw-bold');
          const input=create('input','','form-control');
          input.id='education-feedback-'+key;input.type='text';input.maxLength=120;caption.htmlFor=input.id;
          col.append(caption,input);promptArea.append(col);promptInputs[key]=input;
        }
      }
      area.append(status);
      // Do not place the Bootstrap row itself under [hidden]: .row declares display:flex.
      const promptWrapper=create('div');
      promptWrapper.append(promptArea);promptWrapper.hidden=true;
      if(promptInputs)area.append(promptWrapper);
      area.append(preview,actions);
      details.addEventListener('toggle',()=>{
        if(details.open&&!details.hidden&&!section.hidden)void initialize(panel);
      });
      listSection.addEventListener('toggle',()=>{
        if(listSection.open&&!listSection.hidden){panel.offset=0;void readList(panel);}
      });
      panel.listSection=listSection;
      panel.promptWrapper=promptWrapper;panel.promptInputs=promptInputs;
      return panel;
    });
    const applicationOpen=r=>Number.isFinite(Date.parse(r?.startsAt))&&Date.now()<Date.parse(r.startsAt);
    function watchApplicationCutoff(){
      clearTimeout(applicationTimer);
      const p=panels.find(item=>item.purpose==='application');
      const canShow=!inAttendance()&&!!record;
      const open=canShow&&applicationOpen(record);
      p.section.hidden=!canShow;
      p.details.hidden=!open;
      p.ended.hidden=!canShow||open;
      if(!open){
        p.details.open=false;p.actions.replaceChildren();p.code.replaceChildren();p.preview.hidden=true;
        return;
      }
      applicationTimer=setTimeout(watchApplicationCutoff,Math.min(2147483000,Math.max(1,Date.parse(record.startsAt)-Date.now())));
    }
    document.addEventListener('visibilitychange',watchApplicationCutoff);
    const current=(r,v)=>!!r?.id&&r===record&&v===epoch&&stillCurrent(r);
    const ask=async(action,r,fields={})=>{
      const {data,error}=await rpc(action,r.id,fields);
      if(error||!data)throw Object.assign(new Error('교육 QR을 확인하지 못했습니다.'),{code:error?.code,messageCode:error?.message});
      return data;
    };
    function link(purpose,token){
      const destination=new URL('/education_response_v1.html',origin);
      destination.search=new URLSearchParams({purpose,qr:token});
      return destination.href;
    }
    function printer(p,token){
      const r=record,v=epoch;
      if(!current(r,v)||typeof root.QRCode!=='function'||p.purpose==='application'&&!applicationOpen(r))return;
      const printPane=document.getElementById('educationFlowPrintSheet');
      const sheetTitle=create('h1',record.title||'교육');
      const sheetTopic=create('h2',descriptions[p.purpose].label+' QR');
      const qr=create('div','','education-flow-print-code');
      const schedule=record.schedule||'';
      printPane.replaceChildren(sheetTitle,sheetTopic,create('p',schedule),create('p',record.location||''),qr,create('p',descriptions[p.purpose].timing));
      new root.QRCode(qr,{text:link(p.purpose,token),width:420,height:420});
      document.body.classList.add('print-education-flow');
      root.requestAnimationFrame(()=>{
        if(current(r,v)&&(p.purpose!=='application'||applicationOpen(r)))root.print();
        else {document.body.classList.remove('print-education-flow');printPane.replaceChildren();}
      });
    }
    root.addEventListener('afterprint',()=>{
      document.body.classList.remove('print-education-flow');
      document.getElementById('educationFlowPrintSheet')?.replaceChildren();
    });
    function paint(p){
      p.actions.replaceChildren();p.code.replaceChildren();
      if(p.purpose==='application'&&!applicationOpen(record)){watchApplicationCutoff();return;}
      const token=tickets?.[p.purpose], d=descriptions[p.purpose];
      const hasPrompt=!!p.promptInputs&&!!feedbackPrompt;
      p.promptWrapper.hidden=!hasPrompt;
      if(hasPrompt)for(const input of Object.values(p.promptInputs))input.disabled=p.busy;
      p.preview.hidden=!token;
      if(token){
        const url=link(p.purpose,token);
        if(typeof root.QRCode==='function')new root.QRCode(p.code,{text:url,width:128,height:128});
        const open=create('a','신청 화면 열기','btn btn-sm btn-outline-primary');
        open.textContent=d.label+' 화면 열기';open.href=url;open.target='_blank';open.rel='noopener noreferrer';
        if(hasPrompt)p.actions.append(makeButton('문구 저장',()=>void change(p,'save_feedback_prompt')));
        p.actions.append(open,
          makeButton('링크 복사',async()=>{
            if(p.purpose==='application'&&!applicationOpen(record)){watchApplicationCutoff();return;}
            try{await navigator.clipboard.writeText(url);p.status.textContent='링크를 복사했습니다.';}
            catch(_){p.status.textContent='링크를 복사하지 못했습니다. 화면 열기에서 주소를 복사할 수 있습니다.';}
          }),
          makeButton('QR 인쇄',()=>printer(p,token)),
          makeButton(d.label+' QR 중지',()=>void change(p,'close')));
      }else p.actions.append(makeButton(d.label+' QR 만들기',()=>void change(p,'issue')));
      for(const button of p.actions.querySelectorAll('button'))button.disabled=p.busy;
    }
    async function initialize(p){
      const r=record,v=epoch;
      if(!current(r,v)||p.purpose==='application'&&!applicationOpen(r))return;
      if(!tickets){
        p.status.textContent='QR 설정을 확인하는 중입니다.';
        if(!fetching)fetching=ask('codes',r);
        const call=fetching;
        try{
          const data=await call;
          if(!current(r,v))return;tickets=data.codes||{};
          feedbackPrompt=data.feedback_prompt||null;
        }catch(_){
          if(current(r,v)&&(p.purpose!=='application'||applicationOpen(r))){
            p.status.textContent='QR 설정을 확인하지 못했습니다.';
            p.actions.replaceChildren(makeButton('다시 확인',()=>void initialize(p)));
          }
          return;
        }finally{if(fetching===call)fetching=null;}
      }
      if(p.promptInputs&&feedbackPrompt&&p.promptWrapper.hidden){
        for(const [key,input] of Object.entries(p.promptInputs))input.value=feedbackPrompt[key]||'';
      }
      p.status.textContent=descriptions[p.purpose].timing;paint(p);
    }
    async function change(p,action){
      const r=record,v=epoch;
      if(p.busy||!current(r,v))return;
      if(p.purpose==='application'&&!applicationOpen(r)){watchApplicationCutoff();return;}
      const fields={purpose:p.purpose};
      if(p.promptInputs&&action!=='close'){
        fields.feedback_prompt=Object.fromEntries(Object.entries(p.promptInputs).map(([key,input])=>[key,input.value.trim()]));
        fields.expected_prompt=feedbackPrompt;
        const blank=Object.keys(fields.feedback_prompt).find(key=>!fields.feedback_prompt[key]);
        if(blank){p.status.textContent='피드백에 표시할 문구를 입력해 주세요.';p.promptInputs[blank].focus();return;}
        for(const input of Object.values(p.promptInputs))input.disabled=true;
      }
      p.busy=true;
      for(const button of p.actions.querySelectorAll('button'))button.disabled=true;
      try{
        if(action==='close'&&!(await confirm('이 QR을 중지할까요? 이미 받은 신청이나 피드백은 그대로 남습니다.')))return;
        if(!current(r,v))return;
        if(p.purpose==='application'&&!applicationOpen(r)){watchApplicationCutoff();return;}
        const data=await ask(action,r,fields);
        if(!current(r,v))return;
        if(action==='issue'&&data.token)tickets[p.purpose]=data.token;
        else if(action==='close'&&data.closed)delete tickets[p.purpose];
        else if(action!=='save_feedback_prompt'||!data.feedback_prompt)throw new Error();
        if(p.promptInputs&&data.feedback_prompt){
          feedbackPrompt=data.feedback_prompt;
          for(const [key,input] of Object.entries(p.promptInputs))input.value=feedbackPrompt[key]||'';
        }
        p.status.textContent=action==='issue'?'QR을 만들었습니다.':action==='save_feedback_prompt'
          ?'피드백 문구를 저장했습니다.':'기존 QR을 중지했습니다.';
      }catch(error){
        if(current(r,v))p.status.textContent=error.code==='40001'
          ?'다른 화면에서 문구가 바뀌었습니다. 최신 문구를 확인하려면 이 창을 닫았다 다시 열어 주세요.'
          :error.messageCode==='EDUCATION_APPLICATION_CLOSED'
            ?'교육이 시작되어 사전 신청을 마감했습니다.'
            :'QR 상태를 확인하지 못했습니다. 다시 시도해 주세요.';
      }finally{
        if(current(r,v)){p.busy=false;paint(p);}
      }
    }
    async function readList(p){
      const r=record,v=epoch,seq=++p.listTick;
      if(!current(r,v))return;
      p.list.textContent='목록을 불러오는 중입니다.';
      try{
        const data=await ask(descriptions[p.purpose].action,r,{offset:p.offset});
        if(!current(r,v)||seq!==p.listTick)return;
        const caption=create('p',`${descriptions[p.purpose].list} · ${data.total}건`,'fw-bold mb-2');
        const list=create('ul','','ps-3');
        for(const value of data.rows.slice(0,50)){
          const row=p.purpose==='application'
            ?[value.name,value.is_guest?'비조합원':'조합원',value.phone_display].filter(Boolean).join(' · ')
            :`${value.rating}점${value.comment?' · '+value.comment:''}`;
          list.append(create('li',row,'text-break mb-1'));
        }
        p.list.replaceChildren(caption,list);
        if(p.offset>0)p.list.append(makeButton('이전 50건',()=>{p.offset=Math.max(0,p.offset-50);void readList(p);}));
        if(data.rows.length>50)p.list.append(makeButton('다음 50건',()=>{p.offset+=50;void readList(p);}));
      }catch(_){
        if(current(r,v)&&seq===p.listTick)p.list.replaceChildren(create('p','목록을 확인하지 못했습니다.'),makeButton('다시 확인',()=>void readList(p)));
      }
    }
    function reset(){
      const next=getRecord();
      record=next;epoch++;fetching=null;tickets=null;feedbackPrompt=null;
      for(const p of panels){
        p.section.hidden=!next||inAttendance();p.details.open=false;
        p.listSection.hidden=!next||!inAttendance();p.listSection.open=false;
        p.list.replaceChildren();p.code.replaceChildren();p.actions.replaceChildren();
        p.preview.hidden=true;p.status.textContent='';p.offset=0;p.busy=false;p.listTick++;
        p.promptWrapper.hidden=true;
        if(p.promptInputs)for(const input of Object.values(p.promptInputs)){input.value='';input.disabled=false;}
      }
      watchApplicationCutoff();
    }
    reset();
    return Object.freeze({reset});
  }
  root.EducationFlowControls=Object.freeze({mount});
})(window);
