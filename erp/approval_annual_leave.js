(function (root) {
  'use strict';
  const CLOCK = /^([01]\d|2[0-3]):(00|30)$/;
  const WEEK = [1, 2, 3, 4, 5];
  const RPC = 'erp_self_leave_work_schedule';
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

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
    let epoch=0, ticket=null, pendingSave=null, editorOwner=null, lastStart='';

    function clockControl(side,title) {
      const clock=input('time',`annualClock${side}Time`);clock.step='1800';
      clock.addEventListener('input',changed);clock.addEventListener('change',changed);
      return {wrapper:label(title,clock),control:clock,put:raw=>{clock.value=String(raw||'').trim();},get:()=>clock.value};
    }

    const start=clockControl('Start','시작 시간'),end=clockControl('End','종료 시간');
    const first=make('div','leave-entry-pair');first.append(label('시작일',startDate),start.wrapper);
    endGroup.append(label('종료일',endDate),end.wrapper);
    const work=make('div','leave-entry-pair mb-2');work.append(label('출근 시간',workStart),label('퇴근 시간',workEnd));
    const breakPair=make('div','mt-2');breakPair.append(label('휴게 시작',breakStart));
    const week=make('details','small my-2'),weekTitle=make('summary');week.append(weekTitle);
    const dayRow=make('div','d-flex flex-wrap gap-2 mt-2');week.append(dayRow);
    const days=[['월',1],['화',2],['수',3],['목',4],['금',5],['토',6],['일',0]].map(([name,day])=>{
      const ch=input('checkbox',`annualWorkDay${day}`,'form-check-input me-1');ch.value=String(day);
      const wrap=make('label');wrap.append(ch,name);dayRow.append(wrap);ch.addEventListener('change',()=>updateWeek());return ch;
    });
    const actions=make('div','d-flex gap-2 flex-wrap mt-2');actions.append(scheduleSave,cancel);
    editor.append(make('legend','small fw-bold float-none w-auto mb-2','근무시간'),work,breakPair,breakDescription,week,actions,editStatus);
    const tools=make('div','d-flex gap-2 flex-wrap');tools.append(edit,retry);
    area.append(first,endGroup,status,scheduleDescription,tools,editor);

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
    function syncOwner(){
      const next=ownerState();
      if(next?.key===owner?.key)return;
      epoch++;owner=next;pref=next?.self?null:{revision:0,schedule:null};ticket=null;pendingSave=null;
      if(editorOwner!==next?.key){editOpen=false;putWork(null);editStatus.textContent='';editorOwner=null;}
      if(localOwner!==next?.key){localSchedule=null;localOwner=null;}
    }
    function setText(el,value){if(el.textContent!==value)el.textContent=value;}
    function syncDates(){
      const year=time.yearOf();
      startDate.min=`${year}-01-01`;startDate.max=endDate.max=`${year}-12-31`;
      endDate.min=time.inYear(startDate.value)?startDate.value:startDate.min;
      const ready=time.inYear(startDate.value)&&CLOCK.test(start.get());
      endGroup.classList.toggle('hidden',!ready);
      endDate.disabled=!ready;end.wrapper.querySelectorAll('input,select').forEach(el=>{el.disabled=!ready;});
    }
    function changed(){syncDates();ctx.changed();}
    startDate.addEventListener('change',()=>{
      if(follows&&(!endDate.value||endDate.value===lastStart))endDate.value=startDate.value;
      lastStart=startDate.value;changed();
    });
    endDate.addEventListener('change',()=>{follows=false;changed();});
    for(const field of [workStart,workEnd,breakStart])field.addEventListener('input',syncWorkBreak);

    function rpc(action,args,signal){return ctx.client().rpc(RPC,{p_action:action,...args}).abortSignal(signal);}
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
        const {data,error}=await withDeadline(signal=>rpc('read',{},signal));
        if(!current())return;
        if(error||!validResponse(data))throw Error('LEAVE_PREF_READ');
        pref={revision:data.revision,schedule:data.schedule?cleanSchedule(data.schedule,time):null};ticket=null;
      }catch(_){if(current())ticket={error:true};}
      finally{if(current())ctx.changed();}
    }
    function openEditor(explicit=true){
      if(!editOpen){editOpen=true;editorOwner=owner?.key;putWork(pref?.schedule||localSchedule||time.defaultSchedule);editStatus.textContent='';}
      if(explicit){editor.classList.remove('hidden');workStart.focus();}
      ctx.changed();
    }
    edit.addEventListener('click',()=>openEditor());
    cancel.addEventListener('click',()=>{editOpen=false;editStatus.textContent='';ctx.changed();if(!edit.classList.contains('hidden'))edit.focus();});
    retry.addEventListener('click',()=>{void readPreference({reload:true});ctx.loadClock(true);});
    scheduleSave.addEventListener('click',async()=>{
      syncOwner();if(!owner||pendingSave)return;
      let value;
      try{
        const pause=workBreak();
        if(pause.duration&&(!breakStart.value||!pause.end))throw Error('휴게 시작 시간을 입력해 주세요.');
        if(pause.duration&&(breakStart.value<=pause.work.start||pause.end>=pause.work.end))throw Error('휴게는 출근과 퇴근 사이에 지정해 주세요.');
        value=cleanSchedule(readWork(),time);
      }catch(e){setText(editStatus,e.message);return;}
      if(!owner.self){localSchedule=value;localOwner=owner.key;editOpen=false;ctx.changed();return;}
      if(!pref){setText(editStatus,'저장된 근무시간을 먼저 다시 확인해 주세요. 입력은 그대로 남아 있어요.');return;}
      const key=owner.key,mine=epoch,revision=pref.revision;
      const current=()=>mine===epoch&&ownerState()?.key===key;
      const typed=readWork();pendingSave={value};scheduleSave.disabled=true;setText(editStatus,'근무시간 저장 중…');
      try{
        const {data,error}=await withDeadline(signal=>rpc('save',{p_schedule:value,p_expected_revision:revision},signal));
        if(!current())return;
        if(error?.code==='PT409'){
          setText(editStatus,'다른 창에서 근무시간을 바꿨어요. 입력은 남겨 두었으니 확인 후 다시 저장해 주세요.');
          await readPreference({reload:true});return;
        }
        if(error||!validResponse(data)||!same(cleanSchedule(data.schedule,time),value))throw Error('LEAVE_PREF_SAVE');
        pref={revision:data.revision,schedule:value};
        if(same(typed,readWork())){editOpen=false;setText(editStatus,'');}
        else setText(editStatus,'저장했습니다. 이후 바꾼 값은 아직 저장하지 않았어요.');
      }catch(_){
        if(current()){
          setText(editStatus,'저장 결과를 확인하지 못했어요. 입력은 남겨 두었으니 다시 확인해 주세요.');
          await readPreference({reload:true});
        }
      }finally{if(current()){pendingSave=null;scheduleSave.disabled=false;ctx.changed();}}
    });

    function inspect(){
      syncOwner();
      const snapshot=ctx.snapshot(),clock=snapshot?.clockSchedule;
      const entry={leave_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get()};
      const policy={...(snapshot?.workBasis||{}),periods:clock?.periods||snapshot?.workBasis?.periods||[]};
      const calendar=clock?.year===time.yearOf()?clock?.calendar:null;
      const fallback=owner?.self?(pref?pref.schedule||time.defaultSchedule:null):localSchedule||time.defaultSchedule;
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
      if(needsWork&&!fallback)return {entry,complete,result:null,needsWork,error:ticket?.error?'저장한 근무시간을 확인하지 못했어요. 다시 확인해 주세요.':ticket?.loading?'저장한 근무시간을 확인하는 중이에요.':'차감 시간을 계산할 수 있도록 근무시간을 입력해 주세요.',retry:ticket?.error};
      try{return {entry,complete,needsWork,fallback,result:time.scheduledRange({...entry,fallback_schedule:fallback,strict_bounds:true},policy,calendar)};}
      catch(e){return {entry,complete,needsWork,result:null,error:e.message};}
    }
    function refresh(){
      syncDates();const state=inspect();
      const clock=ctx.snapshot()?.clockSchedule;
      for(const [field,date,isEnd] of [[start.control,startDate.value,false],[end.control,endDate.value,true]]){
        const bounds=time.dateSchedule({periods:clock?.periods||[]},date)||(owner?.self?pref?.schedule:localSchedule)||time.defaultSchedule;
        const span=time.breakWindow(bounds.work_start,bounds.work_end);
        field.min=span?time.clockLabel(Math.ceil((span.a+(isEnd?1:0))/30)*30):'';
        field.max=span?time.clockLabel(Math.floor((span.b-(isEnd?0:1))/30)*30):'';
      }
      editor.classList.toggle('hidden',!editOpen);
      scheduleSave.textContent=owner?.self?'근무시간 저장':'이 신청에 적용';
      scheduleSave.disabled=!!pendingSave||!owner||(owner.self&&!pref);
      edit.classList.toggle('hidden',!state.needsWork||editOpen||(!pref&&owner?.self));
      const used=state.fallback;
      setText(scheduleDescription,used&&state.needsWork?`${pref?.schedule||localSchedule?'근무시간':'기본 근무시간'} ${used.work_start}~${used.work_end}${used.break_start?` · 휴게 ${used.break_start}~${used.break_end}`:''}`:'');
      retry.classList.toggle('hidden',!state.retry);
      setText(status,state.complete&&!state.result?state.error||'':'');
      return state;
    }
    function summary({requireComplete=false}={}){
      const s=refresh(),items=s.result?.items||[],totalHours=(s.result?.totalMinutes||0)/60;
      const edited=editOpen&&pref?.schedule&&!same(readWork(),pref.schedule);
      const error=requireComplete&&edited?'근무시간 변경을 저장하거나 취소한 뒤 계속해 주세요.':s.complete||requireComplete?s.error:null;
      return {ok:!error&&(!requireComplete||items.length>0),inputMode:'detail',items,totalHours,totalDays:time.roundDays(totalHours/8),errors:error?[error]:[]};
    }
    function draft(){
      const body={start_date:startDate.value,end_date:endDate.value,start_time:start.get(),end_time:end.get(),follows};
      if(editOpen)body.work_editor={...readWork(),break_start:breakStart.value};
      if(localSchedule)body.local_schedule=localSchedule;
      return body;
    }
    function restore(data){
      epoch++;ticket=null;pendingSave=null;owner=ownerState();editorOwner=owner?.key;
      const s=data||{};startDate.value=s.start_date||'';endDate.value=s.end_date||'';lastStart=startDate.value;
      start.put(s.start_time);end.put(s.end_time);follows=s.follows!==false;
      pref=null;localSchedule=owner&&!owner.self?s.local_schedule||null:null;localOwner=localSchedule?owner.key:null;
      editOpen=!!s.work_editor;putWork(s.work_editor);editStatus.textContent='';syncDates();
    }
    putWork(null);syncDates();
    return {summary,draft,restore,refresh,activate(){syncOwner();if(owner){ctx.loadClock(false);void readPreference();}},version:'1.1.0'};
  }
  root.CoopApprovalAnnualLeave=Object.freeze({create,cleanSchedule});
})(window);
