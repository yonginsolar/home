/* v1.0.2 — Local workbook reading, scoped ledger candidates, no automatic writes. */
(function(host){
 'use strict';
 const MAX_ROWS=20000, MAX_FILE=5*1024*1024;
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
  if(!Array.isArray(rows)||rows.length>MAX_ROWS+1)throw new Error('2만 행 이하의 파일을 선택해 주세요.');
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
   const key=deposit?'in:'+deposit:'out:'+withdrawal;const group=buckets.get(key)||[];group.push({...row,deposit,withdrawal,id});buckets.set(key,group);
  }
  const use=new Map();const out=bank.map(row=>{
   const key=row.deposit?'in:'+row.deposit:'out:'+row.withdrawal,t=new Date(row.date).getTime();
   const candidates=(buckets.get(key)||[]).filter(x=>Math.abs(new Date(x.date).getTime()-t)<=days*86400000);
   for(const c of candidates)use.set(c.id,(use.get(c.id)||0)+1);
   return {bank:row,candidates};
  });
  const result=out.map(row=>({...row,status:!row.candidates.length?'장부 후보 없음':row.candidates.length>1||row.candidates.some(c=>use.get(c.id)>1)?'여러 거래와 겹침':row.candidates[0].date===row.bank.date?'날짜·금액 일치 후보':'날짜 차이 확인'}));result.excludedLedger=excluded;return result;
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
 let state=null;
 function open(options){
  const context=options.context();if(!context?.coop_id)return;
  if(state&&state.owner!==`${context.coop_id}|${context.actor}`)clear();
  if(state){state.modal.show();return;}
  const s={owner:`${context.coop_id}|${context.actor}`,root:el('div','modal fade'),seq:0,rows:[],result:null};state=s;
  s.root.id='bankCompareModal';s.root.tabIndex=-1;s.root.setAttribute('aria-labelledby','bankCompareTitle');s.root.setAttribute('data-erp-readonly-dialog','true');s.root.style.wordBreak='keep-all';
  const box=el('div','modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable'),content=el('div','modal-content'),head=el('div','modal-header');
  const title=el('h5','modal-title fw-bold','통장 파일 대조');title.id='bankCompareTitle';const close=el('button','btn-close');close.type='button';close.setAttribute('aria-label','닫기');
  head.append(title,close);const body=el('div','modal-body');body.append(el('p','text-muted','XLSX·CSV 파일을 읽어 장부의 확인 후보를 보여줍니다. 파일은 서버로 전송하지 않으며, 날짜나 금액은 자동으로 수정하지 않습니다.'));
  const grid=el('div','row g-3'),fields={};
  function field(key,label,type,value){const col=el('div','col-md-4'),l=el('label','form-label',label),input=el(type==='select'?'select':'input','form-control');input.id='bankCompare'+key;l.htmlFor=input.id;if(type!=='select')input.type=type;if(value!==undefined)input.value=value;input.dataset.erpQueryControl='true';col.append(l,input);grid.append(col);fields[key]=input;return input;}
  const file=field('file','통장 거래 파일','file');file.accept='.xlsx,.csv';
  const sheet=field('sheet','시트','select'),header=field('header','제목 행 번호','number','1');header.min='1';header.max=String(MAX_ROWS);
  const cols={date:field('date','거래일 열','select'),deposit:field('deposit','입금액 열','select'),withdrawal:field('withdrawal','출금액 열','select'),description:field('description','적요·입금자 열 (선택)','select')};
  const start=field('start','조회 시작일','date',`${context.year}-01-01`),end=field('end','조회 종료일','date',`${context.year}-12-31`),days=field('days','후보 날짜 차이 (일)','number','7');days.min='0';days.max='30';
  body.append(grid);const preview=el('div','small text-muted mt-3'),status=el('p','mt-3');status.setAttribute('role','status');const result=el('div','table-responsive');
  const run=el('button','btn btn-primary','대조하기'),clearFile=el('button','btn btn-outline-secondary','파일 비우기');run.type=clearFile.type='button';const foot=el('div','modal-footer');foot.append(clearFile,run);body.append(preview,status,result);content.append(head,body,foot);box.append(content);s.root.append(box);document.body.append(s.root);s.modal=new bootstrap.Modal(s.root,{backdrop:'static'});
  const current=serial=>state===s&&s.seq===serial&&`${options.context()?.coop_id}|${options.context()?.actor}`===s.owner&&!document.hidden&&!window.frameElement?.hidden;
  function invalidate(){++s.seq;s.result=null;result.replaceChildren();status.textContent='';}
  function mapping(){const index=Number(header.value)-1;const row=s.rows[index]||[];if(!row.length){preview.textContent='제목 행 번호를 확인해 주세요.';return;}
   for(const [key,select] of Object.entries(cols)){select.replaceChildren();const none=el('option','',key==='description'?'선택 안 함':'열 선택');none.value='-1';select.append(none);row.forEach((v,i)=>{const op=el('option','',`${i+1}열 · ${String(v??'').slice(0,80)}`);op.value=String(i);select.append(op);});
    const patterns={date:/거래일|거래일시|일자|날짜/,deposit:/입금|맡기신|받으신/,withdrawal:/출금|찾으신|보내신/,description:/적요|입금자|내용|거래내역/};const found=row.findIndex(v=>patterns[key].test(String(v??'')));if(found>=0)select.value=String(found);
   }preview.textContent=`제목 행: ${row.map(v=>String(v??'').slice(0,40)).join(' · ')}. 실제 열 선택을 확인해 주세요.`;}
  let workbook=null;
  sheet.onchange=()=>{invalidate();const ws=workbook?.Sheets[sheet.value];if(!ws)return;s.rows=host.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:true});mapping();};
  file.onchange=async()=>{invalidate();const serial=s.seq;workbook=null;s.rows=[];sheet.replaceChildren();for(const select of Object.values(cols))select.replaceChildren();preview.textContent='';const f=file.files[0];if(!f)return;
   try{if(f.size>MAX_FILE||!/^.+\.(xlsx|csv)$/i.test(f.name))throw new Error('5MB 이하의 XLSX·CSV 파일을 선택해 주세요.');
    await host.ErpWorkflowAssets.load('spreadsheet');const bytes=await f.arrayBuffer();if(!current(serial))return;
    let input=bytes,type='array';
    if(/\.xlsx$/i.test(f.name))checkZip(bytes);
    else{try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){input=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)||/^\s*</.test(input))throw new Error('텍스트 CSV 파일을 선택해 주세요.');type='string';}
    workbook=host.XLSX.read(input,{type,sheetRows:MAX_ROWS+2,cellFormula:true,cellHTML:false,raw:true});
    if(workbook.SheetNames.length>30)throw new Error('시트 수가 너무 많습니다. 거래 시트만 저장해 주세요.');
    for(const name of workbook.SheetNames){const ws=workbook.Sheets[name];if(ws['!fullref']){const range=host.XLSX.utils.decode_range(ws['!fullref']);if(range.e.r>MAX_ROWS)throw new Error('2만 행 이하로 나누어 주세요.');}
     if(Object.values(ws).some(cell=>cell?.f))throw new Error('수식이 없는 통장 원본 또는 CSV를 선택해 주세요.');const op=el('option','',name);op.value=name;sheet.append(op);}
    if(!current(serial))return;sheet.onchange();
   }catch(e){if(current(serial)){workbook=null;s.rows=[];status.textContent=e.message;}}
  };
  header.onchange=()=>{invalidate();mapping();};header.addEventListener('input',invalidate);for(const input of [...Object.values(cols),start,end,days]){input.addEventListener('change',invalidate);input.addEventListener('input',invalidate);}
  clearFile.onclick=()=>{invalidate();file.value='';workbook=null;s.rows=[];sheet.replaceChildren();preview.textContent='';for(const input of Object.values(cols))input.replaceChildren();};
  run.onclick=async()=>{if(run.disabled)return;invalidate();const serial=s.seq;run.disabled=true;
   try{const parsed=bankRows(s.rows,Object.fromEntries(Object.entries(cols).map(([k,v])=>[k,Number(v.value)])),Number(header.value)-1,workbook?.Workbook?.WBProps?.date1904===true);
    if(!date(start.value)||!date(end.value)||end.value<start.value||new Date(end.value)-new Date(start.value)>370*86400000)throw new Error('조회 기간은 최대 1년 범위로 선택해 주세요.');
    const banks=parsed.valid.filter(row=>row.date>=start.value&&row.date<=end.value);if(!banks.length)throw new Error('조회 기간 안의 통장 거래가 없습니다.');
    status.textContent='해당 기간 장부를 불러오는 중…';const ledger=await loadLedger(options.client,context.coop_id,start.value,end.value,()=>current(serial));if(!current(serial))return;
    const compared=compare(banks,ledger.rows,Number(days.value));s.result=compared;
    status.textContent=`통장 ${banks.length.toLocaleString('ko-KR')}건 · 장부 ${ledger.rows.length.toLocaleString('ko-KR')}건${compared.excludedLedger?' · 복합·조정 분개 '+compared.excludedLedger+'건은 별도 확인':''}${parsed.invalid.length?' · 읽지 못한 행 '+parsed.invalid.slice(0,20).join(', ')+(parsed.invalid.length>20?' 외 '+(parsed.invalid.length-20)+'행':''):''}`;
    const table=el('table','table align-middle'),thead=el('thead'),tr=el('tr');['통장 거래','확인 결과','장부 후보'].forEach(t=>tr.append(el('th','',t)));thead.append(tr);table.append(thead);const tbody=el('tbody');
    for(const row of compared.slice(0,500)){const tr=el('tr'),b=el('td','',`${row.bank.date} · ${row.bank.deposit?'입금':'출금'} ${(row.bank.deposit||row.bank.withdrawal).toLocaleString('ko-KR')}원`);b.append(el('div','small text-muted',`파일 ${row.bank.line}행 · ${row.bank.description}`));tr.append(b,el('td','',row.status));const cell=el('td');
     for(const candidate of row.candidates.slice(0,20)){const d=el('div','mb-2',`${candidate.date} · ${candidate.account} · ${candidate.description||'적요 없음'}`);
      if(ledger.editable&&options.canEdit()){const button=el('button','btn btn-sm btn-outline-primary d-block mt-1','전표 날짜 확인');button.type='button';button.onclick=async()=>{if(!current(serial)||!options.canEdit())return;button.disabled=true;try{const check=await options.client.rpc('erp_get_bank_compare_rows',{p_start:start.value,p_end:end.value,p_offset:0});if(check.error||check.data?.coop_id!==context.coop_id||!check.data.editable||!current(serial))throw new Error('현재 회계 권한을 확인하지 못했습니다. 다시 열어 주세요.');const closed=new Promise(resolve=>s.root.addEventListener('hidden.bs.modal',resolve,{once:true}));s.modal.hide();await closed;if(`${options.context()?.coop_id}|${options.context()?.actor}`!==s.owner)return;await options.edit(candidate.trans_id);invalidate();}catch(e){if(state===s)status.textContent=e.message;}finally{button.disabled=false;}};d.append(button);}cell.append(d);}
     if(!row.candidates.length)cell.append(el('span','text-muted','해당 기간·금액의 후보 없음'));else if(row.candidates.length>20)cell.append(el('span','small text-muted',`외 ${row.candidates.length-20}건 · 기간을 줄여 확인`));tr.append(cell);tbody.append(tr);
    }table.append(tbody);result.append(table);if(compared.length>500)result.append(el('p','text-muted',`전체 ${compared.length}건 중 앞 500건 표시. 조회 기간을 줄여 나머지도 확인해 주세요.`));
   }catch(e){if(current(serial))status.textContent=e.message||'대조하지 못했습니다.';}finally{run.disabled=false;}
  };
  close.onclick=()=>s.modal.hide();s.root.addEventListener('hidden.bs.modal',()=>{++s.seq;run.disabled=false;s.result=null;result.replaceChildren();status.textContent='';});
  s.subscription=options.client.auth?.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==options.context()?.auth_user_id)clear();})?.data?.subscription;
  s.modal.show();
 }
 function clear(){if(!state)return;state.seq++;state.subscription?.unsubscribe();state.modal.hide();state.modal.dispose();state.root.remove();state=null;}
 host.CoopBankCompare=Object.freeze({open,clear,date,amount,bankRows,compare,checkZip,loadLedger});
})(window);
