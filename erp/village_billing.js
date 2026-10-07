/* 1.2.0 · Contract-bound invoices, tax confirmation and accounting-linked payment. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toLocaleString('ko-KR'),states={issued:'납부 대기',paid:'입금 완료',cancelled:'취소'};
 let db,ctx,co='',setting={},villages=[],preview=null,selected=null,contractInfo={},pending=false,feeBaseline='';
 const errors={SERVICE_SIGNED_CONTRACT_REQUIRED:'양측 서명이 완료된 계약이 있어야 연간 이용료를 청구할 수 있습니다.',SERVICE_VILLAGE_NOT_INCLUDED:'선택한 기간의 계약에 햇빛소득마을 이용이 포함되지 않았습니다. 변경합의서를 먼저 체결해 주세요.',SERVICE_FEE_CHANGE_REQUIRES_AMENDMENT:'체결된 요금은 변경합의서에서 변경해 주세요.',VILLAGE_FEE_CHANGED:'다른 화면에서 요금이 바뀌었습니다. 다시 불러온 뒤 확인해 주세요.',VILLAGE_FEE_ACCESS_DENIED:'이 조합의 청구서를 확인할 권한이 없습니다.',VILLAGE_FEE_PROVIDER_REQUIRED:'청구서 발행과 입금 확인은 제공자만 처리할 수 있습니다.',VILLAGE_FEE_NOT_CONFIGURED:'마을당 요금을 먼저 등록해 주세요.',VILLAGE_INVOICE_PERIOD_ALREADY_BILLED:'선택한 마을·기간에 이미 청구서가 있습니다. 기존 청구서를 확인해 주세요.',VILLAGE_INVOICE_NO_USAGE:'선택한 기간에 이용 일수가 없습니다.',VILLAGE_INVOICE_LOCKED:'이미 입금 완료 또는 취소된 청구서입니다.',VILLAGE_INVOICE_INVALID_PERIOD:'요금 적용기간 안에서 청구기간과 마을을 선택해 주세요.',VILLAGE_FEE_INVALID_INPUT:'금액·기간·확인 항목을 확인해 주세요.'};
 Object.assign(errors,{SERVICE_INVOICE_USE_CONTRACT_END:'청구 종료일은 체결된 계약의 종료일을 사용합니다.',SERVICE_ACCOUNTING_PERMISSION_REQUIRED:'세금계산서와 입금 확인에는 회계 수정 권한이 필요합니다.',SERVICE_INVOICE_DATE_LOCKED:'이미 기록한 날짜는 이 화면에서 변경할 수 없습니다.',SERVICE_INVOICE_ACCOUNTED_CANCEL_REVIEW:'회계에 연동된 청구서입니다. 수정세금계산서와 회계 취소 처리를 먼저 확인해 주세요.',SERVICE_LEGACY_PAYMENT_RECONCILE:'기존 입금 확인 건은 먼저 회계 기록과 대조해 주세요.',SERVICE_ACCOUNT_SETUP_REQUIRED:'이용료 계정과목 설정을 확인해 주세요.'});
 async function call(action,payload={},id=null){const {data,error}=await db.rpc('erp_village_billing',{p_action:action,p_id:id,p_payload:{...payload,coop_id:co||null}});if(error)throw error;return data;}
 function status(text,bad=false){$('billingStatus').textContent=text;$('billingStatus').className='alert alert-'+(bad?'danger':'info');}
 async function run(fn){if(pending)return;pending=true;const buttons=[...$('billingWorkspace').querySelectorAll('button,input,select')];const disabled=buttons.map(x=>x.disabled);buttons.forEach(x=>x.disabled=true);try{await fn();}catch(e){status(e?.code==='55000'?'마감된 회계기간에는 전표를 기록할 수 없습니다. 회계 마감 상태를 확인해 주세요.':Object.entries(errors).find(([k])=>String(e?.message||'').includes(k))?.[1]||'처리하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인해 주세요.',true);}finally{pending=false;buttons.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i];});if($('invoiceIncludeContract'))$('invoiceIncludeContract').disabled=!contractInfo.signed;}}
 function feeValues(){return JSON.stringify({annual:$('villageAnnualFee')?.value,start:$('villagePeriodStart')?.value,end:$('villagePeriodEnd')?.value,payment:$('villagePaymentInfo')?.value});}
 function dirty(){return ctx?.provider&&feeBaseline&&feeValues()!==feeBaseline;}
 function render(){
  $('billingWorkspace').innerHTML=`<div id="billingStatus" role="status" class="alert alert-info">청구 정보를 불러오는 중입니다.</div>
   ${ctx.provider?'<section class="card card-body mb-3"><h2 class="h5">새 마을 등록 알림</h2><div id="villageNotices"></div></section>':''}
   <section class="card card-body mb-3"><div class="service-toolbar justify-content-between"><h2 class="h5 mb-0">이용요금·입금 안내</h2><button type="button" id="reloadBilling" class="btn btn-outline-secondary">새로 불러오기</button></div>
   ${ctx.provider?'<label for="billingCoop" class="form-label mt-3">운영 조합</label><select id="billingCoop" class="form-select"></select>':''}
   <form id="villageFeeForm" class="mt-3"><div class="service-field-grid">
   <div><label for="villageAnnualFee" class="form-label">마을당 연간 이용료 · 부가세 별도</label><input id="villageAnnualFee" type="number" class="form-control" min="0" max="100000000" step="1" required></div>
   <div><label for="villagePeriodStart" class="form-label">요금 적용 시작일</label><input id="villagePeriodStart" type="date" class="form-control" required></div>
   <div><label for="villagePeriodEnd" class="form-label">요금 적용 종료일</label><input id="villagePeriodEnd" type="date" class="form-control" required></div><div><label for="villagePaymentInfo" class="form-label">청구서 입금 안내 · 은행·계좌번호·예금주</label><input id="villagePaymentInfo" class="form-control" minlength="5" maxlength="500" required></div></div>
   <p id="villageFeeStatus" class="mt-3"></p>${ctx.provider?'<label class="form-check mt-3"><input id="feeAgreed" type="checkbox" class="form-check-input" required><span class="form-check-label">해당 조합과 합의한 요금·기간입니다.</span></label><button class="btn btn-primary mt-3" type="submit">요금 저장</button>':''}</form></section>
   ${ctx.provider?'<section class="card card-body mb-3"><h2 class="h5">청구서 만들기</h2><form id="invoiceForm"><p id="invoiceContractStatus"></p><label class="form-check mb-3"><input id="invoiceIncludeContract" type="checkbox" class="form-check-input"><span class="form-check-label">계약의 연간 이용료 포함</span></label><div class="service-field-grid"><div><label for="invoiceStart" class="form-label">청구 시작일</label><input type="date" id="invoiceStart" class="form-control" required></div><div><label for="invoiceEnd" class="form-label">청구 종료일</label><input type="date" id="invoiceEnd" class="form-control" required></div><div><label for="invoiceDue" class="form-label">납부 기한</label><input type="date" id="invoiceDue" class="form-control" required></div></div><fieldset class="mt-3"><legend class="h6">청구할 마을</legend><div id="invoiceVillages" class="service-checkboxes"></div></fieldset><button type="submit" class="btn btn-outline-primary mt-3">금액 계산·미리보기</button></form><div id="invoicePreview" class="mt-3"></div></section>':''}
   <section class="card card-body"><h2 class="h5">발행한 청구서</h2><div id="invoiceList"></div><div id="invoiceDetail" class="mt-3"></div></section>`;
  if(ctx.provider){for(const c of ctx.coops){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;$('billingCoop').append(o);}$('billingCoop').value=co;
   $('billingCoop').onchange=()=>{const next=$('billingCoop').value;if(dirty()&&!confirm('저장하지 않은 요금 설정을 버리고 다른 조합을 볼까요?')){$('billingCoop').value=co;return;}co=next;run(load);};
   $('villageFeeForm').onsubmit=e=>{e.preventDefault();run(async()=>{await call('save_settings',{annual_supply:Number($('villageAnnualFee').value),period_start:$('villagePeriodStart').value,period_end:$('villagePeriodEnd').value,payment_instructions:$('villagePaymentInfo').value,revision:setting.revision||0,confirmed:$('feeAgreed').checked});await load();status('요금을 저장했습니다. 이미 발행한 청구서 금액은 바뀌지 않습니다.');});};
   $('invoiceForm').onsubmit=e=>{e.preventDefault();run(async()=>{if(dirty())throw Error('VILLAGE_FEE_CHANGED');preview=await call('preview',invoiceInput());$('invoicePreview').innerHTML=invoiceHtml({snapshot:preview,supply:preview.supply,vat:preview.vat,state:'preview'})+'<button type="button" id="issueVillageInvoice" class="btn btn-primary mt-3">이 금액으로 청구서 발행</button>';
    $('issueVillageInvoice').onclick=()=>run(async()=>{if(!preview||!confirm('확인한 금액으로 청구서를 발행할까요?'))return;const issued=await call('issue',{...invoiceInput(),digest:preview.digest});await load();await openInvoice(issued.id);status('청구서를 발행했습니다. 상대 조합의 청구서 탭에서 확인할 수 있습니다.');});
   });};
   $('invoiceForm').oninput=()=>{preview=null;$('invoicePreview').replaceChildren();};
  }else{for(const x of $('villageFeeForm').querySelectorAll('input'))x.disabled=true;}
  $('villageFeeForm').oninput=()=>{preview=null;if($('invoicePreview'))$('invoicePreview').replaceChildren();};
  $('reloadBilling').onclick=()=>{if(!dirty()||confirm('저장하지 않은 설정을 버리고 다시 불러올까요?'))run(load);};
 }
 function invoiceInput(){return {period_start:$('invoiceStart').value,period_end:$('invoiceEnd').value,due_on:$('invoiceDue').value,include_contract:$('invoiceIncludeContract').checked,village_ids:[...$('invoiceVillages').querySelectorAll('input:checked')].map(x=>x.value)};}
 async function notices(){if(!ctx.provider)return;const rows=await call('notices');$('billingTab').textContent='청구서 확인'+(rows.filter(x=>!x.seen_at).length?' · 새 마을 '+rows.filter(x=>!x.seen_at).length:'');
  $('villageNotices').replaceChildren();if(!rows.length){$('villageNotices').textContent='새로 등록된 마을이 없습니다.';return;}
  for(const n of rows){const card=document.createElement('div');card.className='border rounded p-3 mt-2';card.innerHTML=`<strong>${esc(n.village_name)}</strong><p class="mb-2">${esc(n.coop_name)} · ${esc(new Date(n.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><p>${n.fee.configured?'등록 시 마을당 연 '+money(n.fee.annual_supply)+'원 · 부가세 별도':'이용요금 협의 필요'}</p>`;if(!n.seen_at){const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-primary';b.textContent='확인 완료';b.onclick=()=>run(async()=>{await call('notice_seen',{},n.id);await notices();});card.append(b);}$('villageNotices').append(card);}
 }
 async function load(){
  preview=null;selected=null;
  const [s,v,list,info]=await Promise.all([call('settings'),call('villages'),call('list'),call('contract_info')]);setting=s;villages=v;contractInfo=info;
  const contract=ctx.coops?.find(x=>x.id===co);
  $('villageAnnualFee').value=s.configured||s.contract_bound?String(s.annual_supply):'';$('villagePeriodStart').value=s.period_start||contract?.period_start||'';$('villagePeriodEnd').value=s.period_end||contract?.period_end||'';$('villagePaymentInfo').value=s.payment_instructions||'';
  $('villageFeeStatus').textContent=s.contract_bound?'체결된 계약의 요금 · 조건 변경은 변경합의서에서 처리':s.configured?'요금 등록됨 · 중간 추가 마을은 남은 기간 일할 계산':'요금 미등록 · 별도 협의';
  if($('feeAgreed'))$('feeAgreed').checked=false;for(const id of ['villageAnnualFee','villagePeriodStart','villagePeriodEnd'])$(id).readOnly=Boolean(s.contract_bound);feeBaseline=feeValues();
  if(info.signed){$('villagePeriodStart').value=info.period_start;$('villagePeriodEnd').value=info.period_end;$('villagePeriodStart').readOnly=true;$('villagePeriodEnd').readOnly=true;if(info.village_set){$('villageAnnualFee').value=info.village_enabled?String(info.village_annual_supply):'0';$('villageAnnualFee').readOnly=true;}$('villageAnnualFee').parentElement.hidden=Boolean(info.village_set&&!info.village_enabled);feeBaseline=feeValues();}else $('villageAnnualFee').parentElement.hidden=false;
  if(ctx.provider){$('invoiceIncludeContract').checked=Boolean(info.signed);$('invoiceIncludeContract').disabled=!info.signed;$('invoiceContractStatus').textContent=info.signed?'체결된 계약의 연간 이용료: '+money(info.annual_supply)+'원 · 부가세 별도':'체결된 계약 없음';$('invoiceStart').value=info.period_start||s.period_start||contract?.period_start||'';$('invoiceEnd').value=info.period_end||s.period_end||contract?.period_end||'';$('invoiceDue').value='';$('invoicePreview').replaceChildren();$('invoiceVillages').replaceChildren();
   $('invoiceEnd').readOnly=Boolean(info.signed);$('invoiceStart').min=info.period_start||'';$('invoiceStart').max=info.period_end||'';
   for(const v of villages){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=v.id;input.checked=true;input.className='form-check-input me-2';label.append(input,document.createTextNode(v.name+' · 등록 '+v.created_on));$('invoiceVillages').append(label);}if(!villages.length)$('invoiceVillages').textContent='등록된 마을이 없습니다.';
  }
  $('invoiceDetail').replaceChildren();$('invoiceList').replaceChildren();
  if(!list.length)$('invoiceList').textContent='발행한 청구서가 없습니다.';
  for(const i of list){const b=document.createElement('button');b.type='button';b.className='service-contract-link';b.innerHTML=`<strong>${esc(i.number)} · ${money(i.supply+i.vat)}원</strong><span>${esc(i.period_start)} ~ ${esc(i.period_end)} · ${esc(states[i.state])}</span>`;b.onclick=()=>run(()=>openInvoice(i.id));$('invoiceList').append(b);}
  await notices();status('청구 정보를 불러왔습니다.');
 }
 function invoiceHtml(i){const r=i.snapshot;return `<article class="service-document"><h2 class="h4">운영시스템 이용료 청구서</h2>${i.invoice_number?'<p>'+esc(i.invoice_number)+' · '+esc(states[i.state])+'</p>':''}
  <div class="service-parties"><div class="service-party"><strong>공급자</strong><p>${esc(r.provider.name)}<br>${esc(r.provider.business_number)}<br>${esc(r.provider.address)}</p></div><div class="service-party"><strong>청구받는 조합</strong><p>${esc(r.client.name)}<br>${esc(r.client.business_number)}<br>${esc(r.client.address)}</p></div></div>
  <p>이용기간: ${esc(r.period_start)} ~ ${esc(r.period_end)}${i.due_on?'<br>납부 기한: '+esc(i.due_on):''}${i.paid_on?'<br>입금 확인일: '+esc(i.paid_on):''}</p>
  <div class="table-responsive"><table class="table"><colgroup><col style="width:27%"><col style="width:30%"><col style="width:19%"><col style="width:24%"></colgroup><thead><tr><th>이용 항목</th><th>이용기간</th><th>이용 일수</th><th class="text-end">공급가액</th></tr></thead><tbody>${r.lines.map(l=>`<tr><td>${esc(l.name)}</td><td>${Number(l.days)>0?esc(l.start)+'<br>~ '+esc(l.end):'해당 기간 이용 없음'}</td><td>${money(l.days)} / ${money(l.annual_days)}일</td><td class="text-end">${money(l.supply)}원</td></tr>`).join('')}</tbody></table></div>
  <p class="text-end">공급가액 ${money(i.supply)}원<br>부가세 ${money(i.vat)}원<br><strong>합계 ${money(i.supply+i.vat)}원</strong></p>
  <p>입금 안내: ${esc(r.payment_instructions||'')}</p><p>문의: ${esc(r.provider.contact||'')} ${esc(r.provider.phone||'')} ${esc(r.provider.email||'')}</p>
  <p>연간 이용료를 이용 일수로 나누어 계산하고 원 단위로 반올림했습니다. 이 청구서는 세금계산서가 아닙니다.</p></article>`;}
 async function openInvoice(id){selected=await call('get',{},id);const i=selected;$('invoiceDetail').innerHTML=invoiceHtml(i)+'<div class="service-toolbar mt-3"><button type="button" id="printVillageInvoice" class="btn btn-outline-secondary">출력·PDF 저장</button></div>';
  $('printVillageInvoice').onclick=()=>{try{printInvoice(i);}catch{status('인쇄 페이지가 넘칩니다. 담당자에게 확인을 요청해 주세요.',true);}};
  const a=i.accounting||{},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const flags=document.createElement('div');flags.className='service-review mt-3';flags.innerHTML=`<p>세금계산서: ${a.tax_invoice_issued?'발행 확인 · '+esc(a.tax_invoice_on):'발행 미확인'}</p><p>입금: ${i.state==='paid'?'확인 완료 · '+esc(i.paid_on):i.state==='cancelled'?'청구 취소':'확인 전'}</p>${a.payment_linked||a.tax_invoice_issued?'<p class="mb-0">매출 전환 공급가액 '+money(a.recognized_supply)+'원</p>':''}${a.attention?'<p class="text-danger">회계 연동을 확인해 주세요.</p>':''}`;$('invoiceDetail').append(flags);
  if(a.attention&&ctx.provider&&ctx.can_accounting!==false){const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline-primary mt-2';retry.textContent='회계 연동 다시 확인';retry.onclick=()=>run(async()=>{await call('accounting_retry',{},i.id);await openInvoice(i.id);status('회계 연동을 확인했습니다.');});flags.append(retry);}
  if(ctx.provider&&ctx.can_accounting!==false&&i.state!=='cancelled'&&!a.tax_invoice_issued){const tax=document.createElement('form');tax.className='service-toolbar mt-3';tax.innerHTML='<label class="form-check"><input id="invoiceTaxConfirmed" type="checkbox" class="form-check-input" required><span class="form-check-label">세금계산서를 발행했습니다.</span></label><label for="invoiceTaxDate">발행일</label><input type="date" id="invoiceTaxDate" class="form-control w-auto" required max="'+today+'"><button type="submit" class="btn btn-outline-primary">발행 확인 저장</button>';
   tax.onsubmit=e=>{e.preventDefault();const date=$('invoiceTaxDate').value;run(async()=>{await call('tax_invoice',{issued_on:date,confirmed:true},i.id);await openInvoice(i.id);status('세금계산서 발행 확인과 회계 연동을 저장했습니다.');});};$('invoiceDetail').append(tax);}
  if(ctx.provider&&ctx.can_accounting!==false&&i.state==='issued'){
   const form=document.createElement('form');form.className='service-toolbar mt-3';form.innerHTML='<label class="form-check"><input id="invoicePaidConfirmed" type="checkbox" class="form-check-input" required><span class="form-check-label">입금을 확인했습니다.</span></label><label for="invoicePaidDate">실제 입금일</label><input id="invoicePaidDate" type="date" class="form-control w-auto" max="'+today+'" required><button type="submit" class="btn btn-primary">입금 확인</button>'+(!a.tax_invoice_issued?'<button type="button" id="cancelVillageInvoice" class="btn btn-outline-danger">청구서 취소</button>':'');
   form.onsubmit=e=>{e.preventDefault();run(async()=>{if(!confirm('실제 입금을 확인하고 납부 완료로 표시할까요?'))return;await call('paid',{paid_on:$('invoicePaidDate').value},i.id);await load();await openInvoice(i.id);status('입금 완료를 기록했습니다.');});};
   $('invoiceDetail').append(form);if($('cancelVillageInvoice'))$('cancelVillageInvoice').onclick=()=>{const reason=prompt('청구서를 취소하는 사유를 입력해 주세요.');if(reason?.trim())run(async()=>{await call('cancel',{reason},i.id);await load();await openInvoice(i.id);status('청구서를 취소했습니다. 기록은 유지됩니다.');});};
  }
 }
 function printInvoice(i){
  const root=$('printRoot');root.replaceChildren();root.style.cssText='display:block;position:absolute;left:-10000px;top:0';
  const source=document.createElement('div');source.innerHTML=invoiceHtml(i);let content,article;
  const fits=()=>content.scrollHeight<=content.clientHeight;
  const addPage=()=>{const page=document.createElement('section');page.className='service-paper village-invoice-paper';content=document.createElement('div');content.className='service-paper-content';article=document.createElement('article');article.className='service-document';content.append(article);page.append(content);root.append(page);};
  try{addPage();
   for(const node of [...source.firstElementChild.children]){
    if(node.classList.contains('table-responsive')){
     const rows=[...node.querySelectorAll('tbody tr')];let wrapper;
     const addTable=()=>{wrapper=node.cloneNode(true);wrapper.querySelector('tbody').replaceChildren();article.append(wrapper);};addTable();
     for(const row of rows){wrapper.querySelector('tbody').append(row);if(fits())continue;row.remove();if(!wrapper.querySelector('tbody').children.length)wrapper.remove();addPage();const heading=document.createElement('h2');heading.textContent='이용내역 (계속)';article.append(heading);addTable();wrapper.querySelector('tbody').append(row);if(!fits())throw Error('PRINT_OVERFLOW');}
     continue;
    }
    article.append(node);if(fits())continue;node.remove();if(article.children.length)addPage();article.append(node);
    if(fits())continue;if(node.tagName!=='P')throw Error('PRINT_OVERFLOW');node.remove();let text=node.textContent;
    while(text){let lo=1,hi=text.length,fit=0;const p=document.createElement('p');article.append(p);while(lo<=hi){const mid=Math.floor((lo+hi)/2);p.textContent=text.slice(0,mid);if(fits()){fit=mid;lo=mid+1;}else hi=mid-1;}if(!fit)throw Error('PRINT_OVERFLOW');const cut=text.lastIndexOf(' ',fit);if(cut>fit*.7)fit=cut+1;p.textContent=text.slice(0,fit);text=text.slice(fit);if(text)addPage();}
   }
   const pages=[...root.children];pages.forEach((p,n)=>{const footer=document.createElement('footer');footer.textContent=`${i.invoice_number} · ${n+1} / ${pages.length}`;p.append(footer);});
   if([...root.querySelectorAll('.service-paper-content')].some(p=>p.scrollHeight>p.clientHeight))throw Error('PRINT_OVERFLOW');
  }catch(e){root.replaceChildren();root.removeAttribute('style');throw e;}
  root.removeAttribute('style');const old=document.title;document.title='운영시스템_이용료_청구서_'+i.snapshot.client.name+'_'+i.invoice_number;window.print();document.title=old;
 }
 async function init(client){db=client;try{ctx=await call('context');co=ctx.provider?(ctx.coops.find(c=>c.id===ctx.coop_id)?.id||ctx.coops[0]?.id):ctx.coop_id;if(!co)return;render();$('billingTab').hidden=false;
   const toggle=b=>{$('billingWorkspace').hidden=!b;$('contractWorkspace').hidden=b;$('billingTab').className='btn '+(b?'btn-primary':'btn-outline-primary');$('contractTab').className='btn '+(b?'btn-outline-primary':'btn-primary');};$('billingTab').onclick=()=>toggle(true);$('contractTab').onclick=()=>toggle(false);if(new URLSearchParams(location.search).get('view')==='billing')toggle(true);await run(load);
  }catch{/* Billing access failures must not block contracts or data return. */}}
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 window.VillageBilling={init,printInvoice,invoiceHtml};
})();
