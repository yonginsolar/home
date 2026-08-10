/*
Version: v1.1.1
Change: 2026-04-01 - Respect localhost-only public_host override so local QA can emulate coop-specific domains.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.2';

const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';

function getRuntimeHost() {
  if (typeof window === 'undefined' || !window.location) return '';
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\.$/, '');
  const actualHost = normalize(window.location.hostname);
  const isLocal = actualHost === 'localhost' || actualHost === '127.0.0.1';
  if (!isLocal) return actualHost;

  try {
    const params = new URLSearchParams(String(window.location.search || ''));
    const queryOverride = normalize(params.get('public_host'));
    if (queryOverride && queryOverride !== 'localhost' && queryOverride !== '127.0.0.1') {
      window.localStorage?.setItem('local_public_host_override_v1', queryOverride);
      return queryOverride;
    }
  } catch (_) {}

  try {
    const stored = normalize(window.localStorage?.getItem('local_public_host_override_v1'));
    if (stored && stored !== 'localhost' && stored !== '127.0.0.1') return stored;
  } catch (_) {}

  return actualHost;
}

const globalHeaders = {};
const runtimeHost = getRuntimeHost();
if (runtimeHost) globalHeaders['x-public-host'] = runtimeHost;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    headers: globalHeaders
  }
});
