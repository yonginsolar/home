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
        src: new URL('admin_member_dashboard.js?v=20261010-2', document.baseURI).href,
        integrity: 'sha384-FO+mN8KjMwfwu0gWefgvdg3S0jVvttsJCXEuXTFAPYz5lbGwF1D0fTkcpHVy/3H6'
    });
    const pdf = Object.freeze({
        src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    });
    const siteAssets = Object.freeze([
        Object.freeze({src: new URL('site_editor_drafts.js?v=1.0.0', document.baseURI).href, integrity: 'sha384-EbfUPXazsNn8Ls1+1MosAAoCgvtGnTkzJFr3y/guzmHIS3qZ7rEDd1Vy/AsQU09P', ready: () => typeof root.SiteEditorDrafts?.create === 'function'}),
        Object.freeze({src: new URL('../shared/home_design.js?v=20261009-3', document.baseURI).href, integrity: 'sha384-w7le8YvS38GKPdQQ6A4Jjp/+Xlqoda5IEU97x+Gwj8gdTOdOh+iXxZuW2ZeO9uDp', ready: () => typeof root.CoopHomeDesign?.normalizeLayout === 'function'}),
        Object.freeze({src: new URL('../shared/site_text_styles.js?v=20261009-17', document.baseURI).href, integrity: 'sha384-QjRL2pjNqVnMgC37LaVoPTXaST81Wrogi/v6nRwDo/zzz0mCX6+YZNAAz6ORU2MH', ready: () => typeof root.CoopTextStyles?.normalize === 'function'}),
        Object.freeze({src: new URL('admin_member_site.js?v=20261010-3', document.baseURI).href, integrity: 'sha384-rKtE8C5EtrT/FPWzWbIHPIlEIe6xN1mGUDfREwqqfHkaq1lFgIiQ6f94fPXuCnOh', ready: () => root.AdminMemberSite?.version === '20261010-3'}),
        Object.freeze({src: new URL('site_legal_samples.js?v=20261008-1', document.baseURI).href, integrity: 'sha384-8En93aFZlH8BEdzebQ4j4kJzZycfI/wI+t+wVTm3KyhVwDb/9SHzDV9cBcC3s2oq', ready: () => !!root.CoopSiteLegalSamples}),
        Object.freeze({src: new URL('site_inline_editor.js?v=20261010-3', document.baseURI).href, integrity: 'sha384-P4vouZfwr+qtHzdHll3+71NqTLaxbyz5rW/tTZSYVf4z49D/+/xaCQDhUPW7BXTa', ready: () => typeof root.CoopSiteInlineHost?.mount === 'function'}),
        Object.freeze({src: new URL('home_visual_editor.js?v=20261010-5', document.baseURI).href, integrity: 'sha384-oGxufjZ/O/BlhmzIqADgjZ3aUOBQTX+6BEdNLXhfMIWu2dKonsmfcR30+eqmAiPh', ready: () => typeof root.CoopHomeVisualEditor?.mount === 'function'}),
        Object.freeze({src: new URL('site_legal_editor.js?v=20261010-5', document.baseURI).href, integrity: 'sha384-phvaoBoBoifEmayv0gl0W/fkJItPowiWwdpQ/pT6EGu5bz8bTUOoMGxikiILVcIa', ready: () => typeof root.CoopSiteLegalEditor?.refreshPreview === 'function'})
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
        await Promise.all(siteAssets.slice(0, 5).map((asset, index) => ensureAsset('SITE_' + index, asset, asset.ready)));
        await Promise.all(siteAssets.slice(5).map((asset, index) => ensureAsset('SITE_' + (index + 5), asset, asset.ready)));
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
    root.AdminMemberAssets = Object.freeze({ ensureSpreadsheet, ensurePdf, ensureDashboard, ensureSite, showBootFailure });
})(window);
