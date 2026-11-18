/* v1.0.0 — 최초 일반 지출 집행과 원결재를 분리한다. */
(function (root) {
    'use strict';
    const methods = { bank: '계좌이체', check_card: '체크카드', credit_card: '신용카드' };
    const sourceMethod = doc => ['check_card','credit_card'].includes(doc?.expense_snapshot?.payment_method)
        ? doc.expense_snapshot.payment_method : 'bank';
    const won = value => {
        const s = String(value ?? '').trim();
        if (!/^(?:[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(s)) return null;
        const n = Number(s.replaceAll(',', ''));
        return Number.isSafeInteger(n) && n <= 999999999999999 ? n : null;
    };
    const format = n => n.toLocaleString('ko-KR') + '원';
    const eligible = doc => {
        const s = doc?.expense_snapshot || {};
        return doc?.doc_type === '지출결의' && !doc.salary_ledger_snapshot
            && (!s.expense_sub_type || s.expense_sub_type === '일반')
            && (!s.adjustment_type || s.adjustment_type === 'new')
            && !s.original_approval_id && !s.payout && !s.insurance && !s.withholding_tax && s.inventory_purchase?.enabled !== true
            && !/급여|salary|퇴직연금|인건비|4대보험|원천세|근로소득세/i.test(`${doc.title || ''} ${doc.content || ''}`);
    };
    const cardChoices = (doc, cards) => cards.filter(c => c.coop_id === doc.coop_id && c.card_alias
        && ['check_card','credit_card'].includes(c.card_type));
    const receiptChoices = doc => (Array.isArray(doc.file_links) ? doc.file_links : []).flatMap((ref, index) => {
        const part=typeof ref==='string'?ref.match(/^attachments\/([A-Za-z0-9_./-]+)(?:\?|$)/):null;
        if (!part || part[1].split('/').some(p=>!p||p==='.'||p==='..')) return [];
        const pos = ref.indexOf('?');
        const name = new URLSearchParams(pos<0?'':ref.slice(pos+1)).get('display_name') || `첨부 ${index+1}`;
        return [{ value:String(index), name, ref, path:part[1] }];
    });
    const digest = async text => Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x=>x.toString(16).padStart(2,'0')).join('');
    async function findReceipt(doc, expected) {
        if (!/^[a-f0-9]{64}$/.test(expected||'')) return null;
        for(const ref of receiptChoices(doc))if(await digest(ref.ref)===expected)return ref;
        return null;
    }
    function assess(doc, input, cards) {
        const approved=won(doc.amount);
        if (!approved) throw Error('승인금액을 확인해 주세요.');
        const draft=input || {};
        const actual=draft.different ? won(draft.amount) : approved;
        if (!actual) throw Error('실제 집행액을 1원 이상으로 입력해 주세요.');
        if (actual>approved) throw Error('승인금액을 초과했습니다. 원결재에 연결한 증액결의를 먼저 완료해 주세요.');
        const reason=String(draft.reason||'').trim(), confirmedSource=sourceMethod(doc);
        const method=draft.method || 'original', originalAlias=String(doc.expense_snapshot?.card_alias||'').trim();
        const receipt=draft.receipt===''||draft.receipt==null?null:receiptChoices(doc).find(r=>r.value===draft.receipt);
        if (actual!==approved && (!reason || reason.length>500)) throw Error('차액 사유를 입력해 주세요.');
        if (actual!==approved && draft.receipt!=='' && draft.receipt!=null && !receipt) throw Error('연결할 영수증을 다시 선택해 주세요.');
        let actualMethod=confirmedSource, alias=confirmedSource==='bank'?'':originalAlias;
        if (method==='bank') { actualMethod='bank'; alias=''; }
        else if (method==='card') {
            const matching=cardChoices(doc,cards).filter(c=>c.card_alias===draft.card);
            if (matching.length!==1) throw Error('실제로 사용한 카드를 다시 선택해 주세요.');
            actualMethod=matching[0].card_type; alias=matching[0].card_alias;
        } else if (method!=='original') throw Error('실제 결제수단을 다시 선택해 주세요.');
        return {approved,actual,reason,receipt,actualMethod,alias,confirmedSource,originalAlias,
            changed:actual!==approved || actualMethod!==confirmedSource || alias!==(confirmedSource==='bank'?'':originalAlias)};
    }
    async function resolve(doc, input, cards) {
        const v=assess(doc,input,cards);
        return {amount:v.actual, method:v.actualMethod, alias:v.alias, approved:v.approved, execution:v.changed?{
            approved_amount:v.approved, actual_amount:v.actual, approved_method:v.confirmedSource,
            approved_card:v.confirmedSource==='bank'?'':v.originalAlias,
            actual_method:v.actualMethod, actual_card:v.alias, reason:v.actual===v.approved?'':v.reason,
            receipt_index:v.actual!==v.approved&&v.receipt?Number(v.receipt.value):null,
            receipt_digest:v.actual!==v.approved&&v.receipt?await digest(v.receipt.ref):null
        }:null};
    }
    function summary(data) {
        if (!data || !won(data.approved_amount) || !won(data.actual_amount) || !Object.hasOwn(methods,data.actual_method)
            || !Object.hasOwn(methods,data.approved_method)) return [];
        const list=[];
        if (data.approved_amount!==data.actual_amount) list.push(`승인 ${format(data.approved_amount)} · 실제 집행·연동 ${format(data.actual_amount)}`,`차액 사유: ${data.reason}`);
        const label=(key,card)=>methods[key]+(key==='bank'?' · 보통예금':card?' · '+card:'');
        if (data.approved_method!==data.actual_method || data.approved_card!==data.actual_card)
            list.push(`승인: ${label(data.approved_method,data.approved_card)} → 실제: ${label(data.actual_method,data.actual_card)}`);
        return list;
    }
    function controls({doc, cards, section, check, draft, index, el, onInput}) {
        const state=draft.execution ||= {different:false,amount:'',reason:'',receipt:'',method:'original',card:''};
        const approved=won(doc.amount), ownerId='expenseExecution'+index;
        const field=(title,name,tag,cls)=>{
            const input=el(tag,cls);input.id=ownerId+name;
            const label=el('label','form-label',title);label.htmlFor=input.id;
            const wrap=el('div','mb-2');wrap.append(label,input);
            return {input,wrap};
        };
        const add=(select,value,name)=>{const option=el('option','',name);option.value=value;select.append(option);};
        const details=el('details','mt-2 mb-2'), label=el('summary','fw-semibold','금액·결제수단 변경');details.append(label);
        const method=field('실제 결제수단','Method','select','form-select');
        add(method.input,'original','원결재와 같음');
        add(method.input,'bank','계좌이체 · 보통예금');add(method.input,'card','조합 등록 카드');
        method.input.value=state.method;
        const card=field('실제로 사용한 카드','Card','select','form-select');add(card.input,'','카드 선택');
        for (const c of cardChoices(doc,cards)) add(card.input,c.card_alias,`${c.card_alias} · ${methods[c.card_type]}`);
        card.input.value=state.card;
        const flag=field('실제 집행액이 다름','Different','input','form-check-input ms-2');
        flag.input.type='checkbox';flag.input.checked=state.different;
        const amount=field('실제 집행액','Amount','input','form-control');amount.input.inputMode='numeric';amount.input.autocomplete='off';amount.input.maxLength=20;amount.input.value=state.amount;
        const reason=field('차액 사유','Reason','textarea','form-control');reason.input.rows=2;reason.input.maxLength=500;reason.input.value=state.reason;
        const receipt=field('관련 영수증','Receipt','select','form-select');add(receipt.input,'','선택 안 함');
        for(const r of receiptChoices(doc))add(receipt.input,r.value,r.name);
        receipt.input.value=state.receipt;
        const status=el('p','small mt-2 mb-1');status.setAttribute('aria-live','polite');
        details.append(method.wrap,card.wrap,flag.wrap,amount.wrap,reason.wrap,receipt.wrap,status);section.append(details);
        if(state.different||state.method!=='original')details.open=true;
        function sync() {
            const enabled=check.checked;
            for(const f of [method,card,flag,amount,reason,receipt]) f.input.disabled=!enabled;
            card.wrap.hidden=state.method!=='card'; card.input.disabled ||= card.wrap.hidden;
            amount.wrap.hidden=!state.different; amount.input.disabled ||= amount.wrap.hidden;
            const changed=state.different&&won(state.amount)!==approved;
            for(const f of [reason,receipt]) {f.wrap.hidden=!changed;f.input.disabled ||= f.wrap.hidden;}
            const actual=won(state.amount), over=enabled&&state.different&&actual>approved;
            status.textContent=over?'승인금액을 초과했습니다. 증액결의를 먼저 완료해 주세요.'
                :enabled&&state.different&&actual&&actual!==approved?`연동 총액 ${format(actual)} · 차액 ${format(approved-actual)}`:'';
            status.classList.toggle('text-danger',over);
            onInput?.();
        }
        check.addEventListener('change',sync);
        for(const [f,key,name] of [[method,'method','change'],[card,'card','change'],[amount,'amount','input'],[reason,'reason','input'],[receipt,'receipt','change']])
            f.input.addEventListener(name,()=>{state[key]=f.input.value;sync();});
        flag.input.addEventListener('change',()=>{state.different=flag.input.checked;sync();});
        amount.input.addEventListener('blur',()=>{const value=won(amount.input.value);if(value)state.amount=amount.input.value=value.toLocaleString('ko-KR');});
        sync();
    }
    root.CoopExpenseExecution=Object.freeze({eligible,sourceMethod,assess,resolve,controls,summary,findReceipt,won,format,methods});
})(typeof window==='undefined'?globalThis:window);
