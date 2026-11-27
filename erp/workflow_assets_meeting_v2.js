/* Optional code only. This loader never caches users, permissions or business data. */
(function (root) {
    'use strict';
    const local = path => new URL(path, document.baseURI).href;
    const assets = Object.freeze({
        spreadsheet: {src:local('../shared/vendor/xlsx-0.20.3.full.min.js'), integrity:'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT', ready:() => root.XLSX?.version === '0.20.3'},
        chart: {src:'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js', integrity:'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ', ready:() => root.Chart?.version === '4.5.1'},
        calendar: {src:'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js', integrity:'sha384-n4VL2mHw6ER8HxL4KH/pGa4ZTDkXrXtr5VHKdtXrgvrbP5MrydzsAFLP5kV9h9VY', ready:() => root.FullCalendar?.version === '6.1.8' && typeof root.FullCalendar.Calendar === 'function'},
        calendarKo: {src:local('../shared/vendor/fullcalendar-ko-6.1.8.global.min.js'), integrity:'sha384-2367S6fxrA/O37Pse+mIme1QAUoP5+KWqeuFgdlG/JElDema4XKWWQTQRb0ZGi2Q', ready:() => root.FullCalendar?.globalLocales?.some(locale => locale.code === 'ko') === true},
        meetingNotice: {src:local('approval_meeting_notice_v1_3_0.js'), integrity:'sha384-pS8DqLuiPIqy/dDV6h0rgrXCcgLWYAOnT+EeS+TGML1C0Fx/7C54nfyQDazPOPfm', ready:() => root.CoopMeetingNotice?.version === '1.3.0'},
        approvalPrint: {src:local('approval_print_templates_v1_5.js'), integrity:'sha384-7GxD/qc02yMrzOJ6749e3MCouFfPUhgSn0KVxPiBPJfWZC5JX3gyqUlumGVNdkFw', ready:() => root.ApprovalPrintTemplates?.version === '1.5.0'},
        approvalPrintAttachments: {src:local('approval_print_attachments.js?v=1.0.0'), integrity:'sha384-SfC3sFiucH/VFTbvTn/FMXQpncg/G8PxLHQyP+3ORDNcfWugR11ueVaoIzPoaABe', ready:() => root.ApprovalPrintAttachments?.version === '1.0.0'},
        pdfCreate: {src:local('assets/vendor/pdf-lib-1.17.1.min.js'), integrity:'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI', ready:() => typeof root.PDFLib?.PDFDocument?.create === 'function'},
        accountingGuide: {src:local('accounting_guide.js?v=1.4.11'), integrity:'sha384-Q/UUiTOkyKjM47tHVVTc3pnrgIQqLpUyxi/dEsFBA2Xq79kl7P54byzrvmYVHoap', ready:() => root.CoopAccountingGuide?.version === '1.4.11'},
        smartaGuide: {src:local('accounting_smarta_guide.js?v=1.4.1'), integrity:'sha384-fVMZs+/m/rValhBELe2W53B+FZBRjwGAOFF+mPr1ozAz7kTFVaspeIKxUOp6irMj', ready:() => root.CoopSmartaGuide?.version === '1.4.1'},
        financialEngine: {src:local('financial_statements_engine.js?v=1.1.0'),integrity:'sha384-tHgs9MvyMyqTqO0xgb085190rccIQa+mRTNiZDpLTrpvvs5qMnZ+MZhqgVRV9H/s',ready:()=>root.FinancialStatementsEngine?.version==='1.1.0'},
        contractPdf: {src:local('assets/vendor/html2pdf-0.10.1.bundle.min.js'),integrity:'sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc',ready:()=>typeof root.html2pdf==='function'},
        printService: {src:local('print_service_v2.js'),integrity:'sha384-Q3QwPRZuXNWcpC9pI9m9M8wtttmZflnEFUK/Ghzr6wNMxvK1eooRmMT1TuZm+9sZ',ready:()=>typeof PrintService!=='undefined'&&typeof PrintService.printSalary==='function'},
        salarySlipPrint:{src:local('salary_slip_print_v1.js'),integrity:'sha384-le/7kWDt8bDq92Bo+xVVaklILa0P4UtZQlS3cWq7QKu0H704SFaHCl9p5dV0veso',ready:()=>root.SalarySlipPrint?.version==='1.0.0'},
        employeeCertificatePrint: {src:local('employee_certificate_print.js?v=20261119-1'),integrity:'sha384-MaXwoJKzC1mpKc5YfdSfTyBHNkDE9M4sQhxPdzxuNhlR5c5W2+wuzbKMNa6luSG9',ready:()=>typeof root.EmployeeCertificatePrint?.open==='function'},
        expoEmployeeCertificate: {src:local('expo_employee_certificate.js?v=20261022-1'),integrity:'sha384-UG6VUY2x7hY7XhAT26fBsNqkbe3VMvaXf3YRfvE0BRSSrs4ZNIibnAL5rG/4XjoX',ready:()=>typeof root.ExpoEmployeeCertificate?.prepare==='function'},
        mypageInsurance: {src:local('hr_insurance_status.js?v=1.0.1'),integrity:'sha384-XKzKplCd2A5/vUMMvshHOV9fYiZXP+yh62pBeql/jHOxIePyQMKgfkM4RrmMmKwz',ready:()=>typeof root.HrInsuranceStatus?.mount==='function'},
        aiMemberDetails: {src:local('ai_member_details_settings.js?v=1.0.0'),integrity:'sha384-ricDiFfEvns5x0CJ9RTxl3k1W3zgLFETEfJV2if+iSKFYLs4aTZLFd8u9YoG6ziU',ready:()=>typeof root.ErpAiMemberDetailsSettings?.open==='function'},
        mypageAi: {src:local('ai_connection.js?v=1.3.3'),integrity:'sha384-wfWlSZjPbLjleXTW7NLvAe0z1mGOLRyfJ0KOq4ImhEFlvXSdyJJxhd76ReDhc+1y',ready:()=>typeof root.ErpAiConnections?.mount==='function'},
        financialStatements: {src:local('financial_statements.js?v=20261022-help-1'),integrity:'sha384-197uk3V7iE6wQHZ3ym5FaJlxM+YFII3EvoqIWWJ4nmSpSe+ZwGrMvoKi4/p1frPq',ready:()=>root.FinancialStatements?.version==='1.1.5'},
        accountingTax: {src:local('accounting_tax_tasks_v1_2_1.js'),integrity:'sha384-DXDn0tpbEVnbON6KY6pqacJPNpejJSPYV4T/4E64SO9gFZfOPm8/mGOSODz8ug9d',ready:()=>root.AccountingTaxTasks?.version==='1.2.1'},
        // The existing provider serves a rolling script, just as in member management.
        postcode: {src:'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js',ready:()=>typeof root.daum?.Postcode==='function'}
    });
    const pending = new Map();
    function load(key) {
        const asset = assets[key];
        if (!asset) return Promise.reject(new Error('ERP_ASSET_UNKNOWN'));
        if (asset.ready()) return Promise.resolve();
        if (pending.has(key)) return pending.get(key);
        const request = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let finished = false;
            const settle = error => {
                if (finished) return;
                finished = true;
                root.clearTimeout(timer);
                script.onload = script.onerror = null;
                if (error) { script.remove(); reject(error); } else resolve();
            };
            const timer = root.setTimeout(() => settle(new Error('ERP_ASSET_TIMEOUT')), 20000);
            script.src = asset.src;
            if (asset.integrity) {
                script.integrity = asset.integrity;
                script.crossOrigin = 'anonymous';
            }
            script.async = true;
            script.onload = () => settle(asset.ready() ? null : new Error('ERP_ASSET_VERSION_MISMATCH'));
            script.onerror = () => settle(new Error('ERP_ASSET_LOAD_FAILED'));
            document.head.appendChild(script);
        }).catch(error => { pending.delete(key); throw error; });
        pending.set(key, request);
        return request;
    }
    root.ErpWorkflowAssets = Object.freeze({load});
})(window);
