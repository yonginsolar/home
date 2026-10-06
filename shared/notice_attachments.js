/* v1.0.0 — Shared notice attachment references. Access is enforced by Storage RLS. */
(function (root) {
    'use strict';
    function parse(value) {
        const raw = String(value || '').trim();
        if (!raw.startsWith('attachments/notices/')) return null;
        const path = raw.split('?')[0].slice('attachments/'.length);
        if (!/^notices\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(path)) return null;
        return { bucket: 'attachments', path };
    }
    function isPrivate(value) { return String(value || '').trim().startsWith('attachments/notices/'); }
    function safeHttp(value) {
        try {
            const url = new URL(String(value || '').trim());
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch (_) { return ''; }
    }
    async function resolve(client, value) {
        if (!isPrivate(value)) return safeHttp(value);
        const ref = parse(value);
        if (!ref || !client?.storage) return '';
        const { data, error } = await client.storage.from(ref.bucket).createSignedUrl(ref.path, 900);
        return error ? '' : safeHttp(data?.signedUrl);
    }
    function bindLink(link, client, value, onError) {
        if (!isPrivate(value)) { link.href = safeHttp(value); return; }
        link.href = '#';
        let opening = false;
        link.addEventListener('click', async event => {
            event.preventDefault();
            if (opening) return;
            opening = true;
            // Open synchronously to avoid popup blocking, never expose the raw private path.
            const tab = root.open('', '_blank');
            if (tab) tab.opener = null;
            try {
                const url = await resolve(client, value);
                if (!url) throw new Error('NOTICE_ATTACHMENT_UNAVAILABLE');
                if (tab) tab.location.replace(url);
                else onError?.('파일을 열려면 브라우저의 팝업 차단을 해제해 주세요.');
            } catch (_) {
                tab?.close();
                onError?.('첨부파일을 열 수 없습니다. 로그인 상태와 열람 권한을 확인해 주세요.');
            } finally { opening = false; }
        });
    }
    root.NoticeAttachments = Object.freeze({ parse, isPrivate, safeHttp, resolve, bindLink });
})(globalThis);
