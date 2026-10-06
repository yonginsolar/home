// Display only the small, authorized preview supplied by the caller.
// Never resolve an original signature or write the decorated HTML to storage.
function appendPreview(root, official, previewUrl) {
    const name = String(official?.name || official?.coop_members?.name || '').trim();
    const compact = name.replace(/\s+/g, '');
    if (!compact) return false;
    const pattern = compact.split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const matcher = new RegExp(pattern, 'g');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let target = null;
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('script,style,.signature-preview-shell,.inline-signature-status')) continue;
        if (String(node.nodeValue || '').replace(/\s+/g, '').includes(compact)) target = node;
    }
    if (!target) return false;
    const text = String(target.nodeValue || '');
    const match = [...text.matchAll(matcher)].pop();
    if (!match) return false;
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createTextNode(text.slice(0, match.index + match[0].length)));
    if (previewUrl) {
        const shell = document.createElement('span');
        shell.className = 'signature-preview-shell inline-signature-shell';
        shell.setAttribute('aria-label', `${name} 전자서명 열람본`);
        const image = document.createElement('img');
        image.className = 'inline-signature-img';
        image.src = previewUrl;
        image.alt = `${name} 전자서명 열람본`;
        image.draggable = false;
        shell.appendChild(image);
        fragment.appendChild(shell);
    } else {
        const badge = document.createElement('span');
        badge.className = 'inline-signature-status';
        badge.textContent = '전자서명 완료';
        fragment.appendChild(badge);
    }
    fragment.appendChild(document.createTextNode(text.slice(match.index + match[0].length)));
    target.parentNode.replaceChild(fragment, target);
    return true;
}

export async function buildSignatureDisplay(contentHtml, signerIds, officials, signatures, resolvePreview) {
    const parsed = new DOMParser().parseFromString(String(contentHtml || ''), 'text/html');
    const officialMap = new Map((officials || []).map(row => [String(row.id), row]));
    const signatureMap = new Map((signatures || []).map(row => [String(row.official_id), row]));
    const rows = await Promise.all([...new Set((signerIds || []).map(String))].map(async id => {
        const signature = signatureMap.get(id);
        let previewUrl = '';
        if (signature) {
            try {
                const resolved = await resolvePreview(signature);
                if (resolved) {
                    const url = new URL(resolved, window.location.origin);
                    if (url.protocol === 'https:' || url.protocol === 'http:') previewUrl = url.href;
                }
            } catch (_) { /* A preview failure must not hide the signed status. */ }
        }
        return { official: officialMap.get(id), signature, previewUrl };
    }));
    for (const row of rows) {
        if (row.signature && row.official) appendPreview(parsed.body, row.official, row.previewUrl);
    }
    return { html: parsed.body.innerHTML, rows };
}
