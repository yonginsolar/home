/* Hwaseong dividend presentation. Existing authorization and action handlers remain in charge. */
(() => {
 'use strict';
 const hwaseong='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028',root=document.getElementById('tab-funds-manage');
 if(!root)return;
 const el=id=>document.getElementById(id),manage=el('sub-tab-dividend-batches'),payment=el('sub-tab-dividend-exports');
 if(!manage||!payment)return;
 const calcStates=new Set(['DRAFT','CALCULATED','REVIEW_READY','REVISION_REQUIRED']);
 const reviewStates=new Set(['CALCULATED','REVIEW_READY','REVISION_REQUIRED']);
 const finalized=new Set(['FINALIZED','PAYMENT_READY','PARTIALLY_PAID','PAID']);
 const statusNames={DRAFT:'작성 중',CALCULATED:'계산 완료',REVIEW_READY:'검토 대기',REVISION_REQUIRED:'수정 필요',
  GENERAL_MEETING_APPROVED:'총회 승인 기록됨',FINALIZED:'회차 확정',PAYMENT_READY:'지급 준비',PARTIALLY_PAID:'일부 지급',PAID:'지급 완료',CANCELED:'취소'};
 const relevantFields=new Set(['dividendBatchMinutesDocId','dividendBatchMeetingDate','dividendBatchAgenda','dividendBatchPaymentDueDate','dividendBatchFiscalYear','dividendBatchTitle',
  'dividendBatchPeriodStart','dividendBatchPeriodEnd','dividendBatchCapitalStart','dividendBatchCapitalEnd','dividendBatchUsageStart','dividendBatchUsageEnd','dividendBatchCapitalRate','dividendBatchIncomeTaxRate','dividendBatchLocalTaxRate']);
 const value=id=>el(id)?.value.trim()||'';
 const setText=(n,t)=>{if(n&&n.textContent!==t)n.textContent=t;};
 const visible=(n,shown)=>{if(n&&n.hidden===shown)n.hidden=!shown;};
 const actor=()=>typeof adminCertificateAuthId==='string'?adminCertificateAuthId:'';
 const runtime=()=>typeof g_adminMemberRuntime==='object'?g_adminMemberRuntime:null;
 const allowed=()=>!!actor()&&runtime()?.coop_id===hwaseong&&typeof canUseAdminMemberDividends==='function'&&canUseAdminMemberDividends()&&!window.frameElement?.hidden;
 const inPane=pane=>allowed()&&root.classList.contains('active')&&pane.classList.contains('active');
 const selectedBatch=()=>typeof getDividendManageSelectedBatch==='function'?getDividendManageSelectedBatch():null;
 const exportBatch=()=>typeof getDividendExportSelectedBatch==='function'?getDividendExportSelectedBatch():null;
 const selectedRun=()=>typeof getDividendSelectedPaymentRun==='function'?getDividendSelectedPaymentRun():null;
 const selectedRow=()=>el('dividendBatchManageBody')?.querySelector('tr.table-primary');
 const node=(tag,classes,text,id)=>{const n=document.createElement(tag);if(classes)n.className=classes;if(text)n.textContent=text;if(id)n.id=id;return n;};
 const button=(label,classes)=>{const n=node('button','btn btn-sm '+classes,label);n.type='button';return n;};
 const texts=new Map(),inserts=[],folds=new Map(),reviewed=new Map(),marks=[],originalDisabled=new Map();
 let ui=null,queued=false,owner='';
 function label(n,t){
  if(!n||n.textContent===t)return;
  const prior=texts.get(n);
  texts.set(n,{was:prior&&n.textContent===prior.now?prior.was:n.innerHTML,now:t});setText(n,t);
 }
 function removeDecoration(){
  for(const [row,{details,moves}] of folds){
   if(!row.isConnected)continue;
   for(const [mark,control] of moves)mark.replaceWith(control);
   details.remove();
  }
  folds.clear();
  for(const [n,t] of texts)if(n.isConnected&&n.textContent===t.now)n.innerHTML=t.was;
  texts.clear();
  for(const [n,k] of marks)n.removeAttribute(k);
  marks.length=0;
  for(const [n,prior] of originalDisabled){
   if(n.disabled!==prior.disabled)n.disabled=prior.disabled;
   if(prior.description===null)n.removeAttribute('aria-describedby');else n.setAttribute('aria-describedby',prior.description);
  }
  originalDisabled.clear();
  if(ui?.createCard&&ui.createFold?.isConnected)ui.createFold.before(ui.createCard);
  for(const n of inserts)n.remove();
  inserts.length=0;ui=null;delete root.dataset.hwDividendGuide;reviewed.clear();owner='';
 }
 function band(title,description){
  const block=node('section','hw-dividend-boundary');
  block.append(node('h6','fw-bold mb-1',title),node('p','small mb-0 text-muted',description));
  return block;
 }
 function put(n,before){if(before){before.before(n);inserts.push(n);}}
 function mark(n,attr){if(n){n.setAttribute(attr,'');marks.push([n,attr]);}}
 function install(){
  root.dataset.hwDividendGuide='';
  const next=node('section','hw-dividend-next border rounded p-3 mb-3');
  next.setAttribute('aria-labelledby','hw-dividend-next-heading');
  const text=node('div','hw-dividend-next-text');
  text.append(node('div','small text-muted','다음 할 일'));
  const title=node('h6','fw-bold mb-1','','hw-dividend-next-heading'),detail=node('p','small text-muted mb-0');
  text.append(title,detail);
  const actions=node('div','hw-dividend-next-actions');
  const primary=button('','btn-primary');primary.id='hw-dividend-next-button';
  const fieldJump=button('입력칸으로 이동','btn-outline-secondary');fieldJump.id='hw-dividend-next-field';
  const reason=node('p','small text-muted mb-0 hw-dividend-reason','','hw-dividend-next-reason');reason.setAttribute('role','status');
  primary.setAttribute('aria-describedby',reason.id);
  actions.append(primary,fieldJump,reason);next.append(text,actions);
  const manageRow=manage.firstElementChild;
  put(next,manageRow);
  const createCard=el('dividendBatchCreateHeading')?.closest('.bg-white');
  const createFold=node('details','hw-dividend-create-fold mb-3');
  createFold.append(node('summary','fw-semibold small p-2','새 회차 입력'));
  if(createCard){put(createFold,createCard);createFold.append(createCard);}
  const list=button('회차 목록','btn-outline-secondary');list.id='hw-dividend-list-jump';put(list,el('dividendManageReadStatus'));
  list.onclick=()=>{if(inPane(manage))focusHeading(el('dividendManageListHeading'));};
  const approval=band('총회 승인 기록','총회에서 의결한 내용을 기록합니다. 회차 확정은 별도입니다.');
  approval.classList.add('col-12');put(approval,el('dividendBatchMinutesDocId')?.closest('.col-md-12'));
  const approveButton=el('dividendBatchApproveButton'),finalizeButton=el('dividendBatchFinalizeButton');
  const approvalCell=approveButton?.parentElement;
  const finalCell=el('dividendBatchPaymentDueDate')?.closest('.col-md-6');
  const confirm=band('회차 확정','조합원에게 배당을 공개하고 확정 안내를 처리합니다. 은행 이체와 전표 반영은 별도입니다.');
  confirm.classList.add('col-12');put(confirm,finalCell);
  mark(approvalCell,'data-hw-approve-cell');mark(finalCell,'data-hw-final-cell');
  const approveHint=node('p','small text-muted mb-0 mt-2','','hw-dividend-approve-hint');
  const finalizeHint=node('p','small text-muted mb-0 mt-2','','hw-dividend-finalize-hint');
  put(approveHint,approveButton);put(finalizeHint,el('dividendBatchAccountDeadlinePreview'));
  for(const b of [approveButton,finalizeButton])if(b)originalDisabled.set(b,{disabled:b.disabled,description:b.getAttribute('aria-describedby')});
  const payNav=node('div','hw-dividend-pay-nav mb-3');
  const back=button('← 회차 관리로','btn-outline-secondary');back.id='hw-dividend-back-button';
  back.onclick=()=>{if(inPane(payment))navigate(el('funds-dividend-batches-tab'));};
  payNav.append(back);put(payNav,payment.firstElementChild);
  const fileBox=el('dividendPaymentFileButton')?.closest('.bg-white');
  const prepare=band('은행 이체 파일 준비','파일을 내려받아 은행에서 직접 이체합니다. 파일 생성만으로 지급되지 않습니다.');
  put(prepare,fileBox?.firstElementChild);
  const accrual=band('회계 전표 반영','배당금 지출결의가 완료되면 회계관리 → 전자결재 연동에서 전표를 반영하세요. 이체 파일 준비 전에 필요한 단계입니다.');
  put(accrual,fileBox);
  const payHint=node('p','small text-muted mb-2','','hw-dividend-payment-hint');payHint.setAttribute('role','status');
  const payDesc=node('p','small text-muted mb-2','은행에서 실제 이체한 뒤 이 화면에 결과를 기록하세요.');
  put(payDesc,el('dividendPaymentRunMeta'));put(payHint,el('dividendPaymentConfirmButton'));
  for(const id of ['dividendPaymentFileButton','dividendPaymentConfirmButton','dividendPaymentCancelButton']){
   mark(el(id),'data-hw-secondary');
  }
  const fileReason=node('p','small text-muted mb-0','','hw-dividend-file-hint');fileReason.setAttribute('role','status');put(fileReason,el('dividendPaymentFileButton'));
  ui={title,detail,primary,fieldJump,reason,approveHint,finalizeHint,payHint,fileReason,createCard,createFold,createHasSelection:null};
  primary.onclick=event=>{if(event.detail<=1&&inPane(manage)){const m=model();if(m.action&&!m.reason)m.action();}};
  fieldJump.onclick=()=>{if(inPane(manage)){const m=model(),field=el(m.field);if(field)revealCreateField(field);if(field)focusField(field);}};
 }
 function focusHeading(n){
  if(!n)return;
  const had=n.hasAttribute('tabindex');
  if(!had){n.tabIndex=-1;n.addEventListener('blur',()=>n.removeAttribute('tabindex'),{once:true});}
  n.focus({preventScroll:true});n.scrollIntoView?.({block:'start',inline:'nearest'});
 }
 function focusField(n){if(!n||n.disabled)return;n.focus({preventScroll:true});n.scrollIntoView?.({block:'nearest',inline:'nearest'});}
 function navigate(tab){
  if(!visibleAction(tab))return;
  // Let Bootstrap and the original tab handlers select/load just as before.
  // Focus the tab itself, not a control in a delayed (possibly different) result.
  tab.focus({preventScroll:true});tab.click();
 }
 function rowTools(row){
  return {capital:row?.querySelector('button[onclick^="runDividendCapitalCalculation"]'),usage:row?.querySelector('button[onclick^="runDividendUsageCalculation"]'),
   summary:row?.querySelector('.hw-dividend-row-calculations summary')};
 }
 function decorateRows(){
  for(const row of folds.keys())if(!row.isConnected)folds.delete(row);
  // The original render keeps the same actions and disabled state for each row.
  for(const row of el('dividendBatchManageBody')?.querySelectorAll('tr')||[]){
   if(folds.has(row))continue;
   const {capital,usage}=rowTools(row),group=capital?.parentNode;
   if(!capital||!usage||!group)continue;
   label(row.querySelector('button[onclick^="selectDividendManageBatch"]'),'회차 보기');
   label(capital,'출자 기준 배당금 계산');label(usage,'이용실적 배당금 계산');
   const details=node('details','hw-dividend-row-calculations'),summary=node('summary','small','계산 도구');
   const actions=node('div','d-flex flex-wrap justify-content-center gap-1 mt-1');
   if(capital.disabled&&usage.disabled)summary.textContent='계산 도구 (사용 불가)';
   const moves=[capital,usage].map(control=>{const mark=document.createComment('계산 버튼 원래 위치');control.before(mark);return [mark,control];});
   details.append(summary,actions);group.append(details);actions.append(capital,usage);
   if(capital.disabled&&usage.disabled)details.append(node('p','text-muted small mb-0','현재 상태에서는 다시 계산할 수 없습니다.'));
   folds.set(row,{details,moves});
  }
  for(const n of [...texts.keys()])if(!n.isConnected)texts.delete(n);
 }
 function revealCreateField(field){if(ui.createCard?.contains(field))ui.createFold.open=true;}
 function visibleAction(n){return !!n&&!n.disabled&&!n.hidden&&n.getAttribute('aria-disabled')!=='true'&&!n.closest('.hidden,[hidden]');}
 function availableCalculation(n){return !!n&&!n.disabled&&!n.hidden;}
 function existing(n){return ()=>{if(visibleAction(n))n.click();};}
 function batchKey(batch){return [batch.status,batch.updated_at,batch.item_count,batch.total_gross_amount,batch.item_gross_total].join('|');}
 function showResults(batch){
  if(!inPane(manage)||selectedBatch()?.id!==batch.id)return;
  reviewed.set(String(batch.id),batchKey(batch));render();
  focusHeading(el('dividendBatchResultsHeading'));
 }
 function missingCreateField(){
  const year='dividendBatchFiscalYear',num=Number(value(year));
  if(!Number.isInteger(num)||num<2000||num>2100)return [year,'회계연도를 확인해 주세요.'];
  if(!value('dividendBatchTitle'))return ['dividendBatchTitle','회차명을 입력해 주세요.'];
  for(const [key,label] of [['Period','결산 기간'],['Capital','출자금 기준 기간'],['Usage','이용실적 기준 기간']]){
   const from='dividendBatch'+key+'Start',to='dividendBatch'+key+'End';
   if(!value(from)||!value(to)||value(to)<value(from))return [value(from)?to:from,label+'을 확인해 주세요.'];
  }
  for(const [field,label,maximum] of [['dividendBatchCapitalRate','배당 요율',10],['dividendBatchIncomeTaxRate','소득세율',Infinity],['dividendBatchLocalTaxRate','지방소득세율',Infinity]]){
   const raw=value(field),n=Number(raw);if(!raw||!Number.isFinite(n)||n<0||n>maximum)return [field,label+'을 확인해 주세요.'];
  }
  return [];
 }
 function stageAvailability(batch){
  const state=batch?.status;
  let approve='',finalize='';
  if(!batch){approve=finalize='회차를 선택해 주세요.';}
  else{
   if(!reviewStates.has(state)&&state!=='GENERAL_MEETING_APPROVED')approve=state==='DRAFT'?'배당금 계산을 먼저 해 주세요.':'이 상태에서는 총회 승인 기록을 바꿀 수 없습니다.';
   if(!['GENERAL_MEETING_APPROVED','FINALIZED','PAYMENT_READY'].includes(state))finalize=['PARTIALLY_PAID','PAID'].includes(state)?'지급이 진행된 회차는 지급예정일을 바꿀 수 없습니다.':state==='CANCELED'?'취소된 회차는 확정할 수 없습니다.':'총회 승인부터 기록해 주세요.';
  }
  for(const [id,note,message] of [['dividendBatchApproveButton',ui.approveHint,approve],['dividendBatchFinalizeButton',ui.finalizeHint,finalize]]){
   const b=el(id);
   if(b){
    const prior=originalDisabled.get(b),disabled=!!message||prior?.disabled===true;
    if(b.disabled!==disabled)b.disabled=disabled;
    const description=message?[prior?.description,note.id].filter(Boolean).join(' '):prior?.description;
    if(!description)b.removeAttribute('aria-describedby');else if(b.getAttribute('aria-describedby')!==description)b.setAttribute('aria-describedby',description);
   }
   visible(note,!!message);setText(note,message);
  }
 }
 function model(){
  const batch=selectedBatch(),create=el('dividendBatchCreateButton'),created=el('dividendCreateStatus')?.textContent||'',list=el('dividendManageReadStatus');
  if(create&&(create.textContent.trim()==='등록 결과 확인'||create.textContent.trim()==='회차 등록 결과 확인')&&!created.startsWith('회차를 등록했습니다')){
   return {title:'회차 등록 결과 확인',detail:'이전 등록 결과를 확인한 뒤 다음으로 진행하세요.',label:'등록 결과 확인',action:existing(create),reason:create.disabled?'회차 등록을 처리 중입니다.':''};
  }
  if(!batch){
   const retry=list?.querySelector('button');
   if(retry)return {title:'회차 목록 확인',detail:'이전 목록을 불러오지 못했습니다.',label:'목록 다시 확인',action:existing(retry)};
   if(!list?.textContent.trim())return {title:'회차 목록 확인',detail:'등록된 회차를 확인하는 중입니다.'};
   const [field,reason]=missingCreateField();
   return {title:'회차 만들기',detail:'회계연도와 배당 기준을 입력해 새 회차를 만드세요.',label:'회차 만들기',action:()=>{if(ui.createFold.open)existing(create)();else {revealCreateField(create);focusField(el('dividendBatchFiscalYear'));}},field,
    reason:create?.disabled?'회차 등록을 처리 중입니다.':reason};
  }
  const state=batch.status;
  if(calcStates.has(state)){
   const noRows=Number(batch.item_count)===0;
   if(state==='DRAFT'||noRows){
    const tools=rowTools(selectedRow());
    if(availableCalculation(tools.capital)&&Number(batch.capital_dividend_pool)>0)return {
     title:'배당금 계산',detail:'출자금 기준 배당금을 계산합니다. 이용실적 배당은 회차의 계산 도구에서 별도로 계산합니다.',
     label:'출자 기준 배당금 계산',action:existing(tools.capital)};
    return {title:'배당금 계산',detail:'해당 회차의 계산 도구에서 계산할 배당을 선택하세요.',label:'계산 도구 열기',
     action:()=>{if(tools.summary){tools.summary.parentElement.open=true;focusHeading(tools.summary);}},reason:tools.summary?'':'회차 목록이 준비되면 계산할 수 있습니다.'};
   }
   if(reviewed.get(String(batch.id))!==batchKey(batch))return {title:'계산 결과 검토',detail:'조합원별 배당금과 세전·세후 합계를 확인하세요.',
    label:'계산 결과 보기',action:()=>showResults(batch)};
   const approval=el('dividendBatchApproveButton');
   const missing=[['dividendBatchMinutesDocId','총회 의사록을 선택해 주세요.'],['dividendBatchMeetingDate','총회일을 입력해 주세요.'],['dividendBatchAgenda','안건명을 입력해 주세요.']].find(([id])=>!value(id));
   return {title:'총회 승인 기록',detail:'의결된 내용을 기록합니다. 조합원 공개는 회차 확정에서 진행합니다.',
    label:'총회 승인 기록',action:existing(approval),field:missing?.[0],reason:missing?.[1]||(!visibleAction(approval)?'총회 승인 기록을 진행할 수 없습니다.':'')};
  }
  if(state==='GENERAL_MEETING_APPROVED'){
   const due=el('dividendBatchFinalizeButton'),missing=!value('dividendBatchPaymentDueDate');
   return {title:'회차 확정',detail:'확정하면 조합원에게 공개됩니다. 실제 지급이나 회계 전표 반영은 하지 않습니다.',
    label:'회차 확정',action:existing(due),field:missing?'dividendBatchPaymentDueDate':null,
    reason:missing?'지급예정일을 입력해 주세요.':!visibleAction(due)?'회차 확정을 진행할 수 없습니다.':''};
  }
  if(finalized.has(state)){
   const tab=el('funds-dividend-exports-tab');
   return {title:state==='PAID'?'지급 완료':state==='PARTIALLY_PAID'?'일부 지급 완료':'회차 확정 완료',
    detail:'지급·세무 화면에서 같은 회차의 지급 준비와 결과를 확인하세요.',
    label:state==='PAID'?'지급 결과 보러 가기':'지급·세무 화면으로',action:()=>navigate(tab),
    reason:visibleAction(tab)?'':'지급 화면에 접근할 수 없습니다.'};
  }
  return {title:'회차 상태 확인',detail:state==='CANCELED'?'취소된 회차는 계산하거나 확정할 수 없습니다.':'현재 상태에서 진행할 다음 처리가 없습니다.'};
 }
 function renderPayment(){
  const batch=exportBatch(),run=selectedRun(),ready=window.DividendWorkflow?.paymentCurrent?.()===true;
  label(el('dividendPaymentFileButton'),'은행 이체 파일 만들기');
  label(el('dividendPaymentRunPanel')?.querySelector('h6'),'은행 이체 결과');
  label(el('dividendPaymentConfirmButton'),'은행 이체 결과 기록');
  label(el('dividendPaymentCancelButton'),'이체 파일 취소');
  let file='',pay='';
  if(!batch){file='확정 회차를 선택해 주세요.';pay='';}
  else if(run?.status==='EXPORTED'){
   file='이미 만든 이체 파일이 있습니다.';
   if(!ready)pay='지급 내역을 먼저 확인해 주세요.';
   else if(Number(run.item_count)<=0)pay='결과를 기록할 이체 항목이 없습니다.';
  }else if(batch.status==='PAID')file='지급을 마친 회차입니다.';
  else if(!run&&ready)pay='은행 이체 파일을 먼저 만들어 주세요.';
  else if(!ready)pay='지급 내역을 먼저 확인해 주세요.';
  else if(run)pay='지급 결과를 기록할 수 있는 이체 파일이 없습니다.';
  setText(ui.fileReason,file);visible(ui.fileReason,!!file);setText(ui.payHint,pay);visible(ui.payHint,!!pay);
 }
 function render(){
  if(!allowed()){
   if(ui)removeDecoration();
   return;
  }
  const newOwner=actor()+'|'+runtime().coop_id;
  if(owner!==newOwner){reviewed.clear();owner=newOwner;}
  if(!ui)install();
  label(el('funds-dividend-batches-tab'),'회차·계산·확정');
  label(el('funds-dividend-exports-tab'),'지급·세무 파일');
  label(el('dividendBatchCreateHeading'),'새 회차 만들기');
  const create=el('dividendBatchCreateButton');
  if(create?.textContent.trim()==='배당 회차 생성')label(create,'회차 만들기');
  label(el('dividendBatchApproveButton'),'총회 승인 기록');
  label(el('dividendBatchFinalizeButton'),finalized.has(selectedBatch()?.status)?'지급예정일 다시 확정':'회차 확정');
  label(el('dividendArchivedDetails')?.querySelector('summary'),'삭제한 회차 복구');
  const status=selectedBatch()?.status;
  if(ui.createCard){
   const hasSelection=Boolean(selectedBatch());
   if(ui.createHasSelection!==hasSelection){
    ui.createHasSelection=hasSelection;
    if(!hasSelection)ui.createFold.open=true;
    else if(!ui.createCard.contains(document.activeElement))ui.createFold.open=false;
   }
  }
  if(statusNames[status])label(el('dividendBatchSelectedStatus'),statusNames[status]);
  const payout=exportBatch()?.status;
  if(statusNames[payout])label(el('dividendExportSelectedStatus'),statusNames[payout]);
  decorateRows();
  stageAvailability(selectedBatch());
  const m=model(),title=ui.title,detail=ui.detail,primary=ui.primary,fieldJump=ui.fieldJump,reason=ui.reason;
  setText(title,m.title);setText(detail,m.detail);
  visible(primary,!!m.label);setText(primary,m.label||'');
  const disabled=String(!!m.reason);
  if(primary.getAttribute('aria-disabled')!==disabled)primary.setAttribute('aria-disabled',disabled);
  visible(fieldJump,!!m.field);setText(reason,m.reason||'');visible(reason,!!m.reason);
  renderPayment();
 }
 const css=node('style');
 css.textContent=`
  [data-hw-dividend-guide] .hw-dividend-next{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;background:var(--bs-primary-bg-subtle,#eaf4ff)}
  [data-hw-dividend-guide] .hw-dividend-next-text{min-width:0}
  [data-hw-dividend-guide] .hw-dividend-next-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:flex-start}
  [data-hw-dividend-guide] .hw-dividend-reason{width:100%;text-align:right}
  [data-hw-dividend-guide] .hw-dividend-boundary{border-inline-start:3px solid var(--bs-border-color,#d2dae1);padding:8px 10px;margin-block:6px 10px;min-width:0}
  [data-hw-dividend-guide] .hw-dividend-create-fold>summary{border:1px solid var(--bs-border-color,#d2dae1);border-radius:6px;cursor:pointer}
  [data-hw-dividend-guide] [data-hw-approve-cell],[data-hw-dividend-guide] [data-hw-final-cell]{width:100%}
  [data-hw-dividend-guide] :is(#dividendBatchCreateButton,#dividendBatchFinalizeButton,[data-hw-secondary]){--bs-btn-color:var(--bs-body-color,#243747);--bs-btn-bg:transparent;--bs-btn-border-color:var(--bs-border-color,#9cadb7);--bs-btn-hover-color:var(--bs-body-color,#243747);--bs-btn-hover-bg:var(--bs-secondary-bg,#edf2f6)}
  [data-hw-dividend-guide] .hw-dividend-next [aria-disabled="true"]{opacity:.6;cursor:not-allowed}
  [data-hw-dividend-guide] .hw-dividend-next :is(button,p),[data-hw-dividend-guide] .hw-dividend-row-calculations button{white-space:normal;overflow-wrap:anywhere}
  [data-hw-dividend-guide] [id^="hw-dividend-"][hidden]{display:none!important}
  [data-hw-dividend-guide] :is(#dividendManageListHeading,#dividendBatchResultsHeading){scroll-margin-top:12px}
  [data-hw-dividend-guide] :is(#dividendManageListHeading,#dividendBatchResultsHeading):focus-visible{outline:2px solid var(--bs-primary,#0d6efd);outline-offset:3px}
  @media(max-width:767px){[data-hw-dividend-guide] .hw-dividend-next{flex-direction:column}
   [data-hw-dividend-guide] .hw-dividend-next-actions{width:100%;justify-content:flex-start}
   [data-hw-dividend-guide] .hw-dividend-reason{text-align:start}}
 `;
 document.head.append(css);
 const plan=()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;render();});}};
 new MutationObserver(plan).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','disabled','hidden']});
 if(window.frameElement)new MutationObserver(plan).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
 for(const event of ['input','change'])root.addEventListener(event,e=>{if(relevantFields.has(e.target.id))render();});
 document.addEventListener('shown.bs.tab',plan);window.addEventListener('pageshow',plan);
 plan();
})();
