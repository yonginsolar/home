/* Version: 1.0.0 | Validated uploads retain the caller's Storage permissions. */
(function (global) {
  'use strict';
  const guarded = new Set(['assets', 'attachments', 'candidates', 'candidate_proofs', 'official-documents',
    'participation-files', 'contracts', 'meeting-package-files', 'signature-previews', 'sun-village-signatures', 'erp-proposal-library']);
  const installed = new WeakSet();
  const messages = {
    FILE_BLOCKED: '실행 파일·스크립트·HTML·매크로 문서는 첨부할 수 없습니다.',
    FILE_ACTIVE_CONTENT: '매크로나 실행 내용이 포함된 문서는 첨부할 수 없습니다.',
    FILE_FORMAT: '파일 내용과 형식이 맞지 않습니다. 원본 파일을 다시 저장한 뒤 선택해 주세요.',
    FILE_UNSUPPORTED: '지원하지 않는 파일 형식입니다. PDF 또는 일반 업무 문서로 저장해 주세요.',
    FILE_LEGACY_EXCEL: '이 Excel 파일은 매크로 여부를 안전하게 확인할 수 없습니다. XLSX 또는 PDF로 저장해 주세요.',
    FILE_COMPLEX_FORMAT: '이 문서의 내부 형식을 안전하게 확인할 수 없습니다. PDF로 저장한 뒤 첨부해 주세요.',
    FILE_ARCHIVE_LIMIT: '문서 내부 크기가 검사 한도를 넘습니다. PDF로 저장하거나 파일을 나누어 주세요.',
    FILE_ENCRYPTED_OR_FORMAT: '암호가 걸렸거나 내부 형식을 확인할 수 없는 문서입니다. PDF로 저장한 뒤 첨부해 주세요.',
    IMAGE_REQUIRED: '이곳에는 JPG·PNG·WebP·GIF 등의 이미지 파일을 올려 주세요.',
    FILE_SIZE: '빈 파일이나 이 화면의 크기 제한을 넘는 파일은 첨부할 수 없습니다.',
    UPLOAD_FORBIDDEN: '이 파일을 저장할 권한이 없습니다. 로그인과 담당 업무 권한을 확인해 주세요.'
  };
  function install(client) {
    if (!client?.storage || installed.has(client)) return client;
    installed.add(client);
    const original = client.storage.from.bind(client.storage);
    client.storage.from = function (bucket) {
      const storage = original(bucket);
      if (!guarded.has(bucket)) return storage;
      async function send(body) {
        try {
          const { data, error } = await client.functions.invoke('checked-upload', { body });
          if (error || !data?.ok) {
            let code = data?.code;
            if (!code && error?.context?.json) { try { code = (await error.context.json()).code; } catch (_) {} }
            return { data: null, error: { name: 'StorageApiError', message: messages[code] || '파일을 저장하지 못했습니다. 다시 로그인하거나 파일 형식을 확인해 주세요.', code: code || 'UPLOAD_FAILED' } };
          }
          return { data: data.data, error: null };
        } catch (_) { return { data: null, error: { name: 'StorageApiError', message: '파일 전송에 실패했습니다. 연결 상태를 확인해 주세요.', code: 'UPLOAD_FAILED' } }; }
      }
      function upload(path, file, options = {}) {
        const form = new FormData();
        form.set('bucket', bucket); form.set('path', path); form.set('upsert', options.upsert === true ? 'true' : 'false');
        form.set('cacheControl', String(options.cacheControl || '3600'));
        form.set('file', file instanceof Blob ? file : new Blob([file]), String(file?.name || path.split('/').pop()));
        return send(form);
      }
      storage.upload = upload;
      storage.update = (path, file, options = {}) => upload(path, file, { ...options, upsert: true });
      storage.copy = (source, path) => send({ action: 'copy', bucket, source, path });
      return storage;
    };
    return client;
  }
  global.CoopCheckedUploads = Object.freeze({ install, version: '1.0.0' });
  if (global.supabase?.createClient && !global.supabase.__coopCheckedUploads) {
    const create = global.supabase.createClient;
    global.supabase.createClient = function () { return install(create.apply(this, arguments)); };
    global.supabase.__coopCheckedUploads = true;
  }
})(globalThis);
