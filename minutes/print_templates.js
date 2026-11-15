/* 1.0.0 · 기존 회의·공문 출력 원문을 재사용하는 읽기 전용 서식. */
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
            const { data } = await MinutesService.getCompanyInfo();
            noticeCompanyInfo = data || {};
            return noticeCompanyInfo;
        }

async function loadNoticeSealUrl() {
            if (noticeSealUrl !== null) return noticeSealUrl || '';
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
            if (!safeEmpId) return '';
            if (noticeDrafterPositionMap.has(safeEmpId)) return noticeDrafterPositionMap.get(safeEmpId) || '';
            const { data } = await MinutesService.getEmployeePositionByEmpId(safeEmpId);
            const safePosition = String(data || '').trim();
            noticeDrafterPositionMap.set(safeEmpId, safePosition);
            return safePosition;
        }

async function buildNoticeTemplateHtml(approval, notice) {
            const rawContent = notice?.content || buildNoticeContentFromApproval(approval || {});
            const parsed = parseNoticeContent(rawContent);
            const docNo = approval?.doc_no || notice?.doc_no || parsed.docNo || '';
            const receiver = approval?.receiver || parsed.receiver || '-';
            const via = approval?.via || parsed.via || '-';
            const title = notice?.title || approval?.title || parsed.title || '공문';
            const approvalBody = splitNoticeApprovalContent(approval?.content || '').publicBody;
            const body = parsed.bodyLines.join('\n').trim() || approvalBody || '';
            const normalizedBody = normalizeMinuteContent(body);
            const safeBodyHtml = normalizedBody ? sanitizeHtml(normalizedBody) : '-';
            const dateValue = approval?.processed_at || approval?.created_at || notice?.created_at;
            const dateLabel = formatKoreanDate(dateValue);

            return `
                <div style="font-family:'Malgun Gothic',sans-serif; color:#111827;">
                    ${docNo ? `<div style="text-align:right; font-size:12px; color:#64748b;">문서번호: ${escapeHtml(docNo)}</div>` : ''}
                    <div style="border-top:1px solid #111; border-bottom:1px solid #111;">
                        <div style="display:flex; border-bottom:1px solid #e5e7eb; padding:6px 0;">
                            <div style="width:60px; font-weight:700;">수신</div>
                            <div style="flex:1;">${escapeHtml(receiver)}</div>
                        </div>
                        <div style="display:flex; border-bottom:1px solid #e5e7eb; padding:6px 0;">
                            <div style="width:60px; font-weight:700;">경유</div>
                            <div style="flex:1;">${escapeHtml(via)}</div>
                        </div>
                        <div style="display:flex; padding:6px 0;">
                            <div style="width:60px; font-weight:700;">제목</div>
                            <div style="flex:1;">${escapeHtml(title)}</div>
                        </div>
                </div>
                <div style="margin-top:14px; line-height:1.8;">${safeBodyHtml}</div>
                ${dateLabel ? `<div style="margin-top:18px; text-align:center; font-weight:600;">${escapeHtml(dateLabel)}</div>` : ''}
                </div>
            `;
        }

async function buildNoticePrintApprovalEntries(approval) {
            const entries = [];
            const drafterName = String(approval?.drafter_name || '').trim();
            const drafterPosition = await loadNoticeDrafterPosition(approval?.drafter_id);
            if (drafterName) {
                entries.push({
                    name: drafterPosition ? `${drafterPosition}: ${drafterName}` : drafterName,
                    meta: `(기안) (${formatMinutesAdminKstDateTime(approval?.created_at, '-')})`,
                    isDrafter: true
                });
            }

            const approvalLine = Array.isArray(approval?.approval_line) ? approval.approval_line : [];
            approvalLine.forEach((step, idx) => {
                const rawName = String(step?.name || '').trim();
                if (!rawName) return;
                const position = String(step?.position || '').trim();
                const isLast = idx === approvalLine.length - 1;
                entries.push({
                    name: isLast && position ? `${position}: ${rawName}` : rawName,
                    meta: `(결재) (${formatMinutesAdminKstDateTime(step?.processed_at, '-')})`
                });
            });

            return entries;
        }

async function buildNoticePrintFooterHtml(approval) {
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
            const zipCode = escapeHtml(zipCodeRaw || '');
            const address = escapeHtml(addressRaw || '');
            const homepage = escapeHtml(homepageRaw || '');
            const email = escapeHtml(emailRaw || '');
            const phone = escapeHtml(phoneRaw || '');
            const zipCodeLabel = zipCode ? `우 ${zipCode}` : '';
            const sealSafe = safeUrl(sealUrl, { allowDataImage: true });
            const sealHtml = sealSafe
                ? `<img src="${sealSafe}" alt="seal" class="print-foot-seal">`
                : '';
            const approvalEntries = await buildNoticePrintApprovalEntries(approval);
            const approvalItemsHtml = approvalEntries.map((entry, idx) => {
                const alignClass = idx === 0 ? 'is-left' : (idx === approvalEntries.length - 1 ? 'is-right' : 'is-center');
                return `
                    <div class="print-foot-approval-item ${alignClass}">
                        <div class="print-foot-approval-name">${escapeHtml(entry.name || '-')}</div>
                        <div class="print-foot-approval-meta">${escapeHtml(entry.meta || '')}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="print-foot-sign"><span class="print-foot-sign-text">${orgName} ${signLeaderText}</span>${sealHtml}</div>
                <div class="print-foot-divider"></div>
                <div class="print-foot-approvals">${approvalItemsHtml}</div>
                <div class="print-foot-row-divider"></div>
                <div class="print-foot-contact-grid">
                    <span class="is-left">${zipCodeLabel || '&nbsp;'}</span>
                    <span class="is-center">${address || '&nbsp;'}</span>
                    <span class="is-right">${homepage || '&nbsp;'}</span>
                </div>
                <div class="print-foot-row-divider"></div>
                <div class="print-foot-contact-split">
                    <span class="is-left">${email ? `E-mail: ${email}` : '&nbsp;'}</span>
                    <span class="is-right">${phone ? `T: ${phone}` : '&nbsp;'}</span>
                </div>
            `;
        }

function buildPrintableNoticeHtml(title, noticeHtml, footerHtml, filename = '') {
            const safeTitle = escapeHtml(title || '공문');
            const safeFilename = escapeHtml(filename || title || '공문');
            const printedAtLabel = escapeHtml(formatMinutesAdminKstDateTime(new Date().toISOString()));
            return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${safeFilename}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        html, body { width: auto; height: auto; }
        body { margin: 0; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #111827; background: #ffffff; }
        .print-shell { position: relative; }
        .print-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db; }
        .print-head-title { font-size: 24px; font-weight: 800; color: #0f172a; }
        .print-head-meta { font-size: 12px; color: #64748b; text-align: right; }
        .print-notice-wrap, .print-notice-wrap * { box-sizing: border-box; max-width: 100%; }
        .print-notice-wrap { font-size: 14px; line-height: 1.8; color: #111827; }
        .print-notice-wrap img { max-width: 100% !important; height: auto !important; }
        .print-notice-wrap table { width: 100% !important; border-collapse: collapse; table-layout: fixed; }
        .print-notice-wrap th, .print-notice-wrap td { word-break: break-word; overflow-wrap: anywhere; }
        .print-foot { margin-top: 28px; color: #111111; }
        .print-foot-sign { display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: nowrap; text-align: center; font-size: 18px; font-weight: 700; color: #111827; }
        .print-foot-sign-text { white-space: nowrap; word-break: keep-all; }
        .print-foot-seal { width: 68px; height: 68px; object-fit: contain; margin-left: 6px; vertical-align: middle; }
        .print-foot-approvals { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 0; color: #111111; flex-wrap: nowrap; }
        .print-foot-approval-item { flex: 1 1 0; min-width: 0; }
        .print-foot-approval-item.is-left { text-align: left; }
        .print-foot-approval-item.is-center { text-align: center; }
        .print-foot-approval-item.is-right { text-align: right; }
        .print-foot-approval-name { font-size: 16px; font-weight: 700; color: #111111; white-space: nowrap; word-break: keep-all; }
        .print-foot-approval-meta { margin-top: 4px; font-size: 10px; color: #111111; white-space: nowrap; }
        .print-foot-divider { margin: 14px 0 12px; border-top: 4px solid #9ca3af; }
        .print-foot-contact-grid { display: grid; grid-template-columns: 0.9fr 2.2fr 1.3fr; gap: 12px; align-items: center; margin-top: 4px; font-size: 12px; color: #111111; }
        .print-foot-contact-grid .is-left { text-align: left; }
        .print-foot-contact-grid .is-center { text-align: center; }
        .print-foot-contact-grid .is-right { text-align: right; }
        .print-foot-row-divider { margin: 8px 0; border-top: 1px solid #111111; }
        .print-foot-contact-split { display: flex; justify-content: space-between; gap: 16px; margin-top: 8px; font-size: 12px; color: #111111; }
        .print-foot-contact-split .is-left { text-align: left; }
        .print-foot-contact-split .is-right { text-align: right; }
        @media print {
            html, body { margin: 0; padding: 0; }
            body, body * { font-size: 11pt !important; word-break: keep-all; overflow-wrap: break-word; }
            .print-head-title { font-size: 18pt !important; }
            .print-foot-sign, .print-foot-approval-name { font-size: 12pt !important; white-space: normal; }
            .print-foot-approval-meta { white-space: normal; }
            .print-head, .print-foot { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="print-shell">
        <div class="print-head">
            <div class="print-head-title">${safeTitle}</div>
            <div class="print-head-meta">출력 ${printedAtLabel}</div>
        </div>
        <div class="print-notice-wrap">${noticeHtml || '<div>내용이 없습니다.</div>'}</div>
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

                let imgHtml = '<div style="width:56px; height:56px; border:1px solid #d1d5db; border-radius:50%; background:#fff;"></div>';
                if (sig?.signature_url) {
                    const signedUrl = safeUrl(await resolveSignatureUrl(sig.signature_url), { allowDataImage: true });
                    if (signedUrl) {
                        imgHtml = `<img src="${signedUrl}" alt="서명" style="width:56px; height:56px; border-radius:50%; border:1px solid #d1d5db; object-fit:contain; background:#fff;">`;
                    }
                }

                return `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #e5e7eb;">
                        ${imgHtml}
                        <div style="font-size:14px; color:#111827; font-weight:700;">
                            ${safeName}${safeRole ? ` (${safeRole})` : ''}
                            <span style="font-size:12px; font-weight:600; color:${isSigned ? '#166534' : '#64748b'}; margin-left:8px;">${isSigned ? '서명 완료' : '미서명'}</span>
                        </div>
                    </div>
                `;
            }));

            return `
                <div style="margin-top:28px;">
                    <h3 style="margin:0 0 12px; font-size:16px; color:#111827;">서명 현황</h3>
                    <div>
                        ${items.join('')}
                    </div>
                </div>
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

                let stampHtml = '<span class="cert-sheet-sign-status">완료</span>';
                if (sig?.signature_url) {
                    const signedUrl = safeUrl(await resolveSignatureUrl(sig.signature_url), { allowDataImage: true });
                    if (signedUrl) {
                        stampHtml = `<img src="${signedUrl}" alt="서명" class="cert-sheet-sign-image">`;
                    }
                }

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${safeName}</td>
                        <td>${safeRole}</td>
                        <td>${signedAtLabel}</td>
                        <td>${stampHtml}</td>
                    </tr>
                `;
            }));

            return `
                <section class="print-cert-sheet">
                    <div class="print-cert-sheet-badge">전자서명 완료 증명</div>
                    <h2 class="print-cert-sheet-title">전자서명 완료 증명 페이지</h2>
                    <div class="print-cert-sheet-desc">이 페이지는 전자서명 완료 문서의 출력본 증명 정보입니다. 본문과 함께 보관해 주세요.</div>
                    <div class="print-cert-sheet-meta">
                        <div><strong>문서 제목</strong><span>${title}</span></div>
                        <div><strong>문서 종류</strong><span>${typeLabel}</span></div>
                        <div><strong>문서 ID</strong><span>${minuteIdLabel}</span></div>
                        <div><strong>작성일</strong><span>${createdAtLabel}</span></div>
                        <div><strong>출력일시</strong><span>${printedAtLabel}</span></div>
                        <div><strong>서명 완료 상태</strong><span>필수 서명 완료</span></div>
                    </div>
                    <table class="print-cert-sheet-table">
                        <thead>
                            <tr>
                                <th style="width:52px;">순번</th>
                                <th>서명자</th>
                                <th style="width:160px;">구분</th>
                                <th style="width:220px;">서명 확인</th>
                                <th style="width:120px;">서명 이미지</th>
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
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        html, body { width: auto; height: auto; }
        body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; margin: 0; color: #111827; position: relative; }
        .print-frame { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .print-frame td { padding: 0; vertical-align: top; }
        .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
        .content { line-height: 1.8; font-size: 14px; overflow-wrap: anywhere; word-break: break-word; }
        .content, .content * { box-sizing: border-box; max-width: 100%; }
        .content img, img { max-width: 100% !important; height: auto !important; }
        .content table { width: 100% !important; table-layout: fixed; border-collapse: collapse; }
        .content th, .content td { word-break: break-word; overflow-wrap: anywhere; }
        .content pre { white-space: pre-wrap; word-break: break-word; }
        .print-cert-badge { display:inline-block; margin:0 0 14px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:999px; background:#eff6ff; color:#1d4ed8; font-size:12px; font-weight:700; letter-spacing:0.02em; }
        .print-cert-notice { margin-top:24px; padding-top:10px; border-top:1px solid #d1d5db; color:#475569; font-size:12px; line-height:1.6; }
        .print-cert-watermark { position:fixed; top:45%; left:50%; transform:translate(-50%, -50%) rotate(-22deg); font-size:56px; font-weight:800; color:rgba(148,163,184,0.18); white-space:nowrap; z-index:0; pointer-events:none; }
        .print-layer { position:relative; z-index:1; }
        .print-cert-footer { padding-top: 8mm; margin-top: 8mm; border-top: 1px dashed rgba(37, 99, 235, 0.38); font-size: 10.5px; color: #475569; display: flex; justify-content: space-between; gap: 12px; }
        .print-cert-sheet { break-before: page; page-break-before: always; padding-top: 10mm; }
        .print-cert-sheet-badge { display:inline-block; margin:0 0 12px; padding:6px 12px; border:1px solid #bfdbfe; border-radius:999px; background:#dbeafe; color:#1d4ed8; font-size:12px; font-weight:800; }
        .print-cert-sheet-title { margin:0 0 10px; font-size:24px; color:#0f172a; }
        .print-cert-sheet-desc { margin-bottom:16px; color:#475569; font-size:13px; line-height:1.6; }
        .print-cert-sheet-meta { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px 16px; margin-bottom:18px; padding:14px 16px; border:1px solid #dbeafe; border-radius:14px; background:#f8fbff; }
        .print-cert-sheet-meta div { display:flex; flex-direction:column; gap:4px; font-size:13px; color:#334155; }
        .print-cert-sheet-meta strong { color:#0f172a; font-size:12px; }
        .print-cert-sheet-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .print-cert-sheet-table th, .print-cert-sheet-table td { border:1px solid #cbd5e1; padding:10px 8px; font-size:12px; word-break:break-word; overflow-wrap:anywhere; text-align:left; }
        .print-cert-sheet-table th { background:#f8fafc; color:#0f172a; font-weight:800; }
        .print-cert-sheet-sign-image { width:60px; height:60px; object-fit:contain; background:#fff; display:block; }
        .print-cert-sheet-sign-status { display:inline-flex; align-items:center; justify-content:center; min-width:58px; padding:6px 10px; border-radius:999px; background:#dcfce7; color:#166534; font-size:11px; font-weight:800; }
        .print-cert-sheet-note { margin-top:16px; color:#475569; font-size:12px; line-height:1.6; }
        @media print {
            html, body { margin: 0; padding: 0; }
            tfoot { display: table-footer-group; }
            .print-cert-watermark, .print-cert-sheet-badge, .print-cert-sheet-meta, .print-cert-sheet-sign-status { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
                        ${certificationBadgeHtml}
                        <h1 style="margin:0 0 10px; font-size:24px;">${title}</h1>
                        <div class="meta">${typeLabel} | 작성일 ${dateLabel}</div>
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
                if (parsed) {
                    const { data, error } = await MinutesService.createSignedUrl(parsed.bucket, parsed.path, 3600);
                    if (!error && data?.signedUrl) return data.signedUrl;
                }
                return trimmed;
            }

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
 return Object.freeze({minute:buildPrintableMinuteHtml,noticePage:buildPrintableNoticeHtml,notice:async(approval,notice)=>buildPrintableNoticeHtml(notice?.title||approval?.title||'공문',await buildNoticeTemplateHtml(approval,notice),await buildNoticePrintFooterHtml(approval)),complete:isMinuteSignatureFullyCompleted,required:getRequiredSignerIds,sanitize:sanitizeHtml});
 }
 root.CoopMinutesPrintTemplates=Object.freeze({create,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
