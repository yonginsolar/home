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
        src: new URL('admin_member_dashboard.js?v=20261104-region-list-2', document.baseURI).href,
        integrity: 'sha384-Sr3tQkyIoabQs46i38v0MCZhbuKBVvjHZjK/i8qyHy1yjkbKddbuc5zaIaqPVKQ4'
    });
    const pdf = Object.freeze({
        src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    });
    const capitalImport = Object.freeze({
        src: new URL('capital_excel_import.js?v=1.1.0', document.baseURI).href,
        integrity: 'sha384-PExRdIa15COrKe2bJOyMh+bDwThz6ph4J+PmfT0xqERFnWqBKokj9P5YY6d0VEJy'
    });
    const capitalMatching=Object.freeze({src:new URL('capital_member_matching.js?v=1.0.0',document.baseURI).href,
        integrity:'sha384-hjV/oKOplGPUOFoX+gRmEwXPfWjB7d/5xua0PqlDAv1wuzu5KLpvNS02M2IsN7nO'});
    const memberWorkbook = Object.freeze({
        src: new URL('member_capital_workbook.js?v=1.5.5', document.baseURI).href,
        integrity: 'sha384-QwDHUEFdE0c7msOG255PqW74BP3TXnp2vLOUxGieksK4ffE34YaoAqF9F/9QrVjy'
    });
    const memberExcelEntry = Object.freeze({
        src: new URL('member_excel_entry.js?v=1.2.0', document.baseURI).href,
        integrity: 'sha384-PJO+kxqRibZ78yEfhUnZCPK3xljEmYCBZT/W6SJ8KOn+LX4d2qB8R0H45nSioI7e'
    });
    const memberBankImport=Object.freeze({src:new URL('member_bank_import.js?v=1.2.1',document.baseURI).href,integrity:'sha384-Q9wEPSv350stxXcd1FWSDIe8Nk1NyR1pT3Ys//keE4SG4g3vsWLWIOMbWPmrcCWd'});
    const siteAssets = Object.freeze([
        Object.freeze({src: new URL('home_settings_conflict.js?v=1.0.0', document.baseURI).href, integrity: 'sha384-2dLr0r0obVLbc9+OB2t4zQ/93bWr/XN6tUV8fMHwIggYDmjZ6ezKQX91b3CHjNz6', ready: () => root.CoopHomeConflict?.version === '1.0.0'}),
        Object.freeze({src: new URL('site_editor_drafts.js?v=1.1.0', document.baseURI).href, integrity: 'sha384-avf0MN4qCGjirM7RyH6TywwTUqp333nFCV4SsJFyRtaeRmmQKwtJzU7csLBKgFJ+', ready: () => typeof root.SiteEditorDrafts?.create === 'function'}),
        Object.freeze({src: new URL('../shared/home_design.js?v=20261009-3', document.baseURI).href, integrity: 'sha384-w7le8YvS38GKPdQQ6A4Jjp/+Xlqoda5IEU97x+Gwj8gdTOdOh+iXxZuW2ZeO9uDp', ready: () => typeof root.CoopHomeDesign?.normalizeLayout === 'function'}),
        Object.freeze({src: new URL('../shared/site_text_styles.js?v=20261009-17', document.baseURI).href, integrity: 'sha384-QjRL2pjNqVnMgC37LaVoPTXaST81Wrogi/v6nRwDo/zzz0mCX6+YZNAAz6ORU2MH', ready: () => typeof root.CoopTextStyles?.normalize === 'function'}),
        Object.freeze({src: new URL('../shared/participation_image_display.js?v=20261012-2', document.baseURI).href, integrity: 'sha384-BAhSAOuwT81zoUXrZQVqiEgLHCl625ndKclSPUIO9cKHaf9spvIsk1RgPz9Gb04S', ready: () => root.CoopParticipationImages?.version === '1.0.1'}),
        Object.freeze({src: new URL('../shared/activity_photo_viewer.js?v=20261012-1', document.baseURI).href, integrity: 'sha384-EY00pwIUzEP8WOxijMpFaT9V7txklu4gJpDNrnluPaI/JDlyGj/YaR/75McSxkRX', ready: () => root.CoopActivityPhotoViewer?.version === '1.0.0'}),
Object.freeze({src: new URL('admin_member_site.js?v=20261109-editor-continuity-1', document.baseURI).href, integrity: 'sha384-CC5VmE6g8XZZKrngE8+0zCW2k3x+PJK3gzsEHVUTs6UVyOuYwe0TK8wP/gqHB1m/', ready: () => root.AdminMemberSite?.version === '20261109-editor-continuity-1'}),
        Object.freeze({src: new URL('site_legal_samples.js?v=20261008-1', document.baseURI).href, integrity: 'sha384-8En93aFZlH8BEdzebQ4j4kJzZycfI/wI+t+wVTm3KyhVwDb/9SHzDV9cBcC3s2oq', ready: () => !!root.CoopSiteLegalSamples}),
Object.freeze({src: new URL('site_inline_editor.js?v=20261109-editor-continuity-1', document.baseURI).href, integrity: 'sha384-Yl9lGTIdt1RQey+o1WMfhXJ/msbOl91xG5+SHhztqf6i0BmQ5dsjvOT8Z9TUKIha', ready: () => typeof root.CoopSiteInlineHost?.keepSettingsOpen === 'function'}),
        Object.freeze({src: new URL('home_visual_editor.js?v=20261109-editor-continuity-1', document.baseURI).href, integrity: 'sha384-bpdPStSirwm1TAqnrVPh+PcMylqueHHgiOv35kFueGn8e8M1wgQOrkekEvDaZEHv', ready: () => root.CoopHomeVisualEditor?.version === '20261109-editor-continuity-1'}),
        Object.freeze({src: new URL('hero_slides_editor.js?v=1.5.2', document.baseURI).href, integrity: 'sha384-2jkfSGk7lEzSt5aFFs7gjlPdwrNMl8xBPIdiMK1U9+S7q6vybWqqdaEg8ma/fqCJ', ready: () => typeof root.CoopHeroSlides?.mount === 'function'}),
        Object.freeze({src: new URL('home_editor_tools.js?v=20261022-help-2', document.baseURI).href, integrity: 'sha384-GKeyhK4B1lBTcORPn8hDRKE46i7r6wPHl92XpZ3UVmRsq9aNjEzWuPOZ+BnZZH9D', ready: () => root.CoopHomeEditorTools?.version === '1.0.3'}),
        Object.freeze({src: new URL('hero_slides_visual.js?v=2.3.0', document.baseURI).href, integrity: 'sha384-kdrAacTDpQksE8o505Ita3wA16yx8OS876aDkytwejSlqxg6gqhJTHPyw18B4cQi', ready: () => root.CoopHeroVisual?.version === '2.3.0'}),
        Object.freeze({src: new URL('site_legal_editor.js?v=20261028-legal-checkpoint-1', document.baseURI).href, integrity: 'sha384-Gn0xag52N5qBMQzSHnZX03Fjh+hngWiSf5G+ctDV9z6Vvvq5dJep7JmjaOHc6hjQ', ready: () => typeof root.CoopSiteLegalEditor?.refreshPreview === 'function'})
    ]);
    const mediaAssets = Object.freeze([
        Object.freeze({src:new URL("../shared/coop_logo_upload.js?v=1.1.0",document.baseURI).href,integrity:"sha384-1mz6F5A8wyebk32BHR/XFcVhk4r4eC3kq3r0E4whkeou4i83GXaHnwbgci5ud3WK",ready:()=>typeof root.CoopLogoUpload?.saveSelection==='function'}),
        Object.freeze({src:new URL("../shared/coop_favicon_field.js?v=1.0.1",document.baseURI).href,integrity:"sha384-AOj0Mu1FmXPLQf8LZQowTXOCIsE4s6g3PYVKGvWdRqEwMMMB9ORa+sQ1+lUTiwZl",ready:()=>typeof root.CoopFaviconField?.mount==='function'}),
        Object.freeze({src:new URL("../shared/company_seal_upload.js?v=20261009-17",document.baseURI).href,integrity:"sha384-3/E/tRdpidaFjxEd0SRgmXkTpWV9ogIl+rZrhWlkDP3gzZsNhykcXCsSBXUq2Icl",ready:()=>typeof root.CoopCompanySealUpload?.upload==='function'}),
        Object.freeze({src:new URL("approval_rich_editor.js?v=20261009-8",document.baseURI).href,integrity:"sha384-Hw+53noFZEwJ7I0+9hJkfsPUWUamY6O+vTWY4ypC7ffM2Hi+gIYcnoHwV3EmxO+i",ready:()=>typeof root.ApprovalRichEditor?.loadTiptapModules==='function'}),
        Object.freeze({src:new URL("../shared/notice_attachments.js?v=1.0.0",document.baseURI).href,integrity:"sha384-qufMNGIkPv+F0178zTCPgHBx24P7R5gsfCL+a+Ml2+MgcKzifQA/xR/0Ea7BWKp2",ready:()=>typeof root.NoticeAttachments?.parse==='function'})
    ]);
    const certificateAssets = Object.freeze([
        Object.freeze({src:new URL("../shared/certificate_template.js?v=20261101-aspect-1",document.baseURI).href,integrity:"sha384-o1IgJaCzxK2ffcHVr97xCXANJPooOGuauvbg7TCXzfuc2niBP6pvE16S69u4ahdq",ready:()=>typeof root.CoopCertificateTemplate?.previewContribution==='function'}),
        Object.freeze({src:new URL("../cert_generator.js?v=20261101-unified-1",document.baseURI).href,integrity:"sha384-Ux8bDvUcaBN/aiGNiy/tt7UhAIvWN0nSRXVK02oocKoZZQmOfZpPDCWrLMTNCocv",ready:()=>typeof root.generateContributionCert==='function'}),
        Object.freeze({src:new URL("../shared/contribution_cert_preview.js?v=20261101-preparation-1",document.baseURI).href,integrity:"sha384-ehWdqSzooljCvYYnl+zx5t1vnkyhtrCY4zEQJJhKyhn4LpSFJwiXuH121x5D/sVl",ready:()=>typeof root.ContributionCertPreview?.start==='function'}),
        Object.freeze({src:new URL("../shared/member_confirmation.js?v=20261101-preparation-1",document.baseURI).href,integrity:"sha384-nJXE/bM/+Wzg3jFb0o9Y9fu2+Zu72iBYh2AdNuARSCUD0VvQVpT4OSzEUMVKXK3D",ready:()=>typeof root.MemberConfirmation?.open==='function'})
    ]);
    const address = Object.freeze({src:'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'});
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
            if (asset.integrity) { script.integrity = asset.integrity; script.crossOrigin = 'anonymous'; }
            script.async = true;
            script.onload = () => settle(isReady() ? null : new Error(key + '_VERSION_MISMATCH'));
            script.onerror = () => settle(new Error(key + '_LOAD_FAILED'));
            document.head.appendChild(script);
        }).catch(error => { pending.delete(key); throw error; });
        pending.set(key, request);
        return request;
    }
    function ensureSpreadsheet() { return ensureAsset('SPREADSHEET', spreadsheet, ready); }
    function ensureMedia() { return Promise.all(mediaAssets.map((a,i)=>ensureAsset('MEDIA_'+i,a,a.ready))); }
    function ensureCertificatePreview() { return Promise.all(certificateAssets.map((a,i)=>ensureAsset('CERTIFICATE_'+i,a,a.ready))); }
    function ensureAddress() { return ensureAsset('ADDRESS',address,()=>typeof root.daum?.Postcode==='function'); }
    async function ensureCapitalImport() {
        await ensureAsset('CAPITAL_MATCHING',capitalMatching,()=>root.CapitalMemberMatching?.version==='1.0.0');
        await ensureAsset('CAPITAL_IMPORT', capitalImport, () => root.CapitalExcelImport?.version === '1.1.0');
        return root.CapitalExcelImport;
    }
    async function ensureMemberWorkbook() {
        await ensureCapitalImport();
        await ensureAsset('MEMBER_WORKBOOK', memberWorkbook, () => root.MemberCapitalWorkbook?.version === '1.5.5');
        return root.MemberCapitalWorkbook;
    }
    async function ensureMemberExcelEntry() {
        await ensureAsset('MEMBER_EXCEL_ENTRY', memberExcelEntry, () => root.MemberExcelEntry?.version === '1.2.0');
        return root.MemberExcelEntry;
    }
    async function ensureMemberBankImport(){await ensureAsset('MEMBER_BANK_IMPORT',memberBankImport,()=>root.MemberBankImport?.version==='1.2.1');return root.MemberBankImport;}
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
        await Promise.all([ensureMedia(), ...siteAssets.slice(0, 7).map((asset, index) => ensureAsset('SITE_' + index, asset, asset.ready))]);
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
    root.AdminMemberAssets = Object.freeze({ ensureSpreadsheet, ensureMedia, ensureCertificatePreview, ensureAddress, ensureCapitalImport, ensureMemberWorkbook, ensureMemberExcelEntry, ensureMemberBankImport, ensurePdf, ensureDashboard, ensureSite, showBootFailure });
})(window);
