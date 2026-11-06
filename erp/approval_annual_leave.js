(function (root) {
  'use strict';
  const CLOCK = /^([01]\d|2[0-3]):(00|30)$/;
  const WEEK = [1, 2, 3, 4, 5];
  const RPC = 'erp_self_leave_work_schedule';
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  function formatDeduction(value){
    const minutes=Math.max(0,Math.round(Number(value)||0));
    if(minutes<480)return root.CoopLeaveTime.formatMinutes(minutes);
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
    const edit=button('근무시간 수정'),retry=button('다시 확인');
    const editor=make('fieldset','border rounded p-2 mt-2 hidden');
    const editStatus=make('p','small mb-0 mt-2');editStatus.setAttribute('role','status');
    const workStart=input('time','annualWorkStart'),workEnd=input('time','annualWorkEnd');
    const breakStart=input('time','annualWorkBreakStart');
    const breakDescription=make('p','small text-muted mb-0');
    const scheduleDescription=make('p','small text-muted my-2');
    const scheduleSave=button('근무시간 저장','btn btn-sm btn-primary'),cancel=button('취소');
    let owner=null, pref=null, editOpen=false, localSchedule=null, localOwner=null, follows=true;
    let epoch=0, ticket=null, editorOwner=null, editorBaseline=null, lastStart='';
    const scheduleWrites=new Map(),unverifiedSchedules=new Set();
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
        refreshLeave.disabled=!!snapshotRetry;
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
        hint.textContent=enabled.length?(guidance||'근무일만 고를 수 있어요. 이미 신청한 휴가와는 겹칠 수 없어요.')
          :(entries.find(e=>e.reason.includes('확인'))?.reason||'이 달에 선택할 수 있는 날짜가 없어요.');
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
      refreshLeave.addEventListener('click',()=>{
        if(snapshotRetry)return;
        snapshotRetry=Promise.resolve().then(()=>{
          const model=calendarModel();
          if(!model.snapshot?.workBasis)return ctx.reloadSnapshot?.();
          return Promise.all([model.clock?.state==='error'?ctx.loadClock(true):null,canRetryPersonal()?readPreference({reload:true}):null]);
        }).catch(()=>{}).finally(()=>{snapshotRetry=null;refresh();});
        refreshLeave.disabled=true;
      });
      months.addEventListener('change',()=>turn(Number(months.value)));
      // Browsing the calendar is not a form input or a new leave selection.
      for(const event of ['input','change'])months.addEventListener(event,e=>e.stopPropagation());
      panel.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
        const current=e.target.closest('[data-leave-date]');if(!current)return;
        const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(!step)return;
        e.preventDefault();const all=[...grid.querySelectorAll('[data-leave-date]')];
        for(let i=all.indexOf(current)+step;i>=0&&i<all.length;i+=Math.sign(step))if(!all[i].disabled){current.tabIndex=-1;all[i].tabIndex=0;all[i].focus();break;}
      });
      return {refresh,show(value){shown=value;field.hidden=value;field.classList.toggle('hidden',value);wrapper.classList.toggle('hidden',!value);if(!value)close();}};
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
      const picked=()=>{if(value===clock.value)return;value=clock.value;render();changed();};
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
    editor.append(make('legend','small fw-bold float-none w-auto mb-2','근무시간'),work,breakPair,breakDescription,week,actions,editStatus);
    const tools=make('div','d-flex gap-2 flex-wrap');tools.append(edit,retry);
    area.append(first,endGroup,status,scheduleDescription,tools,editor);
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
    const pendingSchedule=()=>owner&&scheduleWrites.get(owner.key);
    const personalNeedsRead=()=>owner?.self&&unverifiedSchedules.has(owner.key);
    const canRetryPersonal=()=>owner?.self&&!pendingSchedule()&&!ticket?.loading&&(ticket?.error||personalNeedsRead());
    const confirmedSchedule=()=>owner?.self?(pref&&!personalNeedsRead()?(pref.schedule||time.defaultSchedule):null):(localSchedule||time.defaultSchedule);
    const fallbackSchedule=()=>pendingSchedule()?.phase==='saving'?null:confirmedSchedule();
    const unappliedSchedule=()=>editOpen&&!same(readWork(),editorBaseline||confirmedSchedule()||time.defaultSchedule);
    function syncOwner(){
      const next=ownerState();
      if(next?.key===owner?.key)return;
      epoch++;owner=next;pref=next?.self?null:{revision:0,schedule:null};ticket=null;
      if(editorOwner!==next?.key){editOpen=false;putWork(null);editStatus.textContent='';editorOwner=null;editorBaseline=null;}
      if(localOwner!==next?.key){localSchedule=null;localOwner=null;}
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
      if(startDate.value!==lastStart){start.put('');end.put('');endDate.value=lastEnd=startDate.value;follows=true;}
      lastStart=startDate.value;changed();
    });
    endDate.addEventListener('change',()=>{if(endDate.value!==lastEnd)end.put('');lastEnd=endDate.value;follows=false;changed();});
    for(const field of [workStart,workEnd,breakStart])field.addEventListener('input',()=>{syncWorkBreak();ctx.changed();});

    function rpc(action,args,signal){return ctx.client().rpc(RPC,{p_action:action,...args}).abortSignal(signal);}
    async function withDeadline(run){
      const controller=new AbortController();let timer;
      try{return await Promise.race([run(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('LEAVE_PREF_TIMEOUT'));},15000);})]);}
      finally{clearTimeout(timer);}
    }
    function validResponse(data){return Number.isInteger(data?.revision)&&data.revision>=0&&((data.revision===0&&data.schedule===null)||(data.revision>0&&data.schedule&&typeof data.schedule==='object'));}
    async function readPreference({reload=false,afterWrite=null}={}){
      syncOwner();
      if(!owner?.self||ticket?.loading||(pendingSchedule()&&pendingSchedule()!==afterWrite)||(!reload&&(pref||ticket)))return;
      const mine=epoch,key=owner.key,current=()=>mine===epoch&&ownerState()?.key===key;
      ticket={loading:true};ctx.changed();
      try{
        const {data,error}=await withDeadline(signal=>rpc('read',{},signal));
        if(!current())return;
        if(error||!validResponse(data))throw Error('LEAVE_PREF_READ');
        const wasUnverified=personalNeedsRead();
        pref={revision:data.revision,schedule:data.schedule?cleanSchedule(data.schedule,time):null};unverifiedSchedules.delete(key);ticket=null;
        if(wasUnverified&&editOpen)editorBaseline=confirmedSchedule();
      }catch(_){if(current())ticket={error:true};}
      finally{if(current())ctx.changed();}
    }
    function openEditor(explicit=true){
      if(!editOpen){editOpen=true;editorOwner=owner?.key;putWork(pref?.schedule||localSchedule||time.defaultSchedule);editorBaseline=readWork();editStatus.textContent='';}
      if(explicit){editor.classList.remove('hidden');workStart.focus();}
      ctx.changed();
    }
    edit.addEventListener('click',()=>openEditor());
    cancel.addEventListener('click',()=>{if(pendingSchedule())return;editOpen=false;editorBaseline=null;editStatus.textContent='';ctx.changed();if(!edit.classList.contains('hidden'))edit.focus();});
    retry.addEventListener('click',()=>{
      if(canRetryPersonal())void readPreference({reload:true});
      if(ctx.snapshot()?.clockSchedule?.state==='error')ctx.loadClock(true);
    });
    scheduleSave.addEventListener('click',async()=>{
      syncOwner();if(!owner||pendingSchedule()||ticket?.loading)return;
      let value;
      try{
        const pause=workBreak();
        if(pause.duration&&(!breakStart.value||!pause.end))throw Error('휴게 시작 시간을 입력해 주세요.');
        if(pause.duration&&(breakStart.value<=pause.work.start||pause.end>=pause.work.end))throw Error('휴게는 출근과 퇴근 사이에 지정해 주세요.');
        value=cleanSchedule(readWork(),time);
      }catch(e){setText(editStatus,e.message);return;}
      if(!owner.self){localSchedule=value;localOwner=owner.key;editOpen=false;editorBaseline=null;ctx.changed();return;}
      if(!pref||personalNeedsRead()){setText(editStatus,'저장된 근무시간을 먼저 다시 확인해 주세요. 입력은 그대로 남아 있어요.');return;}
      const key=owner.key,mine=epoch,revision=pref.revision;
      const current=()=>mine===epoch&&ownerState()?.key===key;
      const typed=readWork(),attempt={phase:'saving'};
      scheduleWrites.set(key,attempt);setText(editStatus,'근무시간 저장 중…');ctx.changed();
      try{
        const {data,error}=await withDeadline(signal=>rpc('save',{p_schedule:value,p_expected_revision:revision},signal));
        if(!current()){unverifiedSchedules.add(key);return;}
        if(error?.code==='PT409'){
          attempt.phase='checking';unverifiedSchedules.add(key);
          setText(editStatus,'다른 창에서 근무시간을 바꿨어요. 입력은 남겨 두었으니 확인 후 다시 저장해 주세요.');
          await readPreference({reload:true,afterWrite:attempt});return;
        }
        if(error||!validResponse(data)||!same(cleanSchedule(data.schedule,time),value))throw Error('LEAVE_PREF_SAVE');
        pref={revision:data.revision,schedule:value};unverifiedSchedules.delete(key);editorBaseline=typed;
        if(same(typed,readWork())){editOpen=false;editorBaseline=null;setText(editStatus,'');}
        else setText(editStatus,'저장했습니다. 이후 바꾼 값은 아직 저장하지 않았어요.');
      }catch(_){
        attempt.phase='checking';unverifiedSchedules.add(key);
        if(current()){
          setText(editStatus,'저장 결과를 확인하지 못했어요. 입력은 남겨 두었으니 다시 확인해 주세요.');
          await readPreference({reload:true,afterWrite:attempt});
        }
      }finally{
        if(scheduleWrites.get(key)===attempt)scheduleWrites.delete(key);
        if(current())ctx.changed();
        else if(ownerState()?.key===key){syncOwner();void readPreference({reload:true});ctx.changed();}
      }
    });

    function inspect(){
      syncOwner();
      const snapshot=ctx.snapshot(),clock=snapshot?.clockSchedule;
      const entry={leave_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get()};
      const policy={...(snapshot?.workBasis||{}),periods:clock?.periods||snapshot?.workBasis?.periods||[]};
      const calendar=clock?.year===time.yearOf()?clock?.calendar:null;
      const fallback=fallbackSchedule();
      const complete=Boolean(entry.leave_date&&entry.end_date&&entry.start_time&&entry.end_time);
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
        if(entry.start_time.slice(3)!==entry.end_time.slice(3)||result.totalMinutes<60||result.totalMinutes%60)
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
      return {snapshot,clock,policy,prior,bookedHalves,timedDays:new Map()};
    }
    function scheduleFor(date,model){
      const contract=time.dateSchedule(model.policy,date);
      return {schedule:contract||fallbackSchedule(),fallback:!contract};
    }
    function crosses(intervals,a,b){return intervals.some(([lo,hi])=>a<hi&&lo<b);}
    function isWorkDay(date,schedule,model){return !model.clock?.calendar?.has(date)&&schedule.days.includes(new Date(date+'T00:00:00Z').getUTCDay());}
    function calendarError(model){
      if(!model.snapshot?.workBasis)return '휴가 내역을 확인하는 중이에요.';
      if(model.clock?.state!=='ready'||model.clock.year!==time.yearOf()||!model.clock.calendar)
        return model.clock?.state==='error'?'근무일과 공휴일을 확인하지 못했어요. 다시 확인해 주세요.':'근무일과 공휴일을 확인하는 중이에요.';
      return '';
    }
    const scheduleError=()=>pendingSchedule()?.phase==='saving'?'근무시간을 저장하는 중이에요.':personalNeedsRead()
      ?ticket?.loading?'최신 근무시간을 확인하는 중이에요.':'최신 근무시간을 확인하지 못했어요. 다시 확인해 주세요.'
      :ticket?.error?'저장한 근무시간을 확인하지 못했어요. 다시 확인해 주세요.':'저장한 근무시간을 확인하는 중이에요.';
    function workdayStatus(date,model){
      if(model.clock?.calendar?.has(date))return {reason:`${date}은 공휴일이에요.`};
      const {schedule}=scheduleFor(date,model);
      if(!schedule)return {reason:scheduleError(),unknown:true};
      return {reason:isWorkDay(date,schedule,model)?'':`${date}은 근무일이 아니에요.`};
    }
    function annualCalendar(){
      syncOwner();const model=calendarModel();
      return {error:calendarError(model),day:date=>{
        const day=annualDayStatus(date,model);
        if(!day.reason&&!time.dateSchedule(model.policy,date)&&unappliedSchedule())
          return {reason:'시간차에서 변경한 근무시간을 저장·적용하거나 취소한 뒤 계속해 주세요.',unknown:true};
        return day;
      }};
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
      return {...day,values,message:values.length?'':busy.length?reserved:'1시간 단위로 선택할 수 있는 시간이 없어요.'};
    }
    function refreshDates(model=calendarModel()){
      if(activeMode==='annual'){annualStartPicker?.refresh(model);annualEndPicker?.refresh(model);}
      else if(activeMode==='clock'){clockStartPicker.refresh(model);clockEndPicker.refresh(model);}
    }
    function setMode(mode){
      if(mode!==activeMode){start.close();end.close();clockStartPicker.show(mode==='clock');clockEndPicker.show(mode==='clock');}
      activeMode=mode;annualStartPicker?.show(mode==='annual');annualEndPicker?.show(mode==='annual');refreshDates();
    }
    function scheduleSubmitBlock(state){
      if(state.needsWork===false)return '';
      if(pendingSchedule()?.phase==='saving')return '근무시간 저장이 끝난 뒤 계속해 주세요.';
      if(unappliedSchedule()&&!personalNeedsRead())return `근무시간 변경을 ${owner?.self?'저장':'적용'}하거나 취소한 뒤 계속해 주세요.`;
      return '';
    }
    function refresh(){
      syncOwner();const model=calendarModel();
      startMenu=getClockMenu(startDate.value,'start',model);
      const endMenu=getClockMenu(endDate.value,'end',model);
      start.update(startMenu.values,!!startMenu.values.length,'시간 선택');
      end.update(endMenu.values,startMenu.values.includes(start.get())&&!!endMenu.values.length,'시간 선택');
      syncDates();const state=inspect();
      const retainedInvalid=(start.get()&&!startMenu.values.includes(start.get()))||(end.get()&&!endMenu.values.includes(end.get()));
      if(retainedInvalid){state.result=null;state.error=startMenu.message||endMenu.message||(state.error&&!state.error.includes('입력해')?state.error:'이전에 선택한 시간이 현재 범위에 없어요. 시간을 다시 선택해 주세요.');}
      editor.classList.toggle('hidden',!editOpen);
      scheduleSave.textContent=owner?.self?'근무시간 저장':'이 신청에 적용';
      scheduleSave.disabled=!!pendingSchedule()||!!ticket?.loading||!owner||(owner.self&&(!pref||personalNeedsRead()));
      cancel.disabled=!!pendingSchedule();
      const fallbackMenu=startMenu.fallback?startMenu:endMenu.fallback?endMenu:null;
      edit.classList.toggle('hidden',!fallbackMenu||editOpen||!!pendingSchedule()||(!pref&&owner?.self)||personalNeedsRead());
      const used=fallbackMenu?.schedule;
      setText(scheduleDescription,used?`${pref?.schedule||localSchedule?'근무시간':'기본 근무시간'} ${used.work_start}~${used.work_end}${used.break_start?` · 휴게 ${used.break_start}~${used.break_end}`:''}`:'');
      retry.classList.toggle('hidden',!state.retry&&!startMenu.retry&&!endMenu.retry&&!(editOpen&&canRetryPersonal()));
      setText(status,scheduleSubmitBlock(state)||(retainedInvalid||state.complete&&!state.result?state.error||'':startMenu.message||(start.get()?endMenu.message:'')||''));
      refreshDates(model);
      return state;
    }
    function summary({requireComplete=false}={}){
      const s=refresh(),items=s.result?.items||[],totalHours=(s.result?.totalMinutes||0)/60;
      const blocker=scheduleSubmitBlock(s);
      const error=requireComplete&&blocker?blocker:s.complete||requireComplete?s.error:null;
      return {ok:!error&&(!requireComplete||items.length>0),inputMode:'detail',items,totalHours,totalDays:time.roundDays(totalHours/8),errors:error?[error]:[]};
    }
    function draft(){
      const body={start_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get(),follows};
      if(editOpen)body.work_editor={...readWork(),break_start:breakStart.value};
      if(localSchedule)body.local_schedule=localSchedule;
      return body;
    }
    function restore(data){
      epoch++;ticket=null;owner=ownerState();editorOwner=owner?.key;editorBaseline=null;
      const s=data||{};startDate.value=s.start_date||'';endDate.value=s.end_date||'';lastStart=startDate.value;lastEnd=endDate.value;
      start.put(s.start_time);end.put(s.end_time);follows=s.follows!==false;
      pref=null;localSchedule=owner&&!owner.self?s.local_schedule||null:null;localOwner=localSchedule?owner.key:null;
      editOpen=!!s.work_editor;putWork(s.work_editor);editStatus.textContent='';syncDates();
    }
    putWork(null);syncDates();setMode('annual');
    return {summary,annualCalendar,draft,restore,refresh,refreshDates,setMode,activate(){syncOwner();if(owner){ctx.loadClock(false);void readPreference();}},version:'1.6.3'};
  }
  root.CoopApprovalAnnualLeave=Object.freeze({create,cleanSchedule,formatDeduction});
})(window);
