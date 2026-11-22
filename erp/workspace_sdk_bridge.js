// The workspace's pinned classic script is executed before its entry module.
// The original shared client factory still controls host headers and auth options.
const createClient = globalThis.supabase?.createClient;
if (typeof createClient !== 'function') throw new Error('ERP_SDK_UNAVAILABLE');
export {createClient};
