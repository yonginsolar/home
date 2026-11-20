/* 1.0.0 | 승인 소집 공문의 고정 일정만 새 의사록에 적용 */
const TYPES = {MINUTES:'BOARD', GENERAL_ASSEMBLY:'GENERAL_ASSEMBLY'};
const FIELDS = [
    ['meeting_date','in-meeting-date','회의 일자',value => /^\d{4}-\d{2}-\d{2}$/.test(value)],
    ['start_time','in-start-time','시작 시각',value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)],
    ['location','in-location','장소',value => value.length <= 500]
];
const v = value => typeof value === 'string' ? value.trim() : '';

export function bindMinuteNoticeImport({doc = document, getScope, read, confirmChange, syncSchedule}) {
    const section = doc.getElementById('minute-notice-import');
    const open = doc.getElementById('minute-notice-open');
    const panel = doc.getElementById('minute-notice-panel');
    const list = doc.getElementById('minute-notice-select');
    const apply = doc.getElementById('minute-notice-apply');
    const status = doc.getElementById('minute-notice-status');
    const fields = FIELDS.map(([key,id,label,valid]) => ({key,node:doc.getElementById(id),label,valid}));
    const values = () => fields.map(({node})=>node.value);
    const option = (text,value) => new doc.defaultView.Option(text,value);
    let epoch = 0, fieldRevision = 0, request = null, rows = new Map(), automaticDate = null, explicitDate = false, appliedNotice = null;
    const kind = () => TYPES[doc.getElementById('in-doc-type')?.value] || '';
    const owner = () => getScope();
    const current = (job) => request === job && epoch === job.epoch && !!job.owner && owner() === job.owner
        && kind() === job.kind && !panel.hidden;
    function state(note = '') {
        status.textContent = note;
        open.disabled = !!request;
        list.disabled = !!request || !rows.size;
        apply.disabled = !!request || !rows.has(list.value);
    }
    function stop() {
        epoch++;
        request?.controller.abort();
        request = null;
    }
    function reset() {
        stop();
        appliedNotice = null;
        rows = new Map();
        list.replaceChildren(option('소집 공문 선택',''));
        panel.hidden = true;
        open.setAttribute('aria-expanded','false');
        section.hidden = !kind();
        state();
        section.dispatchEvent(new doc.defaultView.Event('minute-notice-applied',{bubbles:true}));
    }
    function begin(id) {
        const job = {epoch:++epoch, owner:owner(), kind:kind(), controller:new AbortController(),
            id, initial:values(), fieldRevision};
        request = job;
        return job;
    }
    function finish(job) {
        if (request !== job) return;
        request = null;
        state(status.textContent);
    }
    function describe(row) {
        return [v(row.doc_no),v(row.title)||'소집 공문',row.has_snapshot ? '' : '승인 당시 기본정보 없음'].filter(Boolean).join(' · ');
    }
    async function load() {
        if (request || !owner() || !kind()) return;
        const chosen = list.value;
        panel.hidden = false;
        open.setAttribute('aria-expanded','true');
        const job = begin();
        state('승인된 소집 공문을 확인하고 있습니다.');
        try {
            const result = await read(job.kind,null,job.controller);
            if (!current(job)) return;
            if (!Array.isArray(result)) throw new Error('MINUTE_NOTICE_READ');
            rows = new Map(result.filter(row=>/^\d+$/.test(row?.id) && typeof row?.id === 'string').map(row=>[row.id,row]));
            list.replaceChildren(option('소집 공문 선택',''),...[...rows.values()].map(row=>option(describe(row),row.id)));
            list.value = rows.has(chosen) ? chosen : '';
            state(rows.size ? '' : '불러올 수 있는 승인 소집 공문이 없습니다.');
        } catch (_) {
            if (current(job)) state('소집 공문을 불러오지 못했습니다. 다시 확인해 주세요.');
        } finally { finish(job); }
    }
    async function applySelected() {
        if (request || !owner() || !kind() || !rows.has(list.value)) return;
        const job = begin(list.value);
        const editable = () => current(job) && list.value === job.id && fieldRevision === job.fieldRevision
            && values().every((val,index)=>val === job.initial[index]);
        state('선택한 공문의 기본정보를 확인하고 있습니다.');
        try {
            const result = await read(job.kind,job.id,job.controller);
            if (!current(job)) return;
            if (!Array.isArray(result) || result.length !== 1 || result[0]?.id !== job.id) {
                state('선택한 소집 공문을 다시 확인해 주세요.'); return;
            }
            if (!editable()) { state('입력 내용이 바뀌어 불러오지 않았습니다.');return; }
            const data = result[0].snapshot || {};
            const known = fields.map(({key,valid})=>valid(v(data[key])) ? v(data[key]) : '');
            const wasAuto = automaticDate !== null && automaticDate === job.initial[0];
            const proposed = known.map((item,index)=>item || (index === 0 && wasAuto ? '' : job.initial[index]));
            const conflicts = fields.filter((_,index)=>job.initial[index] && proposed[index] !== job.initial[index] && !(index === 0 && wasAuto));
            if (conflicts.length) {
                const ok = await confirmChange(conflicts.map(x=>x.label).join('·')+'을(를) 선택한 공문 값으로 바꿀까요?');
                if (!current(job)) return;
                if (!editable()) { state('입력 내용이 바뀌어 불러오지 않았습니다.');return; }
                if (!ok) { state('');return; }
            }
            if (known[0] || wasAuto) { automaticDate = null; explicitDate = true; }
            let count = 0;
            fields.forEach(({node},index)=>{
                if (node.value === proposed[index]) return;
                node.value = proposed[index]; count++;
            });
            if (count) syncSchedule();
            appliedNotice = {id:job.id,kind:job.kind,owner:job.owner};
            section.dispatchEvent(new doc.defaultView.Event('minute-notice-applied',{bubbles:true}));
            const missing = fields.filter((_,index)=>!known[index]).map(x=>x.label);
            state(missing.length ? '승인 원본에서 확인할 수 없는 항목: '+missing.join('·')+'. 직접 확인해 주세요.'
                : count ? '공문에서 기본정보를 불러왔습니다.' : '이미 같은 값이 입력되어 있습니다.');
        } catch (_) {
            if (current(job)) state('기본정보를 불러오지 못했습니다. 다시 눌러 주세요.');
        } finally { finish(job); }
    }
    fields.forEach(({node,key})=>['input','change'].forEach(event=>node.addEventListener(event,()=>{
        fieldRevision++;
        if (key === 'meeting_date') {automaticDate = null;explicitDate = true;}
    })));
    open.addEventListener('click',()=>void load());
    apply.addEventListener('click',()=>void applySelected());
    doc.getElementById('minute-notice-close').addEventListener('click',()=>{
        reset();
        open.focus({preventScroll:true});
    });
    list.addEventListener('change',()=>state());
    panel.querySelectorAll('button').forEach(button=>button.addEventListener('keydown', event=>{
        if (event.repeat && !event.isComposing && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    }));
    reset();
    return { reset, hasExplicitDate:()=>explicitDate, noteAutomaticDate(value){automaticDate=value;explicitDate=false;},
        getAppliedNotice:()=>appliedNotice&&appliedNotice.owner===owner()&&appliedNotice.kind===kind()?appliedNotice.id:null };
}
