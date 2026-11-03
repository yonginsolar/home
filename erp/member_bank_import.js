/* Bank import1.0.0. Existing members only; original secure writer is server-authoritative. */
(function(root){
 'use strict';
 const headers=['조합원번호','이름·단체명','전화번호','은행명','계좌번호','예금주'];
 const accountReview='숫자형 계좌번호입니다. 원본의 앞자리 0까지 확인해 주세요.';
 const text=v=>String(v??'').trim();
 function parse(book,X){
  const name=book.Sheets['계좌정보']?'계좌정보':book.SheetNames[0],sheet=book.Sheets[name];
  if(!sheet)throw Error('계좌정보 시트를 확인해 주세요.');
  for(const other of book.SheetNames)if(other!==name&&X.utils.sheet_to_json(book.Sheets[other],{raw:true}).length)throw Error('계좌정보는 별도 파일로 올려 주세요. 다른 시트의 회원·납입은 함께 반영하지 않습니다.');
  const bounds=X.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
  if(bounds.e.r>10000||bounds.e.c>100)throw Error('계좌정보는 500행 이내로 정리해 주세요.');
  for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!')&&cell?.f)throw Error('수식 대신 확인한 값을 붙여넣어 주세요.');
  const input=X.utils.sheet_to_json(sheet,{raw:true,defval:''});
  if(!input.length||input.length>500)throw Error('계좌정보를 1~500행 입력해 주세요.');
  return input.map((r,i)=>({row_no:Number.isInteger(r.__rowNum__)?r.__rowNum__+1:i+2,member_id:text(r['조합원번호']||r['회원번호']),name:text(r['이름·단체명']||r['이름']||r['단체명']||r['성명']),phone:text(r['전화번호']||r['연락처']||r['휴대전화']),bank_name:text(r['은행명']||r['은행']),bank_account:text(r['계좌번호']),account_holder:text(r['예금주']),_issues:typeof r['계좌번호']==='number'||text(r['계좌번호 원본확인'])==='필요'?[accountReview]:[]}));
 }
 function create({client,getContext,ensureSpreadsheet,refresh}){
  const states=new Map();let state,modal,input,status,body,recheck,apply,drop,download,listRetry,progress,filename,opener,epoch=0,closing=null;
  const ctx=()=>getContext()||{},visible=()=>modal?.classList.contains('show');
  const menu=()=>!document.getElementById('tab-members')||document.getElementById('tab-members').classList.contains('active');
  const current=(s,t=epoch)=>s===state&&s.owner===ctx().owner&&s.actor===ctx().actorId&&ctx().allowed===true&&!root.frameElement?.hidden&&menu()&&t===epoch;
  const editable=()=>current(state)&&!state.job&&!state.confirming;
  const activeRead=(s,t)=>current(s,t)&&visible();
  function message(s,value){s.status=value;if(current(s)&&visible())status.textContent=value;}
  function cancelRead(){if(state?.read){state.read.controller.abort();state.read=null;}epoch++;}
  const showFile=()=>{filename.textContent=state?.file?.name||'';try{const d=new root.DataTransfer();if(state?.file)d.items.add(state.file);input.files=d.files;}catch(_){input.value='';}};
  const fresh=owner=>({owner,coop:ctx().coopId,actor:ctx().actorId,file:null,rows:[],review:null,status:'',results:new Map(),dirty:false,read:null,job:null});
  function render(){
   if(!state||!visible()||!current(state))return;
   const locked=!editable();status.textContent=state.status;filename.textContent=state.file?.name||'';input.disabled=locked;
   recheck.disabled=locked||!!state.read||!state.file;drop.disabled=locked||!!state.read||!state.file;download.disabled=!!state.read||!!state.job||!state.rows.length;
   apply.disabled=!!state.read||state.confirming||!ctx().allowed||(!state.job&&!state.review?.rows.some(r=>r.eligible&&!state.excluded?.has(r.row_no)));
   if(state.job){apply.textContent=state.job.unknown?'등록 결과 확인':'계속 반영';apply.disabled=!!state.job.running||state.confirming;}
   else apply.textContent='선택한 계좌 반영';
   const job=state.job||state.lastJob;progress.hidden=!job;progress.max=job?.total||1;progress.value=job?.confirmed||0;
   progress.setAttribute('aria-label',job?'처리 확인 '+job.confirmed+' / '+job.total+'행':'처리 진행');
   listRetry.hidden=!state.listFailed;listRetry.disabled=!!state.listBusy;
   body.replaceChildren();
   for(const r of state.rows){
    const v=state.review?.rows.find(x=>x.row_no===r.row_no),result=state.results.get(r.row_no),tr=document.createElement('tr');
    const cell=value=>{const td=document.createElement('td');td.textContent=value??'';tr.append(td);return td;};
    const check=document.createElement('input');check.type='checkbox';check.className='form-check-input';check.checked=!!v?.eligible&&!state.excluded?.has(r.row_no);check.disabled=locked||!v?.eligible;check.setAttribute('aria-label',r.row_no+'행 반영 선택');
    check.onchange=()=>{state.excluded??=new Set();if(check.checked)state.excluded.delete(r.row_no);else state.excluded.add(r.row_no);apply.disabled=!state.review.rows.some(x=>x.eligible&&!state.excluded.has(x.row_no));};cell('').append(check);cell(r.row_no);cell(r.name||r.member_id);cell(r.phone);
    const member=cell(v?.member_id?(v.name+' · '+v.member_id):'연결 확인 필요');
    if(v?.candidates?.length>1){const select=document.createElement('select');select.className='form-select form-select-sm';select.setAttribute('aria-label',r.row_no+'행 연결할 회원');select.disabled=locked;
     const empty=new Option('회원 선택','');select.append(empty);for(const c of v.candidates)select.append(new Option(c.name+' · '+c.member_id+' · 끝 '+c.phone_tail,c.id));select.value=r.selected_id||'';
     select.onchange=()=>{r.selected_id=select.value;invalidateReview();};member.append(select);}
    const bank=cell(v?.bank?.value||r.bank_name||'기존 값 유지');
    if(v?.bank?.status==='alias'){const label=document.createElement('small');label.textContent=' ('+r.bank_name+' → '+v.bank.value+')';bank.append(label);}
    if(v?.bank?.reason){const select=document.createElement('select');select.className='form-select form-select-sm';select.setAttribute('aria-label',r.row_no+'행 은행 확인');select.disabled=locked;
     select.append(new Option('은행 확인 필요',''));for(const b of root.CoopBankChoices?.banks||[])select.append(new Option(b,b));select.append(new Option('원문 은행명 확인: '+r.bank_name,'__original__'));
     select.onchange=()=>{if(!select.value)return;if(select.value==='__original__')r.bank_confirmed=true;else{r.bank_name=select.value;r.bank_confirmed=false;}invalidateReview();};bank.append(select);}
    const account=cell(r.bank_account||'기존 값 유지');
    if(r._issues.includes(accountReview)){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.disabled=locked;check.className='form-check-input me-1';label.style.display='block';label.append(check,document.createTextNode('앞자리 0까지 원본과 일치'));check.onchange=()=>{if(check.checked){r._issues=r._issues.filter(x=>x!==accountReview);invalidateReview();}};account.append(label);}
    cell(r.account_holder||'기존 값 유지');
    cell(v?((v.existing_bank||'은행 미등록')+' / '+(v.existing_account||'계좌 미등록')):'검사 전');
    cell(result?.ok?(result.skipped?'이미 반영되어 건너뜀':'반영 확인 완료'):result?.reason||r._issues?.join(' ')||v?.reason||(v?.eligible?'반영 가능':'다시 검사해 주세요.'));
    body.append(tr);
   }
  }
  function invalidateReview(){cancelRead();state.review=null;state.dirty=true;message(state,'선택을 바꿨어요. 다시 검사한 뒤 반영해 주세요.');apply.disabled=true;recheck.disabled=false;}
  function returnAfterConfirm(s,t,target){if(current(s,t)&&visible()&&document.hasFocus()&&!document.querySelector('dialog[open]')&&[document.body,modal].includes(document.activeElement)&&target?.isConnected&&!target.disabled)target.focus({preventScroll:true});}
  async function ask(s,t,message){
   const owner={get closed(){return root.closed||!activeRead(s,t);},get frameElement(){return root.frameElement;},get parent(){return root.parent;},document,getSelection:()=>root.getSelection()};s.confirmOwner=owner;
   try{return root.CoopDialog.forOwner?await root.CoopDialog.forOwner(owner,'confirm',message,'',{}):await root.CoopDialog.confirm(message);}
   finally{if(s.confirmOwner===owner)s.confirmOwner=null;}
  }
  function build(){
   if(modal)return;modal=document.createElement('div');modal.id='memberBankImportModal';modal.className='modal fade';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','memberBankImportTitle');
   modal.innerHTML='<div class="modal-dialog modal-dialog-scrollable" style="width:min(1100px,calc(100vw - 2rem));max-width:none;height:min(760px,calc(100dvh - 2rem));margin:1rem auto"><div class="modal-content" style="height:100%;overflow:auto"><div class="modal-header" style="flex-shrink:0;gap:.5rem"><h2 id="memberBankImportTitle" class="modal-title h5" style="min-width:0;overflow-wrap:anywhere">계좌정보 엑셀 검토</h2><button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body" style="min-height:9rem;overflow:auto"><p>기존 회원의 계좌정보만 반영해요. 조합원번호 또는 이름·전화번호로 찾고, 애매한 회원·은행은 직접 확인해 주세요. 빈칸은 기존 값을 유지합니다. 계좌 소유자 인증이나 실제 송금은 하지 않아요.</p><label for="memberBankImportFile" class="form-label">계좌정보 파일</label><input id="memberBankImportFile" class="form-control" type="file" accept=".xlsx,.xls,.csv"><p data-file class="small" style="overflow-wrap:anywhere"></p><p data-status role="status" aria-live="polite"></p><progress data-progress style="width:100%" hidden></progress><div class="table-responsive"><table class="table table-sm align-middle" style="min-width:980px"><thead><tr><th>선택</th><th>행</th><th>입력 회원</th><th>전화번호</th><th>연결한 회원</th><th>은행</th><th>입력 계좌번호</th><th>예금주</th><th>기존 계좌</th><th>확인할 내용</th></tr></thead><tbody></tbody></table></div></div><div class="modal-footer" style="flex-shrink:0;flex-wrap:wrap"><button class="btn btn-outline-danger" type="button" data-drop>검토 버리기</button><button class="btn btn-outline-secondary" type="button" data-download>남은 행 다운로드</button><button class="btn btn-outline-primary" type="button" data-list-retry hidden>명부 다시 불러오기</button><button class="btn btn-outline-primary" type="button" data-recheck>다시 검사</button><button class="btn btn-secondary" type="button" data-bs-dismiss="modal">닫기</button><button class="btn btn-success" type="button" data-apply>선택한 계좌 반영</button></div></div></div>';
   document.body.append(modal);input=modal.querySelector('input[type=file]');status=modal.querySelector('[data-status]');filename=modal.querySelector('[data-file]');progress=modal.querySelector('progress');body=modal.querySelector('tbody');
   recheck=modal.querySelector('[data-recheck]');apply=modal.querySelector('[data-apply]');drop=modal.querySelector('[data-drop]');download=modal.querySelector('[data-download]');listRetry=modal.querySelector('[data-list-retry]');
   input.onchange=()=>void inspect(input.files?.[0]);recheck.onclick=()=>void inspect();apply.onclick=()=>void submit();drop.onclick=()=>void discard();download.onclick=()=>void exportRemaining();listRetry.onclick=()=>void refreshList(state);
   modal.addEventListener('shown.bs.modal',render);
   modal.addEventListener('hide.bs.modal',()=>{const eligible=modal.contains(document.activeElement),s=state;cancelRead();closing={eligible,s,target:opener,changed:false};const changed=e=>{if(!modal.contains(e.target)&&e.target!==document.body)closing&&(closing.changed=true);};for(const e of ['pointerdown','keydown','input','focusin'])document.addEventListener(e,changed,true);closing.stop=()=>{for(const e of ['pointerdown','keydown','input','focusin'])document.removeEventListener(e,changed,true);};});
   modal.addEventListener('hidden.bs.modal',()=>{const c=closing;closing=null;c?.stop();if(c?.eligible&&!c.changed&&current(c.s)&&!document.querySelector('.modal.show')&&!document.querySelector('dialog[open]')&&c.target?.isConnected&&c.target.getClientRects().length&&!c.target.disabled)c.target.focus({preventScroll:true});});
   modal.addEventListener('keydown',e=>{if(e.key!=='Tab'||!current(state)||root.CoopDialog?.hasPending?.()||document.querySelector('dialog[open]'))return;const nodes=[...modal.querySelectorAll('button,input,select,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&!n.closest('[hidden],[inert]')&&n.getClientRects().length);const i=nodes.indexOf(document.activeElement);if(i<0||(!e.shiftKey&&i===nodes.length-1)||(e.shiftKey&&i===0)){e.preventDefault();(e.shiftKey?nodes.at(-1):nodes[0])?.focus();}});
   root.addEventListener('beforeunload',e=>{if([...states.values()].some(s=>s.dirty||s.job)){e.preventDefault();e.returnValue='';}});
   root.addEventListener('pagehide',pause);
   if(root.frameElement)new MutationObserver(syncContext).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
   const pane=document.getElementById('tab-members');if(pane)new MutationObserver(syncContext).observe(pane,{attributes:true,attributeFilter:['class']});
  }
  async function inspect(selected){
   if(!editable()||!visible())return;const s=state;
   if(selected&&(selected.size>10*1024*1024||!/[.](xlsx|xls|csv)$/i.test(selected.name))){message(s,'10MB 이하의 엑셀 또는 CSV 파일을 선택해 주세요.');showFile();return;}
   cancelRead();const t=epoch,controller=new AbortController(),run={controller};s.read=run;s.review=null;const valid=()=>activeRead(s,t)&&s.read===run;
   if(selected){s.file=selected;s.rows=[];s.review=null;s.results.clear();s.excluded=new Set();s.dirty=true;s.lastJob=null;s.listFailed=false;}
   if(!s.file){s.read=null;return;}message(s,'파일과 연결 대상을 확인하고 있어요…');render();let timer,toolReady=false,rpcStarted=false;
   try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},15000);});
    const result=await Promise.race([(async()=>{await ensureSpreadsheet();toolReady=true;if(!valid())return null;if(!s.rows.length){const bytes=await s.file.arrayBuffer();if(!valid())return null;s.rows=parse(root.XLSX.read(bytes,{type:'array',raw:true,cellDates:false,sheetRows:10002}),root.XLSX);}rpcStarted=true;let query=client.rpc('member_bank_import_admin',{p_action:'preview',p_coop_id:s.coop,p_actor_uid:s.actor,p_rows:s.rows});if(query.abortSignal)query=query.abortSignal(controller.signal);const response=await query;if(response.error)throw response.error;return response.data;})(),timeout]);
    if(!valid()||!result)return;if(!Array.isArray(result.rows)||result.rows.length!==s.rows.length||new Set(result.rows.map(r=>r.row_no)).size!==s.rows.length||result.rows.some(r=>!s.rows.some(x=>x.row_no===r.row_no)))throw Error('INVALID_PREVIEW');s.review=result;s.results.clear();s.dirty=result.rows.some(r=>!r.skipped);if(!s.dirty)root.ErpWorkspaceResume?.checkpoint(input);message(s,'반영 가능 '+result.rows.filter(x=>x.eligible).length+'행 · 확인 필요 '+result.rows.filter(x=>!x.eligible&&!x.skipped).length+'행. 연결 대상과 계좌를 검토한 뒤 반영해 주세요.');
   }catch(e){if(valid())message(s,e.code==='42501'?'현재 권한으로는 검사할 수 없습니다. 권한을 확인해 주세요.':e.message==='timeout'?'검사가 지연되고 있어요. 파일은 유지됩니다. 다시 검사해 주세요.':!toolReady?'파일 읽기 도구를 불러오지 못했어요. 파일을 유지한 채 다시 검사해 주세요.':rpcStarted?'연결 대상 조회에 실패했어요. 파일을 유지한 채 다시 검사해 주세요.':e.message||'파일을 확인하지 못했어요. 다시 검사해 주세요.');}
   finally{clearTimeout(timer);if(s.read===run){s.read=null;render();}}
  }
  async function discard(){
   if(!editable()||!visible()||state.read)return;const s=state,t=epoch;s.confirming=true;render();
   const yes=await ask(s,t,'파일과 계좌 검토 초안을 버릴까요? 이미 반영된 계좌는 바뀌지 않습니다.');
   s.confirming=false;if(!current(s,t)||!visible())return;if(yes){cancelRead();state=fresh(s.owner);states.set(state.owner,state);showFile();root.ErpWorkspaceResume?.checkpoint(input);render();returnAfterConfirm(state,epoch,input);}else{render();returnAfterConfirm(s,t,drop);}
  }
  async function exportRemaining(){
   if(!editable()||!visible())return;const s=state,t=epoch;
   try{await ensureSpreadsheet();if(!activeRead(s,t))return;const rows=s.rows.filter(r=>!s.results.get(r.row_no)?.ok&&!s.review?.rows.find(x=>x.row_no===r.row_no)?.skipped).map(r=>({...Object.fromEntries(headers.map((h,i)=>[h,[r.member_id,r.name,r.phone,r.bank_name,r.bank_account,r.account_holder][i]])),...(r._issues.includes(accountReview)?{'계좌번호 원본확인':'필요'}:{})}));
    if(!rows.length){message(s,'남은 행이 없습니다.');return;}const b=root.XLSX.utils.book_new(),sheet=root.XLSX.utils.json_to_sheet(rows,{header:headers});for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!'))cell.z='@';root.XLSX.utils.book_append_sheet(b,sheet,'계좌정보');root.XLSX.writeFile(b,'계좌정보_남은행.xlsx');
   }catch(_){if(activeRead(s,t))message(s,'파일을 내려받지 못했어요. 다시 시도해 주세요.');}
  }
  function finishChunk(s,job,index,result){
   if(s.job!==job||job.index!==index||result?.outcome!=='finished')return false;
   const expected=job.chunks[index].rows;if(!Array.isArray(result.rows)||result.rows.length!==expected.length||new Set(result.rows.map(r=>r.row_no)).size!==expected.length||result.rows.some(r=>typeof r.ok!=='boolean'||!expected.some(x=>x.row_no===r.row_no)))return false;
   for(const r of result.rows||[])s.results.set(r.row_no,r);job.confirmed+=job.chunks[index].rows.length;job.index++;job.unknown=false;
   for(const r of result.rows||[]){const v=s.review?.rows.find(x=>x.row_no===r.row_no);if(v)Object.assign(v,{eligible:false,skipped:!!r.ok,reason:r.ok?'반영 완료':'반영하지 못했습니다.'});}
   message(s,'처리 확인 '+job.confirmed+' / '+job.total+'행 ('+Math.floor(job.confirmed/job.total*100)+'%).');return true;
  }
  async function refreshList(s){if(!current(s)||!visible()||(s.listBusy&&s.listRead?.epoch===epoch))return;const token={epoch};s.listRead=token;s.listBusy=true;render();try{const failed=await refresh()!==true;if(current(s,token.epoch))s.listFailed=failed;}catch(_){if(current(s,token.epoch))s.listFailed=true;}finally{if(s.listRead===token){s.listBusy=false;if(current(s,token.epoch)&&visible()){if(s.listFailed)message(s,'계좌 처리 결과는 유지됩니다. 명부만 다시 불러와 주세요.');render();}}}}
  async function run(s){
   const job=s.job;if(!job||job.running)return;job.running=true;render();
   try{while(job.index<job.chunks.length&&current(s)&&visible()){
    const index=job.index,chunk=job.chunks[index];
    if(job.unknown){let readTimer;try{const out=await Promise.race([client.rpc('member_bank_import_admin',{p_action:'status',p_coop_id:s.coop,p_actor_uid:s.actor,p_request_key:chunk.key}),new Promise((_,reject)=>readTimer=setTimeout(()=>reject(Error('timeout')),15000))]);if(out.error)throw out.error;
      if(finishChunk(s,job,index,out.data)){if(!current(s)||!visible())break;continue;}
      if(out.data?.outcome==='not_found'&&!job.pending){job.unknown=false;message(s,'접수된 결과를 찾지 못했습니다. 계속 반영을 누르면 같은 요청으로 다시 확인·처리합니다.');}else message(s,'아직 결과를 확인하지 못했어요. 등록 결과 확인으로 이어가 주세요.');
     }catch(_){message(s,'등록 결과 조회에 실패했어요. 실패로 단정하지 말고 등록 결과 확인을 다시 눌러 주세요.');}finally{clearTimeout(readTimer);}break;
    }
    const request=client.rpc('member_bank_import_admin',{p_action:'apply',p_coop_id:s.coop,p_actor_uid:s.actor,p_rows:chunk.rows,p_request_key:chunk.key});let timer;job.pending=true;
    const original=Promise.resolve(request).then(out=>{job.pending=false;if(out.error){job.unknown=true;return null;}if(job.index>index)return out.data;if(!finishChunk(s,job,index,out.data)){job.unknown=true;return null;}return out.data;},()=>{job.pending=false;job.unknown=true;return null;}).finally(()=>{if(!job.running&&current(s)&&visible())render();});
    const value=await Promise.race([original,new Promise(resolve=>timer=setTimeout(()=>resolve(null),30000))]);clearTimeout(timer);
    if(!value){job.unknown=true;message(s,'응답을 확인하지 못했어요. 입력·파일은 유지됩니다. 등록 결과 확인을 눌러 주세요.');break;}
   }
   }finally{job.running=false;if(job.index===job.chunks.length){s.lastJob=job;s.job=null;s.dirty=s.rows.some(r=>!s.results.get(r.row_no)?.ok&&!s.review?.rows.find(x=>x.row_no===r.row_no)?.skipped);if(!s.dirty&&current(s))root.ErpWorkspaceResume?.checkpoint(input);message(s,'계좌 처리 결과를 확인했어요. 반영 확인 '+[...s.results.values()].filter(r=>r.ok).length+'행 · 남은 행은 다운로드해 수정할 수 있어요.');if(current(s)&&visible())await refreshList(s);}render();}
  }
  async function submit(){
   const s=state;if(!current(s)||!visible()||s.confirming||s.read)return;if(s.job){await run(s);return;}
   const t=epoch,rows=s.rows.filter(r=>s.review?.rows.find(v=>v.row_no===r.row_no)?.eligible&&!s.excluded?.has(r.row_no)).map(r=>({...r,expected:s.review.rows.find(v=>v.row_no===r.row_no).expected}));if(!rows.length)return;
   s.confirming=true;render();const yes=await ask(s,t,rows.length+'명의 현재 계좌정보를 반영할까요? 입력한 칸은 기존 값을 바꾸고, 빈칸은 그대로 유지합니다. 실제 송금이나 알림은 보내지 않습니다.');s.confirming=false;
   if(!yes||!current(s,t)||!visible()){render();if(!yes)returnAfterConfirm(s,t,apply);return;}
   const chunks=[];for(let i=0;i<rows.length;i+=25)chunks.push({key:root.crypto.randomUUID(),rows:rows.slice(i,i+25)});
   s.job={chunks,index:0,total:rows.length,confirmed:0,running:false,unknown:false,pending:false};await run(s);
  }
  function pause(){cancelRead();if(state?.confirmOwner)root.CoopDialog.cancelAll?.(state.confirmOwner);if(modal)root.bootstrap.Modal.getInstance(modal)?.hide();}
  function syncContext(){if(!modal||!state)return;if(!current(state)){pause();body.replaceChildren();status.textContent='';input.value='';}else if(visible())render();}
  function open({replacementFile=null}={}){
   build();const c=ctx();if(!c.allowed||!c.owner||!menu()||root.frameElement?.hidden)return false;
   if(replacementFile&&states.get(c.owner)?.job)return false;
   cancelRead();state=states.get(c.owner)||fresh(c.owner);states.set(c.owner,state);opener=document.activeElement;showFile();if(!state.dirty&&!state.job)root.ErpWorkspaceResume?.checkpoint(input);root.bootstrap.Modal.getOrCreateInstance(modal).show();render();return true;
  }
  return Object.freeze({open,pause,syncContext,hasDraft:()=>!!states.get(ctx().owner)?.file});
 }
 root.MemberBankImport=Object.freeze({version:'1.0.0',headers,parse,create});
})(window);
