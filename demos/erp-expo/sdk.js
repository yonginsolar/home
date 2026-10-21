// The expo Worker rewrites only the shared client's SDK import to this adapter.
// Operating sources and their default authentication remain unchanged.
import {createClient as originalCreateClient} from 'https://esm.sh/@supabase/supabase-js@2.112.2';
export function createClient(url,key,options={}){
 const bridge=globalThis.ExpoRuntimeBridge;
 if(!bridge)throw Error('DEMO_CONTEXT_CHANGED');
 return bridge.install(originalCreateClient(url,key,{...options,auth:bridge.authOptions(options.auth)}));
}
