/* Leave time 1.1.0. Stored units remain stable; displayed workday follows confirmed terms. */
(function(root){
 'use strict';
 const DAY=480;
 function basisMinutes(policy={},date){policy=policy||{};const rows=Array.isArray(policy.periods)?policy.periods:[];if(date){let value=DAY;for(const p of rows)if(String(p.effective_date)<=date)value=Number(p.day_minutes);return value;}return Number(policy.day_minutes)||DAY;}
 function dayItem(item,policy={}){const day=basisMinutes(policy,item.leave_date),minutes=item.slot==='full'?day:day/2;return {...item,basis_day_minutes:day,deducted_minutes:minutes,deducted_hours:minutes/60,deducted_days:minutes/DAY};}
 function minuteOfDay(v){if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v||'')))throw Error('시작·종료 시간을 입력해 주세요.');const [h,m]=v.split(':').map(Number);return h*60+m;}
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
 root.CoopLeaveTime=Object.freeze({hourItem,dayItem,basisMinutes,roundDays,formatDays,hoursToMinutes,dayMinutes:DAY,version:'1.1.0'});
})(window);
