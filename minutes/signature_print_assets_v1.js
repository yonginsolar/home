import { SIGNATURE_PREVIEW_BUCKET, getSignaturePreviewPath } from './signature_preview.js?v=1.0.0';

const LIMIT = 4 * 1024 * 1024;
const imageDataPattern = /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i;
const validId = /^[a-z0-9-]{1,80}$/i;

function originalPath(raw, origin, minuteId, officialId) {
    let path = raw;
    if (/^https?:/i.test(raw)) {
        const url = new URL(raw);
        if (url.origin !== new URL(origin).origin) return '';
        const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/attachments\/(.+)$/.exec(url.pathname);
        if (!match) return '';
        path = decodeURIComponent(match[1]);
    } else {
        path = raw.replace(/^\/+/, '').replace(/^attachments\//, '');
    }
    const parts = path.split('/');
    if (parts.length !== 3 || parts[0] !== 'signatures' || parts[1] !== minuteId) return '';
    return parts[2].startsWith(officialId + '_') && /^[a-z0-9_-]+\.(?:png|jpe?g)$/i.test(parts[2]) ? path : '';
}

async function decodeImage(url) {
    if (!imageDataPattern.test(url) || url.length > LIMIT * 4 / 3 + 32) throw new Error();
    const image = new Image();
    image.src = url;
    await image.decode();
    return { state:'ready', url };
}

async function readImage(storage, bucket, path, current) {
    if (!current()) return { state:'error' };
    // Existing authenticated Storage SELECT, not a public or signed URL in the output.
    const { data, error } = await storage.from(bucket).download(path);
    if (!current()) return { state:'error' };
    if (error) {
        const status = Number(error.status ?? error.statusCode ?? error.originalError?.status);
        if (status === 401 || status === 403) return { state:'denied' };
        return { state:status === 404 ? 'missing' : 'error' };
    }
    if (!data || data.size < 4 || data.size > LIMIT) return { state:'error' };
    const head = new Uint8Array(await data.slice(0, 8).arrayBuffer());
    const type = [137,80,78,71,13,10,26,10].every((n,i) => head[i] === n) ? 'image/png'
        : head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg' : '';
    if (!type || !current()) return { state:'error' };
    const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reader.onabort = reject;
        reader.readAsDataURL(new Blob([data], { type }));
    });
    return decodeImage(url);
}

export async function loadMinuteSignatureAssets({ minute, signatures, requiredIds, client, current, timeoutMs = 8000 }) {
    const assets = new Map();
    const minuteId = String(minute?.id || '');
    if (!validId.test(minuteId) || !minute?.requires_sign || minute.doc_type === 'NOTICE' || !current()) return assets;
    const required = new Set(requiredIds.map(String));
    const uniqueRows = new Map((Array.isArray(signatures) ? signatures : [])
        .filter(row => required.has(String(row?.official_id))).map(row => [String(row.official_id), row]));
    let expired = false;
    let deadline;
    const stillCurrent = () => !expired && current();
    const rows = [...uniqueRows];
    let index = 0;
    async function loadRow([officialId, row]) {
        try {
            if (!/^\d+$/.test(officialId) || !stillCurrent()) return;
            const raw = String(row.signature_url || '').trim();
            let asset = { state:'missing' };
            if (raw === 'expo-demo-confirmation') return;
            if (raw.startsWith('data:')) {
                asset = await decodeImage(raw);
            } else {
                const path = raw && originalPath(raw, client.supabaseUrl, minuteId, officialId);
                if (path) asset = await readImage(client.storage, 'attachments', path, stillCurrent);
                else if (raw) asset = { state:'error' };
                if (asset.state !== 'ready' && asset.state !== 'denied') {
                    const preview = getSignaturePreviewPath(minuteId, officialId, row.id);
                    if (preview && stillCurrent()) {
                        const view = await readImage(client.storage, SIGNATURE_PREVIEW_BUCKET, preview, stillCurrent);
                        if (view.state !== 'missing' || asset.state === 'missing') asset = view;
                    }
                }
            }
            if (stillCurrent()) assets.set(officialId, asset);
        } catch {
            if (stillCurrent()) assets.set(officialId, { state:'error' });
        }
    }
    const reading = Promise.all(Array.from({ length:Math.min(rows.length, 6) }, async () => {
        while (stillCurrent() && index < rows.length) await loadRow(rows[index++]);
    }));
    try {
        await Promise.race([reading, new Promise(resolve => {
            deadline = setTimeout(() => { expired = true; resolve(); }, timeoutMs);
        })]);
    } finally {
        clearTimeout(deadline);
    }
    if (!current()) assets.clear();
    return assets;
}
