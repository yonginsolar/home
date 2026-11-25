/* Shared salary slip date policy for employee and HR printing. */
(function (root) {
    'use strict';
    const signoff = `
      .salary-sig .salary-sig-row {
        display:grid; align-items:center; position:relative;
        width:max-content; max-width:122mm; min-height:22mm; margin-inline:auto;
      }
      .salary-sig .salary-sig-chair {
        display:block; max-width:100%; min-width:0; text-align:center; overflow-wrap:anywhere;
      }
      .salary-sig .salary-sig-seal {
        position:absolute; left:calc(100% - .4mm); top:50%; transform:translateY(-50%);
      }`;
    const labels = Object.freeze({actual:'실제 지급일',scheduled:'급여 예정',legacy:'지급일자',unknown:'지급일'});
    const fmt = (y, m, d) => `${y}년 ${m}월 ${d}일`;
    function checkedDate(value) {
        const parts = typeof value === 'string' && /^(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
        if (!parts) return '';
        const [y,m,d] = parts.slice(1).map(Number);
        return new Date(Date.UTC(y,m-1,d)).getUTCDate() === d ? fmt(y,m,d) : '';
    }
    function paymentDetails(basis, ym) {
        const kind = basis?.kind;
        if (kind === 'actual' || kind === 'scheduled') {
            const date = checkedDate(basis.date);
            if (date) return {kind,date};
            if (kind === 'scheduled' && Number.isInteger(basis.day) && basis.day >= 1 && basis.day <= 31) {
                return {kind,date:`매월 ${basis.day}일`};
            }
        }
        if (kind === 'legacy' && typeof ym === 'string' && /^20\d\d-(0[1-9]|1[0-2])$/.test(ym)) {
            const [y,m] = ym.split('-').map(Number);
            return {kind,date:fmt(y + (m === 12 ? 1 : 0), m === 12 ? 1 : m+1, 10)};
        }
        return {kind:'unknown',date:'확인되지 않음'};
    }
    async function readPayment(client, savedRow) {
        const id=savedRow?.id;
        if (!/^\d+$/.test(String(id ?? ''))) return paymentDetails(null, savedRow?.year_month);
        const controller=new AbortController();
        let timer;
        try {
            const deadline = new Promise(resolve => {
                timer=root.setTimeout(() => { controller.abort(); resolve(null); }, 4500);
            });
            const query=client.rpc('erp_payslip_payment_basis',{p_salary_id:id});
            const result=await Promise.race([typeof query.abortSignal === 'function' ? query.abortSignal(controller.signal) : query,deadline]);
            return paymentDetails(result?.error ? null : result?.data,savedRow.year_month);
        } catch (_) { return paymentDetails(null,savedRow?.year_month); }
        finally { root.clearTimeout(timer); }
    }
    function print(data,reservedWindow) {
        const view=Object.create(PrintService);
        view.styles={...PrintService.styles,salary:PrintService.styles.salary+signoff};
        const label=Object.hasOwn(labels,data.payment?.kind) ? labels[data.payment.kind] : labels.unknown;
        view.buildSalaryArticleHtml=function (input) {
            return PrintService.buildSalaryArticleHtml.call(this,input)
                .replace('<span>지급일자 : <strong>',`<span>${label} : <strong>`)
                .replace('<th scope="row">지급일자</th>',`<th scope="row">${label}</th>`);
        };
        return view.printSalary({...data,payDate:data.payment?.date ?? '확인되지 않음'},reservedWindow);
    }
    root.SalarySlipPrintV2=Object.freeze({version:'2.0.0',paymentDetails,readPayment,print});
})(window);
