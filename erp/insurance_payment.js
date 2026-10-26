/* v1.0.1 — confirm an automatic debit only on/after its scheduled date. */
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
    function syncWaitReason(doc, today) {
        const insurance = doc?.expense_snapshot?.insurance;
        if (!isInsurance(doc) || !isAuto(insurance)) return '';
        if (!validDate(insurance.due_date)) return '자동이체 예정일을 확인한 뒤 연동해 주세요.';
        if (!validDate(today)) return '현재 날짜를 확인하지 못했습니다. 다시 시도해 주세요.';
        return insurance.due_date > today ? `${insurance.due_date}부터 실제 출금을 확인한 뒤 연동할 수 있습니다.` : '';
    }
    function syncPaymentError(doc, payment, today) {
        const reason = syncWaitReason(doc, today);
        if (reason) return reason;
        const insurance = doc?.expense_snapshot?.insurance;
        return isInsurance(doc) && isAuto(insurance) && validDate(payment?.date) && payment.date < insurance.due_date
            ? '자동이체 예정일 이후의 실제 출금일을 확인해 주세요.' : '';
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
    window.CoopInsurancePayment = { version: '1.0.1', validDate, isAuto, isInsurance, label, validate, defaultDate, syncWaitReason, syncPaymentError };
})();
