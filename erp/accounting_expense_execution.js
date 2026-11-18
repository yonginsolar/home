/* v1.1.0 — 승인 문서와 별도로 실제 결제 및 영수증을 연결한다. */
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
        if (!part || part[1].startsWith('expense-receipts/') || part[1].split('/').some(p=>!p||p==='.'||p==='..')) return [];
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
    const receiptExtension = file => {
        const ext=String(file?.name||'').match(/\.(pdf|png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
        return ext && Number.isInteger(file?.size) && file.size>0 && file.size<=10485760 ? ext : '';
    };
    const uploadedReceiptPath=(value,doc)=>typeof value==='string' &&
        /^expense-receipts\/[a-f0-9-]{36}\/[1-9][0-9]{0,17}\/[a-f0-9-]{36}\.(pdf|png|jpe?g|webp)$/.test(value)
        && value.startsWith(`expense-receipts/${doc.coop_id}/${doc.id}/`);
    function limited(promise,ms=25000) {
        let timeout;
        return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{
            timeout=setTimeout(()=>reject(Error('영수증 준비 시간이 초과됐습니다. 전표는 저장하지 않았습니다.')),ms);
        })]).finally(()=>clearTimeout(timeout));
    }
    async function dropStagedReceipt(client,id) {
        const {data,error}=await client.rpc('accounting_expense_receipt_retire',{p_id:id});
        if(error || !/^expense-receipts\/[a-f0-9-]{36}\/[1-9][0-9]{0,17}\/[a-f0-9-]{36}\.(pdf|png|jpe?g|webp)$/.test(data||'')
            || data.split('/').pop().split('.')[0]!==id) return;
        await client.storage.from('attachments').remove([data]);
    }
    async function stageReceipt(client,doc,file,current,timeoutMs) {
        if (!current()) throw Error('연동 화면을 다시 열어 주세요.');
        const p_ext=receiptExtension(file);
        if (!p_ext) throw Error('영수증은 10MB 이하의 PDF·JPG·PNG·WebP 파일을 선택해 주세요.');
        const id=root.crypto.randomUUID();
        let abandoned=false;
        const work=(async()=>{
            const {data:path,error}=await client.rpc('accounting_expense_receipt_stage',{p_id:id,p_doc:doc.id,p_ext,p_size:file.size});
            if(error || !uploadedReceiptPath(path,doc)) throw Error('영수증을 준비하지 못했습니다. 전표는 저장하지 않았습니다.');
            if(abandoned || !current()) throw Error('연동 화면을 다시 열어 주세요.');
            const {error:uploadError}=await client.storage.from('attachments').upload(path,file,{upsert:false,cacheControl:'0'});
            if(uploadError) throw Error(uploadError.message || '영수증을 올리지 못했습니다.');
            if(abandoned || !current()) throw Error('연동 화면을 다시 열어 주세요.');
            return id;
        })();
        try { return await limited(work,timeoutMs); }
        catch (error) {
            abandoned=true;
            // A late upload can finish after the timeout. Retire only once it has settled.
            void work.catch(()=>{}).then(()=>dropStagedReceipt(client,id)).catch(()=>{});
            throw error;
        }
    }
    function selectedDraft(input={}) {
        const methodDifferent=input?.methodDifferent===true, different=input?.different===true;
        return {
            methodDifferent,different,
            ...(methodDifferent?{method:input.method,...(input.method==='card'?{card:input.card}:{})}:{}),
            ...(different?{amount:input.amount,reason:input.reason,receipt:input.receipt,
                ...(input.receipt==='new'?{receiptFile:input.receiptFile}:{})}:{})
        };
    }
    function assess(doc, input, cards) {
        const approved=won(doc.amount);
        if (!approved) throw Error('승인금액을 확인해 주세요.');
        const draft=selectedDraft(input);
        const actual=draft.different ? won(draft.amount) : approved;
        if (!actual) throw Error('실제 집행액을 1원 이상으로 입력해 주세요.');
        if (actual>approved) throw Error('승인금액을 초과했습니다. 원결재에 연결한 증액결의를 먼저 완료해 주세요.');
        const reason=String(draft.reason||'').trim(), confirmedSource=sourceMethod(doc);
        const method=draft.method, originalAlias=String(doc.expense_snapshot?.card_alias||'').trim();
        const receipt=draft.receipt===''||draft.receipt==null?null:receiptChoices(doc).find(r=>r.value===draft.receipt);
        if (actual!==approved && (!reason || reason.length>500)) throw Error('차액 사유를 입력해 주세요.');
        const receiptFile=actual!==approved&&draft.receipt==='new'?draft.receiptFile:null;
        if (actual!==approved && draft.receipt==='new' && !receiptExtension(receiptFile)) throw Error('영수증은 10MB 이하의 PDF·JPG·PNG·WebP 파일을 선택해 주세요.');
        if (actual!==approved && draft.receipt!=='' && draft.receipt!=null && draft.receipt!=='new' && !receipt) throw Error('연결할 영수증을 다시 선택해 주세요.');
        let actualMethod=confirmedSource, alias=confirmedSource==='bank'?'':originalAlias;
        if (method==='bank') { actualMethod='bank'; alias=''; }
        else if (method==='card') {
            const matching=cardChoices(doc,cards).filter(c=>c.card_alias===draft.card);
            if (matching.length!==1) throw Error('실제로 사용한 카드를 다시 선택해 주세요.');
            actualMethod=matching[0].card_type; alias=matching[0].card_alias;
        } else if (draft.methodDifferent) throw Error('실제 결제수단을 선택해 주세요.');
        return {approved,actual,reason,receipt,receiptFile,actualMethod,alias,confirmedSource,originalAlias,
            changed:actual!==approved || actualMethod!==confirmedSource || alias!==(confirmedSource==='bank'?'':originalAlias)};
    }
    async function resolve(doc, input, cards) {
        const v=assess(doc,input,cards);
        return {amount:v.actual, method:v.actualMethod, alias:v.alias, approved:v.approved,receiptFile:v.receiptFile, execution:v.changed?{
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
    async function readExecution(client,id) {
        const {data,error}=await limited(client.rpc('approval_expense_execution_summary',{p_doc:id}),10000);
        if(error) throw Error('EXPENSE_EXECUTION_READ');
        return data;
    }
    async function readReceiptLink(client,path) {
        const {data,error}=await limited(client.storage.from('attachments').createSignedUrl(path,90),10000);
        if(error || !/^https:\/\//.test(data?.signedUrl||'')) throw Error('EXPENSE_EXECUTION_RECEIPT_READ');
        return data.signedUrl;
    }
    async function mountSummary({el,doc,client,current}) {
        if (!current() || !eligible(doc) || !['완료','실물결재완료'].includes(doc.status)) return;
        const data=await readExecution(client,doc.id);
        if (!current() || !data || !won(data.actual_amount) || !Object.hasOwn(methods,data.actual_method)) return;
        const path=uploadedReceiptPath(data.uploaded_receipt,doc)?data.uploaded_receipt:
            (await findReceipt(doc,data.receipt_digest))?.path;
        if(!current())return;
        const make=(tag,cls,text)=>{
            const node=el.ownerDocument.createElement(tag);node.className=cls;
            if(text)node.textContent=text;return node;
        };
        const section=make('section','mt-3 p-3 border rounded text-break');
        const head=make('h5','h6 fw-bold mb-2','실제 집행');
        section.append(head,make('p','mb-1',`결제금액: ${format(data.actual_amount)}`),
            make('p','mb-1',`결제수단: ${methods[data.actual_method]}${data.actual_card?' · '+data.actual_card:''}`));
        if(data.reason)section.append(make('p','mb-1',`차액 사유: ${data.reason}`));
        if(path) {
            const button=make('button','btn btn-outline-secondary btn-sm mt-2','연결한 영수증');
            const status=make('span','ms-2 small');status.setAttribute('role','status');button.type='button';
            button.addEventListener('click',async()=>{
                if(button.disabled||!current()||!section.isConnected)return;
                button.disabled=true;status.textContent='확인 중…';
                try {
                    const url=await readReceiptLink(client,path);
                    if (!current()||!section.isConnected) return;
                    const link=make('a','link-primary','영수증 열기');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
                    status.replaceChildren(link);
                    setTimeout(()=>{if(status.contains(link))status.textContent='';},85000);
                } catch (_) {if(current())status.textContent='영수증을 열 수 없습니다. 다시 시도해 주세요.';}
                finally {if(current())button.disabled=false;}
            });
            section.append(button,status);
        }
        el.append(section);
    }
    function controls({doc, cards, section, check, draft, index, el, onInput}) {
        const state=draft.execution ||= {methodDifferent:false,different:false,amount:'',reason:'',receipt:'',method:'',card:''};
        const approved=won(doc.amount), ownerId='expenseExecution'+index;
        const field=(title,name,tag,cls)=>{
            const input=el(tag,cls);input.id=ownerId+name;
            const label=el('label','form-label',title);label.htmlFor=input.id;
            const wrap=el('div','mb-2');wrap.append(label,input);
            return {input,wrap};
        };
        const add=(select,value,name)=>{const option=el('option','',name);option.value=value;select.append(option);};
        const option=(caption,name,checked)=>{
            const wrap=el('div','form-check mb-2'), input=el('input','form-check-input');
            input.type='checkbox';input.id=ownerId+name;input.checked=checked===true;
            const label=el('label','form-check-label',caption);label.htmlFor=input.id;wrap.append(input,label);
            return {input,wrap};
        };
        const adjustments=el('fieldset','mt-3 mb-2');
        adjustments.append(el('legend','visually-hidden','실제 결제 정보'));
        const methodFlag=option('결제수단 다름','MethodDifferent',state.methodDifferent);
        const method=field('실제 결제수단','Method','select','form-select');
        add(method.input,'','실제 결제수단 선택');
        add(method.input,'bank','계좌이체 · 보통예금');add(method.input,'card','조합 등록 카드');
        method.input.value=state.method;
        const card=field('실제로 사용한 카드','Card','select','form-select');add(card.input,'','카드 선택');
        for (const c of cardChoices(doc,cards)) add(card.input,c.card_alias,`${c.card_alias} · ${methods[c.card_type]}`);
        card.input.value=state.card;
        const flag=option('결제금액 다름','Different',state.different);
        const amount=field('실제 결제금액','Amount','input','form-control');amount.input.inputMode='numeric';amount.input.autocomplete='off';amount.input.maxLength=20;amount.input.value=state.amount;
        const reason=field('차액 사유','Reason','textarea','form-control');reason.input.rows=2;reason.input.maxLength=500;reason.input.value=state.reason;
        const attachments=receiptChoices(doc);
        const receipt=field('실제 결제 영수증','Receipt','select','form-select');add(receipt.input,'','선택 안 함');
        for(const r of attachments)add(receipt.input,r.value,r.name);
        add(receipt.input,'new','새 영수증 첨부');
        receipt.input.value=state.receipt;
        const receiptHint=el('p','form-text mb-2','견적서가 아닌 실제 결제금액의 영수증을 선택해 주세요.');
        const file=field('영수증 파일','ReceiptFile','input','form-control');
        file.input.type='file';file.input.accept='.pdf,.jpg,.jpeg,.png,.webp';
        const selectedFile=el('p','form-text mb-0');file.wrap.append(selectedFile);
        file.input.addEventListener('change',()=>{
            state.receiptFile=file.input.files?.[0]||state.receiptFile;sync();
        });
        const status=el('p','small mt-2 mb-1');status.setAttribute('aria-live','polite');
        adjustments.append(methodFlag.wrap,method.wrap,card.wrap,flag.wrap,amount.wrap,reason.wrap,receipt.wrap,receiptHint,file.wrap,status);section.append(adjustments);
        function sync() {
            const enabled=check.checked;
            methodFlag.input.disabled=flag.input.disabled=!enabled;
            const show=(f,visible)=>{f.wrap.hidden=!visible;f.input.disabled=!enabled||!visible;};
            show(method,state.methodDifferent);show(card,state.methodDifferent&&state.method==='card');
            show(amount,state.different);
            const actual=won(state.amount), changed=state.different&&actual!==null&&actual!==approved,
                over=enabled&&state.different&&actual>approved;
            show(reason,changed);show(receipt,changed);receiptHint.hidden=!changed;
            show(file,changed&&state.receipt==='new');
            selectedFile.textContent=state.receiptFile?`선택한 파일: ${state.receiptFile.name}`:'';
            status.textContent=over?'승인금액을 초과했습니다. 증액결의를 먼저 완료해 주세요.'
                :enabled&&state.different&&actual&&actual!==approved?`연동 총액 ${format(actual)} · 차액 ${format(approved-actual)}`:'';
            status.classList.toggle('text-danger',over);
            onInput?.();
        }
        check.addEventListener('change',sync);
        for(const [f,key,name] of [[method,'method','change'],[card,'card','change'],[amount,'amount','input'],[reason,'reason','input'],[receipt,'receipt','change']])
            f.input.addEventListener(name,()=>{state[key]=f.input.value;sync();});
        methodFlag.input.addEventListener('change',()=>{state.methodDifferent=methodFlag.input.checked;sync();});
        flag.input.addEventListener('change',()=>{state.different=flag.input.checked;sync();});
        amount.input.addEventListener('blur',()=>{const value=won(amount.input.value);if(value)state.amount=amount.input.value=value.toLocaleString('ko-KR');});
        sync();
    }
    root.CoopExpenseExecution=Object.freeze({eligible,sourceMethod,selectedDraft,assess,resolve,controls,summary,findReceipt,
        uploadedReceiptPath,stageReceipt,dropStagedReceipt,readExecution,readReceiptLink,mountSummary,won,format,methods});
})(typeof window==='undefined'?globalThis:window);
