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
        src: new URL('member_capital_workbook_v159.js?v=1.5.9', document.baseURI).href,
        integrity: 'sha384-+XRK5pGKMD9X+kgwspBHEyOprblSZCntfUnasIfcvUkUqNZZOylsNH1/bVwsinMa'
    });
    const memberExcelEntry = Object.freeze({
        src: new URL('member_excel_entry.js?v=1.2.0', document.baseURI).href,
        integrity: 'sha384-PJO+kxqRibZ78yEfhUnZCPK3xljEmYCBZT/W6SJ8KOn+LX4d2qB8R0H45nSioI7e'
    });
    const memberBankImport=Object.freeze({src:new URL('member_bank_import.js?v=1.2.1',document.baseURI).href,integrity:'sha384-Q9wEPSv350stxXcd1FWSDIe8Nk1NyR1pT3Ys//keE4SG4g3vsWLWIOMbWPmrcCWd'});
    const badgeWorkbench=Object.freeze({src:new URL('admin_badge_workbench_v11.js?v=1.1.0',document.baseURI).href,integrity:'sha384-OW8NPuF/R4f5eOKW/7GRqYb6nSVhqPJnusuOs7et29uK3rz1HBlGzZaP3Ns1JQyB'});
    const badgeRuleEditor=Object.freeze({src:new URL('admin_badge_rule_editor_v16.js?v=1.6.0',document.baseURI).href,integrity:'sha384-IQdF0RKGlSPLJR9UMxhICHkzqQaqSeMX9Ft3MSVtPF7HCdHlfVwhZ5kqvy2Ixw0r'});
    const badgeSeriesEditor=Object.freeze({src:new URL('admin_badge_series_group_editor_v130.js?v=1.3.0',document.baseURI).href,integrity:'sha384-ZaITDDty2MWGo4EeH5ErGdBMzT97t3a6M7QB7nnESQCXYG3yVIKWX5nfQnlrx9Mr'});
    const badgeSuggestions=Object.freeze({src:new URL('admin_badge_suggestions_v100.js?v=1.0.0',document.baseURI).href,integrity:'sha384-D8Yb9XVh+9t1u8KSAbL+LLwrpV0O33GyP7m900fkHqxgMDQx/96eralOi3EQrXSI'});
    const referralDetail=Object.freeze({src:new URL('member_referral_detail_v11.js?v=1.1.0',document.baseURI).href,integrity:'sha384-0U/J9MyKkzkbkoDKzddMSkA7u1iNNvwtzebwefjHIb3Lik97fr6/jtiaYXogNvOw'});
    const hcrecReferral=Object.freeze({src:new URL('hcrec_referral_workspace_v14.js?v=1.4.0',document.baseURI).href,
        integrity:'sha384-4YX843PhW6PALENLR9X5US301GA+EyA9U6WEBZmsYIkXRYrge+VsJgCCqYqvlNzg'});
    const siteAssets = Object.freeze([
        Object.freeze({src: new URL('home_settings_conflict.js?v=1.0.0', document.baseURI).href, integrity: 'sha384-2dLr0r0obVLbc9+OB2t4zQ/93bWr/XN6tUV8fMHwIggYDmjZ6ezKQX91b3CHjNz6', ready: () => root.CoopHomeConflict?.version === '1.0.0'}),
        Object.freeze({src: new URL('site_editor_drafts.js?v=1.1.0', document.baseURI).href, integrity: 'sha384-avf0MN4qCGjirM7RyH6TywwTUqp333nFCV4SsJFyRtaeRmmQKwtJzU7csLBKgFJ+', ready: () => typeof root.SiteEditorDrafts?.create === 'function'}),
        Object.freeze({src: new URL('../shared/home_design.js?v=20261009-3', document.baseURI).href, integrity: 'sha384-w7le8YvS38GKPdQQ6A4Jjp/+Xlqoda5IEU97x+Gwj8gdTOdOh+iXxZuW2ZeO9uDp', ready: () => typeof root.CoopHomeDesign?.normalizeLayout === 'function'}),
        Object.freeze({src: new URL('../shared/site_text_styles.js?v=20261009-17', document.baseURI).href, integrity: 'sha384-QjRL2pjNqVnMgC37LaVoPTXaST81Wrogi/v6nRwDo/zzz0mCX6+YZNAAz6ORU2MH', ready: () => typeof root.CoopTextStyles?.normalize === 'function'}),
        Object.freeze({src: new URL('../shared/participation_image_display.js?v=20261012-2', document.baseURI).href, integrity: 'sha384-BAhSAOuwT81zoUXrZQVqiEgLHCl625ndKclSPUIO9cKHaf9spvIsk1RgPz9Gb04S', ready: () => root.CoopParticipationImages?.version === '1.0.1'}),
        Object.freeze({src: new URL('../shared/activity_photo_viewer.js?v=20261012-1', document.baseURI).href, integrity: 'sha384-EY00pwIUzEP8WOxijMpFaT9V7txklu4gJpDNrnluPaI/JDlyGj/YaR/75McSxkRX', ready: () => root.CoopActivityPhotoViewer?.version === '1.0.0'}),
        Object.freeze({src: new URL('../shared/about_design_layout_v3.js', document.baseURI).href, integrity:'sha384-/ibLjeRjKy7IZLh5Wkoi03D9PHAPf98vs46Lqx/8RELnN6yR1E1pn4RuI8Pklqq/', ready:()=>root.CoopAboutDesign?.version==='3.0.0'}),
        Object.freeze({src: new URL('about_design_editor_v3.js', document.baseURI).href, integrity:'sha384-miYKx9PJqwDzjbUGGIc3GUcuGIiS973dtjbZWWocojiquPll5SGCQYtn7CwqNzDH', ready:()=>root.CoopAboutDesignEditor?.version==='3.0.0'}),
        Object.freeze({src: new URL('admin_member_site_v3.js', document.baseURI).href, integrity: 'sha384-b1bKX/y5BEfxT4TgERevjX7dd4eZF8B5wdB7wayP4AGFx66JtFDwydrKQEng7lUn', ready: () => root.AdminMemberSite?.version === '20261125-about-layout-2'}),
        Object.freeze({src: new URL('site_legal_samples.js?v=20261008-1', document.baseURI).href, integrity: 'sha384-8En93aFZlH8BEdzebQ4j4kJzZycfI/wI+t+wVTm3KyhVwDb/9SHzDV9cBcC3s2oq', ready: () => !!root.CoopSiteLegalSamples}),
Object.freeze({src: new URL('site_inline_editor.js?v=20261120-inline-ai-1', document.baseURI).href, integrity: 'sha384-rHIPNCeXD6Vub0UhXGcfN77HnudKIZwxByogRTeyUzTS0UDbE+qa00uNNMOkmx1a', ready: () => typeof root.CoopSiteInlineHost?.startAboutField === 'function'}),
        Object.freeze({src: new URL('home_visual_editor.js?v=20261109-photo-intent-1', document.baseURI).href, integrity: 'sha384-RLXZwSudg4gNJIRkbaG6XPQ9PDI8z89Dx4rk37P/l8wtsl0Fxgl5vKn2LfDY/Il1', ready: () => root.CoopHomeVisualEditor?.version === '20261109-photo-intent-1'}),
        Object.freeze({src: new URL('hero_slides_editor.js?v=1.5.3', document.baseURI).href, integrity: 'sha384-t+IG1KlF1kRcvXRJA8svWoUkloWPqMP8xnpDnp4vyHV1nt14PhhIEkvbPUNupz6X', ready: () => typeof root.CoopHeroSlides?.mount === 'function'}),
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
        Object.freeze({src:new URL("../shared/certificate_template_v1_4.js",document.baseURI).href,integrity:"sha384-DLwS+eif/ZQnZGWHRE/3nrMFdh95ueJFAFPKK0Jwmy4o6g9J0SAIfdiDoPtr4BE/",ready:()=>root.CoopCertificateTemplate?.version==='1.4.0'}),
        Object.freeze({src:new URL("../cert_generator_print_v2.js",document.baseURI).href,integrity:"sha384-gkrKKIJ/NAACYBWbUOsLowl64dTt5QROXuexTr8XQm3Dn5zEPtquOh9q004B2GNU",ready:()=>typeof root.generateContributionCert==='function'}),
        Object.freeze({src:new URL("../shared/contribution_cert_preview_v1_4.js",document.baseURI).href,integrity:"sha384-X/C5ik7JW9c6jRFFqO1QkP4lVN7MIFzgZWnElaxDYUjWPIw0Ttfd/CwxNKYdzZl4",ready:()=>typeof root.ContributionCertPreview?.start==='function'}),
        Object.freeze({src:new URL("../shared/member_confirmation.js?v=20261101-preparation-1",document.baseURI).href,integrity:"sha384-nJXE/bM/+Wzg3jFb0o9Y9fu2+Zu72iBYh2AdNuARSCUD0VvQVpT4OSzEUMVKXK3D",ready:()=>typeof root.MemberConfirmation?.open==='function'})
    ]);
    const address = Object.freeze({src:'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'});
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
    const media = i => ensureAsset('MEDIA_'+i,mediaAssets[i],mediaAssets[i].ready);
    const ensureBranding = () => Promise.all([0,1,2].map(media));
    const ensureRichEditor = () => media(3);
    const ensureNoticeTools = () => Promise.all([media(3),media(4)]);
    const ensureActivityPhotoViewer = () => ensureAsset('SITE_5',siteAssets[5],siteAssets[5].ready);
    function ensureCertificatePreview() { return Promise.all(certificateAssets.map((a,i)=>ensureAsset('CERTIFICATE_'+i,a,a.ready))); }
    function ensureAddress() { return ensureAsset('ADDRESS',address,()=>typeof root.daum?.Postcode==='function'); }
    async function ensureCapitalImport() {
        await ensureAsset('CAPITAL_MATCHING',capitalMatching,()=>root.CapitalMemberMatching?.version==='1.0.0');
        await ensureAsset('CAPITAL_IMPORT', capitalImport, () => root.CapitalExcelImport?.version === '1.1.0');
        return root.CapitalExcelImport;
    }
    async function ensureMemberWorkbook() {
        await ensureCapitalImport();
        await ensureAsset('MEMBER_WORKBOOK', memberWorkbook, () => root.MemberCapitalWorkbook?.version === '1.5.9');
        return root.MemberCapitalWorkbook;
    }
    async function ensureMemberExcelEntry() {
        await ensureAsset('MEMBER_EXCEL_ENTRY', memberExcelEntry, () => root.MemberExcelEntry?.version === '1.2.0');
        return root.MemberExcelEntry;
    }
    async function ensureMemberBankImport(){await ensureAsset('MEMBER_BANK_IMPORT',memberBankImport,()=>root.MemberBankImport?.version==='1.2.1');return root.MemberBankImport;}
    async function ensureBadgeWorkbench(){await ensureAsset('BADGE_WORKBENCH',badgeWorkbench,()=>root.AdminBadgeWorkbench?.version==='1.1.0');return root.AdminBadgeWorkbench;}
    async function ensureBadgeRuleEditor(){await ensureAsset('BADGE_RULE_EDITOR',badgeRuleEditor,()=>root.AdminBadgeRuleEditor?.version==='1.6.0');return root.AdminBadgeRuleEditor;}
    async function ensureBadgeSuggestions(){await ensureAsset('BADGE_SUGGESTIONS',badgeSuggestions,()=>root.AdminBadgeSuggestions?.version==='1.0.0');return root.AdminBadgeSuggestions;}
    async function ensureBadgeSeriesEditor(){await ensureAsset('BADGE_SERIES_EDITOR',badgeSeriesEditor,()=>root.AdminBadgeSeriesGroupEditor?.version==='1.3.0');return root.AdminBadgeSeriesGroupEditor;}
    async function ensureMemberReferralDetail(){await ensureAsset('MEMBER_REFERRAL_DETAIL',referralDetail,()=>root.MemberReferralDetail?.version==='1.1.0');return root.MemberReferralDetail;}
    function ensurePdf() {
        return ensureAsset('PDF', pdf, () => root.jspdf?.jsPDF?.version === '2.5.1');
    }
    async function ensureHcrecReferralWorkspace(){
        await ensureAsset('HCREC_REFERRAL_WORKSPACE',hcrecReferral,()=>root.HcrecReferralWorkspace?.version==='1.4.0');
        return root.HcrecReferralWorkspace;
    }
    async function ensureHwaseongActivityPoints(){
        await ensureAsset('HWASEONG_ACTIVITY_POINTS',{src:new URL('../shared/activity_points_v4.js',document.baseURI).href,
            integrity:'sha384-5FuBx//57QPFfgT7UJzLRhjPeAnfkOhLnIDfr+1eefrz5DLcrxzKbnUqqnVbyvkb'},()=>root.HwaseongActivityPoints?.version==='4.0.0');
        return root.HwaseongActivityPoints;
    }
    async function ensurePointsQr(){
        await ensureAsset('POINTS_QR',{
            src:'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
            integrity:'sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA=='
        },()=>typeof root.QRCode==='function'&&!!root.QRCode.CorrectLevel);
        return root.QRCode;
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
        await Promise.all(siteAssets.slice(0, 7).map((asset, index) => index===5?null:ensureAsset('SITE_' + index, asset, asset.ready)));
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
    root.AdminMemberAssets = Object.freeze({ ensureSpreadsheet, ensureBranding, ensureRichEditor, ensureNoticeTools, ensureActivityPhotoViewer, ensureCertificatePreview, ensureAddress, ensureCapitalImport, ensureMemberWorkbook, ensureMemberExcelEntry, ensureMemberBankImport, ensureBadgeWorkbench, ensureBadgeRuleEditor, ensureBadgeSeriesEditor, ensureBadgeSuggestions, ensureMemberReferralDetail, ensureHcrecReferralWorkspace, ensureHwaseongActivityPoints, ensurePointsQr, ensurePdf, ensureDashboard, ensureSite, showBootFailure });
})(window);
