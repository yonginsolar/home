/* 2026-09-14 v1.0.0. Exact birthday in Korea; no network or persistence. */
(function(root){
  function ageFromRrn(rrn, now = new Date()) {
    const digits=String(rrn||'').replace(/\D/g,'');
    if(digits.length<7 || !'12345678'.includes(digits[6]))return null;
    const year=Number(digits.slice(0,2))+('1256'.includes(digits[6])?1900:2000), month=Number(digits.slice(2,4)), day=Number(digits.slice(4,6));
    const dob=new Date(Date.UTC(year,month-1,day));
    if(dob.getUTCFullYear()!==year || dob.getUTCMonth()!==month-1 || dob.getUTCDate()!==day)return null;
    const [y,m,d]=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).split('-').map(Number);
    const age=y-year-((m<month || (m===month && d<day))?1:0);
    return age<0?null:age;
  }
  root.MinorSignup={ageFromRrn};
  if(typeof module!=='undefined')module.exports=root.MinorSignup;
})(typeof window==='undefined'?globalThis:window);
