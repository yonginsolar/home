/* Card cancellations and mistaken deposits: tenant-scoped, transactional saves. */
window.AccountingMoney = (() => {
    'use strict';
    let selected = null, cases = [], sources = [], saving = false, sourceSeq = 0, listSeq = 0, sourceOffset = 0, moneyCards = null, moneyAccounts = null;
    const $ = id => document.getElementById(id);
    const esc = value => escapeHtml(String(value ?? ''));
    const won = value => Number(value || 0).toLocaleString('ko-KR') + '원';
    const guides = [
        { key: 'receive', title: '착오입금 등록', words: '착오입금 잘못 들어온 돈 오입금 과오납 가수금 입금자', text: '매출이 아닌, 돌려줄 돈을 가수금으로 기록합니다. 입금일·입금자와 금액을 적어 주세요.' },
        { key: 'return', title: '착오입금 반환', words: '착오입금 반환 환불 돌려주기 가수금', text: '아래 등록 내역에서 반환 확인을 누릅니다. 실제 이체한 날짜와 금액을 확인하면 가수금과 통장 출금이 함께 기록됩니다.' },
        { key: 'cancel', title: '카드 결제 취소', words: '카드 취소 체크카드 신용카드 부분 취소 감액 반품', text: '원래 지출을 찾아 선택한 뒤 취소 금액과 카드대금 납부·환급 상태를 확인합니다. 원래 계정과 공제한 부가세를 함께 되돌립니다.' },
        { key: 'refund', title: '카드 환급·다음 대금 차감', words: '카드 환급 반환 입금 미수금 다음 대금 차감 상계', text: '이미 등록한 취소 건에서 환급 확인을 누릅니다. 통장 입금인지 다음 카드대금 차감인지 구분해 실제 처리일에 기록합니다.' }
    ];
    const errors = {
        ACCOUNTING_ACCESS_REQUIRED: '이 조합의 회계 열람 권한이 필요합니다.', ACCOUNTING_EDIT_REQUIRED: '회계 입력 권한이 필요합니다.',
        ACCOUNT_SETUP_REQUIRED: '현재 조합의 계정과목에 보통예금·가수금·미수금·미지급금 중 필요한 항목이 없습니다. 계정과목을 먼저 등록해 주세요.',
        CANCEL_EXCEEDS_ORIGINAL: '이미 취소한 금액을 포함하면 원래 지출액을 초과합니다. 내역을 새로 불러와 주세요.',
        SETTLEMENT_EXCEEDS_REMAINING: '이미 처리한 금액을 포함하면 남은 금액을 초과합니다. 내역을 새로 불러와 주세요.',
        CLOSED_YEAR: '결산 마감한 연도에는 이 화면에서 전표를 추가할 수 없습니다.', DATE_BEFORE_ORIGINAL: '원거래보다 앞선 날짜는 사용할 수 없습니다.',
        INVENTORY_RETURN_REVIEW_REQUIRED: '재고 입고와 연결된 지출입니다. 물품 반품·입고 수량 확인이 함께 필요하므로 이 화면에서 금액만 취소하지 않습니다.',
        LEGACY_CANCELLATION_REVIEW_REQUIRED: '이 원거래에는 기존 방식으로 반영한 감액이 있습니다. 계정·부가세 확인 후 처리해야 합니다.',
        CHECK_ORIGINAL_FUNDING_MISMATCH: '체크카드 원거래가 통장 출금으로 기록되어 있지 않습니다. 원전표를 먼저 확인해 주세요.',
        UNPAID_ORIGINAL_FUNDING_MISMATCH: '이 원거래는 미지급금으로 기록되어 있지 않습니다. 납부 상태와 원전표를 확인해 주세요.',
        ORIGINAL_NOT_SIMPLE_PURCHASE: '이 전표는 여러 정산이 섞여 있어 자동 취소할 수 없습니다. 원전표를 확인해 주세요.',
        ORIGINAL_REQUIRED: '원래 지출 전표를 선택해 주세요.', CARD_REQUIRED: '현재 조합에 등록한 카드를 선택해 주세요.',
        CARD_TYPE_MISMATCH: '카드 종류와 선택한 처리 방식이 맞지 않습니다.', PAYMENT_CONFIRMATION_REQUIRED: '이미 카드대금을 납부했는지 확인해 주세요.',
        INVALID_ADJUSTMENT_APPROVAL: '선택한 감액 결재의 원결재·금액·승인 상태가 맞지 않습니다.', APPROVAL_ALREADY_POSTED: '이 감액 결재는 이미 반영되었습니다.',
        CASE_NOT_FOUND: '내역이 없거나 등록 취소된 건입니다. 새로 불러와 주세요.', SETTLED_CASE_CANNOT_VOID: '별도의 환급·반환 기록이 있어 등록 취소할 수 없습니다. 처리 내역을 먼저 확인해 주세요.',
        INVALID_AMOUNT: '금액을 1원 이상의 정수로 입력해 주세요.', INVALID_DATE: '실제 처리일을 오늘 또는 이전 날짜로 입력해 주세요.',
        INVALID_CANCEL_VAT: '취소 증빙의 부가세가 남은 공제 매입세액 또는 취소 금액을 초과합니다. 원거래와 증빙을 확인해 주세요.',
        DESCRIPTION_REQUIRED: '입금자명 또는 취소 내용을 입력해 주세요.', INVALID_METHOD: '처리 방법을 확인해 주세요.'
    };
    function errorText(error) {
        const message = String(error?.message || error || '');
        return Object.entries(errors).find(([code]) => message.includes(code))?.[1] || '처리하지 못했습니다. 입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요.';
    }
    async function api(action, data = {}) {
        const result = await _supabase.rpc('accounting_money_admin', { p_action: action, p_data: data });
        if (result.error) throw result.error;
        return result.data || {};
    }
    function button(text, fn, className = 'btn btn-outline-primary') {
        const element = document.createElement('button');
        element.type = 'button'; element.className = className; element.textContent = text;
        element.addEventListener('click', fn); return element;
    }
    function mount() {
        if ($('moneyGuideSearch')) return;
        $('accountingMoneyPanel').innerHTML = `
          <h5 class="fw-bold">🔎 어떤 업무를 처리하시나요?</h5>
          <label class="form-label" for="moneyGuideSearch">업무 이름이나 계정과목 검색</label>
          <input class="form-control mb-3" id="moneyGuideSearch" type="search" placeholder="예: 착오입금, 잘못 들어온 돈, 카드 취소, 가수금">
          <div class="row g-3 mb-4" id="moneyGuides"></div>
          <div id="moneyEditor" class="money-panel mb-4" hidden></div>
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2"><h5 class="m-0">취소·환급 및 착오입금 등록 내역</h5><button class="btn btn-outline-secondary" type="button" id="moneyReload">새로고침</button></div>
          <div class="input-group mb-3"><input id="moneyCaseSearch" class="form-control" type="search" aria-label="등록 내역 검색" placeholder="입금자·취소 내용·카드 이름"><button class="btn btn-outline-secondary" id="moneyCaseFind" type="button">검색</button></div>
          <div id="moneyStatus" class="text-muted mb-2" role="status"></div><div id="moneyCases"></div><button class="btn btn-outline-secondary mt-2" type="button" id="moneyMore" hidden>이전 내역 더 보기</button>`;
        $('moneyGuideSearch').addEventListener('input', renderGuides);
        $('moneyReload').addEventListener('click', () => loadCases());
        $('moneyCaseFind').addEventListener('click', () => loadCases());
        $('moneyCaseSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); loadCases(); } });
        $('moneyMore').addEventListener('click', () => loadCases(true));
        renderGuides();
    }
    function renderGuides() {
        const query = $('moneyGuideSearch').value.trim().replace(/\s/g, '').toLowerCase();
        $('moneyGuides').replaceChildren();
        guides.filter(g => !query || (g.title + g.words).replace(/\s/g, '').toLowerCase().includes(query)).forEach(g => {
            const col = document.createElement('div'); col.className = 'col-md-6';
            col.innerHTML = `<div class="money-panel h-100"><h6 class="fw-bold">${esc(g.title)}</h6><p>${esc(g.text)}</p></div>`;
            col.firstChild.append(button(g.key === 'receive' || g.key === 'cancel' ? '입력하기' : '등록 내역 보기', () => {
                if (g.key === 'receive') openReceive(); else if (g.key === 'cancel') openCancel(); else $('moneyCases').scrollIntoView({ block: 'start', behavior: 'smooth' });
            })); $('moneyGuides').append(col);
        });
        if (query) {
            const matches = (moneyAccounts || mData || []).filter(a => [a.Item, a.Standard, a.Note, accountBusinessKeywords(a)].join(' ').replace(/\s/g, '').toLowerCase().includes(query)).slice(0, 12);
            matches.forEach(a => {
                const col = document.createElement('div'); col.className = 'col-md-6';
                col.innerHTML = `<div class="money-panel h-100"><h6>${esc(a.Item)} <small class="text-muted">${esc(a.Type)}</small></h6><p>${esc(a.Note || '전표입력에서 이 계정과목으로 입력할 수 있습니다.')}</p></div>`;
                col.firstChild.append(button('이 계정으로 입력', () => {
                    if (!canPerform('accounting.edit')) return showAlert('안내', '회계 입력 권한이 필요합니다.');
                    if (a.Item === '가수금') return openReceive();
                    if (['부채','자본'].includes(a.Type) && !$('advModeToggle').checked) { $('advModeToggle').checked = true; toggleAdvancedMode(); }
                    const radio = Array.from(document.querySelectorAll('input[name="inputType"]')).find(r => r.value === a.Type);
                    if (!radio) return;
                    radio.checked = true; resetAccountInput(); selectAccount(a);
                    bootstrap.Tab.getOrCreateInstance(document.querySelector('[data-bs-target="#tabForm"]')).show();
                })); $('moneyGuides').append(col);
            });
        }
        if (!$('moneyGuides').children.length) $('moneyGuides').textContent = '관련 업무나 계정과목을 찾지 못했습니다. 다른 표현으로 검색해 주세요.';
    }
    function editor(title, html) {
        if (!canPerform('accounting.edit')) return showAlert('안내', '회계 입력 권한이 필요합니다.');
        const area = $('moneyEditor'); area.hidden = false;
        area.innerHTML = `<div class="d-flex justify-content-between mb-3"><h5>${esc(title)}</h5><button type="button" class="btn btn-outline-secondary" id="moneyClose">닫기</button></div>${html}`;
        $('moneyClose').onclick = () => { if (!saving) area.hidden = true; };
        area.scrollIntoView({ block: 'start', behavior: 'smooth' }); return true;
    }
    const commonFields = () => `<div class="row g-3"><div class="col-md-6"><label for="moneyDate" class="form-label">실제 처리일</label><input id="moneyDate" type="date" class="form-control" value="${formatAccountingKstDate()}" max="${formatAccountingKstDate()}" required></div><div class="col-md-6"><label for="moneyAmount" class="form-label">금액</label><input id="moneyAmount" type="number" class="form-control" min="1" step="1" required></div></div>`;
    function openReceive() {
        if (!editor('착오입금 등록', `<form id="moneyForm">${commonFields()}<label for="moneyDescription" class="form-label mt-3">입금자명과 확인 내용</label><input id="moneyDescription" class="form-control" maxlength="300" placeholder="예: 홍길동 착오입금" required><p class="text-muted mt-3">통장에 실제 들어온 돈만 등록합니다. 보통예금 증가와 가수금 증가가 함께 기록됩니다. 아직 입금 이유를 모르는 돈도 이곳에 기록하고, 매출로 잡지 않습니다.</p><button class="btn btn-primary" id="moneySave">확인 후 장부에 등록</button></form>`)) return;
        $('moneyForm').onsubmit = event => { event.preventDefault(); confirmSave('receive', { date: $('moneyDate').value, amount: Number($('moneyAmount').value), description: $('moneyDescription').value.trim(), project: $('projectSelect').value || '본사' }, '실제 통장 입금 내역을 확인하셨나요? 이 금액을 가수금으로 기록합니다.'); };
    }
    async function openCancel() {
        selected = null;
        if (!editor('카드 결제 취소', `<p>원거래를 선택한 다음 실제 취소 상태를 입력하세요. 이미 장부에 기록한 지출에서 찾습니다.</p><div class="row g-2 mb-3"><div class="col-md-4"><label for="moneyFrom" class="form-label">원거래 조회 시작일</label><input id="moneyFrom" type="date" class="form-control" value="${new Date(Date.now()-730*86400000).toISOString().slice(0,10)}"></div><div class="col-md-8"><label for="moneySourceSearch" class="form-label">원거래 검색</label><div class="input-group"><input id="moneySourceSearch" type="search" class="form-control" placeholder="지출 내용·계정과목·카드 이름"><button type="button" class="btn btn-outline-secondary" id="moneySourceFind">찾기</button></div></div></div><div id="moneySources" class="mb-3" role="status"></div><div id="moneyCancelFields" hidden></div>`)) return;
        $('moneySourceFind').onclick = () => loadSources();
        $('moneySourceSearch').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); loadSources(); } };
        await loadSources();
    }
    async function loadSources(append = false) {
        const seq = ++sourceSeq; $('moneySources').textContent = '원거래를 찾고 있습니다…';
        try {
            const data = await api('sources', { search: $('moneySourceSearch').value, from_date: $('moneyFrom').value, offset: append ? sourceOffset : 0 });
            if (seq !== sourceSeq || !$('moneySources')) return;
            sources = append ? [...sources,...(data.items || [])] : data.items || []; $('moneySources').replaceChildren();
            sources.forEach(source => $('moneySources').append(button(`${source.date} · ${source.description} · 취소 가능 ${won(source.remaining)}`, () => chooseSource(source), 'btn btn-outline-secondary w-100 text-start mb-2 money-source')));
            sourceOffset = data.next_offset;
            if (sourceOffset != null) $('moneySources').append(button('이전 원거래 더 찾기', () => loadSources(true)));
            if (!sources.length) $('moneySources').textContent = '취소 가능한 지출을 찾지 못했습니다. 검색어와 조회 시작일을 확인해 주세요.';
        } catch (error) { if (seq === sourceSeq && $('moneySources')) $('moneySources').textContent = errorText(error); }
    }
    function chooseSource(source) {
        selected = source; const area = $('moneyCancelFields'); area.hidden = false;
        area.innerHTML = `<form id="moneyForm"><div class="alert alert-info"><strong>${esc(source.description)}</strong><div>원거래 ${won(source.amount)} · 남은 취소 가능액 ${won(source.remaining)}</div><div>${source.parts.map(p => `${esc(p.account)} ${won(p.amount)}`).join(' / ')}</div></div>${commonFields()}<label for="moneyAdjustment" class="form-label mt-3">관련 감액 결재</label><select id="moneyAdjustment" class="form-select"><option value="">연결하지 않음</option>${(source.adjustments || []).map(a => `<option value="${esc(a.id)}">${esc(a.title)} · ${won(a.amount)}</option>`).join('')}</select><div class="row g-3 mt-1"><div class="col-md-5"><label for="moneyCard" class="form-label">사용한 카드</label><select id="moneyCard" class="form-select" required><option value="">카드 선택</option>${(moneyCards || cardData || []).map(c => `<option value="${esc(c.card_alias)}">${esc(c.card_alias)} (${c.card_type === 'check_card' ? '체크' : '신용'})</option>`).join('')}</select></div><div class="col-md-7"><label for="moneyPath" class="form-label">납부·환급 상태</label><select id="moneyPath" class="form-select" required></select></div></div><div id="moneyPathHint" class="text-muted my-3"></div><div class="form-check mb-3" id="moneyPaidCheck" hidden><input id="moneyPaymentConfirmed" type="checkbox" class="form-check-input"><label class="form-check-label" for="moneyPaymentConfirmed">이 원거래의 카드대금을 실제 납부한 것을 확인했습니다.</label></div><label for="moneyDescription" class="form-label">취소 내용</label><input id="moneyDescription" class="form-control" maxlength="300" required value="${esc(source.description)}"><p class="text-muted mt-3">부가세 추천값은 참고용입니다. 취소 증빙의 실제 공제 매입세액을 확인해 주세요.</p><button class="btn btn-primary" id="moneySave">확인 후 취소 기록</button></form>`;
        $('moneyAmount').max = source.remaining; $('moneyAmount').value = source.remaining;
        const vatWrap = document.createElement('div'); vatWrap.className = 'mt-3';
        vatWrap.innerHTML = '<label for="moneyVat" class="form-label">취소 증빙의 공제 매입세액</label><input id="moneyVat" type="number" class="form-control" min="0" step="1" required><div class="form-text">원거래에서 공제한 세액만 되돌립니다. 부분 취소는 비례 계산한 추천값을 증빙에 맞게 수정할 수 있습니다.</div>';
        $('moneyAmount').closest('.row').after(vatWrap);
        const vatLeft = source.remaining_vat ?? source.parts.filter(p => p.account === '부가세대급금').reduce((sum,p) => sum+p.amount,0);
        const suggestVat = () => { $('moneyVat').max = Math.min(vatLeft, Number($('moneyAmount').value)); $('moneyVat').value = Math.floor(vatLeft*Number($('moneyAmount').value)/source.remaining); };
        $('moneyAmount').addEventListener('input', suggestVat); suggestVat();
        const referenceWrap = document.createElement('div'); referenceWrap.className = 'mt-3';
        referenceWrap.innerHTML = '<label for="moneyReference" class="form-label">카드사 취소 확인번호 또는 구분 메모 (선택)</label><input id="moneyReference" class="form-control" maxlength="100" placeholder="같은 날 같은 금액을 두 번 취소한 경우 구분할 내용">';
        $('moneyDescription').after(referenceWrap);
        $('moneyAdjustment').addEventListener('change', () => { const a = (source.adjustments || []).find(x => String(x.id) === $('moneyAdjustment').value); if (a) { $('moneyAmount').value = a.amount; suggestVat(); } });
        $('moneyAdjustment').onchange = () => { const a = (source.adjustments || []).find(x => String(x.id) === $('moneyAdjustment').value); $('moneyAmount').readOnly = !!a; if (a) $('moneyAmount').value = a.amount; };
        $('moneyCard').onchange = updatePaths; $('moneyPath').onchange = updatePathHint;
        const matching = (moneyCards || cardData || []).find(c => source.description?.includes(`[${c.card_alias}]`));
        if (matching) $('moneyCard').value = matching.card_alias;
        updatePaths();
        $('moneyForm').onsubmit = event => {
            event.preventDefault();
            confirmSave('cancel', { original_trans_id: selected.trans_id, date: $('moneyDate').value, amount: Number($('moneyAmount').value), vat_amount: Number($('moneyVat').value), description: $('moneyDescription').value.trim(), card_alias: $('moneyCard').value, card_path: $('moneyPath').value, payment_confirmed: $('moneyPaymentConfirmed').checked, approval_id: $('moneyAdjustment').value || null, reference: $('moneyReference').value.trim() }, '원거래와 취소 증빙을 확인하셨나요? 선택한 납부·환급 상태로 장부에 기록합니다.');
        };
        area.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function updatePaths() {
        const card = (moneyCards || cardData || []).find(c => c.card_alias === $('moneyCard').value);
        const options = card?.card_type === 'check_card' ? [['check_pending','취소됨 · 통장 환급은 별도 확인'],['check_received','같은 날 취소·통장 환급 완료']] : card ? [['credit_unpaid','카드대금 납부 전 취소'],['credit_paid_pending','납부 후 취소 · 환급 또는 차감 별도 확인'],['credit_paid_received','납부 후 같은 날 취소·통장 환급 완료']] : [];
        $('moneyPath').replaceChildren(new Option('상태 선택', ''), ...options.map(([v,t]) => new Option(t,v))); updatePathHint();
    }
    function updatePathHint() {
        const path = $('moneyPath').value;
        $('moneyPaidCheck').hidden = !path.startsWith('credit_paid_');
        $('moneyPaymentConfirmed').checked = false;
        $('moneyPathHint').textContent = path === 'credit_unpaid' ? '미지급금을 줄입니다. 통장 잔액은 바뀌지 않습니다.' : path.endsWith('received') ? '취소와 환급이 같은 날이면 함께 기록합니다. 날짜가 다르면 별도 확인 방식을 선택해 취소일을 먼저 기록하고, 환급 확인에서 실제 입금일을 입력하세요.' : path.endsWith('pending') ? '처리일은 카드 취소일입니다. 받을 돈을 미수금으로 기록하고, 통장 입금 또는 다음 대금 차감은 환급 확인에서 실제 처리일로 기록합니다.' : '카드사 내역과 통장 거래를 보고 실제 상태를 선택해 주세요.';
    }
    function openSettlement(item) {
        const mistaken = item.kind === 'mistaken_deposit';
        if (!editor(mistaken ? '착오입금 반환 확인' : '카드 환급 확인', `<form id="moneyForm"><p>${esc(item.description)}</p><p>남은 금액: <strong>${won(item.amount-item.settled_amount)}</strong></p>${commonFields()}<label for="moneyMethod" class="form-label mt-3">처리 방법</label><select class="form-select mb-3" id="moneyMethod"><option value="bank">${mistaken ? '통장에서 반환 이체 완료' : '통장으로 환급받음'}</option>${!mistaken && item.card_path.startsWith('credit_paid_') ? '<option value="offset">다음 카드대금에서 차감 확인</option>' : ''}</select><p class="text-muted">실제 ${mistaken ? '이체' : '입금 또는 대금 차감'}를 확인한 뒤 저장하세요. 이 버튼이 은행 이체를 실행하지는 않습니다.</p><button class="btn btn-primary" id="moneySave">확인한 금액 기록</button></form>`)) return;
        $('moneyAmount').value = item.amount-item.settled_amount; $('moneyAmount').max = $('moneyAmount').value;
        $('moneyForm').onsubmit = event => { event.preventDefault(); confirmSave('settle', { case_id: item.id, date: $('moneyDate').value, amount: Number($('moneyAmount').value), method: $('moneyMethod').value }, '실제 통장 거래 또는 카드사 차감 내역을 확인하셨나요? 장부와 남은 금액을 함께 갱신합니다.'); };
    }
    function confirmSave(action, payload, text) {
        if (saving) return;
        if (!canPerform('accounting.edit')) return showAlert('안내', '회계 입력 권한이 필요합니다.');
        if (action !== 'void' && (!Number.isSafeInteger(payload.amount) || payload.amount <= 0)) return showAlert('확인', '금액은 1원 이상의 정수로 입력하세요.');
        showConfirm('장부 반영 확인', `${text}\n${payload.date} · ${action === 'void' ? '등록 내용 역분개' : won(payload.amount)}`, () => save(action, payload));
    }
    async function save(action, payload) {
        if (saving) return; saving = true;
        const form = $('moneyForm'); if (form) Array.from(form.elements).forEach(e => e.disabled = true);
        try {
            const request = await api('prepare', { action, payload });
            const result = await api('commit', { request_id: request.request_id });
            if ($('moneyEditor')) $('moneyEditor').hidden = true;
            await Promise.all([loadCases(), refreshDashboard(), loadHistory()]);
            showAlert('완료', result.replayed ? '이미 반영한 내역입니다. 장부에 중복으로 기록하지 않았습니다.' : '장부와 처리 내역에 반영했습니다.');
        } catch (error) { showAlert('처리 확인', errorText(error)); }
        finally { saving = false; if (form?.isConnected) Array.from(form.elements).forEach(e => e.disabled = false); }
    }
    async function loadCases(append = false) {
        const seq = ++listSeq;
        $('moneyStatus').textContent = '내역을 불러옵니다…';
        try {
            const data = await api('list', { search: $('moneyCaseSearch').value, offset: append ? cases.length : 0 });
            if (seq !== listSeq) return;
            moneyCards = data.cards || moneyCards; moneyAccounts = data.accounts || moneyAccounts;
            renderGuides();
            cases = append ? [...cases,...(data.items || [])] : data.items || [];
            $('moneyCases').replaceChildren();
            cases.forEach(item => {
                const row = document.createElement('div'); row.className = 'money-panel mb-2';
                const remaining = item.amount-item.settled_amount;
                const state = item.is_void ? '등록 취소' : remaining ? `미처리 ${won(remaining)}` : '처리 완료';
                row.innerHTML = `<div class="d-flex flex-wrap justify-content-between gap-2"><strong>${esc(item.description)}</strong><span>${esc(state)}</span></div><div class="text-muted my-2">${item.entry_date} · ${won(item.amount)} · ${esc(item.project)}</div>`;
                if (!item.is_void && canPerform('accounting.edit')) {
                    if (remaining > 0) row.append(button(item.kind === 'mistaken_deposit' ? '반환 확인' : '환급 확인', () => openSettlement(item)));
                    row.append(button('잘못 등록한 내용 취소', () => confirmSave('void', { case_id: item.id, date: formatAccountingKstDate() }, '이 등록이 잘못된 경우에만 사용합니다. 은행이나 카드사의 취소가 아니라, 장부 등록을 반대로 기록하는 작업입니다. 별도 반환·환급을 기록한 건은 취소할 수 없습니다.'), 'btn btn-outline-secondary ms-2'));
                }
                $('moneyCases').append(row);
            });
            $('moneyStatus').textContent = cases.length ? `${cases.length}건 표시` : '이 화면에서 등록한 내역이 아직 없습니다. 기존 전표는 최근전표에서 확인할 수 있습니다.';
            $('moneyMore').hidden = (data.items || []).length < 30;
        } catch (error) { if (seq === listSeq) $('moneyStatus').textContent = errorText(error); }
    }
    async function open(query = '') {
        mount(); $('moneyGuideSearch').value = query; renderGuides(); await loadCases();
    }
    return { open, errorText };
})();
