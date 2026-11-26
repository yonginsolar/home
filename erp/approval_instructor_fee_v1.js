(function (root) {
  'use strict';
  const format=new Intl.NumberFormat('ko-KR');
  const won=n=>format.format(n)+'원';
  function calculate(input,rate){
    const raw=String(input??'').trim();
    if(!/^\d{1,12}$/.test(raw)||Number(raw)<1||!['3.3','8.8'].includes(rate))return null;
    const gross=BigInt(raw);
    const exempt=rate==='8.8' && gross<=125000n;
    const national=exempt?0n:(gross*(rate==='3.3'?3n:8n)/1000n)*10n;
    const local=(national/100n)*10n;
    return {gross:Number(gross),national:Number(national),local:Number(local),net:Number(gross-national-local),
      rate, exempt, kind:rate==='3.3'?'사업소득':'기타소득'};
  }
  function description(result) {
    return [`[강사비 원천징수 계산 · ${result.kind} ${result.rate}%]`,
      `총액 ${won(result.gross)} · 소득세 ${won(result.national)} · 지방소득세 ${won(result.local)} · 실지급액 ${won(result.net)}`,
      result.exempt?'과세최저한 적용 (1건 기준)':''].filter(Boolean).join('\n');
  }
  function mount(target,{current,attach}) {
    if(target.dataset.ready)return;
    target.dataset.ready='true';
    const gross=target.querySelector('#approvalInstructorGross'),rate=target.querySelector('#approvalInstructorRate');
    const report=target.querySelector('#approvalInstructorResult'),send=target.querySelector('#approvalInstructorAppend');
    const update=()=>{
      const result=current()?calculate(gross.value,rate.value):null;
      report.textContent=result?description(result).split('\n').slice(1).join(' · '):'';
      send.disabled=!result;
      return result;
    };
    gross.oninput=rate.onchange=update;
    send.onclick=()=>{const result=update(); if(result)attach(description(result));};
    update();
    return {reset(){ gross.value='';rate.value='';update(); }};
  }
  const api=Object.freeze({calculate,description,mount});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ApprovalInstructorFee=api;
})(globalThis);
