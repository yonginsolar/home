(function (root) {
    'use strict';
    const text = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 140;
    const won = value => Number.isSafeInteger(value) && value > 0;
    const month = value => typeof value === 'string' && /^20\d\d-(0[1-9]|1[0-2])$/.test(value);
    const hold = reason => ({ state: 'hold', reason });
    function previewRent({ coopId, contract, receivable, receipt, applied = [] }) {
        if (!text(coopId) || [contract, receivable, receipt].some(row => !row || row.coopId !== coopId)) return hold('same-coop-required');
        if (!text(contract.id) || contract.state !== 'confirmed' || receivable.contractId !== contract.id || !text(receivable.id)) return hold('confirmed-contract-required');
        if (!month(receivable.month) || !won(receivable.amount)) return hold('verified-period-and-amount-required');
        if (receipt.kind !== 'credit' || receipt.state !== 'confirmed' || !text(receipt.bankAccountId) ||
            !text(receipt.bankReference) || !won(receipt.amount) || receipt.purpose !== 'rent') return hold('confirmed-rent-credit-required');
        const sourceKey = JSON.stringify([coopId, receipt.bankAccountId, receipt.bankReference]);
        const same = applied.filter(row => row.coopId === coopId && row.sourceKey === sourceKey);
        if (same.length) return same.length === 1 && same[0].receivableId === receivable.id && same[0].amount === receipt.amount
            ? { state: 'already-linked' } : hold('credit-already-linked');
        const paid = applied.filter(row => row.coopId === coopId && row.receivableId === receivable.id);
        if (paid.some(row => !won(row.amount)) || new Set(paid.map(row => row.sourceKey)).size !== paid.length) return hold('conflicting-history');
        const balance = BigInt(receivable.amount) - paid.reduce((total, row) => total + BigInt(row.amount), 0n);
        return balance < 0n || BigInt(receipt.amount) > balance ? hold('review-excess-credit')
            : { state: 'preview', month: receivable.month, received: receipt.amount, remaining: Number(balance - BigInt(receipt.amount)) };
    }
    function reviewInstructor({ coopId, record }) {
        if (!text(coopId) || record?.coopId !== coopId) return hold('same-coop-required');
        if (record.evidenceState !== 'confirmed' || record.workRelationship === 'unknown') return hold('confirmed-engagement-required');
        if (record.payeeType !== 'resident-individual') return hold('separate-payee-review-required');
        const { workRelationship, servicePattern, amount, duplicate } = record;
        if (duplicate) return hold('possible-duplicate-payment');
        if (!won(amount)) return hold('confirmed-gross-amount-required');
        if (workRelationship === 'employment') return { state: 'manual-review', income: 'wages', amount };
        if (workRelationship !== 'independent') return hold('confirmed-engagement-required');
        if (!['ongoing', 'occasional'].includes(servicePattern)) return hold('confirmed-service-pattern-required');
        return { state: 'manual-review', income: servicePattern === 'ongoing' ? 'business' : 'other', amount };
    }

    const fmt = new Intl.NumberFormat('ko-KR');
    const messages = {
        'same-coop-required': '같은 조합 자료인지 확인해 주세요.',
        'confirmed-contract-required': '임대 계약을 확인해 주세요.',
        'verified-period-and-amount-required': '청구월과 청구액을 확인해 주세요.',
        'confirmed-rent-credit-required': '확인된 임대료 입금과 원거래 번호를 입력해 주세요. 보증금과 기타 입금은 포함하지 않습니다.',
        'credit-already-linked': '다른 청구에 연결된 거래입니다. 중복 반영하지 않습니다.',
        'conflicting-history': '먼저 연결한 금액을 다시 확인해 주세요.',
        'review-excess-credit': '청구 잔액보다 입금액이 큽니다. 차액의 성격을 확인해 주세요.',
        'confirmed-engagement-required': '계약 관계를 확인해 주세요.',
        'separate-payee-review-required': '거주자 개인이 아니거나 확인되지 않은 지급 대상은 별도로 검토해 주세요.',
        'possible-duplicate-payment': '중복 지급 가능성이 있습니다. 이전 지급 내역을 확인해 주세요.',
        'confirmed-gross-amount-required': '지급 총액을 원 단위 양의 정수로 입력해 주세요.',
        'confirmed-service-pattern-required': '강의가 계속·반복인지 일시적인지 확인해 주세요.'
    };
    const income = { wages: '근로소득 검토', business: '사업소득 검토', other: '기타소득 검토' };
    const configs = {
        rent: {
            title: '임대 매출', note: '입력한 자료로 청구와 입금을 대조합니다. 실제 계좌·전표에는 연결하지 않습니다.',
            fields: [
                ['contract','임대 계약 식별값','text'], ['contractStatus','계약 확인','select',[['unknown','미확인'],['confirmed','확인됨']]],
                ['month','청구월','month'], ['billed','청구액 (원)','number'], ['account','계좌 식별값','text'],
                ['reference','은행 원거래 번호','text'], ['received','입금액 (원)','number'],
                ['purpose','입금 구분','select',[['unknown','미확인'],['rent','확인된 임대료'],['deposit','보증금'],['other','기타 입금']]],
                ['prior','앞서 연결한 임대료 (원, 선택)','number'],
                ['link','이 입금의 기존 연결','select',[['none','없음'],['same','같은 청구에 연결'],['other','다른 청구에 연결']]]
            ],
            example: { contract:'예시 계약 A', contractStatus:'confirmed', month:'2026-11', billed:'500000',
                account:'예시 계좌 A', reference:'TEST-123', received:'200000', purpose:'rent', prior:'100000', link:'none' }
        },
        instructor: {
            title: '강사비 원천세', note: '입력한 계약과 지급 조건으로 소득 구분을 검토합니다. 세액을 계산하거나 신고하지 않습니다.',
            fields: [
                ['payee','지급 대상','select',[['unknown','미확인'],['resident-individual','거주자 개인'],['other','법인·비거주자 등']]],
                ['relationship','계약 관계','select',[['unknown','미확인'],['employment','고용관계'],['independent','독립적으로 제공']]],
                ['pattern','강의 형태','select',[['unknown','미확인'],['ongoing','계속·반복'],['occasional','일시적']]],
                ['amount','지급 총액 (원)','number'],
                ['duplicate','중복 지급 가능성','select',[['no','없음'],['yes','있음']]]
            ],
            example: { payee:'resident-individual', relationship:'independent', pattern:'occasional', amount:'200000', duplicate:'no' }
        }
    };
    function el(tag, className, label) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (label) node.textContent = label;
        return node;
    }
    function button(label, className, type = 'button') {
        const node = el('button', className, label);
        node.type = type;
        return node;
    }
    function addField(parent, [key, label, kind, options]) {
        const wrap = el('div', 'col-12 col-md-6'), caption = el('label', 'form-label', label);
        const input = el(kind === 'select' ? 'select' : 'input', kind === 'select' ? 'form-select' : 'form-control');
        input.id = 'accountingPilotField-' + key;
        caption.htmlFor = input.id;
        if (kind === 'select') for (const [value, name] of options) input.add(new Option(name, value));
        else {
            input.type = kind;
            input.autocomplete = 'off';
            if (kind === 'number') { input.min = '0'; input.step = '1'; input.inputMode = 'numeric'; }
            else if (kind === 'text') input.maxLength = 140;
        }
        wrap.append(caption, input);
        parent.append(wrap);
        return input;
    }
    const number = value => /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
    function runRent(get, coopId) {
        const contractId = get('contract'), bill = get('month'), receivableId = bill;
        const amount = number(get('received')), account = get('account'), reference = get('reference');
        const attached = get('link'), previous = get('prior'), applied = [];
        if (previous && number(previous) !== 0) applied.push({ coopId, receivableId, sourceKey: 'previous-preview', amount: number(previous) });
        if (attached !== 'none') applied.push({ coopId, receivableId: attached === 'same' ? receivableId : 'another-preview',
            sourceKey: JSON.stringify([coopId, account, reference]), amount });
        return previewRent({ coopId, contract: { id: contractId, coopId, state: get('contractStatus') },
            receivable: { id: receivableId, coopId, contractId, month: bill, amount: number(get('billed')) },
            receipt: { coopId, bankAccountId: account, bankReference: reference, amount, kind: 'credit',
                state: get('purpose') === 'unknown' ? 'unconfirmed' : 'confirmed', purpose: get('purpose') },
            applied });
    }
    function runInstructor(get, coopId) {
        const workRelationship = get('relationship');
        return reviewInstructor({ coopId, record: { coopId, workRelationship,
            evidenceState: workRelationship === 'unknown' ? 'unconfirmed' : 'confirmed',
            payeeType: get('payee'), servicePattern: get('pattern'), amount: number(get('amount')),
            duplicate: get('duplicate') === 'yes' } });
    }
    function display(result) {
        if (result.state === 'hold') return '검토 필요 · ' + messages[result.reason];
        if (result.state === 'already-linked') return '같은 청구에 이미 연결된 거래입니다. 중복 반영하지 않습니다.';
        if (result.state === 'preview') return result.month + ' · 입금 ' + fmt.format(result.received) + '원 · 남은 청구액 ' + fmt.format(result.remaining) + '원';
        return income[result.income] + ' · 지급 총액 ' + fmt.format(result.amount) + '원';
    }

    let opened = null;
    function close() {
        if (!opened) return;
        const { dialog, controls, result } = opened;
        controls.forEach(node => { node.value = ''; });
        result.textContent = '';
        dialog.hide();
    }
    function open(mode, { coopId, current, trigger }) {
        const config = Object.hasOwn(configs, mode) ? configs[mode] : null;
        if (!config || !text(coopId) || !current() || opened) return;
        const overlay = el('div', 'modal fade');
        overlay.tabIndex = -1;
        overlay.setAttribute('aria-labelledby', 'accountingPilotTitle');
        const shell = el('div', 'modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable');
        const form = el('form', 'modal-content');
        form.noValidate = true;
        const header = el('div', 'modal-header');
        const title = el('h2', 'modal-title h5 mb-0', config.title);
        title.id = 'accountingPilotTitle';
        const dismiss = button('', 'btn-close');
        dismiss.setAttribute('aria-label', '닫기');
        dismiss.dataset.bsDismiss = 'modal';
        header.append(title, dismiss);
        const body = el('div', 'modal-body'), fields = el('div', 'row g-3');
        const result = el('output', 'd-block mt-3 fw-semibold text-break');
        result.setAttribute('role', 'status');
        result.setAttribute('aria-live', 'polite');
        const controls = new Map(config.fields.map(spec => [spec[0], addField(fields, spec)]));
        const get = key => controls.get(key).value.trim();
        const refresh = () => {
            result.textContent = '';
            if (mode === 'instructor') controls.get('pattern').disabled = get('relationship') !== 'independent';
        };
        body.append(el('p', 'small text-body-secondary', config.note), fields, result);
        form.addEventListener('input', refresh);
        form.addEventListener('change', refresh);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!current()) { close(); return; }
            result.textContent = display(mode === 'rent' ? runRent(get, coopId) : runInstructor(get, coopId));
        });
        const footer = el('div', 'modal-footer');
        const example = button('예시 채우기', 'btn btn-outline-secondary me-auto');
        example.addEventListener('click', () => {
            if (!current()) { close(); return; }
            Object.entries(config.example).forEach(([key,value]) => { controls.get(key).value = value; });
            refresh();
        });
        footer.append(example, button('검토하기', 'btn btn-primary', 'submit'));
        form.append(header,body,footer);
        shell.append(form); overlay.append(shell); document.body.append(overlay);
        const dialog = root.bootstrap.Modal.getOrCreateInstance(overlay);
        const frame = root.frameElement;
        const observer = frame && new MutationObserver(() => { if (!current()) close(); });
        observer?.observe?.(frame, { attributes:true, attributeFilter:['hidden'] });
        opened = { dialog, controls, result };
        overlay.addEventListener('shown.bs.modal', () => {
            if (!current()) { close(); return; }
            controls.values().next().value.focus();
        }, { once:true });
        overlay.addEventListener('hidden.bs.modal', () => {
            observer?.disconnect?.();
            dialog.dispose(); overlay.remove(); opened = null;
            if (current() && trigger?.isConnected) trigger.focus({ preventScroll:true });
        }, { once:true });
        refresh(); dialog.show();
    }
    root.CoopAccountingReviewPilot = Object.freeze({ version:'1.0.0', open, close });
})(window);
