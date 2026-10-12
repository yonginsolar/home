/* Leave time 1.0.0. Eight-hour display day; integer minutes preserve partial hours. */
(function(root){
 'use strict';
 const DAY=480;
 function minuteOfDay(v){if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v||'')))throw Error('시작·종료 시간을 입력해 주세요.');const [h,m]=v.split(':').map(Number);return h*60+m;}
 function hourItem(item,policy={}){
  const start=minuteOfDay(item.start_time),end=minuteOfDay(item.end_time);
  const lunchStart=String(item.lunch_start||policy.work_lunch_start_time||'12:00'),lunchEnd=String(item.lunch_end||policy.work_lunch_end_time||'13:00');
  const a=minuteOfDay(lunchStart),b=minuteOfDay(lunchEnd);if(end<=start||b<=a)throw Error('종료 시간은 시작 시간보다 늦어야 합니다.');
  const minutes=end-start-Math.max(0,Math.min(end,b)-Math.max(start,a));if(minutes<=0||minutes>DAY)throw Error('시간차는 점심시간을 제외해 1분 이상 8시간 이하로 입력해 주세요.');
  return {...item,slot:'hour',slot_label:'시간차',lunch_start:lunchStart,lunch_end:lunchEnd,deducted_minutes:minutes,deducted_hours:minutes/60,deducted_days:minutes/DAY};
 }
 function roundDays(value){return Math.round((Number(value)||0)*DAY)/DAY;}
 function formatDays(value){let minutes=Math.round((Number(value)||0)*DAY),sign=minutes<0?'-':'';minutes=Math.abs(minutes);const days=Math.floor(minutes/DAY),hours=(minutes%DAY)/60;return sign+days+'일 '+Number(hours.toFixed(4))+'시간';}
 function hoursToMinutes(value,max=1440){const n=Number(value),minutes=Math.round(n*60);if(!Number.isFinite(n)||n<=0||Math.abs(n*60-minutes)>1e-7||minutes>max)throw Error('시간은 0보다 큰 값으로 입력해 주세요.');return minutes;}
 root.CoopLeaveTime=Object.freeze({hourItem,roundDays,formatDays,hoursToMinutes,dayMinutes:DAY,version:'1.0.0'});
})(window);
