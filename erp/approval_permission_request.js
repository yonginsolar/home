/* v1.0.0 - Selected employee permissions, applied only by server approval. */
(function (root) {
    'use strict';
    const TYPE = '권한부여요청';
    let context = { enabled: false }, busy = false, requestKey = '', requestPayload = '';
    const el = (id) => document.getElementById(id);
    const keys = () => Array.from(document.querySelectorAll('[data-request-permission]:checked')).map(x => x.value).sort();
    const personLabel = (person) => [person.name || '직원', person.position || ''].filter(Boolean).join(' · ');
    function options(select, rows, placeholder) {
        const previous = select.value;
        select.replaceChildren(new Option(placeholder, ''));
        rows.forEach(row => select.add(new Option(personLabel(row), row.emp_id)));
        select.value = rows.some(row => row.emp_id === previous) ? previous : '';
    }
    async function load(client) {
        context = { enabled: false };
        try {
            const result = await client.rpc('erp_permission_request_context');
            if (!result.error && result.data?.enabled === true && Array.isArray(result.data.permissions)) context = result.data;
        } catch (_) { /* Fail closed; ordinary approval remains available. */ }
        return context;
    }
    function render() {
        if (!el('permissionRequestTarget')) return;
        options(el('permissionRequestTarget'), context.targets || [], '직원을 선택하세요');
        const list = el('permissionRequestRights');
        list.replaceChildren();
        (context.permissions || []).forEach((permission, index) => {
            const label = document.createElement('label');
            label.className = 'form-check border rounded p-3 ps-5 mb-2';
            const input = document.createElement('input');
            input.type = 'checkbox'; input.className = 'form-check-input'; input.value = permission.key;
            input.dataset.requestPermission = '1'; input.id = 'permission-request-right-' + index;
            input.addEventListener('change', () => {
                if (permission.key === 'accounting.edit' && input.checked) {
                    const view = list.querySelector('[value="accounting.view"]'); if (view && !view.disabled) view.checked = true;
                }
                if (permission.key === 'accounting.view' && !input.checked) {
                    const edit = list.querySelector('[value="accounting.edit"]'); if (edit) edit.checked = false;
                }
                update();
            });
            const text = document.createElement('span'); text.textContent = permission.label;
            label.append(input, text); list.append(label);
        });
        el('permissionRequestTarget').onchange = () => {
            list.querySelectorAll('input').forEach(input => { input.checked = false; }); update();
        };
        update();
    }
    function update() {
        const target = (context.targets || []).find(row => row.emp_id === el('permissionRequestTarget')?.value);
        document.querySelectorAll('[data-request-permission]').forEach(input => {
            input.disabled = !target || (target.permissions || []).includes(input.value);
            if (input.disabled) input.checked = false;
            input.parentElement.classList.toggle('text-muted', input.disabled);
            input.title = target && input.disabled ? '이미 가진 권한입니다.' : '';
        });
        const selected = keys();
        const candidates = (context.approvers || []).filter(row => row.emp_id !== target?.emp_id && selected.every(key => (row.permissions || []).includes(key)));
        options(el('permissionRequestApprover'), candidates, '결재권자를 선택하세요');
        el('permissionRequestHelp').textContent = !target ? '권한을 받을 직원을 먼저 선택하세요.'
            : !selected.length ? '추가할 업무 권한을 선택하세요. 이미 가진 권한은 선택할 수 없습니다.'
                : !candidates.length ? '선택한 권한을 승인할 수 있는 다른 결재권자가 없습니다. 권한 관리자에게 확인해 주세요.'
                    : '승인 전에는 권한이 바뀌지 않습니다. 승인 완료 후 선택한 권한만 추가됩니다.';
    }
    function setCategory(type) {
        const active = type === TYPE;
        document.body.classList.toggle('permission-request-mode', active);
        ['permissionRequestProxy', 'permissionRequestLine', 'permissionRequestRef', 'permissionRequestBody', 'permissionRequestFiles']
            .forEach(id => el(id)?.classList.toggle('hidden', active));
        el('permissionRequestPanel')?.classList.toggle('hidden', !active);
        if (active) { el('divAmount')?.classList.add('hidden'); el('divProposalSubject')?.classList.add('hidden'); }
        if (active && !el('permissionRequestRights')?.children.length) render();
    }
    function collect() {
        if (context.enabled !== true) throw new Error('권한 부여 요청을 사용할 권한이 없습니다.');
        const target = (context.targets || []).find(row => row.emp_id === el('permissionRequestTarget').value);
        const selected = keys();
        const approver = (context.approvers || []).find(row => row.emp_id === el('permissionRequestApprover').value);
        if (!target) throw new Error('권한을 받을 직원을 선택하세요.');
        if (!selected.length) throw new Error('추가할 업무 권한을 선택하세요.');
        if (selected.some(key => !(context.permissions || []).some(row => row.key === key) || (target.permissions || []).includes(key))) throw new Error('선택한 권한을 다시 확인해 주세요.');
        if (selected.includes('accounting.edit') && !selected.includes('accounting.view') && !(target.permissions || []).includes('accounting.view')) throw new Error('회계 등록·수정에는 회계 조회도 함께 선택해 주세요.');
        if (!approver || approver.emp_id === target.emp_id || !selected.every(key => (approver.permissions || []).includes(key))) throw new Error('선택한 권한을 승인할 수 있는 다른 결재권자를 선택하세요.');
        const note = String(el('permissionRequestNote').value || '').trim();
        if (note.length > 500) throw new Error('업무 내용은 500자 이내로 입력하세요.');
        return { target, selected, approver, note };
    }
    function preview(drafter) {
        const data = collect();
        const labels = data.selected.map(key => context.permissions.find(row => row.key === key).label);
        return { doc_type: TYPE, title: '권한 부여 요청 · ' + data.target.name, drafter_name: drafter?.emp_name || '', amount: 0,
            approval_line: [{ emp_id: data.approver.emp_id, name: data.approver.name, position: data.approver.position, status: '대기' }],
            content: '대상 직원: ' + data.target.name + '\n요청 권한:\n' + labels.map(label => '• ' + label).join('\n')
                + (data.note ? '\n\n업무 내용: ' + data.note : '') + '\n\n승인 완료 후 선택한 업무 권한만 적용됩니다.',
            ref_line: [], file_links: [] };
    }
    function errorMessage(error) {
        const message = String(error?.message || '');
        if (/TARGET_CHANGED|OUTSIDE_OWN_ACCESS|EMPLOYEE_UNAVAILABLE/.test(message)) return '직원 정보나 업무 권한이 변경되었습니다. 현재 권한을 확인하고 다시 요청해 주세요.';
        if (/SEPARATE_APPROVER|APPROVER_ACCESS_REQUIRED|ACCESS_DENIED/.test(message)) return '요청·승인 권한을 확인할 수 없습니다. 다른 결재권자가 필요한지 확인해 주세요.';
        if (/40001|40P01|RETRY_CONFLICT|deadlock/.test(message)) return '다른 권한 변경이 함께 진행되었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.';
        if (/ALREADY_GRANTED/.test(message)) return '해당 직원에게 이미 부여된 권한입니다.';
        return '권한 요청을 처리하지 못했습니다. 현재 직원 정보와 선택한 권한을 확인해 주세요.';
    }
    async function submit(client, notify, alert, refreshed) {
        if (busy) return;
        let payload;
        try {
            const data = collect();
            payload = { p_target_emp_id: data.target.emp_id, p_permission_keys: data.selected, p_approver_emp_id: data.approver.emp_id, p_note: data.note };
        } catch (error) { alert(error.message); return; }
        const signature = JSON.stringify(payload);
        if (!requestKey || signature !== requestPayload) { requestKey = crypto.randomUUID(); requestPayload = signature; }
        busy = true; const button = el('btnSubmit'); button.disabled = true; button.textContent = '상신 중...';
        try {
            const { data, error } = await client.rpc('erp_submit_permission_request', { ...payload, p_request_key: requestKey });
            if (error || !data?.id) throw error || new Error('NO_REQUEST');
            let notificationFailed = false;
            if (!data.replayed) {
                try { const result = await notify(data.approver_emp_id, '결재 요청', '직원 업무 권한 부여 요청이 상신되었습니다.', 'approval.html?doc=' + data.id, { doc_id: data.id }); notificationFailed = !result?.ok; }
                catch (_) { notificationFailed = true; }
            }
            requestKey = ''; requestPayload = ''; el('permissionRequestNote').value = '';
            await load(client); render();
            try { await refreshed(); } catch (_) { /* Request is already committed; never retry a successful write. */ }
            alert('권한 부여 요청을 상신했습니다. 승인 완료 전에는 권한이 바뀌지 않습니다.' + (notificationFailed ? '\n알림 전송을 확인하지 못했습니다. 결재함에서 요청을 확인해 주세요.' : ''));
        } catch (error) { alert(errorMessage(error)); }
        finally { busy = false; button.disabled = false; button.textContent = '상신하기'; }
    }
    async function process(client, doc, action, reason, notify) {
        const { data, error } = await client.rpc('erp_process_permission_request', { p_doc_id: Number(doc.id), p_action: action, p_comment: String(reason || '') });
        if (error) throw new Error(errorMessage(error));
        let notificationFailed = false;
        if (!data?.replayed) {
            try { const result = await notify(doc.drafter_id, action === '승인' ? '결재 완료' : '결재 반려', action === '승인' ? '승인된 직원 업무 권한을 적용했습니다.' : '직원 업무 권한 부여 요청이 반려되었습니다.', 'approval.html?doc=' + doc.id, { doc_id: doc.id }); notificationFailed = !result?.ok; }
            catch (_) { notificationFailed = true; }
        }
        return { ok: true, notice: (action === '승인' ? '승인된 업무 권한을 적용했습니다.' : '반려되었습니다.') + (notificationFailed ? '\n결재 처리는 완료했으나 알림 전송을 확인하지 못했습니다.' : '') };
    }
    root.CoopPermissionRequest = { TYPE, load, render, setCategory, preview, submit, process, enabled: () => context.enabled === true };
})(window);
