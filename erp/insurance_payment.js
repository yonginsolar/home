/* v1.0.0 — a payment schedule is not proof of payment. */
(function () {
    'use strict';
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
        !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const isAuto = insurance => insurance?.payment_method === '자동이체';
    const isInsurance = doc => !!doc?.expense_snapshot?.insurance ||
        doc?.expense_snapshot?.expense_sub_type === '4대보험' || /4대보험/.test(String(doc?.doc_type || ''));
    function label(insurance) {
        if (isAuto(insurance)) return `자동이체${validDate(insurance.due_date) ? ` · ${insurance.due_date}` : ''}`;
        return '직접 납부(지로 등)';
    }
    function validate(insurance) {
        if (!['자동이체', '직접 납부'].includes(insurance?.payment_method)) return '4대보험 납부 방식을 선택해 주세요.';
        if (isAuto(insurance) && !validDate(insurance?.due_date)) return '자동이체 날짜를 입력해 주세요.';
        return '';
    }
    function defaultDate(billingMonth, day) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(billingMonth || ''))) return '';
        if (!Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 31) return '';
        const [year, month] = billingMonth.split('-').map(Number);
        const date = new Date(Date.UTC(year, month, 1));
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(Number(day), lastDay));
        return date.toISOString().slice(0, 10);
    }
    window.CoopInsurancePayment = { version: '1.0.0', validDate, isAuto, isInsurance, label, validate, defaultDate };
})();
