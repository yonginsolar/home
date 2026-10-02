/* v1.1.0 — confirm insurance payments as well as ordinary expenses. */
(function () {
    'use strict';
    let active = null, editing = false;
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
        !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const signature = doc => JSON.stringify([doc.coop_id, String(doc.id), doc.status,
        Number(doc.amount), doc.processed_at, doc.approval_line, doc.expense_snapshot, doc.doc_type]);
    function eligible(doc) {
        const snapshot = doc.expense_snapshot || {};
        if (window.CoopInsurancePayment.isInsurance(doc)) return snapshot.adjustment_type !== 'decrease' && !/감액/.test(String(doc.doc_type || ''));
        return !/급여|보험|원천세|출자금반환|배당금|감액/.test(String(doc.doc_type || '')) &&
            !['급여', '4대보험', '원천세', '출자금반환', '배당금'].includes(snapshot.expense_sub_type) &&
            snapshot.adjustment_type !== 'decrease' && !snapshot.payout && !snapshot.withholding_tax && !snapshot.insurance &&
            snapshot.payment_method !== 'credit_card';
    }
    function validate(payment, today) {
        if (payment?.confirmed !== true) return '지출 확인을 선택하지 않아 이번 연동에서 제외했습니다.';
        if (!validDate(payment.date)) return '실제 지출(이체)일을 입력해 주세요.';
        if (!validDate(today) || payment.date > today) return '실제 지출일은 오늘 이후로 입력할 수 없습니다.';
        return '';
    }
    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text) node.textContent = text;
        return node;
    };
    function dialog(titleText, id) {
        const root = el('div', 'modal fade'); root.id = id; root.tabIndex = -1;
        root.setAttribute('aria-labelledby', `${id}Title`); root.setAttribute('data-bs-theme', 'light');
        root.style.wordBreak = 'keep-all';
        const box = el('div', 'modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg');
        const content = el('div', 'modal-content'), header = el('div', 'modal-header');
        const title = el('h5', 'modal-title fw-bold', titleText); title.id = `${id}Title`;
        header.append(title);
        const form = el('form'), body = el('div', 'modal-body'), footer = el('div', 'modal-footer');
        const error = el('p', 'text-danger mb-0 px-3'); error.setAttribute('role', 'alert');
        const cancel = el('button', 'btn btn-outline-secondary', '취소'); cancel.type = 'button';
        const submit = el('button', 'btn btn-primary', '확인'); submit.type = 'submit';
        footer.append(cancel, submit); form.append(body, error, footer); content.append(header, form);
        box.append(content); root.append(box); document.body.append(root);
        const modal = new bootstrap.Modal(root, { backdrop: 'static', keyboard: false });
        cancel.addEventListener('click', () => modal.hide());
        return { root, form, body, error, cancel, submit, modal };
    }
    function collect(candidates, today) {
        if (!candidates.length) return Promise.resolve(new Map());
        if (active) return active;
        active = new Promise(resolve => {
            const ui = dialog('지출(이체)일 확인', 'expensePaymentDateModal');
            ui.body.append(el('p', 'text-muted', '실제로 지출한 건만 선택해 주세요. 날짜를 확인한 뒤 연동하며, 아직 지출하지 않은 건은 다음에 처리할 수 있습니다.'));
            const controls = candidates.map(({ doc, approvedDate, scheduledDate }, index) => {
                const prepaid = doc.expense_snapshot?.execution?.prepaid === true;
                const insurance = window.CoopInsurancePayment.isInsurance(doc);
                const section = el('section', 'border rounded p-3 mb-3');
                section.append(el('h6', 'fw-bold', doc.title || '지출결의'),
                    el('p', 'mb-2', `${Number(doc.amount).toLocaleString()}원${prepaid ? ' · 선지출' : ''}`));
                if (insurance) section.append(el('p', 'small text-muted', window.CoopInsurancePayment.label(doc.expense_snapshot?.insurance)));
                const row = el('div', 'form-check mb-2'), check = el('input', 'form-check-input');
                check.type = 'checkbox'; check.id = `expensePaidCheck${index}`; check.checked = prepaid;
                const checkLabel = el('label', 'form-check-label', '실제 지출을 확인했습니다.'); checkLabel.htmlFor = check.id;
                row.append(check, checkLabel);
                const date = el('input', 'form-control'); date.type = 'date'; date.id = `expensePaidDate${index}`;
                date.max = today; date.value = prepaid ? String(doc.expense_snapshot.execution.date || '') : scheduledDate || approvedDate;
                date.disabled = !check.checked || prepaid; date.required = !prepaid;
                const label = el('label', 'form-label', '실제 지출(이체)일'); label.htmlFor = date.id;
                check.addEventListener('change', () => { date.disabled = !check.checked || prepaid; });
                section.append(row, label, date);
                if (prepaid) section.append(el('p', 'small text-muted mt-2 mb-0', '선지출은 승인된 문서에 기재한 날짜를 사용합니다.'));
                ui.body.append(section); return { doc, check, date, prepaid };
            });
            let result = null, submitted = false;
            ui.submit.textContent = '연동 내용 확인';
            ui.root.addEventListener('hidden.bs.modal', () => { ui.modal.dispose(); ui.root.remove(); active = null; resolve(result); }, { once: true });
            ui.form.addEventListener('submit', event => {
                event.preventDefault(); if (submitted) return;
                const values = new Map();
                for (const control of controls) {
                    const payment = { confirmed: control.check.checked, date: control.date.value, signature: signature(control.doc) };
                    if (payment.confirmed) {
                        const message = validate(payment, today);
                        if (message) { ui.error.textContent = message; return; }
                    }
                    values.set(String(control.doc.id), payment);
                }
                submitted = true; result = values; ui.modal.hide();
            });
            ui.modal.show();
        });
        return active;
    }
    async function edit(client, transIds, onSaved) {
        if (editing) return;
        editing = true;
        let ui;
        const rpc = async (action, data) => {
            const result = await client.rpc('accounting_journal_date_admin', { p_action: action, p_data: data });
            if (result.error) throw new Error(result.error.message);
            return result.data;
        };
        try {
            const items = [];
            for (const transId of [...new Set(transIds)].slice(0, 10)) items.push(await rpc('inspect', { trans_id: transId }));
            if (!items.length) throw new Error('수정할 전표를 확인할 수 없습니다.');
            ui = dialog('전표 날짜 수정', 'journalDateEditModal');
            const select = el('select', 'form-select mb-3'); select.setAttribute('aria-label', '날짜를 수정할 전표');
            items.forEach((item, index) => { const option = el('option', '', `${item.date} · ${index === 0 ? '원전표' : '분류 변경 전표'} · ${Number(item.amount).toLocaleString()}원`); option.value = String(index); select.append(option); });
            const date = el('input', 'form-control mb-3'); date.type = 'date'; date.id = 'journalDateNew'; date.required = true;
            date.max = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
            const label = el('label', 'form-label', '변경할 날짜'); label.htmlFor = date.id;
            const note = el('p', 'text-muted'), warning = el('div', 'alert alert-warning');
            const ackRow = el('div', 'form-check mb-3'), ack = el('input', 'form-check-input'); ack.type = 'checkbox'; ack.id = 'journalDatePeriodAck';
            const ackLabel = el('label', 'form-check-label', '신고 기간 변경에 따른 영향을 확인했습니다.'); ackLabel.htmlFor = ack.id; ackRow.append(ack, ackLabel);
            const history = el('details', 'mt-3'), historyTitle = el('summary', '', '날짜 수정 이력'); history.append(historyTitle);
            ui.body.append(select, note, label, date, warning, ackRow, history);
            ui.body.append(el('p', 'small text-muted mt-3 mb-0', '선택한 전표의 차변·대변 날짜를 함께 변경합니다. 승인 문서와 금액·계정은 바뀌지 않습니다.'));
            const period = value => `${value.slice(0, 4)}-${Math.ceil(Number(value.slice(5, 7)) / 3)}`;
            function updateWarning() {
                const item = items[Number(select.value)];
                const changedPeriod = validDate(date.value) && period(item.date) !== period(date.value);
                warning.hidden = !changedPeriod; ackRow.hidden = !changedPeriod;
                warning.textContent = '부가세 분기 또는 회계연도가 달라집니다. 이미 신고한 자료가 있다면 정정 필요 여부를 확인해 주세요.';
                ack.checked = false;
            }
            function render() {
                const item = items[Number(select.value)]; date.value = item.date;
                note.textContent = item.locked_reason || `현재 날짜 ${item.date} · 분개 ${item.row_count}행`;
                date.disabled = !!item.locked_reason; ui.submit.disabled = !!item.locked_reason;
                history.replaceChildren(historyTitle);
                for (const change of item.history || []) history.append(el('p', 'small mb-2', `${change.old_date} → ${change.new_date} · ${change.actor_name} · ${new Date(change.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`));
                if (!item.history?.length) history.append(el('p', 'small text-muted', '날짜 수정 이력이 없습니다.'));
                updateWarning();
            }
            select.value = '0'; select.addEventListener('change', render); date.addEventListener('input', updateWarning); render();
            let saving = false;
            ui.form.addEventListener('submit', async event => {
                event.preventDefault(); if (saving) return;
                const item = items[Number(select.value)];
                if (item.locked_reason) return;
                if (!validDate(date.value) || date.value > date.max) { ui.error.textContent = '오늘까지의 실제 날짜를 입력해 주세요.'; return; }
                if (!ackRow.hidden && !ack.checked) { ui.error.textContent = '신고 기간 변경의 영향을 확인해 주세요.'; return; }
                saving = true; ui.submit.disabled = true; ui.cancel.disabled = true;
                try {
                    await rpc('commit', { trans_id: item.trans_id, fingerprint: item.fingerprint, date: date.value, acknowledge_period_change: ack.checked });
                    ui.modal.hide();
                    try { await onSaved(); }
                    catch (_) { window.showAlert('날짜 수정 완료', '날짜는 저장되었습니다. 화면을 새로고침해 변경 내용을 확인해 주세요.'); }
                } catch (error) { ui.error.textContent = error.message; saving = false; ui.submit.disabled = false; ui.cancel.disabled = false; }
            });
            ui.root.addEventListener('hidden.bs.modal', () => { ui.modal.dispose(); ui.root.remove(); editing = false; }, { once: true });
            ui.modal.show();
        } catch (error) { editing = false; if (ui) ui.root.remove(); window.showAlert('날짜 수정 확인', error.message); }
    }
    window.CoopPaymentDates = { version: '1.1.0', validDate, eligible, signature, validate, collect, edit };
})();
