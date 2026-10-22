/* v1.0.1 — local-only PDF review. Exact original File is attached only after explicit review. */
(function(root){'use strict';
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function create({button,getContext,getFingerprint,apply,onDirty=()=>{}}){
 const drafts=new Map();let modal,body,status,fileInput,fileMeta,password,readButton,review,canvas,pageSelect,ack,applyButton,current=null,session=null,controller=null,epoch=0,busy=false,pdfModule=null,baseline='',renderEpoch=0,focusTarget=null,opened=false;
  const scope=()=>{const c=getContext();return c?.allowed&&c.visible!==false?c.owner+'|'+c.draft:'';};
  const live=(s,t)=>s===current&&s.key===scope()&&t===epoch&&opened;
  const stop=()=>{epoch++;renderEpoch++;controller?.abort();controller=null;void session?.destroy();session=null;busy=false;if(password)password.value='';};
  const notice=s=>{status.textContent=s;};
  function build(){
   modal=make('div','modal fade');modal.id='insuranceNoticeReview';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','insuranceNoticeTitle');modal.style.zIndex='1080';
   const dialog=make('div','modal-dialog modal-xl modal-dialog-scrollable'),content=make('div','modal-content'),head=make('div','modal-header');
   const title=make('h2','modal-title fs-5','고지서 읽기·원본 확인');title.id='insuranceNoticeTitle';head.append(title);
   const close=make('button','btn-close');close.type='button';close.dataset.bsDismiss='modal';close.setAttribute('aria-label','닫기');head.append(close);
   body=make('div','modal-body');const fileLabel=make('label','form-label','고지서 PDF (10MB 이하)');fileLabel.htmlFor='insuranceNoticeFile';fileInput=make('input','form-control');fileInput.type='file';fileInput.accept='.pdf,application/pdf';fileInput.id=fileLabel.htmlFor;
   fileInput.onchange=()=>{const f=fileInput.files?.[0];if(!f||!current)return;if(current.candidateDirtyBaseline===undefined)current.candidateDirtyBaseline=current.dirty;current.candidate=f;current.dirty=true;current.ack=false;onDirty();void read();};
   fileMeta=make('p','small text-muted mt-2');
   const help=make('p','small text-muted mt-2','등록된 사업자번호로 PDF를 열고, 원본과 금액을 확인해 결재 입력에 반영합니다. 확인한 PDF는 증빙 첨부로 함께 선택됩니다.');
   const passLabel=make('label','form-label small','PDF 암호 (자동으로 열리지 않는 경우)');passLabel.htmlFor='insuranceNoticePassword';password=make('input','form-control');password.id=passLabel.htmlFor;password.type='password';password.autocomplete='off';password.setAttribute('data-erp-query-control','');password.maxLength=128;
   readButton=make('button','btn btn-outline-primary mt-2','다시 읽기');readButton.type='button';readButton.onclick=()=>void read(true);
   const cancelChoice=make('button','btn btn-outline-secondary mt-2 ms-2','새 파일 선택 취소');cancelChoice.type='button';cancelChoice.onclick=()=>{if(!current)return;stop();current.candidate=null;if(current.candidateDirtyBaseline!==undefined){current.dirty=current.candidateDirtyBaseline;delete current.candidateDirtyBaseline;}fileInput.value='';notice('새 파일 선택을 취소했습니다.');draw();onDirty();if(current.file)void previewOnly();};
   status=make('p','small my-3');status.setAttribute('role','status');const grid=make('div','row g-3');review=make('div','col-md-6');const source=make('div','col-md-6');
   const pl=make('label','form-label','원본 쪽');pl.htmlFor='insuranceNoticePage';pageSelect=make('select','form-select form-select-sm');pageSelect.id=pl.htmlFor;pageSelect.onchange=()=>void renderPage();canvas=make('canvas','w-100 border mt-2');canvas.setAttribute('aria-label','고지서 원본 미리보기');canvas.style.height='auto';source.append(pl,pageSelect,canvas);grid.append(review,source);
   const footer=make('div','modal-footer');const ac=make('div','form-check me-auto');ack=make('input','form-check-input');ack.type='checkbox';ack.id='insuranceNoticeAcknowledged';ack.onchange=()=>{if(current)current.ack=ack.checked;sync();};const al=make('label','form-check-label','원본과 금액·귀속월을 확인했습니다');al.htmlFor=ack.id;ac.append(ack,al);
   const dismiss=make('button','btn btn-secondary','닫기');dismiss.type='button';dismiss.dataset.bsDismiss='modal';applyButton=make('button','btn btn-primary','확인한 내용 반영');applyButton.type='button';applyButton.onclick=()=>void commit();footer.append(ac,dismiss,applyButton);
   body.append(fileLabel,fileInput,fileMeta,help,passLabel,password,readButton,cancelChoice,status,grid);content.append(head,body,footer);dialog.append(content);modal.append(dialog);document.body.append(modal);
   modal.addEventListener('hide.bs.modal',()=>{opened=false;stop();});modal.addEventListener('hidden.bs.modal',()=>{if(scope()===current?.key)focusTarget?.focus({preventScroll:true});});
   modal.addEventListener('shown.bs.modal',()=>{if(!opened||!scope()||current?.key!==scope()){root.bootstrap.Modal.getInstance(modal)?.hide();return;}document.querySelector('.modal-backdrop:last-of-type')?.style.setProperty('z-index','1075');fileInput.focus({preventScroll:true});if(current?.file&&!session&&!busy)void previewOnly();});
   document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)stop();});
   root.addEventListener('beforeunload',e=>{if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
   // Changing a menu, actor, draft or expense subtype closes the viewer, not its draft.
   const watch=()=>{if(opened&&(!scope()||current?.key!==scope())){opened=false;stop();root.bootstrap.Modal.getInstance(modal)?.hide();}};
   document.addEventListener('input',watch,true);document.addEventListener('change',watch,true);
   new MutationObserver(watch).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden','class']});
   if(root.frameElement)new MutationObserver(watch).observe(root.frameElement,{attributes:true,attributeFilter:['hidden','style']});
  }
  function validValues(){if(!current?.result||!current.file||current.candidate)return false;try{pdfModule.calculate(current.values);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(current.month))return false;for(const[id,,optional]of pdfModule.fields)if(optional&&current.values[id]!==''&&current.values[id]!==undefined&&!/^\d+$/.test(current.values[id]))return false;return true;}catch{return false;}}
  function sync(){if(!applyButton)return;fileMeta.textContent=(current?.file?'원본: '+current.file.name:'')+(current?.candidate?' · 새로 읽을 파일: '+current.candidate.name:'');readButton.disabled=busy||!scope()||!(current?.candidate||current?.file);ack.disabled=busy||!validValues();ack.checked=!!current?.ack;applyButton.disabled=busy||!scope()||!current?.ack||!validValues();}
  function draw(){
   review.replaceChildren();if(!current?.result){review.append(make('p','text-muted','고지서를 선택하면 읽은 금액을 확인할 수 있습니다.'));sync();return;}
   const s=current;
   for(const w of s.result.warnings)review.append(make('p','small text-warning','⚠ 검토 필요 · '+w));
   const label=make('label','form-label','귀속월'),month=make('input','form-control mb-3');label.htmlFor='insuranceReadMonth';month.id=label.htmlFor;month.type='month';month.value=s.month||'';month.oninput=()=>{s.month=month.value;s.ack=false;s.dirty=true;sync();onDirty();};review.append(label,month);
   for(const[id,name,optional]of pdfModule.fields){const wrap=make('div','mb-2'),l=make('label','form-label small mb-1',name+(optional?' (선택)':''));l.htmlFor='notice_'+id;const n=make('input','form-control form-control-sm text-end');n.id=l.htmlFor;n.inputMode='numeric';n.value=s.values[id]??'';
    const hint=make('small',s.result.evidence[id]?'text-muted':'text-warning d-block',s.result.evidence[id]?s.result.evidence[id].page+'쪽 · '+s.result.evidence[id].label:'⚠ 검토 필요 · 원본에서 확인해 입력해 주세요.');
    n.oninput=()=>{s.values[id]=n.value.replace(/,/g,'').trim();s.ack=false;s.dirty=true;updateTotal();sync();onDirty();};wrap.append(l,n,hint);review.append(wrap);}
   const total=make('p','fw-bold mt-3');total.id='insuranceReadTotal';review.append(total);ack.checked=!!s.ack;updateTotal();sync();
  }
  function updateTotal(){const el=review.querySelector('#insuranceReadTotal');if(!el)return;try{const n=pdfModule.calculate(current.values),expected=current.result.totals?.total;el.textContent='결재 반영 금액 '+n.total.toLocaleString('ko-KR')+'원'+(expected!==undefined&&expected!==n.total?' · ⚠ 원본 납부금액과 차이가 있습니다.':'');}catch{el.textContent='⚠ 금액과 차감액을 확인해 주세요.';}}
  async function read(manual=false){
   if(busy||!scope()||current?.key!==scope())return;const s=current,f=s.candidate||s.file;if(!f)return;
   if(s.result&&f===s.file&&s.dirty){const before=JSON.stringify([s.values,s.month]);const yes=await root.CoopDialog.confirm('작성한 검토값을 PDF에서 다시 읽을까요?');if(!yes||current!==s||!scope()||JSON.stringify([s.values,s.month])!==before)return;}
   stop();const ticket=epoch,fp=getFingerprint();busy=true;s.ack=false;controller=new AbortController();const ctl=controller;
   let pass=manual?password.value:String(getContext().businessNumber||'').replace(/\D/g,'');password.value='';notice('PDF를 읽고 있습니다…');sync();
   try{pdfModule=pdfModule||await import('./insurance_notice_pdf.mjs?v=1.0.0');const loaded=await pdfModule.open(f,{password:pass,signal:ctl.signal});pass='';if(!live(s,ticket)||getFingerprint()!==fp){await loaded.destroy();if(live(s,ticket))notice('결재 입력이 바뀌었습니다. 현재 내용을 확인하고 다시 읽어 주세요.');return;}
    session=loaded;s.file=f;s.candidate=null;delete s.candidateDirtyBaseline;s.result=loaded.result;s.values={...loaded.result.values};s.month=loaded.result.billingMonth;s.dirty=true;s.ack=false;
    pageSelect.replaceChildren();for(let n=1;n<=loaded.pageCount;n++){const o=make('option','',n+'쪽');o.value=n;pageSelect.append(o);}pageSelect.value=String(loaded.result.sourcePage||1);
    notice('읽은 내용을 원본과 확인해 주세요.');draw();void renderPage();onDirty();
   }catch(e){if(live(s,ticket)){notice(({PDF_PASSWORD:'등록된 사업자번호로 열리지 않았습니다. PDF 암호를 직접 입력하고 다시 읽기를 눌러 주세요.',PDF_LIMIT:'10MB 이하의 PDF를 선택해 주세요.',PDF_INVALID:'PDF 파일 형식을 확인해 주세요.',PDF_PAGES:'20쪽 이하의 PDF를 선택해 주세요.'})[e.message]||'PDF를 읽지 못했습니다. 파일을 확인하고 다시 시도해 주세요.');}}
   finally{pass='';if(live(s,ticket)){busy=false;sync();}}
  }
  async function renderPage(){
   if(!session||!current||!scope())return;const ticket=++renderEpoch,s=current,active=session;
   try{await active.render(canvas,Number(pageSelect.value));}catch{if(ticket===renderEpoch&&s===current&&modal.classList.contains('show'))notice('원본 쪽을 표시하지 못했습니다. 다시 읽거나 다른 쪽을 선택해 주세요.');}
  }
  async function previewOnly(){
   if(!current?.file||busy||!scope())return;const s=current,ticket=epoch;controller=new AbortController();const ctl=controller;
   try{pdfModule=pdfModule||await import('./insurance_notice_pdf.mjs?v=1.0.0');const loaded=await pdfModule.open(s.file,{password:String(getContext().businessNumber||'').replace(/\D/g,''),signal:ctl.signal});if(!live(s,ticket)){await loaded.destroy();return;}session=loaded;pageSelect.replaceChildren();for(let n=1;n<=loaded.pageCount;n++){const o=make('option','',n+'쪽');o.value=n;pageSelect.append(o);}pageSelect.value=String(s.result?.sourcePage||1);void renderPage();}
   catch{if(live(s,ticket))notice('검토값은 유지했습니다. 원본을 다시 보려면 암호를 입력하고 다시 읽어 주세요.');}
  }
  async function commit(){
   if(!scope()||current?.key!==scope()||busy||!current.ack||!validValues())return;
   if(getFingerprint()!==baseline){current.ack=false;notice('결재 입력이 바뀌었습니다. 창을 닫고 현재 내용을 확인한 뒤 다시 열어 주세요.');sync();return;}
   try{if(apply({...current.values,insuranceBillingMonth:current.month},current.file,baseline)!==true)throw Error('NOT_APPLIED');current.dirty=false;current.ack=false;onDirty();root.bootstrap.Modal.getInstance(modal).hide();}
   catch{notice('입력에 반영하지 못했습니다. 현재 권한과 첨부파일을 확인해 주세요.');sync();}
  }
  function open(){const k=scope();if(!k)return;if(!modal)build();if(opened)return;stop();canvas.width=1;canvas.height=1;pageSelect.replaceChildren();current=drafts.get(k)||{key:k,dirty:false,ack:false};drafts.set(k,current);baseline=getFingerprint();focusTarget=document.activeElement;password.value='';fileInput.value='';notice(current.file?'선택한 고지서: '+current.file.name:'');draw();opened=true;root.bootstrap.Modal.getOrCreateInstance(modal).show();}
  button.addEventListener('click',open);
  return Object.freeze({open,hasDraft:()=>[...drafts.values()].some(d=>d.dirty),hasCurrentDraft:()=>!!drafts.get(scope())?.dirty,close:()=>{opened=false;stop();if(modal)root.bootstrap.Modal.getInstance(modal)?.hide();}});
 }
 root.CoopInsuranceNotice=Object.freeze({version:'1.0.1',create});
})(window);
