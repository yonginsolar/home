/* v1.3.0 — Keep reread in one modal; preview original pages without changing the attachment. */
(function(root){'use strict';
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const wonFields=new Set(['insuranceHealth','insuranceCare','insurancePension','insuranceDurunuriPension','insurancePensionOffsetReceipts','insuranceEmployment','insuranceEmploymentStability','insuranceDurunuriEmployment','insuranceDurunuriStability','insuranceIndustrial']);
 function previewAttachment(stage,{file,name,kind,current,signal,passwordFor=()=>'',fallback}){
  const help=make('p','small mb-2',kind==='source'?'원본 미리보기 · 결재에는 선택한 합산표 한 쪽만 첨부됩니다.':
   kind==='summary'?'합산표 한 쪽만 남아 있어 전체 원본을 볼 수 없습니다.':'첨부된 PDF의 모든 쪽을 볼 수 있습니다.');
  const navigation=make('div','d-flex flex-wrap align-items-center gap-2 mb-2'), select=make('select','form-select form-select-sm w-auto');
  select.setAttribute('aria-label','고지서 미리보기 쪽');
  const step=(label,n)=>{const b=make('button','btn btn-outline-secondary btn-sm',label);b.type='button';b.onclick=()=>{select.value=String(Number(select.value)+n);void render();};return b;};
  const previous=step('이전 쪽',-1),next=step('다음 쪽',1);
  const status=make('p','small text-muted mb-2');status.setAttribute('role','status');
  const controls=make('div','d-flex flex-wrap align-items-center gap-2 mb-2');
  const password=make('input','form-control form-control-sm w-auto');password.type='password';password.maxLength=128;password.autocomplete='off';password.dataset.erpQueryControl='';password.setAttribute('aria-label','PDF 암호');
  const retry=make('button','btn btn-outline-primary btn-sm','다시 열기');retry.type='button';retry.onclick=()=>void load(true);
  const canvas=make('canvas','d-block mx-auto border');canvas.style.cssText='max-width:100%;height:auto';canvas.setAttribute('aria-label','고지서 첨부 바로보기');
  navigation.append(previous,select,next);controls.append(password,retry);select.onchange=()=>void render();
  const live=()=>!signal.aborted&&current();
  let session=null,loading=false,sequence=0,paint=Promise.resolve();
  const destroy=()=>{sequence++;password.value='';canvas.width=canvas.height=1;if(session){void session.destroy();session=null;}};
  signal.addEventListener('abort',destroy,{once:true});
  const show=(el,visible)=>{el.style.setProperty('display',visible?'':'none',visible?'':'important');};
  async function render(){
   const s=session,n=Number(select.value),rev=++sequence;if(!s||!live()||n<1||n>s.pageCount)return;
   previous.disabled=n<=1;next.disabled=n>=s.pageCount;
   if([previous,next].includes(document.activeElement)&&document.activeElement.disabled)select.focus({preventScroll:true});
   show(canvas,false);status.textContent=n+' / '+s.pageCount+'쪽 · 불러오는 중';
   const fresh=()=>live()&&rev===sequence&&s===session;
   paint=paint.catch(()=>{}).then(async()=>{
    if(!fresh())return;
    const scratch=make('canvas');
    try{
     await s.render(scratch,n);if(!fresh())return;
     canvas.width=scratch.width;canvas.height=scratch.height;canvas.getContext('2d').drawImage(scratch,0,0);
     show(canvas,true);status.textContent=n+' / '+s.pageCount+'쪽';
    }catch{if(fresh()){status.textContent='이 쪽을 표시하지 못했습니다. 다시 열거나 다른 쪽을 선택해 주세요.';show(controls,true);}}
    finally{scratch.width=scratch.height=1;}
   });
   await paint;
  }
  async function load(manual=false){
   if(loading||!live())return;
   loading=true;let pass=manual&&password.value?password.value:passwordFor();destroy();
   show(navigation,false);show(controls,false);show(canvas,false);status.textContent='PDF를 불러오는 중입니다.';
   try{
    const pdf=await import('./insurance_notice_pdf.mjs?v=1.1.0');
    if(!live())return;
    const src=file instanceof File?file:new File([file],name?.endsWith('.pdf')?name:'고지서.pdf',{type:'application/pdf'});
    const opened=await pdf.open(src,{password:pass,signal});pass='';
    if(!live()){await opened.destroy();return;}
    session=opened;
    select.replaceChildren(...Array.from({length:opened.pageCount},(_,index)=>{
     const option=make('option','',(index+1)+'쪽');option.value=String(index+1);return option;
    }));
    show(navigation,true);await render();
   }catch(e){if(live()){
    if(kind!=='source'&&['PDF_LIMIT','PDF_PAGES','PDF_TEXT_LIMIT'].includes(e?.message)&&fallback){fallback();return;}
    const locked=e?.message==='PDF_PASSWORD';
    show(password,locked);show(controls,true);
    status.textContent=locked?'PDF 암호를 입력한 뒤 다시 열어 주세요.':'PDF를 표시할 수 없습니다. 다시 열어 주세요.';
   }}finally{pass='';loading=false;}
  }
  if(!live())return;
  const region=make('section','insurance-submit-pages text-start p-2 w-100');region.append(help,navigation,status,controls,canvas);
  stage.replaceChildren(region);void load();
 }

 function create({button,getContext,getFingerprint,apply,hasAttachment=()=>false,onDirty=()=>{}}){
 const drafts=new Map();let modal,title,body,upload,status,fileInput,fileMeta,passLabel,password,readButton,cancelChoice,review,canvas,pageSelect,attachmentPicker,attachmentPageSelect,ackControl,ack,applyButton,previous,next,pageStatus,editorFields,editorFooter,confirmPane,confirmCancel,confirmAccept;
 let current=null,sourceView=null,sourceRetry=false,session=null,controller=null,confirming=null,epoch=0,busy=false,previewing=false,activeTask='',pdfModule=null,baseline='',renderEpoch=0,paint=Promise.resolve(),focusTarget=null,opened=false,showing=false,closing=false,pendingOpen=null;
  const scope=()=>{const c=getContext();return c?.allowed&&c.visible!==false?c.owner+'|'+c.draft:'';};
  const viewAllowed=()=>!sourceView||hasAttachment(sourceView.attachment);
  const live=(s,t)=>s===current&&s.key===scope()&&t===epoch&&opened&&viewAllowed();
  const stop=()=>{epoch++;renderEpoch++;confirming?.abort();confirming=null;controller?.abort();controller=null;void session?.destroy();session=null;busy=false;previewing=false;activeTask='';paint=Promise.resolve();if(password)password.value='';if(canvas){canvas.width=1;canvas.height=1;canvas.hidden=true;}};
  const notice=s=>{status.textContent=s;};
  const otherModal=()=>[...document.querySelectorAll('.modal.show,.modal[aria-modal="true"]')].some(el=>el!==modal&&el.getClientRects().length)
   || !opened&&!!document.querySelector('.modal-backdrop');
  function restoreConfirmationFocus(trigger){
   if(opened&&!closing&&trigger?.isConnected&&!trigger.disabled&&trigger.getClientRects().length)trigger.focus({preventScroll:true});
  }
  function confirmReread(signal){
   const trigger=document.activeElement;
   const dialog=modal.querySelector('.modal-dialog');
   return new Promise(resolve=>{
    const finish=(accepted,restore)=>{
     signal.removeEventListener('abort',abort);
     confirmCancel.onclick=confirmAccept.onclick=null;
     confirmPane.hidden=true;editorFields.hidden=false;editorFooter.classList.remove('d-none');title.textContent='고지서 읽기·원본 확인';
     dialog.classList.remove('modal-dialog-centered');dialog.classList.add('modal-xl');
     if(restore)restoreConfirmationFocus(trigger);resolve(accepted);
    };
    const abort=()=>finish(false,false);
    if(signal.aborted){resolve(false);return;}
    confirmCancel.onclick=()=>finish(false,true);confirmAccept.onclick=()=>finish(true,true);
    signal.addEventListener('abort',abort,{once:true});
    editorFields.hidden=true;editorFooter.classList.add('d-none');confirmPane.hidden=false;
    dialog.classList.remove('modal-xl');dialog.classList.add('modal-dialog-centered');
    title.textContent='고지서 다시 읽기 확인';confirmCancel.focus({preventScroll:true});
   });
  }
  function runPendingOpen(){
   if(!pendingOpen||closing||showing||otherModal())return false;
   const request=pendingOpen;pendingOpen=null;
   return request.key===scope()&&(!request.view||hasAttachment(request.view.attachment))&&openRequest(request);
  }
  function build(){
   modal=make('div','modal fade');modal.id='insuranceNoticeReview';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','insuranceNoticeTitle');modal.style.zIndex='1080';
   const dialog=make('div','modal-dialog modal-xl modal-dialog-scrollable'),content=make('div','modal-content'),head=make('div','modal-header');
   title=make('h2','modal-title fs-5','고지서 읽기·원본 확인');title.id='insuranceNoticeTitle';head.append(title);
   const close=make('button','btn-close');close.type='button';close.dataset.bsDismiss='modal';close.setAttribute('aria-label','닫기');head.append(close);
   body=make('div','modal-body');const fileLabel=make('label','form-label','고지서 PDF (10MB 이하)');fileLabel.htmlFor='insuranceNoticeFile';fileInput=make('input','form-control');fileInput.type='file';fileInput.accept='.pdf,application/pdf';fileInput.id=fileLabel.htmlFor;
   fileInput.onchange=()=>{const f=fileInput.files?.[0];fileInput.value='';if(!f||!current||sourceView||!opened)return;if(current.candidateDirtyBaseline===undefined)current.candidateDirtyBaseline=current.dirty;current.candidate=f;current.dirty=true;current.ack=false;onDirty();void read();};
   fileMeta=make('p','small text-muted mt-2');
   const help=make('p','small text-muted mt-2','원본은 모든 쪽을 볼 수 있습니다. 결재에는 선택한 합산표 한 쪽만 첨부됩니다.');
   passLabel=make('label','form-label small','PDF 암호 (자동으로 열리지 않는 경우)');passLabel.htmlFor='insuranceNoticePassword';password=make('input','form-control');password.id=passLabel.htmlFor;password.type='password';password.autocomplete='off';password.setAttribute('data-erp-query-control','');password.maxLength=128;
   readButton=make('button','btn btn-outline-primary mt-2','다시 읽기');readButton.type='button';readButton.onclick=()=>sourceView?void previewOnly(true):void read(true);
   cancelChoice=make('button','btn btn-outline-secondary mt-2 ms-2','새 파일 선택 취소');cancelChoice.type='button';cancelChoice.onclick=()=>{if(!current||sourceView||!current.candidate)return;stop();current.candidate=null;if(current.candidateDirtyBaseline!==undefined){current.dirty=current.candidateDirtyBaseline;delete current.candidateDirtyBaseline;}fileInput.value='';notice('새 파일 선택을 취소했습니다.');draw();onDirty();if(current.file)void previewOnly();};
   status=make('p','small my-3');status.setAttribute('role','status');const grid=make('div','row g-3');review=make('div','col-md-6');const source=make('div','col-md-6');
   const pl=make('label','form-label','원본 쪽');pl.htmlFor='insuranceNoticePage';pageSelect=make('select','form-select form-select-sm');pageSelect.id=pl.htmlFor;pageSelect.onchange=()=>{syncPages();void renderPage();};
   const step=n=>{pageSelect.value=String(Number(pageSelect.value)+n);syncPages();void renderPage();};
   const navigation=make('div','d-flex flex-wrap align-items-center gap-2 mb-2');
   previous=make('button','btn btn-outline-secondary btn-sm','이전 쪽');previous.type='button';previous.onclick=()=>step(-1);
   next=make('button','btn btn-outline-secondary btn-sm','다음 쪽');next.type='button';next.onclick=()=>step(1);
   pageStatus=make('span','small text-muted');pageStatus.setAttribute('aria-live','polite');navigation.append(previous,next,pageStatus);
   attachmentPicker=make('div');
   const alPage=make('label','form-label mt-3','첨부할 합산표 쪽');alPage.htmlFor='insuranceNoticeAttachmentPage';attachmentPageSelect=make('select','form-select form-select-sm');attachmentPageSelect.id=alPage.htmlFor;
   attachmentPageSelect.onchange=()=>{if(!current||sourceView)return;current.attachmentPage=Number(attachmentPageSelect.value)||null;current.ack=false;current.dirty=true;if(current.attachmentPage){pageSelect.value=attachmentPageSelect.value;void renderPage();}sync();onDirty();};
   attachmentPicker.append(alPage,attachmentPageSelect);
   canvas=make('canvas','w-100 border mt-2');canvas.setAttribute('aria-label','고지서 원본 미리보기');canvas.style.height='auto';canvas.hidden=true;source.append(pl,pageSelect,navigation,attachmentPicker,canvas);grid.append(review,source);
   const footer=make('div','modal-footer');ackControl=make('div','form-check me-auto');ack=make('input','form-check-input');ack.type='checkbox';ack.id='insuranceNoticeAcknowledged';ack.onchange=()=>{if(current&&!sourceView)current.ack=ack.checked;sync();};const al=make('label','form-check-label','원본과 금액·귀속월·첨부할 쪽을 확인했습니다');al.htmlFor=ack.id;ackControl.append(ack,al);
   const dismiss=make('button','btn btn-secondary','닫기');dismiss.type='button';dismiss.dataset.bsDismiss='modal';applyButton=make('button','btn btn-primary','확인한 내용 반영');applyButton.type='button';applyButton.onclick=()=>void commit();footer.append(ackControl,dismiss,applyButton);
   upload=make('div');upload.append(fileLabel,fileInput);
   editorFields=make('div');editorFields.append(upload,fileMeta,help,passLabel,password,readButton,cancelChoice,status,grid);editorFooter=footer;
   confirmPane=make('section');confirmPane.id='insuranceNoticeRereadConfirmation';confirmPane.hidden=true;
   const question=make('p','mb-3','작성한 검토값을 PDF에서 다시 읽을까요?');
   const choices=make('div','d-flex flex-wrap justify-content-end gap-2');
   confirmCancel=make('button','btn btn-outline-secondary','취소');confirmAccept=make('button','btn btn-primary','다시 읽기');
   for(const btn of [confirmCancel,confirmAccept])btn.type='button';
   choices.append(confirmCancel,confirmAccept);confirmPane.append(question,choices);body.append(editorFields,confirmPane);
   modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!confirmPane.hidden){event.stopImmediatePropagation();event.preventDefault();confirmCancel.click();}
   },true);
   content.append(head,body,footer);dialog.append(content);modal.append(dialog);document.body.append(modal);
   modal.addEventListener('hide.bs.modal',()=>{opened=false;closing=true;stop();});
   modal.addEventListener('hidden.bs.modal',()=>{
    closing=false;if(runPendingOpen())return;
    if(scope()===current?.key&&focusTarget?.isConnected&&!focusTarget.closest('[hidden]')&&
      (document.activeElement===document.body||modal.contains(document.activeElement)||document.activeElement===focusTarget))focusTarget.focus({preventScroll:true});
   });
   document.addEventListener('hidden.bs.modal',event=>{if(event.target!==modal)runPendingOpen();});
   modal.addEventListener('shown.bs.modal',()=>{
    showing=false;
    if(!opened||current?.key!==scope()||!viewAllowed()){root.bootstrap.Modal.getInstance(modal)?.hide();return;}
    (sourceView?dismiss:fileInput).focus({preventScroll:true});
    if((sourceView||current?.file)&&!session&&!busy)void previewOnly();
   });
   document.addEventListener('visibilitychange',()=>{
    if(!document.hidden||(!busy&&!confirming&&!previewing))return;const s=current,task=activeTask;stop();
    // Only recover the same still-authorized editor. Obsolete completions remain invalidated.
    if(opened&&s===current&&s?.key===scope()){
     if(sourceView)sourceRetry=true;
     notice(task==='attachment'?'탭 이동으로 첨부 준비를 멈췄습니다. 확인한 내용 반영을 다시 눌러 주세요.':sourceView?'탭 이동으로 원본 확인을 멈췄습니다. 원본 다시 열기를 눌러 주세요.':'탭 이동으로 읽기를 멈췄습니다. 다시 읽기를 눌러 주세요.');sync();
    }
   });
   root.addEventListener('beforeunload',e=>{if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
   // Changing a menu, actor, draft or expense subtype closes the viewer, not its draft.
   const watch=()=>{if(pendingOpen?.key!==scope())pendingOpen=null;if(opened&&(!scope()||current?.key!==scope()||!viewAllowed()))closeViewer();};
   document.addEventListener('input',watch,true);document.addEventListener('change',watch,true);
   new MutationObserver(watch).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden','class']});
   const fileList=document.getElementById('fileListArea');if(fileList)new MutationObserver(watch).observe(fileList,{childList:true});
   if(root.frameElement)new MutationObserver(watch).observe(root.frameElement,{attributes:true,attributeFilter:['hidden','style']});
   root.addEventListener('pagehide',closeViewer);
  }
  function validValues(){if(!current?.result||!current.file||current.candidate||!Number.isInteger(current.attachmentPage)||current.attachmentPage<1||current.attachmentPage>current.pageCount)return false;try{pdfModule.calculate(current.values);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(current.month))return false;for(const[id,,optional]of pdfModule.fields)if(optional&&current.values[id]!==''&&current.values[id]!==undefined&&!/^\d+$/.test(current.values[id]))return false;return true;}catch{return false;}}
  const sourcePageCount=()=>Number(sourceView?.pageCount||current?.pageCount||0);
  function syncPages(){
   const n=Number(pageSelect.value),total=sourcePageCount(),ready=!!session&&viewAllowed();
   const focus=document.activeElement;
   pageSelect.disabled=!ready;previous.disabled=!ready||n<=1;next.disabled=!ready||n>=total;
   if(ready&&((focus===previous&&previous.disabled)||(focus===next&&next.disabled)))pageSelect.focus({preventScroll:true});
   pageStatus.textContent=n&&total?n+' / '+total+'쪽':'';
  }
  function sync(){
   if(!applyButton)return;
   title.textContent=sourceView?'고지서 원본 미리보기':'고지서 읽기·원본 확인';
   upload.hidden=cancelChoice.hidden=attachmentPicker.hidden=ackControl.hidden=applyButton.hidden=review.hidden=!!sourceView;
   passLabel.hidden=password.hidden=readButton.hidden=!!sourceView&&!sourceRetry;
   canvas.parentElement.className=sourceView?'col-12':'col-md-6';
   fileMeta.textContent=sourceView?'원본: '+sourceView.file.name:(current?.file?'원본: '+current.file.name:'')+(current?.candidate?' · 새로 읽을 파일: '+current.candidate.name:'');
   readButton.textContent=sourceView?'원본 다시 열기':'다시 읽기';
   readButton.disabled=busy||!scope()||!viewAllowed()||(sourceView?previewing:!(current?.candidate||current?.file));
   fileInput.disabled=busy;attachmentPageSelect.disabled=busy||!current?.result;ack.disabled=busy||!validValues();
   ack.checked=!!current?.ack;applyButton.disabled=busy||previewing||!!sourceView||!scope()||!current?.ack||!validValues();
   applyButton.textContent=busy?'준비 중…':'확인한 내용 반영';syncPages();
  }
  function fillPageChoices(){
   pageSelect.replaceChildren();attachmentPageSelect.replaceChildren();const empty=make('option','','합산표 쪽을 선택해 주세요');empty.value='';attachmentPageSelect.append(empty);
   for(let n=1;n<=sourcePageCount();n++){for(const select of sourceView?[pageSelect]:[pageSelect,attachmentPageSelect]){const o=make('option','',n+'쪽');o.value=n;select.append(o);}}
   attachmentPageSelect.value=!sourceView&&current?.attachmentPage?String(current.attachmentPage):'';
   pageSelect.value=String(sourceView?1:current?.attachmentPage||current?.result?.sourcePage||1);
  }
  function draw(){
   review.replaceChildren();fillPageChoices();if(sourceView){sync();return;}if(!current?.result){review.append(make('p','text-muted','고지서를 선택하면 읽은 금액을 확인할 수 있습니다.'));sync();return;}
   const s=current;
   for(const w of s.result.warnings)review.append(make('p','small text-warning','⚠ 검토 필요 · '+w));
   const label=make('label','form-label','귀속월'),month=make('input','form-control mb-3');label.htmlFor='insuranceReadMonth';month.id=label.htmlFor;month.type='month';month.value=s.month||'';month.oninput=()=>{s.month=month.value;s.ack=false;s.dirty=true;sync();onDirty();};review.append(label,month);
   for(const[id,name,optional]of pdfModule.fields){const wrap=make('div','mb-2'),l=make('label','form-label small mb-1',name+(optional?' (선택)':''));l.htmlFor='notice_'+id;const n=make('input','form-control form-control-sm text-end');n.id=l.htmlFor;n.inputMode='numeric';n.value=s.values[id]??'';
    const won=wonFields.has(id);if(won){n.dataset.numberGroup='';root.ERPNumberInput?.refresh(n);}
    const hint=make('small',s.result.evidence[id]?'text-muted':'text-warning d-block',s.result.evidence[id]?s.result.evidence[id].page+'쪽 · '+s.result.evidence[id].label:'⚠ 검토 필요 · 원본에서 확인해 입력해 주세요.');
    const updateValue=event=>{s.ack=false;s.dirty=true;if(!won||!event.isComposing){
     s.values[id]=(won&&root.ERPNumberInput?root.ERPNumberInput.raw(n.value):n.value.replace(/,/g,'')).trim();updateTotal();
    }sync();onDirty();};
    n.oninput=updateValue;if(won)n.addEventListener('compositionend',updateValue);wrap.append(l,n,hint);review.append(wrap);}
   const total=make('p','fw-bold mt-3');total.id='insuranceReadTotal';review.append(total);ack.checked=!!s.ack;updateTotal();sync();
  }
  function updateTotal(){const el=review.querySelector('#insuranceReadTotal');if(!el)return;try{const n=pdfModule.calculate(current.values),expected=current.result.totals?.total;el.textContent='결재 반영 금액 '+n.total.toLocaleString('ko-KR')+'원'+(expected!==undefined&&expected!==n.total?' · ⚠ 원본 납부금액과 차이가 있습니다.':'');}catch{el.textContent='⚠ 금액과 차감액을 확인해 주세요.';}}
  async function read(manual=false){
   if(!opened||sourceView||busy||confirming||!scope()||current?.key!==scope())return;
   const s=current,f=s.candidate||s.file;if(!f)return;
   if(s.result&&f===s.file&&s.dirty){
    const gate=new AbortController(),generation=epoch,fp=getFingerprint(),before=JSON.stringify([s.values,s.month,s.attachmentPage]);
    confirming=gate;let yes;
    try{yes=await confirmReread(gate.signal);}
    finally{if(confirming===gate)confirming=null;}
    if(!yes||!live(s,generation)||getFingerprint()!==fp||(s.candidate||s.file)!==f||JSON.stringify([s.values,s.month,s.attachmentPage])!==before)return;
   }
   let pass=manual&&password.value?password.value:String(getContext().businessNumber||'').replace(/\D/g,'');
   stop();const ticket=epoch,fp=getFingerprint();busy=true;activeTask='read';s.ack=false;controller=new AbortController();const ctl=controller;
   notice('PDF를 읽고 있습니다…');sync();
   try{pdfModule=pdfModule||await import('./insurance_notice_pdf.mjs?v=1.1.0');const loaded=await pdfModule.open(f,{password:pass,signal:ctl.signal});pass='';if(!live(s,ticket)||getFingerprint()!==fp){await loaded.destroy();if(live(s,ticket))notice('결재 입력이 바뀌었습니다. 현재 내용을 확인하고 다시 읽어 주세요.');return;}
    session=loaded;s.file=f;s.candidate=null;delete s.candidateDirtyBaseline;s.result=loaded.result;s.values={...loaded.result.values};s.month=loaded.result.billingMonth;s.pageCount=loaded.pageCount;s.attachmentPage=loaded.result.sourcePage;s.prepared=null;s.dirty=true;s.ack=false;
    notice('읽은 내용을 원본과 확인해 주세요.');draw();void renderPage();onDirty();
   }catch(e){if(live(s,ticket)){notice(({PDF_PASSWORD:'등록된 사업자번호로 열리지 않았습니다. PDF 암호를 직접 입력하고 다시 읽기를 눌러 주세요.',PDF_LIMIT:'10MB 이하의 PDF를 선택해 주세요.',PDF_INVALID:'PDF 파일 형식을 확인해 주세요.',PDF_PAGES:'20쪽 이하의 PDF를 선택해 주세요.'})[e.message]||'PDF를 읽지 못했습니다. 파일을 확인하고 다시 시도해 주세요.');}}
   finally{pass='';if(live(s,ticket)){busy=false;activeTask='';sync();}}
  }
  function renderPage(){
   const n=Number(pageSelect.value),active=session,s=current,generation=epoch,ticket=++renderEpoch;
   if(!active||!s||!live(s,generation)||n<1||n>sourcePageCount())return;
   const fresh=()=>ticket===renderEpoch&&live(s,generation)&&active===session;
   canvas.hidden=true;
   paint=paint.catch(()=>{}).then(async()=>{
    if(!fresh())return;
    const page=make('canvas');
    try{await active.render(page,n);if(!fresh())return;canvas.width=page.width;canvas.height=page.height;canvas.getContext('2d').drawImage(page,0,0);canvas.hidden=false;}
    catch{if(fresh()){if(sourceView)sourceRetry=true;notice('원본 쪽을 표시하지 못했습니다. 원본을 다시 열거나 다른 쪽을 선택해 주세요.');sync();}}
    finally{page.width=1;page.height=1;}
   });
  }
  async function previewOnly(manual=false){
   const s=current,f=sourceView?.file||s?.file;
   if(!f||!s||!live(s,epoch)||busy||previewing||confirming)return;
   let pass=manual&&password.value?password.value:String(getContext().businessNumber||'').replace(/\D/g,'');password.value='';
   const ticket=epoch;controller?.abort();void session?.destroy();session=null;
   controller=new AbortController();const ctl=controller;previewing=true;sourceRetry=false;canvas.hidden=true;sync();
   if(sourceView)notice('원본을 불러오는 중입니다…');
   try{
    pdfModule=pdfModule||await import('./insurance_notice_pdf.mjs?v=1.1.0');
    const loaded=await pdfModule.open(f,{password:pass,signal:ctl.signal});pass='';
    if(!live(s,ticket)||busy){await loaded.destroy();return;}
    session=loaded;
    if(sourceView)notice('');
    syncPages();void renderPage();
   }catch{
    if(live(s,ticket)&&!busy){if(sourceView)sourceRetry=true;notice(sourceView?'원본 PDF 암호를 확인하고 원본 다시 열기를 눌러 주세요.':'검토값은 유지했습니다. 원본을 다시 보려면 암호를 입력하고 다시 읽어 주세요.');}
   }finally{pass='';if(live(s,ticket)){previewing=false;sync();}}
  }
  async function commit(){
   if(!opened||sourceView||!scope()||current?.key!==scope()||busy||previewing||confirming||!current.ack||!validValues())return;
   if(getFingerprint()!==baseline){current.ack=false;notice('결재 입력이 바뀌었습니다. 창을 닫고 현재 내용을 확인한 뒤 다시 열어 주세요.');sync();return;}
   const s=current,ticket=epoch,fp=baseline,page=s.attachmentPage,snapshot=JSON.stringify([s.values,s.month,page]),values={...s.values,insuranceBillingMonth:s.month};busy=true;activeTask='attachment';sync();notice('첨부할 한 쪽을 PDF로 준비하고 있습니다…');
   try{
    let file=s.prepared?.page===page?s.prepared.file:null;
    if(!file){
     if(!session){controller?.abort();controller=new AbortController();let pass=password.value||String(getContext().businessNumber||'').replace(/\D/g,'');password.value='';let loaded;try{loaded=await pdfModule.open(s.file,{password:pass,signal:controller.signal});}finally{pass='';}if(!live(s,ticket)){await loaded.destroy();return;}session=loaded;}
     file=await session.createAttachment(page);
    }
    if(!live(s,ticket))return;
    s.prepared={page,file};
    if(getFingerprint()!==fp||!s.ack||JSON.stringify([s.values,s.month,s.attachmentPage])!==snapshot){s.ack=false;notice('입력이 바뀌었습니다. 현재 내용을 다시 확인해 주세요.');return;}
    if(apply(values,file,fp,s.attachedFile)!==true)throw Error('NOT_APPLIED');
    s.attachedFile=file;s.attachedSource={attachment:file,file:s.file,pageCount:s.pageCount};s.dirty=false;s.ack=false;onDirty();root.bootstrap.Modal.getInstance(modal).hide();
   }catch(e){if(live(s,ticket))notice(e.message==='PDF_PASSWORD'?'원본 PDF 암호를 입력한 뒤 확인한 내용 반영을 다시 눌러 주세요.':e.message==='PDF_PRINT_LIMIT'?'첨부용 PDF가 10MB를 넘습니다. 파일을 확인해 주세요.':'첨부용 PDF를 준비하거나 반영하지 못했습니다. 현재 입력과 첨부를 확인한 뒤 다시 시도해 주세요.');}
   finally{if(live(s,ticket)){busy=false;activeTask='';sync();}}
  }
  function closeViewer(){
   pendingOpen=null;opened=false;stop();if(modal)root.bootstrap.Modal.getInstance(modal)?.hide();
  }
  function openRequest(request){
   const {key,view,trigger}=request;if(!key||key!==scope())return false;
   if(!modal)build();
   if(closing||showing&&!opened||otherModal()){pendingOpen=request;return true;}
   if(opened)return true;
   stop();sourceView=view;sourceRetry=false;current=drafts.get(key)||{key,dirty:false,ack:false};drafts.set(key,current);
   baseline=getFingerprint();focusTarget=trigger;fileInput.value='';notice(view?'':current.file?'선택한 고지서: '+current.file.name:'');
   draw();opened=true;showing=true;root.bootstrap.Modal.getOrCreateInstance(modal).show();return true;
  }
  const open=()=>openRequest({key:scope(),view:null,trigger:button});
  function getAttachmentSource(file){
   const view=drafts.get(scope())?.attachedSource;
   return view?.attachment===file&&hasAttachment(file)?view:null;
  }
  function openAttachmentSource(file,trigger){
   const key=scope(),view=getAttachmentSource(file);
   if(!view)return false;
   return openRequest({key,view,trigger});
  }
  button.addEventListener('click',open);
  return Object.freeze({open,openAttachmentSource,getAttachmentSource,hasDraft:()=>[...drafts.values()].some(d=>d.dirty),hasCurrentDraft:()=>!!drafts.get(scope())?.dirty,close:closeViewer});
 }
 root.CoopInsuranceNotice=Object.freeze({version:'1.3.0',create,previewAttachment});
})(window);
