/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/* Fixed optional dependencies. No session, permission or business-data cache. */
(function (root) {
    'use strict';
    const spreadsheet = Object.freeze({
        src: new URL('../shared/vendor/xlsx-0.20.3.full.min.js', document.baseURI).href,
        integrity: 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT'
    });
    const chart = Object.freeze({
        src: 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
        integrity: 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ'
    });
    const dashboard = Object.freeze({
        src: new URL('admin_member_dashboard.js?v=20261018-application-badge-1', document.baseURI).href,
        integrity: 'sha384-xhjz2AjVzdDO+xgdSFUXKJwF7ruDunW5XRGCdh/fgA9Bu84+NdavvWi/5FCdfPk2'
    });
    const pdf = Object.freeze({
        src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    });
    const capitalImport = Object.freeze({
        src: new URL('capital_excel_import.js?v=20261022-help-1', document.baseURI).href,
        integrity: 'sha384-5y+Dcz/wtb7Mcb+gkxBLc8A+bVs7U7Hpn1s6XjY72OgyPt9UQ/dnPhAn8RJM+Dc9'
    });
    const memberWorkbook = Object.freeze({
        src: new URL('member_capital_workbook.js?v=1.1.1', document.baseURI).href,
        integrity: 'sha384-A16LqPEzSibSXapb2XaQ8YaF750SugkM5KRZ0wfeL6GTB2gJgHxOWu1wyWPdqthl'
    });
    const memberExcelEntry = Object.freeze({
        src: new URL('member_excel_entry.js?v=1.0.4', document.baseURI).href,
        integrity: 'sha384-F4dg338gifzgPhdO1wBkAmczdZgyb4G4mGwayvj9WPszhdGSxS0SPtyxoNT0RHRb'
    });
    const siteAssets = Object.freeze([
        Object.freeze({src: new URL('home_settings_conflict.js?v=1.0.0', document.baseURI).href, integrity: 'sha384-2dLr0r0obVLbc9+OB2t4zQ/93bWr/XN6tUV8fMHwIggYDmjZ6ezKQX91b3CHjNz6', ready: () => root.CoopHomeConflict?.version === '1.0.0'}),
        Object.freeze({src: new URL('site_editor_drafts.js?v=1.1.0', document.baseURI).href, integrity: 'sha384-avf0MN4qCGjirM7RyH6TywwTUqp333nFCV4SsJFyRtaeRmmQKwtJzU7csLBKgFJ+', ready: () => typeof root.SiteEditorDrafts?.create === 'function'}),
        Object.freeze({src: new URL('../shared/home_design.js?v=20261009-3', document.baseURI).href, integrity: 'sha384-w7le8YvS38GKPdQQ6A4Jjp/+Xlqoda5IEU97x+Gwj8gdTOdOh+iXxZuW2ZeO9uDp', ready: () => typeof root.CoopHomeDesign?.normalizeLayout === 'function'}),
        Object.freeze({src: new URL('../shared/site_text_styles.js?v=20261009-17', document.baseURI).href, integrity: 'sha384-QjRL2pjNqVnMgC37LaVoPTXaST81Wrogi/v6nRwDo/zzz0mCX6+YZNAAz6ORU2MH', ready: () => typeof root.CoopTextStyles?.normalize === 'function'}),
        Object.freeze({src: new URL('../shared/participation_image_display.js?v=20261012-2', document.baseURI).href, integrity: 'sha384-BAhSAOuwT81zoUXrZQVqiEgLHCl625ndKclSPUIO9cKHaf9spvIsk1RgPz9Gb04S', ready: () => root.CoopParticipationImages?.version === '1.0.1'}),
        Object.freeze({src: new URL('../shared/activity_photo_viewer.js?v=20261012-1', document.baseURI).href, integrity: 'sha384-EY00pwIUzEP8WOxijMpFaT9V7txklu4gJpDNrnluPaI/JDlyGj/YaR/75McSxkRX', ready: () => root.CoopActivityPhotoViewer?.version === '1.0.0'}),
Object.freeze({src: new URL('admin_member_site.js?v=20261026-external-read-2', document.baseURI).href, integrity: 'sha384-ncZkNV5lpxuIfV6ZZFgZj9lt+lP1PL9IuiI2onAKr4VRo+TZxBSt4Gx51Z9oK3XE', ready: () => root.AdminMemberSite?.version === '20261026-external-read-2'}),
        Object.freeze({src: new URL('site_legal_samples.js?v=20261008-1', document.baseURI).href, integrity: 'sha384-8En93aFZlH8BEdzebQ4j4kJzZycfI/wI+t+wVTm3KyhVwDb/9SHzDV9cBcC3s2oq', ready: () => !!root.CoopSiteLegalSamples}),
Object.freeze({src: new URL('site_inline_editor.js?v=20261025-cert-intent-1', document.baseURI).href, integrity: 'sha384-zP3MOzIzp+Ez6TInBZvW0B2f/0eOi+y8JA408xtXI3DVSZJGHwd4A6tyBDPlRYj0', ready: () => typeof root.CoopSiteInlineHost?.mount === 'function'}),
        Object.freeze({src: new URL('home_visual_editor.js?v=20261022-help-1', document.baseURI).href, integrity: 'sha384-sVje3AcWY4Bxgp067nE+YOBg6TEWyIBV7vXLK4QQxB+XCx1XN+nFfn9yFPps/b4e', ready: () => root.CoopHomeVisualEditor?.version === '20261019-controls-1'}),
        Object.freeze({src: new URL('hero_slides_editor.js?v=1.5.2', document.baseURI).href, integrity: 'sha384-2jkfSGk7lEzSt5aFFs7gjlPdwrNMl8xBPIdiMK1U9+S7q6vybWqqdaEg8ma/fqCJ', ready: () => typeof root.CoopHeroSlides?.mount === 'function'}),
        Object.freeze({src: new URL('home_editor_tools.js?v=20261022-help-2', document.baseURI).href, integrity: 'sha384-GKeyhK4B1lBTcORPn8hDRKE46i7r6wPHl92XpZ3UVmRsq9aNjEzWuPOZ+BnZZH9D', ready: () => root.CoopHomeEditorTools?.version === '1.0.3'}),
        Object.freeze({src: new URL('hero_slides_visual.js?v=2.3.0', document.baseURI).href, integrity: 'sha384-kdrAacTDpQksE8o505Ita3wA16yx8OS876aDkytwejSlqxg6gqhJTHPyw18B4cQi', ready: () => root.CoopHeroVisual?.version === '2.3.0'}),
        Object.freeze({src: new URL('site_legal_editor.js?v=20261025-legal-cursor-1', document.baseURI).href, integrity: 'sha384-BaY4MCnsDOEQCrP1IORnh0yLyHvDl3Dk1FFx46Ov2Y6yUJXOew9gEBoNfjESy1Xa', ready: () => typeof root.CoopSiteLegalEditor?.refreshPreview === 'function'})
    ]);
    const pending = new Map();
    function ready() { return root.XLSX?.version === '0.20.3' && typeof root.XLSX?.read === 'function' && typeof root.XLSX?.writeFile === 'function'; }
    function ensureAsset(key, asset, isReady) {
        if (isReady()) return Promise.resolve();
        if (pending.has(key)) return pending.get(key);
        const request = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let finished = false;
            const settle = (error) => {
                if (finished) return;
                finished = true;
                root.clearTimeout(timer);
                script.onload = script.onerror = null;
                if (error) { script.remove(); reject(error); } else resolve();
            };
            const timer = root.setTimeout(() => settle(new Error(key + '_LOAD_TIMEOUT')), 20000);
            script.src = asset.src;
            script.integrity = asset.integrity;
            script.crossOrigin = 'anonymous';
            script.async = true;
            script.onload = () => settle(isReady() ? null : new Error(key + '_VERSION_MISMATCH'));
            script.onerror = () => settle(new Error(key + '_LOAD_FAILED'));
            document.head.appendChild(script);
        }).catch(error => { pending.delete(key); throw error; });
        pending.set(key, request);
        return request;
    }
    function ensureSpreadsheet() { return ensureAsset('SPREADSHEET', spreadsheet, ready); }
    async function ensureCapitalImport() {
        await ensureAsset('CAPITAL_IMPORT', capitalImport, () => root.CapitalExcelImport?.version === '1.0.0');
        return root.CapitalExcelImport;
    }
    async function ensureMemberWorkbook() {
        await ensureCapitalImport();
        await ensureAsset('MEMBER_WORKBOOK', memberWorkbook, () => root.MemberCapitalWorkbook?.version === '1.1.1');
        return root.MemberCapitalWorkbook;
    }
    async function ensureMemberExcelEntry() {
        await ensureAsset('MEMBER_EXCEL_ENTRY', memberExcelEntry, () => root.MemberExcelEntry?.version === '1.0.4');
        return root.MemberExcelEntry;
    }
    function ensurePdf() {
        return ensureAsset('PDF', pdf, () => root.jspdf?.jsPDF?.version === '2.5.1');
    }
    async function ensureDashboard() {
        await Promise.all([
            ensureAsset('CHART', chart, () => root.Chart?.version === '4.5.1'),
            ensureAsset('DASHBOARD', dashboard, () => typeof root.AdminMemberDashboard?.load === 'function')
        ]);
        return root.AdminMemberDashboard;
    }
    async function ensureSite() {
        // Definitions may arrive together; visual adapters require the shared helpers first.
        await Promise.all(siteAssets.slice(0, 7).map((asset, index) => ensureAsset('SITE_' + index, asset, asset.ready)));
        await Promise.all(siteAssets.slice(7).map((asset, index) => ensureAsset('SITE_' + (index + 7), asset, asset.ready)));
        return root.AdminMemberSite;
    }
    function showBootFailure() {
        const gate = document.getElementById('admin-boot-gate');
        const card = document.getElementById('adminBootCard');
        if (!gate || !card) return;
        gate.classList.remove('hidden');
        gate.setAttribute('aria-busy', 'false');
        card.classList.add('is-error');
        card.querySelector('.spinner-border')?.remove();
        const title = card.querySelector('h3');
        if (title) title.textContent = '관리 화면을 불러오지 못했습니다';
        const message = document.getElementById('adminBootMessage');
        if (message) message.textContent = '연결을 확인한 뒤 다시 시도해 주세요.';
        if (!card.querySelector('[data-boot-retry]')) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn btn-primary mt-3';
            retry.dataset.bootRetry = '1';
            retry.textContent = '다시 불러오기';
            retry.onclick = () => root.location.reload();
            card.appendChild(retry);
        }
    }
    root.AdminMemberAssets = Object.freeze({ ensureSpreadsheet, ensureCapitalImport, ensureMemberWorkbook, ensureMemberExcelEntry, ensurePdf, ensureDashboard, ensureSite, showBootFailure });
})(window);
