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
    let record=null, tickets=null, survey=null, legacyPrompt=null, fetching=null, epoch=0, applicationTimer=null;
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
      area.append(status);
      area.append(preview,actions);
      details.addEventListener('toggle',()=>{
        if(details.open&&!details.hidden&&!section.hidden)void initialize(panel);
      });
      listSection.addEventListener('toggle',()=>{
        if(listSection.open&&!listSection.hidden){panel.offset=0;void readList(panel);}
      });
      panel.listSection=listSection;
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
    const dialog=document.getElementById('educationSurveyDialog');
    const dialogTitle=dialog.querySelector('h2'), dialogBody=dialog.querySelector('[data-survey-body]');
    const dialogStatus=dialog.querySelector('[data-survey-status]'), dialogFooter=dialog.querySelector('[data-survey-actions]');
    const eventModal=document.getElementById('eventModal');
    let dialogTrigger=null;
    let formLoading;
    function surveyForm(){
      if(root.CoopEducationSurveyForm)return Promise.resolve(root.CoopEducationSurveyForm);
      return formLoading??=new Promise((resolve,reject)=>{
        const script=create('script');
        script.src=dialog.dataset.surveySrc;script.integrity=dialog.dataset.surveyIntegrity;script.crossOrigin='anonymous';
        script.onload=()=>root.CoopEducationSurveyForm?resolve(root.CoopEducationSurveyForm):reject(new Error());
        script.onerror=()=>{script.remove();reject(new Error());};
        document.head.append(script);
      }).catch(error=>{formLoading=null;throw error;});
    }
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
    dialog.addEventListener('cancel',event=>{if(dialog.dataset.saving==='true')event.preventDefault();});
    dialog.addEventListener('close',()=>{
      if(dialogTrigger?.isConnected)dialogTrigger.focus({preventScroll:true});
      dialogTrigger=null;
    });
    eventModal.addEventListener('hide.bs.modal',()=>{dialogTrigger=null;if(dialog.open)dialog.close();});
    async function showSurvey(p,trigger,mode){
      const r=record,v=epoch,base=survey?.revision||null;
      if(!current(r,v)||dialog.open)return;
      let form;
      try{form=await surveyForm();}
      catch(_){if(current(r,v))p.status.textContent='피드백 화면을 불러오지 못했습니다. 다시 시도해 주세요.';return;}
      if(!current(r,v)||dialog.open||!trigger.isConnected)return;
      const blank=(title='',type='scale5',required=true)=>({id:crypto.randomUUID(),title,type,required});
      const draft=mode==='preview'?(survey?.questions||[]):(survey?.questions.map(q=>({...q}))||[blank()]);
      const button=(label,fn,style='btn btn-sm btn-outline-primary')=>{
        const b=makeButton(label,fn);b.className=style;return b;
      };
      const close=button('닫기',()=>dialog.close(),'btn btn-sm btn-outline-secondary');
      const edit=()=>displayEditor();
      const editor=mode!=='preview';
      const valid=()=>{
        if(!draft.length){dialogStatus.textContent='질문을 하나 이상 추가해 주세요.';return false;}
        const missing=draft.findIndex(q=>!q.title.trim());
        if(missing!==-1){
          dialogStatus.textContent='질문을 입력해 주세요.';
          dialogBody.querySelectorAll('input[data-survey-title]')[missing]?.focus();
          return false;
        }
        return true;
      };
      function displayPreview(){
        dialogTitle.textContent='익명 피드백 미리보기';
        dialogStatus.textContent='';
        const caption=create('p',r.title,'fw-bold');
        const questions=create('div');
        if(draft.length)form.render(questions,draft);
        else form.previewLegacy(questions,legacyPrompt);
        dialogBody.replaceChildren(caption,questions);
        dialogFooter.replaceChildren(editor?button('편집으로 돌아가기',()=>{edit();dialogBody.querySelector('input')?.focus();}):close);
        dialogFooter.firstElementChild.focus();
      }
      function displayEditor(focusIndex=null){
        dialogTitle.textContent=base?'익명 피드백 수정':'익명 피드백 만들기';
        dialogStatus.textContent='';
        dialogBody.replaceChildren();
        draft.forEach((q,index)=>{
          const card=create('fieldset','','form-section mt-2');
          const legend=create('legend','질문 '+(index+1),'h6 fw-bold');
          const input=create('input','','form-control mb-2');
          input.type='text';input.maxLength=160;input.value=q.title;
          input.setAttribute('data-survey-title','');
          input.setAttribute('aria-label','질문 '+(index+1)+' 문구');
          input.oninput=()=>{q.title=input.value;};
          const type=create('select','','form-select mb-2');
          type.setAttribute('aria-label','질문 '+(index+1)+' 유형');
          for(const [value,label] of Object.entries(form.types)){
            const option=create('option',label);option.value=value;type.append(option);
          }
          type.value=q.type;type.onchange=()=>{q.type=type.value;};
          const tools=create('div','','d-flex flex-wrap align-items-center gap-2');
          const required=create('label',' 필수 응답','me-2');
          const check=create('input');check.type='checkbox';check.checked=q.required;
          check.onchange=()=>{q.required=check.checked;};required.prepend(check);
          const move=(by)=>{
            [draft[index],draft[index+by]]=[draft[index+by],draft[index]];
            displayEditor(index+by);
          };
          const up=button('위로',()=>move(-1)),down=button('아래로',()=>move(1));
          up.disabled=index===0;down.disabled=index===draft.length-1;
          tools.append(required,up,down,button('삭제',()=>{draft.splice(index,1);displayEditor(Math.min(index,draft.length-1));},'btn btn-sm btn-outline-danger'));
          card.append(legend,input,type,tools);dialogBody.append(card);
        });
        const add=button('질문 추가',()=>{draft.push(blank('', 'text',false));displayEditor(draft.length-1);});
        add.disabled=draft.length>=20;dialogBody.append(add);
        dialogFooter.replaceChildren(close,button('미리보기',()=>{if(valid())displayPreview();}),
          button('저장',()=>void save(),'btn btn-sm btn-primary'));
        if(focusIndex!==null)(dialogBody.querySelectorAll('input[data-survey-title]')[focusIndex]||add).focus();
      }
      async function save(){
        if(dialog.dataset.saving==='true'||!current(r,v)||!valid())return;
        dialog.dataset.saving='true';
        const fields=[...dialog.querySelectorAll('button,input,select')].filter(el=>!el.disabled);
        for(const field of fields)field.disabled=true;
        dialogStatus.textContent='저장 중입니다.';
        try{
          const result=await ask('save_survey',r,{expected_revision:base,questions:draft.map(q=>({...q,title:q.title.trim()}))});
          if(!current(r,v)||!dialog.open)return;
          if(!result.survey||!result.token)throw new Error();
          survey=result.survey;tickets.feedback_survey=result.token;
          p.status.textContent='익명 피드백을 저장했습니다.';
          paint(p);dialogTrigger=p.actions.querySelector('button');dialog.close();
        }catch(error){
          if(current(r,v)&&dialog.open)dialogStatus.textContent=error.code==='40001'
            ?'다른 화면에서 설문이 바뀌었습니다. 입력을 확인한 뒤 교육 수정 창을 다시 열어 주세요.'
            :'저장 결과를 확인하지 못했습니다. 입력은 그대로 두었으니 다시 시도해 주세요.';
        }finally{
          delete dialog.dataset.saving;
          for(const field of fields)field.disabled=false;
        }
      }
      dialogTrigger=trigger;
      dialog.showModal();
      if(mode==='preview')displayPreview();
      else displayEditor(0);
    }
    function paint(p){
      p.actions.replaceChildren();p.code.replaceChildren();
      if(p.purpose==='application'&&!applicationOpen(record)){watchApplicationCutoff();return;}
      const isFeedback=p.purpose==='feedback', hasSurvey=isFeedback&&!!survey;
      const legacy=isFeedback&&!!tickets?.feedback;
      const token=hasSurvey?tickets.feedback_survey:tickets?.[p.purpose], d=descriptions[p.purpose];
      if(isFeedback){
        const edit=makeButton(hasSurvey?'익명 피드백 수정':'익명 피드백 만들기',event=>showSurvey(p,event.currentTarget,'editor'));
        p.actions.append(edit);
      }
      p.preview.hidden=!token;
      if(token){
        const url=link(p.purpose,token);
        if(typeof root.QRCode==='function')new root.QRCode(p.code,{text:url,width:128,height:128});
        const open=create('a','신청 화면 열기','btn btn-sm btn-outline-primary');
        open.textContent=isFeedback?'미리보기':d.label+' 화면 열기';open.href=url;open.target='_blank';open.rel='noopener noreferrer';
        p.actions.append(isFeedback?makeButton('미리보기',event=>void showSurvey(p,event.currentTarget,'preview')):open,
          makeButton('링크 복사',async()=>{
            if(p.purpose==='application'&&!applicationOpen(record)){watchApplicationCutoff();return;}
            try{await navigator.clipboard.writeText(url);p.status.textContent='링크를 복사했습니다.';}
            catch(_){p.status.textContent='링크를 복사하지 못했습니다. 화면 열기에서 주소를 복사할 수 있습니다.';}
          }),
          makeButton('QR 인쇄',()=>printer(p,token)),
          makeButton(d.label+' QR 중지',()=>void change(p,hasSurvey?'close_survey':'close')));
      }else if(!isFeedback)p.actions.append(makeButton(d.label+' QR 만들기',()=>void change(p,'issue')));
      if(hasSurvey&&legacy)p.actions.append(makeButton('기존 피드백 QR 중지',()=>void change(p,'close')));
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
          survey=data.survey||null;
          legacyPrompt=data.feedback_prompt||null;
        }catch(_){
          if(current(r,v)&&(p.purpose!=='application'||applicationOpen(r))){
            p.status.textContent='QR 설정을 확인하지 못했습니다.';
            p.actions.replaceChildren(makeButton('다시 확인',()=>void initialize(p)));
          }
          return;
        }finally{if(fetching===call)fetching=null;}
      }
      p.status.textContent=descriptions[p.purpose].timing;paint(p);
    }
    async function change(p,action){
      const r=record,v=epoch;
      if(p.busy||!current(r,v))return;
      if(p.purpose==='application'&&!applicationOpen(r)){watchApplicationCutoff();return;}
      const fields={purpose:p.purpose};
      if(action==='close_survey')fields.expected_revision=survey?.revision||null;
      p.busy=true;
      for(const button of p.actions.querySelectorAll('button'))button.disabled=true;
      try{
        if(action!=='issue'&&!(await confirm('이 QR을 중지할까요? 이미 받은 신청이나 피드백은 그대로 남습니다.')))return;
        if(!current(r,v))return;
        if(p.purpose==='application'&&!applicationOpen(r)){watchApplicationCutoff();return;}
        const data=await ask(action,r,fields);
        if(!current(r,v))return;
        if(action==='issue'&&data.token)tickets[p.purpose]=data.token;
        else if(action==='close'&&data.closed)delete tickets[p.purpose];
        else if(action==='close_survey'&&data.closed){delete tickets.feedback_survey;survey=null;}
        else throw new Error();
        p.status.textContent=action==='issue'?'QR을 만들었습니다.':'QR을 중지했습니다.';
      }catch(error){
        if(current(r,v))p.status.textContent=error.code==='40001'
          ?'다른 화면에서 설문이 바뀌었습니다. 최신 설문을 확인하려면 이 창을 닫았다 다시 열어 주세요.'
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
        const renderer=p.purpose==='feedback'&&data.rows.some(value=>Array.isArray(value.questions))?await surveyForm():null;
        if(!current(r,v)||seq!==p.listTick)return;
        const caption=create('p',`${descriptions[p.purpose].list} · ${data.total}건`,'fw-bold mb-2');
        const list=create('ul','','ps-3');
        for(const value of data.rows.slice(0,50)){
          if(p.purpose==='feedback'&&Array.isArray(value.questions)){
            const row=create('li','','mb-3');
            const details=create('dl','','mb-0');
            for(const q of value.questions){
              details.append(create('dt',q.title,'text-break'),create('dd',
                renderer.answerText(q,value.answers?.[q.id]),'education-survey-answers mb-1'));
            }
            row.append(details);list.append(row);continue;
          }
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
      record=next;epoch++;fetching=null;tickets=null;survey=null;legacyPrompt=null;
      if(dialog.open){dialogTrigger=null;dialog.close();}
      for(const p of panels){
        p.section.hidden=!next||inAttendance();p.details.open=false;
        p.listSection.hidden=!next||!inAttendance();p.listSection.open=false;
        p.list.replaceChildren();p.code.replaceChildren();p.actions.replaceChildren();
        p.preview.hidden=true;p.status.textContent='';p.offset=0;p.busy=false;p.listTick++;
      }
      watchApplicationCutoff();
    }
    reset();
    return Object.freeze({reset});
  }
  root.EducationFlowControls=Object.freeze({mount});
})(window);
