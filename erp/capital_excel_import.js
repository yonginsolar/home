/* Capital Excel import v1.0.0. Local draft/preview only until explicit, server-checked confirmation. */
(function (root) {
 'use strict';
 const MAX_ROWS=500,MAX_BYTES=10*1024*1024;
 const headers=['조합원번호','이름·단체명','납입일','금액','입금자명','메모'];
 const aliases=[['조합원번호','회원번호','member_id'],['이름·단체명','이름','성명','단체명','name'],['납입일','입금일','날짜','deposit_date'],['금액','입금액','출자금액','출자금','amount'],['입금자명','입금자','depositor'],['메모','비고','note']];
 const text=v=>String(v??'').trim();
 function parseAmount(value) {
  if(typeof value==='number')return Number.isSafeInteger(value)&&value>0?value:null;
  const s=text(value);if(!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(s))return null;
  const n=Number(s.replace(/,/g,''));return Number.isSafeInteger(n)&&n>0?n:null;
 }
 function parseDate(value,XLSX,date1904=false) {
  let s=text(value);
  if(typeof value==='number') {
   const d=XLSX.SSF.parse_date_code(value,{date1904});
   if(!d||d.H||d.M||d.S||d.u)return null;
   s=String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0');
  }
  const m=s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/);if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]),d=new Date(Date.UTC(y,mo-1,day));
  if(y<1900||y>9999||d.getUTCFullYear()!==y||d.getUTCMonth()!==mo-1||d.getUTCDate()!==day)return null;
  return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 }
 function normalizeWorkbook(wb,XLSX) {
  if(!wb.SheetNames?.length)throw Error('시트가 없는 파일입니다.');
  const sheet=wb.Sheets[wb.SheetNames[0]],range=sheet?.['!fullref']||sheet?.['!ref'];if(!range)throw Error('입력된 내역이 없습니다.');
  const bounds=XLSX.utils.decode_range(range);if(bounds.e.r>10000||bounds.e.c>100)throw Error('첫 시트에 500건 이내로 정리해 주세요.');
  const data=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',range:{s:{r:0,c:0},e:bounds.e}});
  const head=data.findIndex(r=>r.some(v=>text(v)));if(head<0)throw Error('입력된 내역이 없습니다.');
  const labels=data[head].map(text),columns=aliases.map(names=>labels.reduce((out,v,i)=>names.includes(v)?[...out,i]:out,[]));
  if(columns.some(c=>c.length>1))throw Error('같은 뜻의 열이 반복됩니다. 양식의 항목을 한 번씩만 사용해 주세요.');
  if(!columns[2].length||!columns[3].length||(!columns[0].length&&!columns[1].length))throw Error('조합원번호 또는 이름, 납입일, 금액 열이 필요합니다.');
  const result=[];
  for(let i=head+1;i<data.length;i++) {
   const source=data[i];if(!source.some(v=>text(v)))continue;
   if(result.length===MAX_ROWS)throw Error('한 번에 500건까지 검사할 수 있습니다.');
   const values=columns.map(c=>c.length?source[c[0]]:'');
   const row={row_no:i+1,member_id:text(values[0]),name:text(values[1]),date:parseDate(values[2],XLSX,wb.Workbook?.WBProps?.date1904===true),amount:parseAmount(values[3]),depositor:text(values[4]),note:text(values[5])};
   const formula=columns.some(c=>c.length&&sheet[XLSX.utils.encode_cell({r:i,c:c[0]})]?.f);
   let reason='';
   if(formula)reason='수식 대신 계산된 값을 붙여넣어 주세요.';
   else if(!row.member_id&&!row.name)reason='조합원번호 또는 이름·단체명을 입력해 주세요.';
   else if(!row.date)reason='납입일을 실제 날짜로 입력해 주세요.';
   else if(row.amount===null)reason='금액은 1원 이상의 정수로 입력해 주세요.';
   else if(row.member_id.length>100||row.name.length>100||row.depositor.length>100||row.note.length>2000)reason='조합원번호·이름·입금자명은 100자, 메모는 2,000자 이내로 입력해 주세요.';
   result.push({input:row,source:values.map(v=>v??''),status:reason?'error':'unchecked',reason,selected:false});
  }
  if(!result.length)throw Error('입력된 내역이 없습니다.');
  return result;
 }
 function create(options) {
  const {client,getContext,ensureSpreadsheet,refresh}=options;
  let state=null,modal,input,status,tbody,summary,submit,recheck,filter,all,clear,exportButton,lastFocus;
  const context=()=>getContext()||{};
  const same=s=>state===s&&s.owner===context().owner;
  const allowed=s=>same(s)&&context().allowed===true;
  const visible=()=>!!modal?.classList.contains('show')&&!root.frameElement?.hidden;
  const blocked=s=>['confirming','saving','uncertain'].includes(s.phase);
  function stopRead() {
   if(!state)return;state.epoch++;state.abort?.abort();state.abort=null;
   if(['reading','checking'].includes(state.phase)){state.phase='needs_check';state.message='선택한 파일을 다시 검사해 주세요.';}
   if(state.phase==='confirming'){state.phase=state.retrying?'uncertain':'ready';if(!state.retrying)state.attempt=null;}
  }
  function clearDraft() {
   stopRead();state=null;
   if(input){input.value='';root.ErpWorkspaceResume?.checkpoint(input);}render();
  }
  function syncContext() {
   if(!state)return;const c=context();
   if(!c.owner||state.owner!==c.owner){clearDraft();root.bootstrap?.Modal.getInstance(modal)?.hide();return;}
   if(!c.allowed){stopRead();state.message='현재 권한으로는 등록할 수 없습니다.';}render();
  }
  function build() {
   if(modal)return;
   const style=document.createElement('style');style.textContent='#capitalImportModal .capital-import-table{min-width:760px;table-layout:fixed}#capitalImportModal th,#capitalImportModal td{word-break:keep-all;overflow-wrap:break-word}#capitalImportModal .capital-import-scroll{max-height:45vh;overflow:auto}#capitalImportModal .capital-import-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}';document.head.append(style);
   modal=document.createElement('div');modal.className='modal fade';modal.id='capitalImportModal';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','capitalImportTitle');
   modal.innerHTML='<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="capitalImportTitle">출자금 엑셀 일괄등록</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"><div class="capital-import-tools mb-3"><button type="button" class="btn btn-sm btn-outline-success" data-action="template">양식 다운로드</button><button type="button" class="btn btn-sm btn-outline-secondary" data-action="help" aria-label="출자금 엑셀 도움말" data-workflow-help="기존 조합원에게 실제 납입 내역을 추가할 때 사용합니다. 조합원번호 또는 이름·단체명으로 대상을 찾고 납입일·금액을 한 줄씩 입력하세요. 동명이인은 조합원번호로 구분하고 미리보기의 대상·날짜·금액을 통장과 대조합니다. 이 단독 등록은 같은 조합원·날짜·금액을 중복으로 제외합니다. 실제 별도 입금을 같은 날 두 번 기록해야 한다면 회원·출자금 함께 등록의 거래 구분·별도 입금 확인을 이용하세요. 감자·반환은 해당 업무에서 처리하고 현재 잔액 전체를 납입 금액으로 넣지 않도록 확인합니다.">?</button><span class="small text-muted">납입 내역을 한 줄씩 입력하세요. 엑셀(.xlsx)·CSV, 10MB·500건까지 검사합니다.</span></div><label for="capitalImportFile" class="form-label fw-bold">출자금 파일</label><input id="capitalImportFile" type="file" class="form-control mb-2" accept=".xlsx,.csv"><div id="capitalImportStatus" class="small mb-2" role="status" aria-live="polite"></div><div class="capital-import-tools mb-2"><button type="button" class="btn btn-sm btn-outline-primary" data-action="check">다시 검사</button><select class="form-select form-select-sm" style="width:auto" aria-label="검토 목록 범위" data-erp-query-control><option value="all">전체</option><option value="ready">등록 가능</option><option value="review">확인 필요·중복</option></select><button type="button" class="btn btn-sm btn-outline-secondary" data-action="export">검토 목록 다운로드</button><button type="button" class="btn btn-sm btn-outline-secondary" data-action="clear">검토 비우기</button></div><p class="small fw-bold mb-2" id="capitalImportSummary"></p><div class="table-responsive border rounded capital-import-scroll"><table class="table table-sm align-middle capital-import-table"><thead class="table-light"><tr><th style="width:44px"><input type="checkbox" class="form-check-input" aria-label="등록 가능한 내역 전체 선택" data-erp-query-control></th><th style="width:50px">행</th><th>조합원번호</th><th>이름·단체명</th><th style="width:100px">납입일</th><th style="width:110px">금액</th><th style="width:30%">검사 결과</th></tr></thead><tbody></tbody></table></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button><button type="button" class="btn btn-primary" data-action="submit">선택한 내역 등록</button></div></div></div>';
   document.body.append(modal);modal.querySelector('[data-action=help]').classList.add('coop-workflow-help');input=modal.querySelector('input[type=file]');status=modal.querySelector('#capitalImportStatus');summary=modal.querySelector('#capitalImportSummary');tbody=modal.querySelector('tbody');submit=modal.querySelector('[data-action=submit]');recheck=modal.querySelector('[data-action=check]');filter=modal.querySelector('select');all=modal.querySelector('thead input');clear=modal.querySelector('[data-action=clear]');exportButton=modal.querySelector('[data-action=export]');
   input.addEventListener('change',readFile);filter.onchange=render;
   all.onchange=()=>{if(!state||!allowed(state)||state.phase!=='ready')return;state.rows.filter(r=>r.status==='ready').forEach(r=>r.selected=all.checked);render();};
   recheck.onclick=()=>{if(state?.file&&!blocked(state))void(state.rows.length?checkRows():readFile());};
   submit.onclick=()=>void save();exportButton.onclick=()=>void exportReview();
   clear.onclick=async()=>{const s=state,e=s?.epoch;if(!s||blocked(s)||!allowed(s))return;if(await root.CoopDialog.confirm('이 검토 목록을 비울까요?')&&same(s)&&s.epoch===e&&allowed(s)&&visible()){clearDraft();state={owner:context().owner,epoch:0,rows:[],phase:'idle',message:'',dirty:false,file:null};render();}};
   modal.querySelector('[data-action=template]').onclick=()=>void template();
   modal.querySelector('[data-action=help]').onclick=()=>{if(root.CoopWorkflowHelp?.visible()===false)return;const message=modal.querySelector('[data-action=help]').dataset.workflowHelp;void root.CoopDialog.alert(root.CoopWorkflowHelp?.format(message)||message,{title:'출자금 엑셀 도움말'});};
   modal.addEventListener('hide.bs.modal',event=>{if(state?.phase==='saving'){event.preventDefault();return;}stopRead();});
   modal.addEventListener('hidden.bs.modal',()=>{if(lastFocus?.isConnected&&!lastFocus.disabled)lastFocus.focus({preventScroll:true});});
   if(root.frameElement)new MutationObserver(()=>{if(root.frameElement.hidden)stopRead();}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
   root.addEventListener('beforeunload',event=>{if(state?.dirty){event.preventDefault();event.returnValue='';}});
  }
  function render() {
   if(!modal)return;
   const focusedRow=tbody.contains(document.activeElement)?document.activeElement?.dataset.rowNo:null;
   const s=state,can=!!s&&allowed(s),busy=!!s&&blocked(s),reading=s&&['reading','checking'].includes(s.phase),ready=s?.rows.filter(r=>r.status==='ready')||[],selected=ready.filter(r=>r.selected);
   input.disabled=!can||busy;recheck.disabled=!can||busy||reading||!s?.file;clear.disabled=!can||busy||reading||!s?.file;filter.disabled=!s?.rows.length;
   all.disabled=!can||s?.phase!=='ready'||!ready.length;all.checked=!!ready.length&&selected.length===ready.length;all.indeterminate=!!selected.length&&selected.length<ready.length;
   submit.textContent=s?.phase==='uncertain'?'같은 요청 다시 시도':'선택한 내역 등록';submit.disabled=!can||!['ready','uncertain'].includes(s?.phase)||(!selected.length&&s?.phase!=='uncertain');
   exportButton.disabled=!s?.rows.length||reading||s?.phase==='saving';
   status.textContent=s?.message||'';status.className='small mb-2 '+(s?.phase==='error'?'text-danger':s?.phase==='saved'?'text-success':'text-muted');
   const total=selected.reduce((sum,r)=>sum+BigInt(r.input.amount),0n);
   summary.textContent=s?.rows.length?`전체 ${s.rows.length}건 · 등록 가능 ${ready.length}건 · 선택 ${selected.length}건 / ${total.toLocaleString('ko-KR')}원`:'';
   tbody.replaceChildren();
   for(const row of s?.rows||[]) {
    if(filter.value==='ready'&&row.status!=='ready'||filter.value==='review'&&['ready','done'].includes(row.status))continue;
    const tr=document.createElement('tr'),td=document.createElement('td'),box=document.createElement('input');box.type='checkbox';box.className='form-check-input';box.dataset.erpQueryControl='';box.dataset.rowNo=String(row.input.row_no);box.setAttribute('aria-label',`${row.input.row_no}행 선택`);box.checked=!!row.selected;box.disabled=!can||s.phase!=='ready'||row.status!=='ready';box.onchange=()=>{if(!same(s)||!allowed(s)||s.phase!=='ready')return;row.selected=box.checked;render();};td.append(box);tr.append(td);
    const v=row.review||row.input;
    for(const val of [row.input.row_no,v.member_id||'-',v.name||'-',row.input.date||row.source[2],row.input.amount==null?String(row.source[3]):Number(row.input.amount).toLocaleString('ko-KR')+'원',row.status==='ready'?'등록 가능':row.status==='done'?'등록 완료':row.reason||'검사 전']){const cell=document.createElement('td');cell.textContent=String(val??'');tr.append(cell);}
    tbody.append(tr);
   }
   if(focusedRow)Array.from(tbody.querySelectorAll('input')).find(n=>n.dataset.rowNo===focusedRow&&!n.disabled)?.focus({preventScroll:true});
  }
  async function readFile() {
   const s=state;if(!s||!allowed(s)||blocked(s))return;
   const file=input.files?.[0]||s.file;if(!file)return;stopRead();s.file=file;s.rows=[];s.attempt=null;s.phase='reading';s.message='파일을 읽는 중입니다…';s.dirty=true;const epoch=s.epoch;render();
   try {
    if(file.size>MAX_BYTES||!/\.(xlsx|csv)$/i.test(file.name))throw Error('10MB 이하의 엑셀(.xlsx) 또는 CSV 파일을 선택해 주세요.');
    await ensureSpreadsheet();if(!same(s)||!allowed(s)||s.epoch!==epoch||!visible())return;
    const bytes=await file.arrayBuffer();if(!same(s)||!allowed(s)||s.epoch!==epoch||!visible())return;
    const wb=root.XLSX.read(bytes,{type:'array',raw:true,cellFormula:true,cellDates:false,sheetRows:10002});
    s.rows=normalizeWorkbook(wb,root.XLSX);s.phase='needs_check';await checkRows(true);
   } catch(error){if(same(s)&&s.epoch===epoch){s.phase='error';s.message=error.message||'파일을 읽지 못했습니다. 다시 선택해 주세요.';render();}}
  }
  async function checkRows(first=false) {
   const s=state;if(!s||!allowed(s)||blocked(s)||!visible())return;
   stopRead();const epoch=s.epoch;s.phase='checking';s.message='조합원과 기존 납입 내역을 확인하는 중입니다…';s.attempt=null;render();
   const valid=s.rows.filter(r=>r.status!=='done'&&r.input.amount!==null&&r.input.date&&(r.input.member_id||r.input.name)&&r.status!=='local_error'&&!r.localError);
   // Local errors (including formulas) never reach the server.
   for(const r of s.rows)if(r.status==='error'&&!r.review)r.localError=true;
   const rows=valid.filter(r=>!r.localError);
   if(!rows.length){s.phase='ready';s.message='파일에서 확인이 필요한 항목을 수정해 주세요.';render();return;}
   const controller=new AbortController();s.abort=controller;const timer=setTimeout(()=>controller.abort(),15000);
   try {
    let query=client.rpc('capital_import_admin',{p_action:'preview',p_coop_id:context().coopId,p_rows:rows.map(r=>r.input),p_request_key:null});
    if(typeof query.abortSignal==='function')query=query.abortSignal(controller.signal);
    const {data,error}=await query;if(!same(s)||s.epoch!==epoch||!allowed(s)||!visible())return;
    if(error)throw error;if(data?.outcome!=='preview'||!Array.isArray(data.rows)||data.rows.length!==rows.length)throw Error('검사 결과를 확인하지 못했습니다. 다시 검사해 주세요.');
    const byNo=new Map(data.rows.map(r=>[r.row_no,r]));
    for(const row of rows){const r=byNo.get(row.input.row_no);if(!r||!['ready','error','duplicate'].includes(r.status)||r.status==='ready'&&!r.expected)throw Error('검사 결과를 확인하지 못했습니다. 다시 검사해 주세요.');row.review=r;row.status=r.status;row.reason=r.reason||'';row.selected=r.status==='ready'&&(first||row.selected);}
    s.phase='ready';s.message='대상과 납입일·금액을 확인한 뒤 등록할 내역을 선택해 주세요.';
   } catch(error){if(same(s)&&s.epoch===epoch){s.phase='error';s.message=error.code==='42501'?'현재 권한으로는 출자금을 일괄등록할 수 없습니다.':'검사 결과를 불러오지 못했습니다. 다시 검사해 주세요.';}}
   finally {clearTimeout(timer);if(same(s)&&s.epoch===epoch){s.abort=null;render();}}
  }
  async function save() {
   const s=state;if(!s||!allowed(s)||!visible()||!['ready','uncertain'].includes(s.phase))return;
   if(!s.attempt){const selected=s.rows.filter(r=>r.status==='ready'&&r.selected);if(!selected.length)return;s.attempt={key:root.crypto.randomUUID(),rows:selected.map(r=>({...r.input,member_id:r.review.member_id,name:r.review.name,expected:r.review.expected})),total:selected.reduce((sum,r)=>sum+BigInt(r.input.amount),0n).toString()};}
   const attempt=s.attempt,epoch=s.epoch,wasUncertain=s.phase==='uncertain';s.retrying=wasUncertain;s.phase='confirming';render();
   const yes=await root.CoopDialog.confirm(`${attempt.rows.length}건 / ${BigInt(attempt.total).toLocaleString('ko-KR')}원을 등록할까요?`,{title:'출자금 일괄등록',confirmText:'등록'});
   if(!same(s)||s.epoch!==epoch||!allowed(s)||!visible())return;
   if(!yes){s.phase=wasUncertain?'uncertain':'ready';if(!wasUncertain)s.attempt=null;render();return;}
   s.phase='saving';s.message='선택한 출자금을 등록하는 중입니다…';render();
   try {
    const {data,error}=await client.rpc('capital_import_admin',{p_action:'apply',p_coop_id:context().coopId,p_rows:attempt.rows,p_request_key:attempt.key});
    if(!same(s))return;
    if(error){if(['PT409','22023','42501','55000'].includes(error.code)){s.phase='needs_check';s.attempt=null;s.message=error.code==='42501'?'현재 권한으로는 등록할 수 없습니다.': '내역이 달라졌습니다. 다시 검사해 주세요.';}else{s.phase='uncertain';s.message='등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.';}render();return;}
    if(data?.outcome!=='saved'||data.count!==attempt.rows.length)throw Error('UNCONFIRMED');
    const completed=new Set(attempt.rows.map(r=>r.row_no));for(const r of s.rows)if(completed.has(r.input.row_no)){r.status='done';r.selected=false;}
    s.phase='saved';s.attempt=null;s.dirty=s.rows.some(r=>r.status!=='done');s.message=`출자금 ${data.count}건을 등록했습니다.`+(Number(data.pending_activation_count)>0?' 승인 대기 조합원은 가입 승인 목록에서 확인해 주세요.':'');if(!s.dirty)root.ErpWorkspaceResume?.checkpoint(input);render();
    if(allowed(s)&&visible())try{if(await refresh?.()===false)throw Error('REFRESH');}catch(_){if(same(s)){s.message='출자금은 등록했습니다. 목록을 다시 불러와 주세요.';render();}}
   }catch(_){if(same(s)){s.phase='uncertain';s.message='등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.';render();}}
  }
  async function template() {
   const s=state;if(!s||!allowed(s))return;const epoch=s.epoch;
   try{await ensureSpreadsheet();if(!same(s)||!allowed(s)||s.epoch!==epoch||!visible())return;const wb=root.XLSX.utils.book_new(),ws=root.XLSX.utils.aoa_to_sheet([headers]);ws['!cols']=[{wch:22},{wch:20},{wch:14},{wch:16},{wch:18},{wch:40}];root.XLSX.utils.book_append_sheet(wb,ws,'출자금 납입내역');root.XLSX.writeFile(wb,'출자금_납입내역_양식.xlsx');}catch(_){if(same(s)&&s.epoch===epoch&&visible()){s.message='양식을 내려받지 못했습니다. 다시 시도해 주세요.';render();}}
  }
  async function exportReview() {
   const s=state;if(!s||!allowed(s)||!s.rows.length)return;const epoch=s.epoch;
   try{await ensureSpreadsheet();if(!same(s)||!allowed(s)||s.epoch!==epoch||!visible())return;const wb=root.XLSX.utils.book_new();const rows=[['원본 행',...headers,'검사 결과'],...s.rows.map(r=>[r.input.row_no,...r.source,r.status==='ready'?'등록 가능':r.status==='done'?'등록 완료':r.reason])];const ws=root.XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:10},{wch:22},{wch:20},{wch:14},{wch:16},{wch:18},{wch:40},{wch:65}];root.XLSX.utils.book_append_sheet(wb,ws,'검토 목록');root.XLSX.writeFile(wb,'출자금_검토목록.xlsx');}catch(_){if(same(s)&&s.epoch===epoch&&visible()){s.message='검토 목록을 내려받지 못했습니다. 다시 시도해 주세요.';render();}}
  }
  function open() {
   build();syncContext();const c=context();if(!c.allowed||!c.owner)return false;
   if(!state)state={owner:c.owner,epoch:0,file:null,rows:[],phase:'idle',message:'',dirty:false,attempt:null};
   lastFocus=document.activeElement;render();root.bootstrap.Modal.getOrCreateInstance(modal).show();
   if(state.file&&!blocked(state)) {
    const go=()=>void(state.rows.length?checkRows():readFile());
    if(modal.classList.contains('show'))go();else modal.addEventListener('shown.bs.modal',go,{once:true});
   }
   return true;
  }
  return Object.freeze({open,syncContext,clear:clearDraft});
 }
 root.CapitalExcelImport=Object.freeze({version:'1.0.0',create,normalizeWorkbook,parseAmount,parseDate});
})(window);
