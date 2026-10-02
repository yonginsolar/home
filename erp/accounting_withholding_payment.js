(function () {
    'use strict';
    let active = null;
    const validDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    function validate(payment, today) {
        if (payment?.confirmed !== true) return '납부 확인을 선택하지 않아 이번 연동에서 제외했습니다.';
        if (!validDate(payment.date)) return '실제 납부일을 입력해 주세요.';
        if (!validDate(today) || payment.date > today) return '실제 납부일은 오늘 이후로 입력할 수 없습니다.';
        return '';
    }
    function signature(doc, tax) {
        return JSON.stringify([String(doc.coop_id || ''), String(doc.id), doc.status,
            Number(doc.amount), tax.paymentMonth, tax.salaryMonth, tax.filingMonth,
            tax.nationalAmount, tax.localAmount]);
    }
    async function periodError(client, coopId, date) {
        if (!coopId || !validDate(date)) return '조합과 실제 납부일을 확인할 수 없습니다.';
        // The internal period assertion is not a browser RPC. Read only the
        // current user's authorized journal instead of exposing that helper.
        const { data, error } = await client.from('ac_journal')
            .select('Trans_ID').eq('coop_id', coopId).like('Trans_ID', 'CLOSE-%')
            .order('Trans_ID', { ascending: false }).limit(1);
        if (error) return '결산 마감 여부를 확인하지 못했습니다. 다시 시도해 주세요.';
        if (!data?.length) return '';
        const match = /^CLOSE-(\d{4})$/.exec(String(data[0].Trans_ID || ''));
        if (!match) return '결산 마감 기록을 확인해 주세요.';
        return date <= `${match[1]}-12-31`
            ? `${match[1]}년까지 결산이 마감되어 이 날짜로 원천세를 연동할 수 없습니다. 열린 회계기간의 처리 방법을 확인해 주세요.`
            : '';
    }
    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    }
    function collect(candidates, today) {
        if (!candidates.length) return Promise.resolve(new Map());
        if (active) return active;
        active = new Promise(resolve => {
            const root = element('div', 'modal fade');
            root.id = 'withholdingPaymentModal';
            root.tabIndex = -1;
            root.setAttribute('aria-labelledby', 'withholdingPaymentTitle');
            root.setAttribute('data-bs-theme', 'light');
            const dialog = element('div', 'modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg');
            const content = element('div', 'modal-content');
            const header = element('div', 'modal-header');
            const title = element('h5', 'modal-title fw-bold', '원천세 납부 확인');
            title.id = 'withholdingPaymentTitle';
            header.append(title);
            const form = element('form');
            const body = element('div', 'modal-body');
            body.style.wordBreak = 'keep-all';
            body.append(element('p', 'text-muted', '납부한 원천세만 선택하고 실제 납부일을 입력해 주세요. 아직 납부하지 않은 건은 선택하지 않고 다음에 연동할 수 있습니다.'));
            const controls = candidates.map(({ doc, tax }, index) => {
                const section = element('section', 'border rounded p-3 mb-3');
                section.append(element('h6', 'fw-bold', doc.title || '원천세 신고·납부'));
                section.append(element('p', 'mb-2', `국세 ${tax.nationalAmount.toLocaleString()}원 · 지방세 ${tax.localAmount.toLocaleString()}원`));
                const checkRow = element('div', 'form-check mb-3');
                const check = element('input', 'form-check-input');
                check.type = 'checkbox';
                check.id = `withholdingPaidCheck${index}`;
                const checkLabel = element('label', 'form-check-label', '위 세금의 납부를 확인했습니다.');
                checkLabel.htmlFor = check.id;
                checkRow.append(check, checkLabel);
                const dateLabel = element('label', 'form-label', '실제 납부일');
                const date = element('input', 'form-control');
                date.id = `withholdingPaidDate${index}`;
                date.type = 'date';
                date.max = today;
                date.disabled = true;
                dateLabel.htmlFor = date.id;
                check.addEventListener('change', () => {
                    date.disabled = !check.checked;
                    date.required = check.checked;
                    if (check.checked) date.focus();
                });
                section.append(checkRow, dateLabel, date);
                body.append(section);
                return { doc, tax, check, date };
            });
            const error = element('p', 'text-danger mb-0');
            error.setAttribute('role', 'alert');
            body.append(error);
            const footer = element('div', 'modal-footer');
            const cancel = element('button', 'btn btn-outline-secondary', '취소');
            cancel.type = 'button';
            const next = element('button', 'btn btn-primary', '연동 내용 확인');
            next.type = 'submit';
            footer.append(cancel, next);
            form.append(body, footer);
            content.append(header, form);
            dialog.append(content);
            root.append(dialog);
            document.body.append(root);
            const modal = new bootstrap.Modal(root, { backdrop: 'static', keyboard: true });
            let result = null, submitted = false;
            cancel.addEventListener('click', () => modal.hide());
            root.addEventListener('hidden.bs.modal', () => {
                modal.dispose();
                root.remove();
                active = null;
                resolve(result);
            }, { once: true });
            form.addEventListener('submit', event => {
                event.preventDefault();
                if (submitted) return;
                const values = new Map();
                for (const { doc, tax, check, date } of controls) {
                    if (!check.checked) continue;
                    const payment = { confirmed: true, date: date.value, signature: signature(doc, tax) };
                    const message = validate(payment, today);
                    if (message) { error.textContent = message; date.focus(); return; }
                    values.set(String(doc.id), payment);
                }
                submitted = true;
                next.disabled = true;
                result = values;
                modal.hide();
            });
            modal.show();
        });
        return active;
    }
    function review(message, callback) {
        return new Promise((resolve, reject) => {
            const root = document.getElementById('confirmModal');
            const yes = document.getElementById('btnConfirmYes');
            let accepted = false;
            const accept = () => { accepted = true; };
            const clean = () => {
                yes.removeEventListener('click', accept, true);
                root.removeEventListener('hidden.bs.modal', hidden);
            };
            const hidden = () => { if (!accepted) { clean(); resolve(); } };
            yes.addEventListener('click', accept, true);
            root.addEventListener('hidden.bs.modal', hidden);
            window.showConfirm('전자결재 연동', message, async () => {
                try { await callback(); resolve(); }
                catch (error) { reject(error); }
                finally { clean(); }
            });
        });
    }
    window.CoopWithholdingPayment = Object.freeze({ validDate, validate, signature, periodError, collect, review });
})();
