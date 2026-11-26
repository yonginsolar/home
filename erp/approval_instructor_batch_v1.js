(function (root) {
    'use strict';
    const maxPayees = 20;
    const maxCases = 50;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const money = new Intl.NumberFormat('ko-KR');
    const won = value => money.format(value) + '원';
    const error = (code, message) => { throw Object.assign(new Error(message), {code}); };
    const clean = (value, limit) => {
        if (typeof value !== 'string') return '';
        const text = value.trim().normalize('NFC');
        return text.length <= limit && !/[\u0000-\u001f\u007f]/u.test(text) ? text : '';
    };
    function localDateTime(value) {
        const stamp = clean(value,16);
        if (!/^20\d\d-(0[1-9]|1[0-2])-\d\dT([01]\d|2[0-3]):[0-5]\d$/.test(stamp)) return '';
        const date = new Date(stamp + ':00Z');
        return Number.isFinite(+date) && date.toISOString().slice(0,16) === stamp ? stamp : '';
    }
    function collect(input, {calculate,raw,requireEvidence=true}) {
        if (!Array.isArray(input?.payees) || !input.payees.length || input.payees.length > maxPayees
            || !Array.isArray(input?.cases) || !input.cases.length || input.cases.length > maxCases) {
            error('BATCH_SIZE','강사와 지급 건을 각각 한 건 이상 입력해 주세요.');
        }
        const people = new Map(), evidence = new Set(), ids = new Set(), caseKeys = new Set();
        for (const person of input.payees) {
            const name = clean(person.name,100);
            if (!uuid.test(person.id || '') || people.has(person.id) || !name) error('PAYEE','강사 이름을 확인해 주세요.');
            const copy = { id:person.id, name };
            for (const kind of ['identity','bank']) {
                const ref = person[kind];
                if (ref == null || ref === '') {
                    if (requireEvidence) error('EVIDENCE_REQUIRED','강사마다 신분증과 계좌사본을 각각 추가해 주세요.');
                    continue;
                }
                if (typeof ref !== 'string' || !uuid.test(ref) || evidence.has(ref))
                    error('EVIDENCE_DUPLICATE','강사별 증빙을 다시 확인해 주세요.');
                evidence.add(ref);
                copy[kind] = ref;
            }
            people.set(person.id,copy);
        }
        const totals = {gross:0,national:0,local:0,net:0};
        const used = new Set();
        const cases = input.cases.map(item=>{
            const title = clean(item.title,200), place = clean(item.place,200), at = localDateTime(item.at);
            if (!uuid.test(item.id || '') || ids.has(item.id) || !people.has(item.payeeId) || !title || !place || !at)
                error('CASE','지급 건마다 강사·교육명·일시·장소를 확인해 주세요.');
            const caseKey = JSON.stringify([item.payeeId,title.replace(/\s+/gu,' '),at]);
            if (caseKeys.has(caseKey)) error('DUPLICATE_CASE','같은 강사·교육·일시가 두 번 있습니다. 한 지급 건으로 정리해 주세요.');
            if (typeof item.gross !== 'string') error('AMOUNT','강사비 총액을 확인해 주세요.');
            const displayed = item.gross.trim();
            if (!/^(?:\d{1,12}|\d{1,3}(?:,\d{3}){1,3})$/.test(displayed))
                error('AMOUNT','강사비 총액은 1원 이상인 정수로 입력해 주세요.');
            const computed = calculate(String(raw(displayed)),item.rate);
            if (!computed) error('AMOUNT_RATE','강사비 총액과 원천징수율을 확인해 주세요.');
            for (const part of Object.keys(totals)) totals[part] += computed[part];
            used.add(item.payeeId); ids.add(item.id); caseKeys.add(caseKey);
            return {id:item.id,payee_id:item.payeeId,title,at,place,rate:computed.rate,
                gross:computed.gross,national:computed.national,local:computed.local,net:computed.net};
        });
        if (used.size !== people.size) error('PAYEE_UNUSED','지급 건이 없는 강사를 확인해 주세요.');
        return {version:1,payees:[...people.values()],cases,totals};
    }
    function approvalText({payees,cases,totals}) {
        const names = new Map(payees.map(p=>[p.id,p.name]));
        return ['[강사비 지급 내역]',...cases.map(c=>
            [c.title,c.at.replace('T',' '),c.place,names.get(c.payee_id),
                '총액 '+won(c.gross),'실지급 '+won(c.net)].join(' · ')),
        '강사비 총액 '+won(totals.gross),
        '소득세 '+won(totals.national)+' · 지방소득세 '+won(totals.local),
        '승인금액(실지급액) '+won(totals.net)].join('\n');
    }
    function mount(container,{calculate,raw,onChange,current}) {
        const doc=container.ownerDocument, random=()=>root.crypto.randomUUID();
        let state={payees:[],cases:[]};
        const draftCopy=()=>({
            payees:state.payees.map(({id,name,identity,bank})=>({id,name,identity,bank})),
            cases:state.cases.map(item=>({...item}))
        });
        const files=new Map();
        function element(tag,attrs={},text) {
            const node=doc.createElement(tag);
            for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
            if (text!=null) node.textContent=text;
            return node;
        }
        function appendField(wrap,input,label) {
            const block=element('div',{class:'col-12 col-sm-6'});
            block.append(element('label',{for:input.id,class:'form-label small'},label),input);
            wrap.append(block);
        }
        function action(label,handler) {
            const b=element('button',{type:'button',class:'btn btn-sm btn-outline-secondary'},label);
            b.addEventListener('click',handler);return b;
        }
        const heading=element('h3',{class:'h6'},'강사비 지급 내역');
        const people=element('div',{'aria-label':'강사와 증빙'}), rows=element('div',{'aria-label':'지급 건'});
        const summary=element('output',{class:'d-block mt-3 fw-semibold','aria-live':'polite'});
        const message=element('div',{class:'small mt-2',role:'status'});
        function recalc() {
            let preview=null;
            if (current()) {
                try{preview=collect(draftCopy(),{calculate,raw,requireEvidence:false});}catch(_){}
            }
            summary.textContent=preview?'승인금액(실지급액) '+won(preview.totals.net)+' · 소득세 '+won(preview.totals.national)+' · 지방소득세 '+won(preview.totals.local):'';
            return preview;
        }
        function edited() {message.textContent='';recalc();onChange?.(draftCopy());}
        function input(id,label,wrap,value,handler,attrs={}) {
            const field=element('input',{id,type:'text',class:'form-control',...attrs});
            field.value=Object.hasOwn(attrs,'data-number-group') && root.ERPNumberInput
                ? root.ERPNumberInput.format(value) : value;
            field.addEventListener('input',()=>{if(current())handler(field.value);});
            appendField(wrap,field,label);
        }
        function render(focus) {
            people.replaceChildren();
            for (const [idx,person] of state.payees.entries()) {
                const card=element('fieldset',{class:'border rounded-3 p-3 mb-2'});
                const title=element('legend',{class:'h6 w-auto float-none'},'강사 '+(idx+1));
                const fields=element('div',{class:'row g-2'});
                card.append(title,fields);
                input('ib-person-'+person.id,'강사명',fields,person.name,value=>{
                    person.name=value;
                    rows.querySelectorAll('option').forEach(o=>{
                        if(o.value===person.id)o.textContent=person.name.trim()||'강사 '+(idx+1);
                    });
                    edited();
                },{maxlength:'100'});
                for (const [kind,label] of [['identity','강사 신분증'],['bank','계좌사본']]) {
                    const id='ib-file-'+person.id+'-'+kind;
                    const f=element('input',{id,type:'file',class:'form-control',accept:'.pdf,.png,.jpg,.jpeg'});
                    const status=element('span',{class:'small'});
                    const slot=person.id+':'+kind;
                    status.textContent=files.has(slot)?'선택됨':person[kind]?'저장된 증빙':'';
                    f.addEventListener('change',()=>{
                        if (!current()||!f.files?.length)return;
                        const file=f.files[0];f.value='';
                        if (!/\.(pdf|png|jpe?g)$/i.test(file.name)||file.size<1||file.size>10485760){
                            message.textContent='PDF·PNG·JPG 파일을 10MB 이내로 선택해 주세요.';return;
                        }
                        files.set(slot,file);status.textContent='선택됨';edited();
                    });
                    appendField(fields,f,label);
                    f.after(status);
                }
                const remove=action('강사 삭제',()=>{
                    if(!current())return;
                    if(state.cases.some(c=>c.payeeId===person.id)){
                        message.textContent='이 강사의 지급 건을 먼저 삭제하거나 다른 강사를 선택해 주세요.';return;
                    }
                    files.delete(person.id+':identity');files.delete(person.id+':bank');
                    state.payees=state.payees.filter(p=>p!==person);
                    render(addPayee);edited();
                });
                card.append(remove);people.append(card);
            }
            addPayee.disabled=state.payees.length>=maxPayees;
            rows.replaceChildren();
            for(const [idx,item] of state.cases.entries()){
                const card=element('fieldset',{class:'border rounded-3 p-3 mb-2'});
                const fields=element('div',{class:'row g-2'});
                card.append(element('legend',{class:'h6 w-auto float-none'},'지급 건 '+(idx+1)),fields);
                const col=element('select',{id:'ib-payee-'+item.id,class:'form-select'});
                col.append(element('option',{value:''},'강사 선택'));
                state.payees.forEach((p,i)=>col.append(element('option',{value:p.id},p.name.trim()||'강사 '+(i+1))));
                col.value=item.payeeId;
                col.addEventListener('change',()=>{if(current()){item.payeeId=col.value;edited();}});
                appendField(fields,col,'강사');
                for(const [k,label,attrs] of [['title','교육 제목',{maxlength:'200'}],['at','교육 일시',{type:'datetime-local'}],
                    ['place','장소',{maxlength:'200'}],['gross','강사비 총액 (원)',{inputmode:'numeric','data-number-group':''}]]){
                    input('ib-'+k+'-'+item.id,label,fields,item[k],value=>{item[k]=value;edited();},attrs);
                }
                const rates=element('select',{id:'ib-rate-'+item.id,class:'form-select'});
                for(const [value,text] of [['','선택'],['3.3','3.3%'],['8.8','8.8%']]) rates.append(element('option',{value},text));
                rates.value=item.rate;
                rates.addEventListener('change',()=>{if(current()){item.rate=rates.value;edited();}});
                appendField(fields,rates,'원천징수율');
                card.append(action('지급 건 삭제',()=>{
                    if(!current())return;
                    state.cases=state.cases.filter(c=>c!==item);render(addCase);edited();
                }));rows.append(card);
            }
            addCase.disabled=state.cases.length>=maxCases;
            (typeof focus==='string'?doc.getElementById(focus):focus)?.focus();
            recalc();
        }
        const addPayee=action('+ 강사 추가',()=>{
            if(!current()||state.payees.length>=maxPayees)return;
            const id=random();
            state.payees.push({id,name:''});render('ib-person-'+id);edited();
        });
        const addCase=action('+ 지급 건 추가',()=>{
            if(!current()||state.cases.length>=maxCases)return;
            const id=random();
            state.cases.push({id,payeeId:state.payees.length===1?state.payees[0].id:'',at:'',place:'',title:'',gross:'',rate:''});
            render('ib-payee-'+id);edited();
        });
        container.replaceChildren(heading,people,addPayee,element('hr'),
            element('p',{class:'small text-body-secondary'},'같은 강의 계약을 여러 차례 진행했다면 한 지급 건으로 입력해 주세요.'),
            rows,addCase,summary,message);
        render();
        return Object.freeze({snapshot:draftCopy, files:()=>new Map(files), applyEvidence(receipts){
            for(const {personId,kind,id,file} of receipts){
                const key=personId+':'+kind,person=state.payees.find(p=>p.id===personId);
                if(!person||!['identity','bank'].includes(kind)||!uuid.test(id)||files.get(key)!==file)
                    error('EVIDENCE_STALE','선택한 증빙이 바뀌었습니다. 다시 확인해 주세요.');
            }
            for(const {personId,kind,id} of receipts){
                state.payees.find(p=>p.id===personId)[kind]=id;
                files.delete(personId+':'+kind);
            }
            render();edited();
        }, restore(saved){
            // Undo/account switching belongs to the caller. File bytes never enter the JSON draft.
            files.clear();
            state={payees:[],cases:[]};
            if(Array.isArray(saved?.payees)&&Array.isArray(saved?.cases)){
                const validId=value=>typeof value==='string'&&uuid.test(value);
                state.payees=saved.payees.filter(x=>x&&validId(x.id)&&typeof x.name==='string').slice(0,maxPayees)
                    .map(p=>({id:p.id,name:p.name,identity:validId(p.identity)?p.identity:undefined,bank:validId(p.bank)?p.bank:undefined}));
                state.cases=saved.cases.filter(x=>x&&validId(x.id)).slice(0,maxCases)
                    .map(c=>Object.fromEntries(['id','payeeId','at','place','title','gross','rate'].map(k=>[k,typeof c[k]==='string'?c[k]:''])));
            }
            message.textContent='';render();
        }});
    }
    const api = Object.freeze({collect,approvalText,localDateTime,mount,maxPayees,maxCases});
    if (typeof module !== 'undefined' && module.exports) module.exports=api;
    else root.ApprovalInstructorBatch=api;
})(globalThis);
