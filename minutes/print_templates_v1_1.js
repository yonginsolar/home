/* 1.1.0 · 회의·공문 공식 기록물 출력 서식 (포레스트·슬레이트, A4·흑백 판독 기준). */
(function(root){'use strict';
 function create({allOfficials=[],MinutesService}={}){
 const KST_TZ_MINUTES_ADMIN='Asia/Seoul',APPROVAL_NOTICE_MEMO_START='[[APPROVAL_NOTE]]',APPROVAL_NOTICE_MEMO_END='[[/APPROVAL_NOTE]]';
 let noticeCompanyInfo=null,noticeSealUrl=null;const noticeDrafterPositionMap=new Map();
const formatMinutesAdminKstDate = (value, fallback = '-') => {
            if (!value) return fallback;
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return fallback;
            return d.toLocaleDateString('ko-KR', { timeZone: KST_TZ_MINUTES_ADMIN });
        };
const formatMinutesAdminKstDateTime = (value, fallback = '-') => {
            if (!value) return fallback;
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return fallback;
            return d.toLocaleString('ko-KR', {
                timeZone: KST_TZ_MINUTES_ADMIN,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        };
const getDocTypeLabel = (docType) => {
            if (docType === 'NOTICE') return '공지';
            if (docType === 'ASSEMBLY_MATERIAL') return '총회 자료';
            if (docType === 'GENERAL_ASSEMBLY') return '총회 의사록';
            if (docType === 'PAST_MINUTES') return '지난 의사록';
            if (docType === 'AUDIT_REPORT') return '감사보고서';
            return '의사록';
        };
const getDocTypeEnglish = (docType) => {
            if (docType === 'GENERAL_ASSEMBLY') return 'GENERAL ASSEMBLY MINUTES';
            if (docType === 'AUDIT_REPORT') return 'AUDIT REPORT';
            if (docType === 'ASSEMBLY_MATERIAL') return 'GENERAL ASSEMBLY MATERIALS';
            return 'BOARD MEETING MINUTES';
        };
function escapeHtml(value) {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

function safeUrl(value, { allowDataImage = false } = {}) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^(mailto:|tel:)/i.test(raw)) return raw;
            if (allowDataImage && /^data:image\//i.test(raw)) return raw;
            try {
                const url = new URL(raw, window.location.origin);
                if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
            } catch (e) {}
            return '';
        }

function sanitizeStyle(styleText) {
            const raw = String(styleText || '');
            if (!raw) return '';
            if (/expression\s*\(/i.test(raw)) return '';
            if (/javascript:/i.test(raw)) return '';
            return raw.replace(/url\s*\(/gi, '');
        }

function sanitizeHtml(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(String(html || ''), 'text/html');
            const allowedTags = new Set([
                'A','B','BR','BLOCKQUOTE','DIV','EM','H1','H2','H3','H4','H5','H6',
                'HR','I','IMG','LI','OL','P','SPAN','STRONG','TABLE','TBODY','TD',
                'TH','THEAD','TR','U','UL'
            ]);
            const blockedTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META']);
            const allowedAttrs = {
                '*': new Set(['class','style']),
                'A': new Set(['href','target','rel','title','class','style']),
                'IMG': new Set(['src','alt','title','width','height','class','style']),
                'TABLE': new Set(['class','style','border','cellpadding','cellspacing']),
                'TD': new Set(['class','style','colspan','rowspan','align']),
                'TH': new Set(['class','style','colspan','rowspan','align'])
            };

            const isSafeUrl = (value, allowDataImage = false) => {
                const raw = String(value || '').trim();
                if (!raw) return null;
                if (/^(mailto:|tel:)/i.test(raw)) return raw;
                if (allowDataImage && /^data:image\//i.test(raw)) return raw;
                try {
                    const u = new URL(raw, window.location.origin);
                    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
                } catch (e) {}
                return null;
            };

            const nodes = Array.from(doc.body.querySelectorAll('*'));
            nodes.forEach(node => {
                const tag = node.tagName;
                if (!allowedTags.has(tag)) {
                    if (blockedTags.has(tag)) {
                        node.remove();
                        return;
                    }
                    const parent = node.parentNode;
                    if (!parent) return;
                    while (node.firstChild) parent.insertBefore(node.firstChild, node);
                    parent.removeChild(node);
                    return;
                }

                Array.from(node.attributes).forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value;
                    if (name.startsWith('on')) {
                        node.removeAttribute(attr.name);
                        return;
                    }
                    const allowSet = allowedAttrs[tag] || allowedAttrs['*'];
                    if (allowSet && !allowSet.has(name) && !(allowedAttrs['*'] && allowedAttrs['*'].has(name))) {
                        node.removeAttribute(attr.name);
                        return;
                    }
                    if (name === 'href') {
                        const safe = isSafeUrl(value, false);
                        if (!safe) node.removeAttribute('href');
                        else node.setAttribute('href', safe);
                    }
                    if (name === 'src') {
                        const safe = isSafeUrl(value, tag === 'IMG');
                        if (!safe) node.removeAttribute('src');
                        else node.setAttribute('src', safe);
                    }
                    if (name === 'style') {
                        const safeStyle = sanitizeStyle(value);
                        if (safeStyle) node.setAttribute('style', safeStyle);
                        else node.removeAttribute('style');
                    }
                    if (name === 'target' && node.tagName === 'A') {
                        if (node.getAttribute('target') === '_blank') {
                            node.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                });
            });
            return doc.body.innerHTML;
        }

function normalizeMinuteContent(rawValue) {
            const raw = String(rawValue || '');
            const trimmed = raw.trim();
            if (!trimmed) return '';
            const hasHtmlTag = /<\s*\/?\s*[a-zA-Z][^>]*>/.test(trimmed);
            if (hasHtmlTag) return trimmed;
            return escapeHtml(trimmed).replace(/\n/g, '<br>');
        }

function splitNoticeApprovalContent(rawContent) {
            const raw = String(rawContent || '');
            const startIdx = raw.indexOf(APPROVAL_NOTICE_MEMO_START);
            const endIdx = startIdx >= 0 ? raw.indexOf(APPROVAL_NOTICE_MEMO_END, startIdx + APPROVAL_NOTICE_MEMO_START.length) : -1;
            if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
                return { publicBody: raw.trim() };
            }
            const head = raw.slice(0, startIdx).trim();
            const tail = raw.slice(endIdx + APPROVAL_NOTICE_MEMO_END.length).trim();
            return { publicBody: [head, tail].filter(Boolean).join('\n\n').trim() };
        }

function buildNoticeContentFromApproval(doc) {
            const parsed = splitNoticeApprovalContent(doc?.content || '');
            const lines = [];
            if (doc?.doc_no) lines.push(`문서번호: ${doc.doc_no}`);
            if (doc?.receiver) lines.push(`수신: ${doc.receiver}`);
            if (doc?.via) lines.push(`경유: ${doc.via}`);
            if (doc?.title) lines.push(`제목: ${doc.title}`);
            lines.push('');
            if (parsed.publicBody) lines.push(parsed.publicBody);
            return lines.join('\n');
        }

async function loadNoticeCompanyInfo() {
            if (noticeCompanyInfo) return noticeCompanyInfo;
            if (!MinutesService?.getCompanyInfo) return {};
            const { data } = await MinutesService.getCompanyInfo();
            noticeCompanyInfo = data || {};
            return noticeCompanyInfo;
        }

async function loadNoticeSealUrl() {
            if (noticeSealUrl !== null) return noticeSealUrl || '';
            if (!MinutesService?.getOfficialSealUrl) return '';
            const sealUrl = await MinutesService.getOfficialSealUrl();
            noticeSealUrl = sealUrl || '';
            return noticeSealUrl;
        }

function parseNoticeContent(content) {
            const raw = splitNoticeApprovalContent(content).publicBody;
            const lines = raw.split(/\r?\n/);
            const meta = { docNo: '', receiver: '', via: '', title: '', bodyLines: [] };
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!meta.docNo && trimmed.startsWith('문서번호:')) {
                    meta.docNo = trimmed.replace('문서번호:', '').trim();
                    return;
                }
                if (!meta.receiver && trimmed.startsWith('수신:')) {
                    meta.receiver = trimmed.replace('수신:', '').trim();
                    return;
                }
                if (!meta.via && trimmed.startsWith('경유:')) {
                    meta.via = trimmed.replace('경유:', '').trim();
                    return;
                }
                if (!meta.title && trimmed.startsWith('제목:')) {
                    meta.title = trimmed.replace('제목:', '').trim();
                    return;
                }
                meta.bodyLines.push(line);
            });
            return meta;
        }

function formatKoreanDate(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            if (Number.isNaN(d.getTime())) return '';
            return new Intl.DateTimeFormat('ko-KR', {
                timeZone: KST_TZ_MINUTES_ADMIN,
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(d);
        }

async function loadNoticeDrafterPosition(empId) {
            const safeEmpId = String(empId || '').trim();
            if (!safeEmpId || !MinutesService?.getEmployeePositionByEmpId) return '';
            if (noticeDrafterPositionMap.has(safeEmpId)) return noticeDrafterPositionMap.get(safeEmpId) || '';
            const { data } = await MinutesService.getEmployeePositionByEmpId(safeEmpId);
            const safePosition = String(data || '').trim();
            noticeDrafterPositionMap.set(safeEmpId, safePosition);
            return safePosition;
        }

async function buildNoticeTemplateHtml(approval, notice) {
            const info = await loadNoticeCompanyInfo();
            const orgNameRaw = String(info?.orgName || info?.company_name || '').trim();
            const rawContent = notice?.content || buildNoticeContentFromApproval(approval || {});
            const parsed = parseNoticeContent(rawContent);
            const docNo = approval?.doc_no || notice?.doc_no || parsed.docNo || '';
            const receiver = approval?.receiver || parsed.receiver || '-';
            const viaRaw = String(approval?.via || parsed.via || '').trim();
            const via = viaRaw || '-';
            const title = notice?.title || approval?.title || parsed.title || '공문';
            const approvalBody = splitNoticeApprovalContent(approval?.content || '').publicBody;
            const body = parsed.bodyLines.join('\n').trim() || approvalBody || '';
            const normalizedBody = normalizeMinuteContent(body);
            const safeBodyHtml = normalizedBody ? sanitizeHtml(normalizedBody) : '-';
            const dateValue = approval?.processed_at || approval?.created_at || notice?.created_at;
            const dateLabel = formatKoreanDate(dateValue);

            return `
                <div class="official-notice-doc" data-doc-no="${escapeHtml(docNo)}" data-date-label="${escapeHtml(dateLabel)}">
                    ${orgNameRaw ? `
                    <header class="official-notice-org-head">
                        <div class="official-notice-en">OFFICIAL NOTICE</div>
                        <div class="official-notice-org-name">${escapeHtml(orgNameRaw)}</div>
                    </header>
                    ` : ''}
                    <section class="official-notice-routing" aria-label="수신·경유·제목">
                        <div class="official-notice-row">
                            <span class="official-notice-key">수&nbsp;&nbsp;&nbsp;&nbsp;신</span>
                            <span class="official-notice-val">${escapeHtml(receiver)}</span>
                        </div>
                        <div class="official-notice-row">
                            <span class="official-notice-key">경&nbsp;&nbsp;&nbsp;&nbsp;유</span>
                            <span class="official-notice-val is-muted">${escapeHtml(via)}</span>
                        </div>
                        <div class="official-notice-row official-notice-row--title">
                            <span class="official-notice-key">제&nbsp;&nbsp;&nbsp;&nbsp;목</span>
                            <span class="official-notice-val official-notice-subject">${escapeHtml(title)}</span>
                        </div>
                    </section>
                    <div class="official-notice-body">${safeBodyHtml}</div>
                </div>
            `;
        }

async function buildNoticePrintApprovalEntries(approval) {
            const entries = [];
            const drafterName = String(approval?.drafter_name || '').trim();
            const drafterPosition = await loadNoticeDrafterPosition(approval?.drafter_id);
            if (drafterName) {
                entries.push({
                    role: drafterPosition || '담당',
                    name: drafterName,
                    action: '기안',
                    time: formatMinutesAdminKstDateTime(approval?.created_at, '-')
                });
            }

            const approvalLine = Array.isArray(approval?.approval_line) ? approval.approval_line : [];
            approvalLine.forEach((step) => {
                const rawName = String(step?.name || '').trim();
                if (!rawName) return;
                const position = String(step?.position || '').trim();
                const actionLabel = step?.stage === 'review' ? '검토' : '결재';
                entries.push({
                    role: position || actionLabel,
                    name: rawName,
                    action: actionLabel,
                    time: formatMinutesAdminKstDateTime(step?.processed_at, '-')
                });
            });

            return entries;
        }

async function buildNoticePrintFooterHtml(approval, notice = null) {
            const info = await loadNoticeCompanyInfo();
            const sealUrl = await loadNoticeSealUrl();
            const orgNameRaw = info?.orgName || info?.company_name || '조합명 확인 필요';
            const chairmanRaw = info?.chairman_name || info?.ceoName || '대표자 확인 필요';
            const zipCodeRaw = info?.zip_code || '';
            const addressRaw = info?.address || '';
            const homepageRaw = info?.homepage || '';
            const emailRaw = info?.email || '';
            const phoneRaw = info?.phone || '';
            const orgName = escapeHtml(orgNameRaw);
            const chairman = escapeHtml(chairmanRaw || '대표자 확인 필요');
            const signLeaderText = chairmanRaw && chairmanRaw !== '대표자 확인 필요'
                ? `이사장 ${chairman}`
                : chairman;
            const zipCode = escapeHtml(zipCodeRaw || '').trim();
            const address = escapeHtml(addressRaw || '').trim();
            const homepage = escapeHtml(homepageRaw || '').trim();
            const email = escapeHtml(emailRaw || '').trim();
            const phone = escapeHtml(phoneRaw || '').trim();
            const rawContent = notice?.content || buildNoticeContentFromApproval(approval || {});
            const parsed = parseNoticeContent(rawContent);
            const docNo = String(approval?.doc_no || notice?.doc_no || parsed.docNo || '').trim();
            const dateValue = approval?.processed_at || approval?.created_at || notice?.created_at;
            const dateLabel = formatKoreanDate(dateValue);

            const sealSafe = safeUrl(sealUrl, { allowDataImage: true });
            const sealHtml = sealSafe
                ? `<img src="${sealSafe}" alt="조합 직인" class="print-foot-seal">`
                : '';
            const approvalEntries = await buildNoticePrintApprovalEntries(approval);
            const approvalItemsHtml = approvalEntries.map((entry) => `
                <div class="print-foot-approval-item">
                    <span class="print-foot-approval-role">${escapeHtml(entry.role)}</span>
                    <strong class="print-foot-approval-name">${escapeHtml(entry.name)}</strong>
                    <span class="print-foot-approval-meta">(${escapeHtml(entry.action)} ${escapeHtml(entry.time)})</span>
                </div>
            `).join('');

            const dispatchLineLeft = docNo
                ? `<strong>시행</strong>&nbsp; ${escapeHtml(docNo)}${dateLabel ? ` (${escapeHtml(dateLabel)})` : ''}`
                : (dateLabel ? `<strong>발신일</strong>&nbsp; ${escapeHtml(dateLabel)}` : '');
            const addressParts = [zipCode ? `우 ${zipCode}` : '', address, homepage].filter(Boolean);
            const contactParts = [phone ? `전화 ${phone}` : '', email ? `이메일 ${email}` : ''].filter(Boolean);

            return `
                <div class="print-foot-sign">
                    <span class="print-foot-sign-text">${orgName} ${signLeaderText}</span>
                    ${sealHtml}
                </div>
                ${approvalItemsHtml ? `<div class="print-foot-approvals">${approvalItemsHtml}</div>` : '<div class="print-foot-divider"></div>'}
                <div class="print-foot-admin-meta">
                    ${dispatchLineLeft ? `<div class="print-foot-dispatch-row"><span>${dispatchLineLeft}</span><span><strong>접수</strong>&nbsp; (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></div>` : ''}
                    ${addressParts.length ? `<div class="print-foot-meta-line">${addressParts.join(' &nbsp;/&nbsp; ')}</div>` : ''}
                    ${contactParts.length ? `<div class="print-foot-meta-line">${contactParts.join(' &nbsp;/&nbsp; ')}</div>` : ''}
                </div>
            `;
        }

function buildPrintableNoticeHtml(title, noticeHtml, footerHtml, filename = '') {
            const safeTitle = escapeHtml(title || '공문');
            const safeFilename = escapeHtml(filename || title || '공문');
            const hasStructuredNotice = String(noticeHtml || '').includes('official-notice-doc');
            const printedAtLabel = escapeHtml(formatMinutesAdminKstDateTime(new Date().toISOString()));
            return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${safeFilename}</title>
    <style>
        @page { size: A4 portrait; margin: 15mm 15mm 16mm 15mm; }
        * { box-sizing: border-box; }
        html, body { width: auto; height: auto; margin: 0; padding: 0; }
        body {
            --ink: #1b4d3e;
            --accent: #6b7c73;
            --tint: #f4f7f5;
            --line: #8a9a91;
            --muted: #52635a;
            font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
            color: #16221c;
            background: #ffffff;
            font-size: 10.5pt;
            line-height: 1.72;
            word-break: keep-all;
            overflow-wrap: break-word;
        }
        .print-shell {
            min-height: 264mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        /* Legacy fallback header when noticePage is called with raw HTML */
        .print-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 12px;
            margin-bottom: 5mm;
            padding-bottom: 3mm;
            border-bottom: 0.55mm solid var(--ink);
        }
        .print-head-title { font-size: 18pt; font-weight: 800; color: var(--ink); line-height: 1.25; }
        .print-head-meta { font-size: 8.8pt; color: var(--muted); text-align: right; white-space: nowrap; }
        /* Official Administrative Notice Structure (No Outer Box Frame) */
        .official-notice-org-head {
            text-align: center;
            padding-bottom: 3.6mm;
            border-bottom: 0.6mm solid var(--ink);
        }
        .official-notice-en {
            font-size: 8pt;
            font-weight: 650;
            letter-spacing: 0.16em;
            color: var(--muted);
        }
        .official-notice-org-name {
            margin-top: 1mm;
            font-size: 19pt;
            font-weight: 800;
            letter-spacing: 0.05em;
            color: var(--ink);
            line-height: 1.22;
        }
        .official-notice-routing {
            margin-top: 3.5mm;
            padding-bottom: 2.8mm;
            border-bottom: 0.42mm solid var(--ink);
            font-size: 10.5pt;
            line-height: 1.5;
        }
        .official-notice-row {
            display: flex;
            align-items: baseline;
            gap: 3mm;
            padding: 1mm 0;
        }
        .official-notice-row--title {
            margin-top: 1mm;
            padding-top: 2mm;
            border-top: 0.24mm solid var(--line);
        }
        .official-notice-key {
            flex: 0 0 22mm;
            width: 22mm;
            font-weight: 750;
            color: var(--ink);
            white-space: nowrap;
        }
        .official-notice-val {
            flex: 1 1 auto;
            min-width: 0;
            color: #16221c;
        }
        .official-notice-val.is-muted { color: #475569; }
        .official-notice-subject { font-weight: 750; font-size: 11.2pt; color: #0f1914; }
        .official-notice-body {
            margin-top: 6.5mm;
            font-size: 10.6pt;
            line-height: 1.78;
            color: #16221c;
        }
        .print-notice-wrap, .print-notice-wrap * { max-width: 100%; }
        .print-notice-wrap img { max-width: 100% !important; height: auto !important; }
        .print-notice-wrap table { width: 100% !important; border-collapse: collapse; table-layout: fixed; margin: 3mm 0; }
        .print-notice-wrap th, .print-notice-wrap td { border: 0.24mm solid var(--line); padding: 1.8mm 2.2mm; word-break: keep-all; overflow-wrap: break-word; }
        .print-foot { margin-top: 10mm; color: #16221c; break-inside: avoid; page-break-inside: avoid; }
        .print-foot-sign {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 3.5mm;
            text-align: center;
            font-size: 15.5pt;
            font-weight: 800;
            letter-spacing: 0.04em;
            color: #111827;
            margin-bottom: 6mm;
        }
        .print-foot-sign-text { word-break: keep-all; line-height: 1.28; }
        .print-foot-seal { width: 21mm; height: 21mm; flex: 0 0 21mm; object-fit: contain; }
        .print-foot-approvals {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 2mm 5mm;
            padding: 2.2mm 0;
            border-top: 0.45mm solid var(--ink);
            border-bottom: 0.24mm solid var(--line);
            font-size: 9.2pt;
        }
        .print-foot-approval-item { display: inline-flex; align-items: baseline; gap: 1.4mm; min-width: 0; }
        .print-foot-approval-role { color: var(--ink); font-weight: 700; }
        .print-foot-approval-name { color: #111827; font-weight: 750; }
        .print-foot-approval-meta { color: var(--muted); font-size: 8.3pt; font-variant-numeric: tabular-nums; }
        .print-foot-divider { margin: 3mm 0; border-top: 0.45mm solid var(--ink); }
        .print-foot-admin-meta {
            padding-top: 2.2mm;
            font-size: 8.8pt;
            line-height: 1.5;
            color: #374151;
        }
        .print-foot-dispatch-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 4mm;
            margin-bottom: 0.8mm;
            color: #16221c;
        }
        .print-foot-meta-line { color: var(--muted); }
        /* Backward-compat classes if legacy footerHtml is passed */
        .print-foot-contact-grid { display: grid; grid-template-columns: 0.9fr 2.2fr 1.3fr; gap: 10px; align-items: center; margin-top: 4px; font-size: 9pt; }
        .print-foot-row-divider { margin: 4px 0; border-top: 0.24mm solid var(--line); }
        .print-foot-contact-split { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; font-size: 9pt; }
        @media print {
            html, body { margin: 0; padding: 0; }
            .official-notice-org-head, .official-notice-routing, .print-foot { break-inside: avoid; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="print-shell">
        <div>
            ${hasStructuredNotice ? '' : `<div class="print-head"><div class="print-head-title">${safeTitle}</div><div class="print-head-meta">출력 ${printedAtLabel}</div></div>`}
            <div class="print-notice-wrap">${noticeHtml || '<div>내용이 없습니다.</div>'}</div>
        </div>
        <div class="print-foot">${footerHtml || ''}</div>
    </div>
</body>
</html>`;
        }

function getRoleLabel(off) {
            return (off.role || off.position || off.category || '').trim();
        }

function escapeRegExp(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

function isDirectorRole(off) {
            const label = getRoleLabel(off);
            if (!label) return false;
            return label.includes('이사장') || label === '이사';
        }

function sortDirectorOrder(list) {
            const chairman = list.filter(o => getRoleLabel(o).includes('이사장'));
            const directors = list.filter(o => getRoleLabel(o) === '이사');
            directors.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
            return [...chairman, ...directors];
        }

function sortDelegateOrder(list) {
            const safeList = Array.isArray(list) ? list : [];
            const getName = (off) => String(off?.name || off?.coop_members?.name || '').trim();
            const compareNameKo = (a, b) => getName(a).localeCompare(getName(b), 'ko');

            const chairs = safeList.filter(isGeneralAssemblyChairperson).sort(compareNameKo);
            const others = safeList.filter(o => !isGeneralAssemblyChairperson(o)).sort(compareNameKo);
            return [...chairs, ...others];
        }

function isGeneralAssemblyChairperson(off) {
            const role = getRoleLabel(off);
            if (role.includes('이사장') || role.includes('의장')) return true;
            const memberId = String(off?.member_id || '').trim();
            if (!memberId) return false;
            return (Array.isArray(allOfficials) ? allOfficials : []).some((candidate) => {
                if (String(candidate?.member_id || '').trim() !== memberId) return false;
                const candidateRole = getRoleLabel(candidate);
                return candidateRole.includes('이사장') || candidateRole.includes('의장');
            });
        }

function getMinuteCertificateRoleLabel(minute, off) {
            if (!minute) return getRoleLabel(off) || '-';
            if (minute.doc_type === 'GENERAL_ASSEMBLY') {
                return isGeneralAssemblyChairperson(off) ? '의장' : '대의원';
            }
            return getRoleLabel(off) || '-';
        }

function getSignerPoolByDocType(docType) {
            const officials = Array.isArray(allOfficials) ? allOfficials : [];
            if (docType === 'GENERAL_ASSEMBLY') {
                return sortDelegateOrder(officials.filter(o => String(o.category || '').toLowerCase() === 'delegate'));
            }
            if (docType === 'MINUTES') {
                return sortDirectorOrder(officials.filter(isDirectorRole));
            }
            return officials;
        }

function getRequiredSignerIds(minute) {
            if (!minute || !minute.requires_sign) return [];

            if (Array.isArray(minute.signer_ids) && minute.signer_ids.length > 0) {
                return minute.signer_ids.map(id => String(id));
            }
            return getSignerPoolByDocType(minute.doc_type).map(o => String(o.id));
        }

function isMinuteSignatureFullyCompleted(minute, signatures) {
            if (!minute || !minute.requires_sign || minute.doc_type === 'NOTICE') return false;
            const requiredIds = getRequiredSignerIds(minute);
            if (!requiredIds.length) return false;
            const sigSet = new Set((Array.isArray(signatures) ? signatures : []).map((row) => String(row.official_id)));
            return requiredIds.every((id) => sigSet.has(String(id)));
        }

async function buildMinuteSignaturePrintHtml(minute, signatures) {
            if (!minute || !minute.requires_sign || minute.doc_type === 'NOTICE') return '';

            const requiredIds = getRequiredSignerIds(minute);
            if (requiredIds.length === 0) return '';

            const sigRows = Array.isArray(signatures) ? signatures : [];
            const sigMap = new Map(sigRows.map(row => [String(row.official_id), row]));
            const items = await Promise.all(requiredIds.map(async (id) => {
                const off = (allOfficials || []).find(o => String(o.id) === String(id));
                const safeName = escapeHtml(off?.name || '임원');
                const safeRole = escapeHtml(getRoleLabel(off) || '');
                const sig = sigMap.get(String(id));
                const isSigned = !!sig;

                let imgHtml = '<span class="minute-sig-slot-empty">서명란</span>';
                if (sig?.signature_url) {
                    const signedUrl = safeUrl(await resolveSignatureUrl(sig.signature_url), { allowDataImage: true });
                    if (signedUrl) {
                        imgHtml = `<img src="${signedUrl}" alt="서명" class="minute-sig-slot-img">`;
                    }
                }

                return `
                    <div class="minute-sig-item">
                        <div class="minute-sig-who">
                            ${safeRole ? `<span class="minute-sig-role">${safeRole}</span>` : ''}
                            <strong class="minute-sig-name">${safeName}</strong>
                            <span class="minute-sig-state${isSigned ? ' is-done' : ''}">${isSigned ? '서명 완료' : '미서명'}</span>
                        </div>
                        <div class="minute-sig-box">${imgHtml}</div>
                    </div>
                `;
            }));

            return `
                <section class="minute-sig-section" aria-label="서명 현황">
                    <div class="minute-sig-heading">기명날인 / 전자서명 현황</div>
                    <div class="minute-sig-grid">
                        ${items.join('')}
                    </div>
                </section>
            `;
        }

async function buildMinuteCertificationSheetHtml(minute, signatures) {
            if (!isMinuteSignatureFullyCompleted(minute, signatures || [])) return '';

            const requiredIds = getRequiredSignerIds(minute);
            if (!requiredIds.length) return '';

            const sigRows = Array.isArray(signatures) ? signatures : [];
            const sigMap = new Map(sigRows.map(row => [String(row.official_id), row]));
            const printedAtLabel = escapeHtml(formatMinutesAdminKstDateTime(new Date().toISOString()));
            const title = escapeHtml(minute?.title || '의사록');
            const typeLabel = escapeHtml(getDocTypeLabel(minute?.doc_type));
            const createdAtLabel = escapeHtml(formatMinutesAdminKstDate(minute?.created_at));
            const minuteIdLabel = escapeHtml(String(minute?.id || '-'));

            const rowsHtml = await Promise.all(requiredIds.map(async (id, index) => {
                const off = (allOfficials || []).find(o => String(o.id) === String(id));
                const safeName = escapeHtml(off?.name || '임원');
                const safeRole = escapeHtml(getMinuteCertificateRoleLabel(minute, off));
                const sig = sigMap.get(String(id));
                const signedAtLabel = escapeHtml(formatMinutesAdminKstDateTime(sig?.signed_at, '서명 시각 미기록'));

                let stampHtml = '<span class="print-cert-sheet-sign-status">서명 완료</span>';
                if (sig?.signature_url) {
                    const signedUrl = safeUrl(await resolveSignatureUrl(sig.signature_url), { allowDataImage: true });
                    if (signedUrl) {
                        stampHtml = `<img src="${signedUrl}" alt="서명" class="print-cert-sheet-sign-image">`;
                    }
                }

                return `
                    <tr>
                        <td class="is-center is-num">${index + 1}</td>
                        <td class="is-bold">${safeName}</td>
                        <td>${safeRole}</td>
                        <td class="is-num">${signedAtLabel}</td>
                        <td class="is-center">${stampHtml}</td>
                    </tr>
                `;
            }));

            return `
                <section class="print-cert-sheet">
                    <header class="print-cert-sheet-head">
                        <div>
                            <div class="print-cert-sheet-en">ELECTRONIC SIGNATURE CERTIFICATE</div>
                            <h2 class="print-cert-sheet-title">전자서명 완료 증명 페이지</h2>
                        </div>
                        <div class="print-cert-sheet-badge">필수 서명 완료</div>
                    </header>
                    <div class="print-cert-sheet-desc">이 페이지는 전자서명 완료 문서의 출력본 증명 정보입니다. 본문과 함께 보관해 주세요.</div>
                    <table class="print-cert-sheet-meta-table" aria-label="문서 증명 정보">
                        <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
                        <tbody>
                            <tr>
                                <th scope="row">문서 제목</th>
                                <td colspan="3" class="is-bold">${title}</td>
                            </tr>
                            <tr>
                                <th scope="row">문서 ID</th>
                                <td class="has-divider is-num">${minuteIdLabel}</td>
                                <th scope="row">문서 종류</th>
                                <td>${typeLabel}</td>
                            </tr>
                            <tr>
                                <th scope="row">작성일</th>
                                <td class="has-divider is-num">${createdAtLabel}</td>
                                <th scope="row">출력일시</th>
                                <td class="is-num">${printedAtLabel}</td>
                            </tr>
                            <tr>
                                <th scope="row">서명 완료 상태</th>
                                <td colspan="3" class="is-bold">필수 서명 완료 (${requiredIds.length} / ${requiredIds.length}명)</td>
                            </tr>
                        </tbody>
                    </table>
                    <table class="print-cert-sheet-table" aria-label="서명자 목록">
                        <thead>
                            <tr>
                                <th style="width:11%;" class="is-center">순번</th>
                                <th style="width:21%;">서명자</th>
                                <th style="width:20%;">구분</th>
                                <th style="width:30%;">서명 확인 시각</th>
                                <th style="width:18%;" class="is-center">서명 이미지</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml.join('')}
                        </tbody>
                    </table>
                    <div class="print-cert-sheet-note">전자서명 완료 문서의 원본은 시스템에 전자적으로 보관됩니다. 이 출력본은 열람 및 보관용 사본입니다.</div>
                </section>
            `;
        }

function buildCompactOfficialName(value) {
            return String(value || '').replace(/\s+/g, '').trim();
        }

function buildSpacedOfficialName(value) {
            const compact = buildCompactOfficialName(value);
            return compact ? compact.split('').join(' ') : '';
        }

function appendMinuteSignatureImageToOfficialName(rootNode, official, signedUrl) {
            const safeSignedUrl = safeUrl(signedUrl, { allowDataImage: true });
            if (!rootNode || !official?.name || !safeSignedUrl) return false;

            const compactName = buildCompactOfficialName(official.name);
            if (!compactName) return false;

            const matcher = new RegExp(compactName.split('').map(ch => escapeRegExp(ch)).join('\\s*'), 'g');
            const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
            const candidates = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
                const rawText = String(currentNode.nodeValue || '');
                if (buildCompactOfficialName(rawText).includes(compactName)) {
                    candidates.push(currentNode);
                }
                currentNode = walker.nextNode();
            }
            if (!candidates.length) return false;

            const targetNode = candidates[candidates.length - 1];
            const rawText = String(targetNode.nodeValue || '');
            let match = null;
            for (const found of rawText.matchAll(matcher)) {
                match = found;
            }
            if (!match || typeof match.index !== 'number') return false;

            const before = rawText.slice(0, match.index);
            const matched = rawText.slice(match.index, match.index + match[0].length);
            const after = rawText.slice(match.index + match[0].length);
            const fragment = document.createDocumentFragment();

            if (before) fragment.appendChild(document.createTextNode(before));
            fragment.appendChild(document.createTextNode(matched));

            const img = document.createElement('img');
            img.src = safeSignedUrl;
            img.alt = '서명';
            img.style.width = '56px';
            img.style.height = '56px';
            img.style.objectFit = 'contain';
            img.style.verticalAlign = 'middle';
            img.style.marginLeft = '8px';
            img.style.background = '#fff';
            fragment.appendChild(img);

            if (after) fragment.appendChild(document.createTextNode(after));
            targetNode.parentNode?.replaceChild(fragment, targetNode);
            return true;
        }

async function injectInlineSignatureImages(contentHtml, minute, signatures) {
            if (!minute || !minute.requires_sign || minute.doc_type === 'NOTICE') return contentHtml;
            const html = String(contentHtml || '');
            if (!html) return html;

            const requiredIds = getRequiredSignerIds(minute);
            if (!requiredIds.length) return html;

            const sigRows = Array.isArray(signatures) ? signatures : [];
            const sigMap = new Map(sigRows.map(row => [String(row.official_id), row]));
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            for (const id of requiredIds) {
                const off = (allOfficials || []).find(o => String(o.id) === String(id));
                if (!off) continue;
                const sig = sigMap.get(String(id));
                if (!sig?.signature_url) continue;
                const signedUrl = await resolveSignatureUrl(sig.signature_url);
                if (!signedUrl) continue;
                appendMinuteSignatureImageToOfficialName(doc.body, off, signedUrl);
            }
            return doc.body.innerHTML;
        }

async function buildPrintableMinuteHtml(minute, signatures) {
            const title = escapeHtml(minute?.title || '의사록');
            const typeLabel = escapeHtml(getDocTypeLabel(minute?.doc_type));
            const typeEnglish = escapeHtml(getDocTypeEnglish(minute?.doc_type));
            const dateLabel = escapeHtml(formatMinutesAdminKstDate(minute?.created_at));
            const isCertifiedPrint = isMinuteSignatureFullyCompleted(minute, signatures || []);
            const minuteIdLabel = escapeHtml(String(minute?.id || '-'));
            const printedAtLabel = escapeHtml(formatMinutesAdminKstDateTime(new Date().toISOString()));
            const originalBodyHtml = minute?.content
                ? sanitizeHtml(normalizeMinuteContent(minute.content))
                : '<div style="color:#64748b;">내용이 없습니다.</div>';
            if (window.ExpoRuntimeBridge) return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${title}</title><style>
                @page{size:A4;margin:18mm}body{font-family:system-ui,sans-serif;color:#172033;line-height:1.7}.expo-watermark{position:fixed;top:42%;left:18%;font-size:90px;font-weight:800;color:rgba(16,100,70,.16);transform:rotate(-25deg);pointer-events:none}main{position:relative}img,table{max-width:100%}table{width:100%}header{border-bottom:2px solid #10b981;padding-bottom:10px;margin-bottom:18px}header p{font-size:13px}@media print{.expo-watermark{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
                </style></head><body><div class="expo-watermark">DEMO</div><main><header><strong>🌱 박람회 시연용 예시 문서</strong><p>체험용 가상 정보와 예시 확인을 담은 문서입니다.</p></header><h1>${title}</h1><p>${typeLabel} · 작성일 ${dateLabel}</p>${originalBodyHtml}</main></body></html>`;
            const bodyHtml = await injectInlineSignatureImages(originalBodyHtml, minute, signatures || []);
            const signaturePrintHtml = bodyHtml === originalBodyHtml
                ? await buildMinuteSignaturePrintHtml(minute, signatures || [])
                : '';
            const certificationSheetHtml = await buildMinuteCertificationSheetHtml(minute, signatures || []);
            const certificationBadgeHtml = isCertifiedPrint
                ? `<div class="print-cert-badge">전자서명 완료 문서 출력본</div>`
                : '';
            const certificationWatermarkHtml = isCertifiedPrint
                ? `<div class="print-cert-watermark" aria-hidden="true">전자서명 완료 문서 출력본</div>`
                : '';
            const certificationFooterHtml = isCertifiedPrint
                ? `
                    <tfoot>
                        <tr>
                            <td>
                                <div class="print-cert-footer">
                                    <span>전자서명 완료 문서 출력본</span>
                                    <span>문서 ID ${minuteIdLabel}</span>
                                    <span>출력 ${printedAtLabel}</span>
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                `
                : '';
            const certificationNoticeHtml = isCertifiedPrint
                ? `<div class="print-cert-notice">이 문서는 전자서명 완료 문서의 출력본이며, 원본은 시스템에 전자적으로 보관됩니다.</div>`
                : '';

            return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @page { size: A4 portrait; margin: 15mm 15mm 17mm 15mm; }
        * { box-sizing: border-box; }
        html, body { width: auto; height: auto; margin: 0; padding: 0; }
        body {
            --ink: #1b4d3e;
            --accent: #6b7c73;
            --tint: #f4f7f5;
            --line: #8a9a91;
            --muted: #52635a;
            font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
            color: #16221c;
            background: #fff;
            position: relative;
            word-break: keep-all;
            overflow-wrap: break-word;
        }
        .print-frame { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .print-frame td { padding: 0; vertical-align: top; }
        .minute-doc-head {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 5mm;
            padding-bottom: 3mm;
            margin-bottom: 5mm;
            border-bottom: 0.55mm solid var(--ink);
        }
        .minute-doc-head-left { min-width: 0; flex: 1 1 auto; }
        .minute-doc-en { font-size: 8pt; font-weight: 650; letter-spacing: 0.12em; color: var(--muted); }
        .minute-doc-title { margin: 1mm 0 0; font-size: 19pt; font-weight: 800; color: var(--ink); line-height: 1.24; word-break: keep-all; }
        .minute-doc-head-right { text-align: right; flex: 0 0 auto; }
        .print-cert-badge {
            display: inline-block;
            padding: 1mm 2.8mm;
            border: 0.35mm solid var(--ink);
            border-radius: 2px;
            background: var(--tint);
            color: var(--ink);
            font-size: 8.6pt;
            font-weight: 750;
            letter-spacing: 0.02em;
            margin-bottom: 1.2mm;
        }
        .meta { font-size: 9pt; color: var(--muted); font-variant-numeric: tabular-nums; }
        .content { line-height: 1.76; font-size: 10.4pt; color: #16221c; overflow-wrap: break-word; word-break: keep-all; }
        .content, .content * { max-width: 100%; }
        .content img, img { max-width: 100% !important; height: auto !important; }
        .content table { width: 100% !important; table-layout: fixed; border-collapse: collapse; margin: 3mm 0; border-top: 0.42mm solid var(--ink); border-bottom: 0.42mm solid var(--ink); }
        .content th, .content td { border: 0.22mm solid var(--line); padding: 1.8mm 2.2mm; word-break: keep-all; overflow-wrap: break-word; }
        .content th { background: var(--tint); color: var(--ink); font-weight: 700; }
        .content pre { white-space: pre-wrap; word-break: break-word; }
        /* Fallback signer grid when names are not inline */
        .minute-sig-section { margin-top: 7mm; padding-top: 4mm; border-top: 0.35mm solid var(--ink); break-inside: avoid; page-break-inside: avoid; }
        .minute-sig-heading { font-size: 10.2pt; font-weight: 750; color: var(--ink); margin-bottom: 3mm; }
        .minute-sig-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2.5mm 6mm; }
        .minute-sig-item { display: flex; align-items: center; justify-content: space-between; gap: 3mm; padding: 2mm 0; border-bottom: 0.22mm dotted var(--line); break-inside: avoid; }
        .minute-sig-who { min-width: 0; font-size: 9.8pt; line-height: 1.3; }
        .minute-sig-role { color: var(--muted); font-weight: 650; margin-right: 1.5mm; }
        .minute-sig-name { color: #111827; font-weight: 750; }
        .minute-sig-state { display: inline-block; margin-left: 2mm; font-size: 8.4pt; color: var(--muted); }
        .minute-sig-state.is-done { color: var(--ink); font-weight: 700; }
        .minute-sig-box { flex: 0 0 18mm; display: flex; align-items: center; justify-content: flex-end; }
        .minute-sig-slot-img { width: 15mm; height: 15mm; object-fit: contain; border: 0.22mm solid var(--line); border-radius: 2px; background: #fff; }
        .minute-sig-slot-empty { display: inline-flex; align-items: center; justify-content: center; width: 15mm; height: 11mm; border: 0.22mm dashed var(--line); border-radius: 2px; font-size: 7.8pt; color: var(--muted); }
        .print-cert-notice { margin-top: 6mm; padding-top: 2.6mm; border-top: 0.24mm solid var(--line); color: var(--muted); font-size: 8.8pt; line-height: 1.55; }
        .print-cert-watermark { position: fixed; top: 47%; left: 50%; transform: translate(-50%, -50%) rotate(-23deg); font-size: 38pt; font-weight: 800; color: rgba(92, 108, 99, 0.10); white-space: nowrap; z-index: 0; pointer-events: none; }
        .print-layer { position: relative; z-index: 1; }
        .print-cert-footer { padding-top: 5mm; margin-top: 5mm; border-top: 0.24mm dashed var(--line); font-size: 8.4pt; color: var(--muted); display: flex; justify-content: space-between; gap: 4mm; font-variant-numeric: tabular-nums; }
        /* Official Electronic Signature Certificate Sheet */
        .print-cert-sheet { break-before: page; page-break-before: always; padding-top: 2mm; }
        .print-cert-sheet-head {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 4mm;
            padding-bottom: 3mm;
            border-bottom: 0.55mm solid var(--ink);
        }
        .print-cert-sheet-en { font-size: 8pt; font-weight: 650; letter-spacing: 0.12em; color: var(--muted); }
        .print-cert-sheet-title { margin: 1mm 0 0; font-size: 18pt; font-weight: 800; color: var(--ink); line-height: 1.22; }
        .print-cert-sheet-badge {
            padding: 1.1mm 3mm;
            border: 0.35mm solid var(--ink);
            border-radius: 2px;
            background: var(--tint);
            color: var(--ink);
            font-size: 8.8pt;
            font-weight: 750;
            white-space: nowrap;
        }
        .print-cert-sheet-desc { margin: 3.2mm 0 3.8mm; color: var(--muted); font-size: 9.3pt; line-height: 1.5; }
        .print-cert-sheet-meta-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border-top: 0.45mm solid var(--ink);
            border-bottom: 0.45mm solid var(--ink);
            margin-bottom: 5mm;
            font-size: 9.3pt;
        }
        .print-cert-sheet-meta-table tr + tr { border-top: 0.22mm solid var(--line); }
        .print-cert-sheet-meta-table th, .print-cert-sheet-meta-table td { padding: 2mm 2.5mm; vertical-align: middle; text-align: left; word-break: keep-all; overflow-wrap: break-word; }
        .print-cert-sheet-meta-table th { background: var(--tint); color: var(--ink); font-weight: 750; border-right: 0.22mm solid var(--line); }
        .print-cert-sheet-meta-table td.has-divider { border-right: 0.22mm solid var(--line); }
        .print-cert-sheet-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border-top: 0.45mm solid var(--ink);
            border-bottom: 0.45mm solid var(--ink);
            font-size: 9.2pt;
        }
        .print-cert-sheet-table thead tr { background: var(--tint); border-bottom: 0.32mm solid var(--ink); }
        .print-cert-sheet-table tbody tr + tr { border-top: 0.22mm solid var(--line); }
        .print-cert-sheet-table tr { break-inside: avoid; page-break-inside: avoid; }
        .print-cert-sheet-table th, .print-cert-sheet-table td { padding: 2.1mm 2.2mm; vertical-align: middle; text-align: left; word-break: keep-all; overflow-wrap: break-word; }
        .print-cert-sheet-table th + th, .print-cert-sheet-table td + td { border-left: 0.22mm solid var(--line); }
        .print-cert-sheet-table th { color: var(--ink); font-weight: 750; }
        .print-cert-sheet-table .is-center { text-align: center; }
        .print-cert-sheet-table .is-bold, .print-cert-sheet-meta-table .is-bold { font-weight: 700; color: #111827; }
        .print-cert-sheet-table .is-num, .print-cert-sheet-meta-table .is-num { font-variant-numeric: tabular-nums; }
        .print-cert-sheet-sign-image { width: 15mm; height: 12mm; object-fit: contain; background: #fff; display: inline-block; vertical-align: middle; }
        .print-cert-sheet-sign-status {
            display: inline-block;
            padding: 0.8mm 2.2mm;
            border: 0.3mm solid var(--ink);
            border-radius: 2px;
            color: var(--ink);
            font-size: 8.2pt;
            font-weight: 750;
        }
        .print-cert-sheet-note {
            margin-top: 4.5mm;
            padding: 2.6mm 3.2mm;
            background: var(--tint);
            border: 0.24mm solid var(--line);
            color: #334155;
            font-size: 8.8pt;
            line-height: 1.5;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        @media print {
            html, body { margin: 0; padding: 0; }
            tfoot { display: table-footer-group; }
            .minute-doc-head, .print-cert-sheet-head { break-inside: avoid; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    ${certificationWatermarkHtml}
    <div class="print-layer">
        <table class="print-frame" role="presentation">
            ${certificationFooterHtml}
            <tbody>
                <tr>
                    <td>
                        <header class="minute-doc-head">
                            <div class="minute-doc-head-left">
                                <div class="minute-doc-en">${typeEnglish}</div>
                                <h1 class="minute-doc-title">${title}</h1>
                            </div>
                            <div class="minute-doc-head-right">
                                ${certificationBadgeHtml}
                                <div class="meta">${typeLabel} · 작성일 ${dateLabel}</div>
                            </div>
                        </header>
                        <div class="content">${bodyHtml}</div>
                        ${signaturePrintHtml}
                        ${certificationNoticeHtml}
                    </td>
                </tr>
            </tbody>
        </table>
        ${certificationSheetHtml}
    </div>
</body>
</html>`;
        }

async function resolveSignatureUrl(rawUrl) {
            if (!rawUrl) return '';
            const trimmed = String(rawUrl).trim();
            if (!trimmed) return '';
            if (window.ExpoRuntimeBridge && trimmed === 'expo-demo-confirmation') return '';

            if (trimmed.startsWith('http')) {
                const parsed = parseStorageUrl(trimmed);
                if (parsed && MinutesService?.createSignedUrl) {
                    const { data, error } = await MinutesService.createSignedUrl(parsed.bucket, parsed.path, 3600);
                    if (!error && data?.signedUrl) return data.signedUrl;
                }
                return trimmed;
            }

            if (!MinutesService?.createSignedUrl) return '';
            const cleanedPath = trimmed.replace(/^\/+/, '');
            const { data, error } = await MinutesService.createSignedUrl('attachments', cleanedPath, 3600);
            if (!error && data?.signedUrl) return data.signedUrl;
            return '';
        }

function parseStorageUrl(rawUrl) {
            if (!rawUrl) return null;
            const match = String(rawUrl).match(/\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
            if (!match) return null;
            return { bucket: match[2], path: match[3] };
        }
 return Object.freeze({
     minute:buildPrintableMinuteHtml,
     noticePage:buildPrintableNoticeHtml,
     noticeBody:buildNoticeTemplateHtml,
     noticeFooter:buildNoticePrintFooterHtml,
     notice:async(approval,notice,filename='')=>buildPrintableNoticeHtml(
         notice?.title||approval?.title||'공문',
         await buildNoticeTemplateHtml(approval,notice),
         await buildNoticePrintFooterHtml(approval,notice),
         filename
     ),
     complete:isMinuteSignatureFullyCompleted,
     required:getRequiredSignerIds,
     sanitize:sanitizeHtml
 });
 }
 root.CoopMinutesPrintTemplates=Object.freeze({create,version:'1.1.0'});
})(typeof window==='undefined'?globalThis:window);
