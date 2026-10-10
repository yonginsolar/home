/* Optional code only. This loader never caches users, permissions or business data. */
(function (root) {
    'use strict';
    const local = path => new URL(path, document.baseURI).href;
    const assets = Object.freeze({
        spreadsheet: {src:local('../shared/vendor/xlsx-0.20.3.full.min.js'), integrity:'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT', ready:() => root.XLSX?.version === '0.20.3'},
        chart: {src:'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js', integrity:'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ', ready:() => root.Chart?.version === '4.5.1'},
        calendar: {src:'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js', integrity:'sha384-n4VL2mHw6ER8HxL4KH/pGa4ZTDkXrXtr5VHKdtXrgvrbP5MrydzsAFLP5kV9h9VY', ready:() => root.FullCalendar?.version === '6.1.8' && typeof root.FullCalendar.Calendar === 'function'},
        meetingNotice: {src:local('approval_meeting_notice.js?v=1.0.0'), integrity:'sha384-lcsHDOEkfZegygaXJFhi9zGLHa/zVywfWWuWnWIVmCmPyJg0WRXPlwhJCQGz+2zB', ready:() => typeof root.CoopMeetingNotice?.read === 'function'},
        approvalPrint: {src:local('approval_print_templates.js?v=20261010-1'), integrity:'sha384-0VFICoc4VXiHMnSosaKc1uKD1CBTiNdY44sZHytw5okxrBbwGlpIGgKXhuGH9Eqo', ready:() => typeof root.ApprovalPrintTemplates?.buildPhysicalPrintHtml === 'function'},
        accountingGuide: {src:local('accounting_guide.js?v=1.0.2'), integrity:'sha384-a9rglJK2ZQ77p9hwdDbn1hv5+pds91L0dxU4U4f3hXLBBsqRwrbuqoVRfehhfI3f', ready:() => typeof root.CoopAccountingGuide?.mount === 'function'},
        smartaGuide: {src:local('accounting_smarta_guide.js?v=1.0.0'), integrity:'sha384-MHe/7q/URIf9NEtrnuV2o/LsZgpLANn3RxIdzSAjH+g8oLsyNCCusj2lgHOgSdXZ', ready:() => typeof root.CoopSmartaGuide?.mount === 'function'}
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
            script.integrity = asset.integrity;
            script.crossOrigin = 'anonymous';
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
