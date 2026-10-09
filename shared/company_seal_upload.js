/* Stage a new seal without replacing the currently registered object.
 * Settings RPCs retain their existing Auth/tenant checks. Never delete on an
 * ambiguous RPC result: the server may have committed before the reply was lost.
 */
(function (root) {
 'use strict';
 const staged = new WeakMap();
 // Keep this image-only selector in step with checked-upload/file_policy.mjs.
 // This is preflight UX; the server still checks bytes, size and Storage rights.
 const formats = Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic','image/heif':'heif'});
 const message = 'PNG·JPG·WebP·GIF·AVIF·HEIC·HEIF 직인 이미지를 선택해 주세요. 다른 형식은 PNG 또는 JPG로 변환해 주세요.';
 function fileType(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (formats[mime]) return {mime, ext:formats[mime]};
  // Some browsers omit the MIME. Only a known image suffix may be a hint;
  // checked-upload still validates the actual file before Storage accepts it.
  if (!mime || mime === 'application/octet-stream') {
   const ext = String(file?.name || '').match(/\.([a-z]+)$/i)?.[1]?.toLowerCase();
   const match = Object.entries(formats).find(([, suffix]) => suffix === (ext === 'jpeg' ? 'jpg' : ext));
   if (match) return {mime:match[0], ext:match[1]};
  }
  throw new Error(message);
 }
 function path(coopId, file) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(coopId))) throw new Error('조합 정보를 확인할 수 없습니다.');
  const {ext} = fileType(file);
  const bytes = root.crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `company-seals/${coopId}/company_seal_${id}.${ext}`;
 }
 async function upload(client, coopId, file, originalFile = file) {
  let files = staged.get(client);
  if (!files) { files = new WeakMap(); staged.set(client, files); }
  let scopes = files.get(originalFile);
  if (!scopes) { scopes = new Map(); files.set(originalFile, scopes); }
  if (!scopes.has(coopId)) {
   const pending = (async () => {
    const next = path(coopId, file);
    const {error} = await client.storage.from('attachments').upload(next, file, {upsert:false, contentType:fileType(file).mime, cacheControl:'3600'});
    if (error) throw error;
    return next;
   })();
   scopes.set(coopId, pending);
   pending.catch(() => { if (scopes.get(coopId) === pending) scopes.delete(coopId); });
  }
  return scopes.get(coopId);
 }
 root.CoopCompanySealUpload = Object.freeze({upload, validate:fileType, accept:Object.keys(formats).join(',')});
})(window);
