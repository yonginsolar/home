/* v1.1.0 — Registered-host bylaw display, no main-cooperative default on read failure. */
(function(root){
 'use strict';
 const tail='기한 내 납입이 확인되지 않으면 가입 신청을 종결하고 신청정보를 파기할 수 있습니다. 납입 유예를 승인받은 경우 연장된 기한을 적용하며, 일부 입금·입금 확인 중인 신청은 확인 전 파기하지 않습니다.';
 let text='납입기한은 조합 사무국에 확인해 주세요.',sequence=0;
 function format(p){if(p.payment_days===null)return '납입기한은 조합 사무국에 확인해 주세요.';if(p.payment_days===0)return '출자금 납입기한은 별도로 정해져 있지 않습니다.';
  return (p.basis_kind==='acceptance_notified'?'가입 승낙 통지일':'신청 완료일')+'부터 '+p.payment_days+'일 이내에 출자금을 납입해 주세요. '+tail;}
 async function load(client,expectedCoop){const serial=++sequence;let timer;const controller=new AbortController();
  text='납입기한은 조합 사무국에 확인해 주세요.';
  try{let q=client.rpc('get_public_member_admission_policy');if(q.abortSignal)q=q.abortSignal(controller.signal);
   const r=await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('ADMISSION_READ_TIMEOUT'));},15000);})]);
   const p=r.data;if(r.error||serial!==sequence||!p?.coop_id||expectedCoop&&expectedCoop!==p.coop_id||!(p.payment_days===null||Number.isInteger(p.payment_days)&&p.payment_days>=0&&p.payment_days<=365)||!['application_completed','acceptance_notified'].includes(p.basis_kind))throw Error('ADMISSION_READ_FAILED');
   text=format(p);return text;
  }finally{clearTimeout(timer);}
 }
 function show(element,enabled){if(!element)return;element.textContent=enabled?text:'';element.hidden=!enabled;}
 root.CoopApplicationNotice=Object.freeze({get text(){return text;},show,load,format});
})(window);
