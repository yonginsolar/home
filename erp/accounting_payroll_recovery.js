/* v1.0.0 — Store only the pending payroll request ID and accounting months. */
(function (host) {
    'use strict';
    const monthPattern = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
    const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    const outcomes = new Set(['unknown', 'posted', 'changed', 'reverted']);
    function create(storage, owner, randomId) {
        if (!owner) throw Error('급여 지급 요청을 보관할 로그인 정보를 확인해 주세요.');
        const prefix = 'coop.accounting.payroll.result.v1:' + encodeURIComponent(owner) + ':';
        function list() {
            const result = [];
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (!key?.startsWith(prefix)) continue;
                const raw = storage.getItem(key);
                if (raw === null) continue;
                const entry = JSON.parse(raw);
                if (!keyPattern.test(entry?.id) || key !== prefix + entry.id || !Array.isArray(entry.months)
                    || !entry.months.length || !entry.months.every(m => monthPattern.test(m))) {
                    throw Error('이전 급여 저장 요청을 확인할 수 없습니다.');
                }
                result.push(entry);
            }
            return result;
        }
        function begin(months) {
            const unique = Array.from(new Set(months)).sort();
            if (!unique.length || !unique.every(m => monthPattern.test(m))) throw Error('급여 귀속월을 확인해 주세요.');
            if (list().some(entry => entry.months.some(m => unique.includes(m)))) {
                throw Error('같은 귀속월의 저장 결과를 먼저 확인해 주세요.');
            }
            const entry = { id: randomId(), months: unique };
            if (!keyPattern.test(entry.id)) throw Error('급여 저장 요청 번호를 만들지 못했습니다.');
            const key = prefix + entry.id;
            const value = JSON.stringify(entry);
            storage.setItem(key, value);
            if (storage.getItem(key) !== value) throw Error('급여 저장 요청을 보관하지 못했습니다.');
            return entry;
        }
        function clear(entry) {
            if (keyPattern.test(entry?.id)) storage.removeItem(prefix + entry.id);
        }
        return { list, begin, clear };
    }
    function isDefiniteRejection(result) {
        const code = String(result?.error?.code || '');
        return (code === '55000' && result.error.details === 'ACCOUNTING_PAYROLL_ACCRUAL_REQUIRED')
            || (result?.status >= 400 && result.status < 500 && result.status !== 408
                && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code));
    }
    async function submit(query, timeout = 15000) {
        let timer;
        try {
            const response = await Promise.race([
                Promise.resolve(query),
                new Promise(resolve => { timer = setTimeout(() => resolve(null), timeout); })
            ]);
            if (response?.error) return { state: isDefiniteRejection(response) ? 'rejected' : 'unknown', response };
            if (!Array.isArray(response?.data) || !response.data.length) return { state: 'unknown' };
            return { state: 'posted', response };
        } catch (_) {
            return { state: 'unknown' };
        } finally { clearTimeout(timer); }
    }
    async function read(client, coopId, entries, signal) {
        return Promise.all(entries.map(async entry => {
            let query = client.rpc('accounting_payroll_batch_status', { p_request_id: entry.id, p_coop_id: coopId }, { get: true });
            if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
            const result = await query;
            if (result?.error || !outcomes.has(result?.data)) throw Error('저장 결과를 불러오지 못했습니다.');
            return { entry, state: result.data };
        }));
    }
    host.CoopPayrollRecovery = { create, submit, read };
})(window);
