/* Version: v1.4.5 | Same-browser proposal drafts; no network or authentication changes. */
(() => {
  'use strict';
  function transact(key, mode, value) {
    return new Promise((resolve, reject) => {
      let db, tx, settled = false, result;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); db?.close();
        if (error) reject(new Error('이 브라우저에 사진을 임시 보관하지 못했습니다. 저장 공간·브라우저 설정을 확인하거나 ERP에 이름을 붙여 저장해 주세요.'));
        else resolve(result);
      };
      const timer = setTimeout(() => { try { tx?.abort(); } catch (_) {} finish(true); }, 12000);
      try {
        const open = indexedDB.open('yonginsolar-erp-proposal-drafts', 1);
        open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('drafts')) open.result.createObjectStore('drafts'); };
        open.onerror = () => finish(true);
        open.onblocked = () => finish(true);
        open.onsuccess = () => {
          db = open.result;
          if (settled) { db.close(); return; }
          db.onversionchange = () => db.close();
          try {
            tx = db.transaction('drafts', mode === 'get' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('drafts');
            const request = mode === 'get' ? store.get(key) : mode === 'delete' ? store.delete(key) : store.put(value, key);
            request.onsuccess = () => { result = request.result; };
            tx.oncomplete = () => finish();
            tx.onabort = tx.onerror = () => finish(true);
          } catch (_) { finish(true); }
        };
      } catch (_) { finish(true); }
    });
  }
  window.ProposalDrafts = Object.freeze({
    read: (key) => transact(key, 'get'),
    write: (key, value) => transact(key, 'put', value),
    remove: (key) => transact(key, 'delete')
  });
})();
