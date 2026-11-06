/* Journal editor: separate date and amount operations, one dialog. */
((root) => {
    'use strict';
    const doc = root.document;
    const drafts = new Map();
    let active = null;
    const el = (tag, className, text) => {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const won = value => Number(value).toLocaleString('ko-KR') + '원';
    const errors = {
        '42501': '현재 권한으로 이 전표를 정정할 수 없습니다.',
        '22023': '원결재 금액 이하의 다른 금액과 정정 사유를 확인해 주세요.',
        'PT409': '전표나 요청이 바뀌었습니다. 최신 전표를 확인한 뒤 다시 검토해 주세요.',
        '55000': '연결 업무 또는 마감 상태가 달라 정정할 수 없습니다. 다시 불러와 주세요.',
        'PGRST202': '전표 오기 정정 기능을 아직 사용할 수 없습니다.'
    };
    function createDatePanel({ client, ids, draft, alive, updateModes, close, onSaved, onSettled }) {
        const node = el('section'); node.setAttribute('aria-label', '날짜 수정');
        const form = el('form');
        const body = el('div', 'p-3');
        const status = el('p', 'small'); status.setAttribute('role', 'status');
        const fieldset = el('fieldset');
        const select = el('select', 'form-select mb-2');
        select.id = 'accountingEditDateSource';
        const selectLabel = el('label', 'form-label', '날짜를 수정할 전표'); selectLabel.htmlFor = select.id;
        const input = el('input', 'form-control mb-2'); input.type = 'date'; input.id = 'accountingEditDate';
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
        input.max = today;
        const label = el('label', 'form-label', '변경할 날짜'); label.htmlFor = input.id;
        const ackBox = el('div', 'form-check mb-2');
        const ack = el('input', 'form-check-input'); ack.type = 'checkbox'; ack.id = 'accountingEditDateAck';
        const ackLabel = el('label', 'form-check-label', '신고 기간이 달라지는 것을 확인했어요.'); ackLabel.htmlFor = ack.id;
        ackBox.append(ack, ackLabel);
        const periodWarning = el('p', 'small text-warning-emphasis mb-2',
            '부가세 분기 또는 회계연도가 달라집니다. 이미 신고한 자료가 있다면 정정이 필요한지 확인해 주세요.');
        const history = el('details', 'mt-3');
        fieldset.append(selectLabel, select, label, input, periodWarning, ackBox);
        body.append(el('p', 'small', '선택한 전표의 차변·대변 날짜를 함께 바꿉니다. 금액은 바뀌지 않아요.'),
            status, fieldset, history);
        const footer = el('div', 'p-3 border-top d-flex flex-wrap justify-content-end gap-2');
        const dismiss = el('button', 'btn btn-outline-secondary', '닫기'); dismiss.type = 'button';
        const submit = el('button', 'btn btn-primary', '날짜 저장'); submit.type = 'submit';
        footer.append(dismiss, submit);
        form.append(body, footer); node.append(form);

        let items = [], phase = 'loading', controller = null, generation = 0;
        const note = text => { if (alive()) status.textContent = text; };
        const chosen = () => items.find(item => item.trans_id === select.value);
        const dateOK = value => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
            const parsed = new Date(value + 'T00:00:00Z');
            return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
        };
        const period = date => date.slice(0,4) + '-' + Math.ceil(Number(date.slice(5,7))/3);
        const crosses = item => !!item && dateOK(item.date) && dateOK(input.value) && period(item.date) !== period(input.value);
        const definitive = new Set(['42501','22023','40001','PT409','55000','PGRST202']);
        function failure(error) {
            if (error.code === '42501') return '현재 권한으로 이 전표를 수정할 수 없습니다.';
            if (error.code === '40001' || error.code === 'PT409') return '다른 변경이 있어 저장하지 않았어요. 최신 전표를 다시 확인해 주세요.';
            if (error.code === '55000' || error.code === '22023') return error.message || '전표 날짜와 마감 상태를 확인해 주세요.';
            return '전표를 확인하지 못했어요. 다시 불러와 주세요.';
        }
        function render() {
            const item = chosen(), editing = phase === 'ready' && !draft.pending && !draft.writing;
            fieldset.hidden = !items.length;
            fieldset.disabled = !editing;
            input.disabled = !item || !!item.locked_reason;
            ackBox.hidden = periodWarning.hidden = !crosses(item);
            history.hidden = !item;
            submit.textContent = draft.writing ? '날짜 저장 중…' : draft.pending
                ? (phase === 'retry' ? '같은 날짜 저장 다시 시도' : '날짜 저장 결과 확인')
                : phase === 'failed' ? '다시 불러오기' : '날짜 저장';
            submit.disabled = draft.writing || ['loading','checking','saved'].includes(phase) ||
                (!draft.pending && phase !== 'failed' && (!editing || !item || !!item.locked_reason ||
                    !dateOK(input.value) || input.value > today || input.value === item.date || (crosses(item) && !ack.checked)));
            updateModes();
        }
        async function rpc(action, data, signal) {
            let q = client.rpc('accounting_journal_date_admin', { p_action: action, p_data: data });
            if (signal && q.abortSignal) q = q.abortSignal(signal);
            const res = await q;
            if (res.error) throw res.error;
            return res.data;
        }
        function cancelRead() { generation++; controller?.abort(); controller = null; }
        async function read(selected) {
            cancelRead();
            const run = generation, ctl = new AbortController(); controller = ctl;
            let timer;
            try {
                const data = await Promise.race([
                    Promise.all(selected.map(id => rpc('inspect', { trans_id: id }, ctl.signal))),
                    new Promise((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(Error('TIMEOUT')); }, 15000); })
                ]);
                if (!alive() || run !== generation) return null;
                if (data.some((item,i) => item?.trans_id !== selected[i] || !dateOK(item.date))) throw Error('UNCONFIRMED');
                return data;
            } catch (error) {
                if (!alive() || run !== generation) return null;
                ctl.abort(); throw error;
            } finally {
                clearTimeout(timer);
                if (controller === ctl) controller = null;
            }
        }
        function fillSelection() {
            const item = chosen();
            if (!item) { render(); return; }
            draft.selection = item.trans_id;
            input.value = draft.values.has(item.trans_id) ? draft.values.get(item.trans_id) : item.date;
            ack.checked = false;
            history.replaceChildren(el('summary', '', '날짜 수정 이력'));
            for (const change of item.history || []) {
                const when = new Date(change.changed_at).toLocaleString('ko-KR', { timeZone:'Asia/Seoul' });
                history.append(el('p', 'small mb-1 text-break', `${change.old_date} → ${change.new_date} · ${change.actor_name} · ${when}`));
            }
            if (!item.history?.length) history.append(el('p', 'small mb-1', '아직 수정 이력이 없습니다.'));
            note(item.locked_reason || `현재 날짜 ${item.date} · 분개 ${item.row_count}행`);
            render();
        }
        async function inspect() {
            phase = 'loading'; note('전표 날짜를 확인하고 있어요.'); render();
            try {
                const data = await read(ids);
                if (!data) return;
                items = data;
                select.replaceChildren();
                items.forEach((item, i) => {
                    const option = el('option', '', `${i ? '재분류 전표' : '원전표'} · ${item.date} · ${won(item.amount)}`);
                    option.value = item.trans_id; select.append(option);
                });
                select.value = items.some(item => item.trans_id === draft.selection) ? draft.selection : items[0].trans_id;
                phase = 'ready'; fillSelection();
            } catch (error) { phase = 'failed'; note(failure(error)); render(); }
        }
        function finish(request, message) {
            draft.pending = null; draft.values.delete(request.trans_id); onSaved();
            if (alive()) { phase = 'saved'; note(message); render(); }
        }
        async function save(request) {
            if (!alive() || draft.writing) return;
            draft.pending = request; draft.writing = true;
            note('날짜를 저장하고 있어요.'); render();
            let timer;
            try {
                const result = await Promise.race([rpc('commit', request),
                    new Promise((_, reject) => { timer = setTimeout(() => reject(Error('TIMEOUT')), 20000); })]);
                if (!result?.ok || (!result.replayed && result.date !== request.date)) throw Error('UNCONFIRMED');
                finish(request, `전표 날짜를 ${request.date}(으)로 수정했어요.`);
            } catch (error) {
                if (definitive.has(error.code)) {
                    draft.pending = null;
                    if (alive()) { phase = 'failed'; note(failure(error)); }
                } else if (alive()) {
                    phase = 'unknown'; note('저장 여부를 아직 확인하지 못했어요. 현재 전표 날짜를 다시 확인해 주세요.');
                }
            } finally {
                clearTimeout(timer); draft.writing = false;
                if (alive()) render();
                onSettled();
            }
        }
        async function checkResult() {
            const request = draft.pending;
            phase = 'checking'; note('현재 전표 날짜만 다시 확인하고 있어요.'); render();
            try {
                const data = await read([request.trans_id]);
                if (!data || draft.pending !== request) return;
                if (data[0].date === request.date) finish(request, `현재 전표 날짜가 ${request.date}인 것을 확인했어요.`);
                else if (data[0].fingerprint !== request.fingerprint || data[0].locked_reason) {
                    draft.pending = null; phase = 'failed'; note('전표나 마감 상태가 바뀌었어요. 최신 전표를 다시 확인해 주세요.');
                } else {
                    phase = 'retry'; note('아직 이전 날짜로 표시돼요. 다시 시도하면 처음 요청한 같은 내용만 보냅니다.');
                }
            } catch (error) { phase = 'unknown'; note(failure(error)); }
            if (alive()) render();
        }
        dismiss.addEventListener('click', close);
        select.addEventListener('change', fillSelection);
        input.addEventListener('input', () => { if (chosen()) draft.values.set(select.value,input.value); ack.checked = false; render(); });
        ack.addEventListener('change', render);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!alive() || submit.disabled) return;
            if (draft.pending) return void (phase === 'retry' ? save(draft.pending) : checkResult());
            if (phase === 'failed') return void inspect();
            const item = chosen();
            if (!item || item.locked_reason || !dateOK(input.value) || input.value === item.date || input.value > today ||
                (crosses(item) && !ack.checked)) return;
            void save(Object.freeze({ trans_id: item.trans_id, fingerprint: item.fingerprint, date: input.value,
                acknowledge_period_change: ack.checked }));
        });
        return { node, cancelRead, reconcile() {
            if (!alive()) return;
            if (!draft.pending) { phase = 'failed'; note('앞선 요청이 끝났어요. 최신 전표를 다시 불러와 주세요.'); }
            render();
        }, open() {
            if (!draft.pending) return void inspect();
            phase = 'unknown'; note('앞서 보낸 날짜 수정의 결과를 먼저 확인해 주세요.'); render();
        } };
    }
    async function open({ client, transId, transIds, owner, current, opener, refresh }) {
        const ids = Array.isArray(transIds) ? [...new Set(transIds.filter(id => typeof id === 'string' && id))].slice(0,10) : [];
        const canCorrectAmount = /^APR-[1-9]\d{0,15}$/.test(transId);
        if (active || !owner || (!canCorrectAmount && !ids.length) || !current()) return;
        const key = JSON.stringify([owner, transId]);
        const draft = drafts.get(key) || { amount: '', reason: '', request: null, writing: false,
            date: { values: new Map(), pending: null, writing: false }, changed: false };
        drafts.set(key, draft);
        const dialog = el('dialog', 'accounting-typo-dialog border rounded shadow p-0 bg-body text-body');
        const form = el('form', 'd-flex flex-column');
        const header = el('div', 'p-3 border-bottom');
        const title = el('h2', 'h5 mb-0', '전표 수정');
        title.id = 'accountingTypoTitle';
        dialog.setAttribute('aria-labelledby', title.id);
        dialog.setAttribute('aria-modal', 'true');
        header.append(title);
        const body = el('div', 'p-3');
        const explain = el('p', 'small', '증빙과 다른 장부 금액만 바로잡습니다. 원결재·증빙·계정·날짜는 유지되며, 새 지출이나 환급으로 처리하지 않습니다.');
        const summary = el('p', 'fw-semibold');
        const status = el('p', 'small mb-0');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const history = el('details', 'mt-3');
        const inputs = el('fieldset', 'mt-3');
        const amount = el('input', 'form-control mb-2');
        amount.id = 'accountingTypoAmount'; amount.inputMode = 'numeric'; amount.maxLength = 19;
        const amountLabel = el('label', 'form-label', '증빙의 실제 결제 금액 (원)');
        amountLabel.htmlFor = amount.id;
        const reason = el('textarea', 'form-control mb-2');
        reason.id = 'accountingTypoReason'; reason.rows = 3; reason.maxLength = 500;
        const reasonLabel = el('label', 'form-label', '정정 사유');
        reasonLabel.htmlFor = reason.id;
        const diff = el('p', 'small mb-2');
        const check = el('input', 'form-check-input'); check.id = 'accountingTypoAck'; check.type = 'checkbox';
        const checkLabel = el('label', 'form-check-label', '증빙과 대조했고, 별도의 지급·환급이 없는 오기임을 확인했어요.');
        checkLabel.htmlFor = check.id;
        const checkRow = el('div', 'form-check');
        checkRow.append(check, checkLabel);
        inputs.append(amountLabel, amount, reasonLabel, reason, diff, checkRow);
        body.append(explain, summary, status, inputs, history);
        const footer = el('div', 'p-3 border-top d-flex flex-wrap justify-content-end gap-2');
        const close = el('button', 'btn btn-outline-secondary', '닫기'); close.type = 'button';
        const action = el('button', 'btn btn-primary', '금액 정정 저장'); action.type = 'submit';
        footer.append(close, action);
        form.append(body, footer);
        const amountPanel = el('section');
        amountPanel.setAttribute('aria-label', '금액 정정');
        amountPanel.append(form);
        const modes = el('div', 'd-flex flex-wrap gap-2 px-3 pb-3 border-bottom');
        modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '수정할 항목');
        const dateMode = el('button', 'btn btn-outline-primary', '날짜 수정');
        const amountMode = el('button', 'btn btn-outline-primary', '금액 정정');
        dateMode.type = amountMode.type = 'button'; modes.append(dateMode, amountMode);
        dialog.append(header);
        if (ids.length) dialog.append(modes);
        dialog.append(amountPanel); doc.body.append(dialog);

        let info = null, phase = 'loading', controller = null, ticket = 0, mode = null, datePanel;
        const view = { key, reconcile() {
            if (!live()) return;
            if (mode === 'amount') {
                if (!draft.request) { phase = 'failed'; note('앞선 요청이 끝났어요. 최신 전표를 다시 불러와 주세요.'); }
                render();
            } else datePanel?.reconcile();
        } }; active = view;
        const live = () => active === view && dialog.open && current();
        const alive = () => live() && mode === 'amount';
        function updateModes() {
            const amountBusy = draft.writing || !!draft.request;
            const dateBusy = draft.date.writing || !!draft.date.pending;
            for (const [button, name, blocked] of [[dateMode,'date',amountBusy],[amountMode,'amount',dateBusy]]) {
                button.setAttribute('aria-pressed', String(mode === name));
                button.classList.toggle('active', mode === name);
                button.disabled = mode !== name && blocked;
            }
        }
        function changeMode(next) {
            if (!live() || next === mode || (next === 'date' ? dateMode.disabled : amountMode.disabled)) return;
            if (mode === 'amount') { ticket++; controller?.abort(); }
            else datePanel?.cancelRead();
            mode = next;
            amountPanel.hidden = mode !== 'amount';
            if (datePanel) datePanel.node.hidden = mode !== 'date';
            updateModes();
            if (mode === 'date') return datePanel.open();
            if (!canCorrectAmount) {
                phase = 'saved';
                note('금액 정정은 완료된 일반 지출의 단순 출금 전표에서만 할 수 있어요.');
                render();
            } else if (draft.request) {
                phase = 'unknown'; note('앞서 보낸 정정 요청이 있어요. 먼저 결과를 확인해 주세요.'); render();
            } else void inspect();
        }
        const parsedAmount = () => /^([1-9]\d*|[1-9]\d{0,2}(,\d{3})+)$/.test(amount.value.trim())
            ? Number(amount.value.replaceAll(',', '')) : NaN;
        function render() {
            const unknown = !!draft.request;
            const ready = phase === 'ready' && info && !info.locked_reason;
            const next = parsedAmount();
            inputs.hidden = !info;
            inputs.disabled = !ready || unknown || draft.writing;
            diff.textContent = Number.isSafeInteger(next) && info ? `장부 ${won(info.before_amount)} → ${won(next)}` : '';
            action.textContent = draft.writing ? '정정 중…' : unknown
                ? (phase === 'retry' ? '같은 요청으로 저장' : '정정 결과 확인') :
                phase === 'failed' ? '다시 불러오기' : '금액 정정 저장';
            action.disabled = draft.writing || phase === 'loading' || phase === 'checking' || phase === 'saved' ||
                (!unknown && phase !== 'failed' && (!ready || !check.checked || !reason.value.trim()
                    || !Number.isSafeInteger(next) || next === Number(info.before_amount) || next > Number(info.approved_amount)));
            updateModes();
        }
        async function rpc(mode, data, read = false) {
            let timer, q;
            const abort = read ? new AbortController() : null;
            if (abort) controller = abort;
            try {
                q = client.rpc('accounting_journal_typo_admin', { p_action: mode, p_data: data });
                if (abort && q.abortSignal) q = q.abortSignal(abort.signal);
                const res = await Promise.race([q, new Promise((_, reject) => {
                    timer = setTimeout(() => { abort?.abort(); reject(new Error('TIMEOUT')); }, read ? 15000 : 20000);
                })]);
                if (res.error) throw res.error;
                return res.data;
            } finally { clearTimeout(timer); if (controller === abort) controller = null; }
        }
        function note(text) { if (alive()) status.textContent = text; }
        function showHistory() {
            history.replaceChildren(el('summary', '', '정정 이력'));
            for (const h of info.history || []) {
                const when = new Date(h.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
                history.append(el('p', 'small mb-1 text-break', `${won(h.before_amount)} → ${won(h.after_amount)} · ${h.actor_name} · ${when}`),
                    el('p', 'small mb-2 text-break', h.reason));
            }
            if (!info.history?.length) history.append(el('p', 'small mb-1', '아직 정정 이력이 없습니다.'));
        }
        async function inspect() {
            const run = ++ticket;
            phase = 'loading'; note('전표를 확인하고 있어요.'); render();
            try {
                const item = await rpc('inspect', { trans_id: transId }, true);
                if (!alive() || run !== ticket) return;
                if (!item || item.trans_id !== transId) throw new Error('UNCONFIRMED');
                info = item; check.checked = false;
                summary.textContent = `${item.date || ''} · ${transId} · 장부 ${item.before_amount == null ? '금액 확인 필요' : won(item.before_amount)} · 원결재 ${won(item.approved_amount)}`;
                if (!draft.amount && item.before_amount != null) amount.value = String(item.before_amount);
                showHistory();
                phase = 'ready';
                note(item.locked_reason || (item.row_count === 4 ? '원전표와 연결된 재분류 전표의 금액을 함께 정정합니다.' : '차변과 대변의 금액을 함께 정정합니다.'));
            } catch (e) {
                if (!alive() || run !== ticket) return;
                phase = 'failed'; note(errors[e.code] || '전표를 확인하지 못했어요. 다시 불러와 주세요.');
            }
            if (alive()) render();
        }
        async function settled(result, request) {
            if (!result?.found || result.trans_id !== transId || Number(result.after_amount) !== request.amount) return false;
            draft.request = null; draft.amount = ''; draft.reason = '';
            draft.changed = true;
            if (!alive()) return true;
            phase = 'saved'; check.checked = false; info = null;
            note(`정정했어요. ${won(result.before_amount)} → ${won(result.after_amount)}`); render();
            return true;
        }
        async function checkResult() {
            if (!alive() || !draft.request || draft.writing) return;
            const request = draft.request;
            phase = 'checking'; note('앞선 요청의 결과만 확인하고 있어요.'); render();
            try {
                const result = await rpc('result', { trans_id: transId, request_key: request.request_key }, true);
                if (!alive() || draft.request !== request) return;
                if (await settled(result, request)) return;
                if (result?.found !== false) throw new Error('UNCONFIRMED');
                phase = 'retry'; note('아직 정정 기록이 없어요. 계속하려면 처음과 같은 요청으로 저장할 수 있습니다.');
            } catch (e) {
                if (!alive()) return;
                phase = 'unknown'; note(errors[e.code] || '결과를 확인하지 못했어요. 새 요청은 보내지 않았습니다.');
            }
            if (alive()) render();
        }
        async function commit(request) {
            if (!alive() || draft.writing) return;
            draft.writing = true; draft.request = request; note('정정을 저장하고 있어요.'); render();
            try {
                const result = await rpc('commit', request);
                if (!(await settled(result, request))) throw new Error('UNCONFIRMED');
            } catch (e) {
                if (errors[e.code]) {
                    draft.request = null;
                    if (alive()) { phase = 'failed'; check.checked = false; note(errors[e.code]); }
                } else if (alive()) {
                    phase = 'unknown'; note('저장 결과를 아직 알 수 없어요. 정정 결과 확인을 눌러 주세요.');
                }
            } finally {
                draft.writing = false;
                if (alive()) render();
                else if (active && active.key === key) active.reconcile();
            }
        }
        amount.value = draft.amount; reason.value = draft.reason;
        for (const field of [amount, reason]) field.addEventListener('input', () => {
            draft.amount = amount.value; draft.reason = reason.value; check.checked = false; render();
        });
        check.addEventListener('change', render);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!alive() || action.disabled) return;
            if (draft.request) return void (phase === 'retry' ? commit(draft.request) : checkResult());
            if (phase === 'failed') return void inspect();
            const value = parsedAmount();
            if (phase !== 'ready' || !info || info.locked_reason || !check.checked ||
                !reason.value.trim() || !Number.isSafeInteger(value) || value <= 0 ||
                value === Number(info.before_amount) || value > Number(info.approved_amount)) return;
            void commit(Object.freeze({ trans_id: transId, fingerprint: info.fingerprint, amount: value,
                reason: reason.value.trim(), confirmed: true, request_key: root.crypto.randomUUID() }));
        });
        const cancelView = () => { if (dialog.open && !current()) dialog.close(); };
        const observer = new MutationObserver(cancelView);
        const tab = doc.getElementById('tabHistory');
        if (tab) observer.observe(tab, { attributes: true, attributeFilter: ['class'] });
        if (root.frameElement) observer.observe(root.frameElement, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
        doc.addEventListener('visibilitychange', cancelView);
        close.addEventListener('click', () => dialog.close());
        if (ids.length) {
            datePanel = createDatePanel({ client, ids, draft: draft.date, alive: () => live() && mode === 'date',
                updateModes, close: () => dialog.close(), onSaved: () => { draft.changed = true; },
                onSettled: () => { if (active?.key === key && active !== view) active.reconcile(); } });
            dialog.append(datePanel.node);
            dateMode.addEventListener('click', () => changeMode('date'));
            amountMode.addEventListener('click', () => changeMode('amount'));
        }
        dialog.addEventListener('close', () => {
            const focus = doc.activeElement;
            controller?.abort(); datePanel?.cancelRead(); observer.disconnect();
            doc.removeEventListener('visibilitychange', cancelView);
            if (active === view) active = null;
            dialog.remove();
            if (current() && opener?.isConnected && (!focus || focus === doc.body || dialog.contains(focus))) opener.focus({ preventScroll: true });
            if (draft.changed && current()) {
                draft.changed = false;
                Promise.resolve().then(() => {
                    if (current() && !active) return refresh();
                    draft.changed = true;
                }).catch(() => { draft.changed = true; });
            }
        }, { once: true });
        amountPanel.hidden = true;
        if (datePanel) datePanel.node.hidden = true;
        dialog.showModal();
        changeMode(ids.length && !draft.request && !draft.writing ? 'date' : 'amount');
    }
    root.CoopJournalTypo = Object.freeze({ open });
})(window);
