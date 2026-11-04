/* Public federation aggregate reader; deliberately independent of any ERP login session. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.2';
const endpoint='https://ifdqlwxgqgsvnawmhlfc.supabase.co';
const publishableKey='sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
export const supabase=createClient(endpoint,publishableKey,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'federation_public_reader_v1'}
});
