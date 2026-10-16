/* v1.0.0 — Approved application notice; callers choose their existing tenant scope. */
(function(root){
 'use strict';
 const text='신청 완료일부터 10일 이내에 출자금을 납입해 주세요. 기한 내 납입이 확인되지 않으면 가입 신청을 종결하고 신청정보를 파기할 수 있습니다. 납입 유예를 승인받은 경우 연장된 기한을 적용하며, 일부 입금·입금 확인 중인 신청은 확인 전 파기하지 않습니다.';
 function show(element,enabled){if(!element)return;element.textContent=enabled?text:'';element.hidden=!enabled;}
 root.CoopApplicationNotice=Object.freeze({text,show});
})(window);
