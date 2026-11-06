/* Leave time 1.2.0. Stored units remain stable; displayed workday follows confirmed terms. */
(function(root){
 'use strict';
 const DAY=480;
 function basisMinutes(policy={},date){policy=policy||{};const rows=Array.isArray(policy.periods)?policy.periods:[];if(date){let value=DAY;for(const p of rows)if(String(p.effective_date)<=date)value=Number(p.day_minutes);return value;}return Number(policy.day_minutes)||DAY;}
 function dayItem(item,policy={}){const day=basisMinutes(policy,item.leave_date),minutes=item.slot==='full'?day:day/2;return {...item,basis_day_minutes:day,deducted_minutes:minutes,deducted_hours:minutes/60,deducted_days:minutes/DAY};}
 function minuteOfDay(v){if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v||'')))throw Error('시작·종료 시간을 입력해 주세요.');const [h,m]=v.split(':').map(Number);return h*60+m;}
 function yearOf(now=new Date()){
  return new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(now);
 }
 function isDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
 }
 function inYear(value,year=yearOf()){return isDate(value)&&value.slice(0,4)===String(year);}
 function breakWindow(start,end){
  try{const a=minuteOfDay(start),b=minuteOfDay(end);return b>a?{start,end,a,b}:null;}catch(_){return null;}
 }
 function dateSchedule(policy,date){
  let p;
  for(const row of policy?.periods||[])if(row.effective_date<=date)p=row;
  const schedule=p?.schedule;
  if(!schedule || (schedule.valid_until&&schedule.valid_until<date))return null;
  return schedule;
 }
 function clockLabel(minutes){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
 function defaultBreakMinutes(work){return !work?0:work.b-work.a>=480?60:work.b-work.a>=240?30:0;}
 const DEFAULT_SCHEDULE=Object.freeze({work_start:'09:00',work_end:'18:00',break_start:'12:00',break_end:'13:00',days:Object.freeze([1,2,3,4,5])});
 function halfBoundary(policy,date){
  const s=dateSchedule(policy,date)||DEFAULT_SCHEDULE;
  const work=breakWindow(s.work_start,s.work_end),pause=breakWindow(s.break_start,s.break_end);
  if(!work||!pause)return 840;
  const half=work.a+Math.floor((work.b-work.a-(pause.b-pause.a))/2);
  return half>=pause.a?half+pause.b-pause.a:half;
 }
 function leaveCoverage(i,date,policy){
   const slot=({오전:'am',오후:'pm',morning:'am',afternoon:'pm',am:'am',pm:'pm',hour:'hour'})[i.slot||i.slot_label]||'full';
   if(slot==='hour'&&i.time_input_mode!=='hours'){const window=breakWindow(i.start_time,i.end_time);if(window)return [window.a,window.b];}
   if(slot==='am')return [0,halfBoundary(policy,date)];
   if(slot==='pm')return [halfBoundary(policy,date),1440];
   return [0,1440];
 }
 function kstClock(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(i=>[i.type,i.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
 }
 function overlappingLeave(items,prior,policy){
  for(const next of items||[]){
   const day=next.leave_date,[a,b]=leaveCoverage(next,day,policy);
   for(const old of prior||[]){
    if(old.leave_date!==day)continue;
    const [c,d]=leaveCoverage(old,day,policy);if(a<d&&c<b)return day;
   }
  }
  return '';
 }
 function scheduledRange(item,policy,calendar,year=yearOf()){
  const {leave_date:date,end_date:endDate,start_time:startTime,end_time:endTime}=item;
  if(!inYear(date,year)||!inYear(endDate,year))throw Error('시작일과 종료일은 올해 날짜로 선택해 주세요.');
  if(!/:(00|30)$/.test(startTime)||!/:(00|30)$/.test(endTime))throw Error('시작·종료 시간을 00분 또는 30분 단위로 선택해 주세요.');
  const start=minuteOfDay(startTime),end=minuteOfDay(endTime);
  if(endDate<date||(endDate===date&&end<=start))throw Error('종료는 시작보다 늦어야 합니다.');
  const manual=item.schedule_mode==='actual';
  const actualWork=manual&&breakWindow(item.work_start,item.work_end);
  if(manual&&!actualWork)throw Error('실제 근무 시작·종료 시각을 확인해 주세요.');
  if(manual&&date!==endDate&&!item.work_days?.length)throw Error('기간 중 실제 근무하는 요일을 선택해 주세요.');
  if(!calendar&&!(manual&&item.include_holidays))throw Error('공휴일을 확인하지 못했습니다. 다시 확인해 주세요.');
  const items=[];let excludedBreak=0, grossWork=0;
  const last=new Date(endDate+'T00:00:00Z');
  for(const day=new Date(date+'T00:00:00Z');day<=last;day.setUTCDate(day.getUTCDate()+1)){
   const iso=day.toISOString().slice(0,10),weekday=day.getUTCDay();
   const boundary=iso===date||iso===endDate;
   if(calendar?.has(iso)&&!(manual&&item.include_holidays)){if(item.strict_bounds&&boundary)throw Error(`${iso}은 근무일이 아니에요.`);continue;}
   const schedule=manual?null:(dateSchedule(policy,iso)||item.fallback_schedule);
   if(!manual&&!schedule)throw Error('기간 중 확인된 근무표가 없는 날짜가 있어요. 실제 근무시간을 직접 지정해 주세요.');
   if(manual?(date!==endDate&&!item.work_days.includes(String(weekday))):!schedule.days.includes(weekday)){if(item.strict_bounds&&boundary)throw Error(`${iso}은 근무일이 아니에요.`);continue;}
   const work=actualWork||breakWindow(schedule.work_start,schedule.work_end);
   if(!work)throw Error('근무 시작·종료 시각을 확인해 주세요.');
   if(item.strict_bounds&&((iso===date&&(start<work.a||start>=work.b))||(iso===endDate&&(end<=work.a||end>work.b))))throw Error(`시간차는 근무시간(${work.start}~${work.end}) 안에서 선택해 주세요.`);
   const a=Math.max(work.a,iso===date?start:0),b=Math.min(work.b,iso===endDate?end:1440);
   if(b<=a)continue;
   const pause=manual?(item.break_mode==='none'?null:breakWindow(item.actual_break_start,item.actual_break_end)):breakWindow(schedule.break_start,schedule.break_end);
   const noBreak=manual?item.break_mode==='none':schedule.break_start===''&&schedule.break_end==='';
   if(!noBreak&&!pause)throw Error('실제 휴게 시작·종료 시간을 확인하거나 휴게시간 없음을 선택해 주세요.');
   if(pause&&(pause.a<work.a||pause.b>work.b))throw Error('휴게시간은 근무시간 안에서 지정해 주세요.');
   const overlap=pause?Math.max(0,Math.min(b,pause.b)-Math.max(a,pause.a)):0;
   excludedBreak+=overlap; grossWork+=b-a;
   if(b-a===overlap)continue;
   items.push(hourItem({leave_date:iso,start_time:clockLabel(a),end_time:clockLabel(b),time_input_mode:'range',break_minutes:overlap},policy));
  }
  if(!items.length)throw Error('선택한 기간에 차감할 근무시간이 없습니다.');
  if(items.length>200)throw Error('한 번에 신청할 수 있는 근무일은 200일까지입니다.');
  return {items,excludedBreak,grossWork,totalMinutes:grossWork-excludedBreak};
 }
 function formatMinutes(value){const minutes=Math.round(value);const hours=Math.floor(minutes/60);return [hours?`${hours}시간`:'',minutes%60||!hours?`${minutes%60}분`:''].filter(Boolean).join(' ');}
 function hourItem(item,policy={}){
  if(item.time_input_mode==='hours'||policy.periods){
   const day=basisMinutes(policy,item.leave_date);let minutes,breakMinutes=Number(item.break_minutes)||0;
   if(item.time_input_mode==='hours') minutes=item.entered_minutes!=null?Number(item.entered_minutes):hoursToMinutes(item.net_hours,day);
   else {const start=minuteOfDay(item.start_time),end=minuteOfDay(item.end_time);if(end<=start||!Number.isInteger(breakMinutes)||breakMinutes<0)throw Error('시작·종료 시간과 제외할 시간을 확인해 주세요.');minutes=end-start-breakMinutes;}
   if(!Number.isInteger(minutes)||minutes<1||minutes>day)throw Error(`시간차는 1분 이상 ${day/60}시간 이하로 입력해 주세요.`);
   return {...item,slot:'hour',slot_label:'시간차',time_input_mode:item.time_input_mode==='hours'?'hours':'range',break_minutes:breakMinutes,entered_minutes:item.time_input_mode==='hours'?minutes:undefined,basis_day_minutes:day,deducted_minutes:minutes,deducted_hours:minutes/60,deducted_days:minutes/DAY};
  }
  const start=minuteOfDay(item.start_time),end=minuteOfDay(item.end_time);
  const lunchStart=String(item.lunch_start||policy.work_lunch_start_time||'12:00'),lunchEnd=String(item.lunch_end||policy.work_lunch_end_time||'13:00');
  const a=minuteOfDay(lunchStart),b=minuteOfDay(lunchEnd);if(end<=start||b<=a)throw Error('종료 시간은 시작 시간보다 늦어야 합니다.');
  const minutes=end-start-Math.max(0,Math.min(end,b)-Math.max(start,a));if(minutes<=0||minutes>DAY)throw Error('시간차는 점심시간을 제외해 1분 이상 8시간 이하로 입력해 주세요.');
  return {...item,slot:'hour',slot_label:'시간차',lunch_start:lunchStart,lunch_end:lunchEnd,deducted_minutes:minutes,deducted_hours:minutes/60,deducted_days:minutes/DAY};
 }
 function roundDays(value){return Math.round((Number(value)||0)*DAY)/DAY;}
 function formatDays(value,dayMinutes=DAY){const day=Number(dayMinutes)>0?Number(dayMinutes):DAY;let minutes=Math.round((Number(value)||0)*DAY),sign=minutes<0?'-':'';minutes=Math.abs(minutes);const days=Math.floor(minutes/day),hours=(minutes%day)/60;return sign+days+'일 '+Number(hours.toFixed(4))+'시간';}
 function hoursToMinutes(value,max=1440){const n=Number(value),minutes=Math.round(n*60);if(!Number.isFinite(n)||n<=0||Math.abs(n*60-minutes)>1e-7||minutes>max)throw Error('시간은 0보다 큰 값으로 입력해 주세요.');return minutes;}
 root.CoopLeaveTime=Object.freeze({hourItem,dayItem,basisMinutes,roundDays,formatDays,hoursToMinutes,yearOf,isDate,inYear,breakWindow,dateSchedule,scheduledRange,formatMinutes,clockLabel,defaultBreakMinutes,defaultSchedule:DEFAULT_SCHEDULE,overlappingLeave,leaveCoverage,kstClock,dayMinutes:DAY,version:'1.3.1'});
})(window);
