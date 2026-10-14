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
        src: new URL('admin_member_dashboard.js?v=20261013-1', document.baseURI).href,
        integrity: 'sha384-uqG+szn7X3G7S0x3Y5za0IJT6TLH7AlYIux3fIvZRuKj1RdBMcXFikJamr2FOstz'
    });
    const pdf = Object.freeze({
        src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    });
    const siteAssets = Object.freeze([
        Object.freeze({src: new URL('home_settings_conflict.js?v=1.0.0', document.baseURI).href, integrity: 'sha384-2dLr0r0obVLbc9+OB2t4zQ/93bWr/XN6tUV8fMHwIggYDmjZ6ezKQX91b3CHjNz6', ready: () => root.CoopHomeConflict?.version === '1.0.0'}),
        Object.freeze({src: new URL('site_editor_drafts.js?v=1.1.0', document.baseURI).href, integrity: 'sha384-avf0MN4qCGjirM7RyH6TywwTUqp333nFCV4SsJFyRtaeRmmQKwtJzU7csLBKgFJ+', ready: () => typeof root.SiteEditorDrafts?.create === 'function'}),
        Object.freeze({src: new URL('../shared/home_design.js?v=20261009-3', document.baseURI).href, integrity: 'sha384-w7le8YvS38GKPdQQ6A4Jjp/+Xlqoda5IEU97x+Gwj8gdTOdOh+iXxZuW2ZeO9uDp', ready: () => typeof root.CoopHomeDesign?.normalizeLayout === 'function'}),
        Object.freeze({src: new URL('../shared/site_text_styles.js?v=20261009-17', document.baseURI).href, integrity: 'sha384-QjRL2pjNqVnMgC37LaVoPTXaST81Wrogi/v6nRwDo/zzz0mCX6+YZNAAz6ORU2MH', ready: () => typeof root.CoopTextStyles?.normalize === 'function'}),
        Object.freeze({src: new URL('../shared/participation_image_display.js?v=20261012-2', document.baseURI).href, integrity: 'sha384-BAhSAOuwT81zoUXrZQVqiEgLHCl625ndKclSPUIO9cKHaf9spvIsk1RgPz9Gb04S', ready: () => root.CoopParticipationImages?.version === '1.0.1'}),
        Object.freeze({src: new URL('../shared/activity_photo_viewer.js?v=20261012-1', document.baseURI).href, integrity: 'sha384-EY00pwIUzEP8WOxijMpFaT9V7txklu4gJpDNrnluPaI/JDlyGj/YaR/75McSxkRX', ready: () => root.CoopActivityPhotoViewer?.version === '1.0.0'}),
Object.freeze({src: new URL('admin_member_site.js?v=20261015-1', document.baseURI).href, integrity: 'sha384-Yi0T2p5zrOfRB5wLLPqLCikweE1eRasztDZlO2GrnAf5YFoz80acLJ971lvu/KdQ', ready: () => root.AdminMemberSite?.version === '20261015-1'}),
        Object.freeze({src: new URL('site_legal_samples.js?v=20261008-1', document.baseURI).href, integrity: 'sha384-8En93aFZlH8BEdzebQ4j4kJzZycfI/wI+t+wVTm3KyhVwDb/9SHzDV9cBcC3s2oq', ready: () => !!root.CoopSiteLegalSamples}),
Object.freeze({src: new URL('site_inline_editor.js?v=20261015-2', document.baseURI).href, integrity: 'sha384-/yUtGKxyojNCkTh1EqN8pbT65Dw0WRdrPeShcvONGuA/YfhLMKkeWkQJPsotlclp', ready: () => typeof root.CoopSiteInlineHost?.mount === 'function'}),
        Object.freeze({src: new URL('home_visual_editor.js?v=20261014-4', document.baseURI).href, integrity: 'sha384-D0JGVp886uNEn3Z4EPxkUXkeam6evT4L7kbus0cXcmNFMmBuqPn79mPmLlVlcMe+', ready: () => typeof root.CoopHomeVisualEditor?.mount === 'function'}),
        Object.freeze({src: new URL('hero_slides_editor.js?v=1.4.0', document.baseURI).href, integrity: 'sha384-6S0Xgjztn7kR9Kgh/YhGpEUtXUJV/ARQI9rJrgSBgq7RsMbTYObLecpkOVnKxrsA', ready: () => typeof root.CoopHeroSlides?.mount === 'function'}),
        Object.freeze({src: new URL('hero_slides_visual.js?v=2.2.0', document.baseURI).href, integrity: 'sha384-rAn53Mj3E1C9wfuAo343fwEEUwvoxef3e411WLvEMDKyp7w9L161FdCgNycwzG9s', ready: () => root.CoopHeroVisual?.version === '2.2.0'}),
        Object.freeze({src: new URL('site_legal_editor.js?v=20261010-6', document.baseURI).href, integrity: 'sha384-xMvV6OBb3zFW+p4ufeMCwcEPNwMkhGxNMewbBE4vfrJrhllBCQuFm2qTgdWonFyw', ready: () => typeof root.CoopSiteLegalEditor?.refreshPreview === 'function'})
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
    root.AdminMemberAssets = Object.freeze({ ensureSpreadsheet, ensurePdf, ensureDashboard, ensureSite, showBootFailure });
})(window);
