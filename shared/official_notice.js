/* Official notice purpose helpers v1.0.0. No publication is implied by purpose. */
(function (root) {
    'use strict';
    const normalize = value => ['INTERNAL', 'EXTERNAL'].includes(value) ? value : '';
    const label = value => ({ INTERNAL: '내부용', EXTERNAL: '외부용' }[normalize(value)] || '기존 공문');
    const matches = (value, tab) => (normalize(value) || 'LEGACY') === tab;
    function validateChannels(value, notice, document) {
        return normalize(value) === 'EXTERNAL' && (notice || document)
            ? '외부용 공문은 게시하지 않습니다. 출력·PDF 저장 후 전달해 주세요.' : '';
    }
    function filename(docNo, title) {
        return [docNo, title || '공문'].filter(Boolean).join('_').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 160);
    }
    function attachment(value) {
        const raw = String(value || '').trim();
        if (raw.startsWith('attachments/')) {
            const path = raw.split('?')[0].slice('attachments/'.length);
            if (!path || /[\\\u0000-\u001f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) return null;
            return { bucket: 'attachments', path, name: new URLSearchParams(raw.split('?')[1] || '').get('display_name') || '' };
        }
        try {
            const url = new URL(raw);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? { url: url.href } : null;
        } catch (_) { return null; }
    }
    root.OfficialNotice = Object.freeze({ normalize, label, matches, validateChannels, filename, attachment });
})(typeof globalThis !== 'undefined' ? globalThis : this);
