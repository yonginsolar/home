/*
Version: v1.0.13
Change: 2026-03-25 - Render HTML-based notice bodies with sanitizer instead of exposing raw tags in the shared detail modal.
*/
(function () {
    if (window.NoticeModal) return;

    // Shared notice detail renderer used by both public and member pages.
    // Election notice snapshots carry fixed-layout HTML/CSS, so generic overflow
    // normalization must not rewrite that DOM or the published layout breaks.

    let cache = [];
    let companyInfoCache = null;
    let sealUrlCache = null;
    let visibleNoticeCoopIdPromise = null;
    const KST_TZ_NOTICE = 'Asia/Seoul';

    function formatNoticeKstDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ_NOTICE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    }

    function getClient() {
        return window._client || window._supabase || null;
    }

    function isPublicNoticeContext() {
        if (window.__noticeModalScope === 'public') return true;
        const path = String(window.location?.pathname || '');
        return path === '/' || /(?:^|\/)index\.html$/i.test(path);
    }

    async function getVisibleNoticeCoopId() {
        if (!visibleNoticeCoopIdPromise) {
            visibleNoticeCoopIdPromise = (async () => {
                const client = getClient();
                if (!client) return null;
                const { data, error } = await client.rpc('get_visible_coop_id');
                if (error) {
                    console.warn('NoticeModal.getVisibleNoticeCoopId failed:', error);
                    return null;
                }
                return data || null;
            })();
        }
        return await visibleNoticeCoopIdPromise;
    }

    async function getVisibleNoticeScopeCoopId() {
        const coopId = String(await getVisibleNoticeCoopId() || '').trim();
        return coopId || '00000000-0000-0000-0000-000000000000';
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(url, allowDataImage = false) {
        try {
            if (allowDataImage && /^data:image\//i.test(url)) return url;
            const u = new URL(url, window.location.origin);
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
        } catch (e) { void 0; }
        return null;
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
                    const safe = safeUrl(value, false);
                    if (!safe) node.removeAttribute('href');
                    else node.setAttribute('href', safe);
                }
                if (name === 'src') {
                    const safe = safeUrl(value, tag === 'IMG');
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

    function normalizeNoticeBodyContent(rawValue) {
        const raw = String(rawValue || '');
        const trimmed = raw.trim();
        if (!trimmed) return '';
        const hasHtmlTag = /<\s*\/?\s*[a-zA-Z][^>]*>/.test(trimmed);
        if (hasHtmlTag) return trimmed;
        return escapeHtml(trimmed).replace(/\n/g, '<br>');
    }

    function getRenderedNoticeBodyHtml(rawValue) {
        const normalized = normalizeNoticeBodyContent(rawValue);
        if (!normalized) return '';
        return sanitizeHtml(normalized);
    }

    function parseNoticeContent(content) {
        const raw = String(content || '');
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
            timeZone: KST_TZ_NOTICE,
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(d);
    }

    async function loadCompanyInfo() {
        if (companyInfoCache) return companyInfoCache;
        const client = getClient();
        if (!client) return {};
        const coopId = await getVisibleNoticeScopeCoopId();
        const { data } = await client
            .from('ref_company_info')
            .select('key,value')
            .eq('coop_id', coopId);
        const info = {};
        if (Array.isArray(data)) {
            data.forEach(row => {
                if (row?.key) info[row.key] = row.value;
            });
        }
        companyInfoCache = info;
        return info;
    }

    async function loadSealUrl() {
        if (sealUrlCache !== null) return sealUrlCache || '';
        const client = getClient();
        if (!client || !client.storage) {
            sealUrlCache = '';
            return '';
        }
        try {
            const { data } = await client.storage.from('attachments').createSignedUrl('Official Seal.png', 3600);
            sealUrlCache = data?.signedUrl || '';
            return sealUrlCache;
        } catch (e) {
            sealUrlCache = '';
            return '';
        }
    }

    async function loadElectionSealUrl() {
        const client = getClient();
        if (!client || !client.storage) return '';
        try {
            const { data, error } = await client.storage
                .from('attachments')
                .createSignedUrl('ec_seal.png', 60 * 60);
            if (!error && data?.signedUrl) return data.signedUrl;
        } catch (e) { void 0; }
        try {
            const { data } = client.storage.from('attachments').getPublicUrl('ec_seal.png');
            if (data?.publicUrl) return data.publicUrl;
        } catch (e) { void 0; }
        return '';
    }

    function refreshElectionSealInSnapshotHtml(contentHtml, sealUrl) {
        const rawHtml = String(contentHtml || '');
        const safeSealUrl = safeUrl(String(sealUrl || '').trim(), true);
        if (!rawHtml || !safeSealUrl) return rawHtml;
        if (!/<img[^>]+class=['"][^'"]*\bseal\b/i.test(rawHtml)) return rawHtml;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, 'text/html');
            const sealImgs = doc.querySelectorAll('img.seal');
            if (!sealImgs || sealImgs.length === 0) return rawHtml;
            sealImgs.forEach((img) => {
                img.setAttribute('src', safeSealUrl);
                if (!img.getAttribute('onerror')) {
                    img.setAttribute('onerror', "this.style.display='none'");
                }
            });
            return doc.documentElement?.outerHTML || rawHtml;
        } catch (e) {
            return rawHtml;
        }
    }

    function flattenSnapshotDocumentHtml(contentHtml) {
        const rawHtml = String(contentHtml || '');
        if (!rawHtml) return '';
        if (!/<(?:html|head|body|style)\b/i.test(rawHtml)) return rawHtml;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, 'text/html');
            const styles = Array.from(doc.querySelectorAll('style')).map((node) => node.outerHTML).join('');
            const bodyHtml = doc.body ? doc.body.innerHTML : rawHtml;
            return `${styles}${bodyHtml}` || rawHtml;
        } catch (e) {
            return rawHtml;
        }
    }

    function ensureNoticeModalFocusGuard(modalEl) {
        if (!modalEl || modalEl.dataset.noticeFocusGuardBound === 'true') return;
        modalEl.dataset.noticeFocusGuardBound = 'true';

        const blurDismissTarget = (event) => {
            const target = event.currentTarget;
            if (target && typeof target.blur === 'function') target.blur();
        };

        modalEl.querySelectorAll('[data-bs-dismiss="modal"], [data-notice-modal-close]').forEach((btn) => {
            btn.addEventListener('click', blurDismissTarget, true);
            btn.addEventListener('pointerdown', blurDismissTarget, true);
        });

        modalEl.addEventListener('show.bs.modal', () => {
            modalEl.removeAttribute('inert');
        });

        modalEl.addEventListener('hide.bs.modal', () => {
            const active = document.activeElement;
            if (active && modalEl.contains(active) && typeof active.blur === 'function') {
                active.blur();
            }
            modalEl.setAttribute('inert', '');
        });
    }

    function bindNoticeModalFocusGuards() {
        ensureNoticeModalFocusGuard(document.getElementById('noticeSearchModal'));
        ensureNoticeModalFocusGuard(document.getElementById('noticeDetailModal'));
    }

    function ensureModals() {
        if (document.getElementById('noticeSearchModal')) {
            bindNoticeModalFocusGuards();
            return;
        }
        const html = `
<div class="modal fade" id="noticeSearchModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered modal-lg"> <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title fw-bold"><i class="bi bi-search me-2"></i>공지사항 검색</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="input-group mb-3">
          <input type="text" id="modal-search-input" class="form-control" placeholder="제목이나 내용을 입력하세요" onkeyup="filterNoticesInModal()">
          <button class="btn btn-outline-secondary" type="button"><i class="bi bi-search"></i></button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            <ul id="modal-notice-list" class="list-group list-group-flush"></ul>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
      </div>
    </div>
  </div>
</div>

<style id="notice-modal-style">
#noticeDetailModal .notice-detail-modal-dialog {
  max-width: 900px;
}
#noticeDetailModal .notice-detail-modal-body {
  overflow-x: hidden;
}
#notice-read-content.notice-read-content {
  min-height: 200px;
  line-height: 1.8;
  color: #333;
}
#notice-read-content .notice-content-body {
  width: 100%;
  max-width: 100%;
}
#notice-read-content .notice-content-body.notice-content-body--fixed {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) * {
  max-width: 100%;
  box-sizing: border-box;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .doc {
  width: 100% !important;
  max-width: 100% !important;
}
#notice-read-content .notice-content-body .print-bar {
  display: none !important;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .notice-name-main,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .notice-rep,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .sign-text,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .sign-mark-text {
  white-space: normal !important;
  overflow-wrap: anywhere;
  word-break: break-word;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .notice-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) .notice-table-scroll > table {
  width: max-content !important;
  min-width: 100% !important;
  max-width: none !important;
  display: table !important;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) table {
  width: 100% !important;
  max-width: 100% !important;
  border-collapse: collapse;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) th,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) td {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
#notice-read-content .notice-content-body img:not(.seal),
#notice-read-content .notice-content-body video,
#notice-read-content .notice-content-body canvas,
#notice-read-content .notice-content-body svg,
#notice-read-content .notice-content-body iframe {
  max-width: 100% !important;
  height: auto !important;
}
#notice-read-content .notice-content-body img.seal {
  max-width: none !important;
  width: 92px !important;
  height: 92px !important;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) p,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) div,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) span,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) li {
  overflow-wrap: anywhere;
  word-break: break-word;
}
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) pre,
#notice-read-content .notice-content-body:not(.notice-content-body--fixed) code {
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 576px) {
  #noticeDetailModal .notice-detail-modal-dialog {
    margin: 0.5rem;
  }
  #noticeDetailModal .notice-detail-modal-body {
    padding: 1rem !important;
  }
  #notice-read-content .notice-content-body:not(.notice-content-body--fixed) .title {
    font-size: clamp(1.3rem, 6.2vw, 2rem) !important;
    letter-spacing: 0.12em !important;
  }
  #notice-read-content .notice-content-body:not(.notice-content-body--fixed) .intro {
    font-size: 0.95rem !important;
    line-height: 1.6 !important;
  }
  #noticeDetailModal .notice-read-meta {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 0.4rem;
  }
  #noticeDetailModal .modal-footer {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  #noticeDetailModal .modal-footer .btn {
    flex: 1 1 calc(50% - 0.5rem);
  }
}
</style>

<div class="modal fade" id="noticeDetailModal" tabindex="-1" >
  <div class="modal-dialog modal-dialog-centered modal-lg notice-detail-modal-dialog">
    <div class="modal-content notice-detail-modal-content">
      <div class="modal-header" style="background-color: #f8f9fa;">
        <h5 class="modal-title fw-bold" id="notice-read-title">제목</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body p-4 notice-detail-modal-body">
        <div class="d-flex justify-content-between text-muted border-bottom pb-2 mb-4 notice-read-meta">
            <span id="notice-read-cat" class="badge bg-dark">공지</span>
            <small id="notice-read-date">202X.XX.XX</small>
        </div>
        <div id="notice-read-content" class="notice-read-content" style="min-height: 200px; line-height: 1.8; color: #333;"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-dark" data-notice-modal-close="detail-to-list" onclick="openNoticeSearchModal()">목록으로</button>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
      </div>
    </div>
  </div>
</div>
`;
        document.body.insertAdjacentHTML('beforeend', html);
        bindNoticeModalFocusGuards();
    }

    function getGlobalNoticeList() {
        try {
            if (typeof g_notices_list !== 'undefined' && Array.isArray(g_notices_list) && g_notices_list.length > 0) {
                return g_notices_list;
            }
        } catch (e) { void 0; }
        if (Array.isArray(window.g_notices_list) && window.g_notices_list.length > 0) {
            return window.g_notices_list;
        }
        return null;
    }

    async function fetchNotices(force = false) {
        const globalList = !force ? getGlobalNoticeList() : null;
        if (globalList) {
            cache = globalList;
            return cache;
        }
        if (!force && cache.length > 0) return cache;
        const client = getClient();
        if (!client) return [];
        const coopId = await getVisibleNoticeScopeCoopId();
        let query = client.from('coop_notices').select('*').eq('coop_id', coopId);
        if (isPublicNoticeContext()) {
            query = query.eq('status', 'published').eq('is_members_only', false);
        }
        const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
        if (error) return [];
        cache = data || [];
        return cache;
    }

    async function fetchNoticeById(id) {
        const client = getClient();
        if (!client) return null;
        const coopId = await getVisibleNoticeScopeCoopId();
        let query = client.from('coop_notices').select('*').eq('id', id).eq('coop_id', coopId);
        if (isPublicNoticeContext()) {
            query = query.eq('status', 'published').eq('is_members_only', false);
        }
        const { data, error } = await query.single();
        if (error) return null;
        return data || null;
    }

    async function fetchPublishedElectedNoticeSnapshot(noticeId) {
        const client = getClient();
        if (!client || !noticeId) return null;
        const coopId = await getVisibleNoticeScopeCoopId();

        const { data, error } = await client
            .from('coop_elected_notice_snapshots')
            .select('content_html,status')
            .eq('coop_id', coopId)
            .eq('notice_id', noticeId)
            .eq('status', 'PUBLISHED')
            .maybeSingle();

        if (error) {
            const code = String(error.code || '');
            const message = String(error.message || '').toLowerCase();
            if (code === 'PGRST116' || code === '42P01' || code === 'PGRST205') return null;
            if (message.includes('coop_elected_notice_snapshots') && message.includes('does not exist')) return null;
            console.warn('fetchPublishedElectedNoticeSnapshot failed:', error);
            return null;
        }
        return data || null;
    }

    function renderModalList(items) {
        const modalList = document.getElementById('modal-notice-list');
        if (!modalList) return;

        if (!items || items.length === 0) {
            modalList.innerHTML = '<div class="text-center py-3 text-muted">검색 결과가 없습니다.</div>';
            return;
        }

        let html = '';
        items.forEach(n => {
            const dateStr = formatNoticeKstDate(n.created_at);
            const safeCategory = escapeHtml(n.category || '');
            const safeTitle = escapeHtml(n.title || '');
            html += `
          <li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
              onclick="openNoticeDetail('${n.id}')" style="cursor:pointer;">
             <div>
                <span class="badge bg-light text-dark border me-1">${safeCategory}</span>
                <span class="fw-bold text-dark">${safeTitle}</span>
             </div>
             <small class="text-muted">${dateStr}</small>
          </li>
        `;
        });
        modalList.innerHTML = html;
    }

    function filterInModal() {
        const input = document.getElementById('modal-search-input');
        if (!input) return;
        const keyword = input.value.toLowerCase().trim();
        const filtered = cache.filter(n => {
            const t = n.title ? n.title.toLowerCase() : '';
            const c = n.content ? n.content.toLowerCase() : '';
            return t.includes(keyword) || c.includes(keyword);
        });
        renderModalList(filtered);
    }

    function showNoticeAlert(msg) {
        if (typeof window.showAlert === 'function') return window.showAlert(msg);
        if (typeof window.showModal === 'function') return window.showModal(msg);
    }

    function normalizeNoticeDetailContent(contentEl, options = {}) {
        if (!contentEl) return;
        const body = contentEl.querySelector('.notice-content-body');
        if (!body) return;

        const preserveFixedLayout = Boolean(options.preserveFixedLayout);
        body.classList.toggle('notice-content-body--fixed', preserveFixedLayout);
        body.querySelectorAll('.print-bar').forEach(el => { el.style.display = 'none'; });

        if (preserveFixedLayout) {
            body.querySelectorAll('img, video, canvas, svg, iframe').forEach(media => {
                if (media.classList && media.classList.contains('seal')) return;
                media.style.maxWidth = '100%';
                media.style.height = 'auto';
            });
            return;
        }

        body.querySelectorAll('.doc').forEach(el => {
            el.style.width = '100%';
            el.style.maxWidth = '100%';
        });

        body.querySelectorAll('*').forEach(el => {
            if (!(el instanceof HTMLElement)) return;
            const widthStyle = (el.style.width || '').trim().toLowerCase();
            if (widthStyle.endsWith('px')) {
                const px = parseFloat(widthStyle);
                if (Number.isFinite(px) && px >= 280) {
                    el.style.width = '100%';
                    el.style.maxWidth = '100%';
                }
            }

            const minWidthStyle = (el.style.minWidth || '').trim().toLowerCase();
            if (minWidthStyle.endsWith('px')) {
                const minPx = parseFloat(minWidthStyle);
                if (Number.isFinite(minPx) && minPx >= 280) {
                    el.style.minWidth = '0';
                }
            }

            const whiteSpaceStyle = (el.style.whiteSpace || '').trim().toLowerCase();
            if (whiteSpaceStyle === 'nowrap') {
                el.style.whiteSpace = 'normal';
                el.style.wordBreak = 'break-word';
                el.style.overflowWrap = 'anywhere';
            }
        });

        body.querySelectorAll('table').forEach(table => {
            const parent = table.parentElement;
            if (!parent) return;
            if (!parent.classList.contains('notice-table-scroll')) {
                const wrap = document.createElement('div');
                wrap.className = 'notice-table-scroll';
                parent.insertBefore(wrap, table);
                wrap.appendChild(table);
            }
            table.style.minWidth = '100%';
        });

        body.querySelectorAll('th, td').forEach(cell => {
            cell.style.whiteSpace = 'normal';
            cell.style.wordBreak = 'break-word';
            cell.style.overflowWrap = 'anywhere';
        });

        body.querySelectorAll('img, video, canvas, svg, iframe').forEach(media => {
            if (media.classList && media.classList.contains('seal')) return;
            media.style.maxWidth = '100%';
            media.style.height = 'auto';
        });
    }

    async function openList() {
        ensureModals();
        await fetchNotices();
        renderModalList(cache);

        const input = document.getElementById('modal-search-input');
        if (input) input.value = '';

        if (typeof bootstrap !== 'undefined') {
            const detailEl = document.getElementById('noticeDetailModal');
            const searchEl = document.getElementById('noticeSearchModal');
            const detailModal = bootstrap.Modal.getInstance(detailEl);
            if (detailModal) detailModal.hide();
            const searchModal = bootstrap.Modal.getOrCreateInstance(searchEl);
            searchModal.show();
        }
    }

    function buildNoticeTemplateHtml(n, companyInfo, sealUrl) {
        const parsed = parseNoticeContent(n.content || '');
        const docNo = n.doc_no || parsed.docNo || '';
        const receiver = parsed.receiver || '-';
        const via = parsed.via || '-';
        const title = n.title || parsed.title || '공지';
        const body = parsed.bodyLines.join('\n').trim() || '';
        const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
        const dateLabel = formatKoreanDate(n.created_at);

        const orgNameRaw = companyInfo?.orgName || companyInfo?.company_name || '협동조합';
        const chairmanRaw = companyInfo?.chairman_name || companyInfo?.ceoName || '';
        const orgName = escapeHtml(orgNameRaw);
        const chairman = chairmanRaw ? escapeHtml(chairmanRaw) : '';
        const sealSafe = sealUrl ? safeUrl(sealUrl, true) : '';
        const sealHtml = sealSafe
            ? `<img src="${sealSafe}" alt="seal" style="width:70px; height:70px; object-fit:contain; margin-left:6px; vertical-align:middle;">`
            : '';

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
                <div style="margin-top:14px; line-height:1.8;">${safeBody || '-'}</div>
                ${dateLabel ? `<div style="margin-top:18px; text-align:center; font-weight:600;">${escapeHtml(dateLabel)}</div>` : ''}
                <div style="margin-top:8px; text-align:center; font-weight:700;">
                    ${orgName} 이사장 ${chairman ? chairman : ''} ${sealHtml}
                </div>
            </div>
        `;
    }

    async function openDetail(id) {
        ensureModals();
        let n = cache.find(item => String(item.id) === String(id));
        if (!n) n = await fetchNoticeById(id);
        if (!n) {
            showNoticeAlert('해당 공지사항의 데이터를 찾을 수 없습니다.');
            return;
        }

        const titleEl = document.getElementById('notice-read-title');
        const catEl = document.getElementById('notice-read-cat');
        const dateEl = document.getElementById('notice-read-date');
        if (titleEl) titleEl.innerText = n.title || '';
        if (catEl) catEl.innerText = n.category === '공문' ? '공지' : (n.category || '');
        if (dateEl) dateEl.innerText = formatNoticeKstDate(n.created_at);

        const snapshot = await fetchPublishedElectedNoticeSnapshot(n.id);

        let contentHtml = '';
        const preserveFixedLayout = Boolean(snapshot?.content_html);
        if (snapshot?.content_html) {
            contentHtml = String(snapshot.content_html);
            const electionSealUrl = await loadElectionSealUrl();
            contentHtml = refreshElectionSealInSnapshotHtml(contentHtml, electionSealUrl);
            contentHtml = flattenSnapshotDocumentHtml(contentHtml);
        } else if (n.category === '공문') {
            const info = await loadCompanyInfo();
            const sealUrl = await loadSealUrl();
            contentHtml = buildNoticeTemplateHtml(n, info, sealUrl);
        } else {
            contentHtml = getRenderedNoticeBodyHtml(n.content || '');
        }

        const attachUrls = (Array.isArray(n.file_urls) && n.file_urls.length > 0)
            ? n.file_urls
            : (n.file_url ? [n.file_url] : []);
        const attachNames = Array.isArray(n.file_names) ? n.file_names : [];

        if (attachUrls.length > 0) {
            contentHtml += '<hr class="my-4" style="border-top: 1px dashed #bbb;">';
            contentHtml += '<h6 class="fw-bold mb-3"><i class="bi bi-paperclip"></i> 첨부파일</h6>';
            contentHtml += '<ul class="list-unstyled bg-light p-3 rounded">';

            attachUrls.forEach((url, idx) => {
                if (typeof url !== 'string') return;
                const safeLink = safeUrl(url);
                if (!safeLink) return;

                let fileName = (attachNames[idx] || '').trim() || url.split('/').pop();
                try { fileName = decodeURIComponent(fileName); } catch (e) { void 0; }
                let displayName = fileName.replace(/_/g, ' ');
                const safeDisplay = escapeHtml(displayName);

                contentHtml += `
                    <li class="mb-2">
                        <a href="${safeLink}" target="_blank" class="text-decoration-none text-dark d-flex align-items-center" rel="noopener noreferrer">
                            <i class="bi bi-file-earmark-arrow-down fs-5 text-primary me-2"></i>
                            <span class="text-decoration-underline">${safeDisplay}</span>
                        </a>
                    </li>
                `;
            });
            contentHtml += '</ul>';
        }

        const contentEl = document.getElementById('notice-read-content');
        if (contentEl) {
            const bodyClass = preserveFixedLayout ? 'notice-content-body notice-content-body--fixed' : 'notice-content-body';
            contentEl.innerHTML = `<div class="${bodyClass}">${contentHtml}</div>`;
            normalizeNoticeDetailContent(contentEl, { preserveFixedLayout });
        }

        if (typeof bootstrap !== 'undefined') {
            const searchEl = document.getElementById('noticeSearchModal');
            const searchModal = bootstrap.Modal.getInstance(searchEl);
            if (searchModal) searchModal.hide();

            const detailEl = document.getElementById('noticeDetailModal');
            const detailModal = bootstrap.Modal.getOrCreateInstance(detailEl);
            detailModal.show();
        }
    }

    window.NoticeModal = {
        openList,
        openDetail,
        filterInModal,
        setCache(list) { cache = Array.isArray(list) ? list : []; }
    };

    window.openNoticeSearchModal = function () { return window.NoticeModal.openList(); };
    window.filterNoticesInModal = function () { return window.NoticeModal.filterInModal(); };
    window.openNoticeDetail = function (id) { return window.NoticeModal.openDetail(id); };
})();
