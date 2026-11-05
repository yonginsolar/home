/* v1.0.1 — Scoped legacy usage workbook and calculation intents. Existing RPCs/authority unchanged. */
(() => {
    'use strict';
    const byOwner = new Map(), calculations = new Map();
    let state = null, epoch = 0, bound = false;
    const node = id => document.getElementById(id);
    const owner = () => adminCertificateAuthId && g_adminMemberRuntime?.coop_id && g_adminMemberRuntime.is_active !== false
        && canAccessAdminMemberTab('funds-manage') && !isAdminMemberSiteProfile()
        ? JSON.stringify([adminCertificateAuthId, g_adminMemberRuntime.coop_id]) : '';
    const menu = () => !!owner() && !window.frameElement?.hidden && node('tab-funds-manage')?.classList.contains('active');
    const visible = () => menu() && node('dividendModal')?.classList.contains('show');
    const current = (s, ticket = epoch) => !!s && state === s && s.owner === owner() && ticket === epoch && visible();
    const locked = s => !!s?.confirming || !!s?.preparing || !!s?.attempt;
    const text = value => String(value ?? '').trim();
    const fresh = o => ({owner:o, file:null, hash:'', rows:[], phase:'empty', message:'', history:new Map()});
    function restoreFile(s) {
        try { const dt = new DataTransfer(); if (s?.file) dt.items.add(s.file); node('div-excel-file').files = dt.files; }
        catch (_) { node('div-excel-file').value = ''; }
    }
    function pause() {
        ++epoch;
        for (const job of calculations.values()) if (!job.sent && job.dialogOwner) window.CoopDialog?.cancelAll?.(job.dialogOwner);
        if (!state) return;
        state.confirming = false;
        if (state.phase === 'reading') state.phase = 'pending';
        if (state.dialogOwner) window.CoopDialog?.cancelAll?.(state.dialogOwner);
    }
    function syncOwner(force = false) {
        if (state && (force || state.owner !== owner())) {
            pause(); state = null;
            for (const id of ['dv-member-id','dv-member-name','dv-amount','dv-reason']) if (node(id)) node(id).value = '';
            resetDividendCurrentBalance(); restoreFile(null); render();
            bootstrap.Modal.getInstance(node('dividendModal'))?.hide();
        }
    }
    async function bounded(task, ms = 15000) {
        let timer;
        try { return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('UI_DEADLINE')), ms); })]); }
        finally { clearTimeout(timer); }
    }
    async function verify(valid) {
        if (!valid()) return false;
        const identity = await bounded(() => _supabase.auth.getUser());
        if (!valid() || identity.error || identity.data?.user?.id !== adminCertificateAuthId) return false;
        const guard=window.ErpRuntimeGuard;
        if(typeof guard?.isModuleEnabled!=='function'||typeof guard?.isModuleAssigned!=='function')return false;
        const result = await bounded(() => _supabase.rpc('get_my_erp_runtime'));
        const runtime=result.data;
        return valid() && !result.error && runtime?.is_active !== false && runtime?.runtime_profile !== 'site_member'
            && String(runtime?.coop_id || '') === String(g_adminMemberRuntime?.coop_id || '')
            && guard.isModuleEnabled(runtime,'member_admin') && guard.isModuleAssigned(runtime,'member_admin');
    }
    async function ask(valid, message, s) {
        if (!valid() || !window.CoopDialog) return false;
        const dialogOwner = {get closed(){return window.closed || !valid();},get frameElement(){return window.frameElement;},get parent(){return window.parent;},document,getSelection:()=>window.getSelection()};
        if (s) s.dialogOwner = dialogOwner;
        try {
            const yes = window.CoopDialog.forOwner
                ? await window.CoopDialog.forOwner(dialogOwner,'confirm',message,'',{}) : await window.CoopDialog.confirm(message);
            return yes === true && valid();
        } finally { if (s?.dialogOwner === dialogOwner) s.dialogOwner = null; }
    }
    function returnAfterCancel(s,ticket,target) {
        if(!current(s,ticket)||!target?.isConnected||target.disabled||!target.getClientRects().length||document.visibilityState==='hidden')return;
        const focus=document.activeElement,modal=node('dividendModal');
        if(focus!==document.body&&focus!==modal&&focus!==target)return;
        try {if(window.frameElement){const p=parent.document.activeElement;if(p!==window.frameElement&&p!==parent.document.body)return;}}
        catch(_){return;}
        target.focus({preventScroll:true});
    }
    function build() {
        if (bound) return; bound = true;
        const modal = node('dividendModal'), pane = node('tab-div-batch'), file = node('div-excel-file');
        node('div-excel-preview').querySelector('h6').textContent = '검토 내역';
        const intro = pane.querySelector('.alert');
        for (const part of intro.childNodes) if (part.nodeType === Node.TEXT_NODE) part.textContent = part.textContent.replace('다수의 조합원에게 배당금을 한 번에 지급합니다.', '여러 조합원의 이용실적 적립·차감을 한 번에 적용합니다.');
        const status = document.createElement('p'); status.id = 'usageWorkbookStatus'; status.className = 'small mt-2'; status.setAttribute('role','status');
        const actions = document.createElement('div'); actions.className = 'd-flex flex-wrap gap-2 mb-2';
        for (const [id,label,action] of [['usageWorkbookRetry','다시 확인',()=>state?.attempt?submit():read(state)],['usageWorkbookDiscard','초안 버리기',discard],['usageWorkbookExport','남은 행 다운로드',download]]) {
            const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'btn btn-sm btn-outline-secondary'; b.textContent = label; b.onclick = action; actions.append(b);
        }
        pane.insertBefore(status, node('div-excel-preview')); pane.insertBefore(actions,node('div-excel-preview'));
        const table=node('div-excel-tbody').closest('table'), scroller=document.createElement('div');
        scroller.className='table-responsive';scroller.style.cssText='max-height:min(45vh,360px);overflow:auto';table.before(scroller);scroller.append(table);
        const style = document.createElement('style'); style.textContent = '#dividendModal .modal-dialog{width:min(880px,calc(100vw - 2rem));max-width:none;height:min(720px,calc(100dvh - 2rem));margin:1rem auto}#dividendModal .modal-content{height:100%;min-height:0;overflow:auto;display:block}#dividendModal .modal-header{flex-shrink:0;gap:.75rem}#dividendModal .modal-body{min-height:0;overflow:visible}#dividendModal .modal-title,#dividendModal button{white-space:normal;word-break:keep-all;overflow-wrap:anywhere}#div-excel-preview{overflow:auto}#div-excel-tbody td{overflow-wrap:anywhere}'; document.head.append(style);
        file.removeAttribute('onchange'); file.addEventListener('change',() => readDividendExcel(file));
        modal.addEventListener('hide.bs.modal',pause);
        modal.addEventListener('keydown',event => { if (event.key === 'Escape' && event.target === modal) pause(); });
        render();
    }
    function render() {
        if (!bound) return;
        const s = state, access = !!s && s.owner === owner(), busy = locked(s) || s?.phase === 'reading';
        node('div-excel-file').disabled = !access || busy;
        node('usageWorkbookStatus').textContent = s?.message || '';
        node('usageWorkbookRetry').disabled = !access || !!s?.confirming || !!s?.preparing || s?.phase === 'reading' || !!s?.attempt?.pending || !s?.file;
        node('usageWorkbookRetry').textContent = s?.attempt ? '적용 결과 확인' : '다시 확인';
        node('usageWorkbookDiscard').disabled = !access || busy || !s?.file;
        node('usageWorkbookExport').disabled = !access || busy || !s?.rows.length;
        const submit = node('div-excel-preview').querySelector('[onclick="submitDividendBatch()"]');
        submit.disabled = !access || !!s?.confirming || !!s?.preparing || !!s?.attempt?.pending || s?.phase === 'reading' || (!s?.attempt && !s?.rows.some(r=>!r.issue));
        submit.textContent = s?.attempt ? '적용 결과 확인' : '검토한 내역 적용';
        node('div-excel-preview').style.display = s?.rows.length || s?.attempt ? 'block' : 'none';
        node('div-excel-count').textContent = s?.rows.length ? `남은 ${s.rows.length}행 · 적용 가능 ${s.rows.filter(r=>!r.issue).length}행` : '';
        const body = node('div-excel-tbody'); body.replaceChildren();
        for (const row of s?.rows || []) { const tr = document.createElement('tr'); for (const value of [row.member_id,'-',Number.isSafeInteger(row.amount)?row.amount.toLocaleString('ko-KR'):'금액 확인',row.issue || row.reason]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } body.append(tr); }
    }
    function parse(bytes) {
        const wb = XLSX.read(bytes,{type:'array',cellDates:false,sheetRows:10002}), sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('엑셀 시트를 확인해 주세요.');
        const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
        if (range.e.r > 10000 || range.e.c > 100) throw new Error('500행 이내로 정리해 주세요.');
        for (const [key,cell] of Object.entries(sheet)) if (!key.startsWith('!') && cell?.f) throw new Error('수식 대신 확인한 값을 붙여넣어 주세요.');
        const rows = XLSX.utils.sheet_to_json(sheet,{raw:true,defval:''});
        if (!rows.length || rows.length > 500) throw new Error('입력한 내역을 1~500행으로 정리해 주세요.');
        return rows.map((row,index) => {
            const raw = text(row['금액'] ?? row.amount), amount = Number(raw.replace(/,/g,''));
            const member_id = text(row['조합원ID'] || row['조합원번호'] || row.ID || row['아이디']);
            const valid = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw) && Number.isSafeInteger(amount) && amount !== 0 && amount >= -2147483648 && amount <= 2147483647;
            return {row_no:Number.isInteger(row.__rowNum__)?row.__rowNum__+1:index+2,member_id,amount,reason:text(row['사유'] || row['비고']) || '일괄지급',issue:!member_id?'조합원번호를 확인해 주세요.':!valid?'0이 아닌 원 단위 정수 금액을 확인해 주세요.':''};
        });
    }
    async function read(s) {
        if (!s || !current(s) || locked(s) || !s.file) return;
        pause(); const ticket = epoch, file = s.file; s.phase = 'reading'; s.rows = []; s.message = '파일을 읽고 있습니다…'; render();
        try {
            if (file.size > 10*1024*1024) throw new Error('파일은 10MB 이하로 선택해 주세요.');
            const data = await bounded(async() => { if (!await ensureAdminMemberSpreadsheetReady()) throw new Error('TOOL'); return file.arrayBuffer(); });
            if (!current(s,ticket) || s.file !== file) return;
            const digest = await window.crypto.subtle.digest('SHA-256',data);
            if (!current(s,ticket) || s.file !== file) return;
            s.hash = Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
            const done = s.history.get(s.hash) || new Set(); s.rows = parse(data).filter(r=>!done.has(r.row_no));
            s.phase = 'ready'; s.message = s.rows.length ? '조합원번호·금액·사유를 확인한 뒤 적용해 주세요.' : '이 파일에서 확인된 내역은 모두 적용했습니다.';
            if(!s.rows.length)window.ErpWorkspaceResume?.checkpoint(node('div-excel-file'));
        } catch (error) { if (current(s,ticket)) { s.phase = 'failed'; s.message = /[가-힣]/.test(error.message||'') ? error.message : '파일을 읽지 못했습니다. 파일을 유지한 채 다시 확인해 주세요.'; } }
        finally { if (current(s,ticket)) render(); }
    }
    window.openDividendModal = function() {
        if (!menu()) return; build(); syncOwner();
        const o = owner(); state = byOwner.get(o) || fresh(o); byOwner.set(o,state); restoreFile(state); render();
        bootstrap.Modal.getOrCreateInstance(node('dividendModal')).show();
        if (state.phase === 'pending') { const s=state; node('dividendModal').addEventListener('shown.bs.modal',()=>{if(current(s))void read(s);},{once:true}); }
    };
    window.readDividendExcel = function(input) {
        if (!state || !current(state)) return;
        if (locked(state)) { restoreFile(state); return; }
        const file = input.files?.[0]; if (!file) {restoreFile(state);return;}
        pause(); state.file = file; state.hash = ''; state.rows = []; state.message = ''; state.phase = 'pending'; return read(state);
    };
    function receipt(s,a,result) {
        const rows = result?.items, expected = new Set(a.payload.map(r=>r.row_no));
        if (result?.operation_type !== 'USAGE_REWARD_GRANT' || result.request_key !== a.key || !Array.isArray(rows) || rows.length !== expected.size || new Set(rows.map(r=>r.row_no)).size !== expected.size || rows.some(r=>!expected.has(r.row_no)||typeof r.ok!=='boolean') || result.success_count !== rows.filter(r=>r.ok).length || result.failure_count !== rows.filter(r=>!r.ok).length) throw new Error('RESULT_UNCONFIRMED');
        const done = s.history.get(a.hash) || new Set(); for (const r of rows) if(r.ok)done.add(r.row_no); s.history.set(a.hash,done);
        s.rows = s.rows.filter(r=>!done.has(r.row_no));
        for (const r of s.rows) if (rows.some(x=>x.row_no===r.row_no&&!x.ok)) r.issue = '처리하지 못한 행입니다. 입력을 확인해 다시 업로드해 주세요.';
        s.attempt = null; s.phase = 'complete'; s.message = `적용 확인 ${result.success_count}건 · 남은 ${s.rows.length}행`;
        if(!s.rows.length&&s.owner===owner()&&node('div-excel-file').files?.[0]===s.file)window.ErpWorkspaceResume?.checkpoint(node('div-excel-file'));
    }
    async function send(s,a,ticket) {
        if (a.pending) return; a.pending = true; s.phase = 'saving'; s.message = '검토한 내역을 적용하고 있습니다…'; render();
        let timer, late = false;
        const work = Promise.resolve().then(()=>_supabase.rpc('grant_usage_rewards_secure_batch',{p_request_key:a.key,p_rows:a.payload,p_admin_email:a.admin}));
        const complete = async response => {
            a.pending = false; if (s.attempt !== a) return;
            try { if (response.error) throw response.error; receipt(s,a,response.data); if(current(s))render(); if (current(s,ticket)) void fetchGlobalDividends(); }
            catch (error) {
                if(['42501','22023','PT409','55000'].includes(error.code)){
                    s.attempt=null;s.phase='ready';s.message=error.code==='42501'?'현재 권한으로는 적용할 수 없습니다. 권한을 확인한 뒤 다시 시도해 주세요.':'입력이나 현재 상태를 다시 확인해 주세요.';
                } else {s.phase='unknown';s.message='적용 결과를 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해 주세요.';}
                if(current(s))render();
            }
        };
        const settled = work.then(complete,()=>complete({error:{code:'FETCH_ERROR'}})).finally(()=>clearTimeout(timer));
        await Promise.race([settled,new Promise(resolve=>{timer=setTimeout(()=>{late=true;if(s.attempt===a){s.phase='unknown';s.message='응답이 늦어지고 있습니다. 이전 요청을 처리 중이며 새 요청은 보내지 않습니다.';if(current(s,ticket))render();}resolve();},30000);})]);
        if (!late && current(s,ticket)) render();
    }
    async function submit() {
        const s=state,ticket=epoch; if(!current(s,ticket)||s.confirming||s.preparing||s.attempt?.pending||s.phase==='reading')return;
        const payload = s.attempt?.payload || s.rows.filter(r=>!r.issue).map(({row_no,member_id,amount,reason})=>({row_no,member_id,amount,reason}));
        if (!payload.length) return;
        const before=s.attempt, file=s.file, trigger=document.activeElement, valid=()=>current(s,ticket)&&s.file===file;
        let accepted=false;
        s.confirming=true;render();
        try {
            accepted=await ask(valid,before?'이전 요청 결과를 확인할까요? 아직 처리되지 않았다면 같은 요청으로 이어갑니다.':`${payload.length}건의 이용실적 적립·차감을 적용할까요?`,s);
            if(!accepted)return;
            s.confirming=false;s.preparing=true;render();
            if (!await verify(valid)) {if(valid()){s.message='로그인과 처리 권한을 확인하지 못했습니다. 다시 확인해 주세요.';}return;}
            const attempt=before || {key:createAdminBatchRequestKey('usage-reward-import'),payload:JSON.parse(JSON.stringify(payload)),hash:s.hash,admin:node('adminProfile')?.innerText||'',pending:false};
            if (!valid())return; s.attempt=attempt;s.preparing=false;await send(s,attempt,ticket);
        } catch (_) { if(valid())s.message='로그인과 처리 권한을 확인하지 못했습니다. 다시 확인해 주세요.'; }
        finally {s.confirming=false;s.preparing=false;if(current(s))render();if(!accepted)returnAfterCancel(s,ticket,trigger);}
    }
    window.submitDividendBatch=submit;
    async function discard() {
        const s=state,ticket=epoch;if(!current(s)||locked(s))return;const file=s.file,trigger=document.activeElement;s.confirming=true;render();
        try {if(await ask(()=>current(s,ticket)&&s.file===file,'이 초안을 버릴까요?',s)){s.file=null;s.rows=[];s.phase='empty';s.message='';restoreFile(s);window.ErpWorkspaceResume?.checkpoint(node('div-excel-file'));}}
        finally{s.confirming=false;if(current(s,ticket))render();returnAfterCancel(s,ticket,trigger);}
    }
    async function download() {
        const s=state,ticket=epoch;if(!current(s)||locked(s))return;
        try {if(!await ensureAdminMemberSpreadsheetReady()||!current(s,ticket)||locked(s))return;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s.rows.map(r=>({'조합원ID':r.member_id,'금액':r.amount,'사유':r.reason,'확인할 내용':r.issue||''}))),'이용실적');XLSX.writeFile(wb,'이용실적_남은행.xlsx');}
        catch(_){if(current(s,ticket)){s.message='다운로드를 준비하지 못했습니다. 다시 시도해 주세요.';render();}}
    }
    const oldSwitch=switchTab;
    switchTab=function(name,...args){if(canAccessAdminMemberTab(name)&&name!=='funds-manage')pause();return oldSwitch.call(this,name,...args);};
    document.addEventListener('show.bs.tab',event=>{if(event.target?.closest('#tab-funds-manage')&&!node('dividendModal')?.contains(event.target))pause();});
    if(window.frameElement)new MutationObserver(records=>{if(window.frameElement.hidden||records.some(r=>r.oldValue===null))pause();}).observe(window.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
    _supabase.auth?.onAuthStateChange?.((event,session)=>syncOwner(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==adminCertificateAuthId)));
    window.addEventListener('pagehide',pause);
    const dirty=s=>!!s?.file&&(!!s.rows.length||!!s.attempt||!['ready','complete'].includes(s.phase));
    window.addEventListener('beforeunload',event=>{if(dirty(byOwner.get(owner()))){event.preventDefault();event.returnValue='';}});
    window.UsageRewardImport=Object.freeze({pause,hasDraft:()=>dirty(byOwner.get(owner()))});

    // Calculation commands share the existing workflow owner/epoch and one lock per batch.
    const batchFingerprint=id=>JSON.stringify(g_dividend_batch_state.batches.find(r=>String(r.id)===id)||null);
    function calcStatus(message,action) {
        let status=node('dividendCalculationStatus');if(!status){status=document.createElement('p');status.id='dividendCalculationStatus';status.className='small';status.setAttribute('role','status');node('dividendManageReadStatus')?.after(status);}
        status.textContent=message;
        if(action){const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-primary ms-2';b.textContent='결과 다시 확인';b.onclick=action;status.append(b);}
    }
    async function recoverCalculation(job,key,c) {
        const workflow=window.DividendWorkflow;
        if(!workflow.current(c)||calculations.get(key)!==job||job.reading)return;
        job.reading=true;
        try {
            const rows=await fetchDividendManageBatches();
            if(!workflow.current(c)||calculations.get(key)!==job||!Array.isArray(rows))return;
            if(job.settled){calculations.delete(key);calcStatus('최신 산출 내역을 불러왔습니다. 결과를 검토한 뒤 필요한 경우 다시 계산해 주세요.');}
            else calcStatus('이전 요청을 처리 중입니다. 결과를 다시 확인해 주세요.',()=>recoverCalculation(job,key,c));
        } finally {job.reading=false;}
    }
    async function calculate(kind,id) {
        const workflow=window.DividendWorkflow;id=String(id||g_dividend_batch_state.selectedBatchId||'');
        if(!menu()||!workflow||!id||!g_dividend_batch_state.batches.some(r=>String(r.id)===id))return;
        if(String(g_dividend_batch_state.selectedBatchId)!==id)selectDividendManageBatch(id);
        const c=workflow.context('manage',id),key=JSON.stringify([c.owner,id]),snapshot=batchFingerprint(id),valid=()=>workflow.current(c)&&batchFingerprint(id)===snapshot;
        if(!valid())return;
        const previous=calculations.get(key);
        if(previous){if(previous.sent)calcStatus('이전 계산 요청의 결과를 먼저 확인해 주세요.',()=>recoverCalculation(previous,key,c));return;}
        const job={id,owner:c.owner,settled:false,sent:false};calculations.set(key,job);
        const unknown=()=>{job.unknown=true;if(workflow.current(c))calcStatus('계산 결과를 확인하지 못했습니다. 최신 산출 내역을 다시 확인해 주세요.',()=>recoverCalculation(job,key,c));};
        try {
            if(!await ask(valid,kind==='capital'?'선택한 회차의 출자금 기준 배당을 계산할까요?':'기존 이용실적 원장을 불러온 뒤 선택한 회차의 이용고 배당을 계산할까요?',job))return;
            if(!await verify(valid)){if(workflow.current(c))calcStatus('로그인과 계산 권한을 확인하지 못했습니다. 다시 시도해 주세요.');return;}
            const call=async(name,args)=>{job.sent=true;job.settled=false;let timer;const work=Promise.resolve().then(()=>_supabase.rpc(name,args)).finally(()=>{job.settled=true;});try{const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RESULT_UNKNOWN')),30000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}};
            if(kind==='usage'){
                const batch=g_dividend_batch_state.batches.find(r=>String(r.id)===id);
                await call('import_legacy_coop_points_to_reward_ledger',{p_since:batch.usage_basis_start?`${formatDividendExportDateValue(batch.usage_basis_start,'')}T00:00:00+09:00`:null});
                if(!valid())return;
            }
            await call(kind==='capital'?'calculate_capital_dividend_batch':'calculate_usage_dividend_batch',kind==='capital'?{p_batch_id:id,p_confirm_replace:true,p_capital_statuses:['완료','전표완료']}:{p_batch_id:id,p_confirm_replace:true});
            if(workflow.current(c)){calcStatus('배당 계산을 마쳤습니다.');await fetchDividendManageBatches();}
        } catch(error) {if(job.sent&&!['42501','22023','PT409','55000'].includes(error.code)){unknown();}else if(workflow.current(c))calcStatus('계산을 진행하지 못했습니다. 현재 권한과 회차 상태를 다시 확인해 주세요.');}
        finally{if(!job.unknown&&calculations.get(key)===job)calculations.delete(key);}
    }
    window.runDividendCapitalCalculation=id=>calculate('capital',id);
    window.runDividendUsageCalculation=id=>calculate('usage',id);
})();
