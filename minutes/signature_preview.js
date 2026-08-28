/*
Version: v1.0.0
Change: 2026-08-28 - Build fixed 96x48 electronic-signature previews with a subtle baked-in viewing mark.
*/

export const SIGNATURE_PREVIEW_BUCKET = 'signature-previews';
export const SIGNATURE_PREVIEW_WIDTH = 96;
export const SIGNATURE_PREVIEW_HEIGHT = 48;

export function getSignaturePreviewPath(minuteId, officialId, signatureId) {
    const safeMinuteId = String(minuteId || '').trim();
    const safeOfficialId = String(officialId || '').trim();
    const safeSignatureId = String(signatureId || '').trim();
    if (!safeMinuteId || !/^\d+$/.test(safeOfficialId) || !/^[0-9a-f-]{36}$/i.test(safeSignatureId)) {
        return '';
    }
    return `${safeMinuteId}/${safeOfficialId}/${safeSignatureId}.png`;
}

function loadSignatureImage(sourceUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('서명 원본 이미지를 읽지 못했습니다.'));
        image.src = String(sourceUrl || '');
    });
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('서명 열람본을 PNG로 만들지 못했습니다.'));
        }, 'image/png');
    });
}

export async function createSignaturePreviewBlob(sourceUrl) {
    const safeSourceUrl = String(sourceUrl || '').trim();
    if (!safeSourceUrl) throw new Error('서명 원본 주소가 없습니다.');

    const image = await loadSignatureImage(safeSourceUrl);
    const sourceWidth = Number(image.naturalWidth || image.width || 0);
    const sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) throw new Error('서명 원본 크기를 확인하지 못했습니다.');

    const canvas = document.createElement('canvas');
    canvas.width = SIGNATURE_PREVIEW_WIDTH;
    canvas.height = SIGNATURE_PREVIEW_HEIGHT;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('서명 열람본 화면을 만들지 못했습니다.');

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const paddingX = 4;
    const paddingY = 3;
    const availableWidth = canvas.width - (paddingX * 2);
    const availableHeight = canvas.height - (paddingY * 2);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    const drawX = Math.round((canvas.width - drawWidth) / 2);
    const drawY = Math.round((canvas.height - drawHeight) / 2);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-0.16);
    context.fillStyle = 'rgba(71, 85, 105, 0.30)';
    context.font = '800 9px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('열람용', 0, 0);
    context.restore();

    return canvasToPngBlob(canvas);
}
