/* Election term v1.1.0. Dates and explicit plan only; never modify officials/votes. */
export function isElectionTermDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
export function readElectionTerm(start, end) {
    const a = start || '', b = end || '';
    if (!a && !b) return {term_start_date:null, term_end_date:null};
    if (!a || !b) throw new Error('임기 시작일과 종료일을 함께 입력해 주세요.');
    if (!isElectionTermDate(a) || !isElectionTermDate(b)) throw new Error('임기 날짜를 확인해 주세요.');
    if (b < a) throw new Error('임기 종료일은 시작일보다 빠를 수 없습니다.');
    return {term_start_date:a, term_end_date:b};
}
export function formatElectionTerm(row) {
    try {
        const term = readElectionTerm(row?.term_start_date, row?.term_end_date);
        return term.term_start_date ? `${term.term_start_date.replaceAll('-','.')} ~ ${term.term_end_date.replaceAll('-','.')}` : '임기 미설정';
    } catch (_) { return '임기 정보 확인 필요'; }
}
export function sameElectionTermPlan(a,b){return JSON.stringify(a||null,a?Object.keys(a).sort():undefined)===JSON.stringify(b||null,b?Object.keys(b).sort():undefined);}
export function showElectionTermHelp(event) {
    event.preventDefault(); event.stopPropagation();
    return window.CoopDialog?.alert('💡 시작일과 정관상 기간으로 종료일을 계산할 수 있어요. 종료일을 직접 바꾸면 직접 조정으로 유지됩니다.\n\n• 다음 정기선거는 선택한 이전 임기 다음 날부터 제안해요.\n\n• 결선·재투표는 원선거와 같은 임기, 보궐은 전임자의 남은 임기를 사용해요.\n\n• 저장한 임기는 후보 신청 화면에도 표시돼요.', {title:'당선인 임기'});
}

// RLS remains the authority. Each save rechecks runtime/Auth and compares both previously read dates.
export function createElectionTermEditor({client, scope, authorize, context, onSaved = () => {}, planning = null}) {
    const drafts = new Map();
    const dialog = document.getElementById('election-term-dialog');
    const start = document.getElementById('edit-election-term-start');
    const end = document.getElementById('edit-election-term-end');
    const status = document.getElementById('election-term-status');
    const save = document.getElementById('save-election-term');
    const retry = document.getElementById('retry-election-term');
    let active = null, sequence = 0, opener = null, readController = null;
    const termOf = row => ({term_start_date:row?.term_start_date || null,term_end_date:row?.term_end_date || null,...(planning?{term_plan:row?.term_plan||null}:{})});
    const same = (a,b) => a?.term_start_date === b?.term_start_date && a?.term_end_date === b?.term_end_date && sameElectionTermPlan(a?.term_plan,b?.term_plan);
    const dirty = state => !same(state.values,state.base);
    const visible = () => !document.hidden && !window.frameElement?.hidden;
    function paint() {
        const s = active;
        save.disabled = !s || !s.loaded || s.pending || !dirty(s);
        retry.disabled = !s || s.pending;
        status.textContent = !s ? '' : s.pending ? '저장 중입니다…' : s.error || (!s.loaded ? '임기를 불러오는 중입니다…' : dirty(s) ? '작성 중 · 저장하지 않은 임기가 있습니다.' : formatElectionTerm(s.base));
    }
    const planner=planning?.planner({container:document.getElementById('edit-term-planner'),start,end,onChange:()=>capture()});
    function capture() { if (active) { active.values = termOf({term_start_date:start.value,term_end_date:end.value,term_plan:planner?.raw()}); paint(); } }
    start.addEventListener('input',capture);end.addEventListener('input',capture);
    function close() { capture();planner?.close();sequence++;readController?.abort();dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true}); }
    dialog.querySelector('[data-term-close]').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{
        event.stopPropagation();
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault();
    });
    window.addEventListener('beforeunload',event=>{if(Array.from(drafts.values()).some(s=>dirty(s)||s.pending)){event.preventDefault();event.returnValue='';}});
    async function load(reset = false) {
        const s = active, seq = ++sequence;
        readController?.abort();
        const controller = new AbortController();readController=controller;
        const timer=setTimeout(()=>controller.abort(),15000);
        s.error='';s.loaded=false;paint();
        try {
            const result=await scope(client.from('elections').select(planning?'id,term_start_date,term_end_date,term_plan':'id,term_start_date,term_end_date')).eq('id',s.id).abortSignal(controller.signal).maybeSingle();
            if(seq!==sequence||active!==s||!dialog.open||context()!==s.coop)return;
            if(!visible()||controller.signal.aborted)throw new Error('READ_INTERRUPTED');
            if(result.error||!result.data)throw new Error('READ_FAILED');
            const fresh=termOf(result.data);
            if(reset||!dirty(s)){s.base=fresh;s.values={...fresh};start.value=fresh.term_start_date||'';end.value=fresh.term_end_date||'';planner?.bind({...s.row,...fresh});}
            s.latest=fresh;s.loaded=true;
            if(!same(s.base,fresh)&&dirty(s))s.error='다른 담당자가 임기를 변경했습니다. 다시 조회해 최신 값을 확인해 주세요.';
        } catch (_) {if(seq===sequence&&active===s)s.error='임기를 불러오지 못했습니다. 다시 조회해 주세요.';}
        finally{clearTimeout(timer);if(readController===controller)readController=null;if(seq===sequence&&active===s)paint();}
    }
    retry.addEventListener('click',async()=>{
        const s=active;if(!s||s.pending)return;
        if(dirty(s)){
            const yes=await window.CoopDialog.confirm('입력한 임기를 최신 저장값으로 되돌릴까요?');
            if(!yes||active!==s||!dialog.open||!visible()||context()!==s.coop)return;
        }
        await load(true);
    });
    save.addEventListener('click',async()=>{
        const s=active;if(!s||s.pending||!s.loaded||!dirty(s))return;
        let sent;
        try{sent={...readElectionTerm(start.value,end.value),...(planner?{term_plan:planner.read()}:{})};}catch(error){s.error=error.message;paint();return;}
        const base={...s.base},seq=sequence;s.pending=true;s.error='';paint();
        try{
            if(context()!==s.coop||!visible()||!await authorize())throw new Error('DENIED');
            if(active!==s||sequence!==seq||!dialog.open||!visible()||context()!==s.coop)throw new Error('CANCELLED');
            let query=scope(client.from('elections').update(sent)).eq('id',s.id);
            for(const key of ['term_start_date','term_end_date'])query=base[key]===null?query.is(key,null):query.eq(key,base[key]);
            if(planner)query=base.term_plan===null?query.is('term_plan',null):query.eq('term_plan',JSON.stringify(base.term_plan));
            const result=await query.select(planner?'id,term_start_date,term_end_date,term_plan':'id,term_start_date,term_end_date').maybeSingle();
            if(result.error)throw new Error('WRITE_FAILED');
            if(!result.data)throw new Error('STALE');
            s.base=termOf(result.data);s.latest={...s.base};
            s.error=dirty(s)?'저장했습니다. 추가로 수정한 임기는 아직 저장하지 않았습니다.':'저장했습니다.';
            if(!dirty(s))planner?.saved();
            Object.assign(s.row,s.base);
            if(context()===s.coop)onSaved(s.row);
        }catch(error){s.error=error.message==='STALE'?'임기가 변경되었거나 변경 권한이 없습니다. 다시 조회해 주세요.':error.message==='DENIED'?'현재 임기를 수정할 권한이 없습니다.':error.message==='CANCELLED'?'저장을 취소했습니다.':'저장 결과를 확인하지 못했습니다. 다시 조회해 확인해 주세요.';}
        finally{s.pending=false;if(active===s)paint();}
    });
    return {
        async open(row,button){
            if(dialog.open)return;
            const coop=context();if(!coop||!row?.id)return;
            const key=coop+':'+row.id;
            if(!drafts.has(key)){const base=termOf(row);drafts.set(key,{id:row.id,coop,base,values:{...base},loaded:false,pending:false,error:'',row});}
            active=drafts.get(key);active.row=row;opener=button;
            document.getElementById('election-term-name').textContent=row.title||'선거';
            start.value=active.values.term_start_date||'';end.value=active.values.term_end_date||'';planner?.bind({...row,...active.values});
            dialog.showModal();start.focus({preventScroll:true});paint();await load();
        }
    };
}
