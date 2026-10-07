/* v1.4.0 - Host-scoped payment account, branding and receipt ingestion. */
(() => {
 'use strict';
 const endpoint='https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/festival-receipt';
 const publishable='sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
 const eventCode=(()=>{const match=String(globalThis.location?.search||'').match(/(?:^|[?&])event=([0-9a-f]{20})(?:&|$)/);return match?match[1]:'';})();
 const el=id=>document.getElementById(id);
 const quantity=el('quantity'), couponQuantity=el('couponQuantity'), amount=el('receiptAmount'), form=el('receiptForm');
 let busy=false, amountEdited=false, lastPayload='', key='',unitPrice=2000,couponValue=0,guideReady=false,noCash=false,bank=null;
 const say=(id,text,error=false)=>{el(id).textContent=text;el(id).classList.toggle('error',error);};
 function sync(){
  const q=Number(quantity.value),maximum=eventCode?1000:50;
  const quantityValid=Number.isInteger(q)&&q>=1&&q<=maximum;
  quantity.setCustomValidity(quantityValid?'':`개수를 1~${maximum} 사이의 정수로 입력해 주세요.`);
  const couponUsed=couponValue>0&&el('useCoupon').checked;
  const price=quantityValid?unitPrice*q:0,maxCoupons=quantityValid&&couponValue>0?Math.floor(price/couponValue):0;
  const count=couponUsed?Number(couponQuantity.value):0;
  const couponValid=!couponUsed||(Number.isInteger(count)&&count>=1&&count<=maxCoupons);
  const couponError=!quantityValid?'만들 개수를 먼저 확인해 주세요.':maxCoupons<1?'이 체험 금액에는 쿠폰을 사용할 수 없습니다.':!Number.isInteger(count)||count<1?'쿠폰 장수를 1 이상의 정수로 입력해 주세요.':`쿠폰은 최대 ${maxCoupons.toLocaleString('ko-KR')}장 사용할 수 있습니다. 쿠폰 합계가 체험비를 넘을 수 없습니다.`;
  couponQuantity.max=String(maxCoupons);couponQuantity.disabled=!couponUsed;couponQuantity.required=couponUsed;
  couponQuantity.setCustomValidity(couponValid?'':couponError);
  couponQuantity.setAttribute('aria-invalid',String(!couponValid));
  el('couponQuantityBlock').hidden=!couponUsed;
  say('couponStatus',couponValid?'':couponError,true);
  const valid=quantityValid&&couponValid,payment=valid?price-count*couponValue:0,payable=guideReady&&bank!==null&&!noCash&&valid&&payment>0;
  el('total').textContent=valid?payment.toLocaleString('ko-KR')+'원':quantityValid?'쿠폰 장수를 확인해 주세요':'개수를 확인해 주세요';
  el('total').classList.toggle('invalid',!valid);
  const bankCodes={'신협':'048','국민은행':'004','신한은행':'088','우리은행':'020','하나은행':'081','농협은행':'011','기업은행':'003','카카오뱅크':'090','토스뱅크':'092'},code=bankCodes[bank?.name];
  el('paymentActions').hidden=!payable;el('copyAccount').disabled=!payable;el('tossLink').hidden=!payable||!code;
  el('tossLink').href=payable&&code?'supertoss://send?bankCode='+code+'&accountNo='+bank.account.replace(/-/g,'')+'&amount='+payment+'&origin=link':'#';
  el('couponSummary').hidden=!couponUsed||!valid;
  el('couponSummary').textContent=valid?`체험비 ${price.toLocaleString('ko-KR')}원 − 쿠폰 ${count.toLocaleString('ko-KR')}장 (${(count*couponValue).toLocaleString('ko-KR')}원) = 입금 ${payment.toLocaleString('ko-KR')}원`:'';
  el('paymentStatus').textContent=guideReady&&!noCash&&valid&&payment===0?(couponUsed?'별도 입금은 없습니다. 쿠폰을 부스에 제출해 주세요.':'별도 입금은 없습니다. 체험 안내는 부스에서 확인해 주세요.') : '';
  el('receiptDetails').hidden=!payable;
  if(valid&&!amountEdited)amount.value=String(payment);
  return {valid,payment,payable};
 }
 quantity.addEventListener('input',sync);amount.addEventListener('input',()=>{amountEdited=true;});sync();
 quantity.max=eventCode?'1000':'50';
 el('useCoupon').addEventListener('change',()=>{amountEdited=false;sync();});
 couponQuantity.addEventListener('input',()=>{amountEdited=false;sync();});
 el('paymentCard').hidden=el('receiptDetails').hidden=true;el('guideStatus').textContent='행사 안내를 불러오고 있습니다.';
 (eventCode?window.FestivalGuide.load(eventCode):window.FestivalGuide.context()).then(data=>{
   if(!eventCode&&data.legacy_allowed!==true)throw new Error('EVENT_REQUIRED');
   el('coopName').textContent=data.coop_name;bank=data.bank&&typeof data.bank.account==='string'?data.bank:null;
   el('bankName').textContent=bank?.name||'';el('bankAccount').textContent=bank?.account||'';el('bankHolder').textContent=bank?.holder||'';
   el('accountText').value=bank?.account.replace(/-/g,'')||'';
   const contact=el('contactLink');contact.textContent=data.contact?.name&&data.contact?.phone?data.contact.name+' · '+data.contact.phone:'';
   contact.hidden=!data.contact?.phone;if(data.contact?.phone)contact.href='tel:'+data.contact.phone.replace(/[^+0-9]/g,'');
   const g=eventCode?data.guide:{unit_price:2000,coupon_enabled:false,activity_name:'태양광 선풍기 만들기 체험'};
   unitPrice=g.unit_price;couponValue=g.coupon_enabled?g.coupon_value:0;noCash=data.no_cash_sales===true;guideReady=true;
   el('activityTitle').textContent=g.activity_name;el('eventName').textContent=data.event_name||'';document.title=`${data.event_name||'체험비 입금'} · ${data.coop_name}`;
   el('eventMeta').textContent=eventCode?window.FestivalGuide.meta(data):'오후 1~7시 · 선착순 50명';el('eventMeta').hidden=!el('eventMeta').textContent;
   el('unitPrice').textContent=`개당 ${unitPrice.toLocaleString('ko-KR')}원`;el('couponLabel').hidden=!couponValue;
   el('couponText').textContent=`쿠폰 사용 (1장 ${couponValue.toLocaleString('ko-KR')}원)`;el('paymentCard').hidden=noCash;
   el('guideStatus').textContent=noCash?'무료 체험입니다. 참여 방법은 부스에서 안내받아 주세요.':!bank?'입금 계좌가 아직 등록되지 않았습니다. 부스 담당자에게 문의해 주세요.':'';sync();
  }).catch(()=>{el('guideStatus').textContent='행사 안내를 불러오지 못했습니다. 부스 담당자에게 문의하거나 페이지를 다시 열어 주세요.';});
 el('copyAccount').addEventListener('click',async()=>{if(!sync().payable)return;try{await navigator.clipboard.writeText(bank.account.replace(/-/g,''));say('copyStatus','계좌번호를 복사했습니다.');}catch{el('manualCopy').hidden=false;el('accountText').focus();el('accountText').select();say('copyStatus','아래 계좌번호를 직접 복사해 주세요.');}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();const payment=sync();if(busy||!payment.payable||!quantity.reportValidity()||!couponQuantity.reportValidity()||!form.reportValidity())return;
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
