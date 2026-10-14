/* v1.1.0 — Multiple local bank files, source dates and scoped candidates; no automatic writes. */
(function(host){
 'use strict';
 const MAX_ROWS=20000, MAX_FILE=5*1024*1024, MAX_FILES=10, MAX_BYTES=20*1024*1024;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function date(value,date1904=false){
  if(typeof value==='number' && Number.isFinite(value) && value>=(date1904?35064:36526) && value<=110000) return new Date(Date.UTC(1899,11,30)+(Math.floor(value)+(date1904?1462:0))*86400000).toISOString().slice(0,10);
  const raw=String(value??'').trim();const m=raw.match(/^(20\d{2})[./-]?(\d{2})[./-]?(\d{2})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);
  if(!m)return '';const d=`${m[1]}-${m[2]}-${m[3]}`,parsed=new Date(d+'T00:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===d?d:'';
 }
 function amount(value){if(value===undefined||value===null||String(value).trim()===''||String(value).trim()==='-')return 0;
  const v=String(value).trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(v))throw new Error('금액 형식을 확인해 주세요.');
  const n=Number(v.replaceAll(',',''));if(!Number.isSafeInteger(n))throw new Error('금액 범위를 확인해 주세요.');return n;}
 function bankRows(rows,map,header,date1904=false){
  if(!Array.isArray(rows)||rows.length>MAX_ROWS+51)throw new Error('2만 행 이하의 파일을 선택해 주세요.');
  if(!Number.isInteger(header)||header<0||header>=rows.length)throw new Error('제목 행을 확인해 주세요.');
  if(![map.date,map.deposit,map.withdrawal].every(n=>Number.isInteger(n)&&n>=0&&n<rows[header].length)||new Set([map.date,map.deposit,map.withdrawal]).size!==3)throw new Error('거래일·입금·출금 열을 각각 선택해 주세요.');
  const valid=[],invalid=[];
  for(let i=header+1;i<rows.length;i++){
   const row=rows[i];if(!row?.some(v=>String(v??'').trim()))continue;
   try{const d=date(row[map.date],date1904),deposit=amount(row[map.deposit]),withdrawal=amount(row[map.withdrawal]);
    if(!d||!(deposit>0||withdrawal>0)||deposit>0&&withdrawal>0)throw new Error('거래일 또는 입출금 구분 확인');
    valid.push({line:i+1,date:d,deposit,withdrawal,description:map.description>=0?String(row[map.description]??'').slice(0,1000):''});
   }catch(_){invalid.push(i+1);}
  }
  if(!valid.length)throw new Error('비교할 거래가 없습니다. 제목 행과 열 선택을 확인해 주세요.');return {valid,invalid};
 }
 function compare(bank,ledger,days){
  if(!Number.isInteger(days)||days<0||days>30)throw new Error('날짜 차이는 0~30일로 입력해 주세요.');
  const buckets=new Map(),ids=new Set();let excluded=0;
  for(const row of ledger){
   const signed=v=>{const str=String(v??'');if(!/^-?\d+$/.test(str)||!Number.isSafeInteger(Number(str)))throw new Error('장부 금액을 확인해 주세요.');return Number(str);};
   const deposit=signed(row.deposit),withdrawal=signed(row.withdrawal);
   if(!date(row.date)||!row.trans_id||!['보통예금','당좌예금'].includes(row.account))throw new Error('장부 자료를 다시 불러와 주세요.');
   const id=JSON.stringify([row.trans_id,row.date,row.account]);if(ids.has(id))throw new Error('장부가 조회 중 변경되었습니다. 다시 비교해 주세요.');ids.add(id);
   if(deposit<0||withdrawal<0||!(deposit>0||withdrawal>0)||deposit>0&&withdrawal>0){excluded++;continue;}
   const key=deposit?'in:'+deposit:'out:'+withdrawal;const group=buckets.get(key)||[];group.push({...row,deposit,withdrawal,id,time:new Date(row.date).getTime()});buckets.set(key,group);
  }
  for(const group of buckets.values()){group.sort((a,b)=>a.time-b.time);group.changes=new Int32Array(group.length+1);group.use=new Int32Array(group.length);}
  const bound=(group,time,upper)=>{let lo=0,hi=group.length;while(lo<hi){const mid=(lo+hi)>>1;if(group[mid].time<time||upper&&group[mid].time===time)lo=mid+1;else hi=mid;}return lo;};
  const out=bank.map(row=>{
   const key=row.deposit?'in:'+row.deposit:'out:'+row.withdrawal,t=new Date(row.date).getTime();
   const group=buckets.get(key)||[],lo=bound(group,t-days*86400000,false),hi=bound(group,t+days*86400000,true);
   if(hi>lo){group.changes[lo]++;group.changes[hi]--;}
   return {bank:row,group,lo,hi};
  });
  for(const group of buckets.values()){let used=0;for(let i=0;i<group.length;i++){used+=group.changes[i];group.use[i]=used;}}
  const result=out.map(({bank,group,lo,hi})=>{const candidateCount=hi-lo,candidates=group.slice(lo,Math.min(hi,lo+20));return {bank,candidates,candidateCount,status:!candidateCount?'장부 후보 없음':candidateCount>1||group.use[lo]>1?'여러 거래와 겹침':candidates[0].date===bank.date?'날짜·금액 일치 후보':'날짜 차이 확인'};});result.excludedLedger=excluded;return result;
 }
 function checkZip(bytes){
  const v=new DataView(bytes),len=v.byteLength;let end=-1;
  for(let p=len-22;p>=Math.max(0,len-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0)throw new Error('암호화되지 않은 XLSX 또는 CSV로 저장해 주세요.');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
  if(count>1000||count===0||start+size>end)throw new Error('파일 구성을 확인할 수 없습니다.');let p=start,total=0;
  for(let i=0;i<count;i++){
   if(p+46>start+size||v.getUint32(p,true)!==0x02014b50)throw new Error('손상된 XLSX 파일입니다.');
   const flags=v.getUint16(p+8,true),uncompressed=v.getUint32(p+24,true),nameLen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true);
   if(p+46+nameLen+extra+comment>start+size)throw new Error('손상된 XLSX 파일입니다.');
   const name=new TextDecoder().decode(new Uint8Array(bytes,p+46,nameLen));total+=uncompressed;
   if(flags&1||uncompressed>20*1024*1024||total>50*1024*1024||/vbaProject|\.bin$|(^|\/)\.\.\//i.test(name))throw new Error('암호화·매크로 또는 너무 큰 파일은 읽을 수 없습니다. CSV로 저장해 주세요.');p+=46+nameLen+extra+comment;
  }
 }
 async function loadLedger(client,coop,start,end,current){
  const all=[];let total=null,editable=false;
  for(let offset=0;offset<=50000;offset+=500){
   if(!current())throw new Error('대상이 변경되었습니다. 다시 열어 주세요.');
   const r=await client.rpc('erp_get_bank_compare_rows',{p_start:start,p_end:end,p_offset:offset});
   if(r.error)throw new Error('장부 조회 권한과 연결 상태를 확인해 주세요.');
   const d=r.data;if(!current()||d?.coop_id!==coop||d.offset!==offset||d.page_size!==500||!Array.isArray(d.items)||!Number.isSafeInteger(d.total)||d.total>50000||d.total<0)throw new Error('장부 자료를 다시 불러와 주세요.');
   if(total!==null&&total!==d.total)throw new Error('장부가 조회 중 변경되었습니다. 다시 비교해 주세요.');total=d.total;editable=d.editable===true;
   if(d.items.length!==Math.min(500,Math.max(0,total-offset)))throw new Error('장부 일부를 읽지 못했습니다. 기간을 줄여 다시 확인해 주세요.');
   all.push(...d.items);if(all.length===total)return {rows:all,editable};
  }throw new Error('조회 기간을 줄여 주세요.');
 }
 const patterns={date:/거래일|거래일시|일자|날짜/,deposit:/입금|맡기신|받으신/,withdrawal:/출금|찾으신|보내신/,description:/적요|입금자|내용|거래내역|내통장.*메모|메모/};
 function columns(row){return Object.fromEntries(Object.entries(patterns).map(([key,re])=>[key,row.findIndex(v=>re.test(String(v??'')))]));}
 function detectHeader(rows){
  for(let i=0;i<Math.min(50,rows.length);i++){const map=columns(rows[i]||[]);if([map.date,map.deposit,map.withdrawal].every(n=>n>=0)&&new Set([map.date,map.deposit,map.withdrawal]).size===3)return {header:i,map};}
  return {header:0,map:columns(rows[0]||[])};
 }
 function collectFiles(files){
  if(!files.length)throw new Error('통장 거래 파일을 선택해 주세요.');
  const banks=[],invalid=[];
  for(const f of files){let parsed;try{parsed=bankRows(f.rows,f.map,f.header,f.workbook?.Workbook?.WBProps?.date1904===true);}catch(e){throw new Error(`${f.name}: ${e.message}`);}
   banks.push(...parsed.valid.map(row=>({...row,source:f.name,sourceId:f.id,sheet:f.sheet})));
   if(banks.length>MAX_ROWS)throw new Error('전체 통장 거래는 2만 건 이하로 나누어 대조해 주세요.');
   if(parsed.invalid.length)invalid.push({source:f.name,lines:parsed.invalid});
  }
  const dates=banks.map(row=>row.date).sort();return {banks,invalid,start:dates[0],end:dates[dates.length-1]};
 }
 const shiftDate=(value,days)=>new Date(new Date(value+'T00:00:00Z').getTime()+days*86400000).toISOString().slice(0,10);
 function candidatePeriods(banks,days){
  if(!Number.isInteger(days)||days<0||days>30)throw new Error('날짜 차이는 0~30일로 입력해 주세요.');
  const dates=[...new Set(banks.map(row=>date(row.date)))].sort();if(!dates.length||dates.some(d=>!d))throw new Error('거래일을 확인해 주세요.');
  const ranges=[];
  for(const d of dates){const start=shiftDate(d,-days),end=shiftDate(d,days),last=ranges[ranges.length-1];
   if(last&&start<=shiftDate(last.end,30))last.end=end;else ranges.push({start,end});
  }
  const periods=[];for(const r of ranges){let start=r.start;while(start<=r.end){const end=[shiftDate(start,370),r.end].sort()[0];periods.push({start,end});start=shiftDate(end,1);}}
  if(periods.length>60)throw new Error('거래 기간이 너무 넓습니다. 파일을 나누어 대조해 주세요.');
  return periods;
 }
 async function loadPeriods(client,coop,periods,current){
  const rows=[];let editable=true;
  for(const period of periods){const data=await loadLedger(client,coop,period.start,period.end,current);editable=editable&&data.editable;
   rows.push(...data.rows);if(rows.length>50000)throw new Error('장부 후보가 5만 건을 넘습니다. 파일을 나누어 대조해 주세요.');
  }return {rows,editable};
 }
 function workbookFile(bytes,name){
  let input=bytes,type='array';
  if(/\.xlsx$/i.test(name))checkZip(bytes);
  else{try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){input=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}
   if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)||/^\s*</.test(input))throw new Error('텍스트 CSV 파일을 선택해 주세요.');type='string';}
  const workbook=host.XLSX.read(input,{type,sheetRows:MAX_ROWS+52,cellFormula:true,cellHTML:false,raw:true});
  if(!workbook.SheetNames.length||workbook.SheetNames.length>30)throw new Error('거래 시트만 저장해 주세요.');
  for(const name of workbook.SheetNames){const ws=workbook.Sheets[name];const range=host.XLSX.utils.decode_range(ws['!fullref']||ws['!ref']||'A1');
   if(range.e.r>MAX_ROWS+50||range.e.c>=100)throw new Error('2만 행·100열 이하의 거래 시트로 나누어 주세요.');
   if(Object.values(ws).some(cell=>cell?.f))throw new Error('수식이 없는 통장 원본 또는 CSV를 선택해 주세요.');}
  return workbook;
 }
 let state=null;
 function open(options){
  const context=options.context();if(!context?.coop_id)return;
  const owner=c=>`${c?.coop_id}|${c?.actor}|${c?.auth_user_id}`;
  if(state&&state.owner!==owner(context))clear();
  if(state){state.modal.show();return;}
  const s={owner:owner(context),root:el('div','modal fade'),seq:0,files:[],nextId:1,result:null,loading:false,runSerial:null};state=s;
  s.root.id='bankCompareModal';s.root.tabIndex=-1;s.root.setAttribute('aria-labelledby','bankCompareTitle');s.root.setAttribute('data-erp-readonly-dialog','true');s.root.style.wordBreak='keep-all';
  const box=el('div','modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable'),content=el('div','modal-content'),head=el('div','modal-header');
  const title=el('h5','modal-title fw-bold','통장 파일 대조');title.id='bankCompareTitle';const close=el('button','btn-close');close.type='button';close.setAttribute('aria-label','닫기');
  head.append(title,close);const body=el('div','modal-body');body.append(el('p','text-muted','XLSX·CSV 파일을 읽어 장부의 확인 후보를 보여줍니다. 파일은 서버로 전송하지 않으며, 날짜나 금액은 자동으로 수정하지 않습니다.'));
  function field(parent,key,label,type,value){const col=el('div','col-md-4'),l=el('label','form-label',label),input=el(type==='select'?'select':'input','form-control');input.id='bankCompare'+key;l.htmlFor=input.id;if(type!=='select')input.type=type;if(value!==undefined)input.value=value;input.dataset.erpQueryControl='true';col.append(l,input);parent.append(col);return input;}
  const grid=el('div','row g-3'),file=field(grid,'file','통장 파일 추가 (여러 개 선택)','file');file.accept='.xlsx,.csv';file.multiple=true;file.parentElement.className='col-12';
  grid.append(el('div','small text-muted','파일당 5MB · 최대 10개, 전체 20MB · 통장 3개도 함께 선택할 수 있습니다.'));
  const fileList=el('div','mt-3'),advanced=el('details','mt-3'),advancedGrid=el('div','row g-3 mt-1');advanced.append(el('summary','fw-semibold','상세 설정'));
  const days=field(advancedGrid,'days','날짜가 다른 장부 후보도 찾기 (±일)','number','7');days.min='0';days.max='30';advanced.append(advancedGrid,el('p','small text-muted mt-2','통장 날짜와 장부 기록일이 다른 거래도 찾습니다. 0이면 같은 날짜만 비교하며, 날짜는 자동으로 바뀌지 않습니다.'));
  body.append(grid,fileList,advanced);const preview=el('div','small text-muted mt-3'),status=el('p','mt-3');status.setAttribute('role','status');const result=el('div','table-responsive');
  const run=el('button','btn btn-primary','대조하기'),clearFile=el('button','btn btn-outline-secondary','파일 비우기');run.type=clearFile.type='button';const foot=el('div','modal-footer');foot.append(clearFile,run);body.append(preview,status,result);content.append(head,body,foot);box.append(content);s.root.append(box);document.body.append(s.root);s.modal=new bootstrap.Modal(s.root,{backdrop:'static'});
  const current=serial=>state===s&&s.seq===serial&&owner(options.context())===s.owner&&!document.hidden&&!window.frameElement?.hidden;
  function invalidate(){++s.seq;s.result=null;result.replaceChildren();status.textContent='';}
  function refreshPreview(){try{const parsed=collectFiles(s.files);preview.textContent=`파일 ${s.files.length}개 · 거래 ${parsed.banks.length.toLocaleString('ko-KR')}건 · ${parsed.start} ~ ${parsed.end} 전체 대조`;}catch(e){preview.textContent=s.files.length?e.message:'';}}
  function readSheet(f){f.rows=host.XLSX.utils.sheet_to_json(f.workbook.Sheets[f.sheet],{header:1,defval:'',raw:true,blankrows:true});Object.assign(f,detectHeader(f.rows));}
  function renderFile(f){
   const card=el('div','border rounded p-3 mb-2'),bar=el('div','d-flex align-items-center justify-content-between gap-2'),label=el('strong','',f.name),remove=el('button','btn btn-sm btn-outline-secondary','제외');remove.type='button';bar.append(label,remove);card.append(bar);
   const summary=el('div','small text-muted mt-1'),details=el('details','mt-2'),inputs=el('div','row g-3 mt-1');details.append(el('summary','','파일 읽기 설정'));details.append(inputs);card.append(summary,details);
   const sheet=field(inputs,'sheet'+f.id,'시트','select'),header=field(inputs,'header'+f.id,'제목 행 번호','number',f.header+1);header.min='1';header.max=String(MAX_ROWS);const cols={};
   for(const name of f.workbook.SheetNames){const op=el('option','',name);op.value=name;sheet.append(op);}sheet.value=f.sheet;
   for(const [key,text] of Object.entries({date:'거래일 열',deposit:'입금액 열',withdrawal:'출금액 열',description:'적요·입금자 열 (선택)'}))cols[key]=field(inputs,key+f.id,text,'select');
   function rowSummary(){try{const p=bankRows(f.rows,f.map,f.header,f.workbook?.Workbook?.WBProps?.date1904===true);summary.textContent=`${f.sheet} · 제목 ${f.header+1}행 · 거래 ${p.valid.length.toLocaleString('ko-KR')}건${p.invalid.length?' · 제외된 행 '+p.invalid.length+'개':''}`;}catch(e){summary.textContent=e.message;details.open=true;}refreshPreview();}
   function mapping(){const row=f.rows[f.header]||[];for(const [key,select] of Object.entries(cols)){select.replaceChildren();const none=el('option','',key==='description'?'선택 안 함':'열 선택');none.value='-1';select.append(none);row.forEach((v,i)=>{const op=el('option','',`${i+1}열 · ${String(v??'').slice(0,80)}`);op.value=String(i);select.append(op);});select.value=String(f.map[key]);}rowSummary();}
   sheet.onchange=()=>{invalidate();f.sheet=sheet.value;readSheet(f);header.value=f.header+1;mapping();};
   header.oninput=()=>{invalidate();f.header=Number(header.value)-1;f.map=columns(f.rows[f.header]||[]);mapping();};
   for(const [key,input] of Object.entries(cols))input.onchange=()=>{invalidate();f.map[key]=Number(input.value);rowSummary();};
   remove.onclick=()=>{invalidate();s.files=s.files.filter(x=>x!==f);card.remove();refreshPreview();};mapping();fileList.append(card);
  }
  file.onchange=async()=>{if(s.loading)return;const selected=[...file.files];file.value='';if(!selected.length)return;invalidate();const serial=s.seq;s.loading=true;file.disabled=run.disabled=true;
   try{if(selected.length+s.files.length>MAX_FILES||selected.reduce((n,f)=>n+f.size,0)+s.files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw new Error('파일은 최대 10개, 전체 20MB까지 선택할 수 있습니다.');
    if(selected.some(f=>f.size>MAX_FILE||!/^.+\.(xlsx|csv)$/i.test(f.name)))throw new Error('파일당 5MB 이하의 XLSX·CSV를 선택해 주세요.');
    await host.ErpWorkflowAssets.load('spreadsheet');const added=[],hashes=new Set(s.files.map(f=>f.hash));let duplicate=0;
    for(const f of selected){const bytes=await f.arrayBuffer();if(!current(serial))return;const hash=Array.from(new Uint8Array(await host.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(!current(serial))return;
     if(hashes.has(hash)){duplicate++;continue;}const workbook=workbookFile(bytes,f.name);const item={id:s.nextId++,name:f.name,size:f.size,hash,workbook,sheet:workbook.SheetNames[0]};readSheet(item);added.push(item);hashes.add(hash);}
    if(!current(serial))return;s.files.push(...added);added.forEach(renderFile);refreshPreview();status.textContent=duplicate?`동일한 파일 ${duplicate}개는 중복 추가하지 않았습니다.`:'';
   }catch(e){if(current(serial))status.textContent=e.message||'파일을 읽지 못했습니다.';}finally{s.loading=false;file.disabled=run.disabled=false;}
  };
  days.addEventListener('input',invalidate);days.addEventListener('change',invalidate);
  clearFile.onclick=()=>{invalidate();file.value='';s.files=[];fileList.replaceChildren();refreshPreview();};
  run.onclick=async()=>{if(run.disabled||s.loading)return;invalidate();const serial=s.seq;s.runSerial=serial;run.disabled=true;
   try{const parsed=collectFiles(s.files),banks=parsed.banks,periods=candidatePeriods(banks,Number(days.value));
    status.textContent='통장 거래 날짜에 해당하는 장부를 불러오는 중…';const ledger=await loadPeriods(options.client,context.coop_id,periods,()=>current(serial));if(!current(serial))return;
    const compared=compare(banks,ledger.rows,Number(days.value));s.result=compared;
    status.textContent=`파일 ${s.files.length}개 · 통장 ${banks.length.toLocaleString('ko-KR')}건 · 장부 ${ledger.rows.length.toLocaleString('ko-KR')}건${compared.excludedLedger?' · 복합·조정 분개 '+compared.excludedLedger+'건은 별도 확인':''}${parsed.invalid.length?' · 제외된 행: '+parsed.invalid.map(f=>f.source+' '+f.lines.slice(0,20).join(', ')+'행'+(f.lines.length>20?' 외 '+(f.lines.length-20)+'행':'')).join(' / '):''}`;
    const table=el('table','table align-middle'),thead=el('thead'),tr=el('tr');['통장 거래','확인 결과','장부 후보'].forEach(t=>tr.append(el('th','',t)));thead.append(tr);table.append(thead);const tbody=el('tbody');
    function renderPage(page){tbody.replaceChildren();const pageRows=compared.slice(page*100,(page+1)*100);for(const row of pageRows){const tr=el('tr'),b=el('td','',`${row.bank.date} · ${row.bank.deposit?'입금':'출금'} ${(row.bank.deposit||row.bank.withdrawal).toLocaleString('ko-KR')}원`);b.append(el('div','small text-muted',`${row.bank.source} · ${row.bank.sheet} · ${row.bank.line}행 · ${row.bank.description}`));tr.append(b,el('td','',row.status));const cell=el('td');
     for(const candidate of row.candidates.slice(0,20)){const d=el('div','mb-2',`${candidate.date} · ${candidate.account} · ${candidate.description||'적요 없음'}`);
      if(ledger.editable&&options.canEdit()){const button=el('button','btn btn-sm btn-outline-primary d-block mt-1','전표 날짜 확인');button.type='button';button.onclick=async()=>{if(!current(serial)||!options.canEdit())return;button.disabled=true;try{const check=await options.client.rpc('erp_get_bank_compare_rows',{p_start:candidate.date,p_end:candidate.date,p_offset:0});if(check.error||check.data?.coop_id!==context.coop_id||!check.data.editable||!current(serial))throw new Error('현재 회계 권한을 확인하지 못했습니다. 다시 열어 주세요.');const closed=new Promise(resolve=>s.root.addEventListener('hidden.bs.modal',resolve,{once:true}));s.modal.hide();await closed;if(owner(options.context())!==s.owner)return;await options.edit(candidate.trans_id);invalidate();}catch(e){if(state===s)status.textContent=e.message;}finally{button.disabled=false;}};d.append(button);}cell.append(d);}
     if(!row.candidates.length)cell.append(el('span','text-muted','해당 기간·금액의 후보 없음'));else if(row.candidateCount>20)cell.append(el('span','small text-muted',`후보 총 ${row.candidateCount.toLocaleString('ko-KR')}건 중 20건 표시 · 같은 금액의 거래를 개별 확인해 주세요.`));tr.append(cell);tbody.append(tr);
    }pageLabel.textContent=`${page*100+1}~${Math.min((page+1)*100,compared.length)} / 전체 ${compared.length.toLocaleString('ko-KR')}건`;prev.disabled=page===0;next.disabled=(page+1)*100>=compared.length;s.page=page;}
    const pager=el('div','d-flex justify-content-between align-items-center gap-2 mt-2'),prev=el('button','btn btn-sm btn-outline-secondary','이전'),next=el('button','btn btn-sm btn-outline-secondary','다음'),pageLabel=el('span','small text-muted');prev.type=next.type='button';prev.onclick=()=>{if(current(serial))renderPage(s.page-1);};next.onclick=()=>{if(current(serial))renderPage(s.page+1);};pager.append(prev,pageLabel,next);table.append(tbody);result.append(table,pager);renderPage(0);
   }catch(e){if(current(serial))status.textContent=e.message||'대조하지 못했습니다.';}finally{if(s.runSerial===serial){s.runSerial=null;run.disabled=s.loading;}}
  };
  close.onclick=()=>s.modal.hide();s.root.addEventListener('hidden.bs.modal',()=>{++s.seq;s.runSerial=null;run.disabled=s.loading;s.result=null;result.replaceChildren();status.textContent='';});
  s.subscription=options.client.auth?.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==options.context()?.auth_user_id)clear();})?.data?.subscription;
  s.modal.show();
 }
 function clear(){if(!state)return;state.seq++;state.subscription?.unsubscribe();state.modal.hide();state.modal.dispose();state.root.remove();state=null;}
 host.CoopBankCompare=Object.freeze({open,clear,date,amount,bankRows,compare,checkZip,loadLedger,detectHeader,collectFiles,candidatePeriods,loadPeriods,workbookFile});
})(window);
