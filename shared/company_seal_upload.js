/* Stage a new seal without replacing the currently registered object.
 * Settings RPCs retain their existing Auth/tenant checks. Never delete on an
 * ambiguous RPC result: the server may have committed before the reply was lost.
 */
(function (root) {
 'use strict';
 const staged = new WeakMap();
 function path(coopId, file) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(coopId))) throw new Error('조합 정보를 확인할 수 없습니다.');
  const extensions = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/bmp':'bmp'};
  const ext = extensions[String(file?.type || '').toLowerCase()];
  if (!ext) throw new Error('PNG·JPG·WebP·GIF 직인 이미지를 선택해 주세요.');
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
    const {error} = await client.storage.from('attachments').upload(next, file, {upsert:false, contentType:file.type, cacheControl:'3600'});
    if (error) throw error;
    return next;
   })();
   scopes.set(coopId, pending);
   pending.catch(() => { if (scopes.get(coopId) === pending) scopes.delete(coopId); });
  }
  return scopes.get(coopId);
 }
 root.CoopCompanySealUpload = Object.freeze({upload});
})(window);
