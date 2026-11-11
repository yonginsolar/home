(function (root) {
  'use strict';
  const CLOCK = /^([01]\d|2[0-3]):(00|30)$/;
  const WEEK = [1, 2, 3, 4, 5];
  const RPC = 'erp_self_leave_work_schedule';
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  function formatDeduction(value){
    const minutes=Math.max(0,Math.round(Number(value)||0));
    if(minutes<=480)return root.CoopLeaveTime.formatMinutes(minutes);
    return `${Math.floor(minutes/480)}일 ${Math.floor(minutes%480/60)}시간${minutes%60?` ${minutes%60}분`:''}`;
  }

  function cleanSchedule(raw, time) {
    const work = time.breakWindow(raw.work_start,raw.work_end);
    const pause = time.breakWindow(raw.break_start,raw.break_end);
    const days = [...new Set((Array.isArray(raw.days)?raw.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort();
    if (!work) throw Error('퇴근 시간은 출근 시간보다 늦어야 해요.');
    if ((raw.break_start||raw.break_end) && (!pause||pause.a<work.a||pause.b>work.b||pause.b-pause.a===work.b-work.a)) throw Error('휴게 시작과 종료를 출근·퇴근 시간 사이에서 골라 주세요.');
    if (!days.length) throw Error('근무 요일을 하나 이상 선택해 주세요.');
    return {work_start:work.start,work_end:work.end,break_start:pause?.start||'',break_end:pause?.end||'',days};
  }

  function create(ctx) {
    const doc = ctx.document, time = root.CoopLeaveTime;
    const area = doc.getElementById('approvalAnnualClock');
    if (!area || !time) return null;
    const make = (tag, className='', text='') => {
      const el=doc.createElement(tag);el.className=className;el.textContent=text;return el;
    };
    const label = (text, control) => {
      const el=make('label','small fw-bold text-muted d-block',text);el.append(control);return el;
    };
    const input = (type,id,cls='form-control') => { const el=make('input',cls);el.type=type;el.id=id;return el; };
    const button = (text,cls='btn btn-sm btn-outline-secondary') => { const b=make('button',cls,text);b.type='button';return b; };
    const startDate=input('date','annualClockStartDate'),endDate=input('date','annualClockEndDate');
    const endGroup=make('div','leave-entry-pair mt-2 hidden');
    const status=make('p','small text-muted my-2');status.setAttribute('role','status');
    const edit=button('근무시간 정정 요청'),retry=button('다시 확인'),remove=button('요청 빼기');
    edit.id='annualWorkCorrectionOpen';
    remove.id='annualWorkCorrectionRemove';
    const editor=make('fieldset','border rounded p-2 mt-2 hidden');
    const editStatus=make('p','small mb-0 mt-2');editStatus.setAttribute('role','status');
    const workStart=input('time','annualWorkStart'),workEnd=input('time','annualWorkEnd');
    const breakStart=input('time','annualWorkBreakStart');
    const breakDescription=make('p','small text-muted mb-0');
    const scheduleDescription=make('p','small text-muted my-2');
    const scheduleSave=button('요청 담기','btn btn-sm btn-primary'),cancel=button('취소');
    scheduleSave.id='annualWorkCorrectionAdd';
    cancel.id='annualWorkCorrectionCancel';
    let owner=null, pref=null, editOpen=false, correction=null, follows=true, halfChoice='';
    let epoch=0, ticket=null, editorBaseline=null, lastStart='';
    const correctionDrafts=new Map(),clockDrafts=new Map();
    let startMenu={values:[]}, activeMode='annual', snapshotRetry=null;
    const halfLabel=slot=>slot==='am'?'오전':slot==='pm'?'오후':'';

    function datePicker(field,caption,availability,guidance){
      const wrapper=make('div','leave-date-picker'),trigger=button('날짜 선택','btn btn-outline-secondary');
      const panel=make('div','border rounded p-1 mt-1 hidden'),head=make('div','leave-date-month mb-1');
      const previous=button('‹'),next=button('›'),monthText=make('strong','small');
      const weekdays=make('div','leave-date-grid small text-muted'),grid=make('div','leave-date-grid');
      const hint=make('p','small text-muted mt-1 mb-0');hint.setAttribute('role','status');
      const refreshLeave=button('휴가 내역 다시 확인');refreshLeave.classList.add('hidden','mt-1');
      const months=make('select','form-select form-select-sm');months.setAttribute('aria-label','달 선택');
      months.setAttribute('data-approval-ui-only','');
      for(let n=1;n<=12;n++){const opt=make('option','',`${n}월`);opt.value=String(n);months.append(opt);}
      panel.id=`${field.id}Calendar`;trigger.id=`${field.id}Pick`;
      trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',panel.id);
      previous.setAttribute('aria-label','이전 달');next.setAttribute('aria-label','다음 달');
      monthText.setAttribute('aria-live','polite');grid.setAttribute('aria-label',`${caption} 선택`);
      weekdays.setAttribute('aria-hidden','true');for(const [i,name] of ['일','월','화','수','목','금','토'].entries()){
        const day=make('span','',name);if(i===0||i===6)day.dataset.leaveDay=i===0?'sunday':'saturday';weekdays.append(day);
      }
      head.append(previous,monthText,months,next);panel.append(head,weekdays,grid,hint,refreshLeave);wrapper.append(trigger,panel);
      field.insertAdjacentElement('afterend',wrapper);
      let shown=true,open=false,month=1,lastKey='';
      function close(focus=false){open=false;panel.classList.add('hidden');trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
      function dateStatus(date,model){
        const result=availability(date,model);
        return typeof result==='string'?{reason:result}:result;
      }
      function refresh(model=calendarModel()){
        trigger.textContent=field.value||'날짜 선택';
        trigger.setAttribute('aria-label',`${caption}: ${trigger.textContent}`);
        if(!open||!shown)return;
        refreshLeave.classList.toggle('hidden',!!model.snapshot?.workBasis&&model.clock?.state!=='error'&&!canRetryPersonal());
        refreshLeave.disabled=!!snapshotRetry||(!model.snapshot?.workBasis&&model.snapshotRead==='loading');
        const year=Number(time.yearOf()),daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
        const firstDay=new Date(Date.UTC(year,month-1,1)).getUTCDay();
        const entries=Array.from({length:daysInMonth},(_,i)=>{
          const date=`${year}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
          const weekday=(firstDay+i)%7,kind=model.clock?.calendar?.has(date)?'holiday':weekday===0?'sunday':weekday===6?'saturday':'';
          return {date,kind,...dateStatus(date,model)};
        });
        const key=JSON.stringify([year,month,field.value,entries]);
        if(key===lastKey)return;
        lastKey=key;previous.disabled=month<=1;next.disabled=month>=12;months.value=String(month);
        monthText.textContent=`${year}년`;
        const active=doc.activeElement,current=grid.contains(active)?active?.dataset.leaveDate:null;
        grid.replaceChildren(...Array.from({length:firstDay},()=>make('span')));
        const buttons=[];
        entries.forEach(({date,kind,reason,slot},i)=>{
          const b=button(String(i+1),`btn btn-sm ${field.value===date?'btn-primary':'btn-outline-secondary'}`);
          b.dataset.leaveDate=date;b.disabled=!!reason;b.tabIndex=-1;b.setAttribute('aria-pressed',String(field.value===date));
          if(kind)b.dataset.leaveDay=kind;
          const half=halfLabel(slot),detail=reason||(half?`${half}만 신청 가능`:'');
          if(half){b.dataset.leaveHalf=slot;b.append(make('small','leave-date-half',half));}
          b.setAttribute('aria-label',detail?`${date}: ${detail}`:date);if(detail)b.title=detail;
          b.addEventListener('click',()=>{
            const blocked=dateStatus(date,calendarModel()).reason;
            if(blocked){refresh();hint.textContent=blocked;return;}
            const changed=field.value!==date;field.value=date;close(true);
            if(changed)field.dispatchEvent(new root.Event('change',{bubbles:true}));
            refresh();
          });
          grid.append(b);buttons.push(b);
        });
        const enabled=buttons.filter(b=>!b.disabled),tab=enabled.find(b=>b.dataset.leaveDate===current)||enabled.find(b=>b.dataset.leaveDate===field.value)||enabled[0];
        if(tab)tab.tabIndex=0;
        if(current&&!root.frameElement?.hidden)(tab||months).focus();
        hint.textContent=(enabled.length
          ?guidance||'근무일만 고를 수 있어요. 이미 신청한 휴가와는 겹칠 수 없어요.'
          :entries.find(e=>e.reason.includes('확인'))?.reason||'이 달에 선택할 수 있는 날짜가 없어요.');
      }
      function turn(to){if(to<1||to>12)return;month=to;refresh();}
      trigger.addEventListener('click',()=>{
        if(open){close();return;}
        if(!shown)return;
        month=Number((time.inYear(field.value)?field.value:time.kstClock(ctx.now?.()).date).slice(5,7));
        open=true;lastKey='';panel.classList.remove('hidden');trigger.setAttribute('aria-expanded','true');refresh();
        (grid.querySelector('[tabindex="0"]')||months).focus();
      });
      previous.addEventListener('click',()=>turn(month-1));next.addEventListener('click',()=>turn(month+1));
      refreshLeave.addEventListener('click',retryCalendarRead);
      months.addEventListener('change',()=>turn(Number(months.value)));
      // Browsing the calendar is not a form input or a new leave selection.
      for(const event of ['input','change'])months.addEventListener(event,e=>e.stopPropagation());
      wrapper.addEventListener('keydown',e=>{
        if(e.repeat&&e.key==='Enter'&&e.target.closest('button'))e.preventDefault();
      },true);
      panel.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
        const current=e.target.closest('[data-leave-date]');if(!current)return;
        const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(!step)return;
        e.preventDefault();const all=[...grid.querySelectorAll('[data-leave-date]')];
        for(let i=all.indexOf(current)+step;i>=0&&i<all.length;i+=Math.sign(step))if(!all[i].disabled){current.tabIndex=-1;all[i].tabIndex=0;all[i].focus();break;}
      });
      return {refresh,close,show(value){shown=value;field.hidden=value;field.classList.toggle('hidden',value);wrapper.classList.toggle('hidden',!value);if(!value)close();}};
    }

    function clockControl(side,title) {
      const clock=make('select','form-select');clock.id=`annualClock${side}Time`;
      clock.hidden=true;clock.classList.add('hidden');
      const wrapper=make('div','leave-clock-picker'),heading=make('div','small fw-bold text-muted',title);
      const trigger=button('','btn btn-outline-secondary leave-clock-trigger'),icon=make('span','leave-clock-icon');
      const caption=make('span','leave-clock-caption'),arrow=make('span','leave-clock-chevron');
      const panel=make('div','leave-clock-panel hidden'),hours=make('div','leave-clock-hours'),minutes=make('div','leave-clock-minutes');
      const minuteTitle=make('div','leave-clock-step small fw-bold','분 선택');
      heading.id=`${clock.id}Label`;clock.setAttribute('aria-labelledby',heading.id);
      trigger.id=`${clock.id}Pick`;panel.id=`${clock.id}Panel`;
      trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',panel.id);
      icon.setAttribute('aria-hidden','true');arrow.setAttribute('aria-hidden','true');
      hours.setAttribute('role','group');hours.setAttribute('aria-label',`${title} · 시 선택`);
      minutes.setAttribute('role','group');minutes.setAttribute('aria-label',`${title} · 분 선택`);
      trigger.append(icon,caption,arrow);
      panel.append(make('div','leave-clock-step small fw-bold','시 선택'),hours,minuteTitle,minutes);
      wrapper.append(heading,clock,trigger,panel);
      let value='',lastOptions=null,values=[],open=false,hour='',lastView='',placeholder='시간 선택';
      const option=(v,t=v)=>{const o=make('option','',t);o.value=v;return o;};
      const reflect=()=>{const next=[...clock.options].some(o=>o.value===value)?value:'';if(clock.value!==next)clock.value=next;};
      function close(focus=false){
        open=false;panel.classList.add('hidden');trigger.setAttribute('aria-expanded','false');
        if(focus&&!trigger.disabled)trigger.focus();
      }
      function render(){
        const shown=clock.value||placeholder;
        setText(caption,shown);trigger.setAttribute('aria-label',`${title}: ${shown}`);
        trigger.classList.toggle('has-time',!!clock.value);
        if(!open)return;
        const available=[...new Set(values.map(v=>v.slice(0,2)))];
        if(!available.includes(hour))hour=available.includes(clock.value.slice(0,2))?clock.value.slice(0,2):'';
        const key=JSON.stringify([lastOptions,clock.value,hour]);if(key===lastView)return;lastView=key;
        const current=doc.activeElement;
        const focusedHour=hours.contains(current)?current.dataset.leaveClockHour:null;
        const focusedMinute=minutes.contains(current)?current.dataset.leaveClockTime:null;
        const hourButtons=available.map(h=>{
          const b=button(`${h}시`,'btn leave-clock-option');b.dataset.leaveClockHour=h;
          b.setAttribute('aria-pressed',String(hour===h));
          b.addEventListener('click',()=>{hour=h;render();(minutes.querySelector('[aria-pressed="true"]')||minutes.querySelector('button'))?.focus();});
          return b;
        });
        const minuteButtons=values.filter(v=>v.slice(0,2)===hour).map(v=>{
          const b=button(`${v.slice(3)}분`,'btn leave-clock-option');b.dataset.leaveClockTime=v;
          b.setAttribute('aria-label',`${v.slice(0,2)}시 ${v.slice(3)}분`);
          b.setAttribute('aria-pressed',String(clock.value===v));
          b.addEventListener('click',()=>{
            if(!open||trigger.disabled||!values.includes(v))return;
            close(true);if(clock.value===v)return;
            clock.value=v;
            clock.dispatchEvent(new root.Event('input',{bubbles:true}));
            clock.dispatchEvent(new root.Event('change',{bubbles:true}));
          });
          return b;
        });
        hours.replaceChildren(...hourButtons);minutes.replaceChildren(...minuteButtons);
        setText(minuteTitle,hour?`${hour}시 · 분 선택`:'시를 고르면 가능한 분이 표시돼요.');
        if(focusedHour||focusedMinute)(hourButtons.find(b=>b.dataset.leaveClockHour===focusedHour)
          ||minuteButtons.find(b=>b.dataset.leaveClockTime===focusedMinute)||hourButtons[0]||trigger).focus();
      }
      trigger.addEventListener('click',()=>{
        if(open){close();return;}if(trigger.disabled)return;
        open=true;hour=clock.value.slice(0,2);lastView='';panel.classList.remove('hidden');trigger.setAttribute('aria-expanded','true');render();
        (hours.querySelector('[aria-pressed="true"]')||hours.querySelector('button'))?.focus();
      });
      wrapper.addEventListener('keydown',e=>{
        if(e.repeat&&(e.key==='Enter'||e.key===' ')){e.preventDefault();return;}
        if(open&&e.key==='Escape'&&!e.isComposing){e.preventDefault();e.stopPropagation();close(true);}
      });
      for(const event of ['click','focusin'])doc.addEventListener(event,e=>{if(open&&!wrapper.contains(e.target))close();},true);
      // The form rechecks submission on bubbling input, before change fires.
      const picked=()=>{if(value===clock.value)return;halfChoice='';value=clock.value;render();changed();};
      clock.addEventListener('input',picked);
      clock.addEventListener('change',picked);
      return {wrapper,close,get:()=>value,put:raw=>{close();value=String(raw||'').trim();reflect();render();},
        update(next,enabled,emptyCaption){
          values=next;placeholder=emptyCaption;
          const key=values.join(',');
          if(key!==lastOptions){lastOptions=key;clock.replaceChildren(option('','시간 선택'),...values.map(v=>option(v)));}
          reflect();clock.disabled=trigger.disabled=!enabled;
          if(!enabled&&open)close();render();
        }};
    }

    const start=clockControl('Start','시작 시간'),end=clockControl('End','종료 시간');
    const halfTools=make('div','leave-half-shortcuts mt-2');
    const halfButtons=make('div','d-flex flex-wrap gap-2');
    halfButtons.setAttribute('role','group');halfButtons.setAttribute('aria-label','반차 빠른 선택');
    const halfHint=make('p','small text-muted mt-1 mb-0');halfHint.id='annualHalfDayHint';halfHint.setAttribute('role','status');
    const halves=['am','pm'].map(slot=>{
      const b=button(slot==='am'?'오전 반차':'오후 반차','btn btn-outline-secondary');
      b.id=slot==='am'?'annualClockMorningHalf':'annualClockAfternoonHalf';
      b.setAttribute('aria-describedby',halfHint.id);
      b.addEventListener('click',()=>{
        syncOwner();
        if(!owner||activeMode!=='clock'||root.frameElement?.hidden)return;
        const choice=halfDayChoice(slot,startDate.value,calendarModel());
        if(choice.error){refresh();return;}
        const previous=JSON.stringify(readClockDraft());
        halfChoice=slot;start.close();end.close();clockStartPicker.close();clockEndPicker.close();
        endDate.value=lastEnd=startDate.value;follows=true;
        start.put(choice.start);end.put(choice.end);
        if(previous!==JSON.stringify(readClockDraft()))startDate.dispatchEvent(new root.Event('input',{bubbles:true}));
        changed();
      });
      halfButtons.append(b);return {slot,button:b};
    });
    halfTools.append(halfButtons,halfHint);
    halfTools.addEventListener('keydown',e=>{
      if(!e.defaultPrevented&&!e.isComposing&&e.keyCode!==229&&e.repeat&&['Enter',' '].includes(e.key))e.preventDefault();
    },true);
    const dateField=(title,field)=>{const wrap=make('div');wrap.append(make('div','small fw-bold text-muted',title),field);return wrap;};
    const first=make('div','leave-entry-pair');first.append(dateField('시작일',startDate),start.wrapper);
    endGroup.append(dateField('종료일',endDate),end.wrapper);
    const work=make('div','leave-entry-pair mb-2');work.append(label('출근 시간',workStart),label('퇴근 시간',workEnd));
    const breakPair=make('div','mt-2');breakPair.append(label('휴게 시작',breakStart));
    const week=make('details','small my-2'),weekTitle=make('summary');week.append(weekTitle);
    const dayRow=make('div','d-flex flex-wrap gap-2 mt-2');week.append(dayRow);
    const days=[['월',1],['화',2],['수',3],['목',4],['금',5],['토',6],['일',0]].map(([name,day])=>{
      const ch=input('checkbox',`annualWorkDay${day}`,'form-check-input me-1');ch.value=String(day);
      const wrap=make('label');wrap.append(ch,name);dayRow.append(wrap);ch.addEventListener('change',()=>{updateWeek();ctx.changed();});return ch;
    });
    const actions=make('div','d-flex gap-2 flex-wrap mt-2');actions.append(scheduleSave,cancel);
    editor.append(make('legend','small fw-bold float-none w-auto mb-2','요청할 근무시간'),work,breakPair,breakDescription,week,actions,editStatus);
    const correctionPanel=make('div','border-top pt-2 mt-3 hidden');
    correctionPanel.id='annualWorkCorrection';
    const correctionHint=make('p','small text-muted mb-2','정정 요청은 결재 문서에만 표시돼요. 이번 휴가 계산에는 적용되지 않으며, 계속 적용할 근무시간은 인사 담당자가 계약을 확인한 뒤 확정합니다.');
    const correctionText=make('p','small mb-2');correctionText.setAttribute('role','status');
    const tools=make('div','d-flex gap-2 flex-wrap');tools.append(edit,remove);
    correctionPanel.append(correctionHint,correctionText,tools,editor);
    area.append(first,halfTools,endGroup,status,scheduleDescription,retry);
    // Preserve old correction drafts in memory/serialization, but no longer offer them in approvals.
    editor.disabled=true;
    const clockStartPicker=datePicker(startDate,'시작일',(date,m)=>clockDateReason(date,'start',m));
    const clockEndPicker=datePicker(endDate,'종료일',(date,m)=>clockDateReason(date,'end',m));
    clockStartPicker.show(true);clockEndPicker.show(true);
    const annualStartField=doc.getElementById('mixedLeaveStartDate'),annualEndField=doc.getElementById('mixedLeaveEndDate');
    const annualGuidance='이미 신청한 휴가는 제외하고, 반차가 있는 날은 비어 있는 반나절만 넣어요.';
    const annualStartPicker=annualStartField?datePicker(annualStartField,'휴가 시작일',(date,m)=>annualDateStatus(date,'start',m),annualGuidance):null;
    const annualEndPicker=annualEndField?datePicker(annualEndField,'휴가 종료일',(date,m)=>annualDateStatus(date,'end',m),annualGuidance):null;
    function updateWeek(){weekTitle.textContent=`근무 요일 · ${days.filter(el=>el.checked).map(el=>el.parentElement.textContent.trim()).join('·')||'선택 안 함'}`;}
    function workBreak(){
      const work=time.breakWindow(workStart.value,workEnd.value),duration=time.defaultBreakMinutes(work);
      const pause=time.breakWindow(breakStart.value,'23:59');
      const end=duration&&pause&&pause.a+duration<1440?time.clockLabel(pause.a+duration):'';
      return {work,duration,end};
    }
    function syncWorkBreak(){
      const {work,duration,end}=workBreak();breakPair.classList.toggle('hidden',!duration);
      if(work&&duration){breakStart.min=time.clockLabel(work.a+1);breakStart.max=time.clockLabel(work.b-duration-1);}
      setText(breakDescription,duration?`휴게 ${time.formatMinutes(duration)}${end?` · ${end}까지`:''}`:work?'휴게시간 없음':'');
    }
    function readWork(){const pause=workBreak();return {work_start:workStart.value,work_end:workEnd.value,break_start:pause.duration?breakStart.value:'',break_end:pause.end,days:days.filter(el=>el.checked).map(el=>Number(el.value)).sort()};}
    function putWork(data){
      const s=data||time.defaultSchedule;workStart.value=s.work_start||'';workEnd.value=s.work_end||'';
      breakStart.value=s.break_start||'';
      days.forEach(el=>{el.checked=(Array.isArray(s.days)?s.days:WEEK).includes(Number(el.value));});
      updateWeek();syncWorkBreak();
    }
    function ownerState(){return ctx.owner();}
    const canRetryPersonal=()=>owner?.self&&ticket?.error===true;
    const fallbackSchedule=()=>{
      if(activeMode!=='clock')return owner?.self&&pref?.schedule||time.defaultSchedule;
      if(owner?.self)return pref?.schedule||null;
      const saved=owner&&ctx.snapshot()?.workBasis?.registered_schedule;
      try{return saved?cleanSchedule(saved,time):null;}catch(_){return null;}
    };
    const isCorrectionMode=()=>['annual','clock','legacy'].includes(activeMode);
    const unappliedSchedule=()=>editOpen&&!same(workEditorDraft(),editorBaseline);
    const workEditorDraft=()=>({...readWork(),break_start:breakStart.value});
    const readClockDraft=()=>({start_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get(),follows,...(halfChoice?{half_day:halfChoice}:{})});
    function putClockDraft(data={}){
      startDate.value=data.start_date||'';endDate.value=data.end_date||'';
      lastStart=startDate.value;lastEnd=endDate.value;
      start.put(data.start_time);end.put(data.end_time);follows=data.follows!==false;
      halfChoice=['am','pm'].includes(data.half_day)?data.half_day:'';
    }
    function syncOwner(){
      const next=ownerState();
      if(next?.key===owner?.key)return;
      if(owner)clockDrafts.set(owner.key,readClockDraft());
      if(owner){
        if(editOpen||correction)correctionDrafts.set(owner.key,{correction,editor:editOpen?workEditorDraft():null,baseline:editorBaseline});
        else correctionDrafts.delete(owner.key);
      }
      epoch++;owner=next;pref=null;ticket=null;snapshotRetry=null;
      const work=next?correctionDrafts.get(next.key):null;
      correction=work?.correction||null;editOpen=!!work?.editor;editorBaseline=work?.baseline||null;
      clockStartPicker.close();clockEndPicker.close();
      putClockDraft(next?clockDrafts.get(next.key):undefined);
      putWork(work?.editor||correction);editStatus.textContent='';
    }
    function setText(el,value){if(el.textContent!==value)el.textContent=value;}
    function syncDates(){
      const year=time.yearOf();
      startDate.min=`${year}-01-01`;startDate.max=endDate.max=`${year}-12-31`;
      endDate.min=time.inYear(startDate.value)?startDate.value:startDate.min;
      const ready=time.inYear(startDate.value)&&startMenu.values.includes(start.get());
      endGroup.classList.toggle('hidden',!ready);
      endDate.disabled=!ready;
    }
    function changed(){syncDates();ctx.changed();}
    let lastEnd='';
    startDate.addEventListener('change',()=>{
      if(startDate.value!==lastStart){halfChoice='';start.put('');end.put('');endDate.value=lastEnd=startDate.value;follows=true;}
      lastStart=startDate.value;changed();
    });
    endDate.addEventListener('change',()=>{if(endDate.value!==lastEnd){halfChoice='';end.put('');}lastEnd=endDate.value;follows=false;changed();});
    for(const field of [workStart,workEnd,breakStart])field.addEventListener('input',()=>{syncWorkBreak();ctx.changed();});

    async function withDeadline(run){
      const controller=new AbortController();let timer;
      try{return await Promise.race([run(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('LEAVE_PREF_TIMEOUT'));},15000);})]);}
      finally{clearTimeout(timer);}
    }
    function validResponse(data){return Number.isInteger(data?.revision)&&data.revision>=0&&((data.revision===0&&data.schedule===null)||(data.revision>0&&data.schedule&&typeof data.schedule==='object'));}
    async function readPreference({reload=false}={}){
      syncOwner();
      if(!owner?.self||ticket?.loading||(!reload&&(pref||ticket)))return;
      const mine=epoch,key=owner.key,current=()=>mine===epoch&&ownerState()?.key===key;
      ticket={loading:true};ctx.changed();
      try{
        const {data,error}=await withDeadline(signal=>ctx.client().rpc(RPC,{p_action:'read'}).abortSignal(signal));
        if(!current())return;
        if(error||!validResponse(data))throw Error('LEAVE_PREF_READ');
        pref={revision:data.revision,schedule:data.schedule?cleanSchedule(data.schedule,time):null};
        ticket=null;
      }catch(_){if(current())ticket={error:true};}
      finally{if(current())ctx.changed();}
    }
    function correctionAllowed(){
      return false;
    }
    function openEditor(){
      if(!correctionAllowed()||editOpen)return;
      const date=(activeMode==='clock'?startDate:annualStartField)?.value||time.kstClock(ctx.now?.()).date;
      putWork(correction||scheduleFor(date,calendarModel()).schedule||fallbackSchedule());
      editOpen=true;editorBaseline=workEditorDraft();editStatus.textContent='';
      refreshCorrection();workStart.focus();ctx.changed();
    }
    function closeEditor(){
      editOpen=false;editorBaseline=null;editStatus.textContent='';
      refreshCorrection();edit.focus();ctx.changed();
    }
    edit.addEventListener('click',()=>openEditor());
    correctionPanel.addEventListener('keydown',e=>{if(e.repeat&&e.key==='Enter'&&e.target.closest('button'))e.preventDefault();},true);
    cancel.addEventListener('click',()=>{if(correctionAllowed()&&editOpen)closeEditor();});
    remove.addEventListener('click',()=>{if(correctionAllowed()&&!editOpen&&correction){correction=null;refreshCorrection();edit.focus();ctx.changed();}});
    retry.addEventListener('click',()=>{if(!retry.classList.contains('hidden'))retryCalendarRead(null,true);});
    function retryCalendarRead(_,inline=false){
      syncOwner();
      if(!owner||snapshotRetry||ctx.snapshotRead?.()==='loading')return;
      const model=calendarModel(),ledger=!model.snapshot?.workBasis;
      const attempt={key:owner.key,epoch,ledger,inline};
      const current=()=>snapshotRetry===attempt&&epoch===attempt.epoch&&ownerState()?.key===attempt.key;
      snapshotRetry=attempt;
      void Promise.resolve().then(()=>{
        if(!current())return;
        const latest=calendarModel();
        if(ledger)return !latest.snapshot?.workBasis?ctx.reloadSnapshot?.():null;
        return Promise.all([latest.clock?.state==='error'?ctx.loadClock(true):null,canRetryPersonal()?readPreference({reload:true}):null]);
      }).catch(()=>{}).finally(()=>{
        if(current()){
          const keepFocus=inline&&doc.activeElement===retry;
          snapshotRetry=null;ctx.changed();refreshDates();
          if(keepFocus&&retry.classList.contains('hidden')&&activeMode==='clock'&&!root.frameElement?.hidden
              &&doc.hasFocus()&&area.getClientRects().length&&(doc.activeElement===retry||doc.activeElement===doc.body)){
            const target=start.wrapper.querySelector('#annualClockStartTimePick:not(:disabled)')||doc.getElementById('annualClockStartDatePick');
            target?.focus();
          }
        }
      });
      ctx.changed();refreshDates();
    }
    scheduleSave.addEventListener('click',()=>{
      if(!correctionAllowed()||!editOpen)return;
      let value;
      try{
        const pause=workBreak();
        if(pause.duration&&(!breakStart.value||!pause.end))throw Error('휴게 시작 시간을 입력해 주세요.');
        if(pause.duration&&(breakStart.value<=pause.work.start||pause.end>=pause.work.end))throw Error('휴게는 출근과 퇴근 사이에 지정해 주세요.');
        value=cleanSchedule(readWork(),time);
      }catch(e){setText(editStatus,e.message);return;}
      correction=value;closeEditor();
    });

    function inspect(model){
      syncOwner();
      const {snapshot,clock}=model;
      const entry={leave_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get()};
      const policy={...(snapshot?.workBasis||{}),periods:clock?.periods||snapshot?.workBasis?.periods||[]};
      const calendar=clock?.year===time.yearOf()?clock?.calendar:null;
      const fallback=fallbackSchedule();
      const complete=Boolean(entry.leave_date&&entry.end_date&&entry.start_time&&entry.end_time);
      if(ledgerReadFailed(model))return {entry,complete,result:null,error:calendarError(model),retry:true,ledgerFailed:true};
      if(!complete)return {entry,complete,result:null,error:'시작·종료 날짜와 시간을 입력해 주세요.'};
      if(!time.inYear(entry.leave_date)||!time.inYear(entry.end_date))return {entry,complete,result:null,error:'시작일과 종료일은 올해 날짜로 선택해 주세요.'};
      if(!CLOCK.test(entry.start_time)||!CLOCK.test(entry.end_time))return {entry,complete,result:null,error:'시간은 00분 또는 30분 단위로 선택해 주세요.'};
      if(entry.end_date<entry.leave_date||(entry.end_date===entry.leave_date&&entry.end_time<=entry.start_time))return {entry,complete,result:null,error:'종료는 시작보다 늦어야 해요.'};
      if(!snapshot?.workBasis||!calendar||clock?.state!=='ready')return {entry,complete,result:null,error:clock?.state==='error'?'근무일을 확인하지 못했어요. 다시 확인해 주세요.':'근무시간을 확인하는 중이에요.',retry:clock?.state==='error'};
      let needsWork=false;
      for(const date=new Date(entry.leave_date+'T00:00:00Z'),last=new Date(entry.end_date+'T00:00:00Z');date<=last;date.setUTCDate(date.getUTCDate()+1)){
        const iso=date.toISOString().slice(0,10);
        if(!calendar.has(iso)&&!time.dateSchedule(policy,iso)){needsWork=true;break;}
      }
      if(needsWork&&!fallback)return {entry,complete,result:null,needsWork,error:scheduleError(),retry:canRetryPersonal()};
      try{
        const result=time.scheduledRange({...entry,fallback_schedule:fallback,strict_bounds:true},policy,calendar);
        const half=halfChoice?selectedHalfDay(model):null;
        if(halfChoice&&!half)throw Error('원하는 반차를 다시 선택하거나 시간을 직접 선택해 주세요.');
        if(!half&&(entry.start_time.slice(3)!==entry.end_time.slice(3)||result.totalMinutes<60||result.totalMinutes%60))
          throw Error('시간차는 1시간 단위예요. 시작과 종료의 분을 같게 골라 주세요.');
        return {entry,complete,needsWork,fallback,result};
      }
      catch(e){return {entry,complete,needsWork,result:null,error:e.message};}
    }
    const reserved='이미 신청한 휴가가 있어 이 날짜에는 선택할 수 있는 시간이 없어요.';
    function calendarModel(){
      const snapshot=ctx.snapshot(),clock=snapshot?.clockSchedule;
      const policy={periods:clock?.periods||[]},prior=new Map(),bookedHalves=new Set();
      for(const row of ctx.prior?.()||[]){
        const list=prior.get(row.leave_date)||[];list.push(time.leaveCoverage(row,row.leave_date,policy));prior.set(row.leave_date,list);
        if(['am','pm','morning','afternoon','오전','오후'].includes(row.slot||row.slot_label))bookedHalves.add(row.leave_date);
      }
      return {snapshot,clock,policy,prior,bookedHalves,timedDays:new Map(),snapshotRead:ctx.snapshotRead?.()};
    }
    function scheduleFor(date,model){
      const contract=time.dateSchedule(model.policy,date);
      return {schedule:contract||fallbackSchedule(),fallback:!contract};
    }
    function crosses(intervals,a,b){return intervals.some(([lo,hi])=>a<hi&&lo<b);}
    function isWorkDay(date,schedule,model){return !model.clock?.calendar?.has(date)&&schedule.days.includes(new Date(date+'T00:00:00Z').getUTCDay());}
    function ledgerReadFailed(model){
      return !model.snapshot?.workBasis&&['error','unavailable'].includes(model.snapshotRead);
    }
    function calendarError(model){
      if(!model.snapshot?.workBasis)return ledgerReadFailed(model)
        ?'휴가 내역을 확인하지 못했어요. 다시 확인해 주세요.':'휴가 내역을 확인하는 중이에요.';
      if(model.clock?.state!=='ready'||model.clock.year!==time.yearOf()||!model.clock.calendar)
        return model.clock?.state==='error'?'근무일과 공휴일을 확인하지 못했어요. 다시 확인해 주세요.':'근무일과 공휴일을 확인하는 중이에요.';
      return '';
    }
    const scheduleError=()=>ticket?.error?'등록된 근무시간을 확인하지 못했어요. 다시 확인해 주세요.':owner?.self&&!pref?'등록된 근무시간을 확인하는 중이에요.':'시간차를 신청하려면 근무·휴게시간을 먼저 등록해야 합니다. 인사 담당자에게 입력을 요청해 주세요.';
    function workdayStatus(date,model){
      if(model.clock?.calendar?.has(date))return {reason:`${date}은 공휴일이에요.`};
      const {schedule}=scheduleFor(date,model);
      if(!schedule)return {reason:scheduleError(),unknown:true};
      return {reason:isWorkDay(date,schedule,model)?'':`${date}은 근무일이 아니에요.`};
    }
    function annualCalendar(){
      syncOwner();const model=calendarModel();
      return {error:calendarError(model),day:date=>annualDayStatus(date,model)};
    }
    function annualDayStatus(date,model){
      const day=workdayStatus(date,model);
      if(day.reason||!model.prior.has(date))return day;
      if(model.bookedHalves.has(date)){
        const busy=model.prior.get(date);
        for(const slot of ['am','pm']){
          const [from,to]=time.leaveCoverage({slot},date,model.policy);
          if(!crosses(busy,from,to))return {reason:'',slot};
        }
      }
      return {reason:'이미 신청한 휴가가 있는 날짜예요.',booked:true};
    }
    function annualDateStatus(date,side,model){
      const issue=calendarError(model);
      if(issue)return {reason:issue};
      if(side==='end'&&annualStartField?.value&&date<annualStartField.value)return {reason:'종료일은 시작일보다 빠를 수 없어요.'};
      return annualDayStatus(date,model);
    }
    function clockDateReason(date,side,model){const menu=getClockMenu(date,side,model);return menu.values.length?'':menu.message||'선택할 수 있는 시간이 없어요.';}
    function netMinutes(from,to,pause){return Math.max(0,to-from-(pause?Math.max(0,Math.min(to,pause.b)-Math.max(from,pause.a)):0));}
    function halfDayChoice(slot,date,model){
      const fail=error=>({error});
      if(!owner||!date)return fail('날짜를 먼저 선택해 주세요.');
      if(!time.inYear(date))return fail('올해 날짜를 선택해 주세요.');
      const issue=calendarError(model);if(issue)return fail(issue);
      const day=timedWorkday(date,model),{work,pause}=day;
      if(!work)return fail(day.message||scheduleError());
      if(pause&&(pause.a<work.a||pause.b>work.b)||!pause&&(day.schedule.break_start||day.schedule.break_end))
        return fail('등록된 휴게시간을 확인해 주세요.');
      const minutes=netMinutes(work.a,work.b,pause)/2;
      if(minutes<=0||!Number.isInteger(minutes)||minutes>day.limit)return fail('등록된 근무시간을 확인해 주세요.');
      const before=pause?pause.a-work.a:Infinity;
      const boundary=work.a+minutes+(pause&&minutes>=before?pause.b-pause.a:0);
      const from=slot==='am'?work.a:boundary;
      const to=slot==='am'?(pause&&minutes===before?pause.a:boundary):work.b;
      const start=time.clockLabel(from),end=time.clockLabel(to);
      if(!CLOCK.test(start)||!CLOCK.test(end))return fail('반나절을 30분 단위로 나눌 수 없는 근무시간이에요.');
      if(crosses(day.busy,from,to))return fail('이미 신청한 휴가와 겹쳐요.');
      try{
        const result=time.scheduledRange({leave_date:date,end_date:date,start_time:start,end_time:end,
          fallback_schedule:fallbackSchedule(),strict_bounds:true},model.snapshot.workBasis,model.clock.calendar);
        if(result.totalMinutes!==minutes)return fail('등록된 근무시간을 확인해 주세요.');
        return {start,end,minutes};
      }catch(e){return fail(e.message);}
    }
    function selectedHalfDay(model){
      if(!halfChoice||startDate.value!==endDate.value)return null;
      const choice=halfDayChoice(halfChoice,startDate.value,model);
      return !choice.error&&choice.start===start.get()&&choice.end===end.get()?choice:null;
    }
    function refreshHalfDays(model){
      halfTools.classList.toggle('hidden',activeMode!=='clock');
      const messages=[];
      for(const {slot,button:b} of halves){
        const choice=halfDayChoice(slot,startDate.value,model),selected=!choice.error&&halfChoice===slot
          &&endDate.value===startDate.value&&choice.start===start.get()&&choice.end===end.get();
        b.disabled=activeMode!=='clock'||!!choice.error;b.setAttribute('aria-pressed',String(selected));
        b.title=choice.error||`${choice.start}~${choice.end} · 차감 ${time.formatMinutes(choice.minutes)}`;
        if(choice.error)messages.push(`${slot==='am'?'오전':'오후'}: ${choice.error}`);
      }
      setText(halfHint,messages.length===2&&messages[0].slice(4)===messages[1].slice(4)?messages[0].slice(4):messages.join(' · '));
    }
    function timedWorkday(date,model){
      if(model.timedDays.has(date))return model.timedDays.get(date);
      const info=scheduleFor(date,model),{schedule}=info;
      let result;
      if(model.clock.calendar.has(date))result={...info,skip:true,message:`${date}은 공휴일이에요.`};
      else if(!schedule)result={...info,message:scheduleError(),retry:canRetryPersonal()};
      else if(!isWorkDay(date,schedule,model))result={...info,skip:true,message:`${date}은 근무일이 아니에요.`};
      else{
        const work=time.breakWindow(schedule.work_start,schedule.work_end),pause=time.breakWindow(schedule.break_start,schedule.break_end);
        result=work?{...info,date,work,pause,busy:model.prior.get(date)||[],limit:time.basisMinutes(model.policy,date)}
          :{...info,message:'근무 시작·종료 시각을 확인해 주세요.'};
      }
      model.timedDays.set(date,result);return result;
    }
    function* clockEndOptions(day,from,chosen,prefix){
      if(prefix.days>=200||from<day.work.a||from>=day.work.b)return;
      for(let minute=Math.floor(from/30)*30+30;minute<=day.work.b;minute+=30){
        if(minute%60!==chosen%60||crosses(day.busy,from,minute))continue;
        if(day.pause&&minute>day.pause.a&&minute<day.pause.b)continue;
        const part=netMinutes(from,minute,day.pause),total=prefix.minutes+part;
        if(part>0&&part<=day.limit&&total>=60&&total%60===0)yield minute;
      }
    }
    function carryClockDay(day,from,prefix){
      if(day.skip)return '';
      if(!day.work)return day.message;
      if(from<day.work.a||from>=day.work.b)return '근무 시작·종료 시각을 확인해 주세요.';
      if(crosses(day.busy,from,day.work.b))return `${day.date}에 이미 신청한 휴가가 있어요.`;
      const minutes=netMinutes(from,day.work.b,day.pause);
      if(minutes>day.limit)return '하루 차감 시간이 근로시간을 초과해요.';
      prefix.minutes+=minutes;if(minutes>0)prefix.days++;
      return prefix.days>=200?'한 번에 신청할 수 있는 근무일은 200일까지입니다.':'';
    }
    function canFinishClockStart(day,minute,model){
      const prefix={minutes:0,days:0};
      if(!clockEndOptions(day,minute,minute,prefix).next().done)return true;
      if(carryClockDay(day,minute,prefix))return false;
      const cursor=new Date(day.date+'T00:00:00Z'),last=new Date(`${model.clock.year}-12-31T00:00:00Z`);
      for(cursor.setUTCDate(cursor.getUTCDate()+1);cursor<=last;cursor.setUTCDate(cursor.getUTCDate()+1)){
        const next=timedWorkday(cursor.toISOString().slice(0,10),model);
        if(next.skip)continue;
        if(!next.work)return false;
        if(!clockEndOptions(next,next.work.a,minute,prefix).next().done)return true;
        if(carryClockDay(next,next.work.a,prefix))return false;
      }
      return false;
    }
    function getClockMenu(date,side,model){
      if(!date)return {values:[]};
      if(!time.inYear(date))return {values:[],message:'올해 날짜를 선택해 주세요.'};
      if(side==='end'&&startDate.value&&date<startDate.value)return {values:[],message:'종료는 시작보다 늦어야 해요.'};
      if(!model.snapshot?.workBasis)return {values:[],message:calendarError(model),retry:ledgerReadFailed(model)};
      const clock=model.clock;
      if(!clock||clock.state!=='ready'||clock.year!==time.yearOf()||!clock.calendar)return {values:[],
        message:clock?.state==='error'?'근무일을 확인하지 못했어요. 다시 확인해 주세요.':'근무시간을 확인하는 중이에요.',retry:clock?.state==='error'};
      const day=timedWorkday(date,model),{work,pause,busy}=day,values=[];
      if(!work)return {...day,values};
      if(side==='end'){
        if(!CLOCK.test(start.get())||!time.inYear(startDate.value))return {...day,values};
        const [hours,minutes]=start.get().split(':').map(Number),chosen=hours*60+minutes;
        const prefix={minutes:0,days:0},sameDay=date===startDate.value;
        for(const cursor=new Date(startDate.value+'T00:00:00Z'),last=new Date(date+'T00:00:00Z');cursor<last;cursor.setUTCDate(cursor.getUTCDate()+1)){
          const earlier=timedWorkday(cursor.toISOString().slice(0,10),model);
          const error=carryClockDay(earlier,earlier.date===startDate.value?chosen:earlier.work?.a,prefix);
          if(error)return {...day,values,message:error};
        }
        for(const minute of clockEndOptions(day,sameDay?chosen:work.a,chosen,prefix))values.push(time.clockLabel(minute));
      }else{
        for(let minute=Math.ceil(work.a/30)*30;minute<work.b;minute+=30){
          if(pause&&minute>=pause.a&&minute<pause.b||crosses(busy,minute,Math.min(minute+30,work.b)))continue;
          if(canFinishClockStart(day,minute,model))values.push(time.clockLabel(minute));
        }
      }
      const selected=halfChoice&&date===startDate.value?selectedHalfDay(model):null;
      const extra=selected&&(side==='start'?selected.start:selected.end);
      if(extra&&!values.includes(extra)){values.push(extra);values.sort();}
      return {...day,values,message:values.length?'':busy.length?reserved:'1시간 단위로 선택할 수 있는 시간이 없어요.'};
    }
    function refreshDates(model){
      syncOwner();model??=calendarModel();refreshCorrection();
      if(activeMode==='annual'){annualStartPicker?.refresh(model);annualEndPicker?.refresh(model);}
      else if(activeMode==='clock'){clockStartPicker.refresh(model);clockEndPicker.refresh(model);}
    }
    function setMode(mode){
      if(mode!==activeMode){start.close();end.close();clockStartPicker.show(mode==='clock');clockEndPicker.show(mode==='clock');}
      activeMode=mode;annualStartPicker?.show(mode==='annual');annualEndPicker?.show(mode==='annual');refresh();
    }
    function correctionBlock(){
      return '';
    }
    function refreshCorrection(){
      correctionPanel.classList.add('hidden');
      editor.classList.toggle('hidden',!editOpen);
      edit.classList.toggle('hidden',editOpen);
      remove.classList.toggle('hidden',editOpen||!correction);
      setText(edit,correction?'정정 요청 수정':'근무시간 정정 요청');
      setText(correctionText,editOpen&&unappliedSchedule()?'작성 중인 정정을 요청에 담거나 취소한 뒤 상신해 주세요.':
        correction?`결재에 담을 요청: ${correction.work_start}~${correction.work_end}${correction.break_start?` · 휴게 ${correction.break_start}~${correction.break_end}`:''}`:'');
    }
    function refresh(){
      syncOwner();const model=calendarModel();
      startMenu=getClockMenu(startDate.value,'start',model);
      const endMenu=getClockMenu(endDate.value,'end',model);
      start.update(startMenu.values,!!startMenu.values.length,'시간 선택');
      end.update(endMenu.values,startMenu.values.includes(start.get())&&!!endMenu.values.length,'시간 선택');
      syncDates();refreshHalfDays(model);const state=inspect(model);
      const retainedInvalid=(start.get()&&!startMenu.values.includes(start.get()))||(end.get()&&!endMenu.values.includes(end.get()));
      if(retainedInvalid&&!state.ledgerFailed){state.result=null;state.error=startMenu.message||endMenu.message||(state.error&&!state.error.includes('입력해')?state.error:'이전에 선택한 시간이 현재 범위에 없어요. 시간을 다시 선택해 주세요.');}
      const fallbackMenu=startMenu.fallback?startMenu:endMenu.fallback?endMenu:null;
      const used=fallbackMenu?.schedule;
      setText(scheduleDescription,used?`등록된 근무시간 ${used.work_start}~${used.work_end}${used.break_start?` · 휴게 ${used.break_start}~${used.break_end}`:''}`:
        activeMode==='clock'&&!fallbackSchedule()&&!model.policy.periods.some(p=>p.schedule)?scheduleError():'');
      retry.classList.toggle('hidden',!snapshotRetry?.inline&&!snapshotRetry?.ledger&&!state.retry&&!startMenu.retry&&!endMenu.retry);
      retry.disabled=!owner;
      retry.setAttribute('aria-disabled',String(!owner||!!snapshotRetry||model.snapshotRead==='loading'));
      const readMessage=state.ledgerFailed?state.error:snapshotRetry?.ledger&&model.snapshotRead==='loading'?calendarError(model):'';
      const inputMessage=retainedInvalid||state.complete&&!state.result?state.error:startMenu.message||(start.get()?endMenu.message:'');
      setText(status,readMessage||correctionBlock()||inputMessage||'');
      refreshDates(model);
      return state;
    }
    function summary({requireComplete=false}={}){
      const s=refresh(),totalHours=(s.result?.totalMinutes||0)/60;
      const items=(s.result?.items||[]).map(item=>halfChoice?{...item,slot_label:`${halfLabel(halfChoice)} 반차`}:item);
      const blocker=correctionBlock();
      const error=requireComplete&&blocker?blocker:s.complete||requireComplete?s.error:null;
      return {ok:!error&&(!requireComplete||items.length>0),inputMode:'detail',items,totalHours,totalDays:time.roundDays(totalHours/8),errors:error?[error]:[]};
    }
    function calculationBasis(items){
      syncOwner();
      const model=calendarModel();
      if(!owner||calendarError(model)||!Array.isArray(items))return [];
      const groups=[];
      for(const item of items){
        const date=item?.leave_date;
        if(!time.isDate(date))continue;
        const {schedule,fallback}=scheduleFor(date,model);
        if(!schedule)continue;
        const source=!fallback?'contract':owner.self&&pref?.schedule?'personal':
          activeMode==='clock'&&!owner.self&&model.snapshot.workBasis.registered_schedule?'registered':'default';
        const entry={source,start:schedule.work_start,end:schedule.work_end,breakStart:schedule.break_start,breakEnd:schedule.break_end,
          dayMinutes:item.basis_day_minutes||time.basisMinutes(model.snapshot.workBasis,date)};
        const key=JSON.stringify(entry),previous=groups.at(-1);
        if(previous?.key===key){previous.last=date;previous.days++;}
        else groups.push({key,entry,first:date,last:date,days:1});
      }
      return groups.map(({entry,first,last,days})=>({...entry,first,last,days}));
    }
    function draft(){
      syncOwner();
      const body=readClockDraft();
      if(editOpen){body.work_editor=workEditorDraft();body.work_editor_baseline=editorBaseline;}
      if(correction)body.work_correction=correction;
      return body;
    }
    function getCorrection(){
      return null;
    }
    function restoreClockDraft(data){
      const s=data||{};putClockDraft(s);
      correction=null;
      if(owner&&(s.work_correction||(!owner.self&&s.local_schedule))){
        try{correction=cleanSchedule(s.work_correction||s.local_schedule,time);}catch(_){/* Ignore invalid saved request fields. */}
      }
      editorBaseline=null;
      editOpen=!!owner&&!!s.work_editor;putWork(editOpen?s.work_editor:correction);
      if(editOpen){putWork(s.work_editor_baseline||correction);editorBaseline=workEditorDraft();putWork(s.work_editor);}
      editStatus.textContent='';syncDates();refreshCorrection();
    }
    function restore(data){
      epoch++;ticket=null;snapshotRetry=null;owner=ownerState();pref=null;correctionDrafts.clear();clockDrafts.clear();
      restoreClockDraft(owner?data:null);
      return !data||!!owner;
    }
    function restoreDeferred(data){
      // Capture the departing employee before applying the restored employee's fields.
      syncOwner();
      if(!owner)return false;
      restoreClockDraft(data);
      return true;
    }
    putWork(null);syncDates();setMode('annual');
    return {summary,annualCalendar,calculationBasis,getCorrection,correctionBlock,draft,restore,restoreDeferred,refresh,refreshDates,setMode,activate(){syncOwner();if(owner){ctx.loadClock(false);void readPreference();}},version:'1.6.18'};
  }
  root.CoopApprovalAnnualLeave=Object.freeze({create,cleanSchedule,formatDeduction});
})(window);
