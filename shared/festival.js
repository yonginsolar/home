/* v1.2.0 - Saved per-event guide, coupon payment and write-only receipt requests. */
(() => {
 'use strict';
 const endpoint='https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/festival-receipt';
 const publishable='sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
 const eventCode=(()=>{const match=String(globalThis.location?.search||'').match(/(?:^|[?&])event=([0-9a-f]{20})(?:&|$)/);return match?match[1]:'';})();
 const el=id=>document.getElementById(id);
 const quantity=el('quantity'), amount=el('receiptAmount'), form=el('receiptForm');
 let busy=false, amountEdited=false, lastPayload='', key='',unitPrice=2000,couponValue=0,guideReady=!eventCode,noCash=false;
 const say=(id,text,error=false)=>{el(id).textContent=text;el(id).classList.toggle('error',error);};
 function sync(){const q=Number(quantity.value),coupon=el('useCoupon').checked?couponValue:0,payment=(unitPrice-coupon)*q;
  const maximum=eventCode?1000:50,valid=Number.isInteger(q)&&q>=1&&q<=maximum;quantity.setCustomValidity(valid?'':`개수를 1~${maximum} 사이의 정수로 입력해 주세요.`);el('total').textContent=valid?payment.toLocaleString('ko-KR')+'원':'개수를 확인해 주세요';el('tossLink').hidden=!valid||payment===0;
  el('couponSummary').hidden=!coupon;el('couponSummary').textContent=`체험비 ${(unitPrice*q).toLocaleString('ko-KR')}원 − 쿠폰 ${(coupon*q).toLocaleString('ko-KR')}원 = 입금 ${payment.toLocaleString('ko-KR')}원`;
  el('receiptDetails').hidden=!guideReady||noCash||(valid&&payment===0);
  if(valid){el('tossLink').href='supertoss://send?bankCode=048&accountNo=131022855509&amount='+payment+'&origin=link';if(!amountEdited)amount.value=String(payment);}}
 quantity.addEventListener('input',sync);amount.addEventListener('input',()=>{amountEdited=true;});sync();
 quantity.max=eventCode?'1000':'50';
 el('useCoupon').addEventListener('change',()=>{amountEdited=false;sync();});
 if(eventCode){el('paymentCard').hidden=el('receiptDetails').hidden=true;el('guideStatus').textContent='행사 안내를 불러오고 있습니다.';
  window.FestivalGuide.load(eventCode).then(data=>{const g=data.guide;unitPrice=g.unit_price;couponValue=g.coupon_enabled?g.coupon_value:0;noCash=data.no_cash_sales===true;guideReady=true;
   el('activityTitle').textContent=g.activity_name;el('eventName').textContent=data.event_name;document.title=`${data.event_name} · 체험 안내`;
   el('eventMeta').textContent=window.FestivalGuide.meta(data);el('eventMeta').hidden=!el('eventMeta').textContent;
   el('unitPrice').textContent=`개당 ${unitPrice.toLocaleString('ko-KR')}원`;el('couponLabel').hidden=!couponValue;
   el('couponText').textContent=`쿠폰 사용 (개당 ${couponValue.toLocaleString('ko-KR')}원)`;el('paymentCard').hidden=noCash;
   el('guideStatus').textContent=noCash?'무료 체험입니다. 참여 방법은 부스에서 안내받아 주세요.':'';sync();
  }).catch(()=>{el('guideStatus').textContent='행사 안내를 불러오지 못했습니다. 부스 담당자에게 문의하거나 페이지를 다시 열어 주세요.';});}
 el('copyAccount').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('131022855509');say('copyStatus','계좌번호를 복사했습니다.');}catch{el('manualCopy').hidden=false;el('accountText').focus();el('accountText').select();say('copyStatus','아래 계좌번호를 직접 복사해 주세요.');}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!guideReady||noCash||!form.reportValidity())return;
  const payload={name:el('depositorName').value.trim(),amount:Number(amount.value),quantity:Number(quantity.value),phone:el('receiptPhone').value.trim(),consent:el('receiptConsent').checked,website:el('website').value,eventCode};
  if(!/^0\d{8,10}$/.test(payload.phone.replace(/[\s-]/g,''))){say('receiptStatus','전화번호를 확인해 주세요.',true);el('receiptPhone').focus();return;}
  if(!payload.name||/[<>\x00-\x1f\x7f]/.test(payload.name)){say('receiptStatus','입금자명을 확인해 주세요.',true);return;}
  const serialized=JSON.stringify(payload);
  if(serialized!==lastPayload||!key){key=crypto.randomUUID();lastPayload=serialized;}
  busy=true;el('submitReceipt').disabled=true;el('submitReceipt').textContent='신청 중…';say('receiptStatus','');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':publishable},body:JSON.stringify({...payload,requestKey:key}),signal:AbortSignal.timeout(20000),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
   const result=await response.json();if(!response.ok||result.received!==true){const messages={TOO_MANY_REQUESTS:'요청이 많습니다. 잠시 후 다시 신청해 주세요.',INVALID_INPUT:'입금자명, 입금액, 전화번호를 다시 확인해 주세요.',CONSENT_REQUIRED:'개인정보 수집·이용 동의를 확인해 주세요.'};throw new Error(messages[result.error]||'신청을 확인하지 못했습니다. 입력 내용은 그대로 두고 다시 시도해 주세요.');}
   form.querySelectorAll('input').forEach(input=>{input.disabled=true;});amountEdited=true;
   say('receiptStatus','현금영수증 신청이 접수되었습니다.\n담당자가 입금 확인 후 발급합니다.');el('submitReceipt').hidden=true;el('receiptStatus').focus();
  }catch(error){say('receiptStatus',error.name==='TimeoutError'?'응답이 지연되고 있습니다. 다시 눌러도 같은 신청이 중복 접수되지 않습니다.':error instanceof TypeError?'연결을 확인하고 다시 신청해 주세요.':error.message,true);}
  finally{busy=false;el('submitReceipt').disabled=false;el('submitReceipt').textContent='현금영수증 신청하기';}
 });
})();
