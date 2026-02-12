/*
Version: v1.0.4
Change: 2026-02-05 - Hide "공문" label for public notices.
*/
(function () {
    if (window.NoticeModal) return;

    let cache = [];
    let companyInfoCache = null;
    let sealUrlCache = null;
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
        const { data } = await client.from('ref_company_info').select('key,value');
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

    function ensureModals() {
        if (document.getElementById('noticeSearchModal')) return;
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

<div class="modal fade" id="noticeDetailModal" tabindex="-1" >
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content">
      <div class="modal-header" style="background-color: #f8f9fa;">
        <h5 class="modal-title fw-bold" id="notice-read-title">제목</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body p-4">
        <div class="d-flex justify-content-between text-muted border-bottom pb-2 mb-4">
            <span id="notice-read-cat" class="badge bg-dark">공지</span>
            <small id="notice-read-date">202X.XX.XX</small>
        </div>
        <div id="notice-read-content" style="min-height: 200px; line-height: 1.8; color: #333;"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-dark" onclick="openNoticeSearchModal()">목록으로</button>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
      </div>
    </div>
  </div>
</div>
`;
        document.body.insertAdjacentHTML('beforeend', html);
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
        const { data, error } = await client.from('coop_notices').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) return [];
        cache = data || [];
        return cache;
    }

    async function fetchNoticeById(id) {
        const client = getClient();
        if (!client) return null;
        const { data, error } = await client.from('coop_notices').select('*').eq('id', id).single();
        if (error) return null;
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

        const orgNameRaw = companyInfo?.orgName || companyInfo?.company_name || '용인모두의햇빛협동조합';
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

        let contentHtml = '';
        if (n.category === '공문') {
            const info = await loadCompanyInfo();
            const sealUrl = await loadSealUrl();
            contentHtml = buildNoticeTemplateHtml(n, info, sealUrl);
        } else {
            const safeContent = escapeHtml(n.content || '');
            contentHtml = safeContent.replace(/\n/g, '<br>');
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
        if (contentEl) contentEl.innerHTML = contentHtml;

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
