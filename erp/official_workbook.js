/* 임원·사외이사·위원회 엑셀 등록 1.0.2 */
((root) => {
  'use strict';
  const specs = {
    '임원': ['official',{name:'이름',role:'직책',number:'조합원 번호',phone:'연락처',start:'임기 시작일',end:'임기 종료일'}],
    '사외이사': ['external',{name:'이름',phone:'연락처',email:'이메일',start:'임기 시작일',end:'임기 종료일'}],
    '위원회': ['committee',{committee:'위원회명',name:'이름',role:'역할',number:'조합원 번호',phone:'연락처',start:'활동 시작일',end:'활동 종료일',state:'활동 상태',note:'활동 내용'}]
  };
  const reasons = {fields:'이름과 날짜를 확인해 주세요.',role:'사용할 수 있는 직책인지 확인해 주세요.',committee_fields:'위원회명·역할·활동 상태를 확인해 주세요.',
    external_contact:'연락처와 이메일을 확인해 주세요.',external_member:'기존 조합원 정보와 겹칩니다. 사외이사 등록 대상을 확인해 주세요.',
    existing_term:'이미 같은 직책의 재임 또는 겹치는 임기가 있습니다.',multiple:'이름과 연락처가 같은 조합원이 여러 명입니다.',
    number:'조합원 번호가 일치하지 않습니다.',member:'자동으로 연결할 조합원을 찾지 못했습니다.',committee_multiple:'같은 이름의 위원회가 여러 개 있습니다.',
    committee_values:'같은 위원회의 활동 기간·상태·내용이 다릅니다.',committee_role:'이미 위원회에 다른 역할로 등록됐습니다.',
    committee_limit:'위원회 활동 기간 또는 최대 인원(100명)을 확인해 주세요.',file_conflict:'파일에 같은 대상의 서로 다른 정보가 있습니다.',
    registered:'이미 등록',duplicate_row:'파일에서 같은 행이 반복됩니다.',invalid:'양식의 열과 값을 확인해 주세요.'};
  const tidy = value => String(value ?? '').trim().normalize('NFC');
  const header = value => tidy(value).replace(/\s/g,'');
  const tokenFor = row => `${row.kind}:${row.row}`;
  let spreadsheet;
  function ensureSpreadsheet() {
    const ready=()=>root.XLSX?.version==='0.20.3'&&typeof root.XLSX.read==='function';
    if(ready())return Promise.resolve(root.XLSX);
    if(!spreadsheet)spreadsheet=new Promise((resolve,reject)=>{
      const s=document.createElement('script');let done=false;
      const finish=()=>{if(done)return;done=true;root.clearTimeout(timer);s.onload=s.onerror=null;
        if(ready())resolve(root.XLSX);else{s.remove();reject(Error('엑셀 도구를 불러오지 못했습니다. 다시 검사해 주세요.'));}};
      const timer=root.setTimeout(finish,12000);
      s.src='/shared/vendor/xlsx-0.20.3.full.min.js';s.integrity='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';s.crossOrigin='anonymous';
      s.onload=s.onerror=finish;document.head.append(s);
    }).catch(error=>{spreadsheet=null;throw error;});
    return spreadsheet;
  }
  function parse(bytes, xlsx) {
    const wb = xlsx.read(bytes,{type:'array',sheetRows:1501,cellFormula:true,cellHTML:false,cellDates:false});
    const rows = [];
    if (!wb.SheetNames.length || wb.SheetNames.some(name => !Object.hasOwn(specs,name))) throw Error('임원·사외이사·위원회 양식의 시트 이름을 확인해 주세요.');
    for (const sheet of wb.SheetNames) {
      const [kind,spec] = specs[sheet], ws=wb.Sheets[sheet];
      if (!ws?.['!ref']) continue;
      const range=xlsx.utils.decode_range(ws['!fullref']||ws['!ref']);
      if (range.e.r>1500 || range.e.c>40) throw Error(`${sheet} 시트의 불필요한 행이나 열을 정리해 주세요.`);
      const get=(r,c)=>ws[xlsx.utils.encode_cell({r,c})];
      const columns = {}, fields = Object.fromEntries(Object.entries(spec).map(([key,value])=>[header(value),key]));
      for(let col=0;col<=range.e.c;col++){
        const cell=get(0,col), label=header(cell?.v);
        if (!label && !cell?.f) continue;
        if (!Object.hasOwn(fields,label) || cell?.f || Object.hasOwn(columns,fields[label])) throw Error(`${sheet} 시트의 첫 행을 양식과 맞춰 주세요.`);
        columns[fields[label]]=col;
      }
      if (Object.keys(columns).length!==Object.keys(spec).length) throw Error(`${sheet} 시트의 첫 행을 양식과 맞춰 주세요.`);
      const used = new Set(Object.values(columns));
      for(let r=1;r<=range.e.r && r<1501;r++){
        let present=false, problem='';
        const data={kind,row:r+1};
        for(let c=0;c<=range.e.c;c++){
          const cell=get(r,c);
          if (!cell?.f && !tidy(cell?.v)) continue;
          present=true;
          if (!used.has(c)) problem='제목이 없는 열에 값이 있습니다.';
          if (cell.f || cell.t==='e') problem='수식이나 오류 대신 값을 입력해 주세요.';
        }
        if (!present) continue;
        for(const [field,c] of Object.entries(columns)){
          const cell=get(r,c), value=tidy(cell?.v);
          if ((field==='start'||field==='end') && cell?.t==='n') {
            const d=xlsx.SSF.parse_date_code(cell.v,{date1904:!!wb.Workbook?.WBProps?.date1904});
            data[field]=d&&d.y>=1900&&d.y<=9999&&Number.isInteger(cell.v)?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'날짜 오류';
          } else if (field==='start'||field==='end') {
            const d=/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*\.?$/.exec(value);
            data[field]=d?`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`:value;
          } else {
            data[field]=value;
            if (field==='phone' && cell?.t==='n') problem='연락처를 텍스트로 입력해 주세요.';
          }
          if (data[field].length>(field==='note'?5000:field==='email'?254:120)) problem='입력한 내용이 너무 깁니다.';
        }
        rows.push({sheet,data,problem});
        if(rows.length>300)throw Error('한 번에 300행까지 검토할 수 있습니다. 파일을 나눠 주세요.');
      }
    }
    if(!rows.length)throw Error('등록할 행이 없습니다.');
    return rows;
  }
  function create({client,button,getContext,ensureSpreadsheet:loadExcel=ensureSpreadsheet,refresh}) {
    const doc=document, make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
    const btn=(text,cls='btn btn-outline-secondary')=>{const n=make('button',text,cls);n.type='button';return n;};
    const modal=make('dialog',null,'official-workbook');modal.id='officialWorkbook';modal.setAttribute('aria-labelledby','officialWorkbookTitle');
    const head=make('header'), title=make('h2','엑셀로 임원·위원회 등록');title.id='officialWorkbookTitle';const close=btn('닫기');head.append(title,close);
    const tools=make('div',null,'official-workbook-tools'), template=make('a','양식 다운로드','btn btn-outline-secondary');
    template.href='/erp/assets/official-workbook-template.xlsx?v=1.0.1'; template.download='임원·위원회_등록_양식.xlsx';
    const fileLabel=make('label','엑셀 파일');const file=make('input',null,'form-control');file.id='officialWorkbookFile';file.type='file';file.accept='.xlsx';fileLabel.htmlFor=file.id;
    const check=btn('다시 검사','btn btn-outline-primary');tools.append(template,fileLabel,file,check);
    const status=make('p',null,'official-workbook-status');status.setAttribute('role','status');
    const list=make('div',null,'official-workbook-rows');list.setAttribute('aria-label','행별 검사 결과');
    const footer=make('footer');const save=btn('선택한 행 등록','btn btn-primary');footer.append(save);modal.append(head,tools,status,list,footer);doc.body.append(modal);
    let current, epoch=0, denyActor='', clicking=false, opener;
    const drafts=new Map();
    const context=()=>{const c=getContext();return c?.allowed&&c.coopId&&c.actorId&&c.actorId!==denyActor?{coop:c.coopId,actor:c.actorId,owner:`${c.coopId}|${c.actorId}`}:null;};
    const pendingKey=s=>`erp:official-workbook:pending:${s.owner}`;
    function readPending(s){try{const id=root.sessionStorage.getItem(pendingKey(s));return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||'')?id:null;}catch(_){return null;}}
    function remember(s,job){try{root.sessionStorage.setItem(pendingKey(s),job.id);}catch(_){} }
    function clearPending(s,job){try{if(readPending(s)===job.id)root.sessionStorage.removeItem(pendingKey(s));}catch(_){} }
    const visible=()=>!root.frameElement?.hidden;
    const same=s=>s===current&&context()?.owner===s.owner&&visible();
    const shown=(s,t)=>same(s)&&modal.open&&(t===undefined||epoch===t);
    function pause(restore=false){
      const origin=opener, wasInside=modal.contains(doc.activeElement);opener=null;
      ++epoch;if(current)current.reading=false;if(modal.open)modal.close();clicking=false;
      if(restore&&wasInside&&current&&same(current)&&origin?.isConnected&&!origin.disabled&&origin.getClientRects().length
        &&(doc.activeElement===doc.body||modal.contains(doc.activeElement)))origin.focus({preventScroll:true});
    }
    function sync(){if(button)button.hidden=!context(); if(modal.open&&!shown(current))pause();}
    function draft(c){
      if(!drafts.has(c.owner)){
        const id=readPending(c);
        drafts.set(c.owner,{...c,file:null,rows:[],result:[],picked:new Set(),
          job:id?{id,rows:null,running:false,checking:false,ready:false}:null,checked:false,reading:false,
          message:id?'이전 등록 결과를 먼저 확인해 주세요.':''});
      }
      return drafts.get(c.owner);
    }
    async function rpc(s,action,rows=[],key=null,preview=null,timeout=15000) {
      const controller = new AbortController();let timer;
      try{
        let request=client.rpc('official_workbook',{p_action:action,p_coop_id:s.coop,p_actor_uid:s.actor,p_rows:rows,p_request_key:key,p_preview:preview});
        if(timeout&&request.abortSignal)request=request.abortSignal(controller.signal);
        const r=timeout?await Promise.race([request,new Promise((_,reject)=>{timer=root.setTimeout(()=>{controller.abort();reject(Error('시간 초과'));},timeout);})]):await request;
        if(r.error)throw r.error;
        return r.data;
      }finally{root.clearTimeout(timer);}
    }
    const renderButtons=s=>{
      file.disabled=!!s.job||clicking;check.disabled=!s.file||s.reading||!!s.job||clicking;
      list.inert=clicking||!!s.job;
      save.disabled=clicking||s.reading||!!s.job?.checking||(!s.job&&(!s.checked||!s.picked.size));
      save.textContent=s.job?'등록 결과 확인':`선택한 ${s.picked.size}행 등록`;
      status.textContent=s.message||(!s.file?'양식에 입력한 뒤 파일을 선택해 주세요.':'');
    };
    function render(s) {
      if(!shown(s))return;
      list.replaceChildren();
      const byKey=new Map(s.result.map(r=>[tokenFor(r),r]));
      if(s.file)list.append(make('p',s.file.name,'official-workbook-name'));
      for(const item of s.rows){
        const row=item.data,key=tokenFor(row), r=byKey.get(key), card=make('article',null,'official-workbook-row');
        const heading=make('div',null,'official-workbook-row-title');
        heading.append(make('strong',`${item.sheet} ${row.row}행 · ${row.name||'이름 없음'}`));
        if(r?.state==='ready'){
          const select=make('input');select.type='checkbox';select.checked=s.picked.has(key);select.disabled=!!s.job;
          select.setAttribute('aria-label',`${item.sheet} ${row.row}행 등록 선택`);
          select.onchange=()=>{if(!shown(s)||s.job||clicking)return;if(select.checked)s.picked.add(key);else s.picked.delete(key);renderButtons(s);};heading.prepend(select);
        }
        card.append(heading,make('div',[row.committee,row.role,row.start||row.end?`${row.start||'—'} ~ ${row.end||'—'}`:'',row.state].filter(Boolean).join(' · ')));
        if(r?.matched)card.append(make('div',`연결: ${r.matched.name} · ${r.matched.number||'번호 없음'}`));
        if(row.selected&&r?.state!=='done'&&!s.job){const reset=btn('자동 연결 다시 확인');reset.onclick=()=>{if(shown(s)&&!s.reading&&!clicking){delete row.selected;void inspect(s,false,{keep:key});}};card.append(reset);}
        card.append(make('p',item.problem||(r?.state==='ready'?'등록 가능':reasons[r?.reason]||'검사 대기'),`official-workbook-${r?.state||'error'}`));
        if(r?.options && !s.job){
          const select=make('select',null,'form-select');select.setAttribute('aria-label',`${item.sheet} ${row.row}행 조합원 선택`);
          const prompt=make('option','연결할 조합원 선택');prompt.value='';select.append(prompt);
          const put=options=>{for(const person of options){if([...select.options].some(o=>o.value===person.id))continue;const o=make('option',`${person.name} · ${person.number||'번호 없음'}`);o.value=person.id;select.append(o);}};
          put(r.options);
          const search=make('input',null,'form-control');search.type='search';search.placeholder='이름 또는 조합원 번호';search.setAttribute('aria-label',`${row.row}행 조합원 직접 찾기`);
          const find=btn('조합원 찾기');const ctl=make('div',null,'official-workbook-pick');const hint=make('span');hint.setAttribute('role','status');
          ctl.append(search,find,select,hint);card.append(ctl);
          find.onclick=async()=>{const q=tidy(search.value),t=epoch;if(q.length<2){hint.textContent='두 글자 이상 입력해 주세요.';return;}find.disabled=true;
            try{const data=await rpc(s,'members',{query:q});if(shown(s,t)&&ctl.isConnected&&tidy(search.value)===q){put(data.rows||[]);hint.textContent=data.rows?.length?'목록에서 조합원을 선택해 주세요.':'일치하는 조합원이 없습니다.';}}
            catch(_){if(shown(s,t)&&ctl.isConnected)hint.textContent='조합원을 찾지 못했습니다. 다시 확인해 주세요.';}
            finally{find.disabled=false;}};
          select.onchange=()=>{if(!shown(s)||!select.value||s.reading||s.job)return;row.selected=select.value;void inspect(s,false,{keep:key});};
        }
        list.append(card);
      }
      renderButtons(s);
    }
    async function inspect(s,parseFile=true,{keep}={}) {
      if(!shown(s)||!s.file||s.reading||s.job)return;
      const t=++epoch, f=s.file, y=list.scrollTop;
      s.reading=true;s.readTicket=t;s.checked=false;s.message='엑셀 내용을 검사하고 있습니다.';renderButtons(s);
      try{
        if(parseFile){const x=await loadExcel();const bytes=await f.arrayBuffer();if(!shown(s,t)||s.file!==f)return;s.rows=parse(bytes,x);}
        const valid=s.rows.filter(i=>!i.problem).map(i=>i.data);
        const data=valid.length?await rpc(s,'preview',valid):{rows:[]};
        if(!shown(s,t)||s.file!==f)return;
        const old=s.result; s.result=data.rows||[];s.picked=new Set(s.result.filter(r=>r.state==='ready'&&(!keep||tokenFor(r)===keep||s.picked.has(tokenFor(r))||!old.some(o=>tokenFor(o)===tokenFor(r)&&o.state==='ready'))).map(tokenFor));
        s.checked=true;s.message=`등록 가능 ${s.result.filter(r=>r.state==='ready').length}행 · 확인 필요 ${s.rows.filter(i=>i.problem).length+s.result.filter(r=>r.state==='review'||r.state==='error').length}행`;
      }catch(error){if(shown(s,t))s.message=error.code==='42501'?'현재 권한으로 등록을 검토할 수 없습니다.':error instanceof Error && /[가-힣]/.test(error.message)?error.message:'검사를 마치지 못했습니다. 다시 검사해 주세요.';}
      finally{if(s.readTicket===t)s.reading=false;if(shown(s,t)){render(s);if(keep)list.scrollTop=y;}}
    }
    function finish(s,data){
      const saved=new Set((s.job.rows||[]).map(tokenFor));
      clearPending(s,s.job);
      s.job=null;s.checked=false;s.picked.clear();s.result=s.result.map(r=>saved.has(tokenFor(r))?{...r,state:'done',reason:'registered'}:r);s.message=`${data.count}행을 등록했습니다.`;
      if(shown(s))render(s);
      if(same(s))void Promise.resolve(refresh()).catch(()=>{});
    }
    function write(s,job){
      if(!shown(s)||s.job!==job||job.running)return;
      job.running=true; job.ready=false;s.message='등록하고 있습니다.';render(s);
      remember(s,job);
      const wait=root.setTimeout(()=>{if(s.job===job&&shown(s)){s.message='등록 결과가 아직 확인되지 않았습니다. 결과 확인을 눌러 주세요.';renderButtons(s);}},18000);
      void rpc(s,'save',job.rows,job.id,job.preview,0).then(data=>{
        if(s.job!==job)return;
        if(data.outcome==='saved')finish(s,data);
        else if(data.outcome==='changed'){clearPending(s,job);s.job=null;s.checked=false;s.message='검사 이후 내용이 바뀌었습니다. 다시 검사해 주세요.';}
        else s.message='등록 결과를 확인해 주세요.';
      }).catch(error=>{
        if(s.job!==job)return;
        if(['42501','22023','23505','22007','PT409','57014'].includes(error?.code)){clearPending(s,job);s.job=null;s.checked=false;s.message=error.code==='42501'?'현재 권한으로 등록할 수 없습니다.':'등록되지 않았습니다. 다시 검사해 주세요.';}
        else s.message='등록 결과가 아직 확인되지 않았습니다. 결과 확인을 눌러 주세요.';
      }).finally(()=>{root.clearTimeout(wait);job.running=false;if(shown(s))render(s);});
    }
    async function statusCheck(s,job){
      if(job.checking)return; job.checking=true;renderButtons(s);
      const t=epoch;
      try{
        const result=await rpc(s,'status',[],job.id);
        if(s.job!==job)return;if(result.outcome==='saved'){finish(s,result);return;}
        if(!shown(s,t))return;
        if(result.outcome==='not_found'&&!job.running){
          if(!job.rows){
            if(job.ready){clearPending(s,job);s.job=null;s.message='접수 기록이 없습니다. 파일을 다시 선택해 검사해 주세요.';}
            else {job.ready=true;s.message='접수 기록을 찾지 못했습니다. 등록 결과 확인을 한 번 더 눌러 주세요.';}
            return;
          }
          if(job.ready){write(s,job);return;}
          job.ready=true;s.message='등록 결과가 없습니다. 같은 요청으로 이어가려면 결과 확인을 한 번 더 눌러 주세요.';
        }else {job.ready=false;s.message='등록 중이거나 결과를 아직 확인하지 못했습니다.';}
      }catch(error){if(shown(s,t))s.message=error?.code==='42501'?'현재 권한으로 결과를 확인할 수 없습니다.':'결과 조회가 멈췄습니다. 다시 확인해 주세요.';}
      finally{job.checking=false;if(shown(s,t))renderButtons(s);}
    }
    save.onclick=async()=>{
      const s=current;if(!s||!shown(s)||s.reading||clicking)return;
      if(s.job){await statusCheck(s,s.job);return;}
      if(!s.checked||!s.picked.size)return;
      const t=++epoch, picked=s.rows.filter(i=>s.picked.has(tokenFor(i.data))).map(i=>({...i.data}));
      clicking=true;renderButtons(s);
      try{
        const p=await rpc(s,'preview',picked);
        if(!shown(s,t))return;
        if(p.rows.length!==picked.length||p.rows.some(r=>r.state!=='ready'||!s.result.some(o=>tokenFor(o)===tokenFor(r)&&o.version===r.version))){s.checked=false;s.message='검사 이후 내용이 바뀌었습니다. 다시 검사해 주세요.';return;}
        s.job={rows:picked,preview:p.key,id:root.crypto.randomUUID(),running:false,checking:false,ready:false};
        write(s,s.job);
      }catch(error){if(shown(s,t))s.message=error?.code==='42501'?'현재 권한으로 등록할 수 없습니다.':'등록 전 확인을 마치지 못했습니다. 다시 시도해 주세요.';}
      finally{if(shown(s,t)){clicking=false;renderButtons(s);}}
    };
    file.onchange=()=>{const s=current,f=file.files?.[0];if(!s||!shown(s)||!f||s.job)return;
      if (f.size>2*1024*1024||!f.name.toLowerCase().endsWith('.xlsx')){file.value='';s.message='2MB 이하의 엑셀(.xlsx) 파일을 골라 주세요.';renderButtons(s);return;}
      ++epoch;s.file=f;s.rows=[];s.result=[];s.picked.clear();s.checked=false;s.reading=false;render(s);void inspect(s);};
    check.onclick=()=>{if(current)void inspect(current,!current.rows.length);};
    function open(trigger=button){const c=context();if(!c||!visible()||modal.open||doc.querySelector('dialog[open],.modal.show'))return false;
      opener=trigger;trigger?.focus({preventScroll:true});current=draft(c);file.value='';++epoch;modal.showModal();render(current);
      (file.disabled?save:file).focus({preventScroll:true});return true;}
    if(button)button.onclick=()=>open(button);
    close.onclick=()=>pause(true);modal.addEventListener('cancel',event=>{event.preventDefault();pause(true);});
    root.addEventListener('pagehide',()=>pause());
    new MutationObserver(()=>{if(!visible())pause();}).observe(root.frameElement||doc.documentElement,{attributes:true,attributeFilter:['hidden']});
    client.auth?.onAuthStateChange?.((event,session)=>{const changed=event==='SIGNED_OUT'||(current&&session?.user?.id!==current.actor);if(!changed)return;if(current){denyActor=current.actor;drafts.delete(current.owner);}pause();sync();});
    sync(); return {open,pause,sync};
  }
  root.OfficialWorkbook=Object.freeze({version:'1.0.2',parse,create});
})(typeof window==='undefined'?module.exports:window);
